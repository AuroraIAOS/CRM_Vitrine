# PLANO_E_CRITERIOS — CRM Vitrine

## Princípio-guia
Entregar um MVP em uma semana é sempre melhor que passar uma eternidade construindo algo surreal.
Foco: fatia vertical funcional (100% verde) antes de qualquer sofisticação.

## Idea lock (fechado no estágio criativo)
- Problema/persona: Max precisa vender CRMs configurados por cliente rápido, sem repetir a dificuldade operacional (VPS/Docker/Evolution GO) que travou o CRM Maximus.
- Escopo do MVP (dentro): núcleo de conta/RBAC; `aba_people` (pessoas unificadas); `aba_catalog`; `aba_scheduling`; `aba_finance`; `aba_health`; `aba_messaging` (Meta Cloud API); `aba_sales`; `aba_automations`; `aba_ai` (bring-your-own-key); deploy estático + FTP.
- Fora do MVP (depois): Evolution GO; RAG versionado em arquivo; CLI de clonagem automatizada; `HaveIBeenPwned`.
- Stack essencial v01: Vite + React 18 + TS + PWA; Supabase (Postgres/Auth/RLS/Storage/Edge Functions); `pg_cron`; deploy build+FTP em hospedagem compartilhada.
- Coração do modelo de dados: `aba_people.pessoas` (tabela-mãe, chave compartilhada com `leads`/`clientes`/`funcionarios`/`fornecedores`); padrão RLS `is_account_member() + access.can()` em todo schema `aba_*`.
- Restrições inegociáveis (compliance/ética/segurança): RLS ativa e testada em toda tabela; prontuário só via concessão explícita + log de acesso; segredo de conta sempre criptografado em repouso; nenhuma credencial commitada.
- Decisões pendentes p/ Etapa 01:
  - Tradução coluna a coluna de `aba_catalog`, `aba_scheduling`, `aba_finance`, `aba_health`, `aba_messaging` a partir do mapa em `docs/02_MODELO_DE_DADOS.md` §7 (nomes de tabela já decididos, DDL completo é execução).
  - RLS detalhada de `aba_sales`, `aba_automations`, `aba_ai` (padrão já definido, política por tabela é execução).
  - Ciclo de estados completo de `automacoes`/`fluxos` e `faturas`/`pagamentos` — herdar das migrations originais do Maximus.
  - Política de retenção de `log_acesso` (prontuário) — prazo mínimo legal a confirmar por jurisdição do cliente.

---

## Convenção `0X.0` — revisão de plano no início de toda Etapa

**Regra permanente, válida para a Etapa 01 e para toda Etapa futura (02, 03, e as etapas de versionamento que vierem depois dela):** a primeira subetapa de cada Etapa é sempre uma subetapa `0X.0 — Leitura de Referências e Revisão do Plano`, executada em `[Plan Mode]`, antes de qualquer subetapa de execução daquela Etapa. Ela relê os repositórios de referência relevantes ao escopo que se abre, confere se as decisões registradas no plano ainda batem com a realidade do repositório e do código, e revisa `docs/00_PLANO_E_CRITERIOS.md` à luz do que a Etapa anterior deixou pronto. Isso vale mesmo quando a Etapa nasceu de um documento já revisado no estágio criativo — o plano pode ter ficado desatualizado entre o fechamento do documento e o início da execução.

Instância desta regra na Etapa 01: **Subetapa 01.0**, abaixo. As instâncias nas Etapas 02 e 03 (**Subetapa 02.0**, **Subetapa 03.0**) seguem o mesmo objetivo, adaptado ao escopo de cada uma — ver cada Etapa.

---

# ESTÁGIO PRÁTICO (executado no Claude CODE)

## ETAPA 01 — PLANEJAMENTO E ESTRUTURAS
Objetivo geral: portar e reorganizar o schema do CRM Maximus, deixar toda a fundação desenhada, conectada, testada, aprovada e versionada. Gerar HANDOFF_BUILD ao final.
Modo predominante: [Plan Mode]
Portão de entrada: repositório com fundação documental completa (7 docs + 3 handoffs + `CLAUDE.md` + `CHANGELOG.md`), sem subetapa de código iniciada. Prova: `git log` mostra só o commit inicial da fundação.
Portão de saída: todos os schemas do MVP aplicados no Supabase do projeto, RLS testada 100% verde em cada um, varredura de segredos zerada, portão de segurança adversarial executado com parecer registrado, e `HANDOFF_BUILD.md` preenchido. Enquanto vermelho, nenhuma subetapa da Etapa 02 pode abrir.
Observações: nada destrutivo sem aprovação; commit com prefixo padronizado (feat/fix/docs/chore/refactor/test) + push ao fim de cada subetapa; sessão separada das demais etapas.

### Subetapa 01.0 — Leitura de Referências e Planejamento da Etapa 01 [Plan] [LLM: Opus]
Objetivo: Ler repositórios de referência (CRM Maximus = https://github.com/AuroraIAOS/CRM_Maximus.git; CRM Sindcom = https://github.com/AuroraIAOS/CRM-Sindcom.git); construir arquivo `handoffs/instrucoes.md` conforme modelo do CRM Maximus; rever/atualizar este arquivo `docs/00_PLANO_E_CRITERIOS` e; elaborar plano de ação da Etapa 01.
Conclusão: repositórios avaliados; arquivo `handoffs/instrucoes.md` criado e arquivo `docs/00_PLANO_E_CRITERIOS` conferido; plano de ação apresentado.
Qualidade: nenhuma inconscistência ou divergência entre arquivos; `handoffs/instrucoes.md` seguindo modelo padrão do CRM Maximus; `docs/00_PLANO_E_CRITERIOS` apresentando número de tentativas do [goal] e indicação de escalagem de LLM (Haiku >> Sonnet >> Opus).
Evidência: relatório de informações útes dos repo de referência + `handoffs/instrucoes.md` e `docs/00_PLANO_E_CRITERIOS` publicados e atualizados.
Status: ✅ CONCLUÍDA

### Subetapa 01.1 — Bootstrap do repositório [Plan] [LLM: Sonnet]
Objetivo: inicializar projeto Vite+PWA+TS+Supabase, `.gitignore`/`.env` reais a partir dos `.example`, conexão com projeto Supabase confirmada.
Conclusão: `npm run dev` sobe local; client Supabase conecta e autentica um usuário de teste.
Qualidade: nenhuma credencial commitada; estrutura de pastas `src/` alinhada ao padrão do CRM Sindcom.
Evidência: print do app rodando local + query de teste retornando linha do `public.accounts`. **Adaptado na execução:** o schema núcleo (`public.accounts`) só é aplicado na Subetapa 01.2 — nesta subetapa o projeto Supabase tinha `public` vazio. A evidência de conectividade usou `auth.users` (schema de plataforma, existe em todo projeto Supabase, independente do schema aplicado): um usuário de teste foi criado via Admin API, autenticado de ponta a ponta pelo app real (login → dashboard → logout) e depois apagado. Ver `handoffs/instrucoes.md` §5.
Esforço máximo do /goal: 3 tentativas
Escalonamento de LLM: Sonnet nas 2 primeiras; Opus na última.
Se esgotar: parar e emitir relatório curto (problema + causas + alternativas).
Status: ✅ CONCLUÍDA

### Subetapa 01.2 — Núcleo + `aba_people` [Plan] [Accept] [LLM: Sonnet]
Objetivo: aplicar migrations do núcleo (`public`, `access`, `licensing`) e de `aba_people` completo (pessoas + 4 papéis + tags/notas/campos customizados + `converter_lead()`), conforme `docs/02_MODELO_DE_DADOS.md` §3.
Conclusão: todas as tabelas criadas; RLS ativa; `converter_lead()` testada (lead convertido mantém tags/notas); suíte de RLS portada do Maximus e adaptada passa 100%.
Qualidade: nenhuma FK quebrada; nomenclatura conforme `docs/02` §1 sem exceção não documentada; hardening equivalente às migrations `040`–`042`/`063`–`065`/`064`/`077` do Maximus já embutido no DDL inicial (ver `handoffs/instrucoes.md` §4).
Evidência: query mostrando pessoa com papel `lead` convertida para `cliente` mantendo `pessoa_id` e tags associadas; resultado da suíte de testes RLS.
Esforço máximo do /goal: 4 tentativas
Escalonamento de LLM: Sonnet nas 3 primeiras; Opus na última.
Se esgotar: parar e emitir relatório curto (problema + causas + alternativas).
Status: ✅ CONCLUÍDA — núcleo (`001_core_public.sql`, `002_core_licensing.sql`, `003_core_access.sql`) + `aba_people` (`004_aba_people.sql`) aplicados via MCP; hardening de privilégio de função (`005_harden_function_privileges.sql`) e de exposição/GRANT de schema (`006_expose_schemas_and_narrow_grants.sql`) aplicados na mesma subetapa, fechando dois achados reais medidos ao vivo (não hipotéticos) — ver `handoffs/instrucoes.md` §5. Suíte de RLS portada (`crm/tests/rls/`, fixture via `crm/scripts/seed_test_users.mjs`) — 11/11 testes verdes, incluindo `converter_lead()` idempotente com `pessoa_id`/tags/notas preservados e a prova da camada `access.can()` isolada de `is_account_member`.

### Subetapa 01.3 — Portar `aba_catalog`, `aba_scheduling`, `aba_finance` [Plan] [Accept] [LLM: Sonnet]
Objetivo: traduzir e aplicar as migrations dessas três schemas a partir do original do Maximus (mapa em `docs/02` §7 e `db/migrations/README.md`), ajustando FKs para `aba_people.clientes(id)`.
Conclusão: schemas aplicados; RLS testada; nenhuma referência a `customer_id` quebrada pela unificação de pessoas; `btree_gist` habilitada em `extensions` antes da restrição de exclusão por intervalo de `aba_scheduling`.
Qualidade: nomenclatura 100% português dentro do schema; hardening equivalente às migrations `067`/`068`/`071`/`078`/`079` do Maximus já embutido.
Evidência: query cruzando `aba_finance.contratos` → `aba_people.clientes` → `aba_people.pessoas` retornando a cadeia completa.
Esforço máximo do /goal: 4 tentativas
Escalonamento de LLM: Sonnet nas 3 primeiras; Opus na última.
Se esgotar: parar e emitir relatório curto (problema + causas + alternativas).
Status: ✅ CONCLUÍDA — `aba_catalog` (`008_aba_catalog.sql`, com `definir_variante_padrao()` já embutido), `aba_scheduling` (`009_aba_scheduling.sql`, com fuso único, restrições de exclusão por intervalo, verificação de expediente/folga e enfileiramento/cancelamento automático de lembretes já no DDL inicial), `aba_finance` (`010_aba_finance.sql` + `011_aba_finance_operations.sql`, com termos de contrato/parcelas, moeda BRL por padrão e as seis operações — `vender_plano`, `estornar_sessao`, `atualizar_status_fatura`, `marcar_faturas_vencidas`, `expirar_planos`, `planos_vencendo_em` — já no DDL inicial) aplicados via MCP, precedidos por `007_enable_btree_gist.sql` e fechados por `012_expose_new_module_schemas.sql`. Hardening dobrado desde a primeira migration em todo schema novo (GRANT estreito nunca `TRUNCATE`, `REVOKE ... FROM PUBLIC` *e* `FROM anon` em toda função, `ALTER DEFAULT PRIVILEGES` já dentro da migration que cria o schema — fechando a pendência que a Subetapa 01.2 tinha deixado registrada). **Decisão de escopo registrada:** o CHECK "profissional ativo exige funcionário" e a RPC de liga/desliga do Maximus (migration 075) ficaram de fora — dependem de um fluxo de convite→funcionário (migration 074) que o Vitrine ainda não construiu; só o desenho de FK (`profissionais.funcionario_id → aba_people.funcionarios`) foi portado. Ver `db/migrations/README.md` e `handoffs/instrucoes.md` §5. Suíte de RLS estendida (`crm/tests/rls/02_aba_catalog.spec.ts`, `03_aba_scheduling.spec.ts`, `04_aba_finance.spec.ts`) — 29/29 testes verdes, incluindo a cadeia `aba_finance.contratos → aba_people.clientes → aba_people.pessoas`, a restrição de exclusão por sobreposição de agenda (23P01), a falha fechada de agendamento sem expediente cadastrado (23514) e o isolamento admin+ de `regras_comissao`.

### Subetapa 01.4 — Portar `aba_health` [Plan] [Accept] [LLM: Sonnet]
Objetivo: traduzir e aplicar `aba_health`, preservando IBAC/ABAC (`concessoes_prontuario`, `log_acesso`) sem simplificação.
Conclusão: RLS testada com profissional sem concessão (deve falhar leitura) e com concessão (deve funcionar); toda leitura E toda escrita clínica gera linha em `log_acesso`.
Qualidade: nenhum atalho que permita `agent` genérico ler prontuário sem concessão; hardening equivalente às migrations `053`/`058`/`069`/`070`/`076` do Maximus já embutido (log por função nunca só por política; `FORCE ROW LEVEL SECURITY`; log cobrindo escrita, não só leitura; profissional exige funcionário ativo).
Evidência: teste de RLS mostrando os dois cenários (negado/permitido) + linha de log gerada para leitura e para escrita.
Esforço máximo do /goal: 4 tentativas
Escalonamento de LLM: Sonnet nas 3 primeiras; Opus na última.
Se esgotar: parar e emitir relatório curto (problema + causas + alternativas).
Status: ✅ CONCLUÍDA — `aba_health` aplicado via MCP em três migrations: `013_aba_health.sql` (schema, 7 tabelas, `aba_health.pode_acessar()` já com as três camadas — papel, permissão por módulo, atributo profissional + funcionário ativo (Maximus 076) —, `FORCE ROW LEVEL SECURITY`, leitura de conteúdo clínico só através de `ler_prontuario()`/`ler_evolucoes()`/`ler_respostas_anamnese()`/`ler_consentimentos()` com log obrigatório gravado na mesma transação (Maximus 053), escrita clínica logada por trigger em `criacao`/`atualizacao` (Maximus 070)), `014_aba_health_attachments_bucket.sql` (bucket privado `anexos-clinicos`, decisão por `pode_acessar_anexo()` em vez de "membro da conta", consentimento de imagem travando só a leitura — Maximus 069) e `015_expose_aba_health_schema.sql`. Suíte de RLS (`crm/tests/rls/05_aba_health.spec.ts`) — 8/8 testes verdes: cenário negado (agent sem concessão/atributo profissional), cenário permitido (concessão nominal, com contagem de log antes/depois provando o incremento), leitura direta de coluna clínica bloqueada por privilégio de coluna (42501, prova de que "leitura sem log é impossível"), escrita gerando log de criação e atualização automaticamente, evolução travada recusando alteração (23514), e a regra do Maximus 076 provada isolada: profissional ativo com funcionário ativo lê; desativar o funcionário revoga o acesso mesmo com `profissionais.ativo` continuando `true`. Suíte completa do projeto: 37/37 testes verdes. `typecheck` limpo; `get_advisors` (security) sem achado novo.

### Subetapa 01.5 — `aba_sales`, `aba_automations`, `aba_ai` (schemas novos) [Plan] [Accept] [LLM: Sonnet]
Objetivo: criar os três schemas novos conforme `docs/02` §4-6, com RLS no padrão `is_account_member + access.can`.
Conclusão: schemas aplicados; `access.modules` com as chaves `sales`/`automations`/`ai`; RLS testada.
Qualidade: `oportunidades` referencia `pessoa_id`, nunca `contact_id`.
Evidência: query criando oportunidade ligada a um lead não convertido e a um cliente já ativo, ambas funcionando.
Esforço máximo do /goal: 4 tentativas
Escalonamento de LLM: Sonnet nas 3 primeiras; Opus na última.
Se esgotar: parar e emitir relatório curto (problema + causas + alternativas).
Status: ✅ CONCLUÍDA — três schemas aplicados via MCP (`016_aba_sales.sql`, `017_aba_automations.sql`, `018_aba_ai.sql`, expostos por `019_expose_sales_automations_ai_schemas.sql`). `aba_sales` (funis/etapas_funil/oportunidades) já a partir do DDL de referência de `docs/02` §4. `aba_automations` e `aba_ai` traduzidos das tabelas soltas em `public` do Maximus (nunca modularizadas, ainda no modelo antigo `user_id`/`auth.uid()`) para o padrão `account_id` + `is_account_member` + `access.can()` — não porte 1:1, redesenho de autorização sobre a mesma lógica de negócio. Dois hardenings aplicados preventivamente na tradução: `automacao_logs` corrigida de uma política `FOR ALL` do Maximus (nome prometia só leitura) para só `SELECT`; `aba_ai.buscar_conhecimento_textual()` nasce `SECURITY INVOKER` desde o início, prevenindo de origem o vazamento entre contas que o Maximus só descobriu depois (GHSA-fg5p-2qc3-jmxr, migration 032 de lá). **Decisões de escopo registradas:** `pgvector`/busca semântica ficou de fora (already decidido no backlog de versionamento, alvo `+1.0`) — só o caminho lexical (`tsvector`/`ts_rank`) entrou; `claim_ai_reply_slot()` e as colunas de controle de resposta automática por conversa ficam para a Subetapa 01.6 (dependem de `aba_messaging.conversas`, que ainda não existe). Suíte de RLS ampliada (`crm/tests/rls/06_aba_sales.spec.ts`, `07_aba_automations.spec.ts`, `08_aba_ai.spec.ts`) — 57/57 testes verdes no projeto, incluindo a evidência da subetapa (oportunidade ligada a lead não convertido e a cliente ativo, ambas funcionando) e a prova de isolamento entre contas na busca textual de IA. `typecheck` limpo; `get_advisors` (security) sem achado novo além de um INFO esperado (fila `automacao_execucoes_pendentes` com RLS ativa e zero políticas — deny-by-default deliberado, server-only).

### Subetapa 01.6 — Portar `aba_messaging` + Meta Cloud API [Plan] [Accept] [LLM: Sonnet]
Objetivo: traduzir `aba_messaging` (contatos_canal, conversas, mensagens etc.), implementar Edge Function de webhook Meta com validação HMAC-SHA256. Search-first obrigatório (`CLAUDE.md` §11) na versão vigente da Graph API antes de escrever a primeira linha.
Conclusão: webhook recusa requisição não assinada; mensagem de teste recebida e persistida corretamente.
Qualidade: `ENCRYPTION_KEY`/`META_APP_SECRET` só em Edge Function, nunca expostos ao client; hardening equivalente às migrations `055`–`057` do Maximus já embutido (segredo de provedor nunca exposto pela API, webhook secret em hash, dedupe de evento com `account_id`).
Evidência: log da Edge Function mostrando rejeição de payload sem assinatura + aceite de payload assinado.
Esforço máximo do /goal: 5 tentativas (integração externa tende a exigir mais ajuste)
Escalonamento de LLM: Sonnet nas 3 primeiras; Opus nas 2 últimas.
Se esgotar: parar e emitir relatório curto (problema + causas + alternativas).
Status: ✅ CONCLUÍDA — *search-first* confirmado contra a documentação vigente da Meta antes de escrever código (Graph API v26.0, lançada 2026-07-29; assinatura `X-Hub-Signature-256` HMAC-SHA256 sobre o corpo bruto; handshake `GET` com `hub.mode`/`hub.verify_token`/`hub.challenge`). `aba_messaging` aplicado via MCP (`020_aba_messaging.sql`, 11 tabelas, expostas por `021_expose_aba_messaging_schema.sql`) absorvendo as tabelas que no Maximus ficaram soltas em `public` (contacts/conversations/messages/etc.), traduzidas do modelo antigo `user_id` para `account_id` + RLS de dois níveis. `supabase/functions/whatsapp-webhook/index.ts` implantado (`verify_jwt: false`, autenticação real por assinatura HMAC em tempo constante) — corrige `configuracao_whatsapp.verify_token` removida na tradução (o handshake é por app, não por número, vestígio do modelo antigo do Maximus). Hardening das migrations `055`–`057` do Maximus já embutido desde o início: segredo de provedor e token de acesso nunca legíveis por `authenticated` (nem por owner); dedupe de evento por `(account_id, provedor, id_externo)`; coluna de hash pronta para quando Evolution GO entrar. **Evidência (script `crm/scripts/test_webhook_meta.mjs`, 15/15 asserções verdes):** log real da função — `POST | 401 | .../whatsapp-webhook` para requisição sem assinatura e com assinatura inválida; `POST | 200 | .../whatsapp-webhook` para payload assinado corretamente, com a mensagem de teste persistida em `aba_messaging.mensagens` (contato/conversa criados via upsert) e reenvio do mesmo evento tratado como idempotente (não duplicou). **Achado de segurança registrado e decisão de Max:** `hub.verify_token` aparece em texto puro nos logs de acesso do Edge Function — comportamento do próprio protocolo da Meta (handshake por `GET` com query string), não falha da implementação; Max decidiu (2026-08-16) não rotacionar por ora — ver `handoffs/instrucoes.md` §5/§6. Suíte de RLS ampliada (`crm/tests/rls/09_aba_messaging.spec.ts`) — 65/65 testes verdes no projeto. `typecheck` limpo; `get_advisors` (security) sem achado novo.

### Subetapa 01.7 — Varredura de segredos [Plan] [LLM: Sonnet]
Objetivo: rodar `gitleaks detect` sobre todo o histórico do repositório antes de qualquer push que amplie esse histórico, fechando o item 11 da checklist de conformidade.
Conclusão: saída zero. Todo achado é ou removido do histórico (com aprovação explícita de Max, por ser operação destrutiva) ou suprimido por fingerprint com justificativa registrada em `handoffs/instrucoes.md` — nunca reescrita de histórico por reflexo.
Qualidade: nenhum segredo real (chave, senha, token) suprimido por engano — só placeholder de doc ou credencial de teste confirmada como tal.
Evidência: saída do `gitleaks detect --report-format json` anexada; se houver supressão, o `.gitleaksignore` (ou equivalente) versionado com o motivo.
Esforço máximo do /goal: 2 tentativas
Escalonamento de LLM: Sonnet na primeira; Opus na segunda.
Se esgotar: parar e emitir relatório curto (problema + causas + alternativas) — não seguir para a 01.8 com a varredura vermelha.
Status: ✅ CONCLUÍDA — `gitleaks` (8.30.1) não estava disponível no ambiente Windows; instalado via `winget install --id Gitleaks.Gitleaks -e` (pacote oficial do projeto upstream, ver `handoffs/instrucoes.md` §5). `gitleaks detect --source . --report-format json -v --redact` rodado sobre os 8 commits do histórico completo (`8bad058`…`7abcb92`): **`no leaks found`**, relatório JSON = `[]`. Nenhuma supressão por fingerprint necessária — nenhum `.gitleaksignore` criado, pois não houve achado (nem verdadeiro nem falso positivo). `git log --all --full-history -- .env` e `git ls-files | grep .env` confirmam que `.env` nunca foi rastreado pelo git em nenhum commit. Árvore de trabalho limpa (`git status --short` vazio) — nada pendente de commit que pudesse ampliar o histórico sem passar pela varredura.

### Subetapa 01.8 — Portão de segurança adversarial [Manual] [LLM: Opus]
Objetivo: executar o "Portão de segurança adversarial obrigatório" descrito na seção "Pendências vigiadas" abaixo, cobrindo todo o escopo aplicado nas subetapas 01.2–01.6, antes do primeiro deploy real (Etapa 02).
Conclusão: os 7 passos do portão executados em bench isolado (branch/worktree, nunca `main`); relatório final com parecer explícito (recomenda ou não recomenda trazer os avanços para `main`).
Qualidade: todo achado — explorável ou não — registrado em `handoffs/instrucoes.md` (seções 4 a 7, conforme a natureza); toda falha real corrigida vira item `[Goal]` com Conclusão/Qualidade/Esforço máximo declarados.
Evidência: relatório do bench + parecer. **O CODE nunca executa o merge do bench para `main` por conta própria — mesmo com parecer 100% favorável.** Ordenar o merge é atribuição exclusiva de Max (`CLAUDE.md` §13).
Esforço máximo: sem teto de tentativas — é auditoria, não `/goal` de implementação; roda até cobrir os 6 vetores mínimos da pendência vigiada.
Escalonamento de LLM: Opus do início ao fim — é a subetapa de maior risco da Etapa 01.
Status: ✅ CONCLUÍDA — bench `bench/01.8-seguranca-adversarial` (branch, não worktree: `.env`/`crm/.env.test` são arquivos reais gitignorados na raiz, e um worktree exigiria copiar segredos para uma segunda pasta). Os 7 passos executados. **35 ataques novos** escritos (`crm/tests/rls/10_adversarial_nucleo.spec.ts`, `11_adversarial_superficie.spec.ts`, `12_adversarial_webhook.spec.ts`), cobrindo os 6 vetores mínimos + LGPD/`aba_health` + fragilidade específica do Vitrine. **7 achados**, sendo **6 falhas reais exploráveis** — todas corrigidas e provadas (vermelho antes, verde depois) — e 1 não explorável, medido e aceito. Correções: `db/migrations/022_hardening_portao_adversarial.sql` (aplicada via MCP) + `whatsapp-webhook` v3 (implantada). Suíte final: **100/100 verdes** (65 originais sem regressão + 35 adversariais); `typecheck` limpo; `get_advisors` (security) sem achado novo; `gitleaks` `no leaks found`. Relatório e parecer em `docs/RELATORIO_01.8_PORTAO_ADVERSARIAL.md` — **parecer favorável ao merge**. O CODE entregou o parecer e parou, com `main` intocada em `d293951` (`CLAUDE.md` §13); **Max ordenou o merge em 2026-08-17**, executado em seguida por ordem dele (fast-forward, histórico linear preservado). `main` = `2ce1623`, alinhada ao Supabase (migration `hardening_portao_adversarial` aplicada, `whatsapp-webhook` v3); suíte revalidada no estado fundido — 100/100 verdes, `typecheck` limpo. Bench mantido no remoto como registro auditável.

#### Itens `[Goal]` gerados pelos achados da 01.8 (passo 4 do portão) — todos fechados nesta subetapa

- **[Goal] A01 — Tomada de conta por `INSERT` em `public.profiles` (CRÍTICO).** Conclusão: usuário sem perfil não consegue mais se inserir em conta alheia com papel arbitrário. Qualidade: a correção não depende de policy nova permissiva — nega por ausência de policy, e o trigger de coluna passa a cobrir `INSERT OR UPDATE` como segunda camada; `handle_new_user` e futuras RPCs de convite continuam funcionando. Esforço máximo: 3 tentativas. **Fechado em 1** — migration `022`, provado por `10_adversarial_nucleo.spec.ts`.
- **[Goal] A02 — `admin` reescrevia `public.accounts.owner_user_id` (ALTO).** Conclusão: a titularidade da conta não muda por `UPDATE` direto de nenhum papel. Qualidade: `admin` continua podendo editar o que é legitimamente configuração (nome da conta); só a coluna de titularidade fica travada. Esforço máximo: 2 tentativas. **Fechado em 1** — migration `022`.
- **[Goal] A03/A04/A05/A07 — Credencial legível pela API (ALTO/MÉDIO).** Conclusão: nenhuma das 8 colunas de credencial do banco é legível por `authenticated` ou `anon`; `service_role` mantém acesso. Qualidade: provado por controle negativo que o acesso legítimo não quebrou (`admin` lê a metadata do endpoint; `service_role` lê o segredo que precisa para assinar). Esforço máximo: 3 tentativas. **Fechado em 1** — migration `022`.
- **[Goal] A06 — Webhook da Meta cruzando fronteira de conta (MÉDIO/ALTO).** Conclusão: evento de status assinado só altera mensagem da conta resolvida pelo `phone_number_id`. Qualidade: provado contra a função **real implantada**, com assinatura HMAC verdadeira, não contra simulação da sentença SQL; as 15 asserções da evidência da Subetapa 01.6 continuam verdes. Esforço máximo: 3 tentativas. **Fechado em 1** — `whatsapp-webhook` v3.
- **[Não-achado] A08 — `public.rls_auto_enable()` executável por `anon`.** Objeto de plataforma do Supabase. Medido: `POST /rest/v1/rpc/rls_auto_enable` devolve `400 / 0A000 — cannot display a value of type event_trigger`; o corpo nunca executa. **Não explorável — aceito sem correção**, por decisão registrada de não mexer em objeto gerenciado pela plataforma. Reavaliar se o tipo de retorno mudar.

### Subetapa 01.9 — Geração do HANDOFF_BUILD [Plan] [LLM: Sonnet]
Objetivo: consolidar o que ficou 100% verde na Etapa 01 em `handoffs/HANDOFF_BUILD.md`, preenchendo os placeholders com o estado real (migrations aplicadas, artefatos, armadilhas conhecidas, primeiro passo da Etapa 02).
Conclusão: `HANDOFF_BUILD.md` sem placeholder `<...>` restante.
Qualidade: toda afirmação de "100% verde" no handoff é rastreável a uma evidência das subetapas 01.1–01.8.
Evidência: arquivo publicado + commit.
Esforço máximo do /goal: 2 tentativas
Escalonamento de LLM: Sonnet nas duas.
Se esgotar: parar e emitir relatório curto (problema + causas + alternativas).
Status: ✅ CONCLUÍDA — `handoffs/HANDOFF_BUILD.md` preenchido por inteiro (zero placeholder `<...>`), rastreando cada afirmação de "100% verde" à sua evidência: 22 migrations aplicadas (`db/migrations/001`–`022`, confirmadas via MCP `list_migrations` contra o projeto real), 100/100 testes de RLS verdes, webhook v3 no ar, bucket `anexos-clinicos` privado confirmado via `storage.buckets`, varredura de segredos zerada, portão adversarial com parecer favorável e merge executado. Seção "O que a Etapa 02 deve construir" com as 8 subetapas (02.0–02.7) resumidas a partir deste documento; seção de armadilhas puxando as entradas mais relevantes para quem constrói UI a partir de agora, incluindo as duas ressalvas herdadas da 01.8 (`select('*')` em tabela com narrowing, XSS armazenado como item obrigatório da 02.6).

---

## PORTÃO DE SAÍDA DA ETAPA 01 — ✅ ABERTO (2026-08-17)

Todas as condições do portão de saída declarado acima estão satisfeitas: todos os schemas do MVP aplicados no Supabase do projeto (núcleo + 9 schemas `aba_*`), RLS testada 100% verde em cada um (100/100 testes), varredura de segredos zerada (`gitleaks` `no leaks found`), portão de segurança adversarial executado com parecer registrado e merge ordenado por Max (`docs/RELATORIO_01.8_PORTAO_ADVERSARIAL.md`), e `HANDOFF_BUILD.md` preenchido sem placeholder. `main` = `c5f8e4f`, alinhada ao Supabase. **A Etapa 02 pode abrir.**

---

## ETAPA DE TRANSIÇÃO 1 → 2 — Registro de decisões de design [Plan] [LLM: Sonnet]

**Data:** 2026-08-18. Não é uma subetapa numerada (`0X.n`) — é o registro do trabalho feito entre o fechamento formal da Etapa 01 (01.9) e a abertura de fato da Etapa 02 (02.0), motivado por um evento fora do roteiro original: Max concluiu o estágio de design no Claude Design e entregou o pacote de wireframes antes da 02.0 rodar.

**Objetivo:** ler e interpretar por completo o pacote `design/wireframes-crm-sa-de-e-est-tica/` (16 telas), registrar as decisões de arquitetura/UI que ele obriga, e verificar se o fluxo de convite/funcionário/atributo profissional do Vitrine ainda bate com o que foi implantado no CRM Maximus — pergunta que Max fez diretamente ao ver as telas 1n/1o.

**Conclusão:**
- `docs/01_ARQUITETURA.md` §7 — navegação/ordem de módulo (ordem do wireframe vence, migration de realinhamento fica para a Etapa 02), login multi-conta adiado para `+1.0` (decisão de Max), perfis de UI 1n/1o mapeados sobre o RBAC existente (`agent`+atributo profissional / `admin`, sem papel novo), fluxo de convite→funcionário verificado migration a migration contra o CRM Maximus (018/019/074/075/076) — mesmo desenho de 5 passos, ponta final já portada desde a Subetapa 01.4, peças que faltam continuam deferidas conscientemente para a Etapa 02, mais uma regra nova (atributo profissional só para `agent`).
- `docs/04_DESIGN_E_MARCA.md` §5 — paleta, tipografia, radius/espaçamento/sombra, biblioteca de ícones (`lucide-react`) e padrões de componente ratificados a partir das 16 telas reais (não dos dois `_ds/*` do pacote, que não foram usados — comparação registrada em `handoffs/instrucoes.md` §5).
- `design/README.md` — inventário completo das 16 telas com módulo/componentes-chave.
- `docs/02_MODELO_DE_DADOS.md` — nota apontando a pendência de RPCs de convite/funcionário para quem for mexer em `aba_people.funcionarios`/`aba_scheduling.profissionais` na Etapa 02.
- `handoffs/instrucoes.md` §5 — dois registros novos (verificação do fluxo Maximus; descarte fundamentado dos `_ds/*`).

**Qualidade:** nenhuma decisão registrada como definitiva sem antes confirmar com Max os dois pontos que contradiziam o schema já aplicado (login multi-conta vs. `profiles.user_id UNIQUE`; papéis `PERFIS` do wireframe vs. `account_role_enum`) — ambos resolvidos por decisão explícita dele antes da escrita nos docs.

**Pendência que nasce daqui para a Etapa 02:** construir as RPCs de convite (`peek`/`resgatar`), o trigger de nascimento automático de funcionário e a RPC de liga/desliga do atributo profissional (com a regra nova "só `agent`") — ver `docs/01_ARQUITETURA.md` §7.4. Onde exatamente isso entra no roteiro de subetapas (dentro da 02.1 ou como subetapa própria) é decisão da **Subetapa 02.0**, não desta rodada.

**Evidência:** os 5 arquivos listados acima, publicados e commitados nesta mesma sessão.

---

## ETAPA 02 — CONSTRUÇÃO E DEPLOY DO MVP (v01 / fatia vertical)
Objetivo geral: construir a UI, semear dados de demonstração, testar e refazer até o MVP 100% verde e no ar. Gerar HANDOFF_UPGRADE ao final.
Modo predominante: [Manual Mode] + [Goal] (um /goal por subetapa)
Portão de entrada: `HANDOFF_BUILD.md` preenchido sem placeholder, Etapa 01 com portão de saída verde (schemas aplicados, RLS 100% verde, varredura de segredos zerada, portão adversarial com parecer registrado).
Portão de saída: fluxo ponta a ponta das subetapas 02.1–02.3 testado manualmente e funcionando; seed de demonstração populado; subdomínio no ar (02.4); varredura de segredos zerada de novo (o deploy pode ter introduzido `.env` de produção); portão de segurança adversarial reexecutado cobrindo a superfície nova da Etapa 02 (UI + deploy); `HANDOFF_UPGRADE.md` preenchido. Enquanto vermelho, a Etapa 03 não abre nenhuma subetapa além da 03.0.
Observações: coletar evidências; commit com prefixo padronizado + push ao fim de cada subetapa. Subetapas complexas podem rodar em sessões separadas (segurança + economia de tokens).

### Subetapa 02.0 — Leitura de Referências e Revisão do Plano da Etapa 02 [Plan] [LLM: Opus]
Objetivo: aplicar a convenção `0X.0` (ver seção acima) ao início da Etapa 02 — reler `HANDOFF_BUILD.md` e as decisões da Etapa 01 contra o estado real do repositório e do banco; reconsultar CRM-Sindcom quanto a padrões de UI/UX (componentes shadcn, formulários, tabelas) ainda não usados; revisar este documento à luz do que a Etapa 01 efetivamente entregou (schemas, nomes, funções) em vez do que fora planejado.
Conclusão: divergências entre o planejado na Etapa 01 e o aplicado de fato resolvidas ou explicitamente registradas; subetapas 02.1–02.4 confirmadas ou ajustadas; plano de ação da Etapa 02 apresentado a Max.
Qualidade: nenhuma subetapa 02.x referencia tabela/coluna/função com nome divergente do que foi realmente aplicado no Supabase.
Evidência: relatório curto de divergências (ou "nenhuma") + este documento atualizado, se necessário.
Esforço máximo do /goal: 2 tentativas
Escalonamento de LLM: Sonnet na primeira; Opus na segunda.
Se esgotar: parar e emitir relatório curto (problema + causas + alternativas).

### Subetapa 02.1 — CRUD de Pessoas (`aba_people`) [Goal] [Manual] [LLM: Sonnet]
Objetivo: tela de listagem/criação/edição de lead → conversão para cliente, com tags/notas/campos customizados visíveis e persistentes através da conversão.
Conclusão: fluxo completo testado manualmente: criar lead → adicionar tag/nota → converter → tag/nota continuam visíveis no cliente.
Qualidade: UI reaproveita componentes shadcn já usados no Sindcom.
Evidência: print do fluxo completo (lead com tag → cliente convertido com a mesma tag).
Esforço máximo do /goal: 4 tentativas
Escalonamento de LLM: Sonnet nas 3 primeiras; Opus na última.
Se esgotar: parar e emitir relatório curto (problema + causas + alternativas).

### Subetapa 02.2 — CRUD de Vendas (`aba_sales`) [Goal] [Manual] [LLM: Sonnet]
Objetivo: kanban de funil (etapas) com oportunidades arrastáveis, ligadas a pessoa.
Conclusão: criar/mover/fechar oportunidade funcionando; valor e etapa refletidos corretamente no banco.
Qualidade: nenhuma oportunidade sem `pessoa_id`.
Evidência: print do kanban com oportunidade movida entre etapas + query confirmando o estado.
Esforço máximo do /goal: 4 tentativas
Escalonamento de LLM: Sonnet nas 3 primeiras; Opus na última.
Se esgotar: parar e emitir relatório curto.

### Subetapa 02.3 — Mensageria (Meta Cloud API) [Goal] [Manual] [LLM: Sonnet]
Objetivo: tela de conversa recebendo/enviando mensagem via Meta Cloud API real (conta de teste).
Conclusão: mensagem enviada do CRM chega no WhatsApp de teste; mensagem recebida aparece na conversa em tempo real.
Qualidade: nenhuma credencial de canal exposta no client.
Evidência: print da conversa nos dois sentidos.
Esforço máximo do /goal: 5 tentativas (integração externa tende a exigir mais ajuste)
Escalonamento de LLM: Sonnet nas 3 primeiras; Opus nas 2 últimas.
Se esgotar: parar e emitir relatório curto.

### Subetapa 02.4 — Seed de demonstração + deploy [Goal] [Manual] [LLM: Sonnet]
Objetivo: popular `seed/` com dados fictícios cobrindo todos os módulos v01; build + deploy FTP em subdomínio de demonstração.
Conclusão: subdomínio no ar, navegável, com dados de demonstração em todos os módulos.
Qualidade: nenhum dado real de cliente no seed.
Evidência: URL do subdomínio + print de cada módulo populado.
Esforço máximo do /goal: 3 tentativas
Escalonamento de LLM: Sonnet nas 2 primeiras; Opus na última.
Se esgotar: parar e emitir relatório curto.

### Subetapa 02.5 — Varredura de segredos (pós-deploy) [Plan] [LLM: Sonnet]
Objetivo: repetir a varredura da 01.7 — o deploy real pode ter introduzido `.env.deploy`/credencial de FTP/registro novo no histórico.
Conclusão: saída zero, nas mesmas condições da 01.7.
Qualidade: idêntica à 01.7.
Evidência: saída do `gitleaks detect` anexada.
Esforço máximo do /goal: 2 tentativas
Escalonamento de LLM: Sonnet na primeira; Opus na segunda.
Se esgotar: parar e emitir relatório curto.

### Subetapa 02.6 — Portão de segurança adversarial (superfície da Etapa 02) [Manual] [LLM: Opus]
Objetivo: reexecutar o portão de segurança adversarial (mesmos 7 passos da 01.8), desta vez cobrindo a superfície nova — UI real, fluxo de autenticação de usuário final, deploy FTP, subdomínio público.
Conclusão: mesmos critérios da 01.8, aplicados à superfície da Etapa 02.
Qualidade: idêntica à 01.8.
Evidência: relatório + parecer. Merge para `main`/produção segue exclusivo de Max.
Esforço máximo: sem teto — auditoria.
Escalonamento de LLM: Opus do início ao fim.

### Subetapa 02.7 — Geração do HANDOFF_UPGRADE [Plan] [LLM: Sonnet]
Objetivo: preencher `handoffs/HANDOFF_UPGRADE.md` com o estado real do MVP no ar.
Conclusão: arquivo sem placeholder `<...>` restante; `CHANGELOG.md` com a entrada `+1.0` do lançamento.
Qualidade: toda afirmação rastreável a evidência das subetapas 02.0–02.6.
Evidência: arquivo publicado + commit.
Esforço máximo do /goal: 2 tentativas
Escalonamento de LLM: Sonnet nas duas.
Se esgotar: parar e emitir relatório curto.

(… 02.n conforme necessário — automações e IA entram como subetapas adicionais se o cronograma de venda permitir; não bloqueiam o lançamento do v01 comercial. Novas subetapas de escopo entram entre a 02.4 e a 02.5, para que a varredura de segredos e o portão adversarial continuem sendo os últimos passos antes do HANDOFF_UPGRADE.)

---

## ETAPA 03 — UPGRADES E VERSIONAMENTOS
Objetivo geral: melhorias, correções de bug e novas funcionalidades sobre o produto já lançado.
Versionamento: +0.1 = correções/melhorias | +1.0 = novas funcionalidades/serviços.
Modo predominante: definir por subetapa, conforme backlog abaixo.
Portão de entrada: `HANDOFF_UPGRADE.md` preenchido, MVP v01 no ar e 100% verde (portão de saída da Etapa 02 verde).
Portão de saída: não se aplica como bloco único — cada subetapa `03.n` é uma unidade de versionamento independente, com seu próprio critério 100% verde declarado no momento em que abre (backlog abaixo é só a fila, não o compromisso de escopo).
Observações: ao abrir qualquer subetapa `03.n`, aplicar primeiro a convenção `0X.0` (Subetapa 03.0, abaixo) se for a primeira subetapa depois de uma pausa longa ou de mudança relevante no repositório desde a última sessão de Etapa 03.

### Subetapa 03.0 — Leitura de Referências e Revisão do Plano da Etapa 03 [Plan] [LLM: Opus]
Objetivo: instância da convenção `0X.0` para a Etapa 03. Reler `HANDOFF_UPGRADE.md`, o backlog de versionamento e as pendências vigiadas; confirmar que o item do backlog a abrir ainda faz sentido frente ao estado real do produto e do primeiro cliente (se já houver); revisar este documento.
Conclusão: item do backlog escolhido confirmado ou reformulado; critério 100% verde daquele item declarado como subetapa própria antes de codificar.
Qualidade: nenhuma subetapa `03.n` aberta sem Conclusão/Qualidade/Evidência declaradas primeiro.
Evidência: subetapa `03.n` redigida neste documento antes do primeiro commit de código daquele item.
Esforço máximo do /goal: 2 tentativas
Escalonamento de LLM: Sonnet na primeira; Opus na segunda.
Se esgotar: parar e emitir relatório curto.

### Subetapa 03.1 — Evolution GO como módulo pago [Manual] [LLM: Opus]
Objetivo / Conclusão / Qualidade / Evidência: a definir quando o primeiro cliente contratar o canal — não abrir esta subetapa sem demanda real paga.

(… 03.n conforme necessário — cada uma passa primeiro pela 03.0 correspondente se a sessão for nova)

---

## Pendências vigiadas

- [ ] **Portão de segurança adversarial obrigatório antes de qualquer mudança de etapa ou deploy real** — gatilho: qualquer subetapa que implante em produção (deploy real). Motivo: existem categorias de falha que passam despercebida em revisão de código normal e na checklist funcional de `docs/05_COMPLIANCE_E_ETICA.md` (que prova que o comportamento *pretendido* funciona, não que não existe um caminho *não pretendido*). Este portão é o complemento adversarial daquele checklist — ataca de propósito em vez de só confirmar o caminho feliz. Risco de não fazer: falha de RLS, vazamento de dado clínico/pessoal ou sequestro de credencial descoberto em produção, por terceiro, em vez de aqui. **Institucionalizado como Subetapa 01.8 (fim da Etapa 01) e Subetapa 02.6 (fim da Etapa 02) — esta entrada permanece como a definição normativa dos 7 passos, referenciada por ambas.**
  - **1. Bench isolado:** abrir branch ou worktree dedicado, nunca commitado direto em `main` — zona de teste segura, sem risco para o histórico principal do repositório.
  - **2. Ataque deliberado**, cobrindo no mínimo: CRUD fora do que a role permite; tentativa de acesso direto ao banco/Supabase fora da camada de RLS; injeção de conteúdo malicioso (SQL, XSS armazenado, payload hostil em coluna `jsonb`); tentativa de burlar ou reescrever política de RLS; alteração de parâmetro ou valor padrão protegido (teto de assentos em `licensing`, valores de `enum`/`CHECK`); tentativa de sequestro de credencial do Supabase, do GitHub/repositório ou do VPS/Oracle; exposição indevida de dado pessoal (LGPD, com atenção redobrada a `health`); qualquer outra fragilidade específica do Vitrine que o teste revelar.
  - **3. Registro em `handoffs/instrucoes.md`:** todo achado (explorável ou não) vira entrada nas seções 4 ("Padrões e boas práticas herdadas"), 5 ("Problemas e soluções deste projeto"), 6 ("Armadilhas conhecidas") ou 7 ("Candidatos a promoção"), conforme a natureza do achado — no mesmo espírito da regra 10 do `CLAUDE.md` (nunca apagar entrada antiga).
  - **4. Plano de correção:** cada falha real vira item no formato `[Goal]` já usado neste documento — Conclusão, Qualidade e Esforço máximo (teto de tentativas de loop) declarados, para orientar a função `/goal`.
  - **5. Execução:** rodar o plano até 100% verde ou até esgotar o teto de tentativas declarado em cada item; o que não fechar vira relatório curto, não fica escondido.
  - **6. Relatório final:** parecer explícito — recomenda ou não recomenda trazer os avanços do bench para `main`.
  - **7. Regra permanente e não negociável: o CODE nunca executa esse merge por conta própria.** Mesmo com todos os testes 100% verdes e parecer final favorável. O CODE entrega o parecer e para — ordenar o merge é atribuição exclusiva de Max.
  - **Instância 01.8 executada em 2026-08-17** (6 falhas reais encontradas e corrigidas — ver Subetapa 01.8 e `docs/RELATORIO_01.8_PORTAO_ADVERSARIAL.md`). Esta entrada segue aberta porque a instância **02.6** ainda não rodou. Aprendizado a levar para a 02.6: os vetores que mais renderam não foram os de RLS de tabela (todos verdes), e sim **coluna de privilégio dentro de linha autorizada**, **credencial legível pela API** e **código de servidor rodando com `service_role`** — começar por eles.
- [ ] `select('*')` quebra em tabela com narrowing por coluna — gatilho: primeira tela da Etapa 02 que toque `webhook_endpoints`, `api_keys`, `account_invitations`, `aba_ai.ia_configuracoes` ou as duas tabelas de segredo de `aba_messaging` — risco: o erro é `42501 permission denied for table`, que parece falha de RLS e manda a investigação para o lado errado; a correção é listar colunas explicitamente no `.select()`. Consequência aceita conscientemente da correção A03/A04/A05/A07 da Subetapa 01.8 (esconder credencial vale o custo). Ver `handoffs/instrucoes.md` §6.
- [ ] Proteção contra senha vazada indisponível no plano gratuito do Supabase — gatilho: decisão de Max sobre migrar de plano — risco: senha comprovadamente vazada em incidente público não é bloqueada no cadastro. **Confirmado na documentação oficial em 2026-08-07:** a verificação contra o HaveIBeenPwned é recurso do plano Pro e acima. Não existe contorno gratuito dentro do Supabase Auth — a alternativa seria validação própria no cadastro, que é trabalho de produto, não de configuração. Segue em aberto por decisão consciente, sob o circuit breaker de R$0/mês.
- [ ] Teto de usuários editado direto no banco — gatilho: existir o painel de gestão dos CRMs-filho — risco: erro de digitação em produção, sem trilha de interface.
- [ ] Consentimento de uso de imagem trava a **exibição** da foto clínica, não o envio — e trava para todos, inclusive para quem tirou a foto — gatilho: a prova de fogo será quando um profissional de verdade usar o módulo — risco: a profissional não enxerga o "antes" ao acompanhar a evolução do tratamento. **Decisão de Max (2026-08-08): manter como está.** O motivo é a assimetria de custo — afrouxar depois é uma condição na migration 069, sem migração de dado, porque a foto já está guardada; apertar depois é impossível, porque foto já vista não desvê. Se a 03.1 confirmar o incômodo, a correção certa **não** é liberar geral: é separar as duas perguntas que hoje um interruptor só responde — "posso documentar" passa a ser o consentimento de tratamento de dados, e "posso divulgar" segue sendo o de uso de imagem, valendo para exportação e publicação. Entra como candidato à Subetapa 03.2 (generalizações apontadas pela prova de fogo).
- [ ] `aba_people.pessoas.contato_id` sem FK para `aba_messaging.contatos_canal` — gatilho: qualquer alteração futura na ordem de aplicação dos schemas de módulo — risco: se algum dia a ordem de aplicação mudar, é tentador "corrigir" adicionando a FK de volta sem lembrar que ela quebra a exportação avulsa de `aba_people` para cliente sem mensageria. Ver `handoffs/instrucoes.md` §5 para o registro completo da decisão. Não reintroduzir a FK sem resolver antes o problema de exportabilidade que ela reabre.

---

## Backlog de versionamento (documento vivo)

- [ ] CLI/checklist formal de clonagem de CRM-filho — impacto no MVP? Não — versão alvo +1.0
- [ ] Múltiplos templates de layout (sidebar/grid configurável) — impacto no MVP? Não — versão alvo +1.0
- [ ] `pgvector` para busca semântica em `aba_ai` — impacto no MVP? Não — versão alvo +1.0
- [ ] Evolution GO como módulo pago — impacto no MVP? Não — versão alvo +1.0
- [ ] `HaveIBeenPwned` no Supabase Auth — impacto no MVP? Não — versão alvo +0.1 (quando plano premium)
- [ ] Agendamento online pelo cliente — impacto no MVP? não — versão alvo +1.0.
- [ ] E-mail transacional — não — +1.0.
- [ ] Facebook e Instagram — não — futuro.
- [ ] Produtos e estoque (`commerce`) — não — +1.0.
- [ ] Nota fiscal de serviço — não — futuro.
- [ ] Cobrança Pix e boleto por API bancária — não — +1.0.
- [ ] Baixa automática de pagamento — não — +1.0.
- [ ] Quadros de tarefa (`tasks`) — não — +1.0.
- [ ] Identidade visual por conta (`branding`) — não — +1.0.
- [ ] Construtor de papéis customizáveis — não — +1.0.
- [ ] Lista de espera e encaixe — não — futuro.
- [ ] Fidelidade e indicações — não — futuro.
- [ ] CLI de exportação de módulos — não — futuro.
- [ ] Telegram como canal completo — não — +1.0.
- [ ] Alarme de queda de sessão com deduplicação — não — +0.1.
- [ ] Conferência automática do webhook após reconexão — não — +0.1.
- [ ] Login multi-conta (seletor de CRM-filho pós-autenticação, tela `1a` do wireframe) — impacto no MVP? Não — versão alvo +1.0. Exigiria tabela de associação usuário↔conta N:N; schema atual (`public.profiles.user_id UNIQUE`) trava 1 usuário = 1 conta. Decisão de Max, Etapa de Transição 1→2 (2026-08-18) — ver `docs/01_ARQUITETURA.md` §7.2.

---

## CHECKLIST DE CONFORMIDADE (autoaplicada antes da entrega)

1. [x] Arquivos do repo devidamente conferidos em sua integralidade antes de iniciar a Etapa 01.1 — conferido na Subetapa 01.0.
2. [x] Princípio-guia presente, com o ajuste de faseamento declarado explicitamente em vez de fingido.
3. [x] Idea lock preenchido, sem decisões estruturais pendentes.
4. [x] As 3 etapas presentes e em sequência.
5. [x] Cada Etapa tem Objetivo geral, Modo predominante, Portão de entrada, Portão de saída e Observações.
6. [x] Cada portão de saída declara condição + prova executável + o que fica proibido enquanto vermelho.
7. [x] Toda subetapa `[Goal]` tem Esforço máximo declarado.
8. [x] Toda subetapa `[Goal]` tem Escalonamento de LLM e a regra "se esgotar → relatório curto".
9. [x] Etapa 01 prevê HANDOFF_BUILD (Subetapa 01.9); Etapa 02 prevê HANDOFF_UPGRADE (Subetapa 02.7).
10. [x] Pendências vigiadas e Backlog de versionamento presentes.
11. [x] Subetapa de varredura de segredos no histórico do git, com evidência executável e saída esperada zero — Subetapas 01.7 e 02.5.
12. [x] Nenhuma credencial ou segredo aparece neste plano — apenas nomes de variáveis.
13. [x] `CHANGELOG.md` existe e está referenciado no README; `handoffs/instrucoes.md` existe e está referenciado no README e no HANDOFF_CODE.
14. [x] `.gitignore` e `.env` gerados como arquivos prontos, e o `.gitignore` ignora `.env` sem exceção. `.env.example` foi eliminado por decisão de Max (Subetapa 01.0) — o `.env` real já existe, gitignorado, sem versão de exemplo no repositório.
15. [x] Fim das Etapas 01 e 02 possuem **Portão de segurança adversarial obrigatório** antes de qualquer mudança de etapa ou deploy real — Subetapas 01.8 e 02.6.
