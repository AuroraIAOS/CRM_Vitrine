-- =====================================================================
-- 035 — Chaves estrangeiras compostas por conta (Subetapa 02.15)
--
-- ACHADO QUE ORIGINOU ESTA MIGRATION (portão adversarial da Etapa 02):
-- um usuário da conta A conseguia inserir uma linha SUA (`account_id = A`,
-- portanto aceita pela RLS) apontando para uma linha da conta B. Provado
-- ao vivo em `aba_finance.pagamentos` -> fatura de outra conta,
-- `aba_people.pessoa_notas` -> pessoa de outra conta e
-- `aba_sales.oportunidades` -> funil/pessoa de outra conta.
--
-- POR QUE A RLS NÃO FECHA ISSO — e nenhuma policy jamais fecharia.
-- Documentação do PostgreSQL, "Row Security Policies":
--   "Referential integrity checks, such as unique or primary key
--    constraints and foreign key references, always bypass row security
--    to ensure that data integrity is maintained."
-- A RLS responde "esta linha é sua?". Ela NUNCA é consultada na pergunta
-- "a linha que você está apontando é sua?". A única camada que responde a
-- segunda pergunta é a própria chave estrangeira — e para isso ela precisa
-- carregar `account_id`.
--
-- O QUE MUDA: nada de coluna nova, nada de chave primária nova. As duas
-- colunas já existem em toda tabela alvo. A FK deixa de olhar só
-- `x_id` e passa a olhar `(x_id, account_id)`, contra um
-- `UNIQUE (id, account_id)` na tabela-pai. Em linguagem simples: o banco
-- deixa de perguntar "esse cliente existe?" e passa a perguntar "esse
-- cliente existe NESTA CONTA?".
--
-- A chave primária continua sendo `id` sozinha: nenhuma consulta do app,
-- nenhum `.eq("id", ...)` e nenhuma tela mudam.
--
-- DIRIGIDA POR CATÁLOGO, e não por lista escrita à mão — mesmo padrão da
-- `005_harden_function_privileges.sql`. Uma lista manual erra por omissão
-- exatamente onde dói: a FK que ninguém lembrou é a que fica aberta.
-- Idempotente: reexecutar não duplica nem quebra.
--
-- `ON DELETE SET NULL (coluna)`: 21 das 73 FKs usam SET NULL. Alargar a
-- chave sem cuidado faria o Postgres anular TAMBÉM o `account_id`, que é
-- NOT NULL — e toda exclusão de pai passaria a falhar em produção. O
-- PostgreSQL 15+ aceita restringir quais colunas são anuladas, e é o que
-- se usa aqui. Confirmado na documentação da 17, que é a versão em uso:
--   "Set all of the referencing columns, or a specified subset of the
--    referencing columns, to null."
--
-- LOCK: as tabelas deste projeto são pequenas, então o `ADD UNIQUE`
-- (ACCESS EXCLUSIVE, constrói índice) roda em milissegundos. Numa base
-- grande, o caminho é `CREATE UNIQUE INDEX CONCURRENTLY` + `ADD
-- CONSTRAINT ... USING INDEX`. As FKs entram `NOT VALID` (pula a
-- varredura, SHARE ROW EXCLUSIVE) e são validadas depois
-- (SHARE UPDATE EXCLUSIVE, não bloqueia escrita concorrente).
--
-- DADO EXISTENTE: as 73 FKs foram varridas antes desta migration
-- procurando linha já cruzada — ZERO encontradas. A falha nunca foi
-- explorada neste banco, então o VALIDATE passa sem limpeza.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASSO 1 — `UNIQUE (id, account_id)` em toda tabela-pai alvo (25).
-- Tecnicamente redundante (`id` já é único sozinho), e é assim mesmo que
-- o Postgres exige: a FK composta precisa de uma restrição única que
-- cubra exatamente as colunas referenciadas.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_nome text;
  v_criadas int := 0;
BEGIN
  FOR r IN
    WITH t AS (
      SELECT c.oid, n.nspname AS sch, c.relname AS tab
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname IN ('public','access','licensing','aba_people','aba_catalog',
                          'aba_scheduling','aba_finance','aba_health','aba_messaging',
                          'aba_sales','aba_automations','aba_ai')
        AND EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'account_id'
                      AND a.attnum > 0 AND NOT a.attisdropped)
    )
    SELECT DISTINCT d.sch, d.tab, d.oid
    FROM pg_constraint con
    JOIN t o ON o.oid = con.conrelid
    JOIN t d ON d.oid = con.confrelid
    WHERE con.contype = 'f'
      AND array_length(con.conkey, 1) = 1
      AND NOT EXISTS (SELECT 1 FROM unnest(con.conkey) k
                      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k
                      WHERE a.attname = 'account_id')
  LOOP
    v_nome := r.tab || '_id_account_id_key';

    -- já existe uma única sobre exatamente (id, account_id)?
    IF EXISTS (
      SELECT 1 FROM pg_constraint u
      WHERE u.conrelid = r.oid AND u.contype IN ('u','p')
        AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
             FROM unnest(u.conkey) k
             JOIN pg_attribute a ON a.attrelid = u.conrelid AND a.attnum = k)
            = ARRAY['account_id','id']
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I UNIQUE (id, account_id)',
                   r.sch, r.tab, v_nome);
    v_criadas := v_criadas + 1;
  END LOOP;

  RAISE NOTICE '035 passo 1: % restricoes UNIQUE (id, account_id) criadas', v_criadas;
END $$;

-- ---------------------------------------------------------------------
-- PASSO 2 — reescrever cada FK de coluna única para (coluna, account_id),
-- preservando ON DELETE / ON UPDATE. Entra `NOT VALID` para não varrer.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_trocadas int := 0;
BEGIN
  FOR r IN
    WITH t AS (
      SELECT c.oid, n.nspname AS sch, c.relname AS tab
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname IN ('public','access','licensing','aba_people','aba_catalog',
                          'aba_scheduling','aba_finance','aba_health','aba_messaging',
                          'aba_sales','aba_automations','aba_ai')
        AND EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'account_id'
                      AND a.attnum > 0 AND NOT a.attisdropped)
    )
    SELECT con.conname, o.sch AS fsch, o.tab AS ftab, d.sch AS psch, d.tab AS ptab,
           (SELECT a.attname FROM unnest(con.conkey) k
            JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k LIMIT 1) AS fcol,
           (SELECT a.attname FROM unnest(con.confkey) k
            JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k LIMIT 1) AS pcol,
           con.confdeltype, con.confupdtype
    FROM pg_constraint con
    JOIN t o ON o.oid = con.conrelid
    JOIN t d ON d.oid = con.confrelid
    WHERE con.contype = 'f'
      AND array_length(con.conkey, 1) = 1
      AND NOT EXISTS (SELECT 1 FROM unnest(con.conkey) k
                      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k
                      WHERE a.attname = 'account_id')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', r.fsch, r.ftab, r.conname);

    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I, account_id) '
      'REFERENCES %I.%I (%I, account_id)%s%s NOT VALID',
      r.fsch, r.ftab, r.conname, r.fcol, r.psch, r.ptab, r.pcol,
      CASE r.confdeltype
        WHEN 'c' THEN ' ON DELETE CASCADE'
        WHEN 'n' THEN format(' ON DELETE SET NULL (%I)', r.fcol)
        WHEN 'r' THEN ' ON DELETE RESTRICT'
        WHEN 'd' THEN format(' ON DELETE SET DEFAULT (%I)', r.fcol)
        ELSE '' END,
      CASE r.confupdtype
        WHEN 'c' THEN ' ON UPDATE CASCADE'
        WHEN 'r' THEN ' ON UPDATE RESTRICT'
        ELSE '' END
    );
    v_trocadas := v_trocadas + 1;
  END LOOP;

  RAISE NOTICE '035 passo 2: % chaves estrangeiras reescritas', v_trocadas;
END $$;

-- ---------------------------------------------------------------------
-- PASSO 3 — validar as FKs recém-criadas contra o dado existente.
-- Se alguma falhar aqui, existe linha cruzada em produção e ela precisa
-- ser tratada como incidente — não como erro de migration.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_validadas int := 0;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, c.relname AS tab, con.conname
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.contype = 'f' AND NOT con.convalidated
      AND n.nspname IN ('public','access','licensing','aba_people','aba_catalog',
                        'aba_scheduling','aba_finance','aba_health','aba_messaging',
                        'aba_sales','aba_automations','aba_ai')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I VALIDATE CONSTRAINT %I', r.sch, r.tab, r.conname);
    v_validadas := v_validadas + 1;
  END LOOP;

  RAISE NOTICE '035 passo 3: % chaves validadas contra o dado existente', v_validadas;
END $$;
