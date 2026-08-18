# 04_DESIGN_E_MARCA — CRM Vitrine

## 1. Sistema base: herdado do Maximus

O CRM Maximus já tem um sistema funcional de modo Light/Dark + cor de destaque configurável. Reaproveitar integralmente: tokens de cor (CSS variables), toggle de tema, persistência de preferência por usuário. Não redesenhar do zero — é peça pronta e testada.

## 2. O que muda: layout configurável por CRM-filho

O objetivo do CRM Vitrine não é ter uma única cara, é ter **múltiplos templates de layout** que um clone pode escolher:

- Distribuição de sidebar (esquerda fixa, colapsável, top-nav).
- Densidade de grade/containers de conteúdo (compacto vs. espaçoso).
- Paleta de destaque por cliente (herdada do sistema Light/Dark do Maximus, estendida a mais de uma cor de marca).
- Tipografia e logomarca por cliente.

## 3. `design/` — o que vive aqui

Arquivos-fonte de marca: paletas, tipografias, logos, guias de identidade visual. Max aloca aqui referências e explorações de múltiplos templates de configuração à medida que forem surgindo — este documento descreve as diretrizes gerais; `design/` guarda os arquivos.

## 4. Regras de aplicação

- Tema (light/dark) e cor de destaque: variável de conta, não hardcoded em componente.
- Layout (sidebar/grid): variável de conta, resolvida em tempo de carregamento — não exige rebuild por cliente.
- Logomarca: upload via Storage do Supabase, referenciada por conta.
- Nenhuma decisão de design aqui bloqueia o MVP — o v01 pode nascer com um único template padrão; a seleção de múltiplos templates é evolução natural (`+1.0`), não pré-requisito de lançamento.

## 5. Identidade visual ratificada (pacote de wireframes, 2026-08-18)

Max fechou o design do MVP no Claude Design (`design/wireframes-crm-sa-de-e-est-tica/`, 16 telas) e considera esta etapa concluída — os valores abaixo são a paleta/tipografia real extraída das 16 telas (não dos dois `_ds/*` do pacote, que não foram usados — ver `docs/01_ARQUITETURA.md` §7.5), e valem como o template padrão v01 citado no §4 acima.

### 5.1 Tipografia
- **UI geral:** `IBM Plex Sans`, pesos 300/400/500/600.
- **Metadado/label/número tabular:** `IBM Plex Mono`, pesos 400/500 — uso deliberado como "vocabulário de metadado" (eyebrows de KPI, breadcrumb, timestamp, cabeçalho de tabela, hora da agenda).

### 5.2 Paleta (hex reais, extraídos das 16 telas)
| Papel | Cor | Uso |
|---|---|---|
| Fundo do canvas | `#eef1f2` | fora do shell (referência de documentação) |
| Fundo do shell/card | `#ffffff` | cards, sidebar, header |
| Fundo de área de conteúdo | `#f4f6f7` | painel de navegação, colunas secundárias |
| Borda de card | `#e4eaee` | toda borda de card |
| Borda de input/divisor forte | `#dde4e8` | inputs, botões outline, separadores |
| Hairline | `#eef2f4` / `#f4f6f7` | linha entre itens de lista/tabela |
| Texto primário | `#26313a` | título, valor de KPI, nome |
| Texto secundário | `#41535f` | corpo de texto |
| Texto muted | `#7c8b95` / `#8b98a2` | legenda, texto de apoio |
| Texto faint/placeholder | `#9aa8b1` / `#a8b6bf` | eyebrow mono, placeholder |
| **Accent/primary (azul clínico)** | `#3d7396` botão/link · `#2b5f80` texto sobre tint · `#e8eff4` tint de fundo · `#5b87a8` série 1 de gráfico | ação primária, estado ativo, cor 1 de profissional |
| **Sucesso/positivo (sage)** | `#8fb4a6` · tint `#eef4f1` · texto `#4d7c69` · delta `#5f8f7a` | "Ativo", "Confirmado", variação positiva |
| **Atenção/pendente (tan-dourado)** | `#c8b79a` · tint `#faf6ef` · texto `#8a7550` | "Rascunho", "Aguarda" |
| **Perigo/vencido (terracota)** | `#a8827a` · tint `#f8f0ee` · texto `#9c6b5e` | "Vencido", alerta clínico, "Perdido" |
| Série extra de gráfico | `#cfdde6` | 4ª fatia/"outros" em donut |

### 5.3 Espaçamento, radius, sombra
- **Radius:** 3px (checkbox/swatch) · 4–5px (botão/input/chip) · 6px (nota/card aninhado) · **7–8px é o padrão de card** · 999px (pill/avatar/badge).
- **Espaçamento:** gap 6–14px dentro de card, padding de card 12–16px. Sem escala tokenizada formal — seguir os valores observados por analogia ao adicionar componente novo.
- **Sombra:** praticamente ausente — cards se separam por borda 1px, não por elevação. Reservar sombra só para overlay/modal.
- **Canvas de referência:** 1280×820px é convenção de documentação do wireframe, não breakpoint real — responsividade abaixo de 1280px fica em aberto para a Etapa 02 decidir caso a caso.

### 5.4 Biblioteca de ícones
`lucide-react` — já em uso no código real (`crm/src/app/AppShell.tsx`), sem contradição com o wireframe (que usa placeholders geométricos, sem especificar biblioteca).

### 5.5 Padrões de componente recorrentes (mapear para shadcn/Radix na Etapa 02)
Card de KPI (eyebrow mono + valor 24-26px + delta colorido) · tabela com paginação/seleção múltipla (header mono uppercase, checkbox 13px, avatar circular 24px, kebab menu — nota do próprio wireframe cita **TanStack Table**) · badge/tag pill (4 famílias semânticas: neutro/sucesso/atenção/perigo) · timeline de eventos (coluna de data mono fixa + conteúdo) · barra de progresso linear (5-6px, radius 3px) · donut/pizza via SVG inline (`stroke-dasharray`) · gráfico de barras/linha via SVG inline (sem lib de gráfico) · kanban (colunas com header mono + cards arrastáveis) · calendário semanal em grid (gutter de hora 56px + colunas de dia, blocos por `grid-row` span, borda-esquerda 3px colorida por profissional) · chat em 3 painéis (bolha recebida `radius:8px 8px 8px 2px`, enviada `radius:8px 8px 2px 8px`) · editor de fluxo (cards de passo conectados verticalmente, cor por tipo: Gatilho azul/Condição sage/Ação tan) · toggle switch (trilho pill 26×14, thumb 2px de folga) · segmented control (Dia/Semana/Mês, Kanban/Lista — padrão mais repetido do pacote) · seletor de template de layout (grid 4-up de miniaturas, materializa visualmente as 4 opções do §2 acima).

**Gap conhecido, não bloqueia MVP:** os 4 mapas clínicos (odontograma/corporal/facial/acupuntura, tela `1p`) são placeholder SVG explícito no wireframe — arte de produção ainda não existe em lugar nenhum do repo. Fica registrado como pendência a resolver quando a tela de `aba_health` da Etapa 02 for construída (asset novo, não recriação do placeholder).
