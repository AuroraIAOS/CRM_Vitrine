-- =====================================================================
-- 061 — Assinatura do paciente por link: contrato, evolução e
--       consentimento, com confirmação de data de nascimento, desenho e
--       hash do documento (Subetapa 03.12)
--
-- CONSOME a infraestrutura da 059/060 (token externo em `aba_health`),
-- sem tabela de token própria (`docs/02` §14). A finalidade
-- `assinatura_paciente`, declarada na 059, ganha aqui as colunas de alvo
-- (arco exclusivo, chave composta por conta — nunca par tipo/id).
--
-- DECISÕES DE MAX, 2026-09-16 (`docs/02` §14.5):
--   · Três documentos: a parte do paciente no CONTRATO (via `link` ao lado
--     de `presencial`, alimentando o MESMO estado `assinado` da D-V9 — sem
--     segundo estado), o aceite da EVOLUÇÃO travada (ao lado da recusa da
--     D-F16) e os CONSENTIMENTOS.
--   · Só QR code e copiar link: nenhum disparo automático.
--   · Antes de ver o documento, o paciente confirma a DATA DE NASCIMENTO;
--     erro conta no freio daquele token.
--   · Registro: DESENHO em bucket privado + sha256 do texto exato
--     apresentado. Assinatura eletrônica simples, não ICP-Brasil.
--   · O texto do termo vem de MODELOS de termo da clínica, versionados.
--
-- DECISÕES DO CODE dentro dessas (declaradas):
--   · Link de assinatura é de USO ÚNICO e vale no máximo 7 dias (72 h por
--     padrão): documento assinável para sempre por quem tiver o link é o
--     risco que o plano manda evitar.
--   · Além do freio de 15 minutos, a concessão aceita no máximo 10
--     confirmações de data erradas NA VIDA: com 5 por janela, uma data de
--     nascimento cairia por força bruta dentro de dias.
--   · A ação do paciente não grava `log_acesso` (a coluna de autor exige
--     usuário da clínica e forjar um seria mentir no log): o rastro externo
--     é `tentativas_token_externo` + `assinaturas_externas`.
--   · Link de CONTRATO também é visível e revogável pela recepção (admin
--     com `finance`), que é quem o gera; os outros dois seguem o critério
--     clínico.
--
-- Regras da 03.9 cumpridas: conta por `public.active_account_id()`;
-- `licensing.module_enabled` explícito; nenhum atalho de owner; tudo em
-- PL/pgSQL (a de Storage roda por linha — 058); `REVOKE` de PUBLIC e de
-- anon explícito.
--
-- Idempotente — seguro rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §1 — Modelos de termo de consentimento (versionados)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aba_health.modelos_consentimento (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL CHECK (tipo IN ('tratamento_dados', 'procedimento', 'procedimento_informado', 'uso_imagem')),
  versao        INTEGER NOT NULL CHECK (versao >= 1),
  titulo        TEXT NOT NULL CHECK (length(btrim(titulo)) BETWEEN 3 AND 160),
  texto         TEXT NOT NULL CHECK (length(btrim(texto)) BETWEEN 20 AND 50000),
  criado_por    UUID NOT NULL REFERENCES auth.users(id),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  arquivado_em  TIMESTAMPTZ,
  CONSTRAINT modelos_consentimento_id_account_id_key UNIQUE (id, account_id),
  CONSTRAINT modelos_consentimento_versao_key UNIQUE (account_id, tipo, versao)
);

COMMENT ON TABLE aba_health.modelos_consentimento IS
  'Texto do termo que o paciente lê e assina (Subetapa 03.12). Versão publicada nunca muda: revisar é publicar versão nova. Nasce só por publicar_modelo_consentimento().';

-- Texto publicado é imutável: só `arquivado_em` muda, e uma vez.
CREATE OR REPLACE FUNCTION aba_health.impedir_alteracao_modelo_consentimento()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'arquivado_em') IS DISTINCT FROM (to_jsonb(OLD) - 'arquivado_em')
     OR (OLD.arquivado_em IS NOT NULL AND NEW.arquivado_em IS DISTINCT FROM OLD.arquivado_em) THEN
    RAISE EXCEPTION 'Modelo de termo publicado não muda: publique uma versão nova.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION aba_health.impedir_alteracao_modelo_consentimento() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.impedir_alteracao_modelo_consentimento() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS impedir_alteracao_modelo_consentimento ON aba_health.modelos_consentimento;
CREATE TRIGGER impedir_alteracao_modelo_consentimento
  BEFORE UPDATE ON aba_health.modelos_consentimento
  FOR EACH ROW EXECUTE FUNCTION aba_health.impedir_alteracao_modelo_consentimento();

ALTER TABLE aba_health.modelos_consentimento ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aba_health.modelos_consentimento FROM anon, authenticated;
GRANT SELECT ON aba_health.modelos_consentimento TO authenticated;
GRANT ALL ON aba_health.modelos_consentimento TO service_role;

DROP POLICY IF EXISTS modelos_consentimento_select ON aba_health.modelos_consentimento;
CREATE POLICY modelos_consentimento_select ON aba_health.modelos_consentimento
  FOR SELECT TO authenticated
  USING (public.is_account_member(account_id) AND licensing.module_enabled(account_id, 'health'));

CREATE OR REPLACE FUNCTION aba_health.publicar_modelo_consentimento(p_tipo TEXT, p_titulo TEXT, p_texto TEXT)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ator       UUID := auth.uid();
  v_account_id UUID := public.active_account_id();
  v_versao     INTEGER;
  v_id         UUID;
BEGIN
  IF v_ator IS NULL OR v_account_id IS NULL THEN
    RAISE EXCEPTION 'Publicar modelo de termo exige sessão com clínica ativa.' USING ERRCODE = '42501';
  END IF;
  IF NOT licensing.module_enabled(v_account_id, 'health') THEN
    RAISE EXCEPTION 'Módulo de prontuário fora do nível contratado.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_account_member(v_account_id, 'admin') THEN
    RAISE EXCEPTION 'Só administrador publica modelo de termo.' USING ERRCODE = '42501';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('tratamento_dados', 'procedimento', 'procedimento_informado', 'uso_imagem') THEN
    RAISE EXCEPTION 'Tipo de termo desconhecido: %', p_tipo USING ERRCODE = '23514';
  END IF;

  -- Duas publicações simultâneas do mesmo tipo não disputam o número.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_account_id::TEXT || ':' || p_tipo, 0));
  SELECT coalesce(max(m.versao), 0) + 1 INTO v_versao
  FROM aba_health.modelos_consentimento m
  WHERE m.account_id = v_account_id AND m.tipo = p_tipo;

  INSERT INTO aba_health.modelos_consentimento (account_id, tipo, versao, titulo, texto, criado_por)
  VALUES (v_account_id, p_tipo, v_versao, btrim(p_titulo), btrim(p_texto), v_ator)
  RETURNING id INTO v_id;

  -- A versão anterior sai de uso: link novo sempre aponta para a vigente.
  UPDATE aba_health.modelos_consentimento m
     SET arquivado_em = NOW()
   WHERE m.account_id = v_account_id AND m.tipo = p_tipo AND m.id <> v_id AND m.arquivado_em IS NULL;

  RETURN v_id;
END;
$$;

ALTER FUNCTION aba_health.publicar_modelo_consentimento(text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.publicar_modelo_consentimento(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.publicar_modelo_consentimento(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION aba_health.publicar_modelo_consentimento(text, text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- §2 — Alvo da concessão de assinatura (arco exclusivo)
-- ---------------------------------------------------------------------
ALTER TABLE aba_health.concessoes_externas
  ADD COLUMN IF NOT EXISTS contrato_id             UUID,
  ADD COLUMN IF NOT EXISTS evolucao_id             UUID,
  ADD COLUMN IF NOT EXISTS modelo_consentimento_id UUID;

DO $$
BEGIN
  ALTER TABLE aba_health.concessoes_externas DROP CONSTRAINT IF EXISTS concessoes_externas_contrato_fk;
  -- Contrato em rascunho pode ser apagado; o link dele vai junto.
  ALTER TABLE aba_health.concessoes_externas ADD CONSTRAINT concessoes_externas_contrato_fk
    FOREIGN KEY (contrato_id, account_id) REFERENCES aba_finance.contratos (id, account_id) ON DELETE CASCADE;
  ALTER TABLE aba_health.concessoes_externas DROP CONSTRAINT IF EXISTS concessoes_externas_evolucao_fk;
  ALTER TABLE aba_health.concessoes_externas ADD CONSTRAINT concessoes_externas_evolucao_fk
    FOREIGN KEY (evolucao_id, account_id) REFERENCES aba_health.evolucoes (id, account_id) ON DELETE RESTRICT;
  ALTER TABLE aba_health.concessoes_externas DROP CONSTRAINT IF EXISTS concessoes_externas_modelo_fk;
  ALTER TABLE aba_health.concessoes_externas ADD CONSTRAINT concessoes_externas_modelo_fk
    FOREIGN KEY (modelo_consentimento_id, account_id) REFERENCES aba_health.modelos_consentimento (id, account_id) ON DELETE RESTRICT;

  -- Assinatura tem exatamente um documento; as outras finalidades, nenhum.
  ALTER TABLE aba_health.concessoes_externas DROP CONSTRAINT IF EXISTS concessoes_externas_alvo_assinatura;
  ALTER TABLE aba_health.concessoes_externas ADD CONSTRAINT concessoes_externas_alvo_assinatura
    CHECK (CASE WHEN finalidade = 'assinatura_paciente'
                THEN num_nonnulls(contrato_id, evolucao_id, modelo_consentimento_id) = 1
                     AND usos_maximos = 1
                ELSE num_nonnulls(contrato_id, evolucao_id, modelo_consentimento_id) = 0 END);
END $$;

CREATE INDEX IF NOT EXISTS idx_concessoes_externas_contrato
  ON aba_health.concessoes_externas (contrato_id, account_id) WHERE contrato_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_concessoes_externas_evolucao
  ON aba_health.concessoes_externas (evolucao_id, account_id) WHERE evolucao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_concessoes_externas_modelo
  ON aba_health.concessoes_externas (modelo_consentimento_id, account_id) WHERE modelo_consentimento_id IS NOT NULL;

-- O GRANT de coluna da 059 foi montado pelo catálogo daquele momento: as
-- colunas novas não entram sozinhas.
GRANT SELECT (contrato_id, evolucao_id, modelo_consentimento_id) ON aba_health.concessoes_externas TO authenticated;

DROP POLICY IF EXISTS concessoes_externas_select ON aba_health.concessoes_externas;
CREATE POLICY concessoes_externas_select ON aba_health.concessoes_externas
  FOR SELECT TO authenticated
  USING (public.is_account_member(account_id)
         AND (aba_health.pode_acessar(cliente_id, 'leitura')
              OR (contrato_id IS NOT NULL
                  -- A concessão mora em aba_health: sem o módulo no nível
                  -- contratado, nem o ramo financeiro a enxerga (055).
                  AND licensing.module_enabled(account_id, 'health')
                  AND public.is_account_member(account_id, 'admin')
                  AND access.can('finance', 'read'))));

-- ---------------------------------------------------------------------
-- §3 — Evolução: aceite do paciente, exclusivo com a recusa
-- ---------------------------------------------------------------------
ALTER TABLE aba_health.evolucoes
  ADD COLUMN IF NOT EXISTS assinatura_paciente_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assinatura_paciente_hash TEXT;

DO $$
BEGIN
  ALTER TABLE aba_health.evolucoes DROP CONSTRAINT IF EXISTS evolucoes_assinatura_paciente_completa;
  ALTER TABLE aba_health.evolucoes ADD CONSTRAINT evolucoes_assinatura_paciente_completa
    CHECK ((assinatura_paciente_em IS NULL) = (assinatura_paciente_hash IS NULL)
           AND (assinatura_paciente_hash IS NULL OR assinatura_paciente_hash ~ '^[0-9a-f]{64}$'));
  ALTER TABLE aba_health.evolucoes DROP CONSTRAINT IF EXISTS evolucoes_assina_ou_recusa;
  ALTER TABLE aba_health.evolucoes ADD CONSTRAINT evolucoes_assina_ou_recusa
    CHECK (num_nonnulls(assinatura_paciente_em, recusa_assinatura_em) <= 1);
END $$;

COMMENT ON COLUMN aba_health.evolucoes.assinatura_paciente_em IS
  'Quando o paciente assinou a evolução travada por link (Subetapa 03.12). Exclusivo com a recusa (D-F16). Escrita só por registrar_assinatura_externa().';

-- A trava da evolução (053) abria só a recusa; abre também o aceite, pelo
-- mesmo critério: uma vez, sobre evolução travada, sem tocar em mais nada.
CREATE OR REPLACE FUNCTION aba_health.impedir_alteracao_evolucao_travada()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF OLD.travada THEN
    IF OLD.recusa_assinatura_em IS NULL
       AND NEW.recusa_assinatura_em IS NOT NULL
       AND NEW.travada
       AND (to_jsonb(NEW) - 'recusa_assinatura_em' - 'recusa_assinatura_por' - 'recusa_assinatura_motivo' - 'atualizado_em')
         = (to_jsonb(OLD) - 'recusa_assinatura_em' - 'recusa_assinatura_por' - 'recusa_assinatura_motivo' - 'atualizado_em')
    THEN
      NEW.atualizado_em = NOW();
      RETURN NEW;
    END IF;

    IF OLD.assinatura_paciente_em IS NULL
       AND NEW.assinatura_paciente_em IS NOT NULL
       AND NEW.travada
       AND (to_jsonb(NEW) - 'assinatura_paciente_em' - 'assinatura_paciente_hash' - 'atualizado_em')
         = (to_jsonb(OLD) - 'assinatura_paciente_em' - 'assinatura_paciente_hash' - 'atualizado_em')
    THEN
      NEW.atualizado_em = NOW();
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'Evolução travada não aceita alteração — registre um adendo em nova linha'
      USING ERRCODE = '23514';
  END IF;
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

-- `CREATE OR REPLACE` preserva privilégio, mas a reemissão é explícita
-- (lição registrada na 053: não depender de o nome não ter mudado).
ALTER FUNCTION aba_health.impedir_alteracao_evolucao_travada() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.impedir_alteracao_evolucao_travada() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.impedir_alteracao_evolucao_travada() FROM anon;
REVOKE ALL ON FUNCTION aba_health.impedir_alteracao_evolucao_travada() FROM authenticated;

-- ---------------------------------------------------------------------
-- §4 — Contrato: a via `link` (D-V9 previu por adição a este CHECK)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE aba_finance.assinaturas_contrato DROP CONSTRAINT IF EXISTS assinaturas_contrato_via_valida;
  ALTER TABLE aba_finance.assinaturas_contrato ADD CONSTRAINT assinaturas_contrato_via_valida
    CHECK (via IN ('aprovacao_orcamento', 'presencial', 'link'));
  ALTER TABLE aba_finance.assinaturas_contrato DROP CONSTRAINT IF EXISTS assinaturas_contrato_link_so_paciente;
  ALTER TABLE aba_finance.assinaturas_contrato ADD CONSTRAINT assinaturas_contrato_link_so_paciente
    CHECK (via <> 'link' OR parte = 'paciente');
END $$;

-- ---------------------------------------------------------------------
-- §5 — A assinatura recebida (evidência imutável)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aba_health.assinaturas_externas (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id              UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  concessao_id            UUID NOT NULL,
  cliente_id              UUID NOT NULL,
  documento               TEXT NOT NULL CHECK (documento IN ('contrato', 'evolucao', 'consentimento')),
  contrato_id             UUID,
  evolucao_id             UUID,
  consentimento_id        UUID,
  modelo_consentimento_id UUID,
  hash_documento          TEXT NOT NULL CHECK (hash_documento ~ '^[0-9a-f]{64}$'),
  desenho_caminho         TEXT NOT NULL,
  desenho_sha256          BYTEA NOT NULL CHECK (length(desenho_sha256) = 32),
  desenho_tamanho         INTEGER NOT NULL CHECK (desenho_tamanho > 0 AND desenho_tamanho <= 524288),
  canal                   TEXT NOT NULL CHECK (canal IN ('qr_code', 'link')),
  ip_origem               INET,
  user_agent              TEXT CHECK (length(user_agent) <= 512),
  assinada_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT assinaturas_externas_id_account_id_key UNIQUE (id, account_id),
  CONSTRAINT assinaturas_externas_concessao_key UNIQUE (concessao_id),
  CONSTRAINT assinaturas_externas_desenho_key UNIQUE (desenho_caminho),
  CONSTRAINT assinaturas_externas_concessao_fk FOREIGN KEY (concessao_id, account_id)
    REFERENCES aba_health.concessoes_externas (id, account_id) ON DELETE RESTRICT,
  CONSTRAINT assinaturas_externas_cliente_fk FOREIGN KEY (cliente_id, account_id)
    REFERENCES aba_people.clientes (id, account_id) ON DELETE RESTRICT,
  CONSTRAINT assinaturas_externas_contrato_fk FOREIGN KEY (contrato_id, account_id)
    REFERENCES aba_finance.contratos (id, account_id) ON DELETE RESTRICT,
  CONSTRAINT assinaturas_externas_evolucao_fk FOREIGN KEY (evolucao_id, account_id)
    REFERENCES aba_health.evolucoes (id, account_id) ON DELETE RESTRICT,
  CONSTRAINT assinaturas_externas_consentimento_fk FOREIGN KEY (consentimento_id, account_id)
    REFERENCES aba_health.consentimentos (id, account_id) ON DELETE RESTRICT,
  CONSTRAINT assinaturas_externas_modelo_fk FOREIGN KEY (modelo_consentimento_id, account_id)
    REFERENCES aba_health.modelos_consentimento (id, account_id) ON DELETE RESTRICT,
  CONSTRAINT assinaturas_externas_alvo CHECK (
    (documento = 'contrato' AND contrato_id IS NOT NULL
       AND num_nonnulls(evolucao_id, consentimento_id, modelo_consentimento_id) = 0)
    OR (documento = 'evolucao' AND evolucao_id IS NOT NULL
       AND num_nonnulls(contrato_id, consentimento_id, modelo_consentimento_id) = 0)
    OR (documento = 'consentimento' AND consentimento_id IS NOT NULL AND modelo_consentimento_id IS NOT NULL
       AND num_nonnulls(contrato_id, evolucao_id) = 0))
);

CREATE INDEX IF NOT EXISTS idx_assinaturas_externas_cliente
  ON aba_health.assinaturas_externas (account_id, cliente_id, assinada_em DESC);
CREATE INDEX IF NOT EXISTS idx_assinaturas_externas_contrato
  ON aba_health.assinaturas_externas (contrato_id, account_id) WHERE contrato_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assinaturas_externas_evolucao
  ON aba_health.assinaturas_externas (evolucao_id, account_id) WHERE evolucao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assinaturas_externas_consentimento
  ON aba_health.assinaturas_externas (consentimento_id, account_id) WHERE consentimento_id IS NOT NULL;

COMMENT ON TABLE aba_health.assinaturas_externas IS
  'Assinatura do paciente por link (Subetapa 03.12): o hash do texto exato apresentado, o desenho no bucket privado assinaturas-pacientes, canal, IP e user-agent. Imutável; nasce só por registrar_assinatura_externa(); lida só por ler_assinaturas_externas().';

CREATE OR REPLACE FUNCTION aba_health.impedir_alteracao_assinatura_externa()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Assinatura registrada não muda.' USING ERRCODE = '42501';
END;
$$;
ALTER FUNCTION aba_health.impedir_alteracao_assinatura_externa() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.impedir_alteracao_assinatura_externa() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS impedir_alteracao_assinatura_externa ON aba_health.assinaturas_externas;
CREATE TRIGGER impedir_alteracao_assinatura_externa
  BEFORE UPDATE ON aba_health.assinaturas_externas
  FOR EACH ROW EXECUTE FUNCTION aba_health.impedir_alteracao_assinatura_externa();

ALTER TABLE aba_health.assinaturas_externas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aba_health.assinaturas_externas FROM anon, authenticated;
GRANT ALL ON aba_health.assinaturas_externas TO service_role;

DO $$
BEGIN
  ALTER TABLE aba_health.log_acesso DROP CONSTRAINT IF EXISTS log_acesso_tipo_registro_check;
  ALTER TABLE aba_health.log_acesso
    ADD CONSTRAINT log_acesso_tipo_registro_check
    CHECK (tipo_registro IN ('prontuario', 'anamnese', 'evolucao', 'consentimento', 'plano',
                             'concessao_externa', 'remessa_externa', 'assinatura_externa'));
END $$;

-- ---------------------------------------------------------------------
-- §6 — Motivos novos e o freio que conta a data errada
-- ---------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE aba_health.tentativas_token_externo DROP CONSTRAINT IF EXISTS tentativas_token_externo_motivo_check;
  ALTER TABLE aba_health.tentativas_token_externo ADD CONSTRAINT tentativas_token_externo_motivo_check
    CHECK (motivo IN (
      'token_inexistente', 'token_expirado', 'token_revogado', 'token_consumido',
      'arquivo_ausente', 'arquivo_invalido', 'finalidade_incompativel',
      'falha_upload', 'falha_registro',
      'confirmacao_invalida', 'confirmacao_bloqueada', 'documento_indisponivel', 'desenho_invalido'));
END $$;

-- Data de nascimento errada é tentativa de adivinhar: freia como token errado.
CREATE OR REPLACE FUNCTION aba_health.token_externo_freado(p_token_hash BYTEA)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN (
    SELECT count(*) >= 5
    FROM aba_health.tentativas_token_externo t
    WHERE t.token_alvo_hash = p_token_hash
      AND NOT t.sucesso
      AND t.motivo IN ('token_inexistente', 'token_expirado', 'token_revogado', 'token_consumido',
                       'confirmacao_invalida')
      AND t.ocorrida_em > NOW() - INTERVAL '15 minutes'
  );
END;
$$;

CREATE OR REPLACE FUNCTION aba_health.registrar_recusa_token_externo(
  p_token      TEXT,
  p_motivo     TEXT,
  p_ip         INET,
  p_user_agent TEXT
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v RECORD;
BEGIN
  -- Motivo de token e de confirmação NÃO entram por aqui: só nascem da
  -- avaliação no banco, para ninguém alimentar o freio de um token alheio.
  IF p_motivo IS NULL OR p_motivo NOT IN
     ('arquivo_ausente', 'arquivo_invalido', 'finalidade_incompativel', 'falha_upload', 'falha_registro',
      'desenho_invalido') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'motivo_invalido');
  END IF;

  SELECT * INTO v FROM aba_health.avaliar_token_externo(p_token);

  IF v.motivo IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', v.motivo);
  END IF;

  PERFORM aba_health.registrar_tentativa_token_externo(
    v.token_hash, v.concessao_id, v.account_id, p_motivo, 'POST', p_ip, p_user_agent);
  RETURN jsonb_build_object('ok', true, 'motivo', p_motivo);
END;
$$;

-- ---------------------------------------------------------------------
-- §7 — Emissão: `emitir_concessao_externa` não emite assinatura
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_health.emitir_concessao_externa(
  p_cliente_id    UUID,
  p_pessoa_id     UUID,
  p_finalidade    TEXT,
  p_validade      INTERVAL DEFAULT INTERVAL '7 days',
  p_usos_maximos  INTEGER DEFAULT NULL,
  p_canal         TEXT DEFAULT NULL
) RETURNS TABLE (concessao_id UUID, token TEXT, token_expira_em TIMESTAMPTZ)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ator       UUID := auth.uid();
  v_account_id UUID := public.active_account_id();
  v_token      TEXT;
  v_id         UUID;
  v_expira     TIMESTAMPTZ;
  v_agora      TIMESTAMPTZ := NOW();
BEGIN
  -- Concessão sem autor não protege a clínica (mesma regra da recusa, 053).
  IF v_ator IS NULL OR v_account_id IS NULL THEN
    RAISE EXCEPTION 'Emitir link externo exige sessão com clínica ativa.' USING ERRCODE = '42501';
  END IF;

  IF p_finalidade IS NULL OR p_finalidade NOT IN
     ('recepcao_exame', 'assinatura_paciente', 'exportacao_prontuario', 'encaminhamento') THEN
    RAISE EXCEPTION 'Finalidade de link externo desconhecida: %', p_finalidade USING ERRCODE = '23514';
  END IF;

  -- 061: assinatura precisa de documento-alvo, confirmação e uso único.
  IF p_finalidade = 'assinatura_paciente' THEN
    RAISE EXCEPTION 'Link de assinatura se emite por emitir_link_assinatura(), com o documento.' USING ERRCODE = '23514';
  END IF;

  -- Exportar prontuário é a ação mais sensível do sistema: pede o alcance
  -- de exportação, que o atributo profissional sozinho não abre (055).
  IF NOT aba_health.pode_acessar(p_cliente_id,
       CASE WHEN p_finalidade = 'exportacao_prontuario' THEN 'exportacao' ELSE 'criacao' END) THEN
    RAISE EXCEPTION 'Paciente % não existe ou não está ao seu alcance.', p_cliente_id USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM aba_people.pessoas p
                 WHERE p.id = p_pessoa_id AND p.account_id = v_account_id) THEN
    RAISE EXCEPTION 'Destinatário % não existe nesta clínica.', p_pessoa_id USING ERRCODE = '42501';
  END IF;

  -- 060: quem manda exame é laboratório — fornecedor ATIVO desta clínica.
  IF p_finalidade = 'recepcao_exame' AND NOT EXISTS (
       SELECT 1 FROM aba_people.fornecedores f
       WHERE f.id = p_pessoa_id AND f.account_id = v_account_id AND f.ativo) THEN
    RAISE EXCEPTION 'Link de exame só se emite para laboratório cadastrado como fornecedor ativo.'
      USING ERRCODE = '42501';
  END IF;

  IF p_validade IS NULL OR p_validade < INTERVAL '5 minutes' OR p_validade > INTERVAL '90 days' THEN
    RAISE EXCEPTION 'A validade do link vai de 5 minutos a 90 dias.' USING ERRCODE = '23514';
  END IF;

  IF p_usos_maximos IS NOT NULL AND p_usos_maximos < 1 THEN
    RAISE EXCEPTION 'Número de usos precisa ser ao menos 1 (ou vazio, para reutilizável).' USING ERRCODE = '23514';
  END IF;

  IF p_canal IS NOT NULL AND p_canal NOT IN ('whatsapp', 'email', 'sms', 'qr_code') THEN
    RAISE EXCEPTION 'Canal desconhecido: %', p_canal USING ERRCODE = '23514';
  END IF;

  -- 32 bytes aleatórios em base64url, sem preenchimento: 43 caracteres.
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  v_expira := v_agora + p_validade;

  INSERT INTO aba_health.concessoes_externas
    (account_id, cliente_id, pessoa_id, finalidade, canal, token_hash,
     token_expira_em, usos_maximos, criado_por, criado_em)
  VALUES
    (v_account_id, p_cliente_id, p_pessoa_id, p_finalidade, p_canal,
     sha256(convert_to(v_token, 'UTF8')), v_expira, p_usos_maximos, v_ator, v_agora)
  RETURNING id INTO v_id;

  -- Liberar dado de paciente para fora é escrita clínica: fica no log,
  -- sem o token.
  INSERT INTO aba_health.log_acesso
    (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
  VALUES
    (v_account_id, v_ator, p_cliente_id, 'concessao_externa', v_id, 'criacao',
     jsonb_build_object('finalidade', p_finalidade, 'canal', p_canal,
                        'usos_maximos', p_usos_maximos, 'expira_em', v_expira));

  RETURN QUERY SELECT v_id, v_token, v_expira;
END;
$$;

ALTER FUNCTION aba_health.emitir_concessao_externa(uuid, uuid, text, interval, integer, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.emitir_concessao_externa(uuid, uuid, text, interval, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.emitir_concessao_externa(uuid, uuid, text, interval, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION aba_health.emitir_concessao_externa(uuid, uuid, text, interval, integer, text) TO authenticated;

-- O link de assinatura: o documento decide o paciente, e quem pode gerar.
CREATE OR REPLACE FUNCTION aba_health.emitir_link_assinatura(
  p_documento    TEXT,
  p_documento_id UUID,
  p_cliente_id   UUID DEFAULT NULL,
  p_validade     INTERVAL DEFAULT INTERVAL '72 hours',
  p_canal        TEXT DEFAULT NULL
) RETURNS TABLE (concessao_id UUID, token TEXT, token_expira_em TIMESTAMPTZ)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ator       UUID := auth.uid();
  v_account_id UUID := public.active_account_id();
  v_cliente_id UUID;
  v_token      TEXT;
  v_id         UUID;
  v_expira     TIMESTAMPTZ;
  v_agora      TIMESTAMPTZ := NOW();
  v_contrato   UUID;
  v_evolucao   UUID;
  v_modelo     UUID;
BEGIN
  IF v_ator IS NULL OR v_account_id IS NULL THEN
    RAISE EXCEPTION 'Gerar link de assinatura exige sessão com clínica ativa.' USING ERRCODE = '42501';
  END IF;
  IF NOT licensing.module_enabled(v_account_id, 'health') THEN
    RAISE EXCEPTION 'Módulo de prontuário fora do nível contratado.' USING ERRCODE = '42501';
  END IF;
  IF p_validade IS NULL OR p_validade < INTERVAL '5 minutes' OR p_validade > INTERVAL '7 days' THEN
    RAISE EXCEPTION 'O link de assinatura vale de 5 minutos a 7 dias.' USING ERRCODE = '23514';
  END IF;
  IF p_canal IS NOT NULL AND p_canal <> 'qr_code' THEN
    RAISE EXCEPTION 'Nesta versão o link de assinatura sai por QR code ou cópia do link.' USING ERRCODE = '23514';
  END IF;

  IF p_documento = 'contrato' THEN
    -- Mesma alçada de registrar a assinatura presencial do paciente (052).
    IF aba_finance.conta_do_chamador('admin', 'update') IS DISTINCT FROM v_account_id THEN
      RAISE EXCEPTION 'Sem permissão para esta operação do contrato.' USING ERRCODE = '42501';
    END IF;
    SELECT c.id, c.cliente_id INTO v_contrato, v_cliente_id
    FROM aba_finance.contratos c
    WHERE c.id = p_documento_id AND c.account_id = v_account_id
      AND c.status = 'rascunho' AND c.documento_hash IS NOT NULL
      AND EXISTS (SELECT 1 FROM aba_finance.assinaturas_contrato a
                  WHERE a.contrato_id = c.id AND a.parte = 'profissional' AND a.hash_assinado = c.documento_hash)
      AND NOT EXISTS (SELECT 1 FROM aba_finance.assinaturas_contrato a
                      WHERE a.contrato_id = c.id AND a.parte = 'paciente');
    IF v_contrato IS NULL THEN
      RAISE EXCEPTION 'Contrato sem documento emitido, sem a assinatura do profissional ou já assinado pelo paciente.'
        USING ERRCODE = '23514';
    END IF;

  ELSIF p_documento = 'evolucao' THEN
    SELECT e.id, e.cliente_id INTO v_evolucao, v_cliente_id
    FROM aba_health.evolucoes e
    WHERE e.id = p_documento_id AND e.account_id = v_account_id;
    IF v_evolucao IS NULL OR NOT aba_health.pode_acessar(v_cliente_id, 'atualizacao') THEN
      RAISE EXCEPTION 'Evolução % não existe ou não está ao seu alcance.', p_documento_id USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM aba_health.evolucoes e
                   WHERE e.id = v_evolucao AND e.travada
                     AND e.recusa_assinatura_em IS NULL AND e.assinatura_paciente_em IS NULL) THEN
      RAISE EXCEPTION 'Só evolução assinada pelo profissional, sem recusa e sem aceite do paciente, vai para assinatura.'
        USING ERRCODE = '23514';
    END IF;

  ELSIF p_documento = 'consentimento' THEN
    v_cliente_id := p_cliente_id;
    IF v_cliente_id IS NULL OR NOT aba_health.pode_acessar(v_cliente_id, 'criacao') THEN
      RAISE EXCEPTION 'Paciente % não existe ou não está ao seu alcance.', p_cliente_id USING ERRCODE = '42501';
    END IF;
    SELECT m.id INTO v_modelo
    FROM aba_health.modelos_consentimento m
    WHERE m.id = p_documento_id AND m.account_id = v_account_id AND m.arquivado_em IS NULL;
    IF v_modelo IS NULL THEN
      RAISE EXCEPTION 'Modelo de termo inexistente ou fora de uso.' USING ERRCODE = '23514';
    END IF;

  ELSE
    RAISE EXCEPTION 'Documento de assinatura desconhecido: %', p_documento USING ERRCODE = '23514';
  END IF;

  IF p_cliente_id IS NOT NULL AND p_cliente_id <> v_cliente_id THEN
    RAISE EXCEPTION 'O documento não é deste paciente.' USING ERRCODE = '23514';
  END IF;

  -- Sem data de nascimento não há o que o paciente confirmar.
  IF NOT EXISTS (SELECT 1 FROM aba_people.clientes cl
                 WHERE cl.id = v_cliente_id AND cl.account_id = v_account_id AND cl.data_nascimento IS NOT NULL) THEN
    RAISE EXCEPTION 'Cadastre a data de nascimento do paciente antes de gerar o link de assinatura.'
      USING ERRCODE = '23514';
  END IF;

  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  v_expira := v_agora + p_validade;

  INSERT INTO aba_health.concessoes_externas
    (account_id, cliente_id, pessoa_id, finalidade, canal, token_hash, token_expira_em, usos_maximos,
     criado_por, criado_em, contrato_id, evolucao_id, modelo_consentimento_id)
  VALUES
    (v_account_id, v_cliente_id, v_cliente_id, 'assinatura_paciente', p_canal,
     sha256(convert_to(v_token, 'UTF8')), v_expira, 1, v_ator, v_agora, v_contrato, v_evolucao, v_modelo)
  RETURNING id INTO v_id;

  INSERT INTO aba_health.log_acesso
    (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
  VALUES
    (v_account_id, v_ator, v_cliente_id, 'concessao_externa', v_id, 'criacao',
     jsonb_build_object('finalidade', 'assinatura_paciente', 'documento', p_documento,
                        'documento_id', p_documento_id, 'canal', p_canal, 'expira_em', v_expira));

  RETURN QUERY SELECT v_id, v_token, v_expira;
END;
$$;

ALTER FUNCTION aba_health.emitir_link_assinatura(text, uuid, uuid, interval, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.emitir_link_assinatura(text, uuid, uuid, interval, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.emitir_link_assinatura(text, uuid, uuid, interval, text) FROM anon;
GRANT EXECUTE ON FUNCTION aba_health.emitir_link_assinatura(text, uuid, uuid, interval, text) TO authenticated;

-- Revogar: link de contrato também pela recepção que o gerou.
CREATE OR REPLACE FUNCTION aba_health.revogar_concessao_externa(p_concessao_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ator       UUID := auth.uid();
  v_account_id UUID := public.active_account_id();
  v_cliente_id UUID;
  v_contrato   UUID;
  v_revogado   TIMESTAMPTZ;
  v_agora      TIMESTAMPTZ := NOW();
BEGIN
  IF v_ator IS NULL OR v_account_id IS NULL THEN
    RAISE EXCEPTION 'Revogar link externo exige sessão com clínica ativa.' USING ERRCODE = '42501';
  END IF;

  SELECT c.cliente_id, c.token_revogado_em, c.contrato_id INTO v_cliente_id, v_revogado, v_contrato
  FROM aba_health.concessoes_externas c
  WHERE c.id = p_concessao_id AND c.account_id = v_account_id;

  IF v_cliente_id IS NULL
     OR NOT (aba_health.pode_acessar(v_cliente_id, 'atualizacao')
             OR (v_contrato IS NOT NULL
                 AND licensing.module_enabled(v_account_id, 'health')
                 AND public.is_account_member(v_account_id, 'admin')
                 AND access.can('finance', 'update'))) THEN
    RAISE EXCEPTION 'Link % não existe ou não está ao seu alcance.', p_concessao_id USING ERRCODE = '42501';
  END IF;

  IF v_revogado IS NOT NULL THEN
    RAISE EXCEPTION 'Este link já foi revogado em %.', v_revogado USING ERRCODE = '23514';
  END IF;

  UPDATE aba_health.concessoes_externas
     SET token_revogado_em = v_agora, token_revogado_por = v_ator
   WHERE id = p_concessao_id AND account_id = v_account_id AND token_revogado_em IS NULL;

  INSERT INTO aba_health.log_acesso
    (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
  VALUES
    (v_account_id, v_ator, v_cliente_id, 'concessao_externa', p_concessao_id, 'atualizacao',
     jsonb_build_object('revogada_em', v_agora));

  RETURN v_agora;
END;
$$;

ALTER FUNCTION aba_health.revogar_concessao_externa(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.revogar_concessao_externa(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.revogar_concessao_externa(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION aba_health.revogar_concessao_externa(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- §8 — O documento como o paciente vê (uso interno do servidor)
-- ---------------------------------------------------------------------
-- O hash é do texto EXATO devolvido. Contrato: o HTML emitido e o hash que
-- a 052 já calculou sobre ele. Evolução e termo: texto montado aqui, numa
-- forma só, e hasheado aqui — a página nunca calcula hash.
CREATE OR REPLACE FUNCTION aba_health.documento_para_assinatura(p_concessao_id UUID)
RETURNS TABLE (documento TEXT, titulo TEXT, formato TEXT, conteudo TEXT, hash TEXT, assinavel BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_c   aba_health.concessoes_externas%ROWTYPE;
  v_txt TEXT;
  v_ok  BOOLEAN;
  v_e   RECORD;
  v_m   RECORD;
  v_k   RECORD;
BEGIN
  SELECT * INTO v_c FROM aba_health.concessoes_externas c WHERE c.id = p_concessao_id;
  IF v_c.id IS NULL OR v_c.finalidade <> 'assinatura_paciente' THEN
    RETURN;
  END IF;

  IF v_c.contrato_id IS NOT NULL THEN
    SELECT k.documento_html, k.documento_hash, k.status, k.cliente_id INTO v_k
    FROM aba_finance.contratos k WHERE k.id = v_c.contrato_id AND k.account_id = v_c.account_id;
    v_ok := v_k.status = 'rascunho' AND v_k.documento_hash IS NOT NULL AND v_k.cliente_id = v_c.cliente_id
      AND EXISTS (SELECT 1 FROM aba_finance.assinaturas_contrato a WHERE a.contrato_id = v_c.contrato_id
                  AND a.parte = 'profissional' AND a.hash_assinado = v_k.documento_hash)
      AND NOT EXISTS (SELECT 1 FROM aba_finance.assinaturas_contrato a WHERE a.contrato_id = v_c.contrato_id
                      AND a.parte = 'paciente');
    RETURN QUERY SELECT 'contrato'::TEXT, 'Contrato'::TEXT, 'html'::TEXT,
                        v_k.documento_html, v_k.documento_hash, coalesce(v_ok, FALSE);
    RETURN;
  END IF;

  IF v_c.evolucao_id IS NOT NULL THEN
    SELECT e.registrado_em, e.avaliacao, e.notas_procedimento, e.intercorrencia, e.resultado,
           e.proximos_passos, e.travada, e.recusa_assinatura_em, e.assinatura_paciente_em, e.cliente_id,
           p.nome_exibicao AS profissional
      INTO v_e
    FROM aba_health.evolucoes e
    LEFT JOIN aba_scheduling.profissionais p ON p.id = e.profissional_id AND p.account_id = e.account_id
    WHERE e.id = v_c.evolucao_id AND e.account_id = v_c.account_id;
    v_txt := format(E'Evolução clínica de %s\nProfissional: %s\n\nAvaliação:\n%s\n\nConduta:\n%s\n\nIntercorrência:\n%s\n\nResultado:\n%s\n\nPróximos passos:\n%s',
                    to_char(v_e.registrado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
                    coalesce(v_e.profissional, '—'),
                    coalesce(nullif(btrim(v_e.avaliacao), ''), '—'),
                    coalesce(nullif(btrim(v_e.notas_procedimento), ''), '—'),
                    coalesce(nullif(btrim(v_e.intercorrencia), ''), '—'),
                    coalesce(nullif(btrim(v_e.resultado), ''), '—'),
                    coalesce(nullif(btrim(v_e.proximos_passos), ''), '—'));
    v_ok := v_e.travada AND v_e.recusa_assinatura_em IS NULL AND v_e.assinatura_paciente_em IS NULL
            AND v_e.cliente_id = v_c.cliente_id;
    RETURN QUERY SELECT 'evolucao'::TEXT, 'Evolução clínica'::TEXT, 'texto'::TEXT, v_txt,
                        encode(sha256(convert_to(v_txt, 'UTF8')), 'hex'), coalesce(v_ok, FALSE);
    RETURN;
  END IF;

  SELECT m.titulo, m.versao, m.texto, m.arquivado_em INTO v_m
  FROM aba_health.modelos_consentimento m
  WHERE m.id = v_c.modelo_consentimento_id AND m.account_id = v_c.account_id;
  v_txt := format(E'%s\nVersão %s\n\n%s', v_m.titulo, v_m.versao, v_m.texto);
  RETURN QUERY SELECT 'consentimento'::TEXT, v_m.titulo, 'texto'::TEXT, v_txt,
                      encode(sha256(convert_to(v_txt, 'UTF8')), 'hex'), v_m.arquivado_em IS NULL;
END;
$$;

-- ---------------------------------------------------------------------
-- §9 — O endpoint público: abrir e assinar (só service_role)
-- ---------------------------------------------------------------------
-- Checagens comuns às duas ações, na ordem das guardas: token → freio →
-- finalidade → teto de confirmações → data de nascimento. Recusa volta
-- como DADO e já registrada; sucesso volta com a concessão.
CREATE OR REPLACE FUNCTION aba_health.confirmar_paciente_externo(
  p_token           TEXT,
  p_data_nascimento DATE,
  p_ip              INET,
  p_user_agent      TEXT
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v RECORD;
BEGIN
  SELECT * INTO v FROM aba_health.avaliar_token_externo(p_token);

  IF aba_health.token_externo_freado(v.token_hash) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'freado');
  END IF;

  IF v.motivo IS NOT NULL THEN
    PERFORM aba_health.registrar_tentativa_token_externo(
      v.token_hash, v.concessao_id, v.account_id, v.motivo, 'POST', p_ip, p_user_agent);
    RETURN jsonb_build_object('ok', false, 'motivo', v.motivo);
  END IF;

  IF v.finalidade <> 'assinatura_paciente' THEN
    PERFORM aba_health.registrar_tentativa_token_externo(
      v.token_hash, v.concessao_id, v.account_id, 'finalidade_incompativel', 'POST', p_ip, p_user_agent);
    RETURN jsonb_build_object('ok', false, 'motivo', 'finalidade_incompativel');
  END IF;

  IF (SELECT count(*) FROM aba_health.tentativas_token_externo t
      WHERE t.concessao_id = v.concessao_id AND t.motivo = 'confirmacao_invalida') >= 10 THEN
    PERFORM aba_health.registrar_tentativa_token_externo(
      v.token_hash, v.concessao_id, v.account_id, 'confirmacao_bloqueada', 'POST', p_ip, p_user_agent);
    RETURN jsonb_build_object('ok', false, 'motivo', 'confirmacao_bloqueada');
  END IF;

  IF p_data_nascimento IS NULL OR NOT EXISTS (
       SELECT 1 FROM aba_people.clientes cl
       WHERE cl.id = v.cliente_id AND cl.account_id = v.account_id AND cl.data_nascimento = p_data_nascimento) THEN
    PERFORM aba_health.registrar_tentativa_token_externo(
      v.token_hash, v.concessao_id, v.account_id, 'confirmacao_invalida', 'POST', p_ip, p_user_agent);
    RETURN jsonb_build_object('ok', false, 'motivo', 'confirmacao_invalida');
  END IF;

  RETURN jsonb_build_object('ok', true, 'concessao_id', v.concessao_id, 'account_id', v.account_id,
                            'token_hash', encode(v.token_hash, 'hex'));
END;
$$;

CREATE OR REPLACE FUNCTION aba_health.abrir_documento_externo(
  p_token           TEXT,
  p_data_nascimento DATE,
  p_ip              INET,
  p_user_agent      TEXT
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conf JSONB;
  v_d    RECORD;
  v_hash BYTEA;
BEGIN
  v_conf := aba_health.confirmar_paciente_externo(p_token, p_data_nascimento, p_ip, p_user_agent);
  IF NOT (v_conf ->> 'ok')::BOOLEAN THEN
    RETURN v_conf;
  END IF;
  v_hash := decode(v_conf ->> 'token_hash', 'hex');

  SELECT * INTO v_d FROM aba_health.documento_para_assinatura((v_conf ->> 'concessao_id')::UUID);
  IF v_d.documento IS NULL OR NOT v_d.assinavel THEN
    PERFORM aba_health.registrar_tentativa_token_externo(
      v_hash, (v_conf ->> 'concessao_id')::UUID, (v_conf ->> 'account_id')::UUID,
      'documento_indisponivel', 'POST', p_ip, p_user_agent);
    RETURN jsonb_build_object('ok', false, 'motivo', 'documento_indisponivel');
  END IF;

  -- Abrir o documento é o acesso ao dado: fica registrado como sucesso.
  PERFORM aba_health.registrar_tentativa_token_externo(
    v_hash, (v_conf ->> 'concessao_id')::UUID, (v_conf ->> 'account_id')::UUID, NULL, 'POST', p_ip, p_user_agent);

  RETURN jsonb_build_object('ok', true, 'documento', jsonb_build_object(
    'tipo', v_d.documento, 'titulo', v_d.titulo, 'formato', v_d.formato,
    'conteudo', v_d.conteudo, 'hash', v_d.hash));
END;
$$;

CREATE OR REPLACE FUNCTION aba_health.registrar_assinatura_externa(
  p_token              TEXT,
  p_data_nascimento    DATE,
  p_hash               TEXT,
  p_caminho            TEXT,
  p_desenho_sha256_hex TEXT,
  p_desenho_tamanho    INTEGER,
  p_ip                 INET,
  p_user_agent         TEXT
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conf       JSONB;
  v_hash_token BYTEA;
  v_c          aba_health.concessoes_externas%ROWTYPE;
  v_d          RECORD;
  v_agora      TIMESTAMPTZ := NOW();
  v_consumida  UUID;
  v_consent    UUID;
  v_assinatura UUID;
  v_feito      INTEGER;
BEGIN
  v_conf := aba_health.confirmar_paciente_externo(p_token, p_data_nascimento, p_ip, p_user_agent);
  IF NOT (v_conf ->> 'ok')::BOOLEAN THEN
    RETURN v_conf;
  END IF;
  v_hash_token := decode(v_conf ->> 'token_hash', 'hex');

  -- A concessão travada para esta transação: duas assinaturas simultâneas
  -- no mesmo link não passam as duas.
  SELECT * INTO v_c FROM aba_health.concessoes_externas c
  WHERE c.id = (v_conf ->> 'concessao_id')::UUID FOR UPDATE;

  SELECT * INTO v_d FROM aba_health.documento_para_assinatura(v_c.id);
  IF v_d.documento IS NULL OR NOT v_d.assinavel OR p_hash IS DISTINCT FROM v_d.hash THEN
    PERFORM aba_health.registrar_tentativa_token_externo(
      v_hash_token, v_c.id, v_c.account_id, 'documento_indisponivel', 'POST', p_ip, p_user_agent);
    RETURN jsonb_build_object('ok', false, 'motivo', 'documento_indisponivel');
  END IF;

  -- O caminho é o desta concessão, nesta conta: a Edge Function monta, o
  -- banco confere (mesma regra da remessa, 059).
  IF p_caminho IS NULL
     OR p_caminho !~ ('^conta-' || v_c.account_id::TEXT || '/concessao-' || v_c.id::TEXT
                      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$')
     OR p_desenho_sha256_hex IS NULL OR p_desenho_sha256_hex !~ '^[0-9a-f]{64}$'
     OR p_desenho_tamanho IS NULL OR p_desenho_tamanho <= 0 OR p_desenho_tamanho > 524288 THEN
    PERFORM aba_health.registrar_tentativa_token_externo(
      v_hash_token, v_c.id, v_c.account_id, 'falha_registro', 'POST', p_ip, p_user_agent);
    RETURN jsonb_build_object('ok', false, 'motivo', 'falha_registro');
  END IF;

  UPDATE aba_health.concessoes_externas c
     SET usos = c.usos + 1,
         primeiro_uso_em = coalesce(c.primeiro_uso_em, v_agora),
         ultimo_uso_em = v_agora
   WHERE c.id = v_c.id AND c.account_id = v_c.account_id
     AND c.token_revogado_em IS NULL AND c.token_expira_em > v_agora
     AND (c.usos_maximos IS NULL OR c.usos < c.usos_maximos)
  RETURNING c.id INTO v_consumida;

  IF v_consumida IS NULL THEN
    PERFORM aba_health.registrar_tentativa_token_externo(
      v_hash_token, v_c.id, v_c.account_id, 'token_consumido', 'POST', p_ip, p_user_agent);
    RETURN jsonb_build_object('ok', false, 'motivo', 'token_consumido');
  END IF;

  -- O efeito no documento. Cada escrita é condicional ao estado que foi
  -- conferido; se o documento mudou no meio, a transação inteira desfaz.
  IF v_d.documento = 'contrato' THEN
    INSERT INTO aba_finance.assinaturas_contrato
      (account_id, contrato_id, parte, via, hash_assinado, assinada_em, registrada_por)
    VALUES (v_c.account_id, v_c.contrato_id, 'paciente', 'link', v_d.hash, v_agora, v_c.criado_por);
    INSERT INTO aba_finance.eventos_contrato (account_id, contrato_id, tipo, ator, detalhe)
    VALUES (v_c.account_id, v_c.contrato_id, 'assinatura_registrada', NULL,
            jsonb_build_object('parte', 'paciente', 'via', 'link', 'hash', v_d.hash, 'concessao_id', v_c.id));
    UPDATE aba_finance.contratos k SET status = 'assinado'
     WHERE k.id = v_c.contrato_id AND k.account_id = v_c.account_id
       AND k.status = 'rascunho' AND k.documento_hash = v_d.hash;
    GET DIAGNOSTICS v_feito = ROW_COUNT;

  ELSIF v_d.documento = 'evolucao' THEN
    UPDATE aba_health.evolucoes e
       SET assinatura_paciente_em = v_agora, assinatura_paciente_hash = v_d.hash
     WHERE e.id = v_c.evolucao_id AND e.account_id = v_c.account_id
       AND e.travada AND e.recusa_assinatura_em IS NULL AND e.assinatura_paciente_em IS NULL;
    GET DIAGNOSTICS v_feito = ROW_COUNT;

  ELSE
    INSERT INTO aba_health.consentimentos
      (account_id, cliente_id, tipo, versao_texto, concedido, concedido_em, evidencia, coletado_por)
    SELECT v_c.account_id, v_c.cliente_id, m.tipo, format('%s (versão %s)', m.titulo, m.versao),
           TRUE, v_agora,
           jsonb_build_object('via', 'link', 'concessao_id', v_c.id, 'modelo_id', m.id, 'hash', v_d.hash),
           NULL
      FROM aba_health.modelos_consentimento m
     WHERE m.id = v_c.modelo_consentimento_id AND m.account_id = v_c.account_id AND m.arquivado_em IS NULL
    RETURNING id INTO v_consent;
    v_feito := CASE WHEN v_consent IS NULL THEN 0 ELSE 1 END;
  END IF;

  IF v_feito <> 1 THEN
    RAISE EXCEPTION 'O documento mudou durante a assinatura.' USING ERRCODE = '40001';
  END IF;

  INSERT INTO aba_health.assinaturas_externas
    (account_id, concessao_id, cliente_id, documento, contrato_id, evolucao_id, consentimento_id,
     modelo_consentimento_id, hash_documento, desenho_caminho, desenho_sha256, desenho_tamanho,
     canal, ip_origem, user_agent, assinada_em)
  VALUES
    (v_c.account_id, v_c.id, v_c.cliente_id, v_d.documento, v_c.contrato_id, v_c.evolucao_id, v_consent,
     CASE WHEN v_d.documento = 'consentimento' THEN v_c.modelo_consentimento_id END,
     v_d.hash, p_caminho, decode(p_desenho_sha256_hex, 'hex'), p_desenho_tamanho,
     CASE WHEN v_c.canal = 'qr_code' THEN 'qr_code' ELSE 'link' END,
     p_ip, left(p_user_agent, 512), v_agora)
  RETURNING id INTO v_assinatura;

  PERFORM aba_health.registrar_tentativa_token_externo(
    v_hash_token, v_c.id, v_c.account_id, NULL, 'POST', p_ip, p_user_agent);

  RETURN jsonb_build_object('ok', true, 'assinatura_id', v_assinatura, 'documento', v_d.documento);
END;
$$;

DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'aba_health.documento_para_assinatura(uuid)',
    'aba_health.confirmar_paciente_externo(text, date, inet, text)',
    'aba_health.abrir_documento_externo(text, date, inet, text)',
    'aba_health.registrar_assinatura_externa(text, date, text, text, text, integer, inet, text)',
    'aba_health.token_externo_freado(bytea)',
    'aba_health.registrar_recusa_token_externo(text, text, inet, text)'
  ] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- §10 — Leitura das assinaturas pela clínica, com log
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_health.ler_assinaturas_externas(p_cliente_id UUID)
RETURNS TABLE (
  assinatura_id    UUID,
  documento        TEXT,
  contrato_id      UUID,
  evolucao_id      UUID,
  consentimento_id UUID,
  hash_documento   TEXT,
  desenho_caminho  TEXT,
  canal            TEXT,
  ip_origem        TEXT,
  assinada_em      TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_ator       UUID := auth.uid();
  v_account_id UUID := public.active_account_id();
  v            RECORD;
BEGIN
  IF v_ator IS NULL OR v_account_id IS NULL THEN
    RAISE EXCEPTION 'Ler assinaturas exige sessão com clínica ativa.' USING ERRCODE = '42501';
  END IF;
  -- `pode_acessar(NULL, …)` abre para o owner (014): paciente obrigatório.
  IF p_cliente_id IS NULL OR NOT aba_health.pode_acessar(p_cliente_id, 'leitura') THEN
    RAISE EXCEPTION 'Paciente % não existe ou não está ao seu alcance.', p_cliente_id USING ERRCODE = '42501';
  END IF;

  FOR v IN
    SELECT a.id, a.documento, a.contrato_id, a.evolucao_id, a.consentimento_id, a.hash_documento,
           a.desenho_caminho, a.canal, host(a.ip_origem) AS ip, a.assinada_em
    FROM aba_health.assinaturas_externas a
    WHERE a.account_id = v_account_id AND a.cliente_id = p_cliente_id
    ORDER BY a.assinada_em DESC
  LOOP
    INSERT INTO aba_health.log_acesso
      (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
    VALUES (v_account_id, v_ator, p_cliente_id, 'assinatura_externa', v.id, 'leitura',
            jsonb_build_object('documento', v.documento));

    assinatura_id    := v.id;
    documento        := v.documento;
    contrato_id      := v.contrato_id;
    evolucao_id      := v.evolucao_id;
    consentimento_id := v.consentimento_id;
    hash_documento   := v.hash_documento;
    desenho_caminho  := v.desenho_caminho;
    canal            := v.canal;
    ip_origem        := v.ip;
    assinada_em      := v.assinada_em;
    RETURN NEXT;
  END LOOP;
END;
$$;

ALTER FUNCTION aba_health.ler_assinaturas_externas(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.ler_assinaturas_externas(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.ler_assinaturas_externas(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION aba_health.ler_assinaturas_externas(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- §11 — Bucket do desenho
-- ---------------------------------------------------------------------
-- Só PNG, 512 KB: o traço de um dedo num canvas de celular cabe folgado.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('assinaturas-pacientes', 'assinaturas-pacientes', FALSE, 524288, ARRAY['image/png'])
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Roda POR LINHA de `storage.objects`: PL/pgSQL (058). Achada pelo caminho
-- EXATO; o primeiro segmento tem que ser a conta real.
CREATE OR REPLACE FUNCTION aba_health.pode_ler_assinatura_externa(p_nome_objeto TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
  v_cliente_id UUID;
BEGIN
  IF p_nome_objeto IS NULL OR array_length(string_to_array(p_nome_objeto, '/'), 1) IS DISTINCT FROM 3 THEN
    RETURN FALSE;
  END IF;

  SELECT a.account_id, a.cliente_id INTO v_account_id, v_cliente_id
  FROM aba_health.assinaturas_externas a
  WHERE a.desenho_caminho = p_nome_objeto;

  IF v_account_id IS NULL
     OR (string_to_array(p_nome_objeto, '/'))[1] <> ('conta-' || v_account_id::TEXT) THEN
    RETURN FALSE;
  END IF;

  RETURN public.is_account_member(v_account_id) AND aba_health.pode_acessar(v_cliente_id, 'leitura');
END;
$$;

ALTER FUNCTION aba_health.pode_ler_assinatura_externa(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.pode_ler_assinatura_externa(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.pode_ler_assinatura_externa(text) FROM anon;
GRANT EXECUTE ON FUNCTION aba_health.pode_ler_assinatura_externa(text) TO authenticated, service_role;

-- Só SELECT. Escrita e remoção só pela Edge Function com service_role.
DROP POLICY IF EXISTS "Assinatura de paciente so sai por autorizacao clinica" ON storage.objects;
CREATE POLICY "Assinatura de paciente so sai por autorizacao clinica"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'assinaturas-pacientes' AND aba_health.pode_ler_assinatura_externa(name));

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- §12 — VERIFICAÇÕES QUE RECUSAM A MIGRATION
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_sobra TEXT;
BEGIN
  -- (a) assinaturas_externas: sem leitura nem escrita direta; modelos: só SELECT
  SELECT string_agg(t || ':' || p, ', ') INTO v_sobra
  FROM unnest(ARRAY['aba_health.assinaturas_externas', 'aba_health.modelos_consentimento']) t
  CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p
  WHERE has_table_privilege('anon', t, p)
     OR (has_table_privilege('authenticated', t, p)
         AND NOT (t = 'aba_health.modelos_consentimento' AND p = 'SELECT'));
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION '(a) privilégio de tabela sobrando: %', v_sobra; END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'aba_health.assinaturas_externas'::regclass) THEN
    RAISE EXCEPTION '(a) policy em assinaturas_externas, que é lida só por função.';
  END IF;
  IF has_column_privilege('authenticated', 'aba_health.concessoes_externas', 'token_hash', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'aba_health.concessoes_externas', 'contrato_id', 'SELECT') THEN
    RAISE EXCEPTION '(a) leitura de concessoes_externas errada: hash nunca, alvo sim.';
  END IF;

  -- (b) funções da clínica: authenticated sim, anon não; de servidor: só service_role
  SELECT string_agg(f, ', ') INTO v_sobra
  FROM unnest(ARRAY[
    'aba_health.publicar_modelo_consentimento(text,text,text)',
    'aba_health.emitir_link_assinatura(text,uuid,uuid,interval,text)',
    'aba_health.revogar_concessao_externa(uuid)',
    'aba_health.ler_assinaturas_externas(uuid)',
    'aba_health.pode_ler_assinatura_externa(text)',
    'aba_health.emitir_concessao_externa(uuid,uuid,text,interval,integer,text)']) f
  WHERE has_function_privilege('anon', f, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', f, 'EXECUTE');
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION '(b) privilégio errado em função da clínica: %', v_sobra; END IF;
  SELECT string_agg(f, ', ') INTO v_sobra
  FROM unnest(ARRAY[
    'aba_health.documento_para_assinatura(uuid)',
    'aba_health.confirmar_paciente_externo(text,date,inet,text)',
    'aba_health.abrir_documento_externo(text,date,inet,text)',
    'aba_health.registrar_assinatura_externa(text,date,text,text,text,integer,inet,text)',
    'aba_health.token_externo_freado(bytea)',
    'aba_health.registrar_recusa_token_externo(text,text,inet,text)']) f
  WHERE has_function_privilege('anon', f, 'EXECUTE')
     OR has_function_privilege('authenticated', f, 'EXECUTE')
     OR NOT has_function_privilege('service_role', f, 'EXECUTE');
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION '(b) função de servidor exposta: %', v_sobra; END IF;

  IF has_function_privilege('authenticated', 'aba_health.impedir_alteracao_evolucao_travada()', 'EXECUTE')
     OR has_function_privilege('anon', 'aba_health.impedir_alteracao_evolucao_travada()', 'EXECUTE') THEN
    RAISE EXCEPTION '(b) função de gatilho da evolução exposta.';
  END IF;

  -- (c) tudo em PL/pgSQL
  SELECT string_agg(p.proname, ', ') INTO v_sobra
  FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'aba_health'
    AND p.proname IN ('impedir_alteracao_modelo_consentimento','publicar_modelo_consentimento',
                      'impedir_alteracao_evolucao_travada','impedir_alteracao_assinatura_externa',
                      'token_externo_freado','registrar_recusa_token_externo','emitir_concessao_externa',
                      'emitir_link_assinatura','revogar_concessao_externa','documento_para_assinatura',
                      'confirmar_paciente_externo','abrir_documento_externo','registrar_assinatura_externa',
                      'ler_assinaturas_externas','pode_ler_assinatura_externa')
    AND l.lanname <> 'plpgsql';
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION '(c) fora de PL/pgSQL: %', v_sobra; END IF;

  -- (d) bucket privado com as duas travas, e a policy de leitura presente e única
  IF NOT EXISTS (SELECT 1 FROM storage.buckets b
                 WHERE b.id = 'assinaturas-pacientes' AND NOT b.public
                   AND b.file_size_limit = 524288 AND b.allowed_mime_types = ARRAY['image/png']) THEN
    RAISE EXCEPTION '(d) bucket assinaturas-pacientes ausente ou sem as travas do Storage.';
  END IF;
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND qual LIKE '%assinaturas-pacientes%') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'SELECT'
                      AND policyname = 'Assinatura de paciente so sai por autorizacao clinica') THEN
    RAISE EXCEPTION '(d) policy de storage.objects do bucket assinaturas-pacientes ausente ou duplicada.';
  END IF;

  -- (e) gatilhos de imutabilidade pendurados
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN
        ('impedir_alteracao_assinatura_externa', 'impedir_alteracao_modelo_consentimento')) <> 2 THEN
    RAISE EXCEPTION '(e) gatilho de imutabilidade ausente.';
  END IF;

  -- (f) sem sessão, nada
  BEGIN
    PERFORM * FROM aba_health.emitir_link_assinatura('evolucao', gen_random_uuid());
    RAISE EXCEPTION '(f) emissão de link de assinatura sem sessão passou.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM aba_health.publicar_modelo_consentimento('uso_imagem', 'Termo', 'Texto de teste com mais de vinte.');
    RAISE EXCEPTION '(f) publicação de modelo sem sessão passou.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- (g) as guardas permanentes continuam verdes
  SELECT string_agg(funcao, ', ') INTO v_sobra FROM public.funcoes_sem_conta_ativa();
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION '(g) função sem conta ativa: %', v_sobra; END IF;
  SELECT string_agg(tabela || ' ' || politica, ', ') INTO v_sobra FROM public.politicas_sem_cerca_de_conta();
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION '(g) política sem cerca: %', v_sobra; END IF;
  IF EXISTS (SELECT 1 FROM public.atalhos_de_owner_sem_nivel()) THEN
    RAISE EXCEPTION '(g) atalho de owner sem trava de nível.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.modulos_sem_linha_de_nivel()) THEN
    RAISE EXCEPTION '(g) módulo sem linha de nível.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fks_sem_isolamento_de_conta()) THEN
    RAISE EXCEPTION '(g) chave estrangeira sem isolamento de conta.';
  END IF;
END $$;
