-- =====================================================================
-- 050 — Preço por grupo de pacientes: o degrau que o convênio vai usar
--       (Subetapa 03.8.d)
--
-- Decisão **D-F5** de Max (2026-09-10): *"embora os convênios sejam
-- tratados fora do MVP, já podemos deixar o mecanismo do orçamento pronto
-- para recebê-los."*
--
-- ============================================================
-- O QUE ESTA MIGRATION CORRIGE, E POR QUE AGORA É BARATO
-- ============================================================
-- `docs/02_MODELO_DE_DADOS.md` §13.4 reservou o degrau **Paciente** para
-- receber o convênio quando ele existisse (D-V5). A reserva estava no
-- degrau errado, e isso só apareceu quando Max tentou encaixar casos reais
-- nos cinco degraus (`docs/08_CAMINHO_FELIZ.md` §5): **convênio é preço de
-- GRUPO**. É a apólice que negocia, não cada paciente. Amarrá-lo ao degrau
-- individual exigiria uma tabela de preço por conveniado — 40, 400 ou
-- 4.000 linhas dizendo a mesma coisa, e nenhuma delas sabendo que são a
-- mesma regra.
--
-- Corrigir com o convênio ainda no papel custa esta migration. Corrigir
-- depois de existir tabela de apólice custaria migração de dado.
--
-- **NENHUMA LINHA DE CONVÊNIO SE CRIA AQUI** (`CLAUDE.md` §15, D-V5):
-- nem operadora, nem apólice, nem carência, nem cobertura, nem
-- elegibilidade. O que nasce é o **lugar onde eles vão encaixar** — e ele
-- serve desde já para o que a clínica faz hoje à mão: promoção do mês,
-- convênio de empresa, tabela de servidor público.
--
-- ============================================================
-- A ESCADA GANHA UM DEGRAU, NA POSIÇÃO 2
-- ============================================================
--   1. Paciente             ← cortesia, acordo pontual
--   2. Grupo de pacientes   ← NOVO: convênio, promoção, categoria
--   3. Tipo de profissional
--   4. Clínica
--   5. Rede                 ← era `grupo`; ver o renome abaixo
--   6. Prática
--   9. Catálogo (`preco_base`, último recurso)
--
-- **POR QUE A CORTESIA VENCE O CONVÊNIO** (decisão de Max): o preço
-- pessoal é a regra mais específica que existe. Se a clínica abriu exceção
-- para o José, ela vale mesmo que ele seja conveniado — e é o gesto mais
-- deliberado que a recepção faz, o que menos pode se perder por acidente.
--
-- **POR QUE O CONVÊNIO VENCE O TIPO DE PROFISSIONAL:** a apólice fecha
-- tabela por procedimento. Cobrar mais dela porque quem atendeu era
-- especialista é glosa na certa. Quando a clínica quiser cobrar a
-- diferença do especialista, ela entra como **ajuste contratual fora da
-- escada** — lançamento nomeado e reportável, que é exatamente o que a
-- D-V5 já previa (`docs/02` §11.2).
--
-- ============================================================
-- `grupo` → `rede`: UMA PALAVRA, UM DONO (D-V1)
-- ============================================================
-- `escopo` já usava `'grupo'` com o sentido de **grupo de clínicas**.
-- Acrescentar *grupo de pacientes* daria dois donos à mesma palavra dentro
-- do mesmo CHECK — que é literalmente o defeito que a D-V1 existiu para
-- corrigir, quando "plano" tinha quatro donos no produto.
--
-- **MEDIDO ANTES DE DECIDIR** (`CLAUDE.md` §11), nos dois bancos:
-- `aba_finance.tabelas_preco` não tem nenhuma linha com `escopo = 'grupo'`
-- e `aba_finance.itens_orcamento` não tem nenhuma com `degrau = 'grupo'`
-- — em produção há 2 tabelas (`pratica`) e 3 itens (`catalogo`,
-- `pratica`). O renome não migra dado nenhum hoje; a conversão por NOME
-- fica escrita mesmo assim, porque a próxima execução (CRM-filho, banco de
-- teste recriado) pode ter linhas.
--
-- **A conversão é por NOME, nunca por posição.** Orçamento congelado
-- guarda o degrau com que nasceu, e a renumeração da escada não pode
-- reescrever a proveniência de um valor já acordado — é a mesma regra que
-- a `048` fixou para a tarifa comprometida.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §1 — A entidade grupo
--
-- POR QUE EM `aba_finance` E NÃO EM `aba_people`, e a razão é a de sempre
-- neste projeto: o gatilho é **preço**, e hoje o preço é o único
-- consumidor. Um "grupo de pessoas" em `aba_people` seria um conceito
-- compartilhado com um consumidor só — a mesma classe de defeito que a
-- 03.6.a pagou com `area_aplicavel` × `unidade_lancamento`. Se a **03.18**
-- precisar do mesmo agrupamento para campanhas, ela promove a entidade
-- para onde as duas alcancem; promover depois é barato, desfazer um
-- conceito com dois donos não é.
--
-- `prioridade` NÃO É ZELO, É DINHEIRO. Um paciente em dois grupos
-- vigentes com preços diferentes é situação comum, não exceção — o
-- convênio e a promoção do mês. Sem prioridade, o desempate cairia no
-- "comprometida mais recente" da `048`, e isso seria uma decisão
-- silenciosa sobre valor. Menor prioridade vence; o empate cai no
-- desempate temporal, que continua determinístico.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aba_finance.grupos_preco (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  descricao     TEXT,
  -- Menor vence. O padrão 100 deixa espaço para pôr algo acima sem
  -- renumerar o que já existe.
  prioridade    SMALLINT NOT NULL DEFAULT 100,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, account_id),
  UNIQUE (account_id, nome),
  CONSTRAINT grupos_preco_prioridade_valida CHECK (prioridade BETWEEN 1 AND 999)
);
CREATE INDEX IF NOT EXISTS idx_grupos_preco_conta
  ON aba_finance.grupos_preco(account_id, prioridade);

DROP TRIGGER IF EXISTS set_updated_at ON aba_finance.grupos_preco;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_finance.grupos_preco
  FOR EACH ROW EXECUTE FUNCTION aba_finance.set_updated_at();

-- A junção é N:N de propósito: o paciente do convênio também entra na
-- promoção do mês, e as duas regras coexistem — quem decide qual vale é a
-- prioridade, não a exclusividade do vínculo.
CREATE TABLE IF NOT EXISTS aba_finance.clientes_grupo_preco (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  grupo_id    UUID NOT NULL,
  cliente_id  UUID NOT NULL,
  incluido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  incluido_por UUID,
  UNIQUE (id, account_id),
  UNIQUE (grupo_id, cliente_id),
  CONSTRAINT clientes_grupo_preco_grupo_fk
    FOREIGN KEY (grupo_id, account_id)
    REFERENCES aba_finance.grupos_preco(id, account_id) ON DELETE CASCADE,
  CONSTRAINT clientes_grupo_preco_cliente_fk
    FOREIGN KEY (cliente_id, account_id)
    REFERENCES aba_people.clientes(id, account_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_clientes_grupo_preco_cliente
  ON aba_finance.clientes_grupo_preco(account_id, cliente_id);

COMMENT ON TABLE aba_finance.grupos_preco IS
  'Agrupamento de clientes com preco proprio: convenio, promocao, categoria. Mora em aba_finance porque o gatilho e preco e hoje o preco e o unico consumidor. NAO e o convenio em si (D-V5) — e o lugar onde ele vai encaixar.';
COMMENT ON COLUMN aba_finance.grupos_preco.prioridade IS
  'Menor vence quando o paciente esta em mais de um grupo vigente. Empate cai no desempate temporal da 048. Sem isto, dois grupos com precos diferentes decidiriam por acidente.';

-- ---------------------------------------------------------------------
-- §2 — O renome `grupo` → `rede`, e o degrau novo
--
-- A ordem importa: os CHECKs saem, os dados se convertem POR NOME, os
-- CHECKs voltam com o vocabulário novo. Fazer o contrário barraria a
-- própria conversão.
--
-- O CHECK é buscado POR CATÁLOGO, nunca pelo nome ou pelo texto:
-- `pg_get_constraintdef()` reescreve `CHECK (col IN (...))` como
-- `= ANY (ARRAY[...])` (`instrucoes.md` §5).
-- ---------------------------------------------------------------------
ALTER TABLE aba_finance.tabelas_preco
  ADD COLUMN IF NOT EXISTS grupo_preco_id UUID;

DO $$
DECLARE
  v_nome TEXT;
BEGIN
  -- (a) fora os CHECKs que travam a conversão
  FOR v_nome IN
    SELECT con.conname FROM pg_constraint con
    WHERE con.conrelid = 'aba_finance.tabelas_preco'::regclass
      AND con.contype = 'c'
      AND (con.conname = 'tabelas_preco_escopo_valido'
           OR con.conname = 'tabelas_preco_discriminador_do_escopo')
  LOOP
    EXECUTE format('ALTER TABLE aba_finance.tabelas_preco DROP CONSTRAINT %I', v_nome);
  END LOOP;

  FOR v_nome IN
    SELECT con.conname FROM pg_constraint con
    WHERE con.conrelid = 'aba_finance.itens_orcamento'::regclass
      AND con.contype = 'c'
      AND con.conname IN ('itens_orcamento_degrau_valido', 'itens_orcamento_proveniencia_coerente')
  LOOP
    EXECUTE format('ALTER TABLE aba_finance.itens_orcamento DROP CONSTRAINT %I', v_nome);
  END LOOP;

  -- (b) conversão POR NOME. Zero linhas hoje nos dois bancos — escrito
  -- assim mesmo porque a próxima execução (CRM-filho, banco recriado do
  -- zero) pode ter linhas, e porque converter por posição reescreveria a
  -- proveniência de valor já acordado.
  UPDATE aba_finance.tabelas_preco SET escopo = 'rede' WHERE escopo = 'grupo';
  UPDATE aba_finance.itens_orcamento SET degrau = 'rede' WHERE degrau = 'grupo';
END $$;

ALTER TABLE aba_finance.tabelas_preco
  ADD CONSTRAINT tabelas_preco_escopo_valido
  CHECK (escopo IN ('paciente','grupo_paciente','tipo_profissional','clinica','rede','pratica'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'aba_finance.tabelas_preco'::regclass
      AND conname = 'tabelas_preco_grupo_fk'
  ) THEN
    ALTER TABLE aba_finance.tabelas_preco
      ADD CONSTRAINT tabelas_preco_grupo_fk
      FOREIGN KEY (grupo_preco_id, account_id)
      REFERENCES aba_finance.grupos_preco(id, account_id) ON DELETE CASCADE;
  END IF;
END $$;

-- O arco exclusivo ganha o terceiro braço: exatamente um discriminador
-- preenchido, e só no escopo que o admite.
ALTER TABLE aba_finance.tabelas_preco
  ADD CONSTRAINT tabelas_preco_discriminador_do_escopo
  CHECK (
    (escopo = 'paciente'          AND cliente_id IS NOT NULL AND tipo_profissional_id IS NULL AND grupo_preco_id IS NULL)
    OR (escopo = 'grupo_paciente'    AND grupo_preco_id IS NOT NULL AND cliente_id IS NULL AND tipo_profissional_id IS NULL)
    OR (escopo = 'tipo_profissional' AND tipo_profissional_id IS NOT NULL AND cliente_id IS NULL AND grupo_preco_id IS NULL)
    OR (escopo IN ('clinica','rede','pratica') AND cliente_id IS NULL AND tipo_profissional_id IS NULL AND grupo_preco_id IS NULL)
  );

ALTER TABLE aba_finance.itens_orcamento
  ADD CONSTRAINT itens_orcamento_degrau_valido
  CHECK (degrau IN ('paciente','grupo_paciente','tipo_profissional','clinica','rede','pratica','catalogo'));

ALTER TABLE aba_finance.itens_orcamento
  ADD CONSTRAINT itens_orcamento_proveniencia_coerente
  CHECK ((degrau = 'catalogo') = (tabela_preco_id IS NULL));

CREATE INDEX IF NOT EXISTS idx_tabelas_preco_grupo
  ON aba_finance.tabelas_preco(grupo_preco_id) WHERE grupo_preco_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- §3 — A escada, com o degrau novo
--
-- `CREATE OR REPLACE` mantém a assinatura — e a assinatura continua **sem
-- parâmetro de tabela de preço**, que é o contrato da 03.8.a: o preço se
-- resolve, não se escolhe. A verificação (g) da `048` continua valendo e é
-- reafirmada na §6 desta migration.
--
-- O grupo entra como grau 2 e os demais deslocam. **O `catalogo` fica em
-- 9** de propósito, com folga entre ele e o último degrau configurável:
-- degrau novo no meio não obriga a renumerar o fundo da escada.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_finance.resolver_preco(
  p_procedimento_id UUID,
  p_cliente_id      UUID DEFAULT NULL,
  p_profissional_id UUID DEFAULT NULL,
  p_data            DATE DEFAULT NULL
) RETURNS TABLE (
  valor           NUMERIC,
  tabela_preco_id UUID,
  tabela_nome     TEXT,
  degrau          TEXT,
  grau            SMALLINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
  v_tipo_id    UUID;
  v_data       DATE := COALESCE(p_data, CURRENT_DATE);
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid();
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  -- O procedimento tem de ser da conta de quem pergunta. Sem esta linha,
  -- `SECURITY DEFINER` responderia o preço de qualquer conta a quem
  -- soubesse um UUID.
  IF NOT EXISTS (
    SELECT 1 FROM aba_catalog.procedimentos pc
    WHERE pc.id = p_procedimento_id AND pc.account_id = v_account_id
  ) THEN
    RETURN;
  END IF;

  SELECT pr.tipo_profissional_id INTO v_tipo_id
  FROM aba_scheduling.profissionais pr
  WHERE pr.id = p_profissional_id AND pr.account_id = v_account_id;

  RETURN QUERY
  WITH candidatas AS (
    SELECT
      t.valor         AS c_valor,
      tp.id           AS c_tabela_id,
      tp.nome         AS c_tabela_nome,
      tp.escopo       AS c_escopo,
      tp.vigente_de   AS c_vigente_de,
      tp.comprometida_em AS c_comprometida_em,
      (CASE tp.escopo
        WHEN 'paciente'          THEN 1
        WHEN 'grupo_paciente'    THEN 2
        WHEN 'tipo_profissional' THEN 3
        WHEN 'clinica'           THEN 4
        WHEN 'rede'              THEN 5
        WHEN 'pratica'           THEN 6
      END)::SMALLINT AS c_grau,
      -- Prioridade do grupo. Só o degrau 2 a tem; os outros entram com o
      -- mesmo valor para não alterar a ordenação deles entre si.
      COALESCE(gp.prioridade, 0)::SMALLINT AS c_prioridade
    FROM aba_finance.tarifas t
    JOIN aba_finance.tabelas_preco tp
      ON tp.id = t.tabela_preco_id AND tp.account_id = t.account_id
    LEFT JOIN aba_finance.grupos_preco gp
      ON gp.id = tp.grupo_preco_id AND gp.account_id = tp.account_id
    WHERE t.account_id = v_account_id
      AND t.procedimento_id = p_procedimento_id
      AND tp.estado = 'comprometida'
      AND tp.vigente_de <= v_data
      AND (tp.vigente_ate IS NULL OR tp.vigente_ate >= v_data)
      AND (
        -- O degrau só se aplica quando o discriminador dele bate. Sem o
        -- paciente na chamada, os degraus 1 e 2 somem da escada — e é
        -- assim que tem de ser: preço pessoal de um paciente não pode
        -- resolver o preço de outro, e nem o do grupo dele.
        (tp.escopo = 'paciente' AND p_cliente_id IS NOT NULL AND tp.cliente_id = p_cliente_id)
        OR (tp.escopo = 'grupo_paciente' AND p_cliente_id IS NOT NULL
            AND gp.ativo
            AND EXISTS (
              SELECT 1 FROM aba_finance.clientes_grupo_preco cg
              WHERE cg.grupo_id = tp.grupo_preco_id
                AND cg.cliente_id = p_cliente_id
                AND cg.account_id = v_account_id))
        OR (tp.escopo = 'tipo_profissional' AND v_tipo_id IS NOT NULL AND tp.tipo_profissional_id = v_tipo_id)
        OR tp.escopo IN ('clinica','rede','pratica')
      )
  )
  SELECT c.c_valor, c.c_tabela_id, c.c_tabela_nome, c.c_escopo, c.c_grau
  FROM candidatas c
  -- Degrau primeiro; dentro do degrau 2, a PRIORIDADE do grupo; e só
  -- então o desempate temporal da 048, que continua garantindo ordem
  -- total — sem ela, o preço mudaria entre duas execuções da mesma
  -- consulta, que é a pior classe de defeito num número que vira contrato.
  ORDER BY c.c_grau, c.c_prioridade, c.c_vigente_de DESC, c.c_comprometida_em DESC, c.c_tabela_id
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT pc.preco_base, NULL::UUID, NULL::TEXT, 'catalogo'::TEXT, 9::SMALLINT
  FROM aba_catalog.procedimentos pc
  WHERE pc.id = p_procedimento_id AND pc.account_id = v_account_id;
END;
$$;

COMMENT ON FUNCTION aba_finance.resolver_preco(UUID, UUID, UUID, DATE) IS
  'A escada: Paciente > Grupo de pacientes > Tipo de profissional > Clinica > Rede > Pratica, com preco_base do catalogo como ultimo recurso. NAO recebe tabela de preco por parametro — o preco se resolve, nao se escolhe. Dentro do degrau de grupo, decide a prioridade do grupo.';

ALTER FUNCTION aba_finance.resolver_preco(UUID, UUID, UUID, DATE) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.resolver_preco(UUID, UUID, UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.resolver_preco(UUID, UUID, UUID, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.resolver_preco(UUID, UUID, UUID, DATE) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §4 — RLS e GRANTs
--
-- Mesma alçada das tabelas de preço (`048` §10): quem define grupo define,
-- na prática, quanto a clínica cobra de um conjunto de pacientes — é
-- trabalho de `admin`, não de `agent`.
-- ---------------------------------------------------------------------
ALTER TABLE aba_finance.grupos_preco         ENABLE ROW LEVEL SECURITY;
ALTER TABLE aba_finance.clientes_grupo_preco ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grupos_preco_select ON aba_finance.grupos_preco;
CREATE POLICY grupos_preco_select ON aba_finance.grupos_preco FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('finance', 'read'));
DROP POLICY IF EXISTS grupos_preco_insert ON aba_finance.grupos_preco;
CREATE POLICY grupos_preco_insert ON aba_finance.grupos_preco FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin') AND access.can('finance', 'create'));
DROP POLICY IF EXISTS grupos_preco_update ON aba_finance.grupos_preco;
CREATE POLICY grupos_preco_update ON aba_finance.grupos_preco FOR UPDATE
  USING (public.is_account_member(account_id, 'admin') AND access.can('finance', 'update'))
  WITH CHECK (public.is_account_member(account_id, 'admin') AND access.can('finance', 'update'));
DROP POLICY IF EXISTS grupos_preco_delete ON aba_finance.grupos_preco;
CREATE POLICY grupos_preco_delete ON aba_finance.grupos_preco FOR DELETE
  USING (public.is_account_member(account_id, 'admin') AND access.can('finance', 'delete'));

DROP POLICY IF EXISTS clientes_grupo_preco_select ON aba_finance.clientes_grupo_preco;
CREATE POLICY clientes_grupo_preco_select ON aba_finance.clientes_grupo_preco FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('finance', 'read'));
DROP POLICY IF EXISTS clientes_grupo_preco_insert ON aba_finance.clientes_grupo_preco;
CREATE POLICY clientes_grupo_preco_insert ON aba_finance.clientes_grupo_preco FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin') AND access.can('finance', 'create'));
DROP POLICY IF EXISTS clientes_grupo_preco_delete ON aba_finance.clientes_grupo_preco;
CREATE POLICY clientes_grupo_preco_delete ON aba_finance.clientes_grupo_preco FOR DELETE
  USING (public.is_account_member(account_id, 'admin') AND access.can('finance', 'delete'));

GRANT SELECT, INSERT, UPDATE, DELETE ON aba_finance.grupos_preco         TO authenticated, service_role;
GRANT SELECT, INSERT, DELETE         ON aba_finance.clientes_grupo_preco TO authenticated, service_role;

REVOKE ALL ON aba_finance.grupos_preco         FROM PUBLIC;
REVOKE ALL ON aba_finance.clientes_grupo_preco FROM PUBLIC;
REVOKE ALL ON aba_finance.grupos_preco         FROM anon;
REVOKE ALL ON aba_finance.clientes_grupo_preco FROM anon;

-- ---------------------------------------------------------------------
-- §5 — Quem carimba a inclusão
--
-- Pôr um paciente num grupo muda o preço que ele paga. É ato atribuível,
-- pela mesma razão que comprometer tabela é (`048` §4) — e a lição da 03.8
-- vale igual: função que grava autoria trata `auth.uid()` NULL no topo,
-- com mensagem própria, em vez de deixar a CHECK falar por ela.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_finance.carimbar_inclusao_em_grupo()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.incluido_por IS NULL THEN
    NEW.incluido_por := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_finance.carimbar_inclusao_em_grupo() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.carimbar_inclusao_em_grupo() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.carimbar_inclusao_em_grupo() FROM anon;
REVOKE ALL ON FUNCTION aba_finance.carimbar_inclusao_em_grupo() FROM authenticated;

DROP TRIGGER IF EXISTS trg_clientes_grupo_carimbo ON aba_finance.clientes_grupo_preco;
CREATE TRIGGER trg_clientes_grupo_carimbo
  BEFORE INSERT ON aba_finance.clientes_grupo_preco
  FOR EACH ROW EXECUTE FUNCTION aba_finance.carimbar_inclusao_em_grupo();

-- ---------------------------------------------------------------------
-- §6 — VERIFICAÇÕES QUE RECUSAM A MIGRATION
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_faltando TEXT;
  v_sobra    TEXT;
  v_n        INT;
  v_tabelas  TEXT[] := ARRAY['grupos_preco','clientes_grupo_preco'];
BEGIN
  -- (a) RLS ligada e policy em toda tabela nova
  SELECT string_agg(t, ', ') INTO v_faltando
  FROM unnest(v_tabelas) AS t
  WHERE NOT (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relname = t AND n.nspname = 'aba_finance');
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'RLS não está ligada em: %', v_faltando;
  END IF;

  SELECT string_agg(t, ', ') INTO v_faltando
  FROM unnest(v_tabelas) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = t AND n.nspname = 'aba_finance');
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Tabela com RLS e sem policy: %', v_faltando;
  END IF;

  -- (b) nenhuma FK nova sem isolamento de conta
  SELECT count(*) INTO v_n FROM public.fks_sem_isolamento_de_conta();
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Há % chave(s) estrangeira(s) multi-inquilino sem account_id.', v_n;
  END IF;

  -- (c) `anon` não alcança nada; ninguém recebeu TRUNCATE
  SELECT string_agg(t, ', ') INTO v_sobra
  FROM unnest(v_tabelas) AS t
  WHERE has_table_privilege('anon', ('aba_finance.' || t)::regclass, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('authenticated', ('aba_finance.' || t)::regclass, 'TRUNCATE');
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'Privilégio indevido em: %', v_sobra;
  END IF;

  -- (d) função nova não é executável por PUBLIC/anon
  IF has_function_privilege('public', 'aba_finance.carimbar_inclusao_em_grupo()', 'EXECUTE')
     OR has_function_privilege('anon', 'aba_finance.carimbar_inclusao_em_grupo()', 'EXECUTE') THEN
    RAISE EXCEPTION 'carimbar_inclusao_em_grupo executável por PUBLIC/anon.';
  END IF;

  -- (e) O CONTRATO DA 03.8.a NÃO AFROUXOU: a assinatura continua sem
  -- parâmetro de tabela de preço. Se um degrau novo tivesse vindo com um
  -- atalho de escolha, a escada viraria sugestão.
  IF pg_get_function_identity_arguments('aba_finance.resolver_preco(uuid,uuid,uuid,date)'::regprocedure)
     ILIKE '%tabela%' THEN
    RAISE EXCEPTION 'resolver_preco ganhou parâmetro de tabela de preço — o preço voltaria a ser ESCOLHIDO.';
  END IF;

  -- (f) a palavra `grupo` não tem mais dois donos
  IF EXISTS (SELECT 1 FROM aba_finance.tabelas_preco WHERE escopo = 'grupo')
     OR EXISTS (SELECT 1 FROM aba_finance.itens_orcamento WHERE degrau = 'grupo') THEN
    RAISE EXCEPTION 'Sobrou linha com o escopo/degrau `grupo` — a conversão para `rede` não alcançou tudo.';
  END IF;

  -- (g) e o vocabulário novo é aceito pelos dois CHECKs
  BEGIN
    PERFORM 1 WHERE 'grupo_paciente' = ANY (ARRAY['paciente','grupo_paciente','tipo_profissional','clinica','rede','pratica']);
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'aba_finance.tabelas_preco'::regclass
        AND conname = 'tabelas_preco_escopo_valido'
        AND pg_get_constraintdef(oid) LIKE '%grupo_paciente%'
        AND pg_get_constraintdef(oid) LIKE '%rede%'
    ) THEN
      RAISE EXCEPTION 'O CHECK de escopo não conhece grupo_paciente e rede.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'aba_finance.itens_orcamento'::regclass
        AND conname = 'itens_orcamento_degrau_valido'
        AND pg_get_constraintdef(oid) LIKE '%grupo_paciente%'
        AND pg_get_constraintdef(oid) LIKE '%rede%'
    ) THEN
      RAISE EXCEPTION 'O CHECK de degrau do item não conhece grupo_paciente e rede.';
    END IF;
  END;

  -- (h) a ESCADA tem o grupo na posição 2, lida no corpo da função e não
  -- suposta pelo comentário
  IF pg_get_functiondef('aba_finance.resolver_preco(uuid,uuid,uuid,date)'::regprocedure)
     !~ 'WHEN ''grupo_paciente''\s+THEN 2' THEN
    RAISE EXCEPTION 'grupo_paciente não está no grau 2 da escada.';
  END IF;
END $$;
