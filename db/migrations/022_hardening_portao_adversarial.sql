-- ============================================================
-- 022_hardening_portao_adversarial.sql — correções das falhas reais
-- encontradas no portão de segurança adversarial (Subetapa 01.8).
--
-- Cada bloco abaixo fecha um achado MEDIDO AO VIVO contra o banco do
-- Vitrine — nenhum é hipotético. A prova de cada um está em
-- crm/tests/rls/10_adversarial_nucleo.spec.ts (ataque que passava
-- antes desta migration e passa a ser barrado depois).
--
--   A01 (CRÍTICO) — tomada de conta por INSERT em public.profiles
--   A02 (ALTO)    — admin reescrevia public.accounts.owner_user_id
--   A03 (ALTO)    — viewer lia public.webhook_endpoints.secret
--   A04 (MÉDIO)   — viewer lia public.api_keys.key_hash
--   A05 (MÉDIO)   — viewer lia aba_ai.ia_configuracoes.chave_api
--   A07 (MÉDIO)   — membro lia public.account_invitations.token_hash
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

-- ============================================================
-- A01 — TOMADA DE CONTA POR INSERT EM public.profiles
--
-- Achado: a policy profiles_insert (001_core_public.sql) checava só
-- `auth.uid() = user_id`, sem olhar account_id nem account_role, e a
-- trava enforce_profile_privilege_columns era BEFORE UPDATE — não
-- cobria INSERT. Um usuário autenticado SEM linha em profiles se
-- inseria em conta alheia como 'owner' e passava a enxergar a conta
-- da vítima. O estado "sem perfil" não é teórico: handle_new_user
-- engole qualquer exceção (EXCEPTION WHEN OTHERS ... RETURN NEW),
-- deixando o usuário em auth.users sem perfil.
--
-- Correção em duas camadas:
--   1. A policy de INSERT deixa de existir. Ausência de policy nega
--      por padrão — mesmo padrão já usado em licensing.account_limits.
--      Não há escritor legítimo de profiles em authenticated:
--      handle_new_user (e as futuras RPCs de convite) rodam
--      SECURITY DEFINER como postgres, que não passa por RLS.
--   2. A trava de coluna passa a cobrir INSERT também, como defesa em
--      profundidade — se uma policy de INSERT voltar um dia por
--      descuido, ela ainda não consegue plantar papel/conta.
-- ============================================================
DROP POLICY IF EXISTS profiles_insert ON public.profiles;

CREATE OR REPLACE FUNCTION public.enforce_profile_privilege_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION
      'perfil não pode ser criado diretamente — use o fluxo de convite'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.account_role IS DISTINCT FROM OLD.account_role
     OR NEW.account_id IS DISTINCT FROM OLD.account_id
  THEN
    RAISE EXCEPTION
      'account_role e account_id não podem ser alterados diretamente'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_profile_privilege_columns() OWNER TO postgres;

DROP TRIGGER IF EXISTS enforce_profile_privilege_columns ON public.profiles;
CREATE TRIGGER enforce_profile_privilege_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_privilege_columns();

-- ============================================================
-- A02 — ADMIN SE APOSSAVA DA CONTA REESCREVENDO owner_user_id
--
-- Achado: accounts_update autoriza admin+ a atualizar a linha da
-- própria conta (legítimo — nome da conta é configuração), mas RLS
-- restringe QUAIS LINHAS, nunca QUAIS COLUNAS. Nada impedia
-- `UPDATE accounts SET owner_user_id = <admin>`, transferindo a
-- titularidade do registro sem passar por transferência de posse.
--
-- Mesmo remédio já usado em profiles: trigger de coluna. A troca
-- legítima de dono virá pela RPC transfer_ownership (Maximus 019) na
-- Etapa 02, SECURITY DEFINER, que passa livre por não ser
-- 'authenticated'.
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_account_privilege_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
     AND current_user = 'authenticated'
  THEN
    RAISE EXCEPTION
      'a titularidade da conta não pode ser alterada diretamente'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_account_privilege_columns() OWNER TO postgres;

DROP TRIGGER IF EXISTS enforce_account_privilege_columns ON public.accounts;
CREATE TRIGGER enforce_account_privilege_columns
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_account_privilege_columns();

-- ============================================================
-- A03/A04/A05/A07 — CREDENCIAL GUARDADA NO BANCO ERA LEGÍVEL PELA API
--
-- Achado: aba_messaging (020) escondeu suas colunas de segredo por
-- narrowing de coluna (Maximus 055), mas o núcleo e aba_ai nunca
-- receberam o mesmo tratamento. Medido ao vivo: um VIEWER — o papel
-- mais fraco do produto — lia o segredo de assinatura de webhook em
-- TEXTO PURO, o hash de api_key e a chave de IA cifrada.
--
-- Correção: mesmo padrão de 020_aba_messaging.sql — REVOKE SELECT da
-- tabela e reconceder SELECT só nas colunas que não são credencial.
-- A lista de colunas é derivada do catálogo, não escrita à mão, para
-- que coluna nova entre no GRANT sem reabrir esta migration.
--
-- ORDEM IMPORTA (armadilha já registrada em handoffs/instrucoes.md
-- §5, achado da Subetapa 01.4): um GRANT de tabela inteira aplicado
-- DEPOIS deste bloco reconcede a coluna de segredo por cima e anula o
-- narrowing em silêncio. Nenhum GRANT amplo pode vir depois daqui.
--
-- CONSEQUÊNCIA ACEITA E MEDIDA: `select('*')` nessas quatro tabelas
-- passa a devolver 42501 para authenticated — a UI da Etapa 02
-- precisa listar colunas explicitamente, exatamente como já acontece
-- com aba_messaging.configuracao_whatsapp desde a Subetapa 01.6.
-- ============================================================
DO $$
DECLARE
  v_alvo   RECORD;
  v_cols   TEXT;
BEGIN
  FOR v_alvo IN
    SELECT * FROM (VALUES
      ('public',  'webhook_endpoints',   'secret'),
      ('public',  'api_keys',            'key_hash'),
      ('public',  'account_invitations', 'token_hash'),
      ('aba_ai',  'ia_configuracoes',    'chave_api')
    ) AS t(esquema, tabela, coluna_segredo)
  LOOP
    EXECUTE format('REVOKE SELECT ON %I.%I FROM authenticated', v_alvo.esquema, v_alvo.tabela);

    SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
    WHERE table_schema = v_alvo.esquema
      AND table_name   = v_alvo.tabela
      AND column_name <> v_alvo.coluna_segredo;

    EXECUTE format('GRANT SELECT (%s) ON %I.%I TO authenticated',
                   v_cols, v_alvo.esquema, v_alvo.tabela);
  END LOOP;
END $$;

-- service_role (Edge Function / job de servidor) continua enxergando
-- tudo — é quem legitimamente opera a credencial.
GRANT SELECT ON public.webhook_endpoints, public.api_keys, public.account_invitations TO service_role;
GRANT SELECT ON aba_ai.ia_configuracoes TO service_role;
