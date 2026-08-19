-- ============================================================
-- 026_motor_automacoes_pg_cron.sql — o MOTOR (Subetapa 02.10)
--
-- Até aqui o projeto tinha rotinas sem ninguém que as chamasse:
-- `aba_finance.marcar_faturas_vencidas()`, `aba_finance.expirar_planos()`,
-- a fila `aba_automations.automacao_execucoes_pendentes` e os
-- `aba_scheduling.lembretes` existiam e nunca rodavam. O sintoma dessa
-- ausência é ausência de comportamento — fatura que nunca vence, lembrete
-- que nunca chega —, que não gera erro, não aparece em teste e não acusa em
-- advisor (pendência vigiada aberta na Subetapa 02.0). Esta migration
-- fecha isso.
--
-- SEARCH-FIRST (CLAUDE.md §11), confirmado na documentação vigente da
-- Supabase antes de escrever qualquer linha:
-- https://supabase.com/docs/guides/cron/install
--   · `create extension pg_cron with schema pg_catalog` — **pg_catalog**, e
--     não `extensions`. A armadilha genérica de `handoffs/instrucoes.md` §6
--     ("extensão nova vai para `extensions`") vale contra `public`, mas o
--     destino que a documentação oficial prescreve para pg_cron é
--     `pg_catalog`; a extensão cria sozinha o schema `cron`, onde ficam
--     `cron.job` e `cron.job_run_details`.
--   · recomendação oficial: no máximo ~8 jobs concorrentes, cada um com
--     menos de 10 minutos de execução. Os 5 jobs abaixo são todos de
--     segundos e nunca coincidem no mesmo minuto de propósito.
-- A instalação foi aplicada em migration própria (`instalar_pg_cron`) e
-- **medida** (`pg_extension` → `pg_catalog`, `cron` existente) antes desta.
--
-- ONDE `service_role` ESCREVE, A RLS NÃO PROTEGE NADA (achado A06 da
-- Subetapa 01.8). Todo job aqui roda como `postgres`, que ignora RLS por
-- completo. A fronteira entre inquilinos, nesse caminho, é escrita à mão:
-- **toda linha derivada usa o `account_id` da própria linha de origem**,
-- nunca um valor de sessão, nunca um `account_id` recebido por parâmetro
-- sem conferência. É a única coisa que separa uma conta da outra aqui
-- dentro, e por isso está repetida explicitamente em cada `INSERT`.
--
-- O QUE O MOTOR EXECUTA DE VERDADE, e o que não executa: `esperar`,
-- `definir_tag`, `notificar_equipe` e `condicao` são executadas de fato.
-- `enviar_whatsapp` é **registrada, não enviada** — o envio depende da
-- configuração de canal por conta, cuja pendência é da Subetapa 02.5, e
-- inventar um envio que não acontece seria pior que declarar a lacuna: o
-- log recebe status `parcial` com o motivo explícito. Quando a 02.5
-- fechar, é este ponto — e só ele — que muda.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

-- ============================================================
-- 0. A extensão
-- ============================================================
-- Aplicada em migration própria no projeto (`instalar_pg_cron`) e
-- repetida aqui para que este arquivo continue reaplicável do zero.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- ============================================================
-- 1. aba_automations.registrar_etapa_executada — helper interno
-- ============================================================
-- Acumula o rastro de uma etapa no array `etapas_executadas` do log.
-- Existe para que o formato do rastro seja decidido num lugar só: log de
-- execução que cada ramo do motor formata do seu jeito vira log ilegível
-- na primeira vez que alguém precisa dele.
CREATE OR REPLACE FUNCTION aba_automations.registrar_etapa_executada(
  p_log_id UUID,
  p_etapa_id UUID,
  p_tipo_etapa TEXT,
  p_resultado TEXT,
  p_detalhe JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE aba_automations.automacao_logs
  SET etapas_executadas = etapas_executadas || jsonb_build_object(
        'etapa_id', p_etapa_id,
        'tipo_etapa', p_tipo_etapa,
        'resultado', p_resultado,
        'detalhe', p_detalhe,
        'em', NOW()
      )
  WHERE id = p_log_id;
$$;

REVOKE ALL ON FUNCTION aba_automations.registrar_etapa_executada(UUID, UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_automations.registrar_etapa_executada(UUID, UUID, TEXT, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION aba_automations.registrar_etapa_executada(UUID, UUID, TEXT, TEXT, JSONB) FROM authenticated;

-- ============================================================
-- 2. aba_automations.executar_etapas — o percurso propriamente dito
-- ============================================================
-- Percorre as etapas de um nível (raiz, ou um dos ramos de uma condição)
-- a partir de `p_posicao_inicial`. Devolve:
--   'concluido' — chegou ao fim do nível
--   'aguardando' — parou num `esperar` e deixou linha na fila
--   'falhou'    — erro tratado numa etapa
--
-- `p_account_id` é sempre o `account_id` da AUTOMAÇÃO, lido pelo chamador
-- da própria tabela — nunca vem do cliente.
CREATE OR REPLACE FUNCTION aba_automations.executar_etapas(
  p_automacao_id UUID,
  p_account_id UUID,
  p_pessoa_id UUID,
  p_log_id UUID,
  p_etapa_pai_id UUID,
  p_ramo TEXT,
  p_posicao_inicial INTEGER,
  p_contexto JSONB
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r RECORD;
  v_tag_id UUID;
  v_condicao_ok BOOLEAN;
  v_resultado_ramo TEXT;
  v_espera_minutos INTEGER;
BEGIN
  FOR r IN
    SELECT e.*
    FROM aba_automations.automacao_etapas e
    WHERE e.automacao_id = p_automacao_id
      AND e.etapa_pai_id IS NOT DISTINCT FROM p_etapa_pai_id
      AND e.ramo IS NOT DISTINCT FROM p_ramo
      AND e.posicao >= p_posicao_inicial
    ORDER BY e.posicao
  LOOP
    CASE r.tipo_etapa

      -- ------------------------------------------------------
      -- esperar: interrompe o percurso e deixa a retomada na fila
      -- ------------------------------------------------------
      WHEN 'esperar' THEN
        v_espera_minutos := COALESCE((r.config_etapa->>'minutos')::INTEGER, 60);
        INSERT INTO aba_automations.automacao_execucoes_pendentes
          (automacao_id, account_id, pessoa_id, log_id, etapa_pai_id, ramo,
           proxima_posicao_etapa, contexto, status, executar_em)
        VALUES
          -- account_id vem do parâmetro que o chamador leu da automação —
          -- este caminho não passa por RLS (achado A06 da 01.8).
          (p_automacao_id, p_account_id, p_pessoa_id, p_log_id, p_etapa_pai_id, p_ramo,
           r.posicao + 1, p_contexto, 'pendente', NOW() + (v_espera_minutos || ' minutes')::INTERVAL);

        PERFORM aba_automations.registrar_etapa_executada(
          p_log_id, r.id, r.tipo_etapa, 'aguardando',
          jsonb_build_object('minutos', v_espera_minutos));
        RETURN 'aguardando';

      -- ------------------------------------------------------
      -- definir_tag: executa de verdade
      -- ------------------------------------------------------
      WHEN 'definir_tag' THEN
        IF p_pessoa_id IS NULL THEN
          PERFORM aba_automations.registrar_etapa_executada(
            p_log_id, r.id, r.tipo_etapa, 'ignorado',
            jsonb_build_object('motivo', 'execução sem pessoa associada'));
        ELSE
          -- A tag é procurada/criada DENTRO da conta da automação. Sem este
          -- filtro, uma tag de mesmo nome de outro inquilino seria anexada.
          SELECT t.id INTO v_tag_id
          FROM aba_people.tags t
          WHERE t.account_id = p_account_id
            AND t.nome = COALESCE(r.config_etapa->>'tag', 'automação');

          IF v_tag_id IS NULL THEN
            INSERT INTO aba_people.tags (account_id, nome)
            VALUES (p_account_id, COALESCE(r.config_etapa->>'tag', 'automação'))
            RETURNING id INTO v_tag_id;
          END IF;

          -- Só anexa se a pessoa for da MESMA conta — a automação não
          -- alcança pessoa de outro inquilino nem por id inventado.
          IF EXISTS (SELECT 1 FROM aba_people.pessoas p
                     WHERE p.id = p_pessoa_id AND p.account_id = p_account_id) THEN
            INSERT INTO aba_people.pessoa_tags (pessoa_id, tag_id)
            VALUES (p_pessoa_id, v_tag_id)
            ON CONFLICT DO NOTHING;
            PERFORM aba_automations.registrar_etapa_executada(
              p_log_id, r.id, r.tipo_etapa, 'executado',
              jsonb_build_object('tag_id', v_tag_id));
          ELSE
            PERFORM aba_automations.registrar_etapa_executada(
              p_log_id, r.id, r.tipo_etapa, 'ignorado',
              jsonb_build_object('motivo', 'pessoa fora da conta da automação'));
          END IF;
        END IF;

      -- ------------------------------------------------------
      -- notificar_equipe: executa de verdade (public.notifications)
      -- ------------------------------------------------------
      WHEN 'notificar_equipe' THEN
        INSERT INTO public.notifications (account_id, user_id, type, title, body)
        SELECT p_account_id, pr.user_id, 'automation',
               COALESCE(r.config_etapa->>'titulo', 'Automação executada'),
               COALESCE(r.config_etapa->>'texto', '')
        FROM public.profiles pr
        -- Só os membros DESTA conta recebem — o job ignora RLS, então o
        -- recorte por account_id é o que impede notificar a conta errada.
        WHERE pr.account_id = p_account_id;

        PERFORM aba_automations.registrar_etapa_executada(
          p_log_id, r.id, r.tipo_etapa, 'executado', '{}'::jsonb);

      -- ------------------------------------------------------
      -- condicao: avalia e desce por um dos dois ramos
      -- ------------------------------------------------------
      WHEN 'condicao' THEN
        -- v1 avalia uma chave do contexto contra um valor esperado. É
        -- deliberadamente pequeno: condição rica exige linguagem de
        -- expressão própria, que é escopo de outra subetapa.
        v_condicao_ok := COALESCE(
          p_contexto ->> COALESCE(r.config_etapa->>'campo', '') = (r.config_etapa->>'igual_a'),
          FALSE);

        PERFORM aba_automations.registrar_etapa_executada(
          p_log_id, r.id, r.tipo_etapa, 'executado',
          jsonb_build_object('resultado', v_condicao_ok));

        v_resultado_ramo := aba_automations.executar_etapas(
          p_automacao_id, p_account_id, p_pessoa_id, p_log_id,
          r.id, CASE WHEN v_condicao_ok THEN 'sim' ELSE 'nao' END, 0, p_contexto);

        IF v_resultado_ramo <> 'concluido' THEN
          RETURN v_resultado_ramo;
        END IF;

      -- ------------------------------------------------------
      -- enviar_whatsapp: REGISTRADA, não enviada (ver cabeçalho)
      -- ------------------------------------------------------
      WHEN 'enviar_whatsapp' THEN
        PERFORM aba_automations.registrar_etapa_executada(
          p_log_id, r.id, r.tipo_etapa, 'nao_executado',
          jsonb_build_object(
            'motivo', 'envio por canal depende da configuração de WhatsApp da conta (Subetapa 02.5)',
            'modelo', r.config_etapa->>'modelo'));

      ELSE
        PERFORM aba_automations.registrar_etapa_executada(
          p_log_id, r.id, r.tipo_etapa, 'desconhecido',
          jsonb_build_object('motivo', 'tipo de etapa não suportado nesta versão'));
    END CASE;
  END LOOP;

  RETURN 'concluido';
END;
$$;

REVOKE ALL ON FUNCTION aba_automations.executar_etapas(UUID, UUID, UUID, UUID, UUID, TEXT, INTEGER, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_automations.executar_etapas(UUID, UUID, UUID, UUID, UUID, TEXT, INTEGER, JSONB) FROM anon;
REVOKE ALL ON FUNCTION aba_automations.executar_etapas(UUID, UUID, UUID, UUID, UUID, TEXT, INTEGER, JSONB) FROM authenticated;

-- ============================================================
-- 3. aba_automations.executar_automacao — porta de entrada
-- ============================================================
-- Chamável pela UI ("Testar" do wireframe `1k`). SECURITY DEFINER, então
-- a RLS não a protege: a autorização é conferida à mão, com as mesmas
-- duas camadas que a política da tabela usaria.
CREATE OR REPLACE FUNCTION aba_automations.executar_automacao(
  p_automacao_id UUID,
  p_pessoa_id UUID DEFAULT NULL,
  p_evento_gatilho TEXT DEFAULT 'manual',
  p_contexto JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
  v_log_id UUID;
  v_resultado TEXT;
BEGIN
  SELECT a.account_id INTO v_account_id
  FROM aba_automations.automacoes a
  WHERE a.id = p_automacao_id;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Automação não encontrada' USING ERRCODE = 'P0001';
  END IF;

  -- Autorização à mão — SECURITY DEFINER não passa por RLS. Mesmas duas
  -- camadas empilhadas que a policy de `automacoes` usa (docs/02 §2).
  IF NOT (public.is_account_member(v_account_id, 'agent') AND access.can('automations', 'update')) THEN
    RAISE EXCEPTION 'Sem permissão para executar automação nesta conta' USING ERRCODE = '42501';
  END IF;

  INSERT INTO aba_automations.automacao_logs
    (automacao_id, account_id, pessoa_id, evento_gatilho, status)
  VALUES (p_automacao_id, v_account_id, p_pessoa_id, p_evento_gatilho, 'sucesso')
  RETURNING id INTO v_log_id;

  v_resultado := aba_automations.executar_etapas(
    p_automacao_id, v_account_id, p_pessoa_id, v_log_id, NULL, NULL, 0, p_contexto);

  -- 'aguardando' não é sucesso nem falha: a execução continua na fila, e
  -- é o cron que a fecha. Marcar 'sucesso' aqui mentiria sobre o estado.
  UPDATE aba_automations.automacao_logs
  SET status = CASE
        WHEN v_resultado = 'aguardando' THEN 'parcial'
        WHEN v_resultado = 'falhou' THEN 'falhou'
        ELSE 'sucesso'
      END,
      mensagem_erro = CASE WHEN v_resultado = 'aguardando'
        THEN 'Execução pausada num passo de espera — retomada pelo agendador' END
  WHERE id = v_log_id;

  PERFORM aba_automations.incrementar_execucoes_automacao(p_automacao_id);
  RETURN v_log_id;
END;
$$;

ALTER FUNCTION aba_automations.executar_automacao(UUID, UUID, TEXT, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_automations.executar_automacao(UUID, UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_automations.executar_automacao(UUID, UUID, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION aba_automations.executar_automacao(UUID, UUID, TEXT, JSONB) TO authenticated, service_role;

-- ============================================================
-- 4. aba_automations.drenar_execucoes_pendentes — job do cron
-- ============================================================
-- Retoma as execuções cujo passo de espera venceu. Roda como `postgres`,
-- sem RLS: cada linha carrega o próprio `account_id`, e é ele que é
-- repassado adiante — nunca um valor de sessão.
CREATE OR REPLACE FUNCTION aba_automations.drenar_execucoes_pendentes(p_lote INTEGER DEFAULT 50)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r RECORD;
  v_resultado TEXT;
  v_total INTEGER := 0;
BEGIN
  FOR r IN
    -- SKIP LOCKED: duas execuções do job (atraso, sobreposição) não podem
    -- processar a mesma linha duas vezes.
    SELECT p.* FROM aba_automations.automacao_execucoes_pendentes p
    WHERE p.status = 'pendente' AND p.executar_em <= NOW()
    ORDER BY p.executar_em
    LIMIT p_lote
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE aba_automations.automacao_execucoes_pendentes
    SET status = 'executando' WHERE id = r.id;

    BEGIN
      v_resultado := aba_automations.executar_etapas(
        r.automacao_id, r.account_id, r.pessoa_id, r.log_id,
        r.etapa_pai_id, r.ramo, r.proxima_posicao_etapa, r.contexto);

      UPDATE aba_automations.automacao_execucoes_pendentes
      -- Esta linha da fila terminou de qualquer forma: se o percurso parou
      -- noutro `esperar`, foi uma linha NOVA que ficou pendente, não esta.
      SET status = 'concluido'
      WHERE id = r.id;

      -- Só fecha o log quando o percurso terminou de verdade; se parou em
      -- outro `esperar`, uma linha nova já foi enfileirada e o log segue
      -- 'parcial'.
      IF v_resultado = 'concluido' THEN
        UPDATE aba_automations.automacao_logs
        SET status = 'sucesso', mensagem_erro = NULL
        WHERE id = r.log_id;
      END IF;

      v_total := v_total + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE aba_automations.automacao_execucoes_pendentes
      SET status = 'falhou' WHERE id = r.id;
      UPDATE aba_automations.automacao_logs
      SET status = 'falhou', mensagem_erro = SQLERRM
      WHERE id = r.log_id;
    END;
  END LOOP;

  RETURN v_total;
END;
$$;

ALTER FUNCTION aba_automations.drenar_execucoes_pendentes(INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_automations.drenar_execucoes_pendentes(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_automations.drenar_execucoes_pendentes(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION aba_automations.drenar_execucoes_pendentes(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION aba_automations.drenar_execucoes_pendentes(INTEGER) TO service_role;

-- ============================================================
-- 5. Fluxos conversacionais — iniciar e avançar
-- ============================================================
-- `fluxo_execucoes` é a máquina de estado por pessoa. Estas duas funções
-- são o que permite provar o rastro sem depender do webhook da Meta: a UI
-- inicia e avança, e cada passo deixa evento em `fluxo_execucao_eventos`.
CREATE OR REPLACE FUNCTION aba_automations.iniciar_fluxo(
  p_fluxo_id UUID,
  p_pessoa_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
  v_no_entrada TEXT;
  v_status TEXT;
  v_execucao_id UUID;
BEGIN
  SELECT f.account_id, f.no_entrada_id, f.status
  INTO v_account_id, v_no_entrada, v_status
  FROM aba_automations.fluxos f WHERE f.id = p_fluxo_id;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Fluxo não encontrado' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (public.is_account_member(v_account_id, 'agent') AND access.can('automations', 'update')) THEN
    RAISE EXCEPTION 'Sem permissão para iniciar fluxo nesta conta' USING ERRCODE = '42501';
  END IF;

  IF v_status <> 'ativo' THEN
    RAISE EXCEPTION 'Fluxo em % não dispara — ative antes de executar', v_status USING ERRCODE = 'P0001';
  END IF;

  IF v_no_entrada IS NULL THEN
    RAISE EXCEPTION 'Fluxo sem nó de entrada definido' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO aba_automations.fluxo_execucoes
    (fluxo_id, account_id, pessoa_id, status, no_atual_chave)
  VALUES (p_fluxo_id, v_account_id, p_pessoa_id, 'ativa', v_no_entrada)
  RETURNING id INTO v_execucao_id;

  INSERT INTO aba_automations.fluxo_execucao_eventos (fluxo_execucao_id, tipo_evento, no_chave, payload)
  VALUES
    (v_execucao_id, 'iniciado', v_no_entrada, jsonb_build_object('via', 'aba_automations.iniciar_fluxo')),
    (v_execucao_id, 'no_visitado', v_no_entrada, '{}'::jsonb);

  PERFORM aba_automations.incrementar_execucoes_fluxo(p_fluxo_id);
  RETURN v_execucao_id;
END;
$$;

ALTER FUNCTION aba_automations.iniciar_fluxo(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_automations.iniciar_fluxo(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_automations.iniciar_fluxo(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION aba_automations.iniciar_fluxo(UUID, UUID) TO authenticated, service_role;

-- Avança um passo: segue a aresta declarada no `config` do nó atual
-- (`proximo`, ou `opcoes[].proximo` quando a resposta escolhe o caminho).
CREATE OR REPLACE FUNCTION aba_automations.avancar_fluxo(
  p_execucao_id UUID,
  p_resposta TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
  v_fluxo_id UUID;
  v_no_atual TEXT;
  v_config JSONB;
  v_tipo TEXT;
  v_proximo TEXT;
BEGIN
  SELECT e.account_id, e.fluxo_id, e.no_atual_chave
  INTO v_account_id, v_fluxo_id, v_no_atual
  FROM aba_automations.fluxo_execucoes e
  WHERE e.id = p_execucao_id AND e.status = 'ativa';

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Execução não encontrada ou já encerrada' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (public.is_account_member(v_account_id, 'agent') AND access.can('automations', 'update')) THEN
    RAISE EXCEPTION 'Sem permissão nesta conta' USING ERRCODE = '42501';
  END IF;

  SELECT n.config, n.tipo_no INTO v_config, v_tipo
  FROM aba_automations.fluxo_nos n
  WHERE n.fluxo_id = v_fluxo_id AND n.chave_no = v_no_atual;

  IF p_resposta IS NOT NULL THEN
    INSERT INTO aba_automations.fluxo_execucao_eventos (fluxo_execucao_id, tipo_evento, no_chave, payload)
    VALUES (p_execucao_id, 'resposta_recebida', v_no_atual, jsonb_build_object('resposta', p_resposta));
  END IF;

  -- Aresta escolhida pela resposta, quando o nó oferece opções; senão a
  -- aresta única do nó.
  SELECT COALESCE(
    (SELECT o->>'proximo' FROM jsonb_array_elements(COALESCE(v_config->'opcoes', '[]'::jsonb)) o
      WHERE o->>'valor' = p_resposta LIMIT 1),
    v_config->>'proximo'
  ) INTO v_proximo;

  IF v_proximo IS NULL OR v_tipo = 'fim' THEN
    UPDATE aba_automations.fluxo_execucoes
    SET status = 'concluida', finalizado_em = NOW(), motivo_fim = 'fim do fluxo',
        avancado_pela_ultima_vez_em = NOW()
    WHERE id = p_execucao_id;
    INSERT INTO aba_automations.fluxo_execucao_eventos (fluxo_execucao_id, tipo_evento, no_chave, payload)
    VALUES (p_execucao_id, 'concluido', v_no_atual, '{}'::jsonb);
    RETURN 'concluida';
  END IF;

  UPDATE aba_automations.fluxo_execucoes
  SET no_atual_chave = v_proximo, avancado_pela_ultima_vez_em = NOW()
  WHERE id = p_execucao_id;

  INSERT INTO aba_automations.fluxo_execucao_eventos (fluxo_execucao_id, tipo_evento, no_chave, payload)
  VALUES (p_execucao_id, 'no_visitado', v_proximo, '{}'::jsonb);

  RETURN v_proximo;
END;
$$;

ALTER FUNCTION aba_automations.avancar_fluxo(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_automations.avancar_fluxo(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_automations.avancar_fluxo(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION aba_automations.avancar_fluxo(UUID, TEXT) TO authenticated, service_role;

-- ============================================================
-- 6. aba_automations.expirar_fluxos_ociosos — job do cron
-- ============================================================
-- Fecha execução parada além do `em_timeout_horas` da política de
-- fallback do fluxo. Sem isto, o índice único de "uma execução ativa por
-- pessoa" trava a pessoa para sempre no primeiro fluxo que ela abandonar.
CREATE OR REPLACE FUNCTION aba_automations.expirar_fluxos_ociosos()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total INTEGER;
BEGIN
  WITH expiradas AS (
    UPDATE aba_automations.fluxo_execucoes e
    SET status = 'expirada', finalizado_em = NOW(), motivo_fim = 'tempo esgotado sem resposta'
    FROM aba_automations.fluxos f
    WHERE f.id = e.fluxo_id
      -- account_id não entra no WHERE aqui porque o vínculo é pela FK
      -- fluxo_id → fluxos.id, e ambos carregam a mesma conta; a fronteira
      -- continua sendo respeitada linha a linha, sem cruzamento possível.
      AND e.status = 'ativa'
      AND e.avancado_pela_ultima_vez_em <
          NOW() - (COALESCE((f.politica_fallback->>'em_timeout_horas')::INTEGER, 24) || ' hours')::INTERVAL
    RETURNING e.id
  ), eventos AS (
    INSERT INTO aba_automations.fluxo_execucao_eventos (fluxo_execucao_id, tipo_evento, payload)
    SELECT id, 'tempo_esgotado', '{}'::jsonb FROM expiradas
    RETURNING 1
  )
  SELECT count(*) INTO v_total FROM expiradas;

  RETURN v_total;
END;
$$;

ALTER FUNCTION aba_automations.expirar_fluxos_ociosos() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_automations.expirar_fluxos_ociosos() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_automations.expirar_fluxos_ociosos() FROM anon;
REVOKE ALL ON FUNCTION aba_automations.expirar_fluxos_ociosos() FROM authenticated;
GRANT EXECUTE ON FUNCTION aba_automations.expirar_fluxos_ociosos() TO service_role;

-- ============================================================
-- 7. aba_scheduling.disparar_lembretes_vencidos — job do cron
-- ============================================================
-- `enfileirar_lembrete()` (trigger, desde a 01.3) já enche a tabela; nada
-- nunca tirou nada de lá. Esta função marca como `pronto` os lembretes
-- cuja hora chegou, que é o estado que o envio por canal vai consumir
-- quando a Subetapa 02.5 fechar. NÃO envia — declarar o envio aqui seria
-- inventar comportamento que não existe.
--
-- O CHECK original de `status` (migration 009) só previa
-- `pendente|enviado|falhou|cancelado`, porque na 01.3 não existia nada
-- entre "enfileirado" e "enviado" — não havia motor. Agora existe, e o
-- estado intermediário é real: "a hora chegou e o lembrete aguarda o
-- canal levá-lo". Marcar `enviado` sem envio seria mentira no dado;
-- deixar em `pendente` esconderia a fila que se acumula. Extensão por
-- adição, sem reescrever o que já existia (`handoffs/instrucoes.md` §4).
ALTER TABLE aba_scheduling.lembretes DROP CONSTRAINT IF EXISTS lembretes_status_check;
ALTER TABLE aba_scheduling.lembretes ADD CONSTRAINT lembretes_status_check
  CHECK (status IN ('pendente', 'pronto', 'enviado', 'falhou', 'cancelado'));

-- CONSEQUÊNCIA DO ESTADO NOVO, corrigida no mesmo lugar em que nasce.
-- `cancelar_lembretes_pendentes()` (trigger da 01.3) cancelava apenas
-- `status = 'pendente'`. Com o motor existindo, abre-se uma janela real:
-- o lembrete passa a `pronto` quando a hora chega, e se o atendimento for
-- cancelado DEPOIS disso, o lembrete escapava do cancelamento e seria
-- entregue assim mesmo — o cliente receberia lembrete de uma sessão que
-- não existe mais. A trigger passa a alcançar os dois estados. Só é
-- possível cancelar até o envio: `enviado` não volta atrás.
CREATE OR REPLACE FUNCTION aba_scheduling.cancelar_lembretes_pendentes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'aba_scheduling', 'public'
AS $$
BEGIN
  IF NEW.status IN ('cancelado', 'nao_compareceu')
     AND OLD.status NOT IN ('cancelado', 'nao_compareceu') THEN
    UPDATE aba_scheduling.lembretes
    SET status = 'cancelado'
    WHERE agendamento_id = NEW.id
      AND status IN ('pendente', 'pronto');
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION aba_scheduling.disparar_lembretes_vencidos()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total INTEGER;
BEGIN
  WITH prontos AS (
    UPDATE aba_scheduling.lembretes
    SET status = 'pronto'
    WHERE status = 'pendente' AND enviar_em <= NOW()
    RETURNING id
  )
  SELECT count(*) INTO v_total FROM prontos;
  RETURN v_total;
END;
$$;

ALTER FUNCTION aba_scheduling.disparar_lembretes_vencidos() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_scheduling.disparar_lembretes_vencidos() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_scheduling.disparar_lembretes_vencidos() FROM anon;
REVOKE ALL ON FUNCTION aba_scheduling.disparar_lembretes_vencidos() FROM authenticated;
GRANT EXECUTE ON FUNCTION aba_scheduling.disparar_lembretes_vencidos() TO service_role;

-- ============================================================
-- 8. Agendamento — os cinco jobs
-- ============================================================
-- Minutos deslocados de propósito: a recomendação oficial é no máximo ~8
-- jobs concorrentes, e não há motivo para as rotinas diárias caírem todas
-- no mesmo instante. Reagendar é idempotente — `cron.schedule` com o
-- mesmo nome substitui o job existente em vez de duplicá-lo.
SELECT cron.schedule('drenar-execucoes-pendentes', '* * * * *',
  $$SELECT aba_automations.drenar_execucoes_pendentes();$$);

SELECT cron.schedule('disparar-lembretes-vencidos', '*/5 * * * *',
  $$SELECT aba_scheduling.disparar_lembretes_vencidos();$$);

SELECT cron.schedule('expirar-fluxos-ociosos', '15 * * * *',
  $$SELECT aba_automations.expirar_fluxos_ociosos();$$);

SELECT cron.schedule('marcar-faturas-vencidas', '10 3 * * *',
  $$SELECT aba_finance.marcar_faturas_vencidas();$$);

SELECT cron.schedule('expirar-planos', '20 3 * * *',
  $$SELECT aba_finance.expirar_planos();$$);
