# RELATÓRIO — Subetapa 03.9, portão completo: multiunidade + trava de nível por módulo

**Data:** 2026-09-14
**Bench:** `bench/03.9-multiunidade-trava-de-nivel`, criado a partir de `etapa-03/plano-mvp-odontologico` em `5857cdd`
**Escopo atacado:** o núcleo de permissão — `public.profiles`, `public.is_account_member()`, `access.can()` e `aba_health.pode_acessar()`, e tudo o que descobre "a conta do chamador": 319 políticas, 39 funções que leem `profiles`, 4 Edge Functions e a autenticação da tela. Mais a camada nova de nível comercial.
**Modo:** `[Manual]`, auditoria adversarial sem teto de tentativas
**LLM:** Opus do início ao fim

---

## 1. Resumo executivo

A 03.9 fez duas coisas no mesmo lugar, porque as duas reescrevem `access.can()`:
- **multiunidade:** uma pessoa trabalha em mais de uma clínica e, na clínica ativa, não enxerga nada da outra;
- **trava de nível:** um módulo fora do nível contratado some **inclusive para o `owner`**.

**O vetor obrigatório se confirmou como o vazamento mais provável do MVP.** Com a `UNIQUE (user_id)` já retirada e as funções ainda antigas, uma pessoa que é `agent` na clínica B leu, pela `ler_evolucoes`, **a evolução clínica inteira da clínica M**, onde é `owner`. Não houve erro nem teste vermelho. Trinta funções descobriam a conta por `SELECT … INTO` sobre `profiles`, e com duas linhas o PL/pgSQL devolve a primeira.

**Números do portão:**
- **Casos adversariais novos e permanentes:** **35**, em `24_adversarial_multiunidade.spec.ts`. O vetor obrigatório é uma varredura de **88 tabelas** com `account_id`.
- **Achados:** **8** — 2 graves, 2 médios, 1 baixo e 3 de processo.
- **Corrigidos:** 8 de 8. O F05 foi corrigido por construção, sem reprodução.
- **Migrations:**
  - `054_conta_ativa_por_sessao`
  - `055_trava_de_nivel_por_modulo`
  - `056_funcoes_na_conta_ativa_e_convite_hibrido`
  - `057_guardas_multiunidade_e_nivel`
- **Guardas permanentes por catálogo:** 4 novas, mais `fks_sem_isolamento_de_conta`. Todas devolvem zero nos dois bancos.
- **Suíte inteira:** **25 arquivos, 362 verdes e 1 declarado** (A06), na primeira execução. Eram 329.
- **Evidência de banco em produção:** **29/29**, com sessões reais e resíduo zero.
- **Produção × teste:** idênticos por hash normalizado em funções, políticas, restrições, colunas, privilégios e índices.

---

## 2. Decisões de Max antes da primeira DDL

A conta ativa não tem fonte de porte: a `017_account_sharing.sql` do Maximus trava a membresia única. Pelo `CLAUDE.md` §14, as escolhas foram levadas a Max, que respondeu em 2026-09-14:

1. **A conta ativa vive por sessão.** Fica em `public.active_accounts`, com chave `session_id` do JWT, claim confirmada na documentação vigente do Supabase Auth. Dois aparelhos da mesma pessoa não se trocam de clínica um ao outro.
2. **Convite híbrido.**
   - A conta de origem solitária e vazia migra e é apagada, como já fazia a 037.
   - Qualquer outro caso ganha um perfil novo, e a clínica de origem fica intacta.
3. **Dono de duas clínicas é permitido, sem autosserviço.** O índice `idx_accounts_one_per_owner` sai; a segunda titularidade chega por convite e transferência.
4. **Rede (grupo de clínicas) fica fora da 03.9.** Virou pendência vigiada.

---

## 3. Achados

### 🔴 F01 — A conta vinha da primeira linha de `profiles` · GRAVE · CORRIGIDO

**O que é.**
- `SELECT account_id, account_role INTO … FROM public.profiles WHERE user_id = auth.uid()` aparecia em 30 funções.
- `is_account_member(conta)` respondia "sim" para **qualquer** conta da pessoa.
- Com a `UNIQUE (user_id)` isso era correto. Sem ela, a conta e o **papel** passam a vir de uma clínica qualquer.

**Medido no banco de testes, com a `054` aplicada e as funções antigas:**

| Ataque (sessão ativa em B, onde a pessoa é `agent`) | Resultado |
|---|---|
| `ler_evolucoes(paciente de M)` | **devolveu a evolução inteira de M (21 campos)** |
| `access.can('health','read')` | **`true`**: herdou o `owner` de M |
| varredura de 88 tabelas | **vazou** `aba_health.evolucoes` |
| `criar_convite` | aceitou como se fosse `owner` |

**Correção.**
- **Ponto único:** `is_account_member` exige `target = public.active_account_id()` (054). Das 319 políticas, 281 passam por ela.
- **Reescritas completas:** `access.can`, `pode_acessar` e as três leituras de matriz (055).
- **Uma linha cada:** 23 funções ganharam `AND account_id = public.active_account_id()` na busca (056). O texto foi gerado por substituição sobre a definição vigente, com contagem por função.
- **Regra de resolução:**
  - com escolha nesta sessão, vale a escolha, desde que o perfil ainda exista;
  - sem escolha e com perfil único, vale esse perfil;
  - em qualquer outro caso, **NULL, e tudo nega**.
- **Nunca cai em silêncio na outra clínica.** Quem é removido da clínica escolhida fica sem clínica.

**Depois:** os três ataques da tabela ficaram vazios ou negados, a varredura voltou zero nos dois sentidos, e o controle positivo passou: a mesma pessoa, ativa em M, lê a própria evolução.

### 🔴 F02 — Gestão de membro alterava a pessoa em todas as clínicas · GRAVE (latente) · CORRIGIDO

**O que é.**
- `set_member_role` e `transfer_account_ownership` faziam `UPDATE public.profiles … WHERE user_id = p_user_id`.
- `remove_account_member` também localizava e movia o alvo por `user_id`.
- Com dois perfis:
  - rebaixar na clínica B rebaixaria na M;
  - transferir a titularidade de B faria a pessoa virar `owner` de **todas** as clínicas dela.

**Medido:** a dona de B recebeu `42501` ao rebaixar o próprio membro, porque a leitura do alvo caiu no perfil dele em M.

**Correção (056).**
- O alvo passa a ser lido por (pessoa, conta ativa de quem chama) e alterado pelo **id do perfil**.
- **Remoção de quem tem outra clínica:**
  - apaga só o perfil desta clínica;
  - o funcionário e o profissional daqui viram retrato de ex-membro, pela semântica da 038;
  - nenhuma conta nasce.
- A verificação (b) da 056 recusa `UPDATE profiles WHERE user_id` nessas funções.

**Depois:** rebaixar em B deixa M como `owner`. Transferir B faz a pessoa dona das **duas**, com M intacta. Remover de B não cria conta, e a sessão que estava em B passa a não ver nada.

### 🟠 F03 — `formularios_anamnese` sem cerca de conta, desde a 013 · MÉDIO · CORRIGIDO

**O que é.**
- As três políticas eram só `aba_health.pode_acessar(NULL, …)`.
- Com o cliente nulo, a função responde "esta pessoa enxerga prontuário em geral, na conta dela".
- O `owner` de **qualquer** conta recebe "sim", e nada compara o `account_id` da linha.
- **Não nasce da multiunidade:** existia com uma conta por pessoa.

**Medido** numa transação desfeita no banco de testes, com a regra do §11 de não escrever hipótese como causa:
- a primeira tentativa foi **inconclusiva**, porque não havia formulário;
- a segunda semeou um formulário, e o `owner` de uma conta recém-criada **o leu e o alterou**: `UPDATE` de 1 linha.

**Exposição em produção:** 2 contas com 1 formulário cada — a antiga conta de testes (`rls.owner`) e a de demonstração. **Não havia cliente real.** O formulário é o questionário, não a resposta do paciente.

**Correção.**
- As políticas passaram a `is_account_member(account_id,'viewer') AND pode_acessar(NULL, …)` (056 §1).
- A guarda `politicas_sem_cerca_de_conta()` (057) cobre a família inteira.
- A suíte e a evidência de produção provam leitura e escrita negadas.

### 🟠 F04 — `licensing.account_limits` com escrita concedida a `authenticated` · MÉDIO · CORRIGIDO

**O que é.**
- `authenticated` tinha `INSERT/UPDATE/DELETE/TRUNCATE` na tabela desde a 002.
- Só a ausência de política barrava a escrita.
- A 055 fez dela o lugar do nível contratado.

**Como apareceu:** a verificação (c) da própria 055 recusou a migration no primeiro apply.

**Correção:** a escrita foi revogada, com a leitura mantida. Os escritores legítimos (`enforce_seat_limit` e o servidor) não são `authenticated`.

### 🟡 F05 — A 037 migrava o `owner` de conta com outros membros · BAIXO · CORRIGIDO POR CONSTRUÇÃO

**O que é.**
- `resgatar_convite` só conferia que o chamador era dono da conta de origem e que ela não tinha dado de domínio.
- Não conferia se a conta tinha **outros membros**.
- Nesse caso, migrava o perfil e fazia `DELETE FROM public.accounts`, levando os perfis dos outros em cascata.

**Honestidade de método:** achado de **leitura**, não reproduzido. A função foi substituída na mesma migration que o descobriu. A 056 passou a exigir conta **solitária** para migrar.

### ⚪ F06 — Edge Functions resolviam a conta com `service_role` · PROCESSO · CORRIGIDO

**O que é.**
- `ia-configurar`, `ia-responder`, `whatsapp-configurar` e `whatsapp-enviar` liam `profiles` por `user_id` com `.maybeSingle()`.
- Com dois perfis, a leitura dá erro e a função devolve 403: falha fechada, não vazamento.
- O `service_role` não carrega o `session_id` da escolha, então nenhum filtro dentro da função resolveria certo.

**Correção:** as funções chamam `rpc('active_membership')` com o JWT do chamador.

**Implantação:** as quatro estão implantadas **no projeto de teste**. A suíte 24 chama as quatro:
- com clínica ativa, passam da checagem de perfil;
- sem clínica, recebem 403.

A versão antiga devolveria 403 nos dois casos.

### ⚪ F07 — Varredura que pula tabela ilegível dá verde sem varrer · PROCESSO · CORRIGIDO

**O que é:** a primeira versão do teste do vetor obrigatório juntava as tabelas com `42501` numa lista que nenhuma asserção lia.

**Correção.**
- A lista precisa vir vazia, com uma exceção nomeada: `public.active_accounts`, que não tem privilégio nenhum por desenho.
- A varredura exige mais de 80 tabelas lidas.

### ⚪ F08 — Três funções em produção com comentários podados por transcrição antiga · PROCESSO · CORRIGIDO

**O que é:** antes de sobrescrever as 35 funções que a 054–056 tocam, a definição de produção foi comparada com a do repositório.
- **32 idênticas.**
- **3 diferentes** (`listar_execucoes_pendentes`, `listar_jobs_agendados` e `criar_convite`), só por comentário podado. Com comentário e espaço normalizados, o hash é igual nos dois bancos, então a lógica é a mesma.

**Correção:** a 056 devolveu a produção o texto do repositório. É a recorrência da lição da 03.8.a.

---

## 4. A trava de nível — o que foi provado

**O mecanismo.**
- **Tabelas:**
  - `licensing.tiers`, com os níveis `bronze`, `prata`, `ouro` e `diamante`;
  - `licensing.tier_modules`, a matriz nível × módulo;
  - `licensing.account_limits.tier_key`;
  - `licensing.tier_changes`, com o rastro de troca.
- **A pergunta única:** `licensing.module_enabled(conta, módulo)`, consultada **antes** do atalho de `owner`:
  - em `access.can()`;
  - em `aba_health.pode_acessar()`, que tem o próprio atalho e não passa por `access.can`.

**Como nasce:** os quatro níveis liberam **todos** os módulos, e toda conta começa em `diamante`. A matriz é decisão comercial de Max; nada foi tirado de ninguém.

**Recusas de desenho:**
- o módulo de núcleo (`settings`) não se corta, com `23514`;
- um par nível × módulo sem linha **nega**, guardado por `modulos_sem_linha_de_nivel()`.

**Provado na suíte 24,** num nível de teste com `people`, `health` e `treatment` cortados, contra o **`owner`** da conta:
- `access.can('people','read')` retorna `false`, e o menu (`readable_modules`) não mostra `people` nem `health`;
- `SELECT` em `clientes` volta vazio;
- `pode_acessar(paciente,'leitura')` retorna `false`;
- `ler_evolucoes` e `ler_planos` voltam vazios;
- a mesma pessoa, ativa em outra clínica em `diamante`, continua vendo `people`: o nível é o da conta **ativa**;
- o `owner` não troca o próprio nível nem mexe na matriz.

---

## 5. As guardas permanentes (057)

Seguem o molde do F01-b da 02.15: função de auditoria por catálogo e teste que falha se ela devolver linha. A lista de schemas **não é cravada**, e sim derivada do catálogo — a lição da guarda que nasceu cega para `aba_treatment`.

| Guarda | Pergunta |
|---|---|
| `politicas_sem_cerca_de_conta()` | Alguma política de tabela com `account_id` deixa de comparar a linha com a conta ativa? |
| `funcoes_sem_conta_ativa()` | Alguma função lê `profiles` pelo usuário do chamador sem `active_account_id()`? |
| `atalhos_de_owner_sem_nivel()` | Algum "owner → TRUE" aparece antes da trava de nível? |
| `modulos_sem_linha_de_nivel()` | Algum módulo está sem linha em algum nível? |

Na primeira aplicação, a `funcoes_sem_conta_ativa` já apontou duas funções que a lista manual não tinha: `assinar_contrato_como_profissional` e `guardar_aprovacao_orcamento`. Nas duas o perfil é ligado pelo id a um profissional já cercado pela conta, então eram seguras. Receberam o filtro mesmo assim, para a guarda não precisar de exceção que a próxima cópia herdaria.

---

## 6. Evidências

| Onde | O quê | Resultado |
|---|---|---|
| Banco de TESTES | as quatro migrations, cada uma com as próprias verificações | aplicadas |
| Suíte 24 | multiunidade, nível, Edge Functions e guardas | **35/35** |
| Suíte inteira | 25 arquivos | **362 verdes + 1 declarado** (A06) |
| Produção (MCP) | 054, 055, 056 (em 4 partes), 057, transcritas com os comentários | todas as verificações de pé |
| Produção × teste | hash normalizado (`chr(13)` removido), [tabela abaixo](#hashes) | **idênticos** |
| Produção | `crm/scripts/evidencia_multiunidade.mjs`, com sessões reais | **29/29**, resíduo zero conferido no catálogo |
| Produção | `get_advisors` | 5 avisos novos, todos esperados pelo desenho |
| Tela | `tsc` + `npm run build` | verdes; precache 1.241,7 KiB (teto 1.400) |

<a id="hashes"></a>**Hashes normalizados, idênticos em produção e teste:**

| Grupo | Itens | Hash |
|---|---|---|
| Funções | 42 | `ae9d2a98…` |
| Políticas | 12 | `0ba02e35…` |
| Restrições | 23 | `e2f4f099…` |
| Colunas | 31 | `67ec797a…` |
| Privilégios | 6 | `1c9fbcb8…` |
| Índices | 15 | `0501eaa3…` |

**Os 5 avisos novos do `get_advisors`:**
- `public.active_accounts` tem RLS e nenhuma política. É proposital: ninguém lê nem escreve direto nela, e a 054 (c) recusa política ou privilégio.
- `active_account_id`, `active_membership`, `my_accounts` e `set_active_account` são executáveis por `authenticated`. É a função delas: exigem sessão, conferem o vínculo, e nenhuma é executável por `anon`.

**A evidência de produção cobre:**
- sem escolha, nada;
- o seletor mostra as duas clínicas com o papel de cada uma;
- ativa na demonstração como `agent`, não herda o `owner` da clínica própria e não lê a evolução dela;
- ativa na própria clínica como `owner`, lê a própria evolução e nada da demonstração;
- a escolha vale por sessão;
- quem tem uma clínica só (dona e recepção reais) não percebe mudança, **inclusive lendo o próprio perfil por `user_id`, como faz a tela hoje publicada**;
- os formulários ficaram cercados;
- a gestão de membro não atravessa clínica;
- a sessão da clínica de onde a pessoa saiu fica sem clínica;
- as guardas estão em zero e não são executáveis por sessão de conta.

---

## 7. Ressalvas, declaradas

1. **A tela e as quatro Edge Functions não estão em produção.**
   - Acompanham o merge, pelo precedente da 02.15.
   - O banco novo é compatível com o que está publicado para quem tem uma clínica só, que hoje são todos: 11 perfis e 11 usuários.
   - **Risco até o deploy:** quem aceitar um convite tendo clínica própria com dado passa a ter dois perfis, e a tela antiga não o deixa entrar. É falha fechada.
2. **Evidência de tela não coletada**, conforme a dispensa de Max, "salvo essencial". O login em dois estágios e a troca de clínica estão cobertos por `tsc`, pelo build e pelo banco. **Recomendo** uma passada no navegador depois do deploy, antes de oferecer a multiunidade a um cliente.
3. **O custo por linha não foi medido.** `is_account_member` agora faz duas consultas indexadas a mais (`active_accounts` e `profiles`). A suíte não ficou perceptivelmente mais lenta, mas não houve `EXPLAIN` sob carga.
4. **F05 é achado de leitura**, não reproduzido.
5. **Fora do escopo, e registrado:**
   - rede (grupo de clínicas);
   - a tela de "criar nova clínica";
   - a matriz Bronze/Prata/Ouro/Diamante;
   - D-F18 (o adendo nasce assinado por quem o escreveu).

---

## 8. Parecer

**Recomendo trazer o bench `bench/03.9-multiunidade-trava-de-nivel` para `etapa-03/plano-mvp-odontologico`, com as ressalvas acima.**

- O vetor obrigatório foi medido acontecendo e depois medido fechado, no banco de testes e em produção.
- A trava de nível está provada contra o `owner`, que é o caso em que a implementação ingênua erra.
- Os dois graves e os dois médios estão fechados.
- Quatro guardas por catálogo impedem que a próxima função ou política reabra as mesmas portas.

**O merge deve vir junto com a publicação da tela e das quatro Edge Functions em produção**, porque é esse passo que tira a 03.9 de `⚠️ PENDENTE`.

O CODE entregou o parecer e parou. **Ordenar o merge é atribuição exclusiva de Max** (`CLAUDE.md` §13).
