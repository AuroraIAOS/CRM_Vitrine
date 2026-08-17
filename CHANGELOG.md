# CHANGELOG — CRM Vitrine

Convenção: `+0.1` = correções/melhorias · `+1.0` = novas funcionalidades/serviços.

## [+0.1] - 2026-08-16 (Subetapa 01.4)
- `aba_health` aplicado por completo no Supabase — a peça de maior risco jurídico do produto (dado clínico/LGPD). `aba_health.pode_acessar()` embute as três camadas de autorização (papel, permissão por módulo, atributo profissional + concessão nominal) e já nasce com a regra "profissional exige funcionário ativo" do CRM Maximus, sem coluna nova, aproveitando a FK criada na Subetapa 01.3.
- Leitura de conteúdo clínico só existe através de funções que gravam log na mesma transação — não existe caminho de select direto que devolva prontuário/evolução/anamnese/consentimento sem deixar rastro em `log_acesso`. Escrita clínica (criação e atualização) também gera log automaticamente, por trigger.
- Bucket privado `anexos-clinicos` para foto de antes/depois e documento — nunca bucket público, decisão de acesso por `pode_acessar_anexo()` (nunca "qualquer membro da conta"), consentimento de uso de imagem travando só a leitura.
- Evolução clínica travada (`travada = true`) não aceita alteração — só adendo em nova linha.
- Suíte de RLS ampliada (`crm/tests/rls/05_aba_health.spec.ts`) — 8/8 testes verdes: negado/permitido, log incremental provado, coluna clínica bloqueada por privilégio, escrita logada, evolução travada, e a regra "funcionário ativo" provada isolada. 37/37 testes no projeto.

## [+0.1] - 2026-08-16 (Subetapa 01.3)
- `aba_catalog`, `aba_scheduling` e `aba_finance` aplicados por completo no Supabase, traduzidos a partir do CRM Maximus (categorias/serviços/variantes/planos; profissionais/agenda/agendamentos com restrição de exclusão por sobreposição; contratos/faturas/pagamentos/planos vendidos/comissão), com o hardening pós-auditoria e as regras de negócio (troca de variação padrão, lembretes automáticos, venda de plano, estorno de sessão, rotinas de vencimento) já embutidos no DDL inicial, não como patch posterior.
- `btree_gist` habilitado em `extensions` antes de `aba_scheduling` — restrição de exclusão por intervalo recusa dois agendamentos sobrepostos para o mesmo profissional/recurso no próprio banco.
- Pendência da Subetapa 01.2 fechada: `ALTER DEFAULT PRIVILEGES` (GRANT estreito, nunca `TRUNCATE`) agora nasce dentro da própria migration que cria cada schema novo, em vez de precisar de uma migration de correção posterior.
- Decisão de escopo registrada: a regra "profissional ativo exige funcionário" do Maximus (migration 075) não foi portada — depende de um fluxo de convite→funcionário que o Vitrine ainda não construiu. Só o desenho de FK foi trazido. Ver `handoffs/instrucoes.md` §5.
- Suíte de testes de RLS ampliada (`crm/tests/rls/02_aba_catalog.spec.ts`, `03_aba_scheduling.spec.ts`, `04_aba_finance.spec.ts`) — 29/29 testes verdes.

## [+0.1] - 2026-08-15 (Subetapa 01.2)
- Núcleo aplicado no Supabase: `public` (accounts/profiles/account_invitations/member_presence/api_keys/webhook_endpoints/notifications), `licensing` (teto de assentos) e `access` (RBAC fino, `access.can()` fail-closed desde o início).
- `aba_people` aplicado por completo: tabela-mãe `pessoas` + 4 papéis por chave compartilhada + tags/campos customizados/notas + `converter_lead()`.
- Dois achados de segurança reais, medidos ao vivo no banco (não hipotéticos), corrigidos na mesma subetapa: funções `SECURITY DEFINER` executáveis por `anon` apesar do `REVOKE FROM PUBLIC` (é preciso revogar de `anon` nominalmente — causa: concessão de fábrica do projeto Supabase); e toda tabela de `public` nascendo com `TRUNCATE`/`TRIGGER`/`REFERENCES` concedidos a `anon`/`authenticated` por padrão de fábrica do projeto (TRUNCATE não passa por RLS). Ver `handoffs/instrucoes.md` §5.
- Suíte de testes de RLS portada (`crm/tests/rls/`) — 11/11 testes verdes: RLS por papel, isolamento entre contas, e a camada `access.can()` provada isoladamente de `is_account_member()`.

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
