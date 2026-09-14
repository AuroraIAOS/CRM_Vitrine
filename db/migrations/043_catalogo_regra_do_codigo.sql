-- ============================================================
-- 043_catalogo_regra_do_codigo.sql — Subetapa 03.6.a
--
-- Item 35 do MVP (entrou por D-I5, 2026-09-04) e a metade que faltou do
-- item 3. Acrescenta a `aba_catalog.servicos` a REGRA DE FORMA do código
-- (quantas faces aceita e em que região dentária vale) e os TRÊS
-- REQUISITOS por código (termo de consentimento, consentimento
-- informado, achado diagnóstico vinculado).
--
-- Colunas ADITIVAS. Nenhuma linha da semente SIGTAP é reescrita em
-- `codigo_sigtap`, `nome`, `unidade_lancamento` ou `quantidade_maxima`
-- — o que a Subetapa 03.6 entregou continua exatamente como estava.
--
-- Idempotente — seguro rodar mais de uma vez.
--
-- ------------------------------------------------------------
-- MEDIÇÃO 1 — "a área aplicável" do Objetivo JÁ EXISTE, e é
-- `unidade_lancamento`. Não se cria coluna nova para ela.
-- ------------------------------------------------------------
-- O Objetivo da 03.6.a pede três coisas na regra de forma: "quantas
-- faces aceita (mínimo e máximo), se vale em dente anterior, posterior
-- ou ambos, e A ÁREA APLICÁVEL". A terceira foi conferida contra a
-- fonte antes de virar coluna (CLAUDE.md §11, e a família de achados
-- 03.5/03.6/03.8: a descrição da subetapa é a última cópia, não a
-- fonte).
--
-- A fonte é `design/benchmark/fontes/ice.md` §3.3, citando o
-- fornecedor: *"Your first choice narrows the available codes or AREAS
-- based on code rules"*. E a evidência `capturas/ice/site_18` mostra o
-- campo de verdade: ele se chama **`Tooth/Area`**, e é a seleção do
-- SÍTIO do procedimento — os 32 dentes mais um filtro "Filter search by
-- a Tooth or Area…" para os sítios que não são dente (quadrante,
-- arcada, boca).
--
-- Isso é exatamente `unidade_lancamento`, que a 03.6 já entregou:
-- `dente` / `sextante` / `arcada` / `sessao` / `elemento`. Criar uma
-- `area_aplicavel` ao lado seria a mesma informação com dois nomes, e
-- os dois divergiriam na primeira tela que escrevesse só num deles.
--
-- O que esta migration faz com a "área", em vez de duplicá-la, é
-- AMARRÁ-LA à regra de forma: face é superfície de DENTE, então código
-- que declara faces tem de ser lançado por dente
-- (`servicos_faces_exigem_dente`, abaixo). A coluna da 03.6 passa a
-- fazer parte da validação em vez de ficar ao lado dela.
--
-- ------------------------------------------------------------
-- MEDIÇÃO 2 — o intervalo de faces é 1 a 5, e o número vem do
-- repositório, não da memória.
-- ------------------------------------------------------------
-- `design/benchmark/gerar_dentes_svg.mjs` (a fundação do odontograma
-- autoral da 03.7.a) declara as faces de cada dente:
-- `["mesial", "distal", "vestibular", "lingual", "incisal"]` no
-- anterior e `[..., "oclusal"]` no posterior — cinco em ambos, com o
-- centro trocando de nome. Daí `BETWEEN 1 AND 5`.
--
-- ------------------------------------------------------------
-- MEDIÇÃO 3 — por que `regiao_dentaria` e não `arco`.
-- ------------------------------------------------------------
-- A Evidência da subetapa em `docs/00a` escreve "CHECKs recusando faces
-- fora do intervalo e ARCO inválido". Em odontologia "arco"/"arcada" é
-- a arcada superior ou inferior — conceito anatômico DIFERENTE de
-- anterior × posterior, que é a posição do dente dentro da arcada. E
-- `arcada` já é um valor de `unidade_lancamento` neste mesmo esquema.
-- Usar a palavra do documento derivado criaria a colisão exata que este
-- projeto já pagou uma vez ("convênio" virou "plano",
-- `handoffs/instrucoes.md` §5). A coluna se chama `regiao_dentaria`, com
-- os três valores que o Objetivo nomeia: anterior / posterior / ambas.
--
-- ------------------------------------------------------------
-- MEDIÇÃO 4 — `aceita_faces` NÃO SE APAGA: vira DERIVADA.
-- ------------------------------------------------------------
-- Qualidade da subetapa: "ou vira derivada da regra nova, ou fica
-- marcada [OBSOLETA]". Aqui ela vira derivada — `aceita_faces` passa a
-- ser exatamente `faces_maximo IS NOT NULL`, mantido por gatilho
-- `BEFORE INSERT OR UPDATE`. A coluna continua existindo, continua
-- legível, e todo leitor de hoje continua funcionando sem alteração.
--
-- Quem escrevia nela foi revisado UM A UM (armadilha da 02.15 — estado
-- novo exige revisar quem filtrava pelo estado antigo):
--
--   1. `042` — CHECK `servicos_aceita_faces_exige_unidade`. Continua
--      valendo. Logicamente ele é subsumido pelo CHECK novo (que é mais
--      estrito: exige `= 'dente'`, não só "não nulo"), mas na prática
--      continua sendo ELE que dispara em parte dos casos — medido: um
--      INSERT com faces e `unidade_lancamento` nula é recusado por
--      `servicos_aceita_faces_exige_unidade`, não pelo novo. NÃO se
--      apaga (CLAUDE.md §10).
--   2. `042` — `semear_procedimentos_sigtap()` insere `aceita_faces`
--      literal. Com o gatilho, esse valor seria SOBRESCRITO e as três
--      "restauração" nasceriam sem faces numa conta nova. A função é
--      substituída abaixo, passando a declarar a regra de forma; é a
--      correção mais importante desta migration, e a única que geraria
--      regressão silenciosa se ficasse de fora.
--   3. `crm/src/features/catalog/api.ts` — envia `aceita_faces` no
--      INSERT e o lê no SELECT. O envio sai (o banco deriva), a leitura
--      fica.
--   4. `crm/src/features/catalog/ServicosTab.tsx` — a caixa de seleção
--      "Aceita marcação por face" vira os campos da regra de forma; os
--      dois selos que LEEM `aceitaFaces` continuam intactos.
--
-- Nenhum outro consumidor: varredura por `aceita_faces|aceitaFaces` em
-- `*.ts`, `*.tsx`, `*.sql` e `*.mjs` devolve só esses quatro.
--
-- ------------------------------------------------------------
-- O QUE ESTA MIGRATION NÃO FAZ, DE PROPÓSITO
-- ------------------------------------------------------------
-- Não valida a regra de forma CONTRA UMA LINHA DE PLANO — não existe
-- plano ainda. O CHECK nasce aqui (a regra é dado validado do banco,
-- não rótulo de tela); o efeito contra o plano é da Subetapa 03.8, como
-- `docs/02_MODELO_DE_DADOS.md` §12.3 já declara ("Subetapas donas:
-- 03.6.a (as colunas) e 03.8 (a trava)"). Mesmo arranjo que a 03.6 usou
-- para `quantidade_maxima`.
--
-- Não infere requisito de consentimento para nenhum código SIGTAP. A
-- tabela nacional não declara nada sobre consentimento; marcar de
-- memória quais procedimentos são "de risco significativo" seria
-- inventar dado clínico-jurídico. Os 64 nascem com os três requisitos
-- em FALSE e a clínica configura — que é como a fonte também faz
-- (`ice.md` §4.2: configuração por conjunto de códigos).
--
-- Não cria dependência entre os requisitos. Na fonte, consentimento de
-- tratamento e consentimento informado são dois termos independentes
-- (`ice.md` §4.4); supor que um implica o outro seria acrescentar regra
-- que ninguém mediu.
-- ============================================================

-- ============================================================
-- 1. Colunas novas
-- ============================================================
ALTER TABLE aba_catalog.servicos
  -- Regra de forma: quantas faces o código aceita. Ambas nulas = o
  -- código não é lançado por face.
  ADD COLUMN IF NOT EXISTS faces_minimo    SMALLINT,
  ADD COLUMN IF NOT EXISTS faces_maximo    SMALLINT,
  -- Em que região da arcada o código vale. NULL = não declarado (não é
  -- o mesmo que "vale em ambas": um é ausência de regra, o outro é
  -- regra afirmando que não há restrição).
  ADD COLUMN IF NOT EXISTS regiao_dentaria TEXT,
  -- Os três requisitos por código (item 35). Ver `ice.md` §4.2 e
  -- `docs/02_MODELO_DE_DADOS.md` §12.3. Pré-determinação de convênio e
  -- validação por supervisor, que a fonte também tem, ficam FORA: a
  -- primeira é o item 33 (convênio, futuro +1.0, CLAUDE.md §15) e a
  -- segunda não foi pedida por nenhum item do MVP.
  ADD COLUMN IF NOT EXISTS exige_consentimento_tratamento BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS exige_consentimento_informado  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS exige_achado_diagnostico       BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN aba_catalog.servicos.aceita_faces IS
  'DERIVADA (Subetapa 03.6.a) — mantida por aba_catalog.derivar_aceita_faces() como (faces_maximo IS NOT NULL). Não escrever: qualquer valor enviado no INSERT/UPDATE é sobrescrito. Para ligar, declare faces_minimo/faces_maximo.';
COMMENT ON COLUMN aba_catalog.servicos.faces_minimo IS
  'Regra de forma (03.6.a): mínimo de faces que o código aceita, 1 a 5. NULL junto com faces_maximo = código não lançado por face.';
COMMENT ON COLUMN aba_catalog.servicos.faces_maximo IS
  'Regra de forma (03.6.a): máximo de faces que o código aceita, 1 a 5 (mesial, distal, vestibular, lingual, oclusal/incisal).';
COMMENT ON COLUMN aba_catalog.servicos.regiao_dentaria IS
  'Regra de forma (03.6.a): anterior | posterior | ambas. NULL = não declarado. "Região" e não "arco": arcada superior/inferior é outro conceito, e já é valor de unidade_lancamento.';

-- ============================================================
-- 2. A regra de forma é validação de banco, não rótulo
-- ============================================================
-- Antes de estreitar qualquer regra sobre dado existente, medir o
-- passivo — e PARAR se houver, em vez de flexionar a linha em silêncio.
-- Medido em 2026-09-04: zero linhas nos dois projetos (produção e
-- testes). Um CRM-filho poderia ter; se tiver, esta migration para e
-- pede decisão, que é o comportamento certo.
DO $$
DECLARE
  v_passivo INT;
BEGIN
  SELECT count(*) INTO v_passivo
  FROM aba_catalog.servicos
  WHERE aceita_faces AND unidade_lancamento IS DISTINCT FROM 'dente';

  IF v_passivo > 0 THEN
    RAISE EXCEPTION
      'Migration 043 interrompida: % serviço(s) com aceita_faces = TRUE e unidade_lancamento <> ''dente''. Face é superfície de dente; estas linhas precisam de decisão humana antes da conversão (nunca de conversão silenciosa).', v_passivo;
  END IF;
END $$;

DO $$
BEGIN
  -- Intervalo de faces: os dois extremos juntos ou nenhum, cada um
  -- entre 1 e 5, e o mínimo nunca maior que o máximo.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'servicos_faces_intervalo' AND conrelid = 'aba_catalog.servicos'::regclass
  ) THEN
    ALTER TABLE aba_catalog.servicos
      ADD CONSTRAINT servicos_faces_intervalo
      CHECK (
        (faces_minimo IS NULL AND faces_maximo IS NULL)
        OR (
          faces_minimo IS NOT NULL AND faces_maximo IS NOT NULL
          AND faces_minimo BETWEEN 1 AND 5
          AND faces_maximo BETWEEN 1 AND 5
          AND faces_minimo <= faces_maximo
        )
      );
  END IF;

  -- A "área aplicável" amarrada à regra de forma: face é superfície de
  -- dente. Um código lançado por sextante, arcada ou sessão não tem
  -- face para contar. Mais estrito que o CHECK de 042, que só exigia
  -- unidade não nula — e é por isso que aquele não precisa sair.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'servicos_faces_exigem_dente' AND conrelid = 'aba_catalog.servicos'::regclass
  ) THEN
    ALTER TABLE aba_catalog.servicos
      ADD CONSTRAINT servicos_faces_exigem_dente
      CHECK (faces_maximo IS NULL OR unidade_lancamento = 'dente');
  END IF;

  -- Região dentária dentro do vocabulário. Deliberadamente NÃO se exige
  -- `unidade_lancamento = 'dente'` aqui: sextante também é anterior ou
  -- posterior (os sextantes 2 e 5 são anteriores), e amarrar isso seria
  -- inventar restrição que ninguém mediu.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'servicos_regiao_dentaria_check' AND conrelid = 'aba_catalog.servicos'::regclass
  ) THEN
    ALTER TABLE aba_catalog.servicos
      ADD CONSTRAINT servicos_regiao_dentaria_check
      CHECK (regiao_dentaria IS NULL OR regiao_dentaria IN ('anterior', 'posterior', 'ambas'));
  END IF;
END $$;

-- ============================================================
-- 3. `aceita_faces` vira derivada — a coluna fica, o valor passa a ser
--    calculado
-- ============================================================
CREATE OR REPLACE FUNCTION aba_catalog.derivar_aceita_faces()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Subetapa 03.6.a. A pergunta "aceita face?" deixou de ser um
  -- booleano digitado e passou a ser consequência da regra de forma:
  -- se o código declara um teto de faces, ele aceita face; se não
  -- declara, não aceita. Derivar no banco (e não na tela) garante que
  -- os dois nunca divirjam, inclusive por INSERT direto, por semente e
  -- por service_role — onde a RLS não protege nada
  -- (handoffs/instrucoes.md §6).
  NEW.aceita_faces := (NEW.faces_maximo IS NOT NULL);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION aba_catalog.derivar_aceita_faces() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_catalog.derivar_aceita_faces() FROM anon;
GRANT EXECUTE ON FUNCTION aba_catalog.derivar_aceita_faces() TO authenticated, service_role;

-- Backfill ANTES de ligar o gatilho: toda linha que hoje diz
-- `aceita_faces = TRUE` sem regra de forma recebe o intervalo completo
-- (1 a 5) e nenhuma restrição de região. Isso preserva exatamente a
-- informação que existia — "aceita face, sem estreitamento declarado" —
-- em vez de perdê-la na derivação. O passivo incompatível já foi
-- barrado no passo 2.
UPDATE aba_catalog.servicos
   SET faces_minimo = 1, faces_maximo = 5
 WHERE aceita_faces AND faces_maximo IS NULL;

DROP TRIGGER IF EXISTS derivar_aceita_faces ON aba_catalog.servicos;
CREATE TRIGGER derivar_aceita_faces
  BEFORE INSERT OR UPDATE ON aba_catalog.servicos
  FOR EACH ROW EXECUTE FUNCTION aba_catalog.derivar_aceita_faces();

-- ============================================================
-- 4. Backfill da semente SIGTAP já aplicada
-- ============================================================
-- Só as três "restauração", que são as três linhas que a 03.6 marcou
-- como `aceita_faces = TRUE` (decisão documentada no cabeçalho de 042:
-- são os únicos códigos cuja descrição do SIGTAP é inequivocamente por
-- face).
--
-- De onde vem cada valor, e o que NÃO vem de lugar nenhum:
--   · `regiao_dentaria` vem da PRÓPRIA DESCRIÇÃO do código — "dente
--     permanente anterior" e "dente permanente posterior" estão
--     escritos no nome oficial. Não é inferência.
--   · `faces_minimo`/`faces_maximo` = 1 a 5, que é o intervalo
--     anatômico inteiro. O SIGTAP NÃO declara contagem de face para
--     nenhum código; 1 a 5 significa "aceita face, e a fonte não
--     estreita" — não é uma afirmação clínica nossa. A clínica
--     estreita por código na tela quando quiser ("resina de 2 faces em
--     posterior"), e é esse estreitamento que a 03.8 vai cobrar.
--
-- `WHERE faces_maximo IS NULL` faz o backfill idempotente E não
-- destrutivo: rodar de novo não desfaz o estreitamento que a clínica
-- tenha configurado.
UPDATE aba_catalog.servicos SET faces_minimo = 1, faces_maximo = 5, regiao_dentaria = 'ambas'
 WHERE codigo_sigtap = '03.07.01.002-3' AND faces_maximo IS NULL;
UPDATE aba_catalog.servicos SET faces_minimo = 1, faces_maximo = 5, regiao_dentaria = 'anterior'
 WHERE codigo_sigtap = '03.07.01.003-1' AND faces_maximo IS NULL;
UPDATE aba_catalog.servicos SET faces_minimo = 1, faces_maximo = 5, regiao_dentaria = 'posterior'
 WHERE codigo_sigtap = '03.07.01.004-0' AND faces_maximo IS NULL;

-- ============================================================
-- 5. A semente, republicada com a regra de forma
-- ============================================================
-- Idêntica à de 042 em código, nome, unidade e quantidade máxima — as
-- 64 linhas não mudam. O que muda é a tupla, que perde `aceita_faces`
-- (agora derivado) e ganha `faces_min`, `faces_max` e `regiao`.
--
-- SEM esta republicação, uma conta que semeasse DEPOIS de 043 receberia
-- as três restaurações com `aceita_faces = FALSE`, porque o gatilho
-- sobrescreveria o literal `true` do INSERT antigo. Regressão
-- silenciosa, verde, e visível só meses depois no orçamento.
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
  -- programaticamente do arquivo na Subetapa 03.6 (nenhuma linha
  -- digitada à mão). Código, nome, unidade e quantidade máxima
  -- inalterados; `faces_min`/`faces_max`/`regiao` acrescentados.
  FOR r IN
    SELECT * FROM (VALUES
      ('02.04.01.016-0', 'Radiografia oclusal', 'arcada', 2, NULL::SMALLINT, NULL::SMALLINT, NULL::TEXT),
      ('03.07.04.001-1', 'Colocacao de placa de mordida', 'arcada', 2, NULL, NULL, NULL),
      ('03.07.04.012-7', 'Manutenção/conserto de aparelho ortodôntico/ortopédico', 'arcada', 2, NULL, NULL, NULL),
      ('04.04.02.044-5', 'Contenção de dentes por splintagem', 'arcada', 2, NULL, NULL, NULL),
      ('04.04.02.061-5', 'Redução de luxação têmporo-mandibular', 'arcada', 2, NULL, NULL, NULL),
      ('04.04.02.062-3', 'Retirada de material de síntese óssea / dentária', 'arcada', 2, NULL, NULL, NULL),
      ('04.14.01.036-1', 'Exerese de cisto odontogênico e não-odontogênico', 'arcada', 2, NULL, NULL, NULL),
      ('04.14.01.038-8', 'Tratamento cirúrgico de fístula intra / extraoral', 'arcada', 2, NULL, NULL, NULL),
      ('04.14.02.004-9', 'Correção de bridas musculares', 'arcada', 2, NULL, NULL, NULL),
      ('04.14.02.005-7', 'Correção de irregularidades de rebordo alveolar', 'arcada', 2, NULL, NULL, NULL),
      ('04.14.02.029-4', 'Remoção de torus e exostoses', 'arcada', 2, NULL, NULL, NULL),
      ('07.01.07.006-4', 'Mantenedor de espaço', 'arcada', 2, NULL, NULL, NULL),
      ('07.01.07.007-2', 'Placa oclusal', 'arcada', 2, NULL, NULL, NULL),
      ('07.01.07.008-0', 'Plano inclinado', 'arcada', 2, NULL, NULL, NULL),
      ('07.01.07.009-9', 'Protese parcial mandibular removivel', 'arcada', 2, NULL, NULL, NULL),
      ('07.01.07.010-2', 'Protese parcial maxilar removivel', 'arcada', 2, NULL, NULL, NULL),
      ('07.01.07.011-0', 'Protese temporaria', 'arcada', 2, NULL, NULL, NULL),
      ('07.01.07.012-9', 'Protese total mandibular', 'arcada', 2, NULL, NULL, NULL),
      ('07.01.07.013-7', 'Protese total maxilar', 'arcada', 2, NULL, NULL, NULL),
      ('01.01.02.005-8', 'Aplicação de cariostático (por dente)', 'dente', 32, NULL, NULL, NULL),
      ('01.01.02.006-6', 'Aplicação de selante (por dente)', 'dente', 32, NULL, NULL, NULL),
      ('01.01.02.009-0', 'Selamento provisório de cavidade dentária', 'dente', 32, NULL, NULL, NULL),
      ('02.04.01.018-7', 'Radiografia peri-apical interproximal (bite-wing)', 'dente', 32, NULL, NULL, NULL),
      ('03.07.01.001-5', 'Capeamento pulpar', 'dente', 32, NULL, NULL, NULL),
      -- As três únicas com regra de forma: a descrição oficial diz
      -- "por face" e, em duas delas, diz também a região.
      ('03.07.01.002-3', 'Restauração de dente decíduo', 'dente', 32, 1, 5, 'ambas'),
      ('03.07.01.003-1', 'Restauração de dente permanente anterior', 'dente', 32, 1, 5, 'anterior'),
      ('03.07.01.004-0', 'Restauração de dente permanente posterior', 'dente', 32, 1, 5, 'posterior'),
      ('03.07.02.001-0', 'Acesso a polpa dentaria e medicacao (por dente)', 'dente', 32, NULL, NULL, NULL),
      ('03.07.02.002-9', 'Curativo de demora c/ ou s/ preparo biomecanico', 'dente', 32, NULL, NULL, NULL),
      ('03.07.02.003-7', 'Obturação de dente decíduo', 'dente', 32, NULL, NULL, NULL),
      ('03.07.02.004-5', 'Obturação em dente permanente birradicular', 'dente', 32, NULL, NULL, NULL),
      ('03.07.02.005-3', 'Obturação em dente permanente com três ou mais raízes', 'dente', 32, NULL, NULL, NULL),
      ('03.07.02.006-1', 'Obturação em dente permanente unirradicular', 'dente', 32, NULL, NULL, NULL),
      ('03.07.02.007-0', 'Pulpotomia dentária', 'dente', 32, NULL, NULL, NULL),
      ('03.07.02.008-8', 'Retratamento endodôntico em dente permanente bi-radicular', 'dente', 32, NULL, NULL, NULL),
      ('03.07.02.009-6', 'Retratamento endodôntico em dente permanente com 3 ou mais raízes', 'dente', 32, NULL, NULL, NULL),
      ('03.07.02.010-0', 'Retratamento endodôntico em dente permanente uni-radicular', 'dente', 32, NULL, NULL, NULL),
      ('03.07.02.011-8', 'Selamento de perfuração radicular', 'dente', 32, NULL, NULL, NULL),
      ('03.07.04.007-0', 'Moldagem dento-gengival p/ construcao de protese dentaria', 'dente', 32, NULL, NULL, NULL),
      ('03.07.04.008-9', 'Reembasamento e conserto de protese dentaria', 'dente', 32, NULL, NULL, NULL),
      ('03.07.04.013-5', 'Cimentação de prótese dentária', 'dente', 32, NULL, NULL, NULL),
      ('03.07.04.014-3', 'Adaptação de prótese dentária', 'dente', 32, NULL, NULL, NULL),
      ('03.07.04.015-1', 'Ajuste oclusal', 'dente', 32, NULL, NULL, NULL),
      ('03.07.04.016-0', 'Instalação de prótese dentária', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.002-2', 'Apicectomia com ou sem obturação retrógrada', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.007-3', 'Curetagem periapical', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.012-0', 'Exodontia de dente decíduo', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.013-8', 'Exodontia de dente permanente', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.014-6', 'Exodontia múltipla com alveoloplastia por sextante', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.021-9', 'Odontosecção / radilectomia / tunelização', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.024-3', 'Reimplante e transplante dental (por elemento)', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.027-8', 'Remoção de dente retido (incluso / impactado)', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.036-7', 'Tratamento cirúrgico para tracionamento dental', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.038-3', 'Tratamento de alveolite', 'dente', 32, NULL, NULL, NULL),
      ('04.14.02.040-5', 'Ulotomia/ulectomia', 'dente', 32, NULL, NULL, NULL),
      ('07.01.07.005-6', 'Coroa provisoria', 'dente', 32, NULL, NULL, NULL),
      ('07.01.07.014-5', 'Proteses coronarias / intra-radiculares fixas / adesivas (por elemento)', 'dente', 32, NULL, NULL, NULL),
      ('03.07.03.001-6', 'Raspagem alisamento e polimento supragengivais (por sextante)', 'sextante', 6, NULL, NULL, NULL),
      ('03.07.03.002-4', 'Raspagem alisamento subgengivais (por sextante)', 'sextante', 6, NULL, NULL, NULL),
      ('03.07.03.005-9', 'Raspagem alisamento e polimento supragengivais (por sextante)', 'sextante', 6, NULL, NULL, NULL),
      ('04.14.02.003-0', 'Aprofundamento de vestíbulo oral (por sextante)', 'sextante', 6, NULL, NULL, NULL),
      ('04.14.02.015-4', 'Gengivectomia (por sextante)', 'sextante', 6, NULL, NULL, NULL),
      ('04.14.02.016-2', 'Gengivoplastia (por sextante)', 'sextante', 6, NULL, NULL, NULL),
      ('04.14.02.037-5', 'Tratamento cirúrgico periodontal (por sextante)', 'sextante', 6, NULL, NULL, NULL)
    ) AS t(codigo, nome, unidade, qtd_max, faces_min, faces_max, regiao)
  LOOP
    IF EXISTS (
      SELECT 1 FROM aba_catalog.servicos
      WHERE account_id = v_account_id AND codigo_sigtap = r.codigo
    ) THEN
      v_ja_existentes := v_ja_existentes + 1;
      CONTINUE;
    END IF;

    -- `aceita_faces` NÃO aparece aqui: é derivado pelo gatilho a partir
    -- de `faces_maximo`. Os três requisitos ficam no DEFAULT FALSE — o
    -- SIGTAP não declara nenhum deles, e a clínica configura.
    INSERT INTO aba_catalog.servicos (
      account_id, categoria_id, nome, codigo_sigtap, unidade_lancamento,
      quantidade_maxima, faces_minimo, faces_maximo, regiao_dentaria,
      duracao_padrao_minutos, preco_base, requer_profissional
    ) VALUES (
      v_account_id, v_categoria_id, r.nome, r.codigo, r.unidade,
      r.qtd_max, r.faces_min, r.faces_max, r.regiao,
      30, 0, TRUE
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
