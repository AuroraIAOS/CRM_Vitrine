# 03_AGENTES_E_SKILLS — CRM Vitrine

## 1. Fronteira: não há agentes como processo separado no v01

`aba_automations` e `aba_ai` não implicam agente rodando fora do app — são chamadas síncronas a partir da própria aplicação (Edge Function → LLM da conta) ou reação a evento no banco (`pg_cron`, trigger). Não há orquestrador externo, não há fila de mensagens, não há worker persistente. Isso é decisão de arquitetura, não simplificação temporária: qualquer coisa que exigisse processo persistente cairia no mesmo problema de custo/complexidade que tirou o Maximus da VPS.

## 2. `aba_automations` — o que é

Motor de automação **reativo**, guiado por gatilho (evento no CRM: lead criado, oportunidade movida de etapa, fatura vencida) → sequência de etapas (`automacao_etapas`): enviar mensagem, criar tarefa, esperar N dias, ramificar por condição. "Esperar" é drenado por `pg_cron`, não por servidor externo.

| Item | Detalhe |
|---|---|
| Função | Sonnet — desenho de etapa é raciocínio moderado, não complexo. |
| Onde roda | Edge Function disparada por trigger de banco ou por `pg_cron`. |
| Fronteira com "IA" | Automação segue regra fixa (se X então Y). Se a decisão depende de entender linguagem natural (ex.: classificar sentimento da mensagem), isso é `aba_ai`, não `aba_automations`. |

## 3. `aba_ai` — o que é

Assistente de IA por conta, *bring-your-own-key*. Dois usos previstos no v01:

1. **Resposta sugerida/automática em conversa** — lê mensagens recentes (`aba_messaging.mensagens`), gera rascunho ou resposta automática via chave do cliente.
2. **Busca em base de conhecimento** — `aba_ai.ia_documentos_conhecimento` + `ia_trechos_conhecimento`, busca textual por padrão (Postgres full-text), semântica opcional via `pgvector` se o cliente quiser.

| Item | Detalhe |
|---|---|
| Função | Sonnet para geração de resposta; nenhuma tarefa aqui justifica Opus no v01. |
| Custo | Zero para você — cada conta paga sua própria chave. |
| Timeout/limite de contexto | Configurável por conta (`ia_configuracoes`), mesmo padrão de variáveis do Maximus (`AI_REQUEST_TIMEOUT_MS`, `AI_CONTEXT_MESSAGE_LIMIT`). |

## 4. Skills do Claude CODE neste projeto

Nenhuma skill dedicada nova é necessária para a Etapa 01/02 — `CLAUDE.md` + `docs/00_PLANO_E_CRITERIOS.md` bastam para guiar os loops `/goal`. Se um padrão se repetir entre CRMs-filhos (ex.: "como adaptar a paleta de cores por cliente"), promover a uma skill própria é decisão de Etapa 03, não de agora.
