-- =====================================================================
-- 051 — A opção aceita pacote, o preço do pacote se resolve, e mexer em
--       dinheiro devolve o orçamento a rascunho (Subetapa 03.8.c)
--
-- Três decisões de Max e uma decisão desta subetapa, todas escritas aqui
-- antes de virarem código:
--
--   · **D-F1 (2026-09-06)** — a opção do plano aceita item heterogêneo.
--     "Lente de porcelana × lente acrílica" cabe em procedimentos; "combo de
--     clareamento × sessão avulsa" não cabe — o combo é um PACOTE, e
--     decompô-lo em procedimentos soltos perderia o preço promocional.
--
--   · **D-F6 (2026-09-13, Max, à pergunta desta subetapa)** — o arco da
--     opção tem DOIS braços: procedimento OU pacote. A D-F1 falava em
--     "procedimento, pacote ou plano", e a pergunta que a execução fez foi:
--     o que é um item PLANO dentro da opção de um plano? A opção já
--     pertence a um plano. Quando a 03.8.b copiar a opção aceita para o
--     contrato, `itens_contrato.plano_id` recebe o PRÓPRIO plano dono da
--     opção — sem plano dentro de plano, sem ciclo a vigiar e sem "preço de
--     plano" a inventar. O terceiro braço continua existindo, onde a D-V3 o
--     desenhou: no contrato.
--
--   · **D-F3 (2026-09-06) + D-F7 (2026-09-13, Max)** — o profissional
--     aprova o orçamento ANTES de ele ir ao paciente, e **o profissional é
--     quem vai executar**: o login por trás de `orcamentos.profissional_id`,
--     cujo tipo move o preço e que responde pelo número. Sem profissional
--     definido, não se aprova. **O `owner` não é exceção** — é comum ele não
--     ser dentista (D-V7), e aprovar preço clínico em nome de quem executa é
--     exatamente a vinculação sem saber que a D-F3 existe para impedir. Se a
--     recepção altera desconto, motivo, promoção, parcela, juros ou mora num
--     orçamento aprovado, **ele volta a rascunho** e exige nova aprovação.
--
--   · **O PREÇO DO PACOTE — decisão explícita desta subetapa, pedida pelo
--     plano ("medir antes de decidir e registrar a escolha na migration"):**
--
--       **O pacote sobe a MESMA escada do procedimento, e
--       `aba_catalog.pacotes.preco_total` é o último recurso dela — o
--       degrau `catalogo`, exatamente como `preco_base` é para o
--       procedimento.**
--
--     O que foi medido, em produção, antes de decidir: 4 pacotes e 2
--     tarifas, nenhuma de pacote (a tarifa só aceitava procedimento).
--     Hoje, portanto, todo pacote sai pelo `preco_total` — a decisão não
--     muda nenhum preço existente. Ela decide o que acontece quando alguém
--     quiser preço diferente, e as alternativas descartadas foram:
--
--       (x) "o `preco_total` sempre vence" — deixaria o pacote FORA do
--           convênio (D-F5), da cortesia individual e do tipo de
--           profissional. O combo de clareamento do conveniado sairia pelo
--           preço de balcão, e a única saída seria desconto manual por
--           orçamento — que é a negociação na cadeira que a alçada
--           financeira existe para tirar do dia a dia.
--       (y) "somar o preço resolvido de cada procedimento do pacote" —
--           desfaz o próprio pacote: o preço promocional é a razão de ele
--           existir, e a soma dos avulsos é por definição o preço SEM a
--           promoção.
--
--     A escolha (z) é a única que mantém uma regra só no produto: **a
--     tabela comprometida e vigente que alcança o paciente vence; o preço
--     do cadastro é o fundo.** O pacote ganha tarifa própria (arco na
--     `tarifas`), e a mesma função resolve os dois — uma escada, uma
--     ordem, um desempate. Duas escadas divergiriam no primeiro reajuste.
--
-- ============================================================
-- A CÉLULA CONTINUA SE CHAMANDO `procedimentos_plano`, E ISSO É DECISÃO
-- ============================================================
-- A tabela passa a guardar pacote também, e o nome fica mais estreito que o
-- conteúdo. Renomeá-la agora tocaria `ler_planos`, as chaves de `048`, duas
-- suítes, a tela e a ordem de publicação (`instrucoes.md` §6: "renomear
-- tabela e publicar o build são UM passo"). A palavra certa é **célula** —
-- é assim que a `045` a chama —, e o comentário da tabela passa a dizer
-- isso. Fica registrado como dívida de vocabulário para a varredura da
-- 03.22, não esquecido.
--
-- ============================================================
-- A FRONTEIRA CLÍNICA NÃO AFROUXA (P-sub)
-- ============================================================
-- `itens_orcamento` e `orcamentos` continuam sem `dente` e sem `faces`
-- (verificação (h) da `048`, reafirmada na §9). Pacote não tem dente nenhum
-- a projetar; procedimento continua saindo só por `ler_orcamentos()`, que
-- registra. A tabela nova desta migration, `eventos_orcamento`, guarda QUEM
-- aprovou e QUAIS colunas de dinheiro mudaram — nenhuma palavra clínica.
--
-- ============================================================
-- NADA DE CONTRATO, NADA DE FATURA
-- ============================================================
-- Aprovar continua congelando o acordo sem cobrar. A cobrança é da 03.8.b.
-- A verificação (k) da §9 lê o corpo de cada função tocada aqui.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §1 — O arco na CÉLULA do plano: procedimento OU pacote (D-F1, D-F6)
--
-- Arco exclusivo, nunca referência polimórfica: cada braço é uma chave
-- estrangeira COMPOSTA por `account_id`, que a auditoria
-- `public.fks_sem_isolamento_de_conta()` enxerga. Uma coluna `tipo` + `id`
-- não teria `REFERENCES`, e a auditoria não a veria (`instrucoes.md` §6,
-- D-V3).
-- ---------------------------------------------------------------------
ALTER TABLE aba_treatment.procedimentos_plano
  ALTER COLUMN procedimento_id DROP NOT NULL;

ALTER TABLE aba_treatment.procedimentos_plano
  ADD COLUMN IF NOT EXISTS pacote_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'aba_treatment.procedimentos_plano'::regclass
      AND conname = 'procedimentos_plano_pacote_fk'
  ) THEN
    ALTER TABLE aba_treatment.procedimentos_plano
      ADD CONSTRAINT procedimentos_plano_pacote_fk
      FOREIGN KEY (pacote_id, account_id)
      REFERENCES aba_catalog.pacotes(id, account_id);
  END IF;

  -- O ARCO. Recusa zero e recusa dois — e é o CHECK que recusa, com o nome
  -- dele no erro: o gatilho de validação da §2 sai do caminho quando o
  -- arco está quebrado, justamente para a mensagem não mentir sobre a
  -- causa (ele diria "procedimento não existe no catálogo").
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'aba_treatment.procedimentos_plano'::regclass
      AND conname = 'procedimentos_plano_um_item'
  ) THEN
    ALTER TABLE aba_treatment.procedimentos_plano
      ADD CONSTRAINT procedimentos_plano_um_item
      CHECK (num_nonnulls(procedimento_id, pacote_id) = 1);
  END IF;

  -- Pacote não se lança por dente nem por face. É combo de sessões, e
  -- dente num pacote seria dado clínico sem regra de forma nenhuma que o
  -- validasse.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'aba_treatment.procedimentos_plano'::regclass
      AND conname = 'procedimentos_plano_pacote_sem_dente'
  ) THEN
    ALTER TABLE aba_treatment.procedimentos_plano
      ADD CONSTRAINT procedimentos_plano_pacote_sem_dente
      CHECK (pacote_id IS NULL OR (dente IS NULL AND cardinality(faces) = 0));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_proc_plano_pacote
  ON aba_treatment.procedimentos_plano(pacote_id) WHERE pacote_id IS NOT NULL;

COMMENT ON TABLE aba_treatment.procedimentos_plano IS
  'A CÉLULA da matriz do plano: fase (linha) × opção (coluna). Desde a 051 (Subetapa 03.8.c) guarda procedimento OU pacote, em arco exclusivo (D-F1, D-F6). O nome ficou mais estreito que o conteúdo — dívida de vocabulário registrada para a 03.22.';

-- `pacote_id` é METADADO, como `procedimento_id`: diz qual combo, não onde
-- no corpo do paciente. A `047` fez a lista de SELECT por coluna ser de
-- PERMISSÃO — coluna nova nasce ilegível —, então a coluna nova precisa
-- entrar nela explicitamente. Sem esta linha, a tela quebraria pedindo
-- permissão, que é a falha certa, mas é falha.
GRANT SELECT (pacote_id) ON aba_treatment.procedimentos_plano TO authenticated;

-- ---------------------------------------------------------------------
-- §2 — As regras da célula, agora sabendo que ela pode ser um pacote
--
-- `CREATE OR REPLACE` com o MESMO nome e a mesma assinatura: o privilégio
-- se preserva (`instrucoes.md` §5, "renomear função afrouxa a permissão").
-- Os `REVOKE` são reemitidos mesmo assim, porque são baratos e fecham a
-- dúvida.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_treatment.validar_procedimento_plano()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_proc          RECORD;
  v_pacote        RECORD;
  v_nome          TEXT;
  v_exige_achado  BOOLEAN := FALSE;
  v_exige_trat    BOOLEAN := FALSE;
  v_exige_inf     BOOLEAN := FALSE;
  v_cliente_id    UUID;
  v_posicao       INT;
  v_grupo         TEXT;
  v_reconsentiu   BOOLEAN := FALSE;
BEGIN
  -- ---- (0) ARCO QUEBRADO: sai do caminho e deixa o CHECK falar.
  -- Um `BEFORE` roda antes do CHECK. Se esta função tentasse ler o
  -- procedimento de uma célula sem item nenhum, recusaria com "procedimento
  -- não existe no catálogo" — mensagem verdadeira sobre a consulta e falsa
  -- sobre a causa. `procedimentos_plano_um_item` recusa em seguida, com o
  -- nome certo no erro.
  IF num_nonnulls(NEW.procedimento_id, NEW.pacote_id) <> 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.pacote_id IS NOT NULL THEN
    -- ---- (1p) PACOTE. Não tem regra de forma: não se lança por dente nem
    -- ---- por face (CHECK `procedimentos_plano_pacote_sem_dente`) e não
    -- ---- carrega requisito de termo nem de achado.
    SELECT nome, ativo INTO v_pacote
    FROM aba_catalog.pacotes
    WHERE id = NEW.pacote_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pacote % não existe no catálogo desta conta.', NEW.pacote_id
        USING ERRCODE = '23503';
    END IF;
    v_nome := v_pacote.nome;

    -- Pacote desativado continua valendo onde já estava — a proposta
    -- existiu e o histórico dela protege a clínica. O que ele não faz é
    -- entrar em proposta NOVA.
    IF (TG_OP = 'INSERT' OR NEW.pacote_id IS DISTINCT FROM OLD.pacote_id) AND NOT v_pacote.ativo THEN
      RAISE EXCEPTION 'O pacote "%" está inativo e não entra em proposta nova.', v_nome
        USING ERRCODE = '23514';
    END IF;
  ELSE
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

    v_nome         := v_proc.nome;
    v_exige_achado := v_proc.exige_achado_diagnostico;
    v_exige_trat   := v_proc.exige_consentimento_tratamento;
    v_exige_inf    := v_proc.exige_consentimento_informado;

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
  END IF;

  -- ---- (2) RE-CONSENTIMENTO COM GATILHO EXPLÍCITO
  -- Mudar DENTE ou mudar o ITEM (código de procedimento, pacote, ou trocar
  -- um pelo outro) exige termo novo; mudar face, fase, opção ou diagnóstico
  -- vinculado não exige (`docs/02` §12.4). Trocar procedimento por pacote é
  -- trocar o que o paciente aceitou — é mudança de item, com o mesmo efeito.
  IF TG_OP = 'UPDATE'
     AND (NEW.dente IS DISTINCT FROM OLD.dente
          OR NEW.procedimento_id IS DISTINCT FROM OLD.procedimento_id
          OR NEW.pacote_id IS DISTINCT FROM OLD.pacote_id) THEN
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
  -- ---- código exige. Pacote não declara requisito, e as três bandeiras
  -- ---- ficam falsas para ele.
  IF NEW.estado <> 'proposto' THEN
    SELECT p.cliente_id INTO v_cliente_id
    FROM aba_treatment.planos p WHERE p.id = NEW.plano_id;

    IF v_exige_achado AND NEW.diagnostico_id IS NULL THEN
      RAISE EXCEPTION 'O procedimento "%" exige achado diagnóstico vinculado antes de sair de proposto.', v_nome
        USING ERRCODE = '23514';
    END IF;

    IF v_exige_trat OR v_exige_inf THEN
      IF NEW.consentimento_id IS NULL THEN
        RAISE EXCEPTION 'O procedimento "%" exige termo de consentimento antes de sair de proposto.', v_nome
          USING ERRCODE = '23514';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM aba_health.consentimentos c
        WHERE c.id = NEW.consentimento_id
          AND c.cliente_id = v_cliente_id
          AND c.concedido
          AND c.revogado_em IS NULL
          AND c.tipo = CASE WHEN v_exige_inf
                            THEN 'procedimento_informado' ELSE 'procedimento' END
      ) THEN
        RAISE EXCEPTION 'O termo vinculado não é um consentimento vigente do tipo % para este paciente.',
          CASE WHEN v_exige_inf THEN 'procedimento_informado' ELSE 'procedimento' END
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

-- O gatilho de validação passa a olhar também a coluna nova. Recriado
-- porque a lista de eventos não muda — `BEFORE INSERT OR UPDATE` já cobre
-- toda coluna —, mas a recriação é idempotente e documenta a intenção.
DROP TRIGGER IF EXISTS trg_proc_plano_validar ON aba_treatment.procedimentos_plano;
CREATE TRIGGER trg_proc_plano_validar
  BEFORE INSERT OR UPDATE ON aba_treatment.procedimentos_plano
  FOR EACH ROW EXECUTE FUNCTION aba_treatment.validar_procedimento_plano();

-- O TETO DE QUANTIDADE é regra de PROCEDIMENTO (`quantidade_maxima` por
-- dente/sextante/arcada). Pacote não tem teto no catálogo, e a função da
-- `045` leria `aba_catalog.procedimentos` com `id = NULL` e sairia por
-- `v_max IS NULL` por acidente — certo pelo motivo errado. A guarda
-- explícita diz o motivo.
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
  -- Célula de pacote não tem teto por unidade — o teto é do procedimento.
  IF NEW.procedimento_id IS NULL THEN
    RETURN NULL;
  END IF;

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
  AFTER INSERT OR UPDATE OF procedimento_id, pacote_id, opcao_id, estado, recusado_em
  ON aba_treatment.procedimentos_plano
  FOR EACH ROW EXECUTE FUNCTION aba_treatment.conferir_teto_de_quantidade();

-- ---------------------------------------------------------------------
-- §2b — Consentir a opção: o termo só se vincula a PROCEDIMENTO
--
-- A recusa implícita e o planejamento valem para toda célula da opção,
-- pacote incluído — o combo de clareamento recusado ao lado da sessão
-- avulsa escolhida é exatamente o registro que protege a clínica. O que
-- NÃO vale para pacote é o termo: pendurar um consentimento de
-- `procedimento` numa célula de pacote afirmaria que o paciente consentiu
-- um procedimento que aquela linha não tem.
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
  -- SÓ EM CÉLULA DE PROCEDIMENTO (Subetapa 03.8.c): pacote não declara
  -- requisito de termo, e o vínculo afirmaria um consentimento que aquela
  -- linha não tem.
  IF p_consentimento_id IS NOT NULL THEN
    UPDATE aba_treatment.procedimentos_plano
       SET consentimento_id = p_consentimento_id
     WHERE opcao_id = p_opcao_id AND estado = 'proposto' AND recusado_em IS NULL
       AND procedimento_id IS NOT NULL;
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
  'Consentir a opção A move os itens dela de proposto para planejado e marca os da opção B PARA O MESMO DIAGNÓSTICO como recusados (item 36). O termo só se vincula a célula de procedimento. SECURITY INVOKER: passa pela RLS de quem chama.';

REVOKE ALL ON FUNCTION aba_treatment.consentir_opcao(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_treatment.consentir_opcao(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION aba_treatment.consentir_opcao(UUID, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §2c — `ler_planos` devolve `pacote_id` na célula
--
-- Mesma assinatura e mesmo tipo de retorno: `CREATE OR REPLACE` basta, e o
-- privilégio fica. A única mudança é a chave nova no `jsonb` da célula.
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
-- §3 — A tarifa ganha o braço do pacote
--
-- É o que permite ao pacote subir a escada (decisão do cabeçalho). A
-- imutabilidade da `048` §3 é genérica — lê o estado da TABELA, não o tipo
-- do item — e cobre a tarifa de pacote sem mudança nenhuma.
-- ---------------------------------------------------------------------
ALTER TABLE aba_finance.tarifas
  ALTER COLUMN procedimento_id DROP NOT NULL;

ALTER TABLE aba_finance.tarifas
  ADD COLUMN IF NOT EXISTS pacote_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'aba_finance.tarifas'::regclass AND conname = 'tarifas_pacote_fk'
  ) THEN
    ALTER TABLE aba_finance.tarifas
      ADD CONSTRAINT tarifas_pacote_fk
      FOREIGN KEY (pacote_id, account_id)
      REFERENCES aba_catalog.pacotes(id, account_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'aba_finance.tarifas'::regclass AND conname = 'tarifas_um_item'
  ) THEN
    ALTER TABLE aba_finance.tarifas
      ADD CONSTRAINT tarifas_um_item
      CHECK (num_nonnulls(procedimento_id, pacote_id) = 1);
  END IF;

  -- A mesma tabela não tem duas tarifas para o mesmo pacote — irmã de
  -- `UNIQUE (tabela_preco_id, procedimento_id)`. Restrição, e não índice
  -- parcial, porque é ela que o `upsert` da tela nomeia em `onConflict`.
  -- `NULL` é distinto de `NULL` numa `UNIQUE`, então as linhas de
  -- procedimento (com `pacote_id` nulo) não colidem entre si aqui.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'aba_finance.tarifas'::regclass AND conname = 'tarifas_tabela_pacote_key'
  ) THEN
    ALTER TABLE aba_finance.tarifas
      ADD CONSTRAINT tarifas_tabela_pacote_key UNIQUE (tabela_preco_id, pacote_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tarifas_pacote
  ON aba_finance.tarifas(account_id, pacote_id) WHERE pacote_id IS NOT NULL;

-- Reajuste copia as tarifas de PACOTE também. Sem `pacote_id` no `INSERT`,
-- a tabela nova nasceria sem as tarifas de pacote e o `tarifas_um_item`
-- barraria a cópia inteira — ou, pior, se alguém trocasse a cópia por um
-- filtro `WHERE procedimento_id IS NOT NULL`, o reajuste perderia o preço
-- do convênio para o combo em silêncio e o pacote cairia para o
-- `preco_total` no dia seguinte.
CREATE OR REPLACE FUNCTION aba_finance.reajustar_tabela_preco(
  p_tabela_id UUID,
  p_percentual NUMERIC,
  p_nome TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_origem RECORD;
  v_nova   UUID;
BEGIN
  SELECT t.* INTO v_origem FROM aba_finance.tabelas_preco t WHERE t.id = p_tabela_id;

  IF v_origem.id IS NULL THEN
    RAISE EXCEPTION 'Tabela de preço % não existe ou não está ao seu alcance.', p_tabela_id
      USING ERRCODE = '42501';
  END IF;

  IF v_origem.estado <> 'comprometida' THEN
    RAISE EXCEPTION 'Só tabela comprometida se reajusta; rascunho ainda se edita e encerrada já foi substituída (esta está %).', v_origem.estado
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO aba_finance.tabelas_preco
    (account_id, nome, escopo, cliente_id, tipo_profissional_id, grupo_preco_id, estado, substitui_id)
  VALUES (
    v_origem.account_id,
    COALESCE(p_nome, v_origem.nome || ' (reajuste ' || to_char(NOW(), 'YYYY-MM-DD') || ')'),
    v_origem.escopo, v_origem.cliente_id, v_origem.tipo_profissional_id, v_origem.grupo_preco_id,
    'rascunho', v_origem.id
  )
  RETURNING id INTO v_nova;

  -- Os DOIS braços do arco são copiados: procedimento e pacote.
  INSERT INTO aba_finance.tarifas (account_id, tabela_preco_id, procedimento_id, pacote_id, valor)
  SELECT t.account_id, v_nova, t.procedimento_id, t.pacote_id,
         ROUND(t.valor * (1 + COALESCE(p_percentual, 0) / 100.0), 2)
  FROM aba_finance.tarifas t
  WHERE t.tabela_preco_id = p_tabela_id;

  -- Nasce em RASCUNHO de propósito: reajuste se confere antes de valer.
  -- Comprometer é um segundo gesto, e é ele que encerra a anterior.
  RETURN v_nova;
END;
$$;

COMMENT ON FUNCTION aba_finance.reajustar_tabela_preco(UUID, NUMERIC, TEXT) IS
  'Reajuste e TABELA NOVA, nunca UPDATE de tarifa comprometida. Copia as tarifas (de procedimento E de pacote) com o percentual, em rascunho, com substitui_id apontando para a origem. Nenhum valor ja acordado muda: o valor acordado mora na linha do orcamento, nao na tarifa.';

REVOKE ALL ON FUNCTION aba_finance.reajustar_tabela_preco(UUID, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.reajustar_tabela_preco(UUID, NUMERIC, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.reajustar_tabela_preco(UUID, NUMERIC, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §4 — UMA ESCADA para os dois tipos de item
--
-- `resolver_preco_item(procedimento, pacote, cliente, profissional, data)`
-- é a escada. `resolver_preco(procedimento, …)` continua existindo, com a
-- MESMA assinatura — a tela, a suíte e as funções da `048` a chamam —, e
-- passa a ser um repasse para a escada única com `pacote` nulo.
--
-- POR QUE NÃO UMA SEGUNDA FUNÇÃO PARA PACOTE: duas escadas são duas ordens
-- de degrau, dois desempates e duas listas de discriminador para manter
-- iguais. Divergiriam no primeiro degrau novo — e a 03.8.d acabou de
-- acrescentar um. É a mesma razão pela qual `simular_troca` e `trocar`
-- usam a mesma função (`048` §8).
--
-- **A ASSINATURA CONTINUA SENDO O CONTRATO:** nenhuma das duas recebe
-- tabela de preço. A verificação (e) da §9 lê as duas no catálogo.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_finance.resolver_preco_item(
  p_procedimento_id UUID,
  p_pacote_id       UUID,
  p_cliente_id      UUID DEFAULT NULL,
  p_profissional_id UUID DEFAULT NULL,
  p_data            DATE DEFAULT NULL
) RETURNS TABLE (
  valor           NUMERIC,
  tabela_preco_id UUID,
  tabela_nome     TEXT,
  degrau          TEXT,
  grau            SMALLINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
  v_tipo_id    UUID;
  v_data       DATE := COALESCE(p_data, CURRENT_DATE);
BEGIN
  -- O arco vale na pergunta também: exatamente um item. Pedir o preço de
  -- "nada" ou de "procedimento e pacote ao mesmo tempo" é erro de quem
  -- chama, e erro explícito é melhor que um conjunto vazio que a tela leria
  -- como "sem preço".
  IF num_nonnulls(p_procedimento_id, p_pacote_id) <> 1 THEN
    RAISE EXCEPTION 'Informe exatamente um item para resolver o preço: procedimento OU pacote.'
      USING ERRCODE = '22023';
  END IF;

  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid();
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  -- O item tem de ser da conta de quem pergunta. Sem esta linha,
  -- `SECURITY DEFINER` responderia o preço de qualquer conta a quem
  -- soubesse um UUID.
  IF p_procedimento_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM aba_catalog.procedimentos pc
    WHERE pc.id = p_procedimento_id AND pc.account_id = v_account_id
  ) THEN
    RETURN;
  END IF;
  IF p_pacote_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM aba_catalog.pacotes pk
    WHERE pk.id = p_pacote_id AND pk.account_id = v_account_id
  ) THEN
    RETURN;
  END IF;

  SELECT pr.tipo_profissional_id INTO v_tipo_id
  FROM aba_scheduling.profissionais pr
  WHERE pr.id = p_profissional_id AND pr.account_id = v_account_id;

  RETURN QUERY
  WITH candidatas AS (
    SELECT
      t.valor         AS c_valor,
      tp.id           AS c_tabela_id,
      tp.nome         AS c_tabela_nome,
      tp.escopo       AS c_escopo,
      tp.vigente_de   AS c_vigente_de,
      tp.comprometida_em AS c_comprometida_em,
      (CASE tp.escopo
        WHEN 'paciente'          THEN 1
        WHEN 'grupo_paciente'    THEN 2
        WHEN 'tipo_profissional' THEN 3
        WHEN 'clinica'           THEN 4
        WHEN 'rede'              THEN 5
        WHEN 'pratica'           THEN 6
      END)::SMALLINT AS c_grau,
      -- Prioridade do grupo. Só o degrau 2 a tem; os outros entram com o
      -- mesmo valor para não alterar a ordenação deles entre si.
      COALESCE(gp.prioridade, 0)::SMALLINT AS c_prioridade
    FROM aba_finance.tarifas t
    JOIN aba_finance.tabelas_preco tp
      ON tp.id = t.tabela_preco_id AND tp.account_id = t.account_id
    LEFT JOIN aba_finance.grupos_preco gp
      ON gp.id = tp.grupo_preco_id AND gp.account_id = tp.account_id
    WHERE t.account_id = v_account_id
      -- O braço do arco que se está perguntando. Escrito como dois ramos,
      -- e não como `IS NOT DISTINCT FROM`, para cada ramo usar o índice do
      -- próprio braço.
      AND (
        (p_procedimento_id IS NOT NULL AND t.procedimento_id = p_procedimento_id)
        OR (p_pacote_id IS NOT NULL AND t.pacote_id = p_pacote_id)
      )
      AND tp.estado = 'comprometida'
      AND tp.vigente_de <= v_data
      AND (tp.vigente_ate IS NULL OR tp.vigente_ate >= v_data)
      AND (
        -- O degrau só se aplica quando o discriminador dele bate. Sem o
        -- paciente na chamada, os degraus 1 e 2 somem da escada — e é
        -- assim que tem de ser: preço pessoal de um paciente não pode
        -- resolver o preço de outro, e nem o do grupo dele.
        (tp.escopo = 'paciente' AND p_cliente_id IS NOT NULL AND tp.cliente_id = p_cliente_id)
        OR (tp.escopo = 'grupo_paciente' AND p_cliente_id IS NOT NULL
            AND gp.ativo
            AND EXISTS (
              SELECT 1 FROM aba_finance.clientes_grupo_preco cg
              WHERE cg.grupo_id = tp.grupo_preco_id
                AND cg.cliente_id = p_cliente_id
                AND cg.account_id = v_account_id))
        OR (tp.escopo = 'tipo_profissional' AND v_tipo_id IS NOT NULL AND tp.tipo_profissional_id = v_tipo_id)
        OR tp.escopo IN ('clinica','rede','pratica')
      )
  )
  SELECT c.c_valor, c.c_tabela_id, c.c_tabela_nome, c.c_escopo, c.c_grau
  FROM candidatas c
  -- Degrau primeiro; dentro do degrau 2, a PRIORIDADE do grupo; e só
  -- então o desempate temporal da 048, que continua garantindo ordem
  -- total — sem ela, o preço mudaria entre duas execuções da mesma
  -- consulta, que é a pior classe de defeito num número que vira contrato.
  ORDER BY c.c_grau, c.c_prioridade, c.c_vigente_de DESC, c.c_comprometida_em DESC, c.c_tabela_id
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- O FUNDO DA ESCADA é o preço do CADASTRO — `preco_base` para o
  -- procedimento, `preco_total` para o pacote —, com o degrau `catalogo`.
  -- Esta é a decisão do cabeçalho: o preço do pacote é o último recurso,
  -- não o vencedor.
  IF p_procedimento_id IS NOT NULL THEN
    RETURN QUERY
    SELECT pc.preco_base, NULL::UUID, NULL::TEXT, 'catalogo'::TEXT, 9::SMALLINT
    FROM aba_catalog.procedimentos pc
    WHERE pc.id = p_procedimento_id AND pc.account_id = v_account_id;
  ELSE
    RETURN QUERY
    SELECT pk.preco_total, NULL::UUID, NULL::TEXT, 'catalogo'::TEXT, 9::SMALLINT
    FROM aba_catalog.pacotes pk
    WHERE pk.id = p_pacote_id AND pk.account_id = v_account_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION aba_finance.resolver_preco_item(UUID, UUID, UUID, UUID, DATE) IS
  'A escada ÚNICA, para procedimento OU pacote: Paciente > Grupo de pacientes > Tipo de profissional > Clinica > Rede > Pratica, e o preco do cadastro (preco_base / preco_total) como ultimo recurso. NAO recebe tabela de preco por parametro — o preco se resolve, nao se escolhe.';

ALTER FUNCTION aba_finance.resolver_preco_item(UUID, UUID, UUID, UUID, DATE) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.resolver_preco_item(UUID, UUID, UUID, UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.resolver_preco_item(UUID, UUID, UUID, UUID, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.resolver_preco_item(UUID, UUID, UUID, UUID, DATE) TO authenticated, service_role;

-- A assinatura antiga fica, e vira repasse. Ela é pública desde a 03.8.a —
-- a suíte e a evidência a chamam por nome —, e mudá-la seria mudar o
-- contrato por um motivo que não é dela.
CREATE OR REPLACE FUNCTION aba_finance.resolver_preco(
  p_procedimento_id UUID,
  p_cliente_id      UUID DEFAULT NULL,
  p_profissional_id UUID DEFAULT NULL,
  p_data            DATE DEFAULT NULL
) RETURNS TABLE (
  valor           NUMERIC,
  tabela_preco_id UUID,
  tabela_nome     TEXT,
  degrau          TEXT,
  grau            SMALLINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Repasse para a escada única (`resolver_preco_item`, migration `051`).
  -- Nenhuma regra mora aqui: um degrau novo entra lá, e só lá.
  RETURN QUERY
  SELECT r.valor, r.tabela_preco_id, r.tabela_nome, r.degrau, r.grau
  FROM aba_finance.resolver_preco_item(p_procedimento_id, NULL, p_cliente_id, p_profissional_id, p_data) r;
END;
$$;

COMMENT ON FUNCTION aba_finance.resolver_preco(UUID, UUID, UUID, DATE) IS
  'Preco de PROCEDIMENTO pela escada. Desde a 051 e um repasse para aba_finance.resolver_preco_item, que e a escada unica para procedimento e pacote. NAO recebe tabela de preco por parametro.';

ALTER FUNCTION aba_finance.resolver_preco(UUID, UUID, UUID, DATE) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.resolver_preco(UUID, UUID, UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.resolver_preco(UUID, UUID, UUID, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.resolver_preco(UUID, UUID, UUID, DATE) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §5 — O item do orçamento ganha o mesmo arco
--
-- `procedimento_id` já era duplicado no item de propósito (`048` §6: para
-- exibir e agrupar sem atravessar `aba_treatment`). `pacote_id` segue a
-- mesma razão. O que a linha continua sem ter é dente e face.
-- ---------------------------------------------------------------------
ALTER TABLE aba_finance.itens_orcamento
  ALTER COLUMN procedimento_id DROP NOT NULL;

ALTER TABLE aba_finance.itens_orcamento
  ADD COLUMN IF NOT EXISTS pacote_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'aba_finance.itens_orcamento'::regclass AND conname = 'itens_orcamento_pacote_fk'
  ) THEN
    ALTER TABLE aba_finance.itens_orcamento
      ADD CONSTRAINT itens_orcamento_pacote_fk
      FOREIGN KEY (pacote_id, account_id)
      REFERENCES aba_catalog.pacotes(id, account_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'aba_finance.itens_orcamento'::regclass AND conname = 'itens_orcamento_um_item'
  ) THEN
    ALTER TABLE aba_finance.itens_orcamento
      ADD CONSTRAINT itens_orcamento_um_item
      CHECK (num_nonnulls(procedimento_id, pacote_id) = 1);
  END IF;
END $$;

-- O item é a MESMA coisa que a célula. A `048` conferia que a célula é do
-- mesmo plano do orçamento; faltava conferir que o item diz o mesmo item
-- que a célula. Sem isto, uma linha de orçamento poderia apontar para a
-- célula "restauração" dizendo "pacote de clareamento" — e o preço
-- resolvido seria o do pacote, cobrado por um procedimento.
CREATE OR REPLACE FUNCTION aba_finance.conferir_item_orcamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_plano_do_orcamento UUID;
  v_plano_da_celula    UUID;
  v_proc_da_celula     UUID;
  v_pacote_da_celula   UUID;
  v_estado             TEXT;
BEGIN
  SELECT o.plano_id, o.estado INTO v_plano_do_orcamento, v_estado
  FROM aba_finance.orcamentos o WHERE o.id = NEW.orcamento_id;

  IF v_estado <> 'rascunho' THEN
    RAISE EXCEPTION 'Orçamento % não recebe nem altera item — o valor acordado é congelado.', v_estado
      USING ERRCODE = '23514';
  END IF;

  SELECT pp.plano_id, pp.procedimento_id, pp.pacote_id
    INTO v_plano_da_celula, v_proc_da_celula, v_pacote_da_celula
  FROM aba_treatment.procedimentos_plano pp WHERE pp.id = NEW.procedimento_plano_id;

  IF v_plano_da_celula IS DISTINCT FROM v_plano_do_orcamento THEN
    RAISE EXCEPTION 'O procedimento pertence a outro plano — orçamento de um paciente não recebe linha do plano de outro.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.procedimento_id IS DISTINCT FROM v_proc_da_celula
     OR NEW.pacote_id IS DISTINCT FROM v_pacote_da_celula THEN
    RAISE EXCEPTION 'O item do orçamento tem de ser o mesmo item da célula do plano — procedimento e pacote não se trocam na vista financeira.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION aba_finance.conferir_item_orcamento() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.conferir_item_orcamento() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.conferir_item_orcamento() FROM anon;
REVOKE ALL ON FUNCTION aba_finance.conferir_item_orcamento() FROM authenticated;

-- ---------------------------------------------------------------------
-- §6 — As operações do orçamento resolvem pela escada única
--
-- Mesmas assinaturas, mesmos tipos de retorno: `CREATE OR REPLACE`
-- preserva o privilégio, e os `REVOKE`/`GRANT` são reemitidos mesmo assim.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_finance.montar_orcamento(
  p_opcao_id UUID,
  p_profissional_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id  UUID;
  v_plano_id    UUID;
  v_cliente_id  UUID;
  v_orcamento   UUID;
  v_estado      TEXT;
  v_prof        UUID := p_profissional_id;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid();
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Montar orçamento exige sessão autenticada.' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.is_account_member(v_account_id, 'agent') AND access.can('finance', 'create')) THEN
    RAISE EXCEPTION 'Sem permissão para montar orçamento neste módulo.' USING ERRCODE = '42501';
  END IF;

  SELECT o.plano_id, p.cliente_id INTO v_plano_id, v_cliente_id
  FROM aba_treatment.opcoes o
  JOIN aba_treatment.planos p ON p.id = o.plano_id AND p.account_id = o.account_id
  WHERE o.id = p_opcao_id AND o.account_id = v_account_id;

  IF v_plano_id IS NULL THEN
    RAISE EXCEPTION 'Opção % não existe nesta conta.', p_opcao_id USING ERRCODE = '42501';
  END IF;

  SELECT id, estado INTO v_orcamento, v_estado
  FROM aba_finance.orcamentos WHERE opcao_id = p_opcao_id;

  IF v_orcamento IS NULL THEN
    INSERT INTO aba_finance.orcamentos (account_id, plano_id, opcao_id, profissional_id)
    VALUES (v_account_id, v_plano_id, p_opcao_id,
            COALESCE(v_prof, (SELECT pl.profissional_id FROM aba_treatment.planos pl WHERE pl.id = v_plano_id)))
    RETURNING id, profissional_id INTO v_orcamento, v_prof;
  ELSE
    IF v_estado <> 'rascunho' THEN
      RAISE EXCEPTION 'Orçamento % não se remonta — o valor acordado é congelado.', v_estado
        USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(v_prof, profissional_id) INTO v_prof
    FROM aba_finance.orcamentos WHERE id = v_orcamento;
    UPDATE aba_finance.orcamentos SET profissional_id = v_prof WHERE id = v_orcamento;
  END IF;

  -- Sai o que não pertence mais à opção — E o que a célula trocou de item
  -- desde o último cálculo (Subetapa 03.8.c): trocar a restauração por um
  -- pacote na matriz não pode deixar no orçamento a linha do preço antigo.
  -- Apagar tudo e reinserir seria mais curto e perderia `resolvido_em` de
  -- linha que não mudou — e é justamente o carimbo que diz quando aquele
  -- preço foi acordado.
  DELETE FROM aba_finance.itens_orcamento i
  WHERE i.orcamento_id = v_orcamento
    AND NOT EXISTS (
      SELECT 1 FROM aba_treatment.procedimentos_plano pp
      WHERE pp.id = i.procedimento_plano_id
        AND pp.opcao_id = p_opcao_id
        AND pp.recusado_em IS NULL
        AND pp.estado <> 'nao_mais_necessario'
        AND pp.procedimento_id IS NOT DISTINCT FROM i.procedimento_id
        AND pp.pacote_id IS NOT DISTINCT FROM i.pacote_id);

  INSERT INTO aba_finance.itens_orcamento
    (account_id, orcamento_id, procedimento_plano_id, procedimento_id, pacote_id,
     valor_resolvido, tabela_preco_id, degrau, profissional_id)
  SELECT
    v_account_id, v_orcamento, pp.id, pp.procedimento_id, pp.pacote_id,
    COALESCE(r.valor, 0), r.tabela_preco_id, COALESCE(r.degrau, 'catalogo'), v_prof
  FROM aba_treatment.procedimentos_plano pp
  -- `LEFT ... ON TRUE` e não `CROSS`: a escada pode devolver conjunto
  -- vazio, e com `CROSS JOIN LATERAL` o item sumiria do orçamento em
  -- silêncio em vez de entrar com o preço a resolver.
  LEFT JOIN LATERAL aba_finance.resolver_preco_item(pp.procedimento_id, pp.pacote_id, v_cliente_id, v_prof) r ON TRUE
  WHERE pp.opcao_id = p_opcao_id
    AND pp.account_id = v_account_id
    AND pp.recusado_em IS NULL
    AND pp.estado <> 'nao_mais_necessario'
    AND NOT EXISTS (
      SELECT 1 FROM aba_finance.itens_orcamento i
      WHERE i.orcamento_id = v_orcamento AND i.procedimento_plano_id = pp.id);

  RETURN v_orcamento;
END;
$$;

COMMENT ON FUNCTION aba_finance.montar_orcamento(UUID, UUID) IS
  'Monta (ou completa) o orcamento em rascunho de uma opcao do plano, resolvendo o preco de cada celula — procedimento ou pacote — pela escada unica. NAO recebe tabela de preco: o preco se resolve. Nunca devolve dente nem face.';

ALTER FUNCTION aba_finance.montar_orcamento(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.montar_orcamento(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.montar_orcamento(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.montar_orcamento(UUID, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION aba_finance.simular_troca_de_profissional(
  p_orcamento_id UUID,
  p_profissional_id UUID
) RETURNS TABLE (
  item_id          UUID,
  procedimento_id  UUID,
  procedimento     TEXT,
  valor_atual      NUMERIC,
  valor_novo       NUMERIC,
  diferenca        NUMERIC,
  degrau_atual     TEXT,
  degrau_novo      TEXT,
  tabela_nova      TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
  v_cliente_id UUID;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid();
  IF v_account_id IS NULL
     OR NOT (public.is_account_member(v_account_id, 'viewer') AND access.can('finance', 'read')) THEN
    RETURN;
  END IF;

  SELECT p.cliente_id INTO v_cliente_id
  FROM aba_finance.orcamentos o
  JOIN aba_treatment.planos p ON p.id = o.plano_id AND p.account_id = o.account_id
  WHERE o.id = p_orcamento_id AND o.account_id = v_account_id;

  IF v_cliente_id IS NULL THEN
    RETURN;
  END IF;

  -- A coluna `procedimento` continua com esse nome (é o contrato da tela
  -- desde a 03.8.a) e passa a trazer o nome do PACOTE quando o item é um.
  RETURN QUERY
  SELECT
    i.id, i.procedimento_id, COALESCE(pc.nome, pk.nome),
    i.valor_resolvido,
    COALESCE(r.valor, 0),
    COALESCE(r.valor, 0) - i.valor_resolvido,
    i.degrau, COALESCE(r.degrau, 'catalogo'), r.tabela_nome
  FROM aba_finance.itens_orcamento i
  LEFT JOIN aba_catalog.procedimentos pc
    ON pc.id = i.procedimento_id AND pc.account_id = i.account_id
  LEFT JOIN aba_catalog.pacotes pk
    ON pk.id = i.pacote_id AND pk.account_id = i.account_id
  LEFT JOIN LATERAL aba_finance.resolver_preco_item(i.procedimento_id, i.pacote_id, v_cliente_id, p_profissional_id) r ON TRUE
  WHERE i.orcamento_id = p_orcamento_id AND i.account_id = v_account_id
  ORDER BY COALESCE(pc.nome, pk.nome);
END;
$$;

COMMENT ON FUNCTION aba_finance.simular_troca_de_profissional(UUID, UUID) IS
  'O aviso ANTES de confirmar: devolve, item a item (procedimento ou pacote), o valor atual, o valor que a escada daria com o outro profissional e a diferenca. STABLE — nao grava nada.';

ALTER FUNCTION aba_finance.simular_troca_de_profissional(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.simular_troca_de_profissional(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.simular_troca_de_profissional(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.simular_troca_de_profissional(UUID, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION aba_finance.trocar_profissional_do_orcamento(
  p_orcamento_id UUID,
  p_profissional_id UUID
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
  v_cliente_id UUID;
  v_estado     TEXT;
  v_antes      NUMERIC;
  v_depois     NUMERIC;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = auth.uid();
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Trocar o profissional do orçamento exige sessão autenticada.' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.is_account_member(v_account_id, 'agent') AND access.can('finance', 'update')) THEN
    RAISE EXCEPTION 'Sem permissão para alterar orçamento neste módulo.' USING ERRCODE = '42501';
  END IF;

  SELECT o.estado, o.valor_bruto, p.cliente_id INTO v_estado, v_antes, v_cliente_id
  FROM aba_finance.orcamentos o
  JOIN aba_treatment.planos p ON p.id = o.plano_id AND p.account_id = o.account_id
  WHERE o.id = p_orcamento_id AND o.account_id = v_account_id;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Orçamento % não existe nesta conta.', p_orcamento_id USING ERRCODE = '42501';
  END IF;

  IF v_estado <> 'rascunho' THEN
    RAISE EXCEPTION 'Orçamento % não recalcula — trocar o profissional depois do acordo mudaria um valor já aceito.', v_estado
      USING ERRCODE = '23514';
  END IF;

  IF p_profissional_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM aba_scheduling.profissionais pr
    WHERE pr.id = p_profissional_id AND pr.account_id = v_account_id
  ) THEN
    RAISE EXCEPTION 'Profissional % não existe nesta conta.', p_profissional_id USING ERRCODE = '42501';
  END IF;

  -- A resolução vem de uma SUBQUERY, e não de um `FROM
  -- resolver_preco_item(i.procedimento_id, ...)`: no `UPDATE`, a cláusula
  -- `FROM` não enxerga colunas da tabela-alvo, e a forma direta falha com
  -- "invalid reference to FROM-clause entry".
  UPDATE aba_finance.itens_orcamento i
     SET valor_resolvido = novo.valor,
         tabela_preco_id = novo.tabela_preco_id,
         degrau          = novo.degrau,
         profissional_id = p_profissional_id,
         resolvido_em    = NOW()
  FROM (
    SELECT x.id AS item_id,
           COALESCE(r.valor, 0) AS valor,
           r.tabela_preco_id,
           COALESCE(r.degrau, 'catalogo') AS degrau
    FROM aba_finance.itens_orcamento x
    LEFT JOIN LATERAL aba_finance.resolver_preco_item(x.procedimento_id, x.pacote_id, v_cliente_id, p_profissional_id) r ON TRUE
    WHERE x.orcamento_id = p_orcamento_id AND x.account_id = v_account_id
  ) novo
  WHERE i.id = novo.item_id;

  UPDATE aba_finance.orcamentos SET profissional_id = p_profissional_id WHERE id = p_orcamento_id;

  SELECT valor_bruto INTO v_depois FROM aba_finance.orcamentos WHERE id = p_orcamento_id;
  RETURN v_depois - v_antes;
END;
$$;

COMMENT ON FUNCTION aba_finance.trocar_profissional_do_orcamento(UUID, UUID) IS
  'Aplica a troca e devolve a diferenca de total. Usa a MESMA escada (resolver_preco_item) da simulacao — o que foi avisado e o que se grava sao o mesmo calculo.';

ALTER FUNCTION aba_finance.trocar_profissional_do_orcamento(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.trocar_profissional_do_orcamento(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.trocar_profissional_do_orcamento(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.trocar_profissional_do_orcamento(UUID, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §7 — D-F3 e D-F7: quem aprova, e o que desfaz a aprovação
--
-- ============================================================
-- A REGRA MORA NUM GATILHO, NÃO EM `aprovar_orcamento()`
-- ============================================================
-- A policy `orcamentos_update` da `048` autoriza `UPDATE` a partir de
-- `agent`. Uma regra de aprovação escrita só dentro da função seria
-- contornada por `UPDATE orcamentos SET estado = 'aprovado', aprovado_por
-- = <qualquer um>` direto pelo PostgREST — com carimbo de outra pessoa.
-- É a lição da 01.8 (achado A01): trava que só cobre um caminho deixa
-- passar o outro. Aqui o gatilho cobre TODO caminho de escrita, e a função
-- vira conveniência.
--
-- ============================================================
-- O QUE O GATILHO DECIDE
-- ============================================================
--   · INSERT: orçamento nasce em `rascunho`. Nascer aprovado seria aprovar
--     sem ninguém ter visto os itens.
--   · rascunho → aprovado: exige sessão, profissional definido, o login do
--     chamador SER o do profissional, pelo menos um item e o profissional
--     não trocando no mesmo gesto. O carimbo é do gatilho — `aprovado_em`
--     e `aprovado_por` que venham no `UPDATE` são sobrescritos.
--   · aprovado + mudança em dinheiro: **volta a rascunho** (D-F3), sem
--     erro. A recepção fez uma alteração legítima — a alçada da `048` §7
--     já garantiu que é `admin` —, e o efeito dela é desfazer o carimbo.
--     Recusar seria obrigar a recepção a pedir ao dentista que
--     "desaprove" para ela poder dar desconto, que é trabalho sem valor.
--   · aprovado → rascunho explícito: permitido e registrado.
--   · aprovado sem mudança de dinheiro: não troca de profissional nem de
--     carimbo.
--
-- ============================================================
-- A ORDEM ENTRE ESTE GATILHO E O DA ALÇADA NÃO IMPORTA — e é por desenho
-- ============================================================
-- `trg_orcamentos_alcada` (048) e `trg_orcamentos_aprovacao` (este) são
-- `BEFORE UPDATE` na mesma tabela, e o Postgres os dispara por ordem de
-- NOME. A `045` registrou por que regra decidida por ordem de nome é
-- perigosa. Aqui ela não decide nada: a alçada só LÊ as seis colunas de
-- dinheiro e só RECUSA; este gatilho só ESCREVE `estado`, `aprovado_em` e
-- `aprovado_por`, que a alçada não lê. Se a alçada recusar, a instrução
-- inteira é desfeita — inclusive o evento que este gatilho tiver gravado.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aba_finance.eventos_orcamento (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  orcamento_id UUID NOT NULL,
  tipo         TEXT NOT NULL,
  -- Quais colunas de DINHEIRO mudaram, na devolução. Nomes de coluna, nunca
  -- valores nem texto livre: o motivo do desconto já mora no orçamento, e
  -- copiá-lo para cá daria a mesma informação dois donos.
  colunas      TEXT[] NOT NULL DEFAULT '{}',
  ator         UUID,
  ocorrido_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, account_id),
  CONSTRAINT eventos_orcamento_orcamento_fk
    FOREIGN KEY (orcamento_id, account_id)
    REFERENCES aba_finance.orcamentos(id, account_id) ON DELETE CASCADE,
  CONSTRAINT eventos_orcamento_tipo_valido
    CHECK (tipo IN ('aprovado','devolvido_a_rascunho')),
  -- Aprovação sem autor não existe: é o próprio conteúdo do evento.
  CONSTRAINT eventos_orcamento_aprovacao_tem_ator
    CHECK (tipo <> 'aprovado' OR ator IS NOT NULL),
  CONSTRAINT eventos_orcamento_colunas_de_dinheiro
    CHECK (colunas <@ ARRAY['desconto_valor','desconto_motivo','promocao','parcelas','taxa_juros','taxa_multa_atraso']::TEXT[])
);
CREATE INDEX IF NOT EXISTS idx_eventos_orcamento_orcamento
  ON aba_finance.eventos_orcamento(orcamento_id, ocorrido_em DESC);

COMMENT ON TABLE aba_finance.eventos_orcamento IS
  'Trilha de APROVAÇÃO do orçamento (Subetapa 03.8.c, D-F3/D-F7): quem aprovou, e quando a recepção mexeu em dinheiro e devolveu o orçamento a rascunho. Só o gatilho escreve — authenticated tem SELECT e mais nada. Sem dado clínico.';

ALTER TABLE aba_finance.eventos_orcamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eventos_orcamento_select ON aba_finance.eventos_orcamento;
CREATE POLICY eventos_orcamento_select ON aba_finance.eventos_orcamento FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('finance', 'read'));
-- NENHUMA policy de escrita, de propósito, e sem `GRANT` de escrita para
-- `authenticated`: trilha que o próprio usuário pode escrever é trilha que
-- ele pode forjar. Quem grava é `guardar_aprovacao_orcamento()`, que é
-- `SECURITY DEFINER`.

GRANT SELECT ON aba_finance.eventos_orcamento TO authenticated;
GRANT SELECT, INSERT, DELETE ON aba_finance.eventos_orcamento TO service_role;
REVOKE ALL ON aba_finance.eventos_orcamento FROM PUBLIC;
REVOKE ALL ON aba_finance.eventos_orcamento FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON aba_finance.eventos_orcamento FROM authenticated;

CREATE OR REPLACE FUNCTION aba_finance.guardar_aprovacao_orcamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ator     UUID := auth.uid();
  v_dinheiro TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'rascunho' THEN
      RAISE EXCEPTION 'Orçamento nasce em rascunho — aprovar é gesto do profissional que vai executar, depois de conferir os itens.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- Plano e opção são a identidade do orçamento. Mudá-los seria mover um
  -- número aprovado para outro tratamento.
  IF NEW.plano_id IS DISTINCT FROM OLD.plano_id OR NEW.opcao_id IS DISTINCT FROM OLD.opcao_id THEN
    RAISE EXCEPTION 'Orçamento não muda de plano nem de opção.' USING ERRCODE = '23514';
  END IF;

  -- As seis colunas de DINHEIRO, comparadas coluna a coluna e pelo TIPO
  -- delas — nunca como texto de `to_jsonb` (`instrucoes.md` §5: `NUMERIC`
  -- serializa zero como `0.00`). A lista é a mesma de `trg_orcamentos_alcada`.
  IF NEW.desconto_valor    IS DISTINCT FROM OLD.desconto_valor    THEN v_dinheiro := v_dinheiro || 'desconto_valor'::TEXT;    END IF;
  IF NEW.desconto_motivo   IS DISTINCT FROM OLD.desconto_motivo   THEN v_dinheiro := v_dinheiro || 'desconto_motivo'::TEXT;   END IF;
  IF NEW.promocao          IS DISTINCT FROM OLD.promocao          THEN v_dinheiro := v_dinheiro || 'promocao'::TEXT;          END IF;
  IF NEW.parcelas          IS DISTINCT FROM OLD.parcelas          THEN v_dinheiro := v_dinheiro || 'parcelas'::TEXT;          END IF;
  IF NEW.taxa_juros        IS DISTINCT FROM OLD.taxa_juros        THEN v_dinheiro := v_dinheiro || 'taxa_juros'::TEXT;        END IF;
  IF NEW.taxa_multa_atraso IS DISTINCT FROM OLD.taxa_multa_atraso THEN v_dinheiro := v_dinheiro || 'taxa_multa_atraso'::TEXT; END IF;

  -- ============ o orçamento ESTAVA aprovado ============
  IF OLD.estado = 'aprovado' THEN
    IF NEW.estado = 'aprovado' AND cardinality(v_dinheiro) > 0 THEN
      -- D-F3: mexer em dinheiro DESFAZ a aprovação. Sem erro — a mudança é
      -- legítima (a alçada já conferiu que é da recepção), e o efeito dela
      -- é o profissional ter de olhar de novo.
      NEW.estado       := 'rascunho';
      NEW.aprovado_em  := NULL;
      NEW.aprovado_por := NULL;
      INSERT INTO aba_finance.eventos_orcamento (account_id, orcamento_id, tipo, colunas, ator)
      VALUES (NEW.account_id, NEW.id, 'devolvido_a_rascunho', v_dinheiro, v_ator);
      RETURN NEW;
    END IF;

    IF NEW.estado = 'aprovado' THEN
      IF NEW.profissional_id IS DISTINCT FROM OLD.profissional_id
         OR NEW.aprovado_em IS DISTINCT FROM OLD.aprovado_em
         OR NEW.aprovado_por IS DISTINCT FROM OLD.aprovado_por THEN
        RAISE EXCEPTION 'Orçamento aprovado não troca de profissional nem de carimbo de aprovação — o número aprovado é de quem o aprovou.'
          USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END IF;

    IF NEW.estado = 'rascunho' THEN
      NEW.aprovado_em  := NULL;
      NEW.aprovado_por := NULL;
      INSERT INTO aba_finance.eventos_orcamento (account_id, orcamento_id, tipo, colunas, ator)
      VALUES (NEW.account_id, NEW.id, 'devolvido_a_rascunho', v_dinheiro, v_ator);
      RETURN NEW;
    END IF;

    -- `recusado`: o CHECK `orcamentos_aprovacao_completa` decide, como antes.
    RETURN NEW;
  END IF;

  -- ============ a transição PARA aprovado ============
  IF NEW.estado = 'aprovado' THEN
    IF OLD.estado <> 'rascunho' THEN
      RAISE EXCEPTION 'Só orçamento em rascunho se aprova; este está %.', OLD.estado USING ERRCODE = '23514';
    END IF;

    -- Aprovar é ato datado e atribuível — a lição da 03.8 sobre
    -- `consentir_opcao`: função que grava autoria trata `auth.uid()` nulo
    -- no topo, com mensagem própria.
    IF v_ator IS NULL THEN
      RAISE EXCEPTION 'Aprovar um orçamento exige sessão autenticada — a aprovação precisa de autor e data.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.profissional_id IS DISTINCT FROM OLD.profissional_id THEN
      RAISE EXCEPTION 'Troque o profissional e aprove em dois gestos — os preços foram resolvidos para o profissional anterior.'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.profissional_id IS NULL THEN
      RAISE EXCEPTION 'Orçamento sem profissional definido não se aprova — quem aprova é quem vai executar (D-F7).'
        USING ERRCODE = '23514';
    END IF;

    -- D-F7: o login de quem chama É o login do profissional que executa.
    -- Sem exceção para `owner` — é comum o `owner` não ser dentista (D-V7),
    -- e aprovar o preço clínico no lugar de quem executa é a vinculação
    -- "sem ele saber" que a D-F3 existe para impedir.
    IF NOT EXISTS (
      SELECT 1
      FROM aba_scheduling.profissionais pr
      JOIN public.profiles pf ON pf.id = pr.profile_id
      WHERE pr.id = NEW.profissional_id
        AND pr.account_id = NEW.account_id
        AND pf.user_id = v_ator
    ) THEN
      RAISE EXCEPTION 'Só o profissional que vai executar aprova este orçamento — é ele quem responde pelo número (D-F3, D-F7).'
        USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM aba_finance.itens_orcamento i WHERE i.orcamento_id = NEW.id) THEN
      RAISE EXCEPTION 'Orçamento sem item não se aprova.' USING ERRCODE = '23514';
    END IF;

    NEW.aprovado_em  := NOW();
    NEW.aprovado_por := v_ator;
    INSERT INTO aba_finance.eventos_orcamento (account_id, orcamento_id, tipo, colunas, ator)
    VALUES (NEW.account_id, NEW.id, 'aprovado', '{}', v_ator);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION aba_finance.guardar_aprovacao_orcamento() IS
  'D-F3/D-F7: só o profissional que vai executar aprova; mexer em dinheiro num orçamento aprovado o devolve a rascunho. Cobre todo caminho de escrita (a policy de UPDATE autoriza agent), e grava a trilha em eventos_orcamento.';

ALTER FUNCTION aba_finance.guardar_aprovacao_orcamento() OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.guardar_aprovacao_orcamento() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.guardar_aprovacao_orcamento() FROM anon;
REVOKE ALL ON FUNCTION aba_finance.guardar_aprovacao_orcamento() FROM authenticated;

DROP TRIGGER IF EXISTS trg_orcamentos_aprovacao ON aba_finance.orcamentos;
CREATE TRIGGER trg_orcamentos_aprovacao
  BEFORE INSERT OR UPDATE ON aba_finance.orcamentos
  FOR EACH ROW EXECUTE FUNCTION aba_finance.guardar_aprovacao_orcamento();

-- `aprovar_orcamento` vira conveniência: a regra é do gatilho. As
-- recusas daqui continuam, porque dizem o motivo mais cedo e em linguagem
-- de balcão; as do gatilho são as que valem.
CREATE OR REPLACE FUNCTION aba_finance.aprovar_orcamento(p_orcamento_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_ator   UUID := auth.uid();
  v_estado TEXT;
BEGIN
  IF v_ator IS NULL THEN
    RAISE EXCEPTION 'Aprovar um orçamento exige sessão autenticada — a aprovação precisa de autor e data.'
      USING ERRCODE = '42501';
  END IF;

  SELECT estado INTO v_estado FROM aba_finance.orcamentos WHERE id = p_orcamento_id;
  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Orçamento % não existe ou não está ao seu alcance.', p_orcamento_id
      USING ERRCODE = '42501';
  END IF;
  IF v_estado <> 'rascunho' THEN
    RAISE EXCEPTION 'Só orçamento em rascunho se aprova; este está %.', v_estado USING ERRCODE = '23514';
  END IF;

  -- O carimbo (`aprovado_em`, `aprovado_por`) e a conferência de QUEM
  -- aprova são de `trg_orcamentos_aprovacao`. Esta função só pede.
  UPDATE aba_finance.orcamentos SET estado = 'aprovado' WHERE id = p_orcamento_id;

  RETURN p_orcamento_id;
END;
$$;

COMMENT ON FUNCTION aba_finance.aprovar_orcamento(UUID) IS
  'Pede a aprovação. Quem pode aprovar (o profissional que vai executar, D-F7) e o carimbo são decididos pelo gatilho trg_orcamentos_aprovacao, que cobre também o UPDATE direto.';

REVOKE ALL ON FUNCTION aba_finance.aprovar_orcamento(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.aprovar_orcamento(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.aprovar_orcamento(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §8 — `ler_orcamentos` devolve o que a tela precisa para AVISAR
--
-- Três colunas novas, e por isso `DROP` + `CREATE` — o Postgres não troca
-- tipo de retorno em `CREATE OR REPLACE`. Função recriada é função NOVA
-- para efeito de privilégio (`instrucoes.md` §5): os `REVOKE`/`GRANT` vêm
-- logo abaixo e a verificação (c) da §9 confere.
--
--   · `aprovado_por` — quem aprovou, para a tela dizer.
--   · `sou_quem_aprova` — o BANCO responde se quem está olhando é o
--     profissional que executa. A tela não recalcula permissão (Qualidade
--     fixa da Etapa 03): ela mostra ou explica o botão com base nisto, e o
--     gatilho decide de todo jeito.
--   · `ultima_devolucao` — quando o orçamento está em rascunho porque a
--     recepção mexeu em dinheiro depois de aprovado: quando, quem e quais
--     colunas. É o "aviso de que precisa de nova aprovação" da Conclusão.
--
-- E o item ganha `tipo` e `pacote_id`; `procedimento` passa a trazer o nome
-- do pacote quando o item é um.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS aba_finance.ler_orcamentos(UUID);

CREATE FUNCTION aba_finance.ler_orcamentos(p_plano_id UUID)
RETURNS TABLE (
  id                   UUID,
  plano_id             UUID,
  opcao_id             UUID,
  opcao_rotulo         TEXT,
  profissional_id      UUID,
  estado               TEXT,
  desconto_valor       NUMERIC,
  desconto_motivo      TEXT,
  promocao             TEXT,
  parcelas             SMALLINT,
  taxa_juros           NUMERIC,
  taxa_multa_atraso    NUMERIC,
  valor_bruto          NUMERIC,
  valor_liquido        NUMERIC,
  aprovado_em          TIMESTAMPTZ,
  aprovado_por         UUID,
  sou_quem_aprova      BOOLEAN,
  ultima_devolucao     JSONB,
  com_detalhe_clinico  BOOLEAN,
  itens                JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_account_id UUID;
  v_cliente_id UUID;
  v_clinico    BOOLEAN;
BEGIN
  SELECT pf.account_id INTO v_account_id FROM public.profiles pf WHERE pf.user_id = v_user_id;
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  -- Negado devolve VAZIO, nunca exceção: erro explícito confirmaria a
  -- existência do plano a quem não pode enxergá-lo (mesma decisão de
  -- `ler_evolucoes` e `ler_planos`).
  IF NOT (public.is_account_member(v_account_id, 'viewer') AND access.can('finance', 'read')) THEN
    RETURN;
  END IF;

  SELECT p.cliente_id INTO v_cliente_id
  FROM aba_treatment.planos p
  WHERE p.id = p_plano_id AND p.account_id = v_account_id;

  IF v_cliente_id IS NULL THEN
    RETURN;
  END IF;

  v_clinico := aba_treatment.pode_planejar(v_cliente_id, 'leitura');

  -- O log vem ANTES do retorno, e SÓ quando há conteúdo clínico a
  -- devolver. Se viesse depois, uma leitura interrompida no meio
  -- entregaria dado sem deixar rastro — o caso em que o rastro mais
  -- importa.
  IF v_clinico THEN
    INSERT INTO aba_health.log_acesso
      (account_id, usuario_ator_id, cliente_id, tipo_registro, registro_id, acao, contexto)
    VALUES (v_account_id, v_user_id, v_cliente_id, 'plano', p_plano_id, 'leitura',
            jsonb_build_object('via', 'aba_finance.ler_orcamentos'));
  END IF;

  RETURN QUERY
  SELECT
    o.id, o.plano_id, o.opcao_id, op.rotulo, o.profissional_id, o.estado,
    o.desconto_valor, o.desconto_motivo, o.promocao, o.parcelas,
    o.taxa_juros, o.taxa_multa_atraso, o.valor_bruto, o.valor_liquido,
    o.aprovado_em, o.aprovado_por,
    EXISTS (
      SELECT 1 FROM aba_scheduling.profissionais pr
      JOIN public.profiles pf ON pf.id = pr.profile_id
      WHERE pr.id = o.profissional_id AND pr.account_id = o.account_id
        AND pf.user_id = v_user_id
    ),
    -- Só faz sentido em rascunho: aprovado de novo, o aviso já foi atendido.
    CASE WHEN o.estado = 'rascunho' THEN (
      SELECT jsonb_build_object(
               'em', e.ocorrido_em,
               'por', e.ator,
               'por_nome', pf.full_name,
               'colunas', e.colunas)
      FROM aba_finance.eventos_orcamento e
      LEFT JOIN public.profiles pf ON pf.user_id = e.ator AND pf.account_id = e.account_id
      WHERE e.orcamento_id = o.id AND e.tipo = 'devolvido_a_rascunho'
      ORDER BY e.ocorrido_em DESC
      LIMIT 1
    ) END,
    v_clinico,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', i.id,
               'procedimento_plano_id', i.procedimento_plano_id,
               'tipo', CASE WHEN i.pacote_id IS NOT NULL THEN 'pacote' ELSE 'procedimento' END,
               'procedimento_id', i.procedimento_id,
               'pacote_id', i.pacote_id,
               'procedimento', COALESCE(pc.nome, pk.nome),
               'valor_resolvido', i.valor_resolvido,
               'tabela_preco_id', i.tabela_preco_id,
               'tabela_preco', tp.nome,
               'degrau', i.degrau,
               'resolvido_em', i.resolvido_em,
               -- As duas únicas chaves clínicas do retorno, e as duas só
               -- existem quando o alcance existe. `NULL` e não ausente:
               -- a forma do objeto não muda entre os dois casos, para a
               -- tela não ter dois formatos para tratar.
               'dente', CASE WHEN v_clinico THEN to_jsonb(pp.dente) ELSE 'null'::jsonb END,
               'faces', CASE WHEN v_clinico THEN to_jsonb(pp.faces) ELSE 'null'::jsonb END,
               'estado_procedimento', pp.estado)
             ORDER BY COALESCE(pc.nome, pk.nome))
      FROM aba_finance.itens_orcamento i
      LEFT JOIN aba_catalog.procedimentos pc
        ON pc.id = i.procedimento_id AND pc.account_id = i.account_id
      LEFT JOIN aba_catalog.pacotes pk
        ON pk.id = i.pacote_id AND pk.account_id = i.account_id
      JOIN aba_treatment.procedimentos_plano pp
        ON pp.id = i.procedimento_plano_id AND pp.account_id = i.account_id
      LEFT JOIN aba_finance.tabelas_preco tp
        ON tp.id = i.tabela_preco_id AND tp.account_id = i.account_id
      WHERE i.orcamento_id = o.id
    ), '[]'::jsonb)
  FROM aba_finance.orcamentos o
  JOIN aba_treatment.opcoes op ON op.id = o.opcao_id AND op.account_id = o.account_id
  WHERE o.plano_id = p_plano_id AND o.account_id = v_account_id
  ORDER BY op.ordem;
END;
$$;

COMMENT ON FUNCTION aba_finance.ler_orcamentos(UUID) IS
  'Vista financeira do plano. Devolve dente e face SOMENTE a quem tem alcance clinico (aba_treatment.pode_planejar) — e nesse caso registra a leitura em aba_health.log_acesso, uma linha por plano. Sem alcance, o mesmo orcamento sem dente e sem face, e sem log. Desde a 051: item de procedimento ou pacote, quem aprovou, se quem le e quem aprova, e a ultima devolucao a rascunho.';

ALTER FUNCTION aba_finance.ler_orcamentos(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.ler_orcamentos(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.ler_orcamentos(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.ler_orcamentos(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §8b — A porta da RECEPÇÃO até o orçamento
--
-- ACHADO DESTA SUBETAPA, ao desenhar a evidência pela tela: a Conclusão diz
-- "a recepção dá 10% de desconto e o orçamento volta a rascunho", e **a
-- recepção não tinha por onde chegar ao orçamento**. A tela `/plano` lista
-- os planos por `ler_planos()`, que exige alcance clínico — correto, é dado
-- de saúde —, e para quem não o tem devolve vazio. `ler_orcamentos()` já
-- servia a recepção desde a 03.8.a, mas recebe o `plano_id`, e a recepção
-- não consegue descobrir nenhum: a policy de `planos` também passa por
-- `pode_planejar`. A porta financeira existia e estava trancada por fora.
--
-- A saída NÃO é afrouxar `planos`. É uma leitura FINANCEIRA que devolve só
-- o que a recepção precisa para abrir o orçamento: o identificador do plano,
-- a data e as contagens. Nenhum título (texto livre do profissional, revogado
-- na 047), nenhum dente, nenhuma face — e por isso nenhum log clínico: saber
-- que um paciente tem orçamento é dado do financeiro, não do prontuário.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_finance.planos_orcados_do_cliente(p_cliente_id UUID)
RETURNS TABLE (
  plano_id    UUID,
  criado_em   TIMESTAMPTZ,
  orcamentos  INT,
  aprovados   INT
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
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  -- A mesma porta de `ler_orcamentos`: quem lê o financeiro. Negado devolve
  -- vazio, nunca exceção.
  IF NOT (public.is_account_member(v_account_id, 'viewer') AND access.can('finance', 'read')) THEN
    RETURN;
  END IF;

  -- `account_id` reafirmado nas duas tabelas: `SECURITY DEFINER` não passa
  -- por RLS.
  RETURN QUERY
  SELECT p.id, p.criado_em,
         count(o.id)::INT,
         (count(o.id) FILTER (WHERE o.estado = 'aprovado'))::INT
  FROM aba_treatment.planos p
  JOIN aba_finance.orcamentos o ON o.plano_id = p.id AND o.account_id = p.account_id
  WHERE p.cliente_id = p_cliente_id AND p.account_id = v_account_id
  GROUP BY p.id, p.criado_em
  ORDER BY p.criado_em;
END;
$$;

COMMENT ON FUNCTION aba_finance.planos_orcados_do_cliente(UUID) IS
  'A porta da recepção até o orçamento: identificador, data e contagens dos planos do paciente que têm orçamento. Sem título, sem dente, sem face — e sem log clínico. O conteúdo do orçamento sai por ler_orcamentos(plano_id).';

ALTER FUNCTION aba_finance.planos_orcados_do_cliente(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_finance.planos_orcados_do_cliente(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_finance.planos_orcados_do_cliente(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION aba_finance.planos_orcados_do_cliente(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- §8c — As FASES são catálogo da conta, e quem monta o plano precisa lê-las
--
-- DEFEITO DA `045`, ACHADO PELA EVIDÊNCIA DE TELA DESTA SUBETAPA — e medido
-- em produção antes de escrito como causa (`CLAUDE.md` §11). O profissional
-- de demonstração, com concessão nominal de prontuário para o paciente,
-- abria o plano, criava opção e diagnóstico, e o botão de gravar a célula
-- nunca habilitava. Sessão dele simulada por `request.jwt.claims`:
-- `access.can('treatment','read')` = true, `aba_health.pode_acessar(NULL,
-- 'leitura')` = false, **fases visíveis = 0**.
--
-- A causa é a policy `fases_select` da `045`: `pode_planejar(NULL,
-- 'leitura')` pergunta pelo alcance clínico GERAL ("esta pessoa enxerga
-- prontuário em geral?"). A concessão NOMINAL — o mecanismo pelo qual o
-- produto dá a um profissional o caso de um paciente, sem abrir todos —
-- responde "não" a essa pergunta, por definição. Resultado: quem tem o
-- paciente não tem as linhas da matriz. Ficou invisível desde a 03.8 porque
-- todo teste e toda evidência montaram plano como `owner`, que passa por
-- atalho em `pode_acessar`.
--
-- `fases` não guarda nada de paciente: chave, rótulo, ordem e se está ativa
-- — "Emergência", "Definitiva", "Manutenção". É o mesmo tipo de catálogo que
-- `tipos_profissional` e `procedimentos`, que se leem pelo módulo, não pelo
-- prontuário. A leitura passa a ser do MÓDULO Plano; a ESCRITA continua
-- exigindo `admin` e alcance clínico, como a `045` definiu.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS fases_select ON aba_treatment.fases;
CREATE POLICY fases_select ON aba_treatment.fases FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('treatment', 'read'));

-- ---------------------------------------------------------------------
-- §9 — VERIFICAÇÕES QUE RECUSAM A MIGRATION
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_sobra    TEXT;
  v_n        INT;
  v_funcoes  TEXT[] := ARRAY['validar_procedimento_plano','conferir_teto_de_quantidade','consentir_opcao',
                             'ler_planos','reajustar_tabela_preco','resolver_preco_item','resolver_preco',
                             'conferir_item_orcamento','montar_orcamento','simular_troca_de_profissional',
                             'trocar_profissional_do_orcamento','guardar_aprovacao_orcamento',
                             'aprovar_orcamento','ler_orcamentos','planos_orcados_do_cliente'];
BEGIN
  -- (a) a tabela nova tem RLS e policy
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'aba_finance.eventos_orcamento'::regclass) THEN
    RAISE EXCEPTION 'RLS não está ligada em aba_finance.eventos_orcamento.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'aba_finance.eventos_orcamento'::regclass) THEN
    RAISE EXCEPTION 'aba_finance.eventos_orcamento sem policy.';
  END IF;

  -- (b) nenhuma chave estrangeira multi-inquilino sem `account_id` — as
  -- quatro chaves novas (célula, tarifa, item e evento) incluídas
  SELECT count(*) INTO v_n FROM public.fks_sem_isolamento_de_conta();
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Há % chave(s) estrangeira(s) multi-inquilino sem account_id.', v_n;
  END IF;
  IF NOT (pg_get_functiondef('public.fks_sem_isolamento_de_conta()'::regprocedure) LIKE '%aba_finance%'
      AND pg_get_functiondef('public.fks_sem_isolamento_de_conta()'::regprocedure) LIKE '%aba_treatment%'
      AND pg_get_functiondef('public.fks_sem_isolamento_de_conta()'::regprocedure) LIKE '%aba_catalog%') THEN
    RAISE EXCEPTION 'A auditoria de isolamento não alcança um dos schemas tocados por esta migration.';
  END IF;

  -- (c) nenhuma função tocada executável por PUBLIC ou anon — e
  -- `ler_orcamentos`, recriada, voltou a ser de `authenticated`
  SELECT string_agg(p.proname, ', ') INTO v_sobra
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('aba_finance','aba_treatment')
    AND p.proname = ANY (v_funcoes)
    AND (has_function_privilege('public', p.oid, 'EXECUTE')
         OR has_function_privilege('anon', p.oid, 'EXECUTE'));
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'Função executável por PUBLIC/anon: %', v_sobra;
  END IF;
  IF NOT has_function_privilege('authenticated', 'aba_finance.ler_orcamentos(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ler_orcamentos foi recriada e perdeu o EXECUTE de authenticated.';
  END IF;
  -- A porta da recepção não devolve texto nem coluna clínica — lido no
  -- catálogo, na lista de colunas do retorno.
  IF pg_get_function_result('aba_finance.planos_orcados_do_cliente(uuid)'::regprocedure)
     ~* '(titulo|observacao|descricao|dente|faces)' THEN
    RAISE EXCEPTION 'planos_orcados_do_cliente passou a devolver conteúdo clínico — ela é a porta da recepção.';
  END IF;
  IF has_function_privilege('authenticated', 'aba_finance.guardar_aprovacao_orcamento()', 'EXECUTE') THEN
    RAISE EXCEPTION 'guardar_aprovacao_orcamento (gatilho) executável por authenticated.';
  END IF;

  -- (d) a trilha de aprovação não é escrevível por quem ela registra
  IF has_table_privilege('authenticated', 'aba_finance.eventos_orcamento', 'INSERT')
     OR has_table_privilege('authenticated', 'aba_finance.eventos_orcamento', 'UPDATE')
     OR has_table_privilege('authenticated', 'aba_finance.eventos_orcamento', 'DELETE')
     OR has_table_privilege('authenticated', 'aba_finance.eventos_orcamento', 'TRUNCATE')
     OR has_table_privilege('anon', 'aba_finance.eventos_orcamento', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') THEN
    RAISE EXCEPTION 'eventos_orcamento ficou escrevível por authenticated ou alcançável por anon — trilha que o usuário escreve é trilha forjável.';
  END IF;

  -- (e) O PREÇO SE RESOLVE, NÃO SE ESCOLHE — nas duas assinaturas
  IF pg_get_function_identity_arguments('aba_finance.resolver_preco(uuid,uuid,uuid,date)'::regprocedure) ILIKE '%tabela%'
     OR pg_get_function_identity_arguments('aba_finance.resolver_preco_item(uuid,uuid,uuid,uuid,date)'::regprocedure) ILIKE '%tabela%' THEN
    RAISE EXCEPTION 'A escada ganhou parâmetro de tabela de preço — o preço voltaria a ser ESCOLHIDO.';
  END IF;

  -- (f) UMA escada: o grupo continua no grau 2 da escada única, e o
  -- repasse não carrega regra própria
  IF pg_get_functiondef('aba_finance.resolver_preco_item(uuid,uuid,uuid,uuid,date)'::regprocedure)
     !~ 'WHEN ''grupo_paciente''\s+THEN 2' THEN
    RAISE EXCEPTION 'grupo_paciente não está no grau 2 da escada única.';
  END IF;
  IF pg_get_functiondef('aba_finance.resolver_preco(uuid,uuid,uuid,date)'::regprocedure) !~ 'resolver_preco_item'
     OR pg_get_functiondef('aba_finance.resolver_preco(uuid,uuid,uuid,date)'::regprocedure) ~ 'tarifas' THEN
    RAISE EXCEPTION 'resolver_preco deixou de ser repasse da escada única — duas escadas divergem.';
  END IF;

  -- (g) os três arcos existem, com exatamente os dois braços (D-F6)
  SELECT string_agg(x.tab, ', ') INTO v_sobra
  FROM (VALUES
    ('aba_treatment.procedimentos_plano', 'procedimentos_plano_um_item'),
    ('aba_finance.tarifas',               'tarifas_um_item'),
    ('aba_finance.itens_orcamento',       'itens_orcamento_um_item')
  ) AS x(tab, con)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = x.tab::regclass AND c.conname = x.con
      AND pg_get_constraintdef(c.oid) ~ 'num_nonnulls\(procedimento_id, pacote_id\) = 1');
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'Arco procedimento/pacote ausente ou diferente em: %', v_sobra;
  END IF;

  -- (h) A FRONTEIRA CLÍNICA NÃO AFROUXOU: o orçamento e a trilha seguem
  -- sem dado clínico, e na célula `dente`/`faces` seguem ilegíveis enquanto
  -- `pacote_id` é legível
  SELECT string_agg(table_name || '.' || column_name, ', ') INTO v_sobra
  FROM information_schema.columns
  WHERE table_schema = 'aba_finance'
    AND table_name IN ('itens_orcamento','orcamentos','eventos_orcamento')
    AND column_name IN ('dente','faces','descricao','observacao','titulo');
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'O orçamento passou a guardar dado clínico (%) — porta lateral para fora de aba_health.', v_sobra;
  END IF;
  IF has_column_privilege('authenticated', 'aba_treatment.procedimentos_plano', 'dente', 'SELECT')
     OR has_column_privilege('authenticated', 'aba_treatment.procedimentos_plano', 'faces', 'SELECT') THEN
    RAISE EXCEPTION 'dente/faces de procedimentos_plano voltaram a ser legíveis por authenticated.';
  END IF;
  IF NOT has_column_privilege('authenticated', 'aba_treatment.procedimentos_plano', 'pacote_id', 'SELECT') THEN
    RAISE EXCEPTION 'pacote_id nasceu ilegível — a tela não saberia qual pacote a célula carrega.';
  END IF;

  -- (i) a regra de aprovação cobre INSERT e UPDATE
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'aba_finance.orcamentos'::regclass
      AND t.tgname = 'trg_orcamentos_aprovacao' AND NOT t.tgisinternal
      AND (t.tgtype & 4) <> 0   -- INSERT
      AND (t.tgtype & 16) <> 0  -- UPDATE
  ) THEN
    RAISE EXCEPTION 'trg_orcamentos_aprovacao ausente ou sem cobrir INSERT e UPDATE.';
  END IF;

  -- (j) a alçada financeira continua de pé — a devolução a rascunho não
  -- substitui a trava de quem mexe em dinheiro, ela vem DEPOIS dela
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'aba_finance.orcamentos'::regclass
      AND t.tgname = 'trg_orcamentos_alcada' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'A alçada financeira sumiu de orcamentos.';
  END IF;

  -- (j2) fases: a leitura é do módulo e a escrita continua clínica e de
  -- `admin`. E a tabela segue sendo catálogo — se um dia ganhar coluna de
  -- paciente, a leitura pelo módulo deixa de ser aceitável, e isto recusa.
  IF EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'aba_treatment.fases'::regclass AND p.polname = 'fases_select'
      AND pg_get_expr(p.polqual, p.polrelid) ~ 'pode_(planejar|acessar)'
  ) THEN
    RAISE EXCEPTION 'fases_select voltou a exigir alcance clínico geral — quem tem concessão nominal não monta a matriz.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'aba_treatment.fases'::regclass AND p.polname = 'fases_insert'
      AND pg_get_expr(p.polwithcheck, p.polrelid) ~ 'pode_planejar'
  ) THEN
    RAISE EXCEPTION 'fases_insert deixou de exigir alcance clínico.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'aba_treatment' AND table_name = 'fases'
      AND column_name IN ('cliente_id','plano_id','dente','faces','descricao','observacao')
  ) THEN
    RAISE EXCEPTION 'aba_treatment.fases ganhou coluna de paciente — a leitura pelo módulo deixou de ser aceitável.';
  END IF;

  -- (k) A RÉGUA DE `aba_finance`: nenhuma função tocada escreve nas tabelas
  -- mantidas por gatilho. A cobrança é da 03.8.b.
  SELECT string_agg(p.proname, ', ') INTO v_sobra
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('aba_finance','aba_treatment')
    AND p.proname = ANY (v_funcoes)
    AND pg_get_functiondef(p.oid) ~*
        '(insert\s+into|update|delete\s+from)\s+aba_finance\.(faturas|itens_fatura|pagamentos|pacotes_cliente|saldos_pacote|extrato_pacote|contratos)';
  IF v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'Função da 03.8.c escreve em tabela de cobrança ou contrato (%) — isso é da 03.8.b.', v_sobra;
  END IF;
END $$;
