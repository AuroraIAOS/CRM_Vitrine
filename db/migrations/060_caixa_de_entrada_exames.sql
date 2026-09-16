-- =====================================================================
-- 060 — Caixa de entrada de exames: a máquina de estados da remessa, a
--       leitura por função com log e o aceite que migra para o
--       prontuário (Subetapa 03.11)
--
-- CONSOME a infraestrutura da 059 (03.10), sem tabela de token própria
-- (`docs/02` §14). O que era evidência imutável com um estado só passa a
-- ter a máquina que o Sindcom declarou em `remessas_dados`
-- (sql/20_comunicacao_externa.sql: CHECK dos quatro estados e o gatilho
-- que deixa mudar só `status`, `processada_em` e `processada_por`). O
-- Sindcom parava no CHECK; aqui a TRANSIÇÃO também é do banco — pulo de
-- estado e volta atrás são recusados pelo gatilho, inclusive para
-- `service_role`, e não pela tela.
--
-- DECISÕES DE MAX, 2026-09-16 (registradas em `docs/02` §14.4):
--   · A remessa `importada` É o exame. Sem cópia de bucket, sem tabela
--     nova: o prontuário lista as importadas por função com log, e a
--     cadeia de evidência (sha256, IP, user-agent, concessão) segue presa
--     ao arquivo que o prontuário mostra.
--   · `validada` é conferência explícita e obrigatória. Importar só a
--     partir de `validada`: são dois atos, conferir e aceitar. O aceite é
--     a trava que impede arquivo de terceiro de cair no prontuário.
--   · Rejeitada não deixa resíduo legível. Duas camadas: a policy do
--     bucket nega a leitura na MESMA transação da rejeição; a Edge
--     Function `remessa-rejeitar` apaga os bytes pela API do Storage e
--     carimba `arquivo_expurgado_em` (SQL não apaga `storage.objects` —
--     `42501`, `instrucoes.md` §5). Fica a evidência sem conteúdo.
--
-- O LABORATÓRIO é `aba_people.fornecedores`: a finalidade `recepcao_exame`
-- não se emite para quem não for fornecedor ativo da clínica. Sem coluna
-- de alvo nova na concessão — o alvo desta finalidade é o próprio
-- `cliente_id` (o prontuário).
--
-- VARREDURA DE `status = 'recebida'` (instrucoes.md §5, estado novo em
-- CHECK): no catálogo, só `registrar_remessa_externa` (059) grava o
-- estado — por DEFAULT, sem filtro. Nenhuma função filtrava pelo estado
-- antigo; a policy do bucket é a única leitura, e ganha o recorte aqui.
--
-- Regras da 03.9 cumpridas: conta por `public.active_account_id()`; sem
-- atalho de owner (o de `pode_acessar` já passa pela trava de nível);
-- tudo em PL/pgSQL; `REVOKE` de PUBLIC e de anon explícito.
--
-- Idempotente — seguro rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §1 — A máquina na tabela
-- ---------------------------------------------------------------------
ALTER TABLE aba_health.remessas_externas
  ADD COLUMN IF NOT EXISTS processada_em        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processada_por       UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS motivo_rejeicao      TEXT,
  ADD COLUMN IF NOT EXISTS arquivo_expurgado_em TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE aba_health.remessas_externas DROP CONSTRAINT IF EXISTS remessas_externas_status_check;
  ALTER TABLE aba_health.remessas_externas
    ADD CONSTRAINT remessas_externas_status_check
    CHECK (status IN ('recebida', 'validada', 'importada', 'rejeitada'));

  -- Só `recebida` não foi processada; processada tem data E autor.
  ALTER TABLE aba_health.remessas_externas DROP CONSTRAINT IF EXISTS remessas_externas_processamento_completo;
  ALTER TABLE aba_health.remessas_externas
    ADD CONSTRAINT remessas_externas_processamento_completo
    CHECK ((status = 'recebida') = (processada_em IS NULL)
           AND (processada_em IS NULL) = (processada_por IS NULL));

  -- Rejeição sem motivo não se audita.
  ALTER TABLE aba_health.remessas_externas DROP CONSTRAINT IF EXISTS remessas_externas_motivo_rejeicao;
  ALTER TABLE aba_health.remessas_externas
    ADD CONSTRAINT remessas_externas_motivo_rejeicao
    CHECK ((status = 'rejeitada') = (motivo_rejeicao IS NOT NULL)
           AND (motivo_rejeicao IS NULL OR length(btrim(motivo_rejeicao)) BETWEEN 3 AND 500));

  -- Só o rejeitado se expurga.
  ALTER TABLE aba_health.remessas_externas DROP CONSTRAINT IF EXISTS remessas_externas_expurgo_so_rejeitada;
  ALTER TABLE aba_health.remessas_externas
    ADD CONSTRAINT remessas_externas_expurgo_so_rejeitada
    CHECK (arquivo_expurgado_em IS NULL OR status = 'rejeitada');
END $$;

CREATE INDEX IF NOT EXISTS idx_remessas_externas_caixa
  ON aba_health.remessas_externas (account_id, status, recebida_em DESC);
CREATE INDEX IF NOT EXISTS idx_remessas_externas_por_expurgar
  ON aba_health.remessas_externas (processada_em)
  WHERE status = 'rejeitada' AND arquivo_expurgado_em IS NULL;

COMMENT ON COLUMN aba_health.remessas_externas.status IS
  'recebida → validada → importada; recebida|validada → rejeitada. importada e rejeitada são finais. Transição imposta por gatilho, inclusive para service_role (060).';
COMMENT ON COLUMN aba_health.remessas_externas.arquivo_expurgado_em IS
  'Quando os bytes da remessa rejeitada saíram do bucket (Edge Function remessa-rejeitar). A leitura já estava negada pela policy desde a rejeição.';

-- Imutabilidade + transição. Substitui o gatilho da 059, que deixava
-- mudar só `status`.
CREATE OR REPLACE FUNCTION aba_health.impedir_alteracao_remessa_externa()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  c_mutaveis CONSTANT TEXT[] := ARRAY['status', 'processada_em', 'processada_por',
                                      'motivo_rejeicao', 'arquivo_expurgado_em'];
BEGIN
  IF (to_jsonb(NEW) - c_mutaveis) IS DISTINCT FROM (to_jsonb(OLD) - c_mutaveis) THEN
    RAISE EXCEPTION 'Remessa externa é imutável: só o processamento muda. Correção chega como remessa nova.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT ((OLD.status = 'recebida' AND NEW.status IN ('validada', 'rejeitada'))
            OR (OLD.status = 'validada' AND NEW.status IN ('importada', 'rejeitada'))) THEN
      RAISE EXCEPTION 'Transição de remessa inexistente: % → %.', OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
    -- Toda transição carimba quem e quando, de novo.
    IF NEW.processada_em IS NULL OR NEW.processada_por IS NULL
       OR NEW.processada_em IS NOT DISTINCT FROM OLD.processada_em THEN
      RAISE EXCEPTION 'Transição de remessa sem carimbo de processamento.' USING ERRCODE = '23514';
    END IF;
    IF NEW.arquivo_expurgado_em IS DISTINCT FROM OLD.arquivo_expurgado_em THEN
      RAISE EXCEPTION 'Expurgo não acompanha transição.' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.processada_em IS DISTINCT FROM OLD.processada_em
       OR NEW.processada_por IS DISTINCT FROM OLD.processada_por
       OR NEW.motivo_rejeicao IS DISTINCT FROM OLD.motivo_rejeicao THEN
      RAISE EXCEPTION 'Processamento só muda junto com o status.' USING ERRCODE = '42501';
    END IF;
    IF NEW.arquivo_expurgado_em IS DISTINCT FROM OLD.arquivo_expurgado_em
       AND NOT (OLD.arquivo_expurgado_em IS NULL AND NEW.status = 'rejeitada') THEN
      RAISE EXCEPTION 'Expurgo só se carimba uma vez, em remessa rejeitada.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_health.impedir_alteracao_remessa_externa() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.impedir_alteracao_remessa_externa() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.impedir_alteracao_remessa_externa() FROM anon;
REVOKE ALL ON FUNCTION aba_health.impedir_alteracao_remessa_externa() FROM authenticated;

-- ---------------------------------------------------------------------
-- §2 — Emissão: exame só se recebe de laboratório (fornecedor ativo)
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

-- ---------------------------------------------------------------------
-- §3 — A caixa de entrada: leitura por função, uma linha de log por
--      remessa devolvida (RLS autoriza mas não registra — instrucoes §6)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_health.ler_caixa_de_entrada(
  p_status TEXT DEFAULT NULL,
  p_limite INTEGER DEFAULT 200
) RETURNS TABLE (
  remessa_id           UUID,
  cliente_id           UUID,
  cliente_nome         TEXT,
  laboratorio_id       UUID,
  laboratorio_nome     TEXT,
  status               TEXT,
  mime                 TEXT,
  tamanho_bytes        BIGINT,
  nome_original        TEXT,
  arquivo_caminho      TEXT,
  ip_origem            TEXT,
  user_agent           TEXT,
  recebida_em          TIMESTAMPTZ,
  processada_em        TIMESTAMPTZ,
  processada_por       UUID,
  motivo_rejeicao      TEXT,
  arquivo_expurgado_em TIMESTAMPTZ
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
    RAISE EXCEPTION 'A caixa de entrada exige sessão com clínica ativa.' USING ERRCODE = '42501';
  END IF;

  IF NOT licensing.module_enabled(v_account_id, 'health') THEN
    RAISE EXCEPTION 'Módulo de prontuário fora do nível contratado.' USING ERRCODE = '42501';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('recebida', 'validada', 'importada', 'rejeitada') THEN
    RAISE EXCEPTION 'Estado de remessa desconhecido: %', p_status USING ERRCODE = '23514';
  END IF;

  FOR v IN
    SELECT r.id, r.cliente_id, pc.nome_exibicao AS cliente_nome,
           c.pessoa_id, pl.nome_exibicao AS laboratorio_nome,
           r.status, r.mime, r.tamanho_bytes, r.nome_original, r.arquivo_caminho,
           host(r.ip_origem) AS ip_origem, r.user_agent, r.recebida_em,
           r.processada_em, r.processada_por, r.motivo_rejeicao, r.arquivo_expurgado_em
    FROM aba_health.remessas_externas r
    JOIN aba_health.concessoes_externas c
      ON c.id = r.concessao_id AND c.account_id = r.account_id
    JOIN aba_people.pessoas pc ON pc.id = r.cliente_id AND pc.account_id = r.account_id
    JOIN aba_people.pessoas pl ON pl.id = c.pessoa_id AND pl.account_id = r.account_id
    WHERE r.account_id = v_account_id
      -- Sem filtro, a caixa mostra o que espera decisão.
      AND (CASE WHEN p_status IS NULL THEN r.status IN ('recebida', 'validada')
                ELSE r.status = p_status END)
    ORDER BY r.recebida_em DESC
    LIMIT greatest(1, least(coalesce(p_limite, 200), 500))
  LOOP
    CONTINUE WHEN NOT aba_health.pode_acessar(v.cliente_id, 'leitura');

    INSERT INTO aba_health.log_acesso
      (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
    VALUES
      (v_account_id, v_ator, v.cliente_id, 'remessa_externa', v.id, 'leitura',
       jsonb_build_object('origem', 'caixa_de_entrada', 'status', v.status));

    remessa_id           := v.id;
    cliente_id           := v.cliente_id;
    cliente_nome         := v.cliente_nome;
    laboratorio_id       := v.pessoa_id;
    laboratorio_nome     := v.laboratorio_nome;
    status               := v.status;
    mime                 := v.mime;
    tamanho_bytes        := v.tamanho_bytes;
    nome_original        := v.nome_original;
    -- Rejeitada não tem arquivo a apontar: nem o caminho sai.
    arquivo_caminho      := CASE WHEN v.status = 'rejeitada' THEN NULL ELSE v.arquivo_caminho END;
    ip_origem            := v.ip_origem;
    user_agent           := v.user_agent;
    recebida_em          := v.recebida_em;
    processada_em        := v.processada_em;
    processada_por       := v.processada_por;
    motivo_rejeicao      := v.motivo_rejeicao;
    arquivo_expurgado_em := v.arquivo_expurgado_em;
    RETURN NEXT;
  END LOOP;
END;
$$;

ALTER FUNCTION aba_health.ler_caixa_de_entrada(text, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.ler_caixa_de_entrada(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.ler_caixa_de_entrada(text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION aba_health.ler_caixa_de_entrada(text, integer) TO authenticated;

-- Os exames do prontuário: só as importadas daquele paciente.
CREATE OR REPLACE FUNCTION aba_health.ler_exames_importados(p_cliente_id UUID)
RETURNS TABLE (
  remessa_id       UUID,
  laboratorio_nome TEXT,
  mime             TEXT,
  tamanho_bytes    BIGINT,
  nome_original    TEXT,
  arquivo_caminho  TEXT,
  sha256_hex       TEXT,
  recebida_em      TIMESTAMPTZ,
  importada_em     TIMESTAMPTZ,
  importada_por    UUID
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
    RAISE EXCEPTION 'Ler exames exige sessão com clínica ativa.' USING ERRCODE = '42501';
  END IF;

  -- `pode_acessar(NULL, …)` abre para o owner (014): o paciente é
  -- obrigatório antes de qualquer outra checagem.
  IF p_cliente_id IS NULL OR NOT aba_health.pode_acessar(p_cliente_id, 'leitura') THEN
    RAISE EXCEPTION 'Paciente % não existe ou não está ao seu alcance.', p_cliente_id USING ERRCODE = '42501';
  END IF;

  FOR v IN
    SELECT r.id, pl.nome_exibicao AS laboratorio_nome, r.mime, r.tamanho_bytes, r.nome_original,
           r.arquivo_caminho, encode(r.sha256, 'hex') AS sha256_hex, r.recebida_em,
           r.processada_em, r.processada_por
    FROM aba_health.remessas_externas r
    JOIN aba_health.concessoes_externas c
      ON c.id = r.concessao_id AND c.account_id = r.account_id
    JOIN aba_people.pessoas pl ON pl.id = c.pessoa_id AND pl.account_id = r.account_id
    WHERE r.account_id = v_account_id
      AND r.cliente_id = p_cliente_id
      AND r.status = 'importada'
    ORDER BY r.recebida_em DESC
  LOOP
    INSERT INTO aba_health.log_acesso
      (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
    VALUES
      (v_account_id, v_ator, p_cliente_id, 'remessa_externa', v.id, 'leitura',
       jsonb_build_object('origem', 'prontuario'));

    remessa_id       := v.id;
    laboratorio_nome := v.laboratorio_nome;
    mime             := v.mime;
    tamanho_bytes    := v.tamanho_bytes;
    nome_original    := v.nome_original;
    arquivo_caminho  := v.arquivo_caminho;
    sha256_hex       := v.sha256_hex;
    recebida_em      := v.recebida_em;
    importada_em     := v.processada_em;
    importada_por    := v.processada_por;
    RETURN NEXT;
  END LOOP;
END;
$$;

ALTER FUNCTION aba_health.ler_exames_importados(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.ler_exames_importados(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.ler_exames_importados(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION aba_health.ler_exames_importados(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- §4 — As três decisões: validar, importar, rejeitar
-- ---------------------------------------------------------------------
-- Uma função só, com o destino como argumento: a regra de quem pode é a
-- mesma, e a regra de transição mora no gatilho. O UPDATE é condicional
-- ao estado de origem — duas decisões simultâneas sobre a mesma remessa
-- disputam a linha, e só uma encontra o estado esperado.
CREATE OR REPLACE FUNCTION aba_health.processar_remessa_externa(
  p_remessa_id UUID,
  p_para       TEXT,
  p_motivo     TEXT DEFAULT NULL
) RETURNS TABLE (remessa_id UUID, status TEXT, arquivo_caminho TEXT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_ator       UUID := auth.uid();
  v_account_id UUID := public.active_account_id();
  v_cliente_id UUID;
  v_de         TEXT;
  v_caminho    TEXT;
  v_origens    TEXT[];
  v_motivo     TEXT := nullif(btrim(p_motivo), '');
  v_feita      UUID;
BEGIN
  IF v_ator IS NULL OR v_account_id IS NULL THEN
    RAISE EXCEPTION 'Processar remessa exige sessão com clínica ativa.' USING ERRCODE = '42501';
  END IF;

  v_origens := CASE p_para
    WHEN 'validada'  THEN ARRAY['recebida']
    WHEN 'importada' THEN ARRAY['validada']
    WHEN 'rejeitada' THEN ARRAY['recebida', 'validada']
    ELSE NULL
  END;
  IF v_origens IS NULL THEN
    RAISE EXCEPTION 'Destino de remessa desconhecido: %', p_para USING ERRCODE = '23514';
  END IF;

  IF p_para = 'rejeitada' AND (v_motivo IS NULL OR length(v_motivo) < 3 OR length(v_motivo) > 500) THEN
    RAISE EXCEPTION 'Rejeitar exige motivo (3 a 500 caracteres).' USING ERRCODE = '23514';
  END IF;

  SELECT r.cliente_id, r.status, r.arquivo_caminho INTO v_cliente_id, v_de, v_caminho
  FROM aba_health.remessas_externas r
  WHERE r.id = p_remessa_id AND r.account_id = v_account_id;

  -- Remessa de outra clínica e remessa inexistente dão a mesma resposta.
  IF v_cliente_id IS NULL OR NOT aba_health.pode_acessar(v_cliente_id, 'atualizacao') THEN
    RAISE EXCEPTION 'Remessa % não existe ou não está ao seu alcance.', p_remessa_id USING ERRCODE = '42501';
  END IF;

  UPDATE aba_health.remessas_externas r
     SET status = p_para,
         processada_em = clock_timestamp(),
         processada_por = v_ator,
         motivo_rejeicao = CASE WHEN p_para = 'rejeitada' THEN v_motivo ELSE NULL END
   WHERE r.id = p_remessa_id
     AND r.account_id = v_account_id
     AND r.status = ANY (v_origens)
  RETURNING r.id INTO v_feita;

  IF v_feita IS NULL THEN
    RAISE EXCEPTION 'Remessa em "%" não vai para "%".', v_de, p_para USING ERRCODE = '23514';
  END IF;

  INSERT INTO aba_health.log_acesso
    (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
  VALUES
    (v_account_id, v_ator, v_cliente_id, 'remessa_externa', p_remessa_id, 'atualizacao',
     jsonb_build_object('de', v_de, 'para', p_para, 'motivo', v_motivo));

  remessa_id := p_remessa_id;
  status := p_para;
  -- O caminho só volta na rejeição: é o que a Edge Function apaga.
  arquivo_caminho := CASE WHEN p_para = 'rejeitada' THEN v_caminho ELSE NULL END;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION aba_health.processar_remessa_externa(uuid, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.processar_remessa_externa(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.processar_remessa_externa(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION aba_health.processar_remessa_externa(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- §5 — Expurgo do rejeitado (só servidor)
-- ---------------------------------------------------------------------
-- A Edge Function `remessa-rejeitar` apaga pela API do Storage e carimba
-- aqui. A varredura cobre também quem rejeitou pela RPC direta, sem
-- passar pela Edge Function: a leitura já estava negada, e os bytes saem
-- na próxima rejeição de qualquer clínica.
CREATE OR REPLACE FUNCTION aba_health.remessas_rejeitadas_por_expurgar(p_limite INTEGER DEFAULT 20)
RETURNS TABLE (remessa_id UUID, arquivo_caminho TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
    SELECT r.id, r.arquivo_caminho
    FROM aba_health.remessas_externas r
    WHERE r.status = 'rejeitada' AND r.arquivo_expurgado_em IS NULL
    ORDER BY r.processada_em
    LIMIT greatest(1, least(coalesce(p_limite, 20), 100));
END;
$$;

CREATE OR REPLACE FUNCTION aba_health.marcar_remessa_expurgada(p_remessa_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_feita UUID;
BEGIN
  UPDATE aba_health.remessas_externas r
     SET arquivo_expurgado_em = clock_timestamp()
   WHERE r.id = p_remessa_id
     AND r.status = 'rejeitada'
     AND r.arquivo_expurgado_em IS NULL
  RETURNING r.id INTO v_feita;
  RETURN v_feita IS NOT NULL;
END;
$$;

DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'aba_health.remessas_rejeitadas_por_expurgar(integer)',
    'aba_health.marcar_remessa_expurgada(uuid)'
  ] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- §6 — O bucket: rejeitada deixa de ser legível na mesma transação
-- ---------------------------------------------------------------------
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
  v_status     TEXT;
BEGIN
  IF p_nome_objeto IS NULL OR array_length(string_to_array(p_nome_objeto, '/'), 1) IS DISTINCT FROM 3 THEN
    RETURN FALSE;
  END IF;

  SELECT r.account_id, r.cliente_id, r.status INTO v_account_id, v_cliente_id, v_status
  FROM aba_health.remessas_externas r
  WHERE r.arquivo_caminho = p_nome_objeto;

  IF v_account_id IS NULL
     OR v_status = 'rejeitada'
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

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- §7 — VERIFICAÇÕES QUE RECUSAM A MIGRATION
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_sobra TEXT;
BEGIN
  -- (a) a tabela continua sem leitura nem escrita direta para anon/authenticated
  SELECT string_agg(p, ', ') INTO v_sobra
  FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p
  WHERE has_table_privilege('anon', 'aba_health.remessas_externas', p)
     OR has_table_privilege('authenticated', 'aba_health.remessas_externas', p);
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION '(a) privilégio direto em remessas_externas: %', v_sobra; END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'aba_health.remessas_externas'::regclass) THEN
    RAISE EXCEPTION '(a) policy em remessas_externas, que é lida só por função.';
  END IF;

  -- (b) funções da clínica: authenticated sim, anon não; de servidor: só service_role
  SELECT string_agg(f, ', ') INTO v_sobra
  FROM unnest(ARRAY[
    'aba_health.ler_caixa_de_entrada(text,integer)',
    'aba_health.ler_exames_importados(uuid)',
    'aba_health.processar_remessa_externa(uuid,text,text)',
    'aba_health.emitir_concessao_externa(uuid,uuid,text,interval,integer,text)',
    'aba_health.pode_ler_remessa_externa(text)']) f
  WHERE has_function_privilege('anon', f, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', f, 'EXECUTE');
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION '(b) privilégio errado em função da clínica: %', v_sobra; END IF;
  SELECT string_agg(f, ', ') INTO v_sobra
  FROM unnest(ARRAY[
    'aba_health.remessas_rejeitadas_por_expurgar(integer)',
    'aba_health.marcar_remessa_expurgada(uuid)']) f
  WHERE has_function_privilege('anon', f, 'EXECUTE')
     OR has_function_privilege('authenticated', f, 'EXECUTE')
     OR NOT has_function_privilege('service_role', f, 'EXECUTE');
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION '(b) função de servidor exposta: %', v_sobra; END IF;

  -- (c) tudo em PL/pgSQL
  SELECT string_agg(p.proname, ', ') INTO v_sobra
  FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'aba_health'
    AND p.proname IN ('ler_caixa_de_entrada','ler_exames_importados','processar_remessa_externa',
                      'remessas_rejeitadas_por_expurgar','marcar_remessa_expurgada',
                      'pode_ler_remessa_externa','impedir_alteracao_remessa_externa',
                      'emitir_concessao_externa')
    AND l.lanname <> 'plpgsql';
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION '(c) fora de PL/pgSQL: %', v_sobra; END IF;

  -- (d) sem coluna gerada (o gatilho compara to_jsonb) e com o gatilho pendurado
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'aba_health.remessas_externas'::regclass
             AND attnum > 0 AND attgenerated <> '') THEN
    RAISE EXCEPTION '(d) remessas_externas tem coluna gerada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'aba_health.remessas_externas'::regclass
                 AND tgname = 'impedir_alteracao_remessa_externa' AND NOT tgisinternal) THEN
    RAISE EXCEPTION '(d) gatilho de imutabilidade ausente.';
  END IF;

  -- (e) a policy do bucket continua sendo uma, de SELECT, e usa a função
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND qual LIKE '%remessas-externas%') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname = 'storage' AND tablename = 'objects'
                      AND policyname = 'Remessa externa so sai por autorizacao clinica' AND cmd = 'SELECT'
                      AND qual LIKE '%pode_ler_remessa_externa%') THEN
    RAISE EXCEPTION '(e) policy do bucket remessas-externas ausente, duplicada ou sem a função.';
  END IF;

  -- (f) sem sessão, nada
  BEGIN
    PERFORM * FROM aba_health.ler_caixa_de_entrada();
    RAISE EXCEPTION '(f) caixa de entrada sem sessão passou.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM aba_health.processar_remessa_externa(gen_random_uuid(), 'importada');
    RAISE EXCEPTION '(f) processamento sem sessão passou.';
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
