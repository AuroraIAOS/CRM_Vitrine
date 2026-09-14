-- =====================================================================
-- 056 — Multiunidade, parte 2: toda função passa pela conta ativa, a
--       gestão de membro não atravessa clínica, e o convite é híbrido
--       (Subetapa 03.9 — portão completo)
--
-- ============================================================
-- O QUE O BENCH MEDIU ANTES DESTA MIGRATION (054 e 055 aplicadas)
-- ============================================================
-- Com a `UNIQUE (user_id)` fora e as funções ainda antigas, a suíte
-- `24_adversarial_multiunidade.spec.ts` mostrou, no banco de testes:
--
--   · `ler_evolucoes(paciente de M)`, chamada pela sessão ativa em B — onde
--     a pessoa é AGENT, sem alcance clínico —, devolveu a evolução INTEIRA
--     de M (21 campos). A função descobria a conta com
--     `SELECT ... INTO ... FROM profiles WHERE user_id = ...`, e o PL/pgSQL
--     entrega a primeira linha sem erro: caiu no perfil de M, onde a pessoa
--     é owner. É o vetor obrigatório do portão, acontecendo.
--   · `set_member_role` e `transfer_account_ownership` atualizavam
--     `profiles WHERE user_id = p_user_id` — sem conta. Rebaixar alguém numa
--     clínica rebaixaria em todas; transferir a titularidade faria a pessoa
--     virar owner de TODAS as clínicas dela.
--
-- A 054 corrigiu `is_account_member` e a 055 `access.can` e `pode_acessar`.
-- Esta migration corrige o resto — 23 funções de leitura, cálculo e identidade (a busca
-- da conta ganha o filtro da conta ativa, em uma linha, e mais nada) e as
-- cinco de equipe, reescritas por completo. A 057 guarda o padrão.
--
-- ============================================================
-- O CONVITE HÍBRIDO (decisão 2 de Max, 2026-09-14)
-- ============================================================
--   · A conta de origem é SOLITÁRIA E VAZIA (o caso de todo cadastro: a
--     `handle_new_user` cria uma conta para cada login) → o perfil MIGRA e a
--     conta de origem é apagada, como a 037 já fazia. Funcionário convidado
--     não ganha seletor de clínica à toa.
--   · Qualquer outro caso (a pessoa já tem clínica com dado, já é membro de
--     outra clínica, ou já tem mais de um perfil) → nasce um perfil NOVO na
--     clínica que convidou. Antes, esses casos eram RECUSADOS ("cadastre-se
--     com outro e-mail"); é exatamente a multiunidade que o item 24 pede.
--
-- Fecho de um defeito que a leitura achou de passagem: a 037 migrava o
-- perfil do OWNER mesmo quando a conta de origem tinha OUTROS MEMBROS
-- (checava só dado de domínio) — e o `DELETE FROM public.accounts` levava os
-- perfis deles em cascata. "Solitária" agora é conferido.
--
-- ============================================================
-- A REMOÇÃO DE MEMBRO, pela mesma régua
-- ============================================================
--   · O removido tem OUTRA clínica → o perfil desta clínica sai, com o
--     funcionário e o profissional daqui desvinculados como a 038 faz no
--     `BEFORE UPDATE OF account_id`. Nenhuma conta nasce.
--   · O removido só tinha esta clínica → ganha conta pessoal nova, como antes
--     (sem isso ele perderia o login útil).
--
-- ============================================================
-- A ÚLTIMA POLÍTICA SEM CERCA: `aba_health.formularios_anamnese`
-- ============================================================
-- Achado desta subetapa, MEDIDO antes de escrito (`CLAUDE.md` §11), e ele
-- existe desde a 013 — não nasce da multiunidade. As três políticas eram
-- `pode_acessar(NULL, ...)` e nunca comparavam o `account_id` da linha. Com
-- `cliente_id` nulo, `pode_acessar` responde "esta pessoa enxerga prontuário
-- EM GERAL, na conta dela" — e o owner de QUALQUER clínica recebe "sim".
-- Numa transação desfeita no banco de testes, o owner de uma conta recém-
-- criada leu o formulário de outra conta e o ALTEROU (`UPDATE` = 1 linha).
-- Formulário de anamnese não é dado de paciente (é o questionário), mas é
-- configuração clínica de outra clínica, legível e gravável por estranho.
-- A varredura de catálogo que achou isto virou a guarda
-- `politicas_sem_cerca_de_conta()` da 057.
--
-- Idempotente — seguro rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §1 — `formularios_anamnese`: a cerca de conta que faltava desde a 013
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS formularios_anamnese_select ON aba_health.formularios_anamnese;
CREATE POLICY formularios_anamnese_select ON aba_health.formularios_anamnese FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND aba_health.pode_acessar(NULL, 'leitura'));

DROP POLICY IF EXISTS formularios_anamnese_insert ON aba_health.formularios_anamnese;
CREATE POLICY formularios_anamnese_insert ON aba_health.formularios_anamnese FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'viewer') AND aba_health.pode_acessar(NULL, 'criacao'));

DROP POLICY IF EXISTS formularios_anamnese_update ON aba_health.formularios_anamnese;
CREATE POLICY formularios_anamnese_update ON aba_health.formularios_anamnese FOR UPDATE
  USING (public.is_account_member(account_id, 'viewer') AND aba_health.pode_acessar(NULL, 'atualizacao'))
  WITH CHECK (public.is_account_member(account_id, 'viewer') AND aba_health.pode_acessar(NULL, 'atualizacao'));

-- ---------------------------------------------------------------------
-- §2 — Equipe: toda operação é na conta ATIVA e sobre o perfil DAQUELA conta
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_convite(p_role public.account_role_enum, p_label text DEFAULT NULL::text, p_dias_validade integer DEFAULT 7)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_account_id UUID;
  v_role_atual public.account_role_enum;
  v_token TEXT;
  v_token_hash TEXT;
  v_invitation_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  -- Subetapa 03.9: o papel que convida é o da conta ATIVA.
  SELECT account_id, account_role INTO v_account_id, v_role_atual
  FROM public.profiles WHERE user_id = auth.uid() AND account_id = public.active_account_id();

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Chamador sem conta' USING ERRCODE = '42501';
  END IF;

  IF v_role_atual NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Requer papel admin ou superior' USING ERRCODE = '42501';
  END IF;

  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'Convite não pode conceder papel owner — use transfer_account_ownership após o aceite' USING ERRCODE = '22023';
  END IF;

  -- 256 bits de entropia (extensions.gen_random_bytes, pgcrypto) — mesmo
  -- padrão do Maximus original, só que gerado no banco em vez do
  -- servidor Next.js que aqui não existe.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  -- TETO DE 7 DIAS (Subetapa 02.15). Piso de 1 dia preservado. Pedir mais
  -- que 7 não é erro — é silenciosamente reduzido ao teto, porque quem
  -- convida não deveria precisar saber da regra para estar protegido por
  -- ela, e recusar a chamada só empurraria o operador a tentar de novo.
  v_expires_at := now() + make_interval(days => least(greatest(p_dias_validade, 1), 7));

  INSERT INTO public.account_invitations
    (account_id, token_hash, role, created_by_user_id, label, expires_at)
  VALUES
    (v_account_id, v_token_hash, p_role, auth.uid(), p_label, v_expires_at)
  RETURNING id INTO v_invitation_id;

  -- O token em claro só existe neste retorno — nunca gravado, nunca
  -- recuperável depois (token_hash tem narrowing de coluna, migration 022).
  RETURN json_build_object(
    'ok', true,
    'invitation_id', v_invitation_id,
    'token', v_token,
    'role', p_role,
    'expires_at', v_expires_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_member_role(p_user_id uuid, p_new_role public.account_role_enum)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller_account_id UUID;
  v_caller_role public.account_role_enum;
  v_target_profile_id UUID;
  v_target_role public.account_role_enum;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  -- Subetapa 03.9: quem altera age na conta ATIVA.
  SELECT account_id, account_role INTO v_caller_account_id, v_caller_role
  FROM public.profiles WHERE user_id = auth.uid() AND account_id = public.active_account_id();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Chamador sem conta' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Requer papel admin ou superior' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Não é possível alterar o próprio papel' USING ERRCODE = '22023';
  END IF;

  -- Subetapa 03.9: o perfil do alvo NESTA conta. A versão anterior lia o
  -- alvo por `user_id` (primeira linha qualquer) e atualizava TODAS as
  -- linhas dele — rebaixar numa clínica rebaixava em todas.
  SELECT id, account_role INTO v_target_profile_id, v_target_role
  FROM public.profiles WHERE user_id = p_user_id AND account_id = v_caller_account_id;

  IF v_target_profile_id IS NULL THEN
    RAISE EXCEPTION 'Usuário alvo não pertence à sua conta' USING ERRCODE = '42501';
  END IF;

  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Use transfer_account_ownership para rebaixar um owner' USING ERRCODE = '22023';
  END IF;
  IF p_new_role = 'owner' THEN
    RAISE EXCEPTION 'Use transfer_account_ownership para promover a owner' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles SET account_role = p_new_role WHERE id = v_target_profile_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.transfer_account_ownership(p_new_owner_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller_account_id UUID;
  v_caller_profile_id UUID;
  v_caller_role public.account_role_enum;
  v_target_profile_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  -- Subetapa 03.9: transfere a conta ATIVA, e só ela.
  SELECT id, account_id, account_role INTO v_caller_profile_id, v_caller_account_id, v_caller_role
  FROM public.profiles WHERE user_id = auth.uid() AND account_id = public.active_account_id();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Chamador sem conta' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Só o owner da conta pode transferir a titularidade' USING ERRCODE = '42501';
  END IF;

  IF p_new_owner_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Você já é o owner' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_target_profile_id
  FROM public.profiles WHERE user_id = p_new_owner_user_id AND account_id = v_caller_account_id;

  IF v_target_profile_id IS NULL THEN
    RAISE EXCEPTION 'Usuário alvo não pertence à sua conta' USING ERRCODE = '42501';
  END IF;

  -- Rebaixa o owner atual antes de promover o novo — a conta nunca
  -- fica com zero owners visível, os dois UPDATEs saem na mesma
  -- transação da função. Subetapa 03.9: pelo ID do perfil DESTA conta —
  -- por `user_id` a pessoa viraria owner de todas as clínicas dela.
  UPDATE public.profiles SET account_role = 'admin' WHERE id = v_caller_profile_id;
  UPDATE public.profiles SET account_role = 'owner' WHERE id = v_target_profile_id;
  UPDATE public.accounts SET owner_user_id = p_new_owner_user_id WHERE id = v_caller_account_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_account_member(p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller_account_id UUID;
  v_caller_role public.account_role_enum;
  v_target_profile_id UUID;
  v_target_role public.account_role_enum;
  v_target_name TEXT;
  v_target_email TEXT;
  v_new_account_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  -- Subetapa 03.9: remove da conta ATIVA.
  SELECT account_id, account_role INTO v_caller_account_id, v_caller_role
  FROM public.profiles WHERE user_id = auth.uid() AND account_id = public.active_account_id();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Chamador sem conta' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Requer papel admin ou superior' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Não é possível remover a si mesmo — transfira a titularidade ou saia da conta' USING ERRCODE = '22023';
  END IF;

  SELECT id, account_role, full_name, email
  INTO v_target_profile_id, v_target_role, v_target_name, v_target_email
  FROM public.profiles WHERE user_id = p_user_id AND account_id = v_caller_account_id;

  IF v_target_profile_id IS NULL THEN
    RAISE EXCEPTION 'Usuário alvo não pertence à sua conta' USING ERRCODE = '42501';
  END IF;

  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Não é possível remover o owner da conta — transfira a titularidade primeiro' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user_id AND account_id <> v_caller_account_id) THEN
    -- Subetapa 03.9: o removido tem outra clínica. O perfil DESTA sai, e os
    -- vínculos daqui ficam como retrato de ex-membro — a mesma semântica da
    -- `desvincular_perfil_da_conta_antiga` (038), aplicada aqui porque um
    -- DELETE não dispara o gatilho de UPDATE OF account_id. Nenhuma conta
    -- nasce; a escolha de clínica de sessões dele que apontava para cá passa
    -- a resolver NULL (054), nunca para a outra clínica em silêncio.
    UPDATE aba_people.funcionarios
       SET ativo = FALSE, profile_id = NULL, atualizado_em = now()
     WHERE account_id = v_caller_account_id AND profile_id = v_target_profile_id;
    UPDATE aba_scheduling.profissionais
       SET profile_id = NULL
     WHERE account_id = v_caller_account_id AND profile_id = v_target_profile_id;
    UPDATE aba_people.pessoa_notas
       SET autor_id = NULL
     WHERE account_id = v_caller_account_id AND autor_id = v_target_profile_id;

    DELETE FROM public.profiles WHERE id = v_target_profile_id;
    RETURN NULL;
  END IF;

  -- Conta pessoal nova para o removido — espelho de handle_new_user.
  -- O trigger de nascimento de funcionário (Parte 3) reage ao
  -- UPDATE OF account_id abaixo e desativa o funcionário na conta
  -- antiga automaticamente.
  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(NULLIF(v_target_name, ''), v_target_email, 'Minha conta'), p_user_id)
  RETURNING id INTO v_new_account_id;

  UPDATE public.profiles
  SET account_id = v_new_account_id, account_role = 'owner'
  WHERE id = v_target_profile_id;

  RETURN v_new_account_id;
END;
$function$;

-- ---------------------------------------------------------------------
-- §3 — O convite híbrido
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resgatar_convite(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_token_hash TEXT;
  v_inv public.account_invitations%ROWTYPE;
  v_perfis INTEGER;
  v_old_account_id UUID;
  v_old_account_owner UUID;
  v_old_profile_id UUID;
  v_solitaria BOOLEAN := FALSE;
  v_tem_dado BOOLEAN := TRUE;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_inv FROM public.account_invitations
  WHERE token_hash = v_token_hash FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite não encontrado' USING ERRCODE = '22023';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Convite já foi resgatado' USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at <= now() THEN
    RAISE EXCEPTION 'Convite expirado' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_perfis FROM public.profiles WHERE user_id = v_caller_id;

  IF v_perfis = 0 THEN
    RAISE EXCEPTION 'Chamador sem perfil' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_caller_id AND account_id = v_inv.account_id) THEN
    RAISE EXCEPTION 'Você já é membro desta conta' USING ERRCODE = '23505';
  END IF;

  -- Subetapa 03.9 — decisão 2 de Max: a MIGRAÇÃO só vale para o perfil
  -- único, dono de uma conta sem outros membros e sem dado de domínio.
  IF v_perfis = 1 THEN
    SELECT p.id, p.account_id, a.owner_user_id
      INTO v_old_profile_id, v_old_account_id, v_old_account_owner
    FROM public.profiles p JOIN public.accounts a ON a.id = p.account_id
    WHERE p.user_id = v_caller_id;

    v_solitaria := v_old_account_owner = v_caller_id
      AND NOT EXISTS (SELECT 1 FROM public.profiles o
                      WHERE o.account_id = v_old_account_id AND o.user_id <> v_caller_id);

    IF v_solitaria THEN
      SELECT EXISTS (
        SELECT 1 FROM aba_people.leads WHERE account_id = v_old_account_id
        UNION ALL SELECT 1 FROM aba_people.clientes WHERE account_id = v_old_account_id
        UNION ALL SELECT 1 FROM aba_people.fornecedores WHERE account_id = v_old_account_id
        UNION ALL SELECT 1 FROM aba_catalog.procedimentos WHERE account_id = v_old_account_id
        UNION ALL SELECT 1 FROM aba_catalog.pacotes WHERE account_id = v_old_account_id
        UNION ALL SELECT 1 FROM aba_automations.automacoes WHERE account_id = v_old_account_id
        UNION ALL SELECT 1 FROM aba_automations.fluxos WHERE account_id = v_old_account_id
        UNION ALL SELECT 1 FROM aba_ai.ia_documentos_conhecimento WHERE account_id = v_old_account_id
        LIMIT 1
      ) INTO v_tem_dado;
    END IF;
  END IF;

  IF v_solitaria AND NOT v_tem_dado THEN
    -- ------------------------------------------------------------------
    -- Limpar vínculos da conta de ORIGEM antes de mover o perfil.
    -- Necessário desde a `035`: as chaves para `public.profiles` passaram
    -- a ser `(profile_id, account_id)`, e o perfil está prestes a trocar
    -- de `account_id`. Estas linhas pertencem à conta antiga, que é
    -- apagada no fim desta mesma função.
    -- ------------------------------------------------------------------
    DELETE FROM aba_scheduling.profissionais
     WHERE account_id = v_old_account_id AND profile_id = v_old_profile_id;

    DELETE FROM aba_people.funcionarios
     WHERE account_id = v_old_account_id AND profile_id = v_old_profile_id;

    UPDATE aba_people.pessoa_notas
       SET autor_id = NULL
     WHERE account_id = v_old_account_id AND autor_id = v_old_profile_id;

    UPDATE public.profiles
    SET account_id = v_inv.account_id, account_role = v_inv.role
    WHERE id = v_old_profile_id;

    UPDATE public.account_invitations
    SET accepted_at = now(), accepted_by_user_id = v_caller_id
    WHERE id = v_inv.id;

    DELETE FROM public.accounts WHERE id = v_old_account_id;

    RETURN v_inv.account_id;
  END IF;

  -- Subetapa 03.9: a pessoa já tem uso real em outra clínica — ganha um
  -- perfil NOVO aqui, e a clínica de origem fica intacta. O teto de
  -- assentos (002) e o nascimento do funcionário (024/038) reagem ao
  -- INSERT como a qualquer perfil novo.
  INSERT INTO public.profiles (user_id, account_id, account_role, full_name, email)
  SELECT v_caller_id, v_inv.account_id, v_inv.role, p.full_name, p.email
  FROM public.profiles p
  WHERE p.user_id = v_caller_id
  ORDER BY p.created_at
  LIMIT 1;

  UPDATE public.account_invitations
  SET accepted_at = now(), accepted_by_user_id = v_caller_id
  WHERE id = v_inv.id;

  RETURN v_inv.account_id;
END;
$function$;

COMMENT ON FUNCTION public.resgatar_convite(text) IS
  'Resgata convite de equipe (Subetapa 03.9, convite híbrido): perfil único dono de conta solitária e vazia migra e a conta de origem é apagada; em qualquer outro caso nasce um perfil novo na conta que convidou e a de origem fica intacta.';

-- ---------------------------------------------------------------------
-- §4 — As 23 funções de leitura, cálculo e identidade: a busca da conta do chamador
--      ganha o filtro da conta ativa, e NADA MAIS muda nelas
-- ---------------------------------------------------------------------
-- Texto de cada função = a definição vigente (a da última migration que a
-- criou), com UMA linha alterada, marcada "Subetapa 03.9". `CREATE OR
-- REPLACE` preserva dono, privilégio e comentário de cada uma.

-- licensing.seat_usage
CREATE OR REPLACE FUNCTION licensing.seat_usage()
 RETURNS TABLE(max_users integer, used_seats integer, remaining_seats integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_account_id UUID;
  v_max        INTEGER;
  v_used       INTEGER;
BEGIN
  SELECT p.account_id INTO v_account_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.account_id = public.active_account_id(); -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha
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
$function$
;

-- aba_automations.listar_execucoes_pendentes
CREATE OR REPLACE FUNCTION aba_automations.listar_execucoes_pendentes()
 RETURNS TABLE(id uuid, automacao_id uuid, status text, executar_em timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_account_id UUID;
BEGIN
  SELECT p.account_id INTO v_account_id
  FROM public.profiles p WHERE p.user_id = auth.uid() AND p.account_id = public.active_account_id(); -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha

  IF v_account_id IS NULL
     OR NOT (public.is_account_member(v_account_id, 'viewer') AND access.can('automations', 'read')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT e.id, e.automacao_id, e.status, e.executar_em
  FROM aba_automations.automacao_execucoes_pendentes e
  -- A fronteira de conta é ESTE filtro. Sem ele, a função devolveria a
  -- fila de todos os inquilinos — SECURITY DEFINER não passa por RLS.
  WHERE e.account_id = v_account_id
  ORDER BY e.executar_em;
END;
$function$
;

-- aba_automations.listar_jobs_agendados
CREATE OR REPLACE FUNCTION aba_automations.listar_jobs_agendados()
 RETURNS TABLE(jobid bigint, jobname text, schedule text, command text, active boolean, ultima_execucao timestamp with time zone, ultimo_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_account_id UUID;
BEGIN
  SELECT p.account_id INTO v_account_id
  FROM public.profiles p WHERE p.user_id = auth.uid() AND p.account_id = public.active_account_id(); -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha

  -- Falha fechada: sem perfil, sem conta, sem papel suficiente → conjunto
  -- vazio, nunca erro. Erro distinguiria "não pode ver" de "não existe".
  IF v_account_id IS NULL OR NOT public.is_account_member(v_account_id, 'admin') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    j.jobid,
    j.jobname::TEXT,
    j.schedule::TEXT,
    j.command::TEXT,
    j.active,
    d.start_time,
    d.status::TEXT
  FROM cron.job j
  -- Última corrida de cada job. Os jobs são globais do banco (não têm
  -- account_id): é infraestrutura compartilhada, e por isso a checagem
  -- acima é de papel, não de pertencimento a conta.
  LEFT JOIN LATERAL (
    SELECT r.start_time, r.status
    FROM cron.job_run_details r
    WHERE r.jobid = j.jobid
    ORDER BY r.start_time DESC
    LIMIT 1
  ) d ON TRUE
  ORDER BY j.jobname;
END;
$function$
;

-- aba_catalog.semear_procedimentos_sigtap
CREATE OR REPLACE FUNCTION aba_catalog.semear_procedimentos_sigtap()
 RETURNS TABLE(inseridos integer, ja_existentes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_account_id UUID;
  v_categoria_id UUID;
  v_inseridos INT := 0;
  v_ja_existentes INT := 0;
  r RECORD;
BEGIN
  SELECT account_id INTO v_account_id FROM public.profiles WHERE user_id = v_user_id AND account_id = public.active_account_id(); -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Sem conta associada ao usuário' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.is_account_member(v_account_id, 'agent') AND access.can('catalog', 'create')) THEN
    RAISE EXCEPTION 'Sem permissão para semear o catálogo' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_categoria_id
  FROM aba_catalog.categorias
  WHERE account_id = v_account_id AND nome = 'Procedimentos SIGTAP (Atenção Básica)';

  IF v_categoria_id IS NULL THEN
    INSERT INTO aba_catalog.categorias (account_id, nome, cor, posicao)
    VALUES (v_account_id, 'Procedimentos SIGTAP (Atenção Básica)', '#0ea5e9', 999)
    RETURNING id INTO v_categoria_id;
  END IF;

  -- Os 64 procedimentos de design/benchmark/fontes/SIGTAP.xlsx, gerados
  -- programaticamente do arquivo na Subetapa 03.6 (nenhuma linha
  -- digitada à mão). Código, nome, unidade e quantidade máxima
  -- inalterados; `faces_min`/`faces_max`/`regiao` acrescentados.
  FOR r IN
    SELECT * FROM (VALUES
      ('02.04.01.016-0', 'Radiografia oclusal', 'arcada', 2, NULL::SMALLINT, NULL::SMALLINT, NULL::TEXT),
      ('03.07.04.001-1', 'Colocacao de placa de mordida', 'arcada', 2, NULL, NULL, NULL),
      ('03.07.04.012-7', 'Manutenção/conserto de aparelho ortodôntico/ortopédico', 'arcada', 2, NULL, NULL, NULL),
      ('04.04.02.044-5', 'Contenção de dentes por splintagem', 'arcada', 2, NULL, NULL, NULL),
      ('04.04.02.061-5', 'Redução de luxação têmporo-mandibular', 'arcada', 2, NULL, NULL, NULL),
      ('04.04.02.062-3', 'Retirada de material de síntese óssea / dentária', 'arcada', 2, NULL, NULL, NULL),
      ('04.14.01.036-1', 'Exerese de cisto odontogênico e não-odontogênico', 'arcada', 2, NULL, NULL, NULL),
      ('04.14.01.038-8', 'Tratamento cirúrgico de fístula intra / extraoral', 'arcada', 2, NULL, NULL, NULL),
      ('04.14.02.004-9', 'Correção de bridas musculares', 'arcada', 2, NULL, NULL, NULL),
      ('04.14.02.005-7', 'Correção de irregularidades de rebordo alveolar', 'arcada', 2, NULL, NULL, NULL),
      ('04.14.02.029-4', 'Remoção de torus e exostoses', 'arcada', 2, NULL, NULL, NULL),
      ('07.01.07.006-4', 'Mantenedor de espaço', 'arcada', 2, NULL, NULL, NULL),
      ('07.01.07.007-2', 'Placa oclusal', 'arcada', 2, NULL, NULL, NULL),
      ('07.01.07.008-0', 'Plano inclinado', 'arcada', 2, NULL, NULL, NULL),
      ('07.01.07.009-9', 'Protese parcial mandibular removivel', 'arcada', 2, NULL, NULL, NULL),
      ('07.01.07.010-2', 'Protese parcial maxilar removivel', 'arcada', 2, NULL, NULL, NULL),
      ('07.01.07.011-0', 'Protese temporaria', 'arcada', 2, NULL, NULL, NULL),
      ('07.01.07.012-9', 'Protese total mandibular', 'arcada', 2, NULL, NULL, NULL),
      ('07.01.07.013-7', 'Protese total maxilar', 'arcada', 2, NULL, NULL, NULL),
      ('01.01.02.005-8', 'Aplicação de cariostático (por dente)', 'dente', 32, NULL, NULL, NULL),
      ('01.01.02.006-6', 'Aplicação de selante (por dente)', 'dente', 32, NULL, NULL, NULL),
      ('01.01.02.009-0', 'Selamento provisório de cavidade dentária', 'dente', 32, NULL, NULL, NULL),
      ('02.04.01.018-7', 'Radiografia peri-apical interproximal (bite-wing)', 'dente', 32, NULL, NULL, NULL),
      ('03.07.01.001-5', 'Capeamento pulpar', 'dente', 32, NULL, NULL, NULL),
      -- As três únicas com regra de forma: a descrição oficial diz
      -- "por face" e, em duas delas, diz também a região.
      ('03.07.01.002-3', 'Restauração de dente decíduo', 'dente', 32, 1, 5, 'ambas'),
      ('03.07.01.003-1', 'Restauração de dente permanente anterior', 'dente', 32, 1, 5, 'anterior'),
      ('03.07.01.004-0', 'Restauração de dente permanente posterior', 'dente', 32, 1, 5, 'posterior'),
      ('03.07.02.001-0', 'Acesso a polpa dentaria e medicacao (por dente)', 'dente', 32, NULL, NULL, NULL),
      ('03.07.02.002-9', 'Curativo de demora c/ ou s/ preparo biomecanico', 'dente', 32, NULL, NULL, NULL),
      ('03.07.02.003-7', 'Obturação de dente decíduo', 'dente', 32, NULL, NULL, NULL),
      ('03.07.02.004-5', 'Obturação em dente permanente birradicular', 'dente', 32, NULL, NULL, NULL),
      ('03.07.02.005-3', 'Obturação em dente permanente com três ou mais raízes', 'dente', 32, NULL, NULL, NULL),
      ('03.07.02.006-1', 'Obturação em dente permanente unirradicular', 'dente', 32, NULL, NULL, NULL),
      ('03.07.02.007-0', 'Pulpotomia dentária', 'dente', 32, NULL, NULL, NULL),
      ('03.07.02.008-8', 'Retratamento endodôntico em dente permanente bi-radicular', 'dente', 32, NULL, NULL, NULL),
      ('03.07.02.009-6', 'Retratamento endodôntico em dente permanente com 3 ou mais raízes', 'dente', 32, NULL, NULL, NULL),
      ('03.07.02.010-0', 'Retratamento endodôntico em dente permanente uni-radicular', 'dente', 32, NULL, NULL, NULL),
      ('03.07.02.011-8', 'Selamento de perfuração radicular', 'dente', 32, NULL, NULL, NULL),
      ('03.07.04.007-0', 'Moldagem dento-gengival p/ construcao de protese dentaria', 'dente', 32, NULL, NULL, NULL),
      ('03.07.04.008-9', 'Reembasamento e conserto de protese dentaria', 'dente', 32, NULL, NULL, NULL),
      ('03.07.04.013-5', 'Cimentação de prótese dentária', 'dente', 32, NULL, NULL, NULL),
      ('03.07.04.014-3', 'Adaptação de prótese dentária', 'dente', 32, NULL, NULL, NULL),
      ('03.07.04.015-1', 'Ajuste oclusal', 'dente', 32, NULL, NULL, NULL),
      ('03.07.04.016-0', 'Instalação de prótese dentária', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.002-2', 'Apicectomia com ou sem obturação retrógrada', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.007-3', 'Curetagem periapical', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.012-0', 'Exodontia de dente decíduo', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.013-8', 'Exodontia de dente permanente', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.014-6', 'Exodontia múltipla com alveoloplastia por sextante', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.021-9', 'Odontosecção / radilectomia / tunelização', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.024-3', 'Reimplante e transplante dental (por elemento)', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.027-8', 'Remoção de dente retido (incluso / impactado)', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.036-7', 'Tratamento cirúrgico para tracionamento dental', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.038-3', 'Tratamento de alveolite', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.040-5', 'Ulotomia/ulectomia', 'dente', 32, NULL, NULL, NULL),
      ('07.01.07.005-6', 'Coroa provisoria', 'dente', 32, NULL, NULL, NULL),
      ('07.01.07.014-5', 'Proteses coronarias / intra-radiculares fixas / adesivas (por elemento)', 'dente', 32, NULL, NULL, NULL),
      ('03.07.03.001-6', 'Raspagem alisamento e polimento supragengivais (por sextante)', 'sextante', 6, NULL, NULL, NULL),
      ('03.07.03.002-4', 'Raspagem alisamento subgengivais (por sextante)', 'sextante', 6, NULL, NULL, NULL),
      ('03.07.03.005-9', 'Raspagem alisamento e polimento supragengivais (por sextante)', 'sextante', 6, NULL, NULL, NULL),
      ('04.14.02.003-0', 'Aprofundamento de vestíbulo oral (por sextante)', 'sextante', 6, NULL, NULL, NULL),
      ('04.14.02.015-4', 'Gengivectomia (por sextante)', 'sextante', 6, NULL, NULL, NULL),
      ('04.14.02.016-2', 'Gengivoplastia (por sextante)', 'sextante', 6, NULL, NULL, NULL),
      ('04.14.02.037-5', 'Tratamento cirúrgico periodontal (por sextante)', 'sextante', 6, NULL, NULL, NULL)
    ) AS t(codigo, nome, unidade, qtd_max, faces_min, faces_max, regiao)
  LOOP
    IF EXISTS (
      SELECT 1 FROM aba_catalog.procedimentos
      WHERE account_id = v_account_id AND codigo_sigtap = r.codigo
    ) THEN
      v_ja_existentes := v_ja_existentes + 1;
      CONTINUE;
    END IF;

    -- `aceita_faces` NÃO aparece aqui: é derivado pelo gatilho a partir
    -- de `faces_maximo`. Os três requisitos ficam no DEFAULT FALSE — o
    -- SIGTAP não declara nenhum deles, e a clínica configura.
    INSERT INTO aba_catalog.procedimentos (
      account_id, categoria_id, nome, codigo_sigtap, unidade_lancamento,
      quantidade_maxima, faces_minimo, faces_maximo, regiao_dentaria,
      duracao_padrao_minutos, preco_base, requer_profissional
    ) VALUES (
      v_account_id, v_categoria_id, r.nome, r.codigo, r.unidade,
      r.qtd_max, r.faces_min, r.faces_max, r.regiao,
      30, 0, TRUE
    );
    v_inseridos := v_inseridos + 1;
  END LOOP;

  RETURN QUERY SELECT v_inseridos, v_ja_existentes;
END;
$function$
;

-- aba_finance.conta_do_chamador
CREATE OR REPLACE FUNCTION aba_finance.conta_do_chamador(p_papel account_role_enum, p_acao text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_account_id UUID;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid() AND pf.account_id = public.active_account_id(); -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Esta operação do contrato exige sessão autenticada.' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_account_member(v_account_id, p_papel) AND access.can('finance', p_acao)) THEN
    RAISE EXCEPTION 'Sem permissão para esta operação do contrato.' USING ERRCODE = '42501';
  END IF;
  RETURN v_account_id;
END;
$function$
;

-- aba_finance.execucao_liberada_no_plano
CREATE OR REPLACE FUNCTION aba_finance.execucao_liberada_no_plano(p_plano_id uuid)
 RETURNS TABLE(celula_id uuid, liberada_por text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cliente UUID;
BEGIN
  SELECT p.cliente_id INTO v_cliente FROM aba_treatment.planos p
  JOIN public.profiles pf ON pf.account_id = p.account_id AND pf.user_id = auth.uid()
    AND pf.account_id = public.active_account_id() -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha
  WHERE p.id = p_plano_id;
  IF v_cliente IS NULL OR NOT aba_treatment.pode_planejar(v_cliente, 'leitura') THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT pp.id, aba_finance.execucao_liberada(pp.id)
  FROM aba_treatment.procedimentos_plano pp
  WHERE pp.plano_id = p_plano_id AND aba_finance.execucao_liberada(pp.id) IS NOT NULL;
END;
$function$
;

-- aba_finance.ler_contratos_do_cliente
CREATE OR REPLACE FUNCTION aba_finance.ler_contratos_do_cliente(p_cliente_id uuid)
 RETURNS TABLE(id uuid, status text, orcamento_id uuid, plano_id uuid, opcao_rotulo text, profissional_id uuid, profissional_nome text, sou_o_profissional boolean, valor_bruto numeric, desconto_valor numeric, valor numeric, parcelas integer, taxa_juros numeric, taxa_multa_atraso numeric, documento_hash text, documento_emitido_em timestamp with time zone, assinado_em timestamp with time zone, encerrado_em timestamp with time zone, criado_em timestamp with time zone, itens jsonb, assinaturas jsonb, situacao jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_account_id UUID;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid() AND pf.account_id = public.active_account_id(); -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha
  IF v_account_id IS NULL
     OR NOT (public.is_account_member(v_account_id, 'viewer') AND access.can('finance', 'read')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id, c.status, c.orcamento_id, o.plano_id, op.rotulo, c.profissional_id, pr.nome_exibicao,
    EXISTS (SELECT 1 FROM public.profiles pf2 WHERE pf2.id = pr.profile_id AND pf2.user_id = auth.uid()),
    c.valor_bruto, c.desconto_valor, c.valor, c.parcelas, c.taxa_juros, c.taxa_multa_atraso,
    c.documento_hash, c.documento_emitido_em, c.assinado_em, c.encerrado_em, c.criado_em,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', i.id,
               'tipo', CASE WHEN i.plano_id IS NOT NULL THEN 'plano' WHEN i.pacote_id IS NOT NULL THEN 'pacote' ELSE 'procedimento' END,
               'nome', COALESCE(pc.nome, pk.nome, 'Plano de tratamento personalizado'),
               'quantidade', i.quantidade,
               'valor_unitario', i.valor_unitario,
               'valor_total', i.valor_total,
               'degrau', i.degrau,
               'pacote_cliente_id', i.pacote_cliente_id,
               'executadas', CASE WHEN i.procedimento_id IS NOT NULL
                                  THEN (SELECT count(*) FROM aba_finance.execucoes_item_contrato x WHERE x.item_contrato_id = i.id)
                             END)
             ORDER BY CASE WHEN i.plano_id IS NOT NULL THEN 1 WHEN i.pacote_id IS NOT NULL THEN 2 ELSE 3 END,
                      COALESCE(pc.nome, pk.nome), i.id)
      FROM aba_finance.itens_contrato i
      LEFT JOIN aba_catalog.procedimentos pc ON pc.id = i.procedimento_id AND pc.account_id = i.account_id
      LEFT JOIN aba_catalog.pacotes pk ON pk.id = i.pacote_id AND pk.account_id = i.account_id
      WHERE i.contrato_id = c.id
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'parte', a.parte, 'via', a.via, 'assinada_em', a.assinada_em,
               'hash_assinado', a.hash_assinado, 'registrada_por_nome', pf3.full_name)
             ORDER BY a.parte)
      FROM aba_finance.assinaturas_contrato a
      LEFT JOIN public.profiles pf3 ON pf3.user_id = a.registrada_por AND pf3.account_id = a.account_id
      WHERE a.contrato_id = c.id
    ), '[]'::jsonb),
    (SELECT to_jsonb(s) FROM aba_finance.calcular_situacao_contrato(c.id) s)
  FROM aba_finance.contratos c
  LEFT JOIN aba_finance.orcamentos o ON o.id = c.orcamento_id AND o.account_id = c.account_id
  LEFT JOIN aba_treatment.opcoes op ON op.id = o.opcao_id AND op.account_id = o.account_id
  LEFT JOIN aba_scheduling.profissionais pr ON pr.id = c.profissional_id AND pr.account_id = c.account_id
  WHERE c.cliente_id = p_cliente_id AND c.account_id = v_account_id
  ORDER BY c.criado_em DESC;
END;
$function$
;

-- aba_finance.ler_orcamentos
CREATE OR REPLACE FUNCTION aba_finance.ler_orcamentos(p_plano_id uuid)
 RETURNS TABLE(id uuid, plano_id uuid, opcao_id uuid, opcao_rotulo text, profissional_id uuid, estado text, desconto_valor numeric, desconto_motivo text, promocao text, parcelas smallint, taxa_juros numeric, taxa_multa_atraso numeric, valor_bruto numeric, valor_liquido numeric, aprovado_em timestamp with time zone, aprovado_por uuid, sou_quem_aprova boolean, ultima_devolucao jsonb, com_detalhe_clinico boolean, itens jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id    UUID := auth.uid();
  v_account_id UUID;
  v_cliente_id UUID;
  v_clinico    BOOLEAN;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = v_user_id AND pf.account_id = public.active_account_id(); -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  -- Negado devolve VAZIO, nunca exceção: erro explícito confirmaria a
  -- existência do plano a quem não pode enxergá-lo (mesma decisão de
  -- `ler_evolucoes` e `ler_planos`).
  IF NOT (public.is_account_member(v_account_id, 'viewer') AND access.can('finance', 'read')) THEN
    RETURN;
  END IF;

  SELECT p.cliente_id INTO v_cliente_id
  FROM aba_treatment.planos p
  WHERE p.id = p_plano_id AND p.account_id = v_account_id;

  IF v_cliente_id IS NULL THEN
    RETURN;
  END IF;

  v_clinico := aba_treatment.pode_planejar(v_cliente_id, 'leitura');

  -- O log vem ANTES do retorno, e SÓ quando há conteúdo clínico a
  -- devolver. Se viesse depois, uma leitura interrompida no meio
  -- entregaria dado sem deixar rastro — o caso em que o rastro mais
  -- importa.
  IF v_clinico THEN
    INSERT INTO aba_health.log_acesso
      (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
    VALUES (v_account_id, v_user_id, v_cliente_id, 'plano', p_plano_id, 'leitura',
            jsonb_build_object('via', 'aba_finance.ler_orcamentos'));
  END IF;

  RETURN QUERY
  SELECT
    o.id, o.plano_id, o.opcao_id, op.rotulo, o.profissional_id, o.estado,
    o.desconto_valor, o.desconto_motivo, o.promocao, o.parcelas,
    o.taxa_juros, o.taxa_multa_atraso, o.valor_bruto, o.valor_liquido,
    o.aprovado_em, o.aprovado_por,
    EXISTS (
      SELECT 1 FROM aba_scheduling.profissionais pr
      JOIN public.profiles pf ON pf.id = pr.profile_id
      WHERE pr.id = o.profissional_id AND pr.account_id = o.account_id
        AND pf.user_id = v_user_id
    ),
    -- Só faz sentido em rascunho: aprovado de novo, o aviso já foi atendido.
    CASE WHEN o.estado = 'rascunho' THEN (
      SELECT jsonb_build_object(
               'em', e.ocorrido_em,
               'por', e.ator,
               'por_nome', pf.full_name,
               'colunas', e.colunas)
      FROM aba_finance.eventos_orcamento e
      LEFT JOIN public.profiles pf ON pf.user_id = e.ator AND pf.account_id = e.account_id
      WHERE e.orcamento_id = o.id AND e.tipo = 'devolvido_a_rascunho'
      ORDER BY e.ocorrido_em DESC
      LIMIT 1
    ) END,
    v_clinico,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', i.id,
               'procedimento_plano_id', i.procedimento_plano_id,
               'tipo', CASE WHEN i.pacote_id IS NOT NULL THEN 'pacote' ELSE 'procedimento' END,
               'procedimento_id', i.procedimento_id,
               'pacote_id', i.pacote_id,
               'procedimento', COALESCE(pc.nome, pk.nome),
               'valor_resolvido', i.valor_resolvido,
               'tabela_preco_id', i.tabela_preco_id,
               'tabela_preco', tp.nome,
               'degrau', i.degrau,
               'resolvido_em', i.resolvido_em,
               -- As duas únicas chaves clínicas do retorno, e as duas só
               -- existem quando o alcance existe. `NULL` e não ausente:
               -- a forma do objeto não muda entre os dois casos, para a
               -- tela não ter dois formatos para tratar.
               'dente', CASE WHEN v_clinico THEN to_jsonb(pp.dente) ELSE 'null'::jsonb END,
               'faces', CASE WHEN v_clinico THEN to_jsonb(pp.faces) ELSE 'null'::jsonb END,
               'estado_procedimento', pp.estado)
             ORDER BY COALESCE(pc.nome, pk.nome))
      FROM aba_finance.itens_orcamento i
      LEFT JOIN aba_catalog.procedimentos pc
        ON pc.id = i.procedimento_id AND pc.account_id = i.account_id
      LEFT JOIN aba_catalog.pacotes pk
        ON pk.id = i.pacote_id AND pk.account_id = i.account_id
      JOIN aba_treatment.procedimentos_plano pp
        ON pp.id = i.procedimento_plano_id AND pp.account_id = i.account_id
      LEFT JOIN aba_finance.tabelas_preco tp
        ON tp.id = i.tabela_preco_id AND tp.account_id = i.account_id
      WHERE i.orcamento_id = o.id
    ), '[]'::jsonb)
  FROM aba_finance.orcamentos o
  JOIN aba_treatment.opcoes op ON op.id = o.opcao_id AND op.account_id = o.account_id
  WHERE o.plano_id = p_plano_id AND o.account_id = v_account_id
  ORDER BY op.ordem;
END;
$function$
;

-- aba_finance.montar_orcamento
CREATE OR REPLACE FUNCTION aba_finance.montar_orcamento(p_opcao_id uuid, p_profissional_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_account_id  UUID;
  v_plano_id    UUID;
  v_cliente_id  UUID;
  v_orcamento   UUID;
  v_estado      TEXT;
  v_prof        UUID := p_profissional_id;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid() AND pf.account_id = public.active_account_id(); -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Montar orçamento exige sessão autenticada.' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.is_account_member(v_account_id, 'agent') AND access.can('finance', 'create')) THEN
    RAISE EXCEPTION 'Sem permissão para montar orçamento neste módulo.' USING ERRCODE = '42501';
  END IF;

  SELECT o.plano_id, p.cliente_id INTO v_plano_id, v_cliente_id
  FROM aba_treatment.opcoes o
  JOIN aba_treatment.planos p ON p.id = o.plano_id AND p.account_id = o.account_id
  WHERE o.id = p_opcao_id AND o.account_id = v_account_id;

  IF v_plano_id IS NULL THEN
    RAISE EXCEPTION 'Opção % não existe nesta conta.', p_opcao_id USING ERRCODE = '42501';
  END IF;

  SELECT id, estado INTO v_orcamento, v_estado
  FROM aba_finance.orcamentos WHERE opcao_id = p_opcao_id;

  IF v_orcamento IS NULL THEN
    INSERT INTO aba_finance.orcamentos (account_id, plano_id, opcao_id, profissional_id)
    VALUES (v_account_id, v_plano_id, p_opcao_id,
            COALESCE(v_prof, (SELECT pl.profissional_id FROM aba_treatment.planos pl WHERE pl.id = v_plano_id)))
    RETURNING id, profissional_id INTO v_orcamento, v_prof;
  ELSE
    IF v_estado <> 'rascunho' THEN
      RAISE EXCEPTION 'Orçamento % não se remonta — o valor acordado é congelado.', v_estado
        USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(v_prof, profissional_id) INTO v_prof
    FROM aba_finance.orcamentos WHERE id = v_orcamento;
    UPDATE aba_finance.orcamentos SET profissional_id = v_prof WHERE id = v_orcamento;
  END IF;

  -- Sai o que não pertence mais à opção — E o que a célula trocou de item
  -- desde o último cálculo (Subetapa 03.8.c): trocar a restauração por um
  -- pacote na matriz não pode deixar no orçamento a linha do preço antigo.
  -- Apagar tudo e reinserir seria mais curto e perderia `resolvido_em` de
  -- linha que não mudou — e é justamente o carimbo que diz quando aquele
  -- preço foi acordado.
  DELETE FROM aba_finance.itens_orcamento i
  WHERE i.orcamento_id = v_orcamento
    AND NOT EXISTS (
      SELECT 1 FROM aba_treatment.procedimentos_plano pp
      WHERE pp.id = i.procedimento_plano_id
        AND pp.opcao_id = p_opcao_id
        AND pp.recusado_em IS NULL
        AND pp.estado <> 'nao_mais_necessario'
        AND pp.procedimento_id IS NOT DISTINCT FROM i.procedimento_id
        AND pp.pacote_id IS NOT DISTINCT FROM i.pacote_id);

  INSERT INTO aba_finance.itens_orcamento
    (account_id, orcamento_id, procedimento_plano_id, procedimento_id, pacote_id,
     valor_resolvido, tabela_preco_id, degrau, profissional_id)
  SELECT
    v_account_id, v_orcamento, pp.id, pp.procedimento_id, pp.pacote_id,
    COALESCE(r.valor, 0), r.tabela_preco_id, COALESCE(r.degrau, 'catalogo'), v_prof
  FROM aba_treatment.procedimentos_plano pp
  -- `LEFT ... ON TRUE` e não `CROSS`: a escada pode devolver conjunto
  -- vazio, e com `CROSS JOIN LATERAL` o item sumiria do orçamento em
  -- silêncio em vez de entrar com o preço a resolver.
  LEFT JOIN LATERAL aba_finance.resolver_preco_item(pp.procedimento_id, pp.pacote_id, v_cliente_id, v_prof) r ON TRUE
  WHERE pp.opcao_id = p_opcao_id
    AND pp.account_id = v_account_id
    AND pp.recusado_em IS NULL
    AND pp.estado <> 'nao_mais_necessario'
    AND NOT EXISTS (
      SELECT 1 FROM aba_finance.itens_orcamento i
      WHERE i.orcamento_id = v_orcamento AND i.procedimento_plano_id = pp.id);

  RETURN v_orcamento;
END;
$function$
;

-- aba_finance.planos_orcados_do_cliente
CREATE OR REPLACE FUNCTION aba_finance.planos_orcados_do_cliente(p_cliente_id uuid)
 RETURNS TABLE(plano_id uuid, criado_em timestamp with time zone, orcamentos integer, aprovados integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_account_id UUID;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid() AND pf.account_id = public.active_account_id(); -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  -- A mesma porta de `ler_orcamentos`: quem lê o financeiro. Negado devolve
  -- vazio, nunca exceção.
  IF NOT (public.is_account_member(v_account_id, 'viewer') AND access.can('finance', 'read')) THEN
    RETURN;
  END IF;

  -- `account_id` reafirmado nas duas tabelas: `SECURITY DEFINER` não passa
  -- por RLS.
  RETURN QUERY
  SELECT p.id, p.criado_em,
         count(o.id)::INT,
         (count(o.id) FILTER (WHERE o.estado = 'aprovado'))::INT
  FROM aba_treatment.planos p
  JOIN aba_finance.orcamentos o ON o.plano_id = p.id AND o.account_id = p.account_id
  WHERE p.cliente_id = p_cliente_id AND p.account_id = v_account_id
  GROUP BY p.id, p.criado_em
  ORDER BY p.criado_em;
END;
$function$
;

-- aba_finance.registrar_execucao_item
CREATE OR REPLACE FUNCTION aba_finance.registrar_execucao_item(p_item_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_account_id UUID;
  v_i          RECORD;
  v_prof       UUID;
  v_id         UUID;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid() AND pf.account_id = public.active_account_id(); -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Registrar execução exige sessão autenticada — a execução precisa de autor.' USING ERRCODE = '42501';
  END IF;

  -- Quem executa é PROFISSIONAL da conta: o login por trás de um cadastro
  -- de profissional. Recepção não afirma execução clínica.
  SELECT pr.id INTO v_prof
  FROM aba_scheduling.profissionais pr JOIN public.profiles pf ON pf.id = pr.profile_id
  WHERE pr.account_id = v_account_id AND pf.user_id = auth.uid()
  ORDER BY pr.ativo DESC, pr.criado_em LIMIT 1;
  IF v_prof IS NULL THEN
    RAISE EXCEPTION 'Só profissional registra execução.' USING ERRCODE = '42501';
  END IF;

  SELECT i.id, i.procedimento_id, i.quantidade, c.status, c.id AS contrato_id INTO v_i
  FROM aba_finance.itens_contrato i
  JOIN aba_finance.contratos c ON c.id = i.contrato_id AND c.account_id = i.account_id
  WHERE i.id = p_item_id AND i.account_id = v_account_id;
  IF v_i.id IS NULL THEN
    RAISE EXCEPTION 'Linha % não existe nesta conta.', p_item_id USING ERRCODE = '42501';
  END IF;
  IF v_i.procedimento_id IS NULL THEN
    RAISE EXCEPTION 'Só procedimento avulso se executa por aqui: o plano se executa por face, o pacote por sessão.'
      USING ERRCODE = '23514';
  END IF;
  IF v_i.status <> 'assinado' THEN
    RAISE EXCEPTION 'Sem contrato assinado pelas duas partes, o procedimento não se executa (D-V8).' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) FROM aba_finance.execucoes_item_contrato x WHERE x.item_contrato_id = v_i.id) >= v_i.quantidade THEN
    RAISE EXCEPTION 'Todas as % unidade(s) contratadas já foram executadas.', v_i.quantidade USING ERRCODE = '23514';
  END IF;

  INSERT INTO aba_finance.execucoes_item_contrato (account_id, item_contrato_id, executado_em, executado_por, profissional_id)
  VALUES (v_account_id, v_i.id, NOW(), auth.uid(), v_prof)
  RETURNING id INTO v_id;

  INSERT INTO aba_finance.eventos_contrato (account_id, contrato_id, tipo, ator, detalhe)
  VALUES (v_account_id, v_i.contrato_id, 'execucao_registrada', auth.uid(), jsonb_build_object('item_id', v_i.id));

  RETURN v_id;
END;
$function$
;

-- aba_finance.resolver_preco_item
CREATE OR REPLACE FUNCTION aba_finance.resolver_preco_item(p_procedimento_id uuid, p_pacote_id uuid, p_cliente_id uuid DEFAULT NULL::uuid, p_profissional_id uuid DEFAULT NULL::uuid, p_data date DEFAULT NULL::date)
 RETURNS TABLE(valor numeric, tabela_preco_id uuid, tabela_nome text, degrau text, grau smallint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_account_id UUID;
  v_tipo_id    UUID;
  v_data       DATE := COALESCE(p_data, CURRENT_DATE);
BEGIN
  -- O arco vale na pergunta também: exatamente um item. Pedir o preço de
  -- "nada" ou de "procedimento e pacote ao mesmo tempo" é erro de quem
  -- chama, e erro explícito é melhor que um conjunto vazio que a tela leria
  -- como "sem preço".
  IF num_nonnulls(p_procedimento_id, p_pacote_id) <> 1 THEN
    RAISE EXCEPTION 'Informe exatamente um item para resolver o preço: procedimento OU pacote.'
      USING ERRCODE = '22023';
  END IF;

  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid() AND pf.account_id = public.active_account_id(); -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  -- O item tem de ser da conta de quem pergunta. Sem esta linha,
  -- `SECURITY DEFINER` responderia o preço de qualquer conta a quem
  -- soubesse um UUID.
  IF p_procedimento_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM aba_catalog.procedimentos pc
    WHERE pc.id = p_procedimento_id AND pc.account_id = v_account_id
  ) THEN
    RETURN;
  END IF;
  IF p_pacote_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM aba_catalog.pacotes pk
    WHERE pk.id = p_pacote_id AND pk.account_id = v_account_id
  ) THEN
    RETURN;
  END IF;

  SELECT pr.tipo_profissional_id INTO v_tipo_id
  FROM aba_scheduling.profissionais pr
  WHERE pr.id = p_profissional_id AND pr.account_id = v_account_id;

  RETURN QUERY
  WITH candidatas AS (
    SELECT
      t.valor         AS c_valor,
      tp.id           AS c_tabela_id,
      tp.nome         AS c_tabela_nome,
      tp.escopo       AS c_escopo,
      tp.vigente_de   AS c_vigente_de,
      tp.comprometida_em AS c_comprometida_em,
      (CASE tp.escopo
        WHEN 'paciente'          THEN 1
        WHEN 'grupo_paciente'    THEN 2
        WHEN 'tipo_profissional' THEN 3
        WHEN 'clinica'           THEN 4
        WHEN 'rede'              THEN 5
        WHEN 'pratica'           THEN 6
      END)::SMALLINT AS c_grau,
      -- Prioridade do grupo. Só o degrau 2 a tem; os outros entram com o
      -- mesmo valor para não alterar a ordenação deles entre si.
      COALESCE(gp.prioridade, 0)::SMALLINT AS c_prioridade
    FROM aba_finance.tarifas t
    JOIN aba_finance.tabelas_preco tp
      ON tp.id = t.tabela_preco_id AND tp.account_id = t.account_id
    LEFT JOIN aba_finance.grupos_preco gp
      ON gp.id = tp.grupo_preco_id AND gp.account_id = tp.account_id
    WHERE t.account_id = v_account_id
      -- O braço do arco que se está perguntando. Escrito como dois ramos,
      -- e não como `IS NOT DISTINCT FROM`, para cada ramo usar o índice do
      -- próprio braço.
      AND (
        (p_procedimento_id IS NOT NULL AND t.procedimento_id = p_procedimento_id)
        OR (p_pacote_id IS NOT NULL AND t.pacote_id = p_pacote_id)
      )
      AND tp.estado = 'comprometida'
      AND tp.vigente_de <= v_data
      AND (tp.vigente_ate IS NULL OR tp.vigente_ate >= v_data)
      AND (
        -- O degrau só se aplica quando o discriminador dele bate. Sem o
        -- paciente na chamada, os degraus 1 e 2 somem da escada — e é
        -- assim que tem de ser: preço pessoal de um paciente não pode
        -- resolver o preço de outro, e nem o do grupo dele.
        (tp.escopo = 'paciente' AND p_cliente_id IS NOT NULL AND tp.cliente_id = p_cliente_id)
        OR (tp.escopo = 'grupo_paciente' AND p_cliente_id IS NOT NULL
            AND gp.ativo
            AND EXISTS (
              SELECT 1 FROM aba_finance.clientes_grupo_preco cg
              WHERE cg.grupo_id = tp.grupo_preco_id
                AND cg.cliente_id = p_cliente_id
                AND cg.account_id = v_account_id))
        OR (tp.escopo = 'tipo_profissional' AND v_tipo_id IS NOT NULL AND tp.tipo_profissional_id = v_tipo_id)
        OR tp.escopo IN ('clinica','rede','pratica')
      )
  )
  SELECT c.c_valor, c.c_tabela_id, c.c_tabela_nome, c.c_escopo, c.c_grau
  FROM candidatas c
  -- Degrau primeiro; dentro do degrau 2, a PRIORIDADE do grupo; e só
  -- então o desempate temporal da 048, que continua garantindo ordem
  -- total — sem ela, o preço mudaria entre duas execuções da mesma
  -- consulta, que é a pior classe de defeito num número que vira contrato.
  ORDER BY c.c_grau, c.c_prioridade, c.c_vigente_de DESC, c.c_comprometida_em DESC, c.c_tabela_id
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- O FUNDO DA ESCADA é o preço do CADASTRO — `preco_base` para o
  -- procedimento, `preco_total` para o pacote —, com o degrau `catalogo`.
  -- Esta é a decisão do cabeçalho: o preço do pacote é o último recurso,
  -- não o vencedor.
  IF p_procedimento_id IS NOT NULL THEN
    RETURN QUERY
    SELECT pc.preco_base, NULL::UUID, NULL::TEXT, 'catalogo'::TEXT, 9::SMALLINT
    FROM aba_catalog.procedimentos pc
    WHERE pc.id = p_procedimento_id AND pc.account_id = v_account_id;
  ELSE
    RETURN QUERY
    SELECT pk.preco_total, NULL::UUID, NULL::TEXT, 'catalogo'::TEXT, 9::SMALLINT
    FROM aba_catalog.pacotes pk
    WHERE pk.id = p_pacote_id AND pk.account_id = v_account_id;
  END IF;
END;
$function$
;

-- aba_finance.simular_troca_de_profissional
CREATE OR REPLACE FUNCTION aba_finance.simular_troca_de_profissional(p_orcamento_id uuid, p_profissional_id uuid)
 RETURNS TABLE(item_id uuid, procedimento_id uuid, procedimento text, valor_atual numeric, valor_novo numeric, diferenca numeric, degrau_atual text, degrau_novo text, tabela_nova text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_account_id UUID;
  v_cliente_id UUID;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid() AND pf.account_id = public.active_account_id(); -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha
  IF v_account_id IS NULL
     OR NOT (public.is_account_member(v_account_id, 'viewer') AND access.can('finance', 'read')) THEN
    RETURN;
  END IF;

  SELECT p.cliente_id INTO v_cliente_id
  FROM aba_finance.orcamentos o
  JOIN aba_treatment.planos p ON p.id = o.plano_id AND p.account_id = o.account_id
  WHERE o.id = p_orcamento_id AND o.account_id = v_account_id;

  IF v_cliente_id IS NULL THEN
    RETURN;
  END IF;

  -- A coluna `procedimento` continua com esse nome (é o contrato da tela
  -- desde a 03.8.a) e passa a trazer o nome do PACOTE quando o item é um.
  RETURN QUERY
  SELECT
    i.id, i.procedimento_id, COALESCE(pc.nome, pk.nome),
    i.valor_resolvido,
    COALESCE(r.valor, 0),
    COALESCE(r.valor, 0) - i.valor_resolvido,
    i.degrau, COALESCE(r.degrau, 'catalogo'), r.tabela_nome
  FROM aba_finance.itens_orcamento i
  LEFT JOIN aba_catalog.procedimentos pc
    ON pc.id = i.procedimento_id AND pc.account_id = i.account_id
  LEFT JOIN aba_catalog.pacotes pk
    ON pk.id = i.pacote_id AND pk.account_id = i.account_id
  LEFT JOIN LATERAL aba_finance.resolver_preco_item(i.procedimento_id, i.pacote_id, v_cliente_id, p_profissional_id) r ON TRUE
  WHERE i.orcamento_id = p_orcamento_id AND i.account_id = v_account_id
  ORDER BY COALESCE(pc.nome, pk.nome);
END;
$function$
;

-- aba_finance.situacao_contrato
CREATE OR REPLACE FUNCTION aba_finance.situacao_contrato(p_contrato_id uuid)
 RETURNS TABLE(valor_total numeric, valor_pago numeric, saldo_devedor numeric, unidades_previstas integer, unidades_executadas integer, falta_pagamento boolean, falta_execucao boolean, pode_encerrar boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_account_id UUID;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid() AND pf.account_id = public.active_account_id(); -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha
  IF v_account_id IS NULL
     OR NOT (public.is_account_member(v_account_id, 'viewer') AND access.can('finance', 'read'))
     OR NOT EXISTS (SELECT 1 FROM aba_finance.contratos c WHERE c.id = p_contrato_id AND c.account_id = v_account_id) THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM aba_finance.calcular_situacao_contrato(p_contrato_id);
END;
$function$
;

-- aba_finance.trocar_profissional_do_orcamento
CREATE OR REPLACE FUNCTION aba_finance.trocar_profissional_do_orcamento(p_orcamento_id uuid, p_profissional_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_account_id UUID;
  v_cliente_id UUID;
  v_estado     TEXT;
  v_antes      NUMERIC;
  v_depois     NUMERIC;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid() AND pf.account_id = public.active_account_id(); -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Trocar o profissional do orçamento exige sessão autenticada.' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.is_account_member(v_account_id, 'agent') AND access.can('finance', 'update')) THEN
    RAISE EXCEPTION 'Sem permissão para alterar orçamento neste módulo.' USING ERRCODE = '42501';
  END IF;

  SELECT o.estado, o.valor_bruto, p.cliente_id INTO v_estado, v_antes, v_cliente_id
  FROM aba_finance.orcamentos o
  JOIN aba_treatment.planos p ON p.id = o.plano_id AND p.account_id = o.account_id
  WHERE o.id = p_orcamento_id AND o.account_id = v_account_id;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Orçamento % não existe nesta conta.', p_orcamento_id USING ERRCODE = '42501';
  END IF;

  IF v_estado <> 'rascunho' THEN
    RAISE EXCEPTION 'Orçamento % não recalcula — trocar o profissional depois do acordo mudaria um valor já aceito.', v_estado
      USING ERRCODE = '23514';
  END IF;

  IF p_profissional_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM aba_scheduling.profissionais pr
    WHERE pr.id = p_profissional_id AND pr.account_id = v_account_id
  ) THEN
    RAISE EXCEPTION 'Profissional % não existe nesta conta.', p_profissional_id USING ERRCODE = '42501';
  END IF;

  -- A resolução vem de uma SUBQUERY, e não de um `FROM
  -- resolver_preco_item(i.procedimento_id, ...)`: no `UPDATE`, a cláusula
  -- `FROM` não enxerga colunas da tabela-alvo, e a forma direta falha com
  -- "invalid reference to FROM-clause entry".
  UPDATE aba_finance.itens_orcamento i
     SET valor_resolvido = novo.valor,
         tabela_preco_id = novo.tabela_preco_id,
         degrau          = novo.degrau,
         profissional_id = p_profissional_id,
         resolvido_em    = NOW()
  FROM (
    SELECT x.id AS item_id,
           COALESCE(r.valor, 0) AS valor,
           r.tabela_preco_id,
           COALESCE(r.degrau, 'catalogo') AS degrau
    FROM aba_finance.itens_orcamento x
    LEFT JOIN LATERAL aba_finance.resolver_preco_item(x.procedimento_id, x.pacote_id, v_cliente_id, p_profissional_id) r ON TRUE
    WHERE x.orcamento_id = p_orcamento_id AND x.account_id = v_account_id
  ) novo
  WHERE i.id = novo.item_id;

  UPDATE aba_finance.orcamentos SET profissional_id = p_profissional_id WHERE id = p_orcamento_id;

  SELECT valor_bruto INTO v_depois FROM aba_finance.orcamentos WHERE id = p_orcamento_id;
  RETURN v_depois - v_antes;
END;
$function$
;

-- aba_health.ler_consentimentos
CREATE OR REPLACE FUNCTION aba_health.ler_consentimentos(p_cliente_id uuid)
 RETURNS SETOF aba_health.consentimentos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_account_id UUID;
BEGIN
  IF p_cliente_id IS NULL OR NOT aba_health.pode_acessar(p_cliente_id, 'leitura') THEN
    RETURN;
  END IF;

  SELECT account_id INTO v_account_id FROM public.profiles WHERE user_id = v_user_id AND account_id = public.active_account_id(); -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO aba_health.log_acesso
    (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
  SELECT v_account_id, v_user_id, p_cliente_id, 'consentimento', r.id, 'leitura',
         jsonb_build_object('via', 'aba_health.ler_consentimentos')
  FROM aba_health.consentimentos r
  WHERE r.cliente_id = p_cliente_id AND r.account_id = v_account_id;

  RETURN QUERY
  SELECT r.* FROM aba_health.consentimentos r
  WHERE r.cliente_id = p_cliente_id AND r.account_id = v_account_id;
END;
$function$
;

-- aba_health.ler_evolucoes
CREATE OR REPLACE FUNCTION aba_health.ler_evolucoes(p_cliente_id uuid)
 RETURNS SETOF aba_health.evolucoes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_account_id UUID;
BEGIN
  IF p_cliente_id IS NULL OR NOT aba_health.pode_acessar(p_cliente_id, 'leitura') THEN
    RETURN;
  END IF;

  SELECT account_id INTO v_account_id FROM public.profiles WHERE user_id = v_user_id AND account_id = public.active_account_id(); -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO aba_health.log_acesso
    (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
  SELECT v_account_id, v_user_id, p_cliente_id, 'evolucao', r.id, 'leitura',
         jsonb_build_object('via', 'aba_health.ler_evolucoes')
  FROM aba_health.evolucoes r
  WHERE r.cliente_id = p_cliente_id AND r.account_id = v_account_id;

  RETURN QUERY
  SELECT r.* FROM aba_health.evolucoes r
  WHERE r.cliente_id = p_cliente_id AND r.account_id = v_account_id;
END;
$function$
;

-- aba_health.ler_prontuario
CREATE OR REPLACE FUNCTION aba_health.ler_prontuario(p_cliente_id uuid)
 RETURNS SETOF aba_health.prontuarios
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_account_id UUID;
BEGIN
  IF p_cliente_id IS NULL OR NOT aba_health.pode_acessar(p_cliente_id, 'leitura') THEN
    RETURN;
  END IF;

  SELECT account_id INTO v_account_id FROM public.profiles WHERE user_id = v_user_id AND account_id = public.active_account_id(); -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO aba_health.log_acesso
    (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
  SELECT v_account_id, v_user_id, p_cliente_id, 'prontuario', r.id, 'leitura',
         jsonb_build_object('via', 'aba_health.ler_prontuario')
  FROM aba_health.prontuarios r
  WHERE r.cliente_id = p_cliente_id AND r.account_id = v_account_id;

  RETURN QUERY
  SELECT r.* FROM aba_health.prontuarios r
  WHERE r.cliente_id = p_cliente_id AND r.account_id = v_account_id;
END;
$function$
;

-- aba_health.ler_respostas_anamnese
CREATE OR REPLACE FUNCTION aba_health.ler_respostas_anamnese(p_cliente_id uuid)
 RETURNS SETOF aba_health.respostas_anamnese
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_account_id UUID;
BEGIN
  IF p_cliente_id IS NULL OR NOT aba_health.pode_acessar(p_cliente_id, 'leitura') THEN
    RETURN;
  END IF;

  SELECT account_id INTO v_account_id FROM public.profiles WHERE user_id = v_user_id AND account_id = public.active_account_id(); -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO aba_health.log_acesso
    (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
  SELECT v_account_id, v_user_id, p_cliente_id, 'anamnese', r.id, 'leitura',
         jsonb_build_object('via', 'aba_health.ler_respostas_anamnese')
  FROM aba_health.respostas_anamnese r
  WHERE r.cliente_id = p_cliente_id AND r.account_id = v_account_id;

  RETURN QUERY
  SELECT r.* FROM aba_health.respostas_anamnese r
  WHERE r.cliente_id = p_cliente_id AND r.account_id = v_account_id;
END;
$function$
;

-- aba_health.registrar_recusa_assinatura
CREATE OR REPLACE FUNCTION aba_health.registrar_recusa_assinatura(p_evolucao_id uuid, p_motivo text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_ator       UUID := auth.uid();
  v_account_id UUID;
  v_cliente_id UUID;
  v_travada    BOOLEAN;
  v_recusa_em  TIMESTAMPTZ;
  v_agora      TIMESTAMPTZ := NOW();
BEGIN
  -- RECUSA EXIGE SESSÃO, e com mensagem própria. Sem isto, uma chamada
  -- por conexão de servidor gravaria `recusa_assinatura_por` nulo e o
  -- CHECK da §1 recusaria com o nome de uma restrição, que não explica
  -- nada a quem lê — a armadilha medida em `consentir_opcao` (045).
  -- Recusa sem autor não protege a clínica: o registro vale pelo QUEM e
  -- pelo QUANDO.
  IF v_ator IS NULL THEN
    RAISE EXCEPTION 'Registrar a recusa de assinatura exige sessão autenticada — a recusa precisa de autor.'
      USING ERRCODE = '42501';
  END IF;

  IF btrim(coalesce(p_motivo, '')) = '' THEN
    RAISE EXCEPTION 'Escreva o motivo da recusa — se o paciente não deu motivo, registre "não informou".'
      USING ERRCODE = '23514';
  END IF;

  SELECT account_id INTO v_account_id FROM public.profiles WHERE user_id = v_ator AND account_id = public.active_account_id(); -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha

  SELECT e.cliente_id, e.travada, e.recusa_assinatura_em
    INTO v_cliente_id, v_travada, v_recusa_em
  FROM aba_health.evolucoes e
  WHERE e.id = p_evolucao_id
    AND e.account_id = v_account_id;

  -- Mesma resposta para "não existe" e "não é sua": distinguir as duas
  -- confirmaria a existência da evolução a quem não pode enxergá-la.
  IF v_cliente_id IS NULL OR NOT aba_health.pode_acessar(v_cliente_id, 'atualizacao') THEN
    RAISE EXCEPTION 'Evolução % não existe ou não está ao seu alcance.', p_evolucao_id
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_travada THEN
    RAISE EXCEPTION 'A recusa se registra sobre a evolução assinada — assine a sessão primeiro: o paciente recusa o texto final (D-F16).'
      USING ERRCODE = '23514';
  END IF;

  IF v_recusa_em IS NOT NULL THEN
    RAISE EXCEPTION 'A recusa desta evolução já foi registrada — o registro não se refaz nem se sobrescreve.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE aba_health.evolucoes
     SET recusa_assinatura_em     = v_agora,
         recusa_assinatura_por    = v_ator,
         recusa_assinatura_motivo = btrim(p_motivo)
   WHERE id = p_evolucao_id
     AND account_id = v_account_id
     AND recusa_assinatura_em IS NULL;

  RETURN v_agora;
END;
$function$
;

-- aba_treatment.ler_planos
CREATE OR REPLACE FUNCTION aba_treatment.ler_planos(p_cliente_id uuid)
 RETURNS TABLE(id uuid, cliente_id uuid, profissional_id uuid, titulo text, observacao text, criado_em timestamp with time zone, atualizado_em timestamp with time zone, opcoes jsonb, diagnosticos jsonb, procedimentos jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id    UUID := auth.uid();
  v_account_id UUID;
BEGIN
  -- Negado devolve VAZIO, não exceção — e nada logado, porque nada lido.
  IF p_cliente_id IS NULL OR NOT aba_treatment.pode_planejar(p_cliente_id, 'leitura') THEN
    RETURN;
  END IF;

  SELECT account_id INTO v_account_id FROM public.profiles WHERE user_id = v_user_id AND account_id = public.active_account_id(); -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  -- O LOG VEM ANTES DO RETURN. Se viesse depois, uma leitura interrompida
  -- no meio devolveria dado sem deixar rastro — que é o caso em que o
  -- rastro mais importa.
  INSERT INTO aba_health.log_acesso
    (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
  SELECT v_account_id, v_user_id, p_cliente_id, 'plano', p.id, 'leitura',
         jsonb_build_object('via', 'aba_treatment.ler_planos')
  FROM aba_treatment.planos p
  WHERE p.cliente_id = p_cliente_id AND p.account_id = v_account_id;

  -- `account_id` reafirmado no filtro: `SECURITY DEFINER` não passa por
  -- RLS, então a fronteira de conta é responsabilidade desta função.
  RETURN QUERY
  SELECT
    p.id, p.cliente_id, p.profissional_id, p.titulo, p.observacao,
    p.criado_em, p.atualizado_em,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', o.id, 'rotulo', o.rotulo, 'ordem', o.ordem,
               'consentida_em', o.consentida_em, 'consentida_por', o.consentida_por)
             ORDER BY o.ordem)
      FROM aba_treatment.opcoes o WHERE o.plano_id = p.id
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id, 'dente', d.dente, 'faces', d.faces, 'descricao', d.descricao,
               -- A FILA DE TRABALHO é derivada, e vem calculada daqui:
               -- diagnóstico sem procedimento nenhum ainda não foi fasado.
               'fasado', EXISTS (SELECT 1 FROM aba_treatment.procedimentos_plano x
                                 WHERE x.diagnostico_id = d.id))
             ORDER BY d.criado_em)
      FROM aba_treatment.diagnosticos d WHERE d.plano_id = p.id
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', pp.id, 'opcao_id', pp.opcao_id, 'fase_id', pp.fase_id,
               'procedimento_id', pp.procedimento_id,
               -- O braço novo do arco (Subetapa 03.8.c). Exatamente um dos
               -- dois vem preenchido.
               'pacote_id', pp.pacote_id,
               'diagnostico_id', pp.diagnostico_id,
               'dente', pp.dente, 'faces', pp.faces, 'estado', pp.estado,
               'consentimento_id', pp.consentimento_id,
               'recusado_em', pp.recusado_em, 'recusado_por', pp.recusado_por,
               'executado_em', pp.executado_em, 'executado_por', pp.executado_por,
               'observacao', pp.observacao,
               -- AS FACES EXECUTADAS, com data e autor (Subetapa 03.8.b,
               -- passo 36 do caminho feliz).
               'execucoes', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                          'face', e.face, 'executado_em', e.executado_em,
                          'executado_por', e.executado_por, 'executado_por_nome', pfe.full_name)
                        ORDER BY e.executado_em, e.face)
                 FROM aba_treatment.execucoes_face e
                 LEFT JOIN public.profiles pfe ON pfe.user_id = e.executado_por AND pfe.account_id = e.account_id
                 WHERE e.procedimento_plano_id = pp.id
               ), '[]'::jsonb))
             ORDER BY pp.criado_em)
      FROM aba_treatment.procedimentos_plano pp WHERE pp.plano_id = p.id
    ), '[]'::jsonb)
  FROM aba_treatment.planos p
  WHERE p.cliente_id = p_cliente_id AND p.account_id = v_account_id
  ORDER BY p.criado_em;
END;
$function$
;

-- aba_finance.assinar_contrato_como_profissional
CREATE OR REPLACE FUNCTION aba_finance.assinar_contrato_como_profissional(p_contrato_id uuid, p_hash text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_account_id UUID := aba_finance.conta_do_chamador('agent', 'read');
  v_c RECORD;
BEGIN
  SELECT c.id, c.status, c.documento_hash, c.profissional_id INTO v_c
  FROM aba_finance.contratos c WHERE c.id = p_contrato_id AND c.account_id = v_account_id;
  IF v_c.id IS NULL THEN
    RAISE EXCEPTION 'Contrato % não existe nesta conta.', p_contrato_id USING ERRCODE = '42501';
  END IF;
  IF v_c.status <> 'rascunho' OR v_c.documento_hash IS NULL THEN
    RAISE EXCEPTION 'Só se assina contrato em rascunho com documento emitido.' USING ERRCODE = '23514';
  END IF;
  -- Assina-se o que se leu: o hash informado tem de ser o do documento.
  IF p_hash IS DISTINCT FROM v_c.documento_hash THEN
    RAISE EXCEPTION 'O documento assinado não é o documento atual do contrato — confira o código impresso.' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM aba_scheduling.profissionais pr
    JOIN public.profiles pf ON pf.id = pr.profile_id
    WHERE pr.id = v_c.profissional_id AND pr.account_id = v_account_id AND pf.user_id = auth.uid()
      AND pf.account_id = public.active_account_id() -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha
  ) THEN
    RAISE EXCEPTION 'Só o profissional responsável assina pela parte profissional (D-F7).' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM aba_finance.assinaturas_contrato a WHERE a.contrato_id = v_c.id AND a.parte = 'profissional') THEN
    RAISE EXCEPTION 'A parte profissional já assinou este documento.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO aba_finance.assinaturas_contrato
    (account_id, contrato_id, parte, via, hash_assinado, assinada_em, registrada_por, profissional_id)
  VALUES (v_account_id, v_c.id, 'profissional', 'presencial', v_c.documento_hash, NOW(), auth.uid(), v_c.profissional_id);
  INSERT INTO aba_finance.eventos_contrato (account_id, contrato_id, tipo, ator, detalhe)
  VALUES (v_account_id, v_c.id, 'assinatura_registrada', auth.uid(),
          jsonb_build_object('parte', 'profissional', 'via', 'presencial', 'hash', v_c.documento_hash));
END;
$function$
;

-- aba_finance.guardar_aprovacao_orcamento
CREATE OR REPLACE FUNCTION aba_finance.guardar_aprovacao_orcamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_ator     UUID := auth.uid();
  v_dinheiro TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'rascunho' THEN
      RAISE EXCEPTION 'Orçamento nasce em rascunho — aprovar é gesto do profissional que vai executar, depois de conferir os itens.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- Plano e opção são a identidade do orçamento. Mudá-los seria mover um
  -- número aprovado para outro tratamento.
  IF NEW.plano_id IS DISTINCT FROM OLD.plano_id OR NEW.opcao_id IS DISTINCT FROM OLD.opcao_id THEN
    RAISE EXCEPTION 'Orçamento não muda de plano nem de opção.' USING ERRCODE = '23514';
  END IF;

  -- As seis colunas de DINHEIRO, comparadas coluna a coluna e pelo TIPO
  -- delas — nunca como texto de `to_jsonb` (`instrucoes.md` §5: `NUMERIC`
  -- serializa zero como `0.00`). A lista é a mesma de `trg_orcamentos_alcada`.
  IF NEW.desconto_valor    IS DISTINCT FROM OLD.desconto_valor    THEN v_dinheiro := v_dinheiro || 'desconto_valor'::TEXT;    END IF;
  IF NEW.desconto_motivo   IS DISTINCT FROM OLD.desconto_motivo   THEN v_dinheiro := v_dinheiro || 'desconto_motivo'::TEXT;   END IF;
  IF NEW.promocao          IS DISTINCT FROM OLD.promocao          THEN v_dinheiro := v_dinheiro || 'promocao'::TEXT;          END IF;
  IF NEW.parcelas          IS DISTINCT FROM OLD.parcelas          THEN v_dinheiro := v_dinheiro || 'parcelas'::TEXT;          END IF;
  IF NEW.taxa_juros        IS DISTINCT FROM OLD.taxa_juros        THEN v_dinheiro := v_dinheiro || 'taxa_juros'::TEXT;        END IF;
  IF NEW.taxa_multa_atraso IS DISTINCT FROM OLD.taxa_multa_atraso THEN v_dinheiro := v_dinheiro || 'taxa_multa_atraso'::TEXT; END IF;

  -- ============ o orçamento ESTAVA aprovado ============
  IF OLD.estado = 'aprovado' THEN
    IF NEW.estado = 'aprovado' AND cardinality(v_dinheiro) > 0 THEN
      -- D-F3: mexer em dinheiro DESFAZ a aprovação. Sem erro — a mudança é
      -- legítima (a alçada já conferiu que é da recepção), e o efeito dela
      -- é o profissional ter de olhar de novo.
      NEW.estado       := 'rascunho';
      NEW.aprovado_em  := NULL;
      NEW.aprovado_por := NULL;
      INSERT INTO aba_finance.eventos_orcamento (account_id, orcamento_id, tipo, colunas, ator)
      VALUES (NEW.account_id, NEW.id, 'devolvido_a_rascunho', v_dinheiro, v_ator);
      RETURN NEW;
    END IF;

    IF NEW.estado = 'aprovado' THEN
      IF NEW.profissional_id IS DISTINCT FROM OLD.profissional_id
         OR NEW.aprovado_em IS DISTINCT FROM OLD.aprovado_em
         OR NEW.aprovado_por IS DISTINCT FROM OLD.aprovado_por THEN
        RAISE EXCEPTION 'Orçamento aprovado não troca de profissional nem de carimbo de aprovação — o número aprovado é de quem o aprovou.'
          USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END IF;

    IF NEW.estado = 'rascunho' THEN
      NEW.aprovado_em  := NULL;
      NEW.aprovado_por := NULL;
      INSERT INTO aba_finance.eventos_orcamento (account_id, orcamento_id, tipo, colunas, ator)
      VALUES (NEW.account_id, NEW.id, 'devolvido_a_rascunho', v_dinheiro, v_ator);
      RETURN NEW;
    END IF;

    -- `recusado`: o CHECK `orcamentos_aprovacao_completa` decide, como antes.
    RETURN NEW;
  END IF;

  -- ============ a transição PARA aprovado ============
  IF NEW.estado = 'aprovado' THEN
    IF OLD.estado <> 'rascunho' THEN
      RAISE EXCEPTION 'Só orçamento em rascunho se aprova; este está %.', OLD.estado USING ERRCODE = '23514';
    END IF;

    -- Aprovar é ato datado e atribuível — a lição da 03.8 sobre
    -- `consentir_opcao`: função que grava autoria trata `auth.uid()` nulo
    -- no topo, com mensagem própria.
    IF v_ator IS NULL THEN
      RAISE EXCEPTION 'Aprovar um orçamento exige sessão autenticada — a aprovação precisa de autor e data.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.profissional_id IS DISTINCT FROM OLD.profissional_id THEN
      RAISE EXCEPTION 'Troque o profissional e aprove em dois gestos — os preços foram resolvidos para o profissional anterior.'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.profissional_id IS NULL THEN
      RAISE EXCEPTION 'Orçamento sem profissional definido não se aprova — quem aprova é quem vai executar (D-F7).'
        USING ERRCODE = '23514';
    END IF;

    -- D-F7: o login de quem chama É o login do profissional que executa.
    -- Sem exceção para `owner` — é comum o `owner` não ser dentista (D-V7),
    -- e aprovar o preço clínico no lugar de quem executa é a vinculação
    -- "sem ele saber" que a D-F3 existe para impedir.
    IF NOT EXISTS (
      SELECT 1
      FROM aba_scheduling.profissionais pr
      JOIN public.profiles pf ON pf.id = pr.profile_id
      WHERE pr.id = NEW.profissional_id
        AND pr.account_id = NEW.account_id
        AND pf.user_id = v_ator
        AND pf.account_id = public.active_account_id() -- Subetapa 03.9: a conta ATIVA, nunca a primeira linha
    ) THEN
      RAISE EXCEPTION 'Só o profissional que vai executar aprova este orçamento — é ele quem responde pelo número (D-F3, D-F7).'
        USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM aba_finance.itens_orcamento i WHERE i.orcamento_id = NEW.id) THEN
      RAISE EXCEPTION 'Orçamento sem item não se aprova.' USING ERRCODE = '23514';
    END IF;

    NEW.aprovado_em  := NOW();
    NEW.aprovado_por := v_ator;
    INSERT INTO aba_finance.eventos_orcamento (account_id, orcamento_id, tipo, colunas, ator)
    VALUES (NEW.account_id, NEW.id, 'aprovado', '{}', v_ator);
  END IF;

  RETURN NEW;
END;
$function$
;

-- ---------------------------------------------------------------------
-- §5 — VERIFICAÇÕES QUE RECUSAM A MIGRATION
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_sobra TEXT;
BEGIN
  -- (a) nenhuma função das 27 continua descobrindo a conta por user_id sem a conta ativa
  SELECT string_agg(n.nspname || '.' || p.proname, ', ') INTO v_sobra
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE (n.nspname || '.' || p.proname) IN (
    'licensing.seat_usage', 'aba_automations.listar_execucoes_pendentes', 'aba_automations.listar_jobs_agendados',
    'aba_catalog.semear_procedimentos_sigtap', 'aba_finance.conta_do_chamador', 'aba_finance.execucao_liberada_no_plano',
    'aba_finance.ler_contratos_do_cliente', 'aba_finance.ler_orcamentos', 'aba_finance.montar_orcamento',
    'aba_finance.planos_orcados_do_cliente', 'aba_finance.registrar_execucao_item', 'aba_finance.resolver_preco_item',
    'aba_finance.simular_troca_de_profissional', 'aba_finance.situacao_contrato', 'aba_finance.trocar_profissional_do_orcamento',
    'aba_health.ler_consentimentos', 'aba_health.ler_evolucoes', 'aba_health.ler_prontuario',
    'aba_health.ler_respostas_anamnese', 'aba_health.registrar_recusa_assinatura', 'aba_treatment.ler_planos',
    'aba_finance.assinar_contrato_como_profissional', 'aba_finance.guardar_aprovacao_orcamento',
    'public.criar_convite', 'public.set_member_role', 'public.transfer_account_ownership', 'public.remove_account_member')
    AND p.prosrc !~ 'active_account_id\(\)';
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION '(a) função sem conta ativa: %', v_sobra;
  END IF;

  -- (b) nenhuma função de equipe atualiza perfil por user_id
  SELECT string_agg(p.proname, ', ') INTO v_sobra
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('set_member_role', 'transfer_account_ownership', 'remove_account_member', 'resgatar_convite')
    AND p.prosrc ~* 'UPDATE\s+public\.profiles\s+SET[^;]*WHERE\s+user_id';
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION '(b) UPDATE de profiles por user_id em: %', v_sobra;
  END IF;

  -- (c) formularios_anamnese com cerca de conta nas três políticas
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'aba_health' AND tablename = 'formularios_anamnese'
        AND coalesce(qual, '') || coalesce(with_check, '') ~ 'is_account_member\(account_id') <> 3 THEN
    RAISE EXCEPTION '(c) formularios_anamnese sem cerca de conta em alguma política.';
  END IF;

  -- (d) privilégio preservado: nenhuma das funções reescritas ficou executável por anon
  SELECT string_agg(n.nspname || '.' || p.proname, ', ') INTO v_sobra
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosrc ~ 'Subetapa 03\.9'
    AND n.nspname IN ('public', 'licensing', 'aba_automations', 'aba_catalog', 'aba_finance', 'aba_health', 'aba_treatment')
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION '(d) executável por anon: %', v_sobra;
  END IF;
END $$;
