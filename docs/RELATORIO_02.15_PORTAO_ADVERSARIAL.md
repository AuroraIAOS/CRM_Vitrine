# RELATÓRIO — Subetapa 02.15, Portão de segurança adversarial da Etapa 02

**Data:** 2026-08-20/21 · **Bench:** `bench/02.15-seguranca-adversarial` · **Base:** `main` em `30b8864`
**Escopo atacado:** superfície aplicada nas Subetapas 02.1–02.14 — 12 migrations novas (`023`–`034`), 16 rotas de UI, fluxo de convite/aceite, motor de `pg_cron`, matriz de permissões, preferências de conta, 4 Edge Functions novas e o subdomínio público.
**Modo:** auditoria adversarial, sem teto de tentativas · **LLM:** Opus do início ao fim.

---

## 1. Resumo executivo

A Etapa 02 chegou a esta subetapa com 172 testes verdes, varredura de segredos zerada e o portão da 01.8 já cumprido uma vez. **Mesmo assim, o ataque deliberado encontrou uma falha real e explorável que atravessa 9 schemas** — e ela não estava em lugar nenhum que a suíte anterior pudesse alcançar, porque não é uma falha de RLS: é uma pergunta que a RLS, por especificação do PostgreSQL, nunca é chamada a responder.

| | |
|---|---|
| Casos adversariais novos e permanentes | **14** (2 arquivos: isolamento por chave estrangeira e Edge Functions) |
| Varredura de XSS armazenado | 8 payloads · 5 vetores · 5 telas reais |
| Achados | **5** — 1 grave, 1 médio, 1 baixo, 2 de processo |
| Corrigidos e provados (vermelho antes / verde depois) | **5 de 5** |
| Migrations de correção | `035`–`039` |
| Suíte final | **19 arquivos · 185 verdes + 1 declarado**, duas execuções consecutivas (era 172) |
| Regressões introduzidas pela correção e pegas pela suíte | **2** — ambas corrigidas antes de sair do bench |

**Onde a falha estava — e vale mais que a contagem.** A Etapa 01 concentrou o esforço na RLS de tabela; a 01.8 mostrou que as falhas moram nas costuras entre camadas. Esta subetapa encontrou uma costura que nenhuma das duas tinha olhado: **a ponta da chave estrangeira**. A RLS responde *"esta linha é sua?"*. Ela nunca é consultada em *"a linha que você está apontando é sua?"*.

---

## 2. Achados

### 🔴 F01 — Escrita entre contas por chave estrangeira · **GRAVE · CORRIGIDO**

**O que é.** Um usuário da conta A inseria uma linha **sua** (`account_id = A`, portanto aceita pela RLS) apontando para uma linha da conta B.

**Por que a RLS não fecha, e nenhuma policy fecharia.** Documentação do PostgreSQL, *Row Security Policies*:

> *"Referential integrity checks, such as unique or primary key constraints and foreign key references, **always bypass row security** to ensure that data integrity is maintained."*

A verificação de chave estrangeira roda como dona da tabela. Não há política que a intercepte.

**Medido ao vivo, antes da correção:**

| Ataque | Resultado |
|---|---|
| `aba_finance.pagamentos(A)` → fatura de B | **INSERIU** |
| `aba_people.pessoa_notas(A)` → pessoa de B | **INSERIU** |
| `aba_sales.oportunidades(A)` → funil/pessoa de B | **INSERIU** |
| *controle:* escrever com `account_id = B` | barrado `42501` — a RLS funcionava; o furo era ao lado dela |

**Alcance:** varredura de catálogo encontrou **73 chaves** na mesma condição, em 9 schemas.

**O pior caso não era o mais óbvio.** `aba_finance.marcar_faturas_vencidas()` — job de `pg_cron` — soma pagamentos por `fatura_id` **sem `account_id`**. Um estranho impedia a fatura de outra conta de vencer, e o sintoma é um número errado sem erro nenhum. É a mesma categoria de defeito que a Subetapa 02.12 já pagou uma vez.

**`aba_health` resistiu.** `evolucoes` e `respostas_anamnese` recusaram com `42501`: o regime mais restritivo do schema clínico cobre o buraco que os outros módulos deixavam aberto. É a melhor notícia da auditoria e um argumento medido a favor de regime diferenciado por sensibilidade.

**Passivo existente: zero.** As 73 chaves foram varridas procurando linha já cruzada antes de qualquer correção — **nenhuma**. A falha nunca foi explorada neste banco, então não houve incidente a tratar e o `VALIDATE` passou sem limpeza. Essa medição era obrigatória: resultado diferente de zero teria sido incidente, não erro de migration.

**Correção (`035`).** Toda chave entre tabelas multi-inquilino passou a ser composta: `(x_id, account_id)` referenciando `UNIQUE (id, account_id)` na tabela-pai. **Nenhuma coluna nova, nenhuma chave primária alterada** — as duas colunas já existiam e a PK continua sendo `id` sozinha, então nenhuma consulta do app mudou. O banco deixou de perguntar *"esse cliente existe?"* e passou a perguntar *"esse cliente existe nesta conta?"*.

Dirigida por catálogo, não por lista escrita à mão — mesmo padrão da `005`. Uma lista manual erra por omissão exatamente onde dói: a chave que ninguém lembrou é a que fica aberta.

**Detalhe que quase quebrou produção:** 21 das 73 usavam `ON DELETE SET NULL`. Alargar a chave sem cuidado faria o Postgres anular **também** o `account_id`, que é `NOT NULL` — e toda exclusão de pai passaria a falhar. O PostgreSQL 15+ aceita `ON DELETE SET NULL (coluna)`; rodamos 17.6.

**Aplicação sem parar o site:** `NOT VALID` (pula a varredura) seguido de `VALIDATE` (não bloqueia escrita concorrente).

**Estado final:** 0 chaves vulneráveis · 73 protegidas · 25 `UNIQUE` criadas · 0 pendentes de validação. O mesmo ataque, palavra por palavra, passou a bater em `23503`, com controle positivo provando que a escrita legítima dentro da própria conta continua funcionando.

**Guarda permanente (`039` + `17_adversarial_isolamento_fk`).** A correção vale para as 73 de hoje; a **74ª**, escrita na Etapa 03 ou na primeira clonagem de CRM-filho, recriaria a classe inteira com sintoma **zero** — nada falha, nada avisa. Uma função de auditoria restrita a `service_role` consulta o catálogo, e um teste da suíte falha se ela devolver qualquer linha.

#### Duas regressões que a correção introduziu — e que a suíte pegou

**R01 — nenhum convite seria aceito em produção.** `public.profiles` é a única tabela cujo `account_id` muda de propósito: no aceite de convite e na remoção de membro o perfil **migra** de conta. Com a chave composta, mover o perfil passou a ser recusado com `23503`, porque o `funcionario` nascido junto ainda apontava para o par antigo. Três testes ficaram vermelhos na primeira execução após a `035`.

**R02 — o erro de método, que vale registrar.** Corrigi primeiro **a função** (`resgatar_convite`, migration `037`). O teste seguinte mostrou o mesmo `23503` em `remove_account_member`. Só então ficou claro que o problema nunca foi da função, e sim de **qualquer caminho que mova um perfil** — inclusive os que ainda não existem. A `038` moveu a regra para um gatilho `BEFORE UPDATE OF account_id`; a criação do funcionário na conta nova continua `AFTER`, e tem que continuar, porque referencia um par que só existe depois da atualização. **Desvincular antes, criar depois.**

### 🟠 F02 — Convite sem teto de validade · **MÉDIO · CORRIGIDO**

`criar_convite` aplicava `greatest(p_dias_validade, 1)` — piso de 1 dia e **nenhum teto**. Um `admin` podia emitir convite com 36500 dias. Não é escalada de privilégio (quem chama já podia convidar): é **persistência** — o link vira porta permanente para dentro da conta se vazar por e-mail encaminhado, print ou caixa de entrada comprometida, e ninguém revoga o que não sabe que existe.

A orientação da OWASP para credencial desse tipo é curta e de uso único. O convite deste projeto **já** é de uso único e **já** expira; faltava o teto. Corrigido na `036` com `least(greatest(p_dias_validade,1), 7)` — decisão de Max: 7 dias. Prazo menor segue permitido.

### 🟡 F03 — Verificação de configuração antes da autenticação · **BAIXO · CORRIGIDO**

`ia-configurar` e `ia-responder` verificavam `ENCRYPTION_KEY` **antes** de exigir sessão. Um chamador sem autenticação nenhuma descobria que o servidor estava mal configurado — e o nome exato da variável que falta.

Não vaza a chave, e em ambiente configurado o ramo nunca dispara. Ainda assim: estado interno não se conta a quem ainda não provou quem é. Corrigido movendo a verificação para depois da resolução de papel.

O achado tem uma forma interessante: **as duas funções de WhatsApp já autenticavam primeiro**. Não é um padrão que ninguém aplicou — é um padrão bom que **regrediu** no código mais novo. É o inverso do achado A03–A07 da 01.8, e sugere que a varredura de consistência entre funções vale tanto quanto a varredura de catálogo no banco.

### ⚪ F04 — A suíte de testes rodava dentro do banco de produção · **PROCESSO · CORRIGIDO**

A varredura de contas encontrou **8 contas de teste vivas em produção**; ao fim da sessão eram **12**, porque quatro nasceram das execuções da própria auditoria.

O entulho era inofensivo. O que ele revelava não era: a suíte batia no **mesmo projeto Supabase que serve a vitrine pública**. Todo `createThrowawayUser`, todo ataque adversarial e todo `DELETE` de fixture aconteciam ao lado do dado real. Enquanto isso fosse verdade, **todo portão de segurança futuro atacaria produção**, e a Etapa 03 herdaria o arranjo.

Corrigido (decisão de Max, assumindo estouro de escopo): projeto `CRM Vitrine — TESTES`, mesma região, US$ 0/mês. As 39 migrations foram aplicadas **do zero** — o que prova, de brinde, que o repositório sozinho reconstrói o schema, sem nenhuma migration vivendo só em produção. Paridade conferida objeto a objeto: 80 tabelas, 259 policies, 58 triggers, 191 chaves, idênticas. A única função a menos é `public.rls_auto_enable`, que é de plataforma do Supabase e não nossa.

**A decisão de desenho que importa: erro, não aviso.** `crm/tests/rls/ambiente.ts` **para a execução** se as variáveis de teste faltarem, e para também se a URL de teste for igual à de produção. Fazer a suíte "preferir" o teste e cair para produção seria pior que não separar: no dia em que a variável sumisse — máquina nova, `.env` recriado, CRM-filho clonado — a suíte voltaria a produção em silêncio, verde, sem ninguém notar.

**Furo no próprio guarda, encontrado e fechado:** cinco specs liam `process.env.SUPABASE__URL` direto, criando usuário no banco de teste e autenticando contra produção. Nove testes vermelhos que pareciam falha de Auth.

### ⚪ F05 — Entulho de fixture em produção · **PROCESSO · CORRIGIDO**

12 contas e 12 usuários de teste removidos de produção, que ficou com exatamente duas contas: a fixture compartilhada e a de demonstração. Sintoma de F04, tratado junto.

---

## 3. Barrado — os controles positivos

Um relatório que só lista o que falhou não diz se o ataque foi fundo. Estes rodaram e **não** passaram:

| Vetor | Resultado |
|---|---|
| Credencial legível pela API | 8 colunas de segredo negadas a `authenticated` e `anon`; o hardening da 01.8 resistiu e a Etapa 02 não abriu nenhuma nova |
| Sequestro de `search_path` | impossível — nenhum papel além de `postgres` cria objeto em schema nenhum |
| `cron` pelo navegador | sem `USAGE` para `authenticated` — confirma o que a 02.10 afirmou |
| Convite: token adivinhado | 256 bits de `gen_random_bytes(32)` — força bruta fora de cogitação |
| Convite: reuso | `FOR UPDATE` serializa; a segunda tentativa vê `accepted_at` |
| Convite: escalada de papel no aceite | papel vem da linha do convite; `owner` recusado na criação |
| `agent` se autoconceder permissão | `42501` |
| `viewer` reescrever a matriz de permissões | RLS não alcança a linha |
| `agent` mudar aparência da conta | RLS não alcança a linha |
| IA ler prontuário | `CHECK (pode_ler_prontuario = false)` — absoluto, recusa até com privilégio total |
| Escrita clínica entre contas | `42501` pelo regime de `aba_health` |
| XSS armazenado (5 vetores, 5 telas) | nada executou, nada injetado no DOM, payload aparece como texto literal |
| Edge Functions de IA: `account_id` forjado no corpo | ignorado — a conta vem do perfil de quem chama |
| Edge Functions de IA: chamada sem sessão, `viewer`, `agent` | recusadas |
| Resposta de erro devolvendo credencial | nenhuma |

**Sobre o XSS.** O banco guardar o payload literal é **correto** — ele é repositório de dado, não de HTML, e escapar na gravação corromperia o dado. A defesa é da camada de renderização, e por isso só podia ser provada abrindo as telas. Nenhum payload usou `alert()`: diálogo modal trava a automação do navegador e derrubaria a sessão de auditoria.

---

## 4. Não coberto nesta execução

**Honestidade sobre o alcance importa mais que uma tabela toda verde.**

| O que | Por quê | Como cobrir |
|---|---|---|
| A06 — isolamento no webhook, pelo caminho HTTP | decisão de Max (2026-08-21) de congelar tudo que envolve a Meta; o teste exige `META_APP_SECRET` no projeto de teste | definir o segredo em Edge Functions > Secrets e reexecutar |
| `whatsapp-configurar` e `whatsapp-enviar` — ataque em execução | mesma decisão | auditadas por **leitura**: ambas autenticam antes de tudo, exigem `owner`/`admin` (e `agent` no envio) e derivam `account_id` do perfil |

O caso do webhook **não** é um *skip* silencioso: um preflight detecta a configuração ausente e imprime em tela o motivo, a frase *"isto não é um teste passando — é um ataque que não rodou"* e o conserto exato.

Vale registrar o que **não** se perde: o risco que aquele caso guarda — um evento destinado a uma conta alterando linha de outra — passou a ser barrado **também pelo banco** na `035`, e `17_adversarial_isolamento_fk` prova que nem `service_role`, que é justamente o papel com que o webhook roda, atravessa a fronteira. O que fica sem exercício é o caminho HTTP ponta a ponta.

---

## 5. Um quase-erro meu, registrado de propósito

A tela de Pessoas **travou o renderizador** durante a varredura de XSS, e remover os payloads a fez voltar. Havia correlação e havia controle. Eu estava a um passo de escrever "negação de serviço por dado hostil" como achado.

A bissecção — um payload de cada vez — mostrou que **nenhum** deles trava. A causa era minha: um `await` de 2,5 s injetado por mim estourou o tempo do CDP e travou o processo de renderização; como o Chrome compartilha esse processo entre abas do mesmo domínio, a "aba nova" que usei para confirmar herdou o travamento e fabricou a reprodução.

Fica no relatório com o mesmo peso dos achados reais, porque a lição é de método: **correlação que sobrevive a um teste de controle ainda pode ser causa errada**, quando o controle não isola a variável certa. É a regra §11 do `CLAUDE.md` aparecendo por um ângulo novo.

Do mesmo tipo, e igualmente registrado: na primeira rodada de ataques de chave estrangeira, três recusas foram contadas como "barrado" quando na verdade eram **incidentais** — trigger de anamnese completa, expediente do profissional e um `CHECK` de enum, todos disparados por payload inválido meu. Contá-las teria subnotificado a falha. A regra que fica: **ler o SQLSTATE, nunca só o fato de ter falhado.** `23514`/`23502`/`42703` são "seu payload estava errado"; só `42501` e `23503` provam isolamento.

---

## 6. Verificação final

| Verificação | Resultado |
|---|---|
| `npx vitest run tests/rls` | **19 arquivos · 185 verdes + 1 declarado**, em **duas execuções consecutivas sem intervalo** |
| Crescimento da suíte | 172 → 186 casos (14 adversariais novos, nenhum caso antigo enfraquecido ou removido) |
| Cada correção provada | sim — vermelho antes, verde depois, com controle positivo; os ataques ficam como regressão permanente |
| `npm run typecheck` | limpo |
| `get_advisors` (security) | **nenhum achado novo atribuível a esta subetapa** — as 13 entradas são as RPCs expostas de propósito desde a 02.2 e a pendência conhecida do HaveIBeenPwned. A função nova `fks_sem_isolamento_de_conta` **não aparece**, porque `anon`/`authenticated` foram revogados nela |
| `gitleaks detect` | 56 commits, `no leaks found` |
| Integridade da fixture | banco de teste com 1 conta e 4 perfis; **zero** usuário descartável órfão; zero resíduo de payload XSS |
| Produção | 2 contas (fixture compartilhada + demonstração); 12 contas e 12 usuários de teste removidos |

---

## 7. Divergência entre banco e `main` — **RESOLVIDA no fechamento**

> **Atualização de 2026-08-22.** Max ordenou o merge e ele foi executado em seguida, por ordem dele: *fast-forward* de `30b8864` para `71c5827`, **histórico linear preservado, sem merge commit**. A correção F03 foi implantada em produção junto, como o texto abaixo previa. Estado conferido no banco de produção depois do merge: **0 chaves vulneráveis, 144 protegidas, 0 pendentes de validação, as 5 migrations da 02.15 aplicadas e o gatilho da `038` presente**. Vitrine pública revalidada (`/`, `/pessoas`, `/configuracoes`, `/prontuario` em HTTP 200; leitura anônima da API negada com 401). Suíte revalidada no estado fundido: **19 arquivos, 185 verdes + 1 declarado**; `typecheck` limpo. **Não há divergência pendente.** O texto original fica abaixo como registro do que valia durante o bench.

### Registro do que valia durante o bench

As correções `035`–`039` foram aplicadas **no banco de produção durante o bench** (decisão de Max na abertura), para que cada uma fosse provada ao vivo em vez de teórica. Isso abre uma divergência declarada:

> O Supabase de produção tem as migrations `035`–`039` antes de o `main` ter os arquivos correspondentes — eles vivem só no bench `bench/02.15-seguranca-adversarial`.

**Fecha quando Max ordenar o merge.** Enquanto isso, o estado é seguro: o banco está **mais** protegido que o repositório, nunca menos.

**Pendente de implantação em produção:** a correção de ordem das Edge Functions de IA (F03) foi implantada **só no projeto de teste**. Em produção o ramo não dispara, porque `ENCRYPTION_KEY` está configurada lá — a exposição real é nula. Implantar junto com o merge.

---

## 8. Parecer

### ✅ RECOMENDO trazer o bench `bench/02.15-seguranca-adversarial` para o `main`.

**Fundamento:**

1. **A falha grave está fechada por construção, não por vigilância.** A correção é uma restrição do banco, não uma convenção que alguém precise lembrar. Nem `service_role` — o papel mais forte do sistema, com que Edge Function e `pg_cron` rodam — atravessa a fronteira.
2. **A classe está fechada, não o caso.** A migration é dirigida por catálogo e idempotente; o teste de guarda falha se nascer uma chave nova sem `account_id`. A 74ª chave não reabre o buraco em silêncio.
3. **As duas regressões que a correção introduziu foram pegas pela suíte dentro do bench**, antes de chegar perto de produção — e a segunda delas ensinou a corrigir a classe em vez do caso.
4. **Nada foi enfraquecido para chegar ao verde.** A contagem subiu de 172 para 186; nenhum teste foi pulado, desativado ou afrouxado. O único caso não exercido é declarado em voz alta, com motivo e conserto na tela.
5. **O portão passou a rodar fora de produção**, que era condição para a Etapa 03 não herdar o arranjo antigo.
6. **O item obrigatório de XSS foi exercido contra a UI real**, com dois sinais independentes, e não por leitura de código.

**Ressalvas, explícitas:**

- A superfície da Meta (webhook pelo caminho HTTP, `whatsapp-configurar`, `whatsapp-enviar`) **não** foi atacada em execução. Está declarada na §4, com o passo exato para cobrir quando a configuração da API oficial destravar.
- A implantação da correção F03 em produção fica para o momento do merge.

---

## 9. Regra §13 — parada obrigatória, e o desfecho

**O CODE não executou este merge por conta própria.** Nem com todos os testes verdes, nem com parecer favorável. O relatório e o parecer foram entregues e a subetapa parou ali, com `main` intocada em `30b8864` — ordenar o merge é atribuição exclusiva de Max (`CLAUDE.md` §13).

**Max ordenou o merge em 2026-08-22**, e ele foi executado em seguida por ordem dele: `git merge --ff-only`, escolhido de propósito para que a operação **falhasse** caso exigisse merge commit em vez de avanço linear. `main` = `71c5827`, publicada em `origin/main`. O bench `bench/02.15-seguranca-adversarial` fica no remoto como registro auditável.
