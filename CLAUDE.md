# CLAUDE.md — CRM Vitrine

Regras permanentes lidas pelo Claude CODE em toda sessão deste projeto. Não remover nenhum item sem autorização explícita de Max.

## 1. Idioma
- Português/BR em toda comunicação, commit e comentário de código, salvo termos técnicos (nomes de biblioteca, palavra-chave de linguagem, etc.).

## 2. Convenção de nomenclatura no banco (leia `docs/02_MODELO_DE_DADOS.md` §1 antes de criar qualquer tabela)
- Schemas de módulo: prefixo em **inglês** — `aba_people`, `aba_catalog`, `aba_scheduling`, `aba_finance`, `aba_health`, `aba_messaging`, `aba_sales`, `aba_automations`, `aba_ai`, `aba_treatment`.
- `aba_treatment` (chave de módulo `treatment`, label **"Plano"**) é o décimo schema — acrescentado por decisão de Max de 2026-09-03 (D-I2), com a edição deste arquivo autorizada por ele em 2026-09-04. Nasce na Subetapa 03.8. **[Rótulo revisto DUAS vezes em 2026-09-04, as duas por autorização explícita de Max: a decisão D-V1 trocou "Planos de tratamento" por "Planos", e ao fechar a Subetapa 03.8 ele fixou **"Plano"**, no singular, *"pois optamos por padronizar dessa forma em todo o sistema"* — o singular é a forma dos cinco termos do vocabulário em `docs/02` §13.1. Nenhum registro anterior se apaga.]** **"Plano" e "orçamento" são duas palavras da interface, para duas coisas diferentes:** *plano* é o planejamento clínico (o conjunto de procedimentos a executar naquele paciente), *orçamento* é a vista financeira dele (o preço a pagar pela execução do que foi contratado). A palavra **plano** é exclusiva desse sentido em todo o produto: combo padrão é **pacote**, faixa comercial do CRM é **nível**, e operadora de saúde do paciente é **convênio** (D-V1). Detalhe em `docs/02_MODELO_DE_DADOS.md` §13.
- Dentro de cada schema: tabelas, colunas, funções, triggers, cron — **snake_case em português/BR**.
- Exceção: núcleo herdado (`public.accounts`, `public.profiles`, `public.account_invitations`, `public.api_keys`, `public.webhook_endpoints`, `public.notifications`, `public.member_presence`) e os schemas `access`/`licensing`/`analytics` ficam em inglês, sem prefixo `aba_`.
- Nunca misturar as duas convenções dentro do mesmo schema de módulo.

## 3. Convenção de commit message
- Prefixo obrigatório: `feat:` / `fix:` / `docs:` / `chore:` / `refactor:` / `test:`, seguido de descrição curta em português. Um commit por subetapa concluída + push ao final. Ex.: `feat: criar schema aba_people com tabela-mãe pessoas (subetapa 01.2)`.

## 4. Segredos — nunca negociável
- Nunca commitar credenciais, chaves ou senhas. `.env` e `.env.local` são arquivos reais e gitignorados — nunca aparecem em log, resposta ou commit. 
- Tokens de provedor são gravados **criptografados no banco** com a `ENCRYPTION_KEY`, nunca em texto puro. 
- Chave de IA e credencial de canal (Meta App Secret) sempre criptografadas em repouso — nunca texto plano.
- Revisar `.gitignore` sempre que um serviço novo entrar.

## 5. Segurança 
- Checklist completa em `docs/05_COMPLIANCE_E_ETICA.md`.
- RLS ativa e testada em toda tabela de todo schema, senha forte, varredura de segredos antes de considerar a subetapa concluída.
- O schema `health` tem regime próprio de RLS, mais restritivo — nenhuma exceção nele, por nenhum motivo.
- Nada destrutivo sem aprovação explícita de Max.

## 6. Aviso de etapa/subetapa
- CODE avisa claramente quando cada etapa/subetapa **começa e termina**, informando modo + função + LLM conforme `docs/00_PLANO_E_CRITERIOS.md`.

## 7. Ponte entre estágios
- Repo + HANDOFF (`handoffs/HANDOFF_CODE.md` → `HANDOFF_BUILD.md` → `HANDOFF_UPGRADE.md`) + `handoffs/instrucoes.md`. 
- Sessões separadas por etapa e por bloco — evita contaminação de contexto. Nunca contexto de conversa carregado de uma sessão para outra.

## 8. Registro de conclusão
Marcar o status de conclusão em `docs/00_PLANO_E_CRITERIOS.md` sempre que uma ETAPA ou Subetapa for concluída usando os dizeres e símbolos:

-- "Status: ✅ CONCLUÍDA" (QUANDO = Etapa ou subetapa com código, testes, deploy, verificação em produção etc. forem 100% verdes)
-- "Status: ⏸️ ADIADA" (QUANDO = Etapa ou subetapa pulada por completo e deixada para momento futuro)
-- "Status: ⚠️ PENDENTE" (QUANDO = Etapa ou subetapa com código, testes, deploy, verificação ainda em aberto e sem estar 100% verdes mas sem ser um bloqueio para seguir a diante)
-- "Status: 🛑 ABANDONADA" (QUANDO = Etapa ou subetapa é abandonda por completo - segue registrada para fins de memória, consulta, auditoria e possibilidade de retroagir)

## 9. CHANGELOG
- Toda subetapa que gera mudança relevante para quem usa o produto registra uma linha em `CHANGELOG.md` (`+0.1` correção/melhoria, `+1.0` nova funcionalidade).

## 10. Handoffs/instrucoes.md
- Lido na abertura de toda sessão. Toda solução não trivial vira entrada nova (Gatilho → Ação → Evidência → Fonte) no mesmo commit da correção. 
- Nunca apagar entrada antiga; se obsoleta, marcar `[OBSOLETA — <motivo>]`.

## 11. Search-first
- Antes de escrever código contra Supabase, Meta Cloud API, Evolution GO, Next.js ou qualquer biblioteca externa, confirmar a documentação vigente. Não codificar de memória — a Meta versiona a Graph API com data e descontinua versões antigas, e o Evolution GO tem contrato de webhook próprio, incompatível com o de outras implementações da mesma família.
- **Test-first no diagnóstico: confirmar a hipótese com o teste mais barato disponível ANTES de escrevê-la como causa raiz.** Ler documentação e ler um aviso oficial na tela do fornecedor é levantar hipótese, não é prová-la. Enquanto a hipótese não for confrontada com uma medição, ela é registrada como suspeita — nunca como diagnóstico. Antes de declarar causa raiz, perguntar: *qual é o teste mais barato que distingue esta hipótese das outras, e por que ainda não rodei?* Se existir botão de teste no painel do fornecedor, log a consultar, query a rodar ou requisição a disparar, rode primeiro. **Motivo (custo real, medido):** na Subetapa 02.5, dois sinais fortes e coerentes — o banner oficial da Meta e a documentação dela — apontaram para "app não publicado não entrega webhook". A conclusão foi escrita nos documentos do projeto e estava **errada**: a causa real era um token de acesso morto, e o teste que derrubou a hipótese (disparar o webhook pelo botão do próprio painel e olhar o log) custava dois minutos e esteve disponível o tempo todo. Diagnóstico errado em documento vivo é pior que nenhum diagnóstico — ele é herdado por sessões futuras como verdade. Ver `handoffs/instrucoes.md` §5.

## 12. Pendências vigiadas
- Conferir a lista completa e viva em `docs/00_PLANO_E_CRITERIOS.md` → seção "Pendências vigiadas".

## 13. Merge nunca é decisão do CODE
- Quando o trabalho acontece em bench/branch de teste isolado do `main` (ex.: o portão de segurança adversarial de `docs/00_PLANO_E_CRITERIOS.md` → "Pendências vigiadas"), o CODE executa, corrige e relata dentro desse bench, mas **nunca** funde (`merge`) o bench de volta ao `main` por conta própria — mesmo com todos os testes 100% verdes e parecer final favorável. O CODE entrega o relatório e o parecer, e para. Ordenar o merge é atribuição exclusiva de Max.

## 14. Porting do CRM Maximus e do CRM Sindcom — regra específica deste projeto
- Migrations do CRM Maximus (`db/migrations/README.md` tem o mapa completo) são a fonte de verdade para RLS/RBAC/IBAC — **portar a lógica, traduzir os nomes**, nunca reescrever a lógica de permissão do zero. Se uma tabela do Maximus não está no mapa de `docs/02_MODELO_DE_DADOS.md`, parar e perguntar a Max antes de inventar destino.
- **O CRM Sindcom (`AuroraIAOS/CRM-Sindcom`) é fonte de porte com o mesmo estatuto**, para o domínio que ele resolveu e o Maximus não: **comunicação externa por token** — `sql/20_comunicacao_externa.sql` (a concessão: `token`, `token_expira_em`, `token_revogado_em`, carimbos de envio) e `sql/21_remessas_recepcao.sql` (a caixa de entrada com máquina de estados, o bucket privado e o freio com motivo enumerado). Mesma regra: **portar a lógica, traduzir os nomes**, nunca reescrever do zero. As lições de falha estão nos comentários do próprio SQL de lá — em especial as três que já custaram tempo naquele projeto: o freio conta por token e nunca pela entidade; `file_size_limit` e `allowed_mime_types` no Storage como segunda camada independente da Edge Function; e policy ausente em `storage.objects` não nega, faz o arquivo sumir com `"Object not found"`. Se uma peça do Sindcom não tem destino claro em `docs/02_MODELO_DE_DADOS.md`, vale o mesmo: parar e perguntar a Max. *(Autorizado por Max em 2026-09-03, a pedido da diretriz P4 do benchmark; o Sindcom já era referência legítima de build/deploy desde a Subetapa 01.0 — o que muda aqui é o estatuto de fonte de porte de lógica.)*

## 15. Escopo v01 — não expandir sem aprovação
- Evolution GO, RAG versionado em arquivo, CLI de clonagem automatizada e `HaveIBeenPwned` estão **fora do MVP** (ver `docs/01_ARQUITETURA.md` §5). Se uma subetapa parecer exigir um desses, parar e reportar — não implementar por conta própria.