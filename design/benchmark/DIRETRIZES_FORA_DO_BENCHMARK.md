# Diretrizes que nasceram aqui, mas pertencem a outro lugar

Este bench é de **benchmark e design**. No caminho, apareceram diretrizes que são importantes e
**não são deste assunto** — são de arquitetura, de compliance, de plano de execução ou de
estratégia comercial.

Elas ficam registradas aqui para não se perderem, com **o destino sugerido em `main`**. Nada
deste arquivo foi aplicado fora de `design/benchmark/`: quando o trabalho de benchmark encerrar,
Max decide o que sobe, para onde e quando.

**Nenhum item abaixo é ordem de implementação.** São apontamentos com endereço.

---

## 1. Arquitetura e modelo de dados

| # | Diretriz | Destino sugerido | De onde veio |
|---|---|---|---|
| A1 | **A corrente `catálogo → odontograma → orçamento → contrato/financeiro`** é uma unidade de desenho, não quatro recursos. O orçamento é o elo que falta e o mais crítico. | `docs/02_MODELO_DE_DADOS.md` — schema novo entre `aba_catalog` e `aba_finance` | vídeos SD06, SD12, CT09 |
| A2 | **Token de acesso externo** (`token`, `token_expira_em`, `token_revogado_em`, `tentativas_*` com motivo enumerado) é infraestrutura **compartilhada** por três recursos: caixa de entrada de exames, assinatura do paciente e envio de prontuário. Construir uma vez. | `docs/01_ARQUITETURA.md` | ideias de Max 1–3 + padrão do CRM Sindcom |
| A3 | **Tabela de métricas nasce com o CRM-filho.** Retroajustar coleta em N instâncias vendidas é migração coordenada em N bancos. | `docs/02_MODELO_DE_DADOS.md` + `docs/01_ARQUITETURA.md` §5 | ideia de Max 6 |
| A4 | Falta o valor **`faltou`** (e provavelmente `sala_de_espera`) no enum de status de `aba_scheduling.agendamentos`. Sem ele não existe taxa de falta — o KPI que todo concorrente destaca. | `db/migrations/` — uma linha | vídeo CT10 |
| A5 | **Ausência de policy em `storage.objects` não nega: faz sumir.** Com RLS ligada e zero policies, o `authenticated` inteiro fica de fora e o erro é `"Object not found"` — que parece arquivo inexistente, não permissão negada. | `handoffs/instrucoes.md` §5 (armadilha medida) | `CRM-Sindcom/sql/21_remessas_recepcao.sql` |
| A6 | **Freio de endpoint público conta por token, nunca pela entidade.** Travar a entidade permite que um atacante silencie um usuário legítimo só errando token de propósito. | `handoffs/instrucoes.md` + `docs/05_COMPLIANCE_E_ETICA.md` | idem |
| A7 | **Componente de kanban serve a dois módulos:** funil de vendas (`aba_sales.etapas_funil`, que já temos) e controle protético (5 etapas com cor de atraso). Construir genérico. | `docs/01_ARQUITETURA.md` §7 | vídeo CF18 |

---

## 2. Compliance, ética e jurídico

| # | Diretriz | Destino sugerido | De onde veio |
|---|---|---|---|
| C1 | **Lei 13.787/2018, Art. 6º: guarda mínima de 20 anos** do prontuário. A política de retenção do Vitrine precisa ser explícita e não pode repetir o que o líder de mercado faz (30 meses após bloqueio, depois exclusão sem backup). | `docs/05_COMPLIANCE_E_ETICA.md` | rodada 1, termo de uso do concorrente |
| C2 | **Art. 18, I do Código de Ética Odontológica:** negar ao paciente acesso ao prontuário, ou deixar de fornecer cópia quando solicitada, **é infração ética**. A exportação não é conveniência — é cumprimento de dever do cliente. | `docs/05_COMPLIANCE_E_ETICA.md` | rodada 1 + ideia de Max 3 |
| C3 | **Art. 14, III e Art. 44, VI do CEO:** exibir imagem ou identificar paciente exige consentimento livre e esclarecido. `aba_health.consentimentos` já existe e **não tem tela** — a trava precisa ser visível onde a foto é publicada. | `docs/05` + `docs/04` (UI) | rodada 1 |
| C4 | **Residência do dado é argumento comercial, não só técnico.** O 2º colocado do mercado declara hospedar dado sensível de saúde brasileiro nos EUA por prazo indeterminado. A escolha de região do Supabase deve ser decisão declarada. | `docs/01_ARQUITETURA.md` + página de venda | rodada 1 |
| C5 | **A tabela de métricas agrega na origem, não anonimiza depois.** Guardar só contagem e categoria torna o vazamento de dado personalíssimo estruturalmente impossível, em vez de proibido por política. A cláusula do Termo de Uso deve nomear **quais** métricas. | `docs/05_COMPLIANCE_E_ETICA.md` + Termos de Uso | ideia de Max 6 |
| C6 | **Métrica agregada de clínica ainda é segredo de negócio dela.** O consolidado entre CRMs-filhos é seguro; o dado individual por clínica precisa da mesma régua de acesso do resto. | `docs/05` | ideia de Max 6 |
| C7 | **IA em dado clínico: a IA propõe, o humano aplica.** O concorrente já faz assim (ditado por voz abre tabela de revisão antes de gravar no odontograma). Deve virar regra escrita, não escolha de implementação. | `docs/05_COMPLIANCE_E_ETICA.md` | vídeo CT07 |
| C8 | **PGRSS e POP são exigência sanitária de toda clínica odontológica**, não burocracia opcional. Um módulo que rastreia validade de POP, PGRSS e contrato de terceiro toca conformidade, não gestão. | `docs/05` + backlog de produto | ideia de Max 5 + pasta de referência |
| C9 | **Instrumento de triagem nunca é diagnóstico.** Se questionário de dor orofacial (ou similar) entrar, entra como coleta estruturada que apoia a avaliação, com a ressalva visível na tela. | `docs/05_COMPLIANCE_E_ETICA.md` | `REPOS.md` §3 |

---

## 3. Plano, escopo e processo

| # | Diretriz | Destino sugerido | De onde veio |
|---|---|---|---|
| P1 | **Colisões com `CLAUDE.md` §15** encontradas no benchmark: agente de IA 24 h no WhatsApp (item 25 do §5 c) e certificação SBIS/CFM. Reportadas, não planejadas — entrar ou não é decisão de Max. | `docs/00_PLANO_E_CRITERIOS.md` → Pendências vigiadas | §5 (c) |
| P2 | **A divisão por rota de `design/ux/06_ORCAMENTO_DE_PESO.md` vira pré-requisito**, não melhoria: o odontograma pesa 426 KB gzip e não pode entrar no bundle inicial. | `docs/00_PLANO_E_CRITERIOS.md` — ordem das subetapas | `REPOS.md` §1 |
| P3 | **Migração de dados é objeção de venda antes de ser recurso técnico.** O concorrente vende "importação em 3 dias" e tem assistente próprio para isso. | `docs/00` + backlog comercial | vídeo CF13 |
| P4 | **O CRM Sindcom é fonte de porte, não só de inspiração.** As peças de token/remessa/recepção estão em `sql/20_comunicacao_externa.sql` e `sql/21_remessas_recepcao.sql`, com as lições de falha nos comentários. Mesmo tratamento que `CLAUDE.md` §14 dá ao Maximus: **portar a lógica, traduzir os nomes**. | `CLAUDE.md` §14 (estender) + `db/migrations/README.md` | ideia de Max 1 |

---

## 4. Estratégia comercial e validação

| # | Diretriz | Destino sugerido | De onde veio |
|---|---|---|---|
| E1 | **Programa de teste com a universidade.** Dois grupos: dentistas convidados (acesso vitalício) e alunos num estudo de desenvolvimento tecnológico (desconto vitalício escalonado — 100% TOP 3, 50% TOP 10, 50% por 12 meses TOP 15), com curso, palestra e certificado de horas. Cinco eixos de questionário: funcionalidades · UX/UI · segurança · facilidade de backup e migração · outros. | plano de validação, fora de `docs/` — merece arquivo próprio quando a etapa chegar | ideias de futuro de Max |
| E2 | **Dois reparos antes de executar o E1:** (a) estudo com aluno e questionário pode exigir comitê de ética se virar publicação — confirmar com a instituição antes de prometer certificado; (b) **teste com aluno não pode tocar paciente real** — o ambiente precisa nascer com dado de demonstração, senão prontuário real entra em sistema de teste operado por quem ainda não é profissional habilitado. | idem | análise desta sessão |
| E3 | **Decidir conscientemente sobre receita secundária.** Os dois líderes têm uma: marketplace de parceiros (Clinicorp) e **anúncio de terceiro dentro do modal de evolução clínica** (Simples Dental), que também **retém o dinheiro do boleto do cliente** antes do saque. A primeira é defensável; as outras duas não. | posicionamento comercial | `VIDEOS.md` |
| E4 | **Publicar o preço da IA.** O mercado inteiro esconde — faixa observada R$ 180–437/mês. Publicar é diferencial de posicionamento com custo zero. | página de venda | `RELATORIO.md` §6 |
| E5 | **O flanco jurídico é o argumento de venda que ninguém usa.** `aba_health` com IBAC, `log_acesso` obrigatório em leitura e escrita e consentimento de imagem já estão construídos e não aparecem em lugar nenhum. | página de venda | `RELATORIO.md` §6 |

---

## 5. Fontes externas ainda não incorporadas

| Fonte | Onde está | Situação |
|---|---|---|
| **CRM Sindcom** | `github.com/AuroraIAOS/CRM-Sindcom` | **Estudado** nesta sessão para o padrão de token/remessa. Nada copiado. As peças a portar estão em A2, A5, A6 e P4. |
| **Pasta `Odonto_CEO`** | disco local de Max | **Lida** nesta sessão. **Nada copiado** — Max determinou que a lista do que é aproveitável seja apresentada e aprovada antes. A lista está na resposta desta sessão; o registro entra em `fontes/IDEIAS_MAX.md` só depois da decisão dele. |
| **`fontes/procedimentos.txt`** | já no repo | 84 procedimentos da Atenção Básica, postos por Max. Semente do catálogo (item 4 de `IDEIAS_MAX.md`). |
