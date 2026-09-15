---
name: hash-normalizado
description: Compara o corpo de funções, políticas e buckets entre o banco de TESTES e o de PRODUÇÃO, normalizando comentário e CRLF, para provar que a aplicação por MCP não mudou comportamento. Use ao fechar toda subetapa que aplica migration em produção.
disable-model-invocation: false
---

# Hash normalizado: o banco de teste e o de produção dizem a mesma coisa?

Aplicar migration por MCP é transcrever. A prova de que a transcrição não mudou nada é comparar o que os dois bancos **guardaram**, não o que o arquivo diz.

Duas normalizações, e as duas têm motivo medido (`handoffs/instrucoes.md` §5):

- **CRLF** — o checkout Windows (`core.autocrlf=true`) grava o corpo com `\r\n` no banco de TESTES, via `provisionar_banco.mjs`; o MCP aplica em produção com `\n`. Sem normalizar, tudo parece diferente.
- **Comentário** — separa "lógica diferente", que é grave, de "texto diferente", que quase nunca é. Compare os dois hashes: se o bruto difere e o normalizado bate, a diferença é só de comentário.

## Procedimento

1. Monte a lista de objetos que a subetapa criou ou alterou: funções (por nome), políticas (por nome) e bucket (por id).
2. Rode a mesma consulta nos dois bancos — no de testes pela conexão direta (`SUPABASE_TEST_DB_URL`), no de produção pelo MCP (`execute_sql`).
3. Compare linha a linha. Objeto que falta de um lado é achado, não detalhe.

```sql
SELECT p.proname,
       md5(replace(pg_get_functiondef(p.oid), chr(13), '')) AS bruto,
       md5(regexp_replace(replace(pg_get_functiondef(p.oid), chr(13), ''), '--[^\n]*', '', 'g')) AS normalizado
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = '<schema>'
  AND p.proname IN ('<funcao_1>', '<funcao_2>')
UNION ALL
SELECT '<politica>', md5(qual), md5(qual) FROM pg_policies
 WHERE schemaname = '<schema>' AND policyname = '<politica>'
UNION ALL
SELECT 'bucket', md5(concat_ws('|', public, file_size_limit, allowed_mime_types::text)), ''
  FROM storage.buckets WHERE id = '<bucket>'
ORDER BY 1;
```

## Como ler o resultado

| Situação | Leitura |
|---|---|
| Bruto igual nos dois | Idênticos, comentários inclusive. Nada a fazer. |
| Bruto difere, normalizado igual | Só comentário. Registre a diferença e siga — ou reemita o corpo, se o comentário for a documentação que o projeto exige. |
| Normalizado difere | **A lógica não é a mesma.** Pare e ache a divergência antes de declarar a subetapa concluída — foi assim que a 03.8.a achou `validar_procedimento_plano` diferente de verdade, com oito irmãs idênticas. |
| Objeto só de um lado | Uma das aplicações não pegou. Reaplique. |

## Não esqueça

- Edge Function não entra aqui: a prova dela é o `ezbr_sha256` devolvido pelo deploy ser o mesmo nos dois projetos.
- O hash prova que os bancos concordam; ele **não** prova que o comportamento está certo. A evidência com papel real continua sendo obrigatória.
