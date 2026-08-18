# HANDOFF_BUILD — CRM Vitrine

## Estado atual
Fundação concluída e versionada. `main` = `c5f8e4f`, alinhada ao projeto Supabase real (`uitwttyyppxvcgfdhnlz`) — nenhuma divergência entre repositório e banco. Etapa 01 fechada, portão de saída 100% verde. Nova sessão (Etapa 02) constrói a UI sobre esta fundação.

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
- **Login multi-conta:** adiado para `+1.0` (backlog de versionamento) — 02.1 constrói single-account.
- **Perfis 1n/1o:** mapeados sobre o RBAC existente (`agent`+atributo profissional / `admin`), sem tabela/enum novo.
- **Pendência real que a 02.0 PRECISA formalizar no roteiro:** o fluxo de convite→funcionário→atributo profissional foi verificado contra o CRM Maximus (018/019/074/075/076) e segue deferido desde a Etapa 01 — falta construir as RPCs de convite, o trigger de nascimento automático de funcionário e a RPC de liga/desliga do atributo profissional (com regra nova: só `agent`, nunca `admin`). Decidir onde isso entra no roteiro (dentro da 02.1 ou subetapa própria) é trabalho da 02.0. Ver `docs/01_ARQUITETURA.md` §7.4.

## O que a Etapa 02 deve construir (do PLANO_E_CRITERIOS)
1. **02.0** — Leitura de referências e revisão do plano (convenção `0X.0`, `[Plan]`, Opus): reconferir `HANDOFF_BUILD.md` e as decisões da Etapa 01 contra o estado real do repositório/banco; reconsultar CRM-Sindcom por padrões de UI ainda não usados; ajustar `docs/00_PLANO_E_CRITERIOS.md` se necessário — **incluindo formalizar a pendência do fluxo de convite/funcionário acima.**
2. **02.1** — CRUD de Pessoas (`aba_people`), `[Goal] [Manual]`, Sonnet: listar/criar/editar lead → converter para cliente, tags/notas/campos customizados persistindo através da conversão.
3. **02.2** — CRUD de Vendas (`aba_sales`), `[Goal] [Manual]`, Sonnet: kanban de funil com oportunidades arrastáveis, sempre ligadas a `pessoa_id`.
4. **02.3** — Mensageria (Meta Cloud API), `[Goal] [Manual]`, Sonnet: tela de conversa enviando/recebendo via Meta Cloud API real (conta de teste), sem credencial de canal exposta no client.
5. **02.4** — Seed de demonstração + deploy, `[Goal] [Manual]`, Sonnet: `seed/` com dados fictícios cobrindo todos os módulos v01; build + deploy FTP em subdomínio de demonstração.
6. **02.5** — Varredura de segredos pós-deploy, `[Plan]`, Sonnet: repetir a 01.7 (o deploy real pode ter introduzido `.env.deploy`/credencial de FTP no histórico).
7. **02.6** — Portão de segurança adversarial da superfície da Etapa 02, `[Manual]`, Opus: mesmos 7 passos da 01.8, agora cobrindo UI real, autenticação de usuário final, deploy FTP, subdomínio público. **Herda dois itens já identificados na 01.8** (ver seção seguinte).
8. **02.7** — Geração do HANDOFF_UPGRADE, `[Plan]`, Sonnet.

Toda subetapa `[Goal]` tem esforço máximo e escalonamento de LLM declarados em `docs/00_PLANO_E_CRITERIOS.md` — conferir lá antes de abrir.

## Armadilhas conhecidas / decisões travadas
Lista completa e viva em `handoffs/instrucoes.md` §6. As mais relevantes para quem vai construir UI agora:

- **`select('*')` quebra em 6 tabelas com narrowing de coluna** (`webhook_endpoints`, `api_keys`, `account_invitations`, `aba_ai.ia_configuracoes`, `aba_messaging.configuracao_whatsapp`, `aba_messaging.provedores_canal`) — devolve `42501 permission denied for table`, que parece falha de RLS e engana a investigação. Toda tela que toque essas tabelas precisa listar colunas explicitamente no `.select()`.
- **`design/wireframes-crm-sa-de-e-est-tica/project/_ds/` não é a fonte da paleta/tipografia** — os dois design systems ali dentro não foram usados nos 16 wireframes reais (um pertence a outro produto de Max inteiramente). A paleta ratificada está em `docs/04_DESIGN_E_MARCA.md` §5.
- **XSS armazenado é fronteira aberta por design nesta Etapa** — o banco guarda payload malicioso literal (correto, é dado); a defesa é da camada de renderização. **Item obrigatório da Subetapa 02.6** — testar contra a UI real assim que ela existir.
- **`service_role` ignora RLS** — qualquer Edge Function/job novo da Etapa 02 precisa reafirmar `account_id` no filtro à mão; a RLS não participa desse caminho (achado A06 da 01.8, já corrigido no webhook existente, mas o padrão vale para qualquer função nova).
- **Onde estabelecer um hardening de segurança novo, varrer o catálogo inteiro** (`information_schema` + `has_column_privilege`/`has_function_privilege`) em vez de confiar em releitura de módulo por módulo — foi assim que a 01.8 achou o 4º caso de credencial exposta que a leitura de código sozinha não tinha achado.
- **`aba_people.pessoas.contato_id` sem FK para `aba_messaging.contatos_canal`** — decisão deliberada (exportabilidade de módulo), não reintroduzir sem resolver o problema que ela reabre.
- **Consentimento de imagem clínica trava a exibição, não o envio, para todos inclusive quem tirou a foto** — decisão de Max mantida; revisão condicionada à prova de fogo (03.1).
- **Nunca inventar número de telefone para teste de envio** (Meta Cloud API) — incidente real registrado em projeto irmão.
- Convenção de nomenclatura híbrida (`CLAUDE.md` §2) continua valendo: schema em inglês, objetos internos em português/BR, sem exceção não documentada.

## Primeiro passo da Etapa 02
**Subetapa 02.0 — Leitura de Referências e Revisão do Plano da Etapa 02** `[Plan]` `[LLM: Opus]`. Objetivo: reler este handoff e as decisões da Etapa 01 contra o estado real do repositório/banco (confirmar que schemas, nomes de tabela/coluna/função batem com o que foi de fato aplicado — nenhuma subetapa 02.x pode referenciar algo divergente); reconsultar CRM-Sindcom por padrões de UI/UX (shadcn, formulários, tabelas) ainda não usados no Vitrine. Esforço máximo: 2 tentativas (Sonnet → Opus). Ver `docs/00_PLANO_E_CRITERIOS.md` para o critério completo de Conclusão/Qualidade/Evidência.
