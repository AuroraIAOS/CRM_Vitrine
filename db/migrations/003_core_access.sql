-- ============================================================
-- 003_core_access.sql — schema access (permissão fina por módulo)
--
-- Porta 039/041/042/063/065 do CRM Maximus já consolidadas na versão
-- final (fail-closed desde o início; search_path fixado desde o
-- início — o Maximus só chegou lá depois de duas migrations de
-- correção, aqui nasce corrigido). Sem prefixo aba_ (docs/02 §1).
--
-- module_key do catálogo abaixo é o namespace de Vitrine (docs/02 §2):
-- people/catalog/scheduling/finance/health/messaging/sales/
-- automations/ai + settings (interno). Chaves de sales/automations/ai
-- semeadas já aqui (a tabela é só rótulo — não depende dos schemas
-- aba_sales/aba_automations/aba_ai existirem para ter uma linha de
-- catálogo), evitando reabrir esta migration nas Subetapas 01.5/01.6.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS access;

-- ============================================================
-- access.modules — catálogo global, sem account_id (exceção
-- declarada à regra "toda tabela carrega account_id" — docs/02 §3;
-- a lista de módulos do produto é a mesma para toda conta, só a
-- permissão sobre eles varia por conta, em module_permissions).
-- ============================================================
CREATE TABLE IF NOT EXISTS access.modules (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key      TEXT UNIQUE NOT NULL,
  label    TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_core  BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE access.modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS modules_select ON access.modules;
CREATE POLICY modules_select ON access.modules FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO access.modules (key, label, position, is_core) VALUES
  ('people',       'Pessoas',        1,  FALSE),
  ('scheduling',   'Agenda',         2,  FALSE),
  ('catalog',      'Catálogo',       3,  FALSE),
  ('finance',      'Financeiro',     4,  FALSE),
  ('health',       'Prontuário',     5,  FALSE),
  ('messaging',    'Mensagens',      6,  FALSE),
  ('sales',        'Vendas',         7,  FALSE),
  ('automations',  'Automações',     8,  FALSE),
  ('ai',           'IA',             9,  FALSE),
  ('settings',     'Configurações', 10,  TRUE)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      position = EXCLUDED.position,
      is_core = EXCLUDED.is_core;

-- ============================================================
-- access.module_permissions — interruptor por conta × papel × módulo × ação
-- ============================================================
CREATE TABLE IF NOT EXISTS access.module_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  role        public.account_role_enum NOT NULL,
  module_key  TEXT NOT NULL REFERENCES access.modules(key),
  action      TEXT NOT NULL CHECK (action IN ('read', 'create', 'update', 'delete')),
  allowed     BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, role, module_key, action)
);

CREATE INDEX IF NOT EXISTS idx_module_permissions_account ON access.module_permissions(account_id);

ALTER TABLE access.module_permissions ENABLE ROW LEVEL SECURITY;

-- Leitura: admin+ (configuração de segurança, não dado operacional).
-- Escrita: só owner. Gate direto por papel, sem access.can(), para não
-- criar autorreferência com a própria tabela que access.can() consulta.
DROP POLICY IF EXISTS module_permissions_select ON access.module_permissions;
CREATE POLICY module_permissions_select ON access.module_permissions FOR SELECT
  USING (public.is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS module_permissions_insert ON access.module_permissions;
CREATE POLICY module_permissions_insert ON access.module_permissions FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'owner'));

DROP POLICY IF EXISTS module_permissions_update ON access.module_permissions;
CREATE POLICY module_permissions_update ON access.module_permissions FOR UPDATE
  USING (public.is_account_member(account_id, 'owner'));

DROP POLICY IF EXISTS module_permissions_delete ON access.module_permissions;
CREATE POLICY module_permissions_delete ON access.module_permissions FOR DELETE
  USING (public.is_account_member(account_id, 'owner'));

-- ============================================================
-- access.default_permission — padrão semeado, por papel × módulo × ação
--   owner:  tudo (tratado antes de chamar esta função)
--   admin:  tudo, exceto delete em settings
--   agent:  read/create/update, delete negado
--   viewer: só read
--   health: read negado para todos, exceto owner
-- ============================================================
CREATE OR REPLACE FUNCTION access.default_permission(
  p_role public.account_role_enum,
  p_module_key TEXT,
  p_action TEXT
) RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_role = 'owner' THEN TRUE
    WHEN p_module_key = 'health' THEN FALSE
    WHEN p_role = 'admin' THEN
      NOT (p_action = 'delete' AND p_module_key = 'settings')
    WHEN p_role = 'agent' THEN
      p_action <> 'delete'
    WHEN p_role = 'viewer' THEN
      p_action = 'read'
    ELSE FALSE
  END;
$$;

-- ============================================================
-- access.can(module_key, action) — SECURITY DEFINER, fail-closed desde
-- o início. Ordem: entrada inválida nega; owner sempre pode; sem linha
-- em module_permissions vale o padrão; senão vale `allowed`.
-- ============================================================
CREATE OR REPLACE FUNCTION access.can(
  p_module_key TEXT,
  p_action TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = access, public
AS $$
DECLARE
  v_account_id UUID;
  v_role       public.account_role_enum;
  v_allowed    BOOLEAN;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('read', 'create', 'update', 'delete') THEN
    RETURN FALSE;
  END IF;

  IF p_module_key IS NULL
     OR NOT EXISTS (SELECT 1 FROM access.modules m WHERE m.key = p_module_key) THEN
    RETURN FALSE;
  END IF;

  SELECT account_id, account_role INTO v_account_id, v_role
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF v_account_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_role = 'owner' THEN
    RETURN TRUE;
  END IF;

  SELECT allowed INTO v_allowed
  FROM access.module_permissions
  WHERE account_id = v_account_id
    AND role = v_role
    AND module_key = p_module_key
    AND action = p_action;

  IF FOUND THEN
    RETURN v_allowed;
  END IF;

  RETURN access.default_permission(v_role, p_module_key, p_action);
END;
$$;

ALTER FUNCTION access.can(TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION access.can(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION access.can(TEXT, TEXT) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  access.default_permission(public.account_role_enum, TEXT, TEXT)
  TO authenticated, service_role;

-- ============================================================
-- access.readable_modules() — catálogo filtrado pelo que o usuário
-- corrente pode ler, na ordem de navegação. Uma chamada em vez de uma
-- por módulo (module_permissions só é legível por admin+, então
-- agent/viewer não enxergariam os overrides se a UI tentasse replicar
-- a regra em TypeScript).
-- ============================================================
CREATE OR REPLACE FUNCTION access.readable_modules()
RETURNS TABLE (module_key TEXT, module_label TEXT, module_position INTEGER, is_core BOOLEAN)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT m.key, m.label, m.position, m.is_core
  FROM access.modules m
  WHERE access.can(m.key, 'read')
  ORDER BY m.position, m.key;
$$;

REVOKE ALL ON FUNCTION access.readable_modules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION access.readable_modules() TO authenticated, service_role;

-- ============================================================
-- access.permission_matrix() — matriz efetiva papel × módulo × ação
-- para a tela de configuração de permissões. Só owner recebe linha.
-- ============================================================
CREATE OR REPLACE FUNCTION access.permission_matrix()
RETURNS TABLE (
  target_role public.account_role_enum,
  module_key TEXT,
  module_label TEXT,
  module_position INTEGER,
  is_core BOOLEAN,
  action TEXT,
  allowed BOOLEAN,
  is_override BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
  v_role       public.account_role_enum;
BEGIN
  SELECT p.account_id, p.account_role INTO v_account_id, v_role
  FROM public.profiles p WHERE p.user_id = auth.uid();

  IF v_account_id IS NULL OR v_role <> 'owner' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    r.target_role, m.key, m.label, m.position, m.is_core, a.action,
    COALESCE(mp.allowed, access.default_permission(r.target_role, m.key, a.action)),
    mp.id IS NOT NULL
  FROM access.modules m
  CROSS JOIN (VALUES ('admin'::public.account_role_enum), ('agent'::public.account_role_enum), ('viewer'::public.account_role_enum)) AS r(target_role)
  CROSS JOIN (VALUES ('read'), ('create'), ('update'), ('delete')) AS a(action)
  LEFT JOIN access.module_permissions mp
    ON mp.account_id = v_account_id AND mp.role = r.target_role
   AND mp.module_key = m.key AND mp.action = a.action
  ORDER BY m.position, r.target_role, a.action;
END;
$$;

REVOKE ALL ON FUNCTION access.permission_matrix() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION access.permission_matrix() TO authenticated, service_role;

-- ============================================================
-- access.set_module_permission() — grava um interruptor. A trava de
-- "só owner escreve" é a RLS de module_permissions, não checagem aqui
-- (duas fontes da verdade divergem; uma só não).
-- ============================================================
CREATE OR REPLACE FUNCTION access.set_module_permission(
  p_role public.account_role_enum,
  p_module_key TEXT,
  p_action TEXT,
  p_allowed BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'O proprietário não pode ser restringido' USING ERRCODE = '22023';
  END IF;

  IF p_action IS NULL OR p_action NOT IN ('read', 'create', 'update', 'delete') THEN
    RAISE EXCEPTION 'Ação desconhecida: %', COALESCE(p_action, '(nula)') USING ERRCODE = '22023';
  END IF;

  IF p_module_key IS NULL OR NOT EXISTS (SELECT 1 FROM access.modules m WHERE m.key = p_module_key) THEN
    RAISE EXCEPTION 'Módulo desconhecido: %', COALESCE(p_module_key, '(nulo)') USING ERRCODE = '22023';
  END IF;

  IF p_allowed IS NULL THEN
    RAISE EXCEPTION 'Valor do interruptor não informado' USING ERRCODE = '22023';
  END IF;

  SELECT p.account_id INTO v_account_id FROM public.profiles p WHERE p.user_id = auth.uid();

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Sem perfil vinculado a uma conta' USING ERRCODE = '42501';
  END IF;

  INSERT INTO access.module_permissions
    (account_id, role, module_key, action, allowed, updated_by, updated_at)
  VALUES
    (v_account_id, p_role, p_module_key, p_action, p_allowed, auth.uid(), NOW())
  ON CONFLICT (account_id, role, module_key, action) DO UPDATE
    SET allowed = EXCLUDED.allowed, updated_by = EXCLUDED.updated_by, updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION
  access.set_module_permission(public.account_role_enum, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  access.set_module_permission(public.account_role_enum, TEXT, TEXT, BOOLEAN)
  TO authenticated, service_role;
