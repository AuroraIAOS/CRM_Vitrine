# Três versões de aplicação — para escolha de Max

Produzidas em **2026-08-23**, no bench `bench/pesquisa-ux`, aplicando o dossiê de
[`design/ux/`](../). Nada foi implantado: o app em `crm/`, o Supabase e o subdomínio no ar
seguem intactos. Estes arquivos vivem só em `design/`.

**As capturas estão em [`telas/`](telas/)** — 19 PNGs, 3360×2100 px, mesmo formato de
`screenshots/` (o produto como está hoje), para poderem ser abertos lado a lado.

Para navegar as versões ao vivo, com troca de versão e de tela:

```bash
node design/ux/versoes/servir.mjs     # abre http://localhost:4180 — troca versão e tela na barra de baixo
node design/ux/versoes/capturar.mjs   # regera as 19 capturas
```

Nenhum dos dois instala nada nem depende de rede.

---

## O que está sendo escolhido — e o que não está

**Não está em jogo se os defeitos críticos serão corrigidos.** As três versões já nascem com
tudo o que `01_DIAGNOSTICO.md` apontou como crítico:

| | as três versões |
|---|---|
| **F01** escala tipográfica | 7 degraus em `rem`, corpo em 14px |
| **F02** densidade | multiplicador de espaço; o tipo não se mexe |
| **F03/F04** contraste | os 7 papéis corrigidos, todos medidos ≥ 4,5:1 |
| **F05** borda de input | 3,15:1, separada da borda decorativa |
| **N01** `aba_` na navegação | eliminado nas três |
| **A01** colisão na agenda | resolvida nas três, com o algoritmo testado |
| **E01/E03** estados | skeleton, vazio com ação, foco visível |

**O que está em jogo é a postura do produto:** quanta densidade, quanta configurabilidade
exposta, quanto o usuário precisa aprender antes de ser produtivo, e quanto código isso custa
manter. É uma decisão de negócio, não de gosto — e por isso é de Max.

---

## Versão 01 — Padrão de mercado

> `telas/*_v01.png` · O desenho para o qual HubSpot, Zoho, RD Station e Pipedrive convergiram.

**A aposta:** o cliente que compra o CRM-filho já viu esta tela antes, em outro produto, e
sabe usar sem treinamento. Familiaridade acima de tudo.

**Como se reconhece:**
- Sidebar de 248px com lista plana de módulos, ícone e rótulo, barra de destaque no item ativo.
- Busca larga no topo, sino de notificação, avatar com nome.
- Cards com raio de 10px e sombra suave — o único dos três com elevação.
- KPI com ícone em chip colorido, rótulo em fonte normal (sem o mono).
- Tabela com linha alta (48px), cabeçalho em fonte normal, paginação numerada.
- Densidade folgada; nada de atalho de teclado, nada de visão salva, nada de chip de filtro.

**O que ganha:** curva de aprendizado quase nula. É o desenho mais fácil de vender para quem
nunca usou CRM — que é boa parte do mercado de clínica de estética.

**O que perde:** nada nele é memorável, e ele **abandona a identidade que Max já ratificou**.
A sombra contraria `docs/04` §5.3 ("cards se separam por borda 1px, não por elevação") e o
mono some do KPI e do cabeçalho de tabela, que era o "vocabulário de metadado" de §5.1. Também
é o mais pobre em operação: sem tempo-na-etapa no funil, sem sinalização de janela de 24 h nas
mensagens — porque o padrão de mercado genérico realmente não tem essas coisas.

**Custo:** o menor dos três. Componentes das ondas 1 e 2 de `03_COMPONENTES.md`; nada da onda 3
além da tabela.

---

## Versão 02 — Estado da arte

> `telas/*_v02.png` · O que Attio e Linear fazem hoje. Inclui `07_paleta_v02.png`, a assinatura da versão.

**A aposta:** potência máxima por pixel, para quem usa a ferramenta o dia inteiro e vale a
pena treinar.

**Como se reconhece:**
- Sidebar de 212px sobre fundo cinza, agrupada, com **contagem viva** ao lado de cada item
  (Pessoas 31, Negócios 14, Caixa de entrada 3) e **atalho à mostra** (`G I`, `G A`).
- Barra superior de 44px: caminho em mono, busca com `⌘K`, sem cabeçalho separado.
- **Visões salvas** como abas ("Leads sem contato · 6", "Clientes da Aline · 4", "+ Nova visão").
- **Chips de filtro componíveis** (`Vínculo é Cliente ✕`, `Último contato > 7 dias ✕`).
- Tabela densa (34px de linha), telefone em mono, barra de ações em massa ativa,
  dica de teclado no canto (`J K navegar · X marcar · ⏎ abrir`).
- **A ficha não é uma página: é um painel lateral** sobre a lista (`03_ficha_v02.png`), com
  `↑ ↓ 1 de 31` para percorrer registros sem perder o contexto.
- **Paleta de comandos** (`07_paleta_v02.png`): digitar "karina" devolve a pessoa, os dois
  atendimentos dela e a ação "Novo atendimento para Karina Duarte".
- Painel que é fila de trabalho ("Precisa de você · 7 itens"), não relatório.

**O que ganha:** é objetivamente o mais produtivo dos três para quem domina. E é o mais
impressionante numa demonstração de venda para cliente exigente.

**O que perde:** curva de aprendizado real. Uma recepcionista contratada na semana passada não
opera isto sem treinamento — e "sem treinamento" é justamente o que faz uma clínica pequena
comprar. É também o mais caro de construir e de manter: exige praticamente toda a onda 3 de
`03_COMPONENTES.md`, mais navegação por teclado, painel lateral e visões salvas persistidas
(tabela nova). E a densidade de 34px de linha aproxima o produto de uma planilha — o que num
contexto clínico, onde o erro de digitação vira dado de saúde errado, é risco, não virtude.

**Custo:** o maior dos três, com folga. Estimativa grosseira: 2 a 3 vezes o esforço da 01.

---

## Versão 03 — Recomendado para o CRM Vitrine

> `telas/*_v03.png` · O wireframe ratificado, terminado.

**A aposta:** honrar as decisões que Max já tomou e completar o que faltava, escolhendo caso a
caso o que vale importar do estado da arte e o que não vale.

**O que preserva de `docs/04` e `docs/01`, sem negociar:**
- Sidebar de 236px, topo de 56px (`docs/01` §7.1).
- Card de raio 8px, **sem sombra** — separação por borda de 1px (`docs/04` §5.3).
- O `IBM Plex Mono` como vocabulário de metadado: eyebrow de KPI, cabeçalho de tabela, hora da
  agenda, timestamp (`docs/04` §5.1). É a assinatura visual do produto, e é o que impede o
  Vitrine de parecer um template comprado.
- Paleta ratificada de `docs/04` §5.2, com as sete correções de contraste medidas.

**O que acrescenta, do que o dossiê mostrou faltar:**
- **Quatro grupos por tipo de trabalho** no lugar dos nove `aba_`: Atendimento ·
  Relacionamento · Comercial · Automação (`04_PADROES_DE_TELA.md` §1).
- **Busca global visível** com o atalho `Ctrl K` à mostra — não escondida atrás de um atalho
  que ninguém descobre.
- **Estado da conexão do WhatsApp** no topo, como indicador, não como link solto (achado M03).
- **O painel é "o dia"** (`01_inicio_v03.png`): a agenda de hoje ocupa o lugar de honra, porque
  é o que a recepção abre de manhã. Pendências ao lado, todas clicáveis. KPIs com seta,
  levando à lista que os produziu.
- **Agenda com expediente da conta** (08h–18h em vez de 07h–19h), colisão resolvida, linha do
  "agora", filtro por profissional nas bolinhas de legenda, bloqueio hachurado.
- **Funil com tempo-na-etapa colorido** e próxima ação em cada card; dois negócios parados
  aparecem marcados sozinhos (Sérgio Bastos 31 d, Diego Ferraz 16 d).
- **Ficha com ações rápidas** (WhatsApp · Agendar · Cobrar · Anamnese) e a coluna direita
  começando pelo que é urgente — o próximo atendimento —, não pelo campo de nota vazio.
- **Janela de 24 h como elemento organizador** (`06_mensagens_v03.png`): badge por conversa
  (`18 h`, `2 h`, `fechada`), filtro "Janela aberta · 3", e o compositor **substituído** pelo
  seletor de template quando a janela fecha, com a explicação em uma linha.
- **Seletor de densidade que funciona**, exposto onde importa (a tabela).

**O que deliberadamente NÃO importa da versão 02, e por quê:**

| Não adotado | Motivo |
|---|---|
| Edição em linha estilo planilha | Em `aba_health` o erro de digitação vira dado clínico errado. Formulário com validação é mais lento e mais certo. |
| Ficha em painel lateral | Boa para triagem em lote; ruim para a ficha clínica, que é leitura longa e merece a tela inteira. |
| Densidade de 34px por padrão | A recepção olha a tela a 60cm o dia todo. Confortável por padrão, compacto disponível. |
| Contagem viva na sidebar | Uma consulta por item de menu a cada carregamento, por ganho pequeno. |
| Visões salvas na primeira versão | Exige tabela nova. Entra depois; o degrau barato é lembrar o último filtro em `localStorage`. |

**Custo:** intermediário, mais perto da 01 que da 02. Ondas 1 e 2 completas de
`03_COMPONENTES.md`, mais quatro peças da onda 3 (tabela, agenda, card de negócio,
item de conversa).

---

## Comparação direta

| | **01 Padrão** | **02 Estado da arte** | **03 Recomendado** |
|---|---|---|---|
| Curva de aprendizado | nenhuma | real | pequena |
| Densidade padrão | folgada | alta | confortável |
| Preserva a identidade ratificada | **não** (sombra, sem mono) | parcialmente | **sim** |
| Mono como metadado | não | sim | sim |
| Sombra em card | sim | não | não |
| Tempo na etapa (funil) | não | sim | sim |
| Janela de 24 h sinalizada | não | sim | sim |
| Paleta de comandos | não | sim | busca visível + atalho |
| Visões salvas | não | sim | depois |
| Ficha | página | painel lateral | página |
| Navegação por teclado | não | completa | atalhos essenciais |
| Peso adicional estimado | ~35 KB gzip | ~55 KB gzip | ~45 KB gzip |
| Esforço relativo | **1×** | **2–3×** | **1,4×** |
| Risco de regressão | baixo | médio-alto | baixo-médio |

---

## Parecer

**Recomendo a Versão 03**, por três razões, em ordem de peso:

**1. É a única que não joga fora trabalho já pago.** A paleta, a tipografia, o shell de
236px/56px e a decisão de separar cards por borda em vez de sombra foram fechados por Max na
Etapa de Transição 1→2 e estão em `docs/04` §5. A Versão 01 os contraria em pontos concretos
(sombra, mono). Trocar identidade ratificada por familiaridade genérica é uma perda líquida
para um produto cujo modelo de negócio é ser clonado e revendido — o que se vende é justamente
ter cara própria.

**2. O contexto do Vitrine não é o da Versão 02.** Attio e Linear desenham para times
técnicos que usam a ferramenta oito horas por dia e trocam de emprego sabendo `⌘K`. O cliente
do CRM-filho é uma clínica de estética com uma recepcionista e três profissionais, alta
rotatividade, e nenhum orçamento de treinamento. A densidade e a configurabilidade da 02 são
custo, não benefício, nesse cenário — e o risco de edição em linha sobre dado clínico é real.

**3. Ela captura o valor da 02 onde ele é barato.** Tempo-na-etapa, janela de 24 h, ações
rápidas e busca global são os quatro itens da 02 que mais mudam o dia de quem trabalha, e
nenhum deles exige a densidade nem o painel lateral. A 03 leva os quatro e deixa para trás o
que custa caro e serve pouco aqui.

### O que eu faria diferente se o contexto fosse outro

Registro para a decisão ficar informada, não para defender a recomendação:

- **Se o alvo virasse clínica grande ou rede multiunidade** (10+ profissionais, operação
  dedicada), a Versão 02 passaria a fazer sentido — visões salvas e ações em massa valem mais
  que curva de aprendizado quando há alguém cuja função é operar o CRM.
- **Se a prioridade fosse fechar as primeiras vendas o mais rápido possível**, a Versão 01 é
  a mais rápida de construir e a que menos assusta numa demonstração para leigo. O preço é a
  identidade, e ela é recuperável depois — mas nunca de graça.

### Um caminho que não estava na pergunta

A 03 e a 02 não são exclusivas no tempo. A 03 pode ser construída agora e a **paleta de
comandos da 02 pode entrar depois** como camada opcional, sem redesenhar nada — ela é um
`Dialog` sobre a busca global que a 03 já tem. Se a escolha for a 03, sugiro tratar
`07_paleta_v02.png` como backlog, não como caminho descartado.

---

## Inventário das capturas

Índice completo, gerado pelo script, em [`telas/INDICE.md`](telas/INDICE.md).

| Tela | 01 Padrão | 02 Estado da arte | 03 Recomendado |
|---|---|---|---|
| Início / painel | `01_inicio_v01.png` | `01_inicio_v02.png` | `01_inicio_v03.png` |
| Pessoas — lista | `02_pessoas_v01.png` | `02_pessoas_v02.png` | `02_pessoas_v03.png` |
| Ficha da pessoa | `03_ficha_v01.png` | `03_ficha_v02.png` | `03_ficha_v03.png` |
| Agenda semanal | `04_agenda_v01.png` | `04_agenda_v02.png` | `04_agenda_v03.png` |
| Funil comercial | `05_funil_v01.png` | `05_funil_v02.png` | `05_funil_v03.png` |
| Mensagens | `06_mensagens_v01.png` | `06_mensagens_v02.png` | `06_mensagens_v03.png` |
| Paleta de comandos | — | `07_paleta_v02.png` | — |

## Arquivos-fonte

| Arquivo | Papel |
|---|---|
| `index.html` | Casca; aceita `?v=01|02|03&tela=<id>` |
| `estilos.css` | Tokens comuns + três blocos escopados por `[data-v]` |
| `app.js` | Renderizador; toda ramificação marcada com `V === "01"/"02"/"03"` |
| `dados.js` | Dados de demonstração — idênticos nas três versões |
| `capturar.mjs` | Sobe o servidor, captura as 19 telas, escreve o índice |

**Nota honesta sobre o que estas capturas são:** protótipos de alta fidelidade em HTML/CSS,
não o app React. Eles provam o desenho, a densidade, a hierarquia e o comportamento do
algoritmo da agenda — não provam integração com Supabase, RLS nem desempenho com dado real.
A conversão para `crm/src/` é trabalho de implementação, com o roteiro em
[`../07_ROTEIRO.md`](../07_ROTEIRO.md).
