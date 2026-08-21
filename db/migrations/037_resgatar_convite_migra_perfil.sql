-- =====================================================================
-- 037 — `resgatar_convite` sob chave composta por conta (Subetapa 02.15)
--
-- POR QUE ESTA MIGRATION EXISTE: a `035` tornou toda chave estrangeira
-- entre tabelas multi-inquilino composta por `account_id`. Isso vale
-- para todas — MENOS para uma situação que só existe aqui:
--
--   `public.profiles` é a única tabela do sistema cujo `account_id`
--   MUDA de propósito. Quando alguém aceita um convite, o perfil não é
--   copiado: ele MIGRA da conta solitária de origem para a conta que
--   convidou.
--
-- Com a chave composta, essa migração passou a ser recusada com `23503`:
-- o `funcionario` que nasceu junto com o perfil (trigger
-- `nascer_funcionario_do_perfil`) continuava apontando para o par
-- `(profile_id, conta_antiga)`, e mover o perfil quebrava esse par.
--
-- CUSTO REAL SE NÃO CORRIGIDO: nenhum convite seria aceito em produção.
-- Três testes da suíte pegaram na primeira execução após a `035` — é o
-- portão funcionando como portão.
--
-- A CORREÇÃO: apagar as referências da conta ANTIGA antes de mover o
-- perfil. Não é remendo, é o que já deveria acontecer — `resgatar_convite`
-- termina apagando a conta antiga inteira (`DELETE FROM public.accounts`),
-- e as funções de guarda logo acima garantem que ela é solitária, que o
-- chamador é o dono dela e que ela não tem nenhum dado de negócio. As
-- linhas removidas aqui são exatamente as que iriam junto no `DELETE`
-- final — só que agora precisam sair antes, e não depois.
--
-- Ordem importa: `profissionais` antes de `funcionarios`, porque
-- `profissionais.funcionario_id` referencia `funcionarios`.
--
-- Único trecho novo em relação à 024/036: `v_old_profile_id` e o bloco
-- "limpar vínculos da conta de origem". O resto é reproduzido igual.
-- =====================================================================

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
  v_old_account_id UUID;
  v_old_account_owner UUID;
  v_old_profile_id UUID;
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

  SELECT p.id, p.account_id, a.owner_user_id
    INTO v_old_profile_id, v_old_account_id, v_old_account_owner
  FROM public.profiles p JOIN public.accounts a ON a.id = p.account_id
  WHERE p.user_id = v_caller_id;

  IF v_old_account_id IS NULL THEN
    RAISE EXCEPTION 'Chamador sem perfil' USING ERRCODE = '42501';
  END IF;

  IF v_old_account_id = v_inv.account_id THEN
    RAISE EXCEPTION 'Você já é membro desta conta' USING ERRCODE = '23505';
  END IF;

  IF v_old_account_owner <> v_caller_id THEN
    RAISE EXCEPTION 'Você já pertence a uma conta compartilhada — cadastre-se com outro e-mail para aceitar este convite' USING ERRCODE = '23505';
  END IF;

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
  WHERE user_id = v_caller_id;

  UPDATE public.account_invitations
  SET accepted_at = now(), accepted_by_user_id = v_caller_id
  WHERE id = v_inv.id;

  DELETE FROM public.accounts WHERE id = v_old_account_id;

  RETURN v_inv.account_id;
END;
$function$;

COMMENT ON FUNCTION public.resgatar_convite(text) IS
  'Resgata convite de equipe: migra o perfil do chamador para a conta que convidou e apaga a conta solitária de origem. Limpa os vínculos da conta antiga antes de mover, porque desde a migration 035 as chaves para profiles são compostas por account_id.';
