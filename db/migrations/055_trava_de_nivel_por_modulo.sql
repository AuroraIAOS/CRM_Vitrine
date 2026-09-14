-- =====================================================================
-- 055 — A trava de NÍVEL por módulo, consultada ANTES do atalho de owner
--       (Subetapa 03.9 — portão completo; decisão D3 de Max, 2026-09-03)
--
-- O QUE O PRODUTO PRECISA. Vender Bronze/Prata/Ouro/Diamante (D-V1: a faixa
-- comercial se chama NÍVEL, nunca "plano") exige responder "quais módulos
-- ESTA conta contratou". Nenhuma tabela respondia: `access.modules` é
-- catálogo global sem `account_id`, e `licensing` guardava só o teto de
-- assentos (medido na 03.0).
--
-- POR QUE NÃO PODE SER UMA LINHA A MAIS EM `access.module_permissions`.
-- `access.can()` fazia `IF v_role = 'owner' THEN RETURN TRUE` ANTES de ler
-- aquela tabela (`003_core_access.sql:162`, medido duas vezes — 02.12 e
-- 03.0). O owner é justamente quem contrata o nível: a trava aceitaria o
-- corte e não esconderia nada dele. E `aba_health.pode_acessar()` tem o
-- MESMO atalho no passo 2 ("owner sempre pode"), sem passar por
-- `access.can()` — cortar o prontuário só em `access.can()` deixaria o dono
-- lendo prontuário por `ler_evolucoes`. Os dois atalhos ganham a trava
-- antes de si; a 057 guarda por catálogo que nenhum atalho novo nasça sem
-- ela.
--
-- A MATRIZ É DE MAX, O MECANISMO É DESTA MIGRATION. Qual módulo entra em
-- qual nível é decisão comercial dele, para o momento que ele escolher
-- (pendência vigiada). Por isso os quatro níveis nascem liberando TODOS os
-- módulos, e toda conta existente nasce em `diamante`: esta migration não
-- tira nada de ninguém. O que a suíte 24 prova é que o corte FUNCIONA —
-- contra o owner — quando a matriz existir.
--
-- DUAS RECUSAS DE DESENHO, com motivo:
--   · **Módulo de núcleo (`is_core`, hoje `settings`) não se corta.** Um
--     nível sem configurações trancaria o dono fora da própria conta.
--   · **Par (nível × módulo) ausente NEGA.** Módulo novo em `access.modules`
--     sem linha em cada nível fica invisível em vez de liberado por omissão
--     — o erro aparece no primeiro teste, não na fatura. A 057 recusa esse
--     estado por catálogo (`modulos_sem_linha_de_nivel`). É a lição da 03.8
--     ("acrescentar módulo acende item de menu") pelo lado oposto.
--
-- A escrita é só do servidor (`service_role`), no mesmo regime do teto de
-- assentos: nenhum papel de conta, nem o owner, troca o próprio nível.
--
-- Idempotente — seguro rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §1 — O catálogo de níveis e a matriz nível × módulo
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS licensing.tiers (
  key       TEXT PRIMARY KEY,
  label     TEXT NOT NULL,
  position  INTEGER NOT NULL DEFAULT 0
);

INSERT INTO licensing.tiers (key, label, position) VALUES
  ('bronze',   'Bronze',   1),
  ('prata',    'Prata',    2),
  ('ouro',     'Ouro',     3),
  ('diamante', 'Diamante', 4)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, position = EXCLUDED.position;

CREATE TABLE IF NOT EXISTS licensing.tier_modules (
  tier_key    TEXT NOT NULL REFERENCES licensing.tiers(key) ON DELETE CASCADE,
  module_key  TEXT NOT NULL REFERENCES access.modules(key) ON DELETE CASCADE,
  enabled     BOOLEAN NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tier_key, module_key)
);

-- Nascem liberando tudo. `DO NOTHING`: reaplicar a migration nunca desfaz
-- um corte que Max já tenha feito na matriz.
INSERT INTO licensing.tier_modules (tier_key, module_key, enabled)
SELECT t.key, m.key, TRUE
FROM licensing.tiers t CROSS JOIN access.modules m
ON CONFLICT (tier_key, module_key) DO NOTHING;

CREATE OR REPLACE FUNCTION licensing.impedir_corte_de_nucleo()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT NEW.enabled AND EXISTS (
    SELECT 1 FROM access.modules m WHERE m.key = NEW.module_key AND m.is_core
  ) THEN
    RAISE EXCEPTION 'O módulo % é de núcleo e não pode ser cortado de um nível — o dono ficaria trancado fora da própria conta.', NEW.module_key
      USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

ALTER FUNCTION licensing.impedir_corte_de_nucleo() OWNER TO postgres;
REVOKE ALL ON FUNCTION licensing.impedir_corte_de_nucleo() FROM PUBLIC;
REVOKE ALL ON FUNCTION licensing.impedir_corte_de_nucleo() FROM anon;
REVOKE ALL ON FUNCTION licensing.impedir_corte_de_nucleo() FROM authenticated;

DROP TRIGGER IF EXISTS impedir_corte_de_nucleo ON licensing.tier_modules;
CREATE TRIGGER impedir_corte_de_nucleo
  BEFORE INSERT OR UPDATE ON licensing.tier_modules
  FOR EACH ROW EXECUTE FUNCTION licensing.impedir_corte_de_nucleo();

-- ---------------------------------------------------------------------
-- §2 — O nível de cada conta, com rastro de troca
-- ---------------------------------------------------------------------
ALTER TABLE licensing.account_limits
  ADD COLUMN IF NOT EXISTS tier_key TEXT NOT NULL DEFAULT 'diamante' REFERENCES licensing.tiers(key);

-- Toda conta tem linha de limite (a semeadura preguiçosa da 002 cria no
-- primeiro perfil; o backfill cobre conta que por algum motivo não tenha).
INSERT INTO licensing.account_limits (account_id, max_users)
SELECT a.id, 3 FROM public.accounts a
ON CONFLICT (account_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS licensing.tier_changes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  old_tier    TEXT,
  new_tier    TEXT NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tier_changes_account ON licensing.tier_changes(account_id);

CREATE OR REPLACE FUNCTION licensing.log_tier_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.tier_key IS DISTINCT FROM OLD.tier_key THEN
    INSERT INTO licensing.tier_changes (account_id, old_tier, new_tier)
    VALUES (NEW.account_id, OLD.tier_key, NEW.tier_key);
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION licensing.log_tier_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION licensing.log_tier_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION licensing.log_tier_change() FROM anon;
REVOKE ALL ON FUNCTION licensing.log_tier_change() FROM authenticated;

DROP TRIGGER IF EXISTS on_tier_change ON licensing.account_limits;
CREATE TRIGGER on_tier_change
  AFTER UPDATE OF tier_key ON licensing.account_limits
  FOR EACH ROW EXECUTE FUNCTION licensing.log_tier_change();

-- ---------------------------------------------------------------------
-- §3 — Privilégios e RLS: catálogo legível, escrita só do servidor
-- ---------------------------------------------------------------------
ALTER TABLE licensing.tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensing.tier_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensing.tier_changes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON licensing.tiers, licensing.tier_modules, licensing.tier_changes FROM PUBLIC;
REVOKE ALL ON licensing.tiers, licensing.tier_modules, licensing.tier_changes FROM anon;
REVOKE ALL ON licensing.tiers, licensing.tier_modules, licensing.tier_changes FROM authenticated;
GRANT SELECT ON licensing.tiers, licensing.tier_modules TO authenticated;
GRANT SELECT ON licensing.tier_changes TO authenticated;
GRANT ALL ON licensing.tiers, licensing.tier_modules, licensing.tier_changes TO service_role;

-- `account_limits` passa a guardar o NÍVEL, e medido ao aplicar esta
-- migration: `authenticated` tinha INSERT/UPDATE/DELETE/TRUNCATE nela desde
-- a 002 — só a ausência de política barrava a escrita. Uma trava comercial
-- não fica pendurada numa camada só. Os escritores legítimos
-- (`enforce_seat_limit`, o servidor) não são `authenticated`.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON licensing.account_limits, licensing.limit_changes FROM authenticated;
REVOKE ALL ON licensing.account_limits, licensing.limit_changes FROM anon;

-- A matriz é o que se vende — pública para quem está logado, como
-- `access.modules`. O histórico de troca é da conta, só para admin+.
DROP POLICY IF EXISTS tiers_select ON licensing.tiers;
CREATE POLICY tiers_select ON licensing.tiers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS tier_modules_select ON licensing.tier_modules;
CREATE POLICY tier_modules_select ON licensing.tier_modules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS tier_changes_select ON licensing.tier_changes;
CREATE POLICY tier_changes_select ON licensing.tier_changes FOR SELECT
  USING (public.is_account_member(account_id, 'admin'));

-- ---------------------------------------------------------------------
-- §4 — A pergunta única: este módulo está no nível desta conta?
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION licensing.module_enabled(p_account_id UUID, p_module_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    -- Núcleo nunca se corta (a §1 também recusa gravar o corte).
    EXISTS (SELECT 1 FROM access.modules m WHERE m.key = p_module_key AND m.is_core)
    OR COALESCE((
      SELECT tm.enabled
      FROM licensing.account_limits al
      JOIN licensing.tier_modules tm ON tm.tier_key = al.tier_key AND tm.module_key = p_module_key
      WHERE al.account_id = p_account_id
    ), FALSE);  -- sem linha: nega (ver cabeçalho)
$$;

COMMENT ON FUNCTION licensing.module_enabled(UUID, TEXT) IS
  'Trava de nível (Subetapa 03.9): o módulo está contratado pela conta? Consultada ANTES de todo atalho de owner. Módulo de núcleo sempre; par nível×módulo ausente nega.';

ALTER FUNCTION licensing.module_enabled(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION licensing.module_enabled(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION licensing.module_enabled(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION licensing.module_enabled(UUID, TEXT) TO authenticated, service_role;

-- Para a tela: os módulos da conta ATIVA e se cada um está contratado.
CREATE OR REPLACE FUNCTION licensing.account_modules()
RETURNS TABLE (module_key TEXT, module_label TEXT, module_position INTEGER, is_core BOOLEAN, tier_key TEXT, enabled BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.key, m.label, m.position, m.is_core, al.tier_key,
         licensing.module_enabled(al.account_id, m.key)
  FROM access.modules m
  CROSS JOIN licensing.account_limits al
  WHERE al.account_id = public.active_account_id()
  ORDER BY m.position, m.key;
$$;

ALTER FUNCTION licensing.account_modules() OWNER TO postgres;
REVOKE ALL ON FUNCTION licensing.account_modules() FROM PUBLIC;
REVOKE ALL ON FUNCTION licensing.account_modules() FROM anon;
GRANT EXECUTE ON FUNCTION licensing.account_modules() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §5 — `access.can()`: conta ativa, e o nível antes do owner
-- ---------------------------------------------------------------------
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

  -- Subetapa 03.9: o perfil da conta ATIVA. Sem este filtro, quem pertence
  -- a duas clínicas recebia o papel de uma delas ao acaso (SELECT INTO pega
  -- a primeira linha) — medido: o agent de B herdava o owner de M.
  SELECT account_id, account_role INTO v_account_id, v_role
  FROM public.profiles
  WHERE user_id = auth.uid()
    AND account_id = public.active_account_id();

  IF v_account_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Subetapa 03.9: a trava de nível vem ANTES do atalho de owner — é o
  -- owner quem contrata o nível, e é dele que o corte tem de valer.
  IF NOT licensing.module_enabled(v_account_id, p_module_key) THEN
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
REVOKE ALL ON FUNCTION access.can(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION access.can(TEXT, TEXT) TO authenticated, service_role;

-- As três leituras de matriz de `access` descobriam a conta por `user_id`.
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
  -- Subetapa 03.9: perfil da conta ativa.
  SELECT p.account_id, p.account_role INTO v_account_id, v_role
  FROM public.profiles p WHERE p.user_id = auth.uid() AND p.account_id = public.active_account_id();

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
REVOKE ALL ON FUNCTION access.permission_matrix() FROM anon;
GRANT EXECUTE ON FUNCTION access.permission_matrix() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION access.matriz_permissoes()
RETURNS TABLE(papel public.account_role_enum, module_key TEXT, module_label TEXT, acao TEXT, permitido BOOLEAN, e_excecao BOOLEAN)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  -- Subetapa 03.9: a matriz é a da conta ativa.
  v_account_id := public.active_account_id();

  IF v_account_id IS NULL OR NOT public.is_account_member(v_account_id, 'admin') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    r.papel,
    m.key,
    m.label,
    a.acao,
    COALESCE(mp.allowed, access.default_permission(r.papel, m.key, a.acao)),
    mp.id IS NOT NULL
  FROM (VALUES
         ('admin'::public.account_role_enum),
         ('agent'::public.account_role_enum),
         ('viewer'::public.account_role_enum)
       ) AS r(papel)
  CROSS JOIN access.modules m
  CROSS JOIN (VALUES ('read'), ('create'), ('update'), ('delete')) AS a(acao)
  LEFT JOIN access.module_permissions mp
         ON mp.account_id = v_account_id
        AND mp.role       = r.papel
        AND mp.module_key = m.key
        AND mp.action     = a.acao
  ORDER BY m.position, m.key, r.papel, a.acao;
END;
$$;

REVOKE ALL ON FUNCTION access.matriz_permissoes() FROM PUBLIC;
REVOKE ALL ON FUNCTION access.matriz_permissoes() FROM anon;
GRANT EXECUTE ON FUNCTION access.matriz_permissoes() TO authenticated, service_role;

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

  -- Subetapa 03.9: grava na conta ativa (a RLS de module_permissions
  -- continua sendo a trava de "só owner escreve").
  v_account_id := public.active_account_id();

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

REVOKE ALL ON FUNCTION access.set_module_permission(public.account_role_enum, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION access.set_module_permission(public.account_role_enum, TEXT, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION access.set_module_permission(public.account_role_enum, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §6 — `aba_health.pode_acessar()`: conta ativa, e o nível antes do owner
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_health.pode_acessar(p_cliente_id uuid, p_acao text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_account_id UUID;
  v_papel public.account_role_enum;
  v_perfil_id UUID;
  v_acao_modulo TEXT;
BEGIN
  IF p_acao IS NULL OR p_acao NOT IN ('leitura', 'criacao', 'atualizacao', 'exportacao') THEN
    RETURN FALSE;
  END IF;

  -- Subetapa 03.9: o perfil da CONTA ATIVA. Medido antes desta migration:
  -- sem o filtro, o agent de uma clínica lia pela `ler_evolucoes` a
  -- evolução inteira da outra clínica, onde é owner.
  SELECT id, account_id, account_role INTO v_perfil_id, v_account_id, v_papel
  FROM public.profiles
  WHERE user_id = v_user_id
    AND account_id = public.active_account_id();

  IF v_account_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Subetapa 03.9: prontuário fora do nível contratado não abre para
  -- ninguém — nem para o owner do passo 2.
  IF NOT licensing.module_enabled(v_account_id, 'health') THEN
    RETURN FALSE;
  END IF;

  -- Cliente informado precisa pertencer à própria conta — nenhum
  -- caminho de aba_health atravessa fronteira de conta.
  IF p_cliente_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM aba_people.clientes c
    WHERE c.id = p_cliente_id AND c.account_id = v_account_id
  ) THEN
    RETURN FALSE;
  END IF;

  -- 1. Negação individual vence tudo.
  IF EXISTS (
    SELECT 1 FROM aba_health.concessoes_prontuario g
    WHERE g.account_id = v_account_id
      AND g.usuario_concedido_id = v_user_id
      AND g.efeito = 'negar'
      AND (g.expira_em IS NULL OR g.expira_em > NOW())
      AND (g.escopo = 'todos_registros'
           OR (g.escopo = 'cliente_unico' AND p_cliente_id IS NOT NULL AND g.cliente_id = p_cliente_id))
  ) THEN
    RETURN FALSE;
  END IF;

  -- 2. owner sempre pode.
  IF v_papel = 'owner' THEN
    RETURN TRUE;
  END IF;

  -- 3. Concessão permitir vigente.
  IF EXISTS (
    SELECT 1 FROM aba_health.concessoes_prontuario g
    WHERE g.account_id = v_account_id
      AND g.usuario_concedido_id = v_user_id
      AND g.efeito = 'permitir'
      AND (g.expira_em IS NULL OR g.expira_em > NOW())
      AND (g.escopo = 'todos_registros'
           OR (g.escopo = 'cliente_unico' AND p_cliente_id IS NOT NULL AND g.cliente_id = p_cliente_id))
  ) THEN
    RETURN TRUE;
  END IF;

  -- 4. Atributo profissional + funcionário ativo (Maximus 076, já
  -- embutido desde o início) + permissão de módulo.
  v_acao_modulo := CASE p_acao
    WHEN 'leitura' THEN 'read'
    WHEN 'criacao' THEN 'create'
    WHEN 'atualizacao' THEN 'update'
    ELSE NULL -- 'exportacao' nunca abre pelo atributo profissional sozinho
  END;

  IF v_perfil_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM aba_scheduling.profissionais p
       WHERE p.account_id = v_account_id
         AND p.profile_id = v_perfil_id
         AND p.ativo
         AND p.acesso_clinico
         AND EXISTS (
           SELECT 1 FROM aba_people.funcionarios f
           WHERE f.id = p.funcionario_id AND f.ativo
         )
     )
     AND access.can('health', v_acao_modulo)
  THEN
    RETURN TRUE;
  END IF;

  -- 5. Padrão: nega.
  RETURN FALSE;
END;
$function$;

ALTER FUNCTION aba_health.pode_acessar(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.pode_acessar(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.pode_acessar(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION aba_health.pode_acessar(UUID, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §7 — VERIFICAÇÕES QUE RECUSAM A MIGRATION
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_sobra TEXT;
  v_def   TEXT;
BEGIN
  -- (a) os quatro níveis existem e liberam todos os módulos (a matriz é de Max)
  IF (SELECT count(*) FROM licensing.tiers WHERE key IN ('bronze','prata','ouro','diamante')) <> 4 THEN
    RAISE EXCEPTION '(a) faltam níveis no catálogo.';
  END IF;
  SELECT string_agg(t.key || '×' || m.key, ', ') INTO v_sobra
  FROM licensing.tiers t CROSS JOIN access.modules m
  WHERE NOT EXISTS (SELECT 1 FROM licensing.tier_modules tm WHERE tm.tier_key = t.key AND tm.module_key = m.key);
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION '(a) par nível×módulo sem linha: %', v_sobra;
  END IF;

  -- (b) toda conta tem nível
  IF EXISTS (SELECT 1 FROM public.accounts a
             WHERE NOT EXISTS (SELECT 1 FROM licensing.account_limits al WHERE al.account_id = a.id)) THEN
    RAISE EXCEPTION '(b) conta sem linha em account_limits — ficaria sem nível e sem módulo.';
  END IF;

  -- (c) nenhum papel de conta escreve na matriz nem no próprio nível
  SELECT string_agg(t, ', ') INTO v_sobra
  FROM unnest(ARRAY['licensing.tiers', 'licensing.tier_modules', 'licensing.tier_changes', 'licensing.account_limits']) t
  WHERE has_table_privilege('authenticated', t, 'INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_table_privilege('anon', t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE');
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION '(c) escrita aberta em: %', v_sobra;
  END IF;

  -- (d) a trava vem ANTES do atalho de owner, nos dois lugares que atalham
  v_def := pg_get_functiondef('access.can(text, text)'::regprocedure);
  IF position('licensing.module_enabled' IN v_def) = 0
     OR position('licensing.module_enabled' IN v_def) > position('''owner'' THEN' IN v_def) THEN
    RAISE EXCEPTION '(d) access.can não consulta o nível antes do atalho de owner.';
  END IF;
  v_def := pg_get_functiondef('aba_health.pode_acessar(uuid, text)'::regprocedure);
  IF position('licensing.module_enabled' IN v_def) = 0
     OR position('licensing.module_enabled' IN v_def) > position('''owner'' THEN' IN v_def) THEN
    RAISE EXCEPTION '(d) pode_acessar não consulta o nível antes do atalho de owner.';
  END IF;

  -- (e) as duas usam a conta ativa
  IF pg_get_functiondef('access.can(text, text)'::regprocedure) !~ 'active_account_id\(\)'
     OR pg_get_functiondef('aba_health.pode_acessar(uuid, text)'::regprocedure) !~ 'active_account_id\(\)' THEN
    RAISE EXCEPTION '(e) access.can ou pode_acessar ainda descobre a conta por user_id.';
  END IF;

  -- (f) núcleo não se corta
  BEGIN
    UPDATE licensing.tier_modules SET enabled = FALSE WHERE tier_key = 'bronze' AND module_key = 'settings';
    RAISE EXCEPTION '(f) o módulo de núcleo aceitou corte.';
  EXCEPTION WHEN check_violation THEN
    NULL; -- recusado, como deve
  END;

  -- (g) nenhuma função nova executável por anon
  SELECT string_agg(f, ', ') INTO v_sobra
  FROM unnest(ARRAY['licensing.module_enabled(uuid, text)', 'licensing.account_modules()',
                    'access.can(text, text)', 'aba_health.pode_acessar(uuid, text)',
                    'access.permission_matrix()', 'access.matriz_permissoes()',
                    'access.set_module_permission(public.account_role_enum, text, text, boolean)']) f
  WHERE has_function_privilege('anon', f, 'EXECUTE');
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION '(g) executável por anon: %', v_sobra;
  END IF;
END $$;
