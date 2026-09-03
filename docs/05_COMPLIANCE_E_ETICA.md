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

- ~~Política exata de retenção de log de acesso a prontuário (prazo mínimo legal a confirmar por jurisdição do cliente).~~ **RESOLVIDA na Subetapa 03.2 (2026-09-03):** a jurisdição é federal e o prazo é o da Lei 13.787/2018, Art. 6º — **mínimo de 20 anos** a partir do último registro. Ver §5.1 (C1).
- Se `pgvector` (busca semântica de IA) entra no v01 ou fica para `+1.0` — não é restrição de compliance, é decisão de escopo.

## 5. Diretrizes de conformidade vindas do benchmark (Subetapa 03.2, 2026-09-03)

Dez diretrizes que nasceram no bench de benchmark (`design/benchmark/DIRETRIZES_FORA_DO_BENCHMARK.md` §2 e §6) e pertencem a este documento, mais uma de arquitetura cujo efeito é de compliance (A6). Elas viram **critério de qualidade** das subetapas da Etapa 03 que as tocam — a subetapa dona está nomeada em cada uma.

### 5.1 Retenção e acesso ao prontuário

**C1 — Guarda mínima de 20 anos (Lei 13.787/2018, Art. 6º).** O prontuário deve ser guardado por no mínimo 20 anos a partir do último registro. A política de retenção do Vitrine precisa ser **explícita** e não pode repetir o que o líder de mercado faz: o termo de uso do Simples Dental (cláusula 8.1.2) declara que, bloqueada a conta, os dados de pacientes são mantidos **30 meses** e depois podem ser eliminados *"sem a manutenção de qualquer backup"*, cabendo ao usuário a responsabilidade exclusiva por pedir cópia. Trinta meses contra vinte anos. A obrigação legal é do cirurgião-dentista, e o software o deixa descoberto. **Fecha a pendência que o §4 deste documento deixou aberta** ("política exata de retenção a confirmar por jurisdição"): a jurisdição é federal e o prazo é 20 anos. Subetapa dona: 03.13 (exportação de prontuário).

**C2 — Fornecer cópia do prontuário é dever, não conveniência (Art. 18, I do Código de Ética Odontológica).** Negar ao paciente ou periciado acesso ao seu prontuário, ou deixar de lhe fornecer cópia quando solicitada, **é infração ética**. A exportação do item 7 é cumprimento de dever do cliente, e é isso que a tela deve comunicar. Subetapa dona: 03.13.

**C3 — Consentimento para imagem e identificação (Art. 14, III e Art. 44, VI do CEO).** Exibir imagem ou identificar paciente exige consentimento livre e esclarecido. `aba_health.consentimentos` existe desde a Subetapa 01.4 e **nunca teve tela** — a trava precisa ser visível onde a foto é publicada, não só ativa no banco. O marketing odontológico vive de antes-e-depois, e é aí que o risco se realiza. Subetapa dona: 03.5.

### 5.2 Residência e transferência de dado

**C4 — Residência do dado é decisão declarada, não padrão herdado.** O segundo colocado do mercado declara, na própria política de privacidade, hospedar dado sensível de saúde de paciente brasileiro em servidores na Carolina do Sul (EUA), região US-EAST 1, **por prazo indeterminado** — o que é transferência internacional, com todo o ônus de base legal da LGPD. A escolha de região do projeto Supabase do Vitrine e de cada CRM-filho é decisão a **declarar**, não a deixar no padrão. Ver também `docs/01_ARQUITETURA.md`.

### 5.3 Métrica agregada

**C5 — A tabela de métricas agrega na origem; não anonimiza depois.** Guardar só contagem e categoria torna o vazamento de dado personalíssimo **estruturalmente impossível**, em vez de proibido por política — anonimização é reversível e dá trabalho provar; agregação na origem não. A cláusula do Termo de Uso deve nomear **quais** métricas, nunca "métricas de uso". Subetapa dona: 03.21.

**C6 — Métrica agregada de clínica ainda é segredo de negócio dela.** Faturamento e número de pacientes de uma clínica não são dado pessoal, mas são informação comercial sensível. O consolidado entre CRMs-filhos é seguro; o dado individual identificável por clínica precisa da mesma régua de acesso do resto — `access.can()`, nunca "quem tem a URL do painel". Subetapa dona: 03.21.

### 5.4 IA e instrumento clínico

**C7 — Em dado clínico, a IA propõe e o humano aplica.** O concorrente já opera assim: o ditado por voz abre uma **tabela de revisão** antes de gravar qualquer coisa no odontograma. Isto é regra escrita deste projeto, não escolha de implementação de quem construir o recurso. Vale para o item 29 (ditado clínico, `+1.0`) e para qualquer sugestão automática que toque `aba_health`. Reforça a trava que já existe e é `CHECK` de banco: o agente não lê prontuário, e nem o proprietário liga.

**C9 — Instrumento de triagem nunca é diagnóstico.** Se um questionário de dor orofacial (ou similar) entrar como modelo de anamnese, entra como **coleta estruturada que apoia a avaliação**, com a ressalva visível na própria tela — nunca como resultado. Ver `design/benchmark/fontes/REPOS.md` §3.

### 5.5 Conformidade sanitária da clínica

**C8 — PGRSS e POP são exigência sanitária de toda clínica odontológica**, não burocracia opcional. Um módulo que rastreia validade de POP, de PGRSS e de contrato de terceiro toca **conformidade**, não gestão — e é o que evita a autuação no dia da fiscalização. É a tese que reposiciona o item 20. Subetapa dona: 03.20.

**C10 — POP e PGRSS têm vigência, responsável e periodicidade.** "Abortamento de ciclo de esterilização" é **evento datado** — o material daquele ciclo não está estéril —, e "controle de manutenção da autoclave" é **vencimento**. São estados com data, não campos de texto. Origem: acervo de gestão pública transcrito em `design/benchmark/fontes/REFERENCIA_ODONTO_CEO.md`. Subetapa dona: 03.20.

### 5.6 Endpoint público (efeito de compliance da diretriz A6)

**A6 — O freio de endpoint público conta por token, nunca pela entidade.** Travar a *entidade* permitiria a um atacante **silenciar um usuário legítimo** só errando token de propósito: bloquear o laboratório impediria o envio de exames de uma clínica inteira. É negação de serviço por desenho, e a defesa é contar por token, com motivo enumerado (`token_inexistente` / `expirado` / `revogado` / `arquivo_invalido`). Medido no CRM Sindcom. Subetapa dona: 03.10; registrada também em `handoffs/instrucoes.md`.

### 5.7 O flanco jurídico é argumento comercial já construído

O Vitrine **já tem** o que os três achados acima pedem: `aba_health` com IBAC, `log_acesso` obrigatório em leitura **e** escrita, `concessoes_prontuario`, consentimento de imagem travando a leitura de anexo, e dado hospedado onde a conta Supabase escolher. Isso não é vantagem técnica — é **argumento comercial**, e nenhum dos cinco concorrentes brasileiros o usa hoje. Falta transformá-lo em três frases na página de venda e numa tela de exportação (diretriz E5, em `docs/07_BACKLOG_COMERCIAL.md`).

## 6. Fonte de terceiro e transmissão de IP — resolvido na Subetapa 03.3

O `index.html` carregava três famílias tipográficas de `fonts.googleapis.com` desde a Subetapa 02.1. O **LG München I** (3 O 17493/20, 20/01/2022) condenou um site alemão por isso: embutir Google Fonts remotamente faz o navegador do visitante buscar o arquivo diretamente do Google, o que transmite o **IP dele** sem base legal — o tribunal recusou o argumento de "interesse legítimo" justamente porque existe alternativa gratuita e equivalente (hospedar o arquivo). Reguladores da Holanda, Áustria e Bélgica sinalizaram concordância com o mesmo raciocínio. Levantado por `design/ux/06_ORCAMENTO_DE_PESO.md` §2(b), que pediu registro aqui e não só no dossiê de UX — o Vitrine trata dado de saúde sob a LGPD, com o schema `aba_health` em regime de RLS mais restritivo por decisão de projeto (`CLAUDE.md` §5), e é exatamente o tipo de item que custa pouco para corrigir e caro para explicar numa auditoria de cliente corporativo.

**Decisão e execução (Subetapa 03.3, 2026-09-03): auto-hospedar.** As nove faces realmente usadas (IBM Plex Sans 400/500/600 — um arquivo variável, medido pela tabela `fvar` do próprio woff2 — e IBM Plex Mono 400/500, sempre carregadas; IBM Plex Serif 400/500/600, só quando a conta escolhe a tipografia serifada) passaram a ser servidas por `crm/public/fonts/`, sem nenhuma requisição a domínio do Google. O `<link rel="stylesheet">` remoto saiu do `index.html`; entrou um `<link rel="preload">` apontando para o arquivo local. Nenhum dado de visitante sai do domínio do próprio CRM para resolver tipografia.

**Nunca reintroduzir o `<link>` remoto para Google Fonts** — nem "só para a fonte serifa opcional", nem em nenhuma tela nova. Qualquer fonte adicional que o produto precisar entra pelo mesmo caminho: baixar o arquivo, versionar em `crm/public/fonts/`, declarar `@font-face` local.
