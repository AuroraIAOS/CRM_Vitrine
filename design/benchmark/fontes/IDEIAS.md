# Leitura das imagens de referência de Max

As **14 imagens** que Max capturou pessoalmente e guardou em
[`../capturas/ideias/`](../capturas/ideias/), lidas em **2026-09-01**. Matéria-prima do §5 (c) do
[`../RELATORIO.md`](../RELATORIO.md).

Duas são capturas de **tela real do Clinicorp em uso** (as de permissão, tiradas de vídeo — nota-se
o rosto do apresentador no canto e o rodapé `CLINICORP PREMIUM · Versão: 0-21-13`). As outras
doze são peças de marketing do Simples Dental: mostram a tela que o fornecedor **escolheu**
mostrar, o que é menos que a tela real, mas ainda revela o modelo de dados por trás.

Marcação: **[verificado]** para o que está visível na imagem · **[declarado]** para o que a peça
afirma.

---

## O achado principal: o modelo de permissão do Clinicorp

`selecao_RLS_role_pessoa_01.png` e `_02.png` — **as duas imagens mais valiosas do conjunto**, e as
únicas que mostram a arquitetura interna de um concorrente. A tela fica em
`INFORMAÇÕES | PERFIS DO USUÁRIO | CONFIGURAÇÕES DE ACESSO`, e a terceira aba traz **cinco
colunas**:

| Coluna | Natureza | Exemplos visíveis **[verificado]** |
|---|---|---|
| **Permissões** | concessão | Administração Geral · Agenda Completa · Análise de Dados · Clinipay · Configuração · **Controle de Estoque** · **Controle de Indicação** · Controle de Voucher · **Controle Protético** · Criar/Modificar Dentistas · Criar/Modificar Pacientes · CRM · Cursos · **Dentistas Dados Próprios** · Ensino · Ensino-Administrador · Financeiro Clínica · Gerenciar Conta · Gestão de Casos · Interessados |
| **Restrições Gerais** | **negação** | Não Exibir Valores no Orçamento · Não Exibir Valores no Plano de Tratamento · Restringir Aprovação de Orçamentos · Restringir Edição de Recibos · Restringir Edição Financeiro · Restringir Recebimento de Valores |
| **Restrições Prontuário do Paciente** | **negação por seção clínica** | Agendamentos · Anamnese · Cadastro · Documentos · Exames · Fichas Especialidades · Financeiro e Recibos · Fotos · **Odontograma** · **Orçamento** · Plano e Ficha Clínica · Planos Recorrentes |
| **Relatórios** | concessão por relatório | Agendamentos (Alertas de Retorno · Conv. sem Agendamento · Desmarcações · **Faltas** · Geral · Primeira Consulta) · Alunos · Cursos/Turmas · Estoque · Financeiro (Balancete · Caixa · Conta Corrente · Contas a Pagar · Nota Fiscal · Pagamentos e Comissões · Recibos · Todos os Lançamentos) · **Geral – Ações Usuários** |
| **Permissões Atividades CRC** | concessão | Atividades CRC |

### O que isso ensina, e o que **não** se deve copiar

**Três coisas valem ser lidas com atenção:**

1. **`Dentistas Dados Próprios` é uma regra de atributo, não de papel.** "Este usuário só vê o
   que é dele" não se expressa como papel — expressa-se como atributo do vínculo. É exatamente a
   classe de regra que o `aba_health.pode_acessar()` já implementa (papel + permissão de módulo +
   atributo profissional com funcionário ativo). **Confirmação de que o desenho do Vitrine está
   certo**, vindo do maior concorrente premium do país.
2. **A restrição de prontuário é por seção clínica**, não por registro inteiro: dá para liberar a
   anamnese e travar o odontograma. O Vitrine hoje concede acesso ao prontuário como um todo via
   `concessoes_prontuario`. A granularidade por seção é um refinamento real a considerar.
3. **`Geral – Ações Usuários` é um relatório de auditoria exposto ao cliente.** O Vitrine já grava
   `aba_health.log_acesso` em leitura **e** escrita — mais do que eles registram — e **não mostra
   isso a ninguém**. Transformar o log em relatório visível é trabalho de tela sobre dado que já
   existe, e é argumento de venda direto (`RELATORIO.md` §6).

**E uma coisa que não se deve copiar: a mistura de concessão com negação.** Ter "Permissões" e
"Restrições" no mesmo formulário cria ambiguidade de ordem de avaliação — o que vence quando um
papel concede e uma restrição nega? É a armadilha clássica de modelo *deny-override*, e ela fica
pior à medida que os papéis se multiplicam. O Vitrine usa concessão pura (`access.can()`) com RLS
negando por padrão, o que é mais simples de auditar e não tem esse buraco. **A granularidade
deles é boa; o modelo booleano deles não é.** Portar a granularidade, manter o nosso modelo.

**Achado de produto de brinde:** as permissões revelam módulos que o site não anuncia —
`Cursos`, `Ensino`, `Ensino-Administrador`, `Alunos`, `Cursos/Turmas – Cobrança`. O Clinicorp
tem um **módulo de ensino/curso** embutido, provavelmente para clínicas-escola e franquias. Não
aparece em nenhuma página pública que consultamos na rodada 1.

---

## Prontuário — quatro imagens

**`pronutario_01.png` — assinatura eletrônica e odontograma [verificado]**

- Modal *"Solicitar Assinatura Eletrônica"*: signatários nomeados por papel (**Profissional** +
  **Paciente/responsável**), cada um com e-mail, e o estado do documento mudando de **pendente**
  para **assinado** quando todos assinam. É um modelo simples e suficiente — e é exatamente o que
  a Lei 13.787/2018 Art. 2º §2º cobra do prontuário digital.
- **Odontograma**: abas **`Permanentes | Decíduos`** (detalhe que importa — odontopediatria não
  cabe na numeração de adulto), numeração FDI (18→11, 21→28), coroa desenhada em cima e grade de
  faces embaixo, estados por cor (laranja = em tratamento, verde = concluído) e um marcador de
  alerta (`!`) no dente 28.

**`pronutario_02.png` — o documento clínico como lista assinável [verificado]**
Tabela `Data emissão · Serviço ou tratamento · Assinatura eletrônica · Assinado em`, com três
estados: **Pendente** (âmbar, com "Emitido em"), **Assinado** (verde, com "Assinado em") e **Sem
assinatura** (cinza). Cada evolução, anamnese e tratamento vira uma linha assinável. Encosta
direto em `aba_health.evolucoes` e `respostas_anamnese`, que hoje não têm estado de assinatura.

**`pronutario_03.png` — receituário [verificado]**
Medicamento com apresentação e princípio ativo já cadastrados (*"Clavulin, comprimido revestido
(21un) GSK — Amoxicilina 500mg + Clavulanato de potássio 125mg"*), **posologia pré-preenchida e
editável**, quantidade de embalagens, alternância `Assinatura Digital`, e abas `Arquivo |
Protocolos` — o **protocolo** é um conjunto de medicamentos reutilizável. O valor está na base de
medicamentos, não na tela.

**`pronutario_04.png` — foto de marketing, mas com uma tese** [declarado]
Dentista mostrando o odontograma **no tablet, para a paciente, na cadeira**. Reforça o que o site
afirma: o odontograma é ferramenta **de venda**, não só registro clínico. Se for assim, ele
precisa de um modo de apresentação legível a um metro de distância — requisito de UX que não
aparece em nenhuma biblioteca pronta.

---

## Gestão e financeiro — quatro imagens

**`gestao_01.png`** — painel `Receitas / Despesas / Saldo` com **realizado e previsto lado a
lado** ("R$ 4.809,74 · A receber: R$ 23.342,91 · Total previsto R$ 28.152,65"). O par
realizado↔previsto é o padrão que o Vitrine pode montar hoje a partir de
`aba_finance.parcelas_contrato`. Abaixo, lançamentos com **procedimento nomeado** e **forma de
pagamento como etiqueta colorida**.

**`gestao_02.png`** — análise de crédito: CPF mascarado, **score 930 numa faixa 300–1000** com
mostrador semicircular, veredito "Baixo risco" e "95% probabilidade de pagamento", com **fonte de
dados nomeada na tela** (Quod). Fora do MVP, mas o padrão de **citar a fonte do dado de terceiro
na própria interface** é bom e barato de imitar em qualquer lugar onde consultemos serviço
externo.

**`gestao_03.png`** — NFS-e: formulário curto (paciente, descrição, valor, tipo de beneficiário,
CPF, celular, e-mail) com **"EMITIR AGORA"**. Note o campo **`Tipo de beneficiário`** — a nota
pode sair no nome do paciente ou de um responsável, o que é regra fiscal real em odontopediatria
e em plano familiar.

**`gestao_04.png`** — extrato com **etiqueta por forma de pagamento** (Cartão de Crédito, Pix,
Dinheiro, Boleto, Cartão de Débito, **Cartão via Link**, **Bolepix**) e **indicador de parcela**
(`1/4`, `1/6`) ao lado do nome. O `aba_finance` já tem `parcelas_contrato` e `pagamentos`; falta
o vocabulário visual.

---

## Marketing — duas imagens

**`marketing_01.png` — o programa de indicação, e como medi-lo [verificado]**
Duas peças:
- *"Pacientes e profissionais indicadores"*: `Nome · Total de indicações · **Orçamentos
  aprovados (R$)**`. A indicação é medida em **receita**, não em contagem — "Juliana Silveira ·
  18 pacientes · R$ 5.124,11". É isso que transforma indicação em programa.
- *"Como o paciente chegou na clínica"*: barras por origem (Facebook 380 / 41%, Indicação de
  amigo 310 / 33%, Instagram 230 / 26%) com link **VER** para a lista.

O Vitrine tem `aba_people.leads.origem` com o valor `'indicacao'` no CHECK — ou seja, sabe *que*
veio de indicação, mas **não sabe de quem**. Falta a aresta pessoa→pessoa. O segundo gráfico, ao
contrário, é construível hoje com o dado que já existe.

**`marketing_02.png` — campanhas com desempenho medido [verificado]**
Cinco campanhas (`Débitos em atraso`, `Aniversário`, `Satisfação`, `Recup. de inativos`,
`Venc. de Boletos`), cada uma com escopo (`Personalizado` / `Todos pacientes`) e **três números:
pacientes atingidos · taxa de visualização · respostas**. A taxa de visualização varia de 15% a
40% — eles expõem o número ruim junto com o bom. `aba_automations` e `aba_messaging` têm a
fundação; o que falta é a contabilidade por campanha.

---

## WhatsApp — uma imagem

**`whatsapp_01.png` — o editor de template [verificado]**
Três coisas num só padrão:
1. **Variáveis como fichas coloridas dentro do texto** (`Nome paciente`, `Nome remetente`,
   `Nome clínica`, **`Responsável orçamento`**) — não `{{placeholder}}` cru. Torna óbvio o que é
   texto e o que é campo.
2. **Prévia ao vivo num aparelho desenhado**, ao lado, já com as variáveis substituídas por
   itálico entre colchetes.
3. **Contador de caracteres** (`196 / 500`).

É o padrão de UX mais diretamente aplicável de todo o conjunto, e cai em cima de
`aba_messaging`, que é a nossa fundação mais madura. Note ainda a variável **`Responsável
orçamento`**: até no template de WhatsApp o orçamento é entidade de primeira classe.

---

## Agenda — uma imagem

**`agenda_01.png` — alerta de retorno [verificado]**
Painel *"Alerta de retorno — 5 retornos previstos para o período 23/10 a 29/10"*, com paciente,
telefone mascarado, data prevista e **o profissional responsável** por cada um. É a
materialização do "80% das clínicas não controlam retorno" que o Simples Dental usa como
argumento. O Vitrine tem `aba_scheduling.lembretes`, mas não tem a noção de **retorno previsto**
(data-alvo derivada do tratamento) que alimenta esse painel.

---

## O que as 14 imagens acrescentam, em três linhas

1. **O orçamento aparece em cinco das quatorze** — na permissão (2×), no template de WhatsApp, no
   relatório de indicação e no odontograma que o preenche. Confirma, por caminho independente, o
   que o C1 já tinha concluído: **a lacuna central do Vitrine é o orçamento, não o odontograma**.
2. **O Clinicorp confirma o nosso desenho de acesso** (regra por atributo, log de ações) e mostra
   uma granularidade maior por seção clínica — mas com um modelo booleano *deny-override* que não
   vale copiar.
3. **Assinatura eletrônica aparece em três imagens** e é exigência legal (Lei 13.787/2018). Hoje
   é um "não tem" do Vitrine com peso jurídico, não só competitivo.
