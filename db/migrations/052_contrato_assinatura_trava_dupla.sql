-- =====================================================================
-- 052 — Contrato: itens heterogêneos, documento canônico, assinatura
--       presencial das duas partes e a trava dupla de finalização
--       (Subetapa 03.8.b)
--
-- Decisões de Max que esta migration executa — D-V3, D-V4, D-V8, D-V9 e
-- D-V10 (2026-09-04) — e as sete que ele tomou à pergunta desta subetapa,
-- em 2026-09-14, registradas em `docs/08_CAMINHO_FELIZ.md` §1:
--
--   · **D-F8 — a D-V7 (autoria e sucessão) fica FORA da 03.8.b.** O
--     contrato grava quem responde por ele (o profissional que aprovou o
--     orçamento) e nada mais. A trava de edição por autor, o coautor e a
--     passagem ao `owner` são subetapa própria, depois da 03.9 e da 03.14:
--     o coautor depende do regime de referência e contrarreferência, que
--     ainda não existe, e inventar aqui uma segunda forma de travar por
--     pessoa é exatamente o que o bloco proíbe.
--
--   · **D-F9 — a opção aceita vira contrato assim:** as células de
--     PROCEDIMENTO da opção entram como UM item `plano_id` (o plano dono da
--     opção, D-F6), com o valor congelado igual à soma; cada célula de
--     PACOTE vira um item `pacote_id`. O braço `procedimento_id` é o
--     procedimento AVULSO, sem plano. O detalhe por célula (preço, degrau,
--     tabela) continua em `itens_orcamento`, alcançável por
--     `contratos.orcamento_id` — não se copia.
--
--   · **D-F10 — "face executada" mora numa tabela nova,
--     `aba_treatment.execucoes_face`**, uma linha por face, com data e
--     autor gravados pelo banco e o regime clínico completo. O estado
--     `executado` da célula passa a ser DERIVADO das faces. O odontograma
--     (`aba_health.evolucoes.marcacoes`) continua sendo o quadro clínico e
--     não conta para fechar contrato.
--
--   · **D-F11 — a dispensa de contrato (D-V8) é por PROCEDIMENTO do
--     catálogo**, feita pelo `owner`, com justificativa, autor e data.
--
--   · **D-F12 — o trabalho do pacote se mede pelo SALDO de sessões** (o
--     pacote é vendido na dupla assinatura, pela operação que já existe,
--     e fica ligado à linha do contrato), **e o do avulso por um registro
--     de execução** com data e autor, sem dente.
--
--   · **D-F13 — o cardápio é `aba_finance.ofertas`**, não
--     `aba_catalog.ofertas`: a view lê `aba_treatment.planos`, e em
--     `aba_catalog` ela inverteria a direção de dependência entre módulos
--     (`instrucoes.md` §4) — o catálogo deixaria de ser exportável sem o
--     módulo Plano. A decisão da D-V3 (view, não tabela) não muda.
--
--   · **D-F14 — a venda de pacote da tela Financeiro passa pelo contrato
--     novo.** Nenhum contrato novo nasce `ativo` nem passa a `ativo`; o
--     saldo de sessões só nasce na dupla assinatura. `vender_pacote()`
--     deixa de ser executável por `authenticated`. Os contratos antigos
--     (medido em produção: 10, quatro `ativo`) ficam como estão.
--
-- ============================================================
-- A FRONTEIRA CLÍNICA NÃO AFROUXA
-- ============================================================
-- Dado clínico não se copia para `aba_finance`. Nenhuma tabela nova deste
-- schema tem dente, face ou texto livre de profissional; o documento
-- canônico lista NOMES de procedimento (metadado de catálogo, legível por
-- `viewer` desde a 01.3) e nunca onde, no corpo do paciente, o trabalho
-- acontece. A situação do contrato devolve CONTAGENS de faces, nunca as
-- faces. A verificação da §14 recusa a migration se isso mudar.
--
-- ============================================================
-- SEM SESSÃO, AS TRAVAS DE FLUXO NÃO SE APLICAM — decisão já medida
-- ============================================================
-- Mesma decisão de `exigir_alcada_financeira` (048) e dos gatilhos de log:
-- `auth.uid()` nulo é caminho de servidor (`service_role`, semente,
-- rotina), que já ignora RLS por natureza do papel. As travas de estado e
-- de execução valem para todo usuário autenticado, que é o caminho do
-- produto e o que a suíte ataca.
--
-- Idempotente — seguro rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §1 — `contratos` ganha a origem, o documento e os estados novos
-- ---------------------------------------------------------------------
ALTER TABLE aba_finance.contratos ADD COLUMN IF NOT EXISTS orcamento_id UUID;
ALTER TABLE aba_finance.contratos ADD COLUMN IF NOT EXISTS profissional_id UUID;
ALTER TABLE aba_finance.contratos ADD COLUMN IF NOT EXISTS desconto_valor NUMERIC(12,2) NOT NULL DEFAULT 0;
-- Soma das linhas, mantida por gatilho. `valor` continua sendo o total a
-- pagar; em contrato COM linha ele passa a ser derivado (§3).
ALTER TABLE aba_finance.contratos ADD COLUMN IF NOT EXISTS valor_bruto NUMERIC(12,2) NOT NULL DEFAULT 0;
-- O DOCUMENTO CANÔNICO (D-V10): HTML determinístico e o hash dele. É o
-- hash que dá valor probatório; o PDF é só formato de entrega.
ALTER TABLE aba_finance.contratos ADD COLUMN IF NOT EXISTS documento_html TEXT;
ALTER TABLE aba_finance.contratos ADD COLUMN IF NOT EXISTS documento_hash TEXT;
ALTER TABLE aba_finance.contratos ADD COLUMN IF NOT EXISTS documento_emitido_em TIMESTAMPTZ;
ALTER TABLE aba_finance.contratos ADD COLUMN IF NOT EXISTS assinado_em TIMESTAMPTZ;
ALTER TABLE aba_finance.contratos ADD COLUMN IF NOT EXISTS encerrado_em TIMESTAMPTZ;

DO $$
DECLARE
  v_nome TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'aba_finance.contratos'::regclass
                 AND conname = 'contratos_orcamento_fk') THEN
    ALTER TABLE aba_finance.contratos ADD CONSTRAINT contratos_orcamento_fk
      FOREIGN KEY (orcamento_id, account_id) REFERENCES aba_finance.orcamentos(id, account_id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'aba_finance.contratos'::regclass
                 AND conname = 'contratos_profissional_fk') THEN
    ALTER TABLE aba_finance.contratos ADD CONSTRAINT contratos_profissional_fk
      FOREIGN KEY (profissional_id, account_id) REFERENCES aba_scheduling.profissionais(id, account_id)
      ON DELETE SET NULL (profissional_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'aba_finance.contratos'::regclass
                 AND conname = 'contratos_desconto_nao_negativo') THEN
    ALTER TABLE aba_finance.contratos ADD CONSTRAINT contratos_desconto_nao_negativo
      CHECK (desconto_valor >= 0 AND valor_bruto >= 0);
  END IF;

  -- Documento é um trio: ou existe inteiro, ou não existe. Hash sem HTML
  -- não prova nada; HTML sem hash não tem como ser conferido.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'aba_finance.contratos'::regclass
                 AND conname = 'contratos_documento_completo') THEN
    ALTER TABLE aba_finance.contratos ADD CONSTRAINT contratos_documento_completo
      CHECK (num_nulls(documento_html, documento_hash, documento_emitido_em) IN (0, 3)
             AND (documento_hash IS NULL OR documento_hash ~ '^[0-9a-f]{64}$'));
  END IF;

  -- O estado `assinado` entra por ADIÇÃO. O CHECK é achado POR CATÁLOGO,
  -- porque `pg_get_constraintdef` reescreve `IN (...)` (`instrucoes.md` §5).
  -- Quem filtra por estado, varrido antes: a tela do Financeiro só GRAVA
  -- `ativo` (e deixa de gravar nesta subetapa); nenhum leitor tem lista
  -- fechada de estados de contrato.
  SELECT con.conname INTO v_nome FROM pg_constraint con
  WHERE con.conrelid = 'aba_finance.contratos'::regclass AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%status%' AND pg_get_constraintdef(con.oid) LIKE '%rascunho%';
  IF v_nome IS NULL OR NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conrelid = 'aba_finance.contratos'::regclass
         AND conname = v_nome AND pg_get_constraintdef(oid) LIKE '%assinado%') THEN
    IF v_nome IS NOT NULL THEN
      EXECUTE format('ALTER TABLE aba_finance.contratos DROP CONSTRAINT %I', v_nome);
    END IF;
    ALTER TABLE aba_finance.contratos ADD CONSTRAINT contratos_status_check
      CHECK (status IN ('rascunho','assinado','ativo','encerrado','cancelado'));
  END IF;

  -- Assinado tem data de assinatura; encerrado de contrato novo tem data
  -- de encerramento. Os contratos antigos (`ativo`/`encerrado` sem data)
  -- continuam válidos: a regra nasce com o estado novo, não reescreve o
  -- passado.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'aba_finance.contratos'::regclass
                 AND conname = 'contratos_assinatura_datada') THEN
    ALTER TABLE aba_finance.contratos ADD CONSTRAINT contratos_assinatura_datada
      CHECK (status <> 'assinado' OR (assinado_em IS NOT NULL AND documento_hash IS NOT NULL));
  END IF;
END $$;

-- UM contrato vivo por orçamento. Cancelado não conta: o paciente que
-- desistiu e voltou contrata de novo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contratos_um_por_orcamento
  ON aba_finance.contratos(orcamento_id) WHERE orcamento_id IS NOT NULL AND status <> 'cancelado';

-- A alçada financeira (048 §7) passa a olhar também o desconto do contrato.
DROP TRIGGER IF EXISTS trg_contratos_alcada ON aba_finance.contratos;
CREATE TRIGGER trg_contratos_alcada
  BEFORE INSERT OR UPDATE ON aba_finance.contratos
  FOR EACH ROW EXECUTE FUNCTION aba_finance.exigir_alcada_financeira(
    'parcelas', 'taxa_juros', 'taxa_multa_atraso', 'dia_vencimento', 'desconto_valor');

-- ---------------------------------------------------------------------
-- §2 — `aba_finance.itens_contrato`: o ARCO EXCLUSIVO de três braços (D-V3)
--
-- Nunca referência polimórfica: cada braço é chave estrangeira composta por
-- `account_id`, que `public.fks_sem_isolamento_de_conta()` enxerga. Uma
-- coluna `tipo` + `id` não teria `REFERENCES` e seria invisível para a
-- auditoria (`instrucoes.md` §6).
--
-- A linha guarda o VALOR ACORDADO, congelado, com proveniência. Nunca lê o
-- preço do catálogo na hora de exibir — senão reajustar a tabela
-- reescreveria contrato assinado.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aba_finance.itens_contrato (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contrato_id        UUID NOT NULL,
  -- ---- o arco ----
  procedimento_id    UUID,
  pacote_id          UUID,
  plano_id           UUID,
  -- ---- de onde veio ----
  -- A linha do orçamento que deu o preço, quando o item é um pacote
  -- copiado da opção aceita. O item `plano` não aponta para linha nenhuma:
  -- ele é a soma das linhas de procedimento, que o `orcamento_id` do
  -- contrato já alcança.
  item_orcamento_id  UUID,
  degrau             TEXT,
  tabela_preco_id    UUID,
  -- ---- o fato, e não a oferta ----
  quantidade         INT NOT NULL DEFAULT 1,
  valor_unitario     NUMERIC(12,2) NOT NULL,
  valor_total        NUMERIC(12,2) GENERATED ALWAYS AS (quantidade * valor_unitario) STORED,
  valido_ate         DATE,
  -- O pacote VENDIDO na dupla assinatura (D-F12). É o saldo dele que diz
  -- se o trabalho do pacote terminou.
  pacote_cliente_id  UUID,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, account_id),
  UNIQUE (contrato_id, plano_id),
  UNIQUE (pacote_cliente_id),
  CONSTRAINT itens_contrato_contrato_fk
    FOREIGN KEY (contrato_id, account_id) REFERENCES aba_finance.contratos(id, account_id) ON DELETE CASCADE,
  CONSTRAINT itens_contrato_procedimento_fk
    FOREIGN KEY (procedimento_id, account_id) REFERENCES aba_catalog.procedimentos(id, account_id),
  CONSTRAINT itens_contrato_pacote_fk
    FOREIGN KEY (pacote_id, account_id) REFERENCES aba_catalog.pacotes(id, account_id),
  CONSTRAINT itens_contrato_plano_fk
    FOREIGN KEY (plano_id, account_id) REFERENCES aba_treatment.planos(id, account_id),
  CONSTRAINT itens_contrato_item_orcamento_fk
    FOREIGN KEY (item_orcamento_id, account_id) REFERENCES aba_finance.itens_orcamento(id, account_id),
  CONSTRAINT itens_contrato_tabela_preco_fk
    FOREIGN KEY (tabela_preco_id, account_id) REFERENCES aba_finance.tabelas_preco(id, account_id),
  CONSTRAINT itens_contrato_pacote_cliente_fk
    FOREIGN KEY (pacote_cliente_id, account_id) REFERENCES aba_finance.pacotes_cliente(id, account_id),
  CONSTRAINT itens_contrato_um_item
    CHECK (num_nonnulls(procedimento_id, pacote_id, plano_id) = 1),
  CONSTRAINT itens_contrato_quantidade_positiva CHECK (quantidade > 0),
  CONSTRAINT itens_contrato_valor_nao_negativo CHECK (valor_unitario >= 0),
  -- Plano e pacote entram uma vez por linha: "três pacotes" são três
  -- vendas, três saldos e três linhas.
  CONSTRAINT itens_contrato_quantidade_unitaria
    CHECK (procedimento_id IS NOT NULL OR quantidade = 1),
  CONSTRAINT itens_contrato_pacote_cliente_so_de_pacote
    CHECK (pacote_cliente_id IS NULL OR pacote_id IS NOT NULL),
  CONSTRAINT itens_contrato_item_orcamento_so_de_pacote
    CHECK (item_orcamento_id IS NULL OR pacote_id IS NOT NULL),
  -- PROVENIÊNCIA COERENTE. O item `plano` não tem degrau (é soma); os
  -- outros dois têm, e degrau que nomeia tabela precisa da tabela — o
  -- mesmo par de regras de `itens_orcamento`.
  CONSTRAINT itens_contrato_proveniencia
    CHECK (
      (plano_id IS NOT NULL AND degrau IS NULL AND tabela_preco_id IS NULL)
      OR (plano_id IS NULL AND degrau IS NOT NULL AND (degrau = 'catalogo') = (tabela_preco_id IS NULL))
    ),
  CONSTRAINT itens_contrato_degrau_valido
    CHECK (degrau IS NULL OR degrau IN ('paciente','grupo_paciente','tipo_profissional','clinica','rede','pratica','catalogo'))
);
CREATE INDEX IF NOT EXISTS idx_itens_contrato_contrato ON aba_finance.itens_contrato(contrato_id);
CREATE INDEX IF NOT EXISTS idx_itens_contrato_plano ON aba_finance.itens_contrato(plano_id) WHERE plano_id IS NOT NULL;

COMMENT ON TABLE aba_finance.itens_contrato IS
  'Linhas do contrato (Subetapa 03.8.b, D-V3): procedimento avulso, pacote OU plano, em arco exclusivo com chave composta por conta. Valor congelado com proveniência. Sem dado clínico. Só as funções do contrato escrevem aqui.';

DROP TRIGGER IF EXISTS set_updated_at ON aba_finance.itens_contrato;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_finance.itens_contrato
  FOR EACH ROW EXECUTE FUNCTION aba_finance.set_updated_at();

-- ---------------------------------------------------------------------
-- §2b — As assinaturas, a trilha e a execução do avulso
--
-- AS TRÊS TABELAS NÃO SÃO ESCREVÍVEIS POR `authenticated`, e é de
-- propósito: assinatura e trilha que o usuário grava direto são assinatura
-- e trilha forjáveis (mesma decisão de `eventos_orcamento`, 051 §7). Quem
-- escreve são as funções `SECURITY DEFINER` desta migration, que conferem
-- quem chama antes de gravar.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aba_finance.assinaturas_contrato (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contrato_id     UUID NOT NULL,
  parte           TEXT NOT NULL,
  -- Como a assinatura chegou. A 03.12 acrescenta `link`, alimentando o
  -- MESMO estado (D-V9) — por adição a este CHECK, sem redesenho.
  via             TEXT NOT NULL,
  -- O HASH QUE FOI ASSINADO. Assinar é assinar um conteúdo, e é esta
  -- coluna que liga a assinatura ao documento canônico: se o documento
  -- mudar, a assinatura antiga deixa de valer para ele.
  hash_assinado   TEXT NOT NULL,
  assinada_em     TIMESTAMPTZ NOT NULL,
  -- Quem REGISTROU. Na assinatura presencial do paciente é a recepção; na
  -- derivada da aprovação é o próprio profissional que aprovou.
  registrada_por  UUID NOT NULL,
  profissional_id UUID,
  UNIQUE (id, account_id),
  UNIQUE (contrato_id, parte),
  CONSTRAINT assinaturas_contrato_contrato_fk
    FOREIGN KEY (contrato_id, account_id) REFERENCES aba_finance.contratos(id, account_id) ON DELETE CASCADE,
  CONSTRAINT assinaturas_contrato_profissional_fk
    FOREIGN KEY (profissional_id, account_id) REFERENCES aba_scheduling.profissionais(id, account_id)
    ON DELETE SET NULL (profissional_id),
  CONSTRAINT assinaturas_contrato_parte_valida CHECK (parte IN ('profissional','paciente')),
  CONSTRAINT assinaturas_contrato_via_valida CHECK (via IN ('aprovacao_orcamento','presencial')),
  CONSTRAINT assinaturas_contrato_hash_formato CHECK (hash_assinado ~ '^[0-9a-f]{64}$'),
  -- A via "aprovação do orçamento" só existe para a parte profissional
  -- (D-F3): o paciente nunca aprova orçamento.
  CONSTRAINT assinaturas_contrato_via_coerente
    CHECK (via <> 'aprovacao_orcamento' OR parte = 'profissional')
);

COMMENT ON TABLE aba_finance.assinaturas_contrato IS
  'Assinaturas do contrato (D-V9): uma por parte, cada uma sobre o hash do documento canônico. Só as funções do contrato escrevem; authenticated lê.';

CREATE TABLE IF NOT EXISTS aba_finance.eventos_contrato (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contrato_id  UUID NOT NULL,
  tipo         TEXT NOT NULL,
  ator         UUID,
  -- Detalhe OPERACIONAL (hash, parte, contagens). Nunca texto livre nem
  -- dado clínico — a §14 confere no corpo das funções que escrevem aqui.
  detalhe      JSONB NOT NULL DEFAULT '{}'::jsonb,
  ocorrido_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, account_id),
  CONSTRAINT eventos_contrato_contrato_fk
    FOREIGN KEY (contrato_id, account_id) REFERENCES aba_finance.contratos(id, account_id) ON DELETE CASCADE,
  CONSTRAINT eventos_contrato_tipo_valido
    CHECK (tipo IN ('criado','item_acrescentado','item_removido','documento_emitido','documento_descartado',
                    'assinatura_registrada','assinado','execucao_registrada','encerrado','cancelado'))
);
CREATE INDEX IF NOT EXISTS idx_eventos_contrato_contrato ON aba_finance.eventos_contrato(contrato_id, ocorrido_em);

CREATE TABLE IF NOT EXISTS aba_finance.execucoes_item_contrato (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  item_contrato_id  UUID NOT NULL,
  executado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executado_por     UUID NOT NULL,
  profissional_id   UUID,
  UNIQUE (id, account_id),
  CONSTRAINT execucoes_item_contrato_item_fk
    FOREIGN KEY (item_contrato_id, account_id) REFERENCES aba_finance.itens_contrato(id, account_id) ON DELETE RESTRICT,
  CONSTRAINT execucoes_item_contrato_profissional_fk
    FOREIGN KEY (profissional_id, account_id) REFERENCES aba_scheduling.profissionais(id, account_id)
    ON DELETE SET NULL (profissional_id)
);
CREATE INDEX IF NOT EXISTS idx_execucoes_item_contrato_item ON aba_finance.execucoes_item_contrato(item_contrato_id);

COMMENT ON TABLE aba_finance.execucoes_item_contrato IS
  'Execução do procedimento AVULSO do contrato (D-F12): uma linha por unidade executada, com data e autor gravados pelo banco. Sem dente nem face — o avulso não tem. Só registrar_execucao_item escreve.';

-- RLS e privilégio das tabelas novas de `aba_finance`. `GRANT` amplo
-- ANTES de qualquer estreitamento (`instrucoes.md` §5), e sem `TRUNCATE`.
ALTER TABLE aba_finance.itens_contrato          ENABLE ROW LEVEL SECURITY;
ALTER TABLE aba_finance.assinaturas_contrato    ENABLE ROW LEVEL SECURITY;
ALTER TABLE aba_finance.eventos_contrato        ENABLE ROW LEVEL SECURITY;
ALTER TABLE aba_finance.execucoes_item_contrato ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['itens_contrato','assinaturas_contrato','eventos_contrato','execucoes_item_contrato'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON aba_finance.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON aba_finance.%I FOR SELECT
         USING (public.is_account_member(account_id, ''viewer'') AND access.can(''finance'', ''read''))',
      t || '_select', t);
    EXECUTE format('REVOKE ALL ON aba_finance.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON aba_finance.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON aba_finance.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON aba_finance.%I TO authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON aba_finance.%I TO service_role', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- §3 — O que protege o contrato e as linhas dele
-- ---------------------------------------------------------------------

-- Linha só muda em contrato RASCUNHO, e o plano tem de ser do MESMO
-- paciente do contrato. A chave composta protege entre CLÍNICAS; nada
-- protege entre PACIENTES da mesma clínica sem esta trava (`docs/02`
-- §13.2) — o plano do paciente A entraria no contrato do paciente B sem
-- erro nenhum.
CREATE OR REPLACE FUNCTION aba_finance.conferir_item_contrato()
RETURNS TRIGGER
LANGUAGE plpgsql
-- DEFINER: a recepção não enxerga `planos` (policy clínica). Como invoker,
-- o paciente do plano viria NULO e todo plano pareceria "de outro paciente".
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_contrato RECORD;
  v_cliente_do_plano UUID;
  v_linha RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_linha := OLD;
  ELSE
    v_linha := NEW;
  END IF;

  SELECT c.status, c.cliente_id INTO v_contrato
  FROM aba_finance.contratos c WHERE c.id = v_linha.contrato_id;

  -- A ÚNICA mudança fora de rascunho: a dupla assinatura liga o pacote
  -- vendido à linha (D-F12). Nenhuma outra coluna pode mudar junto.
  --
  -- `valor_total` fica FORA da comparação, e o motivo foi medido pela suíte
  -- 22 na primeira execução: num gatilho `BEFORE`, a coluna GERADA ainda
  -- não foi calculada e vem NULA em `NEW` — enquanto em `OLD` ela tem valor.
  -- Com ela na conta, as duas linhas nunca batiam, e todo contrato com
  -- pacote era recusado na assinatura com a mensagem de "acréscimo é
  -- contrato novo" — verdadeira sobre a regra e falsa sobre a causa.
  IF TG_OP = 'UPDATE' AND OLD.pacote_cliente_id IS NULL AND NEW.pacote_cliente_id IS NOT NULL
     AND v_contrato.status = 'assinado'
     AND (to_jsonb(NEW) - 'pacote_cliente_id' - 'atualizado_em' - 'valor_total')
       = (to_jsonb(OLD) - 'pacote_cliente_id' - 'atualizado_em' - 'valor_total') THEN
    RETURN NEW;
  END IF;

  -- Contrato apagado em cascata: nada a conferir.
  IF TG_OP = 'DELETE' AND v_contrato.status IS NULL THEN
    RETURN OLD;
  END IF;

  IF v_contrato.status IS DISTINCT FROM 'rascunho' THEN
    RAISE EXCEPTION 'Contrato % não recebe, altera nem perde linha — acréscimo é contrato novo (D-V4).', v_contrato.status
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- ARCO QUEBRADO: sai do caminho e deixa o CHECK falar com o nome dele
  -- (`instrucoes.md` §5, lição da 03.8.c).
  IF num_nonnulls(NEW.procedimento_id, NEW.pacote_id, NEW.plano_id) <> 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.plano_id IS NOT NULL THEN
    SELECT p.cliente_id INTO v_cliente_do_plano FROM aba_treatment.planos p WHERE p.id = NEW.plano_id;
    IF v_cliente_do_plano IS DISTINCT FROM v_contrato.cliente_id THEN
      RAISE EXCEPTION 'O plano pertence a outro paciente — contrato de um paciente não recebe o plano de outro.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_finance.conferir_item_contrato() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.conferir_item_contrato() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_itens_contrato_conferir ON aba_finance.itens_contrato;
CREATE TRIGGER trg_itens_contrato_conferir
  BEFORE INSERT OR UPDATE OR DELETE ON aba_finance.itens_contrato
  FOR EACH ROW EXECUTE FUNCTION aba_finance.conferir_item_contrato();

-- Valor unitário é dinheiro: a mesma alçada (048 §7).
DROP TRIGGER IF EXISTS trg_itens_contrato_alcada ON aba_finance.itens_contrato;
CREATE TRIGGER trg_itens_contrato_alcada
  BEFORE INSERT OR UPDATE ON aba_finance.itens_contrato
  FOR EACH ROW EXECUTE FUNCTION aba_finance.exigir_alcada_financeira('valor_unitario');

-- Mexer em linha recalcula o bruto do contrato. O descarte do documento é
-- do gatilho de `contratos` (§8), que enxerga a mudança de `valor_bruto`
-- — uma regra só, e não duas cópias dela.
CREATE OR REPLACE FUNCTION aba_finance.recalcular_bruto_contrato()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_contrato_id UUID := COALESCE(NEW.contrato_id, OLD.contrato_id);
  v_soma NUMERIC(12,2);
BEGIN
  SELECT COALESCE(SUM(i.valor_total), 0) INTO v_soma
  FROM aba_finance.itens_contrato i WHERE i.contrato_id = v_contrato_id;

  UPDATE aba_finance.contratos SET valor_bruto = v_soma
  WHERE id = v_contrato_id AND valor_bruto IS DISTINCT FROM v_soma;

  RETURN NULL;
END;
$$;

ALTER FUNCTION aba_finance.recalcular_bruto_contrato() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.recalcular_bruto_contrato() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_itens_contrato_bruto ON aba_finance.itens_contrato;
CREATE TRIGGER trg_itens_contrato_bruto
  AFTER INSERT OR DELETE OR UPDATE OF quantidade, valor_unitario ON aba_finance.itens_contrato
  FOR EACH ROW EXECUTE FUNCTION aba_finance.recalcular_bruto_contrato();

-- ---------------------------------------------------------------------
-- §4 — `aba_treatment.execucoes_face`: a face executada, com data e autor
--      (D-F10; passo 36 do caminho feliz)
--
-- DADO DE SAÚDE — a face onde o trabalho aconteceu, num paciente. O porte
-- do regime é ATÔMICO (`instrucoes.md` §5, lição da 03.8): alcance pela
-- `pode_planejar`, `SELECT` revogado na coluna `face`, leitura pela função
-- que registra (`ler_planos`, §13) e escrita registrada pelo gatilho da 047.
--
-- UMA LINHA POR FACE, e não uma por célula, é o que torna o item 37 (step
-- set, fora do MVP) ADITIVO depois: uma restauração MOD executada em duas
-- sessões já cabe aqui. Procedimento lançado sem face (extração, por
-- exemplo) tem UMA unidade, gravada com `face` nula.
--
-- Não há `UPDATE` nem `DELETE`: execução afirmada é fato clínico, e fato
-- clínico não se apaga (mesma regra de `aba_health`). Corrigir engano de
-- registro é pendência declarada, não caminho aberto.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aba_treatment.execucoes_face (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  plano_id              UUID NOT NULL,
  procedimento_plano_id UUID NOT NULL,
  face                  TEXT,
  executado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executado_por         UUID NOT NULL,
  UNIQUE (id, account_id),
  CONSTRAINT execucoes_face_plano_fk
    FOREIGN KEY (plano_id, account_id) REFERENCES aba_treatment.planos(id, account_id) ON DELETE RESTRICT,
  CONSTRAINT execucoes_face_celula_fk
    FOREIGN KEY (procedimento_plano_id, account_id) REFERENCES aba_treatment.procedimentos_plano(id, account_id) ON DELETE RESTRICT,
  CONSTRAINT execucoes_face_vocabulario
    CHECK (face IS NULL OR face IN ('mesial','distal','vestibular','lingual','oclusal','incisal'))
);
-- A mesma face da mesma célula não se executa duas vezes. `NULLS NOT
-- DISTINCT` (PG 15+) faz a unidade sem face também ser única.
CREATE UNIQUE INDEX IF NOT EXISTS idx_execucoes_face_unica
  ON aba_treatment.execucoes_face(procedimento_plano_id, face) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_execucoes_face_plano ON aba_treatment.execucoes_face(plano_id);

COMMENT ON TABLE aba_treatment.execucoes_face IS
  'Face executada de uma célula do plano, com data e autor gravados pelo banco (Subetapa 03.8.b, D-F10). Dado clínico: face ilegível por coluna, leitura por ler_planos, escrita registrada em log_acesso. Sem UPDATE nem DELETE. É a metade TRABALHO da trava dupla do contrato.';

ALTER TABLE aba_treatment.execucoes_face ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS execucoes_face_select ON aba_treatment.execucoes_face;
CREATE POLICY execucoes_face_select ON aba_treatment.execucoes_face FOR SELECT
  USING (EXISTS (SELECT 1 FROM aba_treatment.planos p
                 WHERE p.id = plano_id AND aba_treatment.pode_planejar(p.cliente_id, 'leitura')));
DROP POLICY IF EXISTS execucoes_face_insert ON aba_treatment.execucoes_face;
CREATE POLICY execucoes_face_insert ON aba_treatment.execucoes_face FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM aba_treatment.planos p
                      WHERE p.id = plano_id AND aba_treatment.pode_planejar(p.cliente_id, 'atualizacao')));

-- Tabela inteira revogada e a lista que fica reconcedida — nunca `REVOKE
-- SELECT (face)` sozinho, que é inócuo enquanto o `GRANT` de tabela existir
-- (`instrucoes.md` §5, a lição que a 047 pagou).
REVOKE ALL ON aba_treatment.execucoes_face FROM PUBLIC;
REVOKE ALL ON aba_treatment.execucoes_face FROM anon;
REVOKE ALL ON aba_treatment.execucoes_face FROM authenticated;
GRANT SELECT (id, account_id, plano_id, procedimento_plano_id, executado_em, executado_por)
  ON aba_treatment.execucoes_face TO authenticated;
GRANT INSERT (account_id, plano_id, procedimento_plano_id, face) ON aba_treatment.execucoes_face TO authenticated;
GRANT SELECT, INSERT, DELETE ON aba_treatment.execucoes_face TO service_role;

-- A face tem de ser uma face DO TRABALHO daquela célula; o carimbo é do
-- banco, nunca do navegador (a 03.7.a carimbava no cliente — é por isso que
-- o odontograma não conta para contrato, D-F10).
CREATE OR REPLACE FUNCTION aba_treatment.validar_execucao_face()
RETURNS TRIGGER
LANGUAGE plpgsql
-- DEFINER: lê `faces` da célula, que é coluna REVOGADA de `authenticated`
-- (047). Como invoker, o gatilho recusaria toda execução com "permission
-- denied for column" — falha que pareceria de RLS.
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_celula RECORD;
BEGIN
  -- Execução é ato datado e atribuível: sem sessão não há autor, e a
  -- mensagem precisa dizer isso antes que um CHECK diga outra coisa.
  IF auth.uid() IS NULL AND NEW.executado_por IS NULL THEN
    RAISE EXCEPTION 'Registrar face executada exige sessão autenticada — a execução precisa de autor.'
      USING ERRCODE = '42501';
  END IF;
  NEW.executado_por := COALESCE(auth.uid(), NEW.executado_por);
  IF auth.uid() IS NOT NULL THEN
    NEW.executado_em := NOW();
  END IF;

  SELECT pp.plano_id, pp.procedimento_id, pp.faces, pp.estado, pp.recusado_em
    INTO v_celula
  FROM aba_treatment.procedimentos_plano pp WHERE pp.id = NEW.procedimento_plano_id;

  IF v_celula.plano_id IS DISTINCT FROM NEW.plano_id THEN
    RAISE EXCEPTION 'A célula não pertence a este plano.' USING ERRCODE = '23514';
  END IF;

  IF v_celula.procedimento_id IS NULL THEN
    RAISE EXCEPTION 'Célula de pacote não se executa por face — o trabalho do pacote é o saldo de sessões (D-F12).'
      USING ERRCODE = '23514';
  END IF;

  IF v_celula.recusado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Procedimento recusado pelo paciente não se executa.' USING ERRCODE = '23514';
  END IF;

  IF v_celula.estado NOT IN ('planejado','em_execucao') THEN
    RAISE EXCEPTION 'Só se executa procedimento planejado ou em execução; este está %.', v_celula.estado
      USING ERRCODE = '23514';
  END IF;

  IF cardinality(v_celula.faces) > 0 THEN
    IF NEW.face IS NULL OR NOT (NEW.face = ANY (v_celula.faces)) THEN
      RAISE EXCEPTION 'A face executada tem de ser uma das faces planejadas do trabalho.' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.face IS NOT NULL THEN
    RAISE EXCEPTION 'Este procedimento foi planejado sem face — a execução também é sem face.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_treatment.validar_execucao_face() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_treatment.validar_execucao_face() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_execucoes_face_validar ON aba_treatment.execucoes_face;
CREATE TRIGGER trg_execucoes_face_validar
  BEFORE INSERT ON aba_treatment.execucoes_face
  FOR EACH ROW EXECUTE FUNCTION aba_treatment.validar_execucao_face();

-- A escrita clínica deixa rastro — o mesmo gatilho das outras quatro
-- tabelas do schema (047 §5), que resolve o paciente pelo `plano_id`.
DROP TRIGGER IF EXISTS registrar_escrita_plano ON aba_treatment.execucoes_face;
CREATE TRIGGER registrar_escrita_plano
  AFTER INSERT ON aba_treatment.execucoes_face
  FOR EACH ROW EXECUTE FUNCTION aba_treatment.registrar_escrita_plano();

-- Quantas unidades a célula tem e quantas já foram executadas. Função
-- interna: devolve CONTAGEM, nunca a face.
CREATE OR REPLACE FUNCTION aba_treatment.cobertura_da_celula(p_celula_id UUID)
RETURNS TABLE (previstas INT, executadas INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    GREATEST(cardinality(pp.faces), 1)::INT,
    (SELECT count(DISTINCT COALESCE(e.face, '-'))::INT
       FROM aba_treatment.execucoes_face e
      WHERE e.procedimento_plano_id = pp.id
        AND (cardinality(pp.faces) = 0 OR e.face = ANY (pp.faces)))
  FROM aba_treatment.procedimentos_plano pp
  WHERE pp.id = p_celula_id;
$$;

ALTER FUNCTION aba_treatment.cobertura_da_celula(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_treatment.cobertura_da_celula(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION aba_treatment.cobertura_da_celula(UUID) TO service_role;

-- O ESTADO DA CÉLULA É DERIVADO DAS FACES (D-F10): a primeira face põe a
-- célula em execução; a última a põe executada. É o caminho do ciclo que a
-- 045 já permite (planejado → em_execucao → executado, ou direto).
CREATE OR REPLACE FUNCTION aba_treatment.derivar_estado_da_celula()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cob RECORD;
BEGIN
  SELECT * INTO v_cob FROM aba_treatment.cobertura_da_celula(NEW.procedimento_plano_id);

  IF v_cob.executadas >= v_cob.previstas THEN
    UPDATE aba_treatment.procedimentos_plano
       SET estado = 'executado', executado_por = NEW.executado_por
     WHERE id = NEW.procedimento_plano_id AND estado <> 'executado';
  ELSE
    UPDATE aba_treatment.procedimentos_plano
       SET estado = 'em_execucao'
     WHERE id = NEW.procedimento_plano_id AND estado = 'planejado';
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION aba_treatment.derivar_estado_da_celula() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_treatment.derivar_estado_da_celula() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_execucoes_face_derivar ON aba_treatment.execucoes_face;
CREATE TRIGGER trg_execucoes_face_derivar
  AFTER INSERT ON aba_treatment.execucoes_face
  FOR EACH ROW EXECUTE FUNCTION aba_treatment.derivar_estado_da_celula();

-- E O CAMINHO DIRETO FECHA: com sessão, célula de procedimento só vira
-- `executado` com todas as faces registradas. Sem isto, um `UPDATE estado =
-- 'executado'` pelo PostgREST afirmaria execução que a trava dupla não
-- enxergaria — duas verdades sobre o mesmo trabalho.
CREATE OR REPLACE FUNCTION aba_treatment.exigir_faces_para_executado()
RETURNS TRIGGER
LANGUAGE plpgsql
-- DEFINER porque consulta `cobertura_da_celula`, que não é de
-- `authenticated`: gatilho roda com o privilégio de quem escreve.
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cob RECORD;
BEGIN
  IF auth.uid() IS NULL OR NEW.procedimento_id IS NULL
     OR NEW.estado <> 'executado' OR OLD.estado = 'executado' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_cob FROM aba_treatment.cobertura_da_celula(NEW.id);
  IF v_cob.executadas < v_cob.previstas THEN
    RAISE EXCEPTION 'Procedimento só fica executado com todas as faces registradas (% de %) — marque as faces executadas.',
      v_cob.executadas, v_cob.previstas USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_treatment.exigir_faces_para_executado() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_treatment.exigir_faces_para_executado() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_proc_plano_executado_por_faces ON aba_treatment.procedimentos_plano;
CREATE TRIGGER trg_proc_plano_executado_por_faces
  BEFORE UPDATE OF estado ON aba_treatment.procedimentos_plano
  FOR EACH ROW EXECUTE FUNCTION aba_treatment.exigir_faces_para_executado();

-- ---------------------------------------------------------------------
-- §5 — `aba_catalog.dispensas_contrato`: o `owner` desliga a exigência de
--      contrato para um procedimento, assumindo o risco POR ESCRITO (D-V8,
--      D-F11)
--
-- "Chave desligada sem registro de quem desligou e quando é pior que chave
-- nenhuma." Por isso não existe interruptor: existe uma LINHA, com
-- justificativa, autor e data, que se revoga com autor e data — e nunca se
-- apaga.
--
-- A regra de quem pode é `is_account_member(account_id, 'owner')`, e não
-- `access.can()`: o atalho de `owner` daquela função (003:162) não tem
-- nada a decidir aqui, porque o papel exigido é exatamente o `owner`.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aba_catalog.dispensas_contrato (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  procedimento_id  UUID NOT NULL,
  -- O risco assumido, por escrito. Frase curta demais não é assumir risco.
  justificativa    TEXT NOT NULL,
  dispensada_por   UUID NOT NULL,
  dispensada_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revogada_por     UUID,
  revogada_em      TIMESTAMPTZ,
  UNIQUE (id, account_id),
  CONSTRAINT dispensas_contrato_procedimento_fk
    FOREIGN KEY (procedimento_id, account_id) REFERENCES aba_catalog.procedimentos(id, account_id),
  CONSTRAINT dispensas_contrato_justificativa_escrita
    CHECK (char_length(btrim(justificativa)) >= 15),
  CONSTRAINT dispensas_contrato_revogacao_completa
    CHECK ((revogada_por IS NULL) = (revogada_em IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dispensas_contrato_vigente
  ON aba_catalog.dispensas_contrato(procedimento_id) WHERE revogada_em IS NULL;

COMMENT ON TABLE aba_catalog.dispensas_contrato IS
  'D-V8/D-F11: o owner dispensa um procedimento da exigência de contrato assinado, com justificativa, autor e data. Revoga-se com autor e data; nunca se apaga.';

ALTER TABLE aba_catalog.dispensas_contrato ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dispensas_contrato_select ON aba_catalog.dispensas_contrato;
CREATE POLICY dispensas_contrato_select ON aba_catalog.dispensas_contrato FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('catalog', 'read'));
DROP POLICY IF EXISTS dispensas_contrato_insert ON aba_catalog.dispensas_contrato;
CREATE POLICY dispensas_contrato_insert ON aba_catalog.dispensas_contrato FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'owner'));
DROP POLICY IF EXISTS dispensas_contrato_update ON aba_catalog.dispensas_contrato;
CREATE POLICY dispensas_contrato_update ON aba_catalog.dispensas_contrato FOR UPDATE
  USING (public.is_account_member(account_id, 'owner'))
  WITH CHECK (public.is_account_member(account_id, 'owner'));

REVOKE ALL ON aba_catalog.dispensas_contrato FROM PUBLIC;
REVOKE ALL ON aba_catalog.dispensas_contrato FROM anon;
REVOKE ALL ON aba_catalog.dispensas_contrato FROM authenticated;
GRANT SELECT ON aba_catalog.dispensas_contrato TO authenticated;
GRANT INSERT (account_id, procedimento_id, justificativa) ON aba_catalog.dispensas_contrato TO authenticated;
GRANT UPDATE (revogada_em) ON aba_catalog.dispensas_contrato TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON aba_catalog.dispensas_contrato TO service_role;

-- O carimbo é do banco. Revogar é o único UPDATE, e só uma vez.
CREATE OR REPLACE FUNCTION aba_catalog.carimbar_dispensa_contrato()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL AND NEW.dispensada_por IS NULL THEN
      RAISE EXCEPTION 'Dispensar a exigência de contrato exige sessão — o risco assumido precisa de autor.'
        USING ERRCODE = '42501';
    END IF;
    NEW.dispensada_por := COALESCE(auth.uid(), NEW.dispensada_por);
    NEW.dispensada_em  := NOW();
    NEW.revogada_por   := NULL;
    NEW.revogada_em    := NULL;
    RETURN NEW;
  END IF;

  IF OLD.revogada_em IS NOT NULL THEN
    RAISE EXCEPTION 'Dispensa já revogada não muda — dispense de novo, com nova justificativa.' USING ERRCODE = '23514';
  END IF;
  IF NEW.procedimento_id IS DISTINCT FROM OLD.procedimento_id
     OR NEW.justificativa IS DISTINCT FROM OLD.justificativa
     OR NEW.dispensada_por IS DISTINCT FROM OLD.dispensada_por
     OR NEW.dispensada_em IS DISTINCT FROM OLD.dispensada_em THEN
    RAISE EXCEPTION 'Dispensa não se reescreve — só se revoga.' USING ERRCODE = '23514';
  END IF;
  IF NEW.revogada_em IS NOT NULL THEN
    NEW.revogada_em  := NOW();
    NEW.revogada_por := COALESCE(auth.uid(), NEW.revogada_por);
    IF NEW.revogada_por IS NULL THEN
      RAISE EXCEPTION 'Revogar a dispensa exige sessão.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_catalog.carimbar_dispensa_contrato() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_catalog.carimbar_dispensa_contrato() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_dispensas_contrato_carimbo ON aba_catalog.dispensas_contrato;
CREATE TRIGGER trg_dispensas_contrato_carimbo
  BEFORE INSERT OR UPDATE ON aba_catalog.dispensas_contrato
  FOR EACH ROW EXECUTE FUNCTION aba_catalog.carimbar_dispensa_contrato();

-- ---------------------------------------------------------------------
-- §6 — A SITUAÇÃO do contrato: as duas metades da trava dupla
--
-- "Terminou?" é derivado de DUAS fontes independentes, e nenhuma responde
-- sozinha (`docs/02` §12.5): o SALDO mora em `aba_finance` (faturas e
-- pagamentos do contrato) e o TRABALHO em três lugares, um por braço do
-- arco (D-F10, D-F12):
--   · plano   → faces executadas das células de procedimento da opção
--               contratada (`aba_treatment.execucoes_face`);
--   · pacote  → saldo de sessões do pacote vendido na assinatura. Pacote
--               VENCIDO ou CANCELADO conta como sem trabalho pendente: não
--               há mais o que executar nele, e contá-lo como pendente
--               deixaria o contrato aberto para sempre;
--   · avulso  → execuções registradas contra a quantidade contratada.
--
-- A função devolve CONTAGENS, nunca faces: é lida pela recepção, que não
-- tem alcance clínico, e por isso não registra leitura clínica.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_finance.calcular_situacao_contrato(p_contrato_id UUID)
RETURNS TABLE (
  valor_total          NUMERIC,
  valor_pago           NUMERIC,
  saldo_devedor        NUMERIC,
  unidades_previstas   INT,
  unidades_executadas  INT,
  falta_pagamento      BOOLEAN,
  falta_execucao       BOOLEAN,
  pode_encerrar        BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c      RECORD;
  v_opcao  UUID;
  v_prev   INT := 0;
  v_exec   INT := 0;
  v_p      INT;
  v_e      INT;
  v_pago   NUMERIC(12,2);
BEGIN
  SELECT c.id, c.status, c.valor, c.orcamento_id INTO v_c
  FROM aba_finance.contratos c WHERE c.id = p_contrato_id;
  IF v_c.id IS NULL THEN
    RETURN;
  END IF;

  SELECT o.opcao_id INTO v_opcao FROM aba_finance.orcamentos o WHERE o.id = v_c.orcamento_id;

  -- (1) PLANO — uma unidade por face do trabalho, ou uma por célula sem face.
  -- Recusado e "não mais necessário" saem da conta: não há o que executar.
  SELECT COALESCE(SUM(cob.previstas), 0), COALESCE(SUM(cob.executadas), 0) INTO v_p, v_e
  FROM aba_finance.itens_contrato i
  JOIN aba_treatment.procedimentos_plano pp
    ON pp.plano_id = i.plano_id AND pp.account_id = i.account_id
  CROSS JOIN LATERAL aba_treatment.cobertura_da_celula(pp.id) cob
  WHERE i.contrato_id = v_c.id
    AND i.plano_id IS NOT NULL
    AND pp.procedimento_id IS NOT NULL
    AND pp.recusado_em IS NULL
    AND pp.estado <> 'nao_mais_necessario'
    AND (CASE WHEN v_opcao IS NOT NULL THEN pp.opcao_id = v_opcao ELSE pp.estado <> 'proposto' END);
  v_prev := v_prev + v_p;
  v_exec := v_exec + v_e;

  -- (2) PACOTE — antes da assinatura o pacote ainda não foi vendido e conta
  -- como uma unidade inteira por fazer.
  SELECT
    COALESCE(SUM(CASE WHEN i.pacote_cliente_id IS NULL THEN 1 ELSE s.totais END), 0),
    COALESCE(SUM(CASE WHEN i.pacote_cliente_id IS NULL THEN 0
                      WHEN pc.status IN ('vencido','cancelado') THEN s.totais
                      ELSE s.usadas END), 0)
    INTO v_p, v_e
  FROM aba_finance.itens_contrato i
  LEFT JOIN aba_finance.pacotes_cliente pc ON pc.id = i.pacote_cliente_id AND pc.account_id = i.account_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(sp.sessoes_totais), 0)::INT AS totais,
           COALESCE(SUM(sp.sessoes_usadas), 0)::INT AS usadas
    FROM aba_finance.saldos_pacote sp WHERE sp.pacote_cliente_id = i.pacote_cliente_id
  ) s ON TRUE
  WHERE i.contrato_id = v_c.id AND i.pacote_id IS NOT NULL;
  v_prev := v_prev + v_p;
  v_exec := v_exec + v_e;

  -- (3) AVULSO
  SELECT COALESCE(SUM(i.quantidade), 0),
         COALESCE(SUM(LEAST(i.quantidade,
                            (SELECT count(*) FROM aba_finance.execucoes_item_contrato x
                             WHERE x.item_contrato_id = i.id)::INT)), 0)
    INTO v_p, v_e
  FROM aba_finance.itens_contrato i
  WHERE i.contrato_id = v_c.id AND i.procedimento_id IS NOT NULL;
  v_prev := v_prev + v_p;
  v_exec := v_exec + v_e;

  -- O SALDO: pagamento de fatura cancelada não quita contrato.
  SELECT COALESCE(SUM(pg.valor), 0) INTO v_pago
  FROM aba_finance.pagamentos pg
  JOIN aba_finance.faturas f ON f.id = pg.fatura_id AND f.account_id = pg.account_id
  WHERE f.contrato_id = v_c.id AND f.status <> 'cancelada';

  RETURN QUERY SELECT
    v_c.valor,
    v_pago,
    GREATEST(v_c.valor - v_pago, 0),
    v_prev,
    v_exec,
    v_c.valor - v_pago > 0,
    v_exec < v_prev,
    -- AS DUAS AO MESMO TEMPO. Nenhuma das duas sozinha abre esta porta.
    v_c.status = 'assinado' AND v_c.valor - v_pago <= 0 AND v_exec >= v_prev;
END;
$$;

ALTER FUNCTION aba_finance.calcular_situacao_contrato(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.calcular_situacao_contrato(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION aba_finance.calcular_situacao_contrato(UUID) TO service_role;

-- A porta de leitura da situação: quem lê o financeiro, na própria conta.
CREATE OR REPLACE FUNCTION aba_finance.situacao_contrato(p_contrato_id UUID)
RETURNS TABLE (
  valor_total          NUMERIC,
  valor_pago           NUMERIC,
  saldo_devedor        NUMERIC,
  unidades_previstas   INT,
  unidades_executadas  INT,
  falta_pagamento      BOOLEAN,
  falta_execucao       BOOLEAN,
  pode_encerrar        BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid();
  IF v_account_id IS NULL
     OR NOT (public.is_account_member(v_account_id, 'viewer') AND access.can('finance', 'read'))
     OR NOT EXISTS (SELECT 1 FROM aba_finance.contratos c WHERE c.id = p_contrato_id AND c.account_id = v_account_id) THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM aba_finance.calcular_situacao_contrato(p_contrato_id);
END;
$$;

ALTER FUNCTION aba_finance.situacao_contrato(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.situacao_contrato(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aba_finance.situacao_contrato(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §7 — D-V8: sem contrato assinado, o serviço não se executa
--
-- ESTE GATILHO MORA EM `aba_finance` E SE PENDURA EM `aba_treatment`, e é
-- a direção certa (`instrucoes.md` §5: "trigger cruzando schema mora no
-- schema que depende"). `aba_finance` já depende de `aba_treatment`; o
-- inverso não. Um CRM-filho sem o módulo financeiro exporta o plano sem
-- esta trava — e sem contrato nenhum a exigir.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_finance.execucao_liberada(p_celula_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- Devolve POR QUE está liberada ('dispensa' ou 'contrato'), ou NULL.
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM aba_catalog.dispensas_contrato d
      WHERE d.procedimento_id = pp.procedimento_id AND d.account_id = pp.account_id
        AND d.revogada_em IS NULL
    ) THEN 'dispensa'
    WHEN EXISTS (
      SELECT 1
      FROM aba_finance.contratos c
      LEFT JOIN aba_finance.orcamentos o ON o.id = c.orcamento_id AND o.account_id = c.account_id
      WHERE c.account_id = pp.account_id
        AND c.status = 'assinado'
        AND (o.opcao_id = pp.opcao_id
             OR (c.orcamento_id IS NULL AND EXISTS (
                   SELECT 1 FROM aba_finance.itens_contrato i
                   WHERE i.contrato_id = c.id AND i.plano_id = pp.plano_id)))
    ) THEN 'contrato'
  END
  FROM aba_treatment.procedimentos_plano pp
  WHERE pp.id = p_celula_id;
$$;

ALTER FUNCTION aba_finance.execucao_liberada(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.execucao_liberada(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION aba_finance.execucao_liberada(UUID) TO service_role;

CREATE OR REPLACE FUNCTION aba_finance.exigir_contrato_para_executar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_celula UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'procedimentos_plano' THEN
    IF NEW.estado NOT IN ('em_execucao','executado') OR NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
      RETURN NEW;
    END IF;
    v_celula := NEW.id;
  ELSE
    v_celula := NEW.procedimento_plano_id;
  END IF;

  IF aba_finance.execucao_liberada(v_celula) IS NULL THEN
    RAISE EXCEPTION 'Sem contrato assinado pelas duas partes, o procedimento não se executa (D-V8).'
      USING ERRCODE = '23514',
            HINT = 'Contrate a opção, emita o documento e registre as duas assinaturas — ou peça ao proprietário a dispensa do procedimento.';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_finance.exigir_contrato_para_executar() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.exigir_contrato_para_executar() FROM PUBLIC, anon, authenticated;

-- Nomes escolhidos para disparar ANTES da validação da face
-- (`trg_execucoes_face_validar`): o Postgres ordena por nome. A ordem não
-- decide nada — as duas só recusam —, mas a mensagem da D-V8 é a primeira
-- que quem executa sem contrato precisa ler.
DROP TRIGGER IF EXISTS trg_execucoes_face_exige_contrato ON aba_treatment.execucoes_face;
CREATE TRIGGER trg_execucoes_face_exige_contrato
  BEFORE INSERT ON aba_treatment.execucoes_face
  FOR EACH ROW EXECUTE FUNCTION aba_finance.exigir_contrato_para_executar();

DROP TRIGGER IF EXISTS trg_proc_plano_exige_contrato ON aba_treatment.procedimentos_plano;
CREATE TRIGGER trg_proc_plano_exige_contrato
  BEFORE UPDATE OF estado ON aba_treatment.procedimentos_plano
  FOR EACH ROW EXECUTE FUNCTION aba_finance.exigir_contrato_para_executar();

-- Opção já contratada não ganha célula: acréscimo é CONTRATO NOVO (D-V4).
-- Sem isto, uma célula nova numa opção contratada aumentaria o trabalho que
-- a trava dupla exige, sem que o contrato assinado a mencione.
CREATE OR REPLACE FUNCTION aba_finance.travar_opcao_contratada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.opcao_id IS NOT DISTINCT FROM OLD.opcao_id THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM aba_finance.contratos c
    JOIN aba_finance.orcamentos o ON o.id = c.orcamento_id AND o.account_id = c.account_id
    WHERE o.opcao_id = NEW.opcao_id AND c.status <> 'cancelado'
  ) THEN
    RAISE EXCEPTION 'Esta opção já foi contratada — acréscimo de serviço é contrato novo (D-V4).'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_finance.travar_opcao_contratada() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.travar_opcao_contratada() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_proc_plano_opcao_contratada ON aba_treatment.procedimentos_plano;
CREATE TRIGGER trg_proc_plano_opcao_contratada
  BEFORE INSERT OR UPDATE OF opcao_id ON aba_treatment.procedimentos_plano
  FOR EACH ROW EXECUTE FUNCTION aba_finance.travar_opcao_contratada();

-- Orçamento contratado não muda mais: o contrato é cópia fiel dele, e uma
-- devolução a rascunho (D-F3) depois do contrato abriria duas versões do
-- mesmo acordo.
CREATE OR REPLACE FUNCTION aba_finance.travar_orcamento_contratado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'atualizado_em') = (to_jsonb(OLD) - 'atualizado_em') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM aba_finance.contratos c WHERE c.orcamento_id = OLD.id AND c.status <> 'cancelado') THEN
    RAISE EXCEPTION 'Orçamento já contratado não muda — o contrato é cópia fiel dele. Para mudar o acordo, cancele o contrato em rascunho ou faça contrato novo.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_finance.travar_orcamento_contratado() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.travar_orcamento_contratado() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orcamentos_contratado ON aba_finance.orcamentos;
CREATE TRIGGER trg_orcamentos_contratado
  BEFORE UPDATE ON aba_finance.orcamentos
  FOR EACH ROW EXECUTE FUNCTION aba_finance.travar_orcamento_contratado();

-- ---------------------------------------------------------------------
-- §8 — A GUARDA DO CONTRATO: estados, conteúdo congelado e a trava dupla
--
-- A policy de `UPDATE` de `contratos` autoriza `agent` desde a 010. Regra
-- escrita só nas funções seria contornada por `UPDATE contratos SET status
-- = 'encerrado'` direto pelo PostgREST — a lição da 01.8 (A01) e da 051 §7.
-- Por isso o estado se decide AQUI, em todo caminho de escrita.
--
--   · INSERT com sessão: nasce em `rascunho`, sem documento. `ativo` não
--     nasce mais (D-F14).
--   · → `assinado`: só de `rascunho`, com documento e as DUAS assinaturas
--     sobre o hash ATUAL. Vale até sem sessão: é integridade, não alçada.
--   · → `encerrado` (contrato com linha): só de `assinado`, e só com a
--     TRAVA DUPLA satisfeita — pago tudo E executado tudo. Também sem
--     exceção de sessão.
--   · → `cancelado`: de `rascunho` (ou do `ativo` antigo). Contrato
--     assinado não se cancela no MVP: distrato é pendência declarada.
--   · Conteúdo (paciente, orçamento, profissional, dinheiro) congela fora
--     de `rascunho`. Em `rascunho` com documento emitido, mudar conteúdo
--     DESCARTA o documento e as assinaturas — assinatura sobre um hash que
--     não descreve mais o contrato não assina nada.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_finance.guardar_estado_contrato()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sessao    BOOLEAN := auth.uid() IS NOT NULL;
  v_com_linha BOOLEAN;
  v_sit       RECORD;
  v_mudou     BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF v_sessao AND OLD.status <> 'rascunho' THEN
      RAISE EXCEPTION 'Só contrato em rascunho se apaga; este está %.', OLD.status USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_sessao AND NEW.status <> 'rascunho' THEN
      RAISE EXCEPTION 'Contrato nasce em rascunho — assinado só com as duas assinaturas, e "ativo" sem assinatura não existe mais (D-V8, D-F14).'
        USING ERRCODE = '23514';
    END IF;
    IF v_sessao AND (NEW.documento_hash IS NOT NULL OR NEW.assinado_em IS NOT NULL OR NEW.encerrado_em IS NOT NULL) THEN
      RAISE EXCEPTION 'Contrato não nasce com documento, assinatura ou encerramento.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- ============ UPDATE ============
  v_com_linha := EXISTS (SELECT 1 FROM aba_finance.itens_contrato i WHERE i.contrato_id = NEW.id);

  -- Em contrato COM linha, o total a pagar é derivado: bruto menos desconto.
  -- Total calculado em dois lugares vira dois números na primeira vez que
  -- alguém esquecer um deles.
  IF v_com_linha THEN
    NEW.valor := GREATEST(NEW.valor_bruto - NEW.desconto_valor, 0);
  END IF;

  v_mudou := NEW.cliente_id      IS DISTINCT FROM OLD.cliente_id
          OR NEW.orcamento_id    IS DISTINCT FROM OLD.orcamento_id
          OR NEW.profissional_id IS DISTINCT FROM OLD.profissional_id
          OR NEW.valor           IS DISTINCT FROM OLD.valor
          OR NEW.valor_bruto     IS DISTINCT FROM OLD.valor_bruto
          OR NEW.desconto_valor  IS DISTINCT FROM OLD.desconto_valor
          OR NEW.parcelas        IS DISTINCT FROM OLD.parcelas
          OR NEW.taxa_juros      IS DISTINCT FROM OLD.taxa_juros
          OR NEW.taxa_multa_atraso IS DISTINCT FROM OLD.taxa_multa_atraso
          OR NEW.dia_vencimento  IS DISTINCT FROM OLD.dia_vencimento
          OR NEW.forma_pagamento IS DISTINCT FROM OLD.forma_pagamento
          OR NEW.pacote_id       IS DISTINCT FROM OLD.pacote_id;

  -- Conteúdo congelado depois da assinatura. O `ativo` antigo continua
  -- editável como sempre foi: a regra nasce com os estados novos.
  IF OLD.status IN ('assinado','encerrado') AND (v_mudou
       OR NEW.documento_hash IS DISTINCT FROM OLD.documento_hash
       OR NEW.documento_html IS DISTINCT FROM OLD.documento_html) THEN
    RAISE EXCEPTION 'Contrato % não muda de conteúdo — acréscimo ou mudança de acordo é contrato novo (D-V4).', OLD.status
      USING ERRCODE = '23514';
  END IF;

  -- Documento descartado por mudança de conteúdo em rascunho.
  IF OLD.status = 'rascunho' AND NEW.status = 'rascunho' AND v_mudou AND OLD.documento_hash IS NOT NULL THEN
    NEW.documento_html       := NULL;
    NEW.documento_hash       := NULL;
    NEW.documento_emitido_em := NULL;
    DELETE FROM aba_finance.assinaturas_contrato WHERE contrato_id = NEW.id;
    INSERT INTO aba_finance.eventos_contrato (account_id, contrato_id, tipo, ator, detalhe)
    VALUES (NEW.account_id, NEW.id, 'documento_descartado', auth.uid(),
            jsonb_build_object('hash_descartado', OLD.documento_hash));
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    -- Carimbos de estado não se forjam por fora da transição.
    IF NEW.assinado_em IS DISTINCT FROM OLD.assinado_em OR NEW.encerrado_em IS DISTINCT FROM OLD.encerrado_em THEN
      RAISE EXCEPTION 'Data de assinatura e de encerramento são do banco.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- ============ transições ============
  IF NEW.status = 'ativo' THEN
    RAISE EXCEPTION 'Contrato não passa a "ativo": sem as duas assinaturas não há contrato vigente (D-V8, D-F14).'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'rascunho' THEN
    RAISE EXCEPTION 'Contrato % não volta a rascunho.', OLD.status USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'assinado' THEN
    IF OLD.status <> 'rascunho' THEN
      RAISE EXCEPTION 'Só contrato em rascunho se assina; este está %.', OLD.status USING ERRCODE = '23514';
    END IF;
    IF NEW.documento_hash IS NULL THEN
      RAISE EXCEPTION 'Contrato sem documento emitido não se assina — as assinaturas são sobre o hash do documento (D-V10).'
        USING ERRCODE = '23514';
    END IF;
    IF (SELECT count(DISTINCT a.parte) FROM aba_finance.assinaturas_contrato a
        WHERE a.contrato_id = NEW.id AND a.hash_assinado = NEW.documento_hash) < 2 THEN
      RAISE EXCEPTION 'Faltam assinaturas: o contrato só sai de rascunho com profissional E paciente assinando o mesmo documento (D-V9).'
        USING ERRCODE = '23514';
    END IF;
    NEW.assinado_em := NOW();
    NEW.data_inicio := COALESCE(NEW.data_inicio, CURRENT_DATE);
    RETURN NEW;
  END IF;

  IF NEW.status = 'encerrado' THEN
    IF NOT v_com_linha THEN
      -- Contrato antigo, sem linha: o fluxo de antes, sem trava nova.
      IF OLD.status NOT IN ('ativo') THEN
        RAISE EXCEPTION 'Só contrato assinado se encerra; este está %.', OLD.status USING ERRCODE = '23514';
      END IF;
      NEW.encerrado_em := NOW();
      RETURN NEW;
    END IF;

    IF OLD.status <> 'assinado' THEN
      RAISE EXCEPTION 'Só contrato assinado se encerra; este está %.', OLD.status USING ERRCODE = '23514';
    END IF;

    -- A TRAVA DUPLA. A armadilha que ela existe para impedir está nomeada no
    -- plano: declarar o contrato concluído no último pagamento, com trabalho
    -- ainda por receber — o simétrico do KPI "Vencido" que a 02.10 pagou.
    SELECT * INTO v_sit FROM aba_finance.calcular_situacao_contrato(NEW.id);
    IF v_sit.falta_pagamento OR v_sit.falta_execucao THEN
      RAISE EXCEPTION 'O contrato continua aberto: %.',
        concat_ws(' e ',
          CASE WHEN v_sit.falta_pagamento THEN format('falta pagamento (saldo devedor R$ %s)', v_sit.saldo_devedor) END,
          CASE WHEN v_sit.falta_execucao THEN format('falta execução (%s de %s unidades executadas)',
                                                     v_sit.unidades_executadas, v_sit.unidades_previstas) END)
        USING ERRCODE = '23514';
    END IF;
    NEW.encerrado_em := NOW();
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelado' THEN
    IF v_sessao AND OLD.status NOT IN ('rascunho','ativo') THEN
      RAISE EXCEPTION 'Contrato % não se cancela no MVP — distrato de contrato assinado ainda não existe.', OLD.status
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_finance.guardar_estado_contrato() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.guardar_estado_contrato() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_contratos_estado ON aba_finance.contratos;
CREATE TRIGGER trg_contratos_estado
  BEFORE INSERT OR UPDATE OR DELETE ON aba_finance.contratos
  FOR EACH ROW EXECUTE FUNCTION aba_finance.guardar_estado_contrato();

-- ---------------------------------------------------------------------
-- §8b — O que a DUPLA ASSINATURA solta (E5, E7)
--
-- A INVERSÃO BRASILEIRA (Max, 2026-09-03): a cobrança se solta na
-- assinatura, antes de qualquer execução. As faturas nascem PREVISTAS —
-- em `rascunho`, uma por parcela —, e é a fila de aprovação da 03.18 que
-- as leva a `aberta`. E o pacote é vendido aqui, pela operação que já
-- existe (`vender_pacote`), com o saldo ligado à linha (D-F12).
--
-- Parcelas iguais, e a última absorve os centavos: R$ 100 em 3 é
-- 33,33 + 33,33 + 33,34, e a soma bate com o contrato. Juros e mora são
-- TERMOS do contrato (cobrados em atraso), não acréscimo à parcela.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_finance.ao_assinar_contrato()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n        INT := GREATEST(NEW.parcelas, 1);
  v_base     NUMERIC(12,2);
  v_valor    NUMERIC(12,2);
  v_venc     DATE;
  v_mes      DATE;
  v_fatura   UUID;
  v_i        INT;
  r          RECORD;
  v_pc       UUID;
BEGIN
  IF NEW.status <> 'assinado' OR OLD.status = 'assinado' THEN
    RETURN NULL;
  END IF;

  IF NEW.valor > 0 THEN
    v_base := trunc(NEW.valor / v_n, 2);
    FOR v_i IN 1..v_n LOOP
      v_valor := CASE WHEN v_i = v_n THEN NEW.valor - v_base * (v_n - 1) ELSE v_base END;
      v_mes := (date_trunc('month', NEW.data_inicio) + make_interval(months => v_i - 1))::DATE;
      v_venc := CASE
        WHEN NEW.dia_vencimento IS NULL THEN (NEW.data_inicio + make_interval(months => v_i - 1))::DATE
        ELSE make_date(extract(year FROM v_mes)::INT, extract(month FROM v_mes)::INT,
                       LEAST(NEW.dia_vencimento::INT,
                             extract(day FROM (v_mes + INTERVAL '1 month' - INTERVAL '1 day'))::INT))
      END;

      INSERT INTO aba_finance.faturas (account_id, contrato_id, cliente_id, status, data_vencimento, observacoes)
      VALUES (NEW.account_id, NEW.id, NEW.cliente_id, 'rascunho', v_venc,
              format('Parcela %s de %s do contrato', v_i, v_n))
      RETURNING id INTO v_fatura;

      INSERT INTO aba_finance.itens_fatura (account_id, fatura_id, descricao, quantidade, valor_unitario)
      VALUES (NEW.account_id, v_fatura, format('Parcela %s de %s do contrato', v_i, v_n), 1, v_valor);

      INSERT INTO aba_finance.parcelas_contrato (account_id, contrato_id, fatura_id, numero, valor, data_vencimento)
      VALUES (NEW.account_id, NEW.id, v_fatura, v_i, v_valor, v_venc);
    END LOOP;
  END IF;

  FOR r IN
    SELECT i.id, i.pacote_id, i.valor_total
    FROM aba_finance.itens_contrato i
    WHERE i.contrato_id = NEW.id AND i.pacote_id IS NOT NULL AND i.pacote_cliente_id IS NULL
    ORDER BY i.criado_em, i.id
  LOOP
    v_pc := aba_finance.vender_pacote(NEW.cliente_id, r.pacote_id, r.valor_total, NULL, NULL);
    UPDATE aba_finance.itens_contrato SET pacote_cliente_id = v_pc WHERE id = r.id;
  END LOOP;

  INSERT INTO aba_finance.eventos_contrato (account_id, contrato_id, tipo, ator, detalhe)
  VALUES (NEW.account_id, NEW.id, 'assinado', auth.uid(),
          jsonb_build_object('hash', NEW.documento_hash, 'parcelas', CASE WHEN NEW.valor > 0 THEN v_n ELSE 0 END));

  RETURN NULL;
END;
$$;

ALTER FUNCTION aba_finance.ao_assinar_contrato() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.ao_assinar_contrato() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_contratos_ao_assinar ON aba_finance.contratos;
CREATE TRIGGER trg_contratos_ao_assinar
  AFTER UPDATE OF status ON aba_finance.contratos
  FOR EACH ROW EXECUTE FUNCTION aba_finance.ao_assinar_contrato();

-- Encerramento também deixa trilha.
CREATE OR REPLACE FUNCTION aba_finance.registrar_transicao_contrato()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('encerrado','cancelado') THEN
    INSERT INTO aba_finance.eventos_contrato (account_id, contrato_id, tipo, ator)
    VALUES (NEW.account_id, NEW.id, NEW.status, auth.uid());
  END IF;
  RETURN NULL;
END;
$$;

ALTER FUNCTION aba_finance.registrar_transicao_contrato() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.registrar_transicao_contrato() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_contratos_transicao ON aba_finance.contratos;
CREATE TRIGGER trg_contratos_transicao
  AFTER UPDATE OF status ON aba_finance.contratos
  FOR EACH ROW EXECUTE FUNCTION aba_finance.registrar_transicao_contrato();

-- PRIVILÉGIO POR COLUNA em `contratos`: documento, carimbos, origem e bruto
-- só as funções desta migration escrevem. Tabela revogada e lista
-- reconcedida — nunca revogação por coluna sozinha (`instrucoes.md` §5).
REVOKE INSERT, UPDATE ON aba_finance.contratos FROM authenticated;
GRANT INSERT (account_id, cliente_id, pacote_id, codigo, descricao, valor, moeda, ciclo_cobranca,
              data_inicio, data_fim, status, parcelas, taxa_juros, taxa_multa_atraso,
              dia_vencimento, forma_pagamento, desconto_valor)
  ON aba_finance.contratos TO authenticated;
GRANT UPDATE (codigo, descricao, valor, moeda, ciclo_cobranca, data_inicio, data_fim, status,
              parcelas, taxa_juros, taxa_multa_atraso, dia_vencimento, forma_pagamento, desconto_valor)
  ON aba_finance.contratos TO authenticated;

-- D-F14: vender pacote deixa de ser gesto solto de balcão. O saldo de
-- sessões só nasce na dupla assinatura (§8b), que chama esta função como
-- dona. `service_role` continua podendo, para semente e rotina.
REVOKE EXECUTE ON FUNCTION aba_finance.vender_pacote(UUID, UUID, NUMERIC, UUID, TIMESTAMPTZ) FROM authenticated;

-- ---------------------------------------------------------------------
-- §9 — O DOCUMENTO CANÔNICO (D-V10)
--
-- MESMA ENTRADA, MESMO BYTE. O que o torna determinístico, e cada item é
-- uma armadilha evitada:
--   · nenhum `NOW()`: a data impressa é a de criação do contrato;
--   · nenhuma formatação que dependa de LOCALE da sessão (`to_char` com
--     `G`/`D` mudaria com `lc_numeric`): moeda formatada à mão;
--   · ordem TOTAL das linhas (tipo, nome, id) — sem ela, dois `SELECT`
--     iguais podem devolver ordens diferentes;
--   · escape de HTML em todo texto vindo do cadastro.
-- O hash é SHA-256 do texto em UTF-8, nativo do Postgres, sem extensão.
--
-- NADA CLÍNICO NO DOCUMENTO: nomes de procedimento e de pacote (catálogo),
-- valores e condições. Nunca a localização do trabalho no paciente nem o
-- título livre do plano — o documento mora em `aba_finance`.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_finance.escapar_html(p_texto TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT replace(replace(replace(replace(replace(COALESCE(p_texto, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

CREATE OR REPLACE FUNCTION aba_finance.formatar_moeda(p_valor NUMERIC)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- "R$ 1.234,56", sempre, em qualquer locale de sessão.
  SELECT 'R$ ' || reverse(regexp_replace(reverse(split_part(to_char(round(COALESCE(p_valor, 0), 2), 'FM999999999990.00'), '.', 1)),
                                         '(\d{3})(?=\d)', '\1.', 'g'))
         || ',' || split_part(to_char(round(COALESCE(p_valor, 0), 2), 'FM999999999990.00'), '.', 2);
$$;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION aba_finance.escapar_html(TEXT) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION aba_finance.formatar_moeda(NUMERIC) FROM PUBLIC, anon, authenticated;
END $$;

CREATE OR REPLACE FUNCTION aba_finance.renderizar_documento_contrato(p_contrato_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c        RECORD;
  v_linhas   TEXT;
  v_n        INT;
  v_base     NUMERIC(12,2);
  v_ultima   NUMERIC(12,2);
  v_cond     TEXT;
BEGIN
  SELECT c.id, c.criado_em, c.valor, c.valor_bruto, c.desconto_valor, c.parcelas,
         c.taxa_juros, c.taxa_multa_atraso, c.dia_vencimento,
         a.name AS clinica, pe.nome_exibicao AS paciente, pr.nome_exibicao AS profissional
    INTO v_c
  FROM aba_finance.contratos c
  JOIN public.accounts a ON a.id = c.account_id
  JOIN aba_people.pessoas pe ON pe.id = c.cliente_id AND pe.account_id = c.account_id
  LEFT JOIN aba_scheduling.profissionais pr ON pr.id = c.profissional_id AND pr.account_id = c.account_id
  WHERE c.id = p_contrato_id;

  IF v_c.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- As linhas. Para o item PLANO, a composição por nome de procedimento
  -- vem das linhas de procedimento do orçamento contratado.
  SELECT string_agg(l.html, E'\n' ORDER BY l.ordem, l.nome, l.id) INTO v_linhas
  FROM (
    SELECT i.id,
           CASE WHEN i.plano_id IS NOT NULL THEN 1 WHEN i.pacote_id IS NOT NULL THEN 2 ELSE 3 END AS ordem,
           COALESCE(pc.nome, pk.nome, 'Plano de tratamento personalizado') AS nome,
           '<tr><td>' ||
           CASE
             WHEN i.plano_id IS NOT NULL THEN
               'Plano de tratamento personalizado' ||
               COALESCE('<ul>' || (
                 SELECT string_agg('<li>' || aba_finance.escapar_html(x.nome) || ' &times; ' || x.qtd || '</li>', '' ORDER BY x.nome)
                 FROM (
                   SELECT p2.nome, count(*) AS qtd
                   FROM aba_finance.contratos c2
                   JOIN aba_finance.itens_orcamento io ON io.orcamento_id = c2.orcamento_id AND io.account_id = c2.account_id
                   JOIN aba_catalog.procedimentos p2 ON p2.id = io.procedimento_id AND p2.account_id = io.account_id
                   WHERE c2.id = i.contrato_id
                   GROUP BY p2.nome
                 ) x) || '</ul>', '')
             WHEN i.pacote_id IS NOT NULL THEN 'Pacote: ' || aba_finance.escapar_html(pk.nome)
             ELSE 'Procedimento: ' || aba_finance.escapar_html(pc.nome)
           END ||
           '</td><td>' || i.quantidade || '</td><td>' || aba_finance.formatar_moeda(i.valor_unitario) ||
           '</td><td>' || aba_finance.formatar_moeda(i.valor_total) || '</td></tr>' AS html
    FROM aba_finance.itens_contrato i
    LEFT JOIN aba_catalog.procedimentos pc ON pc.id = i.procedimento_id AND pc.account_id = i.account_id
    LEFT JOIN aba_catalog.pacotes pk ON pk.id = i.pacote_id AND pk.account_id = i.account_id
    WHERE i.contrato_id = p_contrato_id
  ) l;

  v_n := GREATEST(v_c.parcelas, 1);
  v_base := trunc(v_c.valor / v_n, 2);
  v_ultima := v_c.valor - v_base * (v_n - 1);
  v_cond := CASE WHEN v_n = 1 THEN 'Pagamento em parcela única de ' || aba_finance.formatar_moeda(v_c.valor)
                 WHEN v_ultima = v_base THEN v_n || ' parcelas de ' || aba_finance.formatar_moeda(v_base)
                 ELSE (v_n - 1) || ' parcelas de ' || aba_finance.formatar_moeda(v_base) ||
                      ' e uma última de ' || aba_finance.formatar_moeda(v_ultima) END;

  RETURN
    '<!-- modelo: contrato-v1 -->' || E'\n' ||
    '<article class="contrato">' || E'\n' ||
    '<h1>Contrato de prestação de serviços</h1>' || E'\n' ||
    '<p>Contrato ' || v_c.id || ', de ' || to_char(v_c.criado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') || '.</p>' || E'\n' ||
    '<p><strong>Contratada:</strong> ' || aba_finance.escapar_html(v_c.clinica) || '</p>' || E'\n' ||
    '<p><strong>Paciente:</strong> ' || aba_finance.escapar_html(v_c.paciente) || '</p>' || E'\n' ||
    '<p><strong>Profissional responsável:</strong> ' || COALESCE(aba_finance.escapar_html(v_c.profissional), 'não definido') || '</p>' || E'\n' ||
    '<table><thead><tr><th>Serviço</th><th>Qtd.</th><th>Valor unitário</th><th>Total</th></tr></thead><tbody>' || E'\n' ||
    COALESCE(v_linhas, '') || E'\n' ||
    '</tbody></table>' || E'\n' ||
    '<p>Valor dos serviços: ' || aba_finance.formatar_moeda(v_c.valor_bruto) ||
    '. Desconto: ' || aba_finance.formatar_moeda(v_c.desconto_valor) ||
    '. <strong>Total: ' || aba_finance.formatar_moeda(v_c.valor) || '</strong>.</p>' || E'\n' ||
    '<p>Condições: ' || v_cond ||
    CASE WHEN v_c.dia_vencimento IS NOT NULL THEN ', com vencimento no dia ' || v_c.dia_vencimento || ' de cada mês' ELSE '' END ||
    '. Juros de ' || replace(to_char(v_c.taxa_juros, 'FM990.00'), '.', ',') || '% e multa por atraso de ' ||
    replace(to_char(v_c.taxa_multa_atraso, 'FM990.00'), '.', ',') || '%.</p>' || E'\n' ||
    '<p>Nenhum serviço deste contrato é executado antes da assinatura das duas partes. ' ||
    'O contrato só se encerra quando os serviços contratados estiverem integralmente executados ' ||
    'E o valor total estiver integralmente pago; faltando um dos dois, ele continua em vigor.</p>' || E'\n' ||
    '<p>Acréscimo de serviço ou de prazo é objeto de contrato novo.</p>' || E'\n' ||
    '</article>';
END;
$$;

ALTER FUNCTION aba_finance.renderizar_documento_contrato(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.renderizar_documento_contrato(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION aba_finance.renderizar_documento_contrato(UUID) TO service_role;

CREATE OR REPLACE FUNCTION aba_finance.hash_documento(p_html TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT encode(sha256(convert_to(p_html, 'UTF8')), 'hex');
$$;
REVOKE ALL ON FUNCTION aba_finance.hash_documento(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aba_finance.hash_documento(TEXT) TO authenticated, service_role;

-- Sessão, conta e módulo: o preâmbulo de toda operação do contrato.
CREATE OR REPLACE FUNCTION aba_finance.conta_do_chamador(p_papel public.account_role_enum, p_acao TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid();
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Esta operação do contrato exige sessão autenticada.' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_account_member(v_account_id, p_papel) AND access.can('finance', p_acao)) THEN
    RAISE EXCEPTION 'Sem permissão para esta operação do contrato.' USING ERRCODE = '42501';
  END IF;
  RETURN v_account_id;
END;
$$;

ALTER FUNCTION aba_finance.conta_do_chamador(public.account_role_enum, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.conta_do_chamador(public.account_role_enum, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION aba_finance.conta_do_chamador(public.account_role_enum, TEXT) TO service_role;

-- EMITIR: o aceite gera o documento e o hash (D-V10). Se o contrato é
-- CÓPIA FIEL de um orçamento aprovado, a assinatura do profissional
-- DERIVA da aprovação (D-F3, D-F7): quem aprovou o número é quem responde
-- por ele. Se não é cópia fiel — ganhou um avulso, ou não veio de
-- orçamento —, o profissional precisa assinar este documento em pessoa.
CREATE OR REPLACE FUNCTION aba_finance.emitir_documento_contrato(p_contrato_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID := aba_finance.conta_do_chamador('agent', 'update');
  v_c          RECORD;
  v_o          RECORD;
  v_html       TEXT;
  v_hash       TEXT;
  v_fiel       BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_c FROM aba_finance.contratos c WHERE c.id = p_contrato_id AND c.account_id = v_account_id;
  IF v_c.id IS NULL THEN
    RAISE EXCEPTION 'Contrato % não existe nesta conta.', p_contrato_id USING ERRCODE = '42501';
  END IF;
  IF v_c.status <> 'rascunho' THEN
    RAISE EXCEPTION 'Só contrato em rascunho emite documento; este está %.', v_c.status USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM aba_finance.itens_contrato i WHERE i.contrato_id = v_c.id) THEN
    RAISE EXCEPTION 'Contrato sem linha não emite documento.' USING ERRCODE = '23514';
  END IF;

  v_html := aba_finance.renderizar_documento_contrato(v_c.id);
  v_hash := aba_finance.hash_documento(v_html);

  -- Mesmo documento já emitido: nada muda, e as assinaturas continuam.
  IF v_c.documento_hash = v_hash THEN
    RETURN v_hash;
  END IF;

  DELETE FROM aba_finance.assinaturas_contrato WHERE contrato_id = v_c.id;
  UPDATE aba_finance.contratos
     SET documento_html = v_html, documento_hash = v_hash, documento_emitido_em = NOW()
   WHERE id = v_c.id;

  INSERT INTO aba_finance.eventos_contrato (account_id, contrato_id, tipo, ator, detalhe)
  VALUES (v_account_id, v_c.id, 'documento_emitido', auth.uid(), jsonb_build_object('hash', v_hash));

  -- A CÓPIA É FIEL? Mesmo dinheiro que o orçamento aprovado, e as linhas
  -- são exatamente o plano (se houver procedimento) e os pacotes dele.
  SELECT o.* INTO v_o FROM aba_finance.orcamentos o WHERE o.id = v_c.orcamento_id;
  IF v_o.id IS NOT NULL AND v_o.estado = 'aprovado' THEN
    v_fiel := v_c.valor_bruto = v_o.valor_bruto
      AND v_c.desconto_valor = v_o.desconto_valor
      AND v_c.parcelas = v_o.parcelas
      AND v_c.taxa_juros = v_o.taxa_juros
      AND v_c.taxa_multa_atraso = v_o.taxa_multa_atraso
      AND v_c.profissional_id IS NOT DISTINCT FROM v_o.profissional_id
      AND NOT EXISTS (SELECT 1 FROM aba_finance.itens_contrato i
                      WHERE i.contrato_id = v_c.id
                        AND (i.procedimento_id IS NOT NULL
                             OR (i.plano_id IS NOT NULL AND i.plano_id <> v_o.plano_id)
                             OR (i.pacote_id IS NOT NULL AND i.item_orcamento_id IS NULL)))
      AND (SELECT count(*) FROM aba_finance.itens_contrato i WHERE i.contrato_id = v_c.id AND i.pacote_id IS NOT NULL)
          = (SELECT count(*) FROM aba_finance.itens_orcamento io WHERE io.orcamento_id = v_o.id AND io.pacote_id IS NOT NULL);
  END IF;

  IF v_fiel THEN
    INSERT INTO aba_finance.assinaturas_contrato
      (account_id, contrato_id, parte, via, hash_assinado, assinada_em, registrada_por, profissional_id)
    VALUES (v_account_id, v_c.id, 'profissional', 'aprovacao_orcamento', v_hash,
            v_o.aprovado_em, v_o.aprovado_por, v_o.profissional_id);
    INSERT INTO aba_finance.eventos_contrato (account_id, contrato_id, tipo, ator, detalhe)
    VALUES (v_account_id, v_c.id, 'assinatura_registrada', v_o.aprovado_por,
            jsonb_build_object('parte', 'profissional', 'via', 'aprovacao_orcamento', 'hash', v_hash));
  END IF;

  RETURN v_hash;
END;
$$;

ALTER FUNCTION aba_finance.emitir_documento_contrato(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.emitir_documento_contrato(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aba_finance.emitir_documento_contrato(UUID) TO authenticated, service_role;

-- CONFERIR: o documento guardado ainda bate com o hash guardado, e o
-- contrato renderizado AGORA dá o mesmo byte? É a prova de integridade e
-- de determinismo, devolvida em hashes — nunca em texto.
CREATE OR REPLACE FUNCTION aba_finance.conferir_documento_contrato(p_contrato_id UUID)
RETURNS TABLE (hash_guardado TEXT, hash_do_texto_guardado TEXT, hash_renderizado_agora TEXT, integro BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID := aba_finance.conta_do_chamador('viewer', 'read');
  v_c RECORD;
  v_agora TEXT;
BEGIN
  SELECT c.id, c.documento_hash, c.documento_html INTO v_c
  FROM aba_finance.contratos c WHERE c.id = p_contrato_id AND c.account_id = v_account_id;
  IF v_c.id IS NULL THEN
    RETURN;
  END IF;
  v_agora := aba_finance.hash_documento(aba_finance.renderizar_documento_contrato(v_c.id));
  RETURN QUERY SELECT v_c.documento_hash,
                      CASE WHEN v_c.documento_html IS NULL THEN NULL ELSE aba_finance.hash_documento(v_c.documento_html) END,
                      v_agora,
                      v_c.documento_hash IS NOT NULL AND aba_finance.hash_documento(v_c.documento_html) = v_c.documento_hash;
END;
$$;

ALTER FUNCTION aba_finance.conferir_documento_contrato(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.conferir_documento_contrato(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aba_finance.conferir_documento_contrato(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §10 — As assinaturas presenciais (D-V9)
-- ---------------------------------------------------------------------

-- O PROFISSIONAL assina em pessoa quando a assinatura não pôde derivar da
-- aprovação. Só o login dele (D-F7) — sem exceção para o `owner`.
CREATE OR REPLACE FUNCTION aba_finance.assinar_contrato_como_profissional(p_contrato_id UUID, p_hash TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID := aba_finance.conta_do_chamador('agent', 'read');
  v_c RECORD;
BEGIN
  SELECT c.id, c.status, c.documento_hash, c.profissional_id INTO v_c
  FROM aba_finance.contratos c WHERE c.id = p_contrato_id AND c.account_id = v_account_id;
  IF v_c.id IS NULL THEN
    RAISE EXCEPTION 'Contrato % não existe nesta conta.', p_contrato_id USING ERRCODE = '42501';
  END IF;
  IF v_c.status <> 'rascunho' OR v_c.documento_hash IS NULL THEN
    RAISE EXCEPTION 'Só se assina contrato em rascunho com documento emitido.' USING ERRCODE = '23514';
  END IF;
  -- Assina-se o que se leu: o hash informado tem de ser o do documento.
  IF p_hash IS DISTINCT FROM v_c.documento_hash THEN
    RAISE EXCEPTION 'O documento assinado não é o documento atual do contrato — confira o código impresso.' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM aba_scheduling.profissionais pr
    JOIN public.profiles pf ON pf.id = pr.profile_id
    WHERE pr.id = v_c.profissional_id AND pr.account_id = v_account_id AND pf.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Só o profissional responsável assina pela parte profissional (D-F7).' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM aba_finance.assinaturas_contrato a WHERE a.contrato_id = v_c.id AND a.parte = 'profissional') THEN
    RAISE EXCEPTION 'A parte profissional já assinou este documento.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO aba_finance.assinaturas_contrato
    (account_id, contrato_id, parte, via, hash_assinado, assinada_em, registrada_por, profissional_id)
  VALUES (v_account_id, v_c.id, 'profissional', 'presencial', v_c.documento_hash, NOW(), auth.uid(), v_c.profissional_id);
  INSERT INTO aba_finance.eventos_contrato (account_id, contrato_id, tipo, ator, detalhe)
  VALUES (v_account_id, v_c.id, 'assinatura_registrada', auth.uid(),
          jsonb_build_object('parte', 'profissional', 'via', 'presencial', 'hash', v_c.documento_hash));
END;
$$;

ALTER FUNCTION aba_finance.assinar_contrato_como_profissional(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.assinar_contrato_como_profissional(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aba_finance.assinar_contrato_como_profissional(UUID, TEXT) TO authenticated, service_role;

-- O PACIENTE assina o papel diante da recepção, que registra. O profissional
-- assina ANTES (E5: "o contrato nasce com a assinatura do profissional") —
-- e é essa ordem que faz a recepção (`admin`) ser quem solta as faturas,
-- que é dinheiro e passa pela alçada. Com as duas, o contrato vira
-- `assinado` no mesmo gesto.
CREATE OR REPLACE FUNCTION aba_finance.registrar_assinatura_paciente(p_contrato_id UUID, p_hash TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID := aba_finance.conta_do_chamador('admin', 'update');
  v_c RECORD;
BEGIN
  SELECT c.id, c.status, c.documento_hash INTO v_c
  FROM aba_finance.contratos c WHERE c.id = p_contrato_id AND c.account_id = v_account_id;
  IF v_c.id IS NULL THEN
    RAISE EXCEPTION 'Contrato % não existe nesta conta.', p_contrato_id USING ERRCODE = '42501';
  END IF;
  IF v_c.status <> 'rascunho' OR v_c.documento_hash IS NULL THEN
    RAISE EXCEPTION 'Só se assina contrato em rascunho com documento emitido.' USING ERRCODE = '23514';
  END IF;
  IF p_hash IS DISTINCT FROM v_c.documento_hash THEN
    RAISE EXCEPTION 'O documento assinado não é o documento atual do contrato — confira o código impresso.' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM aba_finance.assinaturas_contrato a
                 WHERE a.contrato_id = v_c.id AND a.parte = 'profissional' AND a.hash_assinado = v_c.documento_hash) THEN
    RAISE EXCEPTION 'O profissional assina antes do paciente — o contrato nasce com a assinatura dele (E5).' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM aba_finance.assinaturas_contrato a WHERE a.contrato_id = v_c.id AND a.parte = 'paciente') THEN
    RAISE EXCEPTION 'A assinatura do paciente já foi registrada.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO aba_finance.assinaturas_contrato
    (account_id, contrato_id, parte, via, hash_assinado, assinada_em, registrada_por)
  VALUES (v_account_id, v_c.id, 'paciente', 'presencial', v_c.documento_hash, NOW(), auth.uid());
  INSERT INTO aba_finance.eventos_contrato (account_id, contrato_id, tipo, ator, detalhe)
  VALUES (v_account_id, v_c.id, 'assinatura_registrada', auth.uid(),
          jsonb_build_object('parte', 'paciente', 'via', 'presencial', 'hash', v_c.documento_hash));

  UPDATE aba_finance.contratos SET status = 'assinado' WHERE id = v_c.id;
END;
$$;

ALTER FUNCTION aba_finance.registrar_assinatura_paciente(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.registrar_assinatura_paciente(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aba_finance.registrar_assinatura_paciente(UUID, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §11 — As operações da recepção
--
-- `itens_contrato` não tem escrita para `authenticated` (§2b): linha de
-- contrato só nasce por estas funções, que RESOLVEM o preço pela escada
-- única (`resolver_preco_item`, 051) ou o COPIAM do orçamento aprovado.
-- Nenhuma recebe valor nem tabela de preço — o preço se resolve, não se
-- escolhe (048, verificação (e)). E todas exigem `admin`: é dinheiro.
-- ---------------------------------------------------------------------

-- CONTRATAR A OPÇÃO VENCEDORA (E5). Cópia fiel do orçamento aprovado
-- (D-F9); as demais opções orçadas do plano ficam registradas como
-- RECUSADAS — a opção perdedora é registro, não esquecimento.
CREATE OR REPLACE FUNCTION aba_finance.contratar_opcao(p_orcamento_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID := aba_finance.conta_do_chamador('admin', 'create');
  v_o          RECORD;
  v_cliente_id UUID;
  v_contrato   UUID;
  v_soma_proc  NUMERIC(12,2);
BEGIN
  SELECT o.*, op.rotulo INTO v_o
  FROM aba_finance.orcamentos o
  JOIN aba_treatment.opcoes op ON op.id = o.opcao_id AND op.account_id = o.account_id
  WHERE o.id = p_orcamento_id AND o.account_id = v_account_id;

  IF v_o.id IS NULL THEN
    RAISE EXCEPTION 'Orçamento % não existe nesta conta.', p_orcamento_id USING ERRCODE = '42501';
  END IF;
  IF v_o.estado <> 'aprovado' THEN
    RAISE EXCEPTION 'Só orçamento APROVADO pelo profissional se contrata; este está % (D-F3).', v_o.estado
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM aba_finance.contratos c WHERE c.orcamento_id = v_o.id AND c.status <> 'cancelado') THEN
    RAISE EXCEPTION 'Esta opção já tem contrato.' USING ERRCODE = '23514';
  END IF;

  SELECT p.cliente_id INTO v_cliente_id FROM aba_treatment.planos p WHERE p.id = v_o.plano_id;

  INSERT INTO aba_finance.contratos
    (account_id, cliente_id, orcamento_id, profissional_id, descricao,
     desconto_valor, parcelas, taxa_juros, taxa_multa_atraso)
  VALUES
    (v_account_id, v_cliente_id, v_o.id, v_o.profissional_id,
     'Contrato da opção ' || v_o.rotulo,
     v_o.desconto_valor, v_o.parcelas, v_o.taxa_juros, v_o.taxa_multa_atraso)
  RETURNING id INTO v_contrato;

  -- O PLANO: uma linha, com a soma das linhas de procedimento (D-F9).
  SELECT SUM(io.valor_resolvido) INTO v_soma_proc
  FROM aba_finance.itens_orcamento io
  WHERE io.orcamento_id = v_o.id AND io.procedimento_id IS NOT NULL;

  IF v_soma_proc IS NOT NULL THEN
    INSERT INTO aba_finance.itens_contrato (account_id, contrato_id, plano_id, quantidade, valor_unitario)
    VALUES (v_account_id, v_contrato, v_o.plano_id, 1, v_soma_proc);
  END IF;

  -- OS PACOTES: uma linha por célula de pacote, com a proveniência dela.
  INSERT INTO aba_finance.itens_contrato
    (account_id, contrato_id, pacote_id, item_orcamento_id, degrau, tabela_preco_id, quantidade, valor_unitario)
  SELECT v_account_id, v_contrato, io.pacote_id, io.id, io.degrau, io.tabela_preco_id, 1, io.valor_resolvido
  FROM aba_finance.itens_orcamento io
  WHERE io.orcamento_id = v_o.id AND io.pacote_id IS NOT NULL
  ORDER BY io.criado_em, io.id;

  -- As concorrentes orçadas do mesmo plano ficam recusadas.
  UPDATE aba_finance.orcamentos
     SET estado = 'recusado', aprovado_em = NULL, aprovado_por = NULL
   WHERE plano_id = v_o.plano_id AND id <> v_o.id AND estado <> 'recusado'
     AND account_id = v_account_id;

  INSERT INTO aba_finance.eventos_contrato (account_id, contrato_id, tipo, ator, detalhe)
  VALUES (v_account_id, v_contrato, 'criado', auth.uid(), jsonb_build_object('orcamento_id', v_o.id));

  RETURN v_contrato;
END;
$$;

ALTER FUNCTION aba_finance.contratar_opcao(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.contratar_opcao(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aba_finance.contratar_opcao(UUID) TO authenticated, service_role;

-- CONTRATO SEM PLANO: a limpeza avulsa, o pacote vendido no balcão (D-F14).
CREATE OR REPLACE FUNCTION aba_finance.criar_contrato_avulso(p_cliente_id UUID, p_profissional_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID := aba_finance.conta_do_chamador('admin', 'create');
  v_contrato   UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM aba_people.clientes c WHERE c.id = p_cliente_id AND c.account_id = v_account_id) THEN
    RAISE EXCEPTION 'Paciente % não existe nesta conta.', p_cliente_id USING ERRCODE = '42501';
  END IF;
  IF p_profissional_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM aba_scheduling.profissionais pr WHERE pr.id = p_profissional_id AND pr.account_id = v_account_id
  ) THEN
    RAISE EXCEPTION 'Profissional % não existe nesta conta.', p_profissional_id USING ERRCODE = '42501';
  END IF;

  INSERT INTO aba_finance.contratos (account_id, cliente_id, profissional_id, descricao)
  VALUES (v_account_id, p_cliente_id, p_profissional_id, 'Contrato avulso')
  RETURNING id INTO v_contrato;

  INSERT INTO aba_finance.eventos_contrato (account_id, contrato_id, tipo, ator)
  VALUES (v_account_id, v_contrato, 'criado', auth.uid());

  RETURN v_contrato;
END;
$$;

ALTER FUNCTION aba_finance.criar_contrato_avulso(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.criar_contrato_avulso(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aba_finance.criar_contrato_avulso(UUID, UUID) TO authenticated, service_role;

-- Acrescentar procedimento avulso OU pacote. O plano não entra por aqui:
-- plano só entra pela opção aprovada (`contratar_opcao`), porque o preço
-- dele é o que o profissional aprovou.
CREATE OR REPLACE FUNCTION aba_finance.acrescentar_item_contrato(
  p_contrato_id     UUID,
  p_procedimento_id UUID,
  p_pacote_id       UUID,
  p_quantidade      INT DEFAULT 1
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID := aba_finance.conta_do_chamador('admin', 'create');
  v_c          RECORD;
  v_r          RECORD;
  v_item       UUID;
BEGIN
  IF num_nonnulls(p_procedimento_id, p_pacote_id) <> 1 THEN
    RAISE EXCEPTION 'Informe exatamente um item: procedimento OU pacote.' USING ERRCODE = '22023';
  END IF;

  SELECT c.id, c.cliente_id, c.profissional_id, c.status INTO v_c
  FROM aba_finance.contratos c WHERE c.id = p_contrato_id AND c.account_id = v_account_id;
  IF v_c.id IS NULL THEN
    RAISE EXCEPTION 'Contrato % não existe nesta conta.', p_contrato_id USING ERRCODE = '42501';
  END IF;

  IF p_procedimento_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM aba_catalog.procedimentos p WHERE p.id = p_procedimento_id AND p.account_id = v_account_id AND p.ativo) THEN
    RAISE EXCEPTION 'Procedimento inexistente ou inativo nesta conta.' USING ERRCODE = '23514';
  END IF;
  IF p_pacote_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM aba_catalog.pacotes p WHERE p.id = p_pacote_id AND p.account_id = v_account_id AND p.ativo) THEN
    RAISE EXCEPTION 'Pacote inexistente ou inativo nesta conta.' USING ERRCODE = '23514';
  END IF;

  -- A escada responde com a sessão de quem chama — é ela que define a
  -- conta. `resolver_preco_item` é SECURITY DEFINER e lê `auth.uid()`.
  SELECT r.valor, r.degrau, r.tabela_preco_id INTO v_r
  FROM aba_finance.resolver_preco_item(p_procedimento_id, p_pacote_id, v_c.cliente_id, v_c.profissional_id) r;

  INSERT INTO aba_finance.itens_contrato
    (account_id, contrato_id, procedimento_id, pacote_id, degrau, tabela_preco_id, quantidade, valor_unitario)
  VALUES (v_account_id, v_c.id, p_procedimento_id, p_pacote_id,
          COALESCE(v_r.degrau, 'catalogo'), v_r.tabela_preco_id, COALESCE(p_quantidade, 1), COALESCE(v_r.valor, 0))
  RETURNING id INTO v_item;

  INSERT INTO aba_finance.eventos_contrato (account_id, contrato_id, tipo, ator, detalhe)
  VALUES (v_account_id, v_c.id, 'item_acrescentado', auth.uid(), jsonb_build_object('item_id', v_item));

  RETURN v_item;
END;
$$;

ALTER FUNCTION aba_finance.acrescentar_item_contrato(UUID, UUID, UUID, INT) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.acrescentar_item_contrato(UUID, UUID, UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aba_finance.acrescentar_item_contrato(UUID, UUID, UUID, INT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION aba_finance.remover_item_contrato(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID := aba_finance.conta_do_chamador('admin', 'delete');
  v_contrato   UUID;
BEGIN
  SELECT i.contrato_id INTO v_contrato
  FROM aba_finance.itens_contrato i WHERE i.id = p_item_id AND i.account_id = v_account_id;
  IF v_contrato IS NULL THEN
    RAISE EXCEPTION 'Linha % não existe nesta conta.', p_item_id USING ERRCODE = '42501';
  END IF;
  DELETE FROM aba_finance.itens_contrato WHERE id = p_item_id;
  INSERT INTO aba_finance.eventos_contrato (account_id, contrato_id, tipo, ator, detalhe)
  VALUES (v_account_id, v_contrato, 'item_removido', auth.uid(), jsonb_build_object('item_id', p_item_id));
END;
$$;

ALTER FUNCTION aba_finance.remover_item_contrato(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.remover_item_contrato(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aba_finance.remover_item_contrato(UUID) TO authenticated, service_role;

-- EXECUTAR O AVULSO (D-F12): o profissional da conta registra uma unidade
-- executada. Só com contrato assinado (D-V8), e nunca além da quantidade.
CREATE OR REPLACE FUNCTION aba_finance.registrar_execucao_item(p_item_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
  v_i          RECORD;
  v_prof       UUID;
  v_id         UUID;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid();
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Registrar execução exige sessão autenticada — a execução precisa de autor.' USING ERRCODE = '42501';
  END IF;

  -- Quem executa é PROFISSIONAL da conta: o login por trás de um cadastro
  -- de profissional. Recepção não afirma execução clínica.
  SELECT pr.id INTO v_prof
  FROM aba_scheduling.profissionais pr JOIN public.profiles pf ON pf.id = pr.profile_id
  WHERE pr.account_id = v_account_id AND pf.user_id = auth.uid()
  ORDER BY pr.ativo DESC, pr.criado_em LIMIT 1;
  IF v_prof IS NULL THEN
    RAISE EXCEPTION 'Só profissional registra execução.' USING ERRCODE = '42501';
  END IF;

  SELECT i.id, i.procedimento_id, i.quantidade, c.status, c.id AS contrato_id INTO v_i
  FROM aba_finance.itens_contrato i
  JOIN aba_finance.contratos c ON c.id = i.contrato_id AND c.account_id = i.account_id
  WHERE i.id = p_item_id AND i.account_id = v_account_id;
  IF v_i.id IS NULL THEN
    RAISE EXCEPTION 'Linha % não existe nesta conta.', p_item_id USING ERRCODE = '42501';
  END IF;
  IF v_i.procedimento_id IS NULL THEN
    RAISE EXCEPTION 'Só procedimento avulso se executa por aqui: o plano se executa por face, o pacote por sessão.'
      USING ERRCODE = '23514';
  END IF;
  IF v_i.status <> 'assinado' THEN
    RAISE EXCEPTION 'Sem contrato assinado pelas duas partes, o procedimento não se executa (D-V8).' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) FROM aba_finance.execucoes_item_contrato x WHERE x.item_contrato_id = v_i.id) >= v_i.quantidade THEN
    RAISE EXCEPTION 'Todas as % unidade(s) contratadas já foram executadas.', v_i.quantidade USING ERRCODE = '23514';
  END IF;

  INSERT INTO aba_finance.execucoes_item_contrato (account_id, item_contrato_id, executado_em, executado_por, profissional_id)
  VALUES (v_account_id, v_i.id, NOW(), auth.uid(), v_prof)
  RETURNING id INTO v_id;

  INSERT INTO aba_finance.eventos_contrato (account_id, contrato_id, tipo, ator, detalhe)
  VALUES (v_account_id, v_i.contrato_id, 'execucao_registrada', auth.uid(), jsonb_build_object('item_id', v_i.id));

  RETURN v_id;
END;
$$;

ALTER FUNCTION aba_finance.registrar_execucao_item(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.registrar_execucao_item(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aba_finance.registrar_execucao_item(UUID) TO authenticated, service_role;

-- ENCERRAR é pedir; quem decide é a guarda (§8), que lê a trava dupla.
CREATE OR REPLACE FUNCTION aba_finance.encerrar_contrato(p_contrato_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Encerrar contrato exige sessão autenticada.' USING ERRCODE = '42501';
  END IF;
  UPDATE aba_finance.contratos SET status = 'encerrado' WHERE id = p_contrato_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % não existe ou não está ao seu alcance.', p_contrato_id USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION aba_finance.encerrar_contrato(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aba_finance.encerrar_contrato(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §12 — O cardápio e as leituras da tela
-- ---------------------------------------------------------------------

-- `aba_finance.ofertas` (D-V3, D-F13): o que se pode pôr num contrato.
-- VIEW, não tabela — cardápio não guarda dado, e por isso não traz preço:
-- o preço se resolve na hora de acrescentar. `security_invoker`, SEM O QUAL
-- a view rodaria como dona e furaria a RLS de `planos`, que é clínica: cada
-- linha passa pela policy de quem consulta. O plano aparece só com
-- identificador e data — o título é texto livre do profissional, revogado
-- na 047.
CREATE OR REPLACE VIEW aba_finance.ofertas
WITH (security_invoker = true)
AS
  SELECT 'procedimento'::TEXT AS tipo, p.id AS item_id, p.account_id, p.nome, NULL::UUID AS cliente_id
  FROM aba_catalog.procedimentos p WHERE p.ativo
  UNION ALL
  SELECT 'pacote'::TEXT, k.id, k.account_id, k.nome, NULL::UUID
  FROM aba_catalog.pacotes k WHERE k.ativo
  UNION ALL
  SELECT 'plano'::TEXT, pl.id, pl.account_id,
         'Plano de tratamento de ' || to_char(pl.criado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'),
         pl.cliente_id
  FROM aba_treatment.planos pl;

COMMENT ON VIEW aba_finance.ofertas IS
  'Cardápio do contrato (D-V3, D-F13): procedimentos e pacotes ativos da conta, e planos — cada plano com o cliente_id do paciente dono. security_invoker: passa pela RLS de quem consulta. Consultar por ofertas_para(cliente_id), que só mostra o plano ao paciente dono dele.';

REVOKE ALL ON aba_finance.ofertas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON aba_finance.ofertas TO authenticated, service_role;

CREATE OR REPLACE FUNCTION aba_finance.ofertas_para(p_cliente_id UUID)
RETURNS SETOF aba_finance.ofertas
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  -- O plano de um paciente só aparece no cardápio DELE.
  SELECT o.* FROM aba_finance.ofertas o
  WHERE o.cliente_id IS NULL OR o.cliente_id = p_cliente_id
  ORDER BY CASE o.tipo WHEN 'plano' THEN 1 WHEN 'pacote' THEN 2 ELSE 3 END, o.nome, o.item_id;
$$;

REVOKE ALL ON FUNCTION aba_finance.ofertas_para(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aba_finance.ofertas_para(UUID) TO authenticated, service_role;

-- OS CONTRATOS DO PACIENTE, como a recepção precisa vê-los: linhas por
-- nome, assinaturas, documento (hash) e a situação da trava dupla. Nada
-- clínico, e por isso sem log — a mesma porta de `planos_orcados_do_cliente`.
CREATE OR REPLACE FUNCTION aba_finance.ler_contratos_do_cliente(p_cliente_id UUID)
RETURNS TABLE (
  id                    UUID,
  status                TEXT,
  orcamento_id          UUID,
  plano_id              UUID,
  opcao_rotulo          TEXT,
  profissional_id       UUID,
  profissional_nome     TEXT,
  sou_o_profissional    BOOLEAN,
  valor_bruto           NUMERIC,
  desconto_valor        NUMERIC,
  valor                 NUMERIC,
  parcelas              INT,
  taxa_juros            NUMERIC,
  taxa_multa_atraso     NUMERIC,
  documento_hash        TEXT,
  documento_emitido_em  TIMESTAMPTZ,
  assinado_em           TIMESTAMPTZ,
  encerrado_em          TIMESTAMPTZ,
  criado_em             TIMESTAMPTZ,
  itens                 JSONB,
  assinaturas           JSONB,
  situacao              JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid();
  IF v_account_id IS NULL
     OR NOT (public.is_account_member(v_account_id, 'viewer') AND access.can('finance', 'read')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id, c.status, c.orcamento_id, o.plano_id, op.rotulo, c.profissional_id, pr.nome_exibicao,
    EXISTS (SELECT 1 FROM public.profiles pf2 WHERE pf2.id = pr.profile_id AND pf2.user_id = auth.uid()),
    c.valor_bruto, c.desconto_valor, c.valor, c.parcelas, c.taxa_juros, c.taxa_multa_atraso,
    c.documento_hash, c.documento_emitido_em, c.assinado_em, c.encerrado_em, c.criado_em,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', i.id,
               'tipo', CASE WHEN i.plano_id IS NOT NULL THEN 'plano' WHEN i.pacote_id IS NOT NULL THEN 'pacote' ELSE 'procedimento' END,
               'nome', COALESCE(pc.nome, pk.nome, 'Plano de tratamento personalizado'),
               'quantidade', i.quantidade,
               'valor_unitario', i.valor_unitario,
               'valor_total', i.valor_total,
               'degrau', i.degrau,
               'pacote_cliente_id', i.pacote_cliente_id,
               'executadas', CASE WHEN i.procedimento_id IS NOT NULL
                                  THEN (SELECT count(*) FROM aba_finance.execucoes_item_contrato x WHERE x.item_contrato_id = i.id)
                             END)
             ORDER BY CASE WHEN i.plano_id IS NOT NULL THEN 1 WHEN i.pacote_id IS NOT NULL THEN 2 ELSE 3 END,
                      COALESCE(pc.nome, pk.nome), i.id)
      FROM aba_finance.itens_contrato i
      LEFT JOIN aba_catalog.procedimentos pc ON pc.id = i.procedimento_id AND pc.account_id = i.account_id
      LEFT JOIN aba_catalog.pacotes pk ON pk.id = i.pacote_id AND pk.account_id = i.account_id
      WHERE i.contrato_id = c.id
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'parte', a.parte, 'via', a.via, 'assinada_em', a.assinada_em,
               'hash_assinado', a.hash_assinado, 'registrada_por_nome', pf3.full_name)
             ORDER BY a.parte)
      FROM aba_finance.assinaturas_contrato a
      LEFT JOIN public.profiles pf3 ON pf3.user_id = a.registrada_por AND pf3.account_id = a.account_id
      WHERE a.contrato_id = c.id
    ), '[]'::jsonb),
    (SELECT to_jsonb(s) FROM aba_finance.calcular_situacao_contrato(c.id) s)
  FROM aba_finance.contratos c
  LEFT JOIN aba_finance.orcamentos o ON o.id = c.orcamento_id AND o.account_id = c.account_id
  LEFT JOIN aba_treatment.opcoes op ON op.id = o.opcao_id AND op.account_id = o.account_id
  LEFT JOIN aba_scheduling.profissionais pr ON pr.id = c.profissional_id AND pr.account_id = c.account_id
  WHERE c.cliente_id = p_cliente_id AND c.account_id = v_account_id
  ORDER BY c.criado_em DESC;
END;
$$;

ALTER FUNCTION aba_finance.ler_contratos_do_cliente(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.ler_contratos_do_cliente(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aba_finance.ler_contratos_do_cliente(UUID) TO authenticated, service_role;

-- Para a tela do profissional EXPLICAR por que "marcar face executada" não
-- aparece: quais células do plano estão liberadas, e por quê. Só
-- identificadores — nada clínico.
CREATE OR REPLACE FUNCTION aba_finance.execucao_liberada_no_plano(p_plano_id UUID)
RETURNS TABLE (celula_id UUID, liberada_por TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cliente UUID;
BEGIN
  SELECT p.cliente_id INTO v_cliente FROM aba_treatment.planos p
  JOIN public.profiles pf ON pf.account_id = p.account_id AND pf.user_id = auth.uid()
  WHERE p.id = p_plano_id;
  IF v_cliente IS NULL OR NOT aba_treatment.pode_planejar(v_cliente, 'leitura') THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT pp.id, aba_finance.execucao_liberada(pp.id)
  FROM aba_treatment.procedimentos_plano pp
  WHERE pp.plano_id = p_plano_id AND aba_finance.execucao_liberada(pp.id) IS NOT NULL;
END;
$$;

ALTER FUNCTION aba_finance.execucao_liberada_no_plano(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.execucao_liberada_no_plano(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aba_finance.execucao_liberada_no_plano(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §13 — `ler_planos` devolve as faces executadas, na leitura que registra
--
-- Mesma assinatura e mesmo tipo de retorno: `CREATE OR REPLACE` preserva o
-- privilégio. A única mudança é a chave `execucoes` na célula — e ela sai
-- por aqui, e não por `select` na tabela, porque `face` é coluna revogada.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_treatment.ler_planos(p_cliente_id UUID)
RETURNS TABLE (
  id             UUID,
  cliente_id     UUID,
  profissional_id UUID,
  titulo         TEXT,
  observacao     TEXT,
  criado_em      TIMESTAMPTZ,
  atualizado_em  TIMESTAMPTZ,
  opcoes         JSONB,
  diagnosticos   JSONB,
  procedimentos  JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_account_id UUID;
BEGIN
  -- Negado devolve VAZIO, não exceção — e nada logado, porque nada lido.
  IF p_cliente_id IS NULL OR NOT aba_treatment.pode_planejar(p_cliente_id, 'leitura') THEN
    RETURN;
  END IF;

  SELECT account_id INTO v_account_id FROM public.profiles WHERE user_id = v_user_id;
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  -- O LOG VEM ANTES DO RETURN. Se viesse depois, uma leitura interrompida
  -- no meio devolveria dado sem deixar rastro — que é o caso em que o
  -- rastro mais importa.
  INSERT INTO aba_health.log_acesso
    (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
  SELECT v_account_id, v_user_id, p_cliente_id, 'plano', p.id, 'leitura',
         jsonb_build_object('via', 'aba_treatment.ler_planos')
  FROM aba_treatment.planos p
  WHERE p.cliente_id = p_cliente_id AND p.account_id = v_account_id;

  -- `account_id` reafirmado no filtro: `SECURITY DEFINER` não passa por
  -- RLS, então a fronteira de conta é responsabilidade desta função.
  RETURN QUERY
  SELECT
    p.id, p.cliente_id, p.profissional_id, p.titulo, p.observacao,
    p.criado_em, p.atualizado_em,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', o.id, 'rotulo', o.rotulo, 'ordem', o.ordem,
               'consentida_em', o.consentida_em, 'consentida_por', o.consentida_por)
             ORDER BY o.ordem)
      FROM aba_treatment.opcoes o WHERE o.plano_id = p.id
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id, 'dente', d.dente, 'faces', d.faces, 'descricao', d.descricao,
               -- A FILA DE TRABALHO é derivada, e vem calculada daqui:
               -- diagnóstico sem procedimento nenhum ainda não foi fasado.
               'fasado', EXISTS (SELECT 1 FROM aba_treatment.procedimentos_plano x
                                 WHERE x.diagnostico_id = d.id))
             ORDER BY d.criado_em)
      FROM aba_treatment.diagnosticos d WHERE d.plano_id = p.id
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', pp.id, 'opcao_id', pp.opcao_id, 'fase_id', pp.fase_id,
               'procedimento_id', pp.procedimento_id,
               -- O braço novo do arco (Subetapa 03.8.c). Exatamente um dos
               -- dois vem preenchido.
               'pacote_id', pp.pacote_id,
               'diagnostico_id', pp.diagnostico_id,
               'dente', pp.dente, 'faces', pp.faces, 'estado', pp.estado,
               'consentimento_id', pp.consentimento_id,
               'recusado_em', pp.recusado_em, 'recusado_por', pp.recusado_por,
               'executado_em', pp.executado_em, 'executado_por', pp.executado_por,
               'observacao', pp.observacao,
               -- AS FACES EXECUTADAS, com data e autor (Subetapa 03.8.b,
               -- passo 36 do caminho feliz).
               'execucoes', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                          'face', e.face, 'executado_em', e.executado_em,
                          'executado_por', e.executado_por, 'executado_por_nome', pfe.full_name)
                        ORDER BY e.executado_em, e.face)
                 FROM aba_treatment.execucoes_face e
                 LEFT JOIN public.profiles pfe ON pfe.user_id = e.executado_por AND pfe.account_id = e.account_id
                 WHERE e.procedimento_plano_id = pp.id
               ), '[]'::jsonb))
             ORDER BY pp.criado_em)
      FROM aba_treatment.procedimentos_plano pp WHERE pp.plano_id = p.id
    ), '[]'::jsonb)
  FROM aba_treatment.planos p
  WHERE p.cliente_id = p_cliente_id AND p.account_id = v_account_id
  ORDER BY p.criado_em;
END;
$$;

COMMENT ON FUNCTION aba_treatment.ler_planos(UUID) IS
  'Única porta de leitura do conteúdo clínico do plano (dente, face, texto livre e, desde a 052, as faces executadas). Registra em aba_health.log_acesso com tipo_registro = plano, uma linha por plano lido, ANTES de devolver. Autorização negada devolve conjunto vazio e não loga. Porte literal de aba_health.ler_evolucoes (Maximus 053).';

ALTER FUNCTION aba_treatment.ler_planos(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_treatment.ler_planos(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_treatment.ler_planos(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION aba_treatment.ler_planos(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §14 — VERIFICAÇÕES QUE RECUSAM A MIGRATION
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_sobra   TEXT;
  v_n       INT;
  v_funcoes TEXT[] := ARRAY[
    'conferir_item_contrato','recalcular_bruto_contrato','calcular_situacao_contrato','situacao_contrato',
    'execucao_liberada','exigir_contrato_para_executar','travar_opcao_contratada','travar_orcamento_contratado',
    'guardar_estado_contrato','ao_assinar_contrato','registrar_transicao_contrato','escapar_html','formatar_moeda',
    'renderizar_documento_contrato','hash_documento','conta_do_chamador','emitir_documento_contrato',
    'conferir_documento_contrato','assinar_contrato_como_profissional','registrar_assinatura_paciente',
    'contratar_opcao','criar_contrato_avulso','acrescentar_item_contrato','remover_item_contrato',
    'registrar_execucao_item','encerrar_contrato','ofertas_para','ler_contratos_do_cliente',
    'execucao_liberada_no_plano','validar_execucao_face','cobertura_da_celula','derivar_estado_da_celula',
    'exigir_faces_para_executado','carimbar_dispensa_contrato','ler_planos'];
BEGIN
  -- (a) toda tabela nova tem RLS e policy
  SELECT string_agg(t, ', ') INTO v_sobra
  FROM unnest(ARRAY['aba_finance.itens_contrato','aba_finance.assinaturas_contrato','aba_finance.eventos_contrato',
                    'aba_finance.execucoes_item_contrato','aba_treatment.execucoes_face','aba_catalog.dispensas_contrato']) t
  WHERE NOT (SELECT relrowsecurity FROM pg_class WHERE oid = t::regclass)
     OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = t::regclass);
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'Tabela nova sem RLS ou sem policy: %', v_sobra;
  END IF;

  -- (b) as chaves novas nasceram compostas por conta
  SELECT count(*) INTO v_n FROM public.fks_sem_isolamento_de_conta();
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Há % chave(s) estrangeira(s) multi-inquilino sem account_id.', v_n;
  END IF;

  -- (c) nenhuma função tocada executável por PUBLIC ou anon; gatilhos e
  -- internas fora do alcance de authenticated
  SELECT string_agg(n.nspname || '.' || p.proname, ', ') INTO v_sobra
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('aba_finance','aba_treatment','aba_catalog') AND p.proname = ANY (v_funcoes)
    AND (has_function_privilege('public', p.oid, 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE'));
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'Função executável por PUBLIC/anon: %', v_sobra;
  END IF;
  SELECT string_agg(p.proname, ', ') INTO v_sobra
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('aba_finance','aba_treatment','aba_catalog')
    AND p.proname IN ('calcular_situacao_contrato','execucao_liberada','renderizar_documento_contrato','conta_do_chamador',
                      'cobertura_da_celula','guardar_estado_contrato','ao_assinar_contrato','exigir_contrato_para_executar')
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'Função interna executável por authenticated: %', v_sobra;
  END IF;
  -- D-F14
  IF has_function_privilege('authenticated', 'aba_finance.vender_pacote(uuid,uuid,numeric,uuid,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'vender_pacote continua executável por authenticated — o saldo nasceria sem contrato assinado (D-F14).';
  END IF;

  -- (d) assinatura, trilha, linha e execução avulsa NÃO são escrevíveis
  -- por quem elas registram
  SELECT string_agg(t || ':' || priv, ', ') INTO v_sobra
  FROM unnest(ARRAY['aba_finance.itens_contrato','aba_finance.assinaturas_contrato',
                    'aba_finance.eventos_contrato','aba_finance.execucoes_item_contrato']) t
  CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE']) priv
  WHERE has_table_privilege('authenticated', t, priv)
     OR has_any_column_privilege('authenticated', t, CASE WHEN priv IN ('INSERT','UPDATE') THEN priv ELSE 'INSERT' END);
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'Escrita direta aberta a authenticated em: %', v_sobra;
  END IF;
  IF has_column_privilege('authenticated', 'aba_finance.contratos', 'documento_hash', 'UPDATE')
     OR has_column_privilege('authenticated', 'aba_finance.contratos', 'documento_html', 'UPDATE')
     OR has_column_privilege('authenticated', 'aba_finance.contratos', 'assinado_em', 'UPDATE')
     OR has_column_privilege('authenticated', 'aba_finance.contratos', 'valor_bruto', 'UPDATE')
     OR has_column_privilege('authenticated', 'aba_finance.contratos', 'orcamento_id', 'INSERT') THEN
    RAISE EXCEPTION 'Documento, carimbo ou origem do contrato escrevíveis por authenticated.';
  END IF;

  -- (e) O ARCO de três braços no contrato
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'aba_finance.itens_contrato'::regclass
                 AND conname = 'itens_contrato_um_item'
                 AND pg_get_constraintdef(oid) ~ 'num_nonnulls\(procedimento_id, pacote_id, plano_id\) = 1') THEN
    RAISE EXCEPTION 'Arco procedimento/pacote/plano ausente ou diferente em itens_contrato.';
  END IF;

  -- (f) A FRONTEIRA CLÍNICA: nenhuma tabela nova de aba_finance guarda
  -- localização no corpo nem texto livre; o documento não lê as colunas
  -- clínicas da célula; a face executada é ilegível por coluna
  SELECT string_agg(table_name || '.' || column_name, ', ') INTO v_sobra
  FROM information_schema.columns
  WHERE table_schema = 'aba_finance'
    AND table_name IN ('itens_contrato','assinaturas_contrato','eventos_contrato','execucoes_item_contrato')
    AND column_name IN ('dente','faces','face','descricao','observacao','titulo');
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'Tabela do contrato passou a guardar dado clínico (%).', v_sobra;
  END IF;
  IF pg_get_functiondef('aba_finance.renderizar_documento_contrato(uuid)'::regprocedure)
     ~ '\.(dente|faces|titulo|observacao)\M' THEN
    RAISE EXCEPTION 'O documento canônico passou a ler coluna clínica — ele mora em aba_finance.';
  END IF;
  IF has_column_privilege('authenticated', 'aba_treatment.execucoes_face', 'face', 'SELECT') THEN
    RAISE EXCEPTION 'execucoes_face.face legível por authenticated — a face só sai por ler_planos.';
  END IF;
  IF pg_get_function_result('aba_finance.ler_contratos_do_cliente(uuid)'::regprocedure) ~* '(dente|faces|titulo)'
     OR pg_get_function_result('aba_finance.situacao_contrato(uuid)'::regprocedure) ~* '(dente|faces|face )' THEN
    RAISE EXCEPTION 'Leitura financeira do contrato passou a devolver dado clínico.';
  END IF;

  -- (g) o regime clínico da tabela nova: log de escrita e sem UPDATE/DELETE
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'aba_treatment.execucoes_face'::regclass
                 AND tgname = 'registrar_escrita_plano' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'execucoes_face sem gatilho de log de escrita.';
  END IF;
  IF has_table_privilege('authenticated', 'aba_treatment.execucoes_face', 'UPDATE')
     OR has_table_privilege('authenticated', 'aba_treatment.execucoes_face', 'DELETE')
     OR has_any_column_privilege('authenticated', 'aba_treatment.execucoes_face', 'UPDATE') THEN
    RAISE EXCEPTION 'Execução afirmada ficou alterável por authenticated.';
  END IF;

  -- (h) as travas estão penduradas onde têm de estar
  SELECT string_agg(x.tg, ', ') INTO v_sobra
  FROM (VALUES
    ('trg_execucoes_face_exige_contrato', 'aba_treatment.execucoes_face'),
    ('trg_proc_plano_exige_contrato',     'aba_treatment.procedimentos_plano'),
    ('trg_proc_plano_executado_por_faces','aba_treatment.procedimentos_plano'),
    ('trg_proc_plano_opcao_contratada',   'aba_treatment.procedimentos_plano'),
    ('trg_orcamentos_contratado',         'aba_finance.orcamentos'),
    ('trg_contratos_estado',              'aba_finance.contratos'),
    ('trg_contratos_ao_assinar',          'aba_finance.contratos'),
    ('trg_contratos_alcada',              'aba_finance.contratos'),
    ('trg_itens_contrato_conferir',       'aba_finance.itens_contrato'),
    ('trg_itens_contrato_alcada',         'aba_finance.itens_contrato')
  ) AS x(tg, tab)
  WHERE NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = x.tab::regclass AND t.tgname = x.tg AND NOT t.tgisinternal);
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'Gatilho ausente: %', v_sobra;
  END IF;

  -- (i) a view do cardápio não fura a RLS
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'aba_finance.ofertas'::regclass
                 AND 'security_invoker=true' = ANY (reloptions)) THEN
    RAISE EXCEPTION 'aba_finance.ofertas sem security_invoker — a view rodaria como dona e furaria a RLS de planos.';
  END IF;

  -- (j) o documento é determinístico por construção: o renderizador não
  -- lê relógio
  IF pg_get_functiondef('aba_finance.renderizar_documento_contrato(uuid)'::regprocedure) ~* '(now\(\)|current_date|current_timestamp|clock_timestamp)' THEN
    RAISE EXCEPTION 'O renderizador do documento lê o relógio — o mesmo contrato deixaria de dar o mesmo hash.';
  END IF;
END $$;
