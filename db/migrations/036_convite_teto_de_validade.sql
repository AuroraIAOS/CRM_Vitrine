-- =====================================================================
-- 036 — Teto de validade do convite (Subetapa 02.15)
--
-- ACHADO: `criar_convite(p_role, p_label, p_dias_validade)` aplicava
-- `greatest(p_dias_validade, 1)` — piso de 1 dia, e NENHUM teto. Um
-- `admin` (ou um cliente de API com a sessão dele) podia emitir convite
-- com 36500 dias de validade. Não é escalada de privilégio: quem chama
-- já podia convidar. É PERSISTÊNCIA — o link vira porta permanente para
-- dentro da conta se vazar por e-mail encaminhado, print, histórico de
-- navegador ou caixa de entrada comprometida, e ninguém revoga o que
-- não sabe que existe.
--
-- Orientação da OWASP para credencial desse tipo: curta e de uso único.
-- O convite deste projeto JÁ é de uso único (`accepted_at` + `FOR UPDATE`
-- em `resgatar_convite`, provado no portão adversarial) e JÁ expira. O
-- que faltava era o teto.
--
-- DECISÃO DE MAX (2026-08-20): o convite vive 7 dias. O parâmetro
-- continua existindo para permitir prazo MENOR (convite de um dia para
-- alguém que entra hoje), mas nunca maior.
--
-- Único trecho alterado em relação à 024: a linha de `v_expires_at`.
-- O resto da função é reproduzido sem modificação.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.criar_convite(
  p_role public.account_role_enum,
  p_label text DEFAULT NULL::text,
  p_dias_validade integer DEFAULT 7
)
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

COMMENT ON FUNCTION public.criar_convite(public.account_role_enum, text, integer) IS
  'Cria convite de equipe. Token de 256 bits, gravado só como hash sha256. Validade limitada a 7 dias (teto da Subetapa 02.15).';
