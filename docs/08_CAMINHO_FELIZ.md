# 08 — O caminho feliz do atendimento, ponta a ponta

Protocolado por Max em **2026-09-06**, a partir do fluxo de 27 passos que ele
descreveu, revisado em conversa com o CODE e fechado em quatro decisões
(**D-F1** a **D-F4**, abaixo).

**Por que este documento existe.** Até aqui o plano da Etapa 03 descrevia
*peças* — catálogo, odontograma, plano, orçamento, contrato — e cada uma foi
construída com o seu próprio critério de pronto. O que faltava era a pergunta
que só aparece quando alguém tenta usar o produto do começo ao fim: **um
interessado entra em contato e sai paciente com o tratamento executado —
onde exatamente o sistema quebra?** Este documento responde isso, e a
resposta virou fila de trabalho.

**O gatilho foi uma sessão de uso real**, não uma revisão de escritório. Ao
pilotar a tela `/plano` publicada, com Max assistindo (2026-09-05), dois
defeitos apareceram em minutos — a lista de pacientes quebrada em produção
desde a 03.7.a e a ausência de interface para montar a matriz do plano —
nenhum dos quais `npm run build`, `tsc`, 248 testes de RLS e a evidência de
banco haviam pegado. Foi isso que levou Max a escrever o fluxo inteiro e a
pedir a conferência antes de seguir. **Descobrir estas lacunas agora é a
economia real: encontradas na 03.22, seriam retrabalho de UX sobre telas já
implantadas.**

---

## 1. As quatro decisões (D-F1 a D-F4)

Tomadas por Max em **2026-09-06**, na conversa que revisou o fluxo dele.

| # | Decisão | Resposta | Quem/quando |
|---|---|---|---|
| **D-F1** | O que uma "proposta A/B" pode conter | **Itens heterogêneos.** A opção do plano passa a aceitar **procedimento, pacote ou plano** — o mesmo arco exclusivo que a D-V3 desenhou para `itens_contrato`. Motivo: a proposta que o dentista apresenta é "lente de porcelana × lente acrílica", mas também "combo de clareamento × sessão avulsa", e um pacote não cabe em `procedimentos_plano`. Com isso o contrato da 03.8.b vira **cópia fiel** da opção aceita, sem tradução no meio — que é onde o preço costuma divergir | **Max, 2026-09-06** |
| **D-F2** | Quando o interessado deixa de ser lead | **Aceitar a consulta de diagnóstico é o gesto que converte.** `converter_lead()` roda no ato do agendamento, porque `agendamentos.cliente_id` é `NOT NULL REFERENCES aba_people.clientes` e um lead não entra na agenda. **"Paciente" não vira tabela nem coluna: é DERIVADO** — cliente com contrato assinado. Custo declarado e aceito: a base de clientes passa a incluir quem agendou e nunca fechou, então toda métrica de conversão compara *clientes* com *clientes com contrato*, nunca conta clientes | **Max, 2026-09-06** |
| **D-F3** | Quem autoriza o preço, e quando | **O profissional aprova o ORÇAMENTO antes de ele ir ao paciente** — e não assina o contrato depois do aceite, como o fluxo original previa. A recepção só apresenta orçamento aprovado; se ela alterar desconto, parcela, juros ou mora, **o orçamento volta a rascunho** e exige nova aprovação. Motivo: na ordem original, promete-se um preço ao paciente antes de quem responde por ele ter autorizado, e desdizer valor já aceito é o pior momento possível da relação | **Max, 2026-09-06** |
| **D-F4** | O vocabulário de preço na interface | **Troca.** "Escada", "degrau" e "veio de" são vocabulário de quem construiu, não de quem usa. Os termos internos (`escopo`, `degrau`) ficam no banco, onde são precisos; a tela passa a falar a língua da clínica. Mapa completo na §4 | **Max, 2026-09-06** |
| **D-F5** | O mecanismo de preço por grupo entra na Etapa 03 | **Sim.** *"Embora os convênios sejam tratados fora do MVP, já podemos deixar o mecanismo do orçamento pronto para recebê-los."* Vira a **Subetapa 03.8.d**: o degrau entra na posição **2** — `Paciente > Grupo > Tipo de profissional > Clínica > Rede > Prática` —, a cortesia individual vence o convênio e o convênio vence o tipo de profissional. **Nenhuma linha de convênio se cria**: operadora, apólice, carência e cobertura seguem fora do MVP por D-V5; o que entra é o lugar onde eles vão encaixar. Junto vem um renome que a D-V1 exige: `grupo` já significava *grupo de clínicas* no `escopo`, e passa a `rede` — uma palavra, um dono | **Max, 2026-09-10** |
| **D-F6** | O que é um item "plano" dentro da opção de um plano | **Não existe: o arco da opção tem dois braços, procedimento OU pacote.** A D-F1 listava três; a pergunta que a execução da 03.8.c fez foi o que seria um *plano* dentro da opção de um plano, se a opção já pertence a um. Quando a 03.8.b copiar a opção aceita para o contrato, `itens_contrato.plano_id` recebe o **próprio plano dono da opção** — sem plano dentro de plano, sem ciclo a vigiar e sem "preço de plano" a inventar. O terceiro braço continua onde a D-V3 o desenhou: no contrato. **A D-F1 não se apaga**: ela decidiu que a opção é heterogênea, e a D-F6 decide quais são os tipos | **Max, 2026-09-13**, à pergunta da 03.8.c |
| **D-F7** | Quem é "o profissional" que aprova o orçamento (D-F3) | **Quem vai executar** — o login por trás do profissional do orçamento, cujo tipo move o preço e que responde pelo número. Sem profissional definido, não se aprova. **Sem exceção para o `owner`**: é comum ele não ser dentista (D-V7), e aprovar o preço clínico no lugar de quem executa é a vinculação "sem ele saber" que a D-F3 existe para impedir. A regra mora num gatilho, porque a policy de `UPDATE` autoriza qualquer `agent` | **Max, 2026-09-13**, à pergunta da 03.8.c |
| **D-F8** | A D-V7 (autoria e sucessão) entra na 03.8.b? | **Não.** O contrato grava quem responde por ele (o profissional que aprovou). A trava de edição por autor, o coautor e a passagem ao `owner` são subetapa própria, depois da **03.9** (mecanismo de trava) e da **03.14** (o regime de referência e contrarreferência que o coautor usa) | **Max, 2026-09-14**, à pergunta da 03.8.b |
| **D-F9** | Como a opção aceita vira linhas do contrato | As células de **procedimento** viram **uma** linha `plano_id`, com a soma congelada; cada célula de **pacote** vira uma linha `pacote_id`; `procedimento_id` é o **avulso**, sem plano. O detalhe por célula continua em `itens_orcamento`, pelo `orcamento_id` do contrato | **Max, 2026-09-14**, à pergunta da 03.8.b |
| **D-F10** | De onde a trava dupla lê "face executada" | **Tabela nova**, `aba_treatment.execucoes_face`: uma linha por face, com data e autor gravados pelo banco e o regime clínico completo. O estado `executado` da célula passa a ser derivado das faces. O odontograma continua sendo o quadro clínico e não conta para fechar contrato | **Max, 2026-09-14**, à pergunta da 03.8.b |
| **D-F11** | O que é o "processo" que o `owner` dispensa de contrato (D-V8) | **O procedimento do catálogo**, com justificativa escrita, autor e data; revoga-se, nunca se apaga | **Max, 2026-09-14**, à pergunta da 03.8.b |
| **D-F12** | Como se mede o trabalho das linhas de pacote e de avulso | **Pacote pelo saldo de sessões** (vendido na dupla assinatura e ligado à linha); **avulso por registro de execução** com data e autor. As três formas entram na trava dupla | **Max, 2026-09-14**, à pergunta da 03.8.b |
| **D-F13** | Onde fica a view do cardápio (D-V3) | **`aba_finance.ofertas`**, e não `aba_catalog.ofertas`: a view lê `aba_treatment.planos`, e no catálogo inverteria a dependência entre módulos. É `security_invoker` | **Max, 2026-09-14**, à pergunta da 03.8.b |
| **D-F14** | A venda de pacote do Financeiro (02.8), que criava contrato `ativo` sem assinatura | **Passa pelo contrato novo.** Nenhum contrato nasce nem passa a `ativo`; o saldo de sessões só nasce na dupla assinatura; `vender_pacote` deixa de ser executável por `authenticated`. Os contratos antigos ficam intactos | **Max, 2026-09-14**, à pergunta da 03.8.b |
| **D-F15** | Onde a intercorrência se registra, se o bloco da 03.7.b pedia "lugar próprio" e "nenhuma coluna de texto nova" | **Coluna própria**, `aba_health.evolucoes.intercorrencia`, com o regime das outras quatro (sem `SELECT` direto, leitura por `ler_evolucoes`). As colunas que existiam são avaliação, conduta, resultado e próximos passos, e nenhuma é evento adverso; dentro de `resultado`, um relatório não distinguiria desfecho de evento | **Max, 2026-09-14**, à pergunta da 03.7.b |
| **D-F16** | Quando a recusa do paciente em assinar pode ser registrada | **Depois do fecho, uma única vez.** O paciente recusa o texto que ouviu, e o texto só fica final quando o profissional assina. O gatilho de trava da 013 ganha uma exceção só para preencher os três campos da recusa, que só a função `registrar_recusa_assinatura` escreve. A mesma porta serve à recusa remota da 03.12 | **Max, 2026-09-14**, à pergunta da 03.7.b |
| **D-F17** | A aceitação presencial do paciente na evolução entra na 03.7.b? | **Não, fica para a 03.12**, junto com o canal por link. Custo declarado e aceito: até lá, evolução travada sem recusa não distingue "o paciente assinou" de "ninguém perguntou" | **Max, 2026-09-14**, à pergunta da 03.7.b |
| **D-F18** | O adendo sobre uma evolução assinada nasce assinado? (pendência deixada pela 03.7.b) | **Sim: nasce assinado por quem o escreveu**, carimbado com o login de quem escreve. Consequência declarada: o adendo passa a receber a recusa do paciente (D-F16), porque recusa exige evolução travada. **Implementação fora da 03.9** (portão de núcleo de permissão); fica para a próxima subetapa que tocar `aba_health.evolucoes`, com P-sub | **Max, 2026-09-14**, na abertura da 03.9 |

---

## 2. O caminho feliz, em sete etapas

Cada etapa traz o resumo do que acontece e os passos. É este checklist que a
Etapa 03 precisa tornar executável do começo ao fim.

### E1 · Captação e primeira consulta
*O interessado chega por mensagem, telefone ou balcão. A recepção esclarece, convida para a consulta de diagnóstico e, se ele aceitar, cadastra e agenda. Aceitar a consulta é o gesto que converte o lead em cliente — a agenda exige cliente.*

- [ ] Interessado entra em contato por WhatsApp, telefone ou balcão
- [ ] Recepção esclarece dúvidas e oferece a consulta de diagnóstico
- [ ] Interessado aceita e a recepção cadastra os dados básicos
- [ ] O aceite converte o lead em cliente
- [ ] Recepção agenda a consulta de diagnóstico
- [ ] Consulta aparece como prevista na agenda do profissional

### E2 · Acolhimento e diagnóstico
*No dia, a recepção completa o cadastro — dados pessoais, bancários, convênio — e o acolhimento move o agendamento para a sala de espera. O profissional chama, abre o prontuário, faz a anamnese e preenche o odontograma, achado e trabalho por face.*

- [ ] Paciente comparece e a recepção completa o cadastro
- [ ] Acolhimento move o agendamento para sala de espera
- [ ] Profissional chama; agendamento vai para em andamento
- [ ] Profissional abre o prontuário e registra a anamnese
- [ ] Alertas clínicos da anamnese aparecem na abertura
- [ ] Profissional preenche o odontograma por face

### E3 · Proposta e orçamento
*Do odontograma nasce o plano: fase clínica na linha, opções concorrentes na coluna. Cada opção pode conter procedimento, pacote ou plano. Gerar orçamento resolve o preço sozinho, sem ninguém escolher tabela. O profissional aprova antes de o paciente ver.*

- [ ] Do odontograma, o profissional monta o plano com o diagnóstico
- [ ] Monta a opção A e a opção B para a mesma necessidade
- [ ] Cada opção aceita procedimento, pacote ou plano
- [ ] Profissional clica em gerar orçamento das duas opções
- [ ] O preço se resolve e a linha guarda de onde ele veio
- [ ] Profissional aprova os orçamentos antes de irem ao paciente

### E4 · Negociação e aceite
*A recepção apresenta os orçamentos aprovados, impressos ou em tela. Só ela mexe em desconto, parcela, juros e mora — e qualquer alteração devolve o orçamento a rascunho, exigindo nova aprovação do profissional, que responde pelo número.*

- [ ] Recepção imprime ou mostra em tela os orçamentos aprovados
- [ ] Paciente pode levar para casa e decidir depois
- [ ] Só a recepção altera desconto, parcela, juros e mora
- [ ] Alteração de valor devolve o orçamento a rascunho
- [ ] Profissional reaprova o orçamento alterado
- [ ] Paciente escolhe a opção vencedora

### E5 · Contrato e dupla assinatura
*Escolhida a opção, a recepção confirma a via de assinatura e contrata. A perdedora é registrada como recusada. O contrato nasce com a assinatura do profissional derivada da aprovação e vai ao paciente por link, QR ou papel. A dupla assinatura libera a execução.*

- [ ] Recepção confirma a via de assinatura do paciente
- [ ] Recepção contrata a opção vencedora
- [ ] A opção perdedora é registrada como recusada
- [ ] Contrato nasce com a assinatura do profissional registrada
- [ ] Token vai ao paciente por WhatsApp, SMS, e-mail ou QR
- [ ] Paciente assina em tela e o documento volta assinado
- [ ] Dupla assinatura libera a execução e prevê o faturamento

### E6 · Execução e evolução
*Com o contrato assinado, agenda-se cada sessão. O profissional registra a evolução durante o atendimento — avaliação, conduta e intercorrência —, lê para o paciente e envia para assinatura simplificada. A recusa de assinar também se registra.*

- [ ] Recepção ou paciente agendam a sessão do procedimento
- [ ] Acolhimento, sala de espera e chamada, como na primeira vez
- [ ] Profissional registra a evolução durante a sessão
- [ ] Registra intercorrências e prescrições no mesmo lugar
- [ ] Marca as faces executadas, com data e autor
- [ ] Lê a evolução ao paciente e envia para assinatura
- [ ] Paciente assina por link ou QR; a recusa também se registra
- [ ] Evolução assinada encerra a sessão

### E7 · Financeiro (corre em paralelo a partir da E5)
*A dupla assinatura gera as faturas previstas, que caem numa fila de aprovação da recepção. Aprovadas, seguem ao paciente na hora ou por envio programado. O contrato só se encerra quando não faltar nem dinheiro nem trabalho.*

- [ ] Faturas previstas nascem da dupla assinatura
- [ ] Caem na fila de aprovação da recepção
- [ ] Aprovadas, vão ao paciente ou ao envio programado
- [ ] Comissões do profissional são calculadas
- [ ] Contrato fica aberto enquanto faltar pagamento ou execução

---

## 3. O que mudou em relação ao fluxo original de Max

O fluxo de 27 passos que Max escreveu **não se apaga** — o que segue é o
registro do que a revisão alterou, com o motivo de cada mudança.

| Passo original | Mudança | Motivo |
|---|---|---|
| 3 — cadastro e agendamento do interessado | Aceitar a consulta **converte o lead em cliente** | `agendamentos.cliente_id` é `NOT NULL` para `clientes`; um lead não entra na agenda (D-F2) |
| 10 — "propostas A e B" | A opção A/B aceita **item heterogêneo** | Uma proposta que é pacote não cabe em `procedimentos_plano` (D-F1) |
| 12–17 — recepção precifica, paciente aceita, profissional assina | O profissional **aprova antes** de o orçamento ir ao paciente | Não se promete preço que quem responde por ele ainda não viu (D-F3) |
| 14 — recepção edita valores | Alterar dinheiro **devolve o orçamento a rascunho** | Fecha o risco que o próprio Max nomeou: a recepção vincular o profissional sem ele saber |
| 21 — sete efeitos num gatilho | Vira **fila com estado** | Sete efeitos num gatilho único: se um falha, os outros ficam num estado sem nome. E reserva de estoque está **fora do MVP** — a 03.20 entrega só alerta e validade |

**Uma armadilha nomeada antes de acontecer.** O passo 22 ("agenda-se o
procedimento") supõe que um plano de N sessões vire N agendamentos. Isso é o
**item 37 (*step set*)**, fora do MVP por D-I5. Sem ele, quem agenda a segunda
sessão depende de alguém lembrar — e a cobertura de execução por face, que a
trava dupla de finalização lê, não tem quem a alimente sessão a sessão.

---

## 4. O vocabulário de preço na interface (D-F4)

Os termos que o CODE usou para construir descrevem bem o mecanismo e mal o
trabalho de quem atende. A troca vale **só na interface**; `escopo` e
`degrau` continuam no banco, onde são precisos.

| Termo interno | Na tela |
|---|---|
| A escada de preço | **Como o preço é decidido** |
| Degrau | **A quem se aplica** |
| Prática | **Preço padrão da casa** |
| Grupo de clínicas | **Preço da rede** |
| Clínica | **Preço desta unidade** |
| Tipo de profissional | **Por tipo de profissional** |
| Paciente | **Preço só deste paciente** |
| Catálogo | **Preço de tabela do procedimento** |
| Veio de | **Preço aplicado** |

Na linha do orçamento, em vez de `Prática`, lê-se: *"Restauração em resina —
preço padrão da casa — R$ 250,00"*.

**O mal-entendido que originou esta decisão vale ficar registrado**, porque
ele diz o que a tela precisa ensinar: ao ler a seção de preços, Max entendeu
que **tabela** era o "quando" e **degrau** era o "quem". A metade certa é que
a tabela tem mesmo vigência e o degrau tem mesmo a ver com a quem se aplica.
A metade errada é a que a interface precisa impedir:

- **A tabela não é só "quando"** — ela carrega três coisas: os preços, o
  degrau a que pertence e a vigência. Duas tabelas do mesmo período existem e
  devem existir, para casos diferentes.
- **Os degraus não se criam** — são cinco, fixos, e são as cinco perguntas
  que o sistema faz em ordem. O que a clínica cria são **tabelas**, e cada
  tabela é a *resposta* a uma dessas perguntas.

---

## 5. Três buracos de preço que os exemplos de Max revelaram

Ao tentar encaixar casos reais nos cinco degraus, três não couberam. **(a) continua registrado para decisão** (`CLAUDE.md` §15). **(b) e (c) saíram da espera em 2026-09-10 por D-F5** e viraram a Subetapa **03.8.d** — o mecanismo entra, o convênio não.

**(a) Preço por profissional específico.** Se o Dr. Plínio cobra mais que os
outros especialistas porque é o mais procurado, não há onde dizer isso: o
degrau 2 pergunta pelo **tipo**, não pela pessoa. A saída atual seria criar um
"tipo" com um membro só, que é gambiarra — tipo com um integrante não é tipo.

**(b) Preço por grupo de pacientes.** "Todas as mães em maio", "todos os
servidores da prefeitura", "todos os indicados pelo convênio X". Hoje só
existe paciente **individual**: uma cortesia para 40 pessoas exigiria 40
tabelas.

**(c) O gancho do convênio precisa de GRUPO, não de paciente.**
`docs/02_MODELO_DE_DADOS.md` §13.4 reservou o degrau **Paciente** para receber
o convênio quando ele existir (D-V5). O buraco (b) mostra que essa reserva
está no lugar errado: convênio é preço de **grupo** — todos os pacientes de
uma apólice —, e amarrá-lo ao degrau individual reproduziria o problema de
(b) com 40, 400 ou 4.000 linhas. **Corrigir a §13.4 é mais barato agora, com o
convênio ainda no papel, do que depois.**

---

## 6. Executabilidade — o que existe e o que falta

Levantado em **2026-09-06**, contra o repositório e o banco de produção.

| Etapa | Já executa | Falta |
|---|---|---|
| **E1** Captação | mensageria (02.5), lead (02.3), `converter_lead()`, agenda (02.6) | converter no ato de agendar → **03.19** |
| **E2** Diagnóstico | sala de espera (03.4), anamnese (02.9), odontograma (03.7.a); **evolução com texto (03.7.b)** | alertas clínicos da anamnese na abertura → **03.16** (passo 11 do artefato; a linha dizia só 03.7.b, e "—" aqui esconderia o passo) |
| **E3** Proposta | matriz no banco (03.8), preço resolvido e aprovação (03.8.a); **plano montado pela tela a partir do odontograma, opção com procedimento ou pacote, pacote subindo a escada, aprovação só por quem executa (03.8.c)** | — |
| **E4** Negociação | trava de alçada: só `admin` mexe em dinheiro (03.8.a); **recepção chega ao orçamento sem alcance clínico, alterar dinheiro devolve a rascunho com aviso, reaprovação (03.8.c)**; **orçamento aprovado impresso (03.8.b)** | — |
| **E5** Contrato | recusa implícita da opção perdedora (03.8); **contrato cópia fiel da opção, documento com hash, assinatura do profissional derivada da aprovação, assinatura presencial do paciente, e a execução liberada só com as duas (03.8.b)** | token (**03.10**), assinatura por link (**03.12**) |
| **E6** Execução | agenda; **faces executadas com data e autor gravados pelo banco, e nenhuma execução sem contrato assinado ou dispensa do owner (03.8.b)**; **evolução escrita durante a sessão com intercorrência em lugar próprio, e a recusa do paciente em assinar registrada com data e autor (03.7.b)** | prescrição → **03.16.a**; assinatura do paciente na evolução, por link ou presencial → **03.12** (D-F17) |
| **E7** Financeiro | faturas e comissões (02.8); **faturas previstas nascendo da dupla assinatura e o contrato aberto enquanto faltar dinheiro ou trabalho (03.8.b)** | **fila de aprovação de faturas** → **03.18** |

**Duas subetapas novas nasceram deste levantamento** — 03.7.b e 03.8.c —, e
três subetapas já planejadas ganharam item (03.18, 03.19, 03.22). O detalhe de
cada uma está em `docs/00a_PLANO_ETAPA_03.md`.

---

## 7. O artefato visual

Este documento tem uma versão publicada e visual, feita para consulta de quem
opera — e para virar base do **manual do CRM** e do **POP/SOP** da clínica
quando o produto estiver pronto:

**https://claude.ai/code/artifact/1a54ccde-d54c-4296-aaea-aeeed39f20b4**

A fonte fica versionada em `docs/artefatos/caminho_feliz.html`, e é ela que se
republica quando o caminho mudar — **nunca uma cópia nova**, que criaria um
segundo endereço e um segundo documento a manter.

**O que o artefato acrescenta a este texto, e não é enfeite:** cada um dos 44
passos carrega **quem o executa** (recepção, profissional, paciente ou
sistema) e **se o CRM já o executa hoje**, com a subetapa responsável quando
não. Isso responde de relance a pergunta que o plano por subetapas não
responde — *quanto do atendimento real já funciona?* — e a resposta, em
2026-09-06, é **21 de 44**; em **2026-09-13**, depois da 03.8.c, é **26 de 44** (o passo 36, que o artefato atribuía à
03.8.c sem que o bloco dela o incluísse, foi reatribuído à 03.8.b); em **2026-09-14**, depois da 03.8.b, é **33 de 44**. Toda vez que uma subetapa fechar, esse número
muda; mantê-lo em dia é o que impede o documento de virar retrato antigo.
