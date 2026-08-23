# 03 — A biblioteca de componentes que falta

O produto tem **três** componentes de UI: `button.tsx`, `card.tsx`, `badge.tsx`. As 16 telas
são construídas com `div` e classe utilitária direto — o que explica por que padrões que
deveriam ser idênticos (tabela, aba, estado vazio, painel) aparecem levemente diferentes em
cada módulo, e por que corrigir um deles não corrige os outros.

Este documento é a lista do que falta, ordenada por **impacto ÷ custo**, com o peso de cada
peça. Nada aqui é obrigatório de uma vez — a Onda 1 sozinha já muda a percepção do produto.

---

## Como ler a coluna "peso"

Duas naturezas de custo, e confundi-las é o erro que engorda bundle:

- **Fonte copiada** — o padrão shadcn/ui. O componente é um arquivo `.tsx` no seu repo. Não
  é dependência, não aparece no `package.json`, e o *tree-shaking* remove o que não for
  usado. Custa linhas, não KB de terceiro.
- **Primitiva Radix** — a peça de acessibilidade e comportamento por baixo (foco preso,
  `aria-*`, teclado, posicionamento). **A primeira que entrar paga o tempo de execução
  compartilhado do Radix; da segunda em diante o custo marginal cai muito**, porque
  `react-primitive`, `react-context`, `react-compose-refs` e `react-popper` são reusados.

Os valores abaixo são **ordem de grandeza**, não medição. A medição honesta se faz assim, e
custa uma devDependency que não vai para produção:

```bash
cd crm && npm i -D rollup-plugin-visualizer && npx vite build
# adicionar visualizer() em vite.config.ts plugins, com gzipSize: true
```

---

## Onda 1 — nenhuma dependência nova, impacto imediato

Tudo aqui é CSS e composição. **Peso adicionado ao bundle: praticamente zero.**

| # | Componente | Resolve | Custo |
|---|---|---|---|
| 1 | **`Skeleton`** | E01 | ~30 linhas CSS |
| 2 | **`EmptyState`** | E03 | ~40 linhas |
| 3 | **`PageHeader`** | N02, N04, E05 | ~60 linhas |
| 4 | **`Avatar`** (iniciais + cor derivada) | T04 | ~35 linhas |
| 5 | **`DataTable` primitives** (thead fixo, `tabular-nums`, hover, densidade) | T05, F02 | ~80 linhas |
| 6 | **`StatusIndicator`** | M03 | ~30 linhas |
| 7 | **`Kbd`** | pré-requisito de N03 | ~10 linhas |
| 8 | **`Progress`** / `Meter` | D04 | ~20 linhas |

### 1. `Skeleton` — a maior mudança de percepção por linha escrita

Substitui as 24 ocorrências de "Carregando…". A regra que faz skeleton funcionar: **ele
imita a forma do conteúdo que vai chegar**, não é um retângulo genérico. Skeleton de linha de
tabela tem a altura da linha e as larguras das colunas; skeleton de card de KPI tem eyebrow,
número e delta.

```css
.skeleton {
  background: linear-gradient(90deg,
    hsl(var(--content)) 25%, hsl(var(--hairline)) 37%, hsl(var(--content)) 63%);
  background-size: 400% 100%;
  animation: brilho 1.4s ease infinite;
  border-radius: 4px;
}
@keyframes brilho { from { background-position: 100% 50% } to { background-position: 0 50% } }
@media (prefers-reduced-motion: reduce) { .skeleton { animation: none } }
```

Duas regras de conduta: mostrar skeleton só depois de ~200ms de espera (abaixo disso ele
pisca e incomoda mais que ajuda), e **manter o número de linhas estável** entre o skeleton e
o conteúdo real, para a página não pular.

### 2. `EmptyState` — três partes obrigatórias

Todo estado vazio do produto hoje é uma frase. O padrão que funciona tem três partes, e a
terceira é a que importa:

| Parte | Exemplo, na ficha de pessoa |
|---|---|
| **O que estaria aqui** | "Nenhum atendimento registrado" |
| **Por que está vazio** | "Os atendimentos aparecem aqui assim que forem agendados." |
| **A ação que resolve** | `[Agendar atendimento]` |

E a distinção que quase todo mundo erra: **vazio-por-ser-novo** é diferente de
**vazio-por-filtro**. O primeiro pede a ação de criar; o segundo pede "Limpar filtros" e
jamais deve oferecer "criar", porque o dado provavelmente existe.

### 3. `PageHeader` — o lugar que hoje não existe

Substitui o caminho de dois níveis (N02) e dá endereço à ação primária (N04):

```
┌───────────────────────────────────────────────────────────────────────┐
│  Pessoas                                        [ Importar ] [+ Nova ] │   ← H1 20px + ações
│  31 cadastradas · 12 leads · 10 clientes                               │   ← contexto 13px
├───────────────────────────────────────────────────────────────────────┤
│  Todas · 31   Leads · 12   Clientes · 10   Equipe · 7   Fornecedores·2 │   ← recorte
└───────────────────────────────────────────────────────────────────────┘
```

Regras: **uma** ação primária sólida por página, no máximo duas secundárias em contorno, o
resto no kebab. Breadcrumb só quando houver profundidade real (`Pessoas › Helena Marques ›
Prontuário`), e aí todo segmento anterior navega.

### 4. `Avatar` — iniciais e cor derivada do nome

```ts
// matiz estável derivado do nome; saturação e luminosidade fixas para
// nunca colidir com a semântica da paleta nem reprovar em contraste
const matiz = [...nome].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const fundo = `hsl(${matiz} 32% 88%)`;
const texto = `hsl(${matiz} 38% 28%)`;
```

Fixar S e L é o detalhe que separa isto de um gerador de cor aleatória: todas as combinações
nascem no mesmo par de luminosidades, logo todas passam no contraste, e nenhuma se confunde
com verde-sucesso ou terracota-perigo.

### 5. `DataTable` primitives

Não é o componente completo ainda (isso é Onda 3) — é a base CSS que toda tabela do produto
passa a compartilhar: `thead` fixo com `position: sticky; top: 0`, altura de linha via
`--alt-linha`, alinhamento numérico à direita com `tabular-nums`, hover de linha inteira,
e faixa de seleção com fundo `--accent`.

### 6. `StatusIndicator` — o que falta na tela de mensagens

Um ponto colorido, um rótulo e uma ação opcional. Três estados: **conectado** (verde,
discreto), **atenção** (âmbar, "token expira em 5 dias"), **desconectado** (terracota, com a
ação "Reconectar" embutida). Substitui o link solto de M03 e serve igual para o motor de
automações e para o agente de IA — três telas com o mesmo problema.

---

## Onda 2 — as primitivas Radix, na ordem de melhor retorno

A primeira entrada paga o custo compartilhado; as seguintes são baratas. Ordem sugerida:

| # | Componente | Pacote | Peso estimado | Destranca |
|---|---|---|---|---|
| 9 | **`DropdownMenu`** | `@radix-ui/react-dropdown-menu` | ~12–16 KB gzip (inclui o compartilhado) | kebab de linha, ações de card do funil (K02), menu do usuário |
| 10 | **`Dialog`** | `@radix-ui/react-dialog` | ~4–6 KB marginal | criar/editar, confirmar exclusão, paleta de comandos (N03) |
| 11 | **`Popover`** | `@radix-ui/react-popover` | ~3–5 KB marginal | filtros, seletor de colunas, detalhe de compromisso |
| 12 | **`Select`** | `@radix-ui/react-select` | ~6–9 KB marginal | tamanho de página (T05), filtros, formulários |
| 13 | **`Tooltip`** | `@radix-ui/react-tooltip` | ~3–4 KB marginal | botões só de ícone (E04), valor de barra (D03) |
| 14 | **`Checkbox`, `Switch`** | dois pacotes | ~2–3 KB cada | seleção de tabela (T02), toggles de configuração |
| 15 | **`Tabs`** | `@radix-ui/react-tabs` | ~2–3 KB marginal | padroniza as abas feitas à mão em 5 telas |
| 16 | **`Toast`** | `@radix-ui/react-toast` **ou** `sonner` | ~5–8 KB | E02 — confirmação e desfazer |

**Sobre o toast:** `sonner` é a escolha do mercado hoje (é o que o próprio shadcn recomenda),
é uma dependência pequena, e traz empilhamento, fila e ação de desfazer prontos. `Radix Toast`
evita a dependência extra mas exige montar a fila à mão. **Recomendação: `sonner`** — o
desfazer é rede de segurança em cima de dado de cliente, e vale mais que 6 KB.

**O que NÃO adotar**, e é o que costuma engordar CRM:

| Tentação | Peso típico | Em vez disso |
|---|---|---|
| `recharts` / `chart.js` | 90–120 KB gzip | SVG inline — o produto **já faz assim**, e bem |
| `framer-motion` | 40–55 KB gzip | `tailwindcss-animate`, já instalado |
| `react-big-calendar` / `fullcalendar` | 60–200 KB gzip | ~40 linhas de column-packing (A01) |
| `react-day-picker` | ~25 KB gzip | `<input type="date">` nativo + `date-fns`, já instalado |
| `@mui/*`, `antd` | 300 KB+ | — |

---

## Onda 3 — os compostos do produto

Nenhuma dependência nova: são as peças das ondas 1 e 2 montadas nos padrões que
`04_PADROES_DE_TELA.md` descreve.

| # | Componente | Resolve |
|---|---|---|
| 17 | **`DataTable`** completo — ordenação, filtro, densidade, colunas, paginação | T01, T05 |
| 18 | **`BulkActionBar`** — substitui o `thead` quando há seleção | T02 |
| 19 | **`CommandPalette`** (`⌘K`) + busca global | N03 |
| 20 | **`FilterBar`** + visões salvas | T01 |
| 21 | **`CalendarWeek`** com alocação de colunas por colisão | A01, A02, A03, A04 |
| 22 | **`DealCard`** com tempo-na-etapa | K01, K02, K03 |
| 23 | **`ConversationItem`** com janela de 24h | M02, M04 |
| 24 | **`KpiCard`** clicável com *drill-down* | D01, D02 |
| 25 | **`Timeline`** com agrupamento por dia | E03 |
| 26 | **`FormField`** — rótulo + campo + descrição + erro, ligado ao `react-hook-form` | E04, F05 |

### Sobre a paleta de comandos (19)

`cmdk` é a biblioteca canônica (~5 KB gzip) e é o que o shadcn usa. Dá para fazer sem ela —
é um `Dialog` com um `input` e uma lista navegável por seta —, mas `cmdk` já resolve
filtragem difusa, grupos, navegação por teclado e leitura por leitor de tela. **Para uma peça
que vai virar a porta de entrada do produto, os 5 KB se pagam.**

O conteúdo dela é o que a torna útil, e isso é decisão de produto, não de componente:

```
⌘K
├── Pessoas         → busca em nome, telefone, e-mail (a mais usada, no topo)
├── Ir para         → os 9 módulos, por nome
├── Ações           → "Nova pessoa", "Novo agendamento", "Novo negócio"
└── Recentes        → as 5 últimas pessoas abertas (localStorage, custo zero)
```

### Sobre o `FormField` (26)

`react-hook-form` + `zod` já estão instalados e presumivelmente já validam. O que falta é a
casca visual consistente: rótulo sempre visível (nunca só placeholder — placeholder some
quando se digita e é a causa nº 1 de erro em formulário longo), texto de ajuda abaixo do
rótulo, erro abaixo do campo com `aria-describedby`, e `aria-invalid` no campo. É o mesmo
trabalho que fecha metade de E04.

---

## Estimativa de peso total

| Onda | Dependência nova | Peso estimado adicionado |
|---|---|---|
| 1 | nenhuma | ~0 (só CSS e `.tsx` local) |
| 2 | 7–8 primitivas Radix + `sonner` | **~35–50 KB gzip** |
| 3 | `cmdk` (opcional) | **~5 KB gzip** |
| | **Total** | **~40–55 KB gzip** |

Para pôr em perspectiva: o bundle de hoje é **291 KB gzip num único chunk**. A biblioteca
inteira deste documento adiciona por volta de 15% — e a divisão por rota descrita em
`06_ORCAMENTO_DE_PESO.md` devolve **muito mais** que isso no carregamento inicial. **O saldo
é negativo: o produto fica mais completo e mais leve de abrir ao mesmo tempo.**
