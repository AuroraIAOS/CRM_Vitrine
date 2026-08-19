-- ============================================================
-- 027_observabilidade_agendador.sql — ver o motor por dentro (02.10)
--
-- A Conclusão da Subetapa 02.10 exige que "um job de pg_cron roda no
-- horário e é **observável**". Observável pelo produto, não só pelo SQL
-- editor do fornecedor — senão a única forma de saber se o motor está de
-- pé é abrir o painel da Supabase, e ausência de comportamento continua
-- sendo o sintoma silencioso que a pendência vigiada da 02.0 descreve.
--
-- POR QUE FUNÇÃO E NÃO EXPOSIÇÃO DO SCHEMA `cron`
--
-- Expor `cron` ao PostgREST entregaria ao navegador a superfície inteira
-- de agendamento: `cron.schedule` e `cron.unschedule` são funções do
-- mesmo schema. Um usuário autenticado passaria a poder criar job — isto
-- é, executar SQL arbitrário no banco, no horário que quisesse, como
-- `postgres`. As duas funções abaixo moram em `aba_automations` (já
-- exposto) e devolvem apenas leitura, já reduzida ao que a tela mostra.
--
-- `listar_jobs_agendados()` exige `admin+`: o agendador é infraestrutura
-- da conta, não dado de operação diária, e o comando de cada job revela
-- nomes de função interna do banco.
--
-- `listar_execucoes_pendentes()` é o único caminho de leitura da fila do
-- passo de espera — `automacao_execucoes_pendentes` nasceu (migration
-- 017) sem policy nenhuma para `authenticated`, de propósito, porque só o
-- motor escreve nela. Ler continua exigindo passar pela fronteira de
-- conta, reafirmada à mão aqui dentro: SECURITY DEFINER não é filtrado
-- por RLS (mesma disciplina do achado A06 da Subetapa 01.8).
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

CREATE OR REPLACE FUNCTION aba_automations.listar_jobs_agendados()
RETURNS TABLE (
  jobid BIGINT,
  jobname TEXT,
  schedule TEXT,
  command TEXT,
  active BOOLEAN,
  ultima_execucao TIMESTAMPTZ,
  ultimo_status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  SELECT p.account_id INTO v_account_id
  FROM public.profiles p WHERE p.user_id = auth.uid();

  -- Falha fechada: sem perfil, sem conta, sem papel suficiente → conjunto
  -- vazio, nunca erro. Erro distinguiria "não pode ver" de "não existe".
  IF v_account_id IS NULL OR NOT public.is_account_member(v_account_id, 'admin') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    j.jobid,
    j.jobname::TEXT,
    j.schedule::TEXT,
    j.command::TEXT,
    j.active,
    d.start_time,
    d.status::TEXT
  FROM cron.job j
  -- Última corrida de cada job. Os jobs são globais do banco (não têm
  -- account_id): é infraestrutura compartilhada, e por isso a checagem
  -- acima é de papel, não de pertencimento a conta.
  LEFT JOIN LATERAL (
    SELECT r.start_time, r.status
    FROM cron.job_run_details r
    WHERE r.jobid = j.jobid
    ORDER BY r.start_time DESC
    LIMIT 1
  ) d ON TRUE
  ORDER BY j.jobname;
END;
$$;

ALTER FUNCTION aba_automations.listar_jobs_agendados() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_automations.listar_jobs_agendados() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_automations.listar_jobs_agendados() FROM anon;
GRANT EXECUTE ON FUNCTION aba_automations.listar_jobs_agendados() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION aba_automations.listar_execucoes_pendentes()
RETURNS TABLE (
  id UUID,
  automacao_id UUID,
  status TEXT,
  executar_em TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  SELECT p.account_id INTO v_account_id
  FROM public.profiles p WHERE p.user_id = auth.uid();

  IF v_account_id IS NULL
     OR NOT (public.is_account_member(v_account_id, 'viewer') AND access.can('automations', 'read')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT e.id, e.automacao_id, e.status, e.executar_em
  FROM aba_automations.automacao_execucoes_pendentes e
  -- A fronteira de conta é ESTE filtro. Sem ele, a função devolveria a
  -- fila de todos os inquilinos — SECURITY DEFINER não passa por RLS.
  WHERE e.account_id = v_account_id
  ORDER BY e.executar_em;
END;
$$;

ALTER FUNCTION aba_automations.listar_execucoes_pendentes() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_automations.listar_execucoes_pendentes() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_automations.listar_execucoes_pendentes() FROM anon;
GRANT EXECUTE ON FUNCTION aba_automations.listar_execucoes_pendentes() TO authenticated, service_role;
