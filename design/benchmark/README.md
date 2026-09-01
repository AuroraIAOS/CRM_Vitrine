# design/benchmark/ — Benchmark de concorrentes em Odontologia

Investigação de **8 concorrentes reais** de software para clínicas odontológicas, produzida em
**2026-08-31** no bench `bench/benchmark-odonto`, a pedido de Max.

**Este benchmark não altera o produto.** Nenhum arquivo fora desta pasta foi tocado: o app em
`crm/`, as migrations, o Supabase e o subdomínio no ar seguem exatamente como estavam. O que
existe aqui é matéria-prima de decisão — o que implementar, a que preço vender e qual versão de
UX adotar continua sendo escolha de Max (`CLAUDE.md` §13).

## Por onde começar

| | Arquivo | O que responde |
|---|---|---|
| ★ | [`RELATORIO.md`](RELATORIO.md) | **A entrega.** Quem são os 8, o que cada um tem, o diferencial de venda de cada um, o que importar agora e no futuro, a faixa de preço praticável e o parecer sobre as três versões de UX. |
| | [`00_PLANO_DE_ACAO.md`](00_PLANO_DE_ACAO.md) | O `[Goal]` que regeu o trabalho: objetivo, critérios de qualidade e de finalização, teto de tentativas, escalonamento de LLM. |
| | [`capturas/INDICE.md`](capturas/INDICE.md) | As **34 referências visuais**, cada uma creditada com URL de origem e data. |
| | [`fontes/COLETA.md`](fontes/COLETA.md) | A matéria-prima: os 5 sinais do ranking, as tabelas de preço completas, os trechos citados de termo de uso e de lei, e o que ficou de fora e por quê. |
| | [`capturar.mjs`](capturar.mjs) | O coletor. `node design/benchmark/capturar.mjs` refaz as 34 capturas. |

## Como esta pesquisa foi construída

**Search-first sem exceção** (`CLAUDE.md` §11). Nada foi escrito de memória — nem preço, nem
número de clientes, nem artigo de lei. Cada afirmação leva marcação de proveniência
(`[verificado]` com link e data, ou `[a conferir]`), no mesmo padrão de
`design/ux/referencias/CATALOGO.md`.

**Três regras que não se dobraram:**

1. **Preço sem página pública entra como "sob consulta"** — nunca estimado, nunca inferido de
   concorrente parecido. Vale para Curve Dental e Dentrix Ascend, cujos valores só existem em
   fonte de terceiro e estão rotulados como tal.
2. **Nenhuma norma jurídica citada de memória.** Lei 13.787/2018 lida no Planalto, Código de
   Ética Odontológica lido no texto do CFO, certificação S-RES lida no site da SBIS.
3. **Coleta só de material público.** Sem cadastro, sem login, sem trial, sem formulário
   preenchido com dado de Max, e sem clicar em banner de consentimento — por isso o banner de
   cookie aparece em algumas capturas. É fidelidade da coleta, não descuido.

As capturas usam **o mesmo formato de `design/ux/versoes/telas/`** (3360×2100 px), para que a
tela do concorrente possa ser aberta ao lado das nossas três versões sem diferença de escala.

## As quatro conclusões, se você só ler esta página

**1. O TOP 3 é Simples Dental, Clinicorp e Dental Office** — e o que separa o primeiro do segundo
não é recurso, é atendimento: 14 horas de tempo médio de resposta contra 13 dias, 100% de
"voltariam a fazer negócio" contra 71,9%.

**2. O mercado inteiro esconde o preço da IA.** Clinicorp vende dois combos de IA "sob consulta";
Santé vende o agente de WhatsApp a partir de R$ 437/mês — 3,7× o preço do próprio CRM. Publicar
o preço da IA é diferencial de posicionamento com custo zero.

**3. Há um flanco jurídico aberto, e ele é grande.** A Lei 13.787/2018 exige guarda do prontuário
por **20 anos**; o termo de uso do líder de mercado prevê eliminar os dados de pacientes **30
meses** após bloqueio da conta, sem backup. E o segundo colocado declara hospedar dado sensível
de saúde brasileiro **nos EUA, por prazo indeterminado**. O Vitrine já tem construído o que isso
pede — `aba_health` com IBAC, log obrigatório, consentimento de imagem — e não usa como
argumento comercial.

**4. A Versão 03 continua sendo a recomendada, mas por outro motivo.** O argumento de
"familiaridade" que defendia a Versão 01 não se sustenta neste mercado: o comprador odontológico
não vem do HubSpot, vem do Simples Dental e do Santé. O que falta acrescentar à 03 é
**odontograma**, **consentimento de imagem visível** e **indicador de cota de mensagem**.

## O que este benchmark deliberadamente não faz

- **Não implanta nada.** A escolha da versão de UX e a adaptação final são etapa posterior.
- **Não cria conta, trial ou contato comercial** com concorrente.
- **Não funde este bench em `main`** — ordenar o merge é atribuição exclusiva de Max.
- **Não propõe implementar nada de `CLAUDE.md` §15.** Onde o mercado apontou para um item fora do
  escopo v01, ele foi **reportado como achado**, não planejado.
