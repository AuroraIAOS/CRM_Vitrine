# design/ux/ — Dossiê de UX/UI do CRM Vitrine

Pesquisa e curadoria produzidas em **2026-08-23**, no bench `bench/pesquisa-ux`, a pedido de Max.

**Este dossiê não altera o produto.** Nenhum arquivo fora desta pasta foi tocado: o app em
`crm/`, as migrations, o Supabase e o subdomínio no ar seguem exatamente como estavam.
O que existe aqui é matéria-prima de decisão — o que implementar, e em que ordem, continua
sendo escolha de Max (`CLAUDE.md` §13).

## Como este dossiê foi construído

Três fontes, nesta ordem de peso:

1. **Medição do produto real.** Onde havia como medir, mediu-se, em vez de opinar
   (`CLAUDE.md` §11). Contraste WCAG de toda a paleta ratificada, inventário de tamanhos
   de fonte no código, e o peso real do bundle de produção. Os números aparecem com o
   comando que os produziu, para poderem ser refeitos.
2. **As 16 capturas de tela** de `screenshots/` (geradas em 2026-08-22, tema claro, conta
   de demonstração) e o código de `crm/src/`.
3. **Referência externa** — CRMs comerciais de Brasil, Europa e EUA, design systems
   públicos e verticais de saúde/estética. Catálogo em `referencias/CATALOGO.md`.

## Ordem de leitura

| # | Arquivo | O que responde |
|---|---|---|
| 1 | [`01_DIAGNOSTICO.md`](01_DIAGNOSTICO.md) | O que hoje separa o Vitrine de um CRM comercial. 24 achados numerados, com evidência e severidade. |
| 2 | [`02_FUNDACAO_VISUAL.md`](02_FUNDACAO_VISUAL.md) | Tipografia, densidade, contraste, foco, movimento. A camada que conserta muita coisa de uma vez. |
| 3 | [`03_COMPONENTES.md`](03_COMPONENTES.md) | Os componentes que faltam, priorizados por impacto ÷ custo, com o peso de cada um. |
| 4 | [`04_PADROES_DE_TELA.md`](04_PADROES_DE_TELA.md) | Receita por arquétipo: lista, ficha, kanban, agenda, caixa de entrada, dashboard, formulário. |
| 5 | [`05_CAMINHOS.md`](05_CAMINHOS.md) | Fluxos e funcionalidades que CRM profissional tem e o Vitrine ainda não. |
| 6 | [`06_ORCAMENTO_DE_PESO.md`](06_ORCAMENTO_DE_PESO.md) | A restrição de Max tratada com número: o que cabe, o que não cabe, e o que já está sobrando. |
| 7 | [`07_ROTEIRO.md`](07_ROTEIRO.md) | Sequenciamento em 4 ondas, com esforço e o que cada onda desbloqueia. |
| — | [`referencias/CATALOGO.md`](referencias/CATALOGO.md) | Os produtos e design systems consultados, e o que copiar de cada um. |
| — | [`prototipo.html`](prototipo.html) | Protótipo autocontido (abrir no navegador). Renderiza as propostas em claro e escuro. |

## As três conclusões, se você só ler esta página

**1. O maior problema visual do Vitrine não é a paleta — é o tamanho do texto.**
Há **637 tamanhos de fonte cravados em pixel** no código, em **17 valores diferentes**,
sendo os dois mais frequentes 11px (169×) e 10,5px (134×). Nenhum design system sério
desce abaixo de 12px para texto de leitura. É isso, mais que qualquer outra coisa, que faz
as telas parecerem um wireframe ampliado em vez de um produto. Corrigir é mecânico:
17 valores viram uma escala de 7 degraus em `rem`. Não custa peso nenhum — a folha de
estilo inteira tem 6,1 KB gzip.

**2. O seletor de densidade que já está no ar não funciona como anunciado.**
`[data-density="compact"]` muda o `font-size` da raiz para 14px. O espaçamento do Tailwind
é em `rem` e encolhe; os 637 tamanhos em `px` não encolhem. O modo compacto, portanto,
aperta o espaço em volta de um texto que continua do mesmo tamanho — o oposto de uma
escala de densidade. É um defeito de funcionalidade vendida, não de gosto.

**3. Melhorar o UX aqui não exige engordar o código: exige entregá-lo melhor.**
O build de produção de hoje é **um único chunk de 1,06 MB (291 KB gzip)**, sem nenhuma
divisão por rota, embora o `react-router` já esteja instalado. Dividir por rota devolve
mais orçamento do que qualquer componente novo deste dossiê consome. Detalhe e números
em `06_ORCAMENTO_DE_PESO.md`.

## O que este dossiê deliberadamente não faz

- **Não propõe biblioteca nova de gráfico, de animação ou de calendário.** A restrição de
  Max é explícita e o dossiê a respeita — todas as propostas cabem em CSS, SVG inline e nos
  pacotes que já estão no `package.json`.
- **Não redesenha a paleta.** A paleta de `docs/04` §5.2 foi ratificada por Max e é boa.
  As correções propostas são de contraste, dentro do mesmo matiz — nenhuma cor nova.
- **Não mexe em RLS, permissão ou regra de negócio.** Tudo aqui é camada de apresentação.
  A régua de acesso continua sendo `access.can()`/RLS, nunca o front (`docs/01` §7.3).
