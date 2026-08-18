-- ============================================================
-- 024_equipe_convite_funcionario_profissional.sql
--
-- Subetapa 02.2 — fluxo de equipe de 5 passos verificado contra o CRM
-- Maximus na Etapa de Transição 1→2 (docs/01_ARQUITETURA.md §7.4):
-- owner convida por e-mail → convidado aceita → funcionário nasce
-- automaticamente → owner liga/desliga o atributo profissional →
-- acesso segue role/atributo (ponta final já portada na Subetapa 01.4,
-- aba_health.pode_acessar()).
--
-- Fontes no CRM Maximus (portar a lógica, traduzir os nomes —
-- CLAUDE.md §2/§14):
--   018_account_member_rpcs.sql        -> set_member_role /
--                                          remove_account_member /
--                                          transfer_account_ownership
--                                          (porte 1:1 — public é núcleo
--                                          herdado, fica em inglês)
--   019_invitation_rpcs.sql            -> peek_convite / resgatar_convite
--                                          (nomes traduzidos por decisão
--                                          já registrada em docs/00 e
--                                          docs/01 §7.4)
--   074_employees_born_from_invitation.sql -> aba_people.nascer_funcionario_do_perfil()
--   075_professionals_require_employee.sql -> aba_scheduling.definir_profissional()
--
-- DUAS PEÇAS SEM EQUIVALENTE NO MAXIMUS (SPA estática, sem servidor):
--
--   1) criar_convite() — no Maximus, o token era gerado e hasheado por
--      um route handler Next.js antes de chegar ao banco (comentário
--      original: "the plaintext token never reaches the DB; the route
--      handler hashes it first"). Aqui não há servidor: a RPC gera o
--      token com pgcrypto (extensions.gen_random_bytes, 256 bits) e
--      devolve o texto em claro no retorno — uma única vez, nunca
--      legível depois (token_hash tem narrowing de coluna desde a
--      migration 022). Ver handoffs/instrucoes.md §5.
--
--   2) peek_convite/resgatar_convite recebem o TOKEN EM CLARO, não o
--      hash — pelo mesmo motivo: no Maximus, o hash era calculado no
--      servidor antes da chamada RPC; aqui o hash é calculado DENTRO
--      da função (extensions.digest(..., 'sha256')), porque não existe
--      camada de servidor no client para fazer esse cálculo com a
--      mesma garantia. Mantém 100% da lógica de hashing dentro do
--      banco — nunca reimplementada em JS, nunca duas fontes de verdade.
--
-- ADAPTAÇÃO DE ESQUEMA (redeem_invitation "has any domain data"):
--   O Maximus varria 11 tabelas do public monolítico original. O
--   Vitrine redistribuiu tudo em 9 schemas aba_*; varrer exaustivamente
--   seria dezenas de tabelas. Restrito às tabelas de papel de
--   aba_people (leads/clientes/fornecedores — nunca a pessoas em si:
--   desde que o trigger da Parte 3 passou a criar uma pessoa+funcionário
--   automáticos para TODO profile novo, checar aba_people.pessoas faria
--   toda conta pessoal recém-criada parecer "com dado", mesmo vazia —
--   falso positivo medido ao vivo nos testes desta subetapa, ver
--   handoffs/instrucoes.md §5) mais as raízes de catalog/automations/ai,
--   que podem ser configuradas sem nenhuma pessoa cadastrada.
--   scheduling/finance/health/messaging/sales sempre referenciam
--   clientes ou catalog — se essas raízes estão vazias, o resto
--   necessariamente está.
--
-- Regra nova de Max (não existe no Maximus, docs/01_ARQUITETURA.md
-- §7.3): o atributo profissional só pode ser concedido a funcionário
-- com account_role = 'agent' — nunca 'admin'.
--
-- Toda função nova: REVOKE EXECUTE FROM PUBLIC e FROM anon (exceto
-- peek_convite, que precisa de anon para o visitante pré-login — mesma
-- exceção documentada e deliberada do Maximus original).
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

-- ============================================================
-- PARTE 1 — RPCs de gestão de membro (porte 1:1 de 018)
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_member_role(
  p_user_id UUID,
  p_new_role public.account_role_enum
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role public.account_role_enum;
  v_target_account_id UUID;
  v_target_role public.account_role_enum;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT account_id, account_role INTO v_caller_account_id, v_caller_role
  FROM public.profiles WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Chamador sem conta' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Requer papel admin ou superior' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Não é possível alterar o próprio papel' USING ERRCODE = '22023';
  END IF;

  SELECT account_id, account_role INTO v_target_account_id, v_target_role
  FROM public.profiles WHERE user_id = p_user_id;

  IF v_target_account_id IS NULL THEN
    RAISE EXCEPTION 'Usuário alvo não encontrado' USING ERRCODE = '22023';
  END IF;

  IF v_target_account_id <> v_caller_account_id THEN
    RAISE EXCEPTION 'Usuário alvo não pertence à sua conta' USING ERRCODE = '42501';
  END IF;

  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Use transfer_account_ownership para rebaixar um owner' USING ERRCODE = '22023';
  END IF;
  IF p_new_role = 'owner' THEN
    RAISE EXCEPTION 'Use transfer_account_ownership para promover a owner' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles SET account_role = p_new_role WHERE user_id = p_user_id;
END;
$$;

ALTER FUNCTION public.set_member_role(UUID, public.account_role_enum) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_member_role(UUID, public.account_role_enum) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_member_role(UUID, public.account_role_enum) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_member_role(UUID, public.account_role_enum) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_account_member(
  p_user_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role public.account_role_enum;
  v_target_account_id UUID;
  v_target_role public.account_role_enum;
  v_target_name TEXT;
  v_target_email TEXT;
  v_new_account_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT account_id, account_role INTO v_caller_account_id, v_caller_role
  FROM public.profiles WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Chamador sem conta' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Requer papel admin ou superior' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Não é possível remover a si mesmo — transfira a titularidade ou saia da conta' USING ERRCODE = '22023';
  END IF;

  SELECT account_id, account_role, full_name, email
  INTO v_target_account_id, v_target_role, v_target_name, v_target_email
  FROM public.profiles WHERE user_id = p_user_id;

  IF v_target_account_id IS NULL THEN
    RAISE EXCEPTION 'Usuário alvo não encontrado' USING ERRCODE = '22023';
  END IF;

  IF v_target_account_id <> v_caller_account_id THEN
    RAISE EXCEPTION 'Usuário alvo não pertence à sua conta' USING ERRCODE = '42501';
  END IF;

  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Não é possível remover o owner da conta — transfira a titularidade primeiro' USING ERRCODE = '22023';
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
  WHERE user_id = p_user_id;

  RETURN v_new_account_id;
END;
$$;

ALTER FUNCTION public.remove_account_member(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.remove_account_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_account_member(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.remove_account_member(UUID) TO authenticated;

-- transfer_account_ownership — fecha a promessa da correção A02 da
-- Subetapa 01.8: única forma legítima de trocar accounts.owner_user_id.
CREATE OR REPLACE FUNCTION public.transfer_account_ownership(
  p_new_owner_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role public.account_role_enum;
  v_target_account_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT account_id, account_role INTO v_caller_account_id, v_caller_role
  FROM public.profiles WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Chamador sem conta' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Só o owner da conta pode transferir a titularidade' USING ERRCODE = '42501';
  END IF;

  IF p_new_owner_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Você já é o owner' USING ERRCODE = '22023';
  END IF;

  SELECT account_id INTO v_target_account_id
  FROM public.profiles WHERE user_id = p_new_owner_user_id;

  IF v_target_account_id IS NULL THEN
    RAISE EXCEPTION 'Usuário alvo não encontrado' USING ERRCODE = '22023';
  END IF;

  IF v_target_account_id <> v_caller_account_id THEN
    RAISE EXCEPTION 'Usuário alvo não pertence à sua conta' USING ERRCODE = '42501';
  END IF;

  -- Rebaixa o owner atual antes de promover o novo — a conta nunca
  -- fica com zero owners visível, os dois UPDATEs saem na mesma
  -- transação da função.
  UPDATE public.profiles SET account_role = 'admin' WHERE user_id = auth.uid();
  UPDATE public.profiles SET account_role = 'owner' WHERE user_id = p_new_owner_user_id;
  UPDATE public.accounts SET owner_user_id = p_new_owner_user_id WHERE id = v_caller_account_id;
END;
$$;

ALTER FUNCTION public.transfer_account_ownership(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.transfer_account_ownership(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_account_ownership(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.transfer_account_ownership(UUID) TO authenticated;

-- ============================================================
-- PARTE 2 — RPCs de convite (019, com as duas adaptações do
-- cabeçalho: criação nova, token em claro nos parâmetros)
-- ============================================================

CREATE OR REPLACE FUNCTION public.criar_convite(
  p_role public.account_role_enum,
  p_label TEXT DEFAULT NULL,
  p_dias_validade INTEGER DEFAULT 7
) RETURNS JSON
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
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

  SELECT account_id, account_role INTO v_account_id, v_role_atual
  FROM public.profiles WHERE user_id = auth.uid();

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
  v_expires_at := now() + make_interval(days => greatest(p_dias_validade, 1));

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
$$;

ALTER FUNCTION public.criar_convite(public.account_role_enum, TEXT, INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.criar_convite(public.account_role_enum, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_convite(public.account_role_enum, TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.criar_convite(public.account_role_enum, TEXT, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.peek_convite(
  p_token TEXT
) RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token_hash TEXT;
  v_inv public.account_invitations%ROWTYPE;
  v_account_name TEXT;
BEGIN
  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_inv FROM public.account_invitations WHERE token_hash = v_token_hash;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'used');
  END IF;

  IF v_inv.expires_at <= now() THEN
    RETURN json_build_object('ok', false, 'reason', 'expired');
  END IF;

  SELECT name INTO v_account_name FROM public.accounts WHERE id = v_inv.account_id;

  RETURN json_build_object(
    'ok', true,
    'account_name', v_account_name,
    'role', v_inv.role,
    'expires_at', v_inv.expires_at
  );
END;
$$;

ALTER FUNCTION public.peek_convite(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.peek_convite(TEXT) FROM PUBLIC;
-- Exceção deliberada (igual ao Maximus original): `anon` precisa
-- pré-visualizar o convite antes de logar/cadastrar.
GRANT EXECUTE ON FUNCTION public.peek_convite(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.resgatar_convite(
  p_token TEXT
) RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_token_hash TEXT;
  v_inv public.account_invitations%ROWTYPE;
  v_old_account_id UUID;
  v_old_account_owner UUID;
  v_tem_dado BOOLEAN;
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

  SELECT p.account_id, a.owner_user_id INTO v_old_account_id, v_old_account_owner
  FROM public.profiles p JOIN public.accounts a ON a.id = p.account_id
  WHERE p.user_id = v_caller_id;

  IF v_old_account_id IS NULL THEN
    RAISE EXCEPTION 'Chamador sem perfil' USING ERRCODE = '42501';
  END IF;

  IF v_old_account_id = v_inv.account_id THEN
    RAISE EXCEPTION 'Você já é membro desta conta' USING ERRCODE = '23505';
  END IF;

  -- Chamador precisa ser o ÚNICO owner da própria conta atual (conta
  -- pessoal recém-criada no cadastro, ou devolvida por
  -- remove_account_member) — qualquer outro estado significa abandonar
  -- uma conta compartilhada ou uma equipe já formada.
  IF v_old_account_owner <> v_caller_id THEN
    RAISE EXCEPTION 'Você já pertence a uma conta compartilhada — cadastre-se com outro e-mail para aceitar este convite' USING ERRCODE = '23505';
  END IF;

  -- Cinto e suspensório: recusa se a conta atual já tem dado de
  -- domínio (ver nota de adaptação no cabeçalho do arquivo — nunca
  -- aba_people.pessoas, que toda conta nova já tem por causa da Parte 3
  -- desta mesma migration).
  SELECT EXISTS (
    SELECT 1 FROM aba_people.leads WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM aba_people.clientes WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM aba_people.fornecedores WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM aba_catalog.servicos WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM aba_catalog.planos WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM aba_automations.automacoes WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM aba_automations.fluxos WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM aba_ai.ia_documentos_conhecimento WHERE account_id = v_old_account_id
    LIMIT 1
  ) INTO v_tem_dado;

  IF v_tem_dado THEN
    RAISE EXCEPTION 'Sua conta já contém dados — cadastre-se com outro e-mail para aceitar este convite' USING ERRCODE = '23505';
  END IF;

  -- Move o perfil primeiro, para que o cascade do DELETE da conta
  -- antiga não tente apagar este mesmo perfil junto.
  UPDATE public.profiles
  SET account_id = v_inv.account_id, account_role = v_inv.role
  WHERE user_id = v_caller_id;

  UPDATE public.account_invitations
  SET accepted_at = now(), accepted_by_user_id = v_caller_id
  WHERE id = v_inv.id;

  -- Limpeza da conta pessoal órfã — vazia pelas checagens acima, então
  -- é só faxina, nenhum cascade dispara em cima de outra linha.
  DELETE FROM public.accounts WHERE id = v_old_account_id;

  RETURN v_inv.account_id;
END;
$$;

ALTER FUNCTION public.resgatar_convite(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.resgatar_convite(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resgatar_convite(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.resgatar_convite(TEXT) TO authenticated;

-- ============================================================
-- PARTE 3 — Nascimento automático de funcionário (074, adaptado à
-- tabela-mãe: funcionarios.id É pessoas.id, chave compartilhada —
-- o Maximus tinha people.employees como tabela solta com full_name/
-- email próprios; aqui é preciso criar a pessoa primeiro).
-- ============================================================

-- Backfill — os 4 perfis de teste da suíte de RLS (Subetapa 01.2, antes
-- desta migration existir) ficariam inconsistentes com todo perfil
-- futuro sem isso. Nenhuma linha em funcionarios/pessoas ligada a eles
-- existia antes desta migration (conferido na Subetapa 02.2). Um
-- registro por vez (não por junção fraca) — mesma lógica do trigger
-- abaixo, para não depender de (account_id, email) serem únicos juntos.
DO $$
DECLARE
  v_profile RECORD;
  v_pessoa_id UUID;
BEGIN
  FOR v_profile IN
    SELECT p.id, p.account_id, p.full_name, p.email
    FROM public.profiles p
    WHERE NOT EXISTS (SELECT 1 FROM aba_people.funcionarios f WHERE f.profile_id = p.id)
  LOOP
    INSERT INTO aba_people.pessoas (account_id, nome_exibicao, email)
    VALUES (v_profile.account_id, COALESCE(NULLIF(v_profile.full_name, ''), v_profile.email, 'Sem nome'), v_profile.email)
    RETURNING id INTO v_pessoa_id;

    INSERT INTO aba_people.funcionarios (id, account_id, profile_id, ativo)
    VALUES (v_pessoa_id, v_profile.account_id, v_profile.id, TRUE);
  END LOOP;
END;
$$;

-- Um perfil, um funcionário (mesmo padrão de idx_profissionais_funcionario_unico).
CREATE UNIQUE INDEX IF NOT EXISTS idx_funcionarios_profile_unico
  ON aba_people.funcionarios(profile_id) WHERE profile_id IS NOT NULL;

-- Funcionário ATIVO precisa de login (ex-funcionário pode não ter mais
-- — sobrevive inativo, histórico intacto). Sem backfill: nenhuma linha
-- em aba_people.funcionarios existia antes desta migration (conferido
-- na Subetapa 02.2).
ALTER TABLE aba_people.funcionarios
  DROP CONSTRAINT IF EXISTS funcionarios_ativo_exige_login;
ALTER TABLE aba_people.funcionarios
  ADD CONSTRAINT funcionarios_ativo_exige_login
  CHECK (ativo = FALSE OR profile_id IS NOT NULL);

CREATE OR REPLACE FUNCTION aba_people.nascer_funcionario_do_perfil()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pessoa_id UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.account_id IS DISTINCT FROM NEW.account_id THEN
    -- Saída: funcionário da conta antiga vira retrato de ex-membro,
    -- nunca apagado — agendamentos/comissões/evoluções continuam
    -- apontando para a mesma pessoa.
    UPDATE aba_people.funcionarios
    SET ativo = FALSE, profile_id = NULL, atualizado_em = now()
    WHERE account_id = OLD.account_id AND profile_id = NEW.id;
  END IF;

  -- Entrada (INSERT, ou UPDATE que mudou de conta): nasce funcionário
  -- ativo na conta nova, se ainda não existir um para este perfil.
  IF NOT EXISTS (SELECT 1 FROM aba_people.funcionarios WHERE profile_id = NEW.id) THEN
    INSERT INTO aba_people.pessoas (account_id, nome_exibicao, email)
    VALUES (NEW.account_id, COALESCE(NULLIF(NEW.full_name, ''), NEW.email, 'Sem nome'), NEW.email)
    RETURNING id INTO v_pessoa_id;

    INSERT INTO aba_people.funcionarios (id, account_id, profile_id, ativo)
    VALUES (v_pessoa_id, NEW.account_id, NEW.id, TRUE);
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_people.nascer_funcionario_do_perfil() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_people.nascer_funcionario_do_perfil() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_people.nascer_funcionario_do_perfil() FROM anon;
REVOKE ALL ON FUNCTION aba_people.nascer_funcionario_do_perfil() FROM authenticated;

DROP TRIGGER IF EXISTS nascer_funcionario_insert ON public.profiles;
CREATE TRIGGER nascer_funcionario_insert
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION aba_people.nascer_funcionario_do_perfil();

DROP TRIGGER IF EXISTS nascer_funcionario_move ON public.profiles;
CREATE TRIGGER nascer_funcionario_move
  AFTER UPDATE OF account_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION aba_people.nascer_funcionario_do_perfil();

-- ============================================================
-- PARTE 4 — Atributo profissional (075, com a regra nova de Max:
-- só account_role = 'agent')
-- ============================================================

ALTER TABLE aba_scheduling.profissionais
  DROP CONSTRAINT IF EXISTS profissionais_ativo_exige_funcionario;
ALTER TABLE aba_scheduling.profissionais
  ADD CONSTRAINT profissionais_ativo_exige_funcionario
  CHECK (ativo = FALSE OR (funcionario_id IS NOT NULL AND profile_id IS NOT NULL));

-- profile_id sempre derivado do funcionário vinculado — nunca escrito
-- à mão, nem pela RPC abaixo (que não recebe esse parâmetro).
CREATE OR REPLACE FUNCTION aba_scheduling.sincronizar_perfil_profissional()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.funcionario_id IS NOT NULL THEN
    SELECT profile_id INTO NEW.profile_id
    FROM aba_people.funcionarios WHERE id = NEW.funcionario_id;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_scheduling.sincronizar_perfil_profissional() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_scheduling.sincronizar_perfil_profissional() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_scheduling.sincronizar_perfil_profissional() FROM anon;
REVOKE ALL ON FUNCTION aba_scheduling.sincronizar_perfil_profissional() FROM authenticated;

DROP TRIGGER IF EXISTS sincronizar_perfil_profissional ON aba_scheduling.profissionais;
CREATE TRIGGER sincronizar_perfil_profissional
  BEFORE INSERT OR UPDATE ON aba_scheduling.profissionais
  FOR EACH ROW EXECUTE FUNCTION aba_scheduling.sincronizar_perfil_profissional();

-- Único caminho para ligar/desligar o atributo profissional. SECURITY
-- INVOKER (como o Maximus original) — a RLS mais larga da tabela
-- (agent+ edita a própria agenda) continua valendo; esta função soma
-- um piso mais alto (admin+) por cima, checado no corpo, para a ação
-- específica de governança "quem tem acesso clínico especial".
CREATE OR REPLACE FUNCTION aba_scheduling.definir_profissional(
  p_funcionario_id UUID,
  p_profissional BOOLEAN
) RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
  v_profile_id UUID;
  v_account_role public.account_role_enum;
  v_nome TEXT;
  v_profissional_id UUID;
BEGIN
  SELECT f.account_id, f.profile_id, p.nome_exibicao
  INTO v_account_id, v_profile_id, v_nome
  FROM aba_people.funcionarios f
  JOIN aba_people.pessoas p ON p.id = f.id
  WHERE f.id = p_funcionario_id;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Funcionário não encontrado' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_account_member(v_account_id, 'admin') THEN
    RAISE EXCEPTION 'Requer papel admin ou superior' USING ERRCODE = '42501';
  END IF;

  IF p_profissional THEN
    IF v_profile_id IS NULL THEN
      RAISE EXCEPTION 'Funcionário sem login ativo não pode virar profissional' USING ERRCODE = '22023';
    END IF;

    SELECT account_role INTO v_account_role FROM public.profiles WHERE id = v_profile_id;

    -- Regra nova de Max (docs/01_ARQUITETURA.md §7.3) — sem
    -- equivalente no CRM Maximus.
    IF v_account_role IS DISTINCT FROM 'agent' THEN
      RAISE EXCEPTION 'Atributo profissional só pode ser concedido a funcionário com papel agent' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT id INTO v_profissional_id
  FROM aba_scheduling.profissionais WHERE funcionario_id = p_funcionario_id;

  IF p_profissional THEN
    IF v_profissional_id IS NULL THEN
      INSERT INTO aba_scheduling.profissionais (account_id, funcionario_id, nome_exibicao, ativo)
      VALUES (v_account_id, p_funcionario_id, v_nome, TRUE)
      RETURNING id INTO v_profissional_id;
    ELSE
      UPDATE aba_scheduling.profissionais SET ativo = TRUE WHERE id = v_profissional_id;
    END IF;
  ELSE
    IF v_profissional_id IS NOT NULL THEN
      UPDATE aba_scheduling.profissionais SET ativo = FALSE WHERE id = v_profissional_id;
    END IF;
  END IF;

  RETURN v_profissional_id;
END;
$$;

ALTER FUNCTION aba_scheduling.definir_profissional(UUID, BOOLEAN) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_scheduling.definir_profissional(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_scheduling.definir_profissional(UUID, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION aba_scheduling.definir_profissional(UUID, BOOLEAN) TO authenticated, service_role;

COMMENT ON FUNCTION aba_scheduling.definir_profissional(UUID, BOOLEAN) IS
  'Único caminho para ligar/desligar o atributo profissional. Nunca DELETE — desligar é ativo=FALSE. profile_id sempre derivado do funcionário (trigger sincronizar_perfil_profissional). Exige admin+ e, para ligar, account_role=agent no funcionário (checagem no corpo, além da RLS mais larga da tabela).';
