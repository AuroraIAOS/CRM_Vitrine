# 06 — Orçamento de peso

A restrição que Max deu — "melhorar o UX/UI sem pesar demasiadamente o código" — está certa e
é a razão de este documento existir. Mas ela só vira decisão quando há número. Este arquivo
mede o que existe hoje, mostra onde o peso está de fato, e dá o veredito de cada proposta do
dossiê.

**A conclusão, adiantada: o Vitrine não tem um problema de quantidade de código. Tem um
problema de entrega.** Há mais peso a devolver arrumando o que já existe do que todo o dossiê
consome.

---

## 1. Linha de base — medida, não estimada

```bash
cd crm && npx vite build
for f in dist/assets/*; do echo "$(basename $f) $(gzip -c $f | wc -c) gzip"; done
```

| Artefato | Bruto | Gzip |
|---|---|---|
| `index-*.js` | 1.060.706 B (1,06 MB) | **290.553 B (284 KB)** |
| `index-*.css` | 26.045 B | **6.101 B (6,0 KB)** |

E o achado que importa mais que os números: **é um único arquivo JS**. O próprio Vite avisa
no build:

```
(!) Some chunks are larger than 500 kB after minification.
    Consider: Using dynamic import() to code-split the application
```

Nenhuma divisão por rota, embora o `react-router-dom` esteja instalado e as 16 telas sejam
rotas separadas. **Quem abre a tela de login baixa a agenda, o prontuário, o editor de
automações e o agente de IA antes de digitar a senha.**

### O que isso significa para o CSS

A folha inteira do produto tem **6 KB gzip**. Toda a `02_FUNDACAO_VISUAL.md` — escala
tipográfica, tokens de densidade, cores corrigidas, anel de foco, durações, skeleton — é CSS.
Mesmo dobrando o número de tokens, essa métrica não se mexe de forma perceptível. **Não existe
razão de peso para hesitar em nada da camada de fundação.**

---

## 2. Onde o peso realmente está

Três frentes, em ordem de tamanho:

### a) O chunk único — a maior devolução disponível

Dividir por rota é uma mudança de ~20 linhas: trocar o import direto de cada página por
`React.lazy` + `<Suspense>`. As telas mais pesadas do produto por linhas de fonte são
justamente as menos usadas no primeiro minuto:

| Tela | Linhas | Quem abre no login |
|---|---|---|
| `ProntuarioPage` | 638 | ninguém |
| `PessoaFichaPage` | 448 | ninguém |
| `AgentePage` (IA) | 439 | ninguém |
| `EditorAutomacao` | 333 | ninguém |
| `MapaClinico` + `mapas` | ~400 | ninguém |

A estimativa honesta: o carregamento inicial deve cair de **~284 KB para algo entre 120 e
170 KB gzip**, com o resto chegando sob demanda. O intervalo é largo de propósito — o número
real depende de como as dependências se distribuem entre os chunks, e só a medição
responde. Mas mesmo a ponta pessimista devolve mais do que este dossiê inteiro consome.

Ordem sugerida: `React.lazy` por rota primeiro, e só depois, se necessário, `manualChunks`
para separar o vendor.

### b) As fontes — o ativo mais pesado do produto · [medido]

`crm/index.html` pede três famílias ao Google Fonts:

```
IBM Plex Sans:  300, 400, 500, 600
IBM Plex Mono:  400, 500
IBM Plex Serif: 300, 400, 500, 600
```

O CSS que volta tem **21,7 KB e 54 regras `@font-face`** (todos os subsets). Os arquivos
`latin` — os que o português usa — pesam assim, medidos um a um:

| Família | Peso | Bytes (woff2) | Usado no código? |
|---|---|---|---|
| IBM Plex Sans | 300 | 45.712 | **não** — `font-light` não aparece nenhuma vez |
| IBM Plex Sans | 400 | 45.712 | sim (padrão do corpo) |
| IBM Plex Sans | 500 | 45.712 | sim — 147 usos de `font-medium` |
| IBM Plex Sans | 600 | 45.712 | sim — 16 usos de `font-semibold` |
| IBM Plex Mono | 400 | 14.708 | sim |
| IBM Plex Mono | 500 | 14.888 | sim |
| IBM Plex Serif | 300 | 20.160 | só se a conta escolher serifa |
| IBM Plex Serif | 400 | 19.580 | idem |
| IBM Plex Serif | 500 | 20.308 | idem |
| IBM Plex Serif | 600 | 20.516 | idem |
| | **Total declarado** | **293.008 B (286 KB)** | |
| | **Realmente usado (config. padrão)** | **166.732 B (163 KB)** | |

**Uma ressalva importante, para o número não ser lido pior do que é:** o navegador só baixa
um arquivo de fonte quando algum glifo precisa dele. As quatro faces de serifa e o peso 300
ficam *declarados* mas não são transferidos numa conta que use a tipografia padrão. Então o
desperdício **não** é de 123 KB de download.

O que de fato se paga hoje é outra coisa, e é real:

1. **Uma requisição de terceiro bloqueando o primeiro desenho.** O `<link rel="stylesheet">`
   para `fonts.googleapis.com` está no caminho crítico: DNS + TLS + requisição antes de a
   página poder pintar. Os dois `preconnect` ajudam, mas não eliminam a ida.
2. **21,7 KB de CSS**, dos quais só ~10 regras interessam ao português.
3. **163 KB de fonte** na primeira visita — mais da metade do JS, e ninguém repara porque
   fonte não aparece no aviso do bundler.

**Recomendação: auto-hospedar as cinco faces usadas** (Sans 400/500/600 + Mono 400/500),
servir a serifa só quando a conta pedir, e `preload` nas duas mais críticas (Sans 400 e 500).
Elimina a requisição de terceiro do caminho crítico, elimina o CSS de 21,7 KB, e o peso 300
some do mapa.

#### E há um argumento que não é de performance

O Tribunal Regional de Munique (LG München I, 3 O 17493/20, 20/01/2022) condenou um site por
embutir Google Fonts remotamente: carregar a fonte transmite o **IP do visitante** ao Google
sem base legal, e o tribunal recusou o "interesse legítimo" justamente porque existe
alternativa gratuita e equivalente — hospedar o arquivo. Reguladores da Holanda, Áustria e
Bélgica sinalizaram concordância com o raciocínio.

O Vitrine é um CRM que trata **dado de saúde** sob a LGPD, com um schema de regime mais
restritivo por decisão de projeto (`CLAUDE.md` §5). Auto-hospedar fonte é o tipo de item que
custa meia hora e some de qualquer questionário de conformidade — e que fica caro de
explicar se aparecer numa auditoria de cliente corporativo. Vale registrar em
`docs/05_COMPLIANCE_E_ETICA.md`, não só aqui.

### c) As dependências — bem escolhidas, e vale dizer isso

O `package.json` está **enxuto para um CRM**. Não há biblioteca de gráfico, não há biblioteca
de animação, não há framework de componente pesado. Os gráficos são SVG inline, que é a
decisão certa e economiza os 90–120 KB gzip que um `recharts` custaria. `date-fns` e
`lucide-react` são grandes no disco mas *tree-shakable*, e o código importa ícone por ícone —
que é o uso correto.

**Não há gordura a cortar aqui.** O peso está no chunk único e nas fontes.

---

## 3. Veredito por proposta do dossiê

| Proposta | Peso adicionado | Veredito |
|---|---|---|
| Escala tipográfica, tokens, cores, foco, movimento (`02`) | ~0 (CSS) | ✅ fazer |
| `Skeleton`, `EmptyState`, `PageHeader`, `Avatar` (`03` onda 1) | ~0 (`.tsx` local) | ✅ fazer |
| Algoritmo de colisão da agenda (`04` §4) | ~1 KB (40 linhas) | ✅ fazer |
| 7–8 primitivas Radix (`03` onda 2) | ~35–50 KB gzip | ✅ fazer, uma por vez |
| `sonner` (toast + desfazer) | ~5–8 KB gzip | ✅ fazer |
| `cmdk` (paleta de comandos) | ~5 KB gzip | ✅ fazer |
| Busca global (`05` §1) | ~0 no cliente | ✅ fazer |
| **Divisão por rota** | **−120 a −165 KB no inicial** | ✅ **fazer primeiro** |
| **Auto-hospedar fontes** | −1 requisição de terceiro, −21,7 KB CSS | ✅ fazer |
| Biblioteca de gráfico | +90–120 KB gzip | ❌ recusar — SVG inline já resolve |
| Biblioteca de calendário | +60–200 KB gzip | ❌ recusar — 40 linhas resolvem |
| `framer-motion` | +40–55 KB gzip | ❌ recusar — `tailwindcss-animate` já está lá |
| Date picker | +25 KB gzip | ❌ recusar — `<input type="date">` + `date-fns` |
| Biblioteca de ícone adicional | qualquer | ❌ recusar — `lucide-react` cobre |

### O saldo

```
Dossiê inteiro implementado          +40 a +60 KB gzip
Divisão por rota                    −120 a −165 KB no carregamento inicial
Fontes auto-hospedadas              −1 requisição bloqueante, −21,7 KB de CSS
                                    ─────────────────────────────────────────
Saldo no carregamento inicial        NEGATIVO — o produto abre mais rápido
                                     e mais completo ao mesmo tempo
```

---

## 4. As quatro regras que mantêm o orçamento

1. **Antes de instalar, perguntar o que ela substitui.** Se a resposta for "50 linhas de CSS",
   a resposta é não. Se for "acessibilidade de teclado, foco preso e posicionamento", como no
   caso das primitivas Radix, a resposta é sim.
2. **Uma dependência por vez, medindo antes e depois.** `rollup-plugin-visualizer` é
   `devDependency` — custa zero em produção e transforma a discussão de opinião em número.
3. **Nada de biblioteca de gráfico. Nunca.** É a decisão de arquitetura mais valiosa que o
   projeto já tomou nesta frente, e a que mais tenta se desfazer sozinha na primeira vez que
   alguém quiser um gráfico "só um pouco mais complicado".
4. **Orçamento explícito, para a conversa não recomeçar do zero:**

   | Métrica | Hoje | Teto proposto |
   |---|---|---|
   | JS inicial (gzip) | 284 KB | **180 KB** |
   | CSS (gzip) | 6,0 KB | **15 KB** |
   | Fonte na primeira visita | 163 KB + requisição de terceiro | **170 KB, auto-hospedada** |
   | Chunks | 1 | **1 inicial + 1 por rota** |

   Teto estourado é conversa, não bloqueio — mas é uma conversa que precisa acontecer no
   momento em que estoura, e não seis meses depois.

---

## 5. Como refazer estas medições

```bash
# bundle
cd crm && npx vite build && for f in dist/assets/*; do
  echo "$(basename $f)  $(gzip -c "$f" | wc -c) bytes gzip"; done

# tamanhos de fonte cravados (F01)
grep -roh "text-\[[0-9.]*px\]" src | sort | uniq -c | sort -rn

# cores fora do arquivo de tokens (F06)
grep -rn --include=*.tsx --include=*.ts -oE "#[0-9a-fA-F]{3,8}\b" src | grep -v index.css

# contraste da paleta
node ../design/ux/referencias/medir_contraste.mjs

# atribuição por dependência (precisa do plugin)
npm i -D rollup-plugin-visualizer   # + visualizer({gzipSize:true}) em vite.config.ts
```
