repo: AuroraIAOS/CRM_Vitrine
branch: main

## Last sync

date: 2026-08-18T01:30:00Z

### Updated in this project

- Wireframes de 16 telas do MVP criados a partir dos modelos em `uploads/screenshots` e dos eixos `aba_*` do repo.
- Shell reutilizável (header + sidebar por schema + canvas) derivado de `layouts_modelos` e de `crm/src/app/AppShell.tsx`.
- Biblioteca de mapas clínicos esquematizada (odontograma FDI, corporal, facial, acupuntura) para `aba_health`.
- Paleta neutra clínica aplicada; tokens shadcn de `crm/src/index.css` seguem como base de tema.

## Screen map

| Tela (opção) | Origem no repo |
| --- | --- |
| 1a Login | `crm/src/features/auth/LoginPage.tsx`, `crm/src/lib/auth.tsx` |
| 1b Dashboard geral | `crm/src/features/dashboard/DashboardPage.tsx`, `design/README.md` |
| 1c Pessoas · lista | `db/migrations/004_aba_people.sql`, `docs/02_MODELO_DE_DADOS.md` |
| 1d Ficha da pessoa | `db/migrations/004_aba_people.sql` |
| 1e Agenda semanal | `db/migrations/009_aba_scheduling.sql`, `db/migrations/007_enable_btree_gist.sql` |
| 1f Pipeline de vendas | `db/migrations/016_aba_sales.sql` |
| 1g Financeiro | `db/migrations/010_aba_finance.sql`, `011_aba_finance_operations.sql` |
| 1h Prontuário e anamnese | `db/migrations/013_aba_health.sql`, `014_aba_health_attachments_bucket.sql` |
| 1i Catálogo | `db/migrations/008_aba_catalog.sql` |
| 1j Mensageria | `db/migrations/020_aba_messaging.sql`, `supabase/functions/whatsapp-webhook/`, `docs/06_INTEGRACOES_EXTERNAS.md` |
| 1k Automações | `db/migrations/017_aba_automations.sql`, `docs/01_ARQUITETURA.md` |
| 1l IA / agente | `db/migrations/018_aba_ai.sql`, `docs/03_AGENTES_E_SKILLS.md` |
| 1m Configurações da conta | `docs/04_DESIGN_E_MARCA.md`, `db/migrations/001_core_public.sql`, `002_core_licensing.sql` |
| 1n Perfil profissional | `db/migrations/003_core_access.sql`, `crm/src/app/RoleGate.tsx` |
| 1o Perfil recepção | `db/migrations/003_core_access.sql`, `009_aba_scheduling.sql` |
| 1p Mapas clínicos | `db/migrations/013_aba_health.sql`, `design/README.md` |
| Shell (todas) | `crm/src/app/AppShell.tsx`, `crm/src/app/nav.ts`, `uploads/screenshots/layouts_modelos/*` |
