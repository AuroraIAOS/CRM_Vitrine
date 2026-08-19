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
- **Aviso de tratamento por terceiro na tela de IA (implementado na Subetapa 02.11, decisão de Max de 2026-08-19).** A tela `1l` exibe, **antes** dos campos de configuração e também com a chave já conectada, um aviso declarando que: (a) as perguntas e os trechos da base de conhecimento **saem do CRM** e vão para o provedor escolhido; (b) o que ocorre com eles passa a ser regido pela política daquele provedor, que pode mudar a qualquer momento; (c) quem fornece o CRM **não opera** esses serviços e **não pode garantir** guarda, retenção, acesso ou uso para treinamento; (d) a escolha do provedor, e a responsabilidade por ela, é de quem conecta a chave. **Escrito como transparência informada, não como cláusula de isenção** — na cadeia da LGPD quem contrata o CRM é controlador, o fornecedor é operador e o provedor de IA é suboperador, e uma frase de "não me responsabilizo" não desfaz isso sozinha; o que tem efeito é o controlador decidir sabendo. Não substitui revisão jurídica antes do lançamento.
- **A base de conhecimento é o caminho por onde dado sensível sairia do produto — e o único sem trava técnica.** O prontuário está bloqueado para o agente por CHECK no banco (Subetapa 02.11), mas `ia_documentos_conhecimento` é texto livre digitado por gente e é enviado **inteiro** ao provedor a cada resposta. A tela alerta no ponto exato onde o texto é digitado. Se algum dia isso precisar de garantia técnica em vez de aviso, o caminho é varredura de padrão (CPF, CNS, telefone) no salvamento — registrado aqui como a opção conhecida, não implementada.
- CRM-filho clonado herda todas as restrições deste documento — clonar não é oportunidade de relaxar RLS "porque o cliente pediu para simplificar".

### 3.1 Bloqueio de captura de tela — avaliado e RECUSADO como garantia (2026-08-19)

Max levantou, durante a revisão visual da Subetapa 02.12b, a hipótese de **proibir captura de tela** no CRM, sobretudo no prontuário. Avaliação registrada aqui para a ideia não voltar como promessa a cliente.

**Não é implementável em aplicação web, e isso não é limitação nossa.** Não existe API de navegador para bloquear captura — os navegadores deliberadamente não expõem uma, porque a captura de tela é função do sistema operacional, não da página. O que se encontra por aí como "proteção" é heurística: escutar a tecla `PrintScreen`, limpar a área de transferência, escurecer a tela ao perder o foco. Nada disso bloqueia ferramenta de recorte do sistema, captura por software de terceiro, máquina virtual, extensão de navegador ou as ferramentas de desenvolvedor — e todas quebram leitor de tela e lupa, que são recurso de acessibilidade.

**O único caminho tecnicamente real é fora da web:** um aplicativo de mesa (Electron `setContentProtection`, que aciona `SetWindowDisplayAffinity` no Windows e `sharingType` no macOS) ou um aplicativo móvel nativo (`FLAG_SECURE` no Android). Isso significa **outro canal de distribuição inteiro**, contra a arquitetura declarada do v01, e ainda assim é parcial (no Linux é inócuo).

**E o argumento que encerra a discussão:** uma câmera de celular apontada para o monitor derrota qualquer bloqueio, em qualquer plataforma, sem deixar rastro. Um controle que não resiste ao ataque mais banal que existe não é controle — e o dano de anunciá-lo é concreto: a clínica passa a se sentir protegida contra vazamento por foto de tela, relaxa o que de fato importa (quem tem acesso, e o registro de quem olhou) e descobre a diferença num incidente.

**O que trata o risco de verdade, em ordem de valor:**

1. **Trilha de quem olhou — já existe e é a peça de grau LGPD.** `aba_health.log_acesso` grava cada leitura com ator, registro e horário, por função de banco e não por política. Não impede a foto, mas responde "quem tinha esse dado na tela naquele dia", que é a pergunta de uma investigação real.
2. **Marca d'água de identificação na tela clínica** — sobrepor, discretamente, o identificador de quem está logado e o horário sobre os painéis de `aba_health`. Não impede a captura: **torna a captura rastreável até a pessoa que a fez**, o que muda o cálculo de quem pensaria em vazar. É a resposta padrão do setor para este risco, e é barata.
3. **Obscurecer ao perder o foco e travar por inatividade** — defende o risco vizinho e mais provável que a captura maliciosa: tela clínica esquecida aberta no balcão, ou compartilhada por engano numa videochamada.
4. **Reduzir o que vai à tela** — dado clínico não aparece em lista; exige abertura deliberada, que é o que gera a linha de log.
5. **Controle organizacional** — termo de uso e acordo de confidencialidade com a equipe. Nesta classe de risco, é o controle que efetivamente responde, e a LGPD trata assim.

**Decisão:** não implementar bloqueio de captura, em versão nenhuma. Provisionar os itens 2 e 3 como backlog (`docs/00`). Se um cliente exigir o bloqueio em contrato, a resposta honesta é que ele não existe em web e que o que se entrega é rastreabilidade — nunca aceitar a cláusula como se fosse entregável.

## 4. O que fica para a Etapa 01 decidir

- Política exata de retenção de log de acesso a prontuário (prazo mínimo legal a confirmar por jurisdição do cliente).
- Se `pgvector` (busca semântica de IA) entra no v01 ou fica para `+1.0` — não é restrição de compliance, é decisão de escopo.
