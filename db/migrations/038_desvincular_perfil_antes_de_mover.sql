-- =====================================================================
-- 038 — Desvincular o perfil da conta antiga ANTES de movê-lo
--       (Subetapa 02.15)
--
-- CONTEXTO: a `035` tornou compostas por `account_id` as chaves que
-- apontam para `public.profiles` — `aba_people.funcionarios.profile_id`,
-- `aba_scheduling.profissionais.profile_id` e
-- `aba_people.pessoa_notas.autor_id`. `profiles` é a única tabela cujo
-- `account_id` muda de propósito: perfil MIGRA de conta no aceite de
-- convite e na remoção de membro.
--
-- O DEFEITO DE ORDEM: `aba_people.nascer_funcionario_do_perfil()` já
-- fazia a coisa certa — `SET ativo = FALSE, profile_id = NULL` na conta
-- antiga. Só que ela roda em gatilho **AFTER UPDATE**, e a verificação
-- da chave estrangeira (`NO ACTION`) também acontece no fim do comando.
-- A verificação vence a corrida: o `UPDATE` em `profiles` é recusado com
-- `23503` antes de o gatilho ter chance de desvincular.
--
-- POR QUE UM GATILHO `BEFORE` E NÃO UM REMENDO EM CADA FUNÇÃO: a `037`
-- corrigiu `resgatar_convite` chamando a limpeza à mão, e o teste
-- seguinte mostrou o mesmo erro em `remove_account_member` — porque o
-- problema nunca foi da função, e sim de QUALQUER caminho que mova um
-- perfil. Corrigir caminho por caminho deixa o próximo em aberto. Aqui a
-- regra passa a morar no banco, uma vez só.
--
-- POR QUE A CRIAÇÃO CONTINUA `AFTER`: o funcionário novo referencia
-- `(perfil, conta NOVA)`, par que só existe depois de a linha de
-- `profiles` ter sido atualizada. Separar as duas metades é o ponto:
-- desvincular antes, criar depois.
--
-- `pessoa_notas.autor_id` e `profissionais.profile_id` recebem o mesmo
-- tratamento que `funcionarios` já recebia — o registro permanece na
-- conta antiga (é histórico dela: agendamento, comissão, evolução e nota
-- continuam apontando para a mesma pessoa), apenas o vínculo com o login
-- que saiu é desfeito. É exatamente a semântica que o `ON DELETE SET
-- NULL` dessas chaves já declara para quando o perfil é apagado; aqui
-- ele não é apagado, é mudado de conta, então a desvinculação é nossa.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Metade 1 (nova) — BEFORE: desfaz os vínculos da conta de origem.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_people.desvincular_perfil_da_conta_antiga()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF OLD.account_id IS NOT DISTINCT FROM NEW.account_id THEN
    RETURN NEW;
  END IF;

  -- Funcionário da conta antiga vira retrato de ex-membro: nunca
  -- apagado, porque agendamentos, comissões e evoluções continuam
  -- apontando para a mesma pessoa.
  UPDATE aba_people.funcionarios
     SET ativo = FALSE, profile_id = NULL, atualizado_em = now()
   WHERE account_id = OLD.account_id AND profile_id = OLD.id;

  -- Profissional da conta antiga: mesma lógica. A agenda histórica
  -- daquele profissional pertence à conta, não ao login que saiu.
  UPDATE aba_scheduling.profissionais
     SET profile_id = NULL
   WHERE account_id = OLD.account_id AND profile_id = OLD.id;

  -- Notas escritas por ele naquela conta continuam lá, sem autor —
  -- mesma semântica do ON DELETE SET NULL já declarado na chave.
  UPDATE aba_people.pessoa_notas
     SET autor_id = NULL
   WHERE account_id = OLD.account_id AND autor_id = OLD.id;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION aba_people.desvincular_perfil_da_conta_antiga() IS
  'BEFORE UPDATE OF account_id em profiles: desfaz os vínculos da conta de origem antes de o perfil migrar. Necessário desde a migration 035 (chaves compostas por account_id) — sem isto, a verificação da chave recusa a migração com 23503 antes de o gatilho AFTER poder limpar.';

DROP TRIGGER IF EXISTS desvincular_perfil_da_conta_antiga ON public.profiles;
CREATE TRIGGER desvincular_perfil_da_conta_antiga
  BEFORE UPDATE OF account_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION aba_people.desvincular_perfil_da_conta_antiga();

-- ---------------------------------------------------------------------
-- Metade 2 — AFTER: cria o funcionário na conta nova. Perde o trecho de
-- desvinculação, que agora tem dono próprio acima. Uma responsabilidade
-- por função.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_people.nascer_funcionario_do_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_pessoa_id UUID;
BEGIN
  -- A saída da conta antiga é tratada por
  -- aba_people.desvincular_perfil_da_conta_antiga() (BEFORE), porque
  -- precisa acontecer antes da verificação da chave estrangeira.

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
$function$;
