# CHANGELOG — CRM Vitrine

Convenção: `+0.1` = correções/melhorias · `+1.0` = novas funcionalidades/serviços.

## [+0.1] - 2026-08-15 (Subetapa 01.1)
- Bootstrap do repositório: app Vite+React 18+TS+PWA criado em `crm/`, espelhando a estrutura de `src/` do CRM-Sindcom (`app/`, `components/{ui,shared}`, `features/`, `lib/`).
- Client Supabase (`crm/src/lib/supabase.ts`) conectado ao projeto `uitwttyyppxvcgfdhnlz`; autenticação ponta a ponta validada (login → dashboard → logout) com usuário de teste criado e removido via Admin API.
- `.gitignore` da raiz substituído pelo boilerplate Node genérico por uma versão adaptada de `.gitignore.example` para Vite — inclui, pela primeira vez, a regra que impede `screenshots/` de ir ao remoto.
- `design/README.md` ampliado com os padrões concretos observados nos três modelos de referência em `screenshots/` (dashboard, agenda semanal, medical card/odontograma de `aba_health`).

## [+0.1] - 2026-08-15 (Subetapa 01.0)
- Subetapa 01.0 (Leitura de Referências e Planejamento da Etapa 01) concluída.
- `handoffs/instrucoes.md` criado no modelo do CRM Maximus, semeado com o hardening pós-auditoria (migrations 051–065/070/074–078) e as armadilhas dos dois repositórios de referência.
- `docs/00_PLANO_E_CRITERIOS.md` reformado: convenção `0X.0` de revisão de plano no início de cada Etapa; portões de entrada/saída explícitos nas 3 Etapas; esforço máximo e escalonamento de LLM em todas as subetapas da Etapa 01; subetapas novas de varredura de segredos (01.7/02.5) e portão de segurança adversarial (01.8/02.6) institucionalizadas como subetapas, não só pendência vigiada.
- Corrigido conflito de FK entre `aba_people.pessoas.contato_id` e `aba_messaging.contatos_canal` (`docs/02_MODELO_DE_DADOS.md` §3.3) — coluna passa a `UUID` sem `REFERENCES`, preservando a exportabilidade avulsa de `aba_people`.
- Corrigida contagem de migrations do CRM Maximus em `db/migrations/README.md` (001–079, não 001–077) e completado o mapa de origem por schema.
- `.env.example` eliminado do escopo do projeto (decisão de Max) — `docs/05_COMPLIANCE_E_ETICA.md` §1 atualizado.

## [+0.1] - 2026-08-12
- Fundação do projeto gerada pelo ESTÁGIO CRIATIVO (aurora-criativa), TIPO 02 — Organização.
- Reference lock fechado a partir dos repositórios CRM Sindcom e CRM Maximus: stack v01 = Vite + Supabase + hospedagem estática; RLS/RBAC/IBAC do Maximus preservados; Evolution GO fora do escopo v01.
- Modelo de dados redesenhado: tabela-mãe `aba_people.pessoas` unificando leads/clientes/funcionários/fornecedores (decisão desta sessão, substitui o modelo de identidades separadas do Maximus).
- Módulos novos definidos: `aba_sales`, `aba_automations`, `aba_ai` (existiam soltos em `public` no Maximus, nunca modularizados).
- Árvore de pastas, documentos de referência e handoffs gerados.
