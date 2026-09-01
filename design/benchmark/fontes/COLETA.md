# Coleta bruta — benchmark odontológico

Matéria-prima da pesquisa. **Este arquivo não é o relatório** — ele existe para que o
`../RELATORIO.md` possa ser curto sem perder rastreabilidade. Aqui entram os links visitados
com data, as tabelas de preço completas, os trechos citados de termo de uso e política de
privacidade, e o registro de quem entrou e quem ficou fora da amostra e por quê.

Proveniência no mesmo padrão de `design/ux/referencias/CATALOGO.md`:
**[verificado]** — conferido em fonte pública, com link e data ·
**[conhecido]** — padrão consolidado do setor, sem verificação nesta sessão ·
**[a conferir]** — vale olhar antes de decidir.

Regra que não se dobra: **preço sem página pública entra como "sob consulta"**, nunca estimado.
O mesmo para nº de clientes e market share (`../00_PLANO_DE_ACAO.md` §4).

Toda coleta desta sessão foi feita em **2026-08-31**, salvo indicação em contrário.

---

## B1 — Definição da amostra

### B1.1 — Limitação de método, registrada antes do resultado

Três limites reais desta coleta, declarados para que ninguém leia o ranking como mais forte do
que ele é:

1. **Não existe auditoria pública de market share de software odontológico no Brasil.** Não há
   equivalente nacional do Gartner/IDC para este nicho. Todo número de "clientes" abaixo é
   **autodeclarado pelo fornecedor** — nenhum é auditado por terceiro. Eles servem para ordenar
   grandeza, não para cravar posição.
2. **`reclameaqui.com.br` responde HTTP 403 a busca automatizada.** Os números de reclamação
   citados vieram do resumo do buscador, não da página lida diretamente — ficam marcados
   **[a conferir]** até serem lidos no navegador (passo B3).
3. **`play.google.com` renderiza a ficha do app por JavaScript** e devolve página vazia ao
   leitor automatizado. Contagem de avaliação e faixa de instalação fica **[a conferir]**,
   mesma pendência do item anterior.

Nenhum desses três limites foi contornado por estimativa.

### B1.2 — Os 5 sinais, candidato a candidato

Sinal 1 = base declarada · 2 = reviews em diretório · 3 = app móvel · 4 = ReclameAqui ·
5 = vínculo institucional do setor. Célula vazia = sinal não encontrado em fonte pública.

| Candidato (BR) | 1. Base declarada | 2. Diretório | 3. App | 4. ReclameAqui | 5. Vínculo setorial |
|---|---|---|---|---|---|
| **Simples Dental** | "+60.000 dentistas cadastrados no Brasil"; "+40 milhões de pacientes" **[verificado]** | ficha ativa no Capterra (`capterra.com/p/219187`) **[verificado]**, volume de reviews **[a conferir]** | App Store BR 4,7 com 809 avaliações — **[verificado]**, ver §B2 | 9,6 · 18 reclamações · 92,3% resolvidas · resposta em 14 h — **[verificado]**, ver §B2 | — |
| **Clinicorp** | "+20 mil clínicas odontológicas em todo o Brasil"; "+100 mil usuários ativos"; "79 mil profissionais"; "+R$10 bi faturados dentro da plataforma"; "100M de pacientes atendidos" **[verificado]** | — | app iOS/Android citado pelo fornecedor; ficha de loja não coletada | 8,4 · 64 reclamações · resposta em 13 dias — **[verificado]**, ver §B2 | — |
| **Dental Office** | "+45.000 dentistas"; "25 anos de operação" **[verificado]** (os contadores da home vêm zerados no HTML — animação por JS — e os valores citados vieram de páginas internas) | — | app próprio no Google Play (`br.com.dentaloffice.dentists`) **[verificado]**: 4,1 · 103 avaliações · 10 mil+ downloads, ver §B2 | 7,3 · 19 reclamações · voltariam 63,6% — **[verificado]**, ver §B2 | — |
| **EasyDental** (Easy Software) | "líder desde 1994", dedicação exclusiva ao segmento **[verificado]** | — | — | — | **controlada pela OdontoPrev S/A desde 2008** — maior operadora de odontologia de grupo da América Latina; agenda com elegibilidade nativa de associado OdontoPrev/Rede UNNA **[verificado]** |
| **Santé Odonto** | "+12 mil dentistas"; nota de satisfação 9,8 **[verificado]** | — | — | — | — |
| **Codental** | "+20 mil dentistas" **[verificado]** | — | — | — | — |
| **BlueDental** | "+8.500 usuários" **[verificado]** | — | — | — | — |
| **Odontosys** | "usado em 20 países"; "+400 usuários" na América hispânica — produto de língua espanhola, base brasileira não declarada **[verificado]** | — | — | — | — |
| **Dentalis** | — | — | — | página ativa no ReclameAqui **[verificado]** que existe; números **[a conferir]** | — |
| **ClinicaSysPro** | — (vende o módulo OdontoSys por pagamento único de R$ 997) **[verificado]** | — | — | — | — |

**Ordem de grandeza declarada:** Simples Dental (60k) > Dental Office (45k) > Clinicorp
(20k clínicas / 100k usuários) ≈ Codental (20k) > Santé (12k) > BlueDental (8,5k).

**Ressalva que muda a leitura da tabela:** as unidades **não são comparáveis entre si**. Simples
Dental e Dental Office contam *dentistas cadastrados* (inclui teste grátis e conta inativa);
Clinicorp conta *clínicas pagantes* e *usuários ativos* separadamente. 20 mil clínicas com 100
mil usuários ativos é, em receita, quase certamente maior que 60 mil dentistas cadastrados. Por
isso o ranking abaixo usa a **convergência dos 5 sinais**, não o número maior.

### B1.3 — Amostra fechada

**TOP 3 do Brasil** — os três que aparecem em **todas** as listas comparativas independentes
consultadas (Dental Cremer, Dental Speed, Codental, BlueDental, Lente de Contato Dental,
PowerMocho), têm base declarada na casa das dezenas de milhares e página ativa no ReclameAqui:

| # | Software | Por que está no TOP 3 |
|---|---|---|
| 1 | **Simples Dental** | maior base declarada (60k), melhor reputação medida (RA 9,6 / 18 reclamações), presença em todos os comparativos |
| 2 | **Clinicorp** | maior base *pagante* declarada (20k clínicas, 100k usuários ativos, R$10 bi transacionados); posicionamento premium |
| 3 | **Dental Office** | 45k dentistas e 25 anos de mercado — o incumbente de tradição, com a faixa de entrada mais barata do país (R$ 39,90) |

**+2 vagas brasileiras, escolhidas por diferencial estrutural, não por volume:**

| # | Software | Por que entra |
|---|---|---|
| 4 | **EasyDental** (Easy Software / OdontoPrev) | o único da amostra **verticalmente integrado a uma operadora de convênio**. Traz o eixo TISS/ANS/elegibilidade, que nenhum dos outros quatro tem, e é o caso mais rico do eixo jurídico |
| 5 | **Santé Odonto** | o mais **IA-first** do mercado brasileiro (agente "Fer" que atende e agenda 24/7) somado a CRM de vendas e odontograma — é a proposta mais próxima da do Vitrine, e portanto o concorrente direto mais informativo |

**Considerados e deixados de fora, com motivo:**

- **Codental** — base declarada equivalente à do Clinicorp (20k dentistas), mas a proposta é
  quase sobreposta à do Simples Dental (mesma faixa de preço, mesmo recorte de recurso, mesmo
  argumento de simplicidade). Ocuparia uma vaga sem trazer eixo novo.
- **BlueDental** — base uma ordem de grandeza menor (8,5k).
- **Odontosys** — produto de língua espanhola, sem base brasileira declarada.
- **Dentalis** — nenhum sinal de base pública encontrado.
- **ClinicaSysPro** — modelo de licença perpétua (R$ 997 uma vez), fora do recorte SaaS.
- **iClinic / Ninsaúde Apolo / Amplimed / Doctoralia** — saúde geral, não vertical odontológico.

**Internacionais (3), escolhidos por instrutividade, não por vendas no Brasil:**

| # | Software | Por que entra |
|---|---|---|
| 6 | **Dentrix Ascend** (Henry Schein One) | líder do PMS americano; referência de *charting* clínico e de layout que "equipe nova aprende rápido" |
| 7 | **Curve Dental** | PMS *cloud-native* construído do zero, sem herança de desktop — a referência de UX pura da categoria |
| 8 | **Weave** | **o análogo mais direto do Vitrine**: não é PMS, é a camada de comunicação/CRM que se vende *por cima* do PMS. Preço de partida publicado (US$ 199/mês por unidade), o que permite comparar modelo de cobrança |

Fora: **Denticon** (Planet DDS, 13.000+ práticas — enterprise/DSO, escala que o Vitrine não
disputa), **Open Dental**, **Eaglesoft**, **CareStack**, **NexHealth**, **Solutionreach**,
**Overjet/Pearl** — todos registrados como consultados e não fichados.

### B1.4 — Contexto de mercado

- Mercado global de *dental practice management software*: **US$ 2,62 bi em 2026**, CAGR de
  **11,12%**, projeção de US$ 4,44 bi em 2031 (Mordor Intelligence) **[verificado]**.
- Players do relatório: Henry Schein (Dentrix), Carestream Dental, Planet DDS (Denticon),
  Patterson (Eaglesoft), Curve Dental **[verificado]**.

---

## B2 — Coleta por concorrente

### Quadro de preços coletados até aqui

Todos os valores abaixo saíram de **página pública de preço do próprio fornecedor**, salvo
marcação em contrário. Nenhum valor foi estimado.

| Software | Plano | Mensal | Observação |
|---|---|---|---|
| **Simples Dental** | Basic | R$ 137,41 (anual) / R$ 149,90 | 7 dias grátis, sem cartão |
| | Plus | R$ 229,08 (anual) / R$ 249,90 | |
| | Pro | R$ 320,74 (anual) / R$ 349,90 | |
| **Clinicorp** | Standard | R$ 159,90 | trimestral R$ 127,19/mês |
| | Premium | R$ 369,90 | trimestral R$ 330,00/mês |
| | Combo Clinicorp IA | **sob consulta** | |
| | Combo Agentes IA (WhatsApp) | **sob consulta** | |
| **Dental Office** | Compacto | R$ 39,90 | sem financeiro, sem prontuário eletrônico |
| | Essencial | R$ 138,52 | |
| | Avançado | R$ 210,18 | |
| | Completo | R$ 298,54 | |
| **EasyDental** | Start | R$ 89,00 | |
| | Standard | R$ 219,00 | |
| | Clínica | R$ 319,00 | único multiclínica |
| **Santé Odonto** | Starter | R$ 117,52 | anual à vista |
| | Premium | R$ 341,04 | equivalente mensal |
| **Codental** *(fora da amostra)* | Essencial / Controle / Avançado | R$ 89,90 / R$ 134,90 / R$ 179,90 | referência de piso de mercado |
| **Weave** (EUA) | Pro | US$ 250/mês **por unidade** | Elite e Ultimate sob consulta |
| **NexHealth** (EUA) *(fora)* | — | **sob consulta** (terceiros relatam US$ 300–600) | |

**Achados comerciais já visíveis:**

- **Implantação obrigatória e paga** aparece em dois dos cinco brasileiros: Clinicorp ("a
  implementação personalizada é obrigatória em todos os planos", valor não publicado) e
  EasyDental (consultoria obrigatória de R$ 280, valor único, só no plano Clínica).
- **IA e WhatsApp são cobrados à parte** no Simples Dental ("secretária IA", WhatsApp e NF
  "cobrados à parte") e no Clinicorp (dois combos de IA, ambos sob consulta). Ninguém publica o
  preço da IA.
- **Teste grátis de 7 dias sem cartão** é o padrão convergente do mercado brasileiro.
- A faixa brasileira de entrada real (com prontuário) fica em **R$ 89–149/mês**; o topo
  publicado fica em **R$ 320–370/mês**.

### Recursos declarados — leitura preliminar

- **Clinicorp** — agenda com confirmação por WhatsApp e alerta de retorno; prontuário digital,
  fichas por especialidade, anamnese com assinatura eletrônica; financeiro com consulta SPC
  Brasil; dashboard analítico com 50+ relatórios; **controle de estoque** com entrada, saída e
  validade; "Clinicorp IA — desenvolvida para a sua clínica vender mais". Odontograma e LGPD
  não aparecem na home **[a conferir]**.
- **Simples Dental** — por plano: Basic (agenda, prontuário, WhatsApp, site da clínica, apps de
  dentista e paciente, receituário digital, **secretária IA**); Plus (NF, consulta de crédito,
  comissionamento, maquininha, fluxo de caixa, controle de ortodontia, **Copiloto WhatsApp**);
  Pro (contratos, imagens ilimitadas, **funil de vendas / CRM**, **faceograma HOF**, gerenciador
  de indicações). Tem **extensão de Chrome que roda dentro do WhatsApp Web**.
- **Dental Office** — agenda, prontuário, fichas de especialidade, financeiro, marketing/vendas,
  **CRM**, **assistente de voz por IA** (transcrição que reduz 8 min de anotação a 70 s),
  agendamento online, WhatsApp Web, PIX, contabilidade digital, apps iOS/Android, relatórios
  gerenciais; declara **conformidade com a LGPD**.
- **EasyDental** — guia odontológica com todos os campos exigidos pela **TISS/ANS**, tabela
  **TUSS** pré-configurada, **CID-10**, tabela de procedimentos configurável, preenchimento
  automático de guia, e **elegibilidade do associado** OdontoPrev/Rede UNNA direto na agenda.
- **Santé Odonto** — agenda inteligente, **odontograma digital**, prontuário, plano de
  tratamento, **transcrição por IA**, anamnese digital, **CRM de pacientes**, WhatsApp
  integrado, financeiro, **assinatura digital com validade jurídica**, marketing integrado;
  agente de IA "Fer" que atende e agenda 24/7.

---

## Fontes consultadas nesta sessão

Todas visitadas em **2026-08-31**.

**Fornecedores (páginas oficiais):**
- https://www.clinicorp.com/ · https://www.clinicorp.com/planos
- https://www.simplesdental.com/planos-e-precos
- https://www.dentaloffice.com.br/
- https://easydental.com.br/ · https://easydental.com.br/planos/ *(403 ao leitor automatizado — reler no navegador)* · https://easydental.com.br/quem-somos/
- https://www.santesistemas.io/planos · https://www.santesistemas.io/sante-odonto
- https://www.codental.com.br/precos
- https://www.dentrixascend.com/

**Comparativos independentes (usados só para triangular presença, nunca como fonte de preço):**
- https://blog.dentalcremer.com.br/melhores-softwares-odontologicos/
- https://blog.dentalspeed.com/melhores-softwares-odontologicos/
- https://blog.bluedental.com.br/10-melhores-softwares-para-consultorio-odontologico-gratuito/
- https://lentedecontatodental.com.br/blog/melhores-softwares-para-dentistas
- https://powermocho.com.br/tecnologia-odontologia/software-para-clinica-odontologica-comparativo-2026-0006/
- https://www.codental.com.br/blog/melhores-softwares-odontologicos/

**Mercado e internacionais:**
- https://www.mordorintelligence.com/industry-reports/dental-practice-management-software-market
- https://www.selecthub.com/dental-practice-management-software/denticon-vs-dentrix-ascend/
- https://www.themolarreport.com/learn/weave-pricing
- https://practicesignal.com/dental/compare/weave-vs-nexhealth-vs-solutionreach

**Bloqueados ao leitor automatizado (pendentes de navegador):**
- https://www.reclameaqui.com.br/empresa/simples-dental/ — HTTP 403
- https://www.reclameaqui.com.br/empresa/clinicorp/ — HTTP 403
- https://play.google.com/store/apps/details?id=br.com.dentaloffice.dentists — renderizado por JS

---

## B2/B3 — O que a passada de navegador acrescentou

As três limitações declaradas em §B1.1 foram **fechadas**, não contornadas: o `capturar.mjs`
usa o Edge local com porta de depuração, e as páginas que devolviam 403/JS ao leitor
automatizado abriram normalmente. Os `[a conferir]` do B1 viram `[verificado]`.

### Sinal 4 — ReclameAqui, agora lido na página (todos [verificado], 2026-08-31)

| | Simples Dental | Clinicorp | Dental Office |
|---|---|---|---|
| Categoria | Softwares – Plataformas SAAS | Softwares – Plataformas SAAS | Softwares – Desenvolvimento e Design |
| Reputação | **ÓTIMA** — 9.6/10 (6 meses) | **ÓTIMA** — 8.4/10 (6 meses) | **BOA** — 7.3/10 (12 meses) |
| Reclamações recebidas | 18 | 64 | 19 |
| Respondidas | 100% | 95,3% | 100% |
| Resolvidas | 92,3% | 96,9% | 81,8% |
| **Voltariam a fazer negócio** | **100%** | 71,9% | 63,6% |
| Nota média do consumidor | 9,54 | 7,16 | 5,36 |
| **Tempo médio de resposta** | **14 horas** | **13 dias e 2 horas** | 7 dias e 22 horas |
| Visualizações da ficha | +6,6 mil | +11 mil | +1,1 mil |
| Janela dos dados | 01/02/2026–31/07/2026 | 01/02/2026–31/07/2026 | 01/08/2025–31/07/2026 |

Leitura: o Clinicorp tem **3,5x mais reclamações** que o Simples Dental e responde **22x mais
devagar** — e ainda assim resolve mais (96,9%). O gargalo dele é de atendimento, não de produto.
O Dental Office tem a pior nota de consumidor da amostra (5,36) apesar de 100% de resposta.

### Sinal 3 — lojas de aplicativo ([verificado], 2026-08-31)

- **Dental Office** (Google Play, `br.com.dentaloffice.dentists`): **4,1 estrelas, 103
  avaliações, 10 mil+ downloads**, atualizado em 12/08/2026, categoria Produtividade. O app é
  "complemento gratuito" do software.
- **Simples Dental** (App Store BR, id954861717): **4,7 estrelas, 809 avaliações**, nº 99 em
  Medicina, 125 MB, desenvolvido por Simples Dental Software SA. Na própria home a empresa
  declara 4,8 na Apple Store, 4,2 no Google Play e "+100 mil downloads" no Android.

O contraste é grande: 809 avaliações contra 103. Confirma a ordem do ranking do B1.

### Eixo C — o quadro de preço, agora completo e lido na página

**Dental Office** ([verificado], `dentaloffice.com.br/planos`) — a única tabela da amostra que
publica **limite de usuário por plano**:

| | Compacto | Essencial | Avançado | Completo |
|---|---|---|---|---|
| Mensal | R$ 39,90 | R$ 138,52 | R$ 210,18 | R$ 298,54 (de R$ 348,23) |
| Anual | R$ 430,92 | R$ 1.496,02 | R$ 2.269,95 | R$ 3.224,23 |
| Onde roda | **só aplicativo** | navegador + app | navegador + app | navegador + app |
| Usuários | 1 | 3 | 5 | 10 |
| Dentistas | 1 | ilimitado | ilimitado | ilimitado |
| Armazenamento | 1 GB | ilimitado | ilimitado | ilimitado |
| CRM | — | — | — | **Opcional** (pago) |
| Diagnóstico por IA | — | — | Opcional | Opcional |
| WhatsApp automático | — | Opcional | Opcional | 200 créditos |

O plano de R$ 39,90 **não tem prontuário eletrônico, nem financeiro, nem navegador** — é isca de
preço. O CRM, a IA e o WhatsApp são todos "Opcional", ou seja, cobrados à parte.

**EasyDental** ([verificado], `easydental.com.br/planos`):

| | Start | Standard | Clínica |
|---|---|---|---|
| Mensal | R$ 89,00 | R$ 219,00 | R$ 319,00 |
| Anual (−10%) | R$ 961,20 | R$ 2.365,20 | R$ 3.445,20 |
| Inclui | agenda, ficha clínica, anamnese digital, **odontograma inteligente**, financeiro, auto-agendamento, app, **transcrição de áudio com IA**, suporte por WhatsApp | + controle de estoque, controle de protéticos, boletos, unidades de atendimento, tabelas de materiais, multiprofissionais | + **CRM integrado para vendas**, comissões, NF-e, dashboards, integração com maquininha, consultoria de implantação |

Vendidos **à parte**: assinatura digital de contrato/orçamento/anamnese, consulta Serasa, pacote
de SMS, **WhatsApp integrado**, espaço extra de armazenamento. O plano Clínica é o único
multiclínica. Notar: odontograma e IA de transcrição já no plano de R$ 89.

**Santé Odonto** ([verificado], `santesistemas.io/planos/sante-odonto`) — **modelo de cobrança
diferente de todos os outros: por agenda, não por usuário**:

| | Starter | Premium |
|---|---|---|
| Anual à vista (−20%) | R$ 1.410,24 → **R$ 117,52/mês** | R$ 4.092,48 → **R$ 341,04/mês** |
| Agendas | **1 incluída (R$ 33/agenda adicional)** | ilimitadas |
| Profissionais e usuários | **ilimitados** | ilimitados |
| Inclui | agendamento online, financeiro, **prontuário com odontograma**, controle de retornos, **módulo de HOF**, boletos/Pix/link, orçamentos, app, galeria, prescrições, iDoc–Radio Memory, confirmação **manual** por WhatsApp Web | + campanhas de marketing por WhatsApp, **integração com Santé Conversas**, confirmação e lembrete **automáticos**, NFS-e, comissões, assinatura eletrônica ilimitada, **transcrição de áudio com IA**, CRM |
| Fidelidade | 12 meses | 12 meses |

E o produto de IA é **vendido separado**: **Santé Conversas — agente 24 h no WhatsApp e
Instagram — a partir de R$ 437/mês**. É **3,7x o preço do próprio CRM** no plano de entrada.

**Clinicorp** ([verificado], `clinicorp.com/planos`): Standard R$ 159,90/mês, Premium
R$ 369,90/mês, **Combo Clinicorp IA** e **Combo Agentes Clinicorp IA** (WhatsApp) ambos
"Valores sob consulta". Texto literal da página: "A implementação personalizada é obrigatória
em todos os planos", com valor único no primeiro mês, e "Planos sujeitos a custos adicionais
conforme utilização". Promete importação de dados em 3 dias e app do paciente gratuito.

**Simples Dental** ([verificado]): Basic R$ 137,41, Plus R$ 229,08, Pro R$ 320,74 (mensal
equivalente no anual, −10%). Secretária IA, WhatsApp e NF **cobrados à parte**.

**Internacionais:**

- **Weave** ([verificado], `getweave.com/pricing`): "starting from $199 per month"; três faixas
  (Pro/Elite/Ultimate) com só a estrutura publicada, valor sob consulta. O que separa as faixas
  é **cota de mensagem**: 1.500 / 3.000 / 15.000 por mês. Inclui telefonia VoIP (até 15 aparelhos
  no topo), lembrete, confirmação, formulário digital, lista de espera, avaliações, e-mail
  marketing, *text to pay*, e **verificação de convênio só no vertical odontológico**.
- **Curve Dental** ([verificado]): **não publica preço** — "GET A PERSONALIZED QUOTE". Vende por
  custo evitado: um depoimento na página fala em economia superior a US$ 8 mil por ano na
  migração vinda da Dentrix, e a página argumenta eliminar *clearinghouse* de terceiro, hardware
  de servidor e TI terceirizada.
- **Dentrix Ascend** ([a conferir — fonte de terceiro, não do fornecedor]): a página `/pricing`
  devolve 404. Diretórios relatam US$ 399/mês para 1 usuário, US$ 799 para 10 e US$ 1.599 para
  100, mais implantação de US$ 2.000–5.000 (prática pequena) a US$ 10.000–20.000 (100 usuários).
  **Registrado como valor de terceiro, nunca como preço do fornecedor.**

### Eixo A — estética, lida nas capturas

- **Simples Dental** — azul saturado de ponta a ponta (fundo em degradê azul), CTA **amarelo**
  de alto contraste, logo com marca de dente + palavra dupla. Tipografia geométrica sem serifa,
  títulos muito grandes. Prova social logo abaixo da dobra, com as quatro notas lado a lado
  (RA 9.6, Apple 4.8, Google 4.2). Na captura do produto: **navegação por abas no topo**
  (INDICADORES / RELATÓRIOS / ORTODONTIA / TAREFAS), cartões de KPI em linha, gráfico de barras
  vermelho/verde, agenda com blocos coloridos por status.
- **Clinicorp** — **laranja** como cor única de ação sobre fundo branco/cinza-claro; logo em
  caixa alta com colchetes. Home quase sem tela de produto: o que ocupa a dobra é **depoimento
  em vídeo com número de faturamento** ("aumentou mais de 300%", "5x o seu faturamento"). O
  discurso não é de software, é de resultado financeiro. Não há botão de autoatendimento: o CTA
  primário é "Fale com um especialista".
- **Santé Odonto** — **roxo/violeta** com degradês, cantos muito arredondados, ilustração leve.
  A tela real do produto mostra **sidebar** com Painel / Financeiro / Relatórios / Gráficos /
  Campanhas / Assinatura eletrônica / Notas fiscais / Santé CRM / Armazenamento / Loja / Suporte,
  saudação personalizada ("Boa tarde, Thiago") com frase motivacional, KPI em cartão lilás claro,
  e **emoji dentro da interface** ("Um cliente satisfeito é a melhor estratégia"). Densidade
  baixa, tom afetivo.
- **Dental Office** — azul institucional mais sóbrio, contadores animados na home (que vêm
  zerados no HTML e só preenchem por JS).
- **EasyDental** — sóbrio, com a política de privacidade escrita em **formato de diálogo**
  ("Usuário: Então, tudo o que entra no sistema tem um motivo e um prazo definido?" / "Easy: ...").
  É o achado de UX mais inesperado da coleta: transformaram documento jurídico em conversa.
- **Curve Dental** — verde-água + azul-marinho + laranja; título gigante "#1 Ranked Cloud-Based
  Dental Software"; **agente de IA conversacional ("Quinn") embutido na própria home**, com
  botão "Talk now" por voz. Métrica de resultado em destaque (20% / 25% / 30%).
- **Weave** — plataforma de comunicação; a página de preço é uma **matriz de comparação** de
  ~30 linhas, e o eixo de diferenciação é cota de mensagem.

### Eixo D — jurídico e bioético

**As normas, em fonte oficial:**

- **Lei nº 13.787/2018** ([verificado], Planalto) — digitalização e sistemas informatizados de
  prontuário. Art. 2º §2º: digitalização com **certificado ICP-Brasil** ou outro padrão
  legalmente aceito. Art. 4º: "Os meios de armazenamento de documentos digitais deverão
  protegê-los do acesso, do uso, da alteração, da reprodução e da destruição não autorizados",
  com controle por sistema especializado de GED. Art. 5º: documento digitalizado conforme a lei
  tem **mesmo valor probatório** do original. **Art. 6º: prazo mínimo de 20 (vinte) anos a
  partir do último registro.**
- **Código de Ética Odontológica / CFO** ([verificado]) — **Art. 17**: "É obrigatória a
  elaboração e a manutenção de forma legível e atualizada de prontuário e a sua conservação em
  arquivo próprio seja de forma física ou digital." **Art. 18, I**: é infração negar ao paciente
  acesso ao próprio prontuário ou deixar de fornecer cópia quando solicitada. **Art. 14, I**:
  sigilo profissional. **Art. 14, III**: proíbe exibir paciente ou sua imagem em qualquer meio de
  comunicação, salvo docência/publicação científica com autorização. **Art. 44, VI**: é infração
  divulgar elemento que identifique o paciente sem consentimento livre e esclarecido.
- **Certificação S-RES SBIS/CFM** ([verificado]) — parceria SBIS + CFM; níveis **NGS1 e NGS2**,
  sendo o NGS2 superconjunto do NGS1. **O selo não é obrigatório**, mas os requisitos que ele
  audita (incluindo assinatura digital para validade ética e legal do prontuário) são.
- **LGPD** ([verificado]) — dado de saúde é **sensível** (art. 11); tratamento para tutela da
  saúde dispensa consentimento, mas uso fora da finalidade clínica (marketing, foto de
  divulgação) exige consentimento específico. Fiscalização da ANPD, multa de até 2% do
  faturamento limitada a R$ 50 milhões por infração.

**O que cada concorrente declara:**

- **Clinicorp** ([verificado], política de privacidade) — **tem Encarregado nomeado**
  (`dpo@clinicorp.com`). E declara literalmente: "Os dados de cadastro coletados são armazenados
  em Cloud Service por prazo indeterminado [...] localizados em servidores na **Carolina do Sul
  (EUA)**, na região US-EAST 1". Ou seja, **dado sensível de saúde de paciente brasileiro
  hospedado fora do país** — transferência internacional, com o ônus de base legal que a LGPD
  impõe. Dados de uso ficam anonimizados por 90 dias em serviço de terceiro.
- **Simples Dental** ([verificado], termos de uso) — **cláusula 8.1.2**: em caso de bloqueio da
  conta, a empresa mantém os dados, **incluindo os dados de pacientes e atendimentos, por 30
  (trinta) meses**; depois disso "os dados e informações poderão ser eliminados e excluídos [...]
  sem a manutenção de qualquer backup", e cabe ao usuário "a única e exclusiva responsabilidade
  por solicitar cópia/backup". **Trinta meses são 2,5 anos — contra os 20 anos do Art. 6º da Lei
  13.787/2018.** A obrigação legal é do cirurgião-dentista, mas o software o deixa a 17,5 anos de
  descoberto se ele não exportar. Também: cláusula 2.2 (plataforma é propriedade exclusiva da
  empresa) e 1.15 (o domínio do "Site do Dentista" é **propriedade da Simples Dental** e não
  acompanha o cliente na saída).
- **EasyDental** ([verificado]) — política redigida em diálogo; declara armazenamento "pelo
  tempo necessário para cumprir suas finalidades originais ou obrigações legais" e **eliminação
  segura sem possibilidade de restauração**. Não nomeia Encarregado no texto lido.
- **Dental Office** ([verificado], home) — declara "conformidade com a legislação da LGPD", sem
  detalhar como.
- **Nenhum dos cinco brasileiros exibe selo de certificação SBIS/CFM** nas páginas públicas
  consultadas. ([verificado] por ausência — nenhuma menção encontrada nas homes, páginas de
  recurso ou de preço.)

### Eixo B — funcionalidades, achados soltos

A tabela comparativa está em `../RELATORIO.md`. O que não coube lá:

- **Dentrix Ascend** declara números de resultado de IA: "119% improvement in caries
  identification using AI diagnostic tools" e "4 hours average time saved per day by automating
  eligibility verification". Eixos: elegibilidade e sinistro, diagnóstico e aceitação de caso com
  IA e *charting* por voz, marketing e experiência do paciente.
- **Curve+ AI Suite** — camada de IA unificada; "Curve Care+" faz documentação clínica embutida
  (*ambient AI*), com o argumento de "reduce risk and stay compliant".
- **EasyDental** é **o único que integra a agenda ao Google Calendar** em todos os dispositivos,
  e **o único com app que funciona offline** — ambos autodeclarados como exclusividade de
  mercado. Envia a agenda do dia seguinte por e-mail.
- **Simples Dental** tem **extensão de Chrome que roda dentro do WhatsApp Web** ("Copiloto"),
  permitindo cadastrar paciente e marcar consulta sem sair da conversa.
- **Santé** integra com **iDoc – Radio Memory** (imagem radiológica) já no plano de entrada.

## Fontes acrescentadas na passada de navegador

Todas visitadas em **2026-08-31**; ver `../capturas/INDICE.md` para a lista completa com captura.

- https://www.reclameaqui.com.br/empresa/simples-dental/ (e `/clinicorp/`, `/dental-office/`)
- https://play.google.com/store/apps/details?id=br.com.dentaloffice.dentists
- https://apps.apple.com/br/app/simples-dental-software-odonto/id954861717
- https://www.simplesdental.com/termos
- https://www.clinicorp.com/politica-de-privacidade
- https://easydental.com.br/politica-de-privacidade/ e https://easydental.com.br/recursos/
- https://www.santesistemas.io/planos/sante-odonto
- https://www.curvedental.com/ai
- https://www.getweave.com/pricing/ e https://www.getweave.com/dental/
- https://www.dentrixascend.com/features
- https://www.softwareadvice.com/dental/dentrix-ascend-profile/
- https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13787.htm
- https://website.cfo.org.br/wp-content/uploads/2018/03/codigo_etica.pdf
- https://www.normaslegais.com.br/legislacao/resolucao-cfo-118-2012.htm
- https://sbis.org.br/certificacoes/certificacao-software/

### Nota de método sobre o coletor

`../capturar.mjs` não usa `puppeteer.launch()`. Nesta máquina não há Chrome instalado e o
`msedge.exe` da raiz de `Application/` é um lançador que sai imediatamente — o puppeteer perde o
processo e falha com `Failed to launch the browser process: Code: 0`. **Hipótese confrontada com
medição antes de virar diagnóstico** (`CLAUDE.md` §11): o mesmo binário, subido à mão com
`--remote-debugging-port=9222`, respondeu `/json/version` normalmente. Logo o defeito é do
handshake por stderr, não do navegador. O script sobe o processo e usa `connect()`.
