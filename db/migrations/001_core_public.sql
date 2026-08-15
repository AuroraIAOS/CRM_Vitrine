-- ============================================================
-- 001_core_public.sql — núcleo (public): contas, perfis, convites,
-- presença, chaves de API, webhooks, notificações.
--
-- Porta a lógica de RLS/RBAC do CRM Maximus (017_account_sharing.sql,
-- 024_member_presence.sql, 026_api_keys.sql, 027_notifications.sql,
-- 028_webhook_endpoints.sql, 034_fix_profiles_update_rls.sql),
-- traduzindo apenas o necessário — nada de português aqui: `public` é
-- núcleo herdado, exceção documentada em CLAUDE.md §2 / docs/02 §1.
--
-- Projeto novo, sem dado legado — nasce direto no modelo multiusuário
-- por conta (não há passo de "migrar de single-tenant" como no 017
-- original, que convivia com dado pré-existente do fork wacrm).
--
-- Hardening já embutido (não em migration separada depois):
--   - enforce_profile_privilege_columns: trigger que impede o próprio
--     usuário autenticado de alterar account_role/account_id via
--     UPDATE direto em profiles — vulnerabilidade real encontrada e
--     corrigida no Maximus (GHSA-fg5p-2qc3-jmxr, migration 034).
--   - toda função nasce com search_path fixado e REVOKE EXECUTE FROM
--     PUBLIC + GRANT explícito (handoffs/instrucoes.md §6).
--
-- notifications nasce como "casca": tipo/coluna de conversa e contato
-- ficam sem CHECK/FK ainda, porque aba_messaging só existe a partir da
-- Subetapa 01.6. O gatilho de notificação de conversa atribuída entra
-- junto com aba_messaging, não aqui.
--
-- Escopo conscientemente adiado (não é omissão): as RPCs de convite de
-- equipe (redeem_invitation/set_member_role/transfer_ownership, do
-- Maximus 018/019) não entram nesta subetapa — não há UI de "convidar
-- membro" antes da Etapa 02. account_invitations existe com RLS ativa
-- (admin+ gerencia), a função de aceite é trabalho de Etapa 02.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

-- ============================================================
-- TIPOS
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_role_enum') THEN
    CREATE TYPE public.account_role_enum AS ENUM ('owner', 'admin', 'agent', 'viewer');
  END IF;
END $$;

-- ============================================================
-- FUNÇÃO DE updated_at DO NÚCLEO — não reaproveitada pelos schemas
-- aba_* (cada módulo tem a própria, docs/02 §2), para manter cada
-- módulo exportável sozinho.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated, service_role;

-- ============================================================
-- ACCOUNTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  owner_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uma conta por dono (decisão herdada do Maximus — membresia única).
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_one_per_owner
  ON public.accounts(owner_user_id);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON public.accounts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  account_role  public.account_role_enum NOT NULL,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_account_role ON public.profiles(account_id, account_role);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON public.profiles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- ACCOUNT_INVITATIONS — token nunca em texto puro, só o hash.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.account_invitations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  token_hash            TEXT NOT NULL UNIQUE,
  role                  public.account_role_enum NOT NULL CHECK (role <> 'owner'),
  created_by_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  label                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ NOT NULL,
  accepted_at           TIMESTAMPTZ,
  accepted_by_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_account_invitations_account_pending
  ON public.account_invitations(account_id, expires_at)
  WHERE accepted_at IS NULL;

ALTER TABLE public.account_invitations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- is_account_member(account_id, min_role) — RBAC hierárquico
-- SECURITY DEFINER para a policy ler profiles sem recursão de RLS.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_account_member(
  target_account_id UUID,
  min_role public.account_role_enum DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.account_id = target_account_id
      AND CASE p.account_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
        >=
          CASE min_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
  );
$$;

ALTER FUNCTION public.is_account_member(UUID, public.account_role_enum) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_account_member(UUID, public.account_role_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_account_member(UUID, public.account_role_enum) TO authenticated, service_role;

-- ============================================================
-- RLS — PROFILES
--
-- Leitura: o próprio dono OU qualquer membro da mesma conta (roster de
-- equipe). Escrita: só o próprio dono, e só de campos de auto-serviço
-- — account_role/account_id são travados pelo trigger abaixo.
-- ============================================================
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT
  USING (auth.uid() = user_id OR public.is_account_member(account_id));

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ---- trava de escalação de privilégio (GHSA-fg5p-2qc3-jmxr no Maximus) ----
-- RLS restringe QUAIS linhas, não QUAIS colunas — sem este gatilho, o
-- próprio usuário autenticado poderia:
--   UPDATE profiles SET account_role = 'owner' WHERE user_id = auth.uid();
--   UPDATE profiles SET account_id = '<conta-vítima>' WHERE user_id = auth.uid();
-- e as duas passariam pelo WITH CHECK acima (user_id não muda).
-- Escritores legítimos (handle_new_user, futuras RPCs de convite) rodam
-- SECURITY DEFINER como postgres — current_user não é 'authenticated' —
-- e passam livremente.
CREATE OR REPLACE FUNCTION public.enforce_profile_privilege_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.account_role IS DISTINCT FROM OLD.account_role
      OR NEW.account_id IS DISTINCT FROM OLD.account_id)
     AND current_user = 'authenticated'
  THEN
    RAISE EXCEPTION
      'account_role e account_id não podem ser alterados diretamente'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_profile_privilege_columns() OWNER TO postgres;

DROP TRIGGER IF EXISTS enforce_profile_privilege_columns ON public.profiles;
CREATE TRIGGER enforce_profile_privilege_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_privilege_columns();

-- ============================================================
-- RLS — ACCOUNTS / ACCOUNT_INVITATIONS
-- ============================================================
DROP POLICY IF EXISTS accounts_select ON public.accounts;
CREATE POLICY accounts_select ON public.accounts FOR SELECT
  USING (public.is_account_member(id));

DROP POLICY IF EXISTS accounts_update ON public.accounts;
CREATE POLICY accounts_update ON public.accounts FOR UPDATE
  USING (public.is_account_member(id, 'admin'))
  WITH CHECK (public.is_account_member(id, 'admin'));

DROP POLICY IF EXISTS account_invitations_select ON public.account_invitations;
CREATE POLICY account_invitations_select ON public.account_invitations FOR SELECT
  USING (public.is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS account_invitations_modify ON public.account_invitations;
CREATE POLICY account_invitations_modify ON public.account_invitations FOR ALL
  USING (public.is_account_member(account_id, 'admin'))
  WITH CHECK (public.is_account_member(account_id, 'admin'));

-- ============================================================
-- SIGNUP TRIGGER — todo auth.users novo ganha conta própria + owner
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name  TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(NULLIF(v_full_name, ''), NEW.email, 'Minha conta'), NEW.id)
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
  VALUES (NEW.id, v_full_name, NEW.email, v_account_id, 'owner');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Falha ao inicializar conta/perfil para o usuário %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- MEMBER_PRESENCE — online/away, offline é inferido por staleness
-- ============================================================
CREATE TABLE IF NOT EXISTS public.member_presence (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id   UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'away')),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_member_presence_account ON public.member_presence(account_id);

ALTER TABLE public.member_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_presence_select ON public.member_presence;
CREATE POLICY member_presence_select ON public.member_presence FOR SELECT
  USING (public.is_account_member(account_id));

-- Toda escrita passa pela RPC abaixo — sem policy de INSERT/UPDATE.
CREATE OR REPLACE FUNCTION public.touch_presence(p_status TEXT DEFAULT 'online')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('online', 'away') THEN
    RAISE EXCEPTION 'Status de presença inválido: %', p_status USING ERRCODE = '22023';
  END IF;

  SELECT account_id INTO v_account_id FROM public.profiles WHERE user_id = auth.uid();

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Sem conta vinculada ao usuário' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.member_presence (user_id, account_id, status, last_seen_at)
  VALUES (auth.uid(), v_account_id, p_status, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET status = EXCLUDED.status, last_seen_at = NOW(), account_id = EXCLUDED.account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_presence(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_presence(TEXT) TO authenticated, service_role;

-- ============================================================
-- API_KEYS — credencial de chamador máquina, escopada por conta
-- ============================================================
CREATE TABLE IF NOT EXISTS public.api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  key_prefix   TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  scopes       TEXT[] NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_account ON public.api_keys(account_id);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_select ON public.api_keys;
CREATE POLICY api_keys_select ON public.api_keys FOR SELECT
  USING (public.is_account_member(account_id));

DROP POLICY IF EXISTS api_keys_insert ON public.api_keys;
CREATE POLICY api_keys_insert ON public.api_keys FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS api_keys_update ON public.api_keys;
CREATE POLICY api_keys_update ON public.api_keys FOR UPDATE
  USING (public.is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS api_keys_delete ON public.api_keys;
CREATE POLICY api_keys_delete ON public.api_keys FOR DELETE
  USING (public.is_account_member(account_id, 'admin'));

-- ============================================================
-- WEBHOOK_ENDPOINTS — evento de saída assinado por conta
-- ============================================================
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  url              TEXT NOT NULL,
  secret           TEXT NOT NULL,
  events           TEXT[] NOT NULL DEFAULT '{}',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  last_delivery_at TIMESTAMPTZ,
  failure_count    INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_account ON public.webhook_endpoints(account_id);

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_endpoints_select ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_select ON public.webhook_endpoints FOR SELECT
  USING (public.is_account_member(account_id));

DROP POLICY IF EXISTS webhook_endpoints_insert ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_insert ON public.webhook_endpoints FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS webhook_endpoints_update ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_update ON public.webhook_endpoints FOR UPDATE
  USING (public.is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS webhook_endpoints_delete ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_delete ON public.webhook_endpoints FOR DELETE
  USING (public.is_account_member(account_id, 'admin'));

CREATE OR REPLACE FUNCTION public.record_webhook_failure(endpoint_id UUID, max_failures INT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.webhook_endpoints
  SET failure_count = failure_count + 1,
      is_active = CASE WHEN failure_count + 1 >= max_failures THEN FALSE ELSE is_active END
  WHERE id = endpoint_id;
$$;

REVOKE ALL ON FUNCTION public.record_webhook_failure(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_webhook_failure(UUID, INT) TO service_role;

-- ============================================================
-- NOTIFICATIONS — casca genérica; gatilho de mensageria entra na 01.6
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  conversation_id UUID,
  contact_id      UUID,
  actor_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id) WHERE read_at IS NULL;

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'member_presence'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.member_presence;
  END IF;
END $$;
