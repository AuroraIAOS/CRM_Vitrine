-- ============================================================
-- 011_aba_finance_operations.sql — operações do módulo aba_finance
--
-- Origem: Maximus 071_finance_operations.sql, funções renomeadas
-- conforme CLAUDE.md §2 (função de schema aba_* é snake_case PT-BR):
--   sell_package            → vender_plano
--   refund_session          → estornar_sessao
--   refresh_invoice_status  → atualizar_status_fatura
--   recalc_invoice_amount   → recalcular_valor_fatura (trigger)
--   mark_overdue_invoices   → marcar_faturas_vencidas
--   expire_packages         → expirar_planos
--   packages_expiring_within→ planos_vencendo_em
--
-- 010_aba_finance.sql criou o schema, as tabelas e os três triggers de
-- reação (total do item, baixa por soma de pagamentos, conclusão do
-- atendimento). Esta migration acrescenta o que a tela vai precisar e
-- que não pode ser dois comandos soltos do cliente — mesma lógica que
-- aba_people.converter_lead(): uma falha de rede no meio de duas
-- escritas relacionadas não pode deixar o banco pela metade.
--
-- Todas SECURITY INVOKER: a trava é a RLS de 010, não um "IF papel <>"
-- no corpo (mesma decisão já usada em access.set_module_permission,
-- 003_core_access.sql). As duas rotinas de cron (marcar_faturas_
-- vencidas, expirar_planos) são a exceção de PRIVILÉGIO, não de
-- mecanismo: continuam INVOKER, mas o EXECUTE só vai para
-- service_role, que é quem a rotina de cron da Etapa 02 vai usar.
--
-- Hardening dobrado desde a criação: REVOKE ALL FROM PUBLIC *e* FROM
-- anon em toda função, na mesma migration que a cria.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

-- ============================================================
-- 1. Venda de plano
--
-- Criar planos_cliente e depois saldos_plano a partir de
-- aba_catalog.itens_plano são duas escritas que precisam ser uma
-- transação só: uma falha de rede no meio deixaria plano vendido sem
-- saldo nenhum — o cliente pagou por dez sessões e o sistema não sabe
-- de nenhuma.
--
-- Agregação por serviço é obrigatória, não conveniência: o índice
-- idx_saldos_plano_servico_unico é UNIQUE (plano_cliente_id,
-- servico_id), então um plano de catálogo com dois itens do mesmo
-- serviço (ex.: "5 sessões" + "5 sessões de bônus") quebraria a venda
-- com 23505. Somar as sessões é o que a pessoa quis dizer.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_finance.vender_plano(
  p_cliente_id UUID,
  p_plano_id UUID,
  p_preco_total NUMERIC DEFAULT NULL,
  p_fatura_id UUID DEFAULT NULL,
  p_expira_em TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
  v_plano RECORD;
  v_plano_cliente_id UUID;
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
    INTO v_plano
  FROM aba_catalog.planos p
  WHERE p.id = p_plano_id;

  IF v_plano.id IS NULL THEN
    RAISE EXCEPTION 'Plano não encontrado ou fora do seu alcance'
      USING ERRCODE = '22023', DETAIL = 'plano_nao_encontrado';
  END IF;

  IF v_plano.account_id <> v_account_id THEN
    RAISE EXCEPTION 'Cliente e plano pertencem a contas diferentes'
      USING ERRCODE = '22023', DETAIL = 'conta_divergente';
  END IF;

  IF NOT v_plano.ativo THEN
    RAISE EXCEPTION 'Plano inativo não pode ser vendido'
      USING ERRCODE = '23514', DETAIL = 'plano_inativo';
  END IF;

  SELECT count(*) INTO v_itens
  FROM aba_catalog.itens_plano pi
  WHERE pi.plano_id = p_plano_id;

  IF v_itens = 0 THEN
    RAISE EXCEPTION 'Plano sem nenhum serviço não gera saldo'
      USING ERRCODE = '23514', DETAIL = 'plano_sem_itens';
  END IF;

  v_expira_em := COALESCE(
    p_expira_em,
    CASE WHEN v_plano.dias_validade IS NOT NULL
         THEN NOW() + (v_plano.dias_validade || ' days')::INTERVAL END
  );

  INSERT INTO aba_finance.planos_cliente
    (account_id, cliente_id, plano_id, fatura_id, preco_total, expira_em)
  VALUES
    (v_account_id, p_cliente_id, p_plano_id, p_fatura_id,
     COALESCE(p_preco_total, v_plano.preco_total), v_expira_em)
  RETURNING id INTO v_plano_cliente_id;

  INSERT INTO aba_finance.saldos_plano
    (account_id, plano_cliente_id, servico_id, variante_servico_id, sessoes_totais)
  SELECT
    v_account_id,
    v_plano_cliente_id,
    pi.servico_id,
    (array_agg(pi.variante_servico_id ORDER BY pi.criado_em))[1],
    SUM(pi.sessoes_incluidas)::INTEGER
  FROM aba_catalog.itens_plano pi
  WHERE pi.plano_id = p_plano_id
  GROUP BY pi.servico_id;

  RETURN v_plano_cliente_id;
END;
$$;

REVOKE ALL ON FUNCTION aba_finance.vender_plano(UUID, UUID, NUMERIC, UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.vender_plano(UUID, UUID, NUMERIC, UUID, TIMESTAMPTZ) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.vender_plano(UUID, UUID, NUMERIC, UUID, TIMESTAMPTZ) TO authenticated, service_role;

-- ============================================================
-- 2. Estorno de sessão
--
-- "Contador de saldo alterado sem lançamento no livro é bug esperando
-- acontecer" (handoffs/instrucoes.md §6). Estorno é lançamento +1 no
-- extrato; o trigger aplicar_extrato_ao_saldo (010) move o contador.
-- Esta função valida ANTES, com mensagem própria — sem ela o estorno
-- indevido bate no CHECK (sessoes_usadas >= 0) e a pessoa recebe o
-- texto cru do Postgres.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_finance.estornar_sessao(
  p_plano_cliente_id UUID,
  p_servico_id UUID,
  p_motivo TEXT DEFAULT NULL,
  p_agendamento_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
  v_usadas INTEGER;
  v_extrato_id UUID;
BEGIN
  SELECT s.account_id, s.sessoes_usadas INTO v_account_id, v_usadas
  FROM aba_finance.saldos_plano s
  WHERE s.plano_cliente_id = p_plano_cliente_id
    AND s.servico_id = p_servico_id;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Não há saldo cadastrado para este serviço neste plano'
      USING ERRCODE = '22023', DETAIL = 'saldo_nao_encontrado';
  END IF;

  IF v_usadas <= 0 THEN
    RAISE EXCEPTION 'Não há sessão consumida para estornar neste serviço'
      USING ERRCODE = '23514', DETAIL = 'nada_a_estornar';
  END IF;

  INSERT INTO aba_finance.extrato_plano
    (account_id, plano_cliente_id, agendamento_id, servico_id, delta, motivo, criado_por)
  VALUES
    (v_account_id, p_plano_cliente_id, p_agendamento_id, p_servico_id, 1,
     COALESCE(p_motivo, 'Estorno manual de sessão'), auth.uid())
  RETURNING id INTO v_extrato_id;

  RETURN v_extrato_id;
END;
$$;

REVOKE ALL ON FUNCTION aba_finance.estornar_sessao(UUID, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.estornar_sessao(UUID, UUID, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.estornar_sessao(UUID, UUID, TEXT, UUID) TO authenticated, service_role;

-- ============================================================
-- 3. Total da fatura a partir dos itens
--
-- Regra deliberada: a fatura COM item tem valor igual à soma dos
-- itens; a fatura SEM item mantém o valor digitado. Recalcular para
-- zero toda fatura sem item apagaria, em silêncio, o valor de quem
-- lança fatura avulsa sem detalhar — caso legítimo já suportado pela
-- coluna valor de 010.
--
-- O recálculo precisa reavaliar a baixa junto: uma fatura de R$300 já
-- paga que perde um item e vira R$200 continuaria "paga" corretamente,
-- mas o caminho inverso (item novo elevando o total acima do pago)
-- deixaria uma fatura "paga" com saldo em aberto. Por isso a mesma
-- lógica do trigger de pagamento roda aqui.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_finance.atualizar_status_fatura(p_fatura_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = aba_finance, public
AS $$
DECLARE
  v_valor NUMERIC(12,2);
  v_pago NUMERIC(12,2);
  v_status TEXT;
BEGIN
  SELECT valor, status INTO v_valor, v_status
  FROM aba_finance.faturas WHERE id = p_fatura_id;

  IF v_status IS NULL OR v_status IN ('cancelada', 'rascunho') THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(valor), 0) INTO v_pago
  FROM aba_finance.pagamentos WHERE fatura_id = p_fatura_id;

  IF v_pago >= v_valor AND v_valor > 0 THEN
    UPDATE aba_finance.faturas SET status = 'paga'
    WHERE id = p_fatura_id AND status <> 'paga';
  ELSIF v_status = 'paga' THEN
    UPDATE aba_finance.faturas SET status = 'enviada' WHERE id = p_fatura_id;
  END IF;
END;
$$;

ALTER FUNCTION aba_finance.atualizar_status_fatura(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.atualizar_status_fatura(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.atualizar_status_fatura(UUID) FROM anon;
REVOKE ALL ON FUNCTION aba_finance.atualizar_status_fatura(UUID) FROM authenticated;
-- Ninguém chama de fora: é usada pelo trigger abaixo, que roda com o
-- privilégio do dono da tabela e não depende de EXECUTE do chamador.

CREATE OR REPLACE FUNCTION aba_finance.recalcular_valor_fatura()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = aba_finance, public
AS $$
DECLARE
  v_fatura_id UUID := COALESCE(NEW.fatura_id, OLD.fatura_id);
  v_soma NUMERIC(12,2);
  v_qtd INTEGER;
BEGIN
  SELECT COALESCE(SUM(valor_total), 0), count(*) INTO v_soma, v_qtd
  FROM aba_finance.itens_fatura WHERE fatura_id = v_fatura_id;

  IF v_qtd > 0 THEN
    UPDATE aba_finance.faturas SET valor = v_soma
    WHERE id = v_fatura_id AND valor IS DISTINCT FROM v_soma;
    PERFORM aba_finance.atualizar_status_fatura(v_fatura_id);
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION aba_finance.recalcular_valor_fatura() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.recalcular_valor_fatura() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.recalcular_valor_fatura() FROM anon;
REVOKE ALL ON FUNCTION aba_finance.recalcular_valor_fatura() FROM authenticated;

DROP TRIGGER IF EXISTS recalcular_valor_fatura ON aba_finance.itens_fatura;
CREATE TRIGGER recalcular_valor_fatura
  AFTER INSERT OR UPDATE OR DELETE ON aba_finance.itens_fatura
  FOR EACH ROW EXECUTE FUNCTION aba_finance.recalcular_valor_fatura();

-- ============================================================
-- 4 e 5. Rotinas de vencimento
--
-- Rodam pela rota de cron da Etapa 02, com service_role. SECURITY
-- INVOKER de propósito: sob service_role a RLS já é ignorada por
-- natureza da role, e não há motivo para criar uma função DEFINER que
-- qualquer chamador autenticado poderia usar para varrer contas. O
-- EXECUTE fica só com service_role.
--
-- expirar_planos marca vencido apenas o que está ativo: plano esgotado
-- (consumido até o fim) já cumpriu o que foi vendido e não vira
-- "vencido" retroativamente.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_finance.marcar_faturas_vencidas()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_qtd INTEGER;
BEGIN
  WITH atualizadas AS (
    UPDATE aba_finance.faturas f
    SET status = 'vencida'
    WHERE f.status IN ('aberta', 'enviada')
      AND f.data_vencimento IS NOT NULL
      AND f.data_vencimento < CURRENT_DATE
      AND COALESCE(
            (SELECT SUM(p.valor) FROM aba_finance.pagamentos p WHERE p.fatura_id = f.id),
            0
          ) < f.valor
    RETURNING 1
  )
  SELECT count(*)::INTEGER INTO v_qtd FROM atualizadas;
  RETURN v_qtd;
END;
$$;

REVOKE ALL ON FUNCTION aba_finance.marcar_faturas_vencidas() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.marcar_faturas_vencidas() FROM anon;
REVOKE ALL ON FUNCTION aba_finance.marcar_faturas_vencidas() FROM authenticated;
GRANT EXECUTE ON FUNCTION aba_finance.marcar_faturas_vencidas() TO service_role;

CREATE OR REPLACE FUNCTION aba_finance.expirar_planos()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_qtd INTEGER;
BEGIN
  WITH atualizados AS (
    UPDATE aba_finance.planos_cliente pc
    SET status = 'vencido'
    WHERE pc.status = 'ativo'
      AND pc.expira_em IS NOT NULL
      AND pc.expira_em < NOW()
    RETURNING 1
  )
  SELECT count(*)::INTEGER INTO v_qtd FROM atualizados;
  RETURN v_qtd;
END;
$$;

REVOKE ALL ON FUNCTION aba_finance.expirar_planos() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.expirar_planos() FROM anon;
REVOKE ALL ON FUNCTION aba_finance.expirar_planos() FROM authenticated;
GRANT EXECUTE ON FUNCTION aba_finance.expirar_planos() TO service_role;

-- ============================================================
-- 6. Planos vencendo — aviso, não mudança de estado.
--
-- INVOKER e chamável por authenticated: a lista sai filtrada pela RLS
-- de planos_cliente, então cada conta vê só o que é dela.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_finance.planos_vencendo_em(p_dias INTEGER DEFAULT 15)
RETURNS TABLE (
  plano_cliente_id UUID,
  cliente_id UUID,
  plano_id UUID,
  expira_em TIMESTAMPTZ,
  sessoes_restantes INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    pc.id,
    pc.cliente_id,
    pc.plano_id,
    pc.expira_em,
    COALESCE(SUM(s.sessoes_totais - s.sessoes_usadas), 0)::INTEGER
  FROM aba_finance.planos_cliente pc
  LEFT JOIN aba_finance.saldos_plano s ON s.plano_cliente_id = pc.id
  WHERE pc.status = 'ativo'
    AND pc.expira_em IS NOT NULL
    AND pc.expira_em >= NOW()
    AND pc.expira_em < NOW() + (GREATEST(COALESCE(p_dias, 15), 0) || ' days')::INTERVAL
  GROUP BY pc.id, pc.cliente_id, pc.plano_id, pc.expira_em
  ORDER BY pc.expira_em;
$$;

REVOKE ALL ON FUNCTION aba_finance.planos_vencendo_em(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.planos_vencendo_em(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.planos_vencendo_em(INTEGER) TO authenticated, service_role;
