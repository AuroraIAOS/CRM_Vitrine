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
