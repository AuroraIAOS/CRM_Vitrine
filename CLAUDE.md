# CLAUDE.md — CRM Vitrine

Regras permanentes lidas pelo Claude CODE em toda sessão deste projeto. Não remover nenhum item sem autorização explícita de Max.

## 1. Idioma
- Português/BR em toda comunicação, commit e comentário de código, salvo termos técnicos (nomes de biblioteca, palavra-chave de linguagem, etc.).

## 2. Convenção de nomenclatura no banco (leia `docs/02_MODELO_DE_DADOS.md` §1 antes de criar qualquer tabela)
- Schemas de módulo: prefixo em **inglês** — `aba_people`, `aba_catalog`, `aba_scheduling`, `aba_finance`, `aba_health`, `aba_messaging`, `aba_sales`, `aba_automations`, `aba_ai`.
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
- Marcar conclusão em `docs/00_PLANO_E_CRITERIOS.md`. Sempre que uma ETAPA ou Subetapa for concluída com sucesso (código, testes e — quando aplicável — deploy/verificação em produção), editar `docs/00_PLANO_E_CRITERIOS.md` e acrescentar **"Status: ✅ CONCLUÍDA"** logo após o título da etapa/subetapa correspondente. Isso não é opcional, faz parte do fechamento de qualquer subetapa.

## 9. CHANGELOG
- Toda subetapa que gera mudança relevante para quem usa o produto registra uma linha em `CHANGELOG.md` (`+0.1` correção/melhoria, `+1.0` nova funcionalidade).

## 10. Handoffs/instrucoes.md
- Lido na abertura de toda sessão. Toda solução não trivial vira entrada nova (Gatilho → Ação → Evidência → Fonte) no mesmo commit da correção. 
- Nunca apagar entrada antiga; se obsoleta, marcar `[OBSOLETA — <motivo>]`.

## 11. Search-first
- Antes de escrever código contra Supabase, Meta Cloud API, Evolution GO, Next.js ou qualquer biblioteca externa, confirmar a documentação vigente. Não codificar de memória — a Meta versiona a Graph API com data e descontinua versões antigas, e o Evolution GO tem contrato de webhook próprio, incompatível com o de outras implementações da mesma família.

## 12. Pendências vigiadas
- Conferir a lista completa e viva em `docs/00_PLANO_E_CRITERIOS.md` → seção "Pendências vigiadas".

## 13. Merge nunca é decisão do CODE
- Quando o trabalho acontece em bench/branch de teste isolado do `main` (ex.: o portão de segurança adversarial de `docs/00_PLANO_E_CRITERIOS.md` → "Pendências vigiadas"), o CODE executa, corrige e relata dentro desse bench, mas **nunca** funde (`merge`) o bench de volta ao `main` por conta própria — mesmo com todos os testes 100% verdes e parecer final favorável. O CODE entrega o relatório e o parecer, e para. Ordenar o merge é atribuição exclusiva de Max.

## 14. Porting do CRM Maximus — regra específica deste projeto
- Migrations do CRM Maximus (`db/migrations/README.md` tem o mapa completo) são a fonte de verdade para RLS/RBAC/IBAC — **portar a lógica, traduzir os nomes**, nunca reescrever a lógica de permissão do zero. Se uma tabela do Maximus não está no mapa de `docs/02_MODELO_DE_DADOS.md`, parar e perguntar a Max antes de inventar destino.

## 15. Escopo v01 — não expandir sem aprovação
- Evolution GO, RAG versionado em arquivo, CLI de clonagem automatizada e `HaveIBeenPwned` estão **fora do MVP** (ver `docs/01_ARQUITETURA.md` §5). Se uma subetapa parecer exigir um desses, parar e reportar — não implementar por conta própria.