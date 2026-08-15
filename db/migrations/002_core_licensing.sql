-- ============================================================
-- 002_core_licensing.sql — schema licensing (teto de usuários)
--
-- Porta 038/040/064/077 do CRM Maximus já consolidadas na versão final
-- (não replay incremental — projeto novo, sem histórico a arrastar).
-- Sem prefixo aba_ (infraestrutura de plataforma, docs/02 §1).
--
-- Escrita negada a todo papel de conta, inclusive owner — só a chave
-- de service role altera. Teto padrão de fábrica = 3, valor documentado
-- em docs/01_ARQUITETURA.md; ajustar aqui e no .env juntos se mudar.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS licensing;

CREATE TABLE IF NOT EXISTS licensing.account_limits (
  account_id UUID PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  max_users  INTEGER NOT NULL DEFAULT 3,
  notes      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS licensing.limit_changes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  field      TEXT NOT NULL,
  old_value  INTEGER,
  new_value  INTEGER,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_limit_changes_account ON licensing.limit_changes(account_id);

ALTER TABLE licensing.account_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensing.limit_changes ENABLE ROW LEVEL SECURITY;

-- Leitura: owner/admin da própria conta. Nenhuma policy de escrita para
-- nenhum papel — ausência de policy nega por padrão no RLS do Postgres.
DROP POLICY IF EXISTS account_limits_select ON licensing.account_limits;
CREATE POLICY account_limits_select ON licensing.account_limits FOR SELECT
  USING (public.is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS limit_changes_select ON licensing.limit_changes;
CREATE POLICY limit_changes_select ON licensing.limit_changes FOR SELECT
  USING (public.is_account_member(account_id, 'admin'));

CREATE OR REPLACE FUNCTION licensing.log_limit_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = licensing, public
AS $$
BEGIN
  IF NEW.max_users IS DISTINCT FROM OLD.max_users THEN
    INSERT INTO licensing.limit_changes (account_id, field, old_value, new_value)
    VALUES (NEW.account_id, 'max_users', OLD.max_users, NEW.max_users);
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION licensing.log_limit_change() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_limit_change ON licensing.account_limits;
CREATE TRIGGER on_limit_change
  AFTER UPDATE ON licensing.account_limits
  FOR EACH ROW EXECUTE FUNCTION licensing.log_limit_change();

-- ============================================================
-- enforce_seat_limit() — BEFORE INSERT e BEFORE UPDATE OF account_id
-- em public.profiles. Cobre os dois caminhos de "ganhar assento numa
-- conta" desde o início — o Maximus só cobriu o caminho de UPDATE
-- (perfil migrando de conta via convite) na sua migration 064, depois
-- de já ter deixado passar teto em silêncio; aqui nasce cobrindo os
-- dois porque não há RPC de convite ainda mesmo (ver 001_core_public.sql).
--
-- Semeadura preguiçosa: a linha de limite pode não existir ainda para
-- a conta de destino — o trigger cria sob demanda antes de checar.
-- ============================================================
CREATE OR REPLACE FUNCTION licensing.enforce_seat_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = licensing, public
AS $$
DECLARE
  v_max_users     INTEGER;
  v_current_count INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.account_id IS NOT DISTINCT FROM OLD.account_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO licensing.account_limits (account_id, max_users)
  VALUES (NEW.account_id, 3)
  ON CONFLICT (account_id) DO NOTHING;

  SELECT max_users INTO v_max_users
  FROM licensing.account_limits
  WHERE account_id = NEW.account_id;

  SELECT count(*) INTO v_current_count
  FROM public.profiles
  WHERE account_id = NEW.account_id;

  IF v_current_count >= v_max_users THEN
    RAISE EXCEPTION
      'Teto de assentos atingido: esta conta está limitada a % usuário(s)', v_max_users
      USING ERRCODE = '23514',
            DETAIL  = 'seat_limit_reached',
            HINT    = v_max_users::TEXT;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION licensing.enforce_seat_limit() OWNER TO postgres;

DROP TRIGGER IF EXISTS enforce_seat_limit ON public.profiles;
CREATE TRIGGER enforce_seat_limit
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION licensing.enforce_seat_limit();

DROP TRIGGER IF EXISTS enforce_seat_limit_on_move ON public.profiles;
CREATE TRIGGER enforce_seat_limit_on_move
  BEFORE UPDATE OF account_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION licensing.enforce_seat_limit();

-- Backfill — contas já existentes no momento desta migration (nenhuma
-- em projeto novo, mas idempotente/seguro se já houver conta de teste).
INSERT INTO licensing.account_limits (account_id, max_users)
SELECT id, 3 FROM public.accounts
ON CONFLICT (account_id) DO NOTHING;

-- ============================================================
-- licensing.seat_usage() — teto, usados e restantes da conta do
-- chamador. SECURITY INVOKER: RLS de account_limits já faz a guarda.
-- ============================================================
CREATE OR REPLACE FUNCTION licensing.seat_usage()
RETURNS TABLE (max_users INTEGER, used_seats INTEGER, remaining_seats INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
  v_max        INTEGER;
  v_used       INTEGER;
BEGIN
  SELECT p.account_id INTO v_account_id FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  SELECT al.max_users INTO v_max FROM licensing.account_limits al WHERE al.account_id = v_account_id;
  IF v_max IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_used FROM public.profiles p WHERE p.account_id = v_account_id;

  RETURN QUERY SELECT v_max, v_used, v_max - v_used;
END;
$$;

REVOKE ALL ON FUNCTION licensing.seat_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION licensing.seat_usage() TO authenticated, service_role;
