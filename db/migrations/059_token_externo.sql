-- =====================================================================
-- 059 — Infraestrutura de token externo: concessão, freio por token,
--       arquivo recebido e bucket privado (Subetapa 03.10)
--
-- PORTE DO CRM SINDCOM (`CLAUDE.md` §14 — portar a lógica, traduzir os
-- nomes). Origem, peça a peça:
--
--   Sindcom sql/20 `envios_campanha`   → aba_health.concessoes_externas
--   Sindcom sql/20 `remessas_dados`    → aba_health.remessas_externas
--   Sindcom sql/21 `tentativas_remessa`→ aba_health.tentativas_token_externo
--   Sindcom sql/21 bucket `remessas`   → bucket `remessas-externas`
--   Sindcom receber-remessa (Edge)     → supabase/functions/token-externo
--
-- DESTINO — decisão de Max, 2026-09-15 (registrada em `docs/02` §14): as
-- ações do PROFISSIONAL que saem da clínica por token (envio e recepção de
-- documento, compartilhamento, referência e contrarreferência, exportação,
-- assinatura remota) moram em `aba_health`, que é o regime mais criterioso
-- e deve continuar assim. O que vem de lead/cliente por conta própria
-- (autoagendamento, 03.19) vai para `aba_messaging`, em tabela própria.
-- Consequência direta: toda concessão é SOBRE um paciente (`cliente_id`
-- NOT NULL) e toda leitura passa por `pode_acessar(cliente_id, …)`.
--
-- O QUE MUDA EM RELAÇÃO AO SINDCOM, e por quê (decisões de Max na mesma
-- data):
--   · **O token não é guardado.** Lá era UUID em claro, e a secretaria o
--     lia (aceito como credencial de baixo poder). Aqui o token dá acesso
--     a dado clínico: guarda-se só `sha256`, e o token cru sai UMA vez, na
--     emissão — mesmo precedente do convite de equipe (022/024). São 32
--     bytes aleatórios em base64url (256 bits), não UUID (122).
--   · **`usos_maximos` configurável.** Lá o token era sempre reutilizável.
--     Vazio = reutilizável (laboratório mandando vários exames); 1 = uso
--     único (assinatura, exportação). O consumo é UM `UPDATE` condicional,
--     sem corrida: dois envios simultâneos num token de uso único, um passa.
--   · **A concessão tem finalidade fechada** e o destinatário é pessoa de
--     `aba_people`, com chave composta por conta — sem referência
--     polimórfica (`instrucoes.md` §6: ela seria invisível à auditoria 039).
--     Cada subetapa consumidora (03.11–03.14) acrescenta a SUA coluna de
--     alvo, nunca um par `tipo`/`id`.
--
-- AS TRÊS LIÇÕES DO SINDCOM, aplicadas desde a primeira linha:
--   1. O freio conta por TOKEN (hash do texto recebido), nunca pela
--      concessão, pelo destinatário ou pela conta. Travar a entidade daria
--      a um atacante o poder de silenciar um laboratório inteiro errando
--      token de propósito. Só falha de token freia; arquivo errado não.
--   2. Bucket `public = false` com `file_size_limit` e `allowed_mime_types`
--      no próprio Storage: segunda camada, independente da Edge Function.
--   3. Policy ausente em `storage.objects` não nega — faz o arquivo SUMIR
--      ("Object not found"). Por isso nasce a policy de leitura, com o
--      mesmo critério clínico da tabela.
--
-- E a lição do check-in do Sindcom (sql/21 §3): a recusa é RESULTADO, não
-- exceção. As funções de serviço devolvem `{ok:false, motivo}` e gravam a
-- tentativa na mesma transação; um `RAISE` levaria o registro do freio
-- junto no rollback e o contador nunca sairia do zero.
--
-- Regras da 03.9 cumpridas: conta sempre por `public.active_account_id()`;
-- nenhuma função tem atalho de owner (o de `pode_acessar` já passa pela
-- trava de nível); tudo em PL/pgSQL (a de Storage roda por linha — 058);
-- `REVOKE` de PUBLIC e de anon explícito.
--
-- Idempotente — seguro rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §1 — A concessão
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aba_health.concessoes_externas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  -- O paciente de quem é o dado. Obrigatório pela decisão de destino.
  cliente_id          UUID NOT NULL,
  -- Quem recebe o link: laboratório (fornecedor), o próprio paciente,
  -- especialista externo — sempre uma pessoa da conta.
  pessoa_id           UUID NOT NULL,
  finalidade          TEXT NOT NULL CHECK (finalidade IN (
                        'recepcao_exame', 'assinatura_paciente',
                        'exportacao_prontuario', 'encaminhamento')),
  canal               TEXT CHECK (canal IN ('whatsapp', 'email', 'sms', 'qr_code')),
  token_hash          BYTEA NOT NULL,
  token_expira_em     TIMESTAMPTZ NOT NULL,
  token_revogado_em   TIMESTAMPTZ,
  -- NO ACTION, no molde de `recusa_assinatura_por` (053): revogação é
  -- fato, e apagar o usuário não pode apagar o autor dela.
  token_revogado_por  UUID REFERENCES auth.users(id),
  usos_maximos        INTEGER,
  usos                INTEGER NOT NULL DEFAULT 0,
  primeiro_uso_em     TIMESTAMPTZ,
  ultimo_uso_em       TIMESTAMPTZ,
  enviado_em          TIMESTAMPTZ,
  criado_por          UUID NOT NULL REFERENCES auth.users(id),
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT concessoes_externas_token_hash_key UNIQUE (token_hash),
  CONSTRAINT concessoes_externas_id_account_id_key UNIQUE (id, account_id),
  CONSTRAINT concessoes_externas_cliente_fk FOREIGN KEY (cliente_id, account_id)
    REFERENCES aba_people.clientes (id, account_id) ON DELETE RESTRICT,
  CONSTRAINT concessoes_externas_pessoa_fk FOREIGN KEY (pessoa_id, account_id)
    REFERENCES aba_people.pessoas (id, account_id) ON DELETE RESTRICT,
  -- Token de vida infinita foi a pendência que o Sindcom herdou da ETAPA 07
  -- dele. Aqui a validade é obrigatória e tem teto.
  CONSTRAINT concessoes_externas_validade CHECK (
    token_expira_em > criado_em AND token_expira_em <= criado_em + INTERVAL '90 days'),
  CONSTRAINT concessoes_externas_revogacao_completa CHECK (
    (token_revogado_em IS NULL) = (token_revogado_por IS NULL)),
  CONSTRAINT concessoes_externas_usos CHECK (
    (usos_maximos IS NULL OR usos_maximos >= 1)
    AND usos >= 0
    AND (usos_maximos IS NULL OR usos <= usos_maximos)),
  CONSTRAINT concessoes_externas_carimbos_de_uso CHECK (
    (usos = 0) = (primeiro_uso_em IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_concessoes_externas_cliente
  ON aba_health.concessoes_externas (account_id, cliente_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_concessoes_externas_pessoa
  ON aba_health.concessoes_externas (pessoa_id, account_id);

COMMENT ON TABLE aba_health.concessoes_externas IS
  'Link com token que a clínica entrega a alguém de fora (Subetapa 03.10, porte de envios_campanha do CRM Sindcom). Guarda só o hash do token; nasce só por emitir_concessao_externa() e se revoga só por revogar_concessao_externa().';
COMMENT ON COLUMN aba_health.concessoes_externas.token_hash IS
  'sha256 do token em base64url. O token cru sai uma vez, na emissão, e não é recuperável. Coluna sem SELECT para authenticated.';
COMMENT ON COLUMN aba_health.concessoes_externas.usos_maximos IS
  'NULL = reutilizável até expirar ou ser revogado; 1 = uso único. Consumo por UPDATE condicional em registrar_remessa_externa().';
COMMENT ON COLUMN aba_health.concessoes_externas.enviado_em IS
  'Carimbo do disparo pelo canal. Nenhum canal envia nesta subetapa: quem preenche é a subetapa consumidora (03.11–03.14).';

-- ---------------------------------------------------------------------
-- §2 — O freio: tentativas por token
-- ---------------------------------------------------------------------
-- `token_alvo_hash` é o sha256 do TEXTO recebido, qualquer texto: lixo que
-- não tem forma de token também é registrado (Sindcom sql/21: se o lixo
-- não fosse contado, varrer com lixo sairia de graça). E é hash, não o
-- texto: uma tentativa BEM-sucedida gravaria o token válido em claro.
CREATE TABLE IF NOT EXISTS aba_health.tentativas_token_externo (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_alvo_hash  BYTEA NOT NULL,
  -- Conhecidos só quando o texto resolve para uma concessão (expirada,
  -- revogada, consumida ou válida). Nulos em `token_inexistente`.
  concessao_id     UUID,
  account_id       UUID,
  sucesso          BOOLEAN NOT NULL,
  motivo           TEXT CHECK (motivo IN (
                     'token_inexistente', 'token_expirado', 'token_revogado', 'token_consumido',
                     'arquivo_ausente', 'arquivo_invalido', 'finalidade_incompativel',
                     'falha_upload', 'falha_registro')),
  metodo           TEXT NOT NULL CHECK (metodo IN ('GET', 'POST')),
  ip_origem        INET,
  user_agent       TEXT CHECK (length(user_agent) <= 512),
  ocorrida_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tentativas_token_externo_concessao_fk FOREIGN KEY (concessao_id, account_id)
    REFERENCES aba_health.concessoes_externas (id, account_id) ON DELETE CASCADE,
  CONSTRAINT tentativas_token_externo_motivo_coerente CHECK (sucesso = (motivo IS NULL)),
  CONSTRAINT tentativas_token_externo_par_de_conta CHECK ((concessao_id IS NULL) = (account_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_tentativas_token_externo_janela
  ON aba_health.tentativas_token_externo (token_alvo_hash, ocorrida_em DESC);

COMMENT ON TABLE aba_health.tentativas_token_externo IS
  'Freio por TOKEN do endpoint público token-externo (porte de tentativas_remessa do CRM Sindcom). Por token, nunca pela concessão ou pela conta: travar a entidade deixaria um atacante silenciar um remetente legítimo errando token de propósito. Só service_role lê e escreve.';

-- ---------------------------------------------------------------------
-- §3 — O arquivo recebido (evidência imutável)
-- ---------------------------------------------------------------------
-- Recorte genérico de `remessas_dados`: só a evidência do que chegou. A
-- máquina `recebida → validada → importada → rejeitada`, com
-- `processada_em`/`processada_por`, é da 03.11 — que alarga o CHECK de
-- `status` e abre a leitura por função com log.
CREATE TABLE IF NOT EXISTS aba_health.remessas_externas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  concessao_id     UUID NOT NULL,
  -- Copiado da concessão pela função que grava: é o que a leitura do
  -- Storage consulta sem precisar de junção.
  cliente_id       UUID NOT NULL,
  arquivo_caminho  TEXT NOT NULL,
  mime             TEXT NOT NULL CHECK (mime IN ('application/pdf', 'image/jpeg', 'image/png')),
  tamanho_bytes    BIGINT NOT NULL CHECK (tamanho_bytes > 0 AND tamanho_bytes <= 20971520),
  sha256           BYTEA NOT NULL CHECK (length(sha256) = 32),
  nome_original    TEXT CHECK (length(nome_original) <= 255),
  status           TEXT NOT NULL DEFAULT 'recebida' CHECK (status IN ('recebida')),
  ip_origem        INET,
  user_agent       TEXT CHECK (length(user_agent) <= 512),
  recebida_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT remessas_externas_arquivo_caminho_key UNIQUE (arquivo_caminho),
  CONSTRAINT remessas_externas_id_account_id_key UNIQUE (id, account_id),
  CONSTRAINT remessas_externas_concessao_fk FOREIGN KEY (concessao_id, account_id)
    REFERENCES aba_health.concessoes_externas (id, account_id) ON DELETE RESTRICT,
  CONSTRAINT remessas_externas_cliente_fk FOREIGN KEY (cliente_id, account_id)
    REFERENCES aba_people.clientes (id, account_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_remessas_externas_concessao
  ON aba_health.remessas_externas (concessao_id, account_id);
CREATE INDEX IF NOT EXISTS idx_remessas_externas_cliente
  ON aba_health.remessas_externas (account_id, cliente_id, recebida_em DESC);

COMMENT ON TABLE aba_health.remessas_externas IS
  'Arquivo recebido por token (porte de remessas_dados do CRM Sindcom). Imutável por gatilho: só status muda. Nasce só por registrar_remessa_externa(); sem leitura direta para authenticated até a 03.11 abrir a caixa de entrada por função com log.';
COMMENT ON COLUMN aba_health.remessas_externas.arquivo_caminho IS
  'Objeto no bucket PRIVADO remessas-externas: conta-<uuid>/concessao-<uuid>/<uuid>.<ext>. Nunca URL pública.';
COMMENT ON COLUMN aba_health.remessas_externas.mime IS
  'Tipo DETECTADO pelos bytes na Edge Function, não o declarado pelo navegador.';

-- Imutabilidade: a evidência (quem mandou, o quê, de onde, quando) fica
-- congelada. Linha inteira menos `status` — sem coluna gerada na tabela,
-- conferido pela verificação (g) da §9.
CREATE OR REPLACE FUNCTION aba_health.impedir_alteracao_remessa_externa()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
    RAISE EXCEPTION 'Remessa externa é imutável: só o status muda. Correção chega como remessa nova.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_health.impedir_alteracao_remessa_externa() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.impedir_alteracao_remessa_externa() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.impedir_alteracao_remessa_externa() FROM anon;
REVOKE ALL ON FUNCTION aba_health.impedir_alteracao_remessa_externa() FROM authenticated;

DROP TRIGGER IF EXISTS impedir_alteracao_remessa_externa ON aba_health.remessas_externas;
CREATE TRIGGER impedir_alteracao_remessa_externa
  BEFORE UPDATE ON aba_health.remessas_externas
  FOR EACH ROW EXECUTE FUNCTION aba_health.impedir_alteracao_remessa_externa();

-- ---------------------------------------------------------------------
-- §4 — RLS e privilégio: o GRANT é o portão, a policy recorta a linha
-- ---------------------------------------------------------------------
ALTER TABLE aba_health.concessoes_externas ENABLE ROW LEVEL SECURITY;
ALTER TABLE aba_health.tentativas_token_externo ENABLE ROW LEVEL SECURITY;
ALTER TABLE aba_health.remessas_externas ENABLE ROW LEVEL SECURITY;

-- Os privilégios padrão de `aba_health` (013) dão DML a `authenticated`
-- em toda tabela nova. Aqui ninguém de dentro escreve direto: emissão e
-- revogação são funções; tentativa e remessa são só do servidor.
REVOKE ALL ON aba_health.concessoes_externas FROM anon, authenticated;
REVOKE ALL ON aba_health.tentativas_token_externo FROM anon, authenticated;
REVOKE ALL ON aba_health.remessas_externas FROM anon, authenticated;
REVOKE ALL ON SEQUENCE aba_health.tentativas_token_externo_id_seq FROM anon, authenticated;
GRANT ALL ON aba_health.concessoes_externas, aba_health.tentativas_token_externo,
             aba_health.remessas_externas TO service_role;

-- Leitura da concessão, coluna a coluna, sem `token_hash`: a tela da
-- subetapa consumidora lista links emitidos (para quem, até quando,
-- quantos usos) sem nunca tocar no hash. Montada pelo catálogo, para que
-- coluna nova não entre por esquecimento — nem saia.
DO $$
DECLARE
  v_cols TEXT;
BEGIN
  SELECT string_agg(format('%I', c.column_name), ', ' ORDER BY c.ordinal_position)
  INTO v_cols
  FROM information_schema.columns c
  WHERE c.table_schema = 'aba_health'
    AND c.table_name = 'concessoes_externas'
    AND c.column_name <> 'token_hash';
  EXECUTE format('GRANT SELECT (%s) ON aba_health.concessoes_externas TO authenticated', v_cols);
END $$;

DROP POLICY IF EXISTS concessoes_externas_select ON aba_health.concessoes_externas;
CREATE POLICY concessoes_externas_select ON aba_health.concessoes_externas
  FOR SELECT TO authenticated
  USING (public.is_account_member(account_id) AND aba_health.pode_acessar(cliente_id, 'leitura'));

-- `tentativas_token_externo` e `remessas_externas`: RLS ligada e ZERO
-- policy de propósito, mais nenhum GRANT — duas camadas independentes.

-- ---------------------------------------------------------------------
-- §5 — `log_acesso` aceita os dois registros novos
-- ---------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE aba_health.log_acesso DROP CONSTRAINT IF EXISTS log_acesso_tipo_registro_check;
  ALTER TABLE aba_health.log_acesso
    ADD CONSTRAINT log_acesso_tipo_registro_check
    CHECK (tipo_registro IN ('prontuario', 'anamnese', 'evolucao', 'consentimento', 'plano',
                             'concessao_externa', 'remessa_externa'));
END $$;

-- ---------------------------------------------------------------------
-- §6 — Funções da clínica: emitir e revogar
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

COMMENT ON FUNCTION aba_health.emitir_concessao_externa(uuid, uuid, text, interval, integer, text) IS
  'Emite link externo sobre um paciente da clínica ativa (03.10). Devolve o token cru UMA vez — só o hash fica. Exige pode_acessar(criacao), ou exportacao para exportacao_prontuario. Grava log_acesso.';

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
  v_revogado   TIMESTAMPTZ;
  v_agora      TIMESTAMPTZ := NOW();
BEGIN
  IF v_ator IS NULL OR v_account_id IS NULL THEN
    RAISE EXCEPTION 'Revogar link externo exige sessão com clínica ativa.' USING ERRCODE = '42501';
  END IF;

  SELECT c.cliente_id, c.token_revogado_em INTO v_cliente_id, v_revogado
  FROM aba_health.concessoes_externas c
  WHERE c.id = p_concessao_id AND c.account_id = v_account_id;

  -- Mesma resposta para "não existe" e "não é sua".
  IF v_cliente_id IS NULL OR NOT aba_health.pode_acessar(v_cliente_id, 'atualizacao') THEN
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

COMMENT ON FUNCTION aba_health.revogar_concessao_externa(uuid) IS
  'Revoga link externo (03.10): o link passa a ser recusado com motivo token_revogado; a linha e as remessas ficam. Exige pode_acessar(atualizacao). Grava log_acesso.';

-- ---------------------------------------------------------------------
-- §7 — Funções do servidor (só `service_role`, chamadas pela Edge
--      Function `token-externo`)
-- ---------------------------------------------------------------------
-- Onde `service_role` escreve, a RLS não protege nada (`instrucoes.md` §6):
-- a fronteira de conta é o `account_id` que sai da concessão encontrada
-- pelo hash, e ele é reafirmado em cada `WHERE`.

-- 7.1 A situação do token, como DADO. Nunca exceção.
CREATE OR REPLACE FUNCTION aba_health.avaliar_token_externo(p_token TEXT)
RETURNS TABLE (
  token_hash   BYTEA,
  motivo       TEXT,
  concessao_id UUID,
  account_id   UUID,
  cliente_id   UUID,
  finalidade   TEXT,
  expira_em    TIMESTAMPTZ,
  usos_maximos INTEGER,
  usos         INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_texto TEXT := left(coalesce(p_token, ''), 512);
  v_hash  BYTEA := sha256(convert_to(left(coalesce(p_token, ''), 512), 'UTF8'));
  v_c     aba_health.concessoes_externas%ROWTYPE;
BEGIN
  -- Texto sem forma de token nem procura: é inexistente, e é registrado.
  IF v_texto !~ '^[A-Za-z0-9_-]{43}$' THEN
    RETURN QUERY SELECT v_hash, 'token_inexistente'::TEXT, NULL::UUID, NULL::UUID, NULL::UUID,
                        NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;

  SELECT * INTO v_c FROM aba_health.concessoes_externas c WHERE c.token_hash = v_hash;

  IF v_c.id IS NULL THEN
    RETURN QUERY SELECT v_hash, 'token_inexistente'::TEXT, NULL::UUID, NULL::UUID, NULL::UUID,
                        NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    v_hash,
    CASE
      WHEN v_c.token_revogado_em IS NOT NULL THEN 'token_revogado'
      WHEN v_c.token_expira_em <= NOW() THEN 'token_expirado'
      WHEN v_c.usos_maximos IS NOT NULL AND v_c.usos >= v_c.usos_maximos THEN 'token_consumido'
      ELSE NULL
    END,
    v_c.id, v_c.account_id, v_c.cliente_id, v_c.finalidade, v_c.token_expira_em,
    v_c.usos_maximos, v_c.usos;
END;
$$;

-- 7.2 O freio. 5 falhas DE TOKEN em 15 minutos travam aquele token. A
-- consulta ao freio não se registra (senão a trava se renovaria sozinha).
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
      AND t.motivo IN ('token_inexistente', 'token_expirado', 'token_revogado', 'token_consumido')
      AND t.ocorrida_em > NOW() - INTERVAL '15 minutes'
  );
END;
$$;

-- 7.3 Registro de tentativa (uso interno das funções abaixo).
CREATE OR REPLACE FUNCTION aba_health.registrar_tentativa_token_externo(
  p_token_hash   BYTEA,
  p_concessao_id UUID,
  p_account_id   UUID,
  p_motivo       TEXT,
  p_metodo       TEXT,
  p_ip           INET,
  p_user_agent   TEXT
) RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO aba_health.tentativas_token_externo
    (token_alvo_hash, concessao_id, account_id, sucesso, motivo, metodo, ip_origem, user_agent)
  VALUES
    (p_token_hash, p_concessao_id, p_account_id, p_motivo IS NULL, p_motivo, p_metodo, p_ip,
     left(p_user_agent, 512));
END;
$$;

-- 7.4 GET/POST: resolve o token. No GET, o sucesso também fica registrado
-- (é a evidência de que o link foi aberto); no POST, o sucesso só se
-- registra quando a remessa grava (7.6).
CREATE OR REPLACE FUNCTION aba_health.resolver_token_externo(
  p_token      TEXT,
  p_metodo     TEXT,
  p_ip         INET,
  p_user_agent TEXT
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v   RECORD;
  v_clinica TEXT;
BEGIN
  IF p_metodo IS NULL OR p_metodo NOT IN ('GET', 'POST') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'metodo_invalido');
  END IF;

  SELECT * INTO v FROM aba_health.avaliar_token_externo(p_token);

  IF aba_health.token_externo_freado(v.token_hash) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'freado');
  END IF;

  IF v.motivo IS NOT NULL THEN
    PERFORM aba_health.registrar_tentativa_token_externo(
      v.token_hash, v.concessao_id, v.account_id, v.motivo, p_metodo, p_ip, p_user_agent);
    RETURN jsonb_build_object('ok', false, 'motivo', v.motivo);
  END IF;

  IF p_metodo = 'GET' THEN
    PERFORM aba_health.registrar_tentativa_token_externo(
      v.token_hash, v.concessao_id, v.account_id, NULL, p_metodo, p_ip, p_user_agent);
  END IF;

  SELECT a.name INTO v_clinica FROM public.accounts a WHERE a.id = v.account_id;

  -- Nada do paciente sai daqui: nem nome, nem id. Quem abre o link vê a
  -- clínica, a finalidade e o prazo. O que a página precisa mostrar do
  -- paciente é decisão de cada subetapa consumidora.
  RETURN jsonb_build_object(
    'ok', true,
    'concessao_id', v.concessao_id,
    'account_id', v.account_id,
    'finalidade', v.finalidade,
    'clinica', v_clinica,
    'expira_em', v.expira_em,
    'usos_restantes', CASE WHEN v.usos_maximos IS NULL THEN NULL ELSE v.usos_maximos - v.usos END,
    'aceita_arquivo', v.finalidade = 'recepcao_exame'
  );
END;
$$;

-- 7.5 Recusas que a Edge Function detecta sozinha (arquivo, upload).
-- Motivo de token NÃO entra por aqui: esses só nascem da avaliação no
-- banco, para que ninguém consiga alimentar o freio de um token alheio.
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
  IF p_motivo IS NULL OR p_motivo NOT IN
     ('arquivo_ausente', 'arquivo_invalido', 'finalidade_incompativel', 'falha_upload', 'falha_registro') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'motivo_invalido');
  END IF;

  SELECT * INTO v FROM aba_health.avaliar_token_externo(p_token);

  -- Só se registra recusa de arquivo sobre token VÁLIDO: sobre token
  -- inválido o desfecho é o do token, e ele já foi registrado.
  IF v.motivo IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', v.motivo);
  END IF;

  PERFORM aba_health.registrar_tentativa_token_externo(
    v.token_hash, v.concessao_id, v.account_id, p_motivo, 'POST', p_ip, p_user_agent);
  RETURN jsonb_build_object('ok', true, 'motivo', p_motivo);
END;
$$;

-- 7.6 A remessa: consome um uso e grava a evidência, na mesma transação.
CREATE OR REPLACE FUNCTION aba_health.registrar_remessa_externa(
  p_token         TEXT,
  p_caminho       TEXT,
  p_mime          TEXT,
  p_tamanho       BIGINT,
  p_sha256_hex    TEXT,
  p_nome_original TEXT,
  p_ip            INET,
  p_user_agent    TEXT
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v           RECORD;
  v_consumida UUID;
  v_remessa   UUID;
  v_agora     TIMESTAMPTZ := NOW();
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

  IF v.finalidade <> 'recepcao_exame' THEN
    PERFORM aba_health.registrar_tentativa_token_externo(
      v.token_hash, v.concessao_id, v.account_id, 'finalidade_incompativel', 'POST', p_ip, p_user_agent);
    RETURN jsonb_build_object('ok', false, 'motivo', 'finalidade_incompativel');
  END IF;

  -- O caminho tem que ser o desta concessão, nesta conta: a Edge Function
  -- monta, o banco confere. Caminho decorativo em regra de segurança é
  -- convite a confiar nele (014).
  IF p_caminho IS NULL
     OR p_caminho !~ ('^conta-' || v.account_id::TEXT || '/concessao-' || v.concessao_id::TEXT
                      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$')
     OR p_sha256_hex IS NULL OR p_sha256_hex !~ '^[0-9a-f]{64}$'
     OR p_mime IS NULL OR p_mime NOT IN ('application/pdf', 'image/jpeg', 'image/png')
     OR p_tamanho IS NULL OR p_tamanho <= 0 OR p_tamanho > 20971520 THEN
    PERFORM aba_health.registrar_tentativa_token_externo(
      v.token_hash, v.concessao_id, v.account_id, 'falha_registro', 'POST', p_ip, p_user_agent);
    RETURN jsonb_build_object('ok', false, 'motivo', 'falha_registro');
  END IF;

  -- O consumo é a própria condição: dois envios simultâneos num token de
  -- uso único disputam esta linha, e só um encontra `usos < usos_maximos`.
  UPDATE aba_health.concessoes_externas c
     SET usos = c.usos + 1,
         primeiro_uso_em = coalesce(c.primeiro_uso_em, v_agora),
         ultimo_uso_em = v_agora
   WHERE c.id = v.concessao_id
     AND c.account_id = v.account_id
     AND c.token_revogado_em IS NULL
     AND c.token_expira_em > v_agora
     AND (c.usos_maximos IS NULL OR c.usos < c.usos_maximos)
  RETURNING c.id INTO v_consumida;

  IF v_consumida IS NULL THEN
    PERFORM aba_health.registrar_tentativa_token_externo(
      v.token_hash, v.concessao_id, v.account_id, 'token_consumido', 'POST', p_ip, p_user_agent);
    RETURN jsonb_build_object('ok', false, 'motivo', 'token_consumido');
  END IF;

  INSERT INTO aba_health.remessas_externas
    (account_id, concessao_id, cliente_id, arquivo_caminho, mime, tamanho_bytes, sha256,
     nome_original, ip_origem, user_agent, recebida_em)
  VALUES
    (v.account_id, v.concessao_id, v.cliente_id, p_caminho, p_mime, p_tamanho,
     decode(p_sha256_hex, 'hex'), left(p_nome_original, 255), p_ip, left(p_user_agent, 512), v_agora)
  RETURNING id INTO v_remessa;

  PERFORM aba_health.registrar_tentativa_token_externo(
    v.token_hash, v.concessao_id, v.account_id, NULL, 'POST', p_ip, p_user_agent);

  RETURN jsonb_build_object('ok', true, 'remessa_id', v_remessa);
END;
$$;

-- Privilégio das funções de servidor: só `service_role`.
DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'aba_health.avaliar_token_externo(text)',
    'aba_health.token_externo_freado(bytea)',
    'aba_health.registrar_tentativa_token_externo(bytea, uuid, uuid, text, text, inet, text)',
    'aba_health.resolver_token_externo(text, text, inet, text)',
    'aba_health.registrar_recusa_token_externo(text, text, inet, text)',
    'aba_health.registrar_remessa_externa(text, text, text, bigint, text, text, inet, text)'
  ] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

COMMENT ON FUNCTION aba_health.resolver_token_externo(text, text, inet, text) IS
  'Só service_role (Edge Function token-externo). Resolve o token e devolve {ok, motivo} como dado; registra a tentativa na mesma transação. Nada do paciente sai.';
COMMENT ON FUNCTION aba_health.registrar_remessa_externa(text, text, text, bigint, text, text, inet, text) IS
  'Só service_role. Consome um uso por UPDATE condicional (sem corrida) e grava a remessa imutável; recusa como dado, nunca exceção.';

-- ---------------------------------------------------------------------
-- §8 — O bucket e a leitura em `storage.objects`
-- ---------------------------------------------------------------------
-- Lista estreita: laudo em PDF e imagem de exame. 20 MB — radiografia
-- panorâmica em alta cabe; vídeo e DICOM ficam de fora de propósito.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('remessas-externas', 'remessas-externas', FALSE, 20971520,
        ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Roda POR LINHA de `storage.objects`: PL/pgSQL, nunca `LANGUAGE sql` +
-- `SECURITY DEFINER` (058). A remessa é achada pelo caminho EXATO, e o
-- primeiro segmento tem que ser a conta real dela.
CREATE OR REPLACE FUNCTION aba_health.pode_ler_remessa_externa(p_nome_objeto TEXT)
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

  SELECT r.account_id, r.cliente_id INTO v_account_id, v_cliente_id
  FROM aba_health.remessas_externas r
  WHERE r.arquivo_caminho = p_nome_objeto;

  IF v_account_id IS NULL
     OR (string_to_array(p_nome_objeto, '/'))[1] <> ('conta-' || v_account_id::TEXT) THEN
    RETURN FALSE;
  END IF;

  RETURN public.is_account_member(v_account_id) AND aba_health.pode_acessar(v_cliente_id, 'leitura');
END;
$$;

ALTER FUNCTION aba_health.pode_ler_remessa_externa(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.pode_ler_remessa_externa(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.pode_ler_remessa_externa(text) FROM anon;
GRANT EXECUTE ON FUNCTION aba_health.pode_ler_remessa_externa(text) TO authenticated, service_role;

-- Só SELECT. Nenhuma policy de INSERT/UPDATE/DELETE: quem escreve é a Edge
-- Function com `service_role`; qualquer outro papel que tente subir
-- arquivo recebe a negativa da RLS do Storage.
DROP POLICY IF EXISTS "Remessa externa so sai por autorizacao clinica" ON storage.objects;
CREATE POLICY "Remessa externa so sai por autorizacao clinica"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'remessas-externas' AND aba_health.pode_ler_remessa_externa(name));

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- §9 — VERIFICAÇÕES QUE RECUSAM A MIGRATION
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_sobra TEXT;
BEGIN
  -- (a) anon sem nada nas três tabelas; authenticated sem escrita e sem o hash
  SELECT string_agg(t || ':' || p, ', ') INTO v_sobra
  FROM unnest(ARRAY['aba_health.concessoes_externas','aba_health.tentativas_token_externo',
                    'aba_health.remessas_externas']) t
  CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p
  WHERE has_table_privilege('anon', t, p)
     OR (p <> 'SELECT' AND has_table_privilege('authenticated', t, p))
     OR (p = 'SELECT' AND t <> 'aba_health.concessoes_externas' AND has_table_privilege('authenticated', t, p));
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION '(a) privilégio de tabela sobrando: %', v_sobra;
  END IF;
  IF has_table_privilege('authenticated', 'aba_health.concessoes_externas', 'SELECT')
     OR has_column_privilege('authenticated', 'aba_health.concessoes_externas', 'token_hash', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'aba_health.concessoes_externas', 'token_expira_em', 'SELECT') THEN
    RAISE EXCEPTION '(a) leitura de concessoes_externas errada: o hash não pode sair, o resto sim.';
  END IF;

  -- (b) RLS ligada nas três; zero policy nas duas do servidor
  SELECT string_agg(c.relname, ', ') INTO v_sobra
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'aba_health'
    AND c.relname IN ('concessoes_externas','tentativas_token_externo','remessas_externas')
    AND NOT c.relrowsecurity;
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION '(b) RLS desligada: %', v_sobra; END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid IN
             ('aba_health.tentativas_token_externo'::regclass, 'aba_health.remessas_externas'::regclass)) THEN
    RAISE EXCEPTION '(b) policy em tabela que é só do servidor.';
  END IF;

  -- (c) funções de servidor: só service_role; funções da clínica: authenticated, nunca anon
  SELECT string_agg(f, ', ') INTO v_sobra
  FROM unnest(ARRAY[
    'aba_health.avaliar_token_externo(text)',
    'aba_health.token_externo_freado(bytea)',
    'aba_health.registrar_tentativa_token_externo(bytea,uuid,uuid,text,text,inet,text)',
    'aba_health.resolver_token_externo(text,text,inet,text)',
    'aba_health.registrar_recusa_token_externo(text,text,inet,text)',
    'aba_health.registrar_remessa_externa(text,text,text,bigint,text,text,inet,text)']) f
  WHERE has_function_privilege('anon', f, 'EXECUTE')
     OR has_function_privilege('authenticated', f, 'EXECUTE')
     OR NOT has_function_privilege('service_role', f, 'EXECUTE');
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION '(c) função de servidor exposta: %', v_sobra; END IF;
  SELECT string_agg(f, ', ') INTO v_sobra
  FROM unnest(ARRAY[
    'aba_health.emitir_concessao_externa(uuid,uuid,text,interval,integer,text)',
    'aba_health.revogar_concessao_externa(uuid)',
    'aba_health.pode_ler_remessa_externa(text)']) f
  WHERE has_function_privilege('anon', f, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', f, 'EXECUTE');
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION '(c) privilégio errado em função da clínica: %', v_sobra; END IF;

  -- (d) tudo o que é novo em PL/pgSQL (a de Storage roda por linha — 058)
  SELECT string_agg(p.proname, ', ') INTO v_sobra
  FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'aba_health'
    AND p.proname IN ('emitir_concessao_externa','revogar_concessao_externa','avaliar_token_externo',
                      'token_externo_freado','registrar_tentativa_token_externo','resolver_token_externo',
                      'registrar_recusa_token_externo','registrar_remessa_externa','pode_ler_remessa_externa',
                      'impedir_alteracao_remessa_externa')
    AND l.lanname <> 'plpgsql';
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION '(d) fora de PL/pgSQL: %', v_sobra; END IF;

  -- (e) o bucket: privado, com as duas travas do próprio Storage
  IF NOT EXISTS (SELECT 1 FROM storage.buckets b
                 WHERE b.id = 'remessas-externas' AND NOT b.public
                   AND b.file_size_limit = 20971520
                   AND b.allowed_mime_types @> ARRAY['application/pdf','image/jpeg','image/png']
                   AND array_length(b.allowed_mime_types, 1) = 3) THEN
    RAISE EXCEPTION '(e) bucket remessas-externas ausente ou sem as travas do Storage.';
  END IF;

  -- (f) a policy de leitura existe (ausência não nega: faz sumir) e é a única do bucket
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND qual LIKE '%remessas-externas%') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname = 'storage' AND tablename = 'objects'
                      AND policyname = 'Remessa externa so sai por autorizacao clinica' AND cmd = 'SELECT') THEN
    RAISE EXCEPTION '(f) policy de storage.objects do bucket remessas-externas ausente ou duplicada.';
  END IF;

  -- (g) remessa sem coluna gerada (a comparação to_jsonb do gatilho quebraria) e com o gatilho pendurado
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'aba_health.remessas_externas'::regclass
             AND attnum > 0 AND attgenerated <> '') THEN
    RAISE EXCEPTION '(g) remessas_externas tem coluna gerada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'aba_health.remessas_externas'::regclass
                 AND tgname = 'impedir_alteracao_remessa_externa' AND NOT tgisinternal) THEN
    RAISE EXCEPTION '(g) gatilho de imutabilidade ausente.';
  END IF;

  -- (h) sem sessão, nada: a emissão recusa
  BEGIN
    PERFORM aba_health.emitir_concessao_externa(gen_random_uuid(), gen_random_uuid(), 'recepcao_exame');
    RAISE EXCEPTION '(h) emissão sem sessão passou.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- (i) as guardas permanentes continuam verdes
  SELECT string_agg(funcao, ', ') INTO v_sobra FROM public.funcoes_sem_conta_ativa();
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION '(i) função sem conta ativa: %', v_sobra; END IF;
  SELECT string_agg(tabela || ' ' || politica, ', ') INTO v_sobra FROM public.politicas_sem_cerca_de_conta();
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION '(i) política sem cerca: %', v_sobra; END IF;
  IF EXISTS (SELECT 1 FROM public.atalhos_de_owner_sem_nivel()) THEN
    RAISE EXCEPTION '(i) atalho de owner sem trava de nível.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.modulos_sem_linha_de_nivel()) THEN
    RAISE EXCEPTION '(i) módulo sem linha de nível.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fks_sem_isolamento_de_conta()) THEN
    RAISE EXCEPTION '(i) chave estrangeira sem isolamento de conta.';
  END IF;
END $$;
