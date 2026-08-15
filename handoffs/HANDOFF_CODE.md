# HANDOFF_CODE — CRM Vitrine

Você é o Claude CODE iniciando o ESTÁGIO PRÁTICO deste projeto. Leia com atenção antes de agir.

## Contexto em 3 linhas
CRM modular clonável, para Max vender configurado por cliente. Porta o modelo de dados (RLS/RBAC/IBAC) já validado no CRM Maximus para a stack estática (Vite+Supabase+FTP) já validada no CRM Sindcom — sem VPS, sem Docker, sem Evolution GO no v01. A fatia vertical do MVP é: Pessoas + Vendas + Mensageria (Meta Cloud API) funcionando ponta a ponta e no ar.

## Leitura estratégica obrigatória (nesta ordem)
1. `CLAUDE.md` — regras permanentes e convenções, incluindo a convenção de nomenclatura híbrida (schema em inglês, objetos em português) — não pule isso, é fonte comum de erro neste projeto específico.
2. `handoffs/instrucoes.md` — biblioteca viva de dicas técnicas, padrões herdados e armadilhas já conhecidas dos repositórios de referência. Lida na abertura de toda sessão (regra 10 do `CLAUDE.md`).
3. `docs/00_PLANO_E_CRITERIOS.md` — seu roteiro de etapas/subetapas e critérios 100% verde.
4. `docs/01_ARQUITETURA.md` e `docs/02_MODELO_DE_DADOS.md` — o segundo é o mais denso do pacote, tem a DDL de referência completa de `aba_people` e o mapa de renomeação dos demais módulos.
5. `docs/05_COMPLIANCE_E_ETICA.md` — checklist de segurança, atenção especial a `aba_health`.
6. `docs/06_INTEGRACOES_EXTERNAS.md` — contrato da Meta Cloud API antes de tocar em `aba_messaging`.

## Como trabalhar
- Comece pela ETAPA 01 (Planejamento e Estruturas), [Plan Mode].
- Ao iniciar cada subetapa, informe modo + função + LLM conforme o PLANO_E_CRITERIOS.
- Commit com prefixo padronizado (`feat:`/`fix:`/`docs:`/`chore:`/`refactor:`/`test:`) + push ao fim de cada subetapa.
- Nada destrutivo sem aprovação. Nenhum segredo commitado.
- As migrations reais do CRM Maximus **não estão neste repositório** — Max vai indicar como acessá-las (repo `AuroraIAOS/CRM_Maximus`, migrations 001-077 em `supabase/migrations/`). Use-as como fonte de verdade para a lógica de RLS/RBAC/IBAC ao portar `aba_catalog`, `aba_scheduling`, `aba_finance`, `aba_health`, `aba_messaging` — **traduza os nomes, não reescreva a lógica de permissão do zero**.

## Decisões pendentes a resolver na Etapa 01
- Tradução coluna a coluna de `aba_catalog`/`aba_scheduling`/`aba_finance`/`aba_health`/`aba_messaging` (nomes de tabela já decididos em `docs/02` §7).
- RLS detalhada de `aba_sales`/`aba_automations`/`aba_ai` (padrão definido, política por tabela é execução).
- Ciclo de estados completo de automações/fluxos e faturas/pagamentos — herdar das migrations originais.
- Política de retenção de `log_acesso` (prontuário).

## Primeiro passo concreto
Subetapa 01.0 — Leitura de Referências e Planejamento da Etapa 01: Ler repositórios de referência, construir, rever e atualizar arquivos e; elaborar plano de ação da Etapa 01.