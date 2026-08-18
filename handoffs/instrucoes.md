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

### Trigger que auto-cria "pessoa" para todo profile novo invalida qualquer domain-check que use a MESMA tabela como sinal de "conta vazia"
- **Gatilho:** Subetapa 02.2 — `resgatar_convite()` recusa resgate quando a conta pessoal do convidado "já contém dados", varrendo (entre outras) `aba_people.pessoas`. A migration `024` também instala `aba_people.nascer_funcionario_do_perfil()`, que cria uma `pessoas`+`funcionarios` automática para TODO profile novo (inclusive o próprio dono no cadastro). Resultado: toda conta pessoal recém-criada já nasce com exatamente 1 linha em `pessoas` (ela mesma) — o domain-check em `pessoas` dava falso positivo 100% das vezes, barrando até o primeiro resgate de convite legítimo da suíte de testes desta própria subetapa (`23505` inesperado).
- **Ação:** o domain-check trocou de `aba_people.pessoas` para as tabelas de **papel** (`leads`/`clientes`/`fornecedores`) — nunca tocadas pelo trigger de nascimento automático, então só ficam não-vazias quando a conta teve uso real de CRM. Regra geral: ao adicionar um trigger que popula uma tabela automaticamente como efeito colateral de outro evento (aqui, criação de perfil), toda lógica existente que usava aquela tabela como proxy de "vazio/não usado" precisa ser reauditada — o trigger muda o que "vazio" significa para ela.
- **Evidência:** `db/migrations/024_equipe_convite_funcionario_profissional.sql`, comentário "ADAPTAÇÃO DE ESQUEMA"; `crm/tests/rls/13_equipe_convite.spec.ts`, todos os testes de resgate passando depois da troca.
- **Fonte:** Subetapa 02.2, sessão de 2026-08-18.

### CHECK novo em tabela compartilhada quebra fixture de subetapa anterior que não sabia da invariante nova — 5 arquivos de teste precisaram de ajuste
- **Gatilho:** Subetapa 02.2 — as duas CHECKs novas (`funcionarios_ativo_exige_login`, `profissionais_ativo_exige_funcionario`, ambas exigidas pelo porte da migration 075 do Maximus) quebraram, ao rodar a suíte inteira: dois fixtures em `05_aba_health.spec.ts` que inseriam `profissionais` direto via `admin` sem `funcionario_id` (só precisavam de um alvo de FK, ativo=true por padrão passou a violar a CHECK); um terceiro fixture no mesmo arquivo que criava um `funcionarios` PRÓPRIO para `ctx.profileIds.agent` — mas o backfill da própria 024 já tinha criado um (o índice único `idx_funcionarios_profile_unico` rejeitou o segundo); o mesmo padrão em `03_aba_scheduling.spec.ts` (2 fixtures) e `04_aba_finance.spec.ts` (1 fixture); e `10_adversarial_nucleo.spec.ts`/`11_adversarial_superficie.spec.ts`, cujos ataques com usuário descartável agora colidem com o funcionário automático que o próprio cadastro cria.
- **Ação:** fixtures que só precisavam de um `profissionais` como alvo de FK (sem testar governança) ganharam `ativo: false` (satisfaz a CHECK trivialmente, sem alterar o que o teste mede). O fixture que precisava de um funcionário real passou a REAPROVEITAR o já criado pelo backfill em vez de inserir um segundo. O ataque adversarial que apaga `profiles` para simular "usuário sem perfil" passou a desativar o funcionário automático ANTES de apagar o perfil (senão o `ON DELETE SET NULL` de `funcionarios.profile_id` colide com a CHECK). O teste de embedding cross-schema passou a aceitar a própria pessoa do atacante como legítima (ele é dono da própria conta), só continuando a exigir zero linhas de OUTRA conta.
- **Regra geral que fica:** toda CHECK/trigger novo que se aplica a uma tabela compartilhada (usada por fixtures de subetapas passadas) exige rodar a suíte INTEIRA antes de fechar a subetapa, não só os testes novos — a Subetapa 02.2 só achou os 5 arquivos afetados porque `npm run test:rls` roda tudo por padrão.
- **Evidência:** `crm/tests/rls/03_aba_scheduling.spec.ts`, `04_aba_finance.spec.ts`, `05_aba_health.spec.ts`, `10_adversarial_nucleo.spec.ts`, `11_adversarial_superficie.spec.ts` — 110/110 verdes depois do ajuste.
- **Fonte:** Subetapa 02.2, sessão de 2026-08-18.

### Coordenada de clique do Chrome automation não bate com pixel CSS da página — usar `ref` de `read_page`, nunca coordenada crua
- **Gatilho:** Subetapa 02.1 — ao logar como usuário de teste para capturar a evidência do shell, `triple_click`+`type` em coordenadas lidas de um screenshot anterior (1568×750) preencheu o campo errado / não preencheu nada, porque `read_page` reportou viewport real de 2549×1218 (e, em chamada seguinte, 650×649) — o espaço de pixel do screenshot (JPEG redimensionado) não é o mesmo espaço de coordenada em que `computer` clica. O sintoma era silencioso: nenhum erro, só o campo continuando com o valor antigo (autofill do Chrome sobrepondo o clique perdido).
- **Ação:** trocar `computer action:type` por coordenada por `form_input` com o `ref` devolvido por `read_page(filter:"interactive")`, e cliques em botão/link também por `computer action:left_click, ref:"ref_N"` em vez de coordenada. `ref` aponta o elemento DOM direto, imune a qualquer diferença de escala entre screenshot e viewport.
- **Regra geral que fica:** em qualquer subetapa que precise de evidência via `claude-in-chrome` (toda subetapa de tela a partir daqui, 02.1–02.12), preencher formulário e clicar sempre por `ref`, nunca por coordenada lida de um screenshot — coordenada serve só para decidir SE algo está no lugar certo visualmente, nunca para mirar o clique.
- **Evidência:** login funcionou de primeira depois da troca, confirmado pela mudança de URL de `/login` para `/`.
- **Fonte:** Subetapa 02.1, sessão de 2026-08-18.

### A criação de convite do Maximus morava no servidor Next.js — numa SPA estática ela não tem para onde ir
- **Gatilho:** Subetapa 02.0 — ao formalizar onde o fluxo de convite entra no roteiro da Etapa 02, a leitura de `019_invitation_rpcs.sql` do Maximus mostrou que só o **consumo** do convite virou RPC (`peek_invitation`/`redeem_invitation`). A **criação** nunca foi migration nenhuma: o comentário de cabeçalho da própria 019 diz "the plaintext token never reaches the DB; the route handler hashes it first". Confirmado por varredura — `grep -rn "create_invitation" supabase/migrations/` não devolve nada, e `account_invitations` só aparece em `017`/`019`/`026`. O Vitrine não tem route handler: é build estático servido por FTP, sem processo Node em lugar nenhum.
- **Ação:** a criação vira RPC `criar_convite()` `SECURITY DEFINER`, gerando o token com `pgcrypto` (já instalado em `extensions`, confirmado por `pg_extension`) e devolvendo o texto em claro **uma única vez** no retorno da chamada — nunca legível depois, já que `token_hash` tem narrowing de coluna desde a migration `022`. É a única peça do fluxo de equipe sem original a portar; todo o resto é tradução do Maximus.
- **Alternativa medida e descartada:** o client gerar o token e o hash e inserir a linha direto. É tecnicamente possível — medido por `has_column_privilege('authenticated', 'public.account_invitations', 'token_hash', ...)`: `INSERT` = `true`, `SELECT` = `false`, ou seja, um `admin` consegue escrever o hash sem nunca conseguir lê-lo de volta. Descartada porque delega ao browser a responsabilidade de hashear corretamente: um bug de client (algoritmo errado, encoding errado, token de baixa entropia) produz um convite que parece válido e não é, e nada no banco detecta. Com a RPC, a entropia e o algoritmo são do servidor.
- **Regra geral que fica:** ao portar qualquer fluxo do Maximus, conferir se a peça que falta estava numa migration **ou numa rota do app Next.js**. O mapa de `db/migrations/README.md` cobre só o primeiro caso — o que morava no servidor de aplicação é invisível para ele, e este projeto não tem servidor de aplicação para receber. Vale para o que vier de `026_api_keys.sql` e de qualquer outro fluxo com componente de servidor.
- **Evidência:** `docs/00_PLANO_E_CRITERIOS.md`, Subetapa 02.2 (Qualidade); `docs/01_ARQUITETURA.md` §7.4.
- **Fonte:** Subetapa 02.0, sessão de 2026-08-18.

### Comentário de código que difere trabalho para "quando X existir" não se cobra sozinho quando X passa a existir
- **Gatilho:** Subetapa 02.0 — a revisão do plano encontrou dois arquivos escritos na Subetapa 01.1 com adiamento explícito e correto no comentário: `crm/src/lib/auth.tsx` ("ainda não resolve papel/conta — `public.profiles`/`accounts` só existem a partir da Subetapa 01.2") e `crm/src/app/RoleGate.tsx` ("gate por papel/módulo entra quando `access`/`public.profiles` existirem — não simular RBAC no client antes de o RLS existir no banco"). A Subetapa 01.2 rodou em seguida e aplicou os dois schemas; os comentários continuaram lá, verdadeiros na forma e obsoletos no conteúdo, por seis subetapas. O mesmo aconteceu com `crm/src/index.css` ("paleta neutra padrão shadcn — placeholder até `docs/04_DESIGN_E_MARCA.md` fechar cor de destaque"), que `docs/04` §5 fechou na Etapa de Transição 1→2.
- **Ação:** os três viraram escopo declarado da Subetapa 02.1, com critério de Conclusão próprio. Nenhum era bug e nenhum apareceria em teste — `typecheck` limpo, 100/100 de RLS verdes, o app funciona; o que existe é uma promessa vencida que só a leitura do código encontra.
- **Regra geral que fica:** a subetapa `0X.0` de revisão de plano é o lugar certo para varrer o código atrás de adiamento vencido — `grep -rn "quando .* existir\|placeholder\|por ora\|ainda não" crm/src/` custa segundos e é a única varredura do processo que pega essa categoria. A condição que o comentário cita ("quando a Subetapa 01.2 rodar") é verificável mecanicamente; o comentário não é.
- **Evidência:** Subetapa 02.1 de `docs/00_PLANO_E_CRITERIOS.md`, Objetivo e Conclusão.
- **Fonte:** Subetapa 02.0, sessão de 2026-08-18.

### Fluxo de convite→funcionário→profissional verificado contra o CRM Maximus (Etapa de Transição 1→2)
- **Gatilho:** Max fechou o design do MVP no Claude Design (16 telas, `design/wireframes-crm-sa-de-e-est-tica/`) e pediu confirmação de que o fluxo de convite/configuração de funcionário do Vitrine — evidenciado pelas telas 1n ("Meu dia", perfil profissional) e 1o ("Balcão", perfil recepção) — ainda bate com a última versão implantada e discutida no CRM Maximus.
- **Ação:** lidas linha a linha `C:\GitHub\CRM_Maximus\supabase\migrations\018_account_member_rpcs.sql`, `019_invitation_rpcs.sql`, `074_employees_born_from_invitation.sql`, `075_professionals_require_employee.sql`, `076_health_can_access_requires_active_employee.sql`. Confirmado o mesmo desenho de 5 passos que Max descreveu (convite por e-mail → aceite → funcionário aparece automaticamente → owner liga/desliga atributo profissional por checkbox → acesso segue role/atributo). A ponta final do fluxo **já está portada fielmente**: `aba_health.pode_acessar()` (`013_aba_health.sql`, Subetapa 01.4) reproduz a lógica da migration `076` quase byte a byte. As peças que fazem o fluxo funcionar ponta a ponta (RPCs de convite, trigger de nascimento automático de funcionário, RPC de liga/desliga profissional, `CHECK` de "ativo exige funcionário") continuam **deferidas conscientemente** desde as Subetapas 01.2/01.3 — não é esquecimento, já estava documentado em `001_core_public.sql` e `009_aba_scheduling.sql`. Max acrescentou uma regra nova nesta sessão (sem equivalente no Maximus): o atributo profissional só pode ser concedido a funcionário com `account_role = 'agent'`, nunca `admin`.
- **Evidência:** `docs/01_ARQUITETURA.md` §7.3/§7.4, `docs/02_MODELO_DE_DADOS.md` (nota antes da tabela `fornecedores`).
- **Fonte:** Etapa de Transição 1→2, sessão de 2026-08-18.

### Paleta/tipografia do wireframe não vieram dos `_ds/*` do pacote — comparação direta desmentiu os dois
- **Gatilho:** o pacote de wireframes trouxe dois design systems de referência (`alma-pura-design-system`, `classical`) dentro de `project/_ds/`. Antes de tratar qualquer um como fonte da paleta ratificada, era preciso confirmar qual foi de fato usado nas 16 telas.
- **Ação:** comparação hex a hex. `alma-pura-design-system` proíbe explicitamente branco puro (`never use #FFFFFF`) — o shell real usa `#ffffff`. `classical` exige botão sempre outline — o wireframe usa botão preenchido de cor sólida. Nenhuma das duas famílias tipográficas (`Cinzel`/`Cormorant`/`Lato` do Alma Pura; `Cormorant`/`Lora` do Classical) aparece nas telas — o wireframe usa `IBM Plex Sans`/`IBM Plex Mono`, carregado direto via Google Fonts. `alma-pura-design-system` pertence a outro produto de Max inteiramente (Instituto Alma Pura), sem relação com o Vitrine.
- **Ação corretiva:** os dois `_ds/*` foram tratados como boilerplate do processo do Claude Design a ignorar. A paleta real foi extraída direto do HTML das 16 telas e ratificada em `docs/04_DESIGN_E_MARCA.md` §5.
- **Evidência:** `docs/01_ARQUITETURA.md` §7.5.
- **Fonte:** Etapa de Transição 1→2, sessão de 2026-08-18.

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

### `gitleaks` não vem pré-instalado no ambiente Windows do CODE — `winget install --id Gitleaks.Gitleaks -e` resolve, mas o binário some do PATH até reiniciar o shell
- **Gatilho:** Subetapa 01.7 — `gitleaks detect` exigido pelo plano, mas `gitleaks version` devolveu "command not found"; `scoop`/`choco`/`go` também ausentes no ambiente.
- **Ação:** `winget search gitleaks` confirma o pacote oficial `Gitleaks.Gitleaks` (mantido pelo próprio projeto upstream, não um fork de terceiro). `winget install --id Gitleaks.Gitleaks -e --accept-source-agreements --accept-package-agreements` instala, mas avisa "Path environment variable modified; restart your shell" — a sessão de shell corrente do CODE não reinicia sozinha. Caminho de contorno sem esperar restart: `Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter "Gitleaks*"` acha a pasta instalada e o binário é chamado pelo caminho completo (`...\Gitleaks.Gitleaks_Microsoft.Winget.Source_8wekyb3d8bbwe\gitleaks.exe`) direto, sem precisar do PATH atualizado.
- **Evidência:** Subetapa 01.7 — `gitleaks version` → `8.30.1` chamando pelo caminho completo, sem reiniciar a sessão.
- **Fonte:** Subetapa 01.7, sessão de 2026-08-17. **Relevante para a Subetapa 02.5** (repete a mesma varredura): se a sessão for nova/limpa, repetir esse mesmo caminho de instalação — ou, se o PATH já foi persistido pelo instalador do Windows entre sessões, `gitleaks` direto já deve funcionar sem o `Get-ChildItem`.

### RLS restringe QUAIS LINHAS, nunca QUAIS COLUNAS — e a policy de INSERT não vê o que a de UPDATE trava
- **Gatilho:** Subetapa 01.8 (portão adversarial) — achado A01, o mais grave da Etapa 01. A policy `profiles_insert` (001_core_public.sql) checava só `auth.uid() = user_id`. A trava de escalação de privilégio `enforce_profile_privilege_columns`, escrita justamente para impedir `account_role='owner'`, era `BEFORE UPDATE` — não cobria `INSERT`. Resultado medido ao vivo: um usuário autenticado **sem linha em `profiles`** se inseriu na conta de teste como `owner` e passou a enxergar `public.accounts` da vítima. Tomada de conta completa, sem nenhum privilégio prévio.
- **O que tornava o ataque alcançável:** o estado "usuário sem perfil" não é hipotético — `handle_new_user()` engole qualquer exceção (`EXCEPTION WHEN OTHERS ... RAISE WARNING; RETURN NEW`), então qualquer falha na criação da conta/perfil deixa o usuário em `auth.users` sem `profiles`, exatamente na condição que o `UNIQUE(user_id)` deixaria de bloquear.
- **Ação:** a policy de INSERT deixou de existir (ausência de policy nega por padrão — mesmo padrão de `licensing.account_limits`), porque não há escritor legítimo de `profiles` em `authenticated`: `handle_new_user` e as futuras RPCs de convite rodam `SECURITY DEFINER` como `postgres`, que não passa por RLS. A trava de coluna passou a cobrir `INSERT OR UPDATE`, como defesa em profundidade. Migration `022_hardening_portao_adversarial.sql`.
- **Regra geral que fica:** ao escrever qualquer trigger de trava de coluna, conferir se o `TG_OP` que ele cobre é o mesmo conjunto de caminhos que as policies abrem. Uma trava de `UPDATE` ao lado de uma policy de `INSERT` permissiva é uma porta, não uma trava. Vale para toda tabela com coluna de privilégio (`profiles.account_role`, `accounts.owner_user_id`, e qualquer futura).
- **Evidência:** `crm/tests/rls/10_adversarial_nucleo.spec.ts`, caso "H2: usuário SEM perfil não pode se inserir em conta alheia como owner" — vermelho antes da 022, verde depois.
- **Fonte:** Subetapa 01.8, sessão de 2026-08-17.

### Coluna de privilégio precisa de trigger próprio mesmo quando a policy de UPDATE parece restritiva
- **Gatilho:** Subetapa 01.8 — achado A02. `accounts_update` autoriza `admin+` a atualizar a linha da própria conta, o que é legítimo (o nome da conta é configuração). Mas `owner_user_id` mora na mesma linha, e RLS não distingue coluna: um `admin` reescreveu `accounts.owner_user_id` para si mesmo, transferindo a titularidade do registro sem passar por nenhum fluxo de transferência de posse.
- **Ação:** `enforce_account_privilege_columns()`, mesmo remédio já usado em `profiles` — trigger `BEFORE UPDATE` que recusa a alteração quando `current_user = 'authenticated'`. A troca legítima de dono virá pela RPC `transfer_ownership` (Maximus 019) na Etapa 02, `SECURITY DEFINER`, que passa livre por não ser `authenticated`. Migration `022`.
- **Evidência:** `10_adversarial_nucleo.spec.ts`, caso "H3: admin não pode se apossar da conta reescrevendo accounts.owner_user_id".
- **Fonte:** Subetapa 01.8, sessão de 2026-08-17.

### Hardening aplicado a um módulo não se propaga sozinho para os outros — o núcleo ficou para trás
- **Gatilho:** Subetapa 01.8 — achados A03/A04/A05/A07. A Subetapa 01.6 escondeu as colunas de segredo de `aba_messaging` por narrowing de coluna (Maximus 055), e isso foi tratado como "o padrão de segredo do projeto". Mas o padrão nunca foi aplicado retroativamente ao núcleo nem a `aba_ai`. Medido ao vivo: um **viewer** — o papel mais fraco do produto — leu `public.webhook_endpoints.secret` (segredo de assinatura, em TEXTO PURO), `public.api_keys.key_hash`, `public.account_invitations.token_hash` e `aba_ai.ia_configuracoes.chave_api`.
- **Como o quarto apareceu:** A03/A04/A05 saíram de leitura de código; A07 (`account_invitations.token_hash`) só apareceu numa varredura de catálogo por nome de coluna (`column_name ~* 'secret|senha|token|hash|chave|cifrad|...'` cruzada com `has_column_privilege('authenticated', ...)`). **Rodar essa varredura é mais confiável que reler migration por migration** — repetir a cada schema novo.
- **Ação:** migration `022` aplica o mesmo `REVOKE SELECT` de tabela + `GRANT SELECT (colunas)` das quatro tabelas, com a lista de colunas derivada do catálogo em vez de escrita à mão (coluna nova entra no GRANT sem reabrir a migration). Estado final conferido: as 8 colunas de credencial do banco agora têm `authenticated=false`, `anon=false`, `service_role=true`, uniformemente.
- **Evidência:** `10_adversarial_nucleo.spec.ts`, casos H19/H20/H21 + "CONTROLE NEGATIVO: esconder a credencial não quebrou o acesso legítimo" (prova que `admin` continua lendo a metadata do endpoint e que `service_role` continua lendo o segredo que precisa para assinar).
- **Fonte:** Subetapa 01.8, sessão de 2026-08-17.

### `service_role` ignora RLS — toda função de servidor precisa reafirmar a fronteira de conta no filtro, à mão
- **Gatilho:** Subetapa 01.8 — achado A06, no único endpoint público do sistema. `processarAtualizacaoStatus()` do webhook da Meta atualizava `aba_messaging.mensagens` filtrando só por `id_mensagem_externa`, com `service_role`, e sequer recebia o `accountId` que o próprio chamador já havia resolvido pelo `phone_number_id` duas linhas acima. Provado ponta a ponta contra a função implantada, com payload assinado por HMAC real: um evento de status legitimamente endereçado a uma conta alterou a mensagem de **outra** conta que tinha o mesmo id externo.
- **Ação:** `.eq("account_id", accountId)` acrescentado ao filtro; a função passou a receber o `accountId`. Correção de uma linha, mas o invariante que ela quebrava é o mais caro do produto (isolamento entre inquilinos). Implantada como v3 da função.
- **Regra geral que fica:** onde `service_role` (Edge Function, job de servidor, `pg_cron`) escreve ou lê, a RLS **não está** ajudando — o `account_id` no `WHERE` é a única fronteira. Mesmo raciocínio que as funções `SECURITY DEFINER` de `aba_health` já aplicam no banco ("`SECURITY DEFINER` não é filtrado por RLS — a fronteira de conta precisa ser reafirmada aqui dentro"), agora estendido ao código TypeScript do servidor. Conferir em toda função nova de Edge/cron da Etapa 02.
- **Evidência:** `crm/tests/rls/12_adversarial_webhook.spec.ts` — ataque contra a função real no ar, vermelho antes da v3 e verde depois; as 15 asserções da evidência da Subetapa 01.6 (`scripts/test_webhook_meta.mjs`) continuam verdes, provando ausência de regressão.
- **Fonte:** Subetapa 01.8, sessão de 2026-08-17.

### `public.rls_auto_enable()` aparece no advisor como executável por `anon` — não explorável, medido e aceito
- **Gatilho:** Subetapa 01.8 — o advisor de segurança do Supabase acusa `anon_security_definer_function_executable` para `public.rls_auto_enable()`, função de plataforma do próprio Supabase (event trigger que liga RLS em tabela nova de `public`). A Subetapa 01.2 já a havia excluído nominalmente da varredura de `005_harden_function_privileges.sql` ("não é nossa, não se mexe nela"), mas sem medir o que um chamador anônimo consegue de fato.
- **Ação:** medido em vez de suposto — `POST /rest/v1/rpc/rls_auto_enable` como `anon` devolve `400` com `0A000 — cannot display a value of type event_trigger`. O tipo de retorno `event_trigger` não é representável pelo PostgREST e o **corpo da função nunca executa**. Não explorável. Decisão: **não** mexer no objeto de plataforma — revogar `EXECUTE` de uma função que o Supabase mantém arrisca quebrar comportamento gerenciado da plataforma em troca de fechar um caminho que já não leva a lugar nenhum.
- **Reavaliar se:** a Supabase mudar o tipo de retorno dessa função, ou o advisor passar a classificá-la em nível acima de WARN.
- **Evidência:** medição HTTP direta registrada em `docs/RELATORIO_01.8_PORTAO_ADVERSARIAL.md`, vetor 2.
- **Fonte:** Subetapa 01.8, sessão de 2026-08-17.

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
- **Policy de `INSERT` permissiva anula trigger de trava que só cobre `UPDATE`.** Ao proteger coluna de privilégio, o `TG_OP` do trigger tem que cobrir o mesmo conjunto de caminhos que as policies abrem. Fonte: Subetapa 01.8, achado A01 (tomada de conta completa).
- **`select('*')` quebra por inteiro em tabela com narrowing por coluna** — devolve `42501 permission denied for table`, não uma linha com a coluna omitida. Medido nas oito tabelas de credencial do projeto. **Consequência direta para a Etapa 02:** toda tela que toque `webhook_endpoints`, `api_keys`, `account_invitations`, `ia_configuracoes` ou as duas tabelas de `aba_messaging` precisa listar colunas explicitamente no `.select()`. Erro sugere falta de permissão de RLS e manda a investigação para o lado errado. Fonte: Subetapa 01.8.
- **Onde `service_role` escreve, a RLS não protege nada.** Edge Function, `pg_cron` e job de servidor precisam do `account_id` no `WHERE` à mão — é a única fronteira entre inquilinos naquele caminho. Fonte: Subetapa 01.8, achado A06 (webhook da Meta cruzando conta).
- **Rotina de banco sem agendador falha em silêncio.** `pg_cron` está declarado em `docs/01_ARQUITETURA.md` §2 como o motor que substitui o pinger externo do Maximus, mas **não está instalado** (medido na Subetapa 02.0). Quatro rotinas já existem no banco sem ninguém que as chame: `aba_finance.marcar_faturas_vencidas()`, `aba_finance.expirar_planos()`, a drenagem de `aba_automations.automacao_execucoes_pendentes` e o disparo de `aba_scheduling.lembretes`. O sintoma é ausência de comportamento — fatura que nunca vence, lembrete que nunca chega — e ausência de comportamento não gera erro, não aparece em teste e não acusa em advisor. Fonte: Subetapa 02.0.
- **O wireframe é aspiracional em pelo menos dois pontos.** `Propostas` (`aba_sales`) e `Espera e encaixes` (`aba_scheduling`) estão na sidebar do `Shell.dc.html` e não têm tabela nenhuma; a segunda consta do backlog como *futuro*. Não inventar tabela para casar com o desenho — o desenho é que se ajusta ao escopo contratado. Fonte: Subetapa 02.0.
- **Hardening de um módulo não se propaga para os outros.** O padrão de esconder credencial nasceu em `aba_messaging` (01.6) e o núcleo ficou dois meses exposto porque ninguém reaplicou. Ao estabelecer um padrão de segurança novo, varrer o catálogo inteiro atrás de quem mais se encaixa nele — não confiar em releitura de migration. Fonte: Subetapa 01.8, achados A03/A04/A05/A07.

---

## 7. Candidatos a promoção

- **Modularidade por schema com migration autocontida por módulo** — se a prova de fogo do Vitrine confirmar, promover a convenção oficial de "projeto-vitrine" na skill do estágio criativo.
- **Regime de acesso a dado sensível — atributo + concessão nominal + log obrigatório** — reaproveitável em qualquer CRM-filho que toque saúde, jurídico ou financeiro de terceiro.
- **Convenção `0X.0` de revisão de plano no início de cada Etapa** — nasceu nesta sessão por pedido de Max (ver `docs/00_PLANO_E_CRITERIOS.md`); se funcionar bem nas Etapas 02/03, candidata a virar padrão do estágio criativo para todo projeto.
- **Portão de segurança adversarial como subetapa obrigatória de fim de Etapa** — a Subetapa 01.8 encontrou **6 falhas reais** (uma delas tomada de conta completa) numa fundação que já tinha 65 testes de RLS 100% verdes, varredura de segredos zerada e advisor limpo. Nenhuma teria aparecido em revisão de código normal nem na checklist funcional, porque todas eram caminho *não pretendido*, não comportamento pretendido quebrado. A relação custo/achado foi a melhor de toda a Etapa 01. Forte candidata a virar item obrigatório do estágio criativo para qualquer projeto que guarde dado de terceiro.
- **Varredura de catálogo por nome de coluna como técnica de auditoria** — `information_schema.columns` filtrado por `column_name ~* 'secret|senha|token|hash|chave|cifrad|...'` cruzado com `has_column_privilege()` achou uma credencial exposta (`account_invitations.token_hash`) que a leitura atenta de código não tinha achado. Barato, repetível, e independe de lembrar o que cada migration fez. Mesma ideia da varredura por `pg_proc` que a Subetapa 01.2 já usara para privilégio de função.
