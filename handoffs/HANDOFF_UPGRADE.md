# HANDOFF_UPGRADE — CRM Vitrine

Ponte da Etapa 02 (construção do MVP) para a Etapa 03 (upgrades e versionamentos).
Toda afirmação aqui é rastreável ao Status da subetapa correspondente em `docs/00_PLANO_E_CRITERIOS.md`.

## Estado atual

**MVP v01 no ar.** `main` = `1b66b08`, 58 commits, alinhada ao projeto Supabase de produção (`uitwttyyppxvcgfdhnlz`) — sem divergência pendente entre repositório e banco.

- **Produção:** https://vitrine.strategicepiphany.com — build estático servido por FTP na Hostgator, PWA, com fallback de SPA (`crm/public/.htaccess`). Deploy por `crm/scripts/deploy_ftp.mjs` (02.13.a).
- **Banco:** 12 schemas, 80 tabelas, 39 arquivos de migration, 5 jobs de `pg_cron` ativos, 5 Edge Functions.
- **Suíte de segurança:** 19 arquivos, **186 casos** — 185 verdes + 1 declarado como não exercido (ver "Meta congelada" abaixo). Roda em **banco separado** (ver "Ambientes").
- **Portão de saída da Etapa 02: verde.** Portão adversarial executado (02.15), varredura de segredos zerada (02.14), `typecheck` limpo, `gitleaks` `no leaks found`.

## O que está funcional (v01)

**Núcleo e acesso**
- Conta/identidade (`public`), RBAC hierárquico de 4 papéis e permissão fina por módulo (`access`), teto de assentos (`licensing`). RLS ativa e testada em toda tabela de todo schema.
- **Equipe completa** (02.2): convite com token de 256 bits, aceite que migra o perfil, nascimento automático de funcionário, atributo profissional (só `agent`), troca de papel, transferência de titularidade e remoção de membro.

**Os nove módulos, com UI** — 16 rotas reais (`crm/src/app/router.tsx`)
| Módulo | Tela | Subetapa |
|---|---|---|
| Dashboard | `/` | 02.12 |
| Pessoas (`aba_people`) | `/pessoas`, `/pessoas/:id` | 02.3 |
| Agenda (`aba_scheduling`) | `/agenda` | 02.6 |
| Vendas (`aba_sales`) | `/vendas` | 02.4 |
| Financeiro (`aba_finance`) | `/financeiro` | 02.8 |
| Prontuário (`aba_health`) | `/prontuario`, `/prontuario/:clienteId`, `/prontuario/mapas` | 02.9 |
| Catálogo (`aba_catalog`) | `/catalogo` | 02.7 |
| Mensagens (`aba_messaging`) | `/mensagens` | 02.5 |
| Automações (`aba_automations`) | `/automacoes` | 02.10 |
| IA (`aba_ai`) | `/ia` | 02.11 |
| Configurações | `/configuracoes` (10 seções) | 02.12 |

**Motor** (02.10): `pg_cron` com 5 jobs ativos — drenagem da fila de automações, disparo de lembretes, expiração de fluxos ociosos, `marcar_faturas_vencidas()` e `expirar_planos()`. Painel do agendador visível a `admin+` dentro do produto; o schema `cron` **não** é exposto à API.

**IA** (02.11): a conta cola a própria chave; ela é verificada contra o provedor antes de gravar, cifrada em AES-256-GCM e nunca devolvida. Três provedores (OpenAI, Anthropic, OpenRouter). Aceite de termo de tratamento de dados é porta: sem ele o formulário não é renderizado. **O agente não lê prontuário, e isso é `CHECK` de banco** — nem o proprietário liga.

**Aparência por conta** (02.12): tema claro/escuro/sistema, densidade, cor de destaque e tipografia gravados no banco — sem rebuild por cliente.

**Demonstração** (02.13.a): conta `[demo] Clínica Vitrine`, 9 módulos populados, 600 atendimentos em 13 semanas, telefones no indicativo `+999` (reservado pela ITU, não roteável).

## Ambientes — leia antes de rodar qualquer coisa

A Subetapa 02.15 separou os bancos. **Isto muda o gesto do dia a dia:**

| | Produção | Testes |
|---|---|---|
| Projeto | `uitwttyyppxvcgfdhnlz` | `dxvcdqqolkoiepakiiqo` (`CRM Vitrine — TESTES`) |
| Serve | a vitrine pública | a suíte de RLS |
| Custo | — | US$ 0/mês |
| Variáveis no `.env` | `SUPABASE__URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_TEST__URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_ROLE_KEY`, `SUPABASE_TEST_DB_URL` |

`crm/tests/rls/ambiente.ts` **para a execução** se as variáveis de teste faltarem, e para também se a URL de teste for igual à de produção. É erro, não aviso, de propósito — *fallback* silencioso para produção seria pior que não separar.

**Comandos:**
```bash
cd crm
npm run test:rls        # suíte de segurança (banco de TESTE)
npm run typecheck
npm run build
node scripts/provisionar_banco.mjs    # levanta um banco do zero a partir de db/migrations/
node scripts/seed_test_users.mjs      # fixture dos 4 papéis
```

`provisionar_banco.mjs` (02.15) reconstrói o schema inteiro a partir do repositório — provado com as 39 migrations num banco vazio. É a base natural da CLI de clonagem de CRM-filho quando ela entrar em escopo.

**Capturas de tela para análise de UI/UX** — `node scripts/capturar_telas.mjs` (exige o app em `localhost:3000`). Gera PNG sem perdas de **3360×2100** (1680×1050 @2×) das 16 rotas, no tema claro, autenticado na conta de demonstração por link de acesso (nenhuma senha é digitada nem existe no script). **As imagens NÃO são versionadas:** `screenshots/` é ignorada por regra deliberada (`.gitignore:261`) porque captura de tela pode expor caminho, usuário e dado clínico — decisão de Max, 2026-08-22, de manter a regra como está. Elas vivem na máquina local; quem precisar delas noutra máquina roda o script. Um `screenshots/INDICE.md` é gerado junto, mapeando arquivo → rota → tela.

## Backlog de versionamento herdado

Lista completa e viva em `docs/00_PLANO_E_CRITERIOS.md` → "Backlog de versionamento". Resumo:

- **+0.1 (correções/melhorias):** `HaveIBeenPwned` no Auth (quando houver plano pago); obscurecer painel clínico ao perder foco + travar sessão por inatividade; alarme de queda de sessão com deduplicação; conferência automática do webhook após reconexão.
- **+1.0 (novas funcionalidades):** CLI de clonagem de CRM-filho; múltiplos templates de layout; `pgvector` para busca semântica; Evolution GO como módulo pago; agendamento online pelo cliente; e-mail transacional; produtos e estoque; cobrança Pix/boleto por API; quadros de tarefa; marca d'água de identificação na tela clínica; identidade visual por conta; construtor de papéis; Telegram; login multi-conta.

## Dívidas técnicas / riscos conhecidos

**Meta congelada — a dívida mais visível.** Decisão de Max (2026-08-21): tudo que envolve a configuração da API oficial do WhatsApp fica parado até a habilitação destravar. Consequências herdadas:
- O envio pela Meta **não** foi exercido de ponta a ponta com número real.
- O passo `enviar WhatsApp` das automações é **registrado no log como não executado**, com o motivo (02.10) — o motor é honesto sobre o que não faz.
- O teste A06 (isolamento entre contas no webhook, pelo caminho HTTP) fica **não exercido**: exige `META_APP_SECRET` no projeto de teste. **Não é um *skip* silencioso** — um preflight imprime em tela o motivo e o conserto. O risco que ele guardava passou a ser barrado também pelo banco (migration `035`).
- `whatsapp-configurar` e `whatsapp-enviar` foram auditadas por **leitura**, não por ataque em execução (02.15, §4 do relatório).

**Outras, com gatilho declarado** (detalhe em `docs/00_PLANO_E_CRITERIOS.md` → "Pendências vigiadas"):
- **Modo escuro: cobertura visual fechada** (verificação de Max, 2026-08-22 — avaliou todas as telas, não só as três que registrou por screenshot). O que segue em aberto é outra coisa: a paleta escura é **derivação** da paleta clara ratificada, não uma variante fechada em pacote de design (`docs/04` §5.2 — os wireframes são 100% light). Ratificá-la formalmente é decisão de Max, sem urgência.
- **Busca de conhecimento da IA não faz *stemming*** — "cancelar" não encontra "Cancelamentos". Preço consciente de não prender o produto a um idioma.
- **Arte e vocabulário dos 4 mapas clínicos vivem em código**, não em tabela de módulo — cada conta usa o mesmo vocabulário e ninguém o ajusta sem deploy.
- **Consentimento de imagem trava a exibição, não o envio**, e trava para todos, inclusive quem tirou a foto. Decisão mantida, revisão condicionada à prova de fogo.
- **Teto de usuários é editado direto no banco** — sem trilha de interface.
- **`aba_people.pessoas.contato_id` sem FK** para `aba_messaging.contatos_canal` — deliberado (exportabilidade de módulo), não reintroduzir sem resolver o que ela reabre.
- **Exceção de permissão órfã na conta de teste** (`agent`/`health`/`read`/`false`), a limpar quando a suíte for revista.
- **Proteção contra senha vazada indisponível** no plano gratuito do Supabase.

**Armadilhas que já custaram tempo** estão em `handoffs/instrucoes.md` §5 e §6 — leitura obrigatória de abertura de sessão. As mais caras da Etapa 02:
- A RLS **não** protege a ponta da chave estrangeira; toda chave multi-inquilino tem que ser composta por `account_id`, e há teste de catálogo que falha se a próxima nascer desprotegida.
- `select('*')` quebra em tabela com narrowing de coluna (`42501`, que parece falha de RLS).
- `.gitignore` por palavra solta engole código em silêncio — três ocorrências no projeto.
- Todo segredo do `.env` entre aspas simples; `#` sem aspas trunca o valor sem erro.

## Regras

- Sessões separadas por etapa e por bloco; a ponte é o repositório + este handoff + `handoffs/instrucoes.md`. Nunca carregar contexto de conversa entre sessões.
- Só quebrar o fluxo do MVP se a mudança impactar diretamente o produto.
- Cada subetapa `03.n` é uma unidade de versionamento independente, com critério 100% verde declarado no momento em que abre.
- **Portão adversarial volta a ser exigido** a cada mudança de etapa ou deploy real (`docs/00_PLANO_E_CRITERIOS.md`, pendência vigiada). Aprendizado a levar: o vetor que rendeu na 02.15 não foi nenhum dos previstos, e sim a pergunta que a camada de proteção **não tem como responder**. Começar por aí.
- Merge de bench para `main` é ordem exclusiva de Max (`CLAUDE.md` §13).

## Primeiro passo sugerido da Etapa 03

**Subetapa 03.0 — Leitura de referências e revisão do plano da Etapa 03** `[Plan]` `[LLM: Opus]`, aplicando a convenção `0X.0`: reler este handoff, o backlog e as pendências vigiadas, e confirmar que o item a abrir ainda faz sentido frente ao estado real do produto e do primeiro cliente, se já houver.

**Recomendação de prioridade para logo depois**, por impacto sobre esforço:

1. **Obscurecer painel clínico ao perder o foco + travar sessão por inatividade** (`+0.1`). Defende o risco mais provável e mais mundano de um consultório — a tela deixada aberta — e é barato. `aba_health` é o schema de regime mais restritivo do produto; esta é a lacuna que sobra depois de toda a RLS já feita.
2. **Varredura completa do modo escuro nas 16 telas** (`+0.1`). A dívida está medida e delimitada; fechá-la remove um risco de vitrine, que é onde o produto é vendido.
3. **A 03.1 planejada é Evolution GO como módulo pago** `[Manual]` `[LLM: Opus]` — vale reavaliar na 03.0 se ela continua sendo a primeira, dado que a Meta está congelada e que o mesmo esforço aplicado à mensageria pode render mais em outro canal.
