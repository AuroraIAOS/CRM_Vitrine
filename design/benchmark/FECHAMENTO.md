# Fechamento do bench — análise final e preparação para o merge

Escrito em **2026-09-02**, ao término do trabalho de benchmark no bench `bench/benchmark-odonto`.

**O CODE não funde este bench em `main`** (`CLAUDE.md` §13). Este documento existe para que Max
decida com o quadro completo à vista — o que o merge traz, o que ele não toca, o que ainda está
aberto e o que merece ser lido antes.

---

## 1. O que foi produzido

| | |
|---|---|
| **Documentos** | 14 arquivos `.md`, ~31 mil palavras |
| **Referências visuais** | **61** — 34 dos concorrentes, 14 capturas de Max, 13 mosaicos de vídeo |
| **Scripts reprodutíveis** | 3 — `capturar.mjs` (sites), `assistir.mjs` (vídeos), `frames_video.mjs` (quadros em alta) |
| **Fontes estruturadas** | 4 — `MVP.xlsx`, `FUTURO.xlsx`, `SIGTAP.xlsx`, `procedimentos.txt` |
| **Concorrentes fichados** | 8 — 5 brasileiros (com os 3 mais vendidos) e 3 internacionais |
| **Vídeos assistidos** | 56 públicos, de 61 enumerados |
| **Repositórios avaliados** | 4, com licença lida e peso medido |

### As três rodadas

| Rodada | Data | O que respondeu |
|---|---|---|
| 1 | 2026-08-31 | **o que o mercado vende e por quanto** — páginas públicas, preços, termos de uso, normas |
| 2 | 2026-09-01 | **como o produto funciona por dentro** — 56 vídeos, 4 repositórios, 14 capturas, acervo de gestão pública |
| 3 | 2026-09-02 | **o que disso vira nosso MVP** — revisão do §5 (c) por Max: numeração refeita, duplicações fundidas, 5 itens reclassificados |

---

## 2. O que o merge traz — e a surpresa que ele carrega

`git diff main...bench/benchmark-odonto` = **118 arquivos, 9.397 inserções, 1 deleção**.

**O bench carrega três coisas, não uma.** Ele nasceu de `bench/pesquisa-ux`, que nunca foi
fundido — então o merge traz também o trabalho anterior:

| O que vem | Volume | Situação |
|---|---|---|
| **`design/benchmark/`** — este trabalho | 14 docs, 61 capturas, 3 scripts, 4 fontes | o objeto do bench |
| **`design/ux/`** — dossiê de UX e as 3 versões | 11 docs, 19 capturas, protótipo, `app.js` | **do bench anterior, nunca fundido** |
| **`CLAUDE.md` §8** | 7 linhas | **edição do próprio Max** — o vocabulário de quatro status (CONCLUÍDA / ADIADA / PENDENTE / ABANDONADA), que estava na árvore sem commit e foi commitada no C0 da rodada 2 |

**A deleção única** é a linha antiga do `CLAUDE.md` §8, substituída pelos quatro status.

**Fora de `design/` e `CLAUDE.md`, nada é tocado.** Nem `crm/`, nem `db/`, nem `supabase/`, nem
`docs/`, nem `handoffs/`. Verificável:

```bash
git diff --name-only main...bench/benchmark-odonto -- . ':!design/' ':!CLAUDE.md'   # sai vazio
```

**Isso importa para a decisão:** fundir este bench é fundir também o dossiê de UX. Se Max quiser
separar as duas coisas, dá — mas exige dois merges e uma reordenação de commits, e não há motivo
técnico para isso: os dois trabalhos são documentação, nenhum toca o produto.

---

## 3. O que este trabalho mudou de fato

Cinco conclusões que não existiam antes e que mudam decisão:

**1. A maior lacuna do produto não era a que pensávamos.** Entramos procurando o odontograma;
saímos sabendo que ele é o *meio* de uma corrente — catálogo → odontograma → **orçamento** →
financeiro — e que **o orçamento é o elo que falta e o mais crítico**. Sem ele, o odontograma não
tem onde escrever. Esse achado reordenou o MVP inteiro.

**2. O flanco jurídico é vantagem construída e não usada.** A Lei 13.787/2018 exige guarda de
20 anos; o termo do líder de mercado prevê eliminar dado de paciente 30 meses após bloqueio, sem
backup. O segundo colocado hospeda dado sensível de saúde brasileiro nos EUA por prazo
indeterminado. O Vitrine já tem `aba_health` com IBAC, `log_acesso` obrigatório em leitura **e**
escrita e consentimento de imagem — e não usa nada disso como argumento comercial.

**3. Três coisas que julgávamos faltar já estão no banco:** controle de cadeiras
(`aba_scheduling.recursos`), consentimento de imagem e comissão. São as melhorias mais baratas do
MVP — custo de tela, não de schema.

**4. O mercado inteiro esconde o preço da IA**, e a faixa observada é R$ 180–437/mês. Publicar é
diferencial de posicionamento com custo zero.

**5. O item 24 é cirurgia, não recurso.** Multiunidade parece tela e é núcleo: `profiles` tem
`user_id UNIQUE` e `access.can()` resolve a conta sem parâmetro. Descobrir isso **antes** de
planejar vale mais que qualquer outra linha deste relatório.

---

## 4. Onde os critérios de qualidade morderam

O plano fixou regras antes de começar. Vale registrar onde elas mudaram o resultado — é o que
justifica repeti-las na próxima etapa:

| Regra | Onde mordeu |
|---|---|
| **Licença antes de recomendação** | pegou o `TOOL_HOF_drarayssa`, que **não tem licença** — teria virado recomendação de adoção |
| **Peso medido, não estimado** | o odontograma parecia adotável; 426 KB gzip medidos contra 284 KB do bundle inteiro mudaram a recomendação para "só atrás de rota preguiçosa" |
| **`[declarado]` ≠ `[verificado]`** | manteve separado o que o fornecedor promete do que aparece funcionando na tela |
| **Preço sem página pública = "sob consulta"** | Curve Dental e Dentrix Ascend continuam sem preço no relatório, e o valor de terceiro está rotulado como tal |
| **Nenhuma norma citada de memória** | Lei 13.787 lida no Planalto, CFO lido no texto do conselho, SBIS lido no site da entidade |
| **Test-first no diagnóstico (`CLAUDE.md` §11)** | cinco incompatibilidades do `/watch` foram medidas antes de escritas — a primeira hipótese ("YouTube bloqueou") estava errada; a causa era cliente de extração |
| **"O Vitrine já tem?" nunca de memória** | conferido nas 39 migrations; produziu os achados 3 e 5 acima |

---

## 5. O que fica em aberto

**Nada bloqueia o merge.** O que segue são decisões e pendências, não defeitos:

1. **A escolha da versão de UX** continua com Max. O benchmark reforçou a Versão 03, e a §7 do
   `RELATORIO.md` lista os cinco acréscimos que ela precisa (orçamento, odontograma, alertas
   clínicos, consentimento visível, cota de mensagem).
2. **As 30 diretrizes de `DIRETRIZES_FORA_DO_BENCHMARK.md`** aguardam destino em `docs/`,
   `CLAUDE.md` e `handoffs/`. Nenhuma foi aplicada — todas têm endereço sugerido.
3. **1 vídeo sem quadros** (CF22, bloqueado por PO token do YouTube) e **5 privados**. Declarado
   em `VIDEOS.md`.
4. **21 dos 55 mosaicos não foram abertos quadro a quadro** — a transcrição já os situava como
   repetição. Onde só há transcrição, o texto diz `[declarado]`.
5. **O `procedimentos.txt` e o `SIGTAP.xlsx` se sobrepõem parcialmente.** O primeiro tem 84 nomes
   da Atenção Básica; o segundo, 64 procedimentos com código, local e quantidade máxima. Consolidar
   os dois numa semente única é trabalho da etapa de implementação, não deste bench.

---

## 6. Checklist para o merge

Para Max conferir antes de ordenar:

```bash
# 1. Nada fora de design/ e CLAUDE.md
git diff --name-only main...bench/benchmark-odonto -- . ':!design/' ':!CLAUDE.md'

# 2. O produto está intocado
git diff --stat main...bench/benchmark-odonto -- crm/ db/ supabase/ docs/ handoffs/

# 3. O volume
git diff --stat main...bench/benchmark-odonto | tail -1

# 4. Os 11 commits, todos docs:/chore:
git log --format="%h %s" main..bench/benchmark-odonto

# 5. Nenhum segredo entrou
gitleaks detect --source . --report-format json -v --redact
```

**Depois do merge, três coisas ficam pendentes de decisão de Max:**

1. **A sessão do Plano de Ação do MVP** — o handoff está pronto em
   [`HANDOFF_PLANO_MVP.md`](HANDOFF_PLANO_MVP.md).
2. **Distribuir as 30 diretrizes** de `DIRETRIZES_FORA_DO_BENCHMARK.md` para seus destinos.
3. **Registrar o benchmark em `docs/00_PLANO_E_CRITERIOS.md`** com o status apropriado
   (`CLAUDE.md` §8) e uma linha em `CHANGELOG.md` se Max julgar que muda algo para quem usa o
   produto — este bench não muda, é documentação.

---

## 7. Parecer

O trabalho está completo em relação ao que foi pedido nas três rodadas, e verificável: cada preço
tem link e data, cada norma tem artigo e fonte oficial, cada peso foi medido com o comando que o
produziu, cada captura tem procedência, e os três scripts refazem a coleta do zero.

**Parecer favorável ao merge**, com a ressalva do §2: ele traz junto o dossiê de UX do bench
anterior, que é trabalho legítimo e nunca fundido, mas que Max talvez não esperasse encontrar
neste merge.

**O CODE entrega o parecer e para.** Ordenar o merge é atribuição exclusiva de Max
(`CLAUDE.md` §13).
