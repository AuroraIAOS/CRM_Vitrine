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
npm run dev
```

O `.env` fica na raiz do repositório (não em `crm/`) — `crm/vite.config.ts` aponta `envDir` para lá.

## Status do projeto

**Etapa 01 concluída** — fundação completa aplicada no Supabase: núcleo (`public`/`access`/`licensing`) + 9 schemas de módulo (`aba_people`, `aba_catalog`, `aba_scheduling`, `aba_finance`, `aba_health`, `aba_sales`, `aba_automations`, `aba_ai`, `aba_messaging`), webhook Meta Cloud API no ar, suíte de RLS com 100/100 testes verdes (incluindo o portão de segurança adversarial da Subetapa 01.8, que corrigiu 6 falhas reais), varredura de segredos zerada. Portão de saída da Etapa 01 aberto. Próximo passo: Subetapa 02.0 do Claude CODE (leitura de referências e revisão do plano da Etapa 02) — ver `handoffs/HANDOFF_BUILD.md`. Roteiro completo em `docs/00_PLANO_E_CRITERIOS.md`. Dicas técnicas e armadilhas conhecidas em `handoffs/instrucoes.md`. Histórico de versões em `CHANGELOG.md`.
