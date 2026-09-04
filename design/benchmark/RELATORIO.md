# Benchmark de concorrentes — software odontológico

Oito concorrentes reais investigados no bench `bench/benchmark-odonto`, em três rodadas: as
páginas públicas em **2026-08-31**; a mecânica por dentro em **2026-09-01** — **56 vídeos** dos
concorrentes, os recursos colhidos nos sites, 4 repositórios, 14 capturas de Max e o acervo dele
de gestão pública em Saúde Bucal; e em **2026-09-02** a revisão do §5 (c) por Max, que refez a
numeração, fundiu duplicações e reclassificou cinco itens.
Cinco brasileiros — contendo os três mais vendidos do país — e três internacionais.

**Rodada 4 — o ICE Health System (2026-09-03), no branch `analise-ice`.** Um nono software entra
no material, **fora da amostra dos oito e por outro motivo**: ele não concorre com o Vitrine no
mercado brasileiro, mas documenta o produto em nível de campo de formulário e de caminho
alternativo — **424 páginas de help center e 32 vídeos**, dois deles de ~50 minutos lidos do
início ao fim. É referência de **modelagem**, não de mercado. Detalhe em
[`fontes/ice.md`](fontes/ice.md); método e escopo em
[`00_PLANO_DE_ACAO_ICE.md`](00_PLANO_DE_ACAO_ICE.md); o que ele muda na Etapa 03 em
[`RELATORIO_DE_IMPACTO_ICE.md`](RELATORIO_DE_IMPACTO_ICE.md).

**Nada aqui foi implantado.** O produto em `crm/`, o Supabase e o subdomínio no ar seguem
intactos. Isto é matéria-prima de decisão de Max (`CLAUDE.md` §13).

**[verificado]** = visto em fonte pública ou funcionando na tela do vídeo · **[declarado]** = o
fornecedor afirma, sem prova na tela · **[a conferir]** = não confirmado na fonte primária. Todo
preço, número e artigo de lei tem link e data em [`fontes/COLETA.md`](fontes/COLETA.md); as
**115 referências visuais** em [`capturas/`](capturas/), com índice por pasta — 61 das rodadas 1 a
3 e **54 da rodada 4** ([`capturas/ice/INDICE.md`](capturas/ice/INDICE.md)).

**Três limites, declarados antes do resultado.** (1) Não existe auditoria pública de market
share deste nicho no Brasil — todo número de base é **autodeclarado pelo fornecedor**. (2) Preço
não publicado entra como "sob consulta", nunca estimado. (3) Coleta só de material público: sem
cadastro, sem login, sem trial.

---

## 1. A amostra, e por que estes oito

O TOP 3 brasileiro foi decidido por **cinco sinais públicos declarados antes da busca** — base
declarada, diretório, app móvel, ReclameAqui e vínculo institucional. Os três primeiros aparecem
em **todos** os comparativos independentes consultados.

| # | Software | Base declarada | ReclameAqui (6–12 m) | Reclam. | Voltariam | Resposta |
|---|---|---|---|---|---|---|
| 1 | **Simples Dental** | +60 mil dentistas | **9,6 ÓTIMA** | 18 | **100%** | **14 h** |
| 2 | **Clinicorp** | +20 mil clínicas · 100 mil usuários · R$ 10 bi transacionados | 8,4 ÓTIMA | 64 | 71,9% | **13 dias** |
| 3 | **Dental Office** | +45 mil dentistas · 25 anos | 7,3 BOA | 19 | 63,6% | 7 dias |

Todos **[verificado]**. Os números de base não são comparáveis entre si — dois contam *dentistas
cadastrados* (inclui teste grátis) e um conta *clínicas pagantes*. Por isso o ranking usa a
convergência dos cinco sinais, não o número maior.

Mais dois brasileiros entram por **diferencial estrutural**: **EasyDental** (desde 1994,
**controlada pela OdontoPrev** — o único integrado a uma operadora de convênio) e **Santé
Odonto** (o mais IA-first do país, e a proposta mais próxima da nossa). Ficaram de fora, com
motivo registrado: Codental, BlueDental, Odontosys, Dentalis, ClinicaSysPro, iClinic, Ninsaúde.

Os três internacionais entram por instrutividade: **Dentrix Ascend** (líder do PMS americano),
**Curve Dental** (referência de UX *cloud-native*) e **Weave** — que **não é um PMS**, é a camada
de comunicação e CRM vendida *por cima* dele, e portanto o análogo mais direto do Vitrine.

---

## 2. (a) O que cada um tem

| | Simples Dental | Clinicorp | Dental Office | EasyDental | Santé Odonto | Dentrix Ascend | Curve | Weave |
|---|---|---|---|---|---|---|---|---|
| Odontograma | ✓ | não citado | ✓ | ✓ (já no plano base) | ✓ | ✓ | ✓ | — |
| Anamnese + assinatura | ✓ | ✓ | ✓ (certificado digital) | ✓ (paga à parte) | ✓ | ✓ | ✓ | formulário |
| **IA** | Secretária IA (à parte) | 2 combos, **sob consulta** | diagnóstico + voz, **opcional** | transcrição de áudio | transcrição + agente `Conversas` | diagnóstico de cárie, *charting* por voz | Curve+ AI Suite, *ambient AI* | *Call Intelligence* |
| WhatsApp | ✓ + **extensão no WhatsApp Web** | ✓ (combo de agentes) | ✓ (por crédito) | **cobrado à parte** | manual no Starter, automático no Premium | — (mercado EUA) | — | SMS/VoIP |
| CRM / funil | plano Pro | plano Premium | **opcional pago** | plano Clínica | plano Premium | marketing integrado | Curve GRO | núcleo do produto |
| Estoque de insumos | — | ✓ (com validade) | — | ✓ (+ protéticos) | — | — | — | — |
| Convênio / TISS | — | — | — | **TISS + TUSS + CID-10 + elegibilidade OdontoPrev** | — | elegibilidade automática | eClaims ilimitado | verificação (só odonto) |
| Portal / app do paciente | ✓ | app gratuito | autocadastro | auto-agendamento | ✓ | agendamento online | ✓ | ✓ |
| Multiunidade | — | ✓ | — | só plano Clínica | — | ✓ | ✓ | por unidade |

Duas ausências valem tanto quanto as presenças: **estoque de materiais só existe em dois dos
cinco brasileiros**, e **nenhum dos cinco exibe selo de certificação SBIS/CFM** nas páginas
públicas consultadas.

---

## 3. (b) O diferencial que sustenta a venda de cada um

- **Simples Dental — a reputação é o produto.** 100% de "voltariam a fazer negócio" e resposta em
  14 horas, contra 13 dias do concorrente direto; as quatro notas ficam na primeira dobra da
  home. O **Copiloto que roda dentro do WhatsApp Web** é o recurso que ninguém copiou.
- **Clinicorp — não vende software, vende faturamento.** A home não mostra tela de produto:
  mostra dentista dizendo que faturou 300% ou 5× mais. Implantação **obrigatória e paga** em
  todos os planos, e o CTA é "fale com um especialista", nunca "teste grátis".
- **Dental Office — vende pelo preço de entrada.** R$ 39,90 é o piso do país — mas esse plano não
  tem prontuário, nem financeiro, nem navegador. É isca; a receita está nos "Opcionais".
- **EasyDental — vende o convênio.** Único dentro de uma operadora (OdontoPrev): guia TISS
  automática, TUSS e CID-10 prontas, **elegibilidade do associado conferida na própria agenda**.
- **Santé Odonto — vende a IA como produto separado.** CRM a partir de R$ 117,52/mês; agente de
  IA (`Santé Conversas`, WhatsApp + Instagram 24 h) a partir de **R$ 437/mês** — 3,7× o software.
  E cobra **por agenda**, não por usuário: R$ 33 por agenda adicional, profissionais ilimitados.
- **Dentrix Ascend — vende número de resultado.** "119% de melhora na identificação de cárie com
  IA"; "4 horas por dia economizadas na verificação de convênio". Não publica preço.
- **Curve Dental — vende custo evitado**: eliminar servidor, TI terceirizada e *clearinghouse*.
  Tem um **agente de IA por voz na própria home**.
- **Weave — vende a conversa, não a clínica.** Nasceu telefonia VoIP e cresceu para mensagem,
  agenda e pagamento. Cobra **por unidade** a partir de US$ 199/mês, e o que separa as faixas é
  **cota de mensagem** (1.500 / 3.000 / 15.000 ao mês).

---

## 4. Preços observados

Só valores publicados pelo próprio fornecedor. **[verificado]**

| Software | Entrada | Meio | Topo | Cobrado à parte |
|---|---|---|---|---|
| Dental Office | R$ 39,90 (1 usuário, sem prontuário) | R$ 138,52 (3) / R$ 210,18 (5) | R$ 298,54 (10 usuários) | CRM, IA, WhatsApp |
| EasyDental | R$ 89,00 | R$ 219,00 | R$ 319,00 (multiclínica) | **WhatsApp**, assinatura digital, SMS, Serasa |
| Santé Odonto | R$ 117,52 (1 agenda) | — | R$ 341,04 | **IA a partir de R$ 437**; R$ 33/agenda |
| Simples Dental | R$ 137,41 | R$ 229,08 | R$ 320,74 | Secretária IA, WhatsApp, NF |
| Clinicorp | R$ 159,90 | — | R$ 369,90 | **implantação obrigatória**; IA sob consulta |
| Weave (EUA) | US$ 199/mês por unidade | sob consulta | sob consulta | — |
| Curve Dental | **sob consulta** | | | |
| Dentrix Ascend | **sob consulta** (terceiros relatam US$ 399/mês/usuário) **[a conferir]** | | | |

Quatro padrões convergentes: **faixa real de entrada R$ 89–159**; **teto publicado R$ 320–370**;
**teste grátis de 7 dias sem cartão** em todos os brasileiros; e **ninguém publica o preço da
IA** — os dois que a vendem separada cobram sob consulta (Clinicorp) ou 3,7× o CRM (Santé).

---

## 5. (c) O que importar para o Vitrine

**Revisado por Max em 2026-09-02.** A numeração foi refeita em sequência única (1–33), quatro
duplicações foram fundidas e cinco itens mudaram de MVP para futuro ou o contrário. As tabelas
canônicas são [`fontes/MVP.xlsx`](fontes/MVP.xlsx) e [`fontes/FUTURO.xlsx`](fontes/FUTURO.xlsx);
o que segue é a transcrição delas, com as observações técnicas que a revisão levantou.

**A lista foi reaberta três vezes desde então, e as três estão registradas aqui.**

**(1) 2026-09-03, por Max:** o MVP passou de 24 para **26 itens**, com **25 — Resumo do paciente**
e **26 — Prescrições de medicamento** (`docs/00_PLANO_E_CRITERIOS.md`, ETAPA 2 DO ROTEIRO). Eles
estão transcritos ao fim da tabela "Agora".

> ⚠️ **Colisão de numeração, medida e declarada — não é erro de transcrição.** A sequência deste
> documento é **única de 1 a 33**, com **25–33 no Futuro**. Os dois itens novos do MVP também se
> chamam 25 e 26. Portanto **`25` e `26` nomeiam dois itens diferentes cada um** neste material, e
> o desambiguador é o bloco: `25-MVP` / `26-MVP` × `25-futuro` / `26-futuro`. **Nada foi
> renumerado de propósito** — renumerar quebraria referência já escrita nas subetapas da Etapa 03,
> e a convenção do projeto é inserir sem renumerar. Registrado por decisão de Max de 2026-09-03
> (D-ICE-1, `00_PLANO_DE_ACAO_ICE.md` §8).

**(2) 2026-09-03, pela pesquisa `analise-ice`:** os itens que o ICE revelou entram **a partir de
34** — o primeiro número livre da sequência —, na seção §5.4 abaixo. **Todos entram como
reportados, nenhum como planejado** (`CLAUDE.md` §15): quem decide o que vira escopo é Max.

**(3) 2026-09-04, por Max (decisão D-I5, Subetapa 03.0.a):** dos 16 itens da §5.4, **quatro
entraram no MVP** — **34** (opções de tratamento concorrentes), **35** (requisitos por
procedimento), **36** (recusa implícita e re-consentimento) e **41** (vigência de tabela de
preço). **O MVP passou de 26 para 30 itens.** Nenhum deles criou subetapa nova: 34 e 36 são a
forma da entidade da Subetapa 03.8, 35 foi absorvido pela 03.6.a e 41 pela 03.8.a. Os demais
(**37, 38, 39, 40 e 42-49**) seguem **reportados e não planejados**, registrados no Backlog de
versionamento de `docs/00_PLANO_E_CRITERIOS.md` com o vínculo à fonte preservado.

Fontes: os recursos que Max colheu nos sites, **56 vídeos** dos concorrentes, **4 repositórios**,
**14 capturas** dele e o **acervo de gestão pública** — detalhe em
[`fontes/COLETA.md`](fontes/COLETA.md) §C1, [`fontes/VIDEOS.md`](fontes/VIDEOS.md),
[`fontes/REPOS.md`](fontes/REPOS.md), [`fontes/IDEIAS.md`](fontes/IDEIAS.md),
[`fontes/IDEIAS_MAX.md`](fontes/IDEIAS_MAX.md) e
[`fontes/REFERENCIA_ODONTO_CEO.md`](fontes/REFERENCIA_ODONTO_CEO.md).

**A coluna "temos?" foi conferida nas 39 migrations e em `crm/src/`** — nunca de memória.
`✅` existe · `🟡` fundação existe, falta a peça · `❌` ausente do schema inteiro.

### O achado que ordena a lista

O odontograma não é uma tela isolada: é o meio de uma corrente de quatro elos —

> **catálogo** (procedimento com "aceita faces" e unidade de lançamento) → **odontograma**
> (seleciona dente e faces) → **orçamento** (linha com dente, faces e o preço daquele convênio) →
> **contrato e financeiro** (aprovar o orçamento gera o lançamento).

O Vitrine tem o **primeiro** elo (`aba_catalog`) e o **quarto** (`aba_finance`). Faltam os dois do
meio — e **o orçamento é o mais crítico**, porque sem ele o odontograma não tem onde escrever.

> **[Precisado pela rodada 4, 2026-09-03 — a corrente está certa, o terceiro elo está mal
> nomeado.]** A palavra **"convênio"** desta frase é a correta, e é ela que a Subetapa 03.8
> confirmou ao derrubar a leitura "plano" (`handoffs/instrucoes.md` §5). Mas o ICE mostra que
> **"o preço daquele convênio" não é um campo da linha**: é o resultado de uma **escada de
> resolução** — `Paciente > Tipo de profissional > Clínica > Grupo de clínicas > Prática` — que
> roda no momento em que o procedimento é lançado, sem ninguém escolher tabela na tela; e o
> convênio PPO fica **fora** dessa escada, entrando como **ajuste contratual** sobre a diferença.
> Prova ao vivo: a mesma consulta custa $250 com um profissional e $400 com um especialista
> (`fontes/ice.md` §5.2). E o terceiro elo, no ICE, não se chama orçamento: chama-se **plano de
> tratamento**, com fases clínicas e opções concorrentes, do qual o valor é uma **projeção**
> (`Estimate: Ins. $X / Pt. $Y`), não o objeto. Ver `RELATORIO_DE_IMPACTO_ICE.md`.

### Agora — cabe no MVP

| # | O que | Temos? | Origem | Onde encosta |
|---|---|---|---|---|
| 1 | **Orçamento como entidade**: cabeçalho + linhas (`plano · procedimento · dente · faces · valor`), estados rascunho→aprovado, PDF "Plano de Tratamento" com duas assinaturas, e aprovar gera lançamento | ❌ | vídeos SD06, CT09 | schema novo, entre `aba_catalog` e `aba_finance` |
| 2 | **Odontograma** com dentição permanente/decídua/**mista** e estados *a realizar / executado / existente* | ❌ | todos | `aba_health`; ver §5.1 sobre o peso |
| 3 | **"Aceita faces"** no procedimento do catálogo — o elo que liga catálogo e odontograma | ❌ | vídeo SD12 | `aba_catalog.servicos` |
| 4 | **`sala_de_espera`** no enum de status do agendamento, mais o KPI de taxa de falta | 🟡 | vídeo CT10 | `aba_scheduling`. **[Corrigido na Subetapa 03.0, 2026-09-03]** — o item dizia faltar também `faltou`; ele **já existe** como `nao_compareceu` (`db/migrations/009_aba_scheduling.sql:259`), traduzido pela convenção do `CLAUDE.md` §2. A taxa de falta é calculável desde a Etapa 01; falta o valor de sala de espera e o KPI que lê o dado |
| 5 | **Alertas clínicos derivados da anamnese**, fixos no cabeçalho da ficha ("Hipertenso", "Risco de hemorragia") | ❌ | vídeo SD15 | `aba_health.respostas_anamnese` — **é segurança do paciente, não conveniência** |
| 6 | **Consentimento de imagem visível** na ficha, travando publicação | ✅ no banco | Art. 14, III do CFO | `aba_health.consentimentos` — só falta a tela |
| 7 | **Exportação do prontuário** — pelo dono da conta a qualquer momento, **e pelo próprio paciente quando ele solicita**, sempre por token de expiração curta e com segunda prova de identidade | ❌ | ninguém faz bem — **oportunidade** | Art. 18, I do CFO + Art. 6º da Lei 13.787 (§6) |
| 8 | **Relatório "Ações dos usuários"** sobre o log que já gravamos — **visível apenas ao `owner`** | ✅ no banco | vídeo CT04 | `aba_health.log_acesso` — a tela mais barata de maior valor comercial desta rodada |
| 9 | **Marcadores coloridos no agendamento** + relatório por marcador | ❌ | vídeo CF19 | `aba_scheduling.agendamentos` (a cor existe em `profissionais` e `recursos`, não no agendamento) |
| 10 | **Link público de agendamento** — entrando como *solicitação a confirmar*, não direto na agenda | ❌ | vídeo CF04; os 5 concorrentes têm | `aba_scheduling` |
| 11 | **Expor o controle de cadeiras** e a ocupação da agenda | ✅ no banco | vídeo CT10 | `aba_scheduling.recursos` + `horarios_recursos` já existem, sem UI |
| 12 | **Painel como lista de tarefas acionáveis** (confirmar / reagendar / receber), não de gráficos | 🟡 | vídeo SD02 | valida a Versão 03 do dossiê de UX |
| 13 | **Régua de cobrança como linha do tempo** (verde antes → amarelo no vencimento → vermelho depois), cada ponto pendurando uma regra | 🟡 | vídeo CF07 — **a melhor peça de UX do corpus** | `aba_automations` + `aba_finance` |
| 14 | **Editor de template** com variáveis como fichas coloridas no texto, prévia ao vivo e contador | 🟡 | imagem `whatsapp_01` | `aba_messaging` |
| 15 | **Cota de mensagem declarada no plano** em vez de créditos opacos | ❌ | Weave (1.500/3.000/15.000) | `aba_messaging`; resolve a precificação da janela de 24 h |
| 16 | **Campanhas por receita pronta** (aniversário, retorno, pós-operatório…) com **contagem de alcance antes do envio** | 🟡 | vídeo SD09 | `aba_automations` |
| 17 | **Estados vazios instrutivos** e exportação para Excel | ❌ | vídeos SD02, SD18 | camada de apresentação |
| 18 | **Caixa de entrada de exames por token** — laboratório envia por link rastreável, revogável e com expiração; o arquivo espera o **aceite** do dentista antes de entrar no prontuário | ❌ | ideia de Max; **nenhum dos 8 tem** | `aba_health` + Edge Function; o padrão está construído e depurado no **CRM Sindcom** |
| 19 | **Assinatura eletrônica simples do paciente por link multicanal** — WhatsApp, e-mail, SMS **ou leitura de QR code** —, com token rastreável, desenho no celular e estado pendente→assinado | ❌ | ideia de Max; o concorrente faz **só por WhatsApp** e cobra R$ 0,15/doc | `aba_health.consentimentos` (já existe, sem tela) |
| 20 | **Estoque e inventário de materiais e serviços** — lote, validade, entrada/saída, vínculo a fornecedores e **alertas** (validade de insumo, estoque mínimo, calibragem e contrato de terceiro vencendo) | ❌ | ideia de Max | **é conformidade sanitária, não gestão** — é o que evita a autuação no dia da fiscalização. `aba_people.fornecedores` já existe |
| 21 | **Tabela de métricas** por CRM-filho, agregando na origem (só contagem e categoria), pronta para a plataforma **Aurora** consolidar quando existir | ❌ | ideia de Max | **a única que não dá para adiar** — retroajustar coleta em N instâncias vendidas é migração em N bancos |
| 22 | **Semente do catálogo** com os procedimentos da Atenção Básica, o **código SIGTAP**, a **unidade de lançamento** e a **quantidade máxima** por unidade | ❌ | `fontes/SIGTAP.xlsx` + acervo de gestão pública de Max | `aba_catalog`; troca a tela vazia inicial por uma base real e prepara TISS/TUSS sem retrabalho |
| 23 | **Encaminhamento com contrarreferência** — estado (`encaminhado → aceito → em atendimento → contrarreferenciado`), formulário nas duas pontas, pré-requisito clínico declarado e **trânsito sempre por token**, nunca anexo em e-mail | ❌ | protocolo público do CEO — **nenhum dos 8 modela isso** | `aba_health` + `aba_scheduling`; o uso do token diz **com quem está a demanda**, e alimenta um alerta de "aguardando contrarreferência" |
| 24 | **Multiunidade** — isolamento por unidade, metas consolidadas e **login em dois estágios** (e-mail e senha → o sistema detecta que o e-mail pertence a mais de um consultório → seleção de consultório) | ❌ | vídeos CF12/CF13/CF15/CF23 | **é a realidade de muitos profissionais**, e adiar isso decide a compra no primeiro contato. Ver a ressalva técnica em §5.2 |
| **25-MVP** | **Resumo do paciente** — aba inicial do dossiê consolidando dados sociais, alergias, riscos e planos vigentes | ❌ | **acrescentado por Max em 2026-09-03** | `aba_health`; Subetapa 03.16.a. O ICE resolve isso com **health facts** com significância na barra lateral e **resumo de evolução** configurável por modelo (`fontes/ice.md` §10) |
| **26-MVP** | **Prescrições de medicamento** — registro clínico novo | ❌ | **acrescentado por Max em 2026-09-03** | `aba_health`; Subetapa 03.16.a |

### Futuro (`+1.0`)

| # | O que | Origem | Observação |
|---|---|---|---|
| 25 | **Assinatura ICP-Brasil com certificado A1 do profissional**, QR code e verificação pública no ITI | vídeo CF21 | é o que a Lei 13.787 Art. 2º §2º prefere; o item 19 é a etapa barata antes desta |
| 26 | **Controle protético como kanban** de 5 etapas com cor de atraso | vídeo CF18 | reusa o componente de `aba_sales.etapas_funil` — a mesma peça serve aos dois |
| 27 | **Plano recorrente** com "liberar procedimento a cada N pagamentos" | vídeos CF03/CF17 | fundação já existe (`aba_catalog.planos`, `aba_finance.planos_cliente`, `saldos_plano`); falta a regra |
| 28 | **Programa de indicação medido em receita** ("18 indicações · R$ 5.124 aprovados") | imagem `marketing_01` | `leads.origem` já aceita `'indicacao'`, mas não registra **quem** indicou |
| 29 | **Ditado clínico que preenche o odontograma**, com tabela de revisão e confirmação humana antes de aplicar | vídeo CT07 | o desenho ético correto: a IA propõe, o profissional aplica |
| 30 | **IA como consulta em linguagem natural** sobre o próprio dado da conta | vídeo CT07 | `aba_ai`; **colide com `CLAUDE.md` §15 — reportado, não planejado** |
| 31 | **NFS-e** | vídeo CF08 | o vídeo mostra o custo real: exige configuração tributária municipal |
| 32 | **Faceograma 2D para HOF** — pontos sobre a foto do paciente, antes/depois por região | vídeos CF05/CF09/CF11 | o mercado **não usa 3D**; ver §5.1 |
| 33 | **TISS/TUSS/CID-10 e elegibilidade de convênio** · **certificação SBIS/CFM** | EasyDental; ausente em todos | esforço alto, mas nenhum concorrente exibe o selo SBIS |

### 5.1 Sobre os repositórios — o que muda com a medição

**`TOOL_Odontogram01` é adotável, com uma condição.** MIT, React 18/19, `jspdf` em import
dinâmico, 191 testes, ativo, e traz periodontograma e **HL7 FHIR R4** de graça — o vocabulário
que a certificação SBIS/CFM pede. **Mas o núcleo pesa 426 KB gzip, medido: 1,5× o bundle inteiro
do Vitrine (284 KB).** Só **atrás de rota preguiçosa**, e depois da divisão por rota de
`06_ORCAMENTO_DE_PESO.md`. Não tem português entre os 11 idiomas.

**`TOOL_HOF_drarayssa` não é adotável, por três motivos independentes:** **não tem licença** —
bloqueio jurídico, não preferência; `three`+`fiber`+`drei` estoura o orçamento; e **o mercado não
resolve HOF com 3D**, e sim com diagrama 2D sobre a foto do paciente.

**`TOOL_Text_Orally` e `TOOL_MuscleMap` são iOS**, não web. Do primeiro aproveita-se o
**instrumento** (questionário de dor orofacial como modelo de anamnese, com a ressalva de que
triagem nunca é diagnóstico); do segundo, só a técnica — que o item 2 já entrega em SVG.

Fichas completas em [`fontes/REPOS.md`](fontes/REPOS.md).

### 5.2 Três ressalvas técnicas que a revisão de 2026-09-02 levantou

**1. O item 24 (multiunidade) não é tela — é cirurgia no núcleo de permissão.** Medido no schema
real: `public.profiles` tem **`user_id UUID NOT NULL UNIQUE`**, ou seja, um usuário pertence hoje
a **exatamente uma** conta; e `access.can()` descobre a conta com
`SELECT account_id, account_role FROM public.profiles WHERE user_id = auth.uid()` — busca de
linha única, **sem parâmetro de conta**. O login em dois estágios exige remover essa UNIQUE e
passar a conta ativa por toda a camada de autorização, que é justamente a peça que `CLAUDE.md`
§14 manda portar sem reescrever. **21 arquivos de migration** tocam `profiles` ou
`is_account_member`. A decisão de Max de trazer o item para o MVP continua valendo — o argumento
comercial é forte —, mas ele deve ser tratado como **subetapa de núcleo, com portão adversarial
próprio**, e não como recurso de aplicação.

**2. O item 20 ficou o maior do MVP.** Juntar estoque, inventário, lote, entrada/saída,
fornecedores e alertas num item só é coerente do ponto de vista de venda (é assim que se anuncia),
mas são vários blocos de trabalho. Sugestão de sequência, se apertar: **alertas e validade
primeiro** — é o que sustenta o argumento de conformidade sanitária —, entrada/saída depois.

**3. A tabela SIGTAP acrescentou uma regra que o item 3 não previa.** Além de `Local`
(dente / sextante / arcada), ela traz **`Quantidade máxima`** por unidade: **32 por dente, 6 por
sextante, 2 por arcada**, ao longo de 64 procedimentos. Isso não é rótulo, é **validação**: um
orçamento com 33 restaurações por dente está errado e o sistema pode dizer isso. Entra no item 22.

### 5.3 Uma correção minha

O antigo item 32 dizia *"Assinatura ICP-Brasil do paciente · plataforma Aurora"*. **Estava
errado nas duas metades:** o certificado A1 é do **profissional**, não do paciente (é o que o
vídeo CF21 mostra), e a plataforma Aurora já estava coberta pelo item 21. Max apontou; a lista
revisada corrige.

---

### 5.4 Itens 34+ — o que a rodada 4 (ICE) acrescentou

**Numerados a partir de 34 por decisão de Max de 2026-09-03** (D-ICE-1): 34 é o primeiro número
livre da sequência única, e nada foi renumerado. **Todos são reportados, nenhum é planejado**
(`CLAUDE.md` §15) — quem decide o que entra em escopo é Max, e a via para isso é o
[`RELATORIO_DE_IMPACTO_ICE.md`](RELATORIO_DE_IMPACTO_ICE.md).

Evidência de cada linha em [`fontes/ice.md`](fontes/ice.md) e nas 54 capturas de
[`capturas/ice/`](capturas/ice/INDICE.md).

**Grupo A — não são itens novos: mudam item do MVP que já existe.** Ficam aqui só para não se
perderem; o efeito real deles está no relatório de impacto.

| # | O que | Muda o item | Onde |
|---|---|---|---|
| — | **Dentição é estado por dente, não modo de exibição.** Permanente e decíduo convivem na mesma arcada; a dentição inicial sai da **idade** em 12 faixas; e há 7 operações por dente (adicionar, supranumerário, substituir, erupcionar, não-erupcionar, ausente, remover), com **tabela de efeitos** distinguindo "ausente" de "não erupcionado" de "removido" | **item 2** (odontograma) | `fontes/ice.md` §3.2 |
| — | **A face é a unidade de seleção**, por uma roseta de 5 regiões (D/M/V/L + centro), e há **micro-superfície** abaixo dela, com faturamento na face-pai | **item 2** | §3.1, §3.3 |
| — | **Selecionar N faces cria N linhas**, uma por dente — não uma linha com N dentes | **itens 1 e 2** | §3.3 |
| — | **O preço se resolve por escada**, não se escolhe na linha; PPO entra como ajuste contratual | **item 1** (orçamento) | §5.2 |
| — | **A cobrança nasce do status `Completed` do procedimento**, não da aprovação de um orçamento | **item 1** | §4.1, §5.4 |

> ### ⚠️ A inversão brasileira — instrução de Max de 2026-09-03, e ela contradiz a fonte
>
> **No ICE a cobrança nasce da EXECUÇÃO** (status `Completed` do procedimento, §4.1 de
> `fontes/ice.md`). **No Brasil é comum o inverso:** o paciente **paga adiantado**, e a fatura sai
> da **apresentação e aprovação do plano — da assinatura do contrato**, não de o dentista marcar a
> face trabalhada no odontograma. Quem esperar a execução para faturar não fatura nunca.
>
> **A regra fixada por Max, nas duas metades, e as duas são obrigatórias:**
>
> 1. **A cobrança se solta na aprovação do plano/contrato**, livre e antes de qualquer execução.
> 2. **O contrato não se finaliza** enquanto não forem verdadeiras ao mesmo tempo: (a) o paciente
>    pagou **tudo** e (b) o profissional executou o trabalho em **todas as faces de todos os
>    dentes planejados**.
>
> **O que o ICE já tem que serve** — e é o que impede isso de virar invenção: `PL Planned` *"does
> not create financial charge, **but you can accept pre-payment for it**"*; o saldo
> `Total Prepayment` é definido como *"the amount paid and allocated to **planned procedures**"*;
> e o plano de pagamento não-ortodôntico é criado para *"**planned** or completed procedures"*.
> O mecanismo existe na fonte; o que muda é qual caminho é o padrão.
>
> **O que o ICE não tem, e por isso não se copia:** o ICE **não tem contrato**. Tem termo de
> consentimento (clínico) e plano de pagamento (financeiro), e nenhum dos dois fecha o ciclo do
> outro.
>
> **Consequência de modelagem para a Subetapa 03.8:** o estado "terminou?" passa a ser derivado de
> **duas fontes independentes** — o saldo em `aba_finance` e a cobertura de execução por face em
> `aba_health`. Nenhuma responde sozinha, e declarar concluído no último pagamento ignoraria as
> faces que faltam. É a mesma classe de armadilha que a 02.10 já pagou (`instrucoes.md` §5): o
> agendador zerou o KPI "Vencido" porque a fatura saía do contador exatamente quando virava
> pendência.

**Grupo B — itens novos candidatos ao MVP.**

> **Decidido em 2026-09-04 (D-I5, Max).** Dos oito abaixo, **entraram no MVP: 34, 35, 36 e 41**.
> **Ficaram fora, reportados e não planejados: 37, 38, 39 e 40** — todos no Backlog de
> versionamento de `docs/00_PLANO_E_CRITERIOS.md`, com o motivo de cada um. O Grupo C inteiro
> (42-49) segue no futuro.

| # | O que | Por que agora | Onde encosta |
|---|---|---|---|
| **34** | **Opções de tratamento concorrentes (A/B/…) sob o mesmo diagnóstico**, em colunas, com o diagnóstico atravessando as opções e as fases clínicas como linhas (Emergency · Systemic · Acute · Disease Control · Definitive · Maintenance) | É a estrutura que transforma "orçamento" em conversa clínica com o paciente — e é o desenho que a 03.8 ia construir sem. Barato **agora**, caro depois de a entidade existir | `aba_treatment` / Subetapa 03.8 |
| **35** | **Requisitos por procedimento**, com pop-over: consentimento de tratamento, consentimento informado, pré-determinação de convênio, validação por supervisor e achado diagnóstico obrigatório — configurados **por código** | Torna a regra clínica dado, não código. O nosso `aceita_faces` da 03.6 é o primeiro membro dessa família | `aba_catalog.servicos` + 03.8 |
| **36** | **Recusa implícita e regra de re-consentimento.** Consentir a Opção A marca a B como recusada; e mudar **dente** ou **código** exige novo termo, enquanto mudar **face**, **fase**, **opção** ou **diagnóstico** não exige | É requisito ético e jurídico, não conveniência: o registro de que o paciente escolheu A **e recusou B** | `aba_health.consentimentos` + 03.8 |
| **37** | **Step set** — procedimento partido em etapas com status, data e consulta próprios, percentual de receita por etapa e **uma etapa faturável** | Coroa, prótese e endodontia acontecem em várias sessões; sem isto o financeiro só sabe "feito" ou "não feito" | `aba_catalog` + `aba_finance` |
| **38** | **Consulta não agendada + prancheta** — o clínico planeja as sessões e vincula procedimentos **sem data**; a recepção agenda depois, arrastando da prancheta | Desacopla planejar de marcar, que é o gargalo real do balcão. Encosta no item 4 (sala de espera) sem se confundir com ele | `aba_scheduling` |
| **39** | **Warnings — relatório que vira item de ação**, com mensagem diferente no painel da clínica e no do paciente, contagem, link para a lista e opção de **exigir reconhecimento** | É o mecanismo genérico por trás do item 12 (painel como lista de tarefas): em vez de codificar cada card, o painel é alimentado por relatório + regra | `aba_automations` + painel |
| **40** | **Notas administrativas com reconhecimento forçado** — nota não clínica que aparece como bandeira nos locais escolhidos (agenda, financeiro, painel) e pode travar o trabalho até ser lida | "Este paciente não pode ser atendido sem o responsável" é informação de recepção, não de prontuário — e hoje não tem onde morar | `aba_people` |
| **41** | **Vigência de tabela de preço** — rascunho editável, **compromisso com data**, e tarifa comprometida que não se edita mais | Reajuste vira tabela nova, e o histórico de quanto se cobrou em cada data fica correto sozinho. É o que impede um `UPDATE` de reescrever o passado do financeiro | `aba_catalog` |

**Grupo C — itens novos para o futuro (`+1.0`), reportados e não planejados.**

| # | O que | Observação |
|---|---|---|
| **42** | **Validação por supervisor** — pares de grupos ("exige validação" × "pode validar"), fila de trabalho do supervisor com tudo que o aluno lançou, e indicador vermelho/verde por item | Nasce do contexto de clínica-escola do ICE. Vale para clínica com estagiário ou dentista júnior; e é **exatamente** o mercado de faculdade de odontologia, que é um CRM-filho plausível |
| **43** | **Adendo em evolução travada** e **atribuição de evolução a outro profissional** | Nossa `evolucoes` trava e não tem saída para "esqueci de escrever isto" a não ser evolução nova solta |
| **44** | **Code macro** — um código que expande em vários, com dente/área padrão por item | Ganho de digitação em procedimento composto |
| **45** | **Reconhecimento de receita diferida** — plano longo com duração estimada, receita "ganha" × "futura", e conciliação obrigatória no cancelamento | O ICE faz isso para ortodontia; a estrutura serve a qualquer tratamento longo. Encosta no item 27 (plano recorrente) |
| **46** | **Conjunto de código como configuração**, com código próprio da clínica **mapeado** a um código oficial para herdar visual e faturamento | Generaliza o que a 03.6 fez com o SIGTAP: hoje a semente é fixa; aqui a clínica cria os próprios códigos sem sair do padrão nacional |
| **47** | **Anexo cujo tipo governa o acesso** — o arquivo herda a permissão do domínio a que pertence (financeiro, imagem, agenda, prontuário) | Vale diretamente para a Subetapa 03.11 (caixa de entrada de exames): hoje o nosso bucket é clínico ou não é |
| **48** | **PERIODONTIA como especialidade completa** — periodontograma gráfico + entrada numérica espelhados; medidas por sítio (profundidade de bolsa, margem gengival, **CAL calculado**, sangramento, supuração, placa); **ordem de tabulação configurável** por prática e por profissional (5 opções, vindas de um grupo de trabalho de periodontia); atalhos de teclado e marcação em massa; entrada de dois dígitos como modo; limiar de profundidade que pinta o valor de vermelho; **trava à meia-noite** (o periograma é exame datado, não campo editável); e a dentição governando quais sítios existem | **Registrado a pedido de Max, 2026-09-03**, para o vínculo ideia↔fonte não se perder. Fonte: `fontes/ice.md` §5.8. **E há um ativo já pago:** o sourcemap de `react-advanced-odontogram` (adotado na 03.7) traz `PerioChart.tsx`, `perioGraphic.ts`, `perioClassification.ts`, `perioExport.ts`, `perioPdf.ts` e `fhir/toFhirPerio.ts` — medido, não suposto. Uma **pesquisa dedicada de periodontia sobre a fonte ICE** está disponível a pedido: o material bruto (424 páginas, 32 vídeos) segue em disco e não exige nova coleta |
| **49** | **ORTODONTIA como especialidade completa** — plano ortodôntico com ciclo `rascunho → ativo → concluído \| cancelado` irreversível a partir de ativo; duração estimada obrigatória para ativar; **agenda de receita diferida** (receita *ganha* × *futura* calculada pela duração); conclusão antecipada lançando a receita futura como ganha; **cancelamento que obriga a conciliar** o faturado com o executado; lançamento de dados por visita com cópia da visita anterior e pré-lançamento da próxima; plano de pagamento ortodôntico próprio (aceita conta de convênio, não aceita cobrança nova); e guia com o valor integral do procedimento | **Registrado a pedido de Max, 2026-09-03**, mesmo motivo. Fonte: `fontes/ice.md` §5.7. É também a modelagem de **reconhecimento de receita** que serve a qualquer tratamento longo, não só ortodontia — e que o nosso `aba_finance` não tem. Mesma oferta de pesquisa dedicada |

## 6. (d) Preço praticável

**A faixa está definida pelo mercado, não por nós.** Entrada real (com prontuário) entre R$ 89 e
R$ 159; topo publicado entre R$ 320 e R$ 370. Ficar abaixo de R$ 89 significa competir com a
isca do Dental Office; acima de R$ 370 exige venda consultiva com implantação paga, que é o
modelo do Clinicorp — e o Clinicorp paga por isso com 3,5× mais reclamações e 13 dias de resposta.

**Proposta de faixa e modelo:**

| Plano | Faixa sugerida | Recorte |
|---|---|---|
| **Essencial** | **R$ 119–139/mês** | pessoas, agenda, prontuário com odontograma, financeiro, WhatsApp com cota declarada |
| **Completo** | **R$ 279–319/mês** | + funil/CRM, automações, comissões, assinatura eletrônica, estoque |
| **IA** (complemento) | **R$ 199–299/mês** | agente de atendimento e triagem — dentro da faixa observada (ver abaixo) e **com preço publicado**, que ninguém faz |

**A faixa da IA, agora com os dois extremos conhecidos.** A rodada 2 achou o preço que faltava:
o Simples Dental anuncia a Secretária IA **"a partir de R$ 6 por dia"** — ~R$ 180/mês. Com os
R$ 437 do Santé no topo e o Clinicorp em "sob consulta", a faixa observada é **R$ 180–437**.

**Cinco decisões de precificação que o benchmark sustenta:**

1. **Publicar o preço da IA.** É o único item caro que o mercado inteiro esconde — e o único que
   um deles publica apenas em forma diária, o que já diz algo. Publicar é diferencial de
   posicionamento com custo zero.
2. **Não cobrar o WhatsApp à parte.** EasyDental e Simples Dental cobram; é a queixa natural de
   quem compra um CRM cuja premissa é o WhatsApp. Cota declarada no plano, no modelo Weave.
3. **Não cobrar implantação obrigatória.** É o que separa o Clinicorp (13 dias de resposta,
   71,9% de recompra) do Simples Dental (14 horas, 100%).
4. **Considerar cobrança por agenda, não por usuário** (modelo Santé). Alinha o preço ao valor —
   uma clínica com 3 cadeiras paga mais que um consultório de 1 —, e evita a fricção do modelo
   por usuário, que pune a clínica por cadastrar a recepcionista.
5. **Decidir conscientemente sobre receita secundária.** Os dois líderes têm uma, e são opostas:
   o Clinicorp opera um **marketplace** de contadores e agências; o Simples Dental **exibe
   anúncio de terceiro dentro do modal de evolução clínica** e **retém o dinheiro do boleto em
   conta própria** antes do saque. A primeira é defensável; a segunda coloca publicidade na tela
   do ato clínico, e a terceira transforma o fornecedor em custodiante do caixa do cliente.

**Teste grátis de 7 dias sem cartão** é obrigatório: é o padrão convergente dos cinco brasileiros.

### O flanco jurídico — onde há vantagem real a explorar

Três achados **[verificado]** em fonte oficial e nos documentos dos próprios concorrentes:

- **Lei 13.787/2018, Art. 6º: o prontuário deve ser guardado por no mínimo 20 anos** a partir do
  último registro. O **termo de uso do Simples Dental (cláusula 8.1.2)** diz que, bloqueada a
  conta, os dados de pacientes são mantidos **30 meses** e depois podem ser eliminados *"sem a
  manutenção de qualquer backup"*, cabendo ao usuário "a única e exclusiva responsabilidade" por
  pedir cópia. Trinta meses contra vinte anos. A obrigação legal é do cirurgião-dentista, e o
  software o deixa descoberto.
- **A política de privacidade do Clinicorp declara que os dados ficam em servidores na Carolina
  do Sul (EUA), região US-EAST 1, por prazo indeterminado.** Dado sensível de saúde de paciente
  brasileiro fora do país é transferência internacional, com todo o ônus de base legal da LGPD.
- **Art. 14, III e Art. 44, VI do Código de Ética Odontológica** proíbem exibir imagem ou
  identificar paciente sem consentimento livre e esclarecido — e o marketing odontológico vive de
  antes-e-depois.

O Vitrine já tem construído o que os três achados pedem: `aba_health` com IBAC, `log_acesso`
obrigatório em leitura **e** escrita, `concessoes_prontuario`, consentimento de imagem travando a
leitura de anexo, e dado hospedado onde a conta Supabase escolher. **Isso não é vantagem técnica
— é argumento comercial**, e nenhum dos cinco brasileiros o usa hoje. Falta transformá-lo em
três frases na página de venda e em uma tela de exportação.

---

## 7. (e) Parecer sobre as três versões de UX

O benchmark **confirma a Versão 03**, mas por um motivo diferente do que o dossiê de
`design/ux/` usou — e derruba um argumento que parecia forte.

**O argumento que caiu:** a Versão 01 se defendia por "familiaridade — o comprador já viu esta
tela em outro CRM". As capturas mostram que **isso é falso neste mercado**. O comprador
odontológico não vem do HubSpot nem do Pipedrive; vem do Simples Dental (abas no topo, azul, KPI
em linha), do Santé (sidebar roxa, saudação com emoji) ou do Dental Office. Copiar o CRM genérico
não compra familiaridade nenhuma aqui — só custa a identidade, que era o preço declarado da 01.

**O que o mercado confirma da Versão 03:**

- **Sidebar por tipo de trabalho** é o que o único produto da amostra com tela real exposta
  (Santé) também faz. A navegação por abas do Simples Dental não escala para nove módulos.
- **O painel como "o dia"** bate com o que o Santé mostra primeiro. E a rodada 2 fechou a prova:
  o painel do **líder de mercado** (`SD02_simplesdental.jpg`) não tem um único gráfico na aba
  principal — são *consultas a confirmar*, *a reagendar*, *contas a receber*, cada linha com o
  seu botão. Chegamos ao mesmo desenho por caminho independente.
- **A janela de 24 h como elemento organizador** não tem equivalente em nenhum dos oito — Weave
  chega perto pela cota de mensagem, mas ninguém trata a janela do WhatsApp como estado visível
  da conversa. É o item mais distintivo do Vitrine, e já está na 03.
- **Densidade média e ausência de sombra** separam o Vitrine dos dois extremos: o Santé é folgado
  e afetivo demais para uma clínica com 40 pacientes por dia; o Simples Dental é denso mas
  visualmente datado.

**O que o benchmark recomenda acrescentar à 03 antes de implementar:**

1. **A tela de orçamento** — o arquétipo que faltava, e o mais importante dos cinco (§5).
2. **Odontograma** como padrão de tela novo — não estava no dossiê, e é indispensável.
3. **Alertas clínicos no cabeçalho da ficha**, derivados da anamnese. É segurança do paciente, e
   nenhuma das três versões previa esse elemento.
4. **Um lugar visível para o consentimento de imagem** — o Art. 14, III do CFO transforma isso em
   requisito, não em recurso.
5. **Indicador de cota de mensagem** ao lado do estado da conexão do WhatsApp que a 03 já prevê.

**A paleta de comandos da Versão 02 continua backlog, não caminho descartado** — e o benchmark
reforça: nenhum concorrente odontológico tem `⌘K`, então ela é diferencial futuro, não paridade.

**O que a rodada 4 acrescenta ao parecer, sem mudá-lo.** O ICE confirma os cinco pontos acima e
levanta um sexto, que é de arquitetura de tela e não de estética:

6. **O mesmo módulo precisa existir em dois tamanhos.** No ICE, o financeiro é um **painel** no
   painel do paciente (saldo, receber, extrato, guia) **e** uma área cheia — e a recepção fecha o
   atendimento sem nunca entrar na área cheia. A nossa sidebar por tipo de trabalho continua
   certa; o que falta é a versão compacta de cada módulo dentro da tela do paciente. É composição,
   não schema, e por isso é barato. Ver `fontes/ice.md` §2.

**E uma advertência sobre imitar o ICE na aparência: não.** O produto é visualmente arcaico e
sobrecarregado, e a nota de Max ao abrir a pesquisa foi explícita — **o interesse é estrutura,
funcionalidade, caminho feliz, caminho alternativo e campo de formulário; nada de estética.**

---

**Próximo passo, que é decisão de Max:** escolher a versão e ordenar (ou não) o merge deste
bench. O CODE entrega o parecer e para (`CLAUDE.md` §13).
