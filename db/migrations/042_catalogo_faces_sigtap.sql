-- ============================================================
-- 042_catalogo_faces_sigtap.sql — Subetapa 03.6
--
-- Itens 3 e 22 do MVP odontológico.
--
-- CORREÇÃO DE FONTE, medida antes de escrever qualquer coisa
-- (CLAUDE.md §11): o Objetivo da 03.6 em docs/00_PLANO_E_CRITERIOS.md
-- cita `design/benchmark/fontes/procedimentos.txt` como fonte da
-- semente "com o código SIGTAP de cada um" — mas esse arquivo tem só
-- 82 nomes numerados, **nenhum código**. A fonte real, que o próprio
-- `RELATORIO.md` linha 22 nomeia ("`fontes/SIGTAP.xlsx` + acervo de
-- gestão pública de Max"), é `design/benchmark/fontes/SIGTAP.xlsx`:
-- 64 linhas com código SIGTAP, descrição, unidade de lançamento
-- (Local) e quantidade máxima — exatamente os 64 procedimentos que
-- `docs/02_MODELO_DE_DADOS.md` §11.2 e o achado 3 de
-- `RELATORIO.md` §5.2 descrevem (32 por dente / 6 por sextante / 2 por
-- arcada). Inventar código SIGTAP para os 82 nomes de `procedimentos.txt`
-- seria codificar de memória em cima de identificador de faturamento
-- real — o tipo de erro que este projeto trata como não-negociável.
-- A semente abaixo usa o arquivo com código de verdade; nenhuma linha
-- foi digitada à mão — gerada programaticamente do xlsx para não haver
-- erro de transcrição em código de faturamento.
--
-- Item 3 — `aceita_faces` (BOOLEAN) + `unidade_lancamento` (o "como" o
-- item é lançado): a coluna existe em toda linha de `servicos`, não só
-- nas semeadas — qualquer procedimento cadastrado à mão pode marcar as
-- duas. `aceita_faces = TRUE` só nos 3 procedimentos cuja própria
-- descrição do SIGTAP deixa inequívoco que o lançamento é por FACE do
-- dente (mesial/distal/oclusal/vestibular/lingual): as três
-- "restauração" (decíduo, permanente anterior, permanente posterior).
-- Os demais procedimentos "Dente" (obturação, exodontia, pulpotomia,
-- endodontia, prótese) tratam o DENTE INTEIRO — o SIGTAP não declara
-- metadado de face para eles, e marcar `TRUE` ali inventaria dado
-- clínico que a fonte não fornece. Decisão do CODE, reversível por
-- linha a qualquer momento (é só um booleano editável na tela).
--
-- Item 22 — `codigo_sigtap` + `quantidade_maxima` + a semente.
-- `quantidade_maxima` é dado real (32/6/2), mas a ENFORCEMENT contra um
-- orçamento ("recusar a 33ª restauração no mesmo dente") só existe
-- quando a entidade orçamento existir — `docs/02_MODELO_DE_DADOS.md`
-- §11.2 já declara isso explicitamente: "Subetapa dona: 03.6, com a
-- validação SURTINDO EFEITO NA 03.8". Esta migration guarda o dado e
-- valida a FORMA dele (positivo, unidade dentro do enum, `aceita_faces`
-- exige `unidade_lancamento`); a contagem por orçamento é da 03.8, que
-- ainda não tem tabela para contar.
--
-- Sem tabela nova — só colunas em `aba_catalog.servicos` (já existente,
-- migration 008) e uma função de semente idempotente.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

ALTER TABLE aba_catalog.servicos
  ADD COLUMN IF NOT EXISTS aceita_faces        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS unidade_lancamento  TEXT,
  ADD COLUMN IF NOT EXISTS quantidade_maxima   INTEGER,
  ADD COLUMN IF NOT EXISTS codigo_sigtap       TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'servicos_unidade_lancamento_check' AND conrelid = 'aba_catalog.servicos'::regclass
  ) THEN
    ALTER TABLE aba_catalog.servicos
      ADD CONSTRAINT servicos_unidade_lancamento_check
      CHECK (unidade_lancamento IS NULL OR unidade_lancamento IN ('dente', 'sextante', 'arcada', 'sessao', 'elemento'));
  END IF;

  -- Validação de banco, não rótulo (docs/02 §11.2): quantidade_maxima
  -- zero ou negativa não tem leitura clínica nenhuma.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'servicos_quantidade_maxima_check' AND conrelid = 'aba_catalog.servicos'::regclass
  ) THEN
    ALTER TABLE aba_catalog.servicos
      ADD CONSTRAINT servicos_quantidade_maxima_check
      CHECK (quantidade_maxima IS NULL OR quantidade_maxima > 0);
  END IF;

  -- "aceita_faces e unidade_lancamento são irmãs" (docs/02 §11.2) — um
  -- procedimento que aceita face precisa declarar como é lançado,
  -- senão o odontograma da 03.7 não sabe o que fazer com a marcação.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'servicos_aceita_faces_exige_unidade' AND conrelid = 'aba_catalog.servicos'::regclass
  ) THEN
    ALTER TABLE aba_catalog.servicos
      ADD CONSTRAINT servicos_aceita_faces_exige_unidade
      CHECK (NOT aceita_faces OR unidade_lancamento IS NOT NULL);
  END IF;
END $$;

-- Suporta o lookup idempotente da função de semente abaixo (existe
-- código SIGTAP X para esta conta?) e uma futura tela de busca por
-- código.
CREATE INDEX IF NOT EXISTS idx_servicos_codigo_sigtap
  ON aba_catalog.servicos(account_id, codigo_sigtap) WHERE codigo_sigtap IS NOT NULL;

-- ============================================================
-- Semente — OPCIONAL e IDEMPOTENTE (Qualidade da 03.6): ação
-- deliberada da conta (botão em Catálogo → Serviços), nunca automática
-- na criação da conta. Idempotente por `codigo_sigtap`: rodar duas
-- vezes, ou rodar numa conta que já tenha cadastrado manualmente um
-- código que colida, não duplica — pula e informa quantos já existiam.
--
-- Refaz a mesma checagem de autorização que a RLS de INSERT em
-- `servicos` já faz (`is_account_member('agent') AND
-- access.can('catalog','create')) — necessário porque SECURITY DEFINER
-- não é filtrado por RLS (mesmo raciocínio de `aba_health.pode_acessar`
-- e de FORCE ROW LEVEL SECURITY: a fronteira precisa ser reafirmada
-- dentro da função).
-- ============================================================
CREATE OR REPLACE FUNCTION aba_catalog.semear_procedimentos_sigtap()
RETURNS TABLE (inseridos INTEGER, ja_existentes INTEGER)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_account_id UUID;
  v_categoria_id UUID;
  v_inseridos INT := 0;
  v_ja_existentes INT := 0;
  r RECORD;
BEGIN
  SELECT account_id INTO v_account_id FROM public.profiles WHERE user_id = v_user_id;
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Sem conta associada ao usuário' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.is_account_member(v_account_id, 'agent') AND access.can('catalog', 'create')) THEN
    RAISE EXCEPTION 'Sem permissão para semear o catálogo' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_categoria_id
  FROM aba_catalog.categorias
  WHERE account_id = v_account_id AND nome = 'Procedimentos SIGTAP (Atenção Básica)';

  IF v_categoria_id IS NULL THEN
    INSERT INTO aba_catalog.categorias (account_id, nome, cor, posicao)
    VALUES (v_account_id, 'Procedimentos SIGTAP (Atenção Básica)', '#0ea5e9', 999)
    RETURNING id INTO v_categoria_id;
  END IF;

  -- Os 64 procedimentos de design/benchmark/fontes/SIGTAP.xlsx, gerados
  -- programaticamente do arquivo (nenhuma linha digitada à mão).
  FOR r IN
    SELECT * FROM (VALUES
      ('02.04.01.016-0', 'Radiografia oclusal', 'arcada', 2, false),
      ('03.07.04.001-1', 'Colocacao de placa de mordida', 'arcada', 2, false),
      ('03.07.04.012-7', 'Manutenção/conserto de aparelho ortodôntico/ortopédico', 'arcada', 2, false),
      ('04.04.02.044-5', 'Contenção de dentes por splintagem', 'arcada', 2, false),
      ('04.04.02.061-5', 'Redução de luxação têmporo-mandibular', 'arcada', 2, false),
      ('04.04.02.062-3', 'Retirada de material de síntese óssea / dentária', 'arcada', 2, false),
      ('04.14.01.036-1', 'Exerese de cisto odontogênico e não-odontogênico', 'arcada', 2, false),
      ('04.14.01.038-8', 'Tratamento cirúrgico de fístula intra / extraoral', 'arcada', 2, false),
      ('04.14.02.004-9', 'Correção de bridas musculares', 'arcada', 2, false),
      ('04.14.02.005-7', 'Correção de irregularidades de rebordo alveolar', 'arcada', 2, false),
      ('04.14.02.029-4', 'Remoção de torus e exostoses', 'arcada', 2, false),
      ('07.01.07.006-4', 'Mantenedor de espaço', 'arcada', 2, false),
      ('07.01.07.007-2', 'Placa oclusal', 'arcada', 2, false),
      ('07.01.07.008-0', 'Plano inclinado', 'arcada', 2, false),
      ('07.01.07.009-9', 'Protese parcial mandibular removivel', 'arcada', 2, false),
      ('07.01.07.010-2', 'Protese parcial maxilar removivel', 'arcada', 2, false),
      ('07.01.07.011-0', 'Protese temporaria', 'arcada', 2, false),
      ('07.01.07.012-9', 'Protese total mandibular', 'arcada', 2, false),
      ('07.01.07.013-7', 'Protese total maxilar', 'arcada', 2, false),
      ('01.01.02.005-8', 'Aplicação de cariostático (por dente)', 'dente', 32, false),
      ('01.01.02.006-6', 'Aplicação de selante (por dente)', 'dente', 32, false),
      ('01.01.02.009-0', 'Selamento provisório de cavidade dentária', 'dente', 32, false),
      ('02.04.01.018-7', 'Radiografia peri-apical interproximal (bite-wing)', 'dente', 32, false),
      ('03.07.01.001-5', 'Capeamento pulpar', 'dente', 32, false),
      ('03.07.01.002-3', 'Restauração de dente decíduo', 'dente', 32, true),
      ('03.07.01.003-1', 'Restauração de dente permanente anterior', 'dente', 32, true),
      ('03.07.01.004-0', 'Restauração de dente permanente posterior', 'dente', 32, true),
      ('03.07.02.001-0', 'Acesso a polpa dentaria e medicacao (por dente)', 'dente', 32, false),
      ('03.07.02.002-9', 'Curativo de demora c/ ou s/ preparo biomecanico', 'dente', 32, false),
      ('03.07.02.003-7', 'Obturação de dente decíduo', 'dente', 32, false),
      ('03.07.02.004-5', 'Obturação em dente permanente birradicular', 'dente', 32, false),
      ('03.07.02.005-3', 'Obturação em dente permanente com três ou mais raízes', 'dente', 32, false),
      ('03.07.02.006-1', 'Obturação em dente permanente unirradicular', 'dente', 32, false),
      ('03.07.02.007-0', 'Pulpotomia dentária', 'dente', 32, false),
      ('03.07.02.008-8', 'Retratamento endodôntico em dente permanente bi-radicular', 'dente', 32, false),
      ('03.07.02.009-6', 'Retratamento endodôntico em dente permanente com 3 ou mais raízes', 'dente', 32, false),
      ('03.07.02.010-0', 'Retratamento endodôntico em dente permanente uni-radicular', 'dente', 32, false),
      ('03.07.02.011-8', 'Selamento de perfuração radicular', 'dente', 32, false),
      ('03.07.04.007-0', 'Moldagem dento-gengival p/ construcao de protese dentaria', 'dente', 32, false),
      ('03.07.04.008-9', 'Reembasamento e conserto de protese dentaria', 'dente', 32, false),
      ('03.07.04.013-5', 'Cimentação de prótese dentária', 'dente', 32, false),
      ('03.07.04.014-3', 'Adaptação de prótese dentária', 'dente', 32, false),
      ('03.07.04.015-1', 'Ajuste oclusal', 'dente', 32, false),
      ('03.07.04.016-0', 'Instalação de prótese dentária', 'dente', 32, false),
      ('04.14.02.002-2', 'Apicectomia com ou sem obturação retrógrada', 'dente', 32, false),
      ('04.14.02.007-3', 'Curetagem periapical', 'dente', 32, false),
      ('04.14.02.012-0', 'Exodontia de dente decíduo', 'dente', 32, false),
      ('04.14.02.013-8', 'Exodontia de dente permanente', 'dente', 32, false),
      ('04.14.02.014-6', 'Exodontia múltipla com alveoloplastia por sextante', 'dente', 32, false),
      ('04.14.02.021-9', 'Odontosecção / radilectomia / tunelização', 'dente', 32, false),
      ('04.14.02.024-3', 'Reimplante e transplante dental (por elemento)', 'dente', 32, false),
      ('04.14.02.027-8', 'Remoção de dente retido (incluso / impactado)', 'dente', 32, false),
      ('04.14.02.036-7', 'Tratamento cirúrgico para tracionamento dental', 'dente', 32, false),
      ('04.14.02.038-3', 'Tratamento de alveolite', 'dente', 32, false),
      ('04.14.02.040-5', 'Ulotomia/ulectomia', 'dente', 32, false),
      ('07.01.07.005-6', 'Coroa provisoria', 'dente', 32, false),
      ('07.01.07.014-5', 'Proteses coronarias / intra-radiculares fixas / adesivas (por elemento)', 'dente', 32, false),
      ('03.07.03.001-6', 'Raspagem alisamento e polimento supragengivais (por sextante)', 'sextante', 6, false),
      ('03.07.03.002-4', 'Raspagem alisamento subgengivais (por sextante)', 'sextante', 6, false),
      ('03.07.03.005-9', 'Raspagem alisamento e polimento supragengivais (por sextante)', 'sextante', 6, false),
      ('04.14.02.003-0', 'Aprofundamento de vestíbulo oral (por sextante)', 'sextante', 6, false),
      ('04.14.02.015-4', 'Gengivectomia (por sextante)', 'sextante', 6, false),
      ('04.14.02.016-2', 'Gengivoplastia (por sextante)', 'sextante', 6, false),
      ('04.14.02.037-5', 'Tratamento cirúrgico periodontal (por sextante)', 'sextante', 6, false)
    ) AS t(codigo, nome, unidade, qtd_max, aceita_faces)
  LOOP
    IF EXISTS (
      SELECT 1 FROM aba_catalog.servicos
      WHERE account_id = v_account_id AND codigo_sigtap = r.codigo
    ) THEN
      v_ja_existentes := v_ja_existentes + 1;
      CONTINUE;
    END IF;

    INSERT INTO aba_catalog.servicos (
      account_id, categoria_id, nome, codigo_sigtap, unidade_lancamento,
      quantidade_maxima, aceita_faces, duracao_padrao_minutos, preco_base, requer_profissional
    ) VALUES (
      v_account_id, v_categoria_id, r.nome, r.codigo, r.unidade,
      r.qtd_max, r.aceita_faces, 30, 0, TRUE
    );
    v_inseridos := v_inseridos + 1;
  END LOOP;

  RETURN QUERY SELECT v_inseridos, v_ja_existentes;
END;
$$;

ALTER FUNCTION aba_catalog.semear_procedimentos_sigtap() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_catalog.semear_procedimentos_sigtap() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_catalog.semear_procedimentos_sigtap() FROM anon;
GRANT EXECUTE ON FUNCTION aba_catalog.semear_procedimentos_sigtap() TO authenticated, service_role;
