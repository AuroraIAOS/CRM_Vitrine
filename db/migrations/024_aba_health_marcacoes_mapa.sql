-- ============================================================
-- 024_aba_health_marcacoes_mapa.sql — marcação de mapa clínico
--
-- Subetapa 02.9 (Prontuário). O wireframe `1h`/`1p` (design/README.md)
-- exige que a sessão registre MARCAÇÕES sobre um dos quatro mapas
-- clínicos (facial, corporal, odontograma, acupuntura). Nada em
-- `aba_health` guardava isso — nem no CRM Maximus, que não tem mapa
-- clínico nenhum (`src/modules/health/` não possui equivalente). É
-- estrutura nova deste produto, não porte.
--
-- POR QUE COLUNA EM `evolucoes` E NÃO TABELA NOVA
--
-- A marcação é dado clínico do MESMO regime das outras quatro tabelas:
-- se virasse tabela própria precisaria de política de RLS própria, de
-- função `ler_*()` própria com log, de trigger de escrita própria e de
-- entrada própria na revogação por coluna — quatro superfícies novas no
-- schema de maior risco jurídico do produto, para guardar um atributo
-- que só existe dentro de uma sessão. Como coluna de `aba_health.
-- evolucoes`, a marcação herda tudo que já está provado:
--   · RLS por `aba_health.pode_acessar(cliente_id, ação)`;
--   · log de escrita automático (trigger `registrar_escrita_clinica`);
--   · leitura só por `aba_health.ler_evolucoes()`, que loga na mesma
--     transação;
--   · trava de evolução assinada (`travada = true` recusa UPDATE) —
--     marcação de sessão encerrada também não se reescreve, só ganha
--     adendo em nova linha.
-- Zero política nova, zero função nova, zero caminho de leitura novo.
--
-- PRIVILÉGIO DE COLUNA — as duas colunas NÃO recebem `GRANT SELECT`.
-- A 013 revogou `SELECT` da tabela e reconcedeu apenas as colunas de
-- identificação/roteamento; coluna acrescentada depois nasce fora
-- desse GRANT e portanto invisível ao `authenticated`, que é
-- exatamente o desejado: `marcacoes` é achado clínico e `mapa_tipo`
-- revela a natureza do atendimento. As duas só saem por
-- `ler_evolucoes()`. Isto é medido logo após a aplicação
-- (`has_column_privilege`), não presumido.
--
-- VOCABULÁRIO DE REGIÃO/ESTADO fica no catálogo do front
-- (`crm/src/features/health/mapas.ts`), fechado, nunca digitado livre
-- — a arte definitiva dos mapas ainda não existe (`docs/04` §5.5) e é
-- ela que fixa a nomenclatura final. Quando o asset entrar, o catálogo
-- é candidato a virar tabela de módulo. Registrado como pendência
-- vigiada em `docs/00_PLANO_E_CRITERIOS.md`.
--
-- O CHECK aqui garante só o que o banco pode garantir sem congelar
-- vocabulário: `marcacoes` é um ARRAY JSON. Estrutura de item mal
-- formada é problema de aplicação; array vs objeto vs escalar é
-- problema de integridade.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

ALTER TABLE aba_health.evolucoes
  ADD COLUMN IF NOT EXISTS mapa_tipo TEXT,
  ADD COLUMN IF NOT EXISTS marcacoes JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'aba_health.evolucoes'::regclass
      AND conname = 'evolucoes_mapa_tipo_valido'
  ) THEN
    ALTER TABLE aba_health.evolucoes
      ADD CONSTRAINT evolucoes_mapa_tipo_valido
      CHECK (mapa_tipo IS NULL OR mapa_tipo IN ('facial', 'corporal', 'odontograma', 'acupuntura'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'aba_health.evolucoes'::regclass
      AND conname = 'evolucoes_marcacoes_array'
  ) THEN
    ALTER TABLE aba_health.evolucoes
      ADD CONSTRAINT evolucoes_marcacoes_array
      CHECK (jsonb_typeof(marcacoes) = 'array');
  END IF;
END $$;

-- Reafirma a fronteira da 013 de forma explícita, em vez de depender do
-- efeito colateral de "coluna nova não herda GRANT por coluna": revoga
-- nominalmente as duas colunas de `authenticated`. Custa nada e
-- documenta a intenção para quem ler o catálogo de privilégios depois.
REVOKE SELECT (mapa_tipo, marcacoes) ON aba_health.evolucoes FROM authenticated;

COMMENT ON COLUMN aba_health.evolucoes.mapa_tipo IS
  'Mapa clínico usado na sessão (facial/corporal/odontograma/acupuntura). Dado clínico — sem SELECT direto, só por aba_health.ler_evolucoes().';
COMMENT ON COLUMN aba_health.evolucoes.marcacoes IS
  'Array JSON de marcações da sessão sobre o mapa: [{id, regiao, rotulo, estado, nota}]. Dado clínico — sem SELECT direto, só por aba_health.ler_evolucoes().';
