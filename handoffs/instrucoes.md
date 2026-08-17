# INSTRUÇÕES — CRM Vitrine

Biblioteca viva de dicas técnicas deste projeto. Lida na abertura de toda sessão do CODE e atualizada ao fim de toda subetapa que produza um aprendizado não trivial.

Formato de toda entrada: Gatilho → Ação → Evidência → Fonte.

---

## 0. Como usar este arquivo

- **Ao abrir uma sessão:** leia as seções 2 a 6 antes de agir. Elas contêm o que já custou tempo — aqui e nos projetos que o Vitrine porta.
- **Ao resolver um problema não trivial:** registre uma entrada nova na seção 5, no mesmo commit da correção.
- **Ao consultar um repositório da seção 1:** registre o que foi aproveitado, ou registre que não havia nada útil.
- Nunca apague uma entrada. Se ficar obsoleta, marque `[OBSOLETA — <motivo>]`.

---

## 1. Repositórios de consulta

| Repositório | Local/URL | O que oferece | Quando consultar |
|---|---|---|---|
| **CRM_Maximus** | `C:\GitHub\CRM_Maximus` (local) / `AuroraIAOS/CRM_Maximus` | Fonte de verdade do modelo de dados: 79 migrations (`001`–`079`, sem `072`/`073`) com RLS/RBAC/IBAC provado em produção; suíte `tests/rls/` (11 arquivos + `helpers.ts`); `handoffs/instrucoes.md` próprio (633 linhas) — é o modelo que este arquivo segue. | **Prioridade máxima** antes de portar qualquer schema — `CLAUDE.md` §14 manda portar a lógica, traduzir os nomes, nunca reescrever RLS do zero. |
| **CRM-Sindcom** | `AuroraIAOS/CRM-Sindcom.git` | Stack já validada em produção sobre hospedagem estática: Vite 5.4 + React 18.3 + TS 5.6 + `vite-plugin-pwa` 0.20 + Tailwind 3.4 + Radix/shadcn + TanStack Query 5/Table 8 + react-hook-form 7 + zod 3 + react-router-dom 7 + vitest 2.1. Estrutura de `src/` (`app/`, `components/{ui,shared}`, `features/<domínio>/{api.ts,*Page.tsx}`, `lib/`), `vitest.config.ts` separado do `vite.config.ts`, runbook de deploy FTP (`docs/deploy.md`) com armadilhas medidas em produção. | Ao fazer o bootstrap do repositório (01.1) e ao escrever a suíte de testes de RLS/deploy. |

**Status da varredura (Subetapa 01.0, executada no CODE em 2026-08-15):**

| Repositório | Situação |
|---|---|
| CRM_Maximus | Varrido em profundidade — repositório local completo, 79 migrations lidas por contagem e amostra, `tests/rls/` e `instrucoes.md` (633 linhas) lidos por inteiro. Ver seções 2, 4, 5 e 6. |
| CRM-Sindcom | Clonado raso (`--depth 1`) para inspeção de estrutura — `package.json`, `src/`, `vite.config.ts`, `vitest.config.ts`, `tests/rls/helpers.ts`, `docs/deploy.md` lidos por inteiro. Não reexplorado linha a linha em toda `src/features/*` — suficiente para confirmar o padrão de pasta a seguir na 01.1. |

---

## 2. Stack e tecnologias desta obra

- **Vite + React 18 + TypeScript + PWA** — mesma stack do CRM-Sindcom, já validada em produção sobre hospedagem estática. Zero Docker, zero VPS, zero SSH.
- **Supabase Cloud** — Postgres, autenticação, armazenamento, RLS, Edge Functions. Projeto já existe (`uitwttyyppxvcgfdhnlz`).
- **Modularidade por schema de banco com prefixo `aba_`** — `public` (herdado) + `licensing`/`access`/`analytics` (sem prefixo) + `aba_people`/`aba_catalog`/`aba_scheduling`/`aba_finance`/`aba_health`/`aba_messaging`/`aba_sales`/`aba_automations`/`aba_ai`. Um módulo é migration autocontida + `set_updated_at()` própria — mecanismo de exportação por CRM-filho (`docs/01_ARQUITETURA.md` §4).
- **Duas camadas de autorização empilhadas, nunca uma no lugar da outra:** `is_account_member(account_id, papel)` (RBAC hierárquico) **E** `access.can(module_key, ação)` (RBAC fino por módulo). `docs/02_MODELO_DE_DADOS.md` §2.
- **`aba_people.pessoas` como tabela-mãe** — identidade única com papéis (`leads`/`clientes`/`funcionarios`/`fornecedores`) por chave compartilhada (class table inheritance), substituindo o modelo de identidades separadas do Maximus. Decisão desta sessão, `docs/02` §3.
- **`pg_cron` no lugar do pinger externo** — o "Wait step" de automação do Maximus dependia de endpoint Next.js pingado por scheduler externo (`AUTOMATION_CRON_SECRET`); aqui vira `pg_cron` chamando a função de drenagem direto no banco.
- **IA bring-your-own-key** — nenhuma chave global de LLM no `.env`; cada conta cola a própria chave, criptografada com `ENCRYPTION_KEY` (AES-256-GCM). Padrão herdado do Maximus, mantido por ser genuinamente bom.
- **Alternativas descartadas:** Next.js/React 19 (stack de fronteira que consumiu limite de token do Maximus desproporcionalmente); Docker Compose + VPS; Evolution GO no v01 (exige processo persistente, incompatível com hospedagem estática); RAG versionado em arquivo; CLI de clonagem automatizada.

### Padrões confirmados por leitura direta do código de CRM_Maximus (Subetapa 01.0)

- **Hardening pós-auditoria não documentado no mapa de origem original.** As migrations `051`–`065`, `070` e `074`–`078` do Maximus são correções descobertas depois que o sistema já estava de pé — nenhuma delas aparecia no "Mapa de origem por schema novo" de `db/migrations/README.md` antes desta revisão. É o conhecimento mais caro do repositório de origem: exposição ao PostgREST como ação independente do `CREATE SCHEMA`, `GRANT ALL` entregando `TRUNCATE` (que não passa por RLS), função nova nascendo executável por `PUBLIC`, política que autoriza mas não registra o log clínico, dedupe sem `account_id`, teto de assentos que só cobria `INSERT`. **Decisão de porte:** dobrar esse hardening dentro das migrations novas desde a primeira versão, não repetir a cronologia dos erros. Ver §5 abaixo para o detalhe migration a migration.
- **`is_account_member(account_id, min_role)`** — `017_account_sharing.sql`. `SECURITY DEFINER`, `LANGUAGE sql STABLE`, hierarquia por `CASE account_role` (`owner`=4, `admin`=3, `agent`=2, `viewer`=1) comparada com `min_role`. Toda policy do núcleo é `USING (is_account_member(account_id[, 'agent'|'admin']))`; em tabela filha, via `EXISTS (SELECT 1 FROM pai WHERE pai.id = filha.pai_id AND is_account_member(pai.account_id, ...))`.
- **`tests/rls/helpers.ts` (Sindcom) distingue erro de RLS de erro de constraint** — `ehErroRls` casa SQLSTATE `42501` ou mensagem `row-level security|permission denied|not authorized`; `ehErroConstraintOuTrigger` casa `23502/23503/23514/23505/P0001`. Um erro de constraint depois de tentar a operação **significa que a RLS passou** — testar sem essa distinção produz falso verde (a operação falhou, mas por um motivo que não prova que a política funcionou).
- **Direção de FK entre schemas resolve dependência circular** — quando uma coluna aponta para outro módulo e criar a FK fecharia um ciclo (ou quebraria a exportação avulsa do schema para um cliente que não contratou o módulo dependente), a coluna fica como `UUID` sem `REFERENCES` no lado que não deve depender, com o motivo documentado no cabeçalho da migration. Caso real do Maximus: `045_scheduling_schema.sql` (`appointments.customer_package_id`, sem FK) + `046_finance_schema.sql` (FKs e trigger do lado que conhece os dois). Aplicado nesta sessão a `aba_people.pessoas.contato_id` — ver §5.

---

## 3. APIs e serviços de referência

| Serviço | Uso | Custo | Free tier / limite | Doc |
|---|---|---|---|---|
| Supabase | Banco, auth, storage, RLS, Edge Functions | Gratuito | `HaveIBeenPwned` só em plano Pro+; sem add-on IPv4 em projeto novo (ver §5) | https://supabase.com/docs |
| Meta Cloud API (WhatsApp oficial) | Único canal de mensageria do v01 | Cota gratuita de conversas de serviço; template de marketing cobrado por conversa | Janela de 24h para mensagem livre | https://developers.facebook.com/docs/whatsapp/cloud-api |
| Hostgator (FTP) | Deploy do build estático | Já contratado (subdomínio `vitrine.strategicepiphany.com`) | — | painel cPanel |
| Modelos de linguagem (OpenAI/Anthropic) | `aba_ai`, bring-your-own-key | Chave do próprio cliente/conta | — | — |

---

## 4. Padrões e boas práticas herdadas

### Suíte de testes de RLS como portão de fase
- **Gatilho:** antes de considerar qualquer subetapa de schema (01.2–01.6) concluída.
- **Ação:** portar `tests/rls/` do Maximus traduzindo nomes de tabela/coluna, com um usuário por papel; bloquear o avanço até 100% verde. Usar a distinção `ehErroRls` × `ehErroConstraintOuTrigger` do Sindcom para não confundir "RLS passou, constraint barrou" com "RLS falhou".
- **Evidência:** padrão comprovado nos dois projetos de origem — CRM-Sindcom com `helpers.ts`, CRM_Maximus com a suíte completa por schema.
- **Fonte:** CRM-Sindcom + CRM_Maximus.

### Estender por adição, nunca por reescrita
- **Gatilho:** vontade de "melhorar" algo do núcleo herdado (`public`/`access`/`licensing`) durante o porte.
- **Ação:** envolver, não reescrever. Coluna nova com valor padrão, tabela nova, schema novo.
- **Evidência:** o núcleo do Maximus tem dezenas de migrations encadeadas; qualquer renomeação vira refactor global.
- **Fonte:** `handoffs/instrucoes.md` do CRM_Maximus §4.

### Hardening dobrado desde a primeira migration, não em patches sequenciais
- **Gatilho:** escrever qualquer migration nova de `aba_<modulo>` nas subetapas 01.2–01.6.
- **Ação:** incorporar direto no DDL inicial o que o Maximus só descobriu depois (RLS explícita em toda tabela de schema não-`public`, `GRANT` estreito sem `TRUNCATE`, `REVOKE EXECUTE FROM PUBLIC` em função nova, log de acesso via função e não só política, dedupe com `account_id` no índice). Ver mapa completo em §5 abaixo.
- **Evidência:** 15 migrations do Maximus (051–065, 070, 074–078) existem só para consertar isso depois.
- **Fonte:** decisão de porte desta sessão, a partir da leitura de `db/migrations/CRM_Maximus`.

### Exportabilidade de módulo é decisão de FK, não só de schema
- **Gatilho:** modelar coluna que aponta para tabela de outro `aba_<modulo>`.
- **Ação:** conferir a direção de dependência antes de criar a FK. Se o módulo-alvo é opcional para o cliente (ex.: `aba_messaging` para quem não contrata mensageria), a coluna fica sem `REFERENCES` no lado que precisa continuar exportável sozinho.
- **Evidência:** aplicado a `aba_people.pessoas.contato_id` nesta subetapa — ver §5.
- **Fonte:** padrão herdado do Maximus (`scheduling`→`finance`), reaplicado ao Vitrine.

---

## 5. Problemas e soluções deste projeto

### Conflito de FK entre `aba_people` e `aba_messaging` resolvido pela direção declarada
- **Gatilho:** Subetapa 01.0 — `docs/02_MODELO_DE_DADOS.md` §3.3 declarava `aba_people.pessoas.contato_id UUID REFERENCES aba_messaging.contatos_canal(id)`, mas `db/migrations/README.md` (versão original) ordenava a aplicação de `aba_messaging` por **último**, depois de `aba_people`. Além da ordem impossível de aplicar, a FK dura quebraria a exportação avulsa de `aba_people` (`docs/01_ARQUITETURA.md` §4) para um CRM-filho que não contrata o módulo de mensageria — a migration não rodaria por falta da tabela alvo.
- **Ação:** `contato_id` passa a `UUID` sem `REFERENCES`, com comentário no cabeçalho da migration explicando o motivo — mesmo padrão que o Maximus já usou para `scheduling.appointments.customer_package_id` → `finance.customer_packages`. Integridade referencial dessa coluna específica não é garantida pelo banco; é aceito conscientemente, documentado.
- **Evidência:** `docs/02_MODELO_DE_DADOS.md` §3.3 corrigido nesta subetapa.
- **Fonte:** Subetapa 01.0, sessão de 2026-08-15.

### Divergência entre `db/migrations/README.md` e a Qualidade da Subetapa 01.3 sobre a migration 075 do Maximus, resolvida por escopo
- **Gatilho:** Subetapa 01.3 — `db/migrations/README.md` (escrito na Subetapa 01.0) instruía portar `075_professionals_require_employee.sql` (profissional ativo exige funcionário) "no DDL inicial" de `aba_scheduling`, mas o critério de Qualidade da própria Subetapa 01.3 em `docs/00_PLANO_E_CRITERIOS.md` só relaciona `067/068/071/078/079` — 075 não está na lista. Investigação mostrou por quê: 075 depende de `074_employees_born_from_invitation.sql` (fluxo de convite→funcionário que vira login) e de uma RPC de governança (`scheduling.set_professional`) que checa papel `admin`+ no corpo — nenhum dos dois existe no Vitrine ainda.
- **Ação:** tratado como decisão de escopo, não como erro a corrigir silenciosamente (CLAUDE.md §15 — não expandir escopo sem aprovação). Portado só o desenho de dado (`aba_scheduling.profissionais.funcionario_id UUID REFERENCES aba_people.funcionarios(id) ON DELETE SET NULL`, com índice único parcial "um funcionário, um profissional"), sem o `CHECK` de governança nem a RPC. `db/migrations/README.md` corrigido no mesmo commit desta migration para refletir a decisão revista, em vez de deixar o mapa desatualizado.
- **Evidência:** `009_aba_scheduling.sql`, cabeçalho "DECISÃO DE ESCOPO"; `db/migrations/README.md`, linha de `aba_scheduling`.
- **Fonte:** Subetapa 01.3, sessão de 2026-08-16.

### `aba_finance.envios_fatura.provedor` restrito a `'meta'` — Evolution GO é fora do MVP mesmo como valor de enum
- **Gatilho:** o original do Maximus (`046_finance_schema.sql`) aceita `provider IN ('meta','evolution')` em `invoice_dispatches`. Evolution GO está explicitamente fora do MVP (CLAUDE.md §15), e incluir o valor no `CHECK` — mesmo sem nenhuma lógica de envio implementada — seria abrir uma porta de escopo sem decisão de Max.
- **Ação:** `CHECK (provedor IN ('meta'))`, só o canal vivo no v01. Ampliar depois é `ALTER TABLE ... DROP/ADD CONSTRAINT`, mudança trivial que não exige reabrir a migration.
- **Evidência:** `010_aba_finance.sql`, tabela `envios_fatura`.
- **Fonte:** Subetapa 01.3, sessão de 2026-08-16.

### Pendência da 01.3 fechada: FK `profissionais.funcionario_id` foi exatamente o que a regra 076 precisava
- **Gatilho:** Subetapa 01.3 registrou como pendência (§5, "Divergência entre `db/migrations/README.md` e a Qualidade da 01.3") que o CHECK "profissional ativo exige funcionário" do Maximus (migration 075) não seria portado, mas que o desenho de FK (`aba_scheduling.profissionais.funcionario_id → aba_people.funcionarios(id)`) sim, "para quando a regra de governança entrar".
- **Ação:** a regra de governança que efetivamente usa essa FK não é a 075 (que amarra a criação/desativação do profissional a um fluxo de convite inexistente) — é a 076 (`health.can_access` exige o funcionário ativo), que é exigida pela própria Qualidade da Subetapa 01.4. `aba_health.pode_acessar()` já nasce (013_aba_health.sql, passo 4) fazendo `EXISTS (SELECT 1 FROM aba_people.funcionarios f WHERE f.id = p.funcionario_id AND f.ativo)` — nenhuma coluna nova precisou ser criada, a decisão de 01.3 pagou o dividendo esperado sem gerar dívida técnica.
- **Evidência:** `013_aba_health.sql`, função `pode_acessar()`; teste `05_aba_health.spec.ts` "desativar o funcionário por trás do profissional revoga o acesso clínico (076)".
- **Fonte:** Subetapa 01.4, sessão de 2026-08-16.

### `hub.verify_token` do handshake da Meta aparece em texto puro nos logs de acesso do Edge Function — protocolo, não bug
- **Gatilho:** Subetapa 01.6 — ao consultar `query_logs` (fonte `function_edge_logs`) para colher a evidência de rejeição/aceite do webhook, o resultado trouxe a URL completa de cada requisição `GET`, incluindo a query string `?hub.mode=subscribe&hub.verify_token=<valor real>&hub.challenge=...`. O `META_WEBHOOK_VERIFY_TOKEN` apareceu em texto puro no resultado da consulta — não porque o `.env` tenha sido lido diretamente, mas porque o próprio protocolo de handshake da Meta manda esse valor como parâmetro de URL no `GET` (confirmado via *search-first* contra a documentação oficial), e o Supabase Edge Functions loga a URL inteira de cada requisição, query string incluída.
- **Ação:** isto NÃO é uma falha da implementação do Vitrine — é inerente a como a Meta especifica o handshake, e vai se repetir em qualquer log de acesso HTTP (Supabase, qualquer outro host, qualquer ferramenta de observabilidade futura) que registre a URL completa. O `META_APP_SECRET` (a chave de assinatura HMAC, o segredo mais sensível) nunca aparece em log nenhum — só viaja no corpo/cabeçalho do `POST`, nunca na URL. Max foi avisado explicitamente e decidiu (2026-08-16) NÃO rotacionar o `META_WEBHOOK_VERIFY_TOKEN` agora — risco considerado baixo, já que esse valor só prova posse do endpoint no cadastro do webhook, não assina nada.
- **Ação preventiva para sessões futuras:** evitar `select * from logs` / `select event_message` sem filtro sobre `function_edge_logs` quando o endpoint testado for o webhook da Meta — preferir filtrar por `metadata` estruturado quando disponível, ou aceitar conscientemente que o `hub.verify_token` vai aparecer e tratar isso como não-segredo-de-fato (é rotacionável a qualquer momento, sem decifrar nada retroativamente, diferente de uma chave de assinatura).
- **Evidência:** consulta via `mcp__claude_ai_Supabase__query_logs` na Subetapa 01.6, 2026-08-17.
- **Fonte:** Subetapa 01.6, sessão de 2026-08-16/17.

### Migrations do CRM_Maximus vão de 001 a 079, não 001 a 077
- **Gatilho:** `db/migrations/README.md` original citava "001 a 077" como a cadeia de origem.
- **Ação:** contagem real confirmada por `ls`: 79 arquivos, numeração `001`–`079` com `072` e `073` inexistentes (não há gap de conteúdo, só de número). Mapa de origem por schema corrigido para incluir `044_catalog_schema.sql`, `067`–`071`, `074`–`079` e o bloco de hardening `051`–`065`, ausentes do mapa original.
- **Evidência:** `wc -l *.sql` em `C:\GitHub\CRM_Maximus\supabase\migrations` — 79 arquivos, ~10.7k linhas totais.
- **Fonte:** Subetapa 01.0, sessão de 2026-08-15.

### Toda tabela nova em `public` nasce com `TRUNCATE`/`TRIGGER`/`REFERENCES` concedidos a `anon` — privilégio de fábrica do projeto, não de migration nossa
- **Gatilho:** Subetapa 01.2 — antes de expor `access`/`licensing`/`aba_people`, uma consulta a `information_schema.role_table_grants` mostrou que `accounts`, `profiles`, `account_invitations`, `api_keys`, `webhook_endpoints`, `notifications`, `member_presence` (todas criadas por `001_core_public.sql`, sem nenhum `GRANT` explícito nosso) já tinham SELECT/INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES concedidos a `anon`, `authenticated` **e** `service_role`.
- **Ação:** este projeto Supabase nasceu no modelo de privilégio "antigo" (tabela nova em `public` ganha `ALL` automaticamente para os três papéis — a plataforma está migrando para revogado-por-padrão, mas isso é opt-in por projeto). `TRUNCATE` não passa por RLS — é o mesmo achado G01 que a auditoria adversarial do Maximus encontrou (migration 052), só que lá a causa foi um `GRANT ALL` escrito por eles; aqui é o próprio projeto que nasce assim, sem nenhuma migration pedir. Corrigido em `006_expose_schemas_and_narrow_grants.sql`: `REVOKE ALL ... FROM anon` (zero privilégio — não existe caminho anônimo legítimo no MVP) e `REVOKE ALL` + `GRANT SELECT, INSERT, UPDATE, DELETE` (nunca `TRUNCATE`/`TRIGGER`/`REFERENCES`) para `authenticated`, nos quatro schemas (`public`/`access`/`licensing`/`aba_people`), com `ALTER DEFAULT PRIVILEGES` reescrito para que tabela futura NESSES schemas já nasça estreita.
- **Evidência:** `information_schema.role_table_grants` antes/depois — `anon` zerado em toda tabela; `authenticated` só com os 4 verbos de dado.
- **Fonte:** Subetapa 01.2, sessão de 2026-08-15. **Pendência para toda subetapa futura que crie schema novo (01.3+):** repetir o padrão `ALTER DEFAULT PRIVILEGES` desta migration dentro da própria migration que cria o schema — o default estreito não se propaga sozinho para um schema que ainda não existia quando `006` rodou.

### Expor schema novo ao PostgREST no Supabase Cloud sem sessão de Dashboard: `ALTER ROLE authenticator SET pgrst.db_schemas`, e são DUAS notificações
- **Gatilho:** Subetapa 01.2 — `access`/`licensing`/`aba_people` recém-criados, chamada via `supabase-js` (`.schema('licensing').from(...)`) falhando com schema inválido/`PGRST106`.
- **Ação:** confirmado contra a documentação oficial (`docs/guides/api/using-custom-schemas` + o troubleshooting de `PGRST002`): expor schema novo é Dashboard (Project Settings → Data API → Exposed schemas) **ou**, documentado como caminho de override manual igualmente válido, `ALTER ROLE authenticator SET pgrst.db_schemas = 'public, access, licensing, aba_people'` — mas a partir desse comando o Dashboard **para de gerenciar** a lista (precisa incluir todo schema que já estava exposto, ou derruba `public` junto). `NOTIFY pgrst, 'reload config'` sozinho não bastou para o cache de schema do PostgREST enxergar as tabelas — só funcionou de fato depois de `NOTIFY pgrst, 'reload schema'` também, alguns segundos depois. As duas notificações, sempre, com um intervalo curto antes de testar.
- **Evidência:** `db/migrations/006_expose_schemas_and_narrow_grants.sql` + script `scripts/seed_test_users.mjs` rodando com sucesso só depois do segundo `NOTIFY`.
- **Fonte:** Subetapa 01.2, sessão de 2026-08-15.

### `REVOKE ... FROM PUBLIC` não fecha `anon` — é preciso revogar dele nominalmente
- **Gatilho:** Subetapa 01.2 — logo após aplicar `001_core_public.sql`–`004_aba_people.sql` (cada função já nascendo com `REVOKE ALL ... FROM PUBLIC` explícito, seguindo a lição já registrada do Maximus), o advisor de segurança do Supabase acusou `is_account_member`, `handle_new_user`, `touch_presence` e `record_webhook_failure` como executáveis pelo papel `anon` — chamador não autenticado, via `/rest/v1/rpc/<nome>`.
- **Ação:** o projeto Supabase tem concessão de fábrica de `EXECUTE` a `anon`/`authenticated`/`service_role` em função nova, nominal por papel — revogar de `PUBLIC` não desfaz um `GRANT` já nominalmente concedido a `anon`. É preciso `REVOKE ALL ... FROM anon` explícito, além de `FROM PUBLIC`. Corrigido com uma varredura por catálogo (`pg_proc`/`pg_namespace`, migration `005_harden_function_privileges.sql`) em vez de lista manual função a função — assim uma função nova que apareça nos schemas `public`/`access`/`licensing`/`aba_*` e não entrar na lista de "chamável" fica fechada por padrão. `rls_auto_enable()` (função de plataforma do próprio Supabase, também dona `postgres`) foi excluída nominalmente da varredura — não é nossa, não se mexe nela.
- **Evidência:** advisor de segurança antes/depois da migration 005 — os 4 achados de `anon` desapareceram; os avisos restantes (`authenticated` podendo executar `is_account_member`/`touch_presence`) são intencionais, não gap.
- **Fonte:** Subetapa 01.2, sessão de 2026-08-15. Achado idêntico, já documentado no CRM_Maximus (migrations `054`/`061`, achado G04 da auditoria adversarial de lá) — aqui medido e corrigido ao vivo no banco do Vitrine, não só herdado por leitura.

### Schema novo sem histórico de auditoria: hardening entra na tradução, não depois
- **Gatilho:** Subetapa 01.5 — `aba_automations`/`aba_ai` não são porte de módulo já modularizado do Maximus (como `aba_catalog`/`aba_scheduling`/`aba_finance`/`aba_health` foram); são tabelas soltas em `public`, herdadas do fork `wacrm`, no modelo antigo (`user_id`/`auth.uid()`, sem RBAC por conta) — não existe uma cadeia de migrations `05x`/`07x` de auditoria adversarial já paga para essas tabelas especificamente, porque elas nunca fizeram parte do módulo formal onde a auditoria do Maximus rodou. Dois achados apareceram só ao ler o código-fonte com atenção, não numa lista de hardening já pronta: (1) `automation_logs` tinha política `FOR ALL` nomeada "Users can view own automation logs" — o nome promete leitura, o código concede escrita/apagamento também, o que deixaria o usuário final adulterar o próprio log de auditoria do motor; (2) `match_ai_knowledge_fts`/`match_ai_knowledge_semantic` nasceram `SECURITY DEFINER` sem checar `is_account_member()`, permitindo leitura cross-account via `p_account_id` arbitrário — bug real, documentado pelo próprio Maximus como GHSA-fg5p-2qc3-jmxr e só corrigido numa migration posterior (032) de lá.
- **Ação:** as duas correções entraram direto no DDL inicial do Vitrine (`017_aba_automations.sql`: `automacao_logs` só com `SELECT`; `018_aba_ai.sql`: `buscar_conhecimento_textual()` nasce `SECURITY INVOKER`). Regra geral daqui pra frente: ao traduzir tabela solta em `public` sem módulo formal, ler o código com a mesma desconfiança da auditoria adversarial — "hardening dobrado desde o início" (padrão já estabelecido nas Subetapas 01.2-01.4) vale tanto para módulo já auditado quanto para código nunca auditado.
- **Evidência:** `017_aba_automations.sql`, comentário "HARDENING APLICADO NA TRADUÇÃO"; `018_aba_ai.sql`, comentário "HARDENING APLICADO NA TRADUÇÃO"; teste `08_aba_ai.spec.ts` "usuário de outra conta passando p_account_id alheio recebe conjunto vazio".
- **Fonte:** Subetapa 01.5, sessão de 2026-08-16.

### `GRANT` amplo de tabela precisa vir ANTES do `REVOKE`/`GRANT` por coluna, na mesma migration
- **Gatilho:** Subetapa 01.4 — `013_aba_health.sql` narrowing por coluna (Maximus 053: SELECT revogado da tabela toda, reconcedido só nas colunas de identificação) escrito, na primeira versão do arquivo, DEPOIS do bloco de `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES ... TO authenticated` que o próprio arquivo também faz (padrão herdado de 008/009/010). Erro de sequência: se o `GRANT` amplo roda DEPOIS do `REVOKE`+narrowing, ele reconcede SELECT de tabela inteira por cima do narrowing, anulando-o silenciosamente — exatamente o comportamento que a própria 053 documenta como achado ("`REVOKE SELECT (coluna)` aplicado enquanto o `GRANT` de tabela existe é inócuo").
- **Ação:** pego em revisão antes de aplicar no Supabase (nenhuma execução com o bug chegou a rodar) — bloco de `GRANT USAGE`/`GRANT` amplo/`ALTER DEFAULT PRIVILEGES` movido para ANTES do `DO $$` de narrowing por coluna, dentro do mesmo arquivo. Regra geral para qualquer migration futura que combine os dois padrões (GRANT amplo de schema + narrowing por coluna de alguma tabela sensível): a ordem de execução dentro do arquivo importa tanto quanto o SQL em si.
- **Evidência:** `013_aba_health.sql`, comentário "ORDEM IMPORTA" antes do bloco de `GRANT` amplo.
- **Fonte:** Subetapa 01.4, sessão de 2026-08-16.

### `ALTER DEFAULT PRIVILEGES` dentro da própria migration que cria o schema — pendência da 01.2 fechada na 01.3
- **Gatilho:** Subetapa 01.2 tinha deixado registrado como pendência ("repetir o padrão `ALTER DEFAULT PRIVILEGES` desta migration dentro da própria migration que cria o schema — o default estreito não se propaga sozinho para um schema que ainda não existia quando `006` rodou").
- **Ação:** `008_aba_catalog.sql`, `009_aba_scheduling.sql` e `010_aba_finance.sql` já nascem com `GRANT USAGE ON SCHEMA` + `GRANT` estreito em toda tabela (nunca `TRUNCATE`) + `ALTER DEFAULT PRIVILEGES` embutidos na própria migration de criação, em vez de uma migration de correção separada como a `006` foi para o núcleo. A exposição ao PostgREST (`ALTER ROLE authenticator SET pgrst.db_schemas`) continua em migration própria (`012_expose_new_module_schemas.sql`), porque é uma operação de substituição de lista inteira que precisa repetir todo schema já exposto — não faz sentido duplicá-la em cada migration de schema.
- **Evidência:** `mcp__claude_ai_Supabase__get_advisors` (security) rodado após aplicar 007–012 não apontou nenhum achado novo nos três schemas — zero achado de `anon`/`authenticated` executando função interna, mesmo padrão limpo que a varredura por catálogo (`005`) corrigiu retroativamente para `aba_people`.
- **Fonte:** Subetapa 01.3, sessão de 2026-08-16.

### Trigger cruzando schema mora no schema que depende, nunca no que é dependido
- **Gatilho:** `aba_finance.ao_concluir_agendamento()` precisa disparar quando `aba_scheduling.agendamentos.status` muda para `concluido` (efeito financeiro: consumo de saldo de plano + comissão), mas `aba_scheduling` precisa continuar exportável sozinho para um cliente sem financeiro.
- **Ação:** a função e o `CREATE TRIGGER` moram inteiramente em `010_aba_finance.sql`, mesmo o trigger sendo fisicamente instalado `ON aba_scheduling.agendamentos` — Postgres permite `CREATE TRIGGER` em tabela de outro schema desde que o executor tenha privilégio, e isso mantém a direção de dependência (`aba_finance` conhece `aba_scheduling`, nunca o contrário) também no nível de trigger, não só de FK. Mesmo padrão já usado pelo Maximus original (`046_finance_schema.sql`, trigger `finance_on_appointment_completed` sobre `scheduling.appointments`).
- **Evidência:** `03_aba_scheduling.spec.ts` e `04_aba_finance.spec.ts` passam sem `aba_finance` precisar existir para os testes de `aba_scheduling` isolados (o trigger só dispara quando `plano_cliente_id` está preenchido, o que nenhum teste da 01.3 exercitou ainda — fica para quando a tela de conclusão de atendimento entrar na Etapa 02).
- **Fonte:** Subetapa 01.3, sessão de 2026-08-16.

### `auth.users` valida conectividade antes de o schema núcleo existir
- **Gatilho:** Subetapa 01.1 — a evidência original pedia "query de teste retornando linha do `public.accounts`", mas `public.accounts` só é criado na Subetapa 01.2. `list_tables` confirmou `public` vazio no projeto Supabase nesta subetapa.
- **Ação:** `auth.users` é schema de plataforma, existe em todo projeto Supabase independente de qualquer migration nossa. Criado usuário de teste via Admin API (`supabase.auth.admin.createUser({ email_confirm: true })`, script local com a `service_role` key, nunca commitado) — `email_confirm: true` evita a armadilha que o Maximus já registrou (usuário criado via `signUp` público fica com e-mail não confirmado e não consegue logar por senha). Login testado de ponta a ponta pelo app real (LoginPage → RoleGate → AppShell/DashboardPage → signOut), depois o usuário de teste foi apagado.
- **Evidência:** print do dashboard autenticado (Subetapa 01.1) + `docs/00_PLANO_E_CRITERIOS.md`, nota de adaptação na Conclusão da 01.1.
- **Fonte:** Subetapa 01.1, sessão de 2026-08-15. Padrão de `admin.createUser` em vez de `signUp` já vinha registrado em CRM_Maximus §5 ("`TEST_OWNER_EMAIL`/`TEST_ADMIN_EMAIL` nunca confirmaram e-mail").

### Conexão direta ao Postgres do Supabase falha em rede sem IPv6 — usar MCP
- **Gatilho:** aplicar migration com `supabase db push --db-url $SUPABASE_DB_URL` em projeto Supabase novo.
- **Ação:** `db.<ref>.supabase.co` resolve só para endereço IPv6 sem o add-on pago de IPv4 — falha com `ENOTFOUND` em rede sem rota IPv6 de saída. Caminho escolhido para o Vitrine: MCP Supabase (`apply_migration`), que não passa pela conexão direta — decisão confirmada com Max na Subetapa 01.0. Alternativa registrada, não escolhida: connection string do Supavisor (Shared Pooler, IPv4).
- **Evidência:** medido pelo Maximus (`nslookup` só devolveu `2600:...`); herdado como conhecimento, não remedido nesta sessão porque o caminho MCP já foi adotado direto.
- **Fonte:** CRM_Maximus, `handoffs/instrucoes.md` §5 + decisão de Max na Subetapa 01.0 deste projeto.

---

## 6. Armadilhas conhecidas (não repetir)

- **O Supabase liga RLS sozinho só no schema `public`.** Todo schema `aba_<modulo>` precisa de `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` explícito em cada tabela — o event trigger da plataforma (`public.rls_auto_enable()`) filtra `cmd.schema_name IN ('public')`. Fonte: CRM_Maximus §4.
- **Schema novo no Supabase precisa ser exposto ao PostgREST.** Sem isso a aplicação não enxerga as tabelas, e o erro sugere falta de permissão — investigação vai para o lado errado. Fonte: CRM_Maximus §6.
- **Extensão nova vai para `extensions`, não para `public`.** `CREATE EXTENSION ... WITH SCHEMA extensions` — extensão em `public` polui a superfície pública da API (lint `extension_in_public`). `btree_gist` é obrigatória antes de `aba_scheduling` (restrição de exclusão por intervalo). Fonte: CRM_Maximus §4.
- **`GRANT ALL ON TABLE` entrega `TRUNCATE`, que não passa por RLS.** Conceder só o necessário por tabela. Fonte: CRM_Maximus §5.
- **Função nova no Postgres nasce executável por `PUBLIC`.** `REVOKE EXECUTE ... FROM PUBLIC` explícito em toda função de módulo, sobretudo as que tocam `aba_health`. Fonte: CRM_Maximus §5.
- **Política de RLS autoriza, mas não registra.** A garantia de `log_acesso` obrigatório em `aba_health` precisa vir de função (trigger/RPC), nunca só de política — senão a leitura passa sem deixar rastro. Fonte: CRM_Maximus §5, migration `053`.
- **O log clínico do Maximus cobria a leitura e não cobria a escrita.** Escrita dispara gatilho, leitura não — checar os dois caminhos ao portar `aba_health`. Fonte: CRM_Maximus §5, migration `070`.
- **Índice de deduplicação sem `account_id` faz uma conta engolir mensagem de outra.** Todo índice de dedupe em `aba_messaging` (`provedores_canal`/`eventos_provedor`) precisa incluir `account_id`. Fonte: CRM_Maximus §5, migration `057`.
- **Teto de assentos que só cobre `INSERT` deixa passar o caminho que `UPDATE`/`MOVE` a linha.** Conferir o trigger de `licensing` contra os dois caminhos. Fonte: CRM_Maximus §5, migrations `064`/`077`.
- **Agenda que ignora fuso quebra em silêncio.** Toda comparação de horário em `aba_scheduling` acontece no fuso configurado, e todo horário é armazenado com fuso. Fonte: CRM_Maximus §6.
- **Nunca inventar número de telefone para teste de envio.** O provedor completa dígitos ao rotear e o número resultante pode ser conta real de terceiro — incidente real registrado em `CRM_AlmaPura` (PDF de contrato e chave Pix enviados a estranho). Vale também para o teste da Meta Cloud API na Subetapa 01.6/02.3. Fonte: CRM_Maximus §6.
- **`.gitignore` por palavra solta engole código em silêncio.** Padrão amplo tipo `*secret*` ou `*prontuario*` já excluiu, em outros projetos, arquivo de código legítimo sem aviso nenhum (`git status` mostra "nothing to commit", o commit sai verde e o arquivo simplesmente não vai). O `.gitignore.example` deste repo já foi escrito mirando nome de arquivo de credencial/exportação, não qualquer arquivo com a palavra no nome — não afrouxar essa regra ao adaptar para Vite na Subetapa 01.1. Fonte: `CRM_Vitrine/.gitignore.example` (já incorpora a lição) + CRM_Maximus §6.
- **`gitleaks` acusa placeholder de doc e senha de teste como segredo.** Suprimir por fingerprint quando confirmado falso positivo, nunca reescrever histórico por reflexo. Relevante para a Subetapa 01.7 (varredura de segredos). Fonte: CRM_Maximus §5.

---

## 7. Candidatos a promoção

- **Modularidade por schema com migration autocontida por módulo** — se a prova de fogo do Vitrine confirmar, promover a convenção oficial de "projeto-vitrine" na skill do estágio criativo.
- **Regime de acesso a dado sensível — atributo + concessão nominal + log obrigatório** — reaproveitável em qualquer CRM-filho que toque saúde, jurídico ou financeiro de terceiro.
- **Convenção `0X.0` de revisão de plano no início de cada Etapa** — nasceu nesta sessão por pedido de Max (ver `docs/00_PLANO_E_CRITERIOS.md`); se funcionar bem nas Etapas 02/03, candidata a virar padrão do estágio criativo para todo projeto.
