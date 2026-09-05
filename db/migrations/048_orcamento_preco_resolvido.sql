-- =====================================================================
-- 048 — Orçamento: o preço que se resolve, e a tabela que tem vigência
--       (Subetapa 03.8.a)
--
-- A 03.8 entregou o PLANO — a matriz clínica, sem preço, sem contrato,
-- sem fatura, de propósito. Esta migration entrega a metade financeira:
-- a tabela de preço como ENTIDADE COM VIGÊNCIA (item 41, que entrou no
-- MVP por D-I5) e o preço que SE RESOLVE por escada, nunca se escolhe.
--
-- "Plano" e "orçamento" são duas palavras da interface para duas coisas
-- diferentes (Max, 2026-09-04, `CLAUDE.md` §2 e `docs/02` §13.1): o
-- **plano** é o planejamento clínico — o conjunto de procedimentos a
-- executar naquele paciente —, e o **orçamento** é a vista financeira
-- dele: o preço a pagar pela execução do que foi contratado. Esta
-- migration constrói a segunda; a primeira já existe em `aba_treatment`.
--
-- ============================================================
-- AS QUATRO COISAS QUE NÃO SE NEGOCIAM NESTA SUBETAPA
-- ============================================================
--
-- 1. **REAJUSTE É TABELA NOVA, NUNCA `UPDATE` DE TARIFA COMPROMETIDA.**
--    Passado de financeiro reescrito não tem conserto retroativo: um
--    `UPDATE` no preço de ontem muda, em silêncio, o valor de um acordo
--    que já foi assinado, faturado e pago. É a razão de o item 41 ter
--    entrado no MVP agora e não depois — os outros três itens de D-I5
--    são aditivos, este é o único sem volta. A imutabilidade mora em
--    gatilho (§3), e o caminho legítimo do reajuste é `reajustar_
--    tabela_preco()` (§4), que CRIA uma tabela e copia as tarifas.
--
-- 2. **O PREÇO SE RESOLVE PELA ESCADA, E A LINHA GUARDA A PROVENIÊNCIA.**
--    `Paciente > Tipo de profissional > Clínica > Grupo > Prática`,
--    percorrida no momento do lançamento (§5). `resolver_preco()` **não
--    tem parâmetro de tabela de preço**, e essa ausência é o contrato:
--    não existe assinatura por onde a tela escolha a tabela. A linha do
--    orçamento guarda o VALOR RESOLVIDO com a tabela que o resolveu como
--    PROVENIÊNCIA (`docs/02` §11.2) — guardar a tabela como *escolha*
--    obrigaria alguém a escolhê-la na tela, que é exatamente o que a
--    escada existe para evitar.
--
-- 3. **SÓ `admin` MEXE EM DINHEIRO, E A TRAVA É DE BANCO.** Parcela,
--    desconto, juros, mora e promoção são da recepção, nunca do
--    profissional (Max, 2026-09-04). Não é detalhe de tela: é padrão de
--    qualidade do trabalho clínico, porque tira do dentista a negociação
--    de preço na cadeira. **Medido antes de escrito:** hoje as policies
--    de `contratos`, `parcelas_contrato` e `pagamentos` autorizam
--    `UPDATE` a partir de `agent` — que é o papel do profissional. A
--    policy sozinha não resolve, e a lição já está em `instrucoes.md` §5:
--    *"RLS restringe QUAIS LINHAS, nunca QUAIS COLUNAS"* e *"coluna de
--    privilégio precisa de trigger próprio mesmo quando a policy de
--    UPDATE parece restritiva"*. A trava é gatilho que compara OLD e NEW
--    coluna a coluna (§7), e ela alcança as tabelas de dinheiro que já
--    existiam, não só as novas — regra de produto não se aplica só ao
--    código escrito hoje.
--
-- 4. **TUDO EM `aba_finance` PASSA PELAS OPERAÇÕES**, nunca por `INSERT`
--    direto nas tabelas mantidas por gatilho (`011_aba_finance_
--    operations.sql`; `docs/02` §12.6). Esta migration não escreve uma
--    linha em `faturas`, `itens_fatura`, `pacotes_cliente` ou
--    `saldos_pacote` — e a verificação (k) da §11 recusa a migration se
--    alguma função nova passar a escrever. A cobrança que nasce da
--    aprovação é da **03.8.b**, junto do contrato, e é lá que a fatura
--    aparece.
--
-- ============================================================
-- P-SUB: O ORÇAMENTO PROJETA DADO CLÍNICO PARA A RECEPÇÃO LER
-- ============================================================
-- É a razão do portão desta subetapa, e a decisão de modelagem que dela
-- decorre é a mais importante do arquivo:
--
--   **`itens_orcamento` NÃO guarda `dente` nem `faces`.**
--
-- Guardar seria a saída óbvia e cômoda — a tela quer mostrar "Restauração
-- MOD no 16" —, e seria uma porta lateral para fora de `aba_health`:
-- qualquer papel com `finance.read` leria dente e face por `aba_finance`,
-- sem alcance clínico e sem deixar rastro, enquanto a migration `047`
-- acabou de revogar exatamente essas colunas em `aba_treatment`. Copiar
-- o dado para o outro lado da fronteira anula a fronteira.
--
-- O item aponta para `procedimento_plano_id`, e quem quiser ver ONDE, no
-- corpo do paciente, o trabalho acontece lê por `aba_treatment.
-- ler_planos()`, que registra. A vista financeira sai por
-- `aba_finance.ler_orcamento()` (§9), que decide pelo ALCANCE CLÍNICO DO
-- CHAMADOR o que devolve: com alcance, dente e face — e **loga**; sem
-- alcance, o mesmo orçamento com valores e o nome do procedimento, sem
-- dente e sem face, e **sem logar**, porque nada clínico foi lido.
--
-- O nome do procedimento fica dos dois lados de propósito: `aba_catalog`
-- é legível por `viewer` desde a 01.3 e `itens_fatura.descricao` já
-- carrega o que foi cobrado desde a 01.3. A fronteira que este produto
-- protege é a associação paciente × dente × face, não a existência de um
-- procedimento na conta.
--
-- ============================================================
-- DIREÇÃO DAS DEPENDÊNCIAS ENTRE SCHEMAS
-- ============================================================
-- `aba_finance` passa a depender de `aba_treatment` (o orçamento aponta
-- para o plano) e continua dependendo de `aba_scheduling` (já dependia:
-- `regras_comissao.profissional_id` e `lancamentos_comissao.
-- profissional_id`). A direção está certa e é a que `instrucoes.md` §4
-- pede: a FK sai de quem DEPENDE. `aba_treatment` não ganha nenhuma
-- chave para `aba_finance`, e por isso **o módulo clínico continua
-- exportável sozinho** para um CRM-filho que não contrate o financeiro —
-- que é a propriedade que a regra existe para preservar.
--
-- ============================================================
-- HARDENING DOBRADO DESDE A PRIMEIRA VERSÃO (`instrucoes.md` §4 e §6)
-- ============================================================
--   · `ENABLE ROW LEVEL SECURITY` explícito em cada tabela nova — o
--     event trigger da plataforma filtra `public` e não alcança `aba_*`;
--   · `GRANT` amplo ANTES de qualquer revogação por coluna;
--   · `REVOKE EXECUTE ... FROM PUBLIC` **e** `FROM anon` em toda função;
--   · toda chave estrangeira multi-inquilino COMPOSTA por `account_id` —
--     a integridade referencial ignora RLS por especificação (`035`);
--   · nenhum `TRUNCATE` concedido — ele não passa por RLS;
--   · as guardas por varredura de catálogo conferidas ANTES do primeiro
--     `CREATE TABLE`: `005_harden_function_privileges`,
--     `035_fk_compostas_por_conta` e `039_auditoria_isolamento_de_conta`
--     listam schemas por nome, e as três já trazem `aba_finance`,
--     `aba_scheduling` e `aba_treatment` — nenhum schema NOVO nasce
--     aqui, e é por isso que esta migration não precisa reescrever
--     nenhuma delas (a 03.8 precisou, e a lição está em `instrucoes.md`
--     §5, "guarda por varredura com a lista de schemas CRAVADA").
-- =====================================================================

-- ---------------------------------------------------------------------
-- §1 — Tipo de profissional: o degrau que a fonte PROVA
--
-- A prova mais forte da escada, na fonte, não é convênio — é tipo de
-- profissional: a mesma consulta custa **$250** com um profissional comum
-- e **$400** com um especialista, sem ninguém escolher nada
-- (`design/benchmark/fontes/ice.md` §5.2). É por isso que a escada NÃO
-- fica órfã com o convênio adiado por D-V5.
--
-- `aba_scheduling.profissionais` já tinha `especialidade`, e ela **não
-- serve**: é TEXT livre, sem tela e sem catálogo — nenhuma tabela de
-- preço pode pendurar uma chave estrangeira num texto que cada pessoa
-- digita como quer. O tipo é catálogo DA CONTA, mora no schema dono do
-- conceito (`aba_scheduling`, porque é atributo do profissional) e a
-- dependência corre de `aba_finance` para cá, nunca ao contrário.
--
-- `especialidade` FICA onde está, intacta: são coisas diferentes —
-- "Endodontia" é especialidade, "Especialista" é tipo, e é o tipo que
-- move o preço. Estender por adição, nunca por reescrita
-- (`instrucoes.md` §4).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aba_scheduling.tipos_profissional (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  chave         TEXT NOT NULL,
  rotulo        TEXT NOT NULL,
  ordem         SMALLINT NOT NULL DEFAULT 0,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, chave),
  UNIQUE (id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_tipos_profissional_conta
  ON aba_scheduling.tipos_profissional(account_id, ordem);

ALTER TABLE aba_scheduling.profissionais
  ADD COLUMN IF NOT EXISTS tipo_profissional_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'aba_scheduling.profissionais'::regclass
      AND conname = 'profissionais_tipo_profissional_fk'
  ) THEN
    ALTER TABLE aba_scheduling.profissionais
      ADD CONSTRAINT profissionais_tipo_profissional_fk
      FOREIGN KEY (tipo_profissional_id, account_id)
      REFERENCES aba_scheduling.tipos_profissional(id, account_id)
      ON DELETE SET NULL (tipo_profissional_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS set_updated_at ON aba_scheduling.tipos_profissional;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_scheduling.tipos_profissional
  FOR EACH ROW EXECUTE FUNCTION aba_scheduling.set_updated_at();

ALTER TABLE aba_scheduling.tipos_profissional ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tipos_profissional_select ON aba_scheduling.tipos_profissional;
CREATE POLICY tipos_profissional_select ON aba_scheduling.tipos_profissional FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('scheduling', 'read'));
-- Catálogo que MOVE PREÇO se administra com alçada de `admin`, não de
-- `agent`: quem cria o tipo "Especialista" decide, na prática, quanto
-- custa a consulta de quem for marcado com ele.
DROP POLICY IF EXISTS tipos_profissional_insert ON aba_scheduling.tipos_profissional;
CREATE POLICY tipos_profissional_insert ON aba_scheduling.tipos_profissional FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin') AND access.can('scheduling', 'create'));
DROP POLICY IF EXISTS tipos_profissional_update ON aba_scheduling.tipos_profissional;
CREATE POLICY tipos_profissional_update ON aba_scheduling.tipos_profissional FOR UPDATE
  USING (public.is_account_member(account_id, 'admin') AND access.can('scheduling', 'update'))
  WITH CHECK (public.is_account_member(account_id, 'admin') AND access.can('scheduling', 'update'));

GRANT SELECT, INSERT, UPDATE ON aba_scheduling.tipos_profissional TO authenticated, service_role;
REVOKE ALL ON aba_scheduling.tipos_profissional FROM PUBLIC;
REVOKE ALL ON aba_scheduling.tipos_profissional FROM anon;

-- Semente, no padrão de `aba_treatment.semear_fases_padrao`: dois tipos,
-- que são exatamente os dois que a fonte mede. `ON CONFLICT DO NOTHING`
-- para que renomear ou desativar sobreviva à próxima execução.
CREATE OR REPLACE FUNCTION aba_scheduling.semear_tipos_profissional(p_account_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inseridos INT;
BEGIN
  INSERT INTO aba_scheduling.tipos_profissional (account_id, chave, rotulo, ordem)
  VALUES
    (p_account_id, 'clinico_geral', 'Clínico geral', 1),
    (p_account_id, 'especialista',  'Especialista',  2)
  ON CONFLICT (account_id, chave) DO NOTHING;
  GET DIAGNOSTICS v_inseridos = ROW_COUNT;
  RETURN v_inseridos;
END;
$$;

ALTER FUNCTION aba_scheduling.semear_tipos_profissional(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_scheduling.semear_tipos_profissional(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_scheduling.semear_tipos_profissional(UUID) FROM anon;
REVOKE ALL ON FUNCTION aba_scheduling.semear_tipos_profissional(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION aba_scheduling.semear_tipos_profissional(UUID) TO service_role;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.accounts LOOP
    PERFORM aba_scheduling.semear_tipos_profissional(r.id);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- §2 — A tabela de preço como ENTIDADE COM VIGÊNCIA (item 41)
--
-- Três estados, e cada transição significa uma coisa diferente:
--
--   · `rascunho`     — editável à vontade. Ninguém acordou nada ainda.
--   · `comprometida` — tem data de início e **tarifa imutável**. É a
--     única que a escada enxerga.
--   · `encerrada`    — foi substituída por outra. Continua existindo,
--     porque é a proveniência de todo valor congelado no passado.
--
-- POR QUE OS DEGRAUS `clinica` E `grupo` NASCEM SEM DISCRIMINADOR, e
-- isso é decisão, não esquecimento: multiunidade é a **Subetapa 03.9**, e
-- não existe hoje tabela de unidade nem de grupo para uma chave apontar.
-- Inventar aqui a tabela que a 03.9 vai desenhar é o defeito que a 03.6.a
-- pagou com `area_aplicavel` × `unidade_lancamento` — a mesma informação
-- com dois donos. Os dois degraus existem desde já na ESCADA e distinguem
-- pela PRECEDÊNCIA, que é útil hoje mesmo: uma clínica pode ter a tabela
-- "Clínica" acima da tabela "Prática" (a herdada, o padrão da rede). A
-- 03.9 acrescenta a coluna de unidade e o filtro **por adição**, sem
-- reescrever a escada.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aba_finance.tabelas_preco (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  nome                 TEXT NOT NULL,
  escopo               TEXT NOT NULL DEFAULT 'pratica',
  -- Discriminadores do escopo: exatamente um preenchido, e só no escopo
  -- que o admite. Arco exclusivo, no padrão de D-V3 — nunca uma coluna
  -- `alvo_id` polimórfica, que `public.fks_sem_isolamento_de_conta()`
  -- não conseguiria enxergar (`docs/02` §13.2).
  cliente_id           UUID,
  tipo_profissional_id UUID,
  estado               TEXT NOT NULL DEFAULT 'rascunho',
  vigente_de           DATE,
  vigente_ate          DATE,
  comprometida_em      TIMESTAMPTZ,
  comprometida_por     UUID,
  -- A tabela que esta reajustou. É a cadeia de proveniência do reajuste:
  -- sem ela, "de onde veio este preço novo?" não tem resposta no banco.
  substitui_id         UUID,
  criado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, account_id),
  CONSTRAINT tabelas_preco_cliente_fk
    FOREIGN KEY (cliente_id, account_id)
    REFERENCES aba_people.clientes(id, account_id) ON DELETE CASCADE,
  CONSTRAINT tabelas_preco_tipo_fk
    FOREIGN KEY (tipo_profissional_id, account_id)
    REFERENCES aba_scheduling.tipos_profissional(id, account_id) ON DELETE CASCADE,
  CONSTRAINT tabelas_preco_substitui_fk
    FOREIGN KEY (substitui_id, account_id)
    REFERENCES aba_finance.tabelas_preco(id, account_id) ON DELETE SET NULL (substitui_id),
  CONSTRAINT tabelas_preco_escopo_valido
    CHECK (escopo IN ('paciente','tipo_profissional','clinica','grupo','pratica')),
  CONSTRAINT tabelas_preco_estado_valido
    CHECK (estado IN ('rascunho','comprometida','encerrada')),
  CONSTRAINT tabelas_preco_discriminador_do_escopo
    CHECK (
      (escopo = 'paciente'          AND cliente_id IS NOT NULL AND tipo_profissional_id IS NULL)
      OR (escopo = 'tipo_profissional' AND tipo_profissional_id IS NOT NULL AND cliente_id IS NULL)
      OR (escopo IN ('clinica','grupo','pratica') AND cliente_id IS NULL AND tipo_profissional_id IS NULL)
    ),
  -- Comprometida sem data de início não entra em escada nenhuma: a
  -- escada compara `vigente_de <= data <= vigente_ate`, e NULL faria a
  -- linha sumir da comparação sem erro. Fail-closed silencioso é o que
  -- este CHECK impede.
  CONSTRAINT tabelas_preco_comprometida_tem_data
    CHECK (estado = 'rascunho' OR (vigente_de IS NOT NULL AND comprometida_em IS NOT NULL AND comprometida_por IS NOT NULL)),
  CONSTRAINT tabelas_preco_janela_coerente
    CHECK (vigente_ate IS NULL OR vigente_de IS NULL OR vigente_ate >= vigente_de)
);
CREATE INDEX IF NOT EXISTS idx_tabelas_preco_escada
  ON aba_finance.tabelas_preco(account_id, escopo, estado, vigente_de);

DROP TRIGGER IF EXISTS set_updated_at ON aba_finance.tabelas_preco;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_finance.tabelas_preco
  FOR EACH ROW EXECUTE FUNCTION aba_finance.set_updated_at();

-- ---------------------------------------------------------------------
-- §3 — A tarifa, e a imutabilidade do que foi comprometido
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aba_finance.tarifas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  tabela_preco_id  UUID NOT NULL,
  procedimento_id  UUID NOT NULL,
  valor            NUMERIC(12,2) NOT NULL,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, account_id),
  UNIQUE (tabela_preco_id, procedimento_id),
  CONSTRAINT tarifas_tabela_fk
    FOREIGN KEY (tabela_preco_id, account_id)
    REFERENCES aba_finance.tabelas_preco(id, account_id) ON DELETE CASCADE,
  CONSTRAINT tarifas_procedimento_fk
    FOREIGN KEY (procedimento_id, account_id)
    REFERENCES aba_catalog.procedimentos(id, account_id),
  CONSTRAINT tarifas_valor_nao_negativo CHECK (valor >= 0)
);
CREATE INDEX IF NOT EXISTS idx_tarifas_tabela ON aba_finance.tarifas(tabela_preco_id);
CREATE INDEX IF NOT EXISTS idx_tarifas_procedimento ON aba_finance.tarifas(account_id, procedimento_id);

DROP TRIGGER IF EXISTS set_updated_at ON aba_finance.tarifas;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_finance.tarifas
  FOR EACH ROW EXECUTE FUNCTION aba_finance.set_updated_at();

-- ============================================================
-- TARIFA COMPROMETIDA É IMUTÁVEL, E A REGRA MORA AQUI
--
-- Não em policy: policy decide QUAIS LINHAS, e aqui a pergunta é sobre a
-- linha que a pessoa já pode tocar (`instrucoes.md` §5). Não em `CHECK`:
-- CHECK não enxerga a tabela-mãe. Gatilho `BEFORE`, que recusa antes de
-- qualquer coisa acontecer.
--
-- `DELETE` entra na mesma trava, e é a metade que se esquece: apagar a
-- tarifa de uma tabela comprometida tem o mesmo efeito de reescrever o
-- passado — o valor some, a resolução seguinte cai para o degrau abaixo,
-- e nada fica vermelho.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_finance.conferir_tarifa_imutavel()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_estado TEXT;
  v_ref    UUID := COALESCE(NEW.tabela_preco_id, OLD.tabela_preco_id);
BEGIN
  SELECT estado INTO v_estado FROM aba_finance.tabelas_preco WHERE id = v_ref;

  IF v_estado IS DISTINCT FROM 'rascunho' THEN
    RAISE EXCEPTION 'Tarifa de tabela % não se altera: reajuste é TABELA NOVA (aba_finance.reajustar_tabela_preco), nunca UPDATE — senão o passado do financeiro se reescreve.',
      COALESCE(v_estado, 'inexistente') USING ERRCODE = '23514';
  END IF;

  -- Mudar a tarifa de tabela não é caminho legítimo por nenhum motivo:
  -- seria mover uma linha de uma tabela de preço para outra, e a de
  -- destino pode estar comprometida.
  IF TG_OP = 'UPDATE' AND NEW.tabela_preco_id IS DISTINCT FROM OLD.tabela_preco_id THEN
    RAISE EXCEPTION 'Tarifa não muda de tabela de preço.' USING ERRCODE = '23514';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

ALTER FUNCTION aba_finance.conferir_tarifa_imutavel() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.conferir_tarifa_imutavel() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.conferir_tarifa_imutavel() FROM anon;
REVOKE ALL ON FUNCTION aba_finance.conferir_tarifa_imutavel() FROM authenticated;

DROP TRIGGER IF EXISTS trg_tarifas_imutaveis ON aba_finance.tarifas;
CREATE TRIGGER trg_tarifas_imutaveis
  BEFORE INSERT OR UPDATE OR DELETE ON aba_finance.tarifas
  FOR EACH ROW EXECUTE FUNCTION aba_finance.conferir_tarifa_imutavel();

-- ============================================================
-- E A PRÓPRIA TABELA DE PREÇO TAMBÉM CONGELA
--
-- Trancar só a tarifa deixaria a porta aberta do outro lado: mudar
-- `escopo` ou `vigente_de` de uma tabela comprometida move o preço de
-- lugar na escada sem tocar em nenhum valor. O efeito é o mesmo — acordo
-- do passado resolvido de outro jeito hoje —, e não haveria erro nenhum.
--
-- O que continua editável depois de comprometida, e por quê: `nome` (é
-- rótulo, não regra) e `vigente_ate` (é justamente o que o reajuste
-- carimba ao encerrar a anterior). Voltar de `comprometida` para
-- `rascunho` não existe.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_finance.conferir_tabela_preco_congelada()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.estado = 'rascunho' THEN
    RETURN NEW;
  END IF;

  IF NEW.estado = 'rascunho' THEN
    RAISE EXCEPTION 'Tabela de preço comprometida não volta a rascunho — o compromisso é o que dá valor ao que já foi acordado.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.escopo IS DISTINCT FROM OLD.escopo
     OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
     OR NEW.tipo_profissional_id IS DISTINCT FROM OLD.tipo_profissional_id
     OR NEW.vigente_de IS DISTINCT FROM OLD.vigente_de
     OR NEW.substitui_id IS DISTINCT FROM OLD.substitui_id THEN
    RAISE EXCEPTION 'Tabela de preço comprometida não muda de escopo nem de início de vigência — mover o degrau reescreve o passado sem tocar em valor nenhum.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_finance.conferir_tabela_preco_congelada() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.conferir_tabela_preco_congelada() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.conferir_tabela_preco_congelada() FROM anon;
REVOKE ALL ON FUNCTION aba_finance.conferir_tabela_preco_congelada() FROM authenticated;

DROP TRIGGER IF EXISTS trg_tabelas_preco_congeladas ON aba_finance.tabelas_preco;
CREATE TRIGGER trg_tabelas_preco_congeladas
  BEFORE UPDATE ON aba_finance.tabelas_preco
  FOR EACH ROW EXECUTE FUNCTION aba_finance.conferir_tabela_preco_congelada();

-- Apagar tabela comprometida é o mesmo furo pela porta dos fundos.
CREATE OR REPLACE FUNCTION aba_finance.conferir_tabela_preco_apagavel()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.estado <> 'rascunho' THEN
    RAISE EXCEPTION 'Tabela de preço % não se apaga — ela é a proveniência de todo valor que resolveu.', OLD.estado
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

ALTER FUNCTION aba_finance.conferir_tabela_preco_apagavel() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.conferir_tabela_preco_apagavel() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.conferir_tabela_preco_apagavel() FROM anon;
REVOKE ALL ON FUNCTION aba_finance.conferir_tabela_preco_apagavel() FROM authenticated;

DROP TRIGGER IF EXISTS trg_tabelas_preco_apagaveis ON aba_finance.tabelas_preco;
CREATE TRIGGER trg_tabelas_preco_apagaveis
  BEFORE DELETE ON aba_finance.tabelas_preco
  FOR EACH ROW EXECUTE FUNCTION aba_finance.conferir_tabela_preco_apagavel();

-- ---------------------------------------------------------------------
-- §4 — Comprometer e reajustar: o caminho legítimo do preço novo
--
-- REAJUSTE É TABELA NOVA. `reajustar_tabela_preco()` não recebe valor
-- nenhum da tabela de origem: ela CRIA uma tabela em `rascunho`, copia as
-- tarifas com o percentual aplicado e aponta `substitui_id` para a
-- anterior. Quem troca de fato é `comprometer_tabela_preco()` da nova,
-- que carimba `vigente_ate` da substituída — e **nenhum valor já
-- congelado num orçamento muda**, porque o valor acordado mora na linha
-- do orçamento, não na tarifa.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_finance.comprometer_tabela_preco(
  p_tabela_id UUID,
  p_vigente_de DATE DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_ator    UUID := auth.uid();
  v_tab     RECORD;
  v_tarifas INT;
  v_de      DATE := COALESCE(p_vigente_de, CURRENT_DATE);
BEGIN
  -- Comprometer é ato datado e atribuível: sem sessão não há autor, e a
  -- CHECK `tabelas_preco_comprometida_tem_data` barraria com uma mensagem
  -- que não explica nada. A lição é da 03.8 (`instrucoes.md` §5,
  -- `consentir_opcao`): função que grava autoria trata `auth.uid()` NULL
  -- no topo, com mensagem própria.
  IF v_ator IS NULL THEN
    RAISE EXCEPTION 'Comprometer uma tabela de preço exige sessão autenticada — o compromisso precisa de autor e data.'
      USING ERRCODE = '42501';
  END IF;

  SELECT t.id, t.account_id, t.estado, t.escopo, t.substitui_id
    INTO v_tab
  FROM aba_finance.tabelas_preco t WHERE t.id = p_tabela_id;

  IF v_tab.id IS NULL THEN
    RAISE EXCEPTION 'Tabela de preço % não existe ou não está ao seu alcance.', p_tabela_id
      USING ERRCODE = '42501';
  END IF;

  IF v_tab.estado <> 'rascunho' THEN
    RAISE EXCEPTION 'Só tabela em rascunho se compromete; esta está %.', v_tab.estado
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_tarifas FROM aba_finance.tarifas WHERE tabela_preco_id = p_tabela_id;
  IF v_tarifas = 0 THEN
    RAISE EXCEPTION 'Tabela de preço sem nenhuma tarifa não se compromete — ela entraria na escada e não resolveria nada.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE aba_finance.tabelas_preco
     SET estado = 'comprometida',
         vigente_de = v_de,
         comprometida_em = NOW(),
         comprometida_por = v_ator
   WHERE id = p_tabela_id;

  -- A substituída encerra na VÉSPERA da entrada da nova. Um dia de
  -- sobreposição faria duas tabelas do mesmo degrau vigentes ao mesmo
  -- tempo — resolúvel pelo desempate da §5, mas por acidente e não por
  -- desenho.
  --
  -- `GREATEST` COM O PRÓPRIO INÍCIO, e este caso foi MEDIDO, não
  -- imaginado: comprometer hoje, perceber o erro e reajustar hoje mesmo
  -- daria `vigente_ate = ontem` numa tabela que começou hoje, e o CHECK
  -- `tabelas_preco_janela_coerente` barraria o reajuste com uma mensagem
  -- que não explica nada. Com o piso, a substituída vale exatamente o dia
  -- em que entrou, as duas ficam vigentes nesse único dia — e é para
  -- isso que o desempate da §5 (`comprometida_em` mais recente) existe:
  -- a nova vence, deterministicamente.
  IF v_tab.substitui_id IS NOT NULL THEN
    UPDATE aba_finance.tabelas_preco tp
       SET estado = 'encerrada', vigente_ate = GREATEST(v_de - 1, tp.vigente_de)
     WHERE tp.id = v_tab.substitui_id AND tp.estado = 'comprometida';
  END IF;

  RETURN p_tabela_id;
END;
$$;

COMMENT ON FUNCTION aba_finance.comprometer_tabela_preco(UUID, DATE) IS
  'Rascunho -> comprometida, com data e autor. A partir daqui a tarifa e imutavel e a tabela entra na escada. Se a tabela substitui outra (reajuste), encerra a substituida na vespera.';

REVOKE ALL ON FUNCTION aba_finance.comprometer_tabela_preco(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.comprometer_tabela_preco(UUID, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.comprometer_tabela_preco(UUID, DATE) TO authenticated, service_role;

-- ============================================================
-- ENCERRAR SEM SUBSTITUIR — a operação que faltava, e que a evidência
-- cobrou antes de a tela existir.
--
-- Nem toda tabela de preço que sai de cena é reajustada: uma cortesia de
-- paciente acaba, uma tabela de tipo de profissional é descontinuada. Sem
-- esta operação o único jeito de tirar uma tabela da escada seria mexer
-- na linha à mão — e a §3 recusa isso, corretamente. Regra que só se
-- cumpre por fora do produto é regra que alguém vai afrouxar.
--
-- `vigente_ate` nunca é anterior ao início: encerrar uma tabela que
-- começou hoje a faz valer o dia de hoje inteiro. Datar o fim antes do
-- começo seria dizer que ela nunca valeu, e ela valeu — há orçamento
-- apontando para ela.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_finance.encerrar_tabela_preco(
  p_tabela_id UUID,
  p_vigente_ate DATE DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_estado TEXT;
  v_de     DATE;
BEGIN
  SELECT estado, vigente_de INTO v_estado, v_de
  FROM aba_finance.tabelas_preco WHERE id = p_tabela_id;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Tabela de preço % não existe ou não está ao seu alcance.', p_tabela_id
      USING ERRCODE = '42501';
  END IF;
  IF v_estado <> 'comprometida' THEN
    RAISE EXCEPTION 'Só tabela comprometida se encerra; esta está %.', v_estado USING ERRCODE = '23514';
  END IF;

  UPDATE aba_finance.tabelas_preco
     SET estado = 'encerrada',
         vigente_ate = GREATEST(COALESCE(p_vigente_ate, CURRENT_DATE - 1), v_de)
   WHERE id = p_tabela_id;

  RETURN p_tabela_id;
END;
$$;

COMMENT ON FUNCTION aba_finance.encerrar_tabela_preco(UUID, DATE) IS
  'Tira uma tabela de preco da escada sem substitui-la. A tabela continua existindo — ela e a proveniencia de todo valor que resolveu.';

REVOKE ALL ON FUNCTION aba_finance.encerrar_tabela_preco(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.encerrar_tabela_preco(UUID, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.encerrar_tabela_preco(UUID, DATE) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION aba_finance.reajustar_tabela_preco(
  p_tabela_id UUID,
  p_percentual NUMERIC,
  p_nome TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_origem RECORD;
  v_nova   UUID;
BEGIN
  SELECT t.* INTO v_origem FROM aba_finance.tabelas_preco t WHERE t.id = p_tabela_id;

  IF v_origem.id IS NULL THEN
    RAISE EXCEPTION 'Tabela de preço % não existe ou não está ao seu alcance.', p_tabela_id
      USING ERRCODE = '42501';
  END IF;

  IF v_origem.estado <> 'comprometida' THEN
    RAISE EXCEPTION 'Só tabela comprometida se reajusta; rascunho ainda se edita e encerrada já foi substituída (esta está %).', v_origem.estado
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO aba_finance.tabelas_preco
    (account_id, nome, escopo, cliente_id, tipo_profissional_id, estado, substitui_id)
  VALUES (
    v_origem.account_id,
    COALESCE(p_nome, v_origem.nome || ' (reajuste ' || to_char(NOW(), 'YYYY-MM-DD') || ')'),
    v_origem.escopo, v_origem.cliente_id, v_origem.tipo_profissional_id,
    'rascunho', v_origem.id
  )
  RETURNING id INTO v_nova;

  INSERT INTO aba_finance.tarifas (account_id, tabela_preco_id, procedimento_id, valor)
  SELECT t.account_id, v_nova, t.procedimento_id,
         ROUND(t.valor * (1 + COALESCE(p_percentual, 0) / 100.0), 2)
  FROM aba_finance.tarifas t
  WHERE t.tabela_preco_id = p_tabela_id;

  -- Nasce em RASCUNHO de propósito: reajuste se confere antes de valer.
  -- Comprometer é um segundo gesto, e é ele que encerra a anterior.
  RETURN v_nova;
END;
$$;

COMMENT ON FUNCTION aba_finance.reajustar_tabela_preco(UUID, NUMERIC, TEXT) IS
  'Reajuste e TABELA NOVA, nunca UPDATE de tarifa comprometida. Copia as tarifas com o percentual, em rascunho, com substitui_id apontando para a origem. Nenhum valor ja acordado muda: o valor acordado mora na linha do orcamento, nao na tarifa.';

REVOKE ALL ON FUNCTION aba_finance.reajustar_tabela_preco(UUID, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.reajustar_tabela_preco(UUID, NUMERIC, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.reajustar_tabela_preco(UUID, NUMERIC, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §5 — A ESCADA: `resolver_preco()`
--
-- `Paciente > Tipo de profissional > Clínica > Grupo de clínicas >
-- Prática`, percorrida no momento do lançamento até achar uma tabela
-- COMPROMETIDA e VIGENTE que tenha tarifa para aquele procedimento.
--
-- **A ASSINATURA É O CONTRATO.** Não existe `p_tabela_preco_id`, e é essa
-- ausência que garante "sem escolha na tela": não há por onde a interface
-- passar uma tabela, então não há tela que possa pedir para escolher.
-- Prova ao vivo na fonte: a mesma consulta custa 250 com um profissional
-- comum e 400 com um especialista (`design/benchmark/fontes/ice.md`
-- §5.2), sem ninguém escolher nada.
--
-- ÚLTIMO RECURSO É `aba_catalog.procedimentos.preco_base`, com o degrau
-- devolvido como `catalogo`. Sem esse fundo a escada devolveria NULL numa
-- conta que ainda não montou tabela de preço — isto é, todo orçamento
-- nasceria vazio no dia da implantação. O degrau vem NOMEADO no retorno
-- justamente para a tela poder dizer de onde o número veio.
--
-- DESEMPATE DETERMINÍSTICO dentro do mesmo degrau: `vigente_de` mais
-- recente, depois `comprometida_em` mais recente, depois `id`. Duas
-- tabelas do mesmo degrau vigentes no mesmo dia é situação legítima
-- (alguém comprometeu duas), e sem ordem total o preço mudaria entre duas
-- execuções da mesma consulta — a pior classe de defeito possível num
-- número que vira contrato.
--
-- `SECURITY DEFINER` com a fronteira de conta REAFIRMADA: resolver preço é
-- operação de sistema, e o profissional precisa dela sem depender de ter
-- leitura do módulo financeiro. Preço de procedimento é dado comercial da
-- própria clínica; o que esta função nunca devolve é qualquer coisa
-- clínica.
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
        WHEN 'tipo_profissional' THEN 2
        WHEN 'clinica'           THEN 3
        WHEN 'grupo'             THEN 4
        WHEN 'pratica'           THEN 5
      END)::SMALLINT AS c_grau
    FROM aba_finance.tarifas t
    JOIN aba_finance.tabelas_preco tp
      ON tp.id = t.tabela_preco_id AND tp.account_id = t.account_id
    WHERE t.account_id = v_account_id
      AND t.procedimento_id = p_procedimento_id
      AND tp.estado = 'comprometida'
      AND tp.vigente_de <= v_data
      AND (tp.vigente_ate IS NULL OR tp.vigente_ate >= v_data)
      AND (
        -- O degrau só se aplica quando o discriminador dele bate. Sem o
        -- paciente na chamada, o degrau `paciente` some da escada — e é
        -- assim que tem de ser: preço pessoal de um paciente não pode
        -- resolver o preço de outro.
        (tp.escopo = 'paciente' AND p_cliente_id IS NOT NULL AND tp.cliente_id = p_cliente_id)
        OR (tp.escopo = 'tipo_profissional' AND v_tipo_id IS NOT NULL AND tp.tipo_profissional_id = v_tipo_id)
        OR tp.escopo IN ('clinica','grupo','pratica')
      )
  )
  SELECT c.c_valor, c.c_tabela_id, c.c_tabela_nome, c.c_escopo, c.c_grau
  FROM candidatas c
  ORDER BY c.c_grau, c.c_vigente_de DESC, c.c_comprometida_em DESC, c.c_tabela_id
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
  'A escada: Paciente > Tipo de profissional > Clinica > Grupo > Pratica, com preco_base do catalogo como ultimo recurso. NAO recebe tabela de preco por parametro — o preco se resolve, nao se escolhe. Devolve o valor, a tabela que o resolveu (proveniencia) e o degrau.';

ALTER FUNCTION aba_finance.resolver_preco(UUID, UUID, UUID, DATE) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.resolver_preco(UUID, UUID, UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.resolver_preco(UUID, UUID, UUID, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.resolver_preco(UUID, UUID, UUID, DATE) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §6 — O ORÇAMENTO: a vista financeira do plano
--
-- Um orçamento por OPÇÃO do plano, e é essa a unidade certa: a matriz da
-- 03.8 põe as opções concorrentes lado a lado justamente para o paciente
-- comparar, e comparar é comparar PREÇO. Orçamento por plano inteiro
-- somaria alternativas que se excluem.
--
-- ============================================================
-- A LINHA NÃO GUARDA DENTE NEM FACE — a decisão do P-sub
-- ============================================================
-- Está escrita por extenso no cabeçalho deste arquivo, e repetida aqui
-- porque é aqui que a tentação aparece: a tela quer escrever "Restauração
-- MOD no 16", e copiar `dente`/`faces` para cá resolveria em uma coluna.
-- Resolveria criando uma porta lateral para fora de `aba_health` —
-- qualquer papel com `finance.read` leria dado de saúde por
-- `aba_finance`, sem alcance clínico e sem rastro, uma migration depois
-- de a `047` ter revogado exatamente essas colunas do outro lado.
--
-- O item aponta para `procedimento_plano_id`. Quem tem alcance clínico vê
-- o dente por `aba_finance.ler_orcamento()` (§9), que resolve o dado pela
-- porta registrada; quem não tem vê o mesmo orçamento sem ele.
--
-- `procedimento_id` é duplicado de propósito, e não contradiz o acima: é
-- o que permite exibir e agrupar o orçamento por procedimento **sem
-- atravessar `aba_treatment`**, e o nome do procedimento já é legível por
-- `viewer` em `aba_catalog` desde a 01.3. A fronteira que este produto
-- protege é a associação paciente × dente × face.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aba_finance.orcamentos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  plano_id          UUID NOT NULL,
  opcao_id          UUID NOT NULL,
  -- O profissional CONSIDERADO na resolução. Não é o autor do plano: é
  -- quem executa, e é o tipo dele que move o degrau 2 da escada. Trocá-lo
  -- recalcula (§8), e o recálculo avisa a diferença antes de confirmar.
  profissional_id   UUID,
  estado            TEXT NOT NULL DEFAULT 'rascunho',
  -- ---- as cinco colunas de DINHEIRO, que só `admin` move (§7) ----
  desconto_valor    NUMERIC(12,2) NOT NULL DEFAULT 0,
  desconto_motivo   TEXT,
  promocao          TEXT,
  parcelas          SMALLINT NOT NULL DEFAULT 1,
  taxa_juros        NUMERIC(6,3) NOT NULL DEFAULT 0,
  taxa_multa_atraso NUMERIC(6,3) NOT NULL DEFAULT 0,
  -- ---- totais mantidos por gatilho a partir dos itens ----
  valor_bruto       NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Coluna GERADA, não mantida à mão: total líquido calculado em dois
  -- lugares vira dois números diferentes na primeira vez que alguém
  -- esquecer um deles. `GREATEST(..., 0)` porque remover item de um
  -- orçamento com desconto pode deixar o desconto maior que o bruto, e
  -- valor negativo a pagar não existe.
  valor_liquido     NUMERIC(12,2)
                    GENERATED ALWAYS AS (GREATEST(valor_bruto - desconto_valor, 0)) STORED,
  aprovado_em       TIMESTAMPTZ,
  aprovado_por      UUID,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, account_id),
  UNIQUE (opcao_id),
  CONSTRAINT orcamentos_plano_fk
    FOREIGN KEY (plano_id, account_id)
    REFERENCES aba_treatment.planos(id, account_id) ON DELETE CASCADE,
  CONSTRAINT orcamentos_opcao_fk
    FOREIGN KEY (opcao_id, account_id)
    REFERENCES aba_treatment.opcoes(id, account_id) ON DELETE CASCADE,
  CONSTRAINT orcamentos_profissional_fk
    FOREIGN KEY (profissional_id, account_id)
    REFERENCES aba_scheduling.profissionais(id, account_id) ON DELETE SET NULL (profissional_id),
  CONSTRAINT orcamentos_estado_valido
    CHECK (estado IN ('rascunho','aprovado','recusado')),
  CONSTRAINT orcamentos_desconto_nao_negativo CHECK (desconto_valor >= 0),
  CONSTRAINT orcamentos_parcelas_validas CHECK (parcelas BETWEEN 1 AND 120),
  CONSTRAINT orcamentos_taxas_nao_negativas
    CHECK (taxa_juros >= 0 AND taxa_multa_atraso >= 0),
  -- Aprovação é ato datado e atribuível, no mesmo padrão de `executado`
  -- na 03.7.a: fato afirmado, com data e autor, nunca inferido.
  CONSTRAINT orcamentos_aprovacao_completa
    CHECK ((estado = 'aprovado') = (aprovado_em IS NOT NULL)
           AND (aprovado_em IS NULL) = (aprovado_por IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_orcamentos_plano ON aba_finance.orcamentos(account_id, plano_id);

DROP TRIGGER IF EXISTS set_updated_at ON aba_finance.orcamentos;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_finance.orcamentos
  FOR EACH ROW EXECUTE FUNCTION aba_finance.set_updated_at();

CREATE TABLE IF NOT EXISTS aba_finance.itens_orcamento (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  orcamento_id          UUID NOT NULL,
  procedimento_plano_id UUID NOT NULL,
  procedimento_id       UUID NOT NULL,
  -- O VALOR RESOLVIDO, congelado no momento do acordo.
  valor_resolvido       NUMERIC(12,2) NOT NULL,
  -- A PROVENIÊNCIA: qual tabela resolveu este número. NULL quando o
  -- degrau foi `catalogo` (nenhuma tabela de preço alcançou). Não é
  -- escolha de tela — é o registro de onde o número veio, que é o que
  -- torna o orçamento auditável um ano depois.
  tabela_preco_id       UUID,
  degrau                TEXT NOT NULL,
  profissional_id       UUID,
  resolvido_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, account_id),
  UNIQUE (orcamento_id, procedimento_plano_id),
  CONSTRAINT itens_orcamento_orcamento_fk
    FOREIGN KEY (orcamento_id, account_id)
    REFERENCES aba_finance.orcamentos(id, account_id) ON DELETE CASCADE,
  CONSTRAINT itens_orcamento_procedimento_plano_fk
    FOREIGN KEY (procedimento_plano_id, account_id)
    REFERENCES aba_treatment.procedimentos_plano(id, account_id) ON DELETE CASCADE,
  CONSTRAINT itens_orcamento_procedimento_fk
    FOREIGN KEY (procedimento_id, account_id)
    REFERENCES aba_catalog.procedimentos(id, account_id),
  CONSTRAINT itens_orcamento_tabela_preco_fk
    FOREIGN KEY (tabela_preco_id, account_id)
    REFERENCES aba_finance.tabelas_preco(id, account_id),
  CONSTRAINT itens_orcamento_profissional_fk
    FOREIGN KEY (profissional_id, account_id)
    REFERENCES aba_scheduling.profissionais(id, account_id) ON DELETE SET NULL (profissional_id),
  CONSTRAINT itens_orcamento_valor_nao_negativo CHECK (valor_resolvido >= 0),
  CONSTRAINT itens_orcamento_degrau_valido
    CHECK (degrau IN ('paciente','tipo_profissional','clinica','grupo','pratica','catalogo')),
  -- Degrau que nomeia uma tabela precisa da tabela; `catalogo` é o único
  -- que resolve sem nenhuma. Sem esta coerência a proveniência mentiria
  -- sem ninguém notar.
  CONSTRAINT itens_orcamento_proveniencia_coerente
    CHECK ((degrau = 'catalogo') = (tabela_preco_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_itens_orcamento_orcamento
  ON aba_finance.itens_orcamento(orcamento_id);

DROP TRIGGER IF EXISTS set_updated_at ON aba_finance.itens_orcamento;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_finance.itens_orcamento
  FOR EACH ROW EXECUTE FUNCTION aba_finance.set_updated_at();

-- ============================================================
-- O item pertence ao MESMO plano do orçamento
--
-- A chave composta por `account_id` protege entre CLÍNICAS e não protege
-- entre PACIENTES da mesma clínica (Subetapa 02.15; `docs/02` §13.2 diz o
-- mesmo para o contrato da 03.8.b). Sem esta trava, a célula do plano do
-- paciente A entraria no orçamento do paciente B sem nenhum erro.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_finance.conferir_item_orcamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_plano_do_orcamento UUID;
  v_plano_da_celula    UUID;
  v_estado             TEXT;
BEGIN
  SELECT o.plano_id, o.estado INTO v_plano_do_orcamento, v_estado
  FROM aba_finance.orcamentos o WHERE o.id = NEW.orcamento_id;

  IF v_estado <> 'rascunho' THEN
    RAISE EXCEPTION 'Orçamento % não recebe nem altera item — o valor acordado é congelado.', v_estado
      USING ERRCODE = '23514';
  END IF;

  SELECT pp.plano_id INTO v_plano_da_celula
  FROM aba_treatment.procedimentos_plano pp WHERE pp.id = NEW.procedimento_plano_id;

  IF v_plano_da_celula IS DISTINCT FROM v_plano_do_orcamento THEN
    RAISE EXCEPTION 'O procedimento pertence a outro plano — orçamento de um paciente não recebe linha do plano de outro.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_finance.conferir_item_orcamento() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.conferir_item_orcamento() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.conferir_item_orcamento() FROM anon;
REVOKE ALL ON FUNCTION aba_finance.conferir_item_orcamento() FROM authenticated;

DROP TRIGGER IF EXISTS trg_itens_orcamento_conferir ON aba_finance.itens_orcamento;
CREATE TRIGGER trg_itens_orcamento_conferir
  BEFORE INSERT OR UPDATE ON aba_finance.itens_orcamento
  FOR EACH ROW EXECUTE FUNCTION aba_finance.conferir_item_orcamento();

-- ============================================================
-- O total do orçamento é a soma dos itens — mantido por gatilho.
--
-- Mesmo mecanismo de `recalcular_valor_fatura` (011): o total nunca é
-- digitado, e por isso nunca diverge da soma. `AFTER`, porque em `BEFORE
-- INSERT` a linha nova ainda não está lá — a mesma armadilha que o teto
-- de quantidade da 03.8 mediu.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_finance.recalcular_total_orcamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_orcamento UUID := COALESCE(NEW.orcamento_id, OLD.orcamento_id);
  v_soma NUMERIC(12,2);
BEGIN
  SELECT COALESCE(SUM(i.valor_resolvido), 0) INTO v_soma
  FROM aba_finance.itens_orcamento i WHERE i.orcamento_id = v_orcamento;

  UPDATE aba_finance.orcamentos
     SET valor_bruto = v_soma
   WHERE id = v_orcamento AND valor_bruto IS DISTINCT FROM v_soma;

  RETURN NULL;
END;
$$;

ALTER FUNCTION aba_finance.recalcular_total_orcamento() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.recalcular_total_orcamento() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.recalcular_total_orcamento() FROM anon;
REVOKE ALL ON FUNCTION aba_finance.recalcular_total_orcamento() FROM authenticated;

DROP TRIGGER IF EXISTS trg_itens_orcamento_total ON aba_finance.itens_orcamento;
CREATE TRIGGER trg_itens_orcamento_total
  AFTER INSERT OR UPDATE OR DELETE ON aba_finance.itens_orcamento
  FOR EACH ROW EXECUTE FUNCTION aba_finance.recalcular_total_orcamento();

-- Item de orçamento aprovado não se apaga: seria a mesma reescrita do
-- passado que a §3 impede do lado da tarifa, por outro caminho.
CREATE OR REPLACE FUNCTION aba_finance.conferir_item_orcamento_apagavel()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_estado TEXT;
BEGIN
  SELECT o.estado INTO v_estado FROM aba_finance.orcamentos o WHERE o.id = OLD.orcamento_id;
  -- Orçamento já apagado (cascata do plano) não tem estado a conferir.
  IF v_estado IS NOT NULL AND v_estado <> 'rascunho' THEN
    RAISE EXCEPTION 'Item de orçamento % não se apaga.', v_estado USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

ALTER FUNCTION aba_finance.conferir_item_orcamento_apagavel() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.conferir_item_orcamento_apagavel() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.conferir_item_orcamento_apagavel() FROM anon;
REVOKE ALL ON FUNCTION aba_finance.conferir_item_orcamento_apagavel() FROM authenticated;

DROP TRIGGER IF EXISTS trg_itens_orcamento_apagavel ON aba_finance.itens_orcamento;
CREATE TRIGGER trg_itens_orcamento_apagavel
  BEFORE DELETE ON aba_finance.itens_orcamento
  FOR EACH ROW EXECUTE FUNCTION aba_finance.conferir_item_orcamento_apagavel();

-- ---------------------------------------------------------------------
-- §7 — A ALÇADA FINANCEIRA: só `admin` mexe em dinheiro
--
-- Decisão de Max, 2026-09-04: parcelas, descontos, juros, mora e
-- promoções são da recepção, **nunca do profissional**. Não é detalhe de
-- tela — é padrão de qualidade do trabalho clínico, porque tira do
-- dentista a negociação de preço na cadeira e dá a cada lado uma resposta
-- honesta para o paciente.
--
-- POR QUE GATILHO E NÃO POLICY, e isto foi MEDIDO antes de escrito: as
-- policies de `contratos`, `parcelas_contrato` e `pagamentos` autorizam
-- `UPDATE` a partir de `agent` — que é o papel do profissional. Trocar o
-- papel mínimo da policy para `admin` fecharia a tabela INTEIRA, e o
-- profissional legitimamente muda coisas que não são dinheiro. A
-- pergunta aqui não é "quais linhas", é "quais colunas", e a RLS não
-- responde essa pergunta (`instrucoes.md` §5: *"RLS restringe QUAIS
-- LINHAS, nunca QUAIS COLUNAS"* e *"coluna de privilégio precisa de
-- trigger próprio mesmo quando a policy de UPDATE parece restritiva"*).
--
-- A TRAVA ALCANÇA AS TABELAS QUE JÁ EXISTIAM, e essa é a parte que se
-- esqueceria: a regra de Max é sobre o produto, não sobre o código
-- escrito hoje. Sem `contratos` e `parcelas_contrato` na lista, o
-- profissional continuaria mudando juros e parcela pela tela do
-- financeiro, e a subetapa teria entregue a trava só onde ela ainda não
-- fazia falta.
--
-- SEM SESSÃO A TRAVA NÃO SE APLICA, e é decisão medida: `auth.uid()` NULL
-- é caminho de servidor (`service_role`, semente, rotina de cron), e
-- `service_role` já ignora RLS por natureza do papel — barrar aqui só
-- quebraria semente e fixture sem fechar porta nenhuma. É a mesma decisão
-- de `aba_health.registrar_escrita_clinica` e de
-- `aba_treatment.registrar_escrita_plano`. O caminho que importa — o
-- usuário autenticado com papel `agent` — é exatamente o que os casos de
-- ataque da suíte exercitam.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_finance.exigir_alcada_financeira()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_novo   JSONB := to_jsonb(NEW);
  v_velho  JSONB := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  v_col    TEXT;
  v_texto  TEXT;
  v_mudou  TEXT := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  FOREACH v_col IN ARRAY TG_ARGV LOOP
    IF TG_OP = 'INSERT' THEN
      -- Nascer com dinheiro diferente do padrão é a mesma decisão
      -- comercial que alterá-lo depois: quem cria o orçamento já com 20%
      -- de desconto não passou por alçada nenhuma se só o UPDATE for
      -- conferido.
      --
      -- `->>` e não `->`: para uma coluna nula, `to_jsonb(NEW) -> 'col'`
      -- devolve o jsonb `null`, que NÃO é SQL NULL — a comparação daria
      -- verdadeiro para toda coluna e a trava exigiria `admin` para
      -- qualquer INSERT. `->>` devolve SQL NULL, que é o que se quer.
      --
      -- E A COMPARAÇÃO É NUMÉRICA, NÃO TEXTUAL. Este é um defeito MEDIDO
      -- nesta subetapa, não uma precaução: a primeira versão comparava
      -- `v_texto <> '0'`, e `NUMERIC(12,2)` serializa zero como `0.00` —
      -- de modo que `desconto_valor` no valor padrão parecia um desconto
      -- concedido, e `montar_orcamento` foi recusado para o `agent` na
      -- primeira execução da evidência. Comparar número como texto é a
      -- classe de erro que passa em toda leitura de código e só a
      -- execução mostra.
      v_texto := v_novo ->> v_col;
      IF v_texto IS NOT NULL
         AND NOT (v_texto ~ '^-?[0-9]+(\.[0-9]+)?$'
                  AND v_texto::NUMERIC = (CASE WHEN v_col = 'parcelas' THEN 1 ELSE 0 END)) THEN
        v_mudou := v_col;
      END IF;
    ELSIF v_novo -> v_col IS DISTINCT FROM v_velho -> v_col THEN
      v_mudou := v_col;
    END IF;

    IF v_mudou IS NOT NULL THEN
      IF NOT public.is_account_member(NEW.account_id, 'admin') THEN
        RAISE EXCEPTION 'Só a recepção (admin) altera %: parcela, desconto, juros, mora e promoção não se negociam na cadeira.', v_mudou
          USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION aba_finance.exigir_alcada_financeira() IS
  'Trava de coluna, nao de linha: recusa mudanca em parcela/desconto/juros/mora/promocao quando o ator nao e admin. As colunas vem em TG_ARGV, para a mesma funcao servir orcamentos, contratos e parcelas_contrato. Decisao de Max, 2026-09-04.';

ALTER FUNCTION aba_finance.exigir_alcada_financeira() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.exigir_alcada_financeira() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.exigir_alcada_financeira() FROM anon;
REVOKE ALL ON FUNCTION aba_finance.exigir_alcada_financeira() FROM authenticated;

DROP TRIGGER IF EXISTS trg_orcamentos_alcada ON aba_finance.orcamentos;
CREATE TRIGGER trg_orcamentos_alcada
  BEFORE INSERT OR UPDATE ON aba_finance.orcamentos
  FOR EACH ROW EXECUTE FUNCTION aba_finance.exigir_alcada_financeira(
    'desconto_valor', 'desconto_motivo', 'promocao', 'parcelas', 'taxa_juros', 'taxa_multa_atraso');

DROP TRIGGER IF EXISTS trg_contratos_alcada ON aba_finance.contratos;
CREATE TRIGGER trg_contratos_alcada
  BEFORE INSERT OR UPDATE ON aba_finance.contratos
  FOR EACH ROW EXECUTE FUNCTION aba_finance.exigir_alcada_financeira(
    'parcelas', 'taxa_juros', 'taxa_multa_atraso', 'dia_vencimento');

DROP TRIGGER IF EXISTS trg_parcelas_contrato_alcada ON aba_finance.parcelas_contrato;
CREATE TRIGGER trg_parcelas_contrato_alcada
  BEFORE INSERT OR UPDATE ON aba_finance.parcelas_contrato
  FOR EACH ROW EXECUTE FUNCTION aba_finance.exigir_alcada_financeira('valor', 'data_vencimento');

-- ---------------------------------------------------------------------
-- §8 — As operações do orçamento
--
-- POR QUE `SECURITY DEFINER` COM AUTORIZAÇÃO EXPLÍCITA NO CORPO, e não
-- `SECURITY INVOKER` como as seis operações da `011`. As operações da
-- `011` só tocam `aba_finance`, e ali a RLS do chamador é exatamente a
-- trava certa. Estas atravessam a fronteira: para montar o orçamento é
-- preciso LER as células do plano em `aba_treatment`, e a recepção — que
-- é quem monta o orçamento no balcão — legitimamente NÃO tem alcance
-- clínico. Sob `INVOKER` a montagem devolveria zero itens para a
-- recepção, em silêncio, e o orçamento nasceria vazio sem nenhum erro.
--
-- O preço de `DEFINER` é ter de reafirmar a autorização à mão, e é o que
-- estas funções fazem na primeira linha: `is_account_member` + o
-- `access.can('finance', ...)` que a policy da tabela usaria. O que elas
-- nunca devolvem, mesmo lendo, é dente ou face — isso é da §9.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_finance.montar_orcamento(
  p_opcao_id UUID,
  p_profissional_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id  UUID;
  v_plano_id    UUID;
  v_cliente_id  UUID;
  v_orcamento   UUID;
  v_estado      TEXT;
  v_prof        UUID := p_profissional_id;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid();
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Montar orçamento exige sessão autenticada.' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.is_account_member(v_account_id, 'agent') AND access.can('finance', 'create')) THEN
    RAISE EXCEPTION 'Sem permissão para montar orçamento neste módulo.' USING ERRCODE = '42501';
  END IF;

  SELECT o.plano_id, p.cliente_id INTO v_plano_id, v_cliente_id
  FROM aba_treatment.opcoes o
  JOIN aba_treatment.planos p ON p.id = o.plano_id AND p.account_id = o.account_id
  WHERE o.id = p_opcao_id AND o.account_id = v_account_id;

  IF v_plano_id IS NULL THEN
    RAISE EXCEPTION 'Opção % não existe nesta conta.', p_opcao_id USING ERRCODE = '42501';
  END IF;

  SELECT id, estado INTO v_orcamento, v_estado
  FROM aba_finance.orcamentos WHERE opcao_id = p_opcao_id;

  IF v_orcamento IS NULL THEN
    INSERT INTO aba_finance.orcamentos (account_id, plano_id, opcao_id, profissional_id)
    VALUES (v_account_id, v_plano_id, p_opcao_id,
            COALESCE(v_prof, (SELECT pl.profissional_id FROM aba_treatment.planos pl WHERE pl.id = v_plano_id)))
    RETURNING id, profissional_id INTO v_orcamento, v_prof;
  ELSE
    IF v_estado <> 'rascunho' THEN
      RAISE EXCEPTION 'Orçamento % não se remonta — o valor acordado é congelado.', v_estado
        USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(v_prof, profissional_id) INTO v_prof
    FROM aba_finance.orcamentos WHERE id = v_orcamento;
    UPDATE aba_finance.orcamentos SET profissional_id = v_prof WHERE id = v_orcamento;
  END IF;

  -- Sai o que não pertence mais à opção; entra o que falta. Apagar tudo e
  -- reinserir seria mais curto e perderia `resolvido_em` de linha que não
  -- mudou — e é justamente o carimbo que diz quando aquele preço foi
  -- acordado.
  DELETE FROM aba_finance.itens_orcamento i
  WHERE i.orcamento_id = v_orcamento
    AND NOT EXISTS (
      SELECT 1 FROM aba_treatment.procedimentos_plano pp
      WHERE pp.id = i.procedimento_plano_id
        AND pp.opcao_id = p_opcao_id
        AND pp.recusado_em IS NULL
        AND pp.estado <> 'nao_mais_necessario');

  INSERT INTO aba_finance.itens_orcamento
    (account_id, orcamento_id, procedimento_plano_id, procedimento_id,
     valor_resolvido, tabela_preco_id, degrau, profissional_id)
  SELECT
    v_account_id, v_orcamento, pp.id, pp.procedimento_id,
    COALESCE(r.valor, 0), r.tabela_preco_id, COALESCE(r.degrau, 'catalogo'), v_prof
  FROM aba_treatment.procedimentos_plano pp
  -- `LEFT ... ON TRUE` e não `CROSS`: `resolver_preco` pode devolver
  -- conjunto vazio, e com `CROSS JOIN LATERAL` o item sumiria do
  -- orçamento em silêncio em vez de entrar com o preço a resolver.
  LEFT JOIN LATERAL aba_finance.resolver_preco(pp.procedimento_id, v_cliente_id, v_prof) r ON TRUE
  WHERE pp.opcao_id = p_opcao_id
    AND pp.account_id = v_account_id
    AND pp.recusado_em IS NULL
    AND pp.estado <> 'nao_mais_necessario'
    AND NOT EXISTS (
      SELECT 1 FROM aba_finance.itens_orcamento i
      WHERE i.orcamento_id = v_orcamento AND i.procedimento_plano_id = pp.id);

  RETURN v_orcamento;
END;
$$;

COMMENT ON FUNCTION aba_finance.montar_orcamento(UUID, UUID) IS
  'Monta (ou completa) o orcamento em rascunho de uma opcao do plano, resolvendo o preco de cada celula pela escada. NAO recebe tabela de preco: o preco se resolve. Nunca devolve dente nem face.';

ALTER FUNCTION aba_finance.montar_orcamento(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.montar_orcamento(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.montar_orcamento(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.montar_orcamento(UUID, UUID) TO authenticated, service_role;

-- ============================================================
-- A DIFERENÇA SE AVISA ANTES DE CONFIRMAR
--
-- "Trocar o profissional recalcula e avisa a diferença antes de
-- confirmar" (Conclusão da 03.8.a). Sem isso, trocar o dentista de um
-- procedimento faturado corrompe o financeiro em silêncio
-- (`RELATORIO_DE_IMPACTO_ICE.md` §3.1-B2).
--
-- A garantia de que o aviso é honesto está na FORMA: `simular_` não
-- escreve nada — é `STABLE` — e `trocar_` aplica exatamente o que ela
-- devolveu, porque as duas resolvem pela MESMA `resolver_preco()` com os
-- mesmos argumentos. Duas contas separadas, uma para mostrar e outra para
-- gravar, divergiriam no primeiro dia em que alguém mexesse numa delas.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_finance.simular_troca_de_profissional(
  p_orcamento_id UUID,
  p_profissional_id UUID
) RETURNS TABLE (
  item_id          UUID,
  procedimento_id  UUID,
  procedimento     TEXT,
  valor_atual      NUMERIC,
  valor_novo       NUMERIC,
  diferenca        NUMERIC,
  degrau_atual     TEXT,
  degrau_novo      TEXT,
  tabela_nova      TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
  v_cliente_id UUID;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid();
  IF v_account_id IS NULL
     OR NOT (public.is_account_member(v_account_id, 'viewer') AND access.can('finance', 'read')) THEN
    RETURN;
  END IF;

  SELECT p.cliente_id INTO v_cliente_id
  FROM aba_finance.orcamentos o
  JOIN aba_treatment.planos p ON p.id = o.plano_id AND p.account_id = o.account_id
  WHERE o.id = p_orcamento_id AND o.account_id = v_account_id;

  IF v_cliente_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    i.id, i.procedimento_id, pc.nome,
    i.valor_resolvido,
    COALESCE(r.valor, 0),
    COALESCE(r.valor, 0) - i.valor_resolvido,
    i.degrau, COALESCE(r.degrau, 'catalogo'), r.tabela_nome
  FROM aba_finance.itens_orcamento i
  JOIN aba_catalog.procedimentos pc
    ON pc.id = i.procedimento_id AND pc.account_id = i.account_id
  LEFT JOIN LATERAL aba_finance.resolver_preco(i.procedimento_id, v_cliente_id, p_profissional_id) r ON TRUE
  WHERE i.orcamento_id = p_orcamento_id AND i.account_id = v_account_id
  ORDER BY pc.nome;
END;
$$;

COMMENT ON FUNCTION aba_finance.simular_troca_de_profissional(UUID, UUID) IS
  'O aviso ANTES de confirmar: devolve, item a item, o valor atual, o valor que a escada daria com o outro profissional e a diferenca. STABLE — nao grava nada.';

ALTER FUNCTION aba_finance.simular_troca_de_profissional(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.simular_troca_de_profissional(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.simular_troca_de_profissional(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.simular_troca_de_profissional(UUID, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION aba_finance.trocar_profissional_do_orcamento(
  p_orcamento_id UUID,
  p_profissional_id UUID
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
  v_cliente_id UUID;
  v_estado     TEXT;
  v_antes      NUMERIC;
  v_depois     NUMERIC;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid();
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Trocar o profissional do orçamento exige sessão autenticada.' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.is_account_member(v_account_id, 'agent') AND access.can('finance', 'update')) THEN
    RAISE EXCEPTION 'Sem permissão para alterar orçamento neste módulo.' USING ERRCODE = '42501';
  END IF;

  SELECT o.estado, o.valor_bruto, p.cliente_id INTO v_estado, v_antes, v_cliente_id
  FROM aba_finance.orcamentos o
  JOIN aba_treatment.planos p ON p.id = o.plano_id AND p.account_id = o.account_id
  WHERE o.id = p_orcamento_id AND o.account_id = v_account_id;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Orçamento % não existe nesta conta.', p_orcamento_id USING ERRCODE = '42501';
  END IF;

  IF v_estado <> 'rascunho' THEN
    RAISE EXCEPTION 'Orçamento % não recalcula — trocar o profissional depois do acordo mudaria um valor já aceito.', v_estado
      USING ERRCODE = '23514';
  END IF;

  IF p_profissional_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM aba_scheduling.profissionais pr
    WHERE pr.id = p_profissional_id AND pr.account_id = v_account_id
  ) THEN
    RAISE EXCEPTION 'Profissional % não existe nesta conta.', p_profissional_id USING ERRCODE = '42501';
  END IF;

  -- A resolução vem de uma SUBQUERY, e não de um `FROM
  -- resolver_preco(i.procedimento_id, ...)`: no `UPDATE`, a cláusula
  -- `FROM` não enxerga colunas da tabela-alvo, e a forma direta falha com
  -- "invalid reference to FROM-clause entry".
  UPDATE aba_finance.itens_orcamento i
     SET valor_resolvido = novo.valor,
         tabela_preco_id = novo.tabela_preco_id,
         degrau          = novo.degrau,
         profissional_id = p_profissional_id,
         resolvido_em    = NOW()
  FROM (
    SELECT x.id AS item_id,
           COALESCE(r.valor, 0) AS valor,
           r.tabela_preco_id,
           COALESCE(r.degrau, 'catalogo') AS degrau
    FROM aba_finance.itens_orcamento x
    LEFT JOIN LATERAL aba_finance.resolver_preco(x.procedimento_id, v_cliente_id, p_profissional_id) r ON TRUE
    WHERE x.orcamento_id = p_orcamento_id AND x.account_id = v_account_id
  ) novo
  WHERE i.id = novo.item_id;

  UPDATE aba_finance.orcamentos SET profissional_id = p_profissional_id WHERE id = p_orcamento_id;

  SELECT valor_bruto INTO v_depois FROM aba_finance.orcamentos WHERE id = p_orcamento_id;
  RETURN v_depois - v_antes;
END;
$$;

COMMENT ON FUNCTION aba_finance.trocar_profissional_do_orcamento(UUID, UUID) IS
  'Aplica a troca e devolve a diferenca de total. Usa a MESMA resolver_preco() da simulacao — o que foi avisado e o que se grava sao o mesmo calculo.';

ALTER FUNCTION aba_finance.trocar_profissional_do_orcamento(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.trocar_profissional_do_orcamento(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.trocar_profissional_do_orcamento(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.trocar_profissional_do_orcamento(UUID, UUID) TO authenticated, service_role;

-- ============================================================
-- Aprovar: o orçamento vira acordo, e o acordo congela.
--
-- A COBRANÇA NÃO NASCE AQUI, e isso é escopo declarado: a inversão
-- brasileira — a fatura sai da aprovação, antes de qualquer execução —
-- pertence ao CONTRATO, que é a Subetapa 03.8.b (`docs/02` §12.5). Esta
-- migration não escreve uma linha em `faturas`, e a verificação (k) da
-- §11 recusa a migration se passar a escrever.
--
-- ALÇADA: `agent` + `finance.update`, e não `admin`. A lista de Max é
-- literal — "parcelas, descontos, juros, mora e promoções" —, e aprovar
-- não é nenhuma delas: é aceitar o preço que a escada resolveu, sem
-- negociar nada. Quem quiser um número diferente tem de passar por
-- desconto, e aí a §7 pede `admin`.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_finance.aprovar_orcamento(p_orcamento_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_ator   UUID := auth.uid();
  v_estado TEXT;
  v_itens  INT;
BEGIN
  IF v_ator IS NULL THEN
    RAISE EXCEPTION 'Aprovar um orçamento exige sessão autenticada — a aprovação precisa de autor e data.'
      USING ERRCODE = '42501';
  END IF;

  SELECT estado INTO v_estado FROM aba_finance.orcamentos WHERE id = p_orcamento_id;
  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Orçamento % não existe ou não está ao seu alcance.', p_orcamento_id
      USING ERRCODE = '42501';
  END IF;
  IF v_estado <> 'rascunho' THEN
    RAISE EXCEPTION 'Só orçamento em rascunho se aprova; este está %.', v_estado USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_itens FROM aba_finance.itens_orcamento WHERE orcamento_id = p_orcamento_id;
  IF v_itens = 0 THEN
    RAISE EXCEPTION 'Orçamento sem item não se aprova.' USING ERRCODE = '23514';
  END IF;

  UPDATE aba_finance.orcamentos
     SET estado = 'aprovado', aprovado_em = NOW(), aprovado_por = v_ator
   WHERE id = p_orcamento_id;

  RETURN p_orcamento_id;
END;
$$;

REVOKE ALL ON FUNCTION aba_finance.aprovar_orcamento(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.aprovar_orcamento(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.aprovar_orcamento(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §9 — `ler_orcamentos()`: a fronteira de `aba_health` dentro da vista
--       financeira — a razão do P-sub desta subetapa
--
-- O orçamento existe para a recepção ler. E a recepção não tem alcance
-- clínico. As duas coisas são verdadeiras ao mesmo tempo, e a resposta
-- **não** é escolher uma:
--
--   · quem TEM alcance clínico recebe o orçamento com `dente` e `faces`
--     — e a leitura fica REGISTRADA em `aba_health.log_acesso`, exatamente
--     como `aba_treatment.ler_planos()` registra;
--   · quem NÃO tem recebe o MESMO orçamento, com os mesmos valores, o
--     mesmo total e o nome do procedimento, **sem** dente e **sem** face
--     — e nada é logado, porque nada clínico foi lido. Log a mais aqui
--     seria log mentindo (`047`).
--
-- O campo `com_detalhe_clinico` volta no retorno para a tela poder dizer
-- por que a coluna está vazia, em vez de deixar a pessoa achar que o
-- plano não tem dente marcado. Ausência silenciosa é a mesma falha que a
-- 02.10 pagou com o KPI "Vencido".
--
-- UMA LINHA DE LOG POR PLANO ABERTO, não por orçamento e não por item:
-- um log que conta cliques em vez de leituras é um log que ninguém
-- consegue ler (`047` §4).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_finance.ler_orcamentos(p_plano_id UUID)
RETURNS TABLE (
  id                   UUID,
  plano_id             UUID,
  opcao_id             UUID,
  opcao_rotulo         TEXT,
  profissional_id      UUID,
  estado               TEXT,
  desconto_valor       NUMERIC,
  desconto_motivo      TEXT,
  promocao             TEXT,
  parcelas             SMALLINT,
  taxa_juros           NUMERIC,
  taxa_multa_atraso    NUMERIC,
  valor_bruto          NUMERIC,
  valor_liquido        NUMERIC,
  aprovado_em          TIMESTAMPTZ,
  com_detalhe_clinico  BOOLEAN,
  itens                JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_account_id UUID;
  v_cliente_id UUID;
  v_clinico    BOOLEAN;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = v_user_id;
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  -- Negado devolve VAZIO, nunca exceção: erro explícito confirmaria a
  -- existência do plano a quem não pode enxergá-lo (mesma decisão de
  -- `ler_evolucoes` e `ler_planos`).
  IF NOT (public.is_account_member(v_account_id, 'viewer') AND access.can('finance', 'read')) THEN
    RETURN;
  END IF;

  SELECT p.cliente_id INTO v_cliente_id
  FROM aba_treatment.planos p
  WHERE p.id = p_plano_id AND p.account_id = v_account_id;

  IF v_cliente_id IS NULL THEN
    RETURN;
  END IF;

  v_clinico := aba_treatment.pode_planejar(v_cliente_id, 'leitura');

  -- O log vem ANTES do retorno, e SÓ quando há conteúdo clínico a
  -- devolver. Se viesse depois, uma leitura interrompida no meio
  -- entregaria dado sem deixar rastro — o caso em que o rastro mais
  -- importa.
  IF v_clinico THEN
    INSERT INTO aba_health.log_acesso
      (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
    VALUES (v_account_id, v_user_id, v_cliente_id, 'plano', p_plano_id, 'leitura',
            jsonb_build_object('via', 'aba_finance.ler_orcamentos'));
  END IF;

  RETURN QUERY
  SELECT
    o.id, o.plano_id, o.opcao_id, op.rotulo, o.profissional_id, o.estado,
    o.desconto_valor, o.desconto_motivo, o.promocao, o.parcelas,
    o.taxa_juros, o.taxa_multa_atraso, o.valor_bruto, o.valor_liquido,
    o.aprovado_em, v_clinico,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', i.id,
               'procedimento_plano_id', i.procedimento_plano_id,
               'procedimento_id', i.procedimento_id,
               'procedimento', pc.nome,
               'valor_resolvido', i.valor_resolvido,
               'tabela_preco_id', i.tabela_preco_id,
               'tabela_preco', tp.nome,
               'degrau', i.degrau,
               'resolvido_em', i.resolvido_em,
               -- As duas únicas chaves clínicas do retorno, e as duas só
               -- existem quando o alcance existe. `NULL` e não ausente:
               -- a forma do objeto não muda entre os dois casos, para a
               -- tela não ter dois formatos para tratar.
               'dente', CASE WHEN v_clinico THEN to_jsonb(pp.dente) ELSE 'null'::jsonb END,
               'faces', CASE WHEN v_clinico THEN to_jsonb(pp.faces) ELSE 'null'::jsonb END,
               'estado_procedimento', pp.estado)
             ORDER BY pc.nome)
      FROM aba_finance.itens_orcamento i
      JOIN aba_catalog.procedimentos pc
        ON pc.id = i.procedimento_id AND pc.account_id = i.account_id
      JOIN aba_treatment.procedimentos_plano pp
        ON pp.id = i.procedimento_plano_id AND pp.account_id = i.account_id
      LEFT JOIN aba_finance.tabelas_preco tp
        ON tp.id = i.tabela_preco_id AND tp.account_id = i.account_id
      WHERE i.orcamento_id = o.id
    ), '[]'::jsonb)
  FROM aba_finance.orcamentos o
  JOIN aba_treatment.opcoes op ON op.id = o.opcao_id AND op.account_id = o.account_id
  WHERE o.plano_id = p_plano_id AND o.account_id = v_account_id
  ORDER BY op.ordem;
END;
$$;

COMMENT ON FUNCTION aba_finance.ler_orcamentos(UUID) IS
  'Vista financeira do plano. Devolve dente e face SOMENTE a quem tem alcance clinico (aba_treatment.pode_planejar) — e nesse caso registra a leitura em aba_health.log_acesso, uma linha por plano. Sem alcance, o mesmo orcamento sem dente e sem face, e sem log.';

ALTER FUNCTION aba_finance.ler_orcamentos(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.ler_orcamentos(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.ler_orcamentos(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.ler_orcamentos(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §10 — RLS e GRANTs
--
-- A ordem é a lição da 01.3: `GRANT` amplo ANTES de qualquer revogação
-- por coluna. Esta migration não revoga coluna nenhuma — e não precisa,
-- porque a decisão do P-sub foi **não guardar dado clínico aqui**, que é
-- uma proteção mais forte que revogar depois: coluna que não existe não
-- vaza por esquecimento.
--
-- DOIS NÍVEIS DE ALÇADA, de propósito:
--   · **tabela de preço e tarifa** são de `admin` para escrever — quem
--     define preço define quanto a clínica cobra, e isso é da recepção;
--   · **orçamento e item** são de `agent` para escrever — montar o
--     orçamento de um plano é trabalho de balcão e de cadeira. O que o
--     `agent` não pode é mexer nas cinco colunas de dinheiro, e essa
--     trava é a §7, que é de coluna e não de linha.
-- ---------------------------------------------------------------------
ALTER TABLE aba_finance.tabelas_preco    ENABLE ROW LEVEL SECURITY;
ALTER TABLE aba_finance.tarifas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE aba_finance.orcamentos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE aba_finance.itens_orcamento  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tabelas_preco_select ON aba_finance.tabelas_preco;
CREATE POLICY tabelas_preco_select ON aba_finance.tabelas_preco FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('finance', 'read'));
DROP POLICY IF EXISTS tabelas_preco_insert ON aba_finance.tabelas_preco;
CREATE POLICY tabelas_preco_insert ON aba_finance.tabelas_preco FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin') AND access.can('finance', 'create'));
DROP POLICY IF EXISTS tabelas_preco_update ON aba_finance.tabelas_preco;
CREATE POLICY tabelas_preco_update ON aba_finance.tabelas_preco FOR UPDATE
  USING (public.is_account_member(account_id, 'admin') AND access.can('finance', 'update'))
  WITH CHECK (public.is_account_member(account_id, 'admin') AND access.can('finance', 'update'));
DROP POLICY IF EXISTS tabelas_preco_delete ON aba_finance.tabelas_preco;
CREATE POLICY tabelas_preco_delete ON aba_finance.tabelas_preco FOR DELETE
  USING (public.is_account_member(account_id, 'admin') AND access.can('finance', 'delete'));

DROP POLICY IF EXISTS tarifas_select ON aba_finance.tarifas;
CREATE POLICY tarifas_select ON aba_finance.tarifas FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('finance', 'read'));
DROP POLICY IF EXISTS tarifas_insert ON aba_finance.tarifas;
CREATE POLICY tarifas_insert ON aba_finance.tarifas FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin') AND access.can('finance', 'create'));
DROP POLICY IF EXISTS tarifas_update ON aba_finance.tarifas;
CREATE POLICY tarifas_update ON aba_finance.tarifas FOR UPDATE
  USING (public.is_account_member(account_id, 'admin') AND access.can('finance', 'update'))
  WITH CHECK (public.is_account_member(account_id, 'admin') AND access.can('finance', 'update'));
DROP POLICY IF EXISTS tarifas_delete ON aba_finance.tarifas;
CREATE POLICY tarifas_delete ON aba_finance.tarifas FOR DELETE
  USING (public.is_account_member(account_id, 'admin') AND access.can('finance', 'delete'));

DROP POLICY IF EXISTS orcamentos_select ON aba_finance.orcamentos;
CREATE POLICY orcamentos_select ON aba_finance.orcamentos FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('finance', 'read'));
DROP POLICY IF EXISTS orcamentos_insert ON aba_finance.orcamentos;
CREATE POLICY orcamentos_insert ON aba_finance.orcamentos FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('finance', 'create'));
DROP POLICY IF EXISTS orcamentos_update ON aba_finance.orcamentos;
CREATE POLICY orcamentos_update ON aba_finance.orcamentos FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'update'))
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('finance', 'update'));
DROP POLICY IF EXISTS orcamentos_delete ON aba_finance.orcamentos;
CREATE POLICY orcamentos_delete ON aba_finance.orcamentos FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'delete'));

DROP POLICY IF EXISTS itens_orcamento_select ON aba_finance.itens_orcamento;
CREATE POLICY itens_orcamento_select ON aba_finance.itens_orcamento FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('finance', 'read'));
DROP POLICY IF EXISTS itens_orcamento_insert ON aba_finance.itens_orcamento;
CREATE POLICY itens_orcamento_insert ON aba_finance.itens_orcamento FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('finance', 'create'));
DROP POLICY IF EXISTS itens_orcamento_update ON aba_finance.itens_orcamento;
CREATE POLICY itens_orcamento_update ON aba_finance.itens_orcamento FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'update'))
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('finance', 'update'));
DROP POLICY IF EXISTS itens_orcamento_delete ON aba_finance.itens_orcamento;
CREATE POLICY itens_orcamento_delete ON aba_finance.itens_orcamento FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'delete'));

GRANT SELECT, INSERT, UPDATE, DELETE ON aba_finance.tabelas_preco   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON aba_finance.tarifas         TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON aba_finance.orcamentos      TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON aba_finance.itens_orcamento TO authenticated, service_role;

REVOKE ALL ON aba_finance.tabelas_preco   FROM PUBLIC;
REVOKE ALL ON aba_finance.tarifas         FROM PUBLIC;
REVOKE ALL ON aba_finance.orcamentos      FROM PUBLIC;
REVOKE ALL ON aba_finance.itens_orcamento FROM PUBLIC;
REVOKE ALL ON aba_finance.tabelas_preco   FROM anon;
REVOKE ALL ON aba_finance.tarifas         FROM anon;
REVOKE ALL ON aba_finance.orcamentos      FROM anon;
REVOKE ALL ON aba_finance.itens_orcamento FROM anon;

COMMENT ON TABLE aba_finance.tabelas_preco IS
  'Tabela de preco como ENTIDADE COM VIGENCIA (item 41). rascunho -> comprometida -> encerrada. Tarifa comprometida e imutavel: reajuste e TABELA NOVA (reajustar_tabela_preco), nunca UPDATE.';
COMMENT ON TABLE aba_finance.orcamentos IS
  'A vista financeira de UMA opcao do plano. Nao guarda dente nem face: o item aponta para a celula em aba_treatment, e o detalhe clinico so sai por aba_finance.ler_orcamentos(), que registra.';
COMMENT ON COLUMN aba_finance.itens_orcamento.tabela_preco_id IS
  'PROVENIENCIA, nunca escolha: qual tabela de preco resolveu este valor. NULL quando o degrau foi catalogo.';

-- ---------------------------------------------------------------------
-- §11 — VERIFICAÇÕES QUE RECUSAM A MIGRATION
--
-- Não são comentário nem `SELECT` de conferência: cada uma levanta
-- exceção e desfaz tudo. Foi uma verificação assim que impediu, na 03.8,
-- oito colunas de dado de saúde de irem para produção legíveis — depois
-- de a lição já ter sido LIDA e reproduzida assim mesmo
-- (`instrucoes.md` §5).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_faltando TEXT;
  v_sobra    TEXT;
  v_n        INT;
  v_tabelas  TEXT[] := ARRAY['tabelas_preco','tarifas','orcamentos','itens_orcamento'];
  v_funcoes  TEXT[] := ARRAY['comprometer_tabela_preco','encerrar_tabela_preco',
                             'reajustar_tabela_preco','resolver_preco',
                             'montar_orcamento','simular_troca_de_profissional',
                             'trocar_profissional_do_orcamento','aprovar_orcamento','ler_orcamentos',
                             'conferir_tarifa_imutavel','conferir_tabela_preco_congelada',
                             'conferir_tabela_preco_apagavel','conferir_item_orcamento',
                             'conferir_item_orcamento_apagavel','recalcular_total_orcamento',
                             'exigir_alcada_financeira'];
BEGIN
  -- (a) RLS ligada em toda tabela nova — o event trigger da plataforma
  -- filtra `public` e não alcança schema `aba_*`.
  SELECT string_agg(t, ', ') INTO v_faltando
  FROM unnest(v_tabelas || ARRAY['tipos_profissional']) AS t
  WHERE NOT (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relname = t AND n.nspname IN ('aba_finance','aba_scheduling'));
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'RLS não está ligada em: %', v_faltando;
  END IF;

  -- (b) toda tabela nova tem policy — RLS ligada sem policy nega tudo em
  -- silêncio, e o advisor marca isso como INFO, não como erro.
  SELECT string_agg(t, ', ') INTO v_faltando
  FROM unnest(v_tabelas || ARRAY['tipos_profissional']) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = t AND n.nspname IN ('aba_finance','aba_scheduling'));
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Tabela com RLS e sem policy: %', v_faltando;
  END IF;

  -- (c) nenhuma chave estrangeira nova sem isolamento de conta. A guarda
  -- da `039` já lista `aba_finance` e `aba_scheduling` — conferido ANTES
  -- da primeira linha de DDL, que é a lição da 03.8 (guarda por varredura
  -- com a lista de schemas CRAVADA nasce cega para o schema seguinte).
  SELECT count(*) INTO v_n FROM public.fks_sem_isolamento_de_conta();
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Há % chave(s) estrangeira(s) multi-inquilino sem account_id.', v_n;
  END IF;

  -- (c2) e a própria guarda alcança os três schemas que esta migration
  -- tocou. Sem isto, (c) devolveria zero por não olhar.
  IF NOT (pg_get_functiondef('public.fks_sem_isolamento_de_conta()'::regprocedure) LIKE '%aba_finance%'
      AND pg_get_functiondef('public.fks_sem_isolamento_de_conta()'::regprocedure) LIKE '%aba_scheduling%'
      AND pg_get_functiondef('public.fks_sem_isolamento_de_conta()'::regprocedure) LIKE '%aba_treatment%') THEN
    RAISE EXCEPTION 'A auditoria de isolamento não alcança um dos schemas tocados por esta migration.';
  END IF;

  -- (d) nenhuma função nova executável por PUBLIC ou anon
  SELECT string_agg(p.proname, ', ') INTO v_sobra
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('aba_finance','aba_scheduling')
    AND p.proname = ANY (v_funcoes || ARRAY['semear_tipos_profissional'])
    AND (has_function_privilege('public', p.oid, 'EXECUTE')
         OR has_function_privilege('anon', p.oid, 'EXECUTE'));
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'Função executável por PUBLIC/anon: %', v_sobra;
  END IF;

  -- (e) `anon` não alcança nenhuma tabela nova
  SELECT string_agg(t, ', ') INTO v_sobra
  FROM unnest(v_tabelas) AS t
  WHERE has_table_privilege('anon', ('aba_finance.' || t)::regclass, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE');
  IF v_sobra IS NOT NULL OR has_table_privilege('anon', 'aba_scheduling.tipos_profissional'::regclass,
                                                'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') THEN
    RAISE EXCEPTION 'anon alcança tabela nova: %', COALESCE(v_sobra, 'tipos_profissional');
  END IF;

  -- (f) ninguém recebeu TRUNCATE — ele não passa por RLS
  SELECT string_agg(t, ', ') INTO v_sobra
  FROM unnest(v_tabelas) AS t
  WHERE has_table_privilege('authenticated', ('aba_finance.' || t)::regclass, 'TRUNCATE');
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'authenticated recebeu TRUNCATE em: %', v_sobra;
  END IF;

  -- (g) O PREÇO SE RESOLVE, NÃO SE ESCOLHE — medido no catálogo, não
  -- suposto pela leitura do código. Se algum dia alguém acrescentar um
  -- parâmetro de tabela de preço a `resolver_preco`, a escada vira uma
  -- sugestão e a tela volta a poder escolher. Esta é a linha que recusa.
  IF pg_get_function_identity_arguments('aba_finance.resolver_preco(uuid,uuid,uuid,date)'::regprocedure)
     ILIKE '%tabela%' THEN
    RAISE EXCEPTION 'resolver_preco ganhou parâmetro de tabela de preço — o preço voltaria a ser ESCOLHIDO.';
  END IF;

  -- (h) A DECISÃO DO P-SUB, medida: `itens_orcamento` não guarda dado
  -- clínico. Coluna que não existe não vaza por esquecimento, e é por
  -- isso que esta verificação vale mais que uma revogação de privilégio.
  SELECT string_agg(column_name, ', ') INTO v_sobra
  FROM information_schema.columns
  WHERE table_schema = 'aba_finance' AND table_name IN ('itens_orcamento','orcamentos')
    AND column_name IN ('dente','faces','descricao','observacao','titulo');
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'O orçamento passou a guardar dado clínico (%) — isso é porta lateral para fora de aba_health.', v_sobra;
  END IF;

  -- (i) as travas de imutabilidade estão nas duas pontas
  SELECT string_agg(x.g, ', ') INTO v_faltando
  FROM (VALUES
    ('trg_tarifas_imutaveis', 'aba_finance.tarifas'),
    ('trg_tabelas_preco_congeladas', 'aba_finance.tabelas_preco'),
    ('trg_tabelas_preco_apagaveis', 'aba_finance.tabelas_preco'),
    ('trg_itens_orcamento_total', 'aba_finance.itens_orcamento'),
    ('trg_itens_orcamento_conferir', 'aba_finance.itens_orcamento')
  ) AS x(g, tab)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger tg WHERE tg.tgrelid = x.tab::regclass
      AND tg.tgname = x.g AND NOT tg.tgisinternal);
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Gatilho ausente: %', v_faltando;
  END IF;

  -- (j) a alçada financeira alcança as TRÊS tabelas de dinheiro, e não só
  -- a nova. A regra é de produto, não do código escrito hoje.
  SELECT string_agg(x.g, ', ') INTO v_faltando
  FROM (VALUES
    ('trg_orcamentos_alcada', 'aba_finance.orcamentos'),
    ('trg_contratos_alcada', 'aba_finance.contratos'),
    ('trg_parcelas_contrato_alcada', 'aba_finance.parcelas_contrato')
  ) AS x(g, tab)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger tg WHERE tg.tgrelid = x.tab::regclass
      AND tg.tgname = x.g AND NOT tg.tgisinternal);
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Trava de alçada financeira ausente em: %', v_faltando;
  END IF;

  -- (k) A RÉGUA DE `aba_finance`: nenhuma função desta migration escreve
  -- nas tabelas mantidas por gatilho. A cobrança que nasce da aprovação é
  -- da 03.8.b, e passa pelas operações da `011` — nunca por `INSERT`
  -- direto. Verificado no CORPO da função, no catálogo: um comentário
  -- dizendo "não escrevemos em faturas" não impede ninguém de escrever.
  SELECT string_agg(p.proname, ', ') INTO v_sobra
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'aba_finance'
    AND p.proname = ANY (v_funcoes)
    AND pg_get_functiondef(p.oid) ~*
        '(insert\s+into|update|delete\s+from)\s+aba_finance\.(faturas|itens_fatura|pagamentos|pacotes_cliente|saldos_pacote|extrato_pacote)';
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'Função da 03.8.a escreve em tabela mantida por gatilho (%s) — tudo em aba_finance passa pelas operações da 011.', v_sobra;
  END IF;

  -- (l) toda conta tem os dois tipos de profissional semeados, senão o
  -- degrau 2 da escada — o único que a fonte prova — não teria alvo.
  SELECT count(*) INTO v_n
  FROM public.accounts a
  WHERE (SELECT count(*) FROM aba_scheduling.tipos_profissional t WHERE t.account_id = a.id) < 2;
  IF v_n > 0 THEN
    RAISE EXCEPTION '% conta(s) sem os tipos de profissional padrão.', v_n;
  END IF;
END $$;
