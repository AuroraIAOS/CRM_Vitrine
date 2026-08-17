-- ============================================================
-- 010_aba_finance.sql — schema aba_finance (contratos, faturas, planos
-- vendidos, comissão)
--
-- Mapa de origem: db/migrations/README.md → aba_finance
-- (046_finance_schema.sql + hardening 071_finance_operations.sql,
-- 078_brl_only.sql, 079_finance_contract_terms.sql, todos já embutidos
-- no DDL inicial — não como patch posterior). 071 (as funções de
-- operação) vem em 011_aba_finance_operations.sql, por ser bloco
-- grande o suficiente para o próprio arquivo. Nomes traduzidos
-- conforme docs/02_MODELO_DE_DADOS.md §7: contracts→contratos,
-- invoices→faturas, invoice_items→itens_fatura, invoice_dispatches→
-- envios_fatura, payments→pagamentos, customer_packages→
-- planos_cliente, package_balances→saldos_plano, package_ledger→
-- extrato_plano, commission_rules→regras_comissao,
-- commission_entries→lancamentos_comissao.
--
-- Este é o schema que fecha a circularidade aparente com
-- aba_scheduling: aba_finance depende de aba_scheduling (não o
-- contrário) — por isso é aqui, e não em 009, que vivem as FKs para
-- aba_scheduling.agendamentos e o trigger AFTER UPDATE que reage à
-- conclusão do atendimento. aba_scheduling continua sem saber que
-- aba_finance existe, e segue exportável sozinho.
--
-- 078_brl_only (Maximus) era migration de DADO — corrigia contas
-- antigas que nasceram em USD por herança do fork. Vitrine é
-- greenfield: não existem contratos/faturas legados para corrigir, e
-- por isso o equivalente aqui é só o DEFAULT 'BRL' já na criação da
-- coluna, sem UPDATE de backfill.
--
-- BLOQUEIO DE ESCOPO — envios_fatura.provedor: o original do Maximus
-- aceita ('meta','evolution'). Evolution GO está fora do MVP
-- (CLAUDE.md §15) — o CHECK aqui restringe a ('meta'), único canal
-- vivo no v01. Ampliar o CHECK quando/se Evolution GO for aprovado é
-- mudança trivial de constraint, não motivo para incluir a opção agora
-- sem decisão de Max.
--
-- RLS no padrão obrigatório de docs/02 §2, module_key = 'finance', com
-- a exceção herdada do Maximus: regras_comissao e lancamentos_comissao
-- têm leitura (e escrita) restrita a admin+ — "um profissional não
-- enxerga a comissão dos colegas".
--
-- Hardening dobrado desde a primeira migration — mesmo padrão de
-- 008/009.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS aba_finance;

CREATE OR REPLACE FUNCTION aba_finance.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION aba_finance.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.set_updated_at() FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.set_updated_at() TO authenticated, service_role;

-- ============================================================
-- Contratos — já com os termos comerciais da 079 (parcelamento,
-- juros, mora, dia de vencimento, forma de pagamento, plano vendido)
-- desde a criação, em vez de ALTER TABLE posterior.
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_finance.contratos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  cliente_id       UUID NOT NULL REFERENCES aba_people.clientes(id) ON DELETE RESTRICT,
  -- FK legítima: aba_finance depende de aba_catalog (ver cabeçalho).
  plano_id         UUID REFERENCES aba_catalog.planos(id) ON DELETE RESTRICT,
  codigo           TEXT,
  descricao        TEXT,
  valor            NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  moeda            TEXT NOT NULL DEFAULT 'BRL' CHECK (moeda ~ '^[A-Z]{3}$'),
  ciclo_cobranca   TEXT NOT NULL DEFAULT 'unica'
    CHECK (ciclo_cobranca IN ('unica','mensal','trimestral','anual')),
  data_inicio      DATE,
  data_fim         DATE,
  status           TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','ativo','encerrado','cancelado')),
  parcelas         INTEGER NOT NULL DEFAULT 1 CHECK (parcelas >= 1),
  taxa_juros       NUMERIC(5,2) NOT NULL DEFAULT 0,
  taxa_multa_atraso NUMERIC(5,2) NOT NULL DEFAULT 0,
  dia_vencimento   SMALLINT CHECK (dia_vencimento IS NULL OR (dia_vencimento BETWEEN 1 AND 31)),
  forma_pagamento  TEXT
    CHECK (forma_pagamento IS NULL OR forma_pagamento IN
           ('dinheiro','pix','credito','debito','boleto','transferencia','outro')),
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (taxa_juros >= 0 AND taxa_multa_atraso >= 0)
);
CREATE INDEX IF NOT EXISTS idx_contratos_account ON aba_finance.contratos(account_id);
CREATE INDEX IF NOT EXISTS idx_contratos_cliente ON aba_finance.contratos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_contratos_plano ON aba_finance.contratos(plano_id)
  WHERE plano_id IS NOT NULL;

ALTER TABLE aba_finance.contratos ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_finance.contratos;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_finance.contratos
  FOR EACH ROW EXECUTE FUNCTION aba_finance.set_updated_at();

DROP POLICY IF EXISTS contratos_select ON aba_finance.contratos;
CREATE POLICY contratos_select ON aba_finance.contratos FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('finance', 'read'));
DROP POLICY IF EXISTS contratos_insert ON aba_finance.contratos;
CREATE POLICY contratos_insert ON aba_finance.contratos FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('finance', 'create'));
DROP POLICY IF EXISTS contratos_update ON aba_finance.contratos;
CREATE POLICY contratos_update ON aba_finance.contratos FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'update'));
DROP POLICY IF EXISTS contratos_delete ON aba_finance.contratos;
CREATE POLICY contratos_delete ON aba_finance.contratos FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'delete'));

-- ============================================================
-- Parcelas do contrato (079) — valor e vencimento individualizados;
-- distribuição igualitária automática com edição posterior é
-- responsabilidade da aplicação (Etapa 02), não do banco.
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_finance.parcelas_contrato (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contrato_id  UUID NOT NULL REFERENCES aba_finance.contratos(id) ON DELETE CASCADE,
  -- Preenchida quando a parcela virar fatura (Etapa 02). SET NULL, e
  -- não CASCADE: apagar a fatura não pode apagar a parcela do contrato.
  fatura_id    UUID,
  numero       INTEGER NOT NULL CHECK (numero >= 1),
  valor        NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  data_vencimento DATE NOT NULL,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Impede a segunda "parcela 3" do mesmo contrato — o que uma geração
  -- automática produziria se rodasse duas vezes por reprocessamento.
  UNIQUE (contrato_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_parcelas_contrato_contrato ON aba_finance.parcelas_contrato(contrato_id);

ALTER TABLE aba_finance.parcelas_contrato ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parcelas_contrato_select ON aba_finance.parcelas_contrato;
CREATE POLICY parcelas_contrato_select ON aba_finance.parcelas_contrato FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('finance', 'read'));
DROP POLICY IF EXISTS parcelas_contrato_insert ON aba_finance.parcelas_contrato;
CREATE POLICY parcelas_contrato_insert ON aba_finance.parcelas_contrato FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('finance', 'create'));
DROP POLICY IF EXISTS parcelas_contrato_update ON aba_finance.parcelas_contrato;
CREATE POLICY parcelas_contrato_update ON aba_finance.parcelas_contrato FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'update'));
DROP POLICY IF EXISTS parcelas_contrato_delete ON aba_finance.parcelas_contrato;
CREATE POLICY parcelas_contrato_delete ON aba_finance.parcelas_contrato FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'delete'));

-- ============================================================
-- Faturas
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_finance.faturas (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contrato_id            UUID REFERENCES aba_finance.contratos(id) ON DELETE SET NULL,
  cliente_id             UUID NOT NULL REFERENCES aba_people.clientes(id) ON DELETE RESTRICT,
  numero                 TEXT,
  valor                  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  moeda                  TEXT NOT NULL DEFAULT 'BRL' CHECK (moeda ~ '^[A-Z]{3}$'),
  data_emissao           DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento        DATE,
  status                 TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','aberta','enviada','paga','vencida','cancelada')),
  instrucoes_pagamento   TEXT,
  observacoes            TEXT,
  criado_em              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_faturas_account_status ON aba_finance.faturas(account_id, status);
CREATE INDEX IF NOT EXISTS idx_faturas_cliente ON aba_finance.faturas(cliente_id);
-- Caminho da rotina de faturas vencidas (011_aba_finance_operations.sql).
CREATE INDEX IF NOT EXISTS idx_faturas_vencimento ON aba_finance.faturas(data_vencimento)
  WHERE status IN ('aberta','enviada');

-- FK adiada de parcelas_contrato.fatura_id — só pode ser criada depois
-- que aba_finance.faturas existe (ambas nascem nesta migration).
ALTER TABLE aba_finance.parcelas_contrato
  DROP CONSTRAINT IF EXISTS parcelas_contrato_fatura_id_fkey;
ALTER TABLE aba_finance.parcelas_contrato
  ADD CONSTRAINT parcelas_contrato_fatura_id_fkey
  FOREIGN KEY (fatura_id) REFERENCES aba_finance.faturas(id) ON DELETE SET NULL;

ALTER TABLE aba_finance.faturas ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_finance.faturas;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_finance.faturas
  FOR EACH ROW EXECUTE FUNCTION aba_finance.set_updated_at();

DROP POLICY IF EXISTS faturas_select ON aba_finance.faturas;
CREATE POLICY faturas_select ON aba_finance.faturas FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('finance', 'read'));
DROP POLICY IF EXISTS faturas_insert ON aba_finance.faturas;
CREATE POLICY faturas_insert ON aba_finance.faturas FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('finance', 'create'));
DROP POLICY IF EXISTS faturas_update ON aba_finance.faturas;
CREATE POLICY faturas_update ON aba_finance.faturas FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'update'));
DROP POLICY IF EXISTS faturas_delete ON aba_finance.faturas;
CREATE POLICY faturas_delete ON aba_finance.faturas FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'delete'));

CREATE TABLE IF NOT EXISTS aba_finance.itens_fatura (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  fatura_id      UUID NOT NULL REFERENCES aba_finance.faturas(id) ON DELETE CASCADE,
  descricao      TEXT NOT NULL,
  quantidade     NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  valor_unitario NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
  valor_total    NUMERIC(12,2) NOT NULL DEFAULT 0,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_itens_fatura_fatura ON aba_finance.itens_fatura(fatura_id);

ALTER TABLE aba_finance.itens_fatura ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS itens_fatura_select ON aba_finance.itens_fatura;
CREATE POLICY itens_fatura_select ON aba_finance.itens_fatura FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('finance', 'read'));
DROP POLICY IF EXISTS itens_fatura_insert ON aba_finance.itens_fatura;
CREATE POLICY itens_fatura_insert ON aba_finance.itens_fatura FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('finance', 'create'));
DROP POLICY IF EXISTS itens_fatura_update ON aba_finance.itens_fatura;
CREATE POLICY itens_fatura_update ON aba_finance.itens_fatura FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'update'));
DROP POLICY IF EXISTS itens_fatura_delete ON aba_finance.itens_fatura;
CREATE POLICY itens_fatura_delete ON aba_finance.itens_fatura FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'delete'));

CREATE TABLE IF NOT EXISTS aba_finance.envios_fatura (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  fatura_id    UUID NOT NULL REFERENCES aba_finance.faturas(id) ON DELETE CASCADE,
  canal        TEXT NOT NULL DEFAULT 'whatsapp' CHECK (canal IN ('whatsapp')),
  -- Ver cabeçalho: só 'meta' — Evolution GO fora do MVP.
  provedor     TEXT NOT NULL CHECK (provedor IN ('meta')),
  -- Sem FK — aba_messaging.mensagens só existe na Subetapa 01.6.
  mensagem_id  UUID,
  status       TEXT NOT NULL DEFAULT 'enfileirado' CHECK (status IN ('enfileirado','enviado','falhou')),
  erro         TEXT,
  enviado_em   TIMESTAMPTZ,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_envios_fatura_fatura ON aba_finance.envios_fatura(fatura_id);

ALTER TABLE aba_finance.envios_fatura ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS envios_fatura_select ON aba_finance.envios_fatura;
CREATE POLICY envios_fatura_select ON aba_finance.envios_fatura FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('finance', 'read'));
DROP POLICY IF EXISTS envios_fatura_insert ON aba_finance.envios_fatura;
CREATE POLICY envios_fatura_insert ON aba_finance.envios_fatura FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('finance', 'create'));
DROP POLICY IF EXISTS envios_fatura_update ON aba_finance.envios_fatura;
CREATE POLICY envios_fatura_update ON aba_finance.envios_fatura FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'update'));
DROP POLICY IF EXISTS envios_fatura_delete ON aba_finance.envios_fatura;
CREATE POLICY envios_fatura_delete ON aba_finance.envios_fatura FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'delete'));

CREATE TABLE IF NOT EXISTS aba_finance.pagamentos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  fatura_id      UUID NOT NULL REFERENCES aba_finance.faturas(id) ON DELETE CASCADE,
  valor          NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  pago_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  forma_pagamento TEXT CHECK (forma_pagamento IS NULL OR forma_pagamento IN
                    ('pix','cartao','dinheiro','transferencia','plano','outro')),
  referencia     TEXT,
  confirmado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  url_recibo     TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pagamentos_fatura ON aba_finance.pagamentos(fatura_id);

ALTER TABLE aba_finance.pagamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pagamentos_select ON aba_finance.pagamentos;
CREATE POLICY pagamentos_select ON aba_finance.pagamentos FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('finance', 'read'));
DROP POLICY IF EXISTS pagamentos_insert ON aba_finance.pagamentos;
CREATE POLICY pagamentos_insert ON aba_finance.pagamentos FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('finance', 'create'));
DROP POLICY IF EXISTS pagamentos_update ON aba_finance.pagamentos;
CREATE POLICY pagamentos_update ON aba_finance.pagamentos FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'update'));
DROP POLICY IF EXISTS pagamentos_delete ON aba_finance.pagamentos;
CREATE POLICY pagamentos_delete ON aba_finance.pagamentos FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'delete'));

-- ============================================================
-- Planos vendidos e saldo (venda de plano do catálogo gerando sessões
-- a consumir)
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_finance.planos_cliente (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  cliente_id    UUID NOT NULL REFERENCES aba_people.clientes(id) ON DELETE RESTRICT,
  plano_id      UUID NOT NULL REFERENCES aba_catalog.planos(id) ON DELETE RESTRICT,
  fatura_id     UUID REFERENCES aba_finance.faturas(id) ON DELETE SET NULL,
  comprado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em     TIMESTAMPTZ,
  preco_total   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (preco_total >= 0),
  status        TEXT NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo','esgotado','vencido','cancelado')),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_planos_cliente_cliente ON aba_finance.planos_cliente(cliente_id);
CREATE INDEX IF NOT EXISTS idx_planos_cliente_vencendo ON aba_finance.planos_cliente(expira_em)
  WHERE status = 'ativo';

ALTER TABLE aba_finance.planos_cliente ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_finance.planos_cliente;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_finance.planos_cliente
  FOR EACH ROW EXECUTE FUNCTION aba_finance.set_updated_at();

DROP POLICY IF EXISTS planos_cliente_select ON aba_finance.planos_cliente;
CREATE POLICY planos_cliente_select ON aba_finance.planos_cliente FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('finance', 'read'));
DROP POLICY IF EXISTS planos_cliente_insert ON aba_finance.planos_cliente;
CREATE POLICY planos_cliente_insert ON aba_finance.planos_cliente FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('finance', 'create'));
DROP POLICY IF EXISTS planos_cliente_update ON aba_finance.planos_cliente;
CREATE POLICY planos_cliente_update ON aba_finance.planos_cliente FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'update'));
DROP POLICY IF EXISTS planos_cliente_delete ON aba_finance.planos_cliente;
CREATE POLICY planos_cliente_delete ON aba_finance.planos_cliente FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'delete'));

CREATE TABLE IF NOT EXISTS aba_finance.saldos_plano (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  plano_cliente_id    UUID NOT NULL REFERENCES aba_finance.planos_cliente(id) ON DELETE CASCADE,
  servico_id          UUID NOT NULL REFERENCES aba_catalog.servicos(id) ON DELETE RESTRICT,
  variante_servico_id UUID REFERENCES aba_catalog.variantes_servico(id) ON DELETE SET NULL,
  sessoes_totais      INTEGER NOT NULL CHECK (sessoes_totais > 0),
  sessoes_usadas      INTEGER NOT NULL DEFAULT 0 CHECK (sessoes_usadas >= 0),
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Impede consumir mais do que foi vendido, mesmo escrevendo direto
  -- no banco. O contador é consequência do extrato, o teto é do banco.
  CHECK (sessoes_usadas <= sessoes_totais)
);
CREATE INDEX IF NOT EXISTS idx_saldos_plano_plano ON aba_finance.saldos_plano(plano_cliente_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_saldos_plano_servico_unico
  ON aba_finance.saldos_plano(plano_cliente_id, servico_id);

ALTER TABLE aba_finance.saldos_plano ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saldos_plano_select ON aba_finance.saldos_plano;
CREATE POLICY saldos_plano_select ON aba_finance.saldos_plano FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('finance', 'read'));
DROP POLICY IF EXISTS saldos_plano_insert ON aba_finance.saldos_plano;
CREATE POLICY saldos_plano_insert ON aba_finance.saldos_plano FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('finance', 'create'));
DROP POLICY IF EXISTS saldos_plano_update ON aba_finance.saldos_plano;
CREATE POLICY saldos_plano_update ON aba_finance.saldos_plano FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'update'));
DROP POLICY IF EXISTS saldos_plano_delete ON aba_finance.saldos_plano;
CREATE POLICY saldos_plano_delete ON aba_finance.saldos_plano FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'delete'));

-- Livro de movimentação. "Contador de saldo alterado sem lançamento no
-- livro é bug esperando acontecer" (handoffs/instrucoes.md §6) — o
-- contador em saldos_plano é consequência deste extrato, nunca a fonte
-- da verdade.
CREATE TABLE IF NOT EXISTS aba_finance.extrato_plano (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  plano_cliente_id  UUID NOT NULL REFERENCES aba_finance.planos_cliente(id) ON DELETE CASCADE,
  agendamento_id    UUID REFERENCES aba_scheduling.agendamentos(id) ON DELETE SET NULL,
  servico_id        UUID NOT NULL REFERENCES aba_catalog.servicos(id) ON DELETE RESTRICT,
  delta             INTEGER NOT NULL CHECK (delta <> 0),
  motivo            TEXT,
  criado_por        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_extrato_plano_plano ON aba_finance.extrato_plano(plano_cliente_id);

ALTER TABLE aba_finance.extrato_plano ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS extrato_plano_select ON aba_finance.extrato_plano;
CREATE POLICY extrato_plano_select ON aba_finance.extrato_plano FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('finance', 'read'));
DROP POLICY IF EXISTS extrato_plano_insert ON aba_finance.extrato_plano;
CREATE POLICY extrato_plano_insert ON aba_finance.extrato_plano FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('finance', 'create'));
DROP POLICY IF EXISTS extrato_plano_update ON aba_finance.extrato_plano;
CREATE POLICY extrato_plano_update ON aba_finance.extrato_plano FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'update'));
DROP POLICY IF EXISTS extrato_plano_delete ON aba_finance.extrato_plano;
CREATE POLICY extrato_plano_delete ON aba_finance.extrato_plano FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('finance', 'delete'));

-- ============================================================
-- Comissão — exceção declarada em docs/02: leitura e escrita
-- restritas a admin+, para um profissional não enxergar a comissão dos
-- colegas.
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_finance.regras_comissao (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  profissional_id UUID NOT NULL REFERENCES aba_scheduling.profissionais(id) ON DELETE CASCADE,
  -- NULL = regra geral do profissional (ordem de resolução abaixo).
  servico_id      UUID REFERENCES aba_catalog.servicos(id) ON DELETE CASCADE,
  percentual      NUMERIC(5,2) NOT NULL CHECK (percentual >= 0 AND percentual <= 100),
  vigente_de      DATE NOT NULL DEFAULT CURRENT_DATE,
  vigente_ate     DATE,
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_regras_comissao_lookup
  ON aba_finance.regras_comissao(profissional_id, servico_id) WHERE ativo;

ALTER TABLE aba_finance.regras_comissao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS regras_comissao_select ON aba_finance.regras_comissao;
CREATE POLICY regras_comissao_select ON aba_finance.regras_comissao FOR SELECT
  USING (public.is_account_member(account_id, 'admin') AND access.can('finance', 'read'));
DROP POLICY IF EXISTS regras_comissao_insert ON aba_finance.regras_comissao;
CREATE POLICY regras_comissao_insert ON aba_finance.regras_comissao FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin') AND access.can('finance', 'create'));
DROP POLICY IF EXISTS regras_comissao_update ON aba_finance.regras_comissao;
CREATE POLICY regras_comissao_update ON aba_finance.regras_comissao FOR UPDATE
  USING (public.is_account_member(account_id, 'admin') AND access.can('finance', 'update'));
DROP POLICY IF EXISTS regras_comissao_delete ON aba_finance.regras_comissao;
CREATE POLICY regras_comissao_delete ON aba_finance.regras_comissao FOR DELETE
  USING (public.is_account_member(account_id, 'admin') AND access.can('finance', 'delete'));

CREATE TABLE IF NOT EXISTS aba_finance.lancamentos_comissao (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  agendamento_id     UUID REFERENCES aba_scheduling.agendamentos(id) ON DELETE SET NULL,
  profissional_id    UUID NOT NULL REFERENCES aba_scheduling.profissionais(id) ON DELETE RESTRICT,
  servico_id         UUID REFERENCES aba_catalog.servicos(id) ON DELETE SET NULL,
  valor_base         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor_base >= 0),
  percentual         NUMERIC(5,2) NOT NULL DEFAULT 0,
  valor_comissao     NUMERIC(12,2) NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','aprovado','pago','cancelado')),
  pago_em            TIMESTAMPTZ,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lancamentos_comissao_profissional
  ON aba_finance.lancamentos_comissao(profissional_id, criado_em DESC);
-- Uma comissão por atendimento: se a conclusão disparar duas vezes
-- (retry, reprocessamento), a segunda não gera lançamento duplicado.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lancamentos_comissao_um_por_agendamento
  ON aba_finance.lancamentos_comissao(agendamento_id) WHERE agendamento_id IS NOT NULL;

ALTER TABLE aba_finance.lancamentos_comissao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lancamentos_comissao_select ON aba_finance.lancamentos_comissao;
CREATE POLICY lancamentos_comissao_select ON aba_finance.lancamentos_comissao FOR SELECT
  USING (public.is_account_member(account_id, 'admin') AND access.can('finance', 'read'));
DROP POLICY IF EXISTS lancamentos_comissao_insert ON aba_finance.lancamentos_comissao;
CREATE POLICY lancamentos_comissao_insert ON aba_finance.lancamentos_comissao FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin') AND access.can('finance', 'create'));
DROP POLICY IF EXISTS lancamentos_comissao_update ON aba_finance.lancamentos_comissao;
CREATE POLICY lancamentos_comissao_update ON aba_finance.lancamentos_comissao FOR UPDATE
  USING (public.is_account_member(account_id, 'admin') AND access.can('finance', 'update'));
DROP POLICY IF EXISTS lancamentos_comissao_delete ON aba_finance.lancamentos_comissao;
CREATE POLICY lancamentos_comissao_delete ON aba_finance.lancamentos_comissao FOR DELETE
  USING (public.is_account_member(account_id, 'admin') AND access.can('finance', 'delete'));

-- ============================================================
-- Trigger de total do item da fatura
-- ============================================================
CREATE OR REPLACE FUNCTION aba_finance.calcular_total_item_fatura()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  NEW.valor_total := ROUND(NEW.quantidade * NEW.valor_unitario, 2);
  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_finance.calcular_total_item_fatura() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.calcular_total_item_fatura() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.calcular_total_item_fatura() FROM anon;
REVOKE ALL ON FUNCTION aba_finance.calcular_total_item_fatura() FROM authenticated;

DROP TRIGGER IF EXISTS calcular_total_item_fatura ON aba_finance.itens_fatura;
CREATE TRIGGER calcular_total_item_fatura
  BEFORE INSERT OR UPDATE OF quantidade, valor_unitario ON aba_finance.itens_fatura
  FOR EACH ROW EXECUTE FUNCTION aba_finance.calcular_total_item_fatura();

-- ============================================================
-- Trigger de baixa — transição para 'paga' quando a soma dos
-- pagamentos alcança o valor da fatura. "Pagamento parcial mantém a
-- fatura em aberto com saldo visível": a comparação é sobre a SOMA, e
-- não sobre o pagamento individual. O ramo ELSE desfaz a baixa caso um
-- pagamento seja estornado ou corrigido para menos.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_finance.baixar_fatura_por_pagamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = aba_finance, public
AS $$
DECLARE
  v_fatura_id UUID := COALESCE(NEW.fatura_id, OLD.fatura_id);
  v_valor NUMERIC(12,2);
  v_pago NUMERIC(12,2);
  v_status TEXT;
BEGIN
  SELECT valor, status INTO v_valor, v_status
  FROM aba_finance.faturas WHERE id = v_fatura_id;

  IF v_status IS NULL OR v_status IN ('cancelada', 'rascunho') THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(valor), 0) INTO v_pago
  FROM aba_finance.pagamentos WHERE fatura_id = v_fatura_id;

  IF v_pago >= v_valor AND v_valor > 0 THEN
    UPDATE aba_finance.faturas SET status = 'paga'
    WHERE id = v_fatura_id AND status <> 'paga';
  ELSE
    UPDATE aba_finance.faturas SET status = 'enviada'
    WHERE id = v_fatura_id AND status = 'paga';
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION aba_finance.baixar_fatura_por_pagamento() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.baixar_fatura_por_pagamento() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.baixar_fatura_por_pagamento() FROM anon;
REVOKE ALL ON FUNCTION aba_finance.baixar_fatura_por_pagamento() FROM authenticated;

DROP TRIGGER IF EXISTS baixar_fatura_por_pagamento ON aba_finance.pagamentos;
CREATE TRIGGER baixar_fatura_por_pagamento
  AFTER INSERT OR UPDATE OR DELETE ON aba_finance.pagamentos
  FOR EACH ROW EXECUTE FUNCTION aba_finance.baixar_fatura_por_pagamento();

-- ============================================================
-- O extrato move o contador — nunca o contrário. delta -1 (consumo)
-- faz sessoes_usadas subir 1; delta +1 (estorno) faz descer. Estorno é
-- lançamento próprio, jamais alteração direta do contador. O CHECK
-- (sessoes_usadas <= sessoes_totais) da tabela impede consumir sessão
-- que não foi vendida.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_finance.aplicar_extrato_ao_saldo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = aba_finance, public
AS $$
DECLARE
  v_restante INTEGER;
BEGIN
  UPDATE aba_finance.saldos_plano
  SET sessoes_usadas = sessoes_usadas - NEW.delta
  WHERE plano_cliente_id = NEW.plano_cliente_id
    AND servico_id = NEW.servico_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Não há saldo cadastrado para este serviço neste plano (plano_cliente_id=%, servico_id=%)',
      NEW.plano_cliente_id, NEW.servico_id
      USING ERRCODE = '23514';
  END IF;

  SELECT SUM(sessoes_totais - sessoes_usadas) INTO v_restante
  FROM aba_finance.saldos_plano
  WHERE plano_cliente_id = NEW.plano_cliente_id;

  IF v_restante <= 0 THEN
    UPDATE aba_finance.planos_cliente SET status = 'esgotado'
    WHERE id = NEW.plano_cliente_id AND status = 'ativo';
  ELSE
    UPDATE aba_finance.planos_cliente SET status = 'ativo'
    WHERE id = NEW.plano_cliente_id AND status = 'esgotado';
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION aba_finance.aplicar_extrato_ao_saldo() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.aplicar_extrato_ao_saldo() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.aplicar_extrato_ao_saldo() FROM anon;
REVOKE ALL ON FUNCTION aba_finance.aplicar_extrato_ao_saldo() FROM authenticated;

DROP TRIGGER IF EXISTS aplicar_extrato_ao_saldo ON aba_finance.extrato_plano;
CREATE TRIGGER aplicar_extrato_ao_saldo
  AFTER INSERT ON aba_finance.extrato_plano
  FOR EACH ROW EXECUTE FUNCTION aba_finance.aplicar_extrato_ao_saldo();

-- ============================================================
-- Conclusão do atendimento — os dois efeitos financeiros (consumo de
-- saldo de plano + geração de comissão). O terceiro efeito (carimbar
-- concluido_em) fica em aba_scheduling, que não precisa do financeiro
-- para isso. Trigger CRUZA SCHEMA de propósito: mora em aba_finance
-- porque é aba_finance quem depende de aba_scheduling, nunca o
-- contrário (ver cabeçalho).
--
-- Resolução da regra de comissão: regra vigente para profissional +
-- serviço; senão regra vigente geral do profissional (servico_id
-- NULL); senão comissão zero. O ORDER BY com (servico_id IS NOT NULL)
-- DESC é o que põe a regra específica na frente da geral.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_finance.ao_concluir_agendamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = aba_finance, aba_scheduling, public
AS $$
DECLARE
  v_row RECORD;
  v_servico_id UUID;
  v_pct NUMERIC(5,2);
  v_base NUMERIC(12,2);
BEGIN
  IF NEW.status <> 'concluido' OR OLD.status = 'concluido' THEN
    RETURN NULL;
  END IF;

  IF NEW.plano_cliente_id IS NOT NULL THEN
    FOR v_row IN
      SELECT servico_id FROM aba_scheduling.agendamento_servicos
      WHERE agendamento_id = NEW.id
    LOOP
      INSERT INTO aba_finance.extrato_plano
        (account_id, plano_cliente_id, agendamento_id, servico_id, delta, motivo, criado_por)
      VALUES
        (NEW.account_id, NEW.plano_cliente_id, NEW.id, v_row.servico_id, -1,
         'Consumo por atendimento concluído', NEW.criado_por);
    END LOOP;
  END IF;

  SELECT servico_id INTO v_servico_id
  FROM aba_scheduling.agendamento_servicos
  WHERE agendamento_id = NEW.id
  LIMIT 1;

  v_base := COALESCE(NEW.valor_cobrado, 0);

  SELECT rc.percentual INTO v_pct
  FROM aba_finance.regras_comissao rc
  WHERE rc.profissional_id = NEW.profissional_id
    AND rc.ativo
    AND rc.vigente_de <= CURRENT_DATE
    AND (rc.vigente_ate IS NULL OR rc.vigente_ate >= CURRENT_DATE)
    AND (rc.servico_id = v_servico_id OR rc.servico_id IS NULL)
  ORDER BY (rc.servico_id IS NOT NULL) DESC, rc.vigente_de DESC
  LIMIT 1;

  v_pct := COALESCE(v_pct, 0);

  INSERT INTO aba_finance.lancamentos_comissao
    (account_id, agendamento_id, profissional_id, servico_id,
     valor_base, percentual, valor_comissao)
  VALUES
    (NEW.account_id, NEW.id, NEW.profissional_id, v_servico_id,
     v_base, v_pct, ROUND(v_base * v_pct / 100, 2))
  ON CONFLICT (agendamento_id) WHERE agendamento_id IS NOT NULL DO NOTHING;

  RETURN NULL;
END;
$$;

ALTER FUNCTION aba_finance.ao_concluir_agendamento() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.ao_concluir_agendamento() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.ao_concluir_agendamento() FROM anon;
REVOKE ALL ON FUNCTION aba_finance.ao_concluir_agendamento() FROM authenticated;

DROP TRIGGER IF EXISTS finance_ao_concluir_agendamento ON aba_scheduling.agendamentos;
CREATE TRIGGER finance_ao_concluir_agendamento
  AFTER UPDATE OF status ON aba_scheduling.agendamentos
  FOR EACH ROW EXECUTE FUNCTION aba_finance.ao_concluir_agendamento();

-- ============================================================
-- GRANT estreito + ALTER DEFAULT PRIVILEGES — mesmo padrão de
-- 008/009.
-- ============================================================
GRANT USAGE ON SCHEMA aba_finance TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA aba_finance TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA aba_finance TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_finance
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_finance
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_finance
  GRANT ALL ON TABLES TO service_role;
