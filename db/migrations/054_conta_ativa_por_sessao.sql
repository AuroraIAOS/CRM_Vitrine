-- =====================================================================
-- 054 — Multiunidade, parte 1: a CONTA ATIVA, escolhida por sessão
--       (Subetapa 03.9 — portão completo)
--
-- O QUE MUDA NO MODELO. Até aqui um usuário pertencia a exatamente uma
-- conta: `public.profiles.user_id` era `UNIQUE`, e toda a camada de
-- autorização descobria "a conta do chamador" com
-- `SELECT ... FROM public.profiles WHERE user_id = auth.uid()`. O item 24
-- do MVP (multiunidade) exige que a mesma pessoa trabalhe em mais de um
-- consultório — e, na clínica em que está trabalhando AGORA, não enxergue
-- NADA da outra.
--
-- NÃO HÁ LÓGICA PARA PORTAR. O CRM Maximus trava a membresia única como
-- decisão de desenho (`017_account_sharing.sql`: "One account per user —
-- the locked design decision"). A conta ativa é lógica nova, e por isso
-- cada escolha abaixo é decisão de Max, tomada em 2026-09-14 à pergunta do
-- plano do bench (`CLAUDE.md` §14):
--
--   1. **A conta ativa vive POR SESSÃO.** `public.active_accounts` é chaveada
--      pelo `session_id` do JWT — toda claim de acesso do Supabase Auth traz
--      esse UUID, e ele é a chave primária de `auth.sessions` (documentação
--      vigente, "User sessions → Access token (JWT) claims", consultada em
--      2026-09-14). Dois aparelhos da mesma pessoa não se trocam de clínica
--      um ao outro, e a linha some quando a sessão termina.
--   2. Convite híbrido — na 056.
--   3. **Uma pessoa pode ser `owner` de duas clínicas**, sem autosserviço: o
--      índice `idx_accounts_one_per_owner` sai; a segunda titularidade chega
--      por convite + `transfer_account_ownership`.
--   4. Rede (grupo de clínicas) fica FORA da 03.9.
--
-- ============================================================
-- A PERGUNTA QUE A CAMADA ANTIGA NÃO TINHA COMO RESPONDER
-- ============================================================
-- Em PL/pgSQL, `SELECT ... INTO` que encontra DUAS linhas não dá erro: pega
-- a primeira e segue. Retirar a `UNIQUE` sem mais nada faria cada função
-- do produto resolver a conta — e o PAPEL — de uma clínica qualquer entre
-- as da pessoa, em silêncio. O agent de uma clínica herdaria o owner da
-- outra. Por isso a `UNIQUE` sai na MESMA migration que cria a conta ativa,
-- e as funções que descobrem a conta são reescritas na 055/056 antes de o
-- bench ser considerado verde; a 057 guarda o padrão por catálogo.
--
-- ============================================================
-- A REGRA DE RESOLUÇÃO — `public.active_account_id()`
-- ============================================================
--   · Há linha para ESTA sessão → vale a conta dela, SE o perfil ainda
--     existir. Perfil removido → NULL, e tudo nega. Nunca "cai" em silêncio
--     na outra clínica da pessoa: quem estava vendo B e foi removido de B
--     não pode passar a ver M com a tela ainda dizendo B.
--   · Não há linha, e a pessoa tem UM perfil → vale esse perfil. É o caso
--     de todo usuário que existe hoje: nada muda para ele.
--   · Não há linha, e a pessoa tem dois perfis ou mais → NULL. A tela abre
--     o seletor (login em dois estágios) e ninguém lê nada até escolher.
--
-- `public.is_account_member()` passa a exigir `target = active_account_id()`.
-- Como 281 das 319 políticas do banco passam por ela, esta é a cirurgia de
-- um ponto só; as que não passam foram varridas por catálogo e são tratadas
-- aqui (`profiles`, `notifications`) e na 056 (`formularios_anamnese`).
--
-- Idempotente — seguro rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §1 — `profiles`: um perfil por (usuário, conta), não por usuário
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_user_id_account_id_key'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_user_id_account_id_key UNIQUE (user_id, account_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_user_id_key'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_user_id_key;
  END IF;
END $$;

-- Decisão 3 de Max: dono de duas clínicas. `handle_new_user` continua
-- criando UMA conta por cadastro; a segunda titularidade só nasce por
-- transferência, que já exige o perfil na conta de destino.
DROP INDEX IF EXISTS public.idx_accounts_one_per_owner;
CREATE INDEX IF NOT EXISTS idx_accounts_owner_user ON public.accounts(owner_user_id);

-- ---------------------------------------------------------------------
-- §2 — `public.active_accounts`: a escolha de clínica de cada sessão
-- ---------------------------------------------------------------------
-- Sem chave para `profiles` DE PROPÓSITO: uma chave com `ON DELETE CASCADE`
-- apagaria a escolha quando o perfil sai, e a regra de resolução cairia no
-- "perfil único" — exatamente a troca silenciosa de clínica que a regra
-- existe para impedir. A escolha órfã fica, e `active_account_id()` a lê
-- como NULL.
CREATE TABLE IF NOT EXISTS public.active_accounts (
  session_id  UUID PRIMARY KEY REFERENCES auth.sessions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  chosen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_active_accounts_user ON public.active_accounts(user_id);

ALTER TABLE public.active_accounts ENABLE ROW LEVEL SECURITY;

-- Nenhuma política: ninguém lê nem escreve direto. A escrita é só
-- `set_active_account()`, que confere o vínculo; a leitura é só
-- `active_account_id()`. Toda tabela nova em `public` nasce com privilégio
-- de fábrica para `anon` (instrucoes.md §5) — revogado nominalmente.
REVOKE ALL ON public.active_accounts FROM PUBLIC;
REVOKE ALL ON public.active_accounts FROM anon;
REVOKE ALL ON public.active_accounts FROM authenticated;
GRANT ALL ON public.active_accounts TO service_role;

-- ---------------------------------------------------------------------
-- §3 — A resolução e as três portas
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.active_account_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH escolha AS (
    SELECT a.account_id
    FROM public.active_accounts a
    WHERE a.session_id = NULLIF(auth.jwt() ->> 'session_id', '')::uuid
      AND a.user_id = auth.uid()
  )
  SELECT CASE
    -- Há escolha nesta sessão: vale ela, se o perfil ainda existir.
    WHEN EXISTS (SELECT 1 FROM escolha) THEN
      (SELECT e.account_id FROM escolha e
        WHERE EXISTS (SELECT 1 FROM public.profiles p
                      WHERE p.user_id = auth.uid() AND p.account_id = e.account_id))
    -- Sem escolha: só o perfil ÚNICO resolve sozinho.
    ELSE
      (SELECT (array_agg(p.account_id))[1] FROM public.profiles p
        WHERE p.user_id = auth.uid()
        HAVING count(*) = 1)
  END;
$$;

COMMENT ON FUNCTION public.active_account_id() IS
  'Conta ativa do chamador (Subetapa 03.9): a escolhida nesta sessão (session_id do JWT), se o perfil ainda existir; senão, o perfil único; com dois perfis e sem escolha, NULL — e toda autorização nega.';

ALTER FUNCTION public.active_account_id() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.active_account_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.active_account_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.active_account_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_active_account(p_account_id UUID)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sessao UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Escolher a clínica exige sessão autenticada.' USING ERRCODE = '42501';
  END IF;

  v_sessao := NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
  IF v_sessao IS NULL THEN
    RAISE EXCEPTION 'Esta sessão não tem identificador — a escolha de clínica vale por sessão.' USING ERRCODE = '42501';
  END IF;

  IF p_account_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.account_id = p_account_id
  ) THEN
    RAISE EXCEPTION 'Você não pertence a esta clínica.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.active_accounts (session_id, user_id, account_id, chosen_at)
  VALUES (v_sessao, auth.uid(), p_account_id, NOW())
  ON CONFLICT (session_id) DO UPDATE
    SET account_id = EXCLUDED.account_id, chosen_at = NOW()
    -- A sessão é de quem a abriu: nunca reescreve a escolha de outro usuário.
    WHERE public.active_accounts.user_id = EXCLUDED.user_id;

  RETURN p_account_id;
END;
$$;

ALTER FUNCTION public.set_active_account(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_active_account(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_active_account(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_active_account(UUID) TO authenticated, service_role;

-- O ÚNICO caminho que atravessa as clínicas da pessoa, e só com o que o
-- seletor precisa: o nome de cada clínica e o papel dela ali.
CREATE OR REPLACE FUNCTION public.my_accounts()
RETURNS TABLE (account_id UUID, account_name TEXT, account_role public.account_role_enum, is_active BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.account_id, a.name, p.account_role, p.account_id = public.active_account_id()
  FROM public.profiles p
  JOIN public.accounts a ON a.id = p.account_id
  WHERE p.user_id = auth.uid()
  ORDER BY a.name, p.account_id;
$$;

ALTER FUNCTION public.my_accounts() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.my_accounts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_accounts() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_accounts() TO authenticated, service_role;

-- O perfil da conta ativa — para a tela e para as Edge Functions, que
-- antes liam `profiles` por `user_id` com `service_role` e passariam a
-- pegar uma clínica qualquer.
CREATE OR REPLACE FUNCTION public.active_membership()
RETURNS TABLE (profile_id UUID, account_id UUID, account_role public.account_role_enum, full_name TEXT, email TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.account_id, p.account_role, p.full_name, p.email
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
    AND p.account_id = public.active_account_id();
$$;

ALTER FUNCTION public.active_membership() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.active_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.active_membership() FROM anon;
GRANT EXECUTE ON FUNCTION public.active_membership() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §4 — `is_account_member`: o ponto único da cirurgia
-- ---------------------------------------------------------------------
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
      -- Subetapa 03.9: membro da conta ATIVA, não de "qualquer conta do
      -- usuário". Sem esta linha, quem pertence a duas clínicas enxerga as
      -- duas ao mesmo tempo em toda política do produto.
      AND p.account_id = public.active_account_id()
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
REVOKE ALL ON FUNCTION public.is_account_member(UUID, public.account_role_enum) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_account_member(UUID, public.account_role_enum) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §5 — As políticas do núcleo que olhavam só `auth.uid()`
-- ---------------------------------------------------------------------
-- `profiles`: o ramo `auth.uid() = user_id` mostrava o próprio perfil em
-- TODAS as clínicas — conta, papel e existência da outra. O próprio perfil
-- da conta ativa continua visível por `is_account_member`; as outras
-- clínicas só aparecem pelo seletor (`my_accounts`).
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT
  USING (public.is_account_member(account_id));

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id AND public.is_account_member(account_id))
  WITH CHECK (auth.uid() = user_id AND public.is_account_member(account_id));

-- `notifications`: a notificação é da pessoa, mas o CONTEÚDO é da clínica
-- ("Paciente X atribuído a você"). Com a sessão em B, nada de M.
DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications FOR SELECT
  USING (auth.uid() = user_id AND public.is_account_member(account_id));

DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id AND public.is_account_member(account_id))
  WITH CHECK (auth.uid() = user_id AND public.is_account_member(account_id));

-- ---------------------------------------------------------------------
-- §6 — Presença por clínica
-- ---------------------------------------------------------------------
-- A chave era só `user_id`: estar online em B apagaria a presença em M e a
-- mostraria na clínica errada. Passa a `(user_id, account_id)`, amarrada ao
-- perfil — quem sai da clínica sai da presença dela.
DO $$
DECLARE
  v_pk TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_pk
  FROM pg_constraint WHERE conrelid = 'public.member_presence'::regclass AND contype = 'p';

  IF v_pk IS DISTINCT FROM 'PRIMARY KEY (user_id, account_id)' THEN
    ALTER TABLE public.member_presence DROP CONSTRAINT IF EXISTS member_presence_pkey;
    ALTER TABLE public.member_presence ADD CONSTRAINT member_presence_pkey PRIMARY KEY (user_id, account_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.member_presence'::regclass AND conname = 'member_presence_perfil_fkey'
  ) THEN
    -- Presença de quem já não é membro (resíduo anterior) sai antes da chave.
    DELETE FROM public.member_presence mp
     WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = mp.user_id AND p.account_id = mp.account_id);
    ALTER TABLE public.member_presence
      ADD CONSTRAINT member_presence_perfil_fkey
      FOREIGN KEY (user_id, account_id) REFERENCES public.profiles(user_id, account_id) ON DELETE CASCADE;
  END IF;
END $$;

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

  -- Subetapa 03.9: a presença é marcada na clínica ATIVA desta sessão.
  v_account_id := public.active_account_id();

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Sem clínica ativa nesta sessão' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.member_presence (user_id, account_id, status, last_seen_at)
  VALUES (auth.uid(), v_account_id, p_status, NOW())
  ON CONFLICT (user_id, account_id) DO UPDATE
    SET status = EXCLUDED.status, last_seen_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.touch_presence(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_presence(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.touch_presence(TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §7 — VERIFICAÇÕES QUE RECUSAM A MIGRATION
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_sobra TEXT;
BEGIN
  -- (a) a UNIQUE antiga saiu e a nova está de pé
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.profiles'::regclass
             AND pg_get_constraintdef(oid) = 'UNIQUE (user_id)') THEN
    RAISE EXCEPTION '(a) profiles ainda tem UNIQUE (user_id).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.profiles'::regclass
                 AND pg_get_constraintdef(oid) = 'UNIQUE (user_id, account_id)') THEN
    RAISE EXCEPTION '(a) profiles sem UNIQUE (user_id, account_id).';
  END IF;

  -- (b) dono de duas clínicas é possível
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_accounts_one_per_owner') THEN
    RAISE EXCEPTION '(b) idx_accounts_one_per_owner continua de pé.';
  END IF;

  -- (c) ninguém de fora do servidor toca a conta ativa
  IF has_table_privilege('authenticated', 'public.active_accounts', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('anon', 'public.active_accounts', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION '(c) active_accounts com privilégio para authenticated/anon.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'active_accounts') THEN
    RAISE EXCEPTION '(c) active_accounts ganhou política — a escrita é só pela função.';
  END IF;

  -- (d) nenhuma porta nova executável por anon
  SELECT string_agg(f, ', ') INTO v_sobra
  FROM unnest(ARRAY['public.active_account_id()', 'public.set_active_account(uuid)', 'public.my_accounts()',
                    'public.active_membership()', 'public.is_account_member(uuid, public.account_role_enum)',
                    'public.touch_presence(text)']) f
  WHERE has_function_privilege('anon', f, 'EXECUTE');
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION '(d) executável por anon: %', v_sobra;
  END IF;

  -- (e) is_account_member compara com a conta ativa
  IF pg_get_functiondef('public.is_account_member(uuid, public.account_role_enum)'::regprocedure) !~ 'active_account_id\(\)' THEN
    RAISE EXCEPTION '(e) is_account_member não consulta a conta ativa.';
  END IF;

  -- (f) as políticas do núcleo que olhavam só auth.uid() ganharam cerca
  SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_sobra
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename IN ('profiles', 'notifications')
    AND coalesce(qual, '') || coalesce(with_check, '') !~ 'is_account_member';
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION '(f) política sem cerca de conta ativa: %', v_sobra;
  END IF;

  -- (g) presença por clínica
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid = 'public.member_presence'::regclass AND contype = 'p') <> 'PRIMARY KEY (user_id, account_id)' THEN
    RAISE EXCEPTION '(g) member_presence ainda chaveada só por user_id.';
  END IF;
END $$;
