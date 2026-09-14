# 07 — BACKLOG COMERCIAL — CRM Vitrine

Destino das diretrizes de **estratégia comercial e validação** que nasceram no bench de benchmark (`design/benchmark/DIRETRIZES_FORA_DO_BENCHMARK.md` §4 e §6) e não pertencem a nenhum dos documentos técnicos. Criado na **Subetapa 03.2 (2026-09-03)**.

**Nada aqui é ordem de implementação.** São apontamentos com endereço, para as **Etapas 5 e 6 do roteiro de sete** — teste em campo com profissionais e universitários, e lançamento com níveis de produto, preço, site, Instagram e e-mail marketing. As duas ainda não têm plano escrito; este arquivo é a matéria-prima de quando tiverem.

---

## 1. Programa de teste com a universidade (E1)

Max tem acesso a uma universidade e a uma rede de profissionais. A proposta tem **dois grupos**:

| Grupo | Quem | Contrapartida |
|---|---|---|
| Profissionais | dentistas convidados | acesso vitalício |
| Acadêmico | alunos num estudo de desenvolvimento tecnológico | desconto vitalício escalonado — 100% para o TOP 3, 50% para o TOP 10, 50% por 12 meses para o TOP 15 |

Acompanham curso, palestra e certificado de horas acadêmicas.

**Cinco eixos de questionário**, definidos por Max: funcionalidades · UX/UI · segurança · **facilidade de backup e migração** · outros. O quarto eixo é o mais bem escolhido dos cinco, e o benchmark explica por quê — ver §3 abaixo.

### 1.1 Dois reparos antes de executar (E2)

**(a) Comitê de ética.** Estudo com aluno e questionário estruturado costuma exigir aprovação de comitê **quando o resultado vira publicação** ou quando se coletam dados dos participantes. Se for avaliação de produto para uso interno, não; se virar artigo ou trabalho acadêmico, provavelmente sim. **Confirmar com a instituição antes de prometer certificado.**

**(b) Teste com aluno não pode tocar paciente real.** O ambiente precisa nascer com **dado de demonstração**; caso contrário, prontuário de paciente real entra em sistema de teste operado por quem ainda não é profissional habilitado — o que colide com o Art. 14 do Código de Ética Odontológica (sigilo) e com a LGPD. A conta `[demo] Clínica Vitrine` da Subetapa 02.13.a é a base pronta para isso.

### 1.2 O AMAQ como molde do instrumento (E6)

O instrumento de autoavaliação do acervo de gestão pública de Max serve de molde e traz três decisões de desenho já resolvidas: **subdimensão com peso declarado**; **escala 0–10 sem rótulo** — rotular influencia o respondente —; e o ciclo **autoavaliação → planejamento → intervenção**. Transcrição da estrutura em `design/benchmark/fontes/REFERENCIA_ODONTO_CEO.md`.

---

## 2. Posicionamento e receita

### 2.1 Publicar o preço da IA (E4)

**O mercado inteiro esconde.** Faixa observada: **R$ 180–437/mês** — o Simples Dental anuncia "a partir de R$ 6 por dia" (~R$ 180), o Santé Odonto cobra a partir de R$ 437, e o Clinicorp diz "sob consulta". Publicar é **diferencial de posicionamento com custo zero**, e é o único item caro que ninguém publica.

### 2.2 Decidir conscientemente sobre receita secundária (E3)

Os dois líderes têm uma, e são opostas:

| Prática | Quem | Parecer |
|---|---|---|
| Marketplace de contadores e agências | Clinicorp | **defensável** |
| Anúncio de terceiro dentro do modal de evolução clínica | Simples Dental | coloca publicidade na tela do ato clínico |
| Retenção do dinheiro do boleto em conta própria antes do saque | Simples Dental | transforma o fornecedor em custodiante do caixa do cliente |

A primeira é replicável; as outras duas não deveriam ser. Decisão de Max, registrada aqui para ser tomada de propósito e não por omissão.

### 2.3 O flanco jurídico é o argumento de venda que ninguém usa (E5)

`aba_health` com IBAC, `log_acesso` obrigatório em leitura **e** escrita, `concessoes_prontuario` e consentimento de imagem travando a leitura de anexo **já estão construídos e não aparecem em lugar nenhum** da comunicação do produto. Contra:

- os **30 meses** de retenção que o líder de mercado declara em contrato, frente aos **20 anos** que a Lei 13.787/2018 Art. 6º exige;
- o dado sensível de saúde de paciente brasileiro hospedado nos EUA por prazo indeterminado, declarado pelo segundo colocado.

Falta transformar isso em **três frases na página de venda** e numa tela de exportação (Subetapa 03.13). Detalhe em `docs/05_COMPLIANCE_E_ETICA.md` §5.7.

---

## 3. Migração é objeção de venda antes de ser recurso técnico (P3)

O concorrente **vende** "importação em 3 dias" e tem assistente próprio para isso (Clinicorp, vídeo CF13). Quem já usa outro CRM não avalia o Vitrine pelo que ele faz melhor — avalia pelo custo de sair de onde está. É por isso que o quarto eixo do questionário do §1 (facilidade de backup e migração) é o mais bem escolhido: ele mede exatamente a objeção que decide a venda.

O ativo que o Vitrine já tem nessa frente é `crm/scripts/provisionar_banco.mjs` (Subetapa 02.15), que reconstrói o schema inteiro a partir do repositório — base natural da CLI de clonagem de CRM-filho quando ela entrar em escopo.

---

## 4. Faixa de preço e modelo (referência do benchmark)

Registrado aqui porque a **Etapa 6 do roteiro** vende Bronze/Prata/Ouro/Diamante, e a Subetapa 03.9 constrói o mecanismo que torna o corte possível — **qual item entra em qual nível é decisão comercial de Max**, preenchida sem tocar em código. **Decisão dele de 2026-09-03: a matriz fica para o momento correto de configurar seus detalhes, e não bloqueia a Etapa 03.** O mecanismo nasce com todos os níveis liberando tudo; o corte passa a existir no dia em que a tabela for preenchida. A faixa abaixo é referência do benchmark, não compromisso.

| Plano | Faixa sugerida pelo benchmark | Recorte sugerido |
|---|---|---|
| Essencial | R$ 119–139/mês | pessoas, agenda, prontuário com odontograma, financeiro, WhatsApp com cota declarada |
| Completo | R$ 279–319/mês | + funil/CRM, automações, comissões, assinatura eletrônica, estoque |
| IA (complemento) | R$ 199–299/mês | agente de atendimento e triagem, **com preço publicado** |

Quatro padrões convergentes do mercado: faixa real de entrada **R$ 89–159**; teto publicado **R$ 320–370**; **teste grátis de 7 dias sem cartão** em todos os cinco brasileiros (é obrigatório, é o padrão convergente); e **ninguém publica o preço da IA**.

Três decisões de precificação que o benchmark sustenta, além de §2.1: **não cobrar o WhatsApp à parte** (é a queixa natural de quem compra um CRM cuja premissa é o WhatsApp); **não cobrar implantação obrigatória** (é o que separa os 13 dias de resposta e 71,9% de recompra do Clinicorp das 14 horas e 100% do Simples Dental); e **considerar cobrança por agenda, não por usuário** (modelo Santé — alinha preço a valor e não pune a clínica por cadastrar a recepcionista).

Números completos, com link e data de cada um, em `design/benchmark/RELATORIO.md` §4 e §6 e em `design/benchmark/fontes/COLETA.md`.
