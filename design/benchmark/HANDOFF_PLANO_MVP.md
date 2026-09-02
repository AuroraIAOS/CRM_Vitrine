# Handoff — abertura da sessão do Plano de Ação do MVP

Texto de abertura para a **próxima sessão**, cujo objetivo é transformar os **24 itens do MVP**
do [`RELATORIO.md`](RELATORIO.md) §5 (c) num Plano de Ação executável.

Escrito em **2026-09-02**, ao fim do trabalho de benchmark. Leia este arquivo **antes** de abrir
qualquer outro — ele diz o que já está decidido, o que ainda não está, e onde estão as armadilhas
que esta investigação já pagou para descobrir.

---

## 1. Onde o projeto está

| | |
|---|---|
| **Etapas 01 e 02** | concluídas e fundidas em `main` — schema aplicado, RLS testada, dois portões adversariais passados, produto no ar |
| **Dossiê de UX** | fechado em `design/ux/` — 7 documentos, protótipo e **três versões completas** de aplicação, aguardando escolha de Max |
| **Benchmark** | concluído em `design/benchmark/`, no bench `bench/benchmark-odonto` — **8 concorrentes, 56 vídeos, 4 repositórios, 61 referências visuais** |
| **O que falta para começar a construir** | (a) Max escolher a versão de UX; (b) Max ordenar o merge do bench; (c) **este Plano de Ação** |

**A sessão nova não implementa nada.** Ela produz o plano — subetapas, ordem, blocos `[Goal]`
com critério de qualidade, evidência, teto de tentativas e escalonamento —, no formato de
`docs/00_PLANO_E_CRITERIOS.md`. A implementação é sessão posterior, e por etapa.

---

## 2. O que já está decidido, e não se rediscute

1. **O parecer de UX recomenda a Versão 03** (`design/ux/versoes/README.md`), reforçado pelo
   benchmark por caminho independente: o painel do líder de mercado também é lista de tarefas
   acionáveis, não de gráficos. **A escolha final continua sendo de Max.**
2. **A lista de 24 itens do MVP foi revisada e aprovada por Max em 2026-09-02.** As tabelas
   canônicas são [`fontes/MVP.xlsx`](fontes/MVP.xlsx) e [`fontes/FUTURO.xlsx`](fontes/FUTURO.xlsx).
   O `RELATORIO.md` §5 (c) é a transcrição delas.
3. **A faixa de preço e o posicionamento** estão em `RELATORIO.md` §6 — inclusive as cinco
   decisões comerciais que o benchmark sustenta.
4. **`CLAUDE.md` §15 continua valendo.** Os itens 29 e 30 (IA conversacional) estão em `+1.0`
   justamente por isso.

---

## 3. A espinha do MVP — a ordem não é livre

O benchmark achou uma corrente de dependência que **determina a ordem das subetapas**:

> **catálogo** (item 3 e 22: "aceita faces", unidade de lançamento, quantidade máxima) →
> **odontograma** (item 2) → **orçamento** (item 1) → **contrato e financeiro** (já existe)

Nada disso pode ser construído fora de ordem: o odontograma sem o catálogo marcado não sabe
quais procedimentos aceitam face; o orçamento sem odontograma não tem de onde receber dente e
face. **O item 1 (orçamento) é o mais crítico do MVP inteiro** — é o elo que falta e sem o qual
o produto não é odontológico.

Três blocos independentes desta corrente, que podem correr em paralelo:

- **Bloco token** — itens 7, 18, 19 e 23. Uma infraestrutura só (token rastreável, revogável,
  com expiração, mais tabela de tentativas com motivo enumerado) serve aos quatro. **Construir
  uma vez.** O padrão está pronto e depurado no CRM Sindcom.
- **Bloco tela sobre banco existente** — itens 6, 8, 11. São os mais baratos do MVP: o dado já
  está no banco, falta a interface.
- **Bloco conformidade e vigilância** — itens 20 e 21.

---

## 4. As cinco armadilhas que esta investigação já pagou

Não são hipóteses. Cada uma foi medida.

**1. O item 24 (multiunidade) é cirurgia no núcleo, não recurso de aplicação.**
`public.profiles` tem `user_id UUID NOT NULL UNIQUE` — um usuário pertence hoje a **exatamente
uma** conta. E `access.can()` resolve a conta com
`SELECT account_id, account_role FROM public.profiles WHERE user_id = auth.uid()`, **sem
parâmetro de conta**. O login em dois estágios exige remover essa UNIQUE e propagar a conta ativa
por toda a camada de autorização — a peça que `CLAUDE.md` §14 manda portar sem reescrever.
**21 arquivos de migration** tocam `profiles` ou `is_account_member`.
→ **Tratar como subetapa de núcleo, com portão adversarial próprio.** Não agrupar com recurso
de tela.

**2. O odontograma pronto pesa 1,5× o app inteiro.**
`react-advanced-odontogram` é MIT e serve, mas o núcleo tem **426 KB gzip medidos** contra os
**284 KB** do bundle inteiro do Vitrine. → **A divisão por rota de
`design/ux/06_ORCAMENTO_DE_PESO.md` vira pré-requisito da subetapa do odontograma**, não melhoria
posterior. E falta português entre os 11 idiomas: é trabalho de tradução técnica, não de
engenharia, mas é trabalho.

**3. Policy ausente em `storage.objects` não nega — faz sumir.**
Com RLS ligada e zero policies, o `authenticated` inteiro fica de fora e o erro é
**`"Object not found"`**, que parece arquivo inexistente e não permissão negada. Quem construir a
tela de leitura da caixa de entrada (item 18) sem saber disso perde horas caçando o arquivo
errado. Fonte: `CRM-Sindcom/sql/21_remessas_recepcao.sql`, medido lá.

**4. Freio de endpoint público conta por token, nunca pela entidade.**
Travar o *laboratório* permitiria a um atacante bloquear o envio de exames de uma clínica inteira
só errando token de propósito. O freio é por token, com motivo enumerado
(`token_inexistente` / `expirado` / `revogado` / `arquivo_invalido`).

**5. Falta um valor no enum, e ele custa caro.**
`aba_scheduling.agendamentos.status` não tem **`faltou`**. Sem esse valor não existe taxa de
falta — o KPI que todo concorrente põe em destaque, e que sustenta metade do valor da confirmação
automática por WhatsApp. É uma linha de migration com efeito desproporcional. **Fazer cedo**,
porque o painel (item 12) e a tabela de métricas (item 21) dependem dela.

---

## 5. O que o Plano de Ação precisa entregar

Formato de `docs/00_PLANO_E_CRITERIOS.md`, com um bloco `[Goal]` por subetapa:

- **Objetivo · Conclusão · Qualidade · Evidência · Esforço máximo · Escalonamento de LLM · Se
  esgotar.**
- **Ordem justificada**, respeitando a corrente do §3 e isolando o item 24.
- **Portões de segurança** onde a subetapa toca `aba_health`, o núcleo de permissão ou endpoint
  público — os três casos em que este projeto já teve achado real.
- **O que entra em `CHANGELOG.md`** por subetapa (`CLAUDE.md` §9).

E uma decisão que o plano precisa tomar explicitamente: **quais dos 24 itens entram na primeira
onda**. Vinte e quatro itens não são uma etapa — são um roteiro. Sugestão de recorte, a validar
com Max: a corrente catálogo→odontograma→orçamento (itens 1, 2, 3, 22), mais os três itens de
tela sobre banco existente (6, 8, 11), mais o enum do item 4. Os demais entram por onda.

---

## 6. Leitura obrigatória antes de planejar

| Ordem | Arquivo | Por quê |
|---|---|---|
| 1 | [`RELATORIO.md`](RELATORIO.md) §5 (c) | os 24 itens e as três ressalvas técnicas |
| 2 | [`DIRETRIZES_FORA_DO_BENCHMARK.md`](DIRETRIZES_FORA_DO_BENCHMARK.md) | as 30 diretrizes que pertencem a `docs/`, `CLAUDE.md` e `handoffs/` — muitas viram critério de qualidade das subetapas |
| 3 | [`fontes/REPOS.md`](fontes/REPOS.md) | licença e peso medido do odontograma |
| 4 | [`fontes/IDEIAS_MAX.md`](fontes/IDEIAS_MAX.md) | o padrão de token do Sindcom, com as três lições medidas |
| 5 | `design/ux/versoes/README.md` | a versão de UX escolhida define os arquétipos de tela |
| 6 | `docs/00_PLANO_E_CRITERIOS.md` | o formato do bloco `[Goal]` e as pendências vigiadas |

**Não é preciso reler os 56 vídeos nem as 61 capturas.** `VIDEOS.md` e os índices existem para
que a sessão de planejamento não precise refazer a investigação — se uma decisão de desenho pedir
a evidência visual, o índice diz qual arquivo abrir.

---

## 7. O que esta sessão **não** deve fazer

- **Não implementar.** Nem migration, nem tela, nem dependência no `package.json`.
- **Não escolher a versão de UX por conta própria** — é decisão de Max.
- **Não expandir `CLAUDE.md` §15.**
- **Não fundir bench em `main`** (`CLAUDE.md` §13).
- **Não reabrir a lista de 24 itens.** Ela foi revisada por Max em 2026-09-02. Se um item se
  mostrar inviável no planejamento, **reportar** — não remover.
