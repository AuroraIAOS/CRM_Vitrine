-- ============================================================
-- 020_aba_messaging.sql — schema aba_messaging (conversas, mensagens,
-- provedor de canal)
--
-- Mapa de origem: db/migrations/README.md → aba_messaging
-- (048_messaging_schema.sql + hardening 055/056/057, absorvendo as
-- tabelas que no Maximus ficaram soltas em `public`, herdadas do fork
-- `wacrm`: contacts→contatos_canal, conversations→conversas,
-- messages→mensagens, message_reactions→reacoes_mensagem,
-- quick_replies→respostas_rapidas, whatsapp_config→
-- configuracao_whatsapp, message_templates→modelos_mensagem,
-- broadcasts→transmissoes, broadcast_recipients→
-- destinatarios_transmissao). Aplicado por último (docs/00, ordem de
-- aplicação) — é por isso que aba_people.pessoas.contato_id e as
-- colunas de mensagem de aba_scheduling/aba_finance/aba_automations/
-- aba_ai ficaram UUID sem REFERENCES: este schema não existia ainda
-- quando eles nasceram, e a decisão registrada (handoffs/
-- instrucoes.md §5) é não reintroduzir essas FKs mesmo agora, para
-- aba_people/aba_scheduling/etc. continuarem exportáveis sem
-- mensageria.
--
-- SEARCH-FIRST (CLAUDE.md §11): versão vigente da Graph API confirmada
-- em 2026-08-16 — v26.0 (lançada 2026-07-29), assinatura de webhook
-- HMAC-SHA256 no cabeçalho X-Hub-Signature-256 sobre o corpo bruto,
-- handshake de verificação por GET com hub.mode/hub.verify_token/
-- hub.challenge. Fonte: developers.facebook.com/docs/graph-api/
-- changelog e .../docs/whatsapp/cloud-api/webhooks/components.
--
-- PROVEDOR — só 'meta' permitido nos CHECK desta migration (Evolution
-- GO fora do MVP, CLAUDE.md §15), mas a tabela provedores_canal já
-- nasce com as colunas genéricas (instance_id/instance_token/base_url/
-- webhook_secret) que o Evolution vai precisar — docs/06 §2 já decide
-- isso: "quando Evolution GO entrar como módulo pago, é registrar um
-- novo provedor no mesmo schema, sem redesenhar aba_messaging".
--
-- CORREÇÃO NA TRADUÇÃO — configuracao_whatsapp.verify_token removido:
-- no Maximus a coluna existia por linha (por conta), mas o handshake
-- de verificação do webhook da Meta é por APP, não por número — um
-- único META_WEBHOOK_VERIFY_TOKEN (segredo de Edge Function, nunca no
-- banco) resolve para todas as contas que compartilham a mesma URL de
-- webhook. Manter a coluna seria vestígio sem uso real; ver
-- supabase/functions/whatsapp-webhook/index.ts.
--
-- ESCOPO TRIMADO EM modelos_mensagem — Meta acrescentou ao longo do
-- tempo colunas de acompanhamento fino de submissão (quality_score,
-- header_handle/header_media_url para upload resumível,
-- submission_error, last_submitted_at). Nenhuma delas é necessária
-- para o webhook de entrada nem para o envio simples — entram como
-- ALTER TABLE quando a Etapa 02 construir a tela de submissão de
-- modelo, informada por um search-first fresco daquele momento (a
-- Graph API já mudou de v21 pra v26 desde que o Maximus escreveu essas
-- colunas). status usa o enum bruto da Meta (DRAFT/PENDING/APPROVED/
-- ...) em inglês, de propósito: é vocabulário de contrato externo que
-- sincroniza 1:1 com a API, traduzir criaria mapeamento a mais para
-- errar toda vez que a Etapa 02 falar com a Meta de verdade.
--
-- HARDENING JÁ EMBUTIDO (Maximus 055/056/057, nascendo corrigido em
-- vez de corrigido depois):
--   - 055: token/segredo de provedor (provedores_canal) e o token de
--     acesso (configuracao_whatsapp) nunca legíveis por `authenticated`
--     — nem por owner. Só o Edge Function, com service_role, opera com
--     eles.
--   - 056: resolução de provedor por hash (SHA-256) em vez de decifrar
--     linha a linha — custo constante por requisição pública, sem
--     operação de criptografia antes de reconhecer o segredo. (Só se
--     aplica ao provedor 'evolution', que autentica por segredo na
--     URL — a Meta autentica por assinatura HMAC do app, não por
--     segredo de instância; a coluna existe para quando Evolution
--     entrar.)
--   - 057: deduplicação de evento por CONTA
--     (account_id, provider, external_id), não só (provider,
--     external_id) — um id de mensagem do WhatsApp não é único entre
--     contas/instâncias diferentes.
--
-- RLS no padrão obrigatório de docs/02 §2, module_key = 'messaging'
-- (já seedado em access.modules desde 003_core_access.sql).
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS aba_messaging;

CREATE OR REPLACE FUNCTION aba_messaging.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION aba_messaging.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_messaging.set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION aba_messaging.set_updated_at() FROM authenticated;

-- ============================================================
-- Provedores de canal — qual provedor está ativo por conta, e o
-- registro bruto de todo evento recebido, antes de qualquer
-- interpretação.
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_messaging.provedores_canal (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                  UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  canal                       TEXT NOT NULL DEFAULT 'whatsapp' CHECK (canal IN ('whatsapp')),
  -- Só 'meta' no v01 — ver cabeçalho.
  provedor                    TEXT NOT NULL CHECK (provedor IN ('meta')),
  ativo                       BOOLEAN NOT NULL DEFAULT FALSE,
  id_instancia                TEXT,
  token_instancia_cifrado     TEXT,
  url_base                    TEXT,
  segredo_webhook_cifrado     TEXT,
  status_conexao              TEXT NOT NULL DEFAULT 'desconectado'
    CHECK (status_conexao IN ('desconectado', 'pareando', 'conectado', 'erro')),
  conectado_em                TIMESTAMPTZ,
  ultimo_erro                 TEXT,
  criado_em                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_provedores_canal_account ON aba_messaging.provedores_canal(account_id);
-- Garante no banco um único provedor ativo por (account_id, canal).
CREATE UNIQUE INDEX IF NOT EXISTS idx_provedores_canal_um_ativo
  ON aba_messaging.provedores_canal(account_id, canal) WHERE ativo;

ALTER TABLE aba_messaging.provedores_canal ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_messaging.provedores_canal;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_messaging.provedores_canal
  FOR EACH ROW EXECUTE FUNCTION aba_messaging.set_updated_at();

DROP POLICY IF EXISTS provedores_canal_select ON aba_messaging.provedores_canal;
CREATE POLICY provedores_canal_select ON aba_messaging.provedores_canal FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('messaging', 'read'));
DROP POLICY IF EXISTS provedores_canal_insert ON aba_messaging.provedores_canal;
CREATE POLICY provedores_canal_insert ON aba_messaging.provedores_canal FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'create'));
DROP POLICY IF EXISTS provedores_canal_update ON aba_messaging.provedores_canal;
CREATE POLICY provedores_canal_update ON aba_messaging.provedores_canal FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'update'));
DROP POLICY IF EXISTS provedores_canal_delete ON aba_messaging.provedores_canal;
CREATE POLICY provedores_canal_delete ON aba_messaging.provedores_canal FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'delete'));

CREATE TABLE IF NOT EXISTS aba_messaging.eventos_provedor (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  provedor      TEXT NOT NULL CHECK (provedor IN ('meta')),
  tipo_evento   TEXT,
  id_externo    TEXT,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  processado    BOOLEAN NOT NULL DEFAULT FALSE,
  erro          TEXT,
  recebido_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eventos_provedor_account_recebido
  ON aba_messaging.eventos_provedor(account_id, recebido_em DESC);
-- Deduplicação por CONTA (Maximus 057) — id_externo vem do payload do
-- provedor e não é único entre contas/instâncias diferentes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_eventos_provedor_dedupe
  ON aba_messaging.eventos_provedor(account_id, provedor, id_externo) WHERE id_externo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eventos_provedor_expurgo
  ON aba_messaging.eventos_provedor(recebido_em) WHERE processado;

ALTER TABLE aba_messaging.eventos_provedor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eventos_provedor_select ON aba_messaging.eventos_provedor;
CREATE POLICY eventos_provedor_select ON aba_messaging.eventos_provedor FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('messaging', 'read'));
-- Sem policy de INSERT/UPDATE/DELETE para authenticated: quem grava é
-- o Edge Function do webhook, com service_role.

-- ============================================================
-- Contatos de canal — identidade pelo número, independente de virar
-- lead/cliente no CRM (aba_people.pessoas.contato_id referencia este
-- id sem FK — ver cabeçalho).
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_messaging.contatos_canal (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  telefone      TEXT NOT NULL,
  nome          TEXT,
  email         TEXT,
  empresa       TEXT,
  url_avatar    TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contatos_canal_account ON aba_messaging.contatos_canal(account_id);
-- Mesmo telefone não duplica contato dentro da mesma conta — o
-- webhook faz upsert por (account_id, telefone).
CREATE UNIQUE INDEX IF NOT EXISTS idx_contatos_canal_account_telefone
  ON aba_messaging.contatos_canal(account_id, telefone);

ALTER TABLE aba_messaging.contatos_canal ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_messaging.contatos_canal;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_messaging.contatos_canal
  FOR EACH ROW EXECUTE FUNCTION aba_messaging.set_updated_at();

DROP POLICY IF EXISTS contatos_canal_select ON aba_messaging.contatos_canal;
CREATE POLICY contatos_canal_select ON aba_messaging.contatos_canal FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('messaging', 'read'));
DROP POLICY IF EXISTS contatos_canal_insert ON aba_messaging.contatos_canal;
CREATE POLICY contatos_canal_insert ON aba_messaging.contatos_canal FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'create'));
DROP POLICY IF EXISTS contatos_canal_update ON aba_messaging.contatos_canal;
CREATE POLICY contatos_canal_update ON aba_messaging.contatos_canal FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'update'));
DROP POLICY IF EXISTS contatos_canal_delete ON aba_messaging.contatos_canal;
CREATE POLICY contatos_canal_delete ON aba_messaging.contatos_canal FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'delete'));

-- ============================================================
-- Conversas
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_messaging.conversas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contato_id            UUID NOT NULL REFERENCES aba_messaging.contatos_canal(id) ON DELETE CASCADE,
  provedor              TEXT NOT NULL DEFAULT 'meta' CHECK (provedor IN ('meta')),
  status                TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'pendente', 'fechada')),
  agente_responsavel_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ultima_mensagem_texto TEXT,
  ultima_mensagem_em    TIMESTAMPTZ,
  contador_nao_lidas    INTEGER NOT NULL DEFAULT 0,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conversas_account ON aba_messaging.conversas(account_id);
CREATE INDEX IF NOT EXISTS idx_conversas_contato ON aba_messaging.conversas(contato_id);

ALTER TABLE aba_messaging.conversas ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_messaging.conversas;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_messaging.conversas
  FOR EACH ROW EXECUTE FUNCTION aba_messaging.set_updated_at();

DROP POLICY IF EXISTS conversas_select ON aba_messaging.conversas;
CREATE POLICY conversas_select ON aba_messaging.conversas FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('messaging', 'read'));
DROP POLICY IF EXISTS conversas_insert ON aba_messaging.conversas;
CREATE POLICY conversas_insert ON aba_messaging.conversas FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'create'));
DROP POLICY IF EXISTS conversas_update ON aba_messaging.conversas;
CREATE POLICY conversas_update ON aba_messaging.conversas FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'update'));
DROP POLICY IF EXISTS conversas_delete ON aba_messaging.conversas;
CREATE POLICY conversas_delete ON aba_messaging.conversas FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'delete'));

-- ============================================================
-- Mensagens
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_messaging.mensagens (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id              UUID NOT NULL REFERENCES aba_messaging.conversas(id) ON DELETE CASCADE,
  account_id               UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  tipo_remetente           TEXT NOT NULL CHECK (tipo_remetente IN ('cliente', 'agente', 'bot')),
  remetente_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tipo_conteudo            TEXT NOT NULL DEFAULT 'texto' CHECK (tipo_conteudo IN (
    'texto', 'imagem', 'documento', 'audio', 'video', 'localizacao', 'modelo', 'interativo'
  )),
  conteudo_texto           TEXT,
  url_midia                TEXT,
  nome_modelo              TEXT,
  -- Payload estruturado de mensagem interativa ENVIADA (botões/lista) —
  -- permite re-renderizar o que foi mandado, não só o texto do corpo.
  payload_interativo       JSONB,
  -- Id do botão/linha que o cliente tocou, numa resposta interativa
  -- RECEBIDA. Sem FK — é string arbitrária escolhida por quem montou o
  -- template, não referência de linha.
  id_resposta_interativa   TEXT,
  -- Id da mensagem no WhatsApp (wamid). Não é chave primária interna
  -- porque não é único entre números — é só o texto que a Meta usa.
  id_mensagem_externa      TEXT,
  responder_mensagem_id    UUID REFERENCES aba_messaging.mensagens(id) ON DELETE SET NULL,
  status                   TEXT NOT NULL DEFAULT 'enviando'
    CHECK (status IN ('enviando', 'enviada', 'entregue', 'lida', 'falhou')),
  provedor                 TEXT NOT NULL DEFAULT 'meta' CHECK (provedor IN ('meta')),
  criado_em                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa ON aba_messaging.mensagens(conversa_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_mensagens_account ON aba_messaging.mensagens(account_id);
-- Caminho quente do webhook: atualização de status ("delivered"/"read")
-- chega referenciando o wamid, não o UUID interno.
CREATE INDEX IF NOT EXISTS idx_mensagens_id_externa
  ON aba_messaging.mensagens(id_mensagem_externa) WHERE id_mensagem_externa IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mensagens_responder
  ON aba_messaging.mensagens(responder_mensagem_id) WHERE responder_mensagem_id IS NOT NULL;

ALTER TABLE aba_messaging.mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mensagens_select ON aba_messaging.mensagens;
CREATE POLICY mensagens_select ON aba_messaging.mensagens FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('messaging', 'read'));
DROP POLICY IF EXISTS mensagens_insert ON aba_messaging.mensagens;
CREATE POLICY mensagens_insert ON aba_messaging.mensagens FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'create'));
DROP POLICY IF EXISTS mensagens_update ON aba_messaging.mensagens;
CREATE POLICY mensagens_update ON aba_messaging.mensagens FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'update'));
DROP POLICY IF EXISTS mensagens_delete ON aba_messaging.mensagens;
CREATE POLICY mensagens_delete ON aba_messaging.mensagens FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'delete'));

-- ============================================================
-- Reações — uma por (mensagem, ator). conversa_id/account_id
-- denormalizados para RLS e Realtime filtrarem sem join (Realtime não
-- faz join).
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_messaging.reacoes_mensagem (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem_id   UUID NOT NULL REFERENCES aba_messaging.mensagens(id) ON DELETE CASCADE,
  conversa_id   UUID NOT NULL REFERENCES aba_messaging.conversas(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  tipo_ator     TEXT NOT NULL CHECK (tipo_ator IN ('cliente', 'agente')),
  ator_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  emoji         TEXT NOT NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mensagem_id, tipo_ator, ator_id)
);
CREATE INDEX IF NOT EXISTS idx_reacoes_mensagem_conversa ON aba_messaging.reacoes_mensagem(conversa_id);
CREATE INDEX IF NOT EXISTS idx_reacoes_mensagem_mensagem ON aba_messaging.reacoes_mensagem(mensagem_id);

ALTER TABLE aba_messaging.reacoes_mensagem ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reacoes_mensagem_select ON aba_messaging.reacoes_mensagem;
CREATE POLICY reacoes_mensagem_select ON aba_messaging.reacoes_mensagem FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('messaging', 'read'));
DROP POLICY IF EXISTS reacoes_mensagem_insert ON aba_messaging.reacoes_mensagem;
CREATE POLICY reacoes_mensagem_insert ON aba_messaging.reacoes_mensagem FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'create'));
DROP POLICY IF EXISTS reacoes_mensagem_update ON aba_messaging.reacoes_mensagem;
CREATE POLICY reacoes_mensagem_update ON aba_messaging.reacoes_mensagem FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'update') AND tipo_ator = 'agente' AND ator_id = auth.uid());
DROP POLICY IF EXISTS reacoes_mensagem_delete ON aba_messaging.reacoes_mensagem;
CREATE POLICY reacoes_mensagem_delete ON aba_messaging.reacoes_mensagem FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'delete') AND tipo_ator = 'agente' AND ator_id = auth.uid());

-- ============================================================
-- Respostas rápidas — atalho de composição, compartilhado pela conta.
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_messaging.respostas_rapidas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  criado_por          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo              TEXT NOT NULL,
  tipo                TEXT NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto', 'interativo')),
  conteudo_texto      TEXT,
  payload_interativo  JSONB,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_respostas_rapidas_account ON aba_messaging.respostas_rapidas(account_id);

ALTER TABLE aba_messaging.respostas_rapidas ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_messaging.respostas_rapidas;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_messaging.respostas_rapidas
  FOR EACH ROW EXECUTE FUNCTION aba_messaging.set_updated_at();

DROP POLICY IF EXISTS respostas_rapidas_select ON aba_messaging.respostas_rapidas;
CREATE POLICY respostas_rapidas_select ON aba_messaging.respostas_rapidas FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('messaging', 'read'));
DROP POLICY IF EXISTS respostas_rapidas_insert ON aba_messaging.respostas_rapidas;
CREATE POLICY respostas_rapidas_insert ON aba_messaging.respostas_rapidas FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'create'));
DROP POLICY IF EXISTS respostas_rapidas_update ON aba_messaging.respostas_rapidas;
CREATE POLICY respostas_rapidas_update ON aba_messaging.respostas_rapidas FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'update'));
DROP POLICY IF EXISTS respostas_rapidas_delete ON aba_messaging.respostas_rapidas;
CREATE POLICY respostas_rapidas_delete ON aba_messaging.respostas_rapidas FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'delete'));

-- ============================================================
-- Configuração do WhatsApp oficial — uma por conta. verify_token
-- removido na tradução (ver cabeçalho).
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_messaging.configuracao_whatsapp (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                UUID NOT NULL UNIQUE REFERENCES public.accounts(id) ON DELETE CASCADE,
  id_numero_telefone        TEXT NOT NULL UNIQUE,
  id_waba                   TEXT,
  -- Texto cifrado (AES-256-GCM, ENCRYPTION_KEY) — nunca decifrado no
  -- banco, nunca legível por authenticated (ver hardening no cabeçalho).
  token_acesso_cifrado      TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'desconectado' CHECK (status IN ('conectado', 'desconectado')),
  conectado_em              TIMESTAMPTZ,
  registrado_em             TIMESTAMPTZ,
  assinado_apps_em          TIMESTAMPTZ,
  erro_ultimo_registro      TEXT,
  criado_em                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_configuracao_whatsapp_registro_pendente
  ON aba_messaging.configuracao_whatsapp(registrado_em) WHERE registrado_em IS NULL;

ALTER TABLE aba_messaging.configuracao_whatsapp ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_messaging.configuracao_whatsapp;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_messaging.configuracao_whatsapp
  FOR EACH ROW EXECUTE FUNCTION aba_messaging.set_updated_at();

DROP POLICY IF EXISTS configuracao_whatsapp_select ON aba_messaging.configuracao_whatsapp;
CREATE POLICY configuracao_whatsapp_select ON aba_messaging.configuracao_whatsapp FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('messaging', 'read'));
DROP POLICY IF EXISTS configuracao_whatsapp_insert ON aba_messaging.configuracao_whatsapp;
CREATE POLICY configuracao_whatsapp_insert ON aba_messaging.configuracao_whatsapp FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin') AND access.can('messaging', 'create'));
DROP POLICY IF EXISTS configuracao_whatsapp_update ON aba_messaging.configuracao_whatsapp;
CREATE POLICY configuracao_whatsapp_update ON aba_messaging.configuracao_whatsapp FOR UPDATE
  USING (public.is_account_member(account_id, 'admin') AND access.can('messaging', 'update'));
DROP POLICY IF EXISTS configuracao_whatsapp_delete ON aba_messaging.configuracao_whatsapp;
CREATE POLICY configuracao_whatsapp_delete ON aba_messaging.configuracao_whatsapp FOR DELETE
  USING (public.is_account_member(account_id, 'admin') AND access.can('messaging', 'delete'));

-- ============================================================
-- Modelos de mensagem (templates aprovados pela Meta)
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_messaging.modelos_mensagem (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  nome              TEXT NOT NULL,
  categoria         TEXT NOT NULL DEFAULT 'marketing' CHECK (categoria IN ('marketing', 'utilidade', 'autenticacao')),
  idioma            TEXT NOT NULL DEFAULT 'pt_BR',
  tipo_cabecalho    TEXT CHECK (tipo_cabecalho IN ('texto', 'imagem', 'video', 'documento')),
  conteudo_cabecalho TEXT,
  texto_corpo       TEXT NOT NULL,
  texto_rodape      TEXT,
  botoes            JSONB,
  valores_exemplo   JSONB,
  id_modelo_meta    TEXT,
  -- Enum bruto da Meta, em inglês de propósito — ver cabeçalho.
  status            TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'IN_APPEAL', 'PENDING_DELETION'
  )),
  motivo_rejeicao   TEXT,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (botoes IS NULL OR (jsonb_typeof(botoes) = 'array' AND jsonb_array_length(botoes) <= 10))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_modelos_mensagem_account_nome_idioma
  ON aba_messaging.modelos_mensagem(account_id, nome, idioma);
CREATE INDEX IF NOT EXISTS idx_modelos_mensagem_id_meta
  ON aba_messaging.modelos_mensagem(id_modelo_meta) WHERE id_modelo_meta IS NOT NULL;

ALTER TABLE aba_messaging.modelos_mensagem ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_messaging.modelos_mensagem;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_messaging.modelos_mensagem
  FOR EACH ROW EXECUTE FUNCTION aba_messaging.set_updated_at();

DROP POLICY IF EXISTS modelos_mensagem_select ON aba_messaging.modelos_mensagem;
CREATE POLICY modelos_mensagem_select ON aba_messaging.modelos_mensagem FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('messaging', 'read'));
DROP POLICY IF EXISTS modelos_mensagem_insert ON aba_messaging.modelos_mensagem;
CREATE POLICY modelos_mensagem_insert ON aba_messaging.modelos_mensagem FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'create'));
DROP POLICY IF EXISTS modelos_mensagem_update ON aba_messaging.modelos_mensagem;
CREATE POLICY modelos_mensagem_update ON aba_messaging.modelos_mensagem FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'update'));
DROP POLICY IF EXISTS modelos_mensagem_delete ON aba_messaging.modelos_mensagem;
CREATE POLICY modelos_mensagem_delete ON aba_messaging.modelos_mensagem FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'delete'));

-- ============================================================
-- Transmissões (campanhas de template)
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_messaging.transmissoes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  criado_por          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome                TEXT NOT NULL,
  nome_modelo         TEXT NOT NULL,
  idioma_modelo       TEXT NOT NULL DEFAULT 'pt_BR',
  variaveis_modelo    JSONB,
  filtro_publico      JSONB,
  agendado_para       TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'agendada', 'enviando', 'enviada', 'falhou')),
  total_destinatarios INTEGER NOT NULL DEFAULT 0,
  contador_enviados   INTEGER NOT NULL DEFAULT 0,
  contador_entregues  INTEGER NOT NULL DEFAULT 0,
  contador_lidos      INTEGER NOT NULL DEFAULT 0,
  contador_respondidos INTEGER NOT NULL DEFAULT 0,
  contador_falhados   INTEGER NOT NULL DEFAULT 0,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transmissoes_account ON aba_messaging.transmissoes(account_id);

ALTER TABLE aba_messaging.transmissoes ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_messaging.transmissoes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_messaging.transmissoes
  FOR EACH ROW EXECUTE FUNCTION aba_messaging.set_updated_at();

DROP POLICY IF EXISTS transmissoes_select ON aba_messaging.transmissoes;
CREATE POLICY transmissoes_select ON aba_messaging.transmissoes FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('messaging', 'read'));
DROP POLICY IF EXISTS transmissoes_insert ON aba_messaging.transmissoes;
CREATE POLICY transmissoes_insert ON aba_messaging.transmissoes FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'create'));
DROP POLICY IF EXISTS transmissoes_update ON aba_messaging.transmissoes;
CREATE POLICY transmissoes_update ON aba_messaging.transmissoes FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'update'));
DROP POLICY IF EXISTS transmissoes_delete ON aba_messaging.transmissoes;
CREATE POLICY transmissoes_delete ON aba_messaging.transmissoes FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('messaging', 'delete'));

CREATE TABLE IF NOT EXISTS aba_messaging.destinatarios_transmissao (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transmissao_id UUID NOT NULL REFERENCES aba_messaging.transmissoes(id) ON DELETE CASCADE,
  contato_id     UUID NOT NULL REFERENCES aba_messaging.contatos_canal(id),
  status         TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'enviado', 'entregue', 'lido', 'respondido', 'falhou')),
  enviado_em     TIMESTAMPTZ,
  entregue_em    TIMESTAMPTZ,
  lido_em        TIMESTAMPTZ,
  respondido_em  TIMESTAMPTZ,
  mensagem_erro  TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_destinatarios_transmissao_transmissao
  ON aba_messaging.destinatarios_transmissao(transmissao_id);

ALTER TABLE aba_messaging.destinatarios_transmissao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS destinatarios_transmissao_select ON aba_messaging.destinatarios_transmissao;
CREATE POLICY destinatarios_transmissao_select ON aba_messaging.destinatarios_transmissao FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM aba_messaging.transmissoes t WHERE t.id = destinatarios_transmissao.transmissao_id
      AND public.is_account_member(t.account_id, 'viewer') AND access.can('messaging', 'read')
  ));
DROP POLICY IF EXISTS destinatarios_transmissao_modify ON aba_messaging.destinatarios_transmissao;
CREATE POLICY destinatarios_transmissao_modify ON aba_messaging.destinatarios_transmissao FOR ALL
  USING (EXISTS (
    SELECT 1 FROM aba_messaging.transmissoes t WHERE t.id = destinatarios_transmissao.transmissao_id
      AND public.is_account_member(t.account_id, 'agent') AND access.can('messaging', 'update')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM aba_messaging.transmissoes t WHERE t.id = destinatarios_transmissao.transmissao_id
      AND public.is_account_member(t.account_id, 'agent') AND access.can('messaging', 'update')
  ));

-- ============================================================
-- GRANT amplo primeiro (padrão de 013 e seguintes) — precisa vir ANTES
-- do narrowing por coluna abaixo (segredo de provedor/token de acesso).
-- ============================================================
GRANT USAGE ON SCHEMA aba_messaging TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA aba_messaging TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA aba_messaging TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_messaging
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_messaging
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_messaging
  GRANT ALL ON TABLES TO service_role;

-- ============================================================
-- Segredo de provedor e token de acesso nunca legíveis pela API
-- (Maximus 055) — nem por owner. Só o Edge Function, com service_role,
-- opera com eles. Ordem importa (ver 013_aba_health.sql): tabela
-- primeiro, coluna depois.
-- ============================================================
DO $$
DECLARE
  v_cols TEXT;
BEGIN
  REVOKE SELECT ON aba_messaging.provedores_canal FROM authenticated;
  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'aba_messaging'
    AND table_name = 'provedores_canal'
    AND column_name NOT IN ('token_instancia_cifrado', 'segredo_webhook_cifrado');
  EXECUTE format('GRANT SELECT (%s) ON aba_messaging.provedores_canal TO authenticated', v_cols);

  REVOKE SELECT ON aba_messaging.configuracao_whatsapp FROM authenticated;
  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'aba_messaging'
    AND table_name = 'configuracao_whatsapp'
    AND column_name NOT IN ('token_acesso_cifrado');
  EXECUTE format('GRANT SELECT (%s) ON aba_messaging.configuracao_whatsapp TO authenticated', v_cols);
END $$;

-- ============================================================
-- Resolução de provedor por hash em custo constante (Maximus 056) —
-- só relevante para o provedor 'evolution' (autentica por segredo na
-- URL). A Meta autentica por assinatura HMAC do app inteiro, não por
-- segredo de instância — a coluna existe pronta para quando Evolution
-- entrar, sem redesenhar a tabela.
-- ============================================================
ALTER TABLE aba_messaging.provedores_canal
  ADD COLUMN IF NOT EXISTS hash_segredo_webhook TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_provedores_canal_hash_segredo_webhook
  ON aba_messaging.provedores_canal(hash_segredo_webhook)
  WHERE hash_segredo_webhook IS NOT NULL;

REVOKE SELECT (hash_segredo_webhook) ON aba_messaging.provedores_canal FROM authenticated;

-- ============================================================
-- Realtime — o mesmo conjunto que o Maximus habilitou para a caixa de
-- entrada renderizar ao vivo.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'aba_messaging' AND tablename = 'mensagens'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE aba_messaging.mensagens;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'aba_messaging' AND tablename = 'conversas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE aba_messaging.conversas;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'aba_messaging' AND tablename = 'reacoes_mensagem'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE aba_messaging.reacoes_mensagem;
  END IF;
END $$;
