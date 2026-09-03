-- ============================================================
-- 040_agenda_sala_de_espera_marcadores.sql — Subetapa 03.4
--
-- Três itens do MVP odontológico sobre `aba_scheduling`, nenhum deles
-- schema novo:
--
-- Item 4 — `sala_de_espera` entra no CHECK de `agendamentos.status`.
-- Fica ENTRE `confirmado` e `em_andamento` no fluxo operacional: o
-- "Check-in" do Balcão (recepção) marca chegada física, e é isso que a
-- tela `1o` chamava de "confirmado" até aqui — conflação que esta
-- subetapa corrige (ver `crm/src/features/scheduling/BalcaoPage.tsx`).
-- Não muda a restrição de exclusão por intervalo
-- (`agendamentos_profissional_sem_sobreposicao` /
-- `agendamentos_recurso_sem_sobreposicao`, ambas em 009): elas só
-- liberam `cancelado`/`nao_compareceu` da checagem de sobreposição, e
-- `sala_de_espera` continua ocupando agenda — está certo assim, quem
-- está fisicamente esperando ocupa o horário tanto quanto quem está em
-- atendimento. Pelo mesmo motivo, não muda
-- `verificar_expediente_agendamento()` (só isenta cancelado/não
-- compareceu) nem `enfileirar_lembrete()` (só enfileira em
-- INSERT com agendado/confirmado — a transição para sala_de_espera
-- acontece por UPDATE, então não reenfileira, e é isso que se quer).
--
-- Item 9 — marcador colorido no PRÓPRIO agendamento (tabela nova,
-- `aba_scheduling.marcadores`), distinto da cor de profissional/recurso
-- que já existe desde a 009. É rótulo definido pela clínica (ex.:
-- "Convênio X", "Primeira consulta", "Urgência"), não um enum fixo —
-- por isso vira tabela, não CHECK. `agendamentos.marcador_id` é
-- OPCIONAL (nem todo atendimento carrega marcador) e a FK é composta
-- por `account_id` desde a origem (handoffs/instrucoes.md §7,
-- "candidatos a promoção" — toda FK nova entre tabelas de inquilino
-- nasce composta, não é retrofit depois). `ON DELETE SET NULL
-- (marcador_id)` — sintaxe de coluna do PG15+, porque `SET NULL` sem
-- especificar coluna anularia `account_id` também, que é `NOT NULL`
-- (mesma lição da migration 035).
--
-- Item 11 — controle de cadeiras (recursos) e ocupação da agenda: SEM
-- tabela nova, `recursos` + `horarios_recursos` já existem desde a 009
-- e nunca tiveram tela. Resolvido só em `crm/src/features/scheduling/`
-- (hooks + UI), nada aqui.
--
-- Hardening no mesmo padrão de toda migration deste projeto: RLS
-- explícita, GRANT estreito (nunca TRUNCATE), REVOKE EXECUTE FROM
-- PUBLIC/anon nas funções tocadas. `set_updated_at()` já existe (009),
-- reaproveitada sem recriar.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

-- ------------------------------------------------------------
-- Item 4 — sala_de_espera no CHECK de status.
--
-- O nome do constraint original (definido inline em 009, sem CONSTRAINT
-- nomeado) é o auto-gerado do Postgres — buscado por catálogo em vez de
-- suposto, porque `pg_get_constraintdef` costuma reescrever `IN (...)`
-- como `= ANY (ARRAY[...])`, e o nome literal não é garantido entre
-- versões. Recriado com nome explícito para a próxima migration que
-- precisar dele não repetir esta busca.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'aba_scheduling.agendamentos'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE aba_scheduling.agendamentos DROP CONSTRAINT %I', v_conname);
  END IF;

  ALTER TABLE aba_scheduling.agendamentos
    ADD CONSTRAINT agendamentos_status_check
    CHECK (status IN ('agendado','confirmado','sala_de_espera','em_andamento','concluido','nao_compareceu','cancelado'));
END $$;

-- ------------------------------------------------------------
-- Item 9 — marcadores (rótulo colorido definido pela clínica).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aba_scheduling.marcadores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  cor            TEXT NOT NULL DEFAULT '#3b82f6',
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marcadores_account ON aba_scheduling.marcadores(account_id);

-- Pré-requisito da FK composta abaixo (handoffs/instrucoes.md §7).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marcadores_id_account_id_key'
      AND conrelid = 'aba_scheduling.marcadores'::regclass
  ) THEN
    ALTER TABLE aba_scheduling.marcadores ADD CONSTRAINT marcadores_id_account_id_key UNIQUE (id, account_id);
  END IF;
END $$;

ALTER TABLE aba_scheduling.marcadores ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_scheduling.marcadores;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_scheduling.marcadores
  FOR EACH ROW EXECUTE FUNCTION aba_scheduling.set_updated_at();

DROP POLICY IF EXISTS marcadores_select ON aba_scheduling.marcadores;
CREATE POLICY marcadores_select ON aba_scheduling.marcadores FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('scheduling', 'read'));
DROP POLICY IF EXISTS marcadores_insert ON aba_scheduling.marcadores;
CREATE POLICY marcadores_insert ON aba_scheduling.marcadores FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'create'));
DROP POLICY IF EXISTS marcadores_update ON aba_scheduling.marcadores;
CREATE POLICY marcadores_update ON aba_scheduling.marcadores FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'update'));
DROP POLICY IF EXISTS marcadores_delete ON aba_scheduling.marcadores;
CREATE POLICY marcadores_delete ON aba_scheduling.marcadores FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('scheduling', 'delete'));

GRANT SELECT, INSERT, UPDATE, DELETE ON aba_scheduling.marcadores TO authenticated;
GRANT ALL ON aba_scheduling.marcadores TO service_role;
-- `ALTER DEFAULT PRIVILEGES` de 009 já cobre tabela nova neste schema
-- criada pelo mesmo role — GRANT explícito acima é reforço, não
-- substituto (mesmo padrão de 032_preferencias_de_conta.sql).

-- ------------------------------------------------------------
-- `agendamentos.marcador_id` — opcional, FK composta por account_id
-- desde a origem.
-- ------------------------------------------------------------
ALTER TABLE aba_scheduling.agendamentos ADD COLUMN IF NOT EXISTS marcador_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agendamentos_marcador_id_account_id_fkey'
      AND conrelid = 'aba_scheduling.agendamentos'::regclass
  ) THEN
    ALTER TABLE aba_scheduling.agendamentos
      ADD CONSTRAINT agendamentos_marcador_id_account_id_fkey
      FOREIGN KEY (marcador_id, account_id)
      REFERENCES aba_scheduling.marcadores (id, account_id)
      ON DELETE SET NULL (marcador_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agendamentos_marcador
  ON aba_scheduling.agendamentos(marcador_id) WHERE marcador_id IS NOT NULL;
