-- ============================================================
-- 044_vocabulario_pacote_procedimento.sql — Subetapa 03.6.b
--
-- Decisões D-V1 e D-V2 de Max (2026-09-04). RENOME PURO: nenhuma
-- tabela nova, nenhuma coluna nova, nenhuma regra nova, nenhuma
-- mudança de comportamento. Só vocabulário.
--
-- ------------------------------------------------------------
-- O PROBLEMA, MEDIDO ANTES DE QUALQUER LINHA
-- ------------------------------------------------------------
-- A palavra "plano" tinha QUATRO donos dentro do mesmo produto, e dois
-- deles já estavam escritos no repositório com sentidos diferentes:
--
--   · `crm/src/features/health/odontograma.ts:83` — "a carta de PLANO
--     diverge da de status" (planejamento clínico)
--   · `crm/src/features/catalog/PlanosTab.tsx:43` — placeholder
--     "Ex.: PACOTE 10 sessões" num formulário chamado "Novo PLANO"
--     (pacote pré-pago)
--
-- A origem foi uma tradução, e ela está documentada no próprio
-- repositório: `011_aba_finance_operations.sql:6` registra
-- `sell_package → vender_plano`, `package_balances → saldos_plano`.
-- Era **package**. Em odontologia, "plano" já significava outras três
-- coisas — e a que importa (o planejamento clínico) é justamente a que
-- não tinha a palavra.
--
-- Depois desta migration:
--   · procedimento — a unidade atômica (era `servicos`)
--   · pacote       — o combo padrão ofertado a todos (era `planos`)
--   · plano        — o planejamento clínico personalizado (`aba_treatment`, 03.8)
--   · nível        — a faixa comercial do CRM (documentos, 03.9)
--   · convênio     — a operadora do paciente (adiado por D-V5)
--
-- Detalhe completo em `docs/02_MODELO_DE_DADOS.md` §13.
--
-- ------------------------------------------------------------
-- POR QUE RENOME E NUNCA RECRIAÇÃO
-- ------------------------------------------------------------
-- `ALTER ... RENAME` preserva OID, e com o OID vêm o dado, os índices,
-- as policies, os gatilhos e — o que mais importa aqui — as **chaves
-- estrangeiras**. As 10 chaves que apontam para `servicos`/`planos` são
-- TODAS compostas por `account_id` (`035_fk_compostas_por_conta.sql`,
-- Subetapa 02.15), e recriar tabela para "renomear" abriria a chance de
-- alguma renascer sem o `account_id`. A seção 7 confere que
-- `public.fks_sem_isolamento_de_conta()` continua devolvendo zero.
--
-- ------------------------------------------------------------
-- A ARMADILHA QUE ESTA MIGRATION EXISTE PARA NÃO REPETIR
-- ------------------------------------------------------------
-- `ALTER TABLE ... RENAME` conserta view, policy e chave estrangeira
-- sozinho. **Corpo de função plpgsql é TEXTO**, resolvido só na
-- execução: nove funções continuariam citando tabelas que não existem
-- mais, e o erro só apareceria quando alguém as chamasse. Pior ainda,
-- `cron.job` guarda o comando como **string** — o job 5 chama
-- `aba_finance.expirar_planos()`, e renomear a função sem tocar no
-- agendador é exatamente a falha silenciosa que `handoffs/instrucoes.md`
-- §6 registra ("rotina de banco sem agendador falha em silêncio").
-- Seções 4 e 5 tratam as duas; a seção 7 recusa a migration se sobrar
-- qualquer uma.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

-- ============================================================
-- 1. TABELAS
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('aba_catalog',   'servicos',              'procedimentos'),
      ('aba_catalog',   'variantes_servico',     'variantes_procedimento'),
      ('aba_catalog',   'planos',                'pacotes'),
      ('aba_catalog',   'itens_plano',           'itens_pacote'),
      ('aba_finance',   'planos_cliente',        'pacotes_cliente'),
      ('aba_finance',   'saldos_plano',          'saldos_pacote'),
      ('aba_finance',   'extrato_plano',         'extrato_pacote'),
      ('aba_scheduling','agendamento_servicos',  'agendamento_procedimentos')
    ) AS t(sch, antigo, novo)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = r.sch AND c.relname = r.antigo AND c.relkind = 'r'
    ) THEN
      EXECUTE format('ALTER TABLE %I.%I RENAME TO %I', r.sch, r.antigo, r.novo);
      RAISE NOTICE '044: tabela %.% -> %', r.sch, r.antigo, r.novo;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 2. COLUNAS — dirigido por catálogo, não por lista escrita à mão
-- ============================================================
-- A lição da 02.15: lista manual protege o que alguém lembrou;
-- varredura protege o que ninguém viu. Se uma tabela nova nascer com
-- `servico_id` entre a escrita e a execução desta migration, ela é
-- alcançada do mesmo jeito.
DO $$
DECLARE
  r RECORD;
  v_novo TEXT;
BEGIN
  FOR r IN
    SELECT c.table_schema AS sch, c.table_name AS tab, c.column_name AS col
    FROM information_schema.columns c
    JOIN pg_class t   ON t.relname = c.table_name
    JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = c.table_schema
    WHERE c.table_schema LIKE 'aba\_%'
      AND t.relkind = 'r'
      AND c.column_name IN ('servico_id', 'plano_id', 'plano_cliente_id', 'variante_servico_id')
    ORDER BY 1, 2, 3
  LOOP
    v_novo := CASE r.col
                WHEN 'servico_id'          THEN 'procedimento_id'
                WHEN 'plano_id'            THEN 'pacote_id'
                WHEN 'plano_cliente_id'    THEN 'pacote_cliente_id'
                WHEN 'variante_servico_id' THEN 'variante_procedimento_id'
              END;
    EXECUTE format('ALTER TABLE %I.%I RENAME COLUMN %I TO %I', r.sch, r.tab, r.col, v_novo);
    RAISE NOTICE '044: coluna %.%.% -> %', r.sch, r.tab, r.col, v_novo;
  END LOOP;
END $$;

-- ============================================================
-- 3. CONSTRAINTS E ÍNDICES — também por catálogo
-- ============================================================
-- Cosmético para o banco e essencial para quem lê o catálogo depois:
-- uma chave chamada `itens_plano_plano_id_fkey` numa tabela
-- `itens_pacote` conta a história errada para a próxima sessão.
-- A substituição vai do nome mais longo para o mais curto, senão
-- 'servicos' viraria 'procedimentos' pela metade.
DO $$
DECLARE
  r RECORD;
  v_novo TEXT;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass::text AS tab
    FROM pg_constraint c
    JOIN pg_class t     ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname LIKE 'aba\_%'
      AND (c.conname LIKE '%servico%' OR c.conname LIKE '%plano%')
  LOOP
    v_novo := replace(replace(replace(replace(
                r.conname, 'servicos', 'procedimentos'), 'servico', 'procedimento'),
                'planos', 'pacotes'), 'plano', 'pacote');
    IF v_novo <> r.conname THEN
      EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', r.tab, r.conname, v_novo);
      RAISE NOTICE '044: constraint % -> %', r.conname, v_novo;
    END IF;
  END LOOP;

  -- Índices que NÃO pertencem a constraint (esses já foram renomeados
  -- junto com ela).
  FOR r IN
    SELECT i.relname AS idx, n.nspname AS sch
    FROM pg_class i
    JOIN pg_namespace n ON n.oid = i.relnamespace
    WHERE i.relkind = 'i'
      AND n.nspname LIKE 'aba\_%'
      AND (i.relname LIKE '%servico%' OR i.relname LIKE '%plano%')
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.oid)
  LOOP
    v_novo := replace(replace(replace(replace(
                r.idx, 'servicos', 'procedimentos'), 'servico', 'procedimento'),
                'planos', 'pacotes'), 'plano', 'pacote');
    IF v_novo <> r.idx THEN
      EXECUTE format('ALTER INDEX %I.%I RENAME TO %I', r.sch, r.idx, v_novo);
      RAISE NOTICE '044: indice % -> %', r.idx, v_novo;
    END IF;
  END LOOP;
END $$;
-- ============================================================
-- 4. FUNÇÕES (seção gerada por crm/scripts/gerar_renome_044.mjs)
--
-- Corpo de função plpgsql é TEXTO: `ALTER TABLE ... RENAME` não o
-- alcança. Estas 9 funções foram encontradas por varredura de
-- catálogo (nenhuma lista escrita à mão) e reescritas com os nomes
-- novos. A seção 7 confere que nenhuma sobrou com nome antigo.
-- ============================================================

-- aba_catalog.definir_variante_padrao
CREATE OR REPLACE FUNCTION aba_catalog.definir_variante_padrao(p_variante_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_procedimento_id UUID;
BEGIN
  SELECT procedimento_id INTO v_procedimento_id
  FROM aba_catalog.variantes_procedimento
  WHERE id = p_variante_id;

  IF v_procedimento_id IS NULL THEN
    RAISE EXCEPTION 'Variação não encontrada' USING ERRCODE = '22023';
  END IF;

  UPDATE aba_catalog.variantes_procedimento
  SET padrao = FALSE
  WHERE procedimento_id = v_procedimento_id
    AND padrao = TRUE
    AND id <> p_variante_id;

  UPDATE aba_catalog.variantes_procedimento
  SET padrao = TRUE
  WHERE id = p_variante_id;
END;
$function$;

-- aba_catalog.semear_procedimentos_sigtap
CREATE OR REPLACE FUNCTION aba_catalog.semear_procedimentos_sigtap()
 RETURNS TABLE(inseridos integer, ja_existentes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      SELECT 1 FROM aba_catalog.procedimentos
      WHERE account_id = v_account_id AND codigo_sigtap = r.codigo
    ) THEN
      v_ja_existentes := v_ja_existentes + 1;
      CONTINUE;
    END IF;

    -- `aceita_faces` NÃO aparece aqui: é derivado pelo gatilho a partir
    -- de `faces_maximo`. Os três requisitos ficam no DEFAULT FALSE — o
    -- SIGTAP não declara nenhum deles, e a clínica configura.
    INSERT INTO aba_catalog.procedimentos (
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
$function$;

-- aba_finance.ao_concluir_agendamento
CREATE OR REPLACE FUNCTION aba_finance.ao_concluir_agendamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'aba_finance', 'aba_scheduling', 'public'
AS $function$
DECLARE
  v_row RECORD;
  v_procedimento_id UUID;
  v_pct NUMERIC(5,2);
  v_base NUMERIC(12,2);
BEGIN
  IF NEW.status <> 'concluido' OR OLD.status = 'concluido' THEN
    RETURN NULL;
  END IF;

  IF NEW.pacote_cliente_id IS NOT NULL THEN
    FOR v_row IN
      SELECT procedimento_id FROM aba_scheduling.agendamento_procedimentos
      WHERE agendamento_id = NEW.id
    LOOP
      INSERT INTO aba_finance.extrato_pacote
        (account_id, pacote_cliente_id, agendamento_id, procedimento_id, delta, motivo, criado_por)
      VALUES
        (NEW.account_id, NEW.pacote_cliente_id, NEW.id, v_row.procedimento_id, -1,
         'Consumo por atendimento concluído', NEW.criado_por);
    END LOOP;
  END IF;

  SELECT procedimento_id INTO v_procedimento_id
  FROM aba_scheduling.agendamento_procedimentos
  WHERE agendamento_id = NEW.id
  LIMIT 1;

  v_base := COALESCE(NEW.valor_cobrado, 0);

  SELECT rc.percentual INTO v_pct
  FROM aba_finance.regras_comissao rc
  WHERE rc.profissional_id = NEW.profissional_id
    AND rc.ativo
    AND rc.vigente_de <= CURRENT_DATE
    AND (rc.vigente_ate IS NULL OR rc.vigente_ate >= CURRENT_DATE)
    AND (rc.procedimento_id = v_procedimento_id OR rc.procedimento_id IS NULL)
  ORDER BY (rc.procedimento_id IS NOT NULL) DESC, rc.vigente_de DESC
  LIMIT 1;

  v_pct := COALESCE(v_pct, 0);

  INSERT INTO aba_finance.lancamentos_comissao
    (account_id, agendamento_id, profissional_id, procedimento_id,
     valor_base, percentual, valor_comissao)
  VALUES
    (NEW.account_id, NEW.id, NEW.profissional_id, v_procedimento_id,
     v_base, v_pct, ROUND(v_base * v_pct / 100, 2))
  ON CONFLICT (agendamento_id) WHERE agendamento_id IS NOT NULL DO NOTHING;

  RETURN NULL;
END;
$function$;

-- aba_finance.aplicar_extrato_ao_saldo
CREATE OR REPLACE FUNCTION aba_finance.aplicar_extrato_ao_saldo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'aba_finance', 'public'
AS $function$
DECLARE
  v_restante INTEGER;
BEGIN
  UPDATE aba_finance.saldos_pacote
  SET sessoes_usadas = sessoes_usadas - NEW.delta
  WHERE pacote_cliente_id = NEW.pacote_cliente_id
    AND procedimento_id = NEW.procedimento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Não há saldo cadastrado para este procedimento neste pacote (pacote_cliente_id=%, procedimento_id=%)',
      NEW.pacote_cliente_id, NEW.procedimento_id
      USING ERRCODE = '23514';
  END IF;

  SELECT SUM(sessoes_totais - sessoes_usadas) INTO v_restante
  FROM aba_finance.saldos_pacote
  WHERE pacote_cliente_id = NEW.pacote_cliente_id;

  IF v_restante <= 0 THEN
    UPDATE aba_finance.pacotes_cliente SET status = 'esgotado'
    WHERE id = NEW.pacote_cliente_id AND status = 'ativo';
  ELSE
    UPDATE aba_finance.pacotes_cliente SET status = 'ativo'
    WHERE id = NEW.pacote_cliente_id AND status = 'esgotado';
  END IF;

  RETURN NULL;
END;
$function$;

-- aba_finance.estornar_sessao
-- Parâmetro renomeado (p_plano_cliente_id uuid, p_servico_id uuid, p_motivo text, p_agendamento_id uuid → p_pacote_cliente_id uuid, p_procedimento_id uuid, p_motivo text, p_agendamento_id uuid): CREATE OR REPLACE não dá conta.
DROP FUNCTION IF EXISTS aba_finance.estornar_sessao(p_plano_cliente_id uuid, p_servico_id uuid, p_motivo text, p_agendamento_id uuid);
CREATE OR REPLACE FUNCTION aba_finance.estornar_sessao(p_pacote_cliente_id uuid, p_procedimento_id uuid, p_motivo text DEFAULT NULL::text, p_agendamento_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_account_id UUID;
  v_usadas INTEGER;
  v_extrato_id UUID;
BEGIN
  SELECT s.account_id, s.sessoes_usadas INTO v_account_id, v_usadas
  FROM aba_finance.saldos_pacote s
  WHERE s.pacote_cliente_id = p_pacote_cliente_id
    AND s.procedimento_id = p_procedimento_id;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Não há saldo cadastrado para este procedimento neste pacote'
      USING ERRCODE = '22023', DETAIL = 'saldo_nao_encontrado';
  END IF;

  IF v_usadas <= 0 THEN
    RAISE EXCEPTION 'Não há sessão consumida para estornar neste procedimento'
      USING ERRCODE = '23514', DETAIL = 'nada_a_estornar';
  END IF;

  INSERT INTO aba_finance.extrato_pacote
    (account_id, pacote_cliente_id, agendamento_id, procedimento_id, delta, motivo, criado_por)
  VALUES
    (v_account_id, p_pacote_cliente_id, p_agendamento_id, p_procedimento_id, 1,
     COALESCE(p_motivo, 'Estorno manual de sessão'), auth.uid())
  RETURNING id INTO v_extrato_id;

  RETURN v_extrato_id;
END;
$function$;

-- aba_finance.expirar_planos  →  aba_finance.expirar_pacotes
CREATE OR REPLACE FUNCTION aba_finance.expirar_pacotes()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_qtd INTEGER;
BEGIN
  WITH atualizados AS (
    UPDATE aba_finance.pacotes_cliente pc
    SET status = 'vencido'
    WHERE pc.status = 'ativo'
      AND pc.expira_em IS NOT NULL
      AND pc.expira_em < NOW()
    RETURNING 1
  )
  SELECT count(*)::INTEGER INTO v_qtd FROM atualizados;
  RETURN v_qtd;
END;
$function$;

-- aba_finance.planos_vencendo_em  →  aba_finance.pacotes_vencendo_em
CREATE OR REPLACE FUNCTION aba_finance.pacotes_vencendo_em(p_dias integer DEFAULT 15)
 RETURNS TABLE(pacote_cliente_id uuid, cliente_id uuid, pacote_id uuid, expira_em timestamp with time zone, sessoes_restantes integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT
    pc.id,
    pc.cliente_id,
    pc.pacote_id,
    pc.expira_em,
    COALESCE(SUM(s.sessoes_totais - s.sessoes_usadas), 0)::INTEGER
  FROM aba_finance.pacotes_cliente pc
  LEFT JOIN aba_finance.saldos_pacote s ON s.pacote_cliente_id = pc.id
  WHERE pc.status = 'ativo'
    AND pc.expira_em IS NOT NULL
    AND pc.expira_em >= NOW()
    AND pc.expira_em < NOW() + (GREATEST(COALESCE(p_dias, 15), 0) || ' days')::INTERVAL
  GROUP BY pc.id, pc.cliente_id, pc.pacote_id, pc.expira_em
  ORDER BY pc.expira_em;
$function$;

-- aba_finance.vender_plano  →  aba_finance.vender_pacote
CREATE OR REPLACE FUNCTION aba_finance.vender_pacote(p_cliente_id uuid, p_pacote_id uuid, p_preco_total numeric DEFAULT NULL::numeric, p_fatura_id uuid DEFAULT NULL::uuid, p_expira_em timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_account_id UUID;
  v_pacote RECORD;
  v_pacote_cliente_id UUID;
  v_expira_em TIMESTAMPTZ;
  v_itens INTEGER;
BEGIN
  -- SELECT comum, nunca FOR UPDATE: FOR UPDATE aplica a política de
  -- UPDATE além da de SELECT e transforma "sem permissão" em "não
  -- encontrado" — achado já registrado no Maximus (subetapa 02.3 de
  -- lá), reaplicado aqui por precaução.
  SELECT c.account_id INTO v_account_id
  FROM aba_people.clientes c
  WHERE c.id = p_cliente_id;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado ou fora do seu alcance'
      USING ERRCODE = '22023', DETAIL = 'cliente_nao_encontrado';
  END IF;

  SELECT p.id, p.preco_total, p.dias_validade, p.ativo, p.account_id
    INTO v_pacote
  FROM aba_catalog.pacotes p
  WHERE p.id = p_pacote_id;

  IF v_pacote.id IS NULL THEN
    RAISE EXCEPTION 'Pacote não encontrado ou fora do seu alcance'
      USING ERRCODE = '22023', DETAIL = 'pacote_nao_encontrado';
  END IF;

  IF v_pacote.account_id <> v_account_id THEN
    RAISE EXCEPTION 'Cliente e pacote pertencem a contas diferentes'
      USING ERRCODE = '22023', DETAIL = 'conta_divergente';
  END IF;

  IF NOT v_pacote.ativo THEN
    RAISE EXCEPTION 'Pacote inativo não pode ser vendido'
      USING ERRCODE = '23514', DETAIL = 'pacote_inativo';
  END IF;

  SELECT count(*) INTO v_itens
  FROM aba_catalog.itens_pacote pi
  WHERE pi.pacote_id = p_pacote_id;

  IF v_itens = 0 THEN
    RAISE EXCEPTION 'Pacote sem nenhum procedimento não gera saldo'
      USING ERRCODE = '23514', DETAIL = 'pacote_sem_itens';
  END IF;

  v_expira_em := COALESCE(
    p_expira_em,
    CASE WHEN v_pacote.dias_validade IS NOT NULL
         THEN NOW() + (v_pacote.dias_validade || ' days')::INTERVAL END
  );

  INSERT INTO aba_finance.pacotes_cliente
    (account_id, cliente_id, pacote_id, fatura_id, preco_total, expira_em)
  VALUES
    (v_account_id, p_cliente_id, p_pacote_id, p_fatura_id,
     COALESCE(p_preco_total, v_pacote.preco_total), v_expira_em)
  RETURNING id INTO v_pacote_cliente_id;

  INSERT INTO aba_finance.saldos_pacote
    (account_id, pacote_cliente_id, procedimento_id, variante_procedimento_id, sessoes_totais)
  SELECT
    v_account_id,
    v_pacote_cliente_id,
    pi.procedimento_id,
    (array_agg(pi.variante_procedimento_id ORDER BY pi.criado_em))[1],
    SUM(pi.sessoes_incluidas)::INTEGER
  FROM aba_catalog.itens_pacote pi
  WHERE pi.pacote_id = p_pacote_id
  GROUP BY pi.procedimento_id;

  RETURN v_pacote_cliente_id;
END;
$function$;

-- public.resgatar_convite
CREATE OR REPLACE FUNCTION public.resgatar_convite(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_token_hash TEXT;
  v_inv public.account_invitations%ROWTYPE;
  v_old_account_id UUID;
  v_old_account_owner UUID;
  v_old_profile_id UUID;
  v_tem_dado BOOLEAN;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_inv FROM public.account_invitations
  WHERE token_hash = v_token_hash FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite não encontrado' USING ERRCODE = '22023';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Convite já foi resgatado' USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at <= now() THEN
    RAISE EXCEPTION 'Convite expirado' USING ERRCODE = '22023';
  END IF;

  SELECT p.id, p.account_id, a.owner_user_id
    INTO v_old_profile_id, v_old_account_id, v_old_account_owner
  FROM public.profiles p JOIN public.accounts a ON a.id = p.account_id
  WHERE p.user_id = v_caller_id;

  IF v_old_account_id IS NULL THEN
    RAISE EXCEPTION 'Chamador sem perfil' USING ERRCODE = '42501';
  END IF;

  IF v_old_account_id = v_inv.account_id THEN
    RAISE EXCEPTION 'Você já é membro desta conta' USING ERRCODE = '23505';
  END IF;

  IF v_old_account_owner <> v_caller_id THEN
    RAISE EXCEPTION 'Você já pertence a uma conta compartilhada — cadastre-se com outro e-mail para aceitar este convite' USING ERRCODE = '23505';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM aba_people.leads WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM aba_people.clientes WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM aba_people.fornecedores WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM aba_catalog.procedimentos WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM aba_catalog.pacotes WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM aba_automations.automacoes WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM aba_automations.fluxos WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM aba_ai.ia_documentos_conhecimento WHERE account_id = v_old_account_id
    LIMIT 1
  ) INTO v_tem_dado;

  IF v_tem_dado THEN
    RAISE EXCEPTION 'Sua conta já contém dados — cadastre-se com outro e-mail para aceitar este convite' USING ERRCODE = '23505';
  END IF;

  -- ------------------------------------------------------------------
  -- Limpar vínculos da conta de ORIGEM antes de mover o perfil.
  -- Necessário desde a `035`: as chaves para `public.profiles` passaram
  -- a ser `(profile_id, account_id)`, e o perfil está prestes a trocar
  -- de `account_id`. Estas linhas pertencem à conta antiga, que é
  -- apagada no fim desta mesma função.
  -- ------------------------------------------------------------------
  DELETE FROM aba_scheduling.profissionais
   WHERE account_id = v_old_account_id AND profile_id = v_old_profile_id;

  DELETE FROM aba_people.funcionarios
   WHERE account_id = v_old_account_id AND profile_id = v_old_profile_id;

  UPDATE aba_people.pessoa_notas
     SET autor_id = NULL
   WHERE account_id = v_old_account_id AND autor_id = v_old_profile_id;

  UPDATE public.profiles
  SET account_id = v_inv.account_id, account_role = v_inv.role
  WHERE user_id = v_caller_id;

  UPDATE public.account_invitations
  SET accepted_at = now(), accepted_by_user_id = v_caller_id
  WHERE id = v_inv.id;

  DELETE FROM public.accounts WHERE id = v_old_account_id;

  RETURN v_inv.account_id;
END;
$function$;

-- As três funções que mudaram de NOME deixam a versão antiga para trás.
-- DROP depois do CREATE, para nunca existir uma janela sem nenhuma das duas.
DROP FUNCTION IF EXISTS aba_finance.vender_plano(p_cliente_id uuid, p_plano_id uuid, p_preco_total numeric, p_fatura_id uuid, p_expira_em timestamp with time zone);
DROP FUNCTION IF EXISTS aba_finance.expirar_planos();
DROP FUNCTION IF EXISTS aba_finance.planos_vencendo_em(p_dias integer);

-- ------------------------------------------------------------
-- 4b. PRIVILÉGIO DAS TRÊS FUNÇÕES QUE MUDARAM DE NOME
-- ------------------------------------------------------------
-- `CREATE OR REPLACE` sobre função existente PRESERVA os privilégios.
-- Mas as três que mudaram de NOME são funções NOVAS para o Postgres —
-- e **função nova nasce executável por PUBLIC**
-- (`handoffs/instrucoes.md` §6). O renome, sozinho, AFROUXOU
-- `expirar_pacotes`, que era exclusiva de `service_role` por ser rotina
-- de agendador: qualquer usuário autenticado passaria a poder expirar
-- pacotes de qualquer conta por RPC.
--
-- Não foi deduzido, foi MEDIDO: o teste permanente
-- `crm/tests/rls/11_adversarial_superficie.spec.ts` ("authenticated não
-- chama função interna de trigger por RPC") ficou vermelho na primeira
-- execução desta subetapa, com a mensagem
-- "aba_finance.expirar_pacotes foi executável por authenticated".
-- Sem esse teste, o afrouxamento entraria em produção sem sintoma.
--
-- Os privilégios abaixo são exatamente os que
-- `011_aba_finance_operations.sql` (linhas 139-141, 351-354, 391-393)
-- declarou para as versões antigas. Nada foi decidido aqui.
REVOKE ALL ON FUNCTION aba_finance.vender_pacote(UUID, UUID, NUMERIC, UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.vender_pacote(UUID, UUID, NUMERIC, UUID, TIMESTAMPTZ) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.vender_pacote(UUID, UUID, NUMERIC, UUID, TIMESTAMPTZ) TO authenticated, service_role;

-- Rotina de agendador: `service_role` e mais ninguém.
REVOKE ALL ON FUNCTION aba_finance.expirar_pacotes() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.expirar_pacotes() FROM anon;
REVOKE ALL ON FUNCTION aba_finance.expirar_pacotes() FROM authenticated;
GRANT EXECUTE ON FUNCTION aba_finance.expirar_pacotes() TO service_role;

REVOKE ALL ON FUNCTION aba_finance.pacotes_vencendo_em(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.pacotes_vencendo_em(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.pacotes_vencendo_em(INTEGER) TO authenticated, service_role;

-- `estornar_sessao` NÃO mudou de nome, mas mudou de PARÂMETRO
-- (`p_plano_cliente_id` → `p_pacote_cliente_id`), e o Postgres recusa
-- trocar nome de parâmetro em `CREATE OR REPLACE`. Foi preciso DROP +
-- CREATE, o que a torna função nova para efeito de privilégio — mesma
-- armadilha, causa diferente. Privilégios de `011` linhas 195-197.
REVOKE ALL ON FUNCTION aba_finance.estornar_sessao(UUID, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.estornar_sessao(UUID, UUID, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.estornar_sessao(UUID, UUID, TEXT, UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 4c. UM ACHADO INCIDENTAL, QUE NÃO É DESTA SUBETAPA
-- ------------------------------------------------------------
-- A verificação (f) — escrita aqui para impedir que um renome futuro
-- afrouxe função de novo — encontrou uma função que JÁ ESTAVA
-- executável por PUBLIC em produção, e não tem relação nenhuma com
-- vocabulário: `aba_people.desvincular_perfil_da_conta_antiga`, criada
-- pela `038_desvincular_perfil_antes_de_mover.sql` (Subetapa 02.15) sem
-- o `REVOKE ... FROM PUBLIC` que todas as outras funções de módulo
-- têm.
--
-- **Severidade medida, não presumida:** ela é função de GATILHO
-- (`RETURNS TRIGGER`, presa a `public.profiles` — `038` linhas 43 e 81).
-- O PostgREST não expõe função de gatilho, e o Postgres recusa
-- chamá-la fora de um gatilho. Portanto **não é exploit vivo** — é um
-- privilégio que nunca deveria ter existido, e que a varredura por
-- catálogo achou porque varredura acha o que ninguém lembrou
-- (`handoffs/instrucoes.md` §5, Subetapa 01.8).
--
-- Corrigido aqui, e não adiado, pela regra que o próprio projeto já
-- pagou para aprender: "hardening de um módulo não se propaga para os
-- outros — ao estabelecer um padrão novo, varrer o catálogo atrás de
-- quem mais se encaixa nele" (`handoffs/instrucoes.md` §6).
REVOKE ALL ON FUNCTION aba_people.desvincular_perfil_da_conta_antiga() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_people.desvincular_perfil_da_conta_antiga() FROM anon;
REVOKE ALL ON FUNCTION aba_people.desvincular_perfil_da_conta_antiga() FROM authenticated;

-- ============================================================
-- 5. O AGENDADOR — `cron.job` guarda o comando como STRING
-- ============================================================
-- Nenhum `ALTER ... RENAME` alcança isto. O job 5 chama
-- `aba_finance.expirar_planos()`; sem esta seção ele passaria a chamar
-- uma função que não existe mais, e o sintoma seria AUSÊNCIA de
-- comportamento — pacote que nunca expira —, que não gera erro, não
-- aparece em teste e não acusa em advisor (`handoffs/instrucoes.md` §6,
-- lição da Subetapa 02.0).
DO $$
DECLARE
  r RECORD;
  v_novo TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '044: pg_cron ausente neste banco — nada a reagendar';
    RETURN;
  END IF;

  FOR r IN
    SELECT jobid, command FROM cron.job
    WHERE command LIKE '%expirar_planos%'
       OR command LIKE '%vender_plano%'
       OR command LIKE '%planos_vencendo_em%'
  LOOP
    v_novo := replace(replace(replace(r.command,
                'expirar_planos',      'expirar_pacotes'),
                'planos_vencendo_em',  'pacotes_vencendo_em'),
                'vender_plano',        'vender_pacote');
    PERFORM cron.alter_job(job_id := r.jobid, command := v_novo);
    RAISE NOTICE '044: job % -> %', r.jobid, v_novo;
  END LOOP;
END $$;

-- ============================================================
-- 6. O VALOR `'plano'` DO CHECK DE `forma_pagamento`
-- ============================================================
-- Este não é nome de tabela, é DADO — e por isso é a única parte desta
-- migration que altera linha de produção (2 linhas, medidas em
-- 2026-09-04).
--
-- Por que `'saldo_pacote'` e não `'pacote'`: aquele valor nunca foi
-- forma de pagamento nem pagador. Ele significa "abatido do saldo
-- pré-pago", que é **liquidação**. Chamá-lo de `'pacote'` reabriria a
-- leitura errada ("pagou com o pacote"). Quando o convênio existir
-- (D-V5, hoje adiado), "quem pagou" será coluna própria — nunca um
-- valor deste enum. Ver `docs/02_MODELO_DE_DADOS.md` §13.4.
--
-- O CHECK é buscado pelo NOME DA COLUNA no texto da definição, nunca
-- pelo nome do constraint nem pela sintaxe do operador:
-- `pg_get_constraintdef()` reescreve `IN (...)` como `= ANY (ARRAY[...])`
-- (`handoffs/instrucoes.md` §5, Subetapa 03.4).
DO $$
DECLARE
  v_nome TEXT;
  v_migradas INT;
BEGIN
  SELECT c.conname INTO v_nome
  FROM pg_constraint c
  WHERE c.conrelid = 'aba_finance.pagamentos'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%forma_pagamento%';

  IF v_nome IS NOT NULL THEN
    EXECUTE format('ALTER TABLE aba_finance.pagamentos DROP CONSTRAINT %I', v_nome);
  END IF;

  UPDATE aba_finance.pagamentos SET forma_pagamento = 'saldo_pacote'
   WHERE forma_pagamento = 'plano';
  GET DIAGNOSTICS v_migradas = ROW_COUNT;
  RAISE NOTICE '044: pagamentos com forma "plano" migrados para "saldo_pacote": %', v_migradas;

  ALTER TABLE aba_finance.pagamentos
    ADD CONSTRAINT pagamentos_forma_pagamento_check
    CHECK (forma_pagamento IS NULL OR forma_pagamento IN
           ('pix','cartao','dinheiro','transferencia','saldo_pacote','outro'));
END $$;

-- ============================================================
-- 7. VERIFICAÇÃO — a migration se recusa a terminar torta
-- ============================================================
-- Cinco perguntas. Qualquer uma respondida errado derruba a transação
-- inteira, e é assim que se quer: renome pela metade deixa os dois
-- vocabulários vivos ao mesmo tempo, que é pior que nenhum.
DO $$
DECLARE
  v_n INT;
  v_lista TEXT;
BEGIN
  -- (a) nenhuma tabela com nome antigo
  SELECT count(*), coalesce(string_agg(n.nspname||'.'||c.relname, ', '), '')
    INTO v_n, v_lista
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname LIKE 'aba\_%' AND c.relkind = 'r'
    AND c.relname IN ('servicos','planos','itens_plano','variantes_servico',
                      'planos_cliente','saldos_plano','extrato_plano','agendamento_servicos');
  IF v_n > 0 THEN
    RAISE EXCEPTION '044 (a): % tabela(s) ainda com nome antigo: %', v_n, v_lista;
  END IF;

  -- (b) nenhuma coluna com nome antigo
  SELECT count(*), coalesce(string_agg(table_schema||'.'||table_name||'.'||column_name, ', '), '')
    INTO v_n, v_lista
  FROM information_schema.columns
  WHERE table_schema LIKE 'aba\_%'
    AND column_name IN ('servico_id','plano_id','plano_cliente_id','variante_servico_id');
  IF v_n > 0 THEN
    RAISE EXCEPTION '044 (b): % coluna(s) ainda com nome antigo: %', v_n, v_lista;
  END IF;

  -- (c) nenhuma função com o corpo apontando para nome antigo.
  --     Esta é a que justifica a seção 4 existir.
  SELECT count(*), coalesce(string_agg(n.nspname||'.'||p.proname, ', '), '')
    INTO v_n, v_lista
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prokind = 'f'
    AND n.nspname IN ('aba_catalog','aba_finance','aba_scheduling','aba_health','public','access')
    AND pg_get_functiondef(p.oid) ~ ('(aba_catalog\.servicos|aba_catalog\.planos|aba_catalog\.itens_plano'
                                   || '|aba_catalog\.variantes_servico|aba_finance\.planos_cliente'
                                   || '|aba_finance\.saldos_plano|aba_finance\.extrato_plano'
                                   || '|aba_scheduling\.agendamento_servicos|aba_finance\.vender_plano'
                                   || '|aba_finance\.expirar_planos|aba_finance\.planos_vencendo_em)');
  IF v_n > 0 THEN
    RAISE EXCEPTION '044 (c): % funcao(oes) ainda citam nome antigo no corpo: %', v_n, v_lista;
  END IF;

  -- (d) o agendador não ficou apontando para função inexistente
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT count(*), coalesce(string_agg(command, ' | '), '') INTO v_n, v_lista
    FROM cron.job
    WHERE command LIKE '%expirar_planos%'
       OR command LIKE '%vender_plano%'
       OR command LIKE '%planos_vencendo_em%';
    IF v_n > 0 THEN
      RAISE EXCEPTION '044 (d): % job(s) do pg_cron ainda chamam funcao renomeada: %', v_n, v_lista;
    END IF;
  END IF;

  -- (e) a auditoria de isolamento de conta continua limpa. É o contrato
  --     que a Subetapa 02.15 deixou, e um renome é exatamente o tipo de
  --     operação em que uma chave composta poderia se perder.
  SELECT count(*) INTO v_n FROM public.fks_sem_isolamento_de_conta();
  IF v_n > 0 THEN
    RAISE EXCEPTION '044 (e): % chave(s) estrangeira(s) sem isolamento de conta apos o renome', v_n;
  END IF;

  -- (f) nenhuma função de módulo executável por PUBLIC, e a rotina de
  --     agendador continua exclusiva de `service_role`. Guarda contra a
  --     armadilha que esta própria migration quase deixou passar: o
  --     próximo renome de função cai no mesmo buraco sem isto.
  SELECT count(*), coalesce(string_agg(n.nspname||'.'||p.proname, ', '), '') INTO v_n, v_lista
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname LIKE 'aba\_%'
    AND has_function_privilege('public', p.oid, 'EXECUTE');
  IF v_n > 0 THEN
    RAISE EXCEPTION '044 (f): % funcao(oes) de modulo executavel(is) por PUBLIC: %', v_n, v_lista;
  END IF;

  IF has_function_privilege('authenticated', 'aba_finance.expirar_pacotes()', 'EXECUTE') THEN
    RAISE EXCEPTION '044 (f): expirar_pacotes voltou a ser executavel por authenticated — e rotina de agendador';
  END IF;

  RAISE NOTICE '044: verificacao completa — 6 de 6 perguntas respondidas certo';
END $$;
