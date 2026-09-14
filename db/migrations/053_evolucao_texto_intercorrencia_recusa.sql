-- =====================================================================
-- 053 — A sessão clínica escreve: intercorrência com lugar próprio e a
--       recusa do paciente em assinar registrada como fato
--       (Subetapa 03.7.b)
--
-- O DEFEITO QUE A SUBETAPA CORRIGE NÃO PEDE DDL. `aba_health.evolucoes`
-- tem `avaliacao`, `notas_procedimento`, `resultado` e `proximos_passos`
-- desde a 013, com `SELECT` revogado por coluna, leitura só por
-- `ler_evolucoes()` e escrita registrada por gatilho — medido no catálogo
-- de produção antes desta migration. O que faltava era a TELA oferecer os
-- campos. Esta migration traz só as duas peças que o modelo não tinha,
-- decididas por Max à pergunta desta subetapa (2026-09-14), registradas
-- em `docs/08_CAMINHO_FELIZ.md` §1:
--
--   · **D-F15 — a intercorrência tem COLUNA PRÓPRIA**, `intercorrencia`.
--     O bloco dizia "lugar próprio" e, ao mesmo tempo, "nenhuma coluna de
--     texto nova". As quatro colunas que existem são avaliação, conduta,
--     resultado e próximos passos: nenhuma é evento adverso. Guardar a
--     intercorrência dentro de `resultado` misturaria desfecho com
--     evento, e um relatório não distinguiria os dois. É a ÚNICA coluna
--     de texto nova, e nasce com o regime das outras quatro.
--
--   · **D-F16 — a recusa se registra SOBRE a evolução travada, uma vez.**
--     O paciente recusa o texto que ouviu, e esse texto só fica final
--     quando o profissional assina. Uma recusa registrada antes do fecho
--     se referiria a um texto que ainda pode mudar. Por isso o gatilho
--     `impedir_alteracao_evolucao_travada` ganha UMA exceção, estreita:
--     preencher os três campos da recusa, uma única vez, sem mudar nenhuma
--     outra coluna. E quem escreve esses campos é só a função
--     `registrar_recusa_assinatura` — `authenticated` perde `INSERT` e
--     `UPDATE` neles. A mesma porta serve à recusa remota da 03.12.
--
--   · **D-F17 — a aceitação do paciente (assinou a evolução) fica para a
--     03.12**, junto com o canal por link. Declarado: até lá, evolução
--     travada sem recusa não distingue "o paciente assinou" de "ninguém
--     perguntou". Reportado no Status, não implementado.
--
-- ============================================================
-- A ARMADILHA DA REVOGAÇÃO INÓCUA — já paga na 047
-- ============================================================
-- Medido em produção: `authenticated` tem `INSERT` e `UPDATE` na TABELA
-- `evolucoes` (o `GRANT` amplo da 013). Revogar `UPDATE (coluna)` com o
-- privilégio de tabela de pé não dá erro e não protege nada. Esta
-- migration troca o privilégio de tabela por concessão COLUNA A COLUNA,
-- montada pelo catálogo, com as três colunas da recusa de fora. A
-- verificação (b) da §5 recusa a migration se o privilégio de tabela
-- voltar ou se uma coluna da recusa ficar escrevível.
--
-- Nenhuma linha existente muda: as colunas novas nascem nulas, e as 13
-- evoluções de produção (9 travadas) continuam válidas nos CHECKs novos.
--
-- Idempotente — seguro rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §1 — As colunas novas
-- ---------------------------------------------------------------------
ALTER TABLE aba_health.evolucoes
  ADD COLUMN IF NOT EXISTS intercorrencia            TEXT,
  ADD COLUMN IF NOT EXISTS recusa_assinatura_em      TIMESTAMPTZ,
  -- Sem ação de exclusão (NO ACTION), no molde de `recusado_por` (045) e
  -- de `log_acesso.usuario_ator_id` (013): a recusa é fato jurídico, e
  -- apagar o usuário que a registrou não pode anular o autor dela. Um
  -- `ON DELETE SET NULL` violaria o CHECK da §1 e, pior, deixaria recusa
  -- sem autor se o CHECK um dia afrouxasse.
  ADD COLUMN IF NOT EXISTS recusa_assinatura_por     UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS recusa_assinatura_motivo  TEXT;

COMMENT ON COLUMN aba_health.evolucoes.intercorrencia IS
  'Intercorrência da sessão (evento adverso ou imprevisto), com lugar próprio por D-F15. Dado clínico — sem SELECT direto, só por aba_health.ler_evolucoes().';
COMMENT ON COLUMN aba_health.evolucoes.recusa_assinatura_em IS
  'Quando o paciente recusou assinar a evolução travada (D-F16). Escrita só por aba_health.registrar_recusa_assinatura(); leitura só por ler_evolucoes().';
COMMENT ON COLUMN aba_health.evolucoes.recusa_assinatura_por IS
  'Quem registrou a recusa do paciente — auth.uid() da sessão que chamou registrar_recusa_assinatura().';
COMMENT ON COLUMN aba_health.evolucoes.recusa_assinatura_motivo IS
  'Motivo da recusa, como o paciente o deu (ou "não informou"). Texto livre de dado de saúde — sem SELECT direto.';

-- OS TRÊS JUNTOS OU NENHUM — a regra que a 03.8 fixou para
-- `recusado_em`/`recusado_por`, com o motivo entrando no par. Motivo só
-- de espaços não conta, pela mesma razão da 034 (`btrim`): um campo
-- preenchido com nada tem aparência de registro e conteúdo de lacuna.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'aba_health.evolucoes'::regclass AND conname = 'evolucoes_recusa_completa') THEN
    ALTER TABLE aba_health.evolucoes
      ADD CONSTRAINT evolucoes_recusa_completa CHECK (
        (recusa_assinatura_em IS NULL AND recusa_assinatura_por IS NULL AND recusa_assinatura_motivo IS NULL)
        OR (recusa_assinatura_em IS NOT NULL AND recusa_assinatura_por IS NOT NULL
            AND btrim(coalesce(recusa_assinatura_motivo, '')) <> '')
      );
  END IF;

  -- D-F16 como forma do dado, e não só como `if` da função: recusa só
  -- existe em evolução travada. Com o gatilho da 013, isto também impede
  -- que um caminho de servidor destrave uma evolução recusada.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'aba_health.evolucoes'::regclass AND conname = 'evolucoes_recusa_so_travada') THEN
    ALTER TABLE aba_health.evolucoes
      ADD CONSTRAINT evolucoes_recusa_so_travada CHECK (recusa_assinatura_em IS NULL OR travada);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- §2 — Privilégio: a intercorrência como as outras quatro, a recusa só
-- pela função
-- ---------------------------------------------------------------------
-- `intercorrencia` NÃO recebe `SELECT`: coluna acrescentada não herda o
-- `GRANT SELECT` por coluna da 013 (`instrucoes.md` §5), e é isso que se
-- quer. O que muda aqui é INSERT/UPDATE: sai o privilégio de tabela,
-- entra a concessão por coluna, lida do catálogo para que nenhuma coluna
-- usada pela tela (texto, mapa, anexos, `travada`) fique de fora por
-- esquecimento de lista escrita à mão.
DO $$
DECLARE
  v_cols TEXT;
BEGIN
  REVOKE INSERT, UPDATE ON aba_health.evolucoes FROM authenticated;

  SELECT string_agg(format('%I', c.column_name), ', ' ORDER BY c.ordinal_position)
  INTO v_cols
  FROM information_schema.columns c
  WHERE c.table_schema = 'aba_health'
    AND c.table_name = 'evolucoes'
    AND c.column_name NOT IN ('recusa_assinatura_em', 'recusa_assinatura_por', 'recusa_assinatura_motivo');

  EXECUTE format('GRANT INSERT (%s), UPDATE (%s) ON aba_health.evolucoes TO authenticated', v_cols, v_cols);

  -- Revogação por coluna AGORA tem efeito (não há privilégio de tabela);
  -- explícita para a reaplicação da migration não depender do estado
  -- anterior.
  REVOKE INSERT (recusa_assinatura_em, recusa_assinatura_por, recusa_assinatura_motivo),
         UPDATE (recusa_assinatura_em, recusa_assinatura_por, recusa_assinatura_motivo),
         SELECT (intercorrencia, recusa_assinatura_em, recusa_assinatura_por, recusa_assinatura_motivo)
    ON aba_health.evolucoes FROM authenticated;
END $$;

-- ---------------------------------------------------------------------
-- §3 — A exceção única do gatilho de trava (D-F16)
-- ---------------------------------------------------------------------
-- Continua recusando QUALQUER alteração em evolução travada, com a mesma
-- mensagem e o mesmo `23514` da 013, exceto um caso: a recusa ainda não
-- registrada passa a registrada, e nada mais na linha muda.
--
-- A comparação é da linha INTEIRA menos as três colunas e `atualizado_em`
-- (que este próprio gatilho carimba). `evolucoes` não tem coluna gerada —
-- medido no catálogo; se um dia ganhar, ela precisa sair desta comparação,
-- porque num gatilho `BEFORE` a coluna gerada vem nula em `NEW` e as duas
-- linhas nunca bateriam (lição da 03.8.b, `instrucoes.md` §5).
--
-- A exceção sozinha abriria a recusa a qualquer `UPDATE` com alcance
-- clínico. O que a fecha é a §2: `authenticated` não tem privilégio nas
-- três colunas, e o `UPDATE` direto morre em `42501` antes de chegar aqui.
-- Os dois cadeados são independentes, e cada um é provado sozinho pela
-- suíte.
CREATE OR REPLACE FUNCTION aba_health.impedir_alteracao_evolucao_travada()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF OLD.travada THEN
    IF OLD.recusa_assinatura_em IS NULL
       AND NEW.recusa_assinatura_em IS NOT NULL
       AND NEW.travada
       AND (to_jsonb(NEW) - 'recusa_assinatura_em' - 'recusa_assinatura_por' - 'recusa_assinatura_motivo' - 'atualizado_em')
         = (to_jsonb(OLD) - 'recusa_assinatura_em' - 'recusa_assinatura_por' - 'recusa_assinatura_motivo' - 'atualizado_em')
    THEN
      NEW.atualizado_em = NOW();
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'Evolução travada não aceita alteração — registre um adendo em nova linha'
      USING ERRCODE = '23514';
  END IF;
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

-- `CREATE OR REPLACE` preserva privilégio, mas a reemissão é explícita
-- (lição da 03.6.b: não depender de o nome não ter mudado).
REVOKE ALL ON FUNCTION aba_health.impedir_alteracao_evolucao_travada() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.impedir_alteracao_evolucao_travada() FROM anon;
REVOKE ALL ON FUNCTION aba_health.impedir_alteracao_evolucao_travada() FROM authenticated;

-- ---------------------------------------------------------------------
-- §4 — `registrar_recusa_assinatura`: a única porta da recusa
-- ---------------------------------------------------------------------
-- SECURITY DEFINER porque escreve colunas que `authenticated` não pode
-- escrever. Por isso reafirma, à mão, tudo o que a RLS faria: a conta do
-- chamador no filtro e o alcance clínico de `atualizacao` sobre o
-- paciente da evolução (`instrucoes.md` §6: onde o definidor escreve, a
-- RLS não protege nada).
--
-- O log de escrita vem do gatilho `registrar_escrita_clinica` da 013
-- (AFTER UPDATE, com `auth.uid()` presente), como toda escrita clínica —
-- a função não abre um segundo caminho de log.
CREATE OR REPLACE FUNCTION aba_health.registrar_recusa_assinatura(
  p_evolucao_id UUID,
  p_motivo      TEXT
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ator       UUID := auth.uid();
  v_account_id UUID;
  v_cliente_id UUID;
  v_travada    BOOLEAN;
  v_recusa_em  TIMESTAMPTZ;
  v_agora      TIMESTAMPTZ := NOW();
BEGIN
  -- RECUSA EXIGE SESSÃO, e com mensagem própria. Sem isto, uma chamada
  -- por conexão de servidor gravaria `recusa_assinatura_por` nulo e o
  -- CHECK da §1 recusaria com o nome de uma restrição, que não explica
  -- nada a quem lê — a armadilha medida em `consentir_opcao` (045).
  -- Recusa sem autor não protege a clínica: o registro vale pelo QUEM e
  -- pelo QUANDO.
  IF v_ator IS NULL THEN
    RAISE EXCEPTION 'Registrar a recusa de assinatura exige sessão autenticada — a recusa precisa de autor.'
      USING ERRCODE = '42501';
  END IF;

  IF btrim(coalesce(p_motivo, '')) = '' THEN
    RAISE EXCEPTION 'Escreva o motivo da recusa — se o paciente não deu motivo, registre "não informou".'
      USING ERRCODE = '23514';
  END IF;

  SELECT account_id INTO v_account_id FROM public.profiles WHERE user_id = v_ator;

  SELECT e.cliente_id, e.travada, e.recusa_assinatura_em
    INTO v_cliente_id, v_travada, v_recusa_em
  FROM aba_health.evolucoes e
  WHERE e.id = p_evolucao_id
    AND e.account_id = v_account_id;

  -- Mesma resposta para "não existe" e "não é sua": distinguir as duas
  -- confirmaria a existência da evolução a quem não pode enxergá-la.
  IF v_cliente_id IS NULL OR NOT aba_health.pode_acessar(v_cliente_id, 'atualizacao') THEN
    RAISE EXCEPTION 'Evolução % não existe ou não está ao seu alcance.', p_evolucao_id
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_travada THEN
    RAISE EXCEPTION 'A recusa se registra sobre a evolução assinada — assine a sessão primeiro: o paciente recusa o texto final (D-F16).'
      USING ERRCODE = '23514';
  END IF;

  IF v_recusa_em IS NOT NULL THEN
    RAISE EXCEPTION 'A recusa desta evolução já foi registrada — o registro não se refaz nem se sobrescreve.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE aba_health.evolucoes
     SET recusa_assinatura_em     = v_agora,
         recusa_assinatura_por    = v_ator,
         recusa_assinatura_motivo = btrim(p_motivo)
   WHERE id = p_evolucao_id
     AND account_id = v_account_id
     AND recusa_assinatura_em IS NULL;

  RETURN v_agora;
END;
$$;

ALTER FUNCTION aba_health.registrar_recusa_assinatura(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.registrar_recusa_assinatura(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_health.registrar_recusa_assinatura(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION aba_health.registrar_recusa_assinatura(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION aba_health.registrar_recusa_assinatura(uuid, text) IS
  'Registra que o paciente recusou assinar a evolução travada (D-F16): data e autor gravados pelo banco, motivo obrigatório, uma única vez. Exige sessão. Única escrita permitida em evolução travada além do nada; o log vem do gatilho registrar_escrita_clinica.';

-- ---------------------------------------------------------------------
-- §5 — VERIFICAÇÕES QUE RECUSAM A MIGRATION
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_sobra TEXT;
BEGIN
  -- (a) o texto clínico novo e a recusa são ilegíveis por coluna
  SELECT string_agg(col, ', ') INTO v_sobra
  FROM unnest(ARRAY['intercorrencia','recusa_assinatura_em','recusa_assinatura_por','recusa_assinatura_motivo',
                    'avaliacao','notas_procedimento','resultado','proximos_passos','marcacoes','mapa_tipo']) col
  WHERE has_column_privilege('authenticated', 'aba_health.evolucoes', col, 'SELECT')
     OR has_column_privilege('anon', 'aba_health.evolucoes', col, 'SELECT');
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'Coluna clínica de evolucoes legível direto: % — o conteúdo só sai por ler_evolucoes.', v_sobra;
  END IF;

  -- (b) sem privilégio de TABELA para escrita (senão a revogação por
  -- coluna é inócua) e a recusa fora do alcance de escrita direta
  IF has_table_privilege('authenticated', 'aba_health.evolucoes', 'INSERT')
     OR has_table_privilege('authenticated', 'aba_health.evolucoes', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated voltou a ter INSERT/UPDATE na tabela evolucoes — a revogação por coluna ficaria inócua.';
  END IF;
  SELECT string_agg(col || ':' || priv, ', ') INTO v_sobra
  FROM unnest(ARRAY['recusa_assinatura_em','recusa_assinatura_por','recusa_assinatura_motivo']) col
  CROSS JOIN unnest(ARRAY['INSERT','UPDATE']) priv
  WHERE has_column_privilege('authenticated', 'aba_health.evolucoes', col, priv);
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'Recusa escrevível direto por authenticated (%) — ela só nasce pela função.', v_sobra;
  END IF;

  -- (c) a tela continua podendo escrever a sessão: nenhuma coluna que ela
  -- usa perdeu a escrita
  SELECT string_agg(col, ', ') INTO v_sobra
  FROM unnest(ARRAY['account_id','cliente_id','profissional_id','adendo_de_id','avaliacao','notas_procedimento',
                    'resultado','proximos_passos','intercorrencia','anexos','mapa_tipo','marcacoes','travada']) col
  WHERE NOT has_column_privilege('authenticated', 'aba_health.evolucoes', col, 'INSERT')
     OR NOT has_column_privilege('authenticated', 'aba_health.evolucoes', col, 'UPDATE');
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'Coluna da sessão perdeu a escrita para authenticated: %', v_sobra;
  END IF;

  -- (d) a função: executável por quem registra, nunca por PUBLIC/anon
  IF has_function_privilege('public', 'aba_health.registrar_recusa_assinatura(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'aba_health.registrar_recusa_assinatura(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'aba_health.registrar_recusa_assinatura(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Privilégio errado em registrar_recusa_assinatura.';
  END IF;
  IF has_function_privilege('authenticated', 'aba_health.impedir_alteracao_evolucao_travada()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Função de gatilho executável por authenticated.';
  END IF;

  -- (e) as regras estão penduradas: os dois CHECKs e os dois gatilhos
  SELECT string_agg(x, ', ') INTO v_sobra
  FROM unnest(ARRAY['evolucoes_recusa_completa','evolucoes_recusa_so_travada']) x
  WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'aba_health.evolucoes'::regclass AND conname = x);
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'CHECK ausente: %', v_sobra;
  END IF;
  SELECT string_agg(x, ', ') INTO v_sobra
  FROM unnest(ARRAY['impedir_alteracao_evolucao_travada','registrar_escrita_clinica']) x
  WHERE NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'aba_health.evolucoes'::regclass AND tgname = x AND NOT tgisinternal);
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'Gatilho ausente em evolucoes: %', v_sobra;
  END IF;

  -- (f) a exceção do gatilho é SÓ a da recusa: o corpo não pode ganhar
  -- outra saída antes do RAISE (um segundo `RETURN NEW` dentro do bloco
  -- de travada seria uma porta nova para alterar prontuário assinado)
  IF (SELECT count(*) FROM regexp_matches(
        pg_get_functiondef('aba_health.impedir_alteracao_evolucao_travada()'::regprocedure),
        'RETURN NEW', 'g')) <> 2 THEN
    RAISE EXCEPTION 'impedir_alteracao_evolucao_travada ganhou saída além da exceção da recusa.';
  END IF;

  -- (g) evolução com a coluna gerada quebraria a comparação da §3
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'aba_health.evolucoes'::regclass
             AND attnum > 0 AND attgenerated <> '') THEN
    RAISE EXCEPTION 'evolucoes tem coluna gerada — tire-a da comparação to_jsonb da §3.';
  END IF;
END $$;
