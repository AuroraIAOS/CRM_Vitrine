# db/migrations/ — CRM Vitrine

Vazio por decisão consciente do ESTÁGIO CRIATIVO: a tradução coluna a coluna das migrations é execução mecânica melhor feita na Etapa 01 do Claude CODE, com o SQL original na frente e a suíte de testes de RLS junto para validar cada arquivo assim que sai.

## Fonte de verdade

Repositório `AuroraIAOS/CRM_Maximus`, `supabase/migrations/001` a `079` (79 arquivos — `072` e `073` não existem na numeração, sem gap de conteúdo). Consultar sempre — a lógica de RLS/RBAC/IBAC de lá é o que se porta; só o nome muda.

## Mapa de origem por schema novo

| Migration original (Maximus) | Schema novo | Tratamento |
|---|---|---|
| `001_initial_schema.sql`, `002`, `003`, `004`, `006`, `007`, `009`, `010`, `012`, `013`, `014`, `015`, `016`, `023`, `026`-`030`, `035`, `036`, `049` (tabelas soltas em `public`) | `aba_people` (tags/notas/campos), `aba_messaging`, `aba_sales`, `aba_automations`, `aba_ai` | Redistribuir conforme `docs/02_MODELO_DE_DADOS.md` §3-7 — **não portar como está**, essas tabelas nunca foram modularizadas no original. |
| `017_account_sharing.sql` | `public` (núcleo) | Portar como está — `accounts`/`account_invitations` ficam em inglês (exceção documentada). |
| `038_licensing_schema.sql`, `039_access_schema.sql`, `040`, `041`, `042` | `licensing`, `access` | Portar como está, sem prefixo `aba_`, já incorporando o hardening de `040`-`042` (teto de assentos por trigger, `search_path` fixo, `access.can` falha fechada). |
| `043_people_schema.sql` | `aba_people` | **Não portar como está** — substituído pelo redesenho com tabela-mãe `pessoas` (`docs/02` §3). |
| `044_catalog_schema.sql` | `aba_catalog` | Traduzir nomes (mapa em `docs/02` §7), manter lógica de RLS. |
| `045_scheduling_schema.sql`, `068`, `075` | `aba_scheduling` | Traduzir nomes; `068` (lembretes) e `075` (profissional exige funcionário ativo) entram no DDL inicial, não como patch posterior. |
| `046_finance_schema.sql`, `071`, `079` | `aba_finance` | Idem; `071` (operações) e `079` (termos de contrato) incorporados desde o início. |
| `047_health_schema.sql`, `053`, `058`, `069`, `070`, `076` | `aba_health` | Idem — atenção redobrada ao IBAC/ABAC, não simplificar. `053` (log via função, não só política), `058` (`FORCE ROW LEVEL SECURITY`), `069` (bucket de anexo), `070` (log cobre escrita, não só leitura), `076` (acesso exige funcionário ativo) fazem parte do DDL inicial. |
| `048_messaging_schema.sql`, `055`, `056`, `057` | `aba_messaging` | Idem + absorver as tabelas de mensageria que ficaram em `public` no original. `055`/`056` (segredo de provedor nunca exposto pela API, hash de webhook secret) e `057` (dedupe de evento com `account_id`) incorporados desde o início. |
| `066_people_convert_lead.sql` | `aba_people` | **Não portar como está** — substituído por `converter_lead()` (`docs/02` §3.4), mais simples graças à chave compartilhada. |
| `067_catalog_set_default_variant.sql` | `aba_catalog` | Incorporar ao DDL inicial de `aba_catalog`, não como patch posterior. |
| `050_analytics_views.sql` | `analytics` | Portar como está, sem prefixo `aba_`, com `security_invoker = true` (senão a RLS das tabelas de origem é ignorada). |
| `051`, `052`, `054`, `059`, `060`, `061`, `062`, `063`, `065`, `064`, `077`, `078` | transversal (todos os schemas `aba_*` + `access`/`licensing`) | **Bloco de hardening pós-auditoria — não estava neste mapa antes da Subetapa 01.0.** Cobre: exposição ao PostgREST como ação independente do `CREATE SCHEMA` (`051`/`052`), `GRANT` estreito sem `TRUNCATE` (`060`/`061`), função nova `REVOKE EXECUTE FROM PUBLIC` (`054`/`059`/`062`), módulos legíveis + matriz de permissão (`063`/`065`), teto de assentos cobrindo `UPDATE` além de `INSERT` (`064`/`077`), moeda única `BRL` (`078`). **Decisão de porte (registrada em `handoffs/instrucoes.md` §2/§4): dobrar cada item diretamente no DDL das migrations novas, desde a primeira versão de cada schema — não repetir a cronologia dos erros do Maximus.** |

## Divergência de FK resolvida na Subetapa 01.0

`docs/02_MODELO_DE_DADOS.md` §3.3 originalmente declarava `aba_people.pessoas.contato_id` como FK para `aba_messaging.contatos_canal(id)`. Isso conflita com a ordem de aplicação abaixo (`aba_messaging` por último) e quebraria a exportação avulsa de `aba_people` para um CRM-filho sem mensageria. Corrigido: `contato_id` é `UUID` sem `REFERENCES`, no mesmo padrão que o Maximus usa para `scheduling.appointments.customer_package_id` → `finance.customer_packages`. Ver `handoffs/instrucoes.md` §5 para o detalhe completo.

## Convenção de numeração das migrations novas

Seguir sequência própria a partir de `001_`, independente da numeração do Maximus (é um projeto novo, não um fork contínuo). Ordem de aplicação: núcleo (`public`/`access`/`licensing`) → `aba_people` → `aba_catalog`/`aba_scheduling`/`aba_finance` → `aba_health` → `aba_sales`/`aba_automations`/`aba_ai` → `aba_messaging` → `analytics`.
