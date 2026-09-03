# HANDOFF_PLANO_MVP — CRM Vitrine

Ponte do **benchmark concluído** (`design/benchmark/`, fundido em `main` em 2026-09-02) para a
**Etapa 03**, cujo objetivo é fechar o MVP odontológico, escolher a UX e passar pelo portão
adversarial.

Escrito em **2026-09-02**. Substitui `design/benchmark/HANDOFF_PLANO_MVP.md`, que era rascunho
feito ainda dentro do bench e **está superado em dois pontos** — ver §8.

**A sessão que abrir por este documento não implementa nada.** Ela produz o **Plano de Ação**:
subetapas, ordem, blocos `[Goal]` com objetivo, conclusão, qualidade, evidência, teto de
tentativas e escalonamento de LLM, no formato de `docs/00_PLANO_E_CRITERIOS.md`.

---

## Estado atual

**MVP v01 no ar, e o benchmark fechado.** `main` = `141b2f7`, 72 commits.

- **Produção:** https://vitrine.strategicepiphany.com — PWA estático, deploy por
  `crm/scripts/deploy_ftp.mjs`.
- **Banco:** 12 schemas, 80 tabelas, 39 migrations, 5 jobs `pg_cron`, 5 Edge Functions.
- **Suíte de segurança:** 19 arquivos, 186 casos. Dois portões adversariais passados (01.8 e 02.15).
- **Os 9 módulos têm UI** — 16 rotas reais em `crm/src/app/router.tsx`.
- **Benchmark:** `design/benchmark/` — 8 concorrentes, 56 vídeos, 4 repositórios, 61 referências
  visuais, 15 documentos.
- **Dossiê de UX:** `design/ux/` — 7 documentos, protótipo e **três versões completas** com 19
  capturas, aguardando escolha.

**Detalhe que muda o enquadramento de tudo abaixo:** a Etapa 03 **não constrói do zero** — ela
acrescenta recursos a um produto que já funciona, com todos os módulos no ar. É por isso que a
decisão de Max de deixar a UX para depois do MVP faz sentido: há uma interface funcionando para
receber os recursos novos.

---

## O roteiro de sete etapas (decidido por Max em 2026-09-02)

| # | Etapa | Escopo deste plano? |
|---|---|---|
| 1 | **Reestabelecer a uniformidade do trabalho e do repositório** | ✅ sim |
| 2 | **Implantar as 24 decisões e fechar o MVP** (backend, frontend e comunicação externa) | ✅ sim |
| 3 | **Escolher e implantar a UX** — a "maquiagem final" | ✅ sim |
| 4 | **Teste adversarial do MVP** | ✅ sim |
| 5 | Teste em campo com profissionais e universitários, com questionário antes/depois | ❌ plano futuro |
| 6 | Lançamento: níveis de produto (Bronze/Prata/Ouro/Diamante), preço, site, Instagram, e-mail marketing | ❌ plano futuro |
| 7 | Versionamentos futuros (os 9 itens de `RELATORIO.md` §5 c → Futuro) | ❌ plano futuro |

**O Plano de Ação a ser escrito cobre as Etapas 1 a 4.** As demais são citadas aqui só para que o
plano não tome decisão que as inviabilize — em especial a Etapa 6, que depende de o produto ter
**módulos ligáveis e desligáveis por nível de plano** (ver §7, decisão D3).

---

## Etapa 1 — Reestabelecer a uniformidade (três tarefas)

Pequena, mas é pré-requisito: ela põe o material do bench nos lugares onde as sessões futuras vão
procurá-lo.

1. **Este arquivo já foi movido** para `handoffs/`, no commit que o criou. Resta **apagar ou
   redirecionar** `design/benchmark/HANDOFF_PLANO_MVP.md` e corrigir os três ponteiros que apontam
   para ele (`design/benchmark/README.md`, `FECHAMENTO.md` e `00_PLANO_DE_ACAO.md`).
2. **Distribuir as 30 diretrizes** de `design/benchmark/DIRETRIZES_FORA_DO_BENCHMARK.md` para os
   destinos já sugeridos: 10 para `docs/02_MODELO_DE_DADOS.md` e `docs/01_ARQUITETURA.md`,
   10 para `docs/05_COMPLIANCE_E_ETICA.md`, 4 para `docs/00_PLANO_E_CRITERIOS.md`, 2 para
   `handoffs/instrucoes.md` (armadilhas medidas), 1 para `CLAUDE.md` §14 (o CRM Sindcom como
   fonte de porte, ao lado do Maximus) e 5 para o backlog comercial.
   **Cuidado:** `CLAUDE.md` §14 hoje nomeia só o Maximus. Estender exige aprovação de Max
   (`CLAUDE.md`, cabeçalho).
3. **Registrar o benchmark em `docs/00_PLANO_E_CRITERIOS.md`** como etapa de transição concluída,
   com `Status: ✅ CONCLUÍDA` (`CLAUDE.md` §8), e avaliar uma linha em `CHANGELOG.md` — este
   trabalho é documentação e provavelmente **não** muda nada para quem usa o produto.

---

## Etapa 2 — Os 24 itens do MVP

A lista canônica é `design/benchmark/fontes/MVP.xlsx`, transcrita em `design/benchmark/RELATORIO.md`
§5 (c). **Não reabrir a lista** — foi revisada por Max em 2026-09-02. Item inviável se reporta,
não se remove.

### 2.1 A ordem não é livre — há uma corrente de dependência

> **catálogo** (itens 3 e 22: "aceita faces", unidade de lançamento, quantidade máxima) →
> **odontograma** (item 2) → **orçamento** (item 1) → **contrato e financeiro** (já existe)

O odontograma sem o catálogo marcado não sabe quais procedimentos aceitam face; o orçamento sem
odontograma não tem de onde receber dente e face. **O item 1 é o mais crítico do MVP inteiro** —
é o elo que falta e sem o qual o produto não é odontológico.

### 2.2 Os quatro blocos, e o que os separa

| Bloco | Itens | Natureza |
|---|---|---|
| **A · Corrente clínico-comercial** | 1, 2, 3, 22 | o núcleo do valor; ordem interna obrigatória |
| **B · Token e comunicação externa** | 7, 18, 19, 23 | **uma infraestrutura só** serve aos quatro |
| **C · Tela sobre banco existente** | 6, 8, 11 | os mais baratos: o dado já está lá |
| **D · Recursos de operação** | 4, 5, 9, 10, 12, 13, 14, 15, 16, 17, 20, 21 | acréscimos aos módulos que já existem |
| **E · Núcleo de permissão** | 24 | isolado, com portão próprio — ver §2.3 |

**Sobre o bloco B — a decisão de arquitetura mais importante da Etapa 2.** Os itens 7 (exportação
de prontuário), 18 (caixa de entrada de exames), 19 (assinatura do paciente) e 23 (encaminhamento
com contrarreferência) parecem quatro recursos e são **um só mecanismo**: token rastreável,
revogável, com expiração programada, mais tabela de tentativas com motivo enumerado, mais bucket
privado, mais Edge Function pública. Construir uma vez e reusar quatro vezes. O padrão está
**pronto e depurado** no CRM Sindcom (`sql/20_comunicacao_externa.sql` e
`sql/21_remessas_recepcao.sql`) — portar a lógica, traduzir os nomes, como `CLAUDE.md` §14 manda
fazer com o Maximus.

E há uma regra de negócio que Max fixou e que atravessa o bloco inteiro: **nunca anexar dado
pessoal em e-mail.** O e-mail (ou WhatsApp, ou SMS) carrega **só o link**; o dado trafega pelo
ambiente privado. O uso do token diz **com quem está a demanda**, e isso alimenta um alerta de
"aguardando contrarreferência".

### 2.3 O item 24 deveria vir cedo, não tarde — e isso é contraintuitivo

Multiunidade parece recurso de tela e **é cirurgia no núcleo de permissão**. Medido no schema:
`public.profiles` tem `user_id UUID NOT NULL UNIQUE` — um usuário pertence hoje a **exatamente
uma** conta —, e `access.can()` resolve a conta com
`SELECT account_id, account_role FROM public.profiles WHERE user_id = auth.uid()`, **sem
parâmetro de conta**. **21 arquivos de migration** tocam `profiles` ou `is_account_member`.

**O argumento para fazê-lo cedo:** toda política de RLS escrita na Etapa 2 usa
`is_account_member(account_id)`. Se um usuário passar a pertencer a duas contas **depois** de as
políticas estarem escritas, cada uma delas precisa ser reauditada para garantir que compara com a
conta **ativa**, e não com "qualquer conta do usuário" — que é vazamento entre clínicas. Fazer o
item 24 antes significa que tudo o que vier depois nasce com a semântica final.

**O argumento contra:** é o item de maior risco, e antecipá-lo empurra o risco para o começo.

**Recomendação para o plano decidir, não decisão tomada:** subetapa própria, com portão
adversarial próprio, posicionada **antes** do bloco D e depois do bloco A. Se ficar por último,
o plano precisa prever explicitamente a reauditoria das políticas escritas no intervalo.

### 2.4 Comunicação externa é a superfície nova do produto

Vale destacar porque muda o perfil de risco: até hoje o Vitrine tem **um** endpoint público (o
webhook da Meta, autenticado por HMAC). Os itens 7, 18, 19 e 23 criam **endpoints públicos que
recebem e servem dado clínico**, autenticados por token. É a primeira vez que o produto expõe
prontuário fora da sessão autenticada. A Etapa 4 precisa saber disso (§4).

---

## Etapa 3 — Escolher e implantar a UX

**Decisão de Max: a UX vem depois do MVP**, porque é a maquiagem final e faz mais sentido aplicá-la
com tudo já no lugar. A direção é a **Versão 03** mais os cinco acréscimos do `RELATORIO.md` §7:
tela de orçamento, odontograma, alertas clínicos no cabeçalho da ficha, consentimento de imagem
visível e indicador de cota de mensagem.

**Duas ressalvas que o plano precisa tratar:**

**1. Três itens do MVP já são decisões de UX.** O item 12 (painel como lista de tarefas
acionáveis, não de gráficos), o 13 (régua de cobrança como linha do tempo) e o 17 (estados vazios
instrutivos) **são** o desenho da Versão 03. Construí-los na Etapa 2 é implementar parte da
Versão 03 antes de escolhê-la formalmente. Sugestão: na Etapa 2 constrói-se **o mecanismo e o
conteúdo** (quais pendências aparecem, quais regras a régua tem); na Etapa 3 faz-se **a forma**.
Se Max já considera a Versão 03 decidida, essa separação deixa de ser necessária — e o plano deve
perguntar em vez de supor.

**2. A divisão por rota não pode esperar a Etapa 3.** O odontograma (item 2) pesa **426 KB gzip
medidos**, contra 284 KB do bundle inteiro do Vitrine hoje. Ele **precisa** entrar atrás de
`React.lazy`, o que exige a divisão por rota de `design/ux/06_ORCAMENTO_DE_PESO.md`. Isso é
pré-requisito da subetapa do odontograma, na **Etapa 2** — não melhoria de acabamento.

---

## Etapa 4 — Teste adversarial do MVP

Terceiro portão do projeto, no molde de 01.8 e 02.15 (bench isolado, 7 passos, achados viram itens
`[Goal]`, parecer ao fim, merge só por ordem de Max). **Mas com superfície nova**, e os dois
portões anteriores não a cobriram. Os vetores que Max nomeou, traduzidos:

| Vetor | O que atacar |
|---|---|
| **Segurança de dados** | RLS de toda tabela nova; `aba_health` com regime próprio; injeção em toda RPC nova |
| **Token e link** | token adivinhado, expirado aceito, revogado aceito, reuso após consumo, token de uma conta servindo dado de outra, enumeração por força bruta, e o **freio por token, nunca pela entidade** |
| **Bucket e Storage** | leitura de anexo sem concessão; URL assinada vazando; `allowed_mime_types` e `file_size_limit` como segunda camada |
| **Núcleo de permissão** | se o item 24 entrar: usuário com duas contas lendo dado da conta inativa — **o vazamento mais provável do MVP inteiro** |
| **Automação** | todo job de `pg_cron` novo conferido quanto ao `account_id` no `WHERE` (herdado da 02.15) |
| **Navegabilidade e caminho infeliz** | rota fora do caminho feliz, estado impossível, XSS armazenado contra a UI real (herdado da 02.15) |
| **Kanban e máquina de estados** | transição pulada, estado revertido, contrarreferência aceita duas vezes |

**Uma pergunta que o plano deve responder:** a Etapa 4 roda **uma vez ao fim**, ou **um portão por
bloco**? Dada a superfície nova do bloco B, há argumento para um portão intermediário logo após a
comunicação externa, em vez de acumular tudo para o fim.

---

## As cinco armadilhas já medidas — não são hipóteses

**1. Multiunidade é cirurgia no núcleo.** §2.3 acima.

**2. O odontograma pronto pesa 1,5× o app inteiro.** `react-advanced-odontogram` é MIT, React
18/19, 191 testes, com HL7 FHIR R4 de brinde — mas 426 KB gzip contra os 284 KB do bundle atual.
Só atrás de rota preguiçosa. E **não tem português** entre os 11 idiomas: tradução técnica é
trabalho real. Ficha em `design/benchmark/fontes/REPOS.md`.

**3. Policy ausente em `storage.objects` não nega — faz sumir.** Com RLS ligada e zero policies, o
`authenticated` inteiro fica de fora e o erro é **`"Object not found"`**, que parece arquivo
inexistente e não permissão negada. Quem construir a leitura da caixa de entrada (item 18) sem
saber disso perde horas caçando o arquivo errado. Medido no CRM Sindcom.

**4. Freio de endpoint público conta por token, nunca pela entidade.** Travar o *laboratório*
permitiria a um atacante bloquear o envio de exames de uma clínica inteira só errando token de
propósito. Motivo enumerado: `token_inexistente` / `expirado` / `revogado` / `arquivo_invalido`.

**5. ~~Falta `faltou` no enum de status do agendamento.~~ [CORRIGIDA — Subetapa 03.0, 2026-09-03]**
**A afirmação estava errada na premissa, e a medição que a derrubou custou um `grep`.**
`db/migrations/009_aba_scheduling.sql:259` já traz o `CHECK`
`status IN ('agendado','confirmado','em_andamento','concluido','nao_compareceu','cancelado')` —
`nao_compareceu` **é** o `faltou`, traduzido pela convenção do `CLAUDE.md` §2, que manda nomear em
português dentro do schema de módulo. A taxa de falta é calculável desde a Etapa 01; o painel
(item 12) e a tabela de métricas (item 21) não dependem de migration nenhuma para isso. **O que de
fato falta** é o valor `sala_de_espera` e o KPI que consome o dado — entregues na Subetapa 03.4.
**Por que o erro é instrutivo e fica registrado em vez de apagado:** a armadilha nasceu de comparar
o vocabulário do concorrente (que diz "faltou") com o vocabulário do nosso banco sem abrir o banco,
e é o mesmo padrão que o `CLAUDE.md` §11 descreve — hipótese coerente escrita como diagnóstico
antes do teste mais barato disponível.

---

## Decisões que o Plano de Ação precisa tomar explicitamente

| # | Decisão | Por que não dá para deixar implícita |
|---|---|---|
| D1 | **Onde entra o item 24** (multiunidade) na ordem | muda se as políticas de RLS precisam ou não de reauditoria (§2.3) |
| D2 | **Um portão adversarial ao fim, ou um por bloco** | a superfície de token é nova e grande (§4) |
| D3 | **Como os módulos ficam ligáveis/desligáveis por nível de plano** | a Etapa 6 vende Bronze/Prata/Ouro/Diamante; se o produto não nascer com esse corte, a Etapa 6 vira refatoração. `access.modules` e o schema `licensing` já existem — a decisão é *quais* itens do MVP entram em *qual* nível |
| D4 | **Quantas ondas** e o que entra na primeira | 24 itens não são uma etapa, são um roteiro |
| D5 | **Se a Versão 03 já está decidida** ou se a Etapa 3 ainda escolhe | define se os itens 12, 13 e 17 saem completos na Etapa 2 (§3) |
| D6 | **O que entra em `CHANGELOG.md`** por subetapa | `CLAUDE.md` §9 |

---

## Leitura obrigatória antes de planejar

| Ordem | Arquivo | Por quê |
|---|---|---|
| 1 | `design/benchmark/RELATORIO.md` §5 (c) | os 24 itens e as três ressalvas técnicas |
| 2 | `design/benchmark/DIRETRIZES_FORA_DO_BENCHMARK.md` | as 30 diretrizes; muitas viram critério de qualidade das subetapas |
| 3 | `handoffs/HANDOFF_UPGRADE.md` | o que **já existe** — 16 rotas, 80 tabelas, dívidas técnicas e riscos conhecidos |
| 4 | `docs/00_PLANO_E_CRITERIOS.md` | o formato do bloco `[Goal]` e as pendências vigiadas |
| 5 | `design/benchmark/fontes/REPOS.md` e `fontes/IDEIAS_MAX.md` | licença e peso do odontograma; o padrão de token do Sindcom com as três lições medidas |
| 6 | `design/ux/versoes/README.md` | as três versões e o parecer |
| 7 | `handoffs/instrucoes.md` | armadilhas já registradas (leitura de abertura obrigatória, `CLAUDE.md` §10) |

**Não é preciso reler os 56 vídeos nem as 61 capturas.** `design/benchmark/fontes/VIDEOS.md` e os
índices existem para que o planejamento não refaça a investigação — se uma decisão de desenho
pedir a evidência visual, o índice diz qual arquivo abrir.

---

## O que a sessão de planejamento **não** deve fazer

- **Não implementar.** Nem migration, nem tela, nem dependência no `package.json`.
- **Não reabrir a lista de 24 itens.** Revisada por Max em 2026-09-02; item inviável se **reporta**.
- **Não escolher a versão de UX por conta própria** — é decisão de Max (D5).
- **Não expandir `CLAUDE.md` §15.** Os itens 29 e 30 estão em `+1.0` por isso.
- **Não fundir bench em `main`** (`CLAUDE.md` §13).

---

## §8 — O que mudou em relação ao rascunho do bench

O `design/benchmark/HANDOFF_PLANO_MVP.md` foi escrito antes de Max fixar o roteiro de sete etapas,
e **errava em dois pontos**:

1. **Dizia que a escolha da UX era pré-requisito para começar a construir.** Max inverteu: a UX é
   a maquiagem final, aplicada depois do MVP. A inversão se sustenta porque o produto já tem
   interface funcionando em 16 rotas — não se está construindo telas do zero.
2. **Não previa as Etapas 4 a 7.** O portão adversarial, o teste em campo, o lançamento com níveis
   de produto e os versionamentos futuros não apareciam, e a Etapa 6 impõe uma decisão que precisa
   ser tomada **agora** (D3): módulos ligáveis por nível de plano.
