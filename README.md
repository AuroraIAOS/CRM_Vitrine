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

Preenchido de fato na Etapa 01 do Claude CODE (ver `handoffs/HANDOFF_CODE.md`).

## Status do projeto

Fundação recém-gerada pelo ESTÁGIO CRIATIVO (aurora-criativa); Subetapa 01.0 (leitura de referências e planejamento) concluída. Próximo passo: Subetapa 01.1 do Claude CODE (ver `handoffs/HANDOFF_CODE.md`). Roteiro completo em `docs/00_PLANO_E_CRITERIOS.md`. Dicas técnicas e armadilhas conhecidas em `handoffs/instrucoes.md`. Histórico de versões em `CHANGELOG.md`.
