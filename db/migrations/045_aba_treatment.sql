-- =====================================================================
-- 045 — `aba_treatment`: o plano de tratamento (Subetapa 03.8)
--
-- O DÉCIMO SCHEMA DE MÓDULO. Decisão D-I2 de Max (2026-09-03), com
-- `CLAUDE.md` §2 atualizado na Subetapa 03.0.a. Chave de módulo
-- `treatment`, rótulo **"Planos"**.
--
-- NOTA DE RÓTULO, e ela é divergência de documento, não escolha desta
-- migration: o bloco da Subetapa 03.8 em `docs/00a_PLANO_ETAPA_03.md`
-- ainda diz "Planos de tratamento", texto escrito na 03.0.a. A decisão
-- **D-V1, de 2026-09-04**, revisou o rótulo para **"Planos"** e o
-- `CLAUDE.md` §2 registra a revisão com autorização explícita de Max.
-- `CLAUDE.md` é mais novo e é a regra permanente — vale ele. A
-- divergência fica reportada no Status da subetapa.
--
-- "Orçamento" continua sendo a palavra da INTERFACE, onde o paciente e a
-- recepção a esperam. O schema não aparece na tela.
--
-- ============================================================
-- A ENTIDADE É UMA MATRIZ, NÃO UMA LISTA DE ITENS COM PREÇO
-- ============================================================
-- Desenho medido pela pesquisa `analise-ice` e escrito em
-- `docs/02_MODELO_DE_DADOS.md` §12, para esta migration não precisar
-- redescobri-lo:
--
--   · LINHA  = fase clínica (`aba_treatment.fases`), configurável por
--     conta, semeada com as seis do modelo de referência. O ordenamento
--     é CLÍNICO, não comercial — e é isso que separa este produto de um
--     sistema de vendas com odontograma acoplado.
--   · COLUNA = opção de tratamento concorrente (`aba_treatment.opcoes`),
--     A, B, …, em número livre.
--   · O DIAGNÓSTICO ATRAVESSA AS COLUNAS (`aba_treatment.diagnosticos`,
--     filho do plano) e o PROCEDIMENTO MORA DENTRO DE UMA DELAS
--     (`aba_treatment.procedimentos_plano`, filho da opção). É essa forma
--     que põe duas alternativas para a mesma cárie lado a lado.
--
-- SEM PREÇO, SEM CONTRATO, SEM FATURA — isso é a Subetapa 03.8.a. Nenhuma
-- coluna monetária nasce aqui, de propósito.
--
-- ============================================================
-- A FILA DE TRABALHO É DERIVADA, E NÃO TEM COLUNA
-- ============================================================
-- "Diagnóstico ainda não fasado fica numa fila de trabalho à parte."
-- Um diagnóstico está fasado quando existe procedimento apontando para
-- ele; a fila é `diagnosticos` sem `procedimentos_plano` — um `NOT
-- EXISTS`, não uma `fase_id` nullable no diagnóstico. Coluna a mais aqui
-- seria a mesma informação com dois donos, e o modo de falha é o já
-- pago na 03.6.a (`area_aplicavel` × `unidade_lancamento`): as duas
-- conviveriam até a primeira tela escrever só numa delas.
--
-- ============================================================
-- REGIME DE ACESSO — PORTADO, NÃO REESCRITO (`CLAUDE.md` §14)
-- ============================================================
-- Dente e face são DADO DE SAÚDE, e é por isso que a subetapa tem P-sub
-- mesmo com o schema não sendo uma tabela clínica. A porta é
-- `aba_treatment.pode_planejar(cliente_id, acao)`, que é a conjunção de
-- duas camadas já provadas em produção:
--
--   1. `aba_health.pode_acessar(cliente_id, acao)` — o alcance clínico
--      inteiro: concessão 'negar' vence tudo, owner passa, concessão
--      'permitir' vigente passa, atributo profissional ativo com
--      funcionário ativo por trás mais `access.can('health', ação)`
--      passa, e o padrão nega.
--   2. `access.can('treatment', ação)` — o interruptor do módulo novo,
--      por conta × papel × ação.
--
-- POR QUE `treatment` NÃO ENTRA NO RAMO FECHADO DE `access.
-- default_permission` (onde `health` está), e isso foi MEDIDO antes de
-- decidido: `access.module_permissions` tem UMA linha em produção
-- (`health/agent/read = false`), ou seja, tudo hoje corre pelo padrão; e
-- o padrão de `health` é FALSE para todo papel que não seja owner. Se
-- `treatment` herdasse esse ramo, a conjunção acima exigiria DOIS
-- interruptores ligados à mão para qualquer profissional planejar, e —
-- pior — uma concessão nominal de prontuário, que existe justamente para
-- abrir o caso sem mexer em módulo, deixaria de abrir o plano. A
-- severidade já está no primeiro fator: `pode_acessar` é fail-closed. O
-- segundo fator é o que a conta liga e desliga por papel, que é o que
-- `access.modules` existe para fazer.
--
-- ============================================================
-- HARDENING COMPLETO NA PRÓPRIA MIGRATION (`instrucoes.md` §4 e §6)
-- ============================================================
-- O Maximus precisou de 15 migrations (051–065, 070, 074–078) para
-- descobrir isto depois. Aqui entra tudo de uma vez:
--   · `ENABLE ROW LEVEL SECURITY` explícito em cada tabela — o event
--     trigger da plataforma (`public.rls_auto_enable()`) filtra
--     `cmd.schema_name IN ('public')` e não alcança schema `aba_*`;
--   · `GRANT` amplo ANTES de qualquer `REVOKE`/`GRANT` por coluna;
--   · `REVOKE EXECUTE ... FROM PUBLIC` **e** `FROM anon` em toda função
--     — revogar de PUBLIC não fecha `anon`, que é papel nominal;
--   · `ALTER DEFAULT PRIVILEGES` na mesma migration que cria o schema,
--     pendência que a 01.2 deixou e a 01.3 teve de fechar;
--   · toda chave estrangeira multi-inquilino COMPOSTA por `account_id` —
--     a integridade referencial ignora RLS por especificação, e sem
--     `account_id` na chave a linha da conta A aponta para a da conta B
--     sem nada ficar vermelho (Subetapa 02.15, migration `035`);
--   · trigger que cruza schema mora no schema que DEPENDE.
--
-- ACHADO DESTA MIGRATION, e ele é da classe que a `039` existe para
-- impedir: `public.fks_sem_isolamento_de_conta()` — a auditoria
-- permanente que a suíte de RLS cobra em "zero linhas" — tem a lista de
-- schemas **cravada no corpo**, e `aba_treatment` não estava nela. O
-- schema novo nasceria INVISÍVEL para a própria guarda que existe para
-- pegar a 74ª chave desprotegida. Corrigido na §8 abaixo. A lição é
-- maior que o caso: guarda por varredura de catálogo protege o que
-- ninguém viu **desde que a varredura alcance o lugar** — e uma lista de
-- schemas escrita à mão dentro dela é exatamente a lista manual que a
-- própria `039` diz não querer.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §1 — Schema, função de carimbo e privilégios padrão
-- ---------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS aba_treatment;

GRANT USAGE ON SCHEMA aba_treatment TO authenticated, service_role;
REVOKE ALL ON SCHEMA aba_treatment FROM PUBLIC;
REVOKE ALL ON SCHEMA aba_treatment FROM anon;

-- `set_updated_at()` PRÓPRIA do módulo, não a do núcleo: é o que mantém
-- o schema exportável sozinho para um CRM-filho (`docs/01` §4).
CREATE OR REPLACE FUNCTION aba_treatment.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.atualizado_em := NOW();
  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_treatment.set_updated_at() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_treatment.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_treatment.set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION aba_treatment.set_updated_at() FROM authenticated;

-- Privilégios padrão na MESMA migration que cria o schema — a 01.2
-- deixou isso para depois e a 01.3 teve de voltar (`instrucoes.md` §5).
-- Sem `TRUNCATE`: `GRANT ALL ON TABLE` o entrega, e `TRUNCATE` não passa
-- por RLS.
ALTER DEFAULT PRIVILEGES IN SCHEMA aba_treatment
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA aba_treatment
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA aba_treatment
  REVOKE ALL ON TABLES FROM PUBLIC;

-- ---------------------------------------------------------------------
-- §1b — O que `aba_health` precisa ceder, e por que mora aqui
--
-- VEM ANTES DAS TABELAS de propósito: a chave estrangeira composta de
-- `procedimentos_plano` para `consentimentos` exige que a restrição única
-- (a) já exista no momento do `CREATE TABLE`. Escrita depois, a migration
-- falha com "there is no unique constraint matching given keys" — medido.
--
-- Duas alterações em `aba_health`, as duas por ADIÇÃO (`instrucoes.md`
-- §4: estender, nunca reescrever), e as duas escritas nesta migration
-- porque é `aba_treatment` que DEPENDE — a regra de "trigger que cruza
-- schema mora no schema que depende" vale para a dependência inteira.
-- ---------------------------------------------------------------------

-- (a) `UNIQUE (id, account_id)` em `consentimentos`. A `035` pôs essa
-- chave em 25 tabelas-pai; `consentimentos` ficou de fora por não ter
-- nenhuma FK apontando para ela — agora tem, e a FK composta exige uma
-- restrição única que cubra exatamente as colunas referenciadas.
-- Tecnicamente redundante (`id` já é único sozinho); é assim que o
-- Postgres exige.
-- CRIA SÓ SE FALTAR, e nunca `DROP` + `ADD`. Medido ao reaplicar a
-- migration: na segunda execução o `DROP` falha com "cannot drop
-- constraint ... because other objects depend on it", porque a chave
-- estrangeira de `procedimentos_plano` já pendura nela. Idempotência
-- aqui não é elegância — é o que permite reaplicar em produção depois de
-- provar no banco de teste, e o que a clonagem de CRM-filho vai exigir.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'aba_health.consentimentos'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (id, account_id)'
  ) THEN
    ALTER TABLE aba_health.consentimentos
      ADD CONSTRAINT consentimentos_id_account_id_key UNIQUE (id, account_id);
  END IF;
END $$;

-- (b) `procedimento_informado` no CHECK de `tipo`.
--
-- `aba_catalog.procedimentos` declara DOIS requisitos de termo desde a
-- 03.6.a: `exige_consentimento_tratamento` e
-- `exige_consentimento_informado` (procedimento de risco significativo).
-- O catálogo de `consentimentos.tipo` tinha três valores e nenhum
-- correspondia ao segundo. Sem este valor, a trava da §5 teria de
-- aceitar o mesmo termo para os dois requisitos — e a bandeira
-- `exige_consentimento_informado` viraria sinônimo da outra, isto é, uma
-- coluna sem efeito próprio. Coluna que não muda nada é a classe de
-- defeito que este projeto já pagou três vezes.
--
-- O CHECK é buscado POR CATÁLOGO, nunca pelo nome ou pelo texto:
-- `pg_get_constraintdef()` reescreve `CHECK (col IN (...))` como
-- `= ANY (ARRAY[...])` (`instrucoes.md` §5).
DO $$
DECLARE
  v_nome TEXT;
BEGIN
  SELECT con.conname INTO v_nome
  FROM pg_constraint con
  WHERE con.conrelid = 'aba_health.consentimentos'::regclass
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%tipo%'
    AND pg_get_constraintdef(con.oid) LIKE '%uso_imagem%'
  LIMIT 1;

  IF v_nome IS NOT NULL THEN
    EXECUTE format('ALTER TABLE aba_health.consentimentos DROP CONSTRAINT %I', v_nome);
  END IF;

  ALTER TABLE aba_health.consentimentos
    ADD CONSTRAINT consentimentos_tipo_valido
    CHECK (tipo IN ('tratamento_dados','procedimento','procedimento_informado','uso_imagem'));
END $$;

COMMENT ON CONSTRAINT consentimentos_tipo_valido ON aba_health.consentimentos IS
  'Quatro tipos. `procedimento_informado` entrou na Subetapa 03.8 para dar efeito próprio a aba_catalog.procedimentos.exige_consentimento_informado — sem ele, as duas bandeiras de requisito seriam satisfeitas pelo mesmo termo e uma delas não mudaria nada.';

-- ---------------------------------------------------------------------
-- §2 — Tabelas
-- ---------------------------------------------------------------------

-- ============================================================
-- fases — a LINHA da matriz. Configurável por conta.
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_treatment.fases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  chave         TEXT NOT NULL,
  rotulo        TEXT NOT NULL,
  -- Ordem CLÍNICA. Emergência antes de manutenção não é preferência de
  -- tela: é a sequência em que o tratamento acontece.
  ordem         SMALLINT NOT NULL DEFAULT 0,
  ativa         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, chave),
  UNIQUE (id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_fases_conta ON aba_treatment.fases(account_id, ordem);

-- ============================================================
-- planos — o cabeçalho. Um paciente pode ter mais de um.
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_treatment.planos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  cliente_id     UUID NOT NULL,
  -- AUTOR. A trava de edição por autor (D-V7) NÃO é desta subetapa: ela
  -- precisa do mesmo mecanismo que a Subetapa 03.9 vai construir para a
  -- trava de nível, porque `access.can()` devolve TRUE para `owner`
  -- ANTES de consultar qualquer tabela (`003_core_access.sql`,
  -- `instrucoes.md` §5). A coluna nasce aqui para o dado existir desde o
  -- primeiro plano; a regra vem depois, e não se inventa aqui uma
  -- segunda maneira de fazê-la.
  profissional_id UUID,
  titulo         TEXT NOT NULL DEFAULT 'Plano de tratamento',
  observacao     TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, account_id),
  CONSTRAINT planos_cliente_fk
    FOREIGN KEY (cliente_id, account_id)
    REFERENCES aba_people.clientes(id, account_id) ON DELETE CASCADE,
  CONSTRAINT planos_profissional_fk
    FOREIGN KEY (profissional_id, account_id)
    REFERENCES aba_scheduling.profissionais(id, account_id) ON DELETE SET NULL (profissional_id)
);
CREATE INDEX IF NOT EXISTS idx_planos_cliente ON aba_treatment.planos(account_id, cliente_id);

-- ============================================================
-- opcoes — a COLUNA da matriz. Número livre por plano.
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_treatment.opcoes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  plano_id       UUID NOT NULL,
  rotulo         TEXT NOT NULL,
  ordem          SMALLINT NOT NULL DEFAULT 0,
  -- Consentimento da OPÇÃO. É o carimbo que dispara a recusa implícita
  -- das concorrentes (item 36, `docs/02` §12.4).
  consentida_em  TIMESTAMPTZ,
  consentida_por UUID,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, account_id),
  UNIQUE (plano_id, rotulo),
  CONSTRAINT opcoes_plano_fk
    FOREIGN KEY (plano_id, account_id)
    REFERENCES aba_treatment.planos(id, account_id) ON DELETE CASCADE,
  CONSTRAINT opcoes_consentimento_completo
    CHECK ((consentida_em IS NULL) = (consentida_por IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_opcoes_plano ON aba_treatment.opcoes(plano_id, ordem);

-- ============================================================
-- diagnosticos — ATRAVESSAM as colunas: são filhos do PLANO, nunca da
-- opção. É essa direção de chave que põe duas alternativas para a mesma
-- cárie lado a lado; pendurá-los na opção duplicaria o diagnóstico e
-- desfaria a comparação que o modelo existe para permitir.
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_treatment.diagnosticos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  plano_id      UUID NOT NULL,
  -- Dente em notação FDI. NULL quando o diagnóstico é da boca, não de um
  -- dente (doença periodontal generalizada, por exemplo).
  dente         TEXT,
  -- FACES DO ACHADO — onde há doença. Não confundir com as faces do
  -- procedimento, que são onde se vai TRABALHAR. A distinção é o achado
  -- A2 da pesquisa `analise-ice`, e é a razão de existirem duas listas
  -- (`docs/02` §12.2). Vem do odontograma, `achados[].faces`.
  faces         TEXT[] NOT NULL DEFAULT '{}',
  descricao     TEXT NOT NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, account_id),
  CONSTRAINT diagnosticos_plano_fk
    FOREIGN KEY (plano_id, account_id)
    REFERENCES aba_treatment.planos(id, account_id) ON DELETE CASCADE,
  CONSTRAINT diagnosticos_dente_fdi
    CHECK (dente IS NULL OR dente ~ '^([1-4][1-8]|[5-8][1-5])$'),
  CONSTRAINT diagnosticos_faces_vocabulario
    CHECK (faces <@ ARRAY['mesial','distal','vestibular','lingual','oclusal','incisal']::TEXT[]),
  CONSTRAINT diagnosticos_face_exige_dente
    CHECK (cardinality(faces) = 0 OR dente IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_diagnosticos_plano ON aba_treatment.diagnosticos(plano_id);

-- ============================================================
-- procedimentos_plano — a CÉLULA: fase (linha) × opção (coluna).
--
-- "Selecionar N faces cria N linhas, uma por dente — nunca uma linha com
-- N dentes." Por isso `dente` é UMA coluna de texto, não um array: a
-- forma da tabela recusa a linha com N dentes antes de qualquer regra de
-- aplicação. `faces` é array porque uma restauração MOD é UM
-- procedimento em três faces DO MESMO dente.
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_treatment.procedimentos_plano (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  plano_id        UUID NOT NULL,
  opcao_id        UUID NOT NULL,
  fase_id         UUID NOT NULL,
  procedimento_id UUID NOT NULL,
  diagnostico_id  UUID,
  dente           TEXT,
  -- FACES DO TRABALHO — onde o profissional vai trabalhar. Pode
  -- coincidir com a face do achado, pode ser maior (restauração MOD
  -- sobre cárie só na oclusal) ou pode não existir como achado (selante
  -- em face hígida). Vem do odontograma, `Marcacao.faces`.
  faces           TEXT[] NOT NULL DEFAULT '{}',
  estado          TEXT NOT NULL DEFAULT 'proposto',
  -- Termo que autoriza a saída de `proposto`, quando o código o exige.
  consentimento_id UUID,
  -- RECUSA IMPLÍCITA (item 36): consentir a Opção A marca os
  -- procedimentos da Opção B para o MESMO diagnóstico como recusados. O
  -- registro de que o paciente escolheu A e recusou B é o que protege a
  -- clínica depois — é requisito ético e jurídico, não conveniência.
  -- Recusa NÃO é um sexto estado: é um fato sobre a proposta, e o ciclo
  -- de estado continua com cinco valores.
  recusado_em     TIMESTAMPTZ,
  recusado_por    UUID,
  -- `executado` é FATO AFIRMADO, com data e autor (achado A4 da 03.7.a).
  -- A trava de finalização de contrato da 03.8.a lê estes dois campos.
  executado_em    TIMESTAMPTZ,
  executado_por   UUID,
  observacao      TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, account_id),
  CONSTRAINT procedimentos_plano_plano_fk
    FOREIGN KEY (plano_id, account_id)
    REFERENCES aba_treatment.planos(id, account_id) ON DELETE CASCADE,
  CONSTRAINT procedimentos_plano_opcao_fk
    FOREIGN KEY (opcao_id, account_id)
    REFERENCES aba_treatment.opcoes(id, account_id) ON DELETE CASCADE,
  CONSTRAINT procedimentos_plano_fase_fk
    FOREIGN KEY (fase_id, account_id)
    REFERENCES aba_treatment.fases(id, account_id),
  CONSTRAINT procedimentos_plano_procedimento_fk
    FOREIGN KEY (procedimento_id, account_id)
    REFERENCES aba_catalog.procedimentos(id, account_id),
  CONSTRAINT procedimentos_plano_diagnostico_fk
    FOREIGN KEY (diagnostico_id, account_id)
    REFERENCES aba_treatment.diagnosticos(id, account_id) ON DELETE SET NULL (diagnostico_id),
  CONSTRAINT procedimentos_plano_consentimento_fk
    FOREIGN KEY (consentimento_id, account_id)
    REFERENCES aba_health.consentimentos(id, account_id) ON DELETE SET NULL (consentimento_id),
  CONSTRAINT procedimentos_plano_estado_valido
    CHECK (estado IN ('proposto','planejado','em_execucao','executado','nao_mais_necessario')),
  CONSTRAINT procedimentos_plano_dente_fdi
    CHECK (dente IS NULL OR dente ~ '^([1-4][1-8]|[5-8][1-5])$'),
  CONSTRAINT procedimentos_plano_faces_vocabulario
    CHECK (faces <@ ARRAY['mesial','distal','vestibular','lingual','oclusal','incisal']::TEXT[]),
  CONSTRAINT procedimentos_plano_face_exige_dente
    CHECK (cardinality(faces) = 0 OR dente IS NOT NULL),
  CONSTRAINT procedimentos_plano_recusa_completa
    CHECK ((recusado_em IS NULL) = (recusado_por IS NULL)),
  -- Data e autor de execução só existem junto do estado que os
  -- justifica. Carimbo sobrevivente de um procedimento que voltou para
  -- `planejado` afirmaria execução que não houve — e é a trava
  -- financeira da 03.8.a que leria isso.
  CONSTRAINT procedimentos_plano_execucao_coerente
    CHECK ((estado = 'executado') = (executado_em IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_proc_plano_plano ON aba_treatment.procedimentos_plano(plano_id);
CREATE INDEX IF NOT EXISTS idx_proc_plano_opcao ON aba_treatment.procedimentos_plano(opcao_id);
CREATE INDEX IF NOT EXISTS idx_proc_plano_diagnostico
  ON aba_treatment.procedimentos_plano(diagnostico_id) WHERE diagnostico_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_fases_updated ON aba_treatment.fases;
CREATE TRIGGER trg_fases_updated BEFORE UPDATE ON aba_treatment.fases
  FOR EACH ROW EXECUTE FUNCTION aba_treatment.set_updated_at();
DROP TRIGGER IF EXISTS trg_planos_updated ON aba_treatment.planos;
CREATE TRIGGER trg_planos_updated BEFORE UPDATE ON aba_treatment.planos
  FOR EACH ROW EXECUTE FUNCTION aba_treatment.set_updated_at();
DROP TRIGGER IF EXISTS trg_opcoes_updated ON aba_treatment.opcoes;
CREATE TRIGGER trg_opcoes_updated BEFORE UPDATE ON aba_treatment.opcoes
  FOR EACH ROW EXECUTE FUNCTION aba_treatment.set_updated_at();
DROP TRIGGER IF EXISTS trg_diagnosticos_updated ON aba_treatment.diagnosticos;
CREATE TRIGGER trg_diagnosticos_updated BEFORE UPDATE ON aba_treatment.diagnosticos
  FOR EACH ROW EXECUTE FUNCTION aba_treatment.set_updated_at();
DROP TRIGGER IF EXISTS trg_proc_plano_updated ON aba_treatment.procedimentos_plano;
CREATE TRIGGER trg_proc_plano_updated BEFORE UPDATE ON aba_treatment.procedimentos_plano
  FOR EACH ROW EXECUTE FUNCTION aba_treatment.set_updated_at();

-- ---------------------------------------------------------------------
-- §3 — `aba_treatment.pode_planejar(cliente_id, acao)`
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_treatment.pode_planejar(
  p_cliente_id UUID,
  p_acao TEXT
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    -- ALCANCE CLÍNICO. `aba_health.pode_acessar` conhece quatro verbos —
    -- leitura, criacao, atualizacao, exportacao — e **não conhece
    -- exclusão, de propósito**: prontuário não se apaga, e a 013 nem
    -- criou policy de DELETE para as tabelas dela. Passar 'exclusao'
    -- direto para lá devolveria FALSE sempre, e a policy de DELETE desta
    -- migration nasceria MORTA — medido: o primeiro teste de apagar um
    -- rascunho recusou até para o `owner`.
    --
    -- Apagar a linha `proposto` de um plano não é apagar prontuário: é
    -- desfazer um rascunho que ninguém chegou a propor de verdade. O
    -- alcance clínico exigido para isso é o de EDITAR o plano, e a
    -- permissão de apagar vem da camada de módulo, onde ela existe.
    aba_health.pode_acessar(
      p_cliente_id,
      CASE WHEN p_acao = 'exclusao' THEN 'atualizacao' ELSE p_acao END
    )
    AND access.can(
          'treatment',
          CASE p_acao
            WHEN 'leitura'     THEN 'read'
            WHEN 'criacao'     THEN 'create'
            WHEN 'atualizacao' THEN 'update'
            WHEN 'exclusao'    THEN 'delete'
            ELSE NULL
          END
        );
$$;

COMMENT ON FUNCTION aba_treatment.pode_planejar(UUID, TEXT) IS
  'Porta única de aba_treatment: alcance clínico (aba_health.pode_acessar, fail-closed) E interruptor do módulo treatment. Ação inválida devolve NULL no mapeamento e access.can(module, NULL) nega por desenho — falha fechada sem if próprio.';

ALTER FUNCTION aba_treatment.pode_planejar(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_treatment.pode_planejar(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_treatment.pode_planejar(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION aba_treatment.pode_planejar(UUID, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §4 — RLS
--
-- `fases` é catálogo DE CONTA, não dado de um cliente: as políticas dela
-- chamam `pode_planejar(NULL, ...)`, no mesmo padrão que
-- `formularios_anamnese` usa em `aba_health`. As três tabelas de dado
-- resolvem o cliente pelo plano, no padrão de tabela filha do Maximus
-- (`EXISTS (SELECT 1 FROM pai WHERE ...)`) — sem denormalizar
-- `cliente_id`, que criaria uma segunda cópia para manter em sincronia.
-- ---------------------------------------------------------------------
ALTER TABLE aba_treatment.fases                ENABLE ROW LEVEL SECURITY;
ALTER TABLE aba_treatment.planos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE aba_treatment.opcoes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE aba_treatment.diagnosticos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE aba_treatment.procedimentos_plano  ENABLE ROW LEVEL SECURITY;

-- fases
DROP POLICY IF EXISTS fases_select ON aba_treatment.fases;
CREATE POLICY fases_select ON aba_treatment.fases FOR SELECT
  USING (public.is_account_member(account_id) AND aba_treatment.pode_planejar(NULL, 'leitura'));
DROP POLICY IF EXISTS fases_insert ON aba_treatment.fases;
CREATE POLICY fases_insert ON aba_treatment.fases FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin') AND aba_treatment.pode_planejar(NULL, 'criacao'));
DROP POLICY IF EXISTS fases_update ON aba_treatment.fases;
CREATE POLICY fases_update ON aba_treatment.fases FOR UPDATE
  USING (public.is_account_member(account_id, 'admin') AND aba_treatment.pode_planejar(NULL, 'atualizacao'))
  WITH CHECK (public.is_account_member(account_id, 'admin') AND aba_treatment.pode_planejar(NULL, 'atualizacao'));

-- planos
DROP POLICY IF EXISTS planos_select ON aba_treatment.planos;
CREATE POLICY planos_select ON aba_treatment.planos FOR SELECT
  USING (aba_treatment.pode_planejar(cliente_id, 'leitura'));
DROP POLICY IF EXISTS planos_insert ON aba_treatment.planos;
CREATE POLICY planos_insert ON aba_treatment.planos FOR INSERT
  WITH CHECK (aba_treatment.pode_planejar(cliente_id, 'criacao'));
DROP POLICY IF EXISTS planos_update ON aba_treatment.planos;
CREATE POLICY planos_update ON aba_treatment.planos FOR UPDATE
  USING (aba_treatment.pode_planejar(cliente_id, 'atualizacao'))
  WITH CHECK (aba_treatment.pode_planejar(cliente_id, 'atualizacao'));

-- opcoes / diagnosticos / procedimentos_plano — cliente resolvido pelo plano
DROP POLICY IF EXISTS opcoes_select ON aba_treatment.opcoes;
CREATE POLICY opcoes_select ON aba_treatment.opcoes FOR SELECT
  USING (EXISTS (SELECT 1 FROM aba_treatment.planos p
                 WHERE p.id = plano_id AND aba_treatment.pode_planejar(p.cliente_id, 'leitura')));
DROP POLICY IF EXISTS opcoes_insert ON aba_treatment.opcoes;
CREATE POLICY opcoes_insert ON aba_treatment.opcoes FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM aba_treatment.planos p
                      WHERE p.id = plano_id AND aba_treatment.pode_planejar(p.cliente_id, 'criacao')));
DROP POLICY IF EXISTS opcoes_update ON aba_treatment.opcoes;
CREATE POLICY opcoes_update ON aba_treatment.opcoes FOR UPDATE
  USING (EXISTS (SELECT 1 FROM aba_treatment.planos p
                 WHERE p.id = plano_id AND aba_treatment.pode_planejar(p.cliente_id, 'atualizacao')))
  WITH CHECK (EXISTS (SELECT 1 FROM aba_treatment.planos p
                      WHERE p.id = plano_id AND aba_treatment.pode_planejar(p.cliente_id, 'atualizacao')));

DROP POLICY IF EXISTS diagnosticos_select ON aba_treatment.diagnosticos;
CREATE POLICY diagnosticos_select ON aba_treatment.diagnosticos FOR SELECT
  USING (EXISTS (SELECT 1 FROM aba_treatment.planos p
                 WHERE p.id = plano_id AND aba_treatment.pode_planejar(p.cliente_id, 'leitura')));
DROP POLICY IF EXISTS diagnosticos_insert ON aba_treatment.diagnosticos;
CREATE POLICY diagnosticos_insert ON aba_treatment.diagnosticos FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM aba_treatment.planos p
                      WHERE p.id = plano_id AND aba_treatment.pode_planejar(p.cliente_id, 'criacao')));
DROP POLICY IF EXISTS diagnosticos_update ON aba_treatment.diagnosticos;
CREATE POLICY diagnosticos_update ON aba_treatment.diagnosticos FOR UPDATE
  USING (EXISTS (SELECT 1 FROM aba_treatment.planos p
                 WHERE p.id = plano_id AND aba_treatment.pode_planejar(p.cliente_id, 'atualizacao')))
  WITH CHECK (EXISTS (SELECT 1 FROM aba_treatment.planos p
                      WHERE p.id = plano_id AND aba_treatment.pode_planejar(p.cliente_id, 'atualizacao')));

DROP POLICY IF EXISTS proc_plano_select ON aba_treatment.procedimentos_plano;
CREATE POLICY proc_plano_select ON aba_treatment.procedimentos_plano FOR SELECT
  USING (EXISTS (SELECT 1 FROM aba_treatment.planos p
                 WHERE p.id = plano_id AND aba_treatment.pode_planejar(p.cliente_id, 'leitura')));
DROP POLICY IF EXISTS proc_plano_insert ON aba_treatment.procedimentos_plano;
CREATE POLICY proc_plano_insert ON aba_treatment.procedimentos_plano FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM aba_treatment.planos p
                      WHERE p.id = plano_id AND aba_treatment.pode_planejar(p.cliente_id, 'criacao')));
DROP POLICY IF EXISTS proc_plano_update ON aba_treatment.procedimentos_plano;
CREATE POLICY proc_plano_update ON aba_treatment.procedimentos_plano FOR UPDATE
  USING (EXISTS (SELECT 1 FROM aba_treatment.planos p
                 WHERE p.id = plano_id AND aba_treatment.pode_planejar(p.cliente_id, 'atualizacao')))
  WITH CHECK (EXISTS (SELECT 1 FROM aba_treatment.planos p
                      WHERE p.id = plano_id AND aba_treatment.pode_planejar(p.cliente_id, 'atualizacao')));

-- DELETE existe SÓ aqui, e só para `proposto` NÃO RECUSADO.
--
-- "Só `proposto` se apaga — o resto some do plano e permanece na lista
-- geral, porque o histórico do que se propôs é o que protege a clínica
-- depois." A cláusula `recusado_em IS NULL` é o que impede o caminho
-- óbvio de burlar isso: a Opção B recusada continua `proposto`, e sem
-- essa condição bastaria apagá-la para sumir com a prova de que o
-- paciente escolheu A.
DROP POLICY IF EXISTS proc_plano_delete ON aba_treatment.procedimentos_plano;
CREATE POLICY proc_plano_delete ON aba_treatment.procedimentos_plano FOR DELETE
  USING (
    estado = 'proposto'
    AND recusado_em IS NULL
    AND EXISTS (SELECT 1 FROM aba_treatment.planos p
                WHERE p.id = plano_id AND aba_treatment.pode_planejar(p.cliente_id, 'exclusao'))
  );

-- ---------------------------------------------------------------------
-- §5 — A REGRA VIVE NO BANCO, NÃO NA TELA
--
-- Uma função só, e o motivo é de correção: forma do código,
-- re-consentimento, ciclo de estado e trava de requisito precisam de uma
-- ORDEM definida entre si (o re-consentimento devolve a linha para
-- `proposto`, e o validador de ciclo tem de saber que aquela transição
-- foi ele quem pediu). Em triggers separados a ordem seria alfabética
-- pelo nome — regra de correção clínica decidida por ordem de nome é
-- exatamente o tipo de dependência invisível que este projeto já pagou.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_treatment.validar_procedimento_plano()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_proc          RECORD;
  v_cliente_id    UUID;
  v_posicao       INT;
  v_grupo         TEXT;
  v_reconsentiu   BOOLEAN := FALSE;
BEGIN
  SELECT unidade_lancamento, quantidade_maxima, aceita_faces,
         faces_minimo, faces_maximo, regiao_dentaria,
         exige_consentimento_tratamento, exige_consentimento_informado,
         exige_achado_diagnostico, nome
    INTO v_proc
  FROM aba_catalog.procedimentos
  WHERE id = NEW.procedimento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Procedimento % não existe no catálogo desta conta.', NEW.procedimento_id
      USING ERRCODE = '23503';
  END IF;

  -- ---- (1) FORMA DO CÓDIGO — as colunas que a 03.6.a criou passam a
  -- ---- ter efeito aqui, que é o que `docs/02` §11.2 já declarava.
  IF v_proc.unidade_lancamento = 'dente' AND NEW.dente IS NULL THEN
    RAISE EXCEPTION 'O procedimento "%" é lançado por dente e a linha não tem dente.', v_proc.nome
      USING ERRCODE = '23514';
  END IF;

  IF cardinality(NEW.faces) > 0 AND NOT v_proc.aceita_faces THEN
    RAISE EXCEPTION 'O procedimento "%" não aceita marcação por face.', v_proc.nome
      USING ERRCODE = '23514';
  END IF;

  IF v_proc.faces_minimo IS NOT NULL AND cardinality(NEW.faces) < v_proc.faces_minimo THEN
    RAISE EXCEPTION 'O procedimento "%" exige no mínimo % face(s); vieram %.',
      v_proc.nome, v_proc.faces_minimo, cardinality(NEW.faces) USING ERRCODE = '23514';
  END IF;

  IF v_proc.faces_maximo IS NOT NULL AND cardinality(NEW.faces) > v_proc.faces_maximo THEN
    RAISE EXCEPTION 'O procedimento "%" aceita no máximo % face(s); vieram %.',
      v_proc.nome, v_proc.faces_maximo, cardinality(NEW.faces) USING ERRCODE = '23514';
  END IF;

  -- Anterior é a posição 1 a 3 do quadrante (incisivos e canino);
  -- posterior é 4 a 8. Vale igual em permanente (quadrantes 1-4) e
  -- decíduo (5-8), porque a segunda casa da FDI é a posição nos dois.
  IF NEW.dente IS NOT NULL AND v_proc.regiao_dentaria IS NOT NULL
     AND v_proc.regiao_dentaria <> 'ambas' THEN
    v_posicao := substr(NEW.dente, 2, 1)::INT;
    v_grupo := CASE WHEN v_posicao <= 3 THEN 'anterior' ELSE 'posterior' END;
    IF v_grupo <> v_proc.regiao_dentaria THEN
      RAISE EXCEPTION 'O procedimento "%" vale em dente %; o dente % é %.',
        v_proc.nome, v_proc.regiao_dentaria, NEW.dente, v_grupo USING ERRCODE = '23514';
    END IF;
  END IF;

  -- ---- (2) RE-CONSENTIMENTO COM GATILHO EXPLÍCITO
  -- Mudar DENTE ou mudar CÓDIGO exige termo novo; mudar face, fase,
  -- opção ou diagnóstico vinculado não exige (`docs/02` §12.4). A regra
  -- mora aqui, em dado, e não num `if` espalhado pela tela.
  IF TG_OP = 'UPDATE'
     AND (NEW.dente IS DISTINCT FROM OLD.dente
          OR NEW.procedimento_id IS DISTINCT FROM OLD.procedimento_id) THEN
    v_reconsentiu := TRUE;
    NEW.consentimento_id := NULL;
    IF NEW.estado <> 'proposto' THEN
      NEW.estado := 'proposto';
      NEW.executado_em := NULL;
      NEW.executado_por := NULL;
    END IF;
  END IF;

  -- ---- (3) CICLO DE ESTADO
  -- `executado` e `nao_mais_necessario` são terminais. A volta para
  -- `proposto` só existe pelo caminho do re-consentimento acima — e
  -- linha já recusada não muda de estado por nenhum caminho.
  IF TG_OP = 'UPDATE' AND NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF OLD.recusado_em IS NOT NULL THEN
      RAISE EXCEPTION 'Procedimento recusado pelo paciente não muda de estado — o registro da recusa é o que protege a clínica.'
        USING ERRCODE = '23514';
    END IF;

    IF NOT v_reconsentiu AND NOT (
         (OLD.estado = 'proposto'    AND NEW.estado IN ('planejado','nao_mais_necessario'))
      OR (OLD.estado = 'planejado'   AND NEW.estado IN ('em_execucao','executado','nao_mais_necessario'))
      OR (OLD.estado = 'em_execucao' AND NEW.estado IN ('executado','nao_mais_necessario'))
    ) THEN
      RAISE EXCEPTION 'Transição de estado inválida: % → %.', OLD.estado, NEW.estado
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- ---- (4) TRAVA DE REQUISITO — não sai de `proposto` sem o que o
  -- ---- código exige. É o mesmo argumento que a 03.6 usou para
  -- ---- `quantidade_maxima`: regra clínica que a tela pode esquecer é
  -- ---- regra que a tela não guarda.
  IF NEW.estado <> 'proposto' THEN
    SELECT p.cliente_id INTO v_cliente_id
    FROM aba_treatment.planos p WHERE p.id = NEW.plano_id;

    IF v_proc.exige_achado_diagnostico AND NEW.diagnostico_id IS NULL THEN
      RAISE EXCEPTION 'O procedimento "%" exige achado diagnóstico vinculado antes de sair de proposto.', v_proc.nome
        USING ERRCODE = '23514';
    END IF;

    IF v_proc.exige_consentimento_tratamento OR v_proc.exige_consentimento_informado THEN
      IF NEW.consentimento_id IS NULL THEN
        RAISE EXCEPTION 'O procedimento "%" exige termo de consentimento antes de sair de proposto.', v_proc.nome
          USING ERRCODE = '23514';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM aba_health.consentimentos c
        WHERE c.id = NEW.consentimento_id
          AND c.cliente_id = v_cliente_id
          AND c.concedido
          AND c.revogado_em IS NULL
          AND c.tipo = CASE WHEN v_proc.exige_consentimento_informado
                            THEN 'procedimento_informado' ELSE 'procedimento' END
      ) THEN
        RAISE EXCEPTION 'O termo vinculado não é um consentimento vigente do tipo % para este paciente.',
          CASE WHEN v_proc.exige_consentimento_informado THEN 'procedimento_informado' ELSE 'procedimento' END
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  -- ---- (5) `executado` é fato afirmado, com data e autor
  IF NEW.estado = 'executado' THEN
    IF NEW.executado_em IS NULL THEN
      NEW.executado_em := NOW();
      NEW.executado_por := COALESCE(NEW.executado_por, auth.uid());
    END IF;
  ELSE
    NEW.executado_em := NULL;
    NEW.executado_por := NULL;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_treatment.validar_procedimento_plano() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_treatment.validar_procedimento_plano() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_treatment.validar_procedimento_plano() FROM anon;
REVOKE ALL ON FUNCTION aba_treatment.validar_procedimento_plano() FROM authenticated;

DROP TRIGGER IF EXISTS trg_proc_plano_validar ON aba_treatment.procedimentos_plano;
CREATE TRIGGER trg_proc_plano_validar
  BEFORE INSERT OR UPDATE ON aba_treatment.procedimentos_plano
  FOR EACH ROW EXECUTE FUNCTION aba_treatment.validar_procedimento_plano();

-- ============================================================
-- O TETO DE QUANTIDADE precisa de trigger PRÓPRIO, e AFTER.
--
-- `quantidade_maxima` conta IRMÃOS, e em `BEFORE INSERT` a linha nova
-- ainda não está na tabela: um `count(*)` ali mediria N-1 e deixaria
-- passar sempre a última. Em `AFTER` a linha já está, e o `count` é o
-- verdadeiro. O escopo da contagem é o par (plano, opção): uma opção
-- concorrente é um tratamento ALTERNATIVO, e somar as duas recusaria
-- planos legítimos.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_treatment.conferir_teto_de_quantidade()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_max   INT;
  v_nome  TEXT;
  v_unid  TEXT;
  v_qtd   INT;
BEGIN
  SELECT quantidade_maxima, nome, unidade_lancamento
    INTO v_max, v_nome, v_unid
  FROM aba_catalog.procedimentos WHERE id = NEW.procedimento_id;

  IF v_max IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_qtd
  FROM aba_treatment.procedimentos_plano pp
  WHERE pp.plano_id = NEW.plano_id
    AND pp.opcao_id = NEW.opcao_id
    AND pp.procedimento_id = NEW.procedimento_id
    AND pp.recusado_em IS NULL
    AND pp.estado <> 'nao_mais_necessario';

  IF v_qtd > v_max THEN
    RAISE EXCEPTION 'O procedimento "%" aceita no máximo % lançamento(s) por % nesta opção; a opção ficaria com %.',
      v_nome, v_max, COALESCE(v_unid, 'plano'), v_qtd USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION aba_treatment.conferir_teto_de_quantidade() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_treatment.conferir_teto_de_quantidade() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_treatment.conferir_teto_de_quantidade() FROM anon;
REVOKE ALL ON FUNCTION aba_treatment.conferir_teto_de_quantidade() FROM authenticated;

DROP TRIGGER IF EXISTS trg_proc_plano_teto ON aba_treatment.procedimentos_plano;
CREATE TRIGGER trg_proc_plano_teto
  AFTER INSERT OR UPDATE OF procedimento_id, opcao_id, estado, recusado_em
  ON aba_treatment.procedimentos_plano
  FOR EACH ROW EXECUTE FUNCTION aba_treatment.conferir_teto_de_quantidade();

-- ---------------------------------------------------------------------
-- §6 — Consentir uma opção, e a RECUSA IMPLÍCITA das concorrentes
--
-- Operação, não `UPDATE` solto, porque são três efeitos que só fazem
-- sentido juntos e precisam da mesma transação. `SECURITY INVOKER` de
-- propósito: quem chama tem de passar pela RLS das próprias tabelas —
-- uma função DEFINER aqui seria um caminho paralelo por onde o alcance
-- clínico não é checado, que é o oposto do que a §3 constrói.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_treatment.consentir_opcao(
  p_opcao_id UUID,
  p_consentimento_id UUID DEFAULT NULL
) RETURNS TABLE (planejados INT, recusados INT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_plano_id   UUID;
  v_ator       UUID := auth.uid();
  v_planejados INT := 0;
  v_recusados  INT := 0;
BEGIN
  -- CONSENTIR EXIGE SESSÃO, e a recusa que isto impede foi MEDIDA, não
  -- imaginada: rodando esta função por conexão de servidor (`postgres`
  -- ou `service_role`, sem JWT), `auth.uid()` é NULL e a operação
  -- gravava `recusado_em` com `recusado_por` nulo — barrada pelo CHECK
  -- `procedimentos_plano_recusa_completa`, com uma mensagem que não
  -- explicava nada a quem a lesse.
  --
  -- A correção não é afrouxar o CHECK. Consentir e recusar são atos
  -- jurídicos: o registro de que o paciente escolheu A e recusou B só
  -- protege a clínica se disser QUEM registrou e QUANDO. Recusa sem
  -- autor é a mesma classe de defeito que a 03.7.a tirou de `executado`
  -- ao trocar inferência por fato afirmado.
  IF v_ator IS NULL THEN
    RAISE EXCEPTION 'Consentir uma opção exige sessão autenticada — a recusa das concorrentes precisa de autor.'
      USING ERRCODE = '42501';
  END IF;

  SELECT plano_id INTO v_plano_id FROM aba_treatment.opcoes WHERE id = p_opcao_id;
  IF v_plano_id IS NULL THEN
    RAISE EXCEPTION 'Opção % não existe ou não está ao seu alcance.', p_opcao_id
      USING ERRCODE = '42501';
  END IF;

  -- (a) A RECUSA VEM PRIMEIRO, e a ordem importa: recusar antes de
  -- planejar garante que o teto de quantidade da §5 já enxergue as
  -- linhas da concorrente fora da conta.
  UPDATE aba_treatment.procedimentos_plano pp
     SET recusado_em = NOW(), recusado_por = v_ator
   WHERE pp.plano_id = v_plano_id
     AND pp.opcao_id <> p_opcao_id
     AND pp.recusado_em IS NULL
     AND pp.estado = 'proposto'
     -- SÓ o que disputa o MESMO diagnóstico. Procedimento de outra
     -- opção que trata outra coisa não foi recusado por ninguém — e
     -- marcar como recusado o que não foi é tão errado quanto não
     -- marcar o que foi.
     AND pp.diagnostico_id IS NOT NULL
     AND pp.diagnostico_id IN (
       SELECT a.diagnostico_id FROM aba_treatment.procedimentos_plano a
       WHERE a.opcao_id = p_opcao_id AND a.diagnostico_id IS NOT NULL
     );
  GET DIAGNOSTICS v_recusados = ROW_COUNT;

  -- (b) A opção consentida sai de `proposto`. O termo, quando informado,
  -- é vinculado ANTES da mudança de estado — é o trigger da §5 que
  -- recusa a transição se o código exigir termo e ele não estiver lá.
  IF p_consentimento_id IS NOT NULL THEN
    UPDATE aba_treatment.procedimentos_plano
       SET consentimento_id = p_consentimento_id
     WHERE opcao_id = p_opcao_id AND estado = 'proposto' AND recusado_em IS NULL;
  END IF;

  UPDATE aba_treatment.procedimentos_plano
     SET estado = 'planejado'
   WHERE opcao_id = p_opcao_id AND estado = 'proposto' AND recusado_em IS NULL;
  GET DIAGNOSTICS v_planejados = ROW_COUNT;

  -- (c) O carimbo da própria opção.
  UPDATE aba_treatment.opcoes
     SET consentida_em = NOW(), consentida_por = v_ator
   WHERE id = p_opcao_id;

  RETURN QUERY SELECT v_planejados, v_recusados;
END;
$$;

COMMENT ON FUNCTION aba_treatment.consentir_opcao(UUID, UUID) IS
  'Consentir a opção A move os procedimentos dela de proposto para planejado e marca os da opção B PARA O MESMO DIAGNÓSTICO como recusados (item 36). SECURITY INVOKER: passa pela RLS de quem chama.';

REVOKE ALL ON FUNCTION aba_treatment.consentir_opcao(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_treatment.consentir_opcao(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION aba_treatment.consentir_opcao(UUID, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §7 — GRANTs de tabela (amplos ANTES de qualquer revogação por coluna)
--
-- A ordem é a lição da 01.3: `GRANT` amplo depois de um `REVOKE` por
-- coluna desfaz a revogação em silêncio. Sem `TRUNCATE` — ele não passa
-- por RLS. `DELETE` só em `procedimentos_plano`, porque é a única tabela
-- em que apagar é operação legítima (e a policy o restringe a `proposto`
-- não recusado).
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON aba_treatment.fases               TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON aba_treatment.planos              TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON aba_treatment.opcoes              TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON aba_treatment.diagnosticos        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON aba_treatment.procedimentos_plano TO authenticated, service_role;

REVOKE ALL ON ALL TABLES IN SCHEMA aba_treatment FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA aba_treatment FROM anon;

-- ---------------------------------------------------------------------
-- §8 — O módulo no catálogo, e a auditoria enxergando o schema novo
-- ---------------------------------------------------------------------

-- `treatment` entra logo depois de `health`: a ordem da navegação é a do
-- trabalho — prontuário, plano, catálogo.
--
-- O EMPURRÃO DAS POSIÇÕES SÓ ACONTECE UMA VEZ, e a guarda não é zelo: o
-- `UPDATE ... position + 1` é a única linha desta migration que NÃO é
-- naturalmente idempotente. Reaplicar sem ela empurraria a navegação
-- inteira mais uma casa a cada execução, sem erro nenhum — a classe de
-- defeito que só aparece quando alguém repara que o menu mudou de ordem.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM access.modules WHERE key = 'treatment') THEN
    UPDATE access.modules SET position = position + 1 WHERE position >= 6;
  END IF;
END $$;

INSERT INTO access.modules (key, label, position, is_core)
VALUES ('treatment', 'Planos', 6, FALSE)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label, position = EXCLUDED.position, is_core = EXCLUDED.is_core;

-- A GUARDA QUE NASCERIA CEGA. `public.fks_sem_isolamento_de_conta()` tem
-- a lista de schemas cravada no corpo, e o contrato dela — "devolve zero
-- linhas" — é cobrado pela suíte de RLS. Sem esta reescrita, as cinco
-- tabelas novas ficariam fora da varredura e a auditoria continuaria
-- verde por não olhar.
CREATE OR REPLACE FUNCTION public.fks_sem_isolamento_de_conta()
RETURNS TABLE (filho text, chave text, colunas text, pai text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH multi_inquilino AS (
    SELECT c.oid, n.nspname AS sch, c.relname AS tab
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname IN ('public','access','licensing','analytics','aba_people','aba_catalog',
                        'aba_scheduling','aba_finance','aba_health','aba_messaging',
                        'aba_sales','aba_automations','aba_ai','aba_treatment')
      AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute a
        WHERE a.attrelid = c.oid AND a.attname = 'account_id'
          AND a.attnum > 0 AND NOT a.attisdropped)
  )
  SELECT
    o.sch || '.' || o.tab AS filho,
    con.conname::text AS chave,
    (SELECT string_agg(a.attname::text, ', ' ORDER BY x.ord)
       FROM unnest(con.conkey) WITH ORDINALITY x(att, ord)
       JOIN pg_catalog.pg_attribute a
         ON a.attrelid = con.conrelid AND a.attnum = x.att) AS colunas,
    d.sch || '.' || d.tab AS pai
  FROM pg_catalog.pg_constraint con
  JOIN multi_inquilino o ON o.oid = con.conrelid
  JOIN multi_inquilino d ON d.oid = con.confrelid
  WHERE con.contype = 'f'
    AND NOT EXISTS (
      SELECT 1 FROM unnest(con.conkey) k
      JOIN pg_catalog.pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k
      WHERE a.attname = 'account_id')
  ORDER BY 1, 2;
$function$;

-- `CREATE OR REPLACE` preserva privilégio, mas o nome não mudou e o
-- corpo sim — reemitir é barato e fecha a dúvida (`instrucoes.md` §5:
-- renomear função AFROUXA a permissão dela).
REVOKE ALL ON FUNCTION public.fks_sem_isolamento_de_conta() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fks_sem_isolamento_de_conta() FROM anon;
REVOKE ALL ON FUNCTION public.fks_sem_isolamento_de_conta() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fks_sem_isolamento_de_conta() TO service_role;

-- ---------------------------------------------------------------------
-- §9 — Semente das seis fases, por conta
--
-- Função, e não `INSERT` solto, porque toda conta nova precisa dela — e
-- porque uma clínica pode renomear, reordenar ou desativar fase sem que
-- a próxima execução desfaça a escolha (`ON CONFLICT DO NOTHING`).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_treatment.semear_fases_padrao(p_account_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inseridas INT;
BEGIN
  INSERT INTO aba_treatment.fases (account_id, chave, rotulo, ordem)
  VALUES
    (p_account_id, 'emergencia',      'Emergência',         1),
    (p_account_id, 'sistemica',       'Sistêmica',          2),
    (p_account_id, 'aguda',           'Aguda',              3),
    (p_account_id, 'controle_doenca', 'Controle de doença', 4),
    (p_account_id, 'definitiva',      'Definitiva',         5),
    (p_account_id, 'manutencao',      'Manutenção',         6)
  ON CONFLICT (account_id, chave) DO NOTHING;
  GET DIAGNOSTICS v_inseridas = ROW_COUNT;
  RETURN v_inseridas;
END;
$$;

ALTER FUNCTION aba_treatment.semear_fases_padrao(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_treatment.semear_fases_padrao(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_treatment.semear_fases_padrao(UUID) FROM anon;
REVOKE ALL ON FUNCTION aba_treatment.semear_fases_padrao(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION aba_treatment.semear_fases_padrao(UUID) TO service_role;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.accounts LOOP
    PERFORM aba_treatment.semear_fases_padrao(r.id);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- §10 — VERIFICAÇÕES QUE RECUSAM A MIGRATION
--
-- Não são comentário nem `SELECT` de conferência: cada uma levanta
-- exceção e desfaz tudo. A lição é da 03.6.b — a diferença entre "mudou
-- o corpo" e "mudou o nome" é invisível no diff, e só o catálogo
-- responde. Aqui a mesma ideia cobre o hardening inteiro.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_faltando TEXT;
  v_n INT;
BEGIN
  -- (a) RLS ligada em toda tabela do schema
  SELECT string_agg(c.relname, ', ') INTO v_faltando
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'aba_treatment' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'RLS não está ligada em: %', v_faltando;
  END IF;

  -- (b) toda tabela tem pelo menos uma policy — RLS ligada sem policy
  -- nega tudo em silêncio, e o advisor a marca como INFO, não como erro.
  SELECT string_agg(c.relname, ', ') INTO v_faltando
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'aba_treatment' AND c.relkind = 'r'
    AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid);
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Tabela com RLS e sem policy: %', v_faltando;
  END IF;

  -- (c) nenhuma FK do schema novo sem `account_id` — a própria auditoria
  -- da `039`, agora que ela enxerga `aba_treatment`.
  SELECT count(*) INTO v_n
  FROM public.fks_sem_isolamento_de_conta() f
  WHERE f.filho LIKE 'aba_treatment.%' OR f.pai LIKE 'aba_treatment.%';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Há % chave(s) estrangeira(s) de aba_treatment sem isolamento de conta.', v_n;
  END IF;

  -- (d) nenhuma função do schema executável por PUBLIC ou anon
  SELECT string_agg(p.proname, ', ') INTO v_faltando
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'aba_treatment'
    AND (has_function_privilege('public', p.oid, 'EXECUTE')
         OR has_function_privilege('anon', p.oid, 'EXECUTE'));
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Função de aba_treatment executável por PUBLIC/anon: %', v_faltando;
  END IF;

  -- (e) `anon` não alcança nenhuma tabela do schema
  SELECT string_agg(c.relname, ', ') INTO v_faltando
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'aba_treatment' AND c.relkind = 'r'
    AND has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE');
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'anon alcança tabela de aba_treatment: %', v_faltando;
  END IF;

  -- (f) ninguém recebeu TRUNCATE — ele não passa por RLS
  SELECT string_agg(c.relname, ', ') INTO v_faltando
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'aba_treatment' AND c.relkind = 'r'
    AND has_table_privilege('authenticated', c.oid, 'TRUNCATE');
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'authenticated recebeu TRUNCATE em: %', v_faltando;
  END IF;

  -- (g) o módulo está no catálogo, com o rótulo da decisão D-V1
  IF NOT EXISTS (SELECT 1 FROM access.modules WHERE key = 'treatment' AND label = 'Planos') THEN
    RAISE EXCEPTION 'access.modules não tem treatment com o rótulo "Planos" (D-V1).';
  END IF;

  -- (h) toda conta existente tem as seis fases
  SELECT count(*) INTO v_n
  FROM public.accounts a
  WHERE (SELECT count(*) FROM aba_treatment.fases f WHERE f.account_id = a.id) <> 6;
  IF v_n > 0 THEN
    RAISE EXCEPTION '% conta(s) sem as seis fases padrão.', v_n;
  END IF;
END $$;

COMMENT ON SCHEMA aba_treatment IS
  'Plano de tratamento (Subetapa 03.8). Matriz: fase clínica na linha, opção concorrente na coluna, diagnóstico atravessando as colunas e procedimento dentro de uma delas. Sem preço, sem contrato, sem fatura — isso é a 03.8.a. Acesso por aba_treatment.pode_planejar(): alcance clínico de aba_health E interruptor do módulo treatment.';
