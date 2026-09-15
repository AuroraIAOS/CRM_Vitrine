-- =====================================================================
-- 058 — A conta ativa em PL/pgSQL: o custo por linha que a 054 multiplicou
--       por 50 (Subetapa 03.9, ressalva 3 do parecer do portão)
--
-- O QUE A MEDIÇÃO MOSTROU. O parecer da 03.9 declarou o custo por linha de
-- `is_account_member` como "não medido" e o supôs pequeno ("duas consultas
-- indexadas a mais"). Ao aplicar a ressalva depois do merge, a medição
-- DERRUBOU a suposição (`CLAUDE.md` §11) — banco de testes, 20.000 chamadas,
-- mediana de 5 repetições:
--
--     is_account_member, versão anterior à 054 ........   17,5 µs/chamada
--     is_account_member, versão da 054 ................  855   µs/chamada
--     access.can (054/055) ............................  499   µs/chamada
--     aba_health.pode_acessar (055) ...................  519   µs/chamada
--     active_account_id() chamada SOZINHA .............   42   µs/chamada
--
-- A última linha é a pista. A função custa pouco sozinha e custa ~500 µs
-- quando é chamada DE DENTRO de outra função. `active_account_id()` era
-- `LANGUAGE sql` e `SECURITY DEFINER` — o que impede a expansão em linha —,
-- e uma função SQL que não se expande tem o corpo PREPARADO de novo a cada
-- execução do comando que a chama. Dentro de `is_account_member` (avaliada
-- por linha em 281 políticas), `access.can` e `pode_acessar`, isso é um
-- planejamento completo da CTE por linha lida. Numa tabela de 10 mil linhas,
-- a leitura passaria de 0,2 s para ~9 s.
--
-- O TESTE QUE SEPAROU A HIPÓTESE, antes desta migration: as mesmas duas
-- funções reescritas em PL/pgSQL, como funções temporárias, medidas lado a
-- lado — PL/pgSQL guarda o plano de cada comando por sessão:
--
--     is_account_member SQL → active_account_id PL/pgSQL ...   76 µs
--     is_account_member PL/pgSQL → active_account_id PL/pgSQL   47 µs
--
-- DESENHO. As duas passam a PL/pgSQL, com a MESMA regra de resolução da 054
-- e a mesma assinatura, dono, `search_path` e privilégios (`CREATE OR
-- REPLACE` preserva). `is_account_member` compara o alvo com a conta ativa
-- ANTES de consultar o perfil: quem pede uma conta que não é a ativa recebe
-- `false` sem consulta nenhuma. E devolve sempre `boolean` — nunca NULL,
-- como a versão SQL, que era um `EXISTS`.
--
-- A suíte 24 (35 casos, incluindo a varredura de 88 tabelas) e a suíte
-- inteira são o controle de que a semântica não mudou.
--
-- Idempotente — seguro rodar mais de uma vez.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.active_account_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_sessao UUID := NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
  v_conta  UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  -- Há escolha nesta sessão: vale ela, se o perfil ainda existir. Perfil
  -- removido devolve NULL — nunca cai em silêncio no perfil único (054).
  IF v_sessao IS NOT NULL THEN
    SELECT a.account_id INTO v_conta
    FROM public.active_accounts a
    WHERE a.session_id = v_sessao AND a.user_id = v_uid;

    IF FOUND THEN
      IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = v_uid AND p.account_id = v_conta) THEN
        RETURN v_conta;
      END IF;
      RETURN NULL;
    END IF;
  END IF;

  -- Sem escolha: só o perfil ÚNICO resolve sozinho.
  SELECT (array_agg(p.account_id))[1] INTO v_conta
  FROM public.profiles p
  WHERE p.user_id = v_uid
  HAVING count(*) = 1;

  RETURN v_conta;
END;
$$;

COMMENT ON FUNCTION public.active_account_id() IS
  'Conta ativa do chamador (Subetapa 03.9): a escolhida nesta sessão (session_id do JWT), se o perfil ainda existir; senão, o perfil único; com dois perfis e sem escolha, NULL — e toda autorização nega. PL/pgSQL desde a 058: em SQL, chamada de dentro de outra função, era replanejada a cada linha (855 µs × 47 µs medidos).';

CREATE OR REPLACE FUNCTION public.is_account_member(
  target_account_id UUID,
  min_role public.account_role_enum DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Subetapa 03.9: membro da conta ATIVA, não de "qualquer conta do
  -- usuário". Sem esta comparação, quem pertence a duas clínicas enxerga as
  -- duas ao mesmo tempo em toda política do produto. Feita antes da consulta
  -- ao perfil: conta que não é a ativa recusa sem ler nada (058).
  IF target_account_id IS NULL OR target_account_id IS DISTINCT FROM public.active_account_id() THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
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
END;
$$;

ALTER FUNCTION public.active_account_id() OWNER TO postgres;
ALTER FUNCTION public.is_account_member(UUID, public.account_role_enum) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.active_account_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.active_account_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.active_account_id() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_account_member(UUID, public.account_role_enum) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_account_member(UUID, public.account_role_enum) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_account_member(UUID, public.account_role_enum) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- VERIFICAÇÕES QUE RECUSAM A MIGRATION
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_sobra TEXT;
BEGIN
  -- (a) as duas em PL/pgSQL, SECURITY DEFINER
  SELECT string_agg(p.proname, ', ') INTO v_sobra
  FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('active_account_id', 'is_account_member')
    AND (l.lanname <> 'plpgsql' OR NOT p.prosecdef);
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION '(a) fora de PL/pgSQL SECURITY DEFINER: %', v_sobra;
  END IF;

  -- (b) is_account_member continua comparando com a conta ativa
  IF pg_get_functiondef('public.is_account_member(uuid, public.account_role_enum)'::regprocedure) !~ 'active_account_id\(\)' THEN
    RAISE EXCEPTION '(b) is_account_member não consulta a conta ativa.';
  END IF;

  -- (c) nenhuma das duas executável por anon
  IF has_function_privilege('anon', 'public.active_account_id()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.is_account_member(uuid, public.account_role_enum)', 'EXECUTE') THEN
    RAISE EXCEPTION '(c) executável por anon.';
  END IF;

  -- (d) sem sessão, nada: nem conta ativa, nem membresia
  IF public.active_account_id() IS NOT NULL
     OR public.is_account_member(gen_random_uuid()) IS DISTINCT FROM FALSE
     OR public.is_account_member(NULL) IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION '(d) chamada sem sessão devolveu conta ou membresia.';
  END IF;

  -- (e) as guardas da 057 continuam verdes
  SELECT string_agg(funcao, ', ') INTO v_sobra FROM public.funcoes_sem_conta_ativa();
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION '(e) função sem conta ativa: %', v_sobra; END IF;
  SELECT string_agg(tabela || ' ' || politica, ', ') INTO v_sobra FROM public.politicas_sem_cerca_de_conta();
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION '(e) política sem cerca: %', v_sobra; END IF;
END $$;
