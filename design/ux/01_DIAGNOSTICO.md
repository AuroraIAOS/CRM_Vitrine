# 01 — Diagnóstico: o que separa o Vitrine de um CRM comercial

Base de evidência: as 16 capturas de `screenshots/` (2026-08-22), o código de `crm/src/`
(15.680 linhas) e as medições reproduzíveis registradas ao pé de cada achado.

**Nada aqui é opinião de gosto.** Onde havia como medir, mediu-se; onde não havia, o achado
é comparado contra uma referência pública nomeada. Achados marcados **[medido]** trazem o
comando que os produziu — se algum estiver errado, o comando o desmente em segundos
(`CLAUDE.md` §11).

Severidade:
**🔴 Crítico** — quebra função, legibilidade ou uma promessa já vendida ·
**🟠 Alto** — o produto passa por não-acabado ·
**🟡 Médio** — polimento.

---

## A. Fundação visual

### F01 🔴 O texto do produto é pequeno demais, e em 17 tamanhos diferentes · [medido]

```bash
cd crm && grep -roh "text-\[[0-9.]*px\]" src | sort | uniq -c | sort -rn
```

**637 tamanhos de fonte cravados em pixel**, em 48 arquivos de tela:

| Tamanho | Ocorrências | | Tamanho | Ocorrências |
|---|---|---|---|---|
| 11px | 169 | | 9,5px | 37 |
| 10,5px | 134 | | 12,5px | 31 |
| 11,5px | 84 | | 9px | 27 |
| 12px | 69 | | 13px | 8 |
| 10px | 64 | | outros 7 valores | 14 |

Contra isso, a escala em `rem` do Tailwind aparece **28 vezes no app inteiro**.

O menor valor em uso é **8px**. O grosso da interface — 356 das 637 ocorrências — está entre
**9px e 11px**. Para comparar: o menor tamanho de texto do Carbon (IBM) é 12px; o menor do
Polaris (Shopify) é 12px; o corpo padrão do Atlassian é 14px. **Nenhum design system de
produto sério usa texto de leitura abaixo de 12px.**

De onde veio: o pacote de wireframes tem canvas de referência 1280×820, e `docs/04` §5.3 já
avisa que esse canvas "é convenção de documentação do wireframe, não breakpoint real". Os
tamanhos de fonte do wireframe foram transcritos como tamanhos de produção, mas o produto
roda em telas de 1440–1920px. O resultado é o que se vê nas capturas: conteúdo pequeno
flutuando em muito branco, com cara de maquete ampliada.

**Este é o item de maior impacto visual do dossiê e o mais barato de corrigir** — é
substituição mecânica de 17 valores por uma escala de 7 degraus. Proposta em
`02_FUNDACAO_VISUAL.md` §1.

### F02 🔴 O seletor de densidade não faz o que promete · [medido]

`crm/src/index.css` implementa densidade assim:

```css
:root[data-density="compact"] { font-size: 14px; }
```

A alavanca é o `font-size` da raiz, para que o espaçamento do Tailwind (que é em `rem`)
encolha junto. O raciocínio está certo e o comentário no arquivo o explica bem — **mas ele
depende de o texto também estar em `rem`, e 637 tamanhos estão em `px`** (F01).

Consequência real: no modo compacto o padding, o gap e a margem encolhem, e o texto fica
exatamente do mesmo tamanho. Quem escolhe "compacto" recebe um layout mais apertado em volta
de um texto que não mudou — o oposto do que densidade significa em Carbon, Polaris ou Attio.
É defeito de funcionalidade entregue, não de gosto, e some sozinho quando F01 for corrigido.

Há ainda um efeito colateral a registrar: `docs/04` §2 define densidade como propriedade "de
grade e container", explicitamente **não** de tipo — e mudar o `font-size` da raiz muda o
tipo junto. A proposta de `02_FUNDACAO_VISUAL.md` §2 separa as duas coisas.

### F03 🔴 Seis papéis de texto da paleta ratificada reprovam no contraste WCAG AA · [medido]

Medição de toda a paleta de `docs/04` §5.2 contra os fundos em que cada cor é de fato usada:

| Papel | Cor | Sobre | Contraste | Veredito |
|---|---|---|---|---|
| Texto primário | `#26313a` | `#ffffff` | **13,27:1** | AAA ✅ |
| Texto secundário | `#41535f` | `#ffffff` | **7,99:1** | AAA ✅ |
| Accent botão/link | `#3d7396` | `#ffffff` | **5,13:1** | AA ✅ |
| Branco sobre accent | `#ffffff` | `#3d7396` | **5,13:1** | AA ✅ |
| Accent sobre tint | `#2b5f80` | `#e8eff4` | **5,93:1** | AA ✅ |
| Texto muted A | `#7c8b95` | `#ffffff` | **3,51:1** | ❌ reprova (mín. 4,5) |
| Texto muted A | `#7c8b95` | `#f4f6f7` | **3,24:1** | ❌ reprova |
| Texto muted B | `#8b98a2` | `#ffffff` | **2,95:1** | ❌ reprova |
| Eyebrow mono | `#9aa8b1` | `#ffffff` | **2,44:1** | ❌ reprova |
| Eyebrow mono | `#9aa8b1` | `#f4f6f7` | **2,25:1** | ❌ reprova |
| Placeholder | `#a8b6bf` | `#ffffff` | **2,08:1** | ❌ reprova |

A metade boa da paleta é muito boa — o azul clínico e os dois tons de texto escuro passam
com folga. **O problema está concentrado nos cinzas de apoio**, e ele se agrava pelo F01:
texto de 2,44:1 de contraste **em 9px** é a combinação que torna o eyebrow mono
(`ATENDIMENTOS HOJE`, `HORA`, `PESSOA · SERVIÇO`) praticamente decorativo — visível como
forma, não legível como palavra.

Substitutos que passam, no mesmo matiz, em `02_FUNDACAO_VISUAL.md` §3.

### F04 🟠 Os três badges semânticos ficam logo abaixo do limiar · [medido]

| Badge | Texto | Tint | Contraste |
|---|---|---|---|
| Sucesso ("Ativo", "Ganha") | `#4d7c69` | `#eef4f1` | **4,28:1** |
| Atenção ("Rascunho", "Aguarda") | `#8a7550` | `#faf6ef` | **4,11:1** |
| Perigo ("Vencido", "Perdida") | `#9c6b5e` | `#f8f0ee` | **4,00:1** |

Os três ficam entre 4,00 e 4,28 contra o mínimo de 4,5:1. Passariam se o texto do badge
fosse "grande" (≥18,66px), mas badge é sempre texto pequeno. Correção: escurecer o texto
entre 3% e 5% de luminosidade — imperceptível a olho nu, e os três passam.

### F05 🟠 A borda de input tem 1,29:1 — o critério de componente exige 3:1 · [medido]

`#dde4e8` sobre `#ffffff` = **1,29:1**. O WCAG SC 1.4.11 (Contraste de Não-Texto) pede
3:1 para "informação visual necessária para identificar componentes de interface". Um campo
de formulário cuja única fronteira é essa borda não se identifica como campo — e a captura
`04_pessoas_ficha.png` mostra isso: o campo "Escrever nota…" e o retângulo tracejado
"Nenhuma nota ainda" logo abaixo têm praticamente o mesmo peso visual, embora um seja
interativo e o outro não.

Este é o único achado do dossiê com **custo estético real**: a cor que atinge 3:1 é
`#7a95a5`, visivelmente mais escura que o traço fino que o wireframe estabeleceu. Há um
caminho intermediário em `02_FUNDACAO_VISUAL.md` §4 — a borda decorativa de card e o
hairline de tabela são isentos (são separadores, não componentes) e podem continuar
delicados; só a borda de **input** precisa subir.

### F06 🟠 33 cores cravadas em hex fora do arquivo de tokens · [medido]

```bash
cd crm/src && grep -rn --include=*.tsx --include=*.ts -oE "#[0-9a-fA-F]{3,8}\b" . | grep -v index.css
```

| Arquivo | Ocorrências |
|---|---|
| `features/health/MapaClinico.tsx` | 14 |
| `features/health/mapas.ts` | 8 |
| `lib/preferencias.tsx` | 5 |
| `features/automations/api.ts` | 3 |
| `features/scheduling/api.ts`, `features/catalog/*` | 3 |

Isso contraria a regra do próprio projeto (`docs/04` §4: "o hex nunca aparece fora deste
arquivo"; "nunca hardcoded em componente"). Duas consequências concretas:

1. **Os 22 hexes dos mapas clínicos não têm variante escura.** `MapaClinico.tsx:95` faz
   `background: estado?.fundo ?? "#fff"` — branco fixo. No tema escuro, o mapa clínico fica
   numa ilha branca. A Subetapa 02.12 tokenizou as cores de gráfico exatamente por esse
   motivo (o `stroke="#5b87a8"` do Financeiro); os mapas ficaram de fora.
2. **Dois dos hexes nem são da paleta ratificada**: `#3b82f6` e `#64748b` são o azul-500 e
   o slate-500 padrão do Tailwind — resíduo de scaffolding, não decisão de design.

---

## B. Navegação e shell

### N01 🔴 O nome do schema do banco é o rótulo de navegação

`crm/src/app/AppShell.tsx:35`:

```tsx
<span className="px-[7px] font-mono text-[9px] uppercase tracking-[0.1em] …">
  aba_{item.moduleKey}
</span>
```

Toda captura mostra `ABA_PEOPLE`, `ABA_SCHEDULING`, `ABA_SALES`… como cabeçalho de grupo na
sidebar, e `aba_people ›`, `aba_scheduling ›` no caminho. **Nenhum CRM comercial expõe o
nome do schema ao usuário final.** Para o cliente que compra um CRM-filho, `aba_health` não
significa nada — significa apenas que ele está olhando a ferramenta interna de outra pessoa.

O agravante é comercial, não estético: o Vitrine é o que Max mostra para vender (`README.md`:
"base padronizada para os CRMs-filhos"). Vazamento de vocabulário interno é o primeiro sinal
de amadorismo que um comprador percebe.

Custo da correção: um mapa `moduleKey → rótulo` de 9 linhas. Os rótulos de módulo já existem
(`item.label` = "Pessoas", "Agenda"…); o que falta decidir é o **nome do grupo** que os
agrupa — proposta em `04_PADROES_DE_TELA.md` §1.

### N02 🟠 O caminho tem dois níveis, e o primeiro não navega

`AppShell.tsx` documenta a decisão com honestidade: "o primeiro segmento (`aba_health`,
`core`) é namespace, não lugar — não há para onde ele levar, então não é link". O raciocínio
é correto **dado** que o primeiro segmento existe. A pergunta que não foi feita é se ele
deveria existir: um caminho de dois níveis em que um não é clicável e o outro é a própria
página não orienta ninguém.

Padrão do mercado (Polaris `Page`, Atlassian `PageHeader`, HubSpot, Attio): em hierarquia
rasa **não há breadcrumb** — há um cabeçalho de página com título, contexto e ação primária.
O breadcrumb aparece só quando existe profundidade real (`Pessoas › Helena Marques ›
Prontuário`), e aí todo segmento anterior navega. Ver N04.

### N03 🔴 Não há busca global nem paleta de comandos

O header de 56px contém um item: o avatar. Em `04_pessoas_ficha.png`, a única forma de
chegar a outra pessoa é voltar à lista e paginar.

`AppShell.tsx` registra que a busca global foi deliberadamente adiada, com um argumento bom:
"construir chrome decorativo sem função contraria 'nenhuma checagem/UI fake'". **O argumento
continua valendo — a conclusão a tirar dele não é "não fazer busca", é "fazer a busca com
função".** Hoje ela é o item de maior razão impacto÷custo do dossiê inteiro:
`aba_people.pessoas` já existe, já tem RLS, e busca por nome/telefone/e-mail é uma query.
Detalhe em `05_CAMINHOS.md` §1.

Calibragem de expectativa: busca global com `⌘K`/`Ctrl+K` é padrão em Attio, Pipedrive,
HubSpot, Intercom, Linear e Notion. Em CRM, é a diferença entre "eu procuro a cliente" e
"eu navego até a cliente".

### N04 🟠 Nenhuma tela tem cabeçalho de página

Em todas as 16 capturas o conteúdo começa direto no primeiro card. Não existe um H1 — o
título da tela existe apenas dentro do caminho, em 11px.

Isso empurra dois problemas para dentro dos cards: a ação primária mora onde calhar (o
"+ Nova pessoa" está dentro do card de abas, em `03_pessoas_lista.png`, misturando o nível
"o que esta página é" com o nível "que recorte estou vendo"), e não há lugar canônico para
contexto de página — contagem total, filtro ativo, período.

### N05 🟡 A sidebar não colapsa e não diz que conta está aberta

236px fixos, sem colapso. Em 1280px de largura isso é 18% da tela permanentemente gasto em
navegação; o padrão do mercado é colapsar para uma faixa de ícones de 56–64px. E o topo da
sidebar diz "CRM Vitrine", que é o nome do **software**, não do **cliente** — num produto
cujo modelo de negócio é clonar por cliente, esse é o lugar óbvio da marca do cliente (já
previsto no backlog como "Identidade visual por conta").

---

## C. Listas e tabelas

### T01 🟠 A lista de Pessoas não tem busca, filtro nem ordenação

`03_pessoas_lista.png`: as abas de recorte (Todas/Leads/Clientes/Equipe/Fornecedores) com
contagem estão certas e são um bom padrão. Mas dentro do recorte não há campo de busca, não
há filtro, e nenhum cabeçalho de coluna é clicável para ordenar. Com 31 pessoas funciona;
com 800 — o volume real de uma clínica em operação — a tela deixa de servir.

`@tanstack/react-table` já está instalado e faz ordenação e filtro sem dependência nova.

### T02 🟠 Há seleção múltipla, mas não há o que fazer com a seleção

A coluna de checkbox existe em todas as linhas e no cabeçalho. Marcar não revela nada:
nenhuma barra de ação, nenhuma contagem de selecionados. Caixa de seleção que não leva a ação
é promessa não cumprida — e é ali que moram as operações que fazem um CRM economizar tempo
de verdade (etiquetar 40 leads, exportar, atribuir a um profissional, arquivar).

Padrão consagrado (Polaris `IndexTable`, Gmail, Linear): ao marcar o primeiro item, uma barra
de ações em massa **substitui** o cabeçalho da tabela, mostra "N selecionados" e as 3–4 ações
aplicáveis, com um "Selecionar todos os 800" quando a seleção cobre a página inteira.

### T03 🟡 Coluna que nunca tem dado

"TAGS" aparece com "—" em 10 das 10 linhas. Coluna vazia consome largura e ensina o olho a
ignorar aquela região. Ou tags viram de fato preenchíveis na criação da pessoa, ou a coluna
sai do conjunto padrão e volta pelo seletor de colunas.

### T04 🟡 Avatares vazios

Todos os avatares são círculos cinza-claro sem conteúdo. Iniciais mais uma cor derivada do
nome (hash simples → matiz) custam ~10 linhas, não custam requisição nenhuma, e transformam
uma lista uniforme em algo que o olho varre por reconhecimento.

### T05 🟡 Paginação sem controle e sem cabeçalho fixo

"1–10 de 31 · Anterior · Próxima". Falta escolher o tamanho de página (10/25/50/100) — com
10 por página e 800 pessoas são 80 cliques até o fim. E o cabeçalho da tabela não é fixo: em
qualquer lista longa, rolar significa perder de vista qual coluna é qual.

---

## D. Agenda

### A01 🔴 Compromissos que colidem no horário renderizam texto sobreposto

Este é o defeito visual mais grave do produto. Em `05_agenda.png`, veja Ter 09:00, Ter 14:00
e Qua 11:00: dois compromissos ocupam a mesma célula e o texto de um é impresso por cima do
outro, produzindo borrão ilegível ("Helena Ribeiro" sobre outro nome, "João Marcelo Reis"
sobre "Massagem relaxante").

Numa clínica com 3 profissionais atendendo em paralelo — exatamente o cenário da conta de
demonstração, com Aline Prado, Marcos Dias e Tiago Rocha — **a colisão é o caso normal, não
a exceção**. A agenda é a tela que a recepção olha o dia inteiro; é onde o produto não pode
falhar.

A causa é conhecida e a solução é um algoritmo clássico e leve: ordenar por início, agrupar
os que se sobrepõem, alocar cada um à primeira coluna livre do grupo, e dar a cada bloco
largura `1/n` do grupo. É `O(n log n)`, roda em ~40 linhas de TypeScript puro, sem
biblioteca. Implementação de referência e demonstração funcional no `prototipo.html`.

### A02 🟠 Não há linha do "agora"

Toda agenda profissional (Google Calendar, Outlook, Calendly, Trinks, iClinic) desenha uma
linha horizontal no horário atual. É o elemento que responde "onde estou no dia" sem ler
número nenhum. Custo: um `div` posicionado por `top: calc(...)` e um `setInterval` de um
minuto.

### A03 🟠 A legenda de profissionais não filtra

"● Aline Prado ● Marcos Dias ● Tiago Rocha" aparece como legenda estática. Em toda agenda
multi-profissional essa legenda **é** o filtro — clicar num nome isola a agenda daquela
pessoa. Aqui as bolinhas são decoração, e o dado de filtro já está na consulta.

### A04 🟡 Sábado e domingo ocupam 2/7 da largura, sempre vazios

E a faixa exibida vai das 07:00 às 19:00, com 07–09 e 16–19 permanentemente vazios na conta
de demonstração. Resultado: cerca de **40% da grade da agenda é espaço morto garantido**,
espremendo os cinco dias que importam. Padrão do mercado: horário de funcionamento
configurável por conta, e fim de semana colapsado numa coluna estreita que expande ao clique.

---

## E. Funil de vendas (kanban)

### K01 🟠 O card repete o nome da coluna que já o contém

`06_vendas.png`: na coluna "Novo contato", o card diz "Novo contato — oportunidade 1 ·
R$ 400,00". Na coluna "Proposta enviada", diz "Proposta enviada — oportunidade 1 ·
R$ 900,00". A etapa está codificada duas vezes: pela posição e pelo texto. Essa linha inteira
poderia ser substituída pelo que o vendedor de fato precisa saber (K03).

### K02 🟠 "Ganha" e "Perdida" como texto solto em todos os cards

Cada card carrega dois links de texto no rodapé. Em 14 cards são 28 alvos de ação competindo
com o conteúdo — e "Perdida", ação destrutiva e definitiva, tem exatamente o mesmo peso
visual de "Ganha". Padrão do mercado: as ações de desfecho moram no menu do card ou aparecem
no hover, e "marcar como perdida" pede motivo — que é o dado que alimenta qualquer análise
de funil útil.

### K03 🟠 Falta o indicador mais útil do funil: tempo na etapa

O card não mostra há quantos dias o negócio está parado naquela etapa, nem quem é o dono,
nem qual é a próxima ação e quando. **Tempo-na-etapa é a métrica que o Pipedrive popularizou
e que praticamente todo CRM moderno copiou**, porque responde à única pergunta que o funil
existe para responder: *o que está travado?* Sem ela, o kanban é uma lista bonita.

Anatomia de card proposta em `04_PADROES_DE_TELA.md` §3.

### K04 🟡 Coluna vazia e altura fixa

As colunas têm ~1.000px de altura fixa, e a coluna com 2 cards mostra 800px de branco. Não há
estado vazio desenhado, nem indicação de que os cards são arrastáveis — o `dnd-kit` está
instalado e presumivelmente funciona, mas nada na tela informa isso.

---

## F. Caixa de entrada (mensagens)

### M01 🟠 Dois dos três painéis abrem vazios

`12_mensagens.png`: ~75% da tela mostra "Selecione uma conversa à esquerda" e "Selecione uma
conversa para ver o contexto". Em toda caixa de entrada profissional (Intercom, Front,
HubSpot Conversations, Missive), abrir a tela **pré-seleciona a conversa mais recente**.
Nenhuma tela deveria estrear pedindo permissão para mostrar o próprio conteúdo.

### M02 🔴 A janela de 24 horas da Meta não é sinalizada

Este é o achado mais caro em dinheiro do dossiê. A API oficial do WhatsApp só permite
mensagem livre dentro de 24h após a última mensagem do cliente; fora disso exige *template*
aprovado. A lista de conversas mostra "3 dias", "5 dias", "12 dias" — **todas fora da
janela** — e nada na interface diz isso. O atendente digita, envia, e a Meta recusa.

O wireframe `1j` previa o indicador ("janela de 24h sinalizada", `design/README.md`) e ele
não chegou ao produto. É funcionalidade, não enfeite: a contagem regressiva da janela é o
elemento organizador de qualquer caixa de entrada de WhatsApp comercial.

> Nota de escopo: a configuração da Meta segue congelada por decisão de Max
> (`handoffs/HANDOFF_UPGRADE.md`). Este achado é sobre a **interface**, que pode ser
> construída e testada com o dado de data que já existe em `aba_messaging`, independentemente
> de a credencial estar ligada.

### M03 🟠 O link de credenciais está solto fora de qualquer container

"Reconectar / trocar credenciais do WhatsApp", sublinhado, flutuando acima dos painéis, sem
card, sem ícone, sem indicação de estado. É a única pista visual do estado da conexão — e não
diz se a conexão está de pé. Deveria ser um indicador de status (conectado / expirado / nunca
configurado) com a ação embutida.

### M04 🟡 Sem busca, sem filtro, sem contador de não lidas

Nenhuma conversa aparece como não lida. Não há filtro "minhas / não atribuídas / sem
resposta". Com 6 conversas tudo bem — é a mesma armadilha de T01.

---

## G. Dashboard

### D01 🟠 Os KPIs não levam a lugar nenhum

Quatro cartões com número e variação, nenhum clicável. Em CRM, o painel é ponto de partida:
"7 novos leads" deveria abrir a lista de pessoas filtrada por lead nos últimos 30 dias;
"2 cobranças vencidas" deveria abrir o financeiro já filtrado. Sem *drill-down*, o painel
informa mas não trabalha.

### D02 🟡 "sem base de comparação" ocupa a linha da variação em 2 de 4 KPIs

É honesto — e honestidade é virtude declarada deste projeto —, mas repetido vira ruído.
Alternativa que preserva a honestidade e ganha o espaço: mostrar a comparação quando existir
e, quando não existir, usar a linha para o dado bruto que sustenta o número ("0 de 6
agendados hoje").

### D03 🟡 O gráfico de barras não tem eixo nem rótulo de valor

12 barras sem eixo Y, sem valor no topo, sem *tooltip*. Dá para ver a forma da tendência, não
para ler a grandeza. O mínimo profissional: valor na barra em foco e três linhas de grade
rotuladas.

### D04 🟡 As barras de "Ocupação por profissional" usam o verde semântico

Verde é a cor de "sucesso/positivo" na paleta (`docs/04` §5.2). Usá-la para medir ocupação
sugere que ocupação alta é boa e baixa é ruim — o que pode até ser verdade, mas é uma
afirmação que o gráfico faz por acidente de cor. Ocupação é dado neutro: `--chart-1` ou
`--chart-4`.

---

## H. Estados, feedback e acessibilidade

### E01 🔴 Não existe estado de carregamento desenhado · [medido]

```bash
cd crm/src && grep -roh "Carregando[^\"<]*" . | sort | uniq -c
```

**24 ocorrências da palavra "Carregando…" como texto solto.** Zero skeleton, zero placeholder
de forma. O usuário vê a estrutura sumir, uma palavra aparecer no vazio, e a estrutura
voltar — o que a NN/g descreve como o pior dos três padrões de espera, porque não dá pista
nenhuma de como a página vai ficar.

Skeleton é CSS puro: retângulos com o raio certo e uma animação de brilho. Custa ~30 linhas
de estilo, nenhuma dependência, e é uma das mudanças que mais alteram a percepção de
qualidade por unidade de esforço.

### E02 🟠 Não existe toast, nem desfazer · [medido]

Nenhuma ocorrência de toast/snackbar/undo no código. Não há confirmação visível de que
"Editar dados" salvou, nem como voltar atrás de uma exclusão. Num CRM, cujas operações mexem
em dado de cliente real, "desfazer" não é conforto — é rede de segurança. O padrão do mercado
é otimista: aplica na hora e mostra o toast com "Desfazer" por 5–8 segundos.

### E03 🟠 Os estados vazios são lápides, não convites

"Nenhuma nota ainda." · "Selecione uma conversa à esquerda." · "—" na coluna de tags. Um bom
estado vazio tem três partes: o que estaria aqui, por que está vazio, e o botão que resolve.
`04_pessoas_ficha.png` é o exemplo mais visível — uma ficha quase toda vazia, um só evento na
linha do tempo, e nenhum caminho oferecido dali (agendar, cobrar, mandar mensagem, preencher
anamnese).

### E04 🟠 A acessibilidade está praticamente ausente · [medido]

```bash
cd crm/src && grep -roh "aria-[a-z]*" . | sort | uniq -c   # 6 aria-label, 1 aria-pressed
grep -roh "sr-only" . | wc -l                              # 0
```

Em 15.680 linhas: **7 atributos ARIA e nenhum texto exclusivo de leitor de tela**. Botões só
de ícone (kebab, navegação de semana, "+") não têm nome acessível. Não há região viva para
anunciar mudança de estado. Isso não é só conformidade: é o mesmo trabalho que faz a navegação
por teclado funcionar, e navegação por teclado é o que separa um CRM que a recepção usa rápido
de um que ela usa com o mouse.

Vale registrar como oportunidade comercial, não só como dever: o Vitrine é vendido a clínicas,
e acessibilidade digital é exigência em contratação pública e em cliente corporativo. É um
diferencial barato num mercado onde quase nenhum concorrente brasileiro o tem.

### E05 🟡 De 35% a 45% da altura da tela é espaço morto

Visível em 5 das 6 capturas analisadas. A causa não é uma só: é F01 (texto pequeno demais para
o container), K04 (altura fixa) e a ausência de um cabeçalho de página (N04) que ancoraria o
conteúdo. É sintoma, não doença — some quando F01 e N04 forem resolvidos.

---

## Resumo por severidade

| | Achado |
|---|---|
| 🔴 | **F01** texto em 17 tamanhos, a maior parte entre 9 e 11px |
| 🔴 | **F02** seletor de densidade não altera densidade |
| 🔴 | **F03** seis papéis de texto reprovam no contraste AA |
| 🔴 | **N01** nome de schema como rótulo de navegação |
| 🔴 | **N03** sem busca global |
| 🔴 | **A01** colisão de compromissos ilegível na agenda |
| 🔴 | **M02** janela de 24h do WhatsApp não sinalizada |
| 🔴 | **E01** sem estado de carregamento desenhado |
| 🟠 | F04, F05, F06, N02, N04, T01, T02, A02, A03, K01, K02, K03, M01, M03, D01, E02, E03, E04 |
| 🟡 | N05, T03, T04, T05, A04, K04, M04, D02, D03, D04, E05 |

**Oito achados críticos, e seis deles se resolvem na camada de fundação**
(`02_FUNDACAO_VISUAL.md`) ou com um componente que ainda não existe (`03_COMPONENTES.md`) —
não com redesenho de tela. Essa é a boa notícia do diagnóstico: a arquitetura visual está
certa, o acabamento é que não chegou.
