-- ============================================================
-- 029_corrigir_busca_conhecimento.sql — recuperação que recupera (02.11)
--
-- DEFEITO CORRIGIDO
--
-- `aba_ai.buscar_conhecimento_textual()` (migration 018) usa
-- `plainto_tsquery`, que liga TODOS os termos da pergunta com **AND**.
-- Combinado com a config `'simple'` — escolhida de propósito na 018 para
-- o produto não ficar preso a um idioma, e que por isso **não remove
-- palavra vazia** —, o efeito medido é este:
--
--   pergunta : "quanto custa a limpeza de pele"
--   tsquery  : 'quanto' & 'custa' & 'a' & 'limpeza' & 'de' & 'pele'
--   trecho   : "A limpeza de pele profunda custa 180 reais e dura 60 minutos."
--   casa?    : NÃO — porque o trecho não contém a palavra "quanto".
--
-- Ou seja: a pergunta que a base responde palavra por palavra não
-- recuperava nada, e o agente respondia "vou confirmar com a equipe".
-- Recuperação que só funciona quando o cliente escreve exatamente as
-- mesmas palavras do documento não é recuperação — e o defeito é
-- silencioso, porque devolver zero trecho é um resultado plausível.
--
-- CORREÇÃO
--
-- Os termos passam a ser ligados por **OR**, e a ordenação por
-- `ts_rank` faz o trabalho de decidir o que é mais relevante — que é o
-- comportamento esperado de recuperação por relevância. Quanto mais
-- termos da pergunta o trecho contiver, mais alto ele fica.
--
-- A conversão é feita sobre a saída de `plainto_tsquery`, nunca sobre o
-- texto cru: `plainto_tsquery` já normalizou e **já escapou** o que veio
-- do cliente, então trocar `&` por `|` no resultado não reabre a porta
-- de injeção de operador de busca que a 018 fechou de propósito. Montar
-- o tsquery concatenando texto do usuário faria exatamente isso.
--
-- PISO DE RELEVÂNCIA — com OR, um trecho pode casar por uma palavra
-- comum só ("a", "de"). O piso descarta esse ruído antes de ele virar
-- contexto do agente: `ts_rank` de um único termo comum fica na casa de
-- 0,03, e uma coincidência real de conteúdo fica acima disso. O valor é
-- deliberadamente baixo — cortar demais devolveria ao problema que esta
-- migration corrige.
--
-- Tudo o mais é preservado: `SECURITY INVOKER` (hardening da 01.5 contra
-- o achado GHSA-fg5p-2qc3-jmxr do Maximus — a RLS filtra o chamador, e
-- um `p_account_id` alheio devolve vazio), `search_path` vazio, mesma
-- assinatura.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

CREATE OR REPLACE FUNCTION aba_ai.buscar_conhecimento_textual(
  p_account_id UUID,
  p_consulta   TEXT,
  p_limite     INTEGER
) RETURNS TABLE (id UUID, conteudo TEXT, relevancia REAL)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH consulta AS (
    SELECT NULLIF(
      replace(plainto_tsquery('simple', p_consulta)::TEXT, '&', '|'),
      ''
    )::tsquery AS q
  )
  SELECT c.id,
         c.conteudo,
         ts_rank(c.busca_texto, consulta.q) AS relevancia
  FROM aba_ai.ia_trechos_conhecimento c, consulta
  WHERE consulta.q IS NOT NULL
    AND c.account_id = p_account_id
    AND c.busca_texto @@ consulta.q
    AND ts_rank(c.busca_texto, consulta.q) > 0.04
  ORDER BY relevancia DESC
  LIMIT GREATEST(p_limite, 0);
$$;

REVOKE ALL ON FUNCTION aba_ai.buscar_conhecimento_textual(UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_ai.buscar_conhecimento_textual(UUID, TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION aba_ai.buscar_conhecimento_textual(UUID, TEXT, INTEGER) TO authenticated, service_role;
