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

### Migrations do CRM_Maximus vão de 001 a 079, não 001 a 077
- **Gatilho:** `db/migrations/README.md` original citava "001 a 077" como a cadeia de origem.
- **Ação:** contagem real confirmada por `ls`: 79 arquivos, numeração `001`–`079` com `072` e `073` inexistentes (não há gap de conteúdo, só de número). Mapa de origem por schema corrigido para incluir `044_catalog_schema.sql`, `067`–`071`, `074`–`079` e o bloco de hardening `051`–`065`, ausentes do mapa original.
- **Evidência:** `wc -l *.sql` em `C:\GitHub\CRM_Maximus\supabase\migrations` — 79 arquivos, ~10.7k linhas totais.
- **Fonte:** Subetapa 01.0, sessão de 2026-08-15.

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
