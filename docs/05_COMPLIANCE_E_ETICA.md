# 05_COMPLIANCE_E_ETICA — CRM Vitrine

## 1. Restrições inegociáveis

- **LGPD / dado clínico (`aba_health`):** prontuário só é lido por profissional com concessão explícita (`concessoes_prontuario`), nunca por qualquer `agent` da conta. Toda leitura de prontuário grava linha em `log_acesso`. Isso não é negociável nem sob pressão de prazo — é a peça de maior risco jurídico do produto.
- **Segredo de conta por cliente:** chave de IA (bring-your-own-key) e credenciais de canal (Meta App Secret) sempre criptografadas em repouso (AES-256-GCM), nunca em texto plano no banco nem em log.
- **Nenhuma credencial no repositório:** `.env` real nunca commitado, sempre gitignorado. Decisão de Max (Subetapa 01.0): o projeto não versiona `.env.example` — o arquivo foi eliminado; nomes de variável ficam documentados em prosa (`docs/01_ARQUITETURA.md`, `handoffs/instrucoes.md`), nunca um arquivo de exemplo com placeholders no repositório.

## 2. Checklist de segurança (quality gate do `/goal`)

- [ ] Senha de Auth: 8+ caracteres, maiúscula + minúscula + número + especial.
- [ ] `HaveIBeenPwned` ativo quando o Supabase estiver em plano premium.
- [ ] RLS ativa em **toda** tabela de todo `aba_<modulo>`, testada com role restrito (prova: `viewer` não escreve, role sem `access.can()` para o módulo não lê).
- [ ] Auth ativo; Super Admin loga; buckets de Storage criados só quando o módulo que os usa existir.
- [ ] Nenhum segredo no histórico do Git (checar antes de cada push, não só no primeiro commit).
- [ ] Webhook da Meta Cloud API valida assinatura HMAC-SHA256 (`META_APP_SECRET`) — nenhuma requisição não assinada é processada.

## 3. Ética de produto

- IA bring-your-own-key: o cliente sabe e consente que está usando sua própria chave/cota — deixar isso explícito na tela de configuração, não escondido em letra miúda.
- Dado de saúde nunca é usado para treinar/alimentar modelo de IA nenhum sem consentimento explícito e separado do consentimento geral de uso do CRM.
- CRM-filho clonado herda todas as restrições deste documento — clonar não é oportunidade de relaxar RLS "porque o cliente pediu para simplificar".

## 4. O que fica para a Etapa 01 decidir

- Política exata de retenção de log de acesso a prontuário (prazo mínimo legal a confirmar por jurisdição do cliente).
- Se `pgvector` (busca semântica de IA) entra no v01 ou fica para `+1.0` — não é restrição de compliance, é decisão de escopo.
