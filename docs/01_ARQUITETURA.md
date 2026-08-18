# 01_ARQUITETURA — CRM Vitrine

## 1. O que é este projeto

CRM Vitrine é o CRM-modelo de Max: modular, clonável, comercializável. Não roda "em produção para um cliente" — roda como base padronizada que é clonada e configurada por CRM-filho. Substitui o CRM Maximus como base de clonagem, mantendo o modelo de dados (RLS/RBAC/IBAC) que já provou valor lá, sobre uma casca de infraestrutura muito mais barata de operar.

## 2. Stack essencial v01

| Camada | Escolha | Por quê |
|---|---|---|
| Frontend | Vite + React 18 + TypeScript + PWA | Mesma stack já validada em produção no CRM Sindcom — zero curva de aprendizado, builds rápidos, baixo custo de token no Claude CODE. |
| Componentes/UI | shadcn/ui + Tailwind, TanStack Query/Table, react-hook-form + zod | Idêntico ao Sindcom — reaproveitamento direto de padrão já dominado. |
| Backend | 100% Supabase (Postgres + Auth + RLS + Storage + Edge Functions) | Nenhum servidor próprio para manter. Toda regra de negócio pesada vive em SQL. |
| Automação agendada | `pg_cron` (nativo Postgres/Supabase) | Substitui o pinger externo que o Maximus precisava (endpoint Next.js + `AUTOMATION_CRON_SECRET`). |
| Mensageria WhatsApp | Meta Cloud API (oficial) via Edge Function | Webhook + envio, sem processo persistente. **Evolution GO fica fora do escopo v01** — exige processo persistente (servidor Go + Postgres próprio), incompatível com hospedagem estática. Reavaliar como módulo pago pós-receita, em VPS isolada, desacoplada do app principal. |
| IA | Bring-your-own-key por conta (OpenAI/Anthropic), chave criptografada (AES-256-GCM) via Edge Function | Nenhuma chave global de LLM no `.env` — cada CRM-filho paga sua própria IA. Padrão herdado do Maximus, mantido por ser genuinamente bom. |
| Deploy | Build estático (`npm run build`) + upload FTP para hospedagem compartilhada (Hostgator, subdomínio por cliente) | Mesmo processo do Sindcom, já testado e documentado. Sem Docker, sem VPS, sem SSH. |

## 3. Por que esta stack (não a do Maximus)

O Maximus (Next.js 16 + React 19 + Docker Compose + VPS + Evolution GO) provou o **modelo de dados** (schemas modulares, RBAC hierárquico + fino, ABAC/IBAC para saúde) mas a operação (Docker/VPS/SSH/depuração de sessão do Evolution GO) consumiu limite de token do Claude CODE de forma desproporcional ao valor entregue — um limite semanal inteiro em dois dias, só na revisão da Etapa 02. Diagnóstico: o custo não vinha do React em si, vinha de três fatores que esta stack elimina:

1. **Ciclos de depuração remota** (Docker/VPS/SSH) — cada "não subiu, vamos ver o log" é uma rodada cara de comandos e saída verbosa. Build + FTP não tem esse ciclo.
2. **Evolution GO como caixa-preta** — servidor de terceiro, sessão que cai, reconexão manual. Fora do escopo v01.
3. **Stack de fronteira** (Next 16, React 19.2, Tailwind v4) — pouca base de treinamento sólida, mais tentativa-e-erro. Vite + React 18 é terreno consolidado.

## 4. Mecanismo de exportação de módulos

Cada `aba_<modulo>` é uma unidade fechada: schema próprio, RLS própria, `set_updated_at()` própria (não depende do núcleo). "Clonar" um CRM-filho é: copiar `public`/`access`/`licensing` (sempre) + os schemas `aba_*` que o cliente contratou + a fatia correspondente da UI. Formalizar esse processo como checklist repetível é a Subetapa 01 do plano — hoje ainda é manual, mas documentado.

## 5. O que fica fora do MVP (v01)

- Evolution GO (WhatsApp self-hosted) — fase paga, pós-receita.
- Motor de RAG com arquivos versionados no repo — conhecimento de IA fica em tabela (`aba_ai.ia_documentos_conhecimento`), carregado pela própria aplicação, não versionado no Git.
- CLI/automação formal de clonagem — processo manual documentado é aceitável para os primeiros clones.
- `HaveIBeenPwned` no Supabase Auth — depende de plano Supabase premium; ativar quando o primeiro cliente pagar por isso.

## 6. Integrações previstas

Ver `06_INTEGRACOES_EXTERNAS.md` para o contrato da Meta Cloud API e o que fica pronto para ligar o Evolution GO no futuro sem redesenhar o schema de `aba_messaging`.

## 7. Decisões de UI e fluxo de equipe — Etapa de Transição 1→2 (pacote de design ratificado)

Max fechou o design do MVP no Claude Design e considera essa etapa concluída. Pacote-fonte: `design/wireframes-crm-sa-de-e-est-tica/` (16 telas, `1a`–`1p`, canvas de referência 1280×820) — inventário completo, paleta e padrões de componente em `design/README.md` e `docs/04_DESIGN_E_MARCA.md`. Este parágrafo registra só as decisões de arquitetura que o design obrigou a tomar, algumas delas revertendo ou ajustando o que já estava aplicado no banco.

### 7.1 Navegação — shell e ordem de módulos
Shell compartilhado: sidebar 236px + header 56px, 9 grupos de módulo (`aba_people`→`aba_scheduling`→`aba_sales`→`aba_finance`→`aba_health`→`aba_catalog`→`aba_messaging`→`aba_automations`→`aba_ai`) mais **Configurações/Suporte/Sair** fixos fora do loop de módulos — bate com `access.modules.is_core=true` de `settings`, sem gap.
**Divergência resolvida:** a ordem do wireframe difere de `access.modules.position` já aplicado (`003_core_access.sql`): o banco tem `catalog`(3)/`scheduling`(2) antes de `sales`(7); o wireframe quer `scheduling`→`sales`→`finance`→`health`→`catalog`. **Decisão: a ordem do wireframe é a fonte de verdade da navegação.** Realinhar `access.modules.position` via migration simples de `UPDATE` fica registrado como tarefa da Etapa 02 (baixo risco, reversível, não bloqueia).
**Ícones:** `lucide-react` confirmado como biblioteca — o wireframe não especifica (usa placeholders geométricos), mas o código real (`crm/src/app/AppShell.tsx`) já adotou Lucide; não há contradição a resolver.

### 7.2 Login multi-conta (tela 1a) — decisão de Max, 2026-08-18
O wireframe mostra um seletor de conta pós-login (usuário pertencendo a mais de um CRM-filho). O schema aplicado trava 1 usuário = 1 conta (`public.profiles.user_id UNIQUE`), sem tabela de associação N:N. **Decisão: a Etapa 02 constrói o login single-account, como o schema atual já suporta.** O seletor de múltiplas contas entra no backlog de versionamento (`docs/00_PLANO_E_CRITERIOS.md`) como item `+1.0` — exigiria redesenho de `profiles`/RBAC, fora do MVP. Nenhuma migration decorre disto agora.

### 7.3 Perfis de UI reduzida (telas 1n "Meu dia" e 1o "Balcão") — decisão de Max, 2026-08-18
`PERFIS` (`admin`/`profissional`/`recepcao`) do wireframe **não é papel novo de RBAC** — `public.account_role_enum` continua `owner`/`admin`/`agent`/`viewer`, sem alteração. Mapeamento confirmado por Max:
- **1n "Meu dia" (perfil profissional)** = usuário com `account_role = 'agent'` **e** registro ativo em `aba_scheduling.profissionais` com `ativo = TRUE` e `acesso_clinico = TRUE` (o atributo "profissional" já modelado desde a Subetapa 01.3/01.4).
- **1o "Balcão" (perfil recepção)** = usuário com `account_role = 'admin'`, sem o atributo profissional (não existe toggle "recepção" separado — `admin` cobre esse papel de equipe no Vitrine).

Ambas as telas ficam no escopo da Etapa 02, como filtro de UI sobre o RBAC já existente (`access.readable_modules()`), nunca duplicando a checagem de permissão em código de front — a régua real continua sendo `access.can()`/RLS.

**Regra nova desta sessão (não existe no CRM Maximus):** o atributo profissional só pode ser concedido a funcionário cujo `account_role = 'agent'` — um `admin` nunca pode virar profissional ativo. Formaliza-se como `CHECK` na RPC de liga/desliga do atributo, quando construída (ver 7.4).

### 7.4 Fluxo de convite → funcionário → atributo profissional — verificado contra o CRM Maximus
Max pediu confirmação de que o fluxo do Vitrine ainda bate com a última versão implantada no Maximus (migrations `018_account_member_rpcs.sql`/`019_invitation_rpcs.sql`/`074_employees_born_from_invitation.sql`/`075_professionals_require_employee.sql`/`076_health_can_access_requires_active_employee.sql`, lidas linha a linha em `C:\GitHub\CRM_Maximus\supabase\migrations\` nesta sessão). **Confirmado: sim, mesmo desenho de 5 passos** (owner convida por e-mail → funcionário aceita → aparece automaticamente na conta do owner → owner liga/desliga o atributo profissional por um checkbox → acesso ao CRM segue role/atributo), e a ponta final desse fluxo **já está portada fielmente**: `aba_health.pode_acessar()` (`013_aba_health.sql`, Subetapa 01.4) reproduz a lógica da migration `076` do Maximus quase byte a byte — profissional ativo **e** funcionário por trás ativo, sem escrita cruzada entre `aba_people` e `aba_scheduling`.

O que falta construir — **deferido conscientemente desde as Subetapas 01.2/01.3, não esquecido** (`001_core_public.sql` e `009_aba_scheduling.sql` já documentavam o gap):
- RPCs `peek_convite`/`resgatar_convite` (equivalente à `019`) — aceite move `profiles.account_id`/`account_role`.
- Trigger equivalente à `074` — `profiles` ganhando conta dispara nascimento automático de `aba_people.funcionarios` ativo.
- RPC equivalente à `scheduling.set_professional` da `075`, traduzida (`aba_scheduling.definir_profissional` ou nome similar) — liga/desliga `aba_scheduling.profissionais.ativo`, checando `admin+` no corpo **e** a regra nova do §7.3 (só `agent`).
- `CHECK` `profissionais_ativo_exige_funcionario` (Maximus `075`) — também deferido, entra junto.

Este bloco de trabalho é candidato natural a subetapa dedicada dentro da Etapa 02 (antes ou junto da 02.1) — a formalização de onde exatamente ele entra no roteiro é tarefa da **Subetapa 02.0** (revisão de plano), não desta rodada de registro de decisões.

### 7.5 Pacotes de design system do Claude Design (`_ds/`) — ruído, não decidido pelo Vitrine
O pacote trouxe dois design systems de referência (`alma-pura-design-system`, `classical`) que **não foram usados** nos wireframes reais — confirmado por comparação direta de paleta/tipografia/regras (ex.: `alma-pura` proíbe branco puro, mas o shell usa `#ffffff`; `classical` exige botão sempre outline, mas o wireframe usa botão preenchido). `alma-pura-design-system` pertence a outro produto de Max (Instituto Alma Pura), sem relação com o Vitrine. Tratar `_ds/` como boilerplate do processo do Claude Design a ignorar — a paleta/tipografia real ratificada está em `docs/04_DESIGN_E_MARCA.md` §5.
