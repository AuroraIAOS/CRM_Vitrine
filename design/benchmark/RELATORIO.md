# Benchmark de concorrentes — software odontológico

Oito concorrentes reais investigados em **2026-08-31**, no bench `bench/benchmark-odonto`.
Cinco brasileiros — contendo os três mais vendidos do país — e três internacionais.

**Nada aqui foi implantado.** O produto em `crm/`, o Supabase e o subdomínio no ar seguem
intactos. Isto é matéria-prima de decisão de Max (`CLAUDE.md` §13).

**[verificado]** = lido em fonte pública nesta sessão · **[a conferir]** = não confirmado na
fonte primária. Todo preço, número e artigo de lei abaixo tem link e data em
[`fontes/COLETA.md`](fontes/COLETA.md); as 34 referências visuais, em
[`capturas/`](capturas/INDICE.md).

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

Mais dois brasileiros entram por **diferencial estrutural**, não por volume: **EasyDental**
(Easy Software, no mercado desde 1994, **controlada pela OdontoPrev desde 2008** — o único
integrado a uma operadora de convênio) e **Santé Odonto** (+12 mil dentistas, o mais IA-first do
país, e a proposta mais próxima da do Vitrine). Ficaram de fora, com motivo registrado: Codental,
BlueDental, Odontosys, Dentalis, ClinicaSysPro, iClinic, Ninsaúde, Amplimed.

Os três internacionais entram por instrutividade: **Dentrix Ascend** (líder do PMS americano),
**Curve Dental** (a referência de UX *cloud-native* da categoria) e **Weave** — que **não é um
PMS**, é a camada de comunicação e CRM vendida *por cima* do PMS, e portanto o análogo mais
direto do que o Vitrine é.

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

### Agora — cabe no MVP e no orçamento de peso

| # | O que | De quem | Onde encosta no Vitrine |
|---|---|---|---|
| 1 | **Odontograma** — o vocabulário visual da categoria; 4 dos 5 brasileiros têm, e o EasyDental põe no plano de R$ 89 | todos | `aba_health`; sem ele o produto não é odontológico |
| 2 | **Exportação completa do prontuário pelo dono da conta**, a qualquer momento, sem pedir ao suporte | ninguém faz bem — **é oportunidade** | Art. 18, I do CFO + Art. 6º da Lei 13.787 (ver §6) |
| 3 | **Cota de mensagem visível no plano** em vez de "créditos" opacos | Weave (1.500/3.000/15.000) | `aba_messaging`; resolve a precificação da janela de 24 h |
| 4 | **Estoque de materiais e insumos** com controle de validade | Clinicorp, EasyDental | módulo ainda inexistente; só 2 de 5 têm |
| 5 | **Prova social medida na primeira dobra** (nota, nº de avaliações, tempo de resposta) | Simples Dental | página de venda do CRM-filho |
| 6 | **Ação rápida a partir da conversa** — cadastrar e agendar sem sair do WhatsApp | Simples Dental (Copiloto) | já previsto no achado M03 e na Versão 03 |
| 7 | **Consentimento de imagem como campo de primeira classe**, travando a publicação | ninguém — exigido pelo Art. 14, III do CFO | `aba_health` **já tem** — falta expor na UI |

### Futuro (`+1.0`)

| # | O que | De quem | Observação |
|---|---|---|---|
| 8 | **Transcrição de áudio no prontuário** | EasyDental, Santé, Dentrix, Curve | virou padrão de mercado em 2026, não diferencial |
| 9 | **Agente de IA 24 h no WhatsApp/Instagram** | Santé `Conversas`, Clinicorp `Agentes` | **é o item de maior margem do mercado** — ver §6 |
| 10 | **TISS / TUSS / CID-10 e elegibilidade de convênio** | EasyDental | abre o segmento que hoje é cativo da OdontoPrev; esforço alto |
| 11 | **Multiunidade com consolidação** | Clinicorp, Curve, Denticon | encaixa no modelo de CRM-filho |
| 12 | **Agenda espelhada no Google Calendar** e **app com uso offline** | EasyDental (único, nos dois) | ambos autodeclarados como exclusividade |
| 13 | **Certificação SBIS/CFM (NGS2)** | nenhum dos cinco exibe | selo não é obrigatório, mas seria **argumento de venda exclusivo** |

**Colisões com `CLAUDE.md` §15, reportadas e não implementadas:** os itens 9 e 13 tocam,
respectivamente, IA conversacional em escala e RAG versionado. Ficam registrados como achado de
mercado; entrar ou não no escopo é decisão de Max.

---

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
| **IA** (complemento) | **R$ 249–349/mês** | agente de atendimento e triagem — **abaixo dos R$ 437 do Santé**, e com preço publicado, que ninguém faz |

**Quatro decisões de precificação que o benchmark sustenta:**

1. **Publicar o preço da IA.** É o único item caro que o mercado inteiro esconde. Publicar é
   diferencial de posicionamento de custo zero.
2. **Não cobrar o WhatsApp à parte.** EasyDental e Simples Dental cobram; é a queixa natural de
   quem compra um CRM cuja premissa é o WhatsApp. Cota declarada no plano, no modelo Weave.
3. **Não cobrar implantação obrigatória.** É o que separa o Clinicorp (13 dias de resposta,
   71,9% de recompra) do Simples Dental (14 horas, 100%).
4. **Considerar cobrança por agenda, não por usuário** (modelo Santé). Alinha o preço ao valor —
   uma clínica com 3 cadeiras paga mais que um consultório de 1 —, e evita a fricção do modelo
   por usuário, que pune a clínica por cadastrar a recepcionista.

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
- **O painel como "o dia"** bate com o que o Santé mostra primeiro: agendamentos de hoje, no
  lugar de honra. É o que a recepção abre de manhã.
- **A janela de 24 h como elemento organizador** não tem equivalente em nenhum dos oito — Weave
  chega perto pela cota de mensagem, mas ninguém trata a janela do WhatsApp como estado visível
  da conversa. É o item mais distintivo do Vitrine, e já está na 03.
- **Densidade média e ausência de sombra** separam o Vitrine dos dois extremos: o Santé é folgado
  e afetivo demais para uma clínica com 40 pacientes por dia; o Simples Dental é denso mas
  visualmente datado.

**O que o benchmark recomenda acrescentar à 03 antes de implementar:**

1. **Odontograma** como padrão de tela novo — não estava no dossiê, e é indispensável (§5, item 1).
2. **Um lugar visível para o consentimento de imagem** na ficha — o Art. 14, III do CFO
   transforma isso em requisito, não em recurso.
3. **Indicador de cota de mensagem** ao lado do estado da conexão do WhatsApp que a 03 já prevê.

**A paleta de comandos da Versão 02 continua backlog, não caminho descartado** — e o benchmark
reforça: nenhum concorrente odontológico tem `⌘K`, então ela é diferencial futuro, não paridade.

---

**Próximo passo, que é decisão de Max:** escolher a versão e ordenar (ou não) o merge deste
bench. O CODE entrega o parecer e para (`CLAUDE.md` §13).
