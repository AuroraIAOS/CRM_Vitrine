# 07 — Roteiro sugerido

Quatro ondas. Cada uma é entregável sozinha e deixa o produto melhor do que encontrou —
nenhuma depende de a seguinte acontecer.

**Isto é sugestão de ordem, não plano aprovado.** O que entra na Etapa 03 e em que subetapa é
decisão de Max, dentro de `docs/00_PLANO_E_CRITERIOS.md`. O critério usado aqui foi
**impacto visível ÷ risco de regressão**, e o risco é o que manda: as duas primeiras ondas
quase não podem quebrar nada, porque não tocam em lógica de negócio.

---

## Onda 1 — Fundação · risco quase nulo, impacto máximo

Nenhuma linha de lógica muda. Só token, escala e CSS.

| Item | Onde | Resolve |
|---|---|---|
| Escala tipográfica de 7 degraus, `rem` | `index.css` + varredura em 48 arquivos | **F01, F02**, E05 |
| 7 cores de texto corrigidas | `index.css` | **F03**, F04 |
| Borda de input a 3:1, separada da borda decorativa | `index.css` | F05 |
| Densidade em multiplicador de espaço | `index.css` + ~6 lugares | **F02** |
| Anel de foco `:focus-visible` | `index.css` | E04 (parcial) |
| Durações + `prefers-reduced-motion` | `index.css` | — |
| `tabular-nums` em coluna numérica | classe + Financeiro/KPIs | D03 (parcial) |
| Tokenizar as cores dos mapas clínicos | `mapas.ts`, `MapaClinico.tsx` | **F06** |

**Por que primeiro:** resolve três dos oito achados críticos, e é o único bloco em que o
trabalho de um item não atrapalha o de outro. A varredura tipográfica é o item longo — é
mecânica, mas são 637 substituições, e vale fazer módulo a módulo com `grep -c "text-\["`
como medidor de progresso.

**Critério de pronto:** `grep -roh "text-\[[0-9.]*px\]" src | wc -l` devolve `0`, e
`node design/ux/referencias/medir_contraste.mjs` sai com código `0`.

> ⚠️ **A varredura tipográfica muda o tamanho aparente de todas as 16 telas.** Vale regerar as
> capturas com `crm/scripts/capturar_telas.mjs` antes e depois, e olhar as duas séries lado a
> lado — é a única forma de pegar um layout que quebrou por causa do texto 20% maior.

---

## Onda 2 — Entrega e primeiros componentes · risco baixo

Aqui o produto começa a parecer outro, e fica mais leve de abrir.

| Item | Resolve | Nota |
|---|---|---|
| **Divisão por rota (`React.lazy`)** | — | ~20 linhas; devolve 120–165 KB do inicial |
| **Auto-hospedar as 5 faces de fonte** | — | tira requisição de terceiro do caminho crítico + item de LGPD |
| `Skeleton` nas 24 telas com "Carregando…" | **E01** | CSS puro |
| `EmptyState` em 3 partes | E03 | |
| `PageHeader` + fim do `aba_` na navegação | **N01**, N02, N04 | mapa de 9 linhas + agrupamento em 4 |
| `Avatar` com iniciais e cor | T04 | |
| `StatusIndicator` (conexão do WhatsApp, motor, IA) | M03 | serve a 3 telas |

**Por que aqui:** a divisão por rota abre o orçamento que a Onda 3 vai gastar, e as quatro
peças de UI são todas sem dependência. O fim do `aba_` é a mudança de menor custo e maior
efeito comercial do dossiê inteiro.

---

## Onda 3 — Os dois defeitos que quebram o trabalho · risco médio

As duas telas em que o produto hoje falha em operação real. Cada uma é uma entrega própria.

### 3a — Agenda

| Item | Resolve |
|---|---|
| Alocação de colunas por colisão | **A01** |
| Linha do "agora" | A02 |
| Legenda de profissional que filtra | A03 |
| Horário de funcionamento por conta + fim de semana colapsado | A04 |

O algoritmo está pronto e testado em `referencias/alocar_colunas.mjs` — os seis casos passam.
O trabalho aqui é de integração, não de invenção.

### 3b — Mensagens

| Item | Resolve |
|---|---|
| Indicador de janela de 24h na lista e no compositor | **M02** |
| Pré-selecionar a conversa mais recente | M01 |
| Filtros de triagem | M04 |

**Risco médio, e a razão é honesta:** as duas telas têm lógica de dado real (sobreposição de
horário com `btree_gist`, janela da Meta). Mexer nelas pede a suíte de RLS rodando antes e
depois, e o cuidado de `handoffs/instrucoes.md` sobre teste com data futura.

---

## Onda 4 — Os caminhos · risco médio, maior retorno de tempo por dia

| Item | Resolve | Depende de |
|---|---|---|
| **Busca global + `⌘K`** | **N03** | `Dialog` (onda 2 de `03`), `cmdk` |
| Toast + desfazer | E02 | `sonner` |
| `DataTable` completo — busca, filtro, ordenação, densidade | T01, T05 | primitivas Radix |
| Barra de ações em massa | T02 | `DataTable` |
| KPI clicável com *drill-down* | D01, D02 | filtro por URL nas listas |
| Card de negócio com tempo-na-etapa + motivo de perda | K01, K02, K03 | `DropdownMenu` |
| Ficha de pessoa com ações rápidas | E03 | — |
| Atalhos de teclado + `?` | E04 | — |

**A busca global é o item de maior retorno do dossiê inteiro** e o único que exige tocar no
banco (a coluna gerada de dígitos do telefone, `05_CAMINHOS.md` §1). Se só uma coisa desta
onda for feita, que seja ela.

---

## Fora de onda — as duas lacunas que precisam de sessão própria

| | Por quê |
|---|---|
| **Responsividade e móvel** | `docs/04` §5.3 deixou explicitamente em aberto abaixo de 1280px, o `vite-plugin-pwa` já está instalado, e o perfil "Meu dia" (tela `1n`) é o caso de uso móvel óbvio. É a maior lacuna deste dossiê. |
| **Tema escuro medido** | As correções de contraste de `02` §3 valem só para o tema claro. O bloco `.dark` nunca foi medido, e o script já existe para medi-lo. |

---

## Se houver tempo para uma coisa só

**A Onda 1.** Ela sozinha resolve três dos oito achados críticos, não pode quebrar
funcionalidade, e é a que muda mais a percepção de "isto é um produto" por unidade de esforço.
Todo o resto do dossiê fica melhor depois dela — inclusive os componentes novos, que nascem
já na escala certa em vez de precisarem ser refeitos.

E dentro da Onda 1, se for para escolher **uma linha**: a escala tipográfica (F01). É a
diferença entre uma maquete ampliada e um produto.
