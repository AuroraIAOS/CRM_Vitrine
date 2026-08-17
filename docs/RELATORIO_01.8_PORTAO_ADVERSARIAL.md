# RELATÓRIO — Subetapa 01.8, Portão de segurança adversarial

**Data:** 2026-08-17 · **Bench:** `bench/01.8-seguranca-adversarial` · **Base:** `main` em `d293951`
**Escopo atacado:** superfície aplicada nas Subetapas 01.2–01.6 (núcleo `public`/`access`/`licensing` + 9 schemas `aba_*` + Edge Function do webhook da Meta).
**Modo:** auditoria adversarial, sem teto de tentativas · **LLM:** Opus do início ao fim.

---

## 1. Resumo executivo

A Etapa 01 chegou a esta subetapa com 65 testes de RLS 100% verdes, varredura de segredos zerada e advisor de segurança limpo. **Mesmo assim, o ataque deliberado encontrou 6 falhas reais e exploráveis** — uma delas permitindo **tomada completa de uma conta alheia** por um usuário sem nenhum privilégio prévio.

Isso é a justificativa da pendência vigiada, medida em vez de argumentada: a suíte funcional prova que o comportamento *pretendido* funciona; ela não tem como provar que não existe um caminho *não pretendido*. As 6 falhas eram todas caminho não pretendido, e nenhuma teria aparecido em revisão de código normal.

| | |
|---|---|
| Ataques escritos | **35** (3 arquivos novos de suíte) |
| Achados | **7** — 6 falhas reais + 1 não explorável |
| Falhas corrigidas e provadas | **6 de 6** |
| Achados aceitos sem correção | 1 (medido, não explorável) |
| Suíte final | **100/100 verdes** (65 originais sem regressão + 35 adversariais) |
| Correções | `db/migrations/022_hardening_portao_adversarial.sql` + `whatsapp-webhook` v3 |

**Onde as falhas se concentraram** — vale mais que a contagem. A RLS de tabela, que foi onde a Etapa 01 investiu quase todo o esforço de teste, passou em tudo. As falhas estavam nas três costuras entre camadas:

1. **Coluna de privilégio dentro de uma linha legitimamente autorizada** (A01, A02) — RLS restringe *quais linhas*, nunca *quais colunas*.
2. **Credencial legível pela API** (A03, A04, A05, A07) — um padrão de proteção criado em um módulo que ninguém reaplicou nos outros.
3. **Código de servidor rodando com `service_role`** (A06) — onde a RLS simplesmente não participa.

---

## 2. Achados, vetor a vetor

### Vetor 1 — CRUD fora do que a role permite

#### 🔴 A01 — Tomada de conta por `INSERT` em `public.profiles` · **CRÍTICO · CORRIGIDO**

A policy `profiles_insert` checava apenas `auth.uid() = user_id` — não olhava `account_id` nem `account_role`. A trava `enforce_profile_privilege_columns`, escrita justamente para impedir escalação de privilégio, era `BEFORE UPDATE` e não cobria `INSERT`.

O ataque, executado ao vivo: um usuário autenticado **sem linha em `profiles`** inseriu a si mesmo na conta da vítima como `owner` e passou a enxergar `public.accounts` dela.

```
H2 EXPLORÁVEL — perfil plantado:
  [{"id":"8c137c12-…","account_id":"8d70c0a0-…","account_role":"owner"}]
| conta da vítima visível ao invasor:
  [{"id":"8d70c0a0-…","name":"rls.owner@crmvitrine.local"}]
```

O estado "usuário sem perfil" **não é hipotético**: `handle_new_user()` engole qualquer exceção (`EXCEPTION WHEN OTHERS … RETURN NEW`), de modo que qualquer falha na criação de conta/perfil deixa o usuário em `auth.users` sem `profiles` — exatamente a condição em que o `UNIQUE(user_id)` deixa de bloquear o ataque.

**Correção (migration 022):** a policy de `INSERT` deixou de existir (ausência nega por padrão — mesmo padrão de `licensing.account_limits`), porque não há escritor legítimo de `profiles` em `authenticated`; `handle_new_user` e as futuras RPCs de convite rodam `SECURITY DEFINER` como `postgres` e não passam por RLS. A trava de coluna passou a cobrir `INSERT OR UPDATE`, como segunda camada.

#### 🟠 A02 — `admin` se apossava da conta reescrevendo `owner_user_id` · **ALTO · CORRIGIDO**

`accounts_update` autoriza `admin+` a atualizar a linha da própria conta — legítimo, o nome da conta é configuração. Mas `owner_user_id` mora na mesma linha, e RLS não distingue coluna. Um `admin` reescreveu a titularidade do registro para si mesmo, sem passar por nenhum fluxo de transferência de posse.

**Correção (migration 022):** `enforce_account_privilege_columns()`, `BEFORE UPDATE`, recusando alteração de `owner_user_id` quando `current_user = 'authenticated'`. A transferência legítima virá pela RPC `transfer_ownership` (Maximus 019) na Etapa 02, `SECURITY DEFINER`, que passa livre.

#### ✅ Barrado
Viewer escrevendo em perfil alheio; agent escalando o próprio `account_role`; membro migrando a si mesmo para outra conta.

---

### Vetor 2 — Acesso direto ao banco fora da camada de RLS

**Nenhum achado.** Varredura de catálogo sobre os 13 schemas do projeto:

- `TRUNCATE` / `REFERENCES` / `TRIGGER` concedidos a `anon` ou `authenticated`: **zero**.
- Tabelas com RLS desativada: **zero**.
- `anon` com qualquer privilégio de tabela: **zero**. Confirmado também por ataque real (varredura de leitura e de escrita sobre 17 tabelas representativas, todas negadas).
- Tabelas com RLS ativa e nenhuma política: **uma** — `aba_automations.automacao_execucoes_pendentes`, deny-by-default deliberado e já registrado na Subetapa 01.5.
- Funções internas de trigger (`recalcular_valor_fatura`, `registrar_escrita_clinica`, `carimbar_conclusao`, …) chamáveis por RPC: **nenhuma**.
- Service role key exposta ao browser: **não** — nenhuma variável `VITE_*` de service role.

#### ⚪ A08 — `public.rls_auto_enable()` executável por `anon` · **NÃO EXPLORÁVEL · ACEITO**

O advisor do Supabase acusa esta função de plataforma como `SECURITY DEFINER` chamável por `anon`. **Medido em vez de suposto:**

```
anon POST /rest/v1/rpc/rls_auto_enable
  -> 400 {"code":"0A000","message":"cannot display a value of type event_trigger"}
```

O tipo de retorno `event_trigger` não é representável pelo PostgREST e **o corpo da função nunca executa**. Decisão: não mexer em objeto gerenciado pela plataforma — revogar `EXECUTE` de uma função que o Supabase mantém arrisca quebrar comportamento gerenciado em troca de fechar um caminho que já não leva a lugar nenhum. Reavaliar se o tipo de retorno mudar.

---

### Vetor 3 — Injeção de conteúdo malicioso

**Nenhum achado.**

- **SQL:** 7 payloads hostis contra `aba_ai.buscar_conhecimento_textual` (sintaxe de `tsquery`, aspas, `;`, `DROP TABLE`) e contra `access.can` / `access.set_module_permission`. Nada executou; a tabela alvo da injeção continua de pé.
- **XSS armazenado:** `<script>` persistido em coluna texto é gravado e devolvido **literal**, sem interpretação nem transformação. O banco trata como dado, que é o correto. **A defesa de XSS é da renderização** — fica como fronteira a provar na Subetapa 02.6, quando existir UI.
- **`jsonb` hostil:** payload com 200 níveis de aninhamento, chave de 50 KB, chaves com aspas e `DROP TABLE` embutido — armazenado sem corromper nada e sem escapar da coluna.

---

### Vetor 4 — Burlar ou reescrever política de RLS

**Nenhum achado.**

- Nenhuma RPC de execução de SQL arbitrário exposta (`exec_sql`, `execute_sql`, `run_sql`, … — todas ausentes).
- `access.can` é fail-closed para toda entrada inválida ou hostil testada (módulo inexistente, ação inválida, `NULL`, `*`, string com SQL embutido).
- Não-owner não grava interruptor de permissão, nem pela RPC nem por `INSERT` direto na tabela.
- Owner não grava permissão em conta alheia.
- `access.modules` é somente leitura para todo papel — inclusive contra a tentativa de **renomear a chave do módulo `health`**, que desarmaria `access.can` silenciosamente.
- As 10 funções `SECURITY DEFINER` executáveis por `authenticated` foram auditadas uma a uma: todas checam conta/concessão internamente, ou são as próprias primitivas de autorização.

---

### Vetor 5 — Alteração de parâmetro ou valor padrão protegido

**Nenhum achado.**

- Teto de assentos: nem o `owner` altera `licensing.account_limits` (sem policy de escrita — nega por ausência), nem por `UPDATE` nem por `INSERT` de linha nova.
- Teto respeitado no caminho de `INSERT` direto de perfil em conta lotada.
- `CHECK`/enum honrados: convite com papel `owner` recusado; `envios_fatura.provedor = 'evolution'` recusado (escopo fora do MVP, `CLAUDE.md` §15); evolução clínica travada recusa alteração.

---

### Vetor 6 — Sequestro de credencial

#### 🟠 A03 · 🟡 A04 · 🟡 A05 · 🟡 A07 — Credencial legível pela API · **CORRIGIDOS**

A Subetapa 01.6 escondeu as colunas de segredo de `aba_messaging` por narrowing de coluna (Maximus 055) e isso passou a ser tratado como "o padrão de segredo do projeto". **O padrão nunca foi aplicado ao núcleo nem a `aba_ai`.** Um **viewer** — o papel mais fraco do produto — leu:

| Achado | Coluna | Gravidade | Por quê |
|---|---|---|---|
| A03 | `public.webhook_endpoints.secret` | **ALTO** | segredo de assinatura, em **texto puro** — permite forjar evento de saída |
| A04 | `public.api_keys.key_hash` | MÉDIO | hash de credencial, habilita ataque offline |
| A07 | `public.account_invitations.token_hash` | MÉDIO | hash de token de convite |
| A05 | `aba_ai.ia_configuracoes.chave_api` | MÉDIO | chave de IA (cifrada, mas credencial mesmo assim) |

**A07 merece nota de método:** A03/A04/A05 saíram de leitura de código; A07 só apareceu numa **varredura de catálogo** (`information_schema.columns` filtrado por nome de coluna, cruzado com `has_column_privilege('authenticated', …)`). A varredura achou o que a leitura atenta não achou — técnica registrada em `handoffs/instrucoes.md` §7 como candidata a promoção.

**Correção (migration 022):** `REVOKE SELECT` de tabela + `GRANT SELECT (colunas)` nas quatro tabelas, com a lista de colunas derivada do catálogo em vez de escrita à mão. Estado final conferido — as **8** colunas de credencial do banco, uniformemente:

| papel | lê credencial |
|---|---|
| `anon` | não |
| `authenticated` | não |
| `service_role` | sim (é quem legitimamente opera) |

**Controle negativo:** provado que a correção não é "negar tudo" — `admin` continua lendo `id`/`url`/`events`/`is_active` do endpoint para operar a tela, e `service_role` continua lendo o `secret` de que precisa para assinar.

**Custo aceito e medido:** `select('*')` nessas tabelas passa a devolver `42501` para `authenticated`. A UI da Etapa 02 precisa listar colunas explicitamente — registrado como pendência vigiada, porque o erro se disfarça de falha de RLS.

#### ✅ Controle positivo
O narrowing de `aba_messaging` (01.6) de fato nega `token_acesso_cifrado`, `segredo_webhook_cifrado`, `token_instancia_cifrado` e `hash_segredo_webhook` — o que prova que a ausência dele no núcleo era lacuna, não limitação da técnica.

---

### Vetor 7 — Exposição indevida de dado pessoal (LGPD, com atenção a `aba_health`)

**Nenhum achado.** `aba_health` foi o schema que melhor resistiu — o regime mais restritivo previsto em `CLAUDE.md` §5 se sustentou sob ataque:

- Agent sem concessão recebe **conjunto vazio** nos quatro caminhos de leitura clínica (`ler_prontuario`, `ler_evolucoes`, `ler_respostas_anamnese`, `ler_consentimentos`).
- Coluna clínica **não é legível direto na tabela** — nem pelo `owner`. Não existe leitura sem log.
- **Embedding do PostgREST não contorna o bloqueio**: tentativa de puxar conteúdo clínico de carona numa relação permitida (`prontuarios?select=id,evolucoes(avaliacao,notas_procedimento)`) não vaza nada.
- **Log de acesso é imutável** — sem policy de `UPDATE` nem de `DELETE`; a tentativa de reescrever e de apagar falhou.
- Membro **não forja** linha de log em nome de outro usuário (`usuario_ator_id = auth.uid()` no `WITH CHECK`).
- Dado pessoal **não atravessa a fronteira de conta por embedding entre schemas** — quatro tentativas de join cruzado (`pessoas→clientes`, `oportunidades→pessoas`, `conversas→mensagens`, `faturas→clientes`) por usuário de outra conta: zero linhas.

---

### Fragilidade específica do Vitrine

#### 🟠 A06 — Webhook da Meta atravessava a fronteira de conta · **MÉDIO/ALTO · CORRIGIDO**

No **único endpoint público e não autenticado do sistema**, `processarAtualizacaoStatus()` atualizava `aba_messaging.mensagens` filtrando só por `id_mensagem_externa`, rodando com `service_role` (que ignora RLS) — e sequer recebia o `accountId` que o próprio chamador havia resolvido pelo `phone_number_id` duas linhas acima.

Provado **ponta a ponta contra a função implantada**, com payload assinado por HMAC-SHA256 real:

```
A06 EXPLORÁVEL — evento destinado à conta 8d70c0a0-…
  alterou mensagem da conta 7a898244-… (id externo compartilhado: wamid.ADV…)
```

**Correção:** `.eq("account_id", accountId)` acrescentado ao filtro; função passou a receber o `accountId`. Implantada como **v3**. Uma linha de código — mas o invariante que ela quebrava (isolamento entre inquilinos) é o mais caro de um produto multi-conta.

**Ausência de regressão provada:** as 15 asserções da evidência da Subetapa 01.6 (`crm/scripts/test_webhook_meta.mjs`) continuam todas verdes — handshake, rejeição sem assinatura, rejeição com assinatura inválida, aceite assinado, persistência e idempotência.

---

## 3. Verificação final

| Verificação | Resultado |
|---|---|
| `npm run test:rls` | **100/100 verdes** — 65 originais (zero regressão) + 35 adversariais |
| Cada correção provada por teste que falhava antes | sim — os 6 ataques ficam como regressão permanente na suíte |
| `npm run typecheck` | limpo |
| `get_advisors` (security) | sem achado novo; os 5 restantes são pré-existentes e documentados |
| `gitleaks detect` | `no leaks found` |
| Integridade da fixture | conferida após os ataques destrutivos — 4 perfis, 1 conta, titularidade restaurada, zero usuário descartável órfão |

**Sobre os ataques destrutivos:** executados de verdade (autorização explícita de Max), sempre contra conta e usuário descartáveis criados na hora. Dois ataques tiveram sucesso (A01, A02) e ambos foram revertidos na mesma execução — a fixture foi conferida ao final e está íntegra.

---

## 4. Divergência declarada entre banco e `main`

As correções foram aplicadas **no banco real durante o bench** (decisão de Max na abertura da subetapa), para que cada uma fosse provada ao vivo em vez de teórica. Consequência a registrar com todas as letras:

> **O Supabase está hoje à frente do `main`.** O banco tem a migration `022` e a `whatsapp-webhook` v3; o `main` não tem os arquivos correspondentes — eles vivem no bench. O merge do bench alinha os dois. **Enquanto o merge não acontecer, `main` não descreve o estado real do banco.**

Isso é um argumento a favor de resolver o merge cedo, não um risco de segurança: o banco está na configuração **mais** segura das duas.

---

## 5. Parecer

### ✅ RECOMENDO trazer o bench `bench/01.8-seguranca-adversarial` para o `main`.

**Fundamento:**

1. As **6 falhas reais estão corrigidas e provadas** — cada uma tem um teste que falhava antes da correção e passa depois, e esse teste fica na suíte como regressão permanente.
2. **Nenhuma regressão**: os 65 testes da fundação continuam verdes, e as 15 asserções do webhook da Subetapa 01.6 também.
3. As correções **não são "negar tudo"** — há controle negativo provando que o acesso legítimo (admin operando a tela, service role assinando) continua funcionando.
4. O único achado não corrigido (**A08**) foi **medido** e é comprovadamente não explorável; a decisão de não tocá-lo é conservadora e está registrada com o critério de reavaliação.
5. O bench **melhora estritamente** a postura de segurança do `main`: fecha uma tomada de conta crítica e quatro exposições de credencial, sem remover nenhuma capacidade legítima.

**Ressalvas que acompanham o merge, não o bloqueiam:**

- **`select('*')`** quebra nas seis tabelas com narrowing de coluna. Já registrado como pendência vigiada e em `instrucoes.md` §6 — a Etapa 02 precisa listar colunas explicitamente.
- **XSS armazenado** é fronteira aberta por natureza nesta Etapa: o banco guarda o payload literal (correto), e a defesa pertence à renderização. **Item obrigatório da Subetapa 02.6**, quando existir UI para atacar.
- **A08** permanece em observação, com gatilho de reavaliação declarado.

---

## 6. Regra §13 — parada obrigatória

**O merge não foi executado, e não será por iniciativa do CODE.**

`CLAUDE.md` §13 e o passo 7 da pendência vigiada são explícitos: mesmo com todos os testes 100% verdes e parecer final favorável — que é exatamente o caso aqui — ordenar o merge é atribuição exclusiva de Max. Este relatório e o parecer acima são a entrega; o CODE para neste ponto.

O bench está em `bench/01.8-seguranca-adversarial`, com o trabalho commitado e nada pendente na árvore.
