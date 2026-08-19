# 02_MODELO_DE_DADOS — CRM Vitrine

## 1. Convenção de nomenclatura (leia antes de tudo)

- **Schemas** de módulo levam prefixo em **inglês**: `aba_<modulo>` (`aba_people`, `aba_catalog`, `aba_scheduling`, `aba_finance`, `aba_health`, `aba_messaging`, `aba_sales`, `aba_automations`, `aba_ai`). Decisão explícita de Max — os schemas identificam o módulo exportável no BD, não o vocabulário de negócio.
- **Dentro de cada schema**, tabelas/colunas/funções/triggers seguem a convenção global de Max: **snake_case em português/BR** (ver `tags_e_convencoes.md`).
- **Exceção documentada:** o núcleo herdado do fork (`public.accounts`, `public.profiles`, `public.account_invitations`, `public.api_keys`, `public.webhook_endpoints`, `public.notifications`, `public.member_presence`) permanece em **inglês**. É a base de FK (`account_id`, `profile_id`) referenciada por todo o sistema, já testada em produção no CRM Maximus — traduzir aqui arrastaria toda tabela do projeto por ganho puramente cosmético. `access`, `licensing` e `analytics` também ficam sem prefixo `aba_` e em inglês — são infraestrutura de plataforma, não abas vendáveis ao cliente final.
- Alguns termos técnicos universais do vocabulário de CRM ficam como estão (loanwords): `lead`, `leads`, `tags`, `deal`→traduzido para `oportunidade` (ver §4) — decisão caso a caso, sinalizada onde aparecer.
- **Escopo desta reorganização:** `aba_people` foi redesenhada por completo nesta sessão (é o pedido explícito de Max). `aba_catalog`, `aba_scheduling`, `aba_finance`, `aba_health`, `aba_messaging` já estão bem organizadas no Maximus — aqui documento o **mapa de renomeação** (schema + nomes de tabela em português); a tradução coluna a coluna é execução mecânica da Etapa 01 do CODE, feita em cima das migrations originais do Maximus (ver `db/migrations/README.md`). `aba_sales`, `aba_automations`, `aba_ai` são schemas **novos** — hoje essas tabelas existem soltas no `public` do Maximus (herdadas do fork `wacrm`, nunca modularizadas); nascem aqui já em português e já no padrão RBAC/RLS correto.

## 2. Padrão de RLS obrigatório (herdado do Maximus — não mexer)

Toda tabela de módulo usa **duas camadas simultâneas**, nunca uma no lugar da outra:

```sql
USING (public.is_account_member(account_id, '<papel_minimo>') AND access.can('<module_key>', '<acao>'))
```

- `is_account_member(account_id, papel)` — RBAC hierárquico (`owner > admin > agent > viewer`), definida em `public`.
- `access.can(module_key, acao)` — RBAC fino por módulo/ação, tabela `access.module_permissions`.
- `module_key` continua sendo a chave curta (`'people'`, `'catalog'`, `'health'`...) independente do prefixo do schema — são namespaces diferentes, não precisam casar.
- Cada schema de módulo tem sua própria `set_updated_at()` (não reaproveita função do núcleo) — mantém o módulo exportável sozinho, sem depender do fork.

## 3. `aba_people` — redesenho completo (decisão desta sessão)

### 3.1 Por que uma tabela-mãe

No Maximus, `leads` e `customers` são identidades **separadas**: converter um lead cria um `customers.id` novo, ligado só por `lead_id`. Consequência: tag/nota presa em `contacts.id` (identidade do canal, nullable) não sobrevive à conversão, e uma pessoa cadastrada manualmente (sem WhatsApp) não tem onde pendurar tag/nota nenhuma.

**Resolução:** `aba_people.pessoas` é a identidade única. Os papéis (`leads`, `clientes`, `funcionarios`, `fornecedores`) são **extensões 1:1** — usam a própria `pessoas.id` como chave primária (chave compartilhada / "class table inheritance"), não um FK solto. Uma pessoa pode acumular papéis (virar cliente sem deixar de ter sido lead; um funcionário também pode ser cliente) sem nunca trocar de identidade.

### 3.2 Efeito sobre o resto do sistema: zero ruptura

`aba_scheduling`, `aba_finance` e `aba_health` referenciam `customer_id → customers(id)`. Como `clientes.id` continua sendo a mesma coluna (só passa a **também** ser FK de `pessoas.id`), **nenhuma dessas 10 referências muda**. O ganho de coerência não custa retrabalho nos módulos que já estavam certos.

### 3.3 DDL de referência

```sql
CREATE SCHEMA IF NOT EXISTS aba_people;

-- Tabela-mãe: identidade única, independente do(s) papel(is)
-- contato_id é UUID SEM FK (não referencia aba_messaging.contatos_canal): aba_people
-- precisa continuar exportável sozinho para um CRM-filho que não contrata
-- mensageria, e aba_messaging é aplicado por último no mapa de origem
-- (db/migrations/README.md). Mesmo padrão que o Maximus usa para
-- scheduling.appointments.customer_package_id -> finance.customer_packages:
-- a coluna fica sem REFERENCES no lado que não deve depender do módulo
-- opcional. Integridade referencial desta coluna não é garantida pelo banco
-- — decisão consciente, ver handoffs/instrucoes.md §5.
CREATE TABLE aba_people.pessoas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contato_id     UUID,
  nome_exibicao  TEXT NOT NULL,
  email          TEXT,
  telefone       TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pessoas_account ON aba_people.pessoas(account_id);
CREATE INDEX idx_pessoas_contato ON aba_people.pessoas(contato_id) WHERE contato_id IS NOT NULL;

-- Papel: lead
CREATE TABLE aba_people.leads (
  id             UUID PRIMARY KEY REFERENCES aba_people.pessoas(id) ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE, -- denormalizado p/ RLS direto
  origem         TEXT NOT NULL DEFAULT 'manual'
                   CHECK (origem IN ('whatsapp','manual','importacao','api','indicacao','presencial')),
  como_encontrou TEXT,
  status         TEXT NOT NULL DEFAULT 'novo'
                   CHECK (status IN ('novo','qualificado','desqualificado','convertido')),
  responsavel_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Papel: cliente
CREATE TABLE aba_people.clientes (
  id                UUID PRIMARY KEY REFERENCES aba_people.pessoas(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  lead_id           UUID REFERENCES aba_people.leads(id) ON DELETE SET NULL, -- rótulo de origem; identidade já é a mesma
  razao_social       TEXT NOT NULL,
  nome_fantasia      TEXT,
  documento          TEXT,
  data_nascimento    DATE,
  endereco           JSONB NOT NULL DEFAULT '{}'::jsonb,
  status             TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Papel: funcionário
CREATE TABLE aba_people.funcionarios (
  id             UUID PRIMARY KEY REFERENCES aba_people.pessoas(id) ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  profile_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  documento      TEXT,
  cargo          TEXT,
  admitido_em    DATE,
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pendência de Etapa 02 (Transição 1→2, 2026-08-18): RPCs de convite
-- (peek/resgatar), trigger de nascimento automático de funcionário e RPC
-- de liga/desliga do atributo profissional (aba_scheduling.profissionais)
-- ainda faltam — deferidas desde a Subetapa 01.2/01.3, fluxo verificado
-- contra o CRM Maximus (018/019/074/075/076). Regra nova desta sessão:
-- atributo profissional só pode ser concedido a funcionário com
-- account_role = 'agent' (nunca 'admin'). Ver docs/01_ARQUITETURA.md §7.4.

-- Papel: fornecedor (NOVO — não existia no Maximus, gap identificado nesta sessão)
CREATE TABLE aba_people.fornecedores (
  id             UUID PRIMARY KEY REFERENCES aba_people.pessoas(id) ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  razao_social   TEXT NOT NULL,
  documento      TEXT,
  categoria      TEXT,
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tags, campos customizados e notas — presos à pessoa, sobrevivem a qualquer conversão de papel
CREATE TABLE aba_people.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cor TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE aba_people.pessoa_tags (
  pessoa_id UUID NOT NULL REFERENCES aba_people.pessoas(id) ON DELETE CASCADE,
  tag_id    UUID NOT NULL REFERENCES aba_people.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (pessoa_id, tag_id)
);

CREATE TABLE aba_people.campos_customizados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo_campo TEXT NOT NULL CHECK (tipo_campo IN ('texto','numero','data','booleano','selecao')),
  opcoes JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE aba_people.pessoa_campos_customizados (
  pessoa_id        UUID NOT NULL REFERENCES aba_people.pessoas(id) ON DELETE CASCADE,
  campo_id         UUID NOT NULL REFERENCES aba_people.campos_customizados(id) ON DELETE CASCADE,
  valor            JSONB,
  PRIMARY KEY (pessoa_id, campo_id)
);

CREATE TABLE aba_people.pessoa_notas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id  UUID NOT NULL REFERENCES aba_people.pessoas(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  autor_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  conteudo   TEXT NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.4 `converter_lead()` reescrita — mais simples que a original

Como `clientes.id` já **é** `leads.id` (mesma identidade), a idempotência vem de graça do conflito de PK — não precisa mais do índice único parcial nem do bloco `EXCEPTION unique_violation` que a versão original do Maximus tinha:

```sql
CREATE OR REPLACE FUNCTION aba_people.converter_lead(p_lead_id UUID)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_lead aba_people.leads%ROWTYPE;
BEGIN
  SELECT * INTO v_lead FROM aba_people.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado' USING ERRCODE = '22023';
  END IF;
  IF v_lead.status = 'desqualificado' THEN
    RAISE EXCEPTION 'Lead desqualificado não é convertido' USING ERRCODE = '22023';
  END IF;

  INSERT INTO aba_people.clientes (id, account_id, lead_id, razao_social, status)
  SELECT v_lead.id, v_lead.account_id, v_lead.id, p.nome_exibicao, 'ativo'
  FROM aba_people.pessoas p WHERE p.id = v_lead.id
  ON CONFLICT (id) DO NOTHING;

  UPDATE aba_people.leads SET status = 'convertido' WHERE id = p_lead_id;

  RETURN v_lead.id;
END;
$$;
```

## 4. `aba_sales` — módulo novo (gap do Maximus, resolvido aqui)

`pipelines`/`pipeline_stages`/`deals` nunca ganharam schema próprio no Maximus — ficaram soltas em `public`, ainda no modelo antigo (`user_id`/`auth.uid()`, sem RBAC por conta). Nascem aqui já corretas, e `oportunidades` referencia `pessoa_id` (não `contact_id`) — uma oportunidade de venda pode estar ligada a um lead ainda não convertido ou a um cliente já ativo, sem distinção artificial:

```sql
CREATE SCHEMA IF NOT EXISTS aba_sales;

CREATE TABLE aba_sales.funis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE aba_sales.etapas_funil (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funil_id UUID NOT NULL REFERENCES aba_sales.funis(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE aba_sales.oportunidades (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  funil_id              UUID NOT NULL REFERENCES aba_sales.funis(id) ON DELETE CASCADE,
  etapa_id              UUID NOT NULL REFERENCES aba_sales.etapas_funil(id),
  pessoa_id             UUID NOT NULL REFERENCES aba_people.pessoas(id),
  titulo                TEXT NOT NULL,
  valor                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  moeda                 TEXT NOT NULL DEFAULT 'BRL',
  previsao_fechamento   DATE,
  status                TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','ganha','perdida')),
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

RLS: mesmo padrão de `is_account_member` + `access.can('sales', ...)` — detalhar na Etapa 01.

## 5. `aba_automations` — módulo novo (gap do Maximus)

`automations`/`automation_steps`/`flows`/`flow_nodes` também soltas em `public`. Mapa de renomeação para Etapa 01:

| Original (public, Maximus) | Novo (`aba_automations`) |
|---|---|
| `automations` | `automacoes` |
| `automation_steps` | `automacao_etapas` |
| `automation_logs` | `automacao_logs` |
| `automation_pending_executions` | `automacao_execucoes_pendentes` |
| `flows` | `fluxos` |
| `flow_nodes` | `fluxo_nos` |
| `flow_runs` | `fluxo_execucoes` |
| `flow_run_events` | `fluxo_execucao_eventos` |

O "Wait step" do Maximus dependia de um endpoint Next.js pingado por scheduler externo (`AUTOMATION_CRON_SECRET`). Sem servidor Node, isso vira **`pg_cron`** chamando a função de drenagem diretamente (Sindcom já usa esse padrão em produção) — elimina o pinger externo inteiro.

## 6. `aba_ai` — módulo novo (gap do Maximus)

| Original (public, Maximus) | Novo (`aba_ai`) |
|---|---|
| `ai_configs` | `ia_configuracoes` |
| `ai_knowledge_documents` | `ia_documentos_conhecimento` |
| `ai_knowledge_chunks` | `ia_trechos_conhecimento` |
| `ai_usage_log` | `ia_log_uso` |

**Padrão a preservar (é bom, veio do Maximus):** chave de IA é *bring-your-own-key* por conta — cada cliente cola sua própria chave OpenAI/Anthropic, guardada com `ENCRYPTION_KEY` (AES-256-GCM), nunca uma chave global sua no `.env`. Isso evita você pagar a conta de IA de todo cliente e é um argumento de venda ("traga sua própria chave"). Busca semântica opcional via `pgvector` (Supabase já suporta) — busca textual comum funciona sem extensão nenhuma.

## 7. Módulos já bem organizados — mapa de renomeação (execução na Etapa 01)

| Schema Maximus → CRM Vitrine | Tabelas (original → novo) |
|---|---|
| `catalog` → `aba_catalog` | `categories`→`categorias`, `services`→`servicos`, `service_variants`→`variantes_servico`, `packages`→`planos`, `package_items`→`itens_plano` |
| `scheduling` → `aba_scheduling` | `professionals`→`profissionais`, `professional_schedules`→`horarios_profissionais`, `time_off`→`ausencias`, `resources`→`recursos`, `resource_schedules`→`horarios_recursos`, `appointments`→`agendamentos`, `appointment_services`→`agendamento_servicos`, `reminders`→`lembretes` |
| `finance` → `aba_finance` | `contracts`→`contratos`, `invoices`→`faturas`, `invoice_items`→`itens_fatura`, `invoice_dispatches`→`envios_fatura`, `payments`→`pagamentos`, `customer_packages`→`planos_cliente`, `package_balances`→`saldos_plano`, `package_ledger`→`extrato_plano`, `commission_rules`→`regras_comissao`, `commission_entries`→`lancamentos_comissao` |
| `health` → `aba_health` | `clinical_records`→`prontuarios`, `anamnesis_forms`→`formularios_anamnese`, `anamnesis_answers`→`respostas_anamnese`, `evolutions`→`evolucoes`, `consents`→`consentimentos`, `record_grants`→`concessoes_prontuario`, `access_log`→`log_acesso` |
| `messaging` → `aba_messaging` | `channel_providers`→`provedores_canal`, `provider_events`→`eventos_provedor` **+** puxadas de `public`: `contacts`→`contatos_canal`, `conversations`→`conversas`, `messages`→`mensagens`, `message_reactions`→`reacoes_mensagem`, `quick_replies`→`respostas_rapidas`, `whatsapp_config`→`configuracao_whatsapp`, `message_templates`→`modelos_mensagem`, `broadcasts`→`transmissoes`, `broadcast_recipients`→`destinatarios_transmissao` |

**Nota crítica sobre `aba_health`:** é a peça de maior valor jurídico (LGPD, dado clínico sensível). `concessoes_prontuario` (ABAC/IBAC) + `log_acesso` são o que garante que só profissional explicitamente autorizado — não qualquer `agent` da conta — lê prontuário. Portar sem simplificar essa parte, mesmo sob pressão de prazo.

**Acréscimo da Subetapa 02.9 (`db/migrations/025`), sem equivalente no Maximus:** `aba_health.evolucoes` ganhou `mapa_tipo` (`facial`/`corporal`/`odontograma`/`acupuntura`) e `marcacoes` (array `jsonb` de `{regiao, rotulo, estado, nota}`), que sustentam os mapas clínicos das telas `1h`/`1p`. Estrutura **nova deste produto** — o CRM Maximus não tem mapa clínico nenhum —, e por isso registrada aqui e não no mapa de renomeação acima. Ficaram como **coluna da evolução, não tabela própria**, para herdar sem duplicação o regime que já estava provado: RLS por `pode_acessar()`, log de escrita por trigger, leitura só por `ler_evolucoes()` e a trava de evolução assinada. As duas colunas nascem **sem `SELECT`** para `authenticated` (medido por `has_column_privilege` após a migration), como toda coluna de conteúdo clínico.

## 8. Núcleo (`public`) — inalterado

`accounts`, `account_invitations`, `profiles`, `api_keys`, `webhook_endpoints`, `notifications`, `member_presence` — copiar como estão. `access` (RBAC fino) e `licensing` (limites de plano) também copiar como estão, apenas confirmando que `access.modules` ganha as chaves novas: `sales`, `automations`, `ai`.

## 9. Enums e estados — ciclos completos

- `leads.status`: `novo → qualificado → convertido` (ou `desqualificado`, terminal).
- `oportunidades.status`: `ativa → ganha` ou `ativa → perdida` (ambos terminais).
- `automacoes`/`fluxos`: herdar máquina de estados original do Maximus (documentar na Etapa 01 a partir das migrations fonte).
- `faturas`/`pagamentos`: herdar ciclo original de `aba_finance` (emitida → paga/vencida/cancelada) — checar migration 046 original.

## 10. Auditoria e RLS — resumo

Toda tabela de módulo: RLS ativa, testada com role `viewer` restrito (prova: não escreve). `aba_health` acrescenta log de acesso obrigatório em toda leitura de prontuário. Checklist completo em `05_COMPLIANCE_E_ETICA.md`.
