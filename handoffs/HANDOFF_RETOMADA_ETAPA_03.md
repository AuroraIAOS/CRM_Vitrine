# HANDOFF — retomada da Etapa 03 depois da pesquisa `analise-ice`

> **⚠️ Nota de vocabulário (Subetapa 03.6.b, 2026-09-04) — este documento NÃO foi renomeado, de propósito.**
> Ele é registro do que foi medido numa data, e `CLAUDE.md` §10 manda não reescrever registro. Onde se lê
> `aba_catalog.servicos`, hoje é **`aba_catalog.procedimentos`**; onde se lê `aba_catalog.planos`,
> `itens_plano`, `planos_cliente`, `saldos_plano`, `extrato_plano` e `vender_plano()`, hoje são
> **`pacotes`**, `itens_pacote`, `pacotes_cliente`, `saldos_pacote`, `extrato_pacote` e `vender_pacote()`;
> `servico_id` é **`procedimento_id`** e `plano_id` é **`pacote_id`**. E, mais importante que os nomes:
> a palavra **"plano"** passou a significar **só o planejamento clínico personalizado** (decisão D-V1 de
> Max). O que este texto chama de "plano" no sentido de combo pré-pago hoje se chama **pacote**.
> Tabela completa dos cinco termos em `docs/02_MODELO_DE_DADOS.md` §13.1.


Escrito em **2026-09-04**, em `main`, logo depois do merge de `analise-ice` ordenado por Max.
É o passo 9 — e último — da sequência acordada na abertura daquela pesquisa.

**Para quem abre a próxima sessão:** este documento é a ponte. Leia-o inteiro antes de agir, e
depois vá às fontes que ele aponta — ele resume, não substitui.

---

> ## ✅ CONSUMIDO em 2026-09-04, pela Subetapa 03.0.a
>
> **Este handoff cumpriu a função dele e fica como registro** — nada aqui se apaga. O que ele
> mandou fazer foi feito, e as quatro decisões que ele deixou em aberto foram respondidas por Max.
>
> **A tarefa 1 (o merge) foi executada** — commit `6f694a2`. O conflito em `handoffs/instrucoes.md`
> ocorreu exatamente onde este documento previu, e a resolução manteve as duas listas inteiras:
> `82 (branch) + 75 (main) − 72 (base) = 85` entradas, sem perda nem duplicata, com
> `grep -c '^# INSTRUÇÕES'` devolvendo `1`. **Nenhum outro arquivo colidiu**, como previsto.
>
> **As quatro decisões, respondidas por Max em 2026-09-04:**
>
> | # | Resposta |
> |---|---|
> | **D-I3** | **Sim, partir a 03.8** em 03.8 (clínica) + 03.8.a (financeira). E, junto: **a 03.7 NÃO se parte** — remover a biblioteca e entregar metade do substituto deixa `/prontuario` quebrado; o teto sobe de 5 para 6 |
> | **D-I4** | **Numerar `03.6.a` e `03.7.a`**, sem tocar no Status das originais. Reescrever no lugar exigiria um quinto marcador em `CLAUDE.md` §8, e nenhum dos quatro serve |
> | **D-I5** | **Entram quatro: 34, 35, 36 e 41**, todos absorvidos por subetapas existentes. **O MVP passa de 26 para 30 itens.** Os demais (37, 38, 39, 40, 42-49) ficam no Backlog de versionamento |
> | **D-I6** | **Não agora.** O material bruto foi medido e continua em disco (`~/.claude/jobs/analise-ice/`, **95 MB**) — virou pendência vigiada, porque o diretório vive fora do controle de versão |
>
> **As duas pendências pequenas do §7 foram varridas.** O `README.md` estava desatualizado em três
> pontos (não dois): "24 itens", "24 subetapas" e "Próximo passo: Subetapa 03.4". E a contagem
> errada estava em **mais um lugar** do que este handoff previu — o cabeçalho de
> `docs/00a_PLANO_ETAPA_03.md` dizia "as 24 subetapas" com 26 linhas na tabela abaixo. Todos
> corrigidos, e a lição virou entrada em `handoffs/instrucoes.md` §5.
>
> **Uma correção de precisão neste documento**, medida e registrada em vez de silenciada: a tabela
> do §4 (D-I2) conta as ocorrências de `aba_budget` em quatro lugares e conclui "nenhum outro". O
> `grep` sobre o repositório inteiro achou **três a mais** — `design/benchmark/RELATORIO.md:337`
> (ponteiro **vivo** do item 34, corrigido para `aba_treatment`) e duas em
> `design/benchmark/00_PLANO_DE_ACAO_ICE.md`, que são registro histórico e **não** se corrigem.
>
> **O plano revisado está em `docs/00_PLANO_E_CRITERIOS.md`** (Subetapa 03.0.a e as subetapas
> 03.6.a, 03.7.a, 03.8 e 03.8.a), com o recorte enxuto sincronizado em `docs/00a_PLANO_ETAPA_03.md`
> e o desenho de `aba_treatment` em `docs/02_MODELO_DE_DADOS.md` §12.

---

## 1. Onde estamos

| | |
|---|---|
| **Etapa 03** | pausada na **Subetapa 03.8**, antes da primeira linha de código dela |
| **Concluídas** | 03.0, 03.2, 03.3, 03.4, 03.5, 03.6, 03.7 (sete) |
| **Branch de trabalho** | `etapa-03/plano-mvp-odontologico` — 52 arquivos, 5.092 linhas fora de `main` |
| **`main`** | `ad3819d` — contém o benchmark completo (4 rodadas) e **nenhuma linha de `crm/`, `db/` ou `docs/` da Etapa 03** |
| **Arquivo congelado** | branch `arquivo/odontograma-tool01` e tag `odontograma-tool01`, ambos em `7f15dc5` |

**O que a pesquisa `analise-ice` foi:** 424 páginas do help center do ICE Health System e 32
vídeos (dois de ~50 min, com transcrição lida do início ao fim), coletados em 2026-09-03 e
fundidos em `main` em 2026-09-04. Ela não altera o produto — produz **parecer**.

---

## 2. Leitura obrigatória, nesta ordem

1. **`CLAUDE.md`** — as 15 regras permanentes.
2. **`handoffs/instrucoes.md`** — abertura obrigatória (`CLAUDE.md` §10). **Três entradas novas na
   §5** vieram da pesquisa; e as da 03.7 (CSS global, precache, singleton, suíte que mede a
   projeção) continuam valendo como método mesmo com o componente mudando.
3. **`design/benchmark/RELATORIO_DE_IMPACTO_ICE.md`** — ★ **o documento central desta retomada.**
   Diz, subetapa por subetapa, o que reabre, o que se redesenha e o que se acrescenta.
4. **`design/benchmark/fontes/ice.md`** — a fonte detalhada, quando o relatório de impacto
   resumir demais. Em especial §3 (odontograma), §4 (plano de tratamento), §5.2 (tabela de preço),
   §5.6 (**a inversão brasileira do faturamento**) e §6 (papéis).
5. **`design/benchmark/capturas/ice/INDICE.md`** — 54 evidências, cada uma com a tese que sustenta.
6. **`docs/00_PLANO_E_CRITERIOS.md`** — o bloco "⏸️ PAUSA DA ETAPA 03" e as Subetapas 03.6, 03.7
   e 03.8.

---

## 3. A PRIMEIRA TAREFA, e ela tem uma armadilha conhecida

O branch da Etapa 03 **não tem** o resultado da pesquisa. Antes de qualquer outra coisa:

```bash
git checkout etapa-03/plano-mvp-odontologico
git merge main
```

**Vai dar conflito em `handoffs/instrucoes.md`, e isso está previsto.** O arquivo foi tocado nos
dois lados: três entradas novas na §5 vindas da pesquisa, e as entradas das subetapas 03.3 a 03.8
no branch da Etapa 03.

**A resolução correta é manter as duas listas inteiras**, em ordem cronológica de subetapa.
**Nenhuma entrada se apaga** (`CLAUDE.md` §10). Depois de resolver:

```bash
grep -c '^# INSTRUÇÕES' handoffs/instrucoes.md    # tem de devolver 1
```

Esse `grep` existe porque o arquivo já esteve colado dentro de si mesmo por dois commits, com uma
entrada partida ao meio (Subetapa 02.14). **Nenhum outro arquivo colide** — a pesquisa não tocou
em `crm/`, `db/` nem `docs/`.

---

## 4. As duas decisões já tomadas, e o que elas obrigam

### D-I1 — o odontograma passa a ser AUTORAL *(Max, 2026-09-03)*

> *"Vamos construir o nosso […] de forma a ter um desenho totalmente autoral e de fácil
> remodelagem (provavelmente eu irei redesenhar os SVG). Contudo, não apaguem o que já foi feito
> com base no TOOL_Odontogram01."*

**O que foi medido e motivou:** o clique de `react-advanced-odontogram` é no **dente**, nunca na
face — `onToothClick(toothNo, evt)` só mexe em `selectedTeeth` —, e o único popover é exclusivo de
toque, com um botão "info" que apenas rola a página até o painel lateral. Detalhe e prova em
`RELATORIO_DE_IMPACTO_ICE.md` §2.1.

**O que a retomada tem de fazer:**

- **Sai** `react-advanced-odontogram` e o que existia só para domá-lo:
  `crm/scripts/escopar_css_odontograma.mjs`, `odontograma-escopado.css`, os `globIgnores`
  específicos do pacote, a forma pristina e o reset por `chaveSessao`.
- **Fica** a coluna `aba_health.evolucoes.marcacoes` (migration `025`) — **é o que mais importa**,
  e nada na pesquisa dá razão para mudá-la. Ficam também os 6 casos de ataque de
  `crm/tests/rls/05_aba_health.spec.ts` (testam o banco, não o componente),
  `crm/scripts/conferir_precache.mjs` (protege contra a próxima dependência pesada, seja qual for)
  e o **método** de `crm/scripts/evidencia_odontograma.mjs` — o ciclo clínico completo que ele
  exercita é exatamente o que a versão nova tem de provar.
- **O ponto de partida existe e está provado:** `design/benchmark/gerar_dentes_svg.mjs` gera três
  dentes (incisivo 11, pré-molar 14, molar 16) com 5 faces + coroa + 1 a 3 raízes cada, e
  `provar_dentes_svg.mjs` os valida em navegador real — **18/18 asserções verdes**, 24 cliques
  devolvendo região e dente corretos. **2,6-2,9 KB por dente**, geometria paramétrica.
- **O requisito que Max acrescentou:** *"provavelmente eu irei redesenhar os SVG"*. Isso torna o
  SVG um **contrato de nomes**: o componente depende dos `id` e dos `data-face`/`data-regiao`,
  **nunca da geometria**. Quem trocar o desenho respeita os identificadores e o componente não
  percebe. **Escreva um validador que roda no build e falha se um dente perder uma região
  nomeada** — no padrão de `escopar_css_odontograma.mjs --verificar` e de
  `conferir_precache.mjs`, que a 03.7 já provou funcionar. Sem ele, um redesenho silencioso quebra
  o orçamento e ninguém vê.
- **Medir antes e depois**, pelo método do §5 de `design/ux/06_ORCAMENTO_DE_PESO.md`. O chunk do
  odontograma mede hoje **414.738 B gzip** + 10.459 B de CSS; o precache tem teto de 1.400 KiB.
  A queda é esperada e provavelmente grande — **mas é hipótese até ser medida** (`CLAUDE.md` §11),
  e a 03.3 já mostrou que a projeção erra.

**Consultar o que foi arquivado:** `git checkout arquivo/odontograma-tool01` (ou a tag
`odontograma-tool01`). Nada foi apagado.

### D-I2 — o schema é `aba_treatment` *(Max, 2026-09-03)*

Chave de módulo `treatment`, label **"Planos de tratamento"**. **"Orçamento" continua sendo a
palavra da interface** — o paciente e a recepção esperam essa palavra, e o schema não aparece na
tela.

**Os lugares foram contados, não supostos** (`grep` no branch da Etapa 03):

| Onde | Ocorrências de `aba_budget` | O que fazer |
|---|---|---|
| `docs/00_PLANO_E_CRITERIOS.md:618` | 1 | a decisão de 2026-09-03 **não se apaga**: ganha ao lado o registro da revisão |
| `docs/00a_PLANO_ETAPA_03.md:217` | 1 | idem — é a mesma frase, duplicada nos dois planos |
| `CLAUDE.md` §2 | **0** | nunca foi escrito lá. Basta **acrescentar** `aba_treatment` à lista quando a subetapa nascer |
| `docs/02_MODELO_DE_DADOS.md` §11 | **0** | o nome não está lá; a §11.2 muda por **outro** motivo (ver §5 abaixo) |

---

## 5. O que muda em cada subetapa — resumo, com o detalhe no relatório de impacto

### Reabre trabalho concluído

**03.7 (odontograma)** — reabre por D-I1, e por mais três achados. **O mais grave é nosso, não do
ICE:** `crm/src/features/health/odontograma.ts:96` define

```js
export function facesDoDente(dente) {
  return [...new Set([...lista(dente.caries), ...lista(dente.fillingSurfaces)])].sort();
}
```

com o comentário, escrito na própria 03.7: *"É este conjunto que a 03.8 cobra por face."* **Mas
`caries` e `fillingSurfaces` são ACHADOS** — onde há doença. A face que se orça é onde se vai
**trabalhar**: podem coincidir, ou não (restauração MOD sobre cárie só na oclusal; selante em face
hígida). Não daria erro — geraria orçamento coerente consigo mesmo e errado quanto ao negócio.
**No ICE, achado e procedimento são duas entradas separadas, cada uma com sua seleção de faces.**
A correção é de **projeção, não de schema**.

Mais: a dentição deve virar **estado por dente** (erupcionado / não erupcionado / ausente /
removido / supranumerário / substituído), derivado da idade e editável — e as quatro maneiras de
dizer "não está na boca" têm consequências **diferentes**. E os três estados atuais viram cinco,
com `executado` deixando de ser **derivado** para ser **fato afirmado**, porque a trava de
finalização de contrato (§6) não se apoia em inferência.

**03.6 (catálogo)** — `aceita_faces` é booleano; a regra do código no ICE sabe **quantas faces
aceita e se é anterior ou posterior**, e carrega **requisitos por código** (termo de
consentimento, termo informado, achado diagnóstico obrigatório). Colunas aditivas em
`aba_catalog.servicos`, sem tocar nas 64 linhas da semente SIGTAP. Sem P-sub.

### Redesenha trabalho não iniciado

**03.8** — redesenhada por inteiro, e **sem uma linha para desfazer**. Ver §6 abaixo, que é a parte
mais importante deste handoff.

### Efeito em cascata

**03.9** reforçada (a escada de preço usa clínica e grupo de clínicas). **03.16** redesenha —
alertas viram **health facts** com significância. **03.16.a** ganha desenho para o item 25-MVP.
**03.17** ganha mecanismo (*warnings*: relatório que vira item de ação). **03.11** ganha o item 47
(o tipo do arquivo governa o acesso). **03.21.a** ganha a referência forte dos dois logins do vídeo
de 50 min. **03.22** ganha um acréscimo ao parecer.

---

## 6. A Subetapa 03.8, redesenhada — leia esta seção duas vezes

### A inversão brasileira, que contradiz a fonte *(instrução de Max, 2026-09-03)*

**No ICE a cobrança nasce da EXECUÇÃO** — o status `Completed` do procedimento. **No Brasil é
comum o inverso:** o paciente paga adiantado, e a fatura sai da **apresentação e aprovação do
plano — da assinatura do contrato**. Quem esperar o dentista marcar a face trabalhada para faturar
não fatura nunca.

**As duas metades da regra, e as duas são obrigatórias:**

1. **A cobrança se solta na aprovação do plano/contrato**, livre e antes de qualquer execução.
2. **O contrato não se finaliza** enquanto não forem verdadeiras ao mesmo tempo: (a) o paciente
   pagou **tudo**, e (b) o profissional executou o trabalho em **todas as faces de todos os dentes
   planejados**.

**A consequência de modelagem:** "terminou?" passa a ser derivado de **duas fontes independentes**
— o saldo em `aba_finance` e a cobertura de execução por face em `aba_health`. **Nenhuma responde
sozinha.**

> ⚠️ **A armadilha, nomeada antes de acontecer:** declarar o contrato concluído no último
> pagamento. É o simétrico exato do que a 02.10 já pagou (`instrucoes.md` §5) — o agendador zerou
> o KPI "Vencido" porque a fatura saía do contador exatamente quando virava pendência. Aqui, o
> contrato sairia da lista de pendências no momento em que o paciente termina de pagar e ainda tem
> trabalho a receber, que é o pior momento possível.

**O que o ICE já tem que serve** (e impede a regra de virar invenção): `PL Planned` *"does not
create financial charge, **but you can accept pre-payment for it**"*; o saldo `Total Prepayment` é
definido sobre procedimentos **planejados**; o plano de pagamento não-ortodôntico é criado para
*"**planned** or completed procedures"*. **O que o ICE não tem:** contrato. Termo de consentimento
e plano de pagamento não fecham o ciclo um do outro.

### A entidade não é uma lista de itens com preço

É uma **matriz**: **fases clínicas** como linhas (Emergency · Systemic · Acute · Disease Control ·
Definitive · Maintenance, configuráveis), **opções concorrentes** como colunas (A, B, …, número
livre), **diagnóstico atravessando as colunas** com o procedimento aninhado dentro dele, e uma
lista de **diagnósticos não fasados** como fila de trabalho. Ver `fontes/ice.md` §4 e a captura
`site_11_treatment_planning_guia.jpeg`, que é o guia oficial anotado pelo próprio fornecedor.

### O preço não é campo da linha

Resolve-se por escada — `Paciente > Tipo de profissional > Clínica > Grupo de clínicas > Prática`
— no momento do lançamento, **sem ninguém escolher tabela na tela**. Prova ao vivo: a mesma
consulta custa **$250** com um profissional comum e **$400** com um especialista. O convênio PPO
fica **fora** da escada: entra como **ajuste contratual** sobre a diferença, que é lançamento
nomeado e reportável.

**Isso corrige a nota da 03.8 em `docs/02_MODELO_DE_DADOS.md` §11.2**, que registra
`variante_servico_id` como tabela de preço **na linha**. Guardar a tabela na linha obriga alguém a
escolhê-la na tela — que é o que essa arquitetura existe para evitar. **Guardar o valor resolvido
na linha, com a tabela que o resolveu como proveniência, é diferente e correto:** congela o preço
no momento do acordo e diz de onde veio. E **trocar o profissional recalcula** — o ICE avisa a
diferença e o ajuste antes de confirmar.

**Efeito em `aba_catalog`:** a escada exige que a tabela de preço seja entidade **com vigência**
(item 41): rascunho editável, compromisso com data, tarifa comprometida **imutável**. Hoje um
reajuste seria `UPDATE`, e reescreveria o passado do financeiro.

### O PDF e o consentimento

A decisão preliminar de Max — vista de impressão + `window.print()`, sem dependência nova —
**está reconfirmada**. O ICE também não usa biblioteca de PDF no fluxo de consentimento: gera um
**documento a partir de um modelo**, e o modelo decide o que aparece; com o tipo de pergunta
`Consent Table`, exibe o tratamento **por fase com as estimativas de convênio**, e pode ser
configurado para **manter a conversa financeira separada**.

O que muda é **o que se imprime**: o termo é uma **seleção** (quais procedimentos entram, com
"selecionar todos" por fase ou por opção) mais uma **escolha de apresentação** (com ou sem valor).

**Mais duas regras que faltavam:** **recusa implícita** — consentir a Opção A marca os
procedimentos da B **para o mesmo diagnóstico** como recusados, e o registro de que o paciente
escolheu A **e recusou B** é o que protege a clínica depois; e **re-consentimento com gatilho
explícito** — mudar **dente** ou **código** exige termo novo, mudar **face**, **fase**, **opção**
ou **diagnóstico vinculado** não exige.

### O que continua valendo da 03.8 original

A régua de `aba_finance`: a aprovação passa pelas seis operações já provadas (`vender_plano`,
`estornar_sessao`, `atualizar_status_fatura`, `marcar_faturas_vencidas`, `expirar_planos`,
`planos_vencendo_em`), **nunca por `INSERT` direto** nas tabelas mantidas por trigger. E o **P-sub
obrigatório** — que agora tem um caminho a mais para atacar: um procedimento que exige
consentimento e não o tem **não pode ser aprovado nem faturado**, e essa trava vive no banco, pelo
mesmo argumento que a 03.6 usou para `quantidade_maxima`.

---

## 7. As quatro decisões que faltam, e são de Max

Nenhuma bloqueou o merge; o lugar delas é **esta** sessão, com `docs/00` aberto na frente.

| # | Decisão | Recomendação já registrada |
|---|---|---|
| **D-I3** | Partir a 03.8 em **03.8** (clínica: fases, opções, diagnóstico↔procedimento, dente/faces, estados, requisitos — *sem dinheiro*) + **03.8.a** (financeira: resolução de preço, aprovação de contrato, cobrança antecipada, trava dupla, termo) | **Sim** — o redesenho a deixou grande demais para 5 tentativas, e o corte é natural: o primeiro bloco é clínico, o segundo é financeiro, com portões de qualidade diferentes |
| **D-I4** | A forma de reabrir 03.6 e 03.7 | Status antigo **não se apaga** — ganha o registro da revisão ao lado, no padrão que `docs/00` já fixou para a pausa |
| **D-I5** | Quais dos itens 34-49 entram no MVP | Quadro de prioridade em `RELATORIO_DE_IMPACTO_ICE.md` §4. Em resumo: **34 e 36 são parte da 03.8**, não acréscimos a ela; **35 e 41** são baratos agora e caros depois; **48 (periodontia)** e **49 (ortodontia)** ficam no futuro, por decisão de Max |
| **D-I6** | Se quer as **pesquisas dedicadas** de periodontia e ortodontia | Disponíveis **sem nova coleta** — o bruto está em `~/.claude/jobs/analise-ice/`. 10 das 20 páginas do tema já foram lidas |

**Sugestão de forma, para Max derrubar se quiser:** abrir uma **Subetapa 03.0.a — Revisão do plano
da Etapa 03 à luz da pesquisa `analise-ice`**, no modo `[Plan]`, que responda D-I3 a D-I6, atualize
`docs/00`, `docs/00a`, `docs/02` e `CLAUDE.md` §2, e reescreva as Subetapas 03.6, 03.7 e 03.8 antes
de qualquer código. É a mesma convenção `0X.0` que a Etapa 03 já usou, e o sufixo `.a` segue o
precedente de 03.13.a e 03.21.a — **inserir sem renumerar**.

**Duas pendências pequenas que essa subetapa deve varrer junto**, medidas em 2026-09-04 e não
corrigidas aqui de propósito:

1. **`README.md` está desatualizado nos dois branches, e de formas diferentes.** Em `main` diz
   *"Próximo passo: **Subetapa 03.0**"*; no branch da Etapa 03 diz *"Próximo passo: **Subetapa
   03.4**"* e fala em **24 itens do MVP**, quando hoje são **26**. **Não foi corrigido nesta
   sessão de propósito:** mexer no README de `main` criaria um terceiro estado e um conflito extra
   no merge da §3. Corrija-o **no branch da Etapa 03**, depois do merge, onde ele já está mais
   adiantado.
2. **A contagem "24 itens" pode estar em mais lugares.** `grep -rn "24 itens\|24 recursos" docs/
   README.md handoffs/` antes de fechar a revisão — a mesma varredura que a 03.4 fez por literais
   de status, e pelo mesmo motivo: quem escreve o número lembra dele, quem lê é que esquece.

---

## 8. O que NÃO fazer

- **Não apagar Status antigo.** Subetapa reaberta ganha o registro da revisão **ao lado**
  (`CLAUDE.md` §8 e §10).
- **Não apagar o branch `arquivo/odontograma-tool01` nem a tag `odontograma-tool01`.** Max os
  pediu para consultar ao longo do tempo.
- **Não implementar item fora do MVP** (`CLAUDE.md` §15). Os itens 34-49 são **reportados**; o que
  entra em escopo é decisão de Max (D-I5).
- **Não fundir nada em `main` por conta própria** (`CLAUDE.md` §13), nem com tudo verde.
- **Não copiar a estética do ICE.** O produto é visualmente arcaico e sobrecarregado; o interesse
  é estrutura, campo de formulário, caminho feliz e caminho alternativo.
- **Não confiar na descrição da subetapa como fonte.** Quatro vezes na Etapa 03 confrontar a
  premissa com o repositório derrubou algo (03.5, 03.6, 03.8 e a própria pesquisa) — e na última
  o que caiu era **código já escrito e verde**. A descrição é a última cópia da fonte, não a fonte.

---

## 9. Prompt de abertura sugerido

> CODE, vamos retomar a Etapa 03 depois da pesquisa `analise-ice`, que já foi fundida em `main`.
>
> Leia, nesta ordem: `CLAUDE.md`; `handoffs/instrucoes.md`;
> **`handoffs/HANDOFF_RETOMADA_ETAPA_03.md`** (é a ponte, escrito para esta sessão);
> `design/benchmark/RELATORIO_DE_IMPACTO_ICE.md`; e o bloco "⏸️ PAUSA DA ETAPA 03" de
> `docs/00_PLANO_E_CRITERIOS.md`.
>
> Trabalhe no branch `etapa-03/plano-mvp-odontologico`. **A primeira tarefa é fundir `main` nele**
> — vai dar conflito em `handoffs/instrucoes.md`, e a resolução é manter as duas listas inteiras,
> em ordem cronológica, sem apagar entrada nenhuma. Confira com
> `grep -c '^# INSTRUÇÕES' handoffs/instrucoes.md`, que tem de devolver 1.
>
> Depois disso, **não escreva código**. Abra a **Subetapa 03.0.a — Revisão do plano da Etapa 03 à
> luz da pesquisa `analise-ice`**, em modo `[Plan]`, e me traga: (1) as respostas às decisões
> D-I3, D-I4, D-I5 e D-I6, com sua recomendação em cada uma; (2) as Subetapas 03.6, 03.7 e 03.8
> reescritas — Objetivo, Conclusão, Qualidade, Evidência, teto de tentativas, escalonamento de
> LLM e CHANGELOG; (3) a lista exata dos arquivos de `docs/` e do `CLAUDE.md` que mudam, com o
> que muda em cada um. **Pare aí e submeta à minha aprovação antes de tocar em qualquer arquivo.**
>
> Duas decisões já estão tomadas e não se reabrem: **o odontograma passa a ser autoral** (D-I1, com
> o anterior arquivado em `arquivo/odontograma-tool01`) e **o schema é `aba_treatment`, chave
> `treatment`, label "Planos de tratamento"** (D-I2), com "Orçamento" continuando a ser a palavra
> da interface.
>
> Valem `CLAUDE.md` inteiro, em especial §11 (search-first e test-first — hipótese não confrontada
> com medição é suspeita, nunca diagnóstico), §13 (merge é decisão exclusiva minha) e §15 (item
> fora do MVP se reporta, não se implementa).
