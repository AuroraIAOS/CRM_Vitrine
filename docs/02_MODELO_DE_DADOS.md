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

**Acréscimo da Subetapa 03.0.a (2026-09-04), vindo da pesquisa `analise-ice`.** Dois ciclos novos nascem na corrente clínica e são declarados aqui antes de virarem migration:

- **`aba_treatment.procedimentos.estado`**: `proposto → planejado → em_execucao → executado`, com `nao_mais_necessario` como saída lateral a partir de `planejado` ou `em_execucao`. **Três invariantes que valem mais que a lista:** (1) **só `proposto` se apaga** — depois disso o procedimento nunca mais é excluído, só some do plano e **permanece na lista geral**, porque o histórico do que se propôs é o que protege a clínica; (2) **consentir move `proposto → planejado` automaticamente**, para que não se apague tratamento que o paciente já consentiu; (3) **`executado` é fato afirmado, com data e autor — nunca derivado**. Este terceiro ponto substitui a decisão da Subetapa 03.7, que fazia `executado` nascer da comparação entre duas evoluções: a trava de finalização de contrato da 03.8.a se apoia nele, e trava financeira não se apoia em inferência.
- **Estado por dente** (em `aba_health.evolucoes.marcacoes`, sem tabela nova): `erupcionado` · `nao_erupcionado` · `ausente` · `removido` · `supranumerario` · `substituido`. **As quatro maneiras de dizer que o dente não está na boca têm consequências diferentes** sobre quais códigos são aceitos e se o desenho deixa lacuna — `ausente` ≠ `nao_erupcionado` ≠ `removido`, e confundi-los produz plano sobre dente que não existe. A dentição inicial deriva da **idade** e é editável dente a dente. Substitui a modelagem de "dentição como modo de exibição" da 03.7. Subetapa dona: 03.7.a.

**Armadilha herdada da 02.15, que se aplica aos dois:** estado novo num `CHECK` exige revisar quem filtrava pelo estado antigo. Os três estados da 03.7 (`existente`, `a_realizar`, `executado`) têm consumidores em `crm/src/features/health/`, e cada um é revisado um a um — não por releitura da migration.

## 10. Auditoria e RLS — resumo

Toda tabela de módulo: RLS ativa, testada com role `viewer` restrito (prova: não escreve). `aba_health` acrescenta log de acesso obrigatório em toda leitura de prontuário. Checklist completo em `05_COMPLIANCE_E_ETICA.md`.

## 11. Diretrizes de modelo vindas do benchmark (Subetapa 03.2, 2026-09-03)

Cinco diretrizes de `design/benchmark/DIRETRIZES_FORA_DO_BENCHMARK.md` §1 e §6 que pertencem a este documento. Cada uma nomeia a subetapa da Etapa 03 que a executa — nenhuma é ordem de implementação por si.

### 11.1 A corrente clínico-comercial é uma unidade de desenho (A1)

> **catálogo** (procedimento com "aceita faces" e unidade de lançamento) → **odontograma** (seleciona dente e faces) → **orçamento** (linha com dente, faces e o preço daquele plano) → **contrato e financeiro** (aprovar o orçamento gera o lançamento)

**Não são quatro recursos, é uma corrente.** O Vitrine tem o primeiro elo (`aba_catalog`) e o quarto (`aba_finance`) desde a Subetapa 01.3; faltam os dois do meio, e **o orçamento é o mais crítico** — sem ele o odontograma não tem onde escrever, e sem os dois o produto não é odontológico. O orçamento é **schema novo, entre `aba_catalog` e `aba_finance`**, com cabeçalho e linhas (`plano · procedimento · dente · faces · valor`) e estados `rascunho → aprovado`. Subetapas donas: 03.6 (catálogo), 03.7 (odontograma), 03.8 (orçamento) — nessa ordem, que é obrigatória.

> **Nota de revisão (Subetapa 03.0.a, 2026-09-04) — a diretriz acima continua certa e ganha precisão; nada nela se apaga.** A corrente é a mesma e a ordem continua obrigatória, mas **o terceiro elo não é "orçamento", é o plano de tratamento** — e o orçamento é a **vista financeira** dele. Três correções:
>
> 1. **O nome.** Schema **`aba_treatment`**, chave de módulo `treatment`, label "Planos de tratamento" (decisão D-I2 de Max, 2026-09-03). **"Orçamento" continua sendo a palavra da interface.**
> 2. **A forma.** A entidade **não é cabeçalho + linhas**: é uma **matriz** — fase clínica como linha (Emergency · Systemic · Acute · Disease Control · Definitive · Maintenance, configuráveis), opção de tratamento concorrente como coluna (A, B, …), o **diagnóstico atravessando as colunas** com o procedimento aninhado dentro de uma delas, e uma fila de diagnósticos ainda não fasados. E **selecionar N faces cria N linhas, uma por dente** — nunca uma linha com N dentes.
> 3. **A ordem ganhou dois elos.** `03.6 → 03.6.a → 03.7 → 03.7.a → 03.8 → 03.8.a`, com a 03.8 entregando a metade clínica (sem dinheiro) e a 03.8.a a financeira. A ordem continua sendo obrigatória pelo mesmo motivo: a trava de requisito da 03.8 lê colunas que a 03.6.a cria, e o plano da 03.8 lê a **face do trabalho** que a 03.7.a passa a produzir.
>
> Fonte: `design/benchmark/RELATORIO_DE_IMPACTO_ICE.md` §3.1 e `design/benchmark/fontes/ice.md` §4.

### 11.2 `unidade_lancamento` é irmã de "aceita faces" (A9)

O procedimento do catálogo precisa das duas marcas juntas: **`aceita_faces`** (booleano) e **`unidade_lancamento`** (`dente` / `sextante` / `arcada` / `sessao` / `elemento`). A unidade está embutida no nome do procedimento na tabela nacional, e é o que diz **como** o item é lançado no orçamento. Some-se a **`quantidade_maxima` por unidade** — 32 por dente, 6 por sextante, 2 por arcada —, que não é rótulo e sim **validação de banco**: um orçamento com 33 restaurações no mesmo dente está errado e o sistema pode dizer isso. Origem: tabela SIGTAP do acervo de gestão pública. Subetapa dona: 03.6, com a validação surtindo efeito na 03.8.

> **Nota de medição (Subetapa 03.8, 2026-09-03) — o `plano` da linha do orçamento não é `aba_catalog.planos`.** A §11.1 acima escreve a linha como `plano · procedimento · dente · faces · valor` e glosa `plano` como "o preço daquele plano". A fonte original diz outra coisa: `design/benchmark/RELATORIO.md` linha 140 escreve **"o preço daquele convênio"**, e a palavra foi trocada na transcrição para cá. Convênio de verdade (TISS/TUSS, elegibilidade) é o **item 33 da lista de futuro `+1.0`**, fora do MVP por `CLAUDE.md` §15. O que existe hoje e resolve a cláusula é **`aba_catalog.variantes_servico`** (nome + preço por serviço: "Particular", "Convênio X") como tabela de preço da linha, com `plano_id` de `aba_catalog.planos` opcional **no cabeçalho** — é ele, e só ele, que aciona `aba_finance.vender_plano()` na aprovação. Registrado antes de virar código: a 03.8 foi pausada para a pesquisa `analise-ice`, e o desenho final pode mudar com ela.

> **[A ressalva se realizou — nota de revisão da Subetapa 03.0.a, 2026-09-04. A nota acima não se apaga.]** A pesquisa **confirmou a metade que a nota acertou** (a palavra certa era mesmo **convênio**, e derrubar `aba_catalog.planos` estava correto) e **derrubou a outra metade**: `variante_servico_id` **como tabela de preço na linha** obriga alguém a escolher a tabela na tela, que é exatamente o que a arquitetura correta existe para evitar.
>
> **O que fica no lugar, e é diferente:**
>
> - **O preço se RESOLVE, não se escolhe.** A escada é `Paciente > Tipo de profissional > Clínica > Grupo de clínicas > Prática`, percorrida no momento do lançamento até achar uma tabela configurada. Prova ao vivo na fonte: a mesma consulta custa **$250** com um profissional comum e **$400** com um especialista, **sem ninguém escolher nada** (`design/benchmark/fontes/ice.md` §5.2).
> - **A linha guarda o VALOR RESOLVIDO, com a tabela que o resolveu como proveniência.** Congela o preço no momento do acordo e diz de onde ele veio — que é auditoria, não redundância. **Trocar o profissional recalcula**, e a diferença tem de ser avisada **antes** de confirmar; sem isso, trocar o dentista de um procedimento faturado corrompe o financeiro em silêncio.
> - **A tabela de preço vira ENTIDADE COM VIGÊNCIA** (item 41, que entrou no MVP por D-I5): rascunho editável, compromisso com data, **tarifa comprometida imutável**. Reajuste é tabela nova, nunca `UPDATE` — hoje um reajuste reescreveria o passado do financeiro, e isso não tem conserto retroativo.
> - **O convênio fica FORA da escada.** Entra como **ajuste contratual** sobre a diferença, que é lançamento nomeado e reportável — não substitui o preço. Convênio de verdade (TISS/TUSS, elegibilidade) segue sendo o item 33, futuro `+1.0`.
>
> Subetapa dona: **03.8.a**. Fonte: `design/benchmark/RELATORIO_DE_IMPACTO_ICE.md` §3.1-B2.

### 11.3 Item de catálogo e lote em estoque são um-para-muitos (A8)

A planilha de referência do acervo achata os dois e por isso **repete o mesmo produto por fabricante**. No modelo do Vitrine, `item de catálogo` (o que é) e `lote em estoque` (o que se tem, com fabricante, lote e validade) são tabelas distintas em relação um-para-muitos. `aba_people.fornecedores` já existe desde a Subetapa 01.2 e é o vínculo. Subetapa dona: 03.20, que entrega só a metade de alertas e validade; entrada/saída e lote são `+1.0`.

### 11.4 Encaminhamento com contrarreferência é entidade com estado (A10)

Não é texto livre na evolução clínica, que é como o mercado inteiro resolve. É entidade com máquina de estados — `encaminhado → aceito → em atendimento → contrarreferenciado` —, formulário nas duas pontas e pré-requisito clínico declarado como campo (*"só encaminha com dor eliminada e infecção sob controle"*). Fica **entre `aba_health` e `aba_scheduling`**, e reusa o token de comunicação externa quando o especialista for externo. É lacuna que nenhum dos oito concorrentes do benchmark cobre. Subetapa dona: 03.14.

### 11.5 A tabela de métricas nasce com o CRM-filho (A3)

Retroajustar coleta de métrica em N instâncias já vendidas é migração coordenada em N bancos; nascer com a tabela custa quase nada. A tabela guarda **contagem e categoria, nunca linha de dado** — agregação na origem, não anonimização (ver `docs/05` §5.3, C5 e C6). Métricas: faturamento; clientes ativos; profissionais; procedimentos por categoria; taxa de falta; taxa de falta na primeira consulta, separada; ocupação da agenda; conversão de orçamento; inadimplência; mensagens enviadas. Subetapa dona: 03.21.

> **Nota de medição (Subetapa 03.0, 2026-09-03).** A diretriz A4 do bench dizia faltar o valor `faltou` no enum de status de `aba_scheduling.agendamentos`. **Está incorreta:** `db/migrations/009_aba_scheduling.sql:259` já traz `nao_compareceu` no `CHECK`, que é o mesmo estado traduzido pela convenção do `CLAUDE.md` §2 — a taxa de falta é calculável desde a Etapa 01. O que de fato falta é `sala_de_espera` e o KPI que consome o valor, e é isso que a Subetapa 03.4 entrega.

---

## 12. `aba_treatment` — o plano de tratamento (Subetapa 03.0.a, 2026-09-04)

Schema de módulo número **10**, chave `treatment`, label **"Planos de tratamento"** — decisão D-I2 de Max, 2026-09-03, com o `CLAUDE.md` §2 atualizado na Subetapa 03.0.a. **"Orçamento" continua sendo a palavra da interface**: o paciente e a recepção esperam essa palavra, e o schema não aparece na tela.

Esta seção existe para que a Subetapa 03.8 **não precise redescobrir o desenho**. Ela não é DDL nem ordem de implementação — é o que a pesquisa `analise-ice` mediu e o que Max decidiu. Fonte de cada afirmação: `design/benchmark/fontes/ice.md` §4 e §5, `design/benchmark/RELATORIO_DE_IMPACTO_ICE.md` §3.1.

### 12.1 A entidade é uma matriz, não uma lista de itens com preço

- **Linha = fase clínica.** Padrão de seis, configurável: Emergency (urgente e grave) · Systemic (avaliação, prevenção, medicação) · Acute (problema oral severo) · Disease Control (infecção, deterioração) · Definitive (restaurador, periodontal) · Maintenance (exame, manutenção, higiene). **O ordenamento é clínico, não comercial** — e é isso que separa este produto de um sistema de vendas com odontograma acoplado.
- **Coluna = opção de tratamento concorrente** (A, B, …, número livre). É o item **34**, que entrou no MVP por D-I5.
- **O diagnóstico atravessa as colunas; o procedimento mora dentro de uma delas.** Duas alternativas para a mesma cárie ficam lado a lado, sob o mesmo diagnóstico — e é essa forma que transforma o orçamento em conversa clínica com o paciente.
- **Diagnóstico ainda não fasado fica numa fila de trabalho à parte**, e é por ela que o planejamento começa.
- **Selecionar N faces cria N linhas, uma por dente** — nunca uma linha com N dentes.

### 12.2 Achado e procedimento são duas entradas, com faces próprias

**Este é o achado que mais custou, e ele é nosso, não da fonte.** `crm/src/features/health/odontograma.ts:96` soma `caries` + `fillingSurfaces`, e o comentário da linha 93 declara que é esse conjunto que a 03.8 cobra por face. **Mas isso é onde há doença.** A face que se orça é onde o profissional vai **trabalhar**: pode coincidir, pode ser maior (restauração MOD sobre cárie só na oclusal) ou pode não existir como achado (selante em face hígida). O vínculo entre achado e procedimento é **opcional**, e o código pode declarar que ele é obrigatório (§12.3).

**Não exige migration nova em `aba_health`:** a coluna `evolucoes.marcacoes` é `jsonb` e o envelope da 03.7 já carrega a projeção. É mudança de **projeção, não de schema**, e quem a executa é a 03.7.a.

### 12.3 O código carrega requisitos, e a trava vive no banco

Item **35**, que entrou no MVP por D-I5. Cada código de `aba_catalog.servicos` declara se exige **termo de consentimento**, **termo de consentimento informado** (procedimento de risco significativo) e **achado diagnóstico vinculado**. Mais a **regra de forma**: quantas faces aceita e se vale em dente anterior, posterior ou ambos — escolher um código de resina de face única para três faces de um molar tem de ser recusado, e recusado **pelo banco**.

**Procedimento que exige consentimento e não o tem não sai de `proposto`, não é aprovado e não é faturado.** É o mesmo argumento que a 03.6 usou para `quantidade_maxima`: regra clínica que a tela pode esquecer é regra que a tela não guarda. Subetapas donas: **03.6.a** (as colunas) e **03.8** (a trava).

### 12.4 Consentimento: recusa implícita e re-consentimento com gatilho explícito

Item **36**, que entrou no MVP por D-I5. Duas regras que o nosso desenho não tinha:

- **Recusa implícita.** Consentir os procedimentos da Opção A marca os da Opção B **para o mesmo diagnóstico** como recusados. **O registro de que o paciente escolheu A e recusou B é o que protege a clínica depois** — é requisito ético e jurídico, não conveniência de tela.
- **Re-consentimento com gatilho explícito.** Mudar **dente** ou **código** exige termo novo. Mudar **face**, **fase**, **opção** ou **diagnóstico vinculado** não exige. A regra mora em dado, não num `if` espalhado.

**O documento em si continua sendo vista de impressão + `window.print()`** (decisão de Max, reconfirmada pela pesquisa — a fonte também não usa biblioteca de PDF nesse fluxo). O que muda é **o que se imprime**: o termo é uma **seleção** (quais procedimentos entram, com "selecionar todos" por fase ou por opção) mais uma **escolha de apresentação** (com ou sem valor) — porque há caso em que a conversa financeira precisa ficar separada da clínica.

### 12.5 A inversão brasileira, e a trava dupla de finalização

**Instrução de Max, 2026-09-03, e ela contradiz a fonte de propósito.** No ICE a cobrança nasce da **execução**. **No Brasil é comum o inverso:** o paciente paga adiantado, e a fatura sai da **apresentação e aprovação do plano — da assinatura do contrato**. Quem esperar o dentista marcar a face trabalhada para faturar **não fatura nunca**.

As duas metades da regra, e **as duas são obrigatórias**:

1. **A cobrança se solta na aprovação do plano/contrato**, livre e antes de qualquer execução.
2. **O contrato não se finaliza** enquanto não forem verdadeiras ao mesmo tempo: (a) o paciente pagou **tudo** e (b) o profissional executou em **todas as faces de todos os dentes planejados**.

**A consequência de modelagem é a parte que importa:** "terminou?" passa a ser derivado de **duas fontes independentes** — o saldo em `aba_finance` e a cobertura de execução por face em `aba_health`. **Nenhuma responde sozinha.** É invariante de dois schemas, e é por isso que a 03.8.a tem P-sub.

> **A armadilha, nomeada antes de acontecer: não declarar o contrato concluído no último pagamento.** É o simétrico exato do que a Subetapa 02.10 já pagou (`handoffs/instrucoes.md` §5) — o agendador zerou o KPI "Vencido" porque a fatura saía do contador exatamente quando virava pendência. Aqui, o contrato sairia da lista de pendências no momento em que o paciente termina de pagar **e ainda tem trabalho a receber**, que é o pior momento possível.

**A cobertura de execução é por FACE, não por procedimento** — e é isso que torna o item **37** (step set), que ficou fora do MVP por D-I5, aditivo depois em vez de reescrita.

### 12.6 O que NÃO muda, e vale dizer

- **O odontograma continua gravando em `aba_health.evolucoes.marcacoes`** (migration `025`), nunca em tabela clínica nova. A pesquisa não dá nenhuma razão para criar tabela clínica, e o `CLAUDE.md` §5 dá todas para não criar. `aba_treatment` guarda o **plano**; o **quadro clínico da boca** continua onde está.
- **A régua de `aba_finance` continua valendo:** a aprovação passa pelas seis operações já provadas (`db/migrations/011_aba_finance_operations.sql`), **nunca por `INSERT` direto** nas tabelas mantidas por trigger.
- **`is_account_member` + `access.can()`** continuam sendo o mecanismo de permissão. A pesquisa mostrou um modelo aditivo por grupos de profissionais e ele foi **recusado** — `CLAUDE.md` §14: porte do Maximus, provado em produção. O que se leva é a pergunta que o modelo aditivo faz bem, não o mecanismo.
- **A semente SIGTAP de 64 procedimentos** (03.6) sai reforçada: conjunto de código padronizado é a fundação de busca, regra, faturamento e visual no odontograma.

---

## 13. Vocabulário do domínio e o contrato (decisões D-V1–D-V8, 2026-09-04)

Esta seção nasce de uma pergunta de precisão de Max — *"'plano' e 'convênio' são coisas distintas; verifique se o CRM não as está tratando como sinônimo"* — e da varredura que ela provocou. O achado foi maior que a pergunta: **"plano" tinha quatro donos dentro do mesmo produto** e **"convênio" não tinha nenhum**. As decisões estão em `docs/00_PLANO_E_CRITERIOS.md` → "As oito decisões de vocabulário e contrato (D-V1–D-V8)"; aqui fica o modelo de dados que elas produzem.

### 13.1 Quatro palavras, quatro donos (D-V1)

| Termo | O que é | Onde mora |
|---|---|---|
| **Procedimento** | A unidade atômica vendável e executável: "extração de siso", "restauração de dente permanente posterior". Carrega código SIGTAP, unidade de lançamento, quantidade máxima, regra de forma e os três requisitos (03.6 / 03.6.a) | `aba_catalog.procedimentos` — a tabela que se chamava `servicos` |
| **Pacote** | Combo **padrão** ofertado a todos, geralmente promocional: "5 sessões de limpeza". Pode entrar ou não num contrato | `aba_catalog.pacotes` + `itens_pacote` — as que se chamavam `planos` / `itens_plano` |
| **Plano** | Combo **personalizado**, criado para um paciente específico a partir da anamnese, do odontograma e do diagnóstico: "plano de restauração de 3 molares e 1 prótese". Só aparece disponível para o contrato daquele paciente | `aba_treatment` (Subetapa 03.8) |
| **Nível** | A faixa comercial do próprio CRM — Bronze, Prata, Ouro, Diamante —, que decide a que funcionalidades a clínica tem acesso | `licensing` + a camada da Subetapa 03.9 |
| **Convênio** | A operadora de saúde de que o paciente é signatário, e que lhe dá desconto | **Não existe (D-V5).** Ver §13.4 |

E **"serviço" volta a ser o guarda-chuva**: qualquer um dos três primeiros, quando não importa qual. A execução do renome é a **Subetapa 03.6.b**.

**"Plano" e "orçamento" também são coisas distintas, e as duas existem na tela** (Max, 2026-09-04): **plano** é o planejamento clínico — o conjunto de procedimentos a executar naquele paciente; **orçamento** é a vista financeira dele — o preço a pagar pela execução do que foi contratado. A recepção e o profissional veem os dois; **só o profissional autor edita o plano**, e **só `admin` mexe em parcela, desconto, juros, mora e promoção** (§13.3).

### 13.2 O contrato guarda itens de três tipos — com arco exclusivo, nunca polimorfismo (D-V3)

O contrato é a **estrutura documental dentro da qual se registra tudo o que foi pactuado**. Um contrato pode conter um plano personalizado, um pacote padrão, um procedimento avulso, ou N de cada, misturados.

**A forma que NÃO se usa, e o motivo é medido.** O desenho intuitivo é uma coluna `tipo` (enum) mais uma coluna `id` apontando para uma das três tabelas. Isso é **referência polimórfica**, e ela **não pode ter `REFERENCES`**. As 10 chaves estrangeiras que hoje apontam para o catálogo são **todas compostas por `account_id`** (Subetapa 02.15: a integridade referencial ignora RLS por especificação — `account_id` na filha isola a linha, mas não impede que ela **aponte** para linha de outra conta). A defesa permanente contra a 11ª chave desprotegida, `public.fks_sem_isolamento_de_conta()`, filtra `WHERE con.contype = 'f'`: **uma coluna polimórfica não seria sinalizada, seria invisível**. Nada impediria a linha de um contrato de apontar para o pacote de outra clínica, e nenhum teste ficaria vermelho.

**A forma que se usa:**

- **`aba_finance.itens_contrato`** com `procedimento_id`, `pacote_id` e `plano_id` — as três anuláveis, cada uma chave estrangeira composta por `account_id`, e `CHECK (num_nonnulls(procedimento_id, pacote_id, plano_id) = 1)`. É o padrão de **arco exclusivo**, e a auditoria enxerga as três.
- **Gatilho de isolamento por paciente:** `plano.cliente_id` tem de ser igual a `contrato.cliente_id`. A chave composta protege entre clínicas; **nada protege entre pacientes da mesma clínica sem esta trava**.
- **`aba_catalog.ofertas`, uma VIEW** — o "cardápio": `UNION` dos três com uma coluna `tipo`, e o plano aparecendo só para o paciente dono dele. View, e não tabela: cardápio não guarda dado, e guardar duplicaria preço.
- **O item de contrato guarda o valor acordado congelado, com proveniência** — nunca lê o preço do catálogo na hora de exibir. Senão reajustar a tabela reescreve contrato assinado, que é o mesmo mal que o item 41 existe para impedir.
- **Quantidade e validade são do item de contrato, não do cardápio.** No cardápio são a oferta ("vale 180 dias"); no contrato são o fato ("comprou 3, vence em 12/03"). São tempos de vida diferentes.

**Aditivo de contrato não existe no MVP (D-V4):** acréscimo de serviço ou de tempo é **contrato novo**, ligado ao anterior pelo `cliente_id` compartilhado. Aditivo como documento vinculado ao contrato-pai é versionamento futuro declarado.

**Contrato assinado é pré-requisito de execução (D-V8):** nenhum serviço — procedimento, pacote ou plano — se executa sem contrato assinado pelas duas partes, mesmo para um trabalho único como uma limpeza. Espelha a exigência do CFO de assinatura das duas partes no prontuário a cada trabalho. **O `owner` pode desligar a exigência por processo, assumindo o risco — e o desligamento se registra**, com quem e quando. Subetapa dona: **03.8.b**.

### 13.3 Autoria do plano e sucessão do profissional (D-V7)

- **Edita o plano só o profissional que o criou** — RBAC (`agent` + profissional) **e** IBAC (o autor). É direito de exercício profissional, não conveniência de tela.
- **O autor indica um coautor** antes de sair, no mesmo regime de troca de segredo profissional das referências e contrarreferências.
- **Se não indicar** — inclusive por morte —, no momento em que o `owner` marca aquele profissional como **inativo**, planos e contratos dele passam **automaticamente ao `owner`**, a quem cabe executar ou redistribuir. O motivo é prático: é comum o `owner` não ser dentista.
- **Atenção medida:** `access.can()` devolve `TRUE` para `owner` **antes** de consultar qualquer tabela (`003_core_access.sql:162`). A trava por autor precisa do **mesmo** mecanismo que a Subetapa 03.9 vai construir para a trava de nível — não de uma segunda invenção.
- **Dinheiro é da recepção:** só `admin` altera parcelas, descontos, juros, mora e promoções. É padrão de qualidade do trabalho clínico — tira do dentista a negociação de preço na cadeira, e dá a cada lado uma resposta honesta para o paciente.

### 13.4 Convênio — provisionado, não construído (D-V5)

**Nada se cria agora:** nenhuma tabela, nenhuma coluna, nenhuma RLS, nenhuma view. O MVP trabalha só com os preços padronizados pelo próprio consultório, e operadora, franquia, carência, cobertura e exceção continuam **controle manual da recepção**.

Esta seção existe para que o versionamento futuro **não redescubra o desenho** nem esbarre no que se decidiu agora. O modelo de referência, medido em `design/benchmark/fontes/ice.md` §5.3, tem três níveis — **operadora → unidade regional → apólice** — com quatro tipos de apólice, benefícios (co-pagamento, teto por indivíduo/família, franquia, data de aniversário em que os tetos zeram), cobertura por categoria e **exceção por código** com idade mínima e máxima. Múltiplas apólices por paciente, com a ordem definindo primária e secundária.

**Os dois ganchos que o desenho de hoje já deixa prontos, e que não devem ser fechados:**

1. **A escada de preço da 03.8.a começa no degrau `Paciente`.** O desconto de convênio é tabela de preço própria (varia por idade, por exemplo), e é nesse degrau que ela entra — sem reescrever a escada.
2. **O convênio fica FORA da escada como pagador.** Quando existir, entra como **ajuste contratual** sobre a diferença — lançamento nomeado e reportável —, e "quem pagou" vira coluna própria, **nunca** um valor de `pagamentos.forma_pagamento`. Foi por isso que a 03.6.b trocou o valor `'plano'` daquele CHECK por **`'saldo_pacote'`**: aquele valor nunca foi forma de pagamento nem pagador, é liquidação contra saldo pré-pago.

Convênio de verdade com TISS/TUSS, CID-10 e elegibilidade eletrônica segue sendo o **item 33** da lista de futuro `+1.0`, fora do MVP por `CLAUDE.md` §15.
