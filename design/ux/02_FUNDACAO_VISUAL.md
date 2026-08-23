# 02 — Fundação visual

A camada que conserta muita coisa de uma vez. Seis dos oito achados críticos de
`01_DIAGNOSTICO.md` morrem aqui, sem redesenhar uma única tela e sem adicionar um byte de
dependência.

Tudo neste documento é **token**: mora em `crm/src/index.css`, é consumido por classe
utilitária, e respeita a regra de `docs/04` §4 — nenhum valor de cor sai daquele arquivo.

---

## 1. Escala tipográfica — 17 tamanhos viram 7 degraus

**Resolve F01, e por consequência F02 e metade de E05.**

### O problema em uma frase

637 tamanhos cravados em `px`, em 17 valores, com a maior parte da interface entre 9 e 11px.
Texto em `px` não responde à densidade, não responde à preferência de fonte do navegador, e
abaixo de 12px não é texto de leitura em nenhum design system profissional.

### A escala proposta

Sete degraus, todos em `rem`, ancorados em raiz de 16px. Os nomes dizem o **papel**, não o
tamanho — é o que impede a escala de voltar a inchar.

```css
:root {
  --fs-eyebrow: 0.6875rem;  /* 11px — mono, caixa alta, tracking. SÓ metadado. */
  --fs-xs:      0.75rem;    /* 12px — legenda, timestamp, chip, texto de apoio */
  --fs-sm:      0.8125rem;  /* 13px — célula de tabela densa, item de sidebar */
  --fs-md:      0.875rem;   /* 14px — CORPO PADRÃO. Input, label, célula normal. */
  --fs-lg:      1rem;       /* 16px — título de card, título de seção */
  --fs-xl:      1.25rem;    /* 20px — H1 de página */
  --fs-display: 1.75rem;    /* 28px — valor de KPI */

  --lh-tight:   1.25;       /* título, valor de KPI */
  --lh-normal:  1.45;       /* corpo, célula de tabela */
  --lh-relaxed: 1.6;        /* parágrafo longo: nota, anamnese, descrição */
}
```

Sete degraus com razão média de ~1,18 entre vizinhos: perto o bastante para haver sempre um
degrau adequado, longe o bastante para a diferença ser perceptível. É a mesma densidade de
escala que Carbon e Polaris usam.

### Mapa de migração — os 17 valores atuais

Substituição mecânica, com uma única decisão de julgamento (a linha de 11/11,5px):

| Hoje | Ocorrências | Vira | Por quê |
|---|---|---|---|
| 8px, 8,5px, 9px, 9,5px | 66 | `--fs-eyebrow` (11px) | São todos eyebrow mono/metadado. Sobem 2px e passam a ser legíveis. |
| 10px, 10,5px | 198 | `--fs-xs` (12px) | Texto de apoio, legenda, timestamp. |
| 11px, 11,5px | 253 | `--fs-sm` (13px) *ou* `--fs-md` (14px) | **Única decisão de julgamento.** `--fs-sm` em célula de tabela, item de sidebar e chip; `--fs-md` em tudo que é leitura corrida. |
| 12px, 12,5px, 13px | 108 | `--fs-md` (14px) | Corpo, input, label. |
| 14px, 15px, 17px | 8 | `--fs-lg` (16px) | Título de card e de seção. |
| 20px | 1 | `--fs-xl` (20px) | Já estava certo. |
| 24px, 26px | 3 | `--fs-display` (28px) | Valor de KPI. |

**Efeito colateral desejado:** a interface fica ~20% maior. Isso não "estraga o layout" — é
o que preenche os 35–45% de espaço morto de E05. O wireframe foi desenhado em canvas de
1280px e o produto roda em 1440–1920px; a escala estava calibrada para o documento, não para
a tela.

### Como fazer sem quebrar tudo de uma vez

O caminho seguro é **um alias temporário**: definir as sete classes utilitárias e substituir
tela a tela, começando pela sidebar e pela tabela de Pessoas (as duas superfícies mais
visíveis). `grep -c "text-\[" src/features/<modulo>` dá o progresso a qualquer momento, e o
número zerado é o critério de pronto.

### O papel do mono, mantido

`docs/04` §5.1 define o `IBM Plex Mono` como "vocabulário de metadado", e isso é uma boa
decisão de identidade — é o que dá ao produto uma assinatura própria em vez de genérica.
A escala acima **preserva** o papel e só corrige o tamanho: o mono continua exclusivo de
eyebrow de KPI, cabeçalho de tabela, timestamp, hora da agenda e breadcrumb, agora em 11px
com `letter-spacing: 0.08em` em vez de 9px.

```css
.eyebrow {
  font-family: var(--font-mono);
  font-size: var(--fs-eyebrow);
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}
```

---

## 2. Densidade que de fato muda a densidade

**Resolve F02.**

### Por que a implementação atual não funciona

`:root[data-density="compact"] { font-size: 14px }` só funciona se **tudo** for `rem`. Hoje
o espaçamento é `rem` e o tipo é `px`, então o compacto aperta o espaço em volta de um texto
que não muda. E, mesmo consertado o F01, o efeito passaria a encolher o tipo junto — o que
`docs/04` §2 explicitamente **não** quer ("densidade é propriedade de grade e container").

### A proposta: duas alavancas separadas

**Tipo fica fixo. Espaço varia.** Um multiplicador e cinco alturas nomeadas cobrem todas as
superfícies densas do produto:

```css
:root {
  --d: 1;                          /* confortável (padrão) */
  --alt-linha:      calc(2.5rem * var(--d));   /* 40px — linha de tabela */
  --alt-item:       calc(3rem   * var(--d));   /* 48px — item de lista/conversa */
  --alt-hora:       calc(3.5rem * var(--d));   /* 56px — faixa de hora da agenda */
  --pad-card:       calc(1rem   * var(--d));   /* 16px — padding interno de card */
  --gap-card:       calc(0.75rem * var(--d));  /* 12px — gap entre elementos do card */
}

:root[data-density="compact"]     { --d: 0.8; }   /* linha de 32px */
:root[data-density="comfortable"] { --d: 1.15; }  /* linha de 46px */
```

Três níveis, não dois — é o que Carbon, Polaris e Attio oferecem, e o terceiro nível
("confortável") é o que serve à recepcionista que usa a tela o dia inteiro a 60cm do monitor.

**Custo de adoção: cerca de seis lugares.** Linha de tabela, item de lista, faixa de hora,
padding de card, gap de card, card de kanban. Não é varredura de 48 arquivos como o F01 — é
pontual, porque densidade só importa onde há repetição.

### A alavanca que sobra

Consertado o F01, `font-size` na raiz volta a estar disponível como um **zoom de interface
inteira** — que é uma funcionalidade diferente e também desejável ("Tamanho da interface:
pequeno/médio/grande", ao lado de densidade). São duas preferências, não uma.

---

## 3. Contraste corrigido, no mesmo matiz

**Resolve F03 e F04.**

Todos os substitutos abaixo foram calculados escurecendo a luminosidade HSL e **mantendo
matiz e saturação intactos** — não há cor nova na paleta, só o mesmo tom um degrau mais
fundo. Cada linha vem com o contraste medido do valor proposto.

| Papel | Hoje | Contraste | **Proposto** | Novo contraste |
|---|---|---|---|---|
| Texto muted (apoio, legenda) | `#7c8b95` | 3,51 / 3,24 | **`#63717b`** | 5,03:1 · 4,64:1 ✅ |
| Texto muted B | `#8b98a2` | 2,95 / 2,72 | **`#63717c`** | 5,02:1 · 4,63:1 ✅ |
| Eyebrow mono / faint | `#9aa8b1` | 2,44 / 2,25 | **`#60717c`** | 5,06:1 · 4,67:1 ✅ |
| Placeholder | `#a8b6bf` | 2,08 | **`#627885`** | 4,62:1 ✅ |
| Badge sucesso (texto) | `#4d7c69` | 4,28 | **`#497664`** | 4,64:1 ✅ |
| Badge atenção (texto) | `#8a7550` | 4,11 | **`#806d4a`** | 4,64:1 ✅ |
| Badge perigo (texto) | `#9c6b5e` | 4,00 | **`#8e6156`** | 4,68:1 ✅ |

Os dois números na coluna final são o contraste contra `#ffffff` (fundo de card) e contra
`#f4f6f7` (fundo de área de conteúdo) — os dois fundos em que essas cores aparecem de fato.

Repare que os quatro cinzas convergem para praticamente a mesma cor. Isso não é acidente: as
distinções entre `#7c8b95`, `#8b98a2`, `#9aa8b1` e `#a8b6bf` eram distinções entre quatro
níveis de "quase invisível". **A paleta tem cinza de apoio demais** — dois bastam
(`muted-foreground` e `faint`, este último reservado ao placeholder, que pode ser um degrau
mais claro porque não é conteúdo).

### Script para refazer a medição

Guardado em [`referencias/medir_contraste.mjs`](referencias/medir_contraste.mjs). Roda com
`node`, sem dependência, e serve como teste permanente: qualquer cor nova na paleta passa
por ele antes de entrar.

### O modo escuro precisa da mesma passagem

O bloco `.dark` de `index.css` é derivação honesta e bem documentada, mas **nunca foi
medido**. Antes de qualquer coisa, rodar o mesmo script contra os pares do tema escuro — o
risco lá é o inverso e igualmente comum: texto claro demais sobre fundo escuro tem contraste
alto mas produz *halation*, e tint escuro com texto escuro reprova do mesmo jeito.

---

## 4. Borda de input — o único caso com custo estético

**Resolve F05.**

O WCAG SC 1.4.11 pede 3:1 para o que identifica um componente. A borda atual dá 1,29:1. As
opções, com o contraste de cada uma medido:

| Opção | Cor | Contraste | Custo |
|---|---|---|---|
| Manter | `#dde4e8` | 1,29:1 | Reprova; campos não se distinguem de caixas decorativas |
| Meio-termo | `#aab8c2` | 2,03:1 | Ainda reprova, mas o campo já se lê como campo |
| **Conforme** | **`#7a95a5`** | **3,15:1** | Passa; visivelmente mais escura que o wireframe |

**Recomendação: `#7a95a5`, mas só na borda de input.** A distinção que salva a estética é
que o critério fala de *componentes*, não de decoração:

- **Componente** (precisa de 3:1): borda de campo de texto, de `select`, de checkbox, de
  botão *outline*, e o anel de foco.
- **Decoração** (isento, pode continuar em `#e4eaee` / `#eef2f4`): borda de card, hairline
  entre linhas de tabela, divisor de seção. São separadores visuais, não a única pista de
  que algo é interativo.

Feita essa separação, o traço delicado que dá identidade ao produto sobrevive em 90% das
superfícies, e sobe só onde o usuário precisa saber onde clicar. É exatamente o que Polaris e
Carbon fazem — os dois têm borda de card muito mais leve que borda de campo.

---

## 5. Espaçamento — a escala que `docs/04` §5.3 admite não ter

Hoje: "gap 6–14px dentro de card, padding de card 12–16px. **Sem escala tokenizada formal** —
seguir os valores observados por analogia." Seguir por analogia é como se chega a 17 tamanhos
de fonte.

Escala de 4px, que é o que Polaris, Carbon, Material e Atlassian usam, e o que o Tailwind já
oferece de fábrica:

| Token | Valor | Uso |
|---|---|---|
| `space-1` | 4px | gap entre ícone e rótulo, entre badge e texto |
| `space-2` | 8px | gap entre elementos irmãos dentro de um bloco |
| `space-3` | 12px | gap entre blocos dentro de um card |
| `space-4` | 16px | padding de card, gap entre cards |
| `space-6` | 24px | gap entre seções de uma página |
| `space-8` | 32px | margem do cabeçalho de página |

Regra de bolso que evita 90% das discussões: **o espaço entre dois elementos deve ser menor
que o espaço até o elemento do grupo vizinho.** Se um rótulo está a 12px do seu valor e a 12px
do próximo rótulo, o olho não sabe o que pertence a quê.

Os valores ímpares que aparecem no código hoje (`px-[7px]`, `py-1`, `gap-1.5`) são o sintoma
da ausência de escala; todos têm vizinho na tabela acima.

---

## 6. Anel de foco — hoje inexistente, e é ele que faz o teclado funcionar

O WCAG 2.2 SC 2.4.13 (Aparência do Foco) pede um indicador com área mínima equivalente a um
perímetro de 2px e contraste de 3:1 entre o estado com e sem foco. Não existe nada disso
hoje, e é o que impede a recepção de operar a agenda sem mouse.

```css
:where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
  border-radius: inherit;
}
```

Três detalhes que fazem diferença:
- **`:focus-visible`, não `:focus`** — o anel aparece para quem navega por teclado e não
  polui o clique de mouse.
- **`outline`, não `box-shadow`** — `outline` não participa do layout, então nunca desloca
  nada, e sobrevive a `overflow: hidden`.
- **`outline-offset: 2px`** — garante os 3:1 contra o fundo, mesmo quando o próprio
  componente é azul.

`--ring` já existe e já acompanha a cor de destaque escolhida pela conta. O anel herda o
tema sem trabalho adicional.

### O par disso: alvo de 24×24

SC 2.5.8 pede alvo mínimo de 24×24px CSS. Botões só de ícone com 14px de ícone e 4px de
padding dão 22px. Subir o padding para 5px resolve, ou usar a exceção de espaçamento (24px
de folga entre alvos vizinhos). Vale a varredura junto com o F01, porque é o mesmo arquivo.

---

## 7. Elevação: o produto acertou, e vale escrever a regra

`docs/04` §5.3 diz "sombra praticamente ausente — cards se separam por borda 1px, não por
elevação. Reservar sombra só para overlay/modal". **Isso está certo e deve ser mantido** —
é uma decisão de identidade que envelhece bem e que a maior parte dos CRMs errou na década
passada (Salesforce Lightning e HubSpot ainda carregam sombra em card por herança).

A regra explícita, para não haver dúvida quando componentes novos entrarem:

| Camada | Elevação | Componentes |
|---|---|---|
| Base | nenhuma | card, tabela, painel, seção |
| Flutuante | `0 4px 12px rgb(0 0 0 / 0.08)` + borda | dropdown, popover, tooltip, autocomplete |
| Overlay | `0 16px 48px rgb(0 0 0 / 0.16)` + backdrop | modal, drawer, paleta de comandos |

Três degraus, nunca mais. Card **nunca** ganha sombra, nem no hover — o realce de hover é
mudança de fundo (`--content`) ou de borda, não de altura.

---

## 8. Movimento — que quase não existe, e o pouco que deve existir

`tailwindcss-animate` já está instalado (custo zero adicional). O que falta é a regra.

```css
:root {
  --dur-instant: 80ms;    /* hover, foco, mudança de cor */
  --dur-fast:   150ms;    /* dropdown, tooltip, badge que aparece */
  --dur-normal: 220ms;    /* modal, drawer, painel lateral */
  --ease:       cubic-bezier(0.2, 0, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Duas regras de conduta que valem mais que as durações:
1. **Nada acima de 250ms em interface de trabalho.** Um CRM é usado 8h por dia; animação
   longa que encanta na primeira semana irrita na terceira.
2. **`prefers-reduced-motion` não é opcional.** Movimento vestibular é gatilho real de
   enjoo, e o bloco acima é uma vez só, no `index.css`.

O único movimento que este dossiê propõe adicionar é o brilho do skeleton (§ `03_COMPONENTES.md`).

---

## 9. Número tabular — três linhas que arrumam toda coluna de dinheiro

Valores monetários e horários em coluna precisam de largura de dígito fixa; sem isso, "R$
1.150,00" e "R$ 890,00" não alinham a vírgula e a coluna parece torta.

```css
.num { font-variant-numeric: tabular-nums; text-align: right; }
```

Regra completa de alinhamento em tabela, que é padrão em Carbon e Polaris:
- **Texto** → esquerda.
- **Número, moeda, data, hora** → direita, com `tabular-nums`.
- **Cabeçalho** → segue o alinhamento da coluna que titula (cabeçalho de coluna numérica
  também vai à direita — é o erro mais comum).
- **Badge/status** → esquerda, largura de coluna fixa para os pills não dançarem.

O `IBM Plex Mono` já é tabular por natureza, então onde o mono é usado (hora da agenda,
cabeçalho) o problema não existe. Onde o valor é `IBM Plex Sans` — que é o caso do
Financeiro e dos KPIs — a linha acima é necessária.

---

## 10. A regra do token, reafirmada

**Resolve F06.**

`docs/04` §4 já diz: nenhum hex fora de `index.css`. O produto tem 33 violações, 22 delas nos
mapas clínicos. A correção é tokenizar as cores clínicas como as de gráfico já foram na
Subetapa 02.12:

```css
:root {
  --mapa-fundo:        var(--card);
  --mapa-traco:        204 23% 91%;
  --mapa-selecionado:  var(--primary);
  --mapa-alteracao-1:  var(--destructive);   /* dano */
  --mapa-alteracao-2:  var(--warning);       /* atenção */
  --mapa-alteracao-3:  var(--success);       /* tratado */
}
```

Duas razões, e a segunda é a que importa comercialmente:
1. O mapa clínico hoje fica numa ilha branca no tema escuro.
2. **Identidade visual por conta** é item do backlog (`+1.0`). Enquanto houver hex cravado
   em componente, cada cor cravada é uma exceção que o cliente-filho não consegue mudar — e
   é exatamente esse o produto que Max vende.

---

## Resumo: o que esta camada entrega

| Muda | Custo | Mata os achados |
|---|---|---|
| Escala tipográfica de 7 degraus | 48 arquivos, mecânico | F01, F02, E05 (parcial) |
| Densidade em multiplicador de espaço | ~6 lugares | F02 |
| 7 cores de texto corrigidas | 1 arquivo | F03, F04 |
| Borda de input a 3:1 | 1 token | F05 |
| Escala de espaçamento de 4px | convenção | — (previne recaída) |
| Anel de foco `:focus-visible` | ~6 linhas | E04 (parcial) |
| Durações + `prefers-reduced-motion` | ~10 linhas | — |
| `tabular-nums` | 1 classe | D03 (parcial) |
| Tokenizar as cores clínicas | 2 arquivos | F06 |

**Peso adicionado ao bundle: zero.** Tudo é CSS, e a folha inteira do produto hoje tem 6,1 KB
gzip — há espaço de sobra para dobrar o número de tokens sem que a métrica se mexa.
