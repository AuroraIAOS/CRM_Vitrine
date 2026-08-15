# 06_INTEGRACOES_EXTERNAS — CRM Vitrine

> Documento adicional ao conjunto padrão (`docs/[outros].md` em `arvore_de_pastas_modelo.md`) — incluído porque o Maximus já validou o contrato da Meta Cloud API em produção e vale preservar o conhecimento, não porque toda ideia de Max precisa deste arquivo.

## 1. Meta Cloud API (WhatsApp oficial) — v01

- Webhook de entrada: Edge Function recebe `POST`, valida assinatura HMAC-SHA256 com `META_APP_SECRET` antes de processar qualquer payload — requisição não assinada é rejeitada, sem exceção.
- Envio: Edge Function chama a API da Meta usando token da conta (criptografado em repouso).
- Template de mensagem com cabeçalho de imagem exige `META_APP_ID` além do `META_APP_SECRET` (upload resumível, escopado ao app) — opcional no v01, necessário só se o cliente quiser template com imagem.
- Nenhum processo persistente necessário — é webhook + chamada HTTP, cabe inteiramente em Edge Function.

## 2. Evolution GO (WhatsApp self-hosted) — fora do escopo v01, preparado para o futuro

`aba_messaging.provedores_canal` já modela "canal" como conceito abstrato (não amarrado só a Meta) — quando Evolution GO entrar como módulo pago, é registrar um novo provedor no mesmo schema, sem redesenhar `aba_messaging`. A implementação (servidor Go + Postgres próprio + pareamento por QR Code) roda isolada em VPS pequena, desacoplada do app principal, só quando o primeiro cliente pagar por esse canal.

## 3. IA — provedores suportados (bring-your-own-key)

OpenAI e Anthropic no v01 (mesmo par do Maximus). Nenhuma chave global sua — cada conta cola a própria chave em Configurações, criptografada com `ENCRYPTION_KEY` antes de gravar.

## 4. O que NÃO integra no v01

- n8n — automação nativa (`aba_automations`) substitui a dependência externa que o Sindcom ainda usa para alguns fluxos.
- Qualquer webhook de saída não documentado aqui — se surgir necessidade, documentar antes de implementar, não depois.
