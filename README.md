# CRM Vitrine

CRM modular, clonável e comercializável — base padronizada para os CRMs-filhos de Max.

## Problema e persona

Max precisa vender CRMs configurados por cliente o quanto antes, sem reconstruir do zero a cada venda. O CRM Maximus provou o modelo de dados certo (módulos, RBAC/ABAC, RLS) mas sobre uma infraestrutura (Next.js + VPS + Docker + Evolution GO) cara demais de operar sozinho. O CRM Vitrine porta o que funciona para a stack que Max já domina (Vite + Supabase + hospedagem estática), corrigindo no caminho a mistura de schemas herdada dos repositórios de referência.

## Escopo do MVP (dentro)

- Núcleo de conta/identidade (`public`) + RBAC hierárquico e fino (`access`).
- `aba_people` — pessoas unificadas (leads, clientes, funcionários, fornecedores) com tags/notas/campos customizados presos à pessoa, não ao canal.
- `aba_catalog`, `aba_scheduling`, `aba_finance`, `aba_health`, `aba_messaging` — portados do Maximus, RLS/RBAC/IBAC preservados.
- `aba_sales`, `aba_automations`, `aba_ai` — novos, resolvendo o que estava solto e não-modularizado em `public` no Maximus.
- Mensageria via Meta Cloud API (oficial, sem servidor próprio).
- Deploy por build estático + FTP, como o CRM Sindcom.

## Fora do MVP (depois)

- Evolution GO (WhatsApp self-hosted) — módulo pago futuro, VPS isolada.
- RAG com arquivos versionados no repo.
- CLI de clonagem automatizada de CRM-filho.

## Como rodar

```bash
cd crm
npm install
npm run dev            # aplicação, contra o Supabase de produção
npm run test:rls       # suíte de segurança, contra o Supabase de TESTE
```

O `.env` fica na raiz do repositório (não em `crm/`) — `crm/vite.config.ts` aponta `envDir` para lá.

**A suíte de testes usa um projeto Supabase separado do de produção** (desde a Subetapa 02.15). Ela cria contas de verdade e executa ataques adversariais, então **recusa rodar** se as variáveis `SUPABASE_TEST_*` faltarem ou se apontarem para o mesmo projeto de produção — a mensagem de erro diz exatamente o que preencher. É erro e não aviso de propósito: cair para produção em silêncio seria pior que não separar. Para levantar um banco de teste do zero a partir das migrations: `node scripts/provisionar_banco.mjs`.

## Status do projeto

**MVP v01 no ar** — https://vitrine.strategicepiphany.com

**Etapa 02 concluída**, portão de saída verde. Os 9 módulos do v01 entregues com UI real em 16 telas, sobre 12 schemas e 80 tabelas com RLS ativa e testada em toda tabela. Motor de rotinas com `pg_cron` (5 jobs ativos), 5 Edge Functions, agente de IA com chave por conta (cifrada, verificada contra o provedor antes de gravar, nunca devolvida), aparência configurável por conta e seed de demonstração cobrindo os 9 módulos.

**Segurança:** duas auditorias adversariais executadas (Subetapas 01.8 e 02.15), que atacaram o sistema de propósito em vez de conferir o caminho feliz. Juntas encontraram **12 falhas reais**, todas corrigidas e transformadas em teste permanente. A da Etapa 02 encontrou uma brecha que atravessava os 9 módulos e que nenhuma política de permissão poderia ter fechado — a verificação de chave estrangeira ignora RLS por especificação do PostgreSQL. Suíte final: **186 casos**, rodando em **banco separado do de produção**. Varredura de segredos zerada; `typecheck` limpo.

**Fora do escopo entregue:** a configuração da API oficial do WhatsApp (Meta) segue congelada por decisão de Max — o produto trata isso com honestidade, registrando no log o passo que não executa em vez de fingir sucesso. Detalhe em `handoffs/HANDOFF_UPGRADE.md`.

**Etapa 03 em curso — fechamento do MVP odontológico.** Entre as Etapas 02 e 03 correu um benchmark de 8 concorrentes (5 brasileiros, incluindo os 3 mais vendidos do país) e um dossiê de UX com três versões completas: `design/benchmark/` e `design/ux/`. Dali saíram os **24 itens do MVP odontológico** e o roteiro de sete etapas que Max fixou em 2026-09-02. A Etapa 03 cobre as quatro primeiras — uniformidade, os 24 itens, a UX e o portão adversarial — em 24 subetapas, planejadas na Subetapa 03.0 e detalhadas em `docs/00_PLANO_E_CRITERIOS.md`. Recorte enxuto só da Etapa 03, com tabela de progresso, em `docs/00a_PLANO_ETAPA_03.md` — cópia sincronizada a cada subetapa, docs/00 continua sendo a fonte canônica.

Próximo passo: **Subetapa 03.4** (agendamento: espera, marcadores e cadeiras). Roteiro completo em `docs/00_PLANO_E_CRITERIOS.md` (recorte rápido em `docs/00a_PLANO_ETAPA_03.md`). Dicas técnicas e armadilhas conhecidas em `handoffs/instrucoes.md`. Backlog comercial das Etapas 5 e 6 em `docs/07_BACKLOG_COMERCIAL.md`. Histórico de versões em `CHANGELOG.md`.
