# 00a — Plano de trabalho da Etapa 03 (recorte enxuto)

> **O que é este arquivo.** Extrato de `docs/00_PLANO_E_CRITERIOS.md`, contendo só a Etapa 03 — as 822 linhas do plano completo cobrem as Etapas 01, 02 e 03, e toda sessão que abre para executar uma subetapa `03.n` só precisa da terceira. Existe para reduzir o que cada sessão lê antes de começar a trabalhar, não para substituir o plano completo.
>
> **Fonte canônica: `docs/00_PLANO_E_CRITERIOS.md`.** Este arquivo é uma **cópia sincronizada**, nunca a origem de uma decisão. Política fixada por Max em 2026-09-03: **toda subetapa concluída grava o Status nos dois lugares, no mesmo commit** — aqui e no docs/00 original. Nenhum dos dois fica "mais atualizado" que o outro por desenho; se algum dia divergirem, docs/00 vence, porque é ele que o `CLAUDE.md` §8 nomeia.
>
> **Ciclo de vida.** Quando a Subetapa 03.23 (portão adversarial do MVP, que fecha a Etapa) for concluída, este arquivo já terá exatamente o mesmo conteúdo relevante que docs/00 — nesse momento ele deixa de ter função e a subetapa de fechamento decide se ele é apagado ou mantido como registro histórico.
>
> **O que NÃO está aqui**, e continua só em docs/00: Idea lock, Etapas 01 e 02 inteiras, a Etapa de Transição 1→2 e 2→3, o Backlog de versionamento completo, o CHECKLIST DE CONFORMIDADE, e as Pendências vigiadas que não dizem respeito a nenhuma subetapa `03.n` — abaixo só o recorte que importa.

---

## Mapa de evolução — as 24 subetapas da Etapa 03

| Subetapa | Nome | Onda / Etapa do roteiro | LLM | Status |
|---|---|---|---|---|
| 03.0 | Leitura de Referências e Revisão do Plano da Etapa 03 | Etapa 1 do roteiro | Opus | ✅ CONCLUÍDA |
| 03.1 | Evolution GO como módulo pago | (fora de onda) | Opus | ⏸️ ADIADA |
| 03.2 | Uniformidade do repositório | Etapa 1 do roteiro | Sonnet | ✅ CONCLUÍDA |
| 03.3 | Divisão por rota + fontes auto-hospedadas | Onda 1 | Sonnet | ✅ CONCLUÍDA |
| 03.4 | Agendamento: espera, marcadores e cadeiras | Onda 1 | Sonnet | ✅ CONCLUÍDA |
| 03.5 | Ações dos usuários + consentimento de imagem | Onda 1 · P-sub | Opus | ⬜ não iniciada |
| 03.6 | Catálogo: faces, unidade e semente SIGTAP | Onda 2 | Sonnet | ⬜ não iniciada |
| 03.7 | Odontograma | Onda 2 · P-sub | Opus | ⬜ não iniciada |
| 03.8 | Orçamento como entidade | Onda 2 · P-sub | Opus | ⬜ não iniciada |
| 03.9 | Multiunidade + trava de plano por módulo | Onda 3 · **PORTÃO COMPLETO** | Opus | ⬜ não iniciada |
| 03.10 | Infraestrutura de token externo | Onda 4 · P-sub | Opus | ⬜ não iniciada |
| 03.11 | Caixa de entrada de exames | Onda 4 · P-sub | Opus | ⬜ não iniciada |
| 03.12 | Assinatura do paciente por link multicanal | Onda 4 · P-sub | Opus | ⬜ não iniciada |
| 03.13 | Exportação de prontuário | Onda 4 · P-sub | Opus | ⬜ não iniciada |
| 03.14 | Encaminhamento com contrarreferência | Onda 4 · P-sub | Opus | ⬜ não iniciada |
| 03.15 | Portão adversarial da comunicação externa | Onda 4 · **PORTÃO COMPLETO** | Opus | ⬜ não iniciada |
| 03.16 | Alertas clínicos derivados da anamnese | Onda 5 · P-sub | Opus | ⬜ não iniciada |
| 03.17 | Painel como lista de tarefas + estados vazios + exportação | Onda 5 | Sonnet | ⬜ não iniciada |
| 03.18 | Régua de cobrança, campanhas, template e cota | Onda 5 | Sonnet | ⬜ não iniciada |
| 03.19 | Link público de agendamento | Onda 5 · P-sub | Sonnet | ⬜ não iniciada |
| 03.20 | Estoque: alertas e validade | Onda 5 | Sonnet | ⬜ não iniciada |
| 03.21 | Tabela de métricas por CRM-filho | Onda 5 | Sonnet | ⬜ não iniciada |
| 03.22 | Implantação da UX Versão 03 | Etapa 3 do roteiro | Sonnet | ⬜ não iniciada |
| 03.23 | Portão de segurança adversarial do MVP | Etapa 4 do roteiro · **PORTÃO COMPLETO** | Opus | ⬜ não iniciada |

**Progresso: 4 de 24 concluídas (03.0, 03.2, 03.3, 03.4) · 1 adiada (03.1) · 19 restantes.** Três portões completos aguardam (03.9, 03.15, 03.23) — nenhum deles é executado sem bench isolado, e nenhum termina em merge por conta do CODE (`CLAUDE.md` §13).

---

## ETAPA 03 — FECHAMENTO DO MVP ODONTOLÓGICO
Objetivo geral: implantar os 24 itens do MVP levantados pelo benchmark (`design/benchmark/RELATORIO.md` §5 c, revisado por Max em 2026-09-02), escolher e implantar a UX, e passar pelo portão adversarial — sobre o produto já lançado, sem reconstruir nada do v01.
Versionamento: +0.1 = correções/melhorias | +1.0 = novas funcionalidades/serviços.
Modo predominante: [Manual Mode] + [Goal] (um /goal por subetapa), com [Plan] nas subetapas de revisão e [Manual] nos portões.
Portão de entrada: `HANDOFF_UPGRADE.md` preenchido, MVP v01 no ar e 100% verde (portão de saída da Etapa 02 verde) — satisfeito em 2026-08-22.
Portão de saída: os 24 itens entregues ou explicitamente reportados como inviáveis (item inviável se **reporta**, nunca se remove — `handoffs/HANDOFF_PLANO_MVP.md`); UX da Versão 03 implantada; portão adversarial do MVP executado com parecer registrado; `CHANGELOG.md` atualizado. Enquanto vermelho, as Etapas 5 a 7 do roteiro (teste em campo, lançamento, versionamentos futuros) não abrem.
Observações: o roteiro de sete etapas decidido por Max em 2026-09-02 mapeia assim nas subetapas abaixo — Etapa 1 (uniformidade) = 03.2; Etapa 2 (os 24 itens) = 03.3 a 03.21; Etapa 3 (UX) = 03.22; Etapa 4 (adversarial) = 03.23. As Etapas 5 a 7 são planos futuros e não constam aqui. Trabalho conduzido no branch `etapa-03/plano-mvp-odontologico`, com `main` intocada — merge é ordem exclusiva de Max (`CLAUDE.md` §13).

### As seis decisões do Plano de Ação (D1–D6)

Tomadas em 2026-09-03, na sessão da Subetapa 03.0. As de Max estão datadas e nominadas; as do CODE trazem o raciocínio para poderem ser derrubadas.

| # | Decisão | Resposta | De quem |
|---|---|---|---|
| D1 | Onde entra o item 24 (multiunidade) | **Depois do bloco A, antes do bloco B** (Subetapa 03.9) | **Max, 2026-09-03** |
| D2 | Um portão adversarial ao fim, ou um por bloco | **Três portões completos** (03.9, 03.15 e 03.23) + P-sub nas demais | CODE |
| D3 | Como os módulos ficam ligáveis por nível de plano | **Camada nova, na mesma subetapa do item 24** (03.9) | **Max, 2026-09-03** |
| D4 | Quantas ondas e o que entra na primeira | **Cinco ondas**; a primeira é 03.3–03.5 | CODE |
| D5 | Se a Versão 03 já está decidida | **Decidida; implantação concentrada na Etapa 3 (03.22)** | **Max, 2026-09-03** |
| D6 | O que entra em `CHANGELOG.md` por subetapa | Regra abaixo; linha declarada em cada bloco `[Goal]` | CODE |

**Decisão extra de Max (2026-09-03), levantada pela medição da 03.0:** adotar `TOOL_Odontogram01` (`react-advanced-odontogram` 2.4.0, MIT, 426 KB gzip) em vez de estender o mecanismo nativo de marcação que a migration `025` já criou. A recomendação do CODE era a oposta; Max decidiu pela biblioteca. A escolha torna obrigatórias três restrições registradas na Qualidade da Subetapa 03.7 — não são opções de implementação.

**Regra de `CHANGELOG.md` (D6):** uma linha por subetapa que muda **o que uma clínica consegue fazer**. `+1.0` para capacidade nova, `+0.1` para correção ou melhoria, escrita como nota de versão do produto e não como lista de subetapas — o padrão que a entrada de 2026-08-22 estabeleceu. Duas exceções declaradas: a **03.2** (documentação pura) e a **03.10** (infraestrutura sem superfície de usuário; o valor aparece nos quatro consumidores dela). Os portões entram como `+0.1` dizendo o que foi atacado e o que se achou, no formato de 02.14 e 02.15.

### Dois níveis de portão de segurança na Etapa 03

A exigência de portão onde a subetapa toca `aba_health`, o núcleo de permissão ou endpoint público — os três lugares onde este projeto já teve achado real — é cumprida em dois níveis, para não transformar 22 subetapas em 22 benches.

| Nível | Gatilho | O que é |
|---|---|---|
| **P-sub** (portão de subetapa) | subetapa que toca `aba_health`, o núcleo de permissão ou endpoint público | casos de **ataque** novos e permanentes na suíte (não caminho feliz), `get_advisors` sem achado novo, conferência de privilégio de coluna, e — em endpoint público — a prova do freio por token. Roda dentro da própria subetapa, sem bench isolado. |
| **Portão completo** | Subetapas 03.9, 03.15 e 03.23 | os 7 passos da pendência vigiada "Portão de segurança adversarial obrigatório" (definição normativa em `docs/00_PLANO_E_CRITERIOS.md` → Pendências vigiadas — não duplicada aqui): bench isolado, ataque deliberado, registro em `handoffs/instrucoes.md`, achados viram itens `[Goal]`, execução até 100% verde ou teto, relatório com parecer explícito, e **o CODE nunca executa o merge** (`CLAUDE.md` §13). |

**Qualidade fixa de toda subetapa da Etapa 03, não repetida item a item** (herdada da 02.0 e das correções de 01.8/02.15): `.select()` sempre com colunas explícitas em tabela com narrowing — `select('*')` devolve `42501`, que parece falha de RLS; todo conteúdo vindo do banco renderizado escapado; nenhuma checagem de permissão duplicada no client; toda função nova com `REVOKE EXECUTE FROM PUBLIC` **e** `FROM anon`; toda chave estrangeira multi-inquilino composta por `account_id` (o teste de `039_auditoria_isolamento_de_conta.sql` falha sozinho se a próxima nascer desprotegida).

### Subetapa 03.0 — Leitura de Referências e Revisão do Plano da Etapa 03 [Plan] [LLM: Opus]
Objetivo: instância da convenção `0X.0` para a Etapa 03. Reler `HANDOFF_UPGRADE.md`, `handoffs/HANDOFF_PLANO_MVP.md`, o backlog de versionamento e as pendências vigiadas; confirmar que o escopo a abrir ainda faz sentido frente ao estado real do produto; produzir o Plano de Ação das Etapas 1 a 4 do roteiro de sete.
Conclusão: Plano de Ação apresentado a Max e aprovado; as seis decisões D1–D6 respondidas ou perguntadas explicitamente; subetapas redigidas neste documento antes do primeiro commit de código.
Qualidade: nenhuma subetapa `03.n` aberta sem Conclusão/Qualidade/Evidência declaradas primeiro; nenhuma afirmação do handoff herdada sem confronto com o repositório (`CLAUDE.md` §11).
Evidência: esta seção da Etapa 03, publicada antes de qualquer código.
Esforço máximo do /goal: 2 tentativas
Escalonamento de LLM: Sonnet na primeira; Opus na segunda.
Se esgotar: parar e emitir relatório curto.
Status: ✅ CONCLUÍDA — executada em 2026-09-03 (Opus, `[Plan]`, uma tentativa). Nenhuma implementação. **Cinco afirmações do handoff foram confrontadas com o repositório antes de virarem plano, e duas não sobreviveram:** (1) a tarefa 1 da Etapa 1 **já estava feita** — `design/benchmark/HANDOFF_PLANO_MVP.md` não existe mais e os três ponteiros já apontam para `handoffs/`, resolvidos no commit `4951cf8`; (2) **a armadilha 5 do handoff está errada na premissa** — `db/migrations/009_aba_scheduling.sql:259` já traz `nao_compareceu` no `CHECK` de status, que **é** o `faltou` traduzido pela convenção do `CLAUDE.md` §2, então a taxa de falta é calculável hoje e o que falta é `sala_de_espera` e o KPI (corrigido na 03.2, para não ser herdado como verdade); (3) **D3 não tinha a fundação que o handoff supunha** — `access.modules` é catálogo global sem `account_id`, `licensing` guarda só teto de assentos, e `access.can()` faz `IF v_role = 'owner' THEN RETURN TRUE` **antes** de consultar `module_permissions` (`003_core_access.sql:162`), de modo que uma trava de plano ali seria invisível justamente para quem contrata o plano; (4) **D1 e D3 mexem na mesma função** (`access.can()` resolve a conta com `WHERE user_id = auth.uid()`, sem parâmetro de conta), o que fundiu as duas numa subetapa só; (5) **o odontograma não partia do zero** — a migration `025` já persiste marcações em `aba_health.evolucoes.marcacoes`/`mapa_tipo` e `crm/src/features/health/mapas.ts:126` já tem a grade FDI de 32 dentes, tendo escolhido coluna em `evolucoes` de propósito para herdar RLS, log, privilégio de coluna e trava de evolução assinada. Os achados (3), (4) e (5) foram levados a Max como decisão; ele respondeu D1, D3, D5 e a adoção do `TOOL_Odontogram01`. Plano aprovado por Max em 2026-09-03, com a instrução de executá-lo em branch próprio.

### Subetapa 03.1 — Evolution GO como módulo pago [Manual] [LLM: Opus]
Objetivo / Conclusão / Qualidade / Evidência: a definir quando o primeiro cliente contratar o canal — não abrir esta subetapa sem demanda real paga.
Status: ⏸️ ADIADA — decisão registrada na Subetapa 03.0 (2026-09-03). `CLAUDE.md` §15 mantém o Evolution GO fora do v01, não há demanda paga, e o `HANDOFF_UPGRADE.md` já recomendava reavaliar se ela continuava sendo a primeira da Etapa 03. O número **não é reaproveitado** — renumerar quebraria referências existentes, e a convenção do fim da Etapa 02 manda inserir sem renumerar. O trabalho do MVP odontológico começa na 03.2.

---

## ETAPA 03 · ETAPA 1 DO ROTEIRO — REESTABELECER A UNIFORMIDADE

### Subetapa 03.2 — Uniformidade do repositório [Plan] [LLM: Sonnet]
Objetivo: pôr o material do benchmark nos lugares onde as sessões futuras vão procurá-lo, e corrigir o diagnóstico errado que a 03.0 mediu. Três frentes: (a) distribuir as 30 diretrizes de `design/benchmark/DIRETRIZES_FORA_DO_BENCHMARK.md` aos destinos já sugeridos — 10 para `docs/02_MODELO_DE_DADOS.md` e `docs/01_ARQUITETURA.md`, 10 para `docs/05_COMPLIANCE_E_ETICA.md`, 4 para este documento, 2 para `handoffs/instrucoes.md` (as armadilhas A5 e A6, que são medidas e não hipóteses), 1 para `CLAUDE.md` §14 e 5 para o backlog comercial; (b) registrar o benchmark neste documento como etapa de transição concluída; (c) corrigir em `handoffs/HANDOFF_PLANO_MVP.md` e em `design/benchmark/RELATORIO.md` §5(c) a afirmação de que falta `faltou` no enum de status, citando a medição.
Conclusão: nenhuma das 30 diretrizes sem destino aplicado ou sem motivo registrado para não ter destino; a correção do enum escrita nos dois documentos com a linha da migration citada; a tarefa 1 do handoff registrada como já resolvida em `4951cf8`, não refeita.
Qualidade: nenhuma entrada antiga apagada — o que ficar obsoleto se marca `[OBSOLETA — <motivo>]` (`CLAUDE.md` §10). **A diretriz P4 (nomear o CRM Sindcom como fonte de porte no `CLAUDE.md` §14) exige autorização explícita de Max** pelo cabeçalho do próprio `CLAUDE.md`: sem o sim, a diretriz é registrada e o arquivo **não** é editado. Diagnóstico errado em documento vivo é pior que nenhum diagnóstico — ele é herdado por sessões futuras como verdade (`CLAUDE.md` §11).
Evidência: `grep` mostrando cada uma das 30 diretrizes rastreável ao arquivo de destino, e o texto novo dos dois documentos corrigidos.
Esforço máximo do /goal: 2 tentativas
Escalonamento de LLM: Sonnet nas duas.
Se esgotar: parar e emitir relatório curto (problema + causas + alternativas).
CHANGELOG: **nenhum** — é documentação e não muda nada para quem usa o produto.
Status: ✅ CONCLUÍDA — executada em 2026-09-03 (Sonnet/Opus, `[Plan]`, uma tentativa). **As 30 diretrizes distribuídas, 30/30 com destino aplicado** (conferido por varredura, saída `diretrizes sem destino: 0 de 30`): A1/A3/A8/A9/A10 → `docs/02_MODELO_DE_DADOS.md` §11 (novo); A2/A7 + o efeito de arquitetura de C4 → `docs/01_ARQUITETURA.md` §8 (novo); C1–C10 + A6 → `docs/05_COMPLIANCE_E_ETICA.md` §5 (novo); A5/A6 + uma lição de método → `handoffs/instrucoes.md` §6; P1/P2/P4 → Pendências vigiadas deste documento; P3/E1–E6 → `docs/07_BACKLOG_COMERCIAL.md` (**arquivo novo** — o destino "backlog comercial" que as diretrizes pediam não existia como lugar, e cinco delas ficariam órfãs sem ele; referenciado no `README.md` para não nascer perdido). **C1 fechou de quebra uma pendência aberta desde a fundação** — `docs/05` §4 deixava "política exata de retenção a confirmar por jurisdição", e a jurisdição é federal com prazo de 20 anos (Lei 13.787/2018, Art. 6º). **A tarefa 1 do handoff não foi refeita:** `design/benchmark/HANDOFF_PLANO_MVP.md` já não existia e os três ponteiros já apontavam para `handoffs/`, resolvidos no commit `4951cf8` — medido por `ls` e `grep` antes de agir. **O diagnóstico errado foi corrigido nos três lugares onde estava escrito** e em nenhum deles apagado: `handoffs/HANDOFF_PLANO_MVP.md` (armadilha 5, agora com o motivo do erro registrado como aprendizado de método), `design/benchmark/RELATORIO.md` §5(c) (item 4 reescrito) e `design/benchmark/DIRETRIZES_FORA_DO_BENCHMARK.md` (diretriz A4 marcada `[OBSOLETA]`, conforme `CLAUDE.md` §10). **`CLAUDE.md` não foi editado na execução da subetapa** — a diretriz P4 exige autorização explícita de Max, e ela virou pendência vigiada com o risco declarado. **[Atualização de 2026-09-03, mesma data: Max autorizou]** — o §14 passou a nomear o CRM Sindcom ao lado do Maximus, delimitado ao domínio de comunicação externa por token, e a pendência foi fechada. A Subetapa 03.10 está desbloqueada.

---

## ETAPA 03 · ETAPA 2 DO ROTEIRO — OS 24 ITENS DO MVP

A lista canônica é `design/benchmark/fontes/MVP.xlsx`, transcrita em `design/benchmark/RELATORIO.md` §5(c). **Não reabrir a lista** — revisada por Max em 2026-09-02. Item inviável se **reporta**, não se remove.

Cinco ondas. A ordem não é livre: a corrente de dependência **catálogo → odontograma → orçamento → contrato/financeiro** governa a onda 2, e o item 24 entra entre a onda 2 e a onda 4 por decisão de Max (D1), para que a reauditoria de políticas de RLS fique limitada a três subetapas e tudo que vier depois nasça com a semântica multiconta final.

### ONDA 1 — fundação que todas as demais herdam

### Subetapa 03.3 — Divisão por rota + fontes auto-hospedadas [Goal] [Manual] [LLM: Sonnet]
Objetivo: `React.lazy` + `<Suspense>` nas 16 rotas de `crm/src/app/router.tsx` (hoje não há nenhum, medido na 03.0), e auto-hospedagem das cinco faces realmente usadas (IBM Plex Sans 400/500/600 e Mono 400/500), com a serifa servida só quando a conta a escolher.
Conclusão: JS inicial abaixo de **180 KB gzip**, o teto declarado em `design/ux/06_ORCAMENTO_DE_PESO.md` §4 (linha de base medida: 284 KB num único chunk); um chunk por rota; nenhuma requisição a `fonts.googleapis.com` no caminho crítico.
Qualidade: **medição antes e depois pelo método do §5 daquele documento, nunca estimativa** — é a subetapa que existe para produzir número. Não é acabamento: é **pré-requisito** do odontograma (diretriz P2), porque `react-advanced-odontogram` pesa 426 KB gzip e não pode entrar no bundle inicial. Feita agora, toda tela das ondas seguintes nasce preguiçosa; feita depois, vira retrabalho em 20 rotas. O argumento de LGPD da fonte remota (LG München I, 3 O 17493/20 — carregar Google Fonts transmite o IP do visitante) registrado em `docs/05_COMPLIANCE_E_ETICA.md`, não só no dossiê de UX.
Evidência: saída do `vite build` com a lista de chunks e o gzip de cada um, antes e depois, mais a aba de rede mostrando a ausência da requisição de terceiro.
Esforço máximo do /goal: 3 tentativas
Escalonamento de LLM: Sonnet nas 2 primeiras; Opus na última.
Se esgotar: parar e emitir relatório curto.
CHANGELOG: **+0.1** — o produto abre mais rápido, e isso é visível para quem usa.
Status: ✅ CONCLUÍDA — executada em 2026-09-03 (Sonnet, `[Goal]`, uma tentativa). **Linha de base medida antes de tocar em código:** 290.553 B gzip num único chunk (idêntico ao dossiê), CSS 6.101 B. **Depois:** chunk de entrada em **160.202 B gzip** (`vite build` reporta 160,36 KB; `gzip -c` do método do §5 do dossiê devolve 160.202 B) — dentro do teto de 180 KB —, mais 20 chunks por rota/vendor, o maior deles (`SalesKanbanPage`) com 17.443 B gzip. As 16 rotas usam `React.lazy()` + `<Suspense>`, com fronteira dentro do `AppShell` (mantém sidebar/header pintados na troca) e fronteiras próprias para `/login` e `/convite`, que ficam fora do shell. **Um achado da própria medição corrigiu o dossiê:** IBM Plex Sans no Google Fonts v23 é fonte variável (`fvar` confirmado lendo o cabeçalho do woff2), então as nove faces auto-hospedadas (Sans 400/500/600 num arquivo só + Mono 400/500 sempre + Serif 400/500/600 sob demanda) pesam **135.712 B**, não os ~286 KB que o dossiê projetava contando a Sans três vezes. **Outro achado da medição corrigiu a primeira versão desta própria subetapa:** `/login` tinha ficado eager por suposição ("é a porta de entrada"); a atribuição por pacote mostrou que ela sozinha arrastava `zod`+`react-hook-form`+`@hookform/resolvers` (232 KB brutos) para o chunk de entrada, cobrado em toda carga de página — preguiçá-la também foi o que tirou o número de 186,70 KB para 160,36 KB. `fonts.googleapis.com`/`fonts.gstatic.com` não aparecem em nenhum artefato de `dist/` (`grep` sobre HTML, CSS e todos os chunks JS, zero ocorrência fora de um comentário de código) — o `<link rel="stylesheet">` remoto saiu do `index.html` e entrou um `<link rel="preload">` local. Argumento de LGPD (LG München I) registrado em `docs/05_COMPLIANCE_E_ETICA.md` §6 (seção nova). Duas lições de método em `handoffs/instrucoes.md` §5.

### Subetapa 03.4 — Agendamento: espera, marcadores e cadeiras [Goal] [Manual] [LLM: Sonnet]
Objetivo: itens 4, 9 e 11. Acrescentar `sala_de_espera` ao `CHECK` de status de `aba_scheduling.agendamentos`; criar marcador colorido no próprio agendamento (a cor existe hoje em `profissionais` e `recursos`, nunca no agendamento) com relatório por marcador; e expor na UI o controle de cadeiras e a ocupação da agenda, que já existem no banco (`recursos` + `horarios_recursos`) sem tela.
Conclusão: o estado novo é aceito pelo banco e visível na agenda; o relatório por marcador devolve contagem real; a taxa de falta é calculada sobre `nao_compareceu`, que **já existe** desde a migration `009` e dispensa migration nova.
Qualidade: estado novo em `CHECK` obriga a varrer quem filtra por lista literal de estado — `grep` por `status !==`, por `'agendado'` e pelos demais literais antes de fechar. O custo dessa omissão já foi medido neste projeto: o agendador da 02.10 zerou o KPI "Vencido" do Financeiro porque a fatura saía do contador exatamente quando virava pendência (`handoffs/instrucoes.md` §5). Quem escreve o estado é quem lembra dele; quem lê é quem esquece.
Evidência: query do `CHECK` aplicado + print da agenda com marcador, do relatório por marcador e da taxa de falta calculada.
Esforço máximo do /goal: 3 tentativas
Escalonamento de LLM: Sonnet nas 2 primeiras; Opus na última.
Se esgotar: parar e emitir relatório curto.
CHANGELOG: **+0.1**
Status: ✅ CONCLUÍDA — executada em 2026-09-03 (Sonnet, `[Goal]`, uma tentativa). Migration `040_agenda_sala_de_espera_marcadores.sql` aplicada em produção contra 600 agendamentos reais: `sala_de_espera` no `CHECK` (buscado por catálogo, não suposto — o Postgres reescreve `IN (...)` como `= ANY (ARRAY[...])`), tabela `marcadores` nova com FK composta por `account_id` desde a origem, "cadeiras" reaproveitando `recursos`/`horarios_recursos` já existentes sem tabela nova. Seis provas por SQL real em `BEGIN...ROLLBACK` (zero resíduo): CHECK aceita/recusa, sobreposição continua tratando `sala_de_espera` como ocupando agenda, marcador associado, **FK composta recusa marcador de outra conta**, `ON DELETE SET NULL (marcador_id)` preserva `account_id`. Auditoria `fks_sem_isolamento_de_conta()` zero linhas. Achado corrigido pela varredura de literais: o "Check-in" do Balcão conflava confirmação prévia com chegada física (`agendado→confirmado`); agora é `→sala_de_espera`, com lista real de espera na tela. Detalhe completo em `docs/00_PLANO_E_CRITERIOS.md`.

### Subetapa 03.5 — Ações dos usuários + consentimento de imagem [Goal] [Manual] [LLM: Opus] · P-sub
Objetivo: itens 8 e 6, os dois mais baratos de maior valor comercial da rodada, porque o dado já está no banco. Item 8: relatório "Ações dos usuários" sobre `aba_health.log_acesso`, **visível apenas ao `owner`**. Item 6: consentimento de imagem visível na ficha, travando publicação — `aba_health.consentimentos` já existe e nunca teve tela.
Conclusão: o `owner` lê o relatório; `admin`, `agent` e `viewer` recebem conjunto vazio pela RLS, nunca por `if` de papel no front; a trava de consentimento aparece onde a foto é publicada.
Qualidade: **P-sub obrigatório** — toca `aba_health`. O relatório é agregado sobre tabela com RLS por linha, então precisa **declarar o alcance de quem pergunta** antes de contar (`aba_health.pode_acessar(NULL,'leitura')`): contador de ausência sobre tabela com RLS por linha **erra para cima**, e sem alcance clínico a tela mostra "sem alcance clínico", nunca um número (`handoffs/instrucoes.md` §5). Nenhuma leitura clínica por `select` direto — só pelas funções `ler_*()` que gravam o log na mesma transação. O Art. 14, III do Código de Ética Odontológica torna a trava de imagem requisito, não recurso. **Ver também a pendência vigiada "Consentimento de imagem trava exibição, não envio" no recorte abaixo** — relevante ao desenhar esta tela, mesmo sem mudar a decisão de Max de mantê-la como está.
Evidência: print do relatório como `owner` e como `admin` (conjunto vazio) + contagem de `log_acesso` antes e depois + casos de ataque novos e permanentes na suíte.
Esforço máximo do /goal: 4 tentativas
Escalonamento de LLM: Opus do início ao fim — mesmo tratamento de 01.4/02.9.
Se esgotar: parar e emitir relatório curto.
CHANGELOG: **+0.1**

### ONDA 2 — a corrente clínico-comercial (bloco A), em ordem obrigatória

### Subetapa 03.6 — Catálogo: faces, unidade e semente SIGTAP [Goal] [Manual] [LLM: Sonnet]
Objetivo: itens 3 e 22 — o **primeiro elo** da corrente. Acrescentar a `aba_catalog.servicos` a marca `aceita_faces`, a `unidade_lancamento` (`dente`/`sextante`/`arcada`/`sessao`/`elemento`), a `quantidade_maxima` por unidade e o `codigo_sigtap`; e semear o catálogo com os 84 procedimentos da Atenção Básica de `design/benchmark/fontes/procedimentos.txt`, com o código SIGTAP de cada um.
Conclusão: procedimento marcado como "aceita faces", com unidade e teto declarados, e a semente entrando numa conta nova sem apagar catálogo existente.
Qualidade: a `quantidade_maxima` é **validação de banco, não rótulo** — 32 por dente, 6 por sextante, 2 por arcada ao longo dos 64 procedimentos da tabela nacional (`RELATORIO.md` §5.2): um orçamento com 33 restaurações no mesmo dente é recusado pelo banco, não só pela tela. A semente é opcional e idempotente — a conta que já cadastrou o catálogo dela não é sobrescrita. Código nacional padronizado é o que torna o catálogo interoperável e prepara TISS/TUSS sem retrabalho. Sem este elo o odontograma não sabe quais procedimentos aceitam face.
Evidência: query mostrando serviço com faces + unidade + código SIGTAP, e a recusa do teto por quantidade.
Esforço máximo do /goal: 4 tentativas
Escalonamento de LLM: Sonnet nas 3 primeiras; Opus na última.
Se esgotar: parar e emitir relatório curto.
CHANGELOG: **+1.0**

### Subetapa 03.7 — Odontograma [Goal] [Manual] [LLM: Opus] · P-sub
Objetivo: item 2 — odontograma com dentição permanente, decídua e **mista**, e estados *a realizar / executado / existente*, adotando `react-advanced-odontogram` 2.4.0 (MIT, `github.com/ZoliQua/React-Odontogram-Modul`) por decisão de Max de 2026-09-03.
Conclusão: o profissional marca dente e face pela UI, a marcação persiste, reaparece na sessão seguinte, e o orçamento da 03.8 consegue ler dente e face daí.
Qualidade — **três restrições que a escolha da biblioteca torna obrigatórias, não opções de implementação:**
  1. **Só atrás de `React.lazy`** na rota do prontuário clínico, nunca no carregamento inicial. O núcleo pesa **426 KB gzip medidos** contra os 284 KB do bundle inteiro do Vitrine — 1,5× o app. A 03.3 é pré-requisito conferido por medição do bundle **antes** de instalar a dependência (`design/benchmark/fontes/REPOS.md` §1; diretriz P2). **A 03.3 já entrega o chunk de entrada em 160.202 B gzip, com 20 KB de folga até o teto de 180 KB — a folga inteira desta subetapa.**
  2. **Tradução `pt-BR` completa é trabalho desta subetapa, não pendência.** Os 11 idiomas de `src/i18n/translations.ts` são `ar, de, en, es, fr, hu, it, pl, ru, sk, zh` — não há português, e o vocabulário odontológico é técnico.
  3. **O estado clínico grava em `aba_health.evolucoes.marcacoes`**, o modelo que a migration `025` já criou — **nunca em tabela clínica nova**. A `025` escolheu coluna em `evolucoes` de propósito, para herdar RLS por `pode_acessar()`, log de escrita por trigger, privilégio de coluna (as colunas não recebem `GRANT SELECT`, saindo só por `ler_evolucoes()`) e a trava de evolução assinada. Tabela própria reabriria quatro superfícies no schema de maior risco jurídico do produto, que `CLAUDE.md` §5 declara sem exceção por nenhum motivo. A ponte entre o modelo de dados próprio do componente e essa coluna é **adaptador**, não schema novo.
O `src/fhir/` do componente (HL7 FHIR R4, `iso3950`, ICDAS) vem de brinde e é exatamente o vocabulário que a certificação SBIS/CFM pede — registrar como ativo, sem abrir escopo (item 33 é `+1.0`).
Evidência: bundle antes e depois provando que a rota inicial não cresceu; marcação gravada e relida por `ler_evolucoes()` com a linha correspondente em `log_acesso`; casos de ataque novos e permanentes na suíte.
Esforço máximo do /goal: 5 tentativas
Escalonamento de LLM: Opus do início ao fim — toca `aba_health` e introduz dependência pesada.
Se esgotar: parar e emitir relatório curto.
CHANGELOG: **+1.0**

### Subetapa 03.8 — Orçamento como entidade [Goal] [Manual] [LLM: Opus] · P-sub
Objetivo: item 1, **o mais crítico do MVP inteiro** — é o elo sem o qual o produto não é odontológico. Schema novo entre `aba_catalog` e `aba_finance`: cabeçalho + linhas (`plano · procedimento · dente · faces · valor`), estados `rascunho → aprovado`, PDF "Plano de Tratamento" com duas assinaturas, e a aprovação gerando lançamento.
Conclusão: orçamento montado a partir do odontograma, aprovado, e o lançamento aparecendo no Financeiro — sem nenhuma escrita direta em `saldos_plano`/`extrato_plano`.
Qualidade: a aprovação passa pelas seis operações já provadas de `aba_finance` (`vender_plano`, `estornar_sessao`, `atualizar_status_fatura`, `marcar_faturas_vencidas`, `expirar_planos`, `planos_vencendo_em`), nunca por `INSERT` direto nas tabelas mantidas por trigger — a mesma régua da 02.8. Dente e face são dado de saúde: a leitura da linha do orçamento respeita o regime de `aba_health`, e é por isso que a subetapa tem **P-sub** mesmo não criando tabela clínica. O ciclo de estado é terminal e garantido no `WHERE` do `UPDATE`, no padrão que a 02.4 usou para `ativa → ganha | perdida`, sem `CHECK` nem trigger novo. A `quantidade_maxima` da 03.6 é validada aqui — é onde a regra tem efeito.
Evidência: cadeia completa `odontograma → orçamento → contrato → fatura` por query, e a recusa de um orçamento que estoura o teto por unidade.
Esforço máximo do /goal: 5 tentativas
Escalonamento de LLM: Opus do início ao fim.
Se esgotar: parar e emitir relatório curto.
CHANGELOG: **+1.0**

### ONDA 3 — o núcleo de permissão

### Subetapa 03.9 — Multiunidade + trava de plano por módulo [Manual] [LLM: Opus] · PORTÃO COMPLETO
Objetivo: item 24 e a decisão D3 na **mesma cirurgia**, porque a medição da 03.0 mostrou que as duas reescrevem `access.can()`. Multiunidade: remover `public.profiles.user_id UNIQUE`, passar a conta ativa por toda a camada de autorização, e login em dois estágios (e-mail e senha → o sistema detecta que o e-mail pertence a mais de um consultório → seleção de consultório). Trava de plano: camada nova que diz quais módulos a conta contratou, consultada **antes** do atalho de `owner`.
Conclusão: um usuário pertence a duas contas e, na conta ativa, não enxerga **nada** da outra; um módulo fora do plano contratado fica invisível **inclusive para o `owner`**; os 7 passos do portão executados em bench isolado, com parecer explícito.
Qualidade: **portar a lógica, traduzir os nomes — nunca reescrever a permissão do zero** (`CLAUDE.md` §14); 21 arquivos de migration tocam `profiles` ou `is_account_member`. As políticas de RLS escritas em 03.6–03.8 são **reauditadas uma a uma** para garantir que comparam com a conta **ativa**, e não com "qualquer conta do usuário" — que é vazamento entre clínicas. **A trava de plano não pode viver em `access.module_permissions`:** `access.can()` devolve `TRUE` para `owner` antes de consultar aquela tabela (`003_core_access.sql:162`), e o `owner` é justamente quem contrata o plano — o interruptor aceitaria o clique e não esconderia nada, repetindo em escala o defeito que a 02.12 encontrou no grid de módulos. `access.modules` é catálogo global sem `account_id` e `licensing` guarda só teto de assentos: nenhum dos dois responde "o que esta conta contratou". Guarda permanente no molde do achado F01-b da 02.15: função de auditoria por catálogo mais teste de suíte que falha se ela devolver qualquer linha — sem isso a correção vale só para hoje. **Qual item do MVP entra em qual nível (Bronze/Prata/Ouro/Diamante) é decisão comercial de Max**, preenchida em tabela depois, sem tocar em código — decisão dele de 2026-09-03: a matriz fica para o momento certo, e não atrasa esta subetapa. Consequência de implementação, portanto: **o mecanismo nasce com todos os níveis liberando todos os módulos**, e o corte comercial passa a existir quando a matriz for preenchida. O que precisa estar provado aqui não é o corte, é que ele **funciona quando existir** — inclusive contra o `owner`, que é o caso que a implementação ingênua erra.
Evidência: relatório do bench + parecer explícito. Vetor obrigatório: usuário com duas contas lendo dado da conta inativa — **o vazamento mais provável do MVP inteiro**.
Esforço máximo: sem teto de tentativas — é auditoria, não `/goal` de implementação.
Escalonamento de LLM: Opus do início ao fim — é a subetapa de maior risco da Etapa 03.
**O CODE entrega o parecer e para. Ordenar o merge é atribuição exclusiva de Max** (`CLAUDE.md` §13).
CHANGELOG: **+1.0**

### ONDA 4 — token e comunicação externa (bloco B): uma infraestrutura só

Os itens 7, 18, 19 e 23 parecem quatro recursos e são **um só mecanismo**. Construir uma vez, reusar quatro vezes. E há uma regra de negócio que Max fixou e que atravessa o bloco inteiro: **nunca anexar dado pessoal em e-mail** — o canal (e-mail, WhatsApp ou SMS) carrega **só o link**; o dado trafega pelo ambiente privado.

### Subetapa 03.10 — Infraestrutura de token externo [Goal] [Manual] [LLM: Opus] · P-sub
Objetivo: portar `sql/20_comunicacao_externa.sql` e `sql/21_remessas_recepcao.sql` do **CRM Sindcom**, onde o padrão está pronto e depurado — a concessão (`token`, `token_expira_em`, `token_revogado_em`, mais os carimbos de envio e de primeira/última remessa), a tabela de tentativas com motivo enumerado, o bucket privado e a Edge Function pública. Mesmo tratamento que `CLAUDE.md` §14 dá ao Maximus: portar a lógica, traduzir os nomes.
Conclusão: token válido serve; inexistente, expirado, revogado, já consumido e arquivo inválido são recusados, cada um com o motivo registrado na tabela de tentativas.
Qualidade — **três lições medidas que vêm junto com o porte:**
  1. **O freio conta por token, nunca pela entidade.** Travar o *laboratório* permitiria a um atacante bloquear o envio de exames de uma clínica inteira só errando token de propósito. Motivo enumerado: `token_inexistente` / `expirado` / `revogado` / `arquivo_invalido`. É DoS por desenho, evitado de origem.
  2. **Bucket com `public = false`, mais `file_size_limit` e `allowed_mime_types` no próprio Storage** — segunda camada, independente da validação da Edge Function. Se a checagem da função quebrar num refactor futuro, o Storage ainda recusa.
  3. **Policy ausente em `storage.objects` não nega: faz sumir.** Com RLS ligada e zero policies, o `authenticated` inteiro fica de fora e o erro é `"Object not found"` — que parece arquivo inexistente, não permissão negada. Quem construir a leitura da caixa de entrada sem saber disso perde horas caçando o arquivo errado.
A Edge Function é da mesma classe do `whatsapp-webhook`, que este projeto já sabe endurecer: autenticação **antes** de qualquer verificação de configuração (achado F03 da 02.15), `account_id` reafirmado em todo filtro (achado A06 da 01.8), CORS explícito.
Evidência: log da Edge Function com os cinco desfechos e o motivo registrado de cada recusa; prova de que o freio incide sobre o token e não sobre o remetente.
Esforço máximo do /goal: 5 tentativas
Escalonamento de LLM: Opus do início ao fim — é endpoint público servindo dado clínico.
Se esgotar: parar e emitir relatório curto.
CHANGELOG: **nenhum** — infraestrutura sem superfície de usuário; o valor aparece em 03.11–03.14.

### Subetapa 03.11 — Caixa de entrada de exames [Goal] [Manual] [LLM: Opus] · P-sub
Objetivo: item 18 — o laboratório envia resultado por link rastreável, revogável e com expiração; o arquivo **espera o aceite do dentista** antes de entrar no prontuário. Máquina de estados `recebida → validada → importada → rejeitada`, com `ip_origem`, `user_agent`, `processada_em` e `processada_por`. Nenhum dos oito concorrentes do benchmark tem isso.
Conclusão: arquivo enviado por token cai na caixa de entrada, não no prontuário; só o aceite explícito o migra; o rejeitado não deixa resíduo legível.
Qualidade: consome a infraestrutura da 03.10, sem tabela de token própria. O laboratório é `aba_people.fornecedores`, que já existe. O aceite é o que impede arquivo de terceiro de cair direto no prontuário — é a trava, não uma etapa burocrática.
Evidência: ciclo completo com arquivo real de teste + contagem de `log_acesso` na importação.
Esforço máximo do /goal: 5 tentativas · Escalonamento: Opus do início ao fim.
CHANGELOG: **+1.0**

### Subetapa 03.12 — Assinatura do paciente por link multicanal [Goal] [Manual] [LLM: Opus] · P-sub
Objetivo: item 19 — assinatura eletrônica simples do paciente por WhatsApp, e-mail, SMS **ou leitura de QR code**, com desenho no celular e estado `pendente → assinado`, sobre `aba_health.consentimentos`, que já existe e nunca teve tela. O concorrente faz por um canal só e cobra R$ 0,15 por documento.
Conclusão: o paciente assina pelo celular a partir de qualquer um dos quatro canais e o consentimento fica registrado com data, canal e token usado.
Qualidade: consome a infraestrutura da 03.10. Um link de assinatura sem expiração é um documento assinável para sempre por quem tiver o link — a expiração é requisito, não configuração. A camada ICP-Brasil com certificado A1 do profissional é o item 25 e fica `+1.0`; esta é a etapa barata antes dela, e a distinção precisa estar visível para não prometer o que não entrega.
Evidência: assinatura colhida pelos quatro canais em ambiente de teste + a recusa de um token expirado.
Esforço máximo do /goal: 5 tentativas · Escalonamento: Opus do início ao fim.
CHANGELOG: **+1.0**

### Subetapa 03.13 — Exportação de prontuário [Goal] [Manual] [LLM: Opus] · P-sub
Objetivo: item 7 — exportação pelo dono da conta a qualquer momento **e pelo próprio paciente quando ele solicita**, sempre por token de expiração curta e com **segunda prova de identidade**.
Conclusão: o dono exporta; o paciente solicita e recebe, e nenhum dos dois caminhos entrega o documento sem a segunda prova.
Qualidade: **o ponto sensível não é gerar o PDF, é entregar** — um prontuário completo com imagens é o documento mais sensível do sistema, e quem pede prontuário por telefone pode não ser o paciente. Expiração curta, não os 90 dias do padrão do Sindcom. O Art. 18, I do Código de Ética Odontológica torna infração negar ao paciente o acesso ao prontuário ou deixar de fornecer cópia quando solicitada: a exportação é cumprimento de dever do cliente, não conveniência — e é argumento comercial que nenhum dos cinco brasileiros usa, contra os 30 meses de retenção que o líder de mercado declara em contrato frente aos 20 anos que a Lei 13.787/2018 Art. 6º exige.
Evidência: os dois caminhos exercidos + a recusa sem a segunda prova + linha em `log_acesso`.
Esforço máximo do /goal: 5 tentativas · Escalonamento: Opus do início ao fim.
CHANGELOG: **+1.0**

### Subetapa 03.14 — Encaminhamento com contrarreferência [Goal] [Manual] [LLM: Opus] · P-sub
Objetivo: item 23 — encaminhamento como entidade com estado (`encaminhado → aceito → em atendimento → contrarreferenciado`), formulário nas duas pontas, pré-requisito clínico declarado, e trânsito sempre por token quando o especialista for externo. Lacuna que nenhum dos oito concorrentes modela — o que existe no mercado é encaminhamento como texto livre na evolução.
Conclusão: o ciclo completo percorrido, com o alerta de "aguardando contrarreferência" nascendo do uso do token, que é o que diz **com quem está a demanda**.
Qualidade: consome a infraestrutura da 03.10. Contrarreferência aceita duas vezes é recusada pela máquina de estados, não pela tela — transição pulada e estado revertido são vetores declarados do portão da 03.23. O pré-requisito clínico é campo declarado, não texto livre.
Evidência: ciclo completo + a recusa da segunda aceitação + o alerta aparecendo sozinho.
Esforço máximo do /goal: 5 tentativas · Escalonamento: Opus do início ao fim.
CHANGELOG: **+1.0**

### Subetapa 03.15 — Portão adversarial da comunicação externa [Manual] [LLM: Opus] · PORTÃO COMPLETO
Objetivo: os 7 passos da pendência vigiada sobre a superfície do bloco B. Justificativa da decisão D2: até a 03.10 o produto tinha **um** endpoint público (o webhook da Meta, autenticado por HMAC); os itens 7, 18, 19 e 23 criam endpoints públicos que **recebem e servem dado clínico**. É a primeira vez que o produto expõe prontuário fora da sessão autenticada, e acumular isso para o fim seria testar tarde a maior mudança de perfil de risco do MVP.
Conclusão: mesmos critérios de 01.8 e 02.15, aplicados à superfície do bloco B.
Qualidade — vetores obrigatórios: token adivinhado; expirado aceito; revogado aceito; reuso após consumo; token de uma conta servindo dado de outra; enumeração por força bruta; freio incidindo sobre a entidade em vez de sobre o token; leitura de anexo sem concessão; URL assinada vazando; `allowed_mime_types` e `file_size_limit` provados como segunda camada real. **Ponto de partida herdado da 02.15:** perguntar primeiro *o que a camada de proteção não tem como responder*, antes de perguntar *se ela está certa* — foi assim que a ponta da chave estrangeira apareceu, e ela não estava em nenhuma lista de vetores previstos.
Evidência: relatório do bench + parecer explícito.
Esforço máximo: sem teto — é auditoria.
Escalonamento de LLM: Opus do início ao fim.
**Merge para `main` é ordem exclusiva de Max** (`CLAUDE.md` §13).
CHANGELOG: **+0.1**

### ONDA 5 — recursos de operação (bloco D)

### Subetapa 03.16 — Alertas clínicos derivados da anamnese [Goal] [Manual] [LLM: Opus] · P-sub
Objetivo: item 5 — alertas fixos no cabeçalho da ficha ("Hipertenso", "Risco de hemorragia"), derivados de `aba_health.respostas_anamnese`. **É segurança do paciente, não conveniência**, e nenhuma das três versões de UX previa o elemento.
Conclusão: a resposta de anamnese que caracteriza risco produz o alerta, e ele acompanha a ficha em toda tela clínica.
Qualidade: o alerta é derivado, nunca digitado — mudar a resposta muda o alerta. A regra de derivação vive em tabela do módulo, não em código, para a clínica poder ajustá-la sem deploy (a mesma pendência já aberta para o vocabulário dos mapas clínicos). Anamnese incompleta não gera alerta falso: a migration `034` já exige anamnese completa, e ausência registrada é informação, enquanto ausência não registrada é lacuna disfarçada de informação. A leitura passa pelas funções `ler_*()` com log.
Evidência: alerta nascendo e sumindo com a mudança da resposta + casos de ataque novos na suíte.
Esforço máximo do /goal: 5 tentativas · Escalonamento: Opus do início ao fim.
CHANGELOG: **+1.0**

### Subetapa 03.17 — Painel como lista de tarefas + estados vazios + exportação [Goal] [Manual] [LLM: Sonnet]
Objetivo: itens 12 e 17 — painel como lista de tarefas acionáveis (confirmar / reagendar / receber), **não de gráficos**, e estados vazios instrutivos mais exportação para Excel.
Conclusão: cada pendência do painel tem o seu botão e leva à ação; nenhuma tela vazia sem instrução do que fazer.
Qualidade: por D5, esta subetapa entrega **o mecanismo e o conteúdo** — quais pendências aparecem, com que regra, em que ordem —, e a **forma** fica concentrada na 03.22. O painel do líder de mercado não tem um único gráfico na aba principal, e o dossiê de UX chegou ao mesmo desenho por caminho independente. Todo contador sobre `aba_health` declara o alcance antes de contar (regra da 03.5).
Evidência: print do painel com pendências reais e clicáveis + um estado vazio de cada família.
Esforço máximo do /goal: 4 tentativas · Escalonamento: Sonnet nas 3 primeiras; Opus na última.
CHANGELOG: **+0.1**

### Subetapa 03.18 — Régua de cobrança, campanhas, template e cota [Goal] [Manual] [LLM: Sonnet]
Objetivo: itens 13, 16, 14 e 15. Régua de cobrança como **linha do tempo** (verde antes → amarelo no vencimento → vermelho depois), cada ponto pendurando uma regra — a melhor peça de UX do corpus do benchmark; campanhas por receita pronta (aniversário, retorno, pós-operatório) com **contagem de alcance antes do envio**; editor de template com variáveis como fichas coloridas no texto, prévia ao vivo e contador; e cota de mensagem declarada no plano em vez de créditos opacos.
Conclusão: a régua dispara pelas regras configuradas nos pontos certos; a campanha mostra quantas pessoas serão atingidas antes de enviar; a cota aparece ao lado do estado da conexão do WhatsApp.
Qualidade: a régua vive em `aba_automations` e lê `aba_finance` — nenhum estado financeiro é recalculado nela. A contagem de alcance é obrigatória **antes** do envio, não relatório depois: é o que impede disparo em massa por engano. A cota declarada resolve a precificação da janela de 24h e é o modelo Weave; nunca cobrar o WhatsApp à parte (decisão de precificação do `RELATORIO.md` §6). A superfície da Meta segue congelada por decisão de Max — o que depender de envio real fica registrado como não exercido, com o motivo, no padrão honesto que a 02.10 já usa.
Evidência: régua percorrendo os três estados + contagem de alcance conferida contra query + prévia do template.
Esforço máximo do /goal: 5 tentativas · Escalonamento: Sonnet nas 3 primeiras; Opus nas 2 últimas.
CHANGELOG: **+1.0**

### Subetapa 03.19 — Link público de agendamento [Goal] [Manual] [LLM: Sonnet] · P-sub
Objetivo: item 10 — link público de agendamento, entrando como **solicitação a confirmar**, nunca direto na agenda. Os cinco concorrentes brasileiros têm.
Conclusão: a solicitação nasce pendente, aparece para a recepção confirmar, e só então vira agendamento sujeito às regras de expediente e sobreposição que já existem.
Qualidade: **endpoint público → P-sub obrigatório**, com o mesmo freio por token da 03.10 — a solicitação não pode ser instrumento de enchimento da agenda alheia. A verificação de expediente e a restrição de exclusão por intervalo continuam sendo do banco; a solicitação não as contorna por vir de fora. Nenhum dado de outra conta é inferível pelo link.
Evidência: solicitação criada de fora, confirmada pela recepção, e a recusa por força bruta de token.
Esforço máximo do /goal: 4 tentativas · Escalonamento: Sonnet nas 3 primeiras; Opus na última.
CHANGELOG: **+1.0**

### Subetapa 03.20 — Estoque: alertas e validade [Goal] [Manual] [LLM: Sonnet]
Objetivo: item 20, no recorte que o `RELATORIO.md` §5.2 recomenda — **alertas e validade primeiro**, porque é o que sustenta o argumento de conformidade sanitária. Itens com `validade` e `quantidade_minima`, e vencimento de serviço de terceiro (calibragem, manutenção, contrato), com job de alerta.
Conclusão: o alerta de validade, de estoque mínimo e de serviço vencendo aparece no painel de tarefas da 03.17 antes de virar problema.
Qualidade: **é conformidade sanitária, não gestão** — é o que evita a autuação no dia da fiscalização, e essa é a tese que reposiciona o módulo. Separar **item de catálogo** de **lote em estoque** (um para muitos, diretriz A8): achatar os dois obriga a repetir o mesmo produto por fabricante. `aba_people.fornecedores` já existe e é o vínculo. Entrada/saída, lote e o kanban de prótese ficam `+1.0`, e a tela declara isso em vez de fingir que já faz. Todo job novo de `pg_cron` nasce com `account_id` no `WHERE` — vetor herdado da 02.15.
Evidência: alerta disparando para os três casos + query do job conferindo o `account_id`.
Esforço máximo do /goal: 4 tentativas · Escalonamento: Sonnet nas 3 primeiras; Opus na última.
CHANGELOG: **+1.0**

### Subetapa 03.21 — Tabela de métricas por CRM-filho [Goal] [Manual] [LLM: Sonnet]
Objetivo: item 21 — tabela de métricas agregando na origem, pronta para a plataforma **Aurora** consolidar quando existir. Métricas: faturamento; clientes ativos; profissionais; procedimentos por categoria; taxa de falta; taxa de falta na primeira consulta, separada; ocupação da agenda; conversão de orçamento; inadimplência; mensagens enviadas.
Conclusão: a série temporal existe e permite correlação local (o uso imediato, e o melhor argumento de venda da tabela), sem nenhuma linha de dado pessoal.
Qualidade — **três travas:** (1) a tabela guarda **contagem e categoria, nunca linha de dado**. Não é anonimização, que é reversível e dá trabalho provar — é **agregação na origem**, estruturalmente incapaz de vazar dado personalíssimo em vez de apenas proibida de fazê-lo, e é essa distinção que sustenta a frase do Termo de Uso; (2) a cláusula do Termo de Uso nomeia **quais** métricas, não "métricas de uso"; (3) métrica agregada de clínica ainda é segredo de negócio dela — o consolidado entre CRMs-filhos é seguro, mas o dado individual por clínica passa pela mesma régua do resto (`access.can()`, nunca "quem tem a URL do painel"). **Sobre a posição na fila:** o argumento de que este item "não dá para adiar" é sobre não adiar **para depois da venda** — retroajustar coleta em N instâncias vendidas é migração coordenada em N bancos. Nada está vendido e o item sai dentro do MVP; adiantá-lo mediria o que ainda não existe (taxa de falta depende da 03.4, conversão de orçamento depende da 03.8).
Evidência: série temporal com as dez métricas + prova de que nenhuma coluna aceita identificador de pessoa.
Esforço máximo do /goal: 4 tentativas · Escalonamento: Sonnet nas 3 primeiras; Opus na última.
CHANGELOG: **+1.0**

---

## ETAPA 03 · ETAPA 3 DO ROTEIRO — ESCOLHER E IMPLANTAR A UX

### Subetapa 03.22 — Implantação da UX Versão 03 [Goal] [Manual] [LLM: Sonnet]
Objetivo: implantar a **Versão 03** (`design/ux/versoes/`, decidida por Max em 2026-09-03) mais os cinco acréscimos do `RELATORIO.md` §7 — tela de orçamento, odontograma como padrão de tela novo, alertas clínicos no cabeçalho da ficha, consentimento de imagem visível e indicador de cota de mensagem. É a maquiagem final, aplicada depois do MVP porque há interface funcionando em 16 rotas para recebê-la.
Conclusão: as rotas na forma da Versão 03, com a forma final dos itens 12, 13 e 17, cujo mecanismo e conteúdo saíram em 03.17 e 03.18.
Qualidade: o orçamento de peso de `design/ux/06_ORCAMENTO_DE_PESO.md` §4 continua respeitado depois da conversão — nenhuma biblioteca de gráfico (SVG inline já resolve, e é a decisão de arquitetura mais valiosa desta frente), nenhuma de calendário, de animação ou date picker. A identidade ratificada em `docs/04` §5 não é negociada: raio 8px, separação por borda de 1px e não por sombra, `IBM Plex Mono` como vocabulário de metadado. A paleta de comandos da Versão 02 continua backlog, não caminho descartado.
Evidência: capturas das rotas convertidas ao lado das telas de `design/ux/versoes/telas/` + bundle dentro do teto.
Esforço máximo do /goal: 5 tentativas
Escalonamento de LLM: Sonnet nas 3 primeiras; Opus nas 2 últimas.
Se esgotar: parar e emitir relatório curto.
CHANGELOG: **+1.0**

---

## ETAPA 03 · ETAPA 4 DO ROTEIRO — TESTE ADVERSARIAL DO MVP

### Subetapa 03.23 — Portão de segurança adversarial do MVP [Manual] [LLM: Opus] · PORTÃO COMPLETO
Objetivo: terceiro portão completo desta Etapa e quarto do projeto, no molde de 01.8, 02.15 e 03.15 — os 7 passos sobre o MVP inteiro, agora com a superfície que os portões anteriores não cobriram.
Conclusão: os 7 passos executados em bench isolado; relatório final com parecer explícito.
Qualidade — os sete vetores que Max nomeou: **segurança de dados** (RLS de toda tabela nova, `aba_health` com regime próprio, injeção em toda RPC nova); **token e link** (todos os vetores da 03.15, reexercidos sobre a superfície final); **bucket e Storage** (leitura de anexo sem concessão, URL assinada vazando, `allowed_mime_types` e `file_size_limit` como segunda camada); **núcleo de permissão** (usuário com duas contas lendo dado da conta inativa, e módulo fora do plano visível ao `owner`); **automação** (todo job novo de `pg_cron` conferido quanto ao `account_id` no `WHERE`); **navegabilidade e caminho infeliz** (rota fora do caminho feliz, estado impossível, XSS armazenado contra a UI real); **kanban e máquina de estados** (transição pulada, estado revertido, contrarreferência aceita duas vezes). Todo achado — explorável ou não — vira entrada em `handoffs/instrucoes.md`; toda falha real vira item `[Goal]` com Conclusão, Qualidade e Esforço máximo declarados.
Evidência: relatório do bench + parecer explícito.
Esforço máximo: sem teto — é auditoria.
Escalonamento de LLM: Opus do início ao fim.
**O CODE nunca executa o merge por conta própria, mesmo com parecer 100% favorável** (`CLAUDE.md` §13).
CHANGELOG: **+0.1**

(… 03.n conforme necessário. Subetapa nova de escopo entra **antes da 03.23**, para que o portão adversarial continue sendo o último passo da Etapa. O sufixo de letra — 03.7.a, por exemplo — é o padrão para inserir subetapa sem renumerar as seguintes, que já estarão referenciadas em commits e em entradas de `handoffs/instrucoes.md`.)

---

## Pendências vigiadas — recorte da Etapa 03

Lista completa e permanente em `docs/00_PLANO_E_CRITERIOS.md` → "Pendências vigiadas". Aqui só as que travam, informam ou nasceram de uma subetapa `03.n`.

- [ ] **Matriz Bronze/Prata/Ouro/Diamante — qual módulo e qual funcionalidade entra em cada nível** — gatilho: decisão de Max, no momento que ele julgar correto, e não antes. **Não é bloqueio da Etapa 03.** A Subetapa 03.9 constrói o *mecanismo* (a camada de plano consultada antes do atalho de `owner` em `access.can()`), que nasce com todos os níveis liberando tudo; preencher a matriz depois é dado, não código.
- [x] **FECHADA em 2026-09-03 — Max autorizou.** `CLAUDE.md` §14 passou a nomear o CRM Sindcom como fonte de porte para comunicação externa por token, com o mesmo estatuto do Maximus. **A Subetapa 03.10 está desbloqueada.**
- [ ] **Colisões com `CLAUDE.md` §15 encontradas no benchmark (diretriz P1)** — gatilho: decisão de Max sobre escopo. Duas: agente de IA 24h no WhatsApp e certificação SBIS/CFM (item 33, futuro). Reportadas, não planejadas; nenhuma das duas está em subetapa da Etapa 03. O odontograma da 03.7 traz HL7 FHIR R4 de graça, que é vocabulário útil se a certificação entrar um dia.
- [x] **FECHADA na Subetapa 03.0 — virou pré-requisito, não melhoria (diretriz P2).** A divisão por rota deixou de ser acabamento e virou pré-requisito da 03.7 (odontograma, 426 KB gzip). Institucionalizada como Subetapa 03.3, **executada em 2026-09-03**.
- [ ] **Consentimento de uso de imagem trava a exibição, não o envio — e trava para todos** — gatilho: prova de fogo com profissional real. Decisão de Max (2026-08-08): manter como está. Se a 03.5 confirmar o incômodo, a correção certa não é liberar geral: é separar "posso documentar" (consentimento de tratamento de dados) de "posso divulgar" (uso de imagem, para exportação e publicação). **Candidata a considerar ao desenhar a Subetapa 03.5**, sem que isso mude a decisão já tomada.
- Definição normativa do **Portão de segurança adversarial obrigatório** (os 7 passos que 03.9, 03.15 e 03.23 seguem) mora só em `docs/00_PLANO_E_CRITERIOS.md` → Pendências vigiadas — não duplicada aqui por ser longa e estável; abrir o docs/00 quando for executar um dos três portões completos.
