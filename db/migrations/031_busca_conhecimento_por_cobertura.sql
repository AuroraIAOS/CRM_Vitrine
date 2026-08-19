-- ============================================================
-- 031_busca_conhecimento_por_cobertura.sql — corrige o filtro de ruído
-- da busca de conhecimento (complemento da Subetapa 02.11)
--
-- O QUE ESTAVA ERRADO NA MIGRATION 029
--
-- A 029 corrigiu o problema certo (o AND de `plainto_tsquery` impedia
-- que uma pergunta em linguagem natural recuperasse o trecho que a
-- responde) mas escolheu o filtro errado para o ruído que o OR
-- introduz: um piso absoluto de `ts_rank > 0.04`.
--
-- **Medido no banco, com dados reais desta subetapa:**
--
--   caso                                        ts_rank     lexemas casados
--   ruído (casou só pela palavra vazia "sem")    0.0608      1 de 8
--   casamento legítimo de 2 lexemas              0.0243      2 de 8
--   pergunta natural sobre preço                 0.0507      5 de 6
--   palavra-chave isolada ("cancelamentos")      0.0608      1 de 1
--
-- Duas conclusões, ambas contra o desenho da 029:
--   · `ts_rank` **não ordena ruído abaixo de sinal**. Ele normaliza por
--     densidade, então uma palavra vazia num trecho curto pontua MAIS
--     (0.0608) que dois lexemas legítimos num trecho longo (0.0243). O
--     piso de 0.04 descartava sinal e deixava passar ruído — fazia o
--     oposto do que prometia.
--   · **contar lexemas em comum também não resolve**: o ruído casa 1
--     lexema e a busca legítima por palavra-chave isolada também casa 1.
--     Exigir "pelo menos 2" quebraria a busca por termo único, que é o
--     jeito mais natural de consultar uma base pequena.
--
-- O QUE SEPARA DE VERDADE: A COBERTURA DA PERGUNTA
--
-- A fração dos lexemas da pergunta que aparece no trecho:
--   ruído          1/8 = 0.13
--   2 lexemas      2/8 = 0.25
--   preço          5/6 = 0.83
--   palavra-chave  1/1 = 1.00
--
-- Um piso de 0.3 separa os quatro casos corretamente, e a medida
-- independe do tamanho do trecho — que é justamente o que envenenava o
-- `ts_rank`. `ts_rank` continua no `ORDER BY`, onde é bom: decidir qual
-- dos trechos aprovados vem primeiro.
--
-- LIMITAÇÃO CONHECIDA, MEDIDA E NÃO RESOLVIDA AQUI: a config `'simple'`
-- (escolhida na Subetapa 01.5 para o produto não ficar preso a um
-- idioma) **não faz stemming**. Medido: "cancelar" não casa com
-- "Cancelamentos", e "hora" não casa nem com "horas". Com a config
-- `'portuguese'` os dois casariam (ambos reduzem ao lexema `cancel`),
-- mas isso prenderia a busca ao português. Registrado como pendência
-- vigiada em `docs/00_PLANO_E_CRITERIOS.md` — é decisão de produto, não
-- de implementação.
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
    SELECT
      NULLIF(replace(plainto_tsquery('simple', p_consulta)::TEXT, '&', '|'), '')::tsquery AS q,
      tsvector_to_array(to_tsvector('simple', p_consulta)) AS lexemas
  )
  SELECT c.id,
         c.conteudo,
         ts_rank(c.busca_texto, consulta.q) AS relevancia
  FROM aba_ai.ia_trechos_conhecimento c, consulta
  WHERE consulta.q IS NOT NULL
    AND c.account_id = p_account_id
    AND c.busca_texto @@ consulta.q
    -- Cobertura: que fração dos lexemas da pergunta aparece no trecho.
    -- Ver o cabeçalho para os números que justificam o piso.
    AND cardinality(ARRAY(
          SELECT unnest(tsvector_to_array(c.busca_texto))
          INTERSECT
          SELECT unnest(consulta.lexemas)
        ))::REAL / GREATEST(cardinality(consulta.lexemas), 1) >= 0.3
  ORDER BY relevancia DESC
  LIMIT GREATEST(p_limite, 0);
$$;

REVOKE ALL ON FUNCTION aba_ai.buscar_conhecimento_textual(UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_ai.buscar_conhecimento_textual(UUID, TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION aba_ai.buscar_conhecimento_textual(UUID, TEXT, INTEGER) TO authenticated, service_role;
