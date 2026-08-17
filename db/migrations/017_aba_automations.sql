-- ============================================================
-- 017_aba_automations.sql — schema aba_automations (automações e
-- fluxos conversacionais)
--
-- Origem: Maximus `006_automations.sql` + `007` (contador atômico) +
-- `010_flows.sql` + `012` (contador atômico) — soltas em `public`,
-- nunca modularizadas, ainda no modelo antigo do fork (`user_id` +
-- `auth.uid() = user_id`, sem RBAC por conta). Traduzidas para o
-- padrão obrigatório de docs/02 §2 (`account_id` +
-- `is_account_member` + `access.can('automations', ação)`) — não é
-- porte 1:1, é redesenho de autorização sobre a mesma lógica de
-- negócio. Mapa de nomes: db/migrations/README.md §5.
--
-- HARDENING APLICADO NA TRADUÇÃO (não estava no original, entra aqui
-- porque a auditoria de RLS de todo o restante do projeto já cobriu
-- esse padrão): `automacao_logs` no Maximus tinha uma política FOR ALL
-- nomeada "Users can view own automation logs" — o nome promete leitura,
-- a política concedia escrita também. Log de auditoria gravado pelo
-- motor (`service_role`) não deveria ser editável/apagável pelo
-- usuário final, mesmo padrão já adotado em `aba_health.log_acesso`
-- (Subetapa 01.4). Aqui nasce só com SELECT para `authenticated`.
--
-- pg_cron ainda NÃO entra nesta migration: o "Wait step" do Maximus
-- dependia de um endpoint Next.js pingado por scheduler externo
-- (AUTOMATION_CRON_SECRET); o motor que de fato interpreta
-- automacao_etapas/fluxo_nos e drena automacao_execucoes_pendentes é
-- funcionalidade de aplicação (Etapa 02) — instalar um pg_cron que
-- chama uma função de drenagem que ainda não existe não teria efeito
-- e adicionaria uma migration para desfazer depois. Mesma decisão já
-- tomada para os lembretes de aba_scheduling (Subetapa 01.3): esta
-- migration só cria a estrutura de fila, quem drena é a Etapa 02.
--
-- pessoa_id (nunca contact_id) em automacao_logs/automacao_execucoes_
-- pendentes/fluxo_execucoes — mesma razão da Qualidade da Subetapa
-- 01.5 para aba_sales.oportunidades: aba_people.pessoas é a
-- identidade única, não faz sentido reintroduzir uma referência a
-- contato de canal aqui.
--
-- conversa_id / ultima_mensagem_prompt_id ficam UUID sem REFERENCES:
-- aba_messaging só é aplicado na Subetapa 01.6, depois deste schema
-- (db/migrations/README.md, ordem de aplicação) — mesmo padrão de FK
-- ausente por dependência de módulo opcional já usado em
-- aba_people.pessoas.contato_id e nas colunas de mensagem de
-- aba_scheduling/aba_finance.
--
-- RLS no padrão obrigatório de docs/02 §2, module_key = 'automations'
-- (já seedado em access.modules desde 003_core_access.sql).
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS aba_automations;

CREATE OR REPLACE FUNCTION aba_automations.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION aba_automations.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_automations.set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION aba_automations.set_updated_at() FROM authenticated;

-- ============================================================
-- Automações (gatilho → passos determinísticos)
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_automations.automacoes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id              UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  criado_por              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome                    TEXT NOT NULL,
  descricao               TEXT,
  tipo_gatilho            TEXT NOT NULL,
  config_gatilho          JSONB NOT NULL DEFAULT '{}'::jsonb,
  ativo                   BOOLEAN NOT NULL DEFAULT FALSE,
  contador_execucoes      INTEGER NOT NULL DEFAULT 0,
  executado_pela_ultima_vez_em TIMESTAMPTZ,
  criado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_automacoes_account ON aba_automations.automacoes(account_id);
-- Caminho quente do motor: achar automações ativas cujo tipo_gatilho
-- casa com o evento disparado. RLS depois estreita por account_id.
CREATE INDEX IF NOT EXISTS idx_automacoes_ativo_gatilho
  ON aba_automations.automacoes(tipo_gatilho) WHERE ativo;

ALTER TABLE aba_automations.automacoes ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_automations.automacoes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_automations.automacoes
  FOR EACH ROW EXECUTE FUNCTION aba_automations.set_updated_at();

DROP POLICY IF EXISTS automacoes_select ON aba_automations.automacoes;
CREATE POLICY automacoes_select ON aba_automations.automacoes FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('automations', 'read'));
DROP POLICY IF EXISTS automacoes_insert ON aba_automations.automacoes;
CREATE POLICY automacoes_insert ON aba_automations.automacoes FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('automations', 'create'));
DROP POLICY IF EXISTS automacoes_update ON aba_automations.automacoes;
CREATE POLICY automacoes_update ON aba_automations.automacoes FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('automations', 'update'));
DROP POLICY IF EXISTS automacoes_delete ON aba_automations.automacoes;
CREATE POLICY automacoes_delete ON aba_automations.automacoes FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('automations', 'delete'));

-- ============================================================
-- Etapas da automação — árvore com ramificação (condição sim/não)
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_automations.automacao_etapas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automacao_id   UUID NOT NULL REFERENCES aba_automations.automacoes(id) ON DELETE CASCADE,
  -- NULL para etapa de raiz; id da etapa "condição" para etapas que
  -- vivem dentro de um dos ramos dela.
  etapa_pai_id   UUID REFERENCES aba_automations.automacao_etapas(id) ON DELETE CASCADE,
  ramo           TEXT CHECK (ramo IN ('sim', 'nao')),
  tipo_etapa     TEXT NOT NULL,
  config_etapa   JSONB NOT NULL DEFAULT '{}'::jsonb,
  posicao        INTEGER NOT NULL,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_automacao_etapas_automacao
  ON aba_automations.automacao_etapas(automacao_id, posicao);
CREATE INDEX IF NOT EXISTS idx_automacao_etapas_pai
  ON aba_automations.automacao_etapas(etapa_pai_id) WHERE etapa_pai_id IS NOT NULL;

ALTER TABLE aba_automations.automacao_etapas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automacao_etapas_select ON aba_automations.automacao_etapas;
CREATE POLICY automacao_etapas_select ON aba_automations.automacao_etapas FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM aba_automations.automacoes a WHERE a.id = automacao_etapas.automacao_id
      AND public.is_account_member(a.account_id, 'viewer') AND access.can('automations', 'read')
  ));
DROP POLICY IF EXISTS automacao_etapas_modify ON aba_automations.automacao_etapas;
CREATE POLICY automacao_etapas_modify ON aba_automations.automacao_etapas FOR ALL
  USING (EXISTS (
    SELECT 1 FROM aba_automations.automacoes a WHERE a.id = automacao_etapas.automacao_id
      AND public.is_account_member(a.account_id, 'agent') AND access.can('automations', 'update')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM aba_automations.automacoes a WHERE a.id = automacao_etapas.automacao_id
      AND public.is_account_member(a.account_id, 'agent') AND access.can('automations', 'update')
  ));

-- ============================================================
-- Log de execução — auditoria gravada pelo motor (service_role), nunca
-- editável pelo usuário final. Ver cabeçalho: o Maximus original
-- concedia FOR ALL por engano num policy nomeado "view own"; aqui
-- nasce corrigido, só SELECT para authenticated.
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_automations.automacao_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automacao_id     UUID NOT NULL REFERENCES aba_automations.automacoes(id) ON DELETE CASCADE,
  account_id       UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  -- SET NULL, não CASCADE: apagar a pessoa não pode apagar o
  -- histórico de execução (mesmo padrão do Maximus para contact_id).
  pessoa_id        UUID REFERENCES aba_people.pessoas(id) ON DELETE SET NULL,
  evento_gatilho   TEXT NOT NULL,
  etapas_executadas JSONB NOT NULL DEFAULT '[]'::jsonb,
  status           TEXT NOT NULL CHECK (status IN ('sucesso', 'parcial', 'falhou')),
  mensagem_erro    TEXT,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_automacao_logs_automacao
  ON aba_automations.automacao_logs(automacao_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_automacao_logs_account ON aba_automations.automacao_logs(account_id);

ALTER TABLE aba_automations.automacao_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automacao_logs_select ON aba_automations.automacao_logs;
CREATE POLICY automacao_logs_select ON aba_automations.automacao_logs FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('automations', 'read'));
-- Sem policy de INSERT/UPDATE/DELETE para authenticated: o motor
-- grava com service_role, que bypassa RLS por natureza.

-- ============================================================
-- Execuções pendentes — fila do "wait step". Motor lê run_at <= now()
-- e status = 'pendente', avança a partir de proxima_posicao_etapa com
-- o contexto salvo. service_role apenas — nenhuma escrita vem do
-- navegador (mesmo padrão do original, sem policy nenhuma para
-- authenticated).
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_automations.automacao_execucoes_pendentes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automacao_id          UUID NOT NULL REFERENCES aba_automations.automacoes(id) ON DELETE CASCADE,
  account_id            UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  pessoa_id             UUID REFERENCES aba_people.pessoas(id) ON DELETE SET NULL,
  log_id                UUID REFERENCES aba_automations.automacao_logs(id) ON DELETE CASCADE,
  etapa_pai_id          UUID REFERENCES aba_automations.automacao_etapas(id) ON DELETE SET NULL,
  ramo                  TEXT CHECK (ramo IN ('sim', 'nao')),
  proxima_posicao_etapa INTEGER NOT NULL,
  contexto              JSONB NOT NULL DEFAULT '{}'::jsonb,
  status                TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'executando', 'concluido', 'falhou')),
  executar_em           TIMESTAMPTZ NOT NULL,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_automacao_execucoes_pendentes_vencidas
  ON aba_automations.automacao_execucoes_pendentes(executar_em) WHERE status = 'pendente';

ALTER TABLE aba_automations.automacao_execucoes_pendentes ENABLE ROW LEVEL SECURITY;
-- Sem nenhuma policy para authenticated — acesso só via service_role,
-- igual ao original.

-- ============================================================
-- incrementar_execucoes_automacao() — incremento atômico de contador
-- (Maximus 007): evita a corrida leitura-modificação-escrita de duas
-- automações disparando no mesmo segundo.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_automations.incrementar_execucoes_automacao(p_automacao_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE aba_automations.automacoes
  SET
    contador_execucoes = contador_execucoes + 1,
    executado_pela_ultima_vez_em = NOW()
  WHERE id = p_automacao_id;
$$;

REVOKE ALL ON FUNCTION aba_automations.incrementar_execucoes_automacao(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_automations.incrementar_execucoes_automacao(UUID) FROM anon;
REVOKE ALL ON FUNCTION aba_automations.incrementar_execucoes_automacao(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION aba_automations.incrementar_execucoes_automacao(UUID) TO service_role;

-- ============================================================
-- Fluxos conversacionais — bot de WhatsApp com estado, ramificado
-- (Maximus 010_flows.sql). Arestas vivem DENTRO do config JSONB de
-- cada nó (não em tabela própria): o motor só precisa "dado o nó
-- atual, para onde vai a resposta Y" — busca de uma linha só, com o
-- JSON já na própria linha.
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_automations.fluxos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  criado_por         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome               TEXT NOT NULL,
  descricao          TEXT,
  status             TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'ativo', 'arquivado')),
  tipo_gatilho       TEXT NOT NULL CHECK (tipo_gatilho IN ('palavra_chave', 'primeira_mensagem_recebida', 'manual')),
  config_gatilho     JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Referencia fluxo_nos.chave_no (string, não o UUID). NULL enquanto
  -- em rascunho; exigido antes de ativar (validado pela aplicação na
  -- Etapa 02, não no banco, para rascunho poder salvar incompleto).
  no_entrada_id      TEXT,
  politica_fallback  JSONB NOT NULL DEFAULT
    '{"em_resposta_desconhecida":"repetir","maximo_repeticoes":2,"em_timeout_horas":24,"ao_esgotar":"encaminhar"}'::jsonb,
  contador_execucoes INTEGER NOT NULL DEFAULT 0,
  executado_pela_ultima_vez_em TIMESTAMPTZ,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fluxos_ativo_gatilho
  ON aba_automations.fluxos(account_id, tipo_gatilho) WHERE status = 'ativo';

ALTER TABLE aba_automations.fluxos ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_automations.fluxos;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_automations.fluxos
  FOR EACH ROW EXECUTE FUNCTION aba_automations.set_updated_at();

DROP POLICY IF EXISTS fluxos_select ON aba_automations.fluxos;
CREATE POLICY fluxos_select ON aba_automations.fluxos FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('automations', 'read'));
DROP POLICY IF EXISTS fluxos_insert ON aba_automations.fluxos;
CREATE POLICY fluxos_insert ON aba_automations.fluxos FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('automations', 'create'));
DROP POLICY IF EXISTS fluxos_update ON aba_automations.fluxos;
CREATE POLICY fluxos_update ON aba_automations.fluxos FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('automations', 'update'));
DROP POLICY IF EXISTS fluxos_delete ON aba_automations.fluxos;
CREATE POLICY fluxos_delete ON aba_automations.fluxos FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('automations', 'delete'));

CREATE TABLE IF NOT EXISTS aba_automations.fluxo_nos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fluxo_id     UUID NOT NULL REFERENCES aba_automations.fluxos(id) ON DELETE CASCADE,
  chave_no     TEXT NOT NULL,
  tipo_no      TEXT NOT NULL CHECK (tipo_no IN (
    'inicio', 'enviar_botoes', 'enviar_lista', 'enviar_mensagem',
    'coletar_entrada', 'condicao', 'definir_tag', 'encaminhar',
    'buscar_http', 'fim'
  )),
  config       JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Reservado para o editor visual (canvas) da Etapa 02. Editor em
  -- lista v1 deixa os dois em 0.
  posicao_x    INTEGER NOT NULL DEFAULT 0,
  posicao_y    INTEGER NOT NULL DEFAULT 0,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fluxo_id, chave_no)
);
CREATE INDEX IF NOT EXISTS idx_fluxo_nos_fluxo ON aba_automations.fluxo_nos(fluxo_id);

ALTER TABLE aba_automations.fluxo_nos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fluxo_nos_select ON aba_automations.fluxo_nos;
CREATE POLICY fluxo_nos_select ON aba_automations.fluxo_nos FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM aba_automations.fluxos f WHERE f.id = fluxo_nos.fluxo_id
      AND public.is_account_member(f.account_id, 'viewer') AND access.can('automations', 'read')
  ));
DROP POLICY IF EXISTS fluxo_nos_modify ON aba_automations.fluxo_nos;
CREATE POLICY fluxo_nos_modify ON aba_automations.fluxo_nos FOR ALL
  USING (EXISTS (
    SELECT 1 FROM aba_automations.fluxos f WHERE f.id = fluxo_nos.fluxo_id
      AND public.is_account_member(f.account_id, 'agent') AND access.can('automations', 'update')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM aba_automations.fluxos f WHERE f.id = fluxo_nos.fluxo_id
      AND public.is_account_member(f.account_id, 'agent') AND access.can('automations', 'update')
  ));

-- ============================================================
-- Execuções de fluxo — máquina de estado por pessoa em tempo real.
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_automations.fluxo_execucoes (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fluxo_id                 UUID NOT NULL REFERENCES aba_automations.fluxos(id) ON DELETE CASCADE,
  account_id               UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  pessoa_id                UUID REFERENCES aba_people.pessoas(id) ON DELETE SET NULL,
  -- Sem FK — aba_messaging.conversas só existe na Subetapa 01.6.
  conversa_id              UUID,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN (
    'ativa', 'concluida', 'encaminhada', 'expirada', 'pausada_por_agente', 'falhou'
  )),
  no_atual_chave           TEXT,
  -- Sem FK — aba_messaging.mensagens só existe na Subetapa 01.6.
  ultima_mensagem_prompt_id UUID,
  -- Valores de coletar_entrada + respostas de buscar_http. Interpolados
  -- na config dos nós seguintes ao avançar.
  variaveis                JSONB NOT NULL DEFAULT '{}'::jsonb,
  contador_repeticoes      INTEGER NOT NULL DEFAULT 0,
  iniciado_em              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  avancado_pela_ultima_vez_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalizado_em            TIMESTAMPTZ,
  motivo_fim               TEXT
);

-- No máximo uma execução ATIVA por (account_id, pessoa_id) — duas
-- entregas concorrentes do webhook tentando iniciar execução colidem
-- aqui; a segunda falha com 23505 e o motor trata sem lock nenhum.
CREATE UNIQUE INDEX IF NOT EXISTS idx_uma_execucao_ativa_por_pessoa
  ON aba_automations.fluxo_execucoes(account_id, pessoa_id)
  WHERE status = 'ativa';
CREATE INDEX IF NOT EXISTS idx_fluxo_execucoes_ativas_avancadas
  ON aba_automations.fluxo_execucoes(avancado_pela_ultima_vez_em) WHERE status = 'ativa';
CREATE INDEX IF NOT EXISTS idx_fluxo_execucoes_fluxo_iniciado
  ON aba_automations.fluxo_execucoes(fluxo_id, iniciado_em DESC);

ALTER TABLE aba_automations.fluxo_execucoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fluxo_execucoes_select ON aba_automations.fluxo_execucoes;
CREATE POLICY fluxo_execucoes_select ON aba_automations.fluxo_execucoes FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('automations', 'read'));
-- Sem policy de escrita para authenticated: o motor roda com
-- service_role (mesmo padrão de automacao_execucoes_pendentes).

CREATE TABLE IF NOT EXISTS aba_automations.fluxo_execucao_eventos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fluxo_execucao_id UUID NOT NULL REFERENCES aba_automations.fluxo_execucoes(id) ON DELETE CASCADE,
  tipo_evento       TEXT NOT NULL CHECK (tipo_evento IN (
    'iniciado', 'no_visitado', 'mensagem_enviada', 'resposta_recebida',
    'fallback_acionado', 'encaminhado', 'tempo_esgotado', 'erro', 'concluido'
  )),
  no_chave          TEXT,
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fluxo_execucao_eventos_execucao_tipo
  ON aba_automations.fluxo_execucao_eventos(fluxo_execucao_id, tipo_evento);
CREATE INDEX IF NOT EXISTS idx_fluxo_execucao_eventos_execucao_tempo
  ON aba_automations.fluxo_execucao_eventos(fluxo_execucao_id, criado_em DESC);

ALTER TABLE aba_automations.fluxo_execucao_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fluxo_execucao_eventos_select ON aba_automations.fluxo_execucao_eventos;
CREATE POLICY fluxo_execucao_eventos_select ON aba_automations.fluxo_execucao_eventos FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM aba_automations.fluxo_execucoes e WHERE e.id = fluxo_execucao_eventos.fluxo_execucao_id
      AND public.is_account_member(e.account_id, 'viewer') AND access.can('automations', 'read')
  ));

CREATE OR REPLACE FUNCTION aba_automations.incrementar_execucoes_fluxo(p_fluxo_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE aba_automations.fluxos
  SET
    contador_execucoes = contador_execucoes + 1,
    executado_pela_ultima_vez_em = NOW()
  WHERE id = p_fluxo_id;
$$;

REVOKE ALL ON FUNCTION aba_automations.incrementar_execucoes_fluxo(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_automations.incrementar_execucoes_fluxo(UUID) FROM anon;
REVOKE ALL ON FUNCTION aba_automations.incrementar_execucoes_fluxo(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION aba_automations.incrementar_execucoes_fluxo(UUID) TO service_role;

-- ============================================================
-- GRANT estreito + ALTER DEFAULT PRIVILEGES — mesmo padrão de
-- 008/009/010/013/016.
-- ============================================================
GRANT USAGE ON SCHEMA aba_automations TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA aba_automations TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA aba_automations TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_automations
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_automations
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_automations
  GRANT ALL ON TABLES TO service_role;
