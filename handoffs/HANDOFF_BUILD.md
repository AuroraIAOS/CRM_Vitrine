# HANDOFF_BUILD — CRM Vitrine

## Estado atual
Fundação concluída e versionada. `main` = `44d8ba3`, alinhada ao projeto Supabase real (`uitwttyyppxvcgfdhnlz`) — **divergência zero entre repositório e banco, reconferida objeto a objeto na Subetapa 02.0** (22 migrations, 12 schemas, contagem de tabela por schema e inventário de função). Etapa 01 fechada, portão de saída 100% verde. A Etapa 02 constrói a UI sobre esta fundação.

## O que está 100% verde (Etapa 01)
- **Núcleo + 9 schemas de módulo aplicados** via MCP, em 22 migrations (`db/migrations/001` a `021` + `022_hardening_portao_adversarial`): `public`/`access`/`licensing` (herdado, sem prefixo `aba_`) e `aba_people`, `aba_catalog`, `aba_scheduling`, `aba_finance`, `aba_health`, `aba_sales`, `aba_automations`, `aba_ai`, `aba_messaging`.
- **RLS ativa e testada em toda tabela de todo schema** — `crm/tests/rls/` com 13 arquivos, **100/100 testes verdes** (65 da fundação funcional + 35 do portão adversarial, que ficam como regressão permanente). Rodar com `cd crm && npm run test:rls` (exige `scripts/seed_test_users.mjs` rodado antes, uma vez).
- **`aba_health` com IBAC/ABAC completo** — `pode_acessar()` com três camadas (papel + permissão de módulo + atributo profissional/funcionário ativo); leitura clínica só via função com log obrigatório na mesma transação; escrita clínica logada por trigger; bucket privado `anexos-clinicos` (10 MB/arquivo) com consentimento de imagem travando só a leitura.
- **Webhook Meta Cloud API no ar** (`supabase/functions/whatsapp-webhook`, v3) — rejeita requisição sem assinatura HMAC-SHA256 válida, aceita e persiste mensagem de teste, idempotente por conta, isolamento entre contas provado na v3.
- **Varredura de segredos zerada** (`gitleaks detect`, histórico completo) — `.env`/`crm/.env.test` nunca rastreados pelo git.
- **Portão de segurança adversarial executado (Subetapa 01.8)** — 6 falhas reais encontradas e corrigidas (uma tomada de conta crítica, quatro exposições de credencial, um vazamento entre contas no webhook); 1 achado medido e aceito como não explorável. Parecer favorável, merge ordenado por Max e executado. Detalhe completo: `docs/RELATORIO_01.8_PORTAO_ADVERSARIAL.md`.
- `typecheck` limpo; `get_advisors` (security) sem achado novo além dos 5 pré-existentes já documentados.

## Artefatos e onde estão
- **Migrations:** `db/migrations/001` a `022` (SQL puro, aplicado via MCP `apply_migration`; `db/migrations/README.md` tem o mapa de origem Maximus → Vitrine, migration a migration).
- **Edge Function:** `supabase/functions/whatsapp-webhook/index.ts` (v3, `verify_jwt: false` — autenticação por HMAC própria).
- **Suíte de RLS:** `crm/tests/rls/` (13 arquivos) + `crm/tests/rls/helpers.ts` (harness reutilizável — `clientAs(role)`, `anonClient()`, `adminClient()`, `createThrowawayUser`/`deleteThrowawayUser`, `loadContext()`, `ehErroRls`/`ehErroConstraintOuTrigger`).
- **Scripts:** `crm/scripts/seed_test_users.mjs` (fixture idempotente, 4 papéis numa conta) e `crm/scripts/test_webhook_meta.mjs` (evidência ponta a ponta do webhook contra a função real).
- **App base:** Vite+React 18+TS+PWA em `crm/`, conectado ao Supabase (`crm/.env.test` local, gitignorado; `.env` da raiz com as credenciais reais, também gitignorado). Nenhuma tela de negócio construída ainda — só o esqueleto de auth (login → dashboard → logout) da Subetapa 01.1.
- **Documentação viva:** `handoffs/instrucoes.md` (padrões herdados §4, problemas/soluções §5, armadilhas §6, candidatos a promoção §7 — leitura obrigatória de abertura de sessão) e `docs/RELATORIO_01.8_PORTAO_ADVERSARIAL.md` (auditoria adversarial completa, achado a achado).

## Design — pacote de wireframes ratificado (Etapa de Transição 1→2, 2026-08-18)
Antes da 02.0 rodar, Max fechou o design do MVP no Claude Design e entregou o pacote (`design/wireframes-crm-sa-de-e-est-tica/`, 16 telas). Decisões já registradas — **a 02.0 não precisa reabri-las, só confirmar que seguem valendo**:
- **Navegação/paleta/tipografia/componentes:** `docs/01_ARQUITETURA.md` §7 + `docs/04_DESIGN_E_MARCA.md` §5 + inventário completo em `design/README.md`.
- **Login multi-conta:** adiado para `+1.0` (backlog de versionamento) — a Etapa 02 constrói single-account, como o schema atual (`public.profiles.user_id UNIQUE`) já suporta.
- **Perfis 1n/1o:** mapeados sobre o RBAC existente (`agent`+atributo profissional / `admin`), sem tabela/enum novo.
- **Pendência formalizada pela 02.0:** o fluxo de convite→funcionário→atributo profissional foi verificado contra o CRM Maximus (018/019/074/075/076) e seguia deferido desde a Etapa 01. **Decisão de Max, 2026-08-18: vira a Subetapa 02.2, própria e anterior à de Pessoas**, cobrindo as RPCs de convite, o trigger de nascimento automático de funcionário, a RPC de liga/desliga do atributo profissional (regra nova: só `agent`, nunca `admin`), o `transfer_account_ownership` prometido pela correção A02 da 01.8, e a RPC `criar_convite()` — peça sem equivalente no Maximus, onde a criação do convite morava num route handler Next.js que não existe numa SPA estática. Ver `docs/01_ARQUITETURA.md` §7.4 e `handoffs/instrucoes.md` §5.

## O que a Etapa 02 deve construir (roteiro reescrito pela Subetapa 02.0, 2026-08-18)
A 02.0 rodou e reescreveu a Etapa 02 de 8 para 17 subetapas, por duas decisões de Max: o bloco de convite/funcionário vira subetapa própria, e os módulos restantes ganham CRUD completo antes do deploy (cobrindo as 16 telas do design ratificado). Roteiro vigente:

| # | Subetapa | Modo/LLM |
|---|---|---|
| 02.0 | Leitura de referências, inclusão de design e revisão do plano | `[Plan]` Opus — **✅ concluída** |
| 02.1 | **Fundação visual e de sessão do app** — tokens de `docs/04` §5, IBM Plex, shell 236px/56px, `AuthProvider` resolvendo `public.profiles`, nav por `access.readable_modules()`, migration de `access.modules.position`, deps de UI | `[Goal] [Manual]` Sonnet→Opus |
| 02.2 | **Equipe: convite → funcionário → atributo profissional** — porte do Maximus 018/019/074/075 + RPC `criar_convite()` (peça inédita) + aba Equipe de Configurações | `[Goal] [Manual]` Sonnet→Opus |
| 02.3 | CRUD de Pessoas (`aba_people`) — telas `1c`/`1d` | `[Goal] [Manual]` Sonnet→Opus |
| 02.4 | CRUD de Vendas (`aba_sales`) — tela `1f` | `[Goal] [Manual]` Sonnet→Opus |
| 02.5 | Mensageria (Meta Cloud API) — tela `1j` | `[Goal] [Manual]` Sonnet→Opus |
| 02.6 | Agenda (`aba_scheduling`) + perfis `1n`/`1o` — tela `1e` | `[Goal] [Manual]` Sonnet→Opus |
| 02.7 | Catálogo (`aba_catalog`) — tela `1i` | `[Goal] [Manual]` Sonnet→Opus |
| 02.8 | Financeiro (`aba_finance`) — tela `1g` | `[Goal] [Manual]` Sonnet→Opus |
| 02.9 | Prontuário (`aba_health`) — telas `1h`/`1p` | `[Goal] [Manual]` **Opus do início ao fim** |
| 02.10 | Automações (`aba_automations`) + instalação de `pg_cron` — tela `1k` | `[Goal] [Manual]` Sonnet→Opus |
| 02.11 | IA (`aba_ai`) — tela `1l` | `[Goal] [Manual]` Sonnet→Opus |
| 02.12 | Dashboard (`1b`) + Configurações (`1m`) | `[Goal] [Manual]` Sonnet→Opus |
| 02.13 | Seed de demonstração + deploy FTP | `[Goal] [Manual]` Sonnet→Opus |
| 02.14 | Varredura de segredos pós-deploy | `[Plan]` Sonnet→Opus |
| 02.15 | Portão de segurança adversarial da superfície da Etapa 02 | `[Manual]` Opus |
| 02.16 | Geração do HANDOFF_UPGRADE | `[Plan]` Sonnet |

Toda subetapa `[Goal]` tem Objetivo/Conclusão/Qualidade/Evidência, esforço máximo e escalonamento de LLM declarados em `docs/00_PLANO_E_CRITERIOS.md` — conferir lá antes de abrir. Subetapa nova de escopo entra **entre a 02.12 e a 02.13**, para que seed/deploy, varredura de segredos e portão adversarial continuem sendo os últimos passos.

### Gaps que a 02.0 mediu e distribuiu (nenhum é erro da Etapa 01 — é trabalho que ninguém possuía)
- **Zero divergência de nomenclatura** entre `docs/02_MODELO_DE_DADOS.md` e o banco: 22 migrations, 12 schemas, contagem de tabela por schema e inventário de função conferidos por `list_migrations`/`information_schema`/`pg_proc`.
- `crm/src/index.css` ainda tem a paleta neutra do shadcn, marcada no arquivo como placeholder; `docs/04` §5 fechou a paleta real → **02.1**.
- `crm/src/lib/auth.tsx` e `app/RoleGate.tsx` ainda dizem "entra quando `access`/`public.profiles` existirem"; `access.readable_modules()` nunca é chamada; `nav.ts` tem 1 item fixo → **02.1**.
- `access.modules.position` tem `catalog`(3)/`messaging`(6)/`sales`(7); o wireframe quer `sales`(3)/`catalog`(6)/`messaging`(7) → migration de `UPDATE` na **02.1**.
- `@tanstack/react-table`, lib de drag-and-drop e `date-fns` ausentes de `crm/package.json` → **02.1**.
- Nenhuma RPC do fluxo de convite existe → **02.2**. `pgcrypto` já está instalado em `extensions`, o que viabiliza a RPC `criar_convite()`.
- `pg_cron` disponível mas **não instalado** — quatro rotinas do banco estão sem motor → **02.10** (pendência vigiada aberta).
- `Propostas` e `Espera e encaixes` da sidebar do wireframe não têm tabela → **fora da nav do v01**, por decisão da 02.0.
- CRM-Sindcom **rebaixado**: deixa de ser fonte de UI/UX; segue referência de config de build e do runbook de deploy FTP (não está clonado localmente, reobter na 02.13).

## Armadilhas conhecidas / decisões travadas
Lista completa e viva em `handoffs/instrucoes.md` §6. As mais relevantes para quem vai construir UI agora:

- **`select('*')` quebra em 6 tabelas com narrowing de coluna** (`webhook_endpoints`, `api_keys`, `account_invitations`, `aba_ai.ia_configuracoes`, `aba_messaging.configuracao_whatsapp`, `aba_messaging.provedores_canal`) — devolve `42501 permission denied for table`, que parece falha de RLS e engana a investigação. Toda tela que toque essas tabelas precisa listar colunas explicitamente no `.select()`.
- **`design/wireframes-crm-sa-de-e-est-tica/project/_ds/` não é a fonte da paleta/tipografia** — os dois design systems ali dentro não foram usados nos 16 wireframes reais (um pertence a outro produto de Max inteiramente). A paleta ratificada está em `docs/04_DESIGN_E_MARCA.md` §5.
- **XSS armazenado é fronteira aberta por design nesta Etapa** — o banco guarda payload malicioso literal (correto, é dado); a defesa é da camada de renderização. **Item obrigatório da Subetapa 02.15** — testar contra a UI real assim que ela existir.
- **`service_role` ignora RLS** — qualquer Edge Function/job novo da Etapa 02 precisa reafirmar `account_id` no filtro à mão; a RLS não participa desse caminho (achado A06 da 01.8, já corrigido no webhook existente, mas o padrão vale para qualquer função nova).
- **Onde estabelecer um hardening de segurança novo, varrer o catálogo inteiro** (`information_schema` + `has_column_privilege`/`has_function_privilege`) em vez de confiar em releitura de módulo por módulo — foi assim que a 01.8 achou o 4º caso de credencial exposta que a leitura de código sozinha não tinha achado.
- **`aba_people.pessoas.contato_id` sem FK para `aba_messaging.contatos_canal`** — decisão deliberada (exportabilidade de módulo), não reintroduzir sem resolver o problema que ela reabre.
- **Consentimento de imagem clínica trava a exibição, não o envio, para todos inclusive quem tirou a foto** — decisão de Max mantida; revisão condicionada à prova de fogo (03.1).
- **Nunca inventar número de telefone para teste de envio** (Meta Cloud API) — incidente real registrado em projeto irmão.
- Convenção de nomenclatura híbrida (`CLAUDE.md` §2) continua valendo: schema em inglês, objetos internos em português/BR, sem exceção não documentada.

## Próximo passo da Etapa 02
A **Subetapa 02.0 está concluída** (2026-08-18, Opus, uma tentativa) — relatório de divergências dentro do próprio `docs/00_PLANO_E_CRITERIOS.md`, no Status da 02.0.

O próximo passo é a **Subetapa 02.1 — Fundação visual e de sessão do app** `[Goal]` `[Manual]` `[LLM: Sonnet]`. É a subetapa que fecha a lacuna que a Etapa 01 deixou declarada em comentário de código: aplicar a paleta/tipografia ratificadas em `docs/04_DESIGN_E_MARCA.md` §5, reconstruir o `AppShell` no shell do wireframe (sidebar 236px + header 56px), fazer o `AuthProvider` resolver `public.profiles` e a navegação sair de `access.readable_modules()` em vez de lista fixa, aplicar a migration de `access.modules.position` na ordem ratificada e instalar as dependências de UI que o design exige. Esforço máximo: 4 tentativas (Sonnet nas 3 primeiras, Opus na última). Ver `docs/00_PLANO_E_CRITERIOS.md` para o critério completo de Conclusão/Qualidade/Evidência — e a "Qualidade fixa de toda subetapa de tela" declarada logo antes da 02.1, que vale para 02.1–02.12 sem ser repetida item a item.