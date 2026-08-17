-- ============================================================
-- 013_aba_health.sql — schema aba_health (dado clínico, regime próprio)
--
-- Mapa de origem: db/migrations/README.md → aba_health
-- (047_health_schema.sql + hardening 053/058/069/070/076, todos já
-- embutidos no DDL inicial — não como patch posterior, ao contrário do
-- Maximus, onde cada um foi uma correção pós-auditoria separada). 069
-- (bucket de anexo) vai em 014_aba_health_attachments_bucket.sql, por
-- tocar `storage.objects` em vez de tabela de módulo.
--
-- Este é o schema mais restritivo do projeto — nada aqui segue o
-- padrão de RLS dos demais módulos (is_account_member + access.can
-- direto na política, docs/02 §2). Em vez disso, toda tabela que
-- carrega dado clínico de um cliente passa por
-- aba_health.pode_acessar(cliente_id, acao), que embute as três
-- camadas: papel, permissão por módulo e atributo profissional +
-- concessão nominal — nessa ordem de precedência (docs/05 §1).
--
-- Duas tabelas são INFRAESTRUTURA de autorização do próprio schema, não
-- dado clínico: concessoes_prontuario (a fonte das concessões que
-- pode_acessar() consulta) e log_acesso (o log de auditoria de quem
-- leu o quê). RLS delas é gate direto por papel via
-- public.is_account_member — rotear por pode_acessar() criaria
-- autorreferência (a função consultaria a tabela que decide o acesso à
-- própria função) e vazaria capacidade indevida (uma concessão "todos
-- os registros" não deveria também abrir a tabela que gerencia
-- concessões). Mesmo raciocínio de access.module_permissions vs
-- access.can() em 003_core_access.sql.
--
-- LEITURA SEM LOG NÃO EXISTE (Maximus 053) — toda leitura de conteúdo
-- clínico passa por uma função ler_*() SECURITY DEFINER que grava a
-- linha de log ANTES de retornar, na mesma transação. Não existe select
-- direto de coluna clínica: a tabela nasce com SELECT revogado de
-- `authenticated` e reconcedido só nas colunas de identificação
-- (id/account_id/cliente_id/chaves de junção) — nada disso é dado de
-- saúde. O achado original do Maximus (auditoria adversarial, item G02)
-- foi medido ao vivo: a política RLS sozinha autoriza mas não registra;
-- aqui nasce corrigido, não corrigido depois.
--
-- ESCRITA TAMBÉM GERA LOG (Maximus 070) — trigger AFTER INSERT/UPDATE
-- nas quatro tabelas de dado de cliente, sem depender da aplicação
-- fazer uma segunda chamada. Ausência de auth.uid() (chamada por
-- service_role — seed, fixture de teste) não gera log: não existe log
-- de "alguém", e service_role nunca participa de caminho clínico de
-- usuário real.
--
-- FORCE ROW LEVEL SECURITY (Maximus 058) — decorativo enquanto o dono
-- das tabelas for `postgres` (BYPASSRLS ignora RLS sempre,
-- independente de FORCE), mas custa nada e cobre o cenário em que uma
-- tabela venha a pertencer a um papel sem BYPASSRLS — migração de
-- ambiente, restauração de backup, ou exportação do módulo para um
-- CRM-filho, que é o propósito declarado da arquitetura modular deste
-- produto (docs/01 §4). O que de fato protege as funções ler_*() é o
-- filtro explícito de account_id escrito dentro delas — não dá para
-- contar com RLS sob SECURITY DEFINER.
--
-- PROFISSIONAL EXIGE FUNCIONÁRIO ATIVO (Maximus 076) — o atributo
-- profissional (scheduling.professionals.has_clinical_access) só abre
-- acesso clínico se o funcionário por trás dele também estiver ativo.
-- No Vitrine isso cai direto: aba_scheduling.profissionais já tem
-- funcionario_id → aba_people.funcionarios(id) desde a Subetapa 01.3
-- (decisão de escopo registrada lá foi propositalmente deixar só o
-- desenho de FK, sem a regra de governança — é exatamente aqui que a
-- regra entra, sem precisar de coluna nova).
--
-- Sem política de DELETE em nenhuma tabela de dado clínico: o MVP não
-- decide prazo de guarda (pendência vigiada em docs/00), então a
-- omissão é deliberada — RLS ativa sem policy de DELETE nega por
-- padrão. Mesmo vale para log_acesso (auditoria não se apaga nem se
-- edita); concessoes_prontuario só ganha DELETE porque o proprietário
-- precisa poder revogar uma concessão.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS aba_health;

CREATE OR REPLACE FUNCTION aba_health.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION aba_health.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION aba_health.set_updated_at() FROM authenticated;

-- ============================================================
-- aba_health.prontuarios — ficha clínica, uma por cliente
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_health.prontuarios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  cliente_id          UUID NOT NULL REFERENCES aba_people.clientes(id) ON DELETE RESTRICT,
  tipo_pele           TEXT,
  medicamentos        TEXT,
  alergias            TEXT,
  restricoes          TEXT,
  gestante            BOOLEAN,
  amamentando         BOOLEAN,
  condicoes_cronicas  TEXT,
  observacoes_gerais  TEXT,
  atualizado_por      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "Uma por cliente" — índice único garante no banco, não só por
-- convenção da aplicação.
CREATE UNIQUE INDEX IF NOT EXISTS idx_prontuarios_cliente ON aba_health.prontuarios(cliente_id);
CREATE INDEX IF NOT EXISTS idx_prontuarios_account ON aba_health.prontuarios(account_id);

-- ============================================================
-- aba_health.formularios_anamnese — questionário configurável por
-- conta. Catálogo, não dado de um cliente específico — sem cliente_id.
-- Nas políticas, pode_acessar() é chamada com cliente_id = NULL.
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_health.formularios_anamnese (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  versao        INTEGER NOT NULL DEFAULT 1 CHECK (versao > 0),
  perguntas     JSONB NOT NULL DEFAULT '[]'::jsonb,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_formularios_anamnese_account
  ON aba_health.formularios_anamnese(account_id) WHERE ativo;

-- ============================================================
-- aba_health.respostas_anamnese — respostas de um cliente a um
-- formulário
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_health.respostas_anamnese (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  cliente_id      UUID NOT NULL REFERENCES aba_people.clientes(id) ON DELETE RESTRICT,
  formulario_id   UUID NOT NULL REFERENCES aba_health.formularios_anamnese(id) ON DELETE RESTRICT,
  respostas       JSONB NOT NULL DEFAULT '{}'::jsonb,
  respondido_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  coletado_por    UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_respostas_anamnese_cliente
  ON aba_health.respostas_anamnese(cliente_id, respondido_em DESC);

-- ============================================================
-- aba_health.evolucoes — evolução clínica por atendimento
--
-- "Evolução assinada não se apaga": após travada=true, o registro só
-- aceita adendo em nova linha referenciando a anterior via
-- adendo_de_id — regra que não está numa coluna de docs/02, mas é
-- exigida pela regra descrita em prosa lá; herdada do Maximus, que
-- registrou o mesmo gap (handoffs/instrucoes.md dele §5).
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_health.evolucoes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  cliente_id          UUID NOT NULL REFERENCES aba_people.clientes(id) ON DELETE RESTRICT,
  agendamento_id      UUID REFERENCES aba_scheduling.agendamentos(id) ON DELETE SET NULL,
  profissional_id     UUID NOT NULL REFERENCES aba_scheduling.profissionais(id) ON DELETE RESTRICT,
  adendo_de_id        UUID REFERENCES aba_health.evolucoes(id) ON DELETE SET NULL,
  avaliacao           TEXT,
  notas_procedimento  TEXT,
  resultado           TEXT,
  proximos_passos     TEXT,
  anexos              JSONB NOT NULL DEFAULT '[]'::jsonb,
  registrado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  travada             BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evolucoes_cliente ON aba_health.evolucoes(cliente_id, registrado_em DESC);
CREATE INDEX IF NOT EXISTS idx_evolucoes_agendamento
  ON aba_health.evolucoes(agendamento_id) WHERE agendamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_evolucoes_adendo
  ON aba_health.evolucoes(adendo_de_id) WHERE adendo_de_id IS NOT NULL;

-- ============================================================
-- aba_health.consentimentos
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_health.consentimentos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  cliente_id     UUID NOT NULL REFERENCES aba_people.clientes(id) ON DELETE RESTRICT,
  tipo           TEXT NOT NULL CHECK (tipo IN ('tratamento_dados', 'procedimento', 'uso_imagem')),
  versao_texto   TEXT NOT NULL,
  concedido      BOOLEAN NOT NULL,
  concedido_em   TIMESTAMPTZ,
  revogado_em    TIMESTAMPTZ,
  evidencia      JSONB NOT NULL DEFAULT '{}'::jsonb,
  coletado_por   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consentimentos_cliente ON aba_health.consentimentos(cliente_id, tipo);

-- ============================================================
-- aba_health.concessoes_prontuario — a camada IBAC (concessão nominal)
--
-- Infraestrutura de autorização, não dado clínico — ver cabeçalho.
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_health.concessoes_prontuario (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  usuario_concedido_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  escopo                TEXT NOT NULL CHECK (escopo IN ('todos_registros', 'cliente_unico')),
  cliente_id            UUID REFERENCES aba_people.clientes(id) ON DELETE CASCADE,
  efeito                TEXT NOT NULL CHECK (efeito IN ('permitir', 'negar')),
  motivo                TEXT,
  expira_em             TIMESTAMPTZ,
  concedido_por         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Escopo e cliente andam juntos: cliente_unico sem cliente ou
  -- todos_registros com cliente são estados que pode_acessar() nunca
  -- deveria precisar interpretar.
  CHECK (
    (escopo = 'cliente_unico' AND cliente_id IS NOT NULL)
    OR (escopo = 'todos_registros' AND cliente_id IS NULL)
  )
);

-- Sem predicado por NOW() (índice parcial exige predicado IMMUTABLE); a
-- vigência (expira_em) é filtrada em tempo de consulta por
-- pode_acessar(), não pelo índice.
CREATE INDEX IF NOT EXISTS idx_concessoes_prontuario_lookup
  ON aba_health.concessoes_prontuario(account_id, usuario_concedido_id);
CREATE INDEX IF NOT EXISTS idx_concessoes_prontuario_cliente
  ON aba_health.concessoes_prontuario(cliente_id) WHERE cliente_id IS NOT NULL;

-- ============================================================
-- aba_health.log_acesso — log de acesso obrigatório, sem exceção
--
-- Infraestrutura de auditoria, não dado clínico — ver cabeçalho. A
-- gravação acontece dentro das funções ler_*()/do gatilho de escrita,
-- nunca dependendo de uma segunda chamada da aplicação.
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_health.log_acesso (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  usuario_ator_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  cliente_id        UUID NOT NULL REFERENCES aba_people.clientes(id) ON DELETE RESTRICT,
  tipo_registro     TEXT NOT NULL CHECK (tipo_registro IN ('prontuario', 'anamnese', 'evolucao', 'consentimento')),
  registro_id       UUID NOT NULL,
  acao              TEXT NOT NULL CHECK (acao IN ('leitura', 'criacao', 'atualizacao', 'exportacao')),
  ocorrido_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  contexto          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_log_acesso_cliente ON aba_health.log_acesso(cliente_id, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS idx_log_acesso_ator ON aba_health.log_acesso(usuario_ator_id, ocorrido_em DESC);

-- ============================================================
-- updated_at
-- ============================================================
DROP TRIGGER IF EXISTS set_updated_at ON aba_health.prontuarios;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_health.prontuarios
  FOR EACH ROW EXECUTE FUNCTION aba_health.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON aba_health.formularios_anamnese;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_health.formularios_anamnese
  FOR EACH ROW EXECUTE FUNCTION aba_health.set_updated_at();

-- ============================================================
-- Travamento de evolução — bloqueia QUALQUER UPDATE, inclusive tentar
-- reverter travada para false. A única forma de complementar o
-- registro é inserir uma linha nova com adendo_de_id apontando para
-- esta.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_health.impedir_alteracao_evolucao_travada()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF OLD.travada THEN
    RAISE EXCEPTION
      'Evolução travada não aceita alteração — registre um adendo em nova linha'
      USING ERRCODE = '23514';
  END IF;
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION aba_health.impedir_alteracao_evolucao_travada() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.impedir_alteracao_evolucao_travada() FROM anon;
REVOKE ALL ON FUNCTION aba_health.impedir_alteracao_evolucao_travada() FROM authenticated;

DROP TRIGGER IF EXISTS impedir_alteracao_evolucao_travada ON aba_health.evolucoes;
CREATE TRIGGER impedir_alteracao_evolucao_travada
  BEFORE UPDATE ON aba_health.evolucoes
  FOR EACH ROW EXECUTE FUNCTION aba_health.impedir_alteracao_evolucao_travada();

-- ============================================================
-- aba_health.pode_acessar(cliente_id, acao) — SECURITY DEFINER
--
-- Ordem de avaliação (idêntica em código e em docs/05 §1):
--   1. Concessão 'negar' vigente, no escopo aplicável → nega. Vence
--      tudo, inclusive o atributo profissional.
--   2. owner da conta → permite.
--   3. Concessão 'permitir' vigente e não expirada → permite.
--   4. Registro ativo em aba_scheduling.profissionais com
--      acesso_clinico = true, funcionário por trás ativo
--      (aba_people.funcionarios.ativo — Maximus 076) E
--      access.can('health', ação) verdadeiro para o papel → permite.
--   5. Caso contrário → nega.
--
-- Falha fechada em entrada inválida, avaliada antes de qualquer atalho
-- de papel, inclusive antes do atalho do owner.
--
-- p_cliente_id pode ser NULL: usado pela política de
-- formularios_anamnese, que é catálogo de conta, não dado de um
-- cliente específico. Nesse caso só concessões de escopo
-- todos_registros entram na conta; uma concessão cliente_unico nunca
-- abre o formulário-catálogo.
--
-- 'exportacao' é ação válida aqui mas NÃO em access.can() (que só
-- conhece read/create/update/delete) — o mapeamento abaixo devolve
-- NULL para 'exportacao', e access.can(module, NULL) já nega por
-- desenho (042_access_can_fail_closed.sql, herdado em 003_core_
-- access.sql). Por isso o passo 4 nunca abre 'exportacao' para o
-- atributo profissional sozinho: exportar dado clínico exige
-- concessão explícita (owner ou permitir). Efeito colateral desejado,
-- não lacuna.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_health.pode_acessar(
  p_cliente_id UUID,
  p_acao TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_account_id UUID;
  v_papel public.account_role_enum;
  v_perfil_id UUID;
  v_acao_modulo TEXT;
BEGIN
  IF p_acao IS NULL OR p_acao NOT IN ('leitura', 'criacao', 'atualizacao', 'exportacao') THEN
    RETURN FALSE;
  END IF;

  SELECT id, account_id, account_role INTO v_perfil_id, v_account_id, v_papel
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF v_account_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Cliente informado precisa pertencer à própria conta — nenhum
  -- caminho de aba_health atravessa fronteira de conta.
  IF p_cliente_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM aba_people.clientes c
    WHERE c.id = p_cliente_id AND c.account_id = v_account_id
  ) THEN
    RETURN FALSE;
  END IF;

  -- 1. Negação individual vence tudo.
  IF EXISTS (
    SELECT 1 FROM aba_health.concessoes_prontuario g
    WHERE g.account_id = v_account_id
      AND g.usuario_concedido_id = v_user_id
      AND g.efeito = 'negar'
      AND (g.expira_em IS NULL OR g.expira_em > NOW())
      AND (g.escopo = 'todos_registros'
           OR (g.escopo = 'cliente_unico' AND p_cliente_id IS NOT NULL AND g.cliente_id = p_cliente_id))
  ) THEN
    RETURN FALSE;
  END IF;

  -- 2. owner sempre pode.
  IF v_papel = 'owner' THEN
    RETURN TRUE;
  END IF;

  -- 3. Concessão permitir vigente.
  IF EXISTS (
    SELECT 1 FROM aba_health.concessoes_prontuario g
    WHERE g.account_id = v_account_id
      AND g.usuario_concedido_id = v_user_id
      AND g.efeito = 'permitir'
      AND (g.expira_em IS NULL OR g.expira_em > NOW())
      AND (g.escopo = 'todos_registros'
           OR (g.escopo = 'cliente_unico' AND p_cliente_id IS NOT NULL AND g.cliente_id = p_cliente_id))
  ) THEN
    RETURN TRUE;
  END IF;

  -- 4. Atributo profissional + funcionário ativo (Maximus 076, já
  -- embutido desde o início) + permissão de módulo.
  v_acao_modulo := CASE p_acao
    WHEN 'leitura' THEN 'read'
    WHEN 'criacao' THEN 'create'
    WHEN 'atualizacao' THEN 'update'
    ELSE NULL -- 'exportacao' nunca abre pelo atributo profissional sozinho
  END;

  IF v_perfil_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM aba_scheduling.profissionais p
       WHERE p.account_id = v_account_id
         AND p.profile_id = v_perfil_id
         AND p.ativo
         AND p.acesso_clinico
         AND EXISTS (
           SELECT 1 FROM aba_people.funcionarios f
           WHERE f.id = p.funcionario_id AND f.ativo
         )
     )
     AND access.can('health', v_acao_modulo)
  THEN
    RETURN TRUE;
  END IF;

  -- 5. Padrão: nega.
  RETURN FALSE;
END;
$$;

ALTER FUNCTION aba_health.pode_acessar(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.pode_acessar(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.pode_acessar(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION aba_health.pode_acessar(UUID, TEXT) TO authenticated, service_role;

-- ============================================================
-- RLS — dado clínico, via aba_health.pode_acessar(cliente_id, acao)
--
-- Sem policy de DELETE em nenhuma das cinco (ver cabeçalho). FORCE ROW
-- LEVEL SECURITY em toda tabela do schema (Maximus 058) — decorativo
-- enquanto o dono for `postgres`/BYPASSRLS, mas sem custo e cobre
-- exportação futura do módulo para um CRM-filho.
-- ============================================================
ALTER TABLE aba_health.prontuarios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE aba_health.prontuarios         FORCE ROW LEVEL SECURITY;
ALTER TABLE aba_health.formularios_anamnese ENABLE ROW LEVEL SECURITY;
ALTER TABLE aba_health.formularios_anamnese FORCE ROW LEVEL SECURITY;
ALTER TABLE aba_health.respostas_anamnese  ENABLE ROW LEVEL SECURITY;
ALTER TABLE aba_health.respostas_anamnese  FORCE ROW LEVEL SECURITY;
ALTER TABLE aba_health.evolucoes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE aba_health.evolucoes           FORCE ROW LEVEL SECURITY;
ALTER TABLE aba_health.consentimentos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE aba_health.consentimentos      FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prontuarios_select ON aba_health.prontuarios;
CREATE POLICY prontuarios_select ON aba_health.prontuarios FOR SELECT
  USING (aba_health.pode_acessar(cliente_id, 'leitura'));
DROP POLICY IF EXISTS prontuarios_insert ON aba_health.prontuarios;
CREATE POLICY prontuarios_insert ON aba_health.prontuarios FOR INSERT
  WITH CHECK (aba_health.pode_acessar(cliente_id, 'criacao'));
DROP POLICY IF EXISTS prontuarios_update ON aba_health.prontuarios;
CREATE POLICY prontuarios_update ON aba_health.prontuarios FOR UPDATE
  USING (aba_health.pode_acessar(cliente_id, 'atualizacao'))
  WITH CHECK (aba_health.pode_acessar(cliente_id, 'atualizacao'));

DROP POLICY IF EXISTS formularios_anamnese_select ON aba_health.formularios_anamnese;
CREATE POLICY formularios_anamnese_select ON aba_health.formularios_anamnese FOR SELECT
  USING (aba_health.pode_acessar(NULL, 'leitura'));
DROP POLICY IF EXISTS formularios_anamnese_insert ON aba_health.formularios_anamnese;
CREATE POLICY formularios_anamnese_insert ON aba_health.formularios_anamnese FOR INSERT
  WITH CHECK (aba_health.pode_acessar(NULL, 'criacao'));
DROP POLICY IF EXISTS formularios_anamnese_update ON aba_health.formularios_anamnese;
CREATE POLICY formularios_anamnese_update ON aba_health.formularios_anamnese FOR UPDATE
  USING (aba_health.pode_acessar(NULL, 'atualizacao'))
  WITH CHECK (aba_health.pode_acessar(NULL, 'atualizacao'));

DROP POLICY IF EXISTS respostas_anamnese_select ON aba_health.respostas_anamnese;
CREATE POLICY respostas_anamnese_select ON aba_health.respostas_anamnese FOR SELECT
  USING (aba_health.pode_acessar(cliente_id, 'leitura'));
DROP POLICY IF EXISTS respostas_anamnese_insert ON aba_health.respostas_anamnese;
CREATE POLICY respostas_anamnese_insert ON aba_health.respostas_anamnese FOR INSERT
  WITH CHECK (aba_health.pode_acessar(cliente_id, 'criacao'));
DROP POLICY IF EXISTS respostas_anamnese_update ON aba_health.respostas_anamnese;
CREATE POLICY respostas_anamnese_update ON aba_health.respostas_anamnese FOR UPDATE
  USING (aba_health.pode_acessar(cliente_id, 'atualizacao'))
  WITH CHECK (aba_health.pode_acessar(cliente_id, 'atualizacao'));

DROP POLICY IF EXISTS evolucoes_select ON aba_health.evolucoes;
CREATE POLICY evolucoes_select ON aba_health.evolucoes FOR SELECT
  USING (aba_health.pode_acessar(cliente_id, 'leitura'));
DROP POLICY IF EXISTS evolucoes_insert ON aba_health.evolucoes;
CREATE POLICY evolucoes_insert ON aba_health.evolucoes FOR INSERT
  WITH CHECK (aba_health.pode_acessar(cliente_id, 'criacao'));
DROP POLICY IF EXISTS evolucoes_update ON aba_health.evolucoes;
CREATE POLICY evolucoes_update ON aba_health.evolucoes FOR UPDATE
  USING (aba_health.pode_acessar(cliente_id, 'atualizacao'))
  WITH CHECK (aba_health.pode_acessar(cliente_id, 'atualizacao'));

DROP POLICY IF EXISTS consentimentos_select ON aba_health.consentimentos;
CREATE POLICY consentimentos_select ON aba_health.consentimentos FOR SELECT
  USING (aba_health.pode_acessar(cliente_id, 'leitura'));
DROP POLICY IF EXISTS consentimentos_insert ON aba_health.consentimentos;
CREATE POLICY consentimentos_insert ON aba_health.consentimentos FOR INSERT
  WITH CHECK (aba_health.pode_acessar(cliente_id, 'criacao'));
DROP POLICY IF EXISTS consentimentos_update ON aba_health.consentimentos;
CREATE POLICY consentimentos_update ON aba_health.consentimentos FOR UPDATE
  USING (aba_health.pode_acessar(cliente_id, 'atualizacao'))
  WITH CHECK (aba_health.pode_acessar(cliente_id, 'atualizacao'));

-- ============================================================
-- RLS — aba_health.concessoes_prontuario (infraestrutura de
-- autorização, não dado clínico). Gate direto por papel, sem passar
-- por pode_acessar() — ver cabeçalho. Leitura restrita a admin+ (é
-- preciso enxergar quem tem acesso), escrita restrita ao owner.
-- ============================================================
ALTER TABLE aba_health.concessoes_prontuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE aba_health.concessoes_prontuario FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS concessoes_prontuario_select ON aba_health.concessoes_prontuario;
CREATE POLICY concessoes_prontuario_select ON aba_health.concessoes_prontuario FOR SELECT
  USING (public.is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS concessoes_prontuario_insert ON aba_health.concessoes_prontuario;
CREATE POLICY concessoes_prontuario_insert ON aba_health.concessoes_prontuario FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'owner'));
DROP POLICY IF EXISTS concessoes_prontuario_update ON aba_health.concessoes_prontuario;
CREATE POLICY concessoes_prontuario_update ON aba_health.concessoes_prontuario FOR UPDATE
  USING (public.is_account_member(account_id, 'owner'));
DROP POLICY IF EXISTS concessoes_prontuario_delete ON aba_health.concessoes_prontuario;
CREATE POLICY concessoes_prontuario_delete ON aba_health.concessoes_prontuario FOR DELETE
  USING (public.is_account_member(account_id, 'owner'));

-- ============================================================
-- RLS — aba_health.log_acesso (infraestrutura de auditoria, não dado
-- clínico). Mesma exceção do bloco acima. INSERT liberado a qualquer
-- membro da conta, mas só do próprio acesso (usuario_ator_id =
-- auth.uid()) — na prática só as funções SECURITY DEFINER abaixo
-- escrevem aqui, nunca a aplicação direto. Sem policy de UPDATE nem
-- DELETE: log de acesso que pode ser reescrito não é log de acesso.
-- ============================================================
ALTER TABLE aba_health.log_acesso ENABLE ROW LEVEL SECURITY;
ALTER TABLE aba_health.log_acesso FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS log_acesso_select ON aba_health.log_acesso;
CREATE POLICY log_acesso_select ON aba_health.log_acesso FOR SELECT
  USING (public.is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS log_acesso_insert ON aba_health.log_acesso;
CREATE POLICY log_acesso_insert ON aba_health.log_acesso FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'viewer') AND usuario_ator_id = auth.uid());

-- ============================================================
-- Funções de leitura com log obrigatório (Maximus 053) — leitura de
-- conteúdo clínico só existe através delas. can_access decide;
-- account_id é resolvido do perfil do chamador e usado como filtro
-- explícito (SECURITY DEFINER não é filtrado por RLS — a fronteira de
-- conta precisa ser reafirmada aqui dentro, mesmo raciocínio de
-- FORCE ROW LEVEL SECURITY no cabeçalho); o INSERT no log vem antes do
-- RETURN; search_path fixo em vazio.
--
-- formularios_anamnese fica de fora de propósito: é catálogo de
-- perguntas da conta, não dado de paciente — log_acesso.cliente_id é
-- NOT NULL e o CHECK de tipo_registro só admite os quatro tipos de
-- dado de paciente.
--
-- Autorização negada devolve CONJUNTO VAZIO, não exceção — idêntico ao
-- que a RLS já faria. Erro explícito confirmaria a existência do
-- cliente a quem não pode enxergá-lo, e nada é lido, então nada é
-- logado.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_health.ler_prontuario(p_cliente_id UUID)
RETURNS SETOF aba_health.prontuarios
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_account_id UUID;
BEGIN
  IF p_cliente_id IS NULL OR NOT aba_health.pode_acessar(p_cliente_id, 'leitura') THEN
    RETURN;
  END IF;

  SELECT account_id INTO v_account_id FROM public.profiles WHERE user_id = v_user_id;
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO aba_health.log_acesso
    (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
  SELECT v_account_id, v_user_id, p_cliente_id, 'prontuario', r.id, 'leitura',
         jsonb_build_object('via', 'aba_health.ler_prontuario')
  FROM aba_health.prontuarios r
  WHERE r.cliente_id = p_cliente_id AND r.account_id = v_account_id;

  RETURN QUERY
  SELECT r.* FROM aba_health.prontuarios r
  WHERE r.cliente_id = p_cliente_id AND r.account_id = v_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION aba_health.ler_evolucoes(p_cliente_id UUID)
RETURNS SETOF aba_health.evolucoes
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_account_id UUID;
BEGIN
  IF p_cliente_id IS NULL OR NOT aba_health.pode_acessar(p_cliente_id, 'leitura') THEN
    RETURN;
  END IF;

  SELECT account_id INTO v_account_id FROM public.profiles WHERE user_id = v_user_id;
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO aba_health.log_acesso
    (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
  SELECT v_account_id, v_user_id, p_cliente_id, 'evolucao', r.id, 'leitura',
         jsonb_build_object('via', 'aba_health.ler_evolucoes')
  FROM aba_health.evolucoes r
  WHERE r.cliente_id = p_cliente_id AND r.account_id = v_account_id;

  RETURN QUERY
  SELECT r.* FROM aba_health.evolucoes r
  WHERE r.cliente_id = p_cliente_id AND r.account_id = v_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION aba_health.ler_respostas_anamnese(p_cliente_id UUID)
RETURNS SETOF aba_health.respostas_anamnese
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_account_id UUID;
BEGIN
  IF p_cliente_id IS NULL OR NOT aba_health.pode_acessar(p_cliente_id, 'leitura') THEN
    RETURN;
  END IF;

  SELECT account_id INTO v_account_id FROM public.profiles WHERE user_id = v_user_id;
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO aba_health.log_acesso
    (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
  SELECT v_account_id, v_user_id, p_cliente_id, 'anamnese', r.id, 'leitura',
         jsonb_build_object('via', 'aba_health.ler_respostas_anamnese')
  FROM aba_health.respostas_anamnese r
  WHERE r.cliente_id = p_cliente_id AND r.account_id = v_account_id;

  RETURN QUERY
  SELECT r.* FROM aba_health.respostas_anamnese r
  WHERE r.cliente_id = p_cliente_id AND r.account_id = v_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION aba_health.ler_consentimentos(p_cliente_id UUID)
RETURNS SETOF aba_health.consentimentos
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_account_id UUID;
BEGIN
  IF p_cliente_id IS NULL OR NOT aba_health.pode_acessar(p_cliente_id, 'leitura') THEN
    RETURN;
  END IF;

  SELECT account_id INTO v_account_id FROM public.profiles WHERE user_id = v_user_id;
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO aba_health.log_acesso
    (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
  SELECT v_account_id, v_user_id, p_cliente_id, 'consentimento', r.id, 'leitura',
         jsonb_build_object('via', 'aba_health.ler_consentimentos')
  FROM aba_health.consentimentos r
  WHERE r.cliente_id = p_cliente_id AND r.account_id = v_account_id;

  RETURN QUERY
  SELECT r.* FROM aba_health.consentimentos r
  WHERE r.cliente_id = p_cliente_id AND r.account_id = v_account_id;
END;
$$;

DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'aba_health.ler_prontuario(uuid)',
    'aba_health.ler_evolucoes(uuid)',
    'aba_health.ler_respostas_anamnese(uuid)',
    'aba_health.ler_consentimentos(uuid)'
  ] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- ============================================================
-- GRANT amplo primeiro (padrão de 008/009/010) — precisa vir ANTES do
-- bloco de narrowing por coluna abaixo. ORDEM IMPORTA (lição já paga
-- pelo Maximus, migration 053): privilégio de TABELA cobre todas as
-- colunas, e um REVOKE SELECT (coluna) aplicado enquanto o GRANT de
-- tabela ainda existe é silenciosamente inócuo — não dá erro, não
-- protege nada, a leitura continua passando. É preciso conceder a
-- tabela primeiro e só então revogar/reconceder coluna a coluna.
-- ============================================================
GRANT USAGE ON SCHEMA aba_health TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA aba_health TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA aba_health TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_health
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_health
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_health
  GRANT ALL ON TABLES TO service_role;

-- ============================================================
-- Fecha a leitura direta do CONTEÚDO clínico (Maximus 053)
--
-- Revogar SELECT da tabela inteira quebra mais do que leitura: em
-- Postgres, UPDATE ... WHERE id = $1 exige SELECT nas colunas que ele
-- lê, inclusive as do WHERE — por isso a revogação é por COLUNA, e a
-- fronteira é exatamente a que importa:
--   legível: id, account_id, cliente_id e as chaves de junção. Nada
--     disso é dado de saúde — são essas colunas que sustentam UPDATE,
--     DELETE e a avaliação da política RLS (que lê cliente_id).
--   revogado: sintoma, medicação, alergia, avaliação, evolução,
--     consentimento — tudo que é dado sensível de fato.
--
-- service_role mantém tudo: é a identidade de servidor, já bypassa RLS
-- por natureza.
-- ============================================================
DO $$
DECLARE
  t TEXT;
  v_cols TEXT;
  -- Colunas de identificação/roteamento que permanecem legíveis.
  v_manter TEXT[] := ARRAY[
    'id', 'account_id', 'cliente_id', 'formulario_id', 'agendamento_id',
    'profissional_id', 'adendo_de_id', 'atualizado_por',
    'criado_em', 'atualizado_em', 'travada'
  ];
BEGIN
  FOREACH t IN ARRAY ARRAY['prontuarios', 'evolucoes', 'respostas_anamnese', 'consentimentos'] LOOP
    EXECUTE format('REVOKE SELECT ON aba_health.%I FROM authenticated', t);

    SELECT string_agg(format('%I', c.column_name), ', ')
    INTO v_cols
    FROM information_schema.columns c
    WHERE c.table_schema = 'aba_health'
      AND c.table_name = t
      AND c.column_name = ANY (v_manter);

    IF v_cols IS NOT NULL THEN
      EXECUTE format('GRANT SELECT (%s) ON aba_health.%I TO authenticated', v_cols, t);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- Escrita clínica também gera log (Maximus 070) — trigger AFTER
-- INSERT/UPDATE nas quatro tabelas de dado de cliente. Ausência de
-- auth.uid() (service_role — seed, fixture de teste) não gera log: não
-- existe log de "alguém", e service_role nunca participa de caminho
-- clínico de usuário real.
--
-- O tipo de registro chega como argumento do gatilho em vez de ser
-- deduzido de TG_TABLE_NAME: a lista válida é um CHECK da tabela de
-- log, e amarrar os dois na criação do gatilho faz nome errado falhar
-- na migration, não em produção.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_health.registrar_escrita_clinica()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL; -- gatilho AFTER: o retorno é ignorado, a escrita já ocorreu
  END IF;

  INSERT INTO aba_health.log_acesso
    (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
  VALUES (
    NEW.account_id,
    v_user_id,
    NEW.cliente_id,
    TG_ARGV[0],
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN 'criacao' ELSE 'atualizacao' END,
    jsonb_build_object('via', 'trigger', 'tabela', TG_TABLE_NAME)
  );

  RETURN NULL;
END;
$$;

ALTER FUNCTION aba_health.registrar_escrita_clinica() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.registrar_escrita_clinica() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.registrar_escrita_clinica() FROM anon;
REVOKE ALL ON FUNCTION aba_health.registrar_escrita_clinica() FROM authenticated;

-- formularios_anamnese fica fora, mesmo motivo das funções ler_*(): é
-- catálogo de perguntas da conta, não dado de um paciente, e não tem
-- cliente_id para o log (que o exige NOT NULL).
DO $$
DECLARE
  v_par TEXT[];
BEGIN
  FOREACH v_par SLICE 1 IN ARRAY ARRAY[
    ARRAY['prontuarios',        'prontuario'],
    ARRAY['respostas_anamnese', 'anamnese'],
    ARRAY['evolucoes',          'evolucao'],
    ARRAY['consentimentos',     'consentimento']
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS registrar_escrita_clinica ON aba_health.%I', v_par[1]);
    EXECUTE format(
      'CREATE TRIGGER registrar_escrita_clinica AFTER INSERT OR UPDATE ON aba_health.%I
         FOR EACH ROW EXECUTE FUNCTION aba_health.registrar_escrita_clinica(%L)',
      v_par[1], v_par[2]
    );
  END LOOP;
END $$;
