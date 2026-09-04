# Relatório de impacto — o que a pesquisa `analise-ice` muda na Etapa 03

Passo 6 da sequência acordada com Max. Escrito em **2026-09-03**, no branch `analise-ice`, depois
da aprovação das evidências na PARADA 2 e com as duas instruções dadas ali já aplicadas
(`00_PLANO_DE_ACAO_ICE.md` §8-B).

**Este relatório não altera nada.** Nenhum arquivo de `crm/`, `db/` ou `docs/` foi tocado por esta
sessão. O que segue é **parecer**: o que muda, onde, e qual é o custo de cada caminho. **Quem
decide é Max**, e o merge é ordem exclusiva dele (`CLAUDE.md` §13).

**Fontes de tudo o que se afirma aqui:** [`fontes/ice.md`](fontes/ice.md) (424 páginas + 32
vídeos), [`capturas/ice/INDICE.md`](capturas/ice/INDICE.md) (54 evidências creditadas),
[`RELATORIO.md`](RELATORIO.md) §5.4 (itens 34-49). **Toda afirmação sobre o nosso repositório foi
confrontada com o código antes de virar linha deste relatório** (`CLAUDE.md` §11) — arquivo e
linha citados.

---

## 1. Resumo — o veredito, subetapa por subetapa

| Subetapa | Status hoje | Veredito | Gravidade |
|---|---|---|---|
| **03.0** Revisão do plano | ✅ CONCLUÍDA | **intacta** | — |
| **03.2** Uniformidade | ✅ CONCLUÍDA | **intacta** (esta pesquisa a estende, não a corrige) | — |
| **03.3** Divisão por rota + fontes | ✅ CONCLUÍDA | **intacta** — e vira pré-requisito ainda mais forte | — |
| **03.4** Agenda: espera, marcadores, cadeiras | ✅ CONCLUÍDA | **intacta**, com **2 acréscimos** sugeridos | baixa |
| **03.5** Ações dos usuários + consentimento | ✅ CONCLUÍDA | **intacta**, com **1 regra** a herdar | baixa |
| **03.6** Catálogo: faces, unidade, SIGTAP | ✅ CONCLUÍDA | **REABRE** — `aceita_faces` é insuficiente | **média** |
| **03.7** Odontograma | ✅ CONCLUÍDA | **REABRE** — três achados, um deles grave | **ALTA** |
| **03.8** Orçamento como entidade | ⏸️ não iniciada | **REDESENHA POR INTEIRO** — inclusive o nome | **ALTA** |
| **03.9** Multiunidade + trava de plano | não iniciada | **reforçada**, não redesenhada | baixa |
| **03.10-03.15** Token e comunicação externa | não iniciadas | **1 acréscimo** (item 47) | baixa |
| **03.16** Alertas clínicos | não iniciada | **redesenha** — vira *health facts* | média |
| **03.16.a** Dossiê do paciente | não iniciada | **precisa** — o item 25-MVP ganha desenho | média |
| **03.17-03.20** Painel, cobrança, link, estoque | não iniciadas | **1 mecanismo novo** (item 39, *warnings*) | baixa |
| **03.21.a** Varredura de acessos | não iniciada | **ganha referência forte** | média |
| **03.22** Implantação da UX | não iniciada | **+1 acréscimo** ao parecer | baixa |

**Duas subetapas concluídas reabrem** (03.6 e 03.7) e **uma não iniciada é redesenhada por
inteiro** (03.8). Nenhuma outra é invalidada.

---

## 2. Categoria A — REABRE trabalho já concluído

### 2.1 Subetapa 03.7 (odontograma) — o impacto principal

**Status: ✅ CONCLUÍDA em 2026-09-03** (commit `1412628`, 17 arquivos, 2.364 linhas). O trabalho
está correto no que se propôs; o problema é o que ele **não se propôs**, e que a pesquisa mostra
ser central.

#### Achado A1 — a face não é clicável, e o pop-up de detalhe não existe *(gravidade ALTA)*

**Medido, não suposto.** O sourcemap do pacote publica o fonte inteiro (49 arquivos,
`sourcesContent`), e ele diz:

```
src/odontogram.ts:8663   tile.addEventListener("click", (e) => onToothClick(toothNo, e));
src/odontogram.ts:5006   function onToothClick(toothNo, evt) { … selectedTeeth … }
```

**O clique é no dente. A face vem de uma grade de caixas de seleção num painel lateral**
(`#cariesChecks .surface-cell`, `#fillingSurfaceChecks`). E o único popover da biblioteca é
**exclusivo de toque** (`addTouchToTile`), cujo botão "info" apenas **rola a página até o painel
lateral** (`odontogram.ts:4472`).

**O que Max pediu na NOTA 03 e o ICE entrega:** clicar na face abre um pop-up com os códigos, e o
pop-up carrega o trabalho **e o orçamento daquele dente** (`site_08`, `site_19`, `site_20`;
`fontes/ice.md` §3.3).

**A boa notícia, também medida:** a geometria por face **já existe** no SVG da biblioteca. Cada
face é um `<path>` próprio, com id nomeado — `mesial-shape`, `distal-shape`, `occlusal-shape`,
`caries-buccal`, `filling-amalgam-mesial`, `defect-occlusal`, `subcaries-lingual`, `caries-root`,
`tooth-radix`. **O que falta é o handler, não o desenho.**

**Os três caminhos, com custo medido:**

| | Caminho | Custo | Risco |
|---|---|---|---|
| **(a)** | **Estender**: anexar ao SVG da biblioteca um handler que resolva a face pelo `id` do alvo, e abrir o nosso pop-up | **O menor.** A geometria está pronta; é um `addEventListener` no container + um mapa `id → face`. Não muda o peso (426 KB gzip já pagos) nem reabre as três armadilhas da 03.7 | **Depende de `id` interno de terceiro.** Um `npm update` pode renomear `mesial-shape`. Mitigável com uma asserção no `evidencia_odontograma.mjs` que falha se o id sumir — o mesmo padrão do `escopar_css_odontograma.mjs --verificar`, que já roda no build |
| **(b)** | **Trocar** por outra biblioteca | **Alto e sem alvo conhecido.** O benchmark de agosto já varreu 4 repositórios: o único adotável era este; o de HOF **não tem licença** (`RELATORIO.md` §5.1). Trocar exige nova varredura, nova licença lida, novo peso medido | Perde o `src/fhir/` (HL7 FHIR R4, `iso3950`, ICDAS) que veio de brinde e que a 03.7 registrou como ativo; e perde o periodontograma do item 48 |
| **(c)** | **Construir o nosso** | **Medido nesta pesquisa, e é menor do que parece.** A amostra da NOTA 04 (3 dentes, 5 faces + coroa + 1-3 raízes cada) pesa **2,6-2,9 KB por dente** contra ~80 KB por dente da biblioteca, é **paramétrica** (as 32 permanentes e as 20 decíduas saem da mesma função, por espelhamento e escala) e passou **18/18 asserções em navegador real**, com 24 cliques devolvendo região e dente corretos | **Perde tudo que veio de brinde**: FHIR, periodontograma, os desenhos especializados de implante/coroa/núcleo/endodontia/faceta, e as 907 chaves de tradução pt-BR que a 03.7 auditou. E reabre do zero as três armadilhas que a 03.7 pagou |

**Recomendação do CODE: (a), com a guarda de id.** É o único caminho que não joga fora o trabalho
da 03.7 nem o que veio de brinde, e o teste que protege contra a regressão de `npm update` custa
uma asserção no script de evidência que **já existe e já roda**. A amostra da NOTA 04 fica como
**prova de que (c) é viável** — que é o que Max pediu que fosse provado — e como plano B com custo
conhecido, não como recomendação.

**Se Max escolher (c), a amostra não é descartável:** ela já resolve o vocabulário
(`data-face`/`data-regiao`), o ciclo de três estados e a serialização do estado dentro do próprio
SVG, e a captura `svg_prova_captura.png` mostra os três estados pintados.

#### Achado A2 — `facesDoDente()` lê a face do ACHADO, não a face do TRABALHO *(gravidade ALTA)*

**Este é o achado que mais afeta a 03.8, e ele é nosso, não do ICE.**

`crm/src/features/health/odontograma.ts:96` define:

```js
export function facesDoDente(dente) {
  return [...new Set([...lista(dente.caries), ...lista(dente.fillingSurfaces)])].sort();
}
```

com o comentário, escrito na própria 03.7: *"É este conjunto que a 03.8 cobra por face."*

**Mas `caries` e `fillingSurfaces` são achados** — onde há cárie e onde há restauração. **A face
que se vai orçar é outra coisa:** é a face onde o profissional vai trabalhar, que pode coincidir,
pode ser maior (uma restauração MOD sobre uma cárie que só aparece na oclusal) ou pode não existir
como achado (um selante em face hígida).

No ICE isso é explícito e separado: **achado** (`Add Finding` — diagnóstico ou material existente,
`site_22`) e **procedimento** (`Add Procedure` — o trabalho, `site_19`) são duas entradas
distintas, cada uma com sua própria seleção de faces, e o vínculo entre elas é **opcional e
arrastável** (`fontes/ice.md` §4). O nosso modelo hoje tem só uma.

**Consequência:** se a 03.8 nascer lendo `facesDoDente()`, o orçamento cobrará **a face onde há
doença**, não a face onde haverá trabalho. Não daria erro — geraria um orçamento coerente consigo
mesmo e errado quanto ao negócio, que é exatamente a classe de falha da entrada "convênio virou
plano" de `handoffs/instrucoes.md` §5.

**O que fazer:** separar, no payload gravado em `aba_health.evolucoes.marcacoes`, a face de achado
da face de procedimento. **Não exige migration** — a coluna é `jsonb` e o envelope da 03.7 já
carrega um item sentinela com o payload verbatim (`odontograma.ts:150`, `itemEstadoNativo`). É
mudança de projeção, não de schema.

#### Achado A3 — a dentição é modo, e deveria ser estado por dente *(gravidade média)*

A 03.7 registra, no Status: *"a biblioteca modela decídua como substrato da posição FDI
(`milktooth`), sobre as mesmas 32 posições — a hipótese de estender o catálogo para 51-85 foi
levantada e derrubada pela medição."*

**A medição estava certa para o que se perguntou**, e o ICE mostra que a pergunta era menor que o
problema. Lá não há modo de dentição: há **um estado por posição** — `erupcionado`,
`não erupcionado`, `ausente`, `removido`, `supranumerário`, `substituído por decíduo/permanente` —
derivado da **idade** em 12 faixas e editável dente a dente com sete operações
(`fontes/ice.md` §3.2, `site_05`, `site_06`).

E a **tabela de efeitos** é o que mostra por que isso importa: as quatro maneiras de dizer que um
dente não está visível têm consequências **diferentes** sobre quais códigos são aceitos, se aceita
medida periodontal, e se deixa lacuna no desenho. `ausente` ≠ `não erupcionado` ≠ `removido`, e
confundi-los produz orçamento sobre dente que não existe.

**Gravidade média, não alta,** porque: (1) o MVP não faz periodontia (item 48, futuro), que é onde
metade dessa distinção se paga; (2) o payload da biblioteca já carrega `globals.edentulous`, que a
03.7 identificou como achado clínico; e (3) a correção é aditiva — um estado por posição no nosso
lado da projeção, sem tocar no que a biblioteca faz.

#### Achado A4 — três estados contra cinco, e o nosso "executado" é derivado *(gravidade média)*

| Nós (03.7) | ICE | Diferença que importa |
|---|---|---|
| `existente` | `Existing` (achado) | equivalente |
| `a_realizar` | `PP` Proposed + `PL` Planned | **o ICE separa rascunho de comprometido**, e só `Proposed` pode ser apagado. Consentir move `PP → PL` automaticamente |
| — | `IP` In Progress | não temos "começou e não terminou" — e ele existe justamente para o tratamento em várias sessões (item 37, step set) |
| `executado` — **derivado**, nunca digitado | `CO` Completed — **digitado**, e é o que gera a cobrança | ver abaixo |
| — | `NLN` No Longer Necessary | não temos "não é mais preciso"; hoje só desmarcar, que apaga o histórico |

**O ponto mais fino:** a 03.7 decidiu que `executado` *"nasce quando a sessão assinada anterior
marcou o dente como `a_realizar` e esta sessão já o traz no status"*. É uma decisão elegante e
**incompatível com a instrução M1 de Max**: se a cobrança se solta na aprovação do contrato e a
finalização depende de "o profissional executou em todas as faces planejadas", então **"executado"
vira um fato que alguém afirma**, com data e autor — não uma inferência entre duas evoluções.
Inferência não sustenta a trava de finalização de um contrato pago.

#### O que da 03.7 **sobrevive intacto**, e é muito

- **A decisão de gravar em `aba_health.evolucoes.marcacoes`** (migration `025`), herdando RLS, log,
  privilégio de coluna e trava de evolução assinada — o ICE não dá nenhuma razão para mudar, e
  `CLAUDE.md` §5 dá todas para não mudar.
- **A escopagem de CSS por PostCSS** (`escopar_css_odontograma.mjs`) e o **teto de precache**
  (`conferir_precache.mjs`): valem para qualquer caminho, inclusive (c).
- **O reset entre pacientes pela forma pristina** — enquanto a biblioteca ficar, isso fica.
- **Os 6 casos de ataque** de `05_aba_health.spec.ts` e as 37 asserções de
  `evidencia_odontograma.mjs`: nenhuma é invalidada; ganham asserções novas.
- **O `src/fhir/`** como ativo registrado.

### 2.2 Subetapa 03.6 (catálogo) — reabertura menor e bem delimitada

**Status: ✅ CONCLUÍDA.** Migration `042_catalogo_faces_sigtap.sql`, conferida: acrescentou
`aceita_faces BOOLEAN`, `unidade_lancamento TEXT` (CHECK de 5 valores), `quantidade_maxima INTEGER`
(CHECK `> 0`) e `codigo_sigtap TEXT`, mais o CHECK "aceita_faces exige unidade_lancamento".

**O que o ICE mostra que falta — e são duas coisas, não uma:**

**(1) `aceita_faces` é booleano; a regra do código é mais rica.** No ICE, escolher `3O` e buscar
resina **já exclui** os códigos que só valem em dente anterior com mais de uma face
(`fontes/ice.md` §3.3, `site_18`). A regra do código sabe: quantas faces aceita, se é anterior ou
posterior, e qual área. Isso não é enfeite — é o que impede um orçamento com o código errado no
dente errado, que é irmão do `quantidade_maxima` que a própria 03.6 já implementou como validação
de banco.

**(2) O código carrega REQUISITOS, não só regras de forma** (item 35). No ICE, cada código declara
se exige **termo de consentimento**, **termo de consentimento informado** e **achado diagnóstico
vinculado** — configurados por conjunto de códigos
(`configure/practice-settings-charting` → Code Sets). O nosso `aceita_faces` é o primeiro membro
dessa família e está sozinho.

**Custo:** colunas aditivas em `aba_catalog.servicos` (uma migration), sem tocar em dado existente
— as 64 linhas da semente SIGTAP continuam válidas. **Sem P-sub**: `aba_catalog` não é `aba_health`.

**E fica um ativo registrado:** o modelo de **conjunto de códigos** do ICE (item 46) generaliza o
que a 03.6 fez com o SIGTAP — a clínica cria códigos próprios **mapeados** a um código oficial,
herdando o visual no odontograma e o comportamento de faturamento. Futuro, não agora.

---

## 3. Categoria B — REDESENHA trabalho não iniciado

### 3.1 Subetapa 03.8 — redesenhada por inteiro, e é a boa notícia da pesquisa

A 03.8 **não tem uma linha de código**. Tudo o que segue é economia, não retrabalho — é
exatamente o que a pausa existiu para conseguir.

#### B1 — O nome e a entidade *(decisão de Max)*

**Decidido em 2026-09-03:** schema `aba_budget`, chave de módulo `budget`, label "Orçamentos" —
com a ressalva escrita no próprio `docs/00`: *"Sujeita a revisão se a pesquisa `analise-ice` mudar
o desenho da entidade."*

**A pesquisa mudou.** No ICE a entidade é **Treatment Planning** e o orçamento é uma **projeção**
dela (`Estimate: Ins. $X / Pt. $Y`), não o objeto. A entidade real tem:

- **fases clínicas** como linhas (Emergency · Systemic · Acute · Disease Control · Definitive ·
  Maintenance), configuráveis;
- **opções concorrentes** como colunas (A, B, …, número livre);
- **diagnóstico atravessando as colunas**, com procedimento aninhado dentro dele;
- lista de **diagnósticos não fasados** como fila de trabalho.

**Recomendação do CODE, para Max derrubar se quiser:** o schema passa a `aba_treatment`, chave
`treatment`, label **"Planos de tratamento"** — e o orçamento é a **vista financeira** dele, não
uma entidade irmã. Motivo, em uma frase: **chamar de orçamento a coisa que o dentista usa para
decidir o tratamento faz o produto parecer um sistema de vendas com odontograma acoplado, e é o
inverso do que o mercado compra.** A palavra "Orçamento" continua na interface, onde o paciente a
espera; o schema guarda o que a coisa é.

> **Contra-argumento honesto, para a decisão não ser tomada só com um lado:** `aba_budget` é mais
> curto, já está escrito em `docs/00` e em `CLAUDE.md` §2 seria o décimo schema com um nome que
> qualquer pessoa entende. Se Max preferir manter `aba_budget`, **nada nesta pesquisa quebra** —
> a estrutura de fases e opções cabe igual dentro dele. É decisão de nome, não de modelo.

#### B2 — O preço não é campo da linha *(gravidade ALTA)*

**O que estava apurado na 03.8, antes da pausa** (`docs/00`, e `docs/02` §11.2):
`variante_servico_id` como tabela de preço **na linha**, e `plano_id` opcional **no cabeçalho**.

**O que o ICE mostra:** o preço é **resolvido**, não escolhido — pela escada
`Paciente > Tipo de profissional > Clínica > Grupo de clínicas > Prática`, no momento do
lançamento. Prova ao vivo: a mesma consulta custa **$250** com um profissional comum e **$400**
com um especialista, e ninguém escolheu nada (`fontes/ice.md` §5.2, `vid_billing_04`). E o
convênio PPO fica **fora** da escada: entra como **ajuste contratual** sobre a diferença, que é
lançamento nomeado e **reportável**.

**O que muda no nosso desenho:**

- guardar `variante_servico_id` na linha **obriga alguém a escolher a tabela na tela**, que é o
  que essa arquitetura existe para evitar;
- guardar **o valor resolvido** na linha (com a tabela que o resolveu, como proveniência) é
  diferente e correto: congela o preço no momento do acordo, e diz de onde ele veio;
- **a troca de profissional recalcula o preço** — e o ICE **avisa a diferença e o ajuste que vai
  lançar antes de confirmar** (`gather/edit-procedure-and-finding-details`). Sem isso, trocar o
  dentista de um procedimento faturado corrompe o financeiro em silêncio.

**Efeito colateral em `aba_catalog`:** a escada exige que a tabela de preço seja **entidade**, com
**vigência** (item 41) — rascunho editável, compromisso com data, tarifa comprometida imutável.
Hoje um reajuste seria `UPDATE`, e reescreveria o passado do financeiro.

#### B3 — A cobrança nasce da aprovação, não da execução *(instrução M1 de Max)*

Detalhe em `fontes/ice.md` §5.6 e `RELATORIO.md` §5.4. As consequências de modelagem:

1. **A aprovação do contrato é o evento financeiro**, e ela precisa existir como transição de
   estado com data, autor e — pela decisão de Max sobre o PDF — **duas assinaturas**.
2. **O contrato não se finaliza** sem as duas condições simultâneas: saldo zerado **e** todas as
   faces planejadas executadas. **Nenhuma das duas fontes responde sozinha**: o saldo mora em
   `aba_finance`, a cobertura de execução mora em `aba_health` (a marcação por face). É invariante
   de duas tabelas em schemas diferentes.
3. **`executado` tem de virar fato afirmado**, não inferência entre evoluções (achado A4) — uma
   trava de finalização não se apoia em dedução.
4. **A régua de `aba_finance` continua valendo:** a aprovação passa pelas seis operações já
   provadas (`vender_plano`, `estornar_sessao`, `atualizar_status_fatura`,
   `marcar_faturas_vencidas`, `expirar_planos`, `planos_vencendo_em`), nunca por `INSERT` direto —
   a Qualidade da 03.8 já dizia isso e continua certa.

> **A armadilha a evitar, nomeada:** declarar o contrato concluído no último pagamento. É o
> simétrico exato do que a 02.10 já pagou (`instrucoes.md` §5) — o agendador zerou o KPI "Vencido"
> porque a fatura saía do contador exatamente quando virava pendência. Aqui, o contrato sairia da
> lista de pendências exatamente quando o paciente termina de pagar e ainda tem trabalho a
> receber, que é o pior momento possível.

#### B4 — O PDF, e a decisão preliminar de Max

**Decisão preliminar registrada:** vista de impressão + `window.print()`, sem dependência nova —
*"a reconfirmar depois das referências do ICE"*.

**A pesquisa reconfirma a decisão técnica e acrescenta uma exigência.** O ICE também não gera PDF
por biblioteca no fluxo de consentimento: gera **um documento a partir de um modelo**, e o modelo
decide o que aparece. Quando ele traz o tipo de pergunta `Consent Table`, exibe o tratamento **por
fase, com as estimativas de convênio**; e o fornecedor diz explicitamente que pode ser configurado
para **manter a conversa financeira separada** (`fontes/ice.md` §4.4, `site_24`).

**O que isso pede do nosso desenho:** o termo não é uma tela de impressão fixa — é **uma seleção**
(quais procedimentos entram, com `Select All` por fase ou por opção) mais **uma escolha de
apresentação** (com ou sem valor). `window.print()` continua sendo o motor certo; o que muda é o
que ele imprime.

**E duas regras que faltavam** (item 36):

- **recusa implícita** — consentir a Opção A marca os procedimentos da B **para o mesmo
  diagnóstico** como recusados. O registro de que o paciente **escolheu A e recusou B** é
  exatamente o que protege a clínica depois;
- **re-consentimento com gatilho explícito** — muda **dente** ou **código** exige termo novo; muda
  **face**, **fase**, **opção** ou **diagnóstico vinculado** não exige. Com exclusão configurável
  por faixa de códigos.

#### B5 — Requisitos por procedimento, e o P-sub

O item 35 (requisitos por código) muda a natureza do P-sub da 03.8. Hoje ela tem P-sub *"mesmo não
criando tabela clínica"*, porque dente e face são dado de saúde. Com requisitos, aparece um caminho
novo: **um procedimento que exige consentimento e não o tem não pode ser aprovado nem faturado** —
e essa é uma trava que precisa viver no banco, não na tela, pelo mesmo argumento que a 03.6 usou
para `quantidade_maxima`.

#### B6 — Sequência recomendada, se Max aprovar o redesenho

A 03.8 estava dimensionada como **uma** subetapa com teto de 5 tentativas. Com o redesenho ela
tem, no mínimo: fases e opções, resolução de preço por escada, aprovação de contrato, trava dupla
de finalização, termo por seleção, recusa implícita e re-consentimento. **Recomendo partir em
duas**, no precedente que a própria Etapa 03 já abriu com a 03.13.a e a 03.16.a:

- **03.8** — a entidade e o plano: fases, opções, diagnóstico↔procedimento, dente/faces, estados,
  requisitos. **Sem dinheiro.**
- **03.8.a** — a face financeira: resolução de preço, aprovação de contrato, cobrança antecipada,
  trava dupla de finalização, termo com ou sem valor.

O corte é natural porque o primeiro bloco é clínico (`aba_health` + o schema novo) e o segundo é
financeiro (`aba_finance`), e cada um tem um portão de qualidade diferente.

### 3.2 O efeito em cascata nas subetapas seguintes

| Subetapa | O que muda | Gravidade |
|---|---|---|
| **03.9** Multiunidade | **Reforçada, não redesenhada.** A escada de preço do ICE usa `Clínica` e `Grupo de clínicas` como dois níveis — o que confirma D1/D3 de Max e dá um consumidor concreto à multiunidade além do isolamento. E o ICE tem **fee schedule por clínica e por grupo**, o que é um caso de uso a mais para a mesma cirurgia | baixa |
| **03.16** Alertas clínicos | **Redesenha.** O ICE não tem "alerta derivado da anamnese": tem **health facts** — condição, medicação e alergia como **entidades** com significância, nota datada e autor, alimentadas pela anamnese e visíveis na barra lateral em cores (`site_11`, `vid_overview_02`). É modelo melhor: o alerta deixa de ser uma consulta sobre respostas e vira dado de primeira classe | média |
| **03.16.a** Dossiê do paciente | **Ganha desenho.** O item 25-MVP (resumo do paciente) é exatamente os health facts + o **resumo de evolução** configurável do ICE (`treatment/review-a-progress-note-summary`), que declara no modelo quais respostas aparecem no resumo | média |
| **03.17** Painel como lista de tarefas | **Ganha mecanismo.** O item 39 (*warnings*) é a forma genérica do que a 03.17 faria card a card: relatório que devolve linha vira mensagem acionável, com texto diferente no painel da clínica e no do paciente | baixa |
| **03.11** Caixa de entrada de exames | **1 acréscimo:** o item 47 — no ICE o **tipo do arquivo governa o acesso**, herdando a permissão do domínio (financeiro, imagem, agenda, prontuário). Hoje o nosso bucket é clínico ou não é | baixa |
| **03.21.a** Varredura de acessos | **Ganha a referência que Max previu.** Ver §3.3 | média |
| **03.22** Implantação da UX | **+1 ao parecer:** o mesmo módulo em dois tamanhos (painel compacto no dashboard × área cheia). É composição, não schema | baixa |

### 3.3 Subetapa 03.21.a — o que os dois logins do vídeo ensinam

Max abriu a pesquisa dizendo que o vídeo de 50 minutos *"mapeia direto nos nossos papéis (`admin`
× `agent` + atributo profissional) e alimenta a Subetapa 03.21.a"*. **Mapeia — e desmente a forma.**

**O ICE não tem hierarquia de papéis.** *"Provider Groups are the source of permissions for a
user. A provider receives permissions from each provider group they belong to."* O modelo é
**aditivo**: o usuário pertence a N grupos e **soma**. Sem `owner > admin > agent > viewer`. E o
padrão é o mínimo: *"If a provider has no permissions given to them by a provider group, they can
only access the: Provider Dashboard, feedback tool, help, and about page."*

**Três coisas que a 03.21.a deve levar, e uma que deve recusar:**

1. **Levar — a permissão de relatório intersecta as de domínio.** *"Audit reports require the
   'Access Practice Activity' permission. Financial reports require 'Manage Financials'."* A nossa
   03.5 chegou nisso por decisão de produto (log só para o `owner`); aqui é regra geral, e vale
   varrer toda tela agregada com essa pergunta.
2. **Levar — validação é par de grupos, não atributo de pessoa.** "grupos que exigem validação" ×
   "grupos que podem validar" (item 42, futuro).
3. **Levar — o papel na consulta é ortogonal à permissão.** `Provider Roles` (principal,
   assistente, higienista, dentista) rotula quem faz o quê **no atendimento**, e não dá acesso a
   nada. Nós hoje conflamos as duas coisas no atributo profissional.
4. **Recusar — trocar a hierarquia pelo modelo aditivo.** `is_account_member(account_id, papel)` é
   `CLAUDE.md` §14 puro: porte do Maximus, provado em produção, 21 migrations tocando a área. O
   modelo aditivo do ICE é bom para clínica-escola com dezenas de perfis; para o nosso mercado, a
   hierarquia + `access.can()` por módulo é mais barata e já está testada. **O que se leva é a
   pergunta que o modelo aditivo faz bem — "o que exatamente esta pessoa pode fazer?" —, não o
   mecanismo.**

---

## 4. Categoria C — ACRESCENTA item novo ao MVP

Os **16 itens** (34-49) estão em [`RELATORIO.md`](RELATORIO.md) §5.4, numerados a partir de 34 por
decisão de Max (D-ICE-1) e **todos reportados, nenhum planejado** (`CLAUDE.md` §15).

**Onde o CODE apostaria, se Max pedir uma recomendação de corte:**

| Prioridade | Itens | Argumento |
|---|---|---|
| **Entram no MVP** | **34** (opções concorrentes), **36** (recusa implícita e re-consentimento) | São **parte da 03.8**, não acréscimos a ela. Fazer a entidade sem eles é fazê-la duas vezes |
| **Fortes candidatos** | **35** (requisitos por código), **41** (vigência de tabela de preço) | Baratos agora (colunas aditivas em `aba_catalog`), caros depois: o 41 impede que um reajuste reescreva o passado do financeiro, e isso não tem conserto retroativo |
| **Alto valor, custo médio** | **38** (consulta não agendada + prancheta), **39** (*warnings*) | O 38 resolve um gargalo real de balcão; o 39 é o motor do item 12, que já está no MVP |
| **Baratos e isolados** | **40** (nota administrativa com reconhecimento forçado) | Uma tabela, uma tela, zero risco em `aba_health` |
| **Depois** | **37** (step set) | Só se paga quando houver tratamento multissessão faturado — e ele encosta na trava de finalização da M1, então convém decidir junto |
| **Futuro declarado** | **42-49** | Inclui **48 (periodontia)** e **49 (ortodontia)**, registrados a pedido de Max com o vínculo à fonte preservado |

---

## 5. O que NÃO muda — e vale dizer

Um relatório de impacto que só lista estrago é enviesado. Estas decisões **sobrevivem à pesquisa**,
e três delas saem reforçadas:

- **A divisão por rota da 03.3.** Reforçada: qualquer caminho do achado A1 mantém ou aumenta o
  peso da rota clínica.
- **Gravar o odontograma em `aba_health.evolucoes.marcacoes`** (migration `025`). O ICE não dá
  nenhuma razão para criar tabela clínica nova, e `CLAUDE.md` §5 dá todas para não criar.
- **O relatório "Ações dos usuários" só para o `owner`** (03.5). Reforçado: o ICE separa
  `Access Practice Activity` de tudo o mais **e** faz o relatório intersectar as permissões de
  domínio.
- **`sala_de_espera` e marcadores** (03.4). O ICE valida com status **pré e pós check-in** e a
  regra de que só se dá saída depois de concluir. Dois acréscimos de baixo custo, não uma correção.
- **A semente SIGTAP de 64 procedimentos** (03.6). Reforçada: no ICE, conjunto de código
  padronizado é a fundação de tudo — busca, regra, faturamento e visual no odontograma.
- **A régua de `aba_finance`** — aprovação pelas seis operações, nunca `INSERT` direto.
- **`is_account_member` + `access.can()`** — ver §3.3, item 4.
- **A escolha da Versão 03 de UX.** Confirmada, com um acréscimo (§7 do `RELATORIO.md`).

---

## 6. O que precisa de decisão de Max

| # | Decisão | Recomendação do CODE |
|---|---|---|
| **D-I1** | O caminho do odontograma: **(a) estender · (b) trocar · (c) construir** | **(a) estender**, com a guarda de id no script de evidência que já roda no build |
| **D-I2** | O nome do schema: manter **`aba_budget`** ou passar a **`aba_treatment`** | `aba_treatment` / "Planos de tratamento", com "Orçamento" mantido na interface. **Mas nada quebra se ficar `aba_budget`** — é decisão de nome |
| **D-I3** | Partir a 03.8 em **03.8 (clínica)** + **03.8.a (financeira)** | Sim — o redesenho a deixou grande demais para 5 tentativas |
| **D-I4** | Reabrir formalmente a **03.7** e a **03.6**, com Status revisto | Sim, e no padrão que `docs/00` já fixou: **o Status antigo não se apaga, ganha o registro da revisão ao lado** |
| **D-I5** | Quais dos itens 34-49 entram no MVP | Ver o quadro do §4 |
| **D-I6** | Se quer as **pesquisas dedicadas** de periodontia (item 48) e ortodontia (item 49) | Disponíveis, **sem nova coleta** — o bruto está em disco. 10 das 20 páginas do tema já foram lidas |

---

## 7. Nota de merge — e um conflito previsto

**O CODE não funde este branch** (`CLAUDE.md` §13). Ordenar o merge é atribuição exclusiva de Max.

**Conflito previsto, declarado antes de acontecer:** `handoffs/instrucoes.md` foi tocado **nos dois
branches** — três entradas novas na §5 aqui, e as entradas das subetapas 03.3 a 03.8 no
`etapa-03/plano-mvp-odontologico`. Fundir os dois em `main` vai pedir resolução manual nesse
arquivo. **A resolução correta é manter as duas listas inteiras**, na ordem cronológica das
subetapas — nenhuma entrada se apaga (`CLAUDE.md` §10). Nenhum outro arquivo colide: esta sessão
não tocou em `crm/`, `db/` nem `docs/`, e o `design/benchmark/` do branch da Etapa 03 já foi
sincronizado no primeiro commit deste (`bb40f37`).

**Verificação do isolamento**, reproduzível:

```bash
git diff main -- . ':!design/benchmark' ':!handoffs/instrucoes.md'   # deve sair vazio
```

---

## 8. Parecer

**A pausa se pagou.** O custo dela foi uma sessão; o que ela evitou foi a Subetapa 03.8 nascer com
o preço no lugar errado, a cobrança presa à execução num mercado que paga adiantado, e o
odontograma lendo a face da doença como se fosse a face do trabalho — três erros que não dariam
erro nenhum, e que só apareceriam quando uma clínica real usasse o produto.

**O maior achado não é sobre o ICE, é sobre nós:** `facesDoDente()` (achado A2) já estava escrito,
já estava comentado como *"é este conjunto que a 03.8 cobra por face"*, e está errado quanto ao
negócio. Ele foi encontrado porque a pesquisa obrigou a olhar o nosso código com uma pergunta
vinda de fora. É a quarta vez na Etapa 03 que confrontar a premissa com o repositório derruba algo
(03.5, 03.6, 03.8 e agora esta), e a única em que o que caiu era código já escrito e verde.

**O segundo maior é que o retrabalho é menor do que a gravidade sugere.** A geometria por face já
está no SVG que instalamos; a separação achado/procedimento é mudança de projeção, não de schema;
e a 03.8 não tem uma linha para desfazer. **Nenhuma migration precisa ser revertida.**

**O CODE entrega o parecer e para** (`CLAUDE.md` §13).
