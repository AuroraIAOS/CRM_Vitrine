-- ============================================================
-- 028_aba_ai_permissoes_agente.sql — comportamento do agente (02.11)
--
-- A tela `1l` do wireframe mostra um card "Comportamento" com instrução,
-- modelo, horário de atuação e **quatro interruptores de permissão**:
-- consultar horários livres, criar agendamento, ler prontuário e conceder
-- desconto. `aba_ai.ia_configuracoes` (migration 018) não tinha onde
-- guardar nenhum dos quatro. Esta migration acrescenta.
--
-- O QUE OS INTERRUPTORES FAZEM NESTA VERSÃO
--
-- O agente desta subetapa **responde texto** — rascunho e resposta
-- fundamentados na base de conhecimento da conta. Ele não executa ação
-- no CRM. Portanto os interruptores **modulam as instruções enviadas ao
-- provedor**: ligado vira permissão explícita no prompt de sistema,
-- desligado vira proibição explícita. Isso é real e verificável (o texto
-- enviado muda), e é honesto sobre o que é: instrução, não trava.
--
-- POR QUE `pode_ler_prontuario` NASCE TRAVADO EM FALSE
--
-- Porque instrução em prompt **não protege dado clínico**. O que protege
-- é não entregar o dado. Se a Edge Function lesse `aba_health` para
-- montar o contexto do agente, leria com `service_role` — que ignora RLS
-- por natureza —, portanto **sem passar por `aba_health.pode_acessar()`
-- e sem gravar `aba_health.log_acesso`**. Isso quebraria de uma vez as
-- duas garantias que a Subetapa 02.9 construiu e que o `CLAUDE.md` §5
-- declara sem exceção ("o schema health tem regime próprio de RLS, mais
-- restritivo — nenhuma exceção nele, por nenhum motivo").
--
-- O wireframe já desenha este interruptor **desligado**, e o de desconto
-- também. Aqui o desligado do prontuário vira garantia de banco: um
-- CHECK. Ligar deixa de ser um clique e passa a exigir uma migration
-- deliberada — que só deve existir junto com o caminho auditado (leitura
-- pelas funções `ler_*()`, com ator identificável no log, o que hoje não
-- existe para um agente automático). Decisão de Max, não de código.
--
-- `pode_conceder_desconto` NÃO é travado: fica ligável e vira instrução.
-- Desconto prometido por engano é problema comercial, reversível por
-- conversa; prontuário lido sem log é problema jurídico e irreversível.
-- Riscos diferentes, tratamentos diferentes.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

ALTER TABLE aba_ai.ia_configuracoes
  ADD COLUMN IF NOT EXISTS pode_consultar_horarios  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pode_criar_agendamento   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pode_ler_prontuario      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pode_conceder_desconto   BOOLEAN NOT NULL DEFAULT FALSE,
  -- Horário em que o agente atua sozinho. Fora dele, a conversa espera
  -- humano. Texto livre nesta versão (o wireframe mostra "24h · humano
  -- 08–18h"); vira estrutura quando houver escalonamento por turno.
  ADD COLUMN IF NOT EXISTS horario_atuacao          TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'aba_ai.ia_configuracoes'::regclass
      AND conname = 'ia_configuracoes_prontuario_sempre_negado'
  ) THEN
    ALTER TABLE aba_ai.ia_configuracoes
      ADD CONSTRAINT ia_configuracoes_prontuario_sempre_negado
      CHECK (pode_ler_prontuario = FALSE);
  END IF;
END $$;

COMMENT ON COLUMN aba_ai.ia_configuracoes.pode_ler_prontuario IS
  'Travado em FALSE pelo CHECK ia_configuracoes_prontuario_sempre_negado (migration 028). Agente automático lê com service_role, que ignora RLS — leria aba_health sem pode_acessar() e sem log_acesso. Destravar exige migration deliberada E o caminho auditado de leitura clínica. Ver CLAUDE.md §5.';
COMMENT ON COLUMN aba_ai.ia_configuracoes.pode_conceder_desconto IS
  'Instrução enviada ao provedor no prompt de sistema, não trava de execução — o agente desta versão só produz texto.';

-- ============================================================
-- aba_ai.resumo_uso_ia() — as métricas do topo da tela `1l`
-- ============================================================
-- `ia_log_uso` só tem policy de SELECT para `admin+`; esta função existe
-- para a tela não ter de agregar no navegador o log inteiro do mês.
-- SECURITY INVOKER de propósito: assim a RLS de `ia_log_uso` continua
-- valendo e a função não precisa reafirmar a fronteira à mão — quem não
-- pode ler o log recebe zeros, não o resumo de outra conta. Mesmo
-- raciocínio de `buscar_conhecimento_textual()` (migration 018).
CREATE OR REPLACE FUNCTION aba_ai.resumo_uso_ia(p_dias INTEGER DEFAULT 30)
RETURNS TABLE (
  chamadas          BIGINT,
  tokens_prompt     BIGINT,
  tokens_resposta   BIGINT,
  tokens_total      BIGINT,
  conversas_unicas  BIGINT,
  respostas_automaticas BIGINT,
  rascunhos         BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    count(*)::BIGINT,
    COALESCE(sum(l.tokens_prompt), 0)::BIGINT,
    COALESCE(sum(l.tokens_resposta), 0)::BIGINT,
    COALESCE(sum(l.tokens_total), 0)::BIGINT,
    count(DISTINCT l.conversa_id)::BIGINT,
    count(*) FILTER (WHERE l.modo = 'resposta_automatica')::BIGINT,
    count(*) FILTER (WHERE l.modo = 'rascunho')::BIGINT
  FROM aba_ai.ia_log_uso l
  WHERE l.criado_em >= NOW() - (GREATEST(p_dias, 1) || ' days')::INTERVAL;
$$;

REVOKE ALL ON FUNCTION aba_ai.resumo_uso_ia(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_ai.resumo_uso_ia(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION aba_ai.resumo_uso_ia(INTEGER) TO authenticated, service_role;

-- ============================================================
-- Confirma que as colunas novas NÃO são segredo — e que a chave continua
-- sendo
-- ============================================================
-- `chave_api` teve `SELECT` revogado para `authenticated` na migration
-- 022 (achado A05 do portão adversarial). As colunas acrescentadas aqui
-- são configuração visível de propósito: a tela precisa desenhar o
-- estado de cada interruptor. Reafirmar o GRANT delas explicitamente
-- deixa claro que a fronteira continua sendo só a chave — e evita que
-- alguém, ao ler o catálogo, conclua que o narrowing cobre a tabela
-- inteira.
GRANT SELECT (pode_consultar_horarios, pode_criar_agendamento,
              pode_ler_prontuario, pode_conceder_desconto, horario_atuacao)
  ON aba_ai.ia_configuracoes TO authenticated;
