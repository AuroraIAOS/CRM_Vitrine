-- ============================================================
-- 009_aba_scheduling.sql — schema aba_scheduling (agenda e
-- atendimentos)
--
-- Mapa de origem: db/migrations/README.md → aba_scheduling
-- (045_scheduling_schema.sql + 068_scheduling_reminders.sql, ambos já
-- embutidos no DDL inicial — não como patch posterior). Nomes
-- traduzidos conforme docs/02_MODELO_DE_DADOS.md §7: professionals→
-- profissionais, professional_schedules→horarios_profissionais,
-- time_off→ausencias, resources→recursos, resource_schedules→
-- horarios_recursos, appointments→agendamentos, appointment_services→
-- agendamento_servicos, reminders→lembretes.
--
-- DECISÃO DE ESCOPO — profissional exige funcionário ativo (Maximus
-- 075_professionals_require_employee.sql): db/migrations/README.md
-- (Subetapa 01.0) listava 075 como "entra no DDL inicial" junto com
-- 068, mas o critério de Qualidade da Subetapa 01.3 em
-- docs/00_PLANO_E_CRITERIOS.md só relaciona 067/068/071/078/079 — 075
-- não está lá. 075 depende de 074_employees_born_from_invitation.sql
-- (fluxo de convite→funcionário que o Vitrine ainda não construiu) e
-- de uma checagem de papel dentro do corpo de uma RPC de governança
-- (scheduling.set_professional) que também não existe aqui ainda.
-- Decisão desta subetapa: NÃO portar o CHECK "ativo exige funcionário"
-- nem a RPC de liga/desliga agora — seria implementar regra de negócio
-- em cima de um fluxo de convite inexistente, contrariando CLAUDE.md
-- §15 (não expandir escopo sem aprovação). O que É portado: a FK
-- profissionais.funcionario_id → aba_people.funcionarios(id), porque
-- aba_people já modela funcionário por chave compartilhada (diferente
-- do Maximus, que precisou de employee_id solto) — é só o desenho de
-- dado, sem a regra de governança em cima. Registrado como pendência
-- em handoffs/instrucoes.md §5 para quando a tela de profissionais
-- entrar (Etapa 02).
--
-- appointments.customer_package_id (Maximus) e reminders.message_id
-- (Maximus) seguem o padrão de FK ausente por dependência de módulo
-- opcional (docs/02 §3.3, handoffs/instrucoes.md §4 "exportabilidade
-- de módulo é decisão de FK"): aba_finance e aba_messaging são
-- aplicados depois de aba_scheduling (aba_finance na mesma subetapa,
-- por último; aba_messaging só na 01.6) — as colunas ficam UUID sem
-- REFERENCES, documentadas caso a caso abaixo.
--
-- RLS no padrão obrigatório de docs/02 §2, module_key = 'scheduling'.
--
-- Hardening dobrado desde a primeira migration (mesmo padrão de
-- 008_aba_catalog.sql): REVOKE ALL FROM PUBLIC *e* FROM anon em toda
-- função; GRANT de tabela estreito (nunca TRUNCATE); ALTER DEFAULT
-- PRIVILEGES já reescrito nesta migration.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS aba_scheduling;

-- ============================================================
-- Fuso da conta — ponto único de verdade. Postgres não lê o .env da
-- aplicação; se o fuso operacional do projeto mudar, muda aqui.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_scheduling.fuso_horario_conta()
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT 'America/Sao_Paulo'::TEXT $$;

REVOKE ALL ON FUNCTION aba_scheduling.fuso_horario_conta() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_scheduling.fuso_horario_conta() FROM anon;
GRANT EXECUTE ON FUNCTION aba_scheduling.fuso_horario_conta() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION aba_scheduling.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION aba_scheduling.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_scheduling.set_updated_at() FROM anon;
GRANT EXECUTE ON FUNCTION aba_scheduling.set_updated_at() TO authenticated, service_role;

-- ============================================================
-- Profissionais e jornada
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_scheduling.profissionais (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  profile_id            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Ver decisão de escopo no cabeçalho: só o desenho de FK é portado,
  -- sem o CHECK "ativo exige funcionário" do Maximus 075.
  funcionario_id        UUID REFERENCES aba_people.funcionarios(id) ON DELETE SET NULL,
  nome_exibicao         TEXT NOT NULL,
  cor                   TEXT NOT NULL DEFAULT '#3b82f6',
  registro_conselho     TEXT,
  especialidade         TEXT,
  acesso_clinico        BOOLEAN NOT NULL DEFAULT TRUE,
  ativo                 BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profissionais_account ON aba_scheduling.profissionais(account_id);
CREATE INDEX IF NOT EXISTS idx_profissionais_profile
  ON aba_scheduling.profissionais(profile_id) WHERE profile_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profissionais_funcionario_unico
  ON aba_scheduling.profissionais(funcionario_id) WHERE funcionario_id IS NOT NULL;

ALTER TABLE aba_scheduling.profissionais ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_scheduling.profissionais;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_scheduling.profissionais
  FOR EACH ROW EXECUTE FUNCTION aba_scheduling.set_updated_at();

DROP POLICY IF EXISTS profissionais_select ON aba_scheduling.profissionais;
CREATE POLICY profissionais_select ON aba_scheduling.profissionais FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('scheduling', 'read'));
DROP POLICY IF EXISTS profissionais_insert ON aba_scheduling.profissionais;
CREATE POLICY profissionais_insert ON aba_scheduling.profissionais FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'create'));
DROP POLICY IF EXISTS profissionais_update ON aba_scheduling.profissionais;
CREATE POLICY profissionais_update ON aba_scheduling.profissionais FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'update'));
DROP POLICY IF EXISTS profissionais_delete ON aba_scheduling.profissionais;
CREATE POLICY profissionais_delete ON aba_scheduling.profissionais FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'delete'));

CREATE TABLE IF NOT EXISTS aba_scheduling.horarios_profissionais (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  profissional_id UUID NOT NULL REFERENCES aba_scheduling.profissionais(id) ON DELETE CASCADE,
  dia_semana      SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  inicio          TIME NOT NULL,
  fim             TIME NOT NULL,
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (fim > inicio)
);
CREATE INDEX IF NOT EXISTS idx_horarios_profissionais_lookup
  ON aba_scheduling.horarios_profissionais(profissional_id, dia_semana) WHERE ativo;

ALTER TABLE aba_scheduling.horarios_profissionais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS horarios_profissionais_select ON aba_scheduling.horarios_profissionais;
CREATE POLICY horarios_profissionais_select ON aba_scheduling.horarios_profissionais FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('scheduling', 'read'));
DROP POLICY IF EXISTS horarios_profissionais_insert ON aba_scheduling.horarios_profissionais;
CREATE POLICY horarios_profissionais_insert ON aba_scheduling.horarios_profissionais FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'create'));
DROP POLICY IF EXISTS horarios_profissionais_update ON aba_scheduling.horarios_profissionais;
CREATE POLICY horarios_profissionais_update ON aba_scheduling.horarios_profissionais FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'update'));
DROP POLICY IF EXISTS horarios_profissionais_delete ON aba_scheduling.horarios_profissionais;
CREATE POLICY horarios_profissionais_delete ON aba_scheduling.horarios_profissionais FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'delete'));

CREATE TABLE IF NOT EXISTS aba_scheduling.ausencias (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  profissional_id UUID NOT NULL REFERENCES aba_scheduling.profissionais(id) ON DELETE CASCADE,
  inicio          TIMESTAMPTZ NOT NULL,
  fim             TIMESTAMPTZ NOT NULL,
  motivo          TEXT,
  criado_por      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (fim > inicio)
);
CREATE INDEX IF NOT EXISTS idx_ausencias_profissional
  ON aba_scheduling.ausencias(profissional_id, inicio, fim);

ALTER TABLE aba_scheduling.ausencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ausencias_select ON aba_scheduling.ausencias;
CREATE POLICY ausencias_select ON aba_scheduling.ausencias FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('scheduling', 'read'));
DROP POLICY IF EXISTS ausencias_insert ON aba_scheduling.ausencias;
CREATE POLICY ausencias_insert ON aba_scheduling.ausencias FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'create'));
DROP POLICY IF EXISTS ausencias_update ON aba_scheduling.ausencias;
CREATE POLICY ausencias_update ON aba_scheduling.ausencias FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'update'));
DROP POLICY IF EXISTS ausencias_delete ON aba_scheduling.ausencias;
CREATE POLICY ausencias_delete ON aba_scheduling.ausencias FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'delete'));

-- ============================================================
-- Recursos (salas, macas, aparelhos)
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_scheduling.recursos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  tipo           TEXT NOT NULL DEFAULT 'sala' CHECK (tipo IN ('sala', 'equipamento')),
  cor            TEXT NOT NULL DEFAULT '#64748b',
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recursos_account ON aba_scheduling.recursos(account_id);

ALTER TABLE aba_scheduling.recursos ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_scheduling.recursos;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_scheduling.recursos
  FOR EACH ROW EXECUTE FUNCTION aba_scheduling.set_updated_at();

DROP POLICY IF EXISTS recursos_select ON aba_scheduling.recursos;
CREATE POLICY recursos_select ON aba_scheduling.recursos FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('scheduling', 'read'));
DROP POLICY IF EXISTS recursos_insert ON aba_scheduling.recursos;
CREATE POLICY recursos_insert ON aba_scheduling.recursos FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'create'));
DROP POLICY IF EXISTS recursos_update ON aba_scheduling.recursos;
CREATE POLICY recursos_update ON aba_scheduling.recursos FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'update'));
DROP POLICY IF EXISTS recursos_delete ON aba_scheduling.recursos;
CREATE POLICY recursos_delete ON aba_scheduling.recursos FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'delete'));

CREATE TABLE IF NOT EXISTS aba_scheduling.horarios_recursos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  recurso_id  UUID NOT NULL REFERENCES aba_scheduling.recursos(id) ON DELETE CASCADE,
  dia_semana  SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  inicio      TIME NOT NULL,
  fim         TIME NOT NULL,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (fim > inicio)
);
CREATE INDEX IF NOT EXISTS idx_horarios_recursos_lookup
  ON aba_scheduling.horarios_recursos(recurso_id, dia_semana) WHERE ativo;

ALTER TABLE aba_scheduling.horarios_recursos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS horarios_recursos_select ON aba_scheduling.horarios_recursos;
CREATE POLICY horarios_recursos_select ON aba_scheduling.horarios_recursos FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('scheduling', 'read'));
DROP POLICY IF EXISTS horarios_recursos_insert ON aba_scheduling.horarios_recursos;
CREATE POLICY horarios_recursos_insert ON aba_scheduling.horarios_recursos FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'create'));
DROP POLICY IF EXISTS horarios_recursos_update ON aba_scheduling.horarios_recursos;
CREATE POLICY horarios_recursos_update ON aba_scheduling.horarios_recursos FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'update'));
DROP POLICY IF EXISTS horarios_recursos_delete ON aba_scheduling.horarios_recursos;
CREATE POLICY horarios_recursos_delete ON aba_scheduling.horarios_recursos FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'delete'));

-- ============================================================
-- Agendamentos
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_scheduling.agendamentos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  cliente_id            UUID NOT NULL REFERENCES aba_people.clientes(id) ON DELETE RESTRICT,
  profissional_id       UUID NOT NULL REFERENCES aba_scheduling.profissionais(id) ON DELETE RESTRICT,
  recurso_id            UUID REFERENCES aba_scheduling.recursos(id) ON DELETE SET NULL,
  inicio                TIMESTAMPTZ NOT NULL,
  fim                   TIMESTAMPTZ NOT NULL,
  status                TEXT NOT NULL DEFAULT 'agendado'
    CHECK (status IN ('agendado','confirmado','em_andamento','concluido','nao_compareceu','cancelado')),
  valor_cobrado         NUMERIC(12,2) CHECK (valor_cobrado IS NULL OR valor_cobrado >= 0),
  forma_pagamento       TEXT
    CHECK (forma_pagamento IS NULL OR forma_pagamento IN ('pix','cartao','dinheiro','transferencia','plano','outro')),
  -- Sem FK — aba_finance.planos_cliente é criado depois, na mesma
  -- subetapa (ver cabeçalho). Direção de dependência: aba_finance
  -- conhece aba_scheduling, nunca o contrário.
  plano_cliente_id      UUID,
  -- Observação operacional. NUNCA dado clínico: legível por qualquer
  -- papel com permissão de agenda, inclusive recepção.
  observacoes           TEXT,
  motivo_cancelamento   TEXT,
  criado_por            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  concluido_em          TIMESTAMPTZ,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (fim > inicio)
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_account_periodo
  ON aba_scheduling.agendamentos(account_id, inicio);
CREATE INDEX IF NOT EXISTS idx_agendamentos_profissional
  ON aba_scheduling.agendamentos(profissional_id, inicio);
CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente
  ON aba_scheduling.agendamentos(cliente_id, inicio);

-- Conflito de profissional recusado — restrição de exclusão por
-- intervalo (docs/02 §6 do Maximus, regra 3), ignorando cancelado e
-- não_compareceu. É a garantia real contra a corrida entre duas
-- recepcionistas marcando ao mesmo tempo — checagem SELECT-antes-de-
-- INSERT na aplicação tem janela de corrida; isto não.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agendamentos_profissional_sem_sobreposicao'
      AND conrelid = 'aba_scheduling.agendamentos'::regclass
  ) THEN
    ALTER TABLE aba_scheduling.agendamentos
      ADD CONSTRAINT agendamentos_profissional_sem_sobreposicao
      EXCLUDE USING gist (
        profissional_id WITH =,
        tstzrange(inicio, fim) WITH &&
      ) WHERE (status NOT IN ('cancelado', 'nao_compareceu'));
  END IF;
END $$;

-- Conflito de recurso recusado.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agendamentos_recurso_sem_sobreposicao'
      AND conrelid = 'aba_scheduling.agendamentos'::regclass
  ) THEN
    ALTER TABLE aba_scheduling.agendamentos
      ADD CONSTRAINT agendamentos_recurso_sem_sobreposicao
      EXCLUDE USING gist (
        recurso_id WITH =,
        tstzrange(inicio, fim) WITH &&
      ) WHERE (recurso_id IS NOT NULL AND status NOT IN ('cancelado', 'nao_compareceu'));
  END IF;
END $$;

ALTER TABLE aba_scheduling.agendamentos ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_scheduling.agendamentos;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_scheduling.agendamentos
  FOR EACH ROW EXECUTE FUNCTION aba_scheduling.set_updated_at();

DROP POLICY IF EXISTS agendamentos_select ON aba_scheduling.agendamentos;
CREATE POLICY agendamentos_select ON aba_scheduling.agendamentos FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('scheduling', 'read'));
DROP POLICY IF EXISTS agendamentos_insert ON aba_scheduling.agendamentos;
CREATE POLICY agendamentos_insert ON aba_scheduling.agendamentos FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'create'));
DROP POLICY IF EXISTS agendamentos_update ON aba_scheduling.agendamentos;
CREATE POLICY agendamentos_update ON aba_scheduling.agendamentos FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'update'));
DROP POLICY IF EXISTS agendamentos_delete ON aba_scheduling.agendamentos;
CREATE POLICY agendamentos_delete ON aba_scheduling.agendamentos FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'delete'));

CREATE TABLE IF NOT EXISTS aba_scheduling.agendamento_servicos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  agendamento_id        UUID NOT NULL REFERENCES aba_scheduling.agendamentos(id) ON DELETE CASCADE,
  servico_id            UUID NOT NULL REFERENCES aba_catalog.servicos(id) ON DELETE RESTRICT,
  variante_servico_id   UUID REFERENCES aba_catalog.variantes_servico(id) ON DELETE SET NULL,
  preco                 NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (preco >= 0),
  duracao_minutos       INTEGER NOT NULL CHECK (duracao_minutos > 0),
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agendamento_servicos_agendamento
  ON aba_scheduling.agendamento_servicos(agendamento_id);

ALTER TABLE aba_scheduling.agendamento_servicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agendamento_servicos_select ON aba_scheduling.agendamento_servicos;
CREATE POLICY agendamento_servicos_select ON aba_scheduling.agendamento_servicos FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('scheduling', 'read'));
DROP POLICY IF EXISTS agendamento_servicos_insert ON aba_scheduling.agendamento_servicos;
CREATE POLICY agendamento_servicos_insert ON aba_scheduling.agendamento_servicos FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'create'));
DROP POLICY IF EXISTS agendamento_servicos_update ON aba_scheduling.agendamento_servicos;
CREATE POLICY agendamento_servicos_update ON aba_scheduling.agendamento_servicos FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'update'));
DROP POLICY IF EXISTS agendamento_servicos_delete ON aba_scheduling.agendamento_servicos;
CREATE POLICY agendamento_servicos_delete ON aba_scheduling.agendamento_servicos FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'delete'));

-- ============================================================
-- Lembretes (Maximus 068 — já no DDL inicial)
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_scheduling.lembretes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  agendamento_id  UUID NOT NULL REFERENCES aba_scheduling.agendamentos(id) ON DELETE CASCADE,
  alvo            TEXT NOT NULL DEFAULT 'cliente' CHECK (alvo IN ('cliente','profissional')),
  enviar_em       TIMESTAMPTZ NOT NULL,
  canal           TEXT NOT NULL DEFAULT 'whatsapp' CHECK (canal IN ('whatsapp')),
  status          TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','enviado','falhou','cancelado')),
  -- Sem FK — aba_messaging.mensagens só existe na Subetapa 01.6.
  mensagem_id     UUID,
  erro            TEXT,
  enviado_em      TIMESTAMPTZ,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Caminho quente do cron que drena a fila (Etapa 02): "pendentes já
-- vencidos".
CREATE INDEX IF NOT EXISTS idx_lembretes_vencidos
  ON aba_scheduling.lembretes(enviar_em) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_lembretes_agendamento
  ON aba_scheduling.lembretes(agendamento_id);

ALTER TABLE aba_scheduling.lembretes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lembretes_select ON aba_scheduling.lembretes;
CREATE POLICY lembretes_select ON aba_scheduling.lembretes FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('scheduling', 'read'));
DROP POLICY IF EXISTS lembretes_insert ON aba_scheduling.lembretes;
CREATE POLICY lembretes_insert ON aba_scheduling.lembretes FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'create'));
DROP POLICY IF EXISTS lembretes_update ON aba_scheduling.lembretes;
CREATE POLICY lembretes_update ON aba_scheduling.lembretes FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'update'));
DROP POLICY IF EXISTS lembretes_delete ON aba_scheduling.lembretes;
CREATE POLICY lembretes_delete ON aba_scheduling.lembretes FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'delete'));

-- ============================================================
-- Regras 1 e 2 — expediente e folga (docs/02 do Maximus §6). Toda
-- comparação acontece no fuso de aba_scheduling.fuso_horario_conta(),
-- e todo horário é armazenado em timestamptz. Agenda que ignora fuso
-- quebra em silêncio no primeiro cliente de outro estado
-- (handoffs/instrucoes.md §6).
--
-- Cada recusa levanta uma mensagem própria, para a interface poder
-- dizer QUAL regra bloqueou em vez de um "horário indisponível"
-- genérico.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_scheduling.verificar_expediente_agendamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = aba_scheduling, public
AS $$
DECLARE
  v_tz TEXT := aba_scheduling.fuso_horario_conta();
  v_inicio_local TIMESTAMP;
  v_fim_local TIMESTAMP;
  v_dia_semana SMALLINT;
BEGIN
  -- Agendamento cancelado ou não comparecido não ocupa agenda e não
  -- precisa respeitar expediente — é registro histórico.
  IF NEW.status IN ('cancelado', 'nao_compareceu') THEN
    RETURN NEW;
  END IF;

  v_inicio_local := NEW.inicio AT TIME ZONE v_tz;
  v_fim_local    := NEW.fim    AT TIME ZONE v_tz;
  v_dia_semana   := EXTRACT(DOW FROM v_inicio_local)::SMALLINT;

  -- Atravessar a meia-noite não é expediente de um dia só.
  IF v_inicio_local::DATE <> v_fim_local::DATE THEN
    RAISE EXCEPTION
      'Agendamento fora do expediente: o horário atravessa a meia-noite (fuso %)', v_tz
      USING ERRCODE = '23514';
  END IF;

  -- Regra 1 — precisa existir UMA faixa que contenha o intervalo
  -- inteiro. Sem jornada cadastrada, nada é aceito: falha fechada.
  IF NOT EXISTS (
    SELECT 1
    FROM aba_scheduling.horarios_profissionais hp
    WHERE hp.profissional_id = NEW.profissional_id
      AND hp.ativo
      AND hp.dia_semana = v_dia_semana
      AND hp.inicio <= v_inicio_local::TIME
      AND hp.fim   >= v_fim_local::TIME
  ) THEN
    RAISE EXCEPTION
      'Agendamento fora do expediente do profissional (dia da semana %, das % às %, fuso %)',
      v_dia_semana, v_inicio_local::TIME, v_fim_local::TIME, v_tz
      USING ERRCODE = '23514';
  END IF;

  -- Regra 2 — folga bloqueia.
  IF EXISTS (
    SELECT 1
    FROM aba_scheduling.ausencias a
    WHERE a.profissional_id = NEW.profissional_id
      AND tstzrange(a.inicio, a.fim) && tstzrange(NEW.inicio, NEW.fim)
  ) THEN
    RAISE EXCEPTION
      'Agendamento recusado: o profissional está de folga nesse período'
      USING ERRCODE = '23514';
  END IF;

  -- Recurso com jornada cadastrada também precisa estar em expediente.
  -- Recurso sem jornada nenhuma é tratado como disponível o tempo
  -- todo — ao contrário do profissional, sala sem horário cadastrado
  -- quase sempre significa "sempre disponível", não "nunca".
  IF NEW.recurso_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM aba_scheduling.horarios_recursos hr
                 WHERE hr.recurso_id = NEW.recurso_id AND hr.ativo)
     AND NOT EXISTS (
       SELECT 1
       FROM aba_scheduling.horarios_recursos hr
       WHERE hr.recurso_id = NEW.recurso_id
         AND hr.ativo
         AND hr.dia_semana = v_dia_semana
         AND hr.inicio <= v_inicio_local::TIME
         AND hr.fim   >= v_fim_local::TIME
     ) THEN
    RAISE EXCEPTION
      'Agendamento fora do horário de funcionamento do recurso (dia da semana %, fuso %)',
      v_dia_semana, v_tz
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_scheduling.verificar_expediente_agendamento() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_scheduling.verificar_expediente_agendamento() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_scheduling.verificar_expediente_agendamento() FROM anon;
REVOKE ALL ON FUNCTION aba_scheduling.verificar_expediente_agendamento() FROM authenticated;

DROP TRIGGER IF EXISTS verificar_expediente_agendamento ON aba_scheduling.agendamentos;
CREATE TRIGGER verificar_expediente_agendamento
  BEFORE INSERT OR UPDATE OF inicio, fim, profissional_id, recurso_id, status
  ON aba_scheduling.agendamentos
  FOR EACH ROW EXECUTE FUNCTION aba_scheduling.verificar_expediente_agendamento();

-- ============================================================
-- Conclusão carimba concluido_em. Os outros dois efeitos da conclusão
-- (debitar saldo de plano e gerar comissão) dependem de aba_finance e
-- por isso vivem lá (010_aba_finance.sql) — este schema não conhece o
-- financeiro.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_scheduling.carimbar_conclusao()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = aba_scheduling, public
AS $$
BEGIN
  IF NEW.status = 'concluido' AND (OLD.status IS DISTINCT FROM 'concluido') THEN
    NEW.concluido_em := COALESCE(NEW.concluido_em, NOW());
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_scheduling.carimbar_conclusao() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_scheduling.carimbar_conclusao() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_scheduling.carimbar_conclusao() FROM anon;
REVOKE ALL ON FUNCTION aba_scheduling.carimbar_conclusao() FROM authenticated;

DROP TRIGGER IF EXISTS carimbar_conclusao ON aba_scheduling.agendamentos;
CREATE TRIGGER carimbar_conclusao
  BEFORE UPDATE OF status ON aba_scheduling.agendamentos
  FOR EACH ROW EXECUTE FUNCTION aba_scheduling.carimbar_conclusao();

-- ============================================================
-- criado_por nunca confia em valor enviado pelo cliente — carimbado a
-- partir de auth.uid() quando ausente.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_scheduling.carimbar_criado_por()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.criado_por IS NULL THEN
    NEW.criado_por := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_scheduling.carimbar_criado_por() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_scheduling.carimbar_criado_por() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_scheduling.carimbar_criado_por() FROM anon;
REVOKE ALL ON FUNCTION aba_scheduling.carimbar_criado_por() FROM authenticated;

DROP TRIGGER IF EXISTS carimbar_criado_por ON aba_scheduling.agendamentos;
CREATE TRIGGER carimbar_criado_por
  BEFORE INSERT ON aba_scheduling.agendamentos
  FOR EACH ROW EXECUTE FUNCTION aba_scheduling.carimbar_criado_por();

-- ============================================================
-- Enfileiramento e cancelamento automático de lembretes (docs/02 do
-- Maximus §6, regra 7: "lembretes são agendados na criação e
-- cancelados junto com o agendamento" — regra de negócio no banco,
-- não só na aplicação, para que nenhum caminho de escrita futuro
-- (script, importação, outra rota) crie agendamento sem lembrete).
--
-- Todo agendamento novo com status agendado/confirmado ganha um
-- lembrete por WhatsApp, 24h antes. Marcação em cima da hora (menos de
-- 24h de antecedência) não descarta o lembrete — marca para daqui a 5
-- minutos, porque lembrete tardio ainda avisa mais que nenhum.
--
-- Esta migration só ENFILEIRA — quem lê e envia de fato é o cron da
-- Etapa 02, ainda não construído. A fila cresce sem ser drenada até lá,
-- comportamento correto de deixar para a subetapa que cuida disso.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_scheduling.enfileirar_lembrete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = aba_scheduling, public
AS $$
DECLARE
  v_enviar_em TIMESTAMPTZ;
BEGIN
  IF NEW.status NOT IN ('agendado', 'confirmado') THEN
    RETURN NEW;
  END IF;

  v_enviar_em := GREATEST(
    NEW.inicio - INTERVAL '24 hours',
    NOW() + INTERVAL '5 minutes'
  );

  INSERT INTO aba_scheduling.lembretes (account_id, agendamento_id, alvo, enviar_em, canal, status)
  VALUES (NEW.account_id, NEW.id, 'cliente', v_enviar_em, 'whatsapp', 'pendente');

  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_scheduling.enfileirar_lembrete() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_scheduling.enfileirar_lembrete() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_scheduling.enfileirar_lembrete() FROM anon;
REVOKE ALL ON FUNCTION aba_scheduling.enfileirar_lembrete() FROM authenticated;

DROP TRIGGER IF EXISTS enfileirar_lembrete ON aba_scheduling.agendamentos;
CREATE TRIGGER enfileirar_lembrete
  AFTER INSERT ON aba_scheduling.agendamentos
  FOR EACH ROW EXECUTE FUNCTION aba_scheduling.enfileirar_lembrete();

CREATE OR REPLACE FUNCTION aba_scheduling.cancelar_lembretes_pendentes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = aba_scheduling, public
AS $$
BEGIN
  IF NEW.status IN ('cancelado', 'nao_compareceu')
     AND OLD.status NOT IN ('cancelado', 'nao_compareceu') THEN
    UPDATE aba_scheduling.lembretes
    SET status = 'cancelado'
    WHERE agendamento_id = NEW.id
      AND status = 'pendente';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_scheduling.cancelar_lembretes_pendentes() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_scheduling.cancelar_lembretes_pendentes() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_scheduling.cancelar_lembretes_pendentes() FROM anon;
REVOKE ALL ON FUNCTION aba_scheduling.cancelar_lembretes_pendentes() FROM authenticated;

DROP TRIGGER IF EXISTS cancelar_lembretes_pendentes ON aba_scheduling.agendamentos;
CREATE TRIGGER cancelar_lembretes_pendentes
  AFTER UPDATE OF status ON aba_scheduling.agendamentos
  FOR EACH ROW EXECUTE FUNCTION aba_scheduling.cancelar_lembretes_pendentes();

-- ============================================================
-- GRANT estreito + ALTER DEFAULT PRIVILEGES — mesmo padrão de
-- 008_aba_catalog.sql.
-- ============================================================
GRANT USAGE ON SCHEMA aba_scheduling TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA aba_scheduling TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA aba_scheduling TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_scheduling
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_scheduling
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_scheduling
  GRANT ALL ON TABLES TO service_role;
