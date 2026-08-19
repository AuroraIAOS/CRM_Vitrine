-- ============================================================
-- 034_anamnese_completa_obrigatoria.sql — anamnese não grava pela metade
-- (Subetapa 02.12b)
--
-- O DEFEITO, MEDIDO EM TELA
--
-- `AnamneseTab` só recusava a gravação quando NENHUMA pergunta havia sido
-- respondida (`if (preenchidas === 0)`). Com uma resposta de cinco, ela
-- gravava. Max encontrou em uso real uma anamnese registrada com
-- **"3 resposta(s)"** de 5.
--
-- POR QUE ISSO É PIOR QUE UM CAMPO VAZIO
--
-- A linha gravada tem data, autor e aparência de registro completo. Quem
-- a ler depois — outro profissional, semanas adiante — não tem como
-- distinguir "o paciente não tem alergia" de "a pergunta sobre alergia
-- nunca foi feita". As duas situações produzem exatamente o mesmo vazio no
-- prontuário, e só uma delas é segura para decidir um procedimento.
-- Ausência registrada é informação; ausência não registrada é lacuna
-- disfarçada de informação.
--
-- POR QUE ISSO NÃO PODE FICAR SÓ NA TELA
--
-- A tela foi corrigida junto com esta migration (botão desabilitado e
-- recusa nomeando as perguntas que faltam), mas validação de formulário é
-- conveniência, não garantia: qualquer `insert` direto pela API do
-- PostgREST passaria por cima dela. `aba_health` tem regime próprio e
-- declarado sem exceção (`CLAUDE.md` §5), e o padrão do projeto para
-- invariante clínica é o banco — foi assim com `log_acesso` obrigatório
-- (a política autoriza, mas não registra) e com o CHECK que trava
-- `pode_ler_prontuario` na migration 028.
--
-- POR QUE TRIGGER E NÃO CHECK
--
-- A regra precisa comparar a resposta com as perguntas do formulário, que
-- moram em OUTRA tabela (`formularios_anamnese.perguntas`). CHECK não
-- enxerga outra tabela. E há uma segunda razão, deliberada: um CHECK seria
-- validado contra as linhas já existentes, e existe pelo menos uma
-- anamnese incompleta gravada antes desta correção. Apagá-la não é decisão
-- de migration — é registro clínico, ainda que de teste. O trigger vale
-- **do INSERT em diante** e deixa o passado intacto e visível.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

CREATE OR REPLACE FUNCTION aba_health.exigir_anamnese_completa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_perguntas JSONB;
  v_faltando  TEXT[];
BEGIN
  SELECT f.perguntas INTO v_perguntas
  FROM aba_health.formularios_anamnese f
  WHERE f.id = NEW.formulario_id;

  IF v_perguntas IS NULL THEN
    RAISE EXCEPTION 'Formulário de anamnese % não encontrado.', NEW.formulario_id
      USING ERRCODE = '23503';
  END IF;

  -- Uma pergunta está respondida quando a chave dela existe em `respostas`
  -- e o valor não é nulo nem só espaço. "nada consta" conta como resposta —
  -- é uma afirmação clínica; string vazia não é.
  SELECT array_agg(COALESCE(p->>'rotulo', p->>'chave') ORDER BY ord)
    INTO v_faltando
  FROM jsonb_array_elements(v_perguntas) WITH ORDINALITY AS t(p, ord)
  WHERE COALESCE(btrim(NEW.respostas->>(p->>'chave')), '') = '';

  IF v_faltando IS NOT NULL AND array_length(v_faltando, 1) > 0 THEN
    RAISE EXCEPTION
      'Anamnese incompleta: % pergunta(s) sem resposta (%). Registre "nada consta" quando não houver o que relatar — prontuário não aceita campo em branco.',
      array_length(v_faltando, 1),
      array_to_string(v_faltando, ', ')
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION aba_health.exigir_anamnese_completa() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.exigir_anamnese_completa() FROM anon;
REVOKE ALL ON FUNCTION aba_health.exigir_anamnese_completa() FROM authenticated;

DROP TRIGGER IF EXISTS exigir_anamnese_completa ON aba_health.respostas_anamnese;
CREATE TRIGGER exigir_anamnese_completa
  BEFORE INSERT OR UPDATE ON aba_health.respostas_anamnese
  FOR EACH ROW EXECUTE FUNCTION aba_health.exigir_anamnese_completa();

COMMENT ON FUNCTION aba_health.exigir_anamnese_completa() IS
  'Recusa resposta de anamnese com pergunta em branco (23514). Trigger, nao CHECK: a regra compara com formularios_anamnese.perguntas, que e outra tabela, e nao deve invalidar as linhas gravadas antes da correcao. Subetapa 02.12b.';
