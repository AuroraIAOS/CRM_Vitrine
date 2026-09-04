# ICE Health System — fonte detalhada

Matéria-prima da pesquisa `analise-ice`, coletada em **2026-09-03** no branch `analise-ice`, sob o
[`00_PLANO_DE_ACAO_ICE.md`](../00_PLANO_DE_ACAO_ICE.md) aprovado por Max.

**Nada aqui foi implantado.** O produto em `crm/`, as migrations e o subdomínio no ar seguem
intactos. Isto é matéria-prima de decisão (`CLAUDE.md` §13).

**Duas fontes, ambas públicas:**

| Fonte | Volume | Como |
|---|---|---|
| Help center `help.icehealthsystems.com` | **424 páginas** de 425 no `sitemap.xml` (a 425ª é `/search`, sem conteúdo), **zero falha** de coleta · 983.594 caracteres de texto · 1.198 imagens distintas | [`../coletar_ice.mjs site`](../coletar_ice.mjs) |
| Canal de suporte no YouTube | **32 vídeos**, 31 com transcrição completa · 2 longos (50 min e 49 min) lidos do início ao fim | [`../coletar_ice.mjs video`](../coletar_ice.mjs) |

**Sem cadastro, sem login, sem trial, sem formulário preenchido.** Quando o bloqueio anti-bot do
YouTube sugeriu `--cookies-from-browser`, a saída foi **recusada** — usar a sessão logada de Max é
login por outro nome (detalhe no cabeçalho de [`../coletar_ice.mjs`](../coletar_ice.mjs)).

**Proveniência**, no padrão do benchmark de agosto: **[verificado]** = visto funcionando na tela do
vídeo ou na imagem publicada · **[declarado]** = o fornecedor afirma no texto, sem prova na tela ·
**[a conferir]**.

**Um limite de datação, declarado antes do conteúdo.** A maioria das imagens do help center está
sob `/img/classic/2020-…` — o nome do arquivo carrega a data de captura, e ela é de 2020. Onde a
versão do produto for ambígua, o item vai marcado `[a conferir]`. As telas dos dois vídeos longos
são posteriores e batem com o que as páginas descrevem, o que sustenta que o desenho estrutural
não mudou; a aparência pode ter mudado, e aparência é justamente o que não interessa aqui.

---

## 1. O que é o ICE, e por que ele documenta tanto

Prontuário eletrônico em nuvem para clínicas odontológicas e médicas, desenvolvido em parceria com
a **Collaboration for Health IT** — um grupo de educadores, pesquisadores e administradores de
faculdades de odontologia (`collaboration4hit.org`). **[declarado]**, `start/system-introduction`.

Isso explica de uma vez três coisas que nenhum dos oito concorrentes do benchmark de agosto tem, e
que aparecem no produto inteiro:

- **Validação por supervisor** como conceito de primeira classe — aluno lança, supervisor valida;
- **vocabulário codificado** (SNODDS, ICD-10-CM, CDT/ADA, classificação de cárie ICDAS) como
  configuração, não como texto livre;
- **documentação de nível de campo**, porque o produto é ensinado, não só vendido.

**Consequência para nós:** o ICE não é um concorrente do CRM Vitrine — é uma **referência de
modelagem**. O contexto de clínica-escola distorce parte do desenho (validação, papéis de aluno,
pesquisa) e essa parte deve ser lida como contexto, não como requisito. O que vale é a estrutura
clínico-financeira, que é onde ele está anos à frente do corpus de agosto.

---

## 2. A arquitetura de tela — cinco escopos de sujeito e painéis montáveis

`start/menu-overview`, `start/panels-overview`, `start/layout-and-navigation-overview`.
**[verificado]** — `vid_curto_03_navegacao.jpg`, `vid_curto_04_paineis.jpg`.

O menu de topo não lista módulos. Lista **de quem é a informação**:

| Menu | Escopo | Submenus |
|---|---|---|
| **Practice** | a clínica inteira | Dashboard · Scheduling · Insurance · Payments · Reporting · Practice Settings |
| **Provider** | o próprio usuário | Dashboard · Scheduling · Collaborations · **Validation** · Telehealth · Profile |
| **Patient** | um paciente | Dashboard · Imaging · **Charting** · **Financials** · Patient Management |
| **Individual** | pessoa que não é paciente nem profissional (contato de emergência, familiar, titular de apólice) | Individual Management |
| **External Provider** | clínico de fora, que **não faz login**, existe para o encaminhamento ter destinatário rastreável | External Provider Management |
| **References** | material de apoio, Lexicomp, versão | About · Medical Support · ICE Help |

**"Provider" no ICE significa usuário, não clínico** — recepção, faturamento e TI são providers.
`start/menu-overview` diz isso explicitamente.

**Painéis.** A área de trabalho é montada pelo usuário a partir de widgets; um conjunto de painéis
é uma **panel view**, que tem nome, pode ser trocada durante o dia e **compartilhada** pelo
administrador. O vídeo de 50 min mostra a mesma pessoa alternando entre "Front Desk View
(SHARED)", "Treatment Planning View" e "Provider Reporting View". `start/share-a-panel-view`.

> **Leitura para o Vitrine.** Nossa Versão 03 tem sidebar por tipo de trabalho, o que o benchmark
> de agosto confirmou. O ICE aponta um eixo diferente e complementar: **o mesmo módulo em escopos
> diferentes** (a agenda existe em Practice e em Provider; o financeiro existe como painel no
> dashboard e como área cheia). Isso é o que permite ao recepcionista fazer o essencial sem entrar
> na tela grande — e é barato de imitar, porque é composição, não schema.

---

## 3. O odontograma — a NOTA 03 respondida pela fonte

### 3.1 O desenho

`gather/general-odontogram-overview` · `site_01_odontograma_geral.png`. **[verificado]**

Cada dente é desenhado em **três vistas empilhadas**:

1. **lateral**, com raiz e coroa separadas;
2. **a roseta** — anel de cinco regiões: `D` distal, `M` mesial, `F` facial/vestibular, `L`
   lingual e o **centro** oclusal;
3. **oclusal**, a coroa vista de cima.

A marcação pinta a região, em qualquer das três. A legenda inteira tem **quatro cores**
(`site_02_odontograma_legenda.png`):

| Cor | Significado |
|---|---|
| Vermelho | Achado diagnóstico **existente** |
| Preto | Material **existente** (restauração que já está na boca) |
| Verde | Procedimento **planejado** ou **em andamento** |
| Azul | Procedimento **concluído**, ou achado **tratado** |

**Cinco tratamentos têm desenho próprio, não só cor** — implante, coroa, núcleo, endodontia e
faceta (`site_03_odontograma_visuais.png`). E há um caminho alternativo declarado: tratamento sem
face e sem visual próprio vira **asterisco vermelho ao lado do número do dente**, com o código no
hover (`site_04_odontograma_asterisco.png`). O desenho nunca silencia o que não sabe desenhar.

### 3.2 A dentição — o achado que mais afeta a Subetapa 03.7

`gather/patient-dentition-overview` · `gather/change-a-patients-dentition` ·
`gather/reset-dentition-by-age`. **[verificado]**

**O ICE não tem "modo permanente / decíduo / misto".** Tem **um estado por posição**, e a arcada é
a soma deles. A imagem `site_01` mostra permanentes (2, 3, 7, 8, 9, 10, 14, 19, 23-26, 30) e
decíduos (A, B, C, H, I, J, K, L, M, R, S, T) **na mesma linha**, cada um no seu sistema de
numeração.

A dentição **nasce da idade** do paciente, em 12 faixas:

| Faixa | Dentição inicial |
|---|---|
| 0-9 meses | A a T, todos não erupcionados |
| 9-14 meses | erupcionados D, E, F, G, N, O, P, Q |
| 14-20 meses | erupcionados todos menos A, J, K, T |
| 20-24 meses | erupcionados todos menos A, J |
| 2-6½ anos | A a T erupcionados |
| 6½-7½ anos | entram 3, 14, 19, 24, 25, 30 |
| 7½-8¼ anos | entram 8, 9, 23, 26 |
| 8¼-10½ anos | entram 7, 10 |
| 10½-11½ anos | entram 5, 12, 21, 22, 27, 28 |
| 11½-12 anos | entram 4, 6, 11, 13, 20, 29 |
| 12-20 anos | 2-15 e 18-31 (sem terceiros molares) |
| 20+ anos | 1 a 32 |

E o profissional edita dente a dente, com sete operações (`site_06_editar_denticao.png`):
**Add · Supernumerary · Replace** (troca permanente ↔ decíduo na mesma posição) **· Erupt ·
Unerupt · Missing · Remove**, mais arrastar para mudar a posição dentro do quadrante, e seleção
múltipla por Ctrl/Shift.

**A tabela de efeitos é o que mostra o cuidado do modelo.** Há quatro maneiras de registrar que um
dente não está visível, e cada uma tem consequência diferente:

| Método | Códigos aceitos | Periograma | Odontograma geral |
|---|---|---|---|
| **Não erupcionado** | dente **e faces** | não aceita, deixa lacuna | esmaecido |
| **Ausente** (modo edição) | só o **dente** | não aceita, deixa lacuna | esmaecido, contorno tracejado |
| **Achado "ausente"** (no plano) | só o **dente**, e vira achado ligável a um procedimento | não aceita, deixa lacuna | esmaecido, contorno tracejado |
| **Removido** da dentição | **nenhum** | não aceita, **sem lacuna** | não aparece |
| *(consequência de extração concluída)* | dente sim, faces não | não aceita, deixa lacuna | esmaecido com um X |

### 3.3 A entrada de dado — e é aqui que o ICE difere de nós

`treatment/enter-a-procedure-with-quick-charting` · `treatment/enter-a-procedure` ·
`gather/enter-a-diagnosis-or-existing-material`. **[verificado]** — `site_08`, `site_09`,
`site_18`, `site_19`, `site_22`.

**Quick charting** (`site_08_quick_charting.png`): seleciona-se **um dente OU uma face** no
odontograma e abre um pop-up com **cinco códigos** configuráveis pela clínica mais um
`Search for code…`. Escolhido o código, o status aparece **na mesma linha** — PP proposto, PL
planejado, IP em andamento, CO concluído. *"If the code and surface selection match code rules,
your procedure is automatically saved."* Duas escolhas, e o procedimento está na face.

**Procedure Input** (`site_19`), quando os cinco atalhos não bastam: código ou área — **e a ordem
é livre**. *"Your first choice narrows the available codes or areas based on code rules"*; o
exemplo do próprio fornecedor é escolher `3O` e buscar resina, o que já exclui os códigos que só
valem em dente anterior com mais de uma face.

**Achados** (`site_22`): diagnóstico ou material existente, com seleção de faces sobre o
odontograma — e a regra que importa para o nosso modelo de dados: *"If you select multiple
surfaces, the system will create multiple entries for each site"*. Selecionar 30 MOD, 3 OD e 2 MOD
gera **três linhas**, uma por dente. Não uma linha com três dentes.

**Micro-superfícies** (`site_10_charting_settings.png`, `gather/charting-overview`): opção por
profissional para entrada em detalhe mais fino que a face, *"procedures are billed to the standard
or parent surface"* — o dado clínico é mais fino que o dado de faturamento, de propósito.

### 3.4 O que responde exatamente à NOTA 03

| Característica que Max pediu | O ICE entrega? | Onde |
|---|---|---|
| **1.** Face, raiz e região individualmente selecionáveis e coloríveis | **Sim.** A roseta de 5 regiões é a unidade de seleção; raiz tem desenho e marcação próprios; e há ainda micro-superfície abaixo da face | `site_01`, `site_08`, `site_10` |
| **2.** Tela geral × pop-up de detalhamento por dente, com espaço para o trabalho **e o orçamento** | **Sim.** Quick charting é o pop-up curto; `Procedure Input` é o pop-up cheio; e o pop-over de edição rápida traz `Estimate: Ins. $X / Pt. $Y` | `site_08`, `site_19`, `site_20`, `vid_billing_01` |

---

## 4. Treatment Planning — o que o ICE tem no lugar de "orçamento"

`treatment/treatment-planning-overview` · `navigate-treatment-planning` ·
`phase-a-diagnosis-or-treatment` · `create-treatment-options` · `update-a-procedures-status`.
**[verificado]** — `site_11` a `site_21`, `vid_overview_04`.

**A entidade não se chama orçamento e não é uma lista de itens com preço.** É uma matriz:

```
                          Opção A            Opção B          [+]
  ┌ Unplanned ┐   ── Emergency ──────────────────────────────────
  │  4 DO     │      procedimento solto (sem diagnóstico)
  │ 15 MO     │   ── Systemic ───────────────────────────────────
  │ 18 MO     │      ┌ diagnóstico 14 MOD ──────────────────────┐
  │ 29 O      │      │   amálgama 14 MOD  │                     │
  └───────────┘      └───────────────────────────────────────────┘
                   ── Acute ─────────────────────────────────────
                      ┌ diagnóstico 30 MOD ──────────────────────┐
                      │   amálgama 30 MOD │  resina 30 MOD       │
                      └───────────────────────────────────────────┘
                   ── Disease Control ───────────────────────────
                   ── Definitive ────────────────────────────────
                   ── Maintenance ───────────────────────────────
```

- **Linha = fase.** Padrão de seis, configurável: Emergency (urgente e grave) · Systemic
  (avaliação, prevenção, medicação) · Acute (problema oral severo) · Disease Control (infecção,
  deterioração) · Definitive (restaurador, periodontal, ortodôntico) · Maintenance (exame,
  manutenção, higiene). **O ordenamento é clínico, não comercial.**
- **Coluna = opção de tratamento.** Padrão A e B, número livre, definido em Practice Settings —
  *"you can add and remove columns while you work"*.
- **O diagnóstico atravessa as colunas; o procedimento mora em uma.** Duas alternativas para a
  mesma cárie ficam lado a lado, sob o mesmo diagnóstico.
- **Arrastar e soltar é o método principal.** Soltar dentro do diagnóstico vincula; soltar fora
  deixa solto; arrastar o diagnóstico leva os procedimentos junto (`site_16`, `site_17`).
- **Diagnóstico ainda não fasado fica numa lista à esquerda** ("Unplanned"), que é a fila de
  trabalho do planejamento.

### 4.1 Os cinco status, e o que cada um faz acontecer

`treatment/update-a-procedures-status`. **[verificado]** — a tabela é do próprio fornecedor:

| Status | Para quê | Efeito | Cor no plano | Cor no odontograma |
|---|---|---|---|---|
| **PP** Proposed | rascunho, tempestade de ideias | **pode ser apagado a qualquer momento**; não aparece no odontograma, nem na lista de procedimentos, nem no financeiro | amarelo | — |
| **PL** Planned | tratamento futuro | aparece no odontograma e na lista; **não cria cobrança**, mas aceita pré-pagamento | verde | verde |
| **IP** In Progress | trabalho em andamento | **pode** criar cobrança, conforme Practice Settings | verde | verde |
| **CO** Completed | executado na clínica | **cria a cobrança por padrão**; some do plano; a data de tratamento vira a data da mudança | cinza | azul |
| **NLN** No Longer Necessary | quase-apagar de um planejado | some do plano e do odontograma, **fica na lista geral** para histórico | cinza | — |

**Três invariantes que valem mais que a tabela:**

1. **Só `Proposed` se apaga.** Depois disso o procedimento nunca mais é excluído — só escondido.
   *"It is always visible in the general procedure list."*
2. **Consentir move `Proposed → Planned`**, automaticamente. *"So you don't have to worry about
   deleting treatments the patient has already consented to."*
3. **`Completed` é o que vira dinheiro.** Nos dois vídeos longos, a cobrança nasce exatamente
   nesse instante — não na aprovação de um orçamento.

### 4.2 Requisitos por procedimento — o pop-over

`site_12`, `site_13`. **[verificado]**. Cada procedimento carrega as próprias pré-condições, e o
ícone ao lado dele diz se estão satisfeitas (✓ verde) ou não (! vermelho):

| Requisito | Como se resolve |
|---|---|
| Consentimento de tratamento | gerar o termo a partir do plano |
| Consentimento **informado** (procedimento de risco significativo) | termo separado, só para códigos configurados |
| **Pré-determinação de convênio** | guia de pré-autorização aprovada pelo convênio |
| **Validação** por supervisor | pedir a validação |
| **Achado diagnóstico** obrigatório | vincular o procedimento a um achado |
| Consulta vinculada | (informativo, nada a resolver) |

Quais códigos exigem o quê é configuração por conjunto de códigos
(`configure/practice-settings-charting` → Code Sets → Treatment / Informed / Diagnostic).

### 4.3 Step set — o procedimento em etapas

`treatment/enter-a-step-set` · `configure/practice-settings-charting`. **[verificado]** —
`site_21`, `vid_overview_04`.

Um código de procedimento partido em etapas nomeadas. **Cada etapa tem status, data de tratamento
e consulta próprios**; as etapas se movem em bloco entre fases e opções, mas podem ser ligadas a
consultas diferentes. Na configuração define-se o **`Actual Cost %` de cada etapa** (quanto da
receita é reconhecido ali) e **qual é a etapa faturável** — o paciente é cobrado pelo valor
integral quando aquela etapa for concluída. O exemplo do fornecedor é a coroa: preparo e entrega
em sessões distintas.

### 4.4 Consentimento — a resposta à PV3

`treatment/consent-to-treatment`. **[verificado]** — `site_23`, `site_24`.

**Dois tipos:** *Treatment Consent* (base, qualquer procedimento entra, mesmo se a clínica não o
exigir) e *Informed Consent* (só procedimentos configurados como de risco significativo).

O fluxo: o painel de plano entra em **modo consentimento**, com caixa de seleção por procedimento
e `Select All` por fase ou por opção; escolhe-se o **modelo de documento**; o termo é gerado. Se o
modelo tiver o tipo de pergunta **`Consent Table`**, o formulário exibe *"a breakdown of treatment
by phase that can include insurance estimates"* — **o valor entra no termo, mas é opção do
modelo**, e o fornecedor diz explicitamente que o termo *"can also be configured to keep the
financial discussion separate"*.

**Duas regras que o nosso desenho não tinha:**

- **Recusa implícita.** Consentido o procedimento da Opção A, os da Opção B **para o mesmo
  diagnóstico** viram `declined` e somem do plano ao travar o termo. A escolha de uma alternativa
  é a recusa das outras, e isso fica registrado.
- **Re-consentimento, com regra explícita do que o dispara.** Muda o **dente** ou muda o
  **código** → precisa de novo termo. Muda a **face**, a **fase**, a **opção** ou o **diagnóstico
  vinculado** → não precisa. E há exclusão configurável por **faixa de códigos**, para que trocar
  amálgama de uma face por amálgama de duas não force um termo novo.

---

## 5. Financeiro — e a resposta à PV1

### 5.1 A estrutura

`financials/financials-introduction`. **[verificado]** — `site_25`, `site_26`, `site_27`,
`vid_billing_*`.

*"The financial system in ICE Health Systems is structured as a **double-entry accounting
system**. […] Every journal entry is a new entry, never edited or deleted, so that the system can
show a full history of any transaction."*

A tela do paciente tem cinco seções: **responsável e convênio · saldos · faixas de vencimento ·
botões de ação · abas de transação**.

**Sete saldos, não um:** Patient (deve hoje) · Insurance (o convênio deve hoje) · Total · Future
Payment Plans · Patient Complete (hoje + parcelas) · Total Prepayment · Pending Refunds.

**Faixas de vencimento**, com a regra: *"A patient's financial account status is defined by the
oldest bucket with an outstanding balance."* No vídeo: `Current (0-30)` verde · `Watch (31-60)`
azul · `Overdue (61-90)` vermelho · `91+` preto.

**Sete botões de ação:** Make a Payment · Administrative Charge · Add Adjustment · Add Transfer ·
Add Payment Plan · Create a Claim · Statements. *"Your administrator may customize the names and
colours of these buttons in Practice Settings."*

**Nove abas** sobre o mesmo dado, agrupado de formas diferentes: Main (cronológico) · Patient
Payments · Insurance Payments · Adjustments · Transfers · Procedures · Claims · Payment Plans ·
**Detailed Ledger** (agrupado por cobrança). *"The main tab is great for reviewing transactions in
the order they happened, whereas the detailed ledger is better for reviewing the activity
associated with a specific charge."*

**Responsável financeiro (`guarantor`)** é entidade separada do paciente, com **percentual de
responsabilidade** e um marcado como *Ultimate Guarantor*.

### 5.2 Tabela de preço — PV1 respondida

`configure/practice-settings-fee-schedules`. **[verificado]** — `site_28`, `site_29`,
`vid_billing_04`.

> *"A fee schedule is a complete list of fees associated with the procedure codes in charting."*

**A ordem de aplicação, que é o achado:**

```
Paciente  >  Tipo de profissional  >  Clínica  >  Grupo de clínicas  >  Prática (padrão)
```

O sistema desce a escada até achar uma tabela configurada. *"Because this process happens, the
clinician that's entering the treatment doesn't have to worry about picking a specific fee
schedule"* (`vid_billing_04`, 30-36 min). A prova ao vivo no vídeo: **a mesma consulta custa $250
com um profissional comum e $400 com um especialista**, sem ninguém escolher nada.

**Ciclo de vida da tarifa:** cria-se um **rascunho** (a partir de outra tabela, com ajuste
percentual — *"to increase the fees by 3% set the percentage to 103%"* — ou com todas as tarifas
no mesmo valor), edita-se código a código, e **compromete-se com data de vigência**. *"Rates
cannot be edited after the draft is committed."* Reajuste é tabela nova, não `UPDATE`.

**E o convênio PPO fica FORA dessa escada.** *"A PPO fee schedule does not replace the fee
schedule you define at the practice, provider, etc., level. Instead, the system uses it to
calculate a **contractual adjustment** for the difference between the PPO fee and the standard
fee."* O preço cobrado continua sendo o da escada; a diferença vira um lançamento nomeado, e é
**reportável** — o vídeo insiste nisso: *"we can see through reporting how many contractual
adjustments are running and the value of those"*.

> **Conclusão para o Vitrine, e ela é direta.** A palavra certa em `RELATORIO.md:140` era mesmo
> **convênio**, e o achado da 03.8 (`handoffs/instrucoes.md` §5) estava certo em derrubar `plano`.
> Mas a leitura registrada — "`variante_servico_id` como tabela de preço **na linha**" — é só
> metade. No ICE **a linha não guarda preço**: guarda código, dente, faces e status; o preço é
> **resolvido** pela escada no momento do lançamento. Guardar `variante_servico_id` na linha
> obriga alguém a escolher a tabela na tela, que é exatamente o que essa arquitetura existe para
> evitar.

### 5.3 Convênio — a modelagem completa

`financials/manage-insurance-payers-and-policies` · `add-insurance-to-a-patient`.
**[verificado]** — `site_30`, `site_31`, `site_32`.

**Três níveis:** `Payer` (a operadora) → `Address` (a unidade regional, com formato EDI, restrição
de prazo de envio, submissão eletrônica) → `Policy` (a apólice). *"A payer may have one or more
addresses, and each address can have one or more policies."*

**Quatro tipos de apólice:** Capitação · Percentual por categoria · Medicaid · **Percentual PPO**
(exige tabela de preço própria + código de ajuste contratual).

**`Assignment` — quem o convênio paga:** *Payer Pays Clinic* (a clínica cobra, submete guia e
recebe) ou *Payer Pays Patient* (o paciente paga tudo e pede reembolso com uma "guia de cortesia").

**Benefícios:** co-pagamento (valor fixo por visita, cobrado no primeiro procedimento faturável do
dia), teto por indivíduo / família / ortodontia, franquia, e a **data de aniversário** em que os
tetos anuais zeram.

**Cobertura por categoria:** tipo (percentual ou valor), máximo, limite anual ou vitalício,
franquia dispensada, ocorrências, frequência — e três exigências booleanas: **pré-determinação
obrigatória**, **CID-10 obrigatório**, **profissional encaminhador obrigatório**.

**Exceção por código** (`site_31`), que é onde o modelo fica fino: acrescenta **idade mínima e
máxima** e **excluir da guia**. O exemplo do fornecedor: preventiva coberta a 80%, mas flúor não
coberto acima dos 16 anos. E o vídeo confirma o efeito: *"if I were to enter a fluoride treatment
in my charting area I want to make sure that the estimate is zero dollars from insurance"*.

**Múltiplas apólices por paciente**, e a **ordem dos cartões define primária e secundária** —
reordena-se arrastando.

### 5.4 A corrente completa, medida no vídeo de 49 minutos

`vid_billing_01` a `vid_billing_05`. **[verificado]**

```
apólice na ficha
   ↓
procedimento lançado no dente/face  ──→  estimativa aparece NA HORA
   ↓                                      (tabela de preço × cobertura)
status = Completed                 ──→  vira COBRANÇA no financeiro
   ↓
Create a Claim → fila (papel/eletrônica) → revisão uma a uma → lote → PDF único
   ↓
pagamento do convênio chega como LOTE → alocado cobrança a cobrança, entre pacientes
   ↓
diferença tratada na mesma linha: negação · ajuste contratual · transferência · reembolso
   ↓
pagamento do paciente (simples FIFO, ou detalhado escolhendo a cobrança)
```

**O caso difícil, que o vídeo resolve em uma tela** (36-44 min): tarifa $400, esperava-se 80%
($320), o convênio pagou $160. Ajuste contratual de $200 reduz a cobrança ao valor acordado; o
convênio pagou 80% de $200 = $160; sobra um **crédito de $40** que é **transferido ao paciente**,
porque o desconto contratual tem de chegar a ele. Resultado: o paciente deve $40, que é 20% de
$200. Tudo numa linha, e o ajuste fica reportável.

**Automação declarada:** as guias podem ser geradas por tarefa agendada (frequência, dias, hora),
*"so that helps make sure that claims aren't missed because someone forgot to click the button"*.

### 5.5 Planos de pagamento e pré-determinação

`financials/payment-plans-overview` · `create-a-predetermination`. **[verificado]** — `site_33`.

**Plano de pagamento** = um **resumo** (que tratamento e qual o custo total) + uma ou mais
**agendas** (em quantas parcelas e quando cada uma aparece na conta). Ortodôntico (para um plano
ortodôntico ativo; aceita conta de paciente, responsável **ou convênio**; não aceita cobrança
nova) × não-ortodôntico (procedimentos planejados ou concluídos e taxas administrativas; só conta
de paciente; aceita cobrança nova do mesmo grupo de clínicas).

**Pré-determinação** é o orçamento submetido ao convênio **antes** do tratamento — e por padrão a
tela só lista os procedimentos que a apólice **exige** que passem por ela.

### 5.6 O momento em que a cobrança nasce — e por que o Brasil inverte isso

**Instrução de Max, 2026-09-03, na aprovação da PARADA 2.** Registrada aqui como **divergência de
mercado**, não como achado do ICE: é a regra do negócio brasileiro, e ela contradiz o padrão da
fonte.

**No ICE, a cobrança nasce da EXECUÇÃO.** O status `Completed` do procedimento — marcado quando o
profissional executou o trabalho no dente e na face — é o que cria a cobrança (§4.1). O plano de
tratamento, por mais completo que esteja, não gera lançamento nenhum enquanto ninguém trabalhar.
É coerente com o mercado norte-americano, onde o convênio paga depois do ato e o paciente paga a
coparticipação no check-out.

**No Brasil, é comum o inverso:** o paciente **paga adiantado** o tratamento, e a fatura sai da
**apresentação e aprovação do plano — da assinatura do contrato**, não da execução. Quem espera o
dentista marcar a face trabalhada no odontograma para faturar não fatura nunca, porque o dinheiro
já entrou semanas antes.

**O que o ICE já tem que serve, e é [verificado]:**

- `PL Planned` — *"Procedure appears on the odontogram and general procedure list. **Does not
  create financial charge, but you can accept pre-payment for it**."* (§4.1)
- Saldo **`Total Prepayment`** — *"The amount paid and allocated to **planned procedures** and
  future payment plan charges."* (§5.1)
- Plano de pagamento não-ortodôntico — *"Created for **planned** or completed procedures, or
  administrative charges."* (§5.5)

Ou seja: **o ICE modela pré-pagamento alocado a procedimento planejado**. O que ele não faz é
tornar isso o caminho padrão — lá o pré-pagamento é a exceção, aqui é a regra.

**O que o ICE não tem, e por isso não pode ser copiado:** o ICE **não tem contrato**. Não há
entidade que o paciente assine e que passe a governar o que pode ser cobrado e quando o trabalho
está terminado. Ele tem *termo de consentimento* (que é clínico e ético, §4.4) e *plano de
pagamento* (que é financeiro, §5.5), e nenhum dos dois fecha o ciclo do outro.

**A regra que Max fixou, e que a Subetapa 03.8 tem de cumprir — as duas metades juntas:**

1. **A cobrança se solta na aprovação do plano/contrato, antes de qualquer execução.** Faturar,
   receber e dar quitação não podem depender de o procedimento estar `executado`.
2. **O contrato não se finaliza enquanto as duas condições não forem verdadeiras ao mesmo
   tempo:** (a) o paciente pagou **tudo**, e (b) o profissional executou o trabalho em **todas as
   faces de todos os dentes planejados**.

A segunda metade é o que impede a primeira de virar buraco. Sem ela, um contrato pago e
parcialmente executado ficaria indistinguível de um contrato cumprido — e é exatamente o caso em
que o paciente já pagou e ainda tem trabalho a receber, que é o risco jurídico e reputacional
maior do modelo brasileiro.

> **Consequência de modelagem, para o relatório de impacto:** o estado de um contrato passa a ser
> derivado de **duas fontes independentes** — o saldo em `aba_finance` e a cobertura de execução
> em `aba_health` (a marcação por face do odontograma). Nenhuma das duas sozinha responde
> "terminou?". É a mesma classe de invariante que a 03.6 criou com `quantidade_maxima` (validação
> de banco, não rótulo) e que `handoffs/instrucoes.md` §5 já registrou como armadilha na 02.10: o
> agendador zerou o KPI "Vencido" porque a fatura saía do contador exatamente quando virava
> pendência. Aqui o risco simétrico é um contrato se declarar concluído no momento do último
> pagamento, ignorando as faces que faltam.

### 5.7 Ortodontia como regime financeiro próprio

`treatment/create-an-orthodontic-treatment-plan` · `check-the-revenue-schedule` ·
`activate-…` · `complete-…` · `cancel-…`. **[verificado]**

Plano ortodôntico com ciclo `rascunho → ativo → concluído | cancelado`, irreversível a partir de
ativo. Rascunho exige fase, procedimento e profissional; **ativar** exige data de início e
**duração estimada**. Ativado, começa a calcular a **agenda de receita diferida** — quanto da
receita é *ganha* e quanto é *futura*, pela duração estimada. Concluir antecipadamente lança toda
a receita futura como ganha hoje. **Cancelar obriga a conciliar** o valor faturado com o trabalho
efetivamente feito, editando os valores "Actual" até baterem.

> Fora do MVP do Vitrine, mas registrado: é a modelagem de **reconhecimento de receita** que
> qualquer tratamento longo (não só ortodontia) precisaria, e que o nosso `aba_finance` não tem.
> **Registrado como candidato a versionamento futuro por decisão de Max de 2026-09-03** — item 49
> do `RELATORIO.md` §5.4, com a fonte (ICE) preservada no vínculo.

### 5.8 Periodontia — o que existe na fonte, e por que não foi aprofundado

`gather/periodontal-overview` · `enter-perio-findings` · `manage-periodontal-chart-settings` ·
`use-perio-keyboard-shortcuts` · `configure/practice-settings-charting` (Periodontal Settings).
**[verificado]** — `vid_overview_03`, 22-25 min.

Lido na estrutura, **não aprofundado**, porque está fora do MVP odontológico do Vitrine. O que a
fonte mostra, para o vínculo ideia↔fonte não se perder:

- **Duas representações do mesmo dado:** o *Periodontal Odontogram* (gráfico) e a *Perio Data
  Entry* (numérica), e o que se digita na segunda desenha na primeira.
- **Medidas por sítio:** profundidade de bolsa, margem gengival, **CAL calculado** a partir das
  duas, sangramento, supuração e placa.
- **Ordem de tabulação configurável** — o cursor avança sozinho na ordem em que o profissional
  mede, com **cinco opções** vindas de um grupo de trabalho de periodontia, definidas por prática
  e sobrescritíveis por profissional no perfil.
- **Atalhos de teclado** para sangramento/supuração/placa, e botões para marcar sangramento ou
  placa em **todos** os sítios de uma vez.
- **Entrada de dois dígitos** como modo, porque o avanço automático do cursor precisa saber se
  espera um ou dois caracteres.
- **Limiar de profundidade** configurável (padrão 4), acima do qual o valor aparece em vermelho.
- **Trava temporal:** *"Any new data is locked at midnight and data from a previous day cannot be
  edited"* — o periograma é um exame datado, não um campo editável.
- **A dentição governa o periograma:** dente não erupcionado, ausente ou extraído **não aceita**
  medida periodontal, e deixa lacuna; dente removido não deixa nem lacuna (§3.2).

> **Registrado como candidato a versionamento futuro por decisão de Max de 2026-09-03** — item 48
> do `RELATORIO.md` §5.4. **E a biblioteca que a Subetapa 03.7 já adotou traz periodontograma
> junto**: o sourcemap do pacote instalado contém `PerioChart.tsx` (108.155 caracteres de fonte),
> `perioGraphic.ts`, `perioClassification.ts`, `perioExport.ts`, `perioPdf.ts` e
> `fhir/toFhirPerio.ts` — **medido, não suposto**. Se essa superfície está exposta ou escondida na
> nossa tela é pergunta para a 03.7 e entra no relatório de impacto; o que está medido aqui é que
> o código veio no pacote e já foi pago em bytes.

---

## 6. Papéis e permissões — para a Subetapa 03.21.a

`configure/practice-settings-provider-group-permissions` · `assign-permissions-to-a-provider` ·
`practice-settings-validation` · `practice-settings-provider-roles`. **[verificado]** — `site_34`.

> *"**Provider Groups are the source of permissions for a user.** A provider […] receives
> permissions from each provider group they belong to."*

**O modelo é aditivo, não hierárquico.** Sem `owner > admin > agent > viewer`. Um usuário pertence
a N grupos e **soma** as permissões. *"If a provider has no permissions given to them by a provider
group, they can only access the: Provider Dashboard, feedback tool, help, and about page."* — o
padrão é o mínimo, não o razoável.

**A grade de permissões**, transcrita de `site_34` e da tabela do fornecedor:

| Grupo | Permissão | Efeito resumido |
|---|---|---|
| Audit | Access Practice Activity | ver o painel de atividade da clínica |
| Charting | Manage Charting | ver e editar o prontuário clínico |
| Collaborations | Access Collaborations | mensagem interna |
| Documents | Manage Documents | ver, atribuir e preencher documentos |
| **Financials** | Manage Financials | Patient > Financials, Patient Management > Financials |
| Imaging | Manage Imaging | imagem clínica |
| Individual | Manage External Providers / Manage Individuals / **Manage Patients** | as três identidades separadas |
| Insurance | Manage Insurance | Practice > Payments, Practice > Insurance, apólices do paciente |
| Notifications | Notification Settings | |
| **Practice Settings** | 16 permissões separadas | uma por menu de configuração |
| Provider | Manage Profile / Manage Training | |
| Referrals | Manage Referrals | encaminhamentos |
| **Reporting** | Manage Reporting | e os tipos de relatório disponíveis **dependem das outras permissões** |
| Scanning · Scheduling · Sharing · Telehealth | | |
| **Validation** | Can Validate / Requires Validation | habilita o grupo a aparecer na configuração de validação |

**Três coisas que valem para nós:**

1. **`Manage Reporting` não dá acesso a todo relatório** — *"Audit reports require the 'Access
   Practice Activity' permission. Procedure reports require 'Manage Charting'. Financial reports
   require 'Manage Financials'."* A permissão de relatório **intersecta** as de domínio. É
   exatamente a armadilha que o nosso relatório de auditoria da 03.5 evitou por decisão, e aqui
   está como regra geral.
2. **Validação é um par de grupos, não um atributo de pessoa.** Configura-se "grupos que exigem
   validação" × "grupos que podem validar". *"If a provider group requires validation, they
   require validation for all actions that can be validated."*
3. **`Provider Roles` é outra coisa** — rótulo do papel do profissional **na consulta** (principal,
   assistente, higienista, dentista), com restrição de qual grupo pode assumir cada papel. É
   ortogonal à permissão.

**O que os dois logins do vídeo de 50 min mostram** (`vid_overview_01` × `vid_overview_02`):

| | Recepção (Corinne) | Clínica (Shivani) |
|---|---|---|
| Painel inicial | grade de agenda com cadeiras e recursos | pacientes recentes + consultas de hoje |
| Panel view | "Front Desk View (SHARED)" | "Treatment Planning View", trocada durante o atendimento |
| O que faz | chegada, apólice, relacionamentos, check-out, pagamento, extrato, agendamento | anamnese, sinais vitais, imagem, achados, dentição, periograma, plano, consentimento |
| Regime | — | **exige validação**: tudo que ela lança vai para a fila do supervisor |

**A mesma pessoa faz as duas coisas em momentos diferentes** — o vídeo troca de login, mas o que
muda é o conjunto de painéis e as permissões, não o produto.

---

## 7. Agenda

`schedule/*`. **[verificado]** — `vid_overview_01`, `vid_overview_05`.

- **Status com legenda e regra de ordem:** há status **pré-check-in** e **pós-check-in**, e só se
  pode usar cada conjunto no seu momento. *"You must mark an appointment as Completed before you
  can check it out"*, e depois do check-out a consulta não se edita mais.
- **Consulta não agendada** (`unscheduled appointment`): tem paciente, clínica, tipo e
  procedimentos vinculados, **mas não tem data**. Fica no painel "Next Visits" do paciente e na
  **prancheta** (`clipboard`) da agenda, para outra pessoa agendar depois. **É o desacoplamento
  entre planejar e marcar** — o dentista planeja as sessões, a recepção encaixa.
- **Short call list:** consulta marcada como "aceita antecipar", com prioridade e data
  recomendada, aparecendo na prancheta para preencher buraco de última hora.
- **Recursos e cadeiras** aparecem lado a lado com profissionais na mesma grade, e a visão é
  filtrável por clínica.
- **Data recomendada** como faixa ou data exata, separada da data marcada.

---

## 8. Relatórios e "warnings"

`report/*`. **[verificado]** — `site_35`.

O achado é o **warning**: *"Warnings […] enable you to turn report results into action items."* Um
relatório roda em segundo plano; se devolver linha, vira **mensagem** — uma no painel da clínica
(com contagem e link para a lista) e outra, com texto diferente, no painel do paciente. Pode ser
configurado como **pop-up que exige reconhecimento** antes de continuar no registro. Atualiza
sozinho a cada dez minutos.

O exemplo do fornecedor: pacientes que fizeram avaliação inicial e não têm consulta nos próximos
12 meses → no painel do paciente, *"Schedule a follow-up appointment"*; no painel da clínica,
*"New patients without follow-up appointments. Confirm that they've been contacted."*

> **Confirma o item 12 do nosso MVP por caminho independente**, e acrescenta o mecanismo: em vez
> de codificar cada card do painel, o painel é alimentado por **relatório + regra de mensagem**.

---

## 9. Encaminhamento (`referrals`) — o nosso item 23

`treatment/referrals-overview` e as 12 páginas de `treatment/*referral*`. **[verificado]**

Ciclo: `Draft → Sent → (em trabalho) → Completed → Closed → Archived`. Só encaminhamento
`Declined` ou `Closed` pode ser arquivado.

**Três tipos padrão:** *Evaluate Only* · *Evaluate & Treat* · *Transfer All Treatments*.

**Quatro coisas que o nosso desenho não previa:**

1. **Quem encaminha ≠ quem cadastrou.** *"The person creating the referral is tracked separately
   from the Referring Provider"*, e só quem estiver configurado como *Referring Provider* aparece
   na busca.
2. **Profissional externo é entidade de primeira classe** — não faz login, não recebe notificação,
   existe para o registro de entrada e saída da clínica ficar correto. Encaminhamento com
   profissional externo exige que a clínica correspondente seja uma **organização**, não uma
   clínica da própria rede.
3. **Três coisas se anexam a um encaminhamento**, e cada uma pode ser criada nova ou vinculada de
   existente: **documento** (formulário, carta, evolução), **anexo** (arquivo) e **colaboração**
   (a conversa entre profissionais). Desvincular não apaga: o item continua no painel de origem.
4. **Tipo de arquivo governa acesso.** *"File types are tied to provider permissions. If a provider
   does not have permissions to access a certain feature, such as Financials, they will not be
   able to access files types related to that feature."* — o anexo herda a permissão do domínio a
   que pertence. Vale diretamente para a nossa Subetapa 03.11 (caixa de entrada de exames).

---

## 10. O que mais apareceu, e onde encosta em nós

| Achado | Onde | Encosta em |
|---|---|---|
| **Health facts** — condições, medicações e alergias com **significância** e nota datada, visíveis na barra lateral em cores, alimentados pela própria anamnese | `gather/health-facts-overview`, `site_11`, `vid_overview_02` | **item 5** (alertas clínicos) e **item 25** (resumo do paciente) |
| **Anamnese com ramificação e roteiro** — responder "sim" a tabagismo abre perguntas e **frases de apoio à conversa** de cessação, para o clínico não precisar de outro formulário | `vid_overview_02` (11-13 min) | item 5; e é o argumento de por que a anamnese é formulário configurável, não tela fixa |
| **Notas administrativas com reconhecimento forçado** — nota não clínica que aparece como bandeira em locais escolhidos (agenda, financeiro, painel) e pode **exigir leitura antes de continuar** | `patient/administrative-notes-overview` | nenhum item nosso — **candidato a item novo** |
| **Evolução clínica com ciclo declarado** — `Draft → (Pending) → Locked`, **adendo** depois de travada, PDF só depois de travada, e **atribuição a outro profissional** | `treatment/fill-out-a-progress-note` | nossa `aba_health.evolucoes` tem trava; não tem adendo nem atribuição |
| **Resumo de evolução** — o modelo pode declarar quais respostas aparecem no resumo, para percorrer muitas evoluções sem abrir cada uma | `treatment/review-a-progress-note-summary` | **item 25** (resumo do paciente) |
| **Code macro** — um código que expande em vários, com dente/área padrão por item | `configure/practice-settings-charting` | `aba_catalog`; **candidato a item novo** |
| **Conjuntos de código como configuração** — SNODDS, ICD-10-CM, CDT/ADA, classificação de cárie ICDAS; primários aparecem na busca simples, secundários só na avançada; e a clínica cria conjunto próprio, **mapeando o código custom a um código real** para herdar o visual no odontograma e o faturamento | `configure/practice-settings-charting` | `aba_catalog` + SIGTAP da 03.6 — **o SIGTAP é o nosso "code set", e a estrutura de mapeamento é reaproveitável** |
| **Colaboração** — mensagem interna entre profissionais, vinculável a um paciente e a um encaminhamento | `start/manage-collaborations` | fora do MVP; registrado |
| **Telessaúde** com câmera intraoral adicional | `ICE14`-`ICE19`, `ICE31` | fora do escopo v01 |
| **Portal do paciente** — convite, senha temporária, revogação, formulário preenchido pelo paciente, confirmação de consulta, saldo, mensagem | `patient/*portal*` | itens 10 e 19; o ICE tem **revogação de acesso** explícita |
| **Histórico por linha** — todo procedimento e achado tem histórico de alterações com destaque em amarelo | `gather/view-procedure-or-finding-history` | nosso `log_acesso` grava; não exibe por linha |
| **Troca de profissional recalcula o preço** — e o sistema **avisa a diferença e o ajuste que vai lançar** antes de confirmar | `gather/edit-procedure-and-finding-details` | consequência direta da escada de tabela de preço |

---

## 11. Lacunas declaradas

Nunca preenchidas por inferência (`CLAUDE.md` §11, "Se esgotar" do plano):

1. **`ICE09` sem legenda** — 1 dos 32 vídeos. Os três clientes de `yt-dlp` testados não
   entregaram; o mosaico de quadros existe, a transcrição não. Não compensado por adivinhação.
2. **Preço do ICE: indisponível.** O help center não publica valor e não há página pública de
   preço. Não foi estimado nem inferido de concorrente parecido — mesma regra do benchmark de
   agosto.
3. **Versão do produto nas imagens `/img/classic/2020-…`:** o nome do arquivo data de 2020.
   As telas dos dois vídeos longos são posteriores e batem estruturalmente, mas a aparência pode
   ter mudado. Onde importa, `[a conferir]`.
4. **Nada foi visto de dentro do produto.** Não há login, não há trial, não há ambiente de
   demonstração público. Tudo aqui é help center e vídeo — o que o fornecedor **mostra**, não o
   que ele **tem**.
5. **73 páginas de `release` e 34 de `video` foram coletadas mas não lidas por inteiro** — são
   notas de versão e páginas que só embutem os vídeos já analisados. Estão no bruto
   (`~/.claude/jobs/analise-ice/site.json`) e podem ser lidas sob demanda.
6. **Periodontia e ortodontia lidas na estrutura, não aprofundadas.** Estão fora do MVP
   odontológico do Vitrine, e por isso foram fichadas em §5.8 e §5.7 sem varredura página a
   página. **Por decisão de Max de 2026-09-03 as duas viraram candidatas a versionamento futuro**
   — itens **48** e **49** do `RELATORIO.md` §5.4 —, justamente para que o vínculo entre a ideia e
   a fonte que a originou não se perca. **Uma pesquisa dedicada a cada uma está disponível a
   pedido e não exige nova coleta:** as 424 páginas e as 31 transcrições seguem em
   `~/.claude/jobs/analise-ice/`. **Contado, não estimado:** o help center tem **4 páginas** de
   periodontia (`gather/periodontal-overview`, `enter-perio-findings`,
   `manage-periodontal-chart-settings`, `use-perio-keyboard-shortcuts`) mais a seção *Periodontal
   Settings* de `configure/practice-settings-charting`, e **16 páginas** de ortodontia (9 em
   `treatment/`, 7 em `financials/`). Das 20, **10 já foram lidas por inteiro** nesta rodada; as
   outras 10 estão coletadas e disponíveis. **Periodontia é a mais rasa das duas na fonte** — o
   que ela tem de profundo está no periodontograma do produto, e não em texto de ajuda.

---

## 12. Método — o que esta coleta aprendeu, para a próxima não repagar

Registrado também em [`../../handoffs/instrucoes.md`](../../handoffs/instrucoes.md) §5.

1. **O help center é Docusaurus servido estático.** `curl` devolve o `<article>` inteiro; subir um
   navegador para fotografar a página seria trocar a imagem original do produto por uma foto dela.
   Medir o alvo antes de escolher a ferramenta economizou a coleta inteira.
2. **Skill fora do repositório regride.** As duas correções pagas em agosto na `/watch` (`-vsync`
   e `--sub-langs`) foram **desfeitas pela atualização do plugin**. O coletor novo chama `ffmpeg`
   direto e é versionado aqui.
3. **O YouTube limita legenda por taxa, não por volume.** Depois de ~30 pedidos seguidos, o cliente
   padrão responde `Sign in to confirm you're not a bot` — e o download de **vídeo** continua
   funcionando, o que faz a falha parecer específica de legenda. **21 de 22 vídeos ficaram sem
   transcrição na primeira rodada, em silêncio.** `web_embedded` e `android` entregam, sem login.
4. **Contar palavra em bundle levanta hipótese, não a prova.** O `odontogram.js` da 03.7 tem 461
   ocorrências de `surface` e 29 de `popup`, e nenhuma das duas coisas é o que a NOTA 03 pedia.
   Só a leitura do handler (`onToothClick(toothNo, e)`) decidiu.
