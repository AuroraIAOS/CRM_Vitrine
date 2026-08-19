-- ============================================================
-- 033_matriz_de_permissoes.sql — leitura da matriz papel × módulo × ação
-- (Subetapa 02.12, seção "Perfis e permissões" da tela `1m`)
--
-- POR QUE ESTA FUNÇÃO EXISTE
--
-- A permissão efetiva de um papel sobre um módulo não está em nenhuma
-- tabela: `access.module_permissions` guarda só as **exceções**, e o que
-- vale quando não há exceção vem de `access.default_permission()` — que é
-- código, não dado. Uma tela que quisesse mostrar a matriz inteira teria
-- que reimplementar aquela regra em TypeScript.
--
-- Reimplementar regra de permissão no client é exatamente o que o
-- `CLAUDE.md` §14 proíbe ("portar a lógica, nunca reescrever a lógica de
-- permissão do zero"), e o motivo é prático: no dia em que
-- `default_permission()` mudar, a cópia no navegador continua exibindo a
-- regra antiga — e ninguém descobre, porque a tela não erra, só mente.
-- Esta função devolve a matriz já resolvida pelo próprio banco.
--
-- POR QUE `owner` NÃO ESTÁ NA MATRIZ
--
-- Porque `access.can()` tem `IF v_role = 'owner' THEN RETURN TRUE` ANTES
-- de consultar `access.module_permissions`. Uma linha de `owner` editável
-- aceitaria o clique, gravaria a exceção e **não mudaria nada** — o
-- proprietário continuaria lendo tudo. Controle que aceita comando e não
-- produz efeito é pior que controle ausente. A tela declara isso em
-- texto, no lugar onde a linha estaria.
--
-- SEGURANÇA
--
-- `SECURITY INVOKER`: a RLS de `access.module_permissions` (SELECT para
-- `admin`+) continua valendo dentro da função. O guarda explícito no topo
-- existe para o caso não coberto pela RLS — sem ele, um `viewer` receberia
-- a matriz de PADRÕES completa (as exceções ficariam invisíveis pela RLS,
-- mas o desenho de permissão da conta apareceria assim mesmo). Fail-closed:
-- quem não é `admin`+ recebe conjunto vazio.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

CREATE OR REPLACE FUNCTION access.matriz_permissoes()
RETURNS TABLE (
  papel        public.account_role_enum,
  module_key   TEXT,
  module_label TEXT,
  acao         TEXT,
  permitido    BOOLEAN,
  e_excecao    BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_account_id UUID;
BEGIN
  SELECT p.account_id INTO v_account_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();

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
$fn$;

REVOKE ALL ON FUNCTION access.matriz_permissoes() FROM PUBLIC;
REVOKE ALL ON FUNCTION access.matriz_permissoes() FROM anon;
GRANT EXECUTE ON FUNCTION access.matriz_permissoes() TO authenticated, service_role;

COMMENT ON FUNCTION access.matriz_permissoes() IS
  'Matriz papel x modulo x acao ja resolvida (excecao de module_permissions ou padrao de default_permission). owner fica fora de proposito: access.can() curto-circuita owner para TRUE. Subetapa 02.12.';
