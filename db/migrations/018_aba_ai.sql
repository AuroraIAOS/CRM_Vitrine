-- ============================================================
-- 018_aba_ai.sql — schema aba_ai (IA bring-your-own-key + base de
-- conhecimento)
--
-- Origem: Maximus `029_ai_reply.sql` + `030_ai_knowledge.sql` +
-- `033_ai_reply_polish.sql` — soltas em `public`, nunca modularizadas.
-- Traduzidas para o padrão obrigatório de docs/02 §2. Mapa de nomes:
-- db/migrations/README.md §6.
--
-- ESCOPO — SEM pgvector nesta subetapa: docs/00_PLANO_E_CRITERIOS.md,
-- "Backlog de versionamento" já decide "pgvector para busca semântica
-- em aba_ai — impacto no MVP? Não — versão alvo +1.0". docs/02 §6
-- confirma: "busca semântica opcional via pgvector — busca textual
-- comum funciona sem extensão nenhuma". Esta migration só traz o
-- caminho lexical (tsvector + ts_rank, exatamente como o Maximus
-- também oferece para conta sem chave de embeddings) — sem
-- `CREATE EXTENSION vector`, sem coluna `embedding`, sem índice HNSW,
-- sem `ia_configuracoes.chave_api_embeddings`. Se `+1.0` trouxer
-- pgvector, entra como `ALTER TABLE ADD COLUMN` sobre esta mesma
-- tabela, sem quebrar nada.
--
-- HARDENING APLICADO NA TRADUÇÃO (não estava no original — o Maximus
-- só descobriu depois, migration 032, GHSA-fg5p-2qc3-jmxr): a função
-- de busca textual nasce direto `SECURITY INVOKER`, nunca
-- `SECURITY DEFINER`. O Maximus criou `match_ai_knowledge_fts` como
-- `SECURITY DEFINER` filtrando só pelo `p_account_id` recebido, sem
-- chamar `is_account_member()` — qualquer usuário autenticado podia
-- ler a base de conhecimento de OUTRA conta passando o `account_id`
-- alheio como parâmetro, porque `SECURITY DEFINER` ignora a RLS da
-- tabela. A correção de lá (032) trocou para `SECURITY INVOKER`, que
-- deixa a RLS de `ia_trechos_conhecimento` (`is_account_member`)
-- realmente filtrar o `authenticated` chamador. Aqui nasce corrigido
-- desde o início — mesma classe de achado que a auditoria adversarial
-- da Etapa 01 (pendência vigiada, docs/00) existe para prevenir.
--
-- chave_api / chave_api / segredo de IA: texto cifrado (AES-256-GCM,
-- `ENCRYPTION_KEY`) gravado/decifrado pela Edge Function da Etapa 02 —
-- o banco só guarda o texto cifrado numa coluna TEXT comum, nunca
-- decifra nada (CLAUDE.md §4). Nenhuma extensão pgcrypto aqui.
--
-- ia_log_uso.conversa_id fica UUID sem REFERENCES: aba_messaging só é
-- aplicado na Subetapa 01.6 — mesmo padrão de FK ausente por
-- dependência de módulo opcional já usado em todo o projeto.
--
-- FORA DESTA SUBETAPA (fica para a 01.6, quando aba_messaging.conversas
-- existir): `claim_ai_reply_slot()` e as colunas de controle de
-- resposta automática por conversa (`ai_autoreply_disabled`,
-- `ai_reply_count`, `ai_handoff_summary` do lado de
-- aba_messaging.conversas; `ai_generated` do lado de
-- aba_messaging.mensagens). `ia_configuracoes` já traz os campos que
-- não dependem de mensageria (interruptor geral, teto de respostas
-- por conversa, encaminhamento) — as colunas físicas na tabela de
-- conversa entram junto com o próprio aba_messaging.
--
-- RLS no padrão settings-class já usado no Maximus (espelha
-- `whatsapp_config`/`webhook_endpoints`): qualquer membro (viewer+)
-- lê a configuração/base de conhecimento — a tela de conversa precisa
-- saber se a IA está ligada —, só admin+ cria/edita/apaga. Uso de
-- token (`ia_log_uso`) é billing-class: só admin+ lê, e não há
-- INSERT/UPDATE/DELETE para `authenticated` — quem grava é a Edge
-- Function com `service_role`.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS aba_ai;

CREATE OR REPLACE FUNCTION aba_ai.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION aba_ai.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_ai.set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION aba_ai.set_updated_at() FROM authenticated;

-- ============================================================
-- Configuração de IA — uma por conta (bring-your-own-key)
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_ai.ia_configuracoes (
  id                                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                            UUID NOT NULL UNIQUE REFERENCES public.accounts(id) ON DELETE CASCADE,
  criado_por                            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provedor                              TEXT NOT NULL CHECK (provedor IN ('openai', 'anthropic')),
  modelo                                TEXT NOT NULL,
  -- Texto cifrado (AES-256-GCM, ENCRYPTION_KEY) — nunca decifrado
  -- no banco. Ver cabeçalho.
  chave_api                             TEXT NOT NULL,
  prompt_sistema                        TEXT,
  ativo                                 BOOLEAN NOT NULL DEFAULT FALSE,
  resposta_automatica_ativa             BOOLEAN NOT NULL DEFAULT FALSE,
  resposta_automatica_max_por_conversa  INTEGER NOT NULL DEFAULT 3
    CHECK (resposta_automatica_max_por_conversa BETWEEN 1 AND 20),
  -- Para onde uma conversa encaminhada vai. NULL = fila compartilhada
  -- (sem responsável definido).
  agente_encaminhamento_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em                             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em                         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE aba_ai.ia_configuracoes ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_ai.ia_configuracoes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_ai.ia_configuracoes
  FOR EACH ROW EXECUTE FUNCTION aba_ai.set_updated_at();

DROP POLICY IF EXISTS ia_configuracoes_select ON aba_ai.ia_configuracoes;
CREATE POLICY ia_configuracoes_select ON aba_ai.ia_configuracoes FOR SELECT
  USING (public.is_account_member(account_id) AND access.can('ai', 'read'));
DROP POLICY IF EXISTS ia_configuracoes_insert ON aba_ai.ia_configuracoes;
CREATE POLICY ia_configuracoes_insert ON aba_ai.ia_configuracoes FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin') AND access.can('ai', 'create'));
DROP POLICY IF EXISTS ia_configuracoes_update ON aba_ai.ia_configuracoes;
CREATE POLICY ia_configuracoes_update ON aba_ai.ia_configuracoes FOR UPDATE
  USING (public.is_account_member(account_id, 'admin') AND access.can('ai', 'update'));
DROP POLICY IF EXISTS ia_configuracoes_delete ON aba_ai.ia_configuracoes;
CREATE POLICY ia_configuracoes_delete ON aba_ai.ia_configuracoes FOR DELETE
  USING (public.is_account_member(account_id, 'admin') AND access.can('ai', 'delete'));

-- ============================================================
-- Base de conhecimento — documentos (FAQ/política/produto) que a IA
-- recupera para fundamentar rascunho e resposta automática.
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_ai.ia_documentos_conhecimento (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  criado_por  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  titulo      TEXT NOT NULL,
  conteudo    TEXT NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ia_documentos_conhecimento_account
  ON aba_ai.ia_documentos_conhecimento(account_id);

ALTER TABLE aba_ai.ia_documentos_conhecimento ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_ai.ia_documentos_conhecimento;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_ai.ia_documentos_conhecimento
  FOR EACH ROW EXECUTE FUNCTION aba_ai.set_updated_at();

DROP POLICY IF EXISTS ia_documentos_conhecimento_select ON aba_ai.ia_documentos_conhecimento;
CREATE POLICY ia_documentos_conhecimento_select ON aba_ai.ia_documentos_conhecimento FOR SELECT
  USING (public.is_account_member(account_id) AND access.can('ai', 'read'));
DROP POLICY IF EXISTS ia_documentos_conhecimento_insert ON aba_ai.ia_documentos_conhecimento;
CREATE POLICY ia_documentos_conhecimento_insert ON aba_ai.ia_documentos_conhecimento FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin') AND access.can('ai', 'create'));
DROP POLICY IF EXISTS ia_documentos_conhecimento_update ON aba_ai.ia_documentos_conhecimento;
CREATE POLICY ia_documentos_conhecimento_update ON aba_ai.ia_documentos_conhecimento FOR UPDATE
  USING (public.is_account_member(account_id, 'admin') AND access.can('ai', 'update'));
DROP POLICY IF EXISTS ia_documentos_conhecimento_delete ON aba_ai.ia_documentos_conhecimento;
CREATE POLICY ia_documentos_conhecimento_delete ON aba_ai.ia_documentos_conhecimento FOR DELETE
  USING (public.is_account_member(account_id, 'admin') AND access.can('ai', 'delete'));

-- ============================================================
-- Trechos — unidade de recuperação. account_id denormalizado do
-- documento para RLS/RPC filtrarem sem join.
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_ai.ia_trechos_conhecimento (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id  UUID NOT NULL REFERENCES aba_ai.ia_documentos_conhecimento(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  indice_trecho INTEGER NOT NULL DEFAULT 0,
  conteudo      TEXT NOT NULL,
  -- Config 'simple' — tokeniza e normaliza sem stemming/stopword
  -- amarrado a um idioma só; o produto é multi-idioma por desenho
  -- (Vitrine clona para clientes de qualquer mercado).
  busca_texto   TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', conteudo)) STORED,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ia_trechos_conhecimento_account
  ON aba_ai.ia_trechos_conhecimento(account_id);
CREATE INDEX IF NOT EXISTS idx_ia_trechos_conhecimento_documento
  ON aba_ai.ia_trechos_conhecimento(documento_id);
CREATE INDEX IF NOT EXISTS idx_ia_trechos_conhecimento_busca
  ON aba_ai.ia_trechos_conhecimento USING gin (busca_texto);

ALTER TABLE aba_ai.ia_trechos_conhecimento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_trechos_conhecimento_select ON aba_ai.ia_trechos_conhecimento;
CREATE POLICY ia_trechos_conhecimento_select ON aba_ai.ia_trechos_conhecimento FOR SELECT
  USING (public.is_account_member(account_id) AND access.can('ai', 'read'));
DROP POLICY IF EXISTS ia_trechos_conhecimento_insert ON aba_ai.ia_trechos_conhecimento;
CREATE POLICY ia_trechos_conhecimento_insert ON aba_ai.ia_trechos_conhecimento FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin') AND access.can('ai', 'create'));
DROP POLICY IF EXISTS ia_trechos_conhecimento_update ON aba_ai.ia_trechos_conhecimento;
CREATE POLICY ia_trechos_conhecimento_update ON aba_ai.ia_trechos_conhecimento FOR UPDATE
  USING (public.is_account_member(account_id, 'admin') AND access.can('ai', 'update'));
DROP POLICY IF EXISTS ia_trechos_conhecimento_delete ON aba_ai.ia_trechos_conhecimento;
CREATE POLICY ia_trechos_conhecimento_delete ON aba_ai.ia_trechos_conhecimento FOR DELETE
  USING (public.is_account_member(account_id, 'admin') AND access.can('ai', 'delete'));

-- ============================================================
-- buscar_conhecimento_textual() — recuperação lexical (ts_rank).
-- SECURITY INVOKER de propósito (ver cabeçalho — hardening contra o
-- achado GHSA-fg5p-2qc3-jmxr do Maximus): a RLS de
-- ia_trechos_conhecimento filtra o chamador authenticated de verdade;
-- um p_account_id alheio devolve conjunto vazio, nunca a base de
-- outra conta. service_role (bot de resposta automática, sem
-- auth.uid()) bypassa RLS por natureza e continua funcionando.
--
-- plainto_tsquery evita injeção de operador de busca a partir de
-- texto cru do cliente.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_ai.buscar_conhecimento_textual(
  p_account_id UUID,
  p_consulta   TEXT,
  p_limite     INTEGER
) RETURNS TABLE (id UUID, conteudo TEXT, relevancia REAL)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT c.id,
         c.conteudo,
         ts_rank(c.busca_texto, plainto_tsquery('simple', p_consulta)) AS relevancia
  FROM aba_ai.ia_trechos_conhecimento c
  WHERE c.account_id = p_account_id
    AND c.busca_texto @@ plainto_tsquery('simple', p_consulta)
  ORDER BY relevancia DESC
  LIMIT GREATEST(p_limite, 0);
$$;

REVOKE ALL ON FUNCTION aba_ai.buscar_conhecimento_textual(UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_ai.buscar_conhecimento_textual(UUID, TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION aba_ai.buscar_conhecimento_textual(UUID, TEXT, INTEGER) TO authenticated, service_role;

-- ============================================================
-- Log de uso — uma linha por chamada ao provedor (rascunho ou
-- resposta automática), para visibilidade de gasto sobre a chave
-- bring-your-own-key da conta. Melhor esforço: quem grava nunca
-- bloqueia uma resposta por causa de um INSERT que falhou.
--
-- conversa_id sem FK — ver cabeçalho (aba_messaging só na 01.6).
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_ai.ia_log_uso (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  conversa_id        UUID,
  modo               TEXT NOT NULL CHECK (modo IN ('resposta_automatica', 'rascunho')),
  provedor           TEXT NOT NULL CHECK (provedor IN ('openai', 'anthropic')),
  modelo             TEXT NOT NULL,
  tokens_prompt      INTEGER NOT NULL DEFAULT 0,
  tokens_resposta    INTEGER NOT NULL DEFAULT 0,
  tokens_total       INTEGER NOT NULL DEFAULT 0,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ia_log_uso_account_criado
  ON aba_ai.ia_log_uso(account_id, criado_em DESC);

ALTER TABLE aba_ai.ia_log_uso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_log_uso_select ON aba_ai.ia_log_uso;
CREATE POLICY ia_log_uso_select ON aba_ai.ia_log_uso FOR SELECT
  USING (public.is_account_member(account_id, 'admin') AND access.can('ai', 'read'));
-- Sem policy de INSERT/UPDATE/DELETE para authenticated: gravado só
-- pela Edge Function com service_role.

-- ============================================================
-- GRANT estreito + ALTER DEFAULT PRIVILEGES — mesmo padrão de
-- 008/009/010/013/016/017.
-- ============================================================
GRANT USAGE ON SCHEMA aba_ai TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA aba_ai TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA aba_ai TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_ai
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_ai
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_ai
  GRANT ALL ON TABLES TO service_role;
