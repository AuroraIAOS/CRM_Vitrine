-- =====================================================================
-- 047 — Leitura de plano com log obrigatório, e o rótulo "Plano"
--       (Subetapa 03.8, fechamento das duas divergências)
--
-- DUAS ORDENS DE MAX, DE 2026-09-04, e a segunda é a que importa:
--
--   1. O rótulo do módulo passa a ser **"Plano"**, no singular, para
--      padronizar com o vocabulário do produto (`docs/02` §13.1, onde os
--      cinco termos são singulares: procedimento, pacote, plano, nível,
--      convênio). A `045` gravou "Planos"; aqui vira "Plano".
--
--   2. **Ler um plano passa a deixar rastro, como ler um prontuário.**
--      A 03.8 entregou o schema com o alcance clínico correto e reportou,
--      como pendência, que a leitura não gerava linha em
--      `aba_health.log_acesso`. Max recusou a pendência: *"tudo o que se
--      referir ao schema aba_health deve ser resolvido de forma segura e
--      sem deixar para depois"*. Esta migration fecha isso.
--
-- ============================================================
-- POR QUE A PENDÊNCIA ERA UM DEFEITO, E NÃO UMA FALTA DE ACABAMENTO
-- ============================================================
-- A linha de `aba_treatment.procedimentos_plano` carrega **dente e face**
-- — dado de saúde. A 03.8 acertou em fazer o ALCANCE ser o de
-- `aba_health` (`pode_planejar` chama `pode_acessar`), e parou aí. Mas o
-- regime de `aba_health` tem DUAS metades, e a migration `053` do Maximus
-- existe justamente porque a primeira sozinha não basta:
--
--   · a política diz QUEM pode ler;
--   · a função de leitura diz QUE ALGUÉM LEU.
--
-- Política autoriza e **não registra** (`instrucoes.md` §6). Sem a
-- segunda metade, o relatório de "Ações dos usuários" da Subetapa 03.5
-- mostraria quem abriu prontuário e **não** mostraria quem abriu plano —
-- e quem lesse o relatório interpretaria a ausência como "ninguém
-- abriu". Falha silenciosa em trilha de auditoria é pior que trilha
-- nenhuma, porque a trilha incompleta é lida como completa.
--
-- ============================================================
-- O PORTE É LITERAL (`CLAUDE.md` §14) — três peças, as três de aba_health
-- ============================================================
-- 1. **Revogação de SELECT por coluna.** Medido em `aba_health.evolucoes`
--    antes de decidir: `authenticated` enxerga `id`, `cliente_id`,
--    `profissional_id`, `travada`, `agendamento_id`, `adendo_de_id` e os
--    carimbos — e **não** enxerga `avaliacao`, `notas_procedimento`,
--    `resultado`, `proximos_passos`, `anexos`, `marcacoes`, `mapa_tipo`.
--    A linha é essa: metadado fica legível para a aplicação listar e
--    juntar; **conteúdo clínico só sai pela função que registra**. Sem a
--    revogação, a função de leitura seria um caminho entre outros, e
--    quem quisesse ler sem deixar rastro bastaria consultar a tabela.
-- 2. **Função de leitura `SECURITY DEFINER` que loga antes de devolver**,
--    com a fronteira de conta REAFIRMADA no filtro — `SECURITY DEFINER`
--    não passa por RLS, e é por isso que `ler_evolucoes` resolve o
--    `account_id` do perfil do chamador e o usa explicitamente.
-- 3. **Gatilho de escrita**, porque `aba_health` aprendeu com a migration
--    `070` do Maximus que o log cobria a leitura e não cobria a escrita.
--    Repetir metade do porte seria repetir o defeito que ele corrigiu.
--
-- ============================================================
-- AUTORIZAÇÃO NEGADA DEVOLVE CONJUNTO VAZIO, NUNCA EXCEÇÃO
-- ============================================================
-- Idêntico ao que a RLS já faria, e idêntico a `ler_evolucoes`. Erro
-- explícito confirmaria a existência do paciente a quem não pode
-- enxergá-lo — e, como nada é lido, nada é logado. Log a mais aqui seria
-- log mentindo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §1 — O rótulo, no singular (ordem de Max, 2026-09-04)
-- ---------------------------------------------------------------------
UPDATE access.modules SET label = 'Plano' WHERE key = 'treatment';

-- ---------------------------------------------------------------------
-- §2 — `plano` no CHECK de `tipo_registro`
--
-- Por ADIÇÃO, e o CHECK é encontrado POR CATÁLOGO: `pg_get_constraintdef`
-- reescreve `CHECK (col IN (...))` como `= ANY (ARRAY[...])`, então
-- procurar pelo texto original não acha (`instrucoes.md` §5).
--
-- Quem filtrava pelo conjunto antigo (mesma §5, "estado novo num CHECK
-- exige revisar quem filtrava pelo estado antigo"): os dois consumidores
-- são `crm/src/features/health/api.ts` (`useLogAcesso`) e
-- `crm/src/features/settings/api.ts` (relatório da 03.5). Nenhum dos dois
-- tem lista fechada de tipos — os dois exibem o valor como texto, então o
-- tipo novo aparece sem mudança de código. Conferido, não suposto.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_nome TEXT;
BEGIN
  SELECT con.conname INTO v_nome
  FROM pg_constraint con
  WHERE con.conrelid = 'aba_health.log_acesso'::regclass
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%tipo_registro%'
  LIMIT 1;

  IF v_nome IS NOT NULL THEN
    EXECUTE format('ALTER TABLE aba_health.log_acesso DROP CONSTRAINT %I', v_nome);
  END IF;

  ALTER TABLE aba_health.log_acesso
    ADD CONSTRAINT log_acesso_tipo_registro_check
    CHECK (tipo_registro IN ('prontuario','anamnese','evolucao','consentimento','plano'));
END $$;

-- ---------------------------------------------------------------------
-- §3 — Revogação de SELECT por coluna
--
-- A ORDEM IMPORTA e é a lição da 01.3: `GRANT` amplo DEPOIS de um
-- `REVOKE` por coluna desfaz a revogação em silêncio. O `GRANT` amplo
-- desta tabela foi emitido na `045`; aqui só se revoga. Se um dia esta
-- migration for reordenada para antes da `045`, a revogação evapora sem
-- erro nenhum — por isso a §6 confere o resultado no catálogo.
--
-- O QUE CONTINUA LEGÍVEL, e por quê: chave, chave estrangeira, estado,
-- carimbo. É o que a aplicação precisa para saber que existe um plano,
-- quantas opções ele tem e em que estado está cada célula — sem revelar
-- ONDE, no corpo do paciente, o trabalho acontece.
--
-- O QUE SÓ SAI PELA FUNÇÃO: `dente`, `faces`, e todo texto livre
-- (`titulo`, `observacao`, `descricao`). Texto livre entra na lista
-- porque é onde um profissional escreve o que não coube em coluna — e é
-- exatamente por isso que `aba_health` revogou `avaliacao` e
-- `notas_procedimento` em vez de confiar que ninguém escreveria dado
-- sensível ali.
-- ---------------------------------------------------------------------
-- ============================================================
-- REVOGA A TABELA E RECONCEDE A LISTA QUE FICA — nunca `REVOKE SELECT
-- (coluna)` sozinho.
--
-- ESTA MIGRATION NASCEU ERRADA E A PRÓPRIA §6 A RECUSOU. A primeira
-- versão fazia `REVOKE SELECT (titulo, observacao) ON planos FROM
-- authenticated` e as oito colunas continuaram legíveis: **privilégio de
-- TABELA cobre todas as colunas**, e revogar por coluna enquanto o
-- `GRANT SELECT` de tabela ainda existe não dá erro, não protege nada e
-- não aparece em lugar nenhum. A `045` concedeu `SELECT` de tabela; era
-- ele que precisava sair primeiro.
--
-- A lição já estava escrita — no cabeçalho de
-- `013_aba_health.sql`, que a herdou da migration `053` do Maximus. Ela
-- foi relida DEPOIS de o defeito ser reproduzido aqui. É o argumento mais
-- forte a favor de verificação que recusa a migration: ela pegou, na
-- primeira execução, o que a leitura prévia da fonte não pegou.
--
-- A LISTA É DE PERMISSÃO, NÃO DE NEGAÇÃO, e a direção importa: coluna
-- nova nasce ILEGÍVEL até alguém decidir o contrário. Numa tabela que
-- guarda dente e face, a falha certa é a tela quebrar pedindo permissão,
-- nunca a coluna vazar por ter sido esquecida.
--
-- E a revogação NÃO pode ser de tabela sem reconceder: em Postgres,
-- `UPDATE ... WHERE id = $1` exige `SELECT` nas colunas que ele lê,
-- inclusive as do `WHERE`. Sem a reconcessão, toda escrita quebraria.
-- ============================================================
DO $$
DECLARE
  r RECORD;
  v_cols TEXT;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('planos'::TEXT, ARRAY['id','account_id','cliente_id','profissional_id','criado_em','atualizado_em']::TEXT[]),
      ('diagnosticos', ARRAY['id','account_id','plano_id','criado_em','atualizado_em']),
      ('procedimentos_plano', ARRAY['id','account_id','plano_id','opcao_id','fase_id',
                                    'procedimento_id','diagnostico_id','estado','consentimento_id',
                                    'recusado_em','recusado_por','executado_em','executado_por',
                                    'criado_em','atualizado_em'])
    ) AS x(tabela, manter)
  LOOP
    EXECUTE format('REVOKE SELECT ON aba_treatment.%I FROM authenticated', r.tabela);

    SELECT string_agg(format('%I', c.column_name), ', ')
      INTO v_cols
    FROM information_schema.columns c
    WHERE c.table_schema = 'aba_treatment'
      AND c.table_name = r.tabela
      AND c.column_name = ANY (r.manter);

    IF v_cols IS NOT NULL THEN
      EXECUTE format('GRANT SELECT (%s) ON aba_treatment.%I TO authenticated', v_cols, r.tabela);
    END IF;
  END LOOP;
END $$;

-- `anon` não tinha nada e continua sem nada — a `045` já o revogou da
-- tabela inteira. Repetido aqui porque privilégio de coluna e privilégio
-- de tabela são camadas independentes, e a única forma de saber é medir
-- (a §6 mede).
REVOKE ALL ON aba_treatment.planos              FROM anon;
REVOKE ALL ON aba_treatment.diagnosticos        FROM anon;
REVOKE ALL ON aba_treatment.procedimentos_plano FROM anon;

-- ---------------------------------------------------------------------
-- §4 — `aba_treatment.ler_planos(cliente_id)` — a única porta de leitura
--
-- UMA LINHA POR PLANO, com a matriz em `jsonb`. É o formato que espelha
-- `ler_evolucoes` no que importa para a auditoria: **uma leitura, uma
-- linha de log**. Devolver a matriz achatada (uma linha por célula)
-- geraria N linhas de log para a mesma abertura de tela, e um log que
-- conta cliques em vez de leituras é um log que ninguém consegue ler.
--
-- Os `jsonb` não são conveniência de front: são o que permite trazer, na
-- mesma leitura registrada, as três coisas que a matriz é — as opções
-- (coluna), os diagnósticos (que atravessam as colunas, inclusive os da
-- FILA DE TRABALHO, sem procedimento nenhum) e as células.
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
               'procedimento_id', pp.procedimento_id, 'diagnostico_id', pp.diagnostico_id,
               'dente', pp.dente, 'faces', pp.faces, 'estado', pp.estado,
               'consentimento_id', pp.consentimento_id,
               'recusado_em', pp.recusado_em, 'recusado_por', pp.recusado_por,
               'executado_em', pp.executado_em, 'executado_por', pp.executado_por,
               'observacao', pp.observacao)
             ORDER BY pp.criado_em)
      FROM aba_treatment.procedimentos_plano pp WHERE pp.plano_id = p.id
    ), '[]'::jsonb)
  FROM aba_treatment.planos p
  WHERE p.cliente_id = p_cliente_id AND p.account_id = v_account_id
  ORDER BY p.criado_em;
END;
$$;

COMMENT ON FUNCTION aba_treatment.ler_planos(UUID) IS
  'Única porta de leitura do conteúdo clínico do plano (dente, face e texto livre). Registra em aba_health.log_acesso com tipo_registro = plano, uma linha por plano lido, ANTES de devolver. Autorização negada devolve conjunto vazio e não loga. Porte literal de aba_health.ler_evolucoes (Maximus 053).';

ALTER FUNCTION aba_treatment.ler_planos(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_treatment.ler_planos(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_treatment.ler_planos(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION aba_treatment.ler_planos(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §5 — Gatilho de escrita
--
-- A migration `070` do Maximus existe porque o log clínico dele cobria a
-- LEITURA e não cobria a ESCRITA. Portar só a metade da leitura seria
-- reintroduzir, num schema novo, o defeito que aquela migration corrigiu
-- num antigo — e é a espécie de erro que só aparece quando alguém
-- pergunta "quem mudou este plano?" e não há resposta.
--
-- `aba_treatment.fases` fica de fora, pelo mesmo motivo que
-- `formularios_anamnese` ficou em `aba_health`: é catálogo DA CONTA, não
-- dado de um paciente, e `log_acesso.cliente_id` é `NOT NULL`.
--
-- O cliente é resolvido pelo plano nas três tabelas filhas — a coluna não
-- é denormalizada (a 03.8 decidiu assim de propósito), então quem sabe o
-- paciente é o `plano_id`.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_treatment.registrar_escrita_plano()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_cliente_id UUID;
BEGIN
  -- Sem sujeito não há o que registrar, e a policy de `log_acesso` exige
  -- `usuario_ator_id = auth.uid()`. Escrita de servidor (`service_role`,
  -- rotina, semente) não é atribuível — mesma decisão, medida e aceita,
  -- de `aba_health.registrar_escrita_clinica`. Gatilho AFTER: o retorno é
  -- ignorado e a escrita já aconteceu.
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'planos' THEN
    v_cliente_id := NEW.cliente_id;
  ELSE
    SELECT p.cliente_id INTO v_cliente_id
    FROM aba_treatment.planos p WHERE p.id = NEW.plano_id;
  END IF;

  IF v_cliente_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO aba_health.log_acesso
    (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
  VALUES (
    NEW.account_id,
    v_user_id,
    v_cliente_id,
    'plano',
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN 'criacao' ELSE 'atualizacao' END,
    jsonb_build_object('via', 'trigger', 'tabela', TG_TABLE_NAME)
  );

  RETURN NULL;
END;
$$;

ALTER FUNCTION aba_treatment.registrar_escrita_plano() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_treatment.registrar_escrita_plano() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_treatment.registrar_escrita_plano() FROM anon;
REVOKE ALL ON FUNCTION aba_treatment.registrar_escrita_plano() FROM authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['planos','opcoes','diagnosticos','procedimentos_plano'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS registrar_escrita_plano ON aba_treatment.%I', t);
    EXECUTE format(
      'CREATE TRIGGER registrar_escrita_plano AFTER INSERT OR UPDATE ON aba_treatment.%I
         FOR EACH ROW EXECUTE FUNCTION aba_treatment.registrar_escrita_plano()', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- §6 — VERIFICAÇÕES QUE RECUSAM A MIGRATION
--
-- A revogação por coluna é invisível no diff e some sozinha se alguém
-- reemitir um `GRANT` amplo depois. Só o catálogo responde.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_sobra TEXT;
  v_falta TEXT;
BEGIN
  -- (a) nenhuma coluna clínica de aba_treatment legível por authenticated
  SELECT string_agg(x.tab || '.' || x.col, ', ') INTO v_sobra
  FROM (VALUES
    ('planos','titulo'), ('planos','observacao'),
    ('diagnosticos','dente'), ('diagnosticos','faces'), ('diagnosticos','descricao'),
    ('procedimentos_plano','dente'), ('procedimentos_plano','faces'), ('procedimentos_plano','observacao')
  ) AS x(tab, col)
  WHERE has_column_privilege('authenticated', ('aba_treatment.' || x.tab)::regclass, x.col, 'SELECT');
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'Coluna clínica de aba_treatment continua legível por authenticated: %', v_sobra;
  END IF;

  -- (b) o metadado CONTINUA legível — a revogação não pode ter passado do
  -- ponto. Uma revogação larga demais quebraria a aplicação de um jeito
  -- que só apareceria na tela, e esta é a única linha que a impede.
  SELECT string_agg(x.tab || '.' || x.col, ', ') INTO v_falta
  FROM (VALUES
    ('planos','id'), ('planos','cliente_id'), ('planos','account_id'),
    ('procedimentos_plano','estado'), ('procedimentos_plano','opcao_id'),
    ('procedimentos_plano','fase_id'), ('diagnosticos','plano_id')
  ) AS x(tab, col)
  WHERE NOT has_column_privilege('authenticated', ('aba_treatment.' || x.tab)::regclass, x.col, 'SELECT');
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Metadado de aba_treatment deixou de ser legível: %', v_falta;
  END IF;

  -- (c) a porta de leitura existe, é SECURITY DEFINER e não é de anon
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'aba_treatment' AND p.proname = 'ler_planos' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'aba_treatment.ler_planos ausente ou não é SECURITY DEFINER.';
  END IF;
  IF has_function_privilege('anon', 'aba_treatment.ler_planos(uuid)', 'EXECUTE')
     OR has_function_privilege('public', 'aba_treatment.ler_planos(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'aba_treatment.ler_planos executável por anon/PUBLIC.';
  END IF;

  -- (d) o gatilho de escrita está nas quatro tabelas de dado de paciente
  SELECT string_agg(t, ', ') INTO v_falta
  FROM unnest(ARRAY['planos','opcoes','diagnosticos','procedimentos_plano']) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
    WHERE tg.tgrelid = ('aba_treatment.' || t)::regclass
      AND tg.tgname = 'registrar_escrita_plano' AND NOT tg.tgisinternal);
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Gatilho de log de escrita ausente em: %', v_falta;
  END IF;

  -- (e) o CHECK aceita o tipo novo
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'aba_health.log_acesso'::regclass
      AND conname = 'log_acesso_tipo_registro_check'
      AND pg_get_constraintdef(oid) LIKE '%plano%'
  ) THEN
    RAISE EXCEPTION 'log_acesso.tipo_registro não aceita o valor plano.';
  END IF;

  -- (f) o rótulo, no singular
  IF NOT EXISTS (SELECT 1 FROM access.modules WHERE key = 'treatment' AND label = 'Plano') THEN
    RAISE EXCEPTION 'access.modules não tem treatment com o rótulo "Plano".';
  END IF;
END $$;
