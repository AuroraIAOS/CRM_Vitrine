# Estruturas de referência da gestão pública em Saúde Bucal

Transcrição de **estruturas** extraídas do acervo técnico e administrativo de Max como **diretor
de Saúde Bucal** de um município — 33 clínicos gerais na Estratégia Saúde da Família e 8
especialistas num Centro de Especialidades Odontológicas (CEO).

**Autorizado por Max em 2026-09-01**, com a instrução explícita: *"transcreva só as estruturas"*.

## O que este arquivo é, e o que ele não é

- **É** a forma dos dados: nomes de campo, taxonomias, sequências de processo, escalas.
- **Não é** cópia de arquivo. **Nenhum arquivo do acervo entrou neste repositório.**
- **Não contém dado pessoal.** As planilhas de fila de atendimento (nome, nascimento e telefone
  de pacientes), o formulário cadastral de servidores (nome dos pais, endereço, tipo sanguíneo,
  alergias) e as pastas de RH, contatos, processos e comunicação foram **lidas e descartadas**.
  A lista do que foi recusado, e por quê, está na conversa desta sessão.
- As normas federais citadas são **públicas** e entram por referência, nunca por cópia.

## Por que esta fonte pesa diferente das outras

O benchmark fichou o que os concorrentes **vendem**. Esta fonte mostra como o serviço
odontológico **é operado e fiscalizado no Brasil** — por quem respondeu por ele. Três coisas só
aparecem aqui: a codificação nacional dos procedimentos, a estrutura da conformidade sanitária
(POP e PGRSS) e o fluxo de referência e contrarreferência entre níveis de atenção.

---

## 1. Catálogo de procedimentos com código nacional (SIGTAP)

**De onde:** planilha de pactuação de produção do CEO.
**Uso:** semente do `aba_catalog`, com coluna de código. Complementa o
[`procedimentos.txt`](procedimentos.txt) que Max já pôs no repo (84 nomes, sem código).

**A estrutura tem duas camadas, e a segunda é a interessante:**

```
grupo de pactuação  →  meta mensal  →  [ procedimento · código SIGTAP ]
```

| Grupo | Meta mensal pactuada | Nº de procedimentos no grupo |
|---|---|---|
| Procedimentos básicos | 110/mês | 14 |
| Periodontia | 90/mês | 5 |
| Endodontia | 60/mês | 8 |
| Cirurgia oral | 90/mês | ~35 |

**Amostra do par `procedimento · código`** (o padrão, não a lista inteira):

| Procedimento | Código SIGTAP |
|---|---|
| Aplicação de cariostático (por dente) | `0101020058` |
| Aplicação de selante (por dente) | `0101020066` |
| Aplicação tópica de flúor (individual por sessão) | `0101020074` |
| Restauração de dente permanente anterior | `0307010031` |
| Restauração de dente permanente posterior | `0307010040` |
| Raspagem alisamento e polimento supragengivais (por sextante) | `0307030016` |
| Obturação em dente permanente unirradicular | `0307020061` |
| Retratamento endodôntico em dente permanente birradicular | `0307020088` |
| Exodontia de dente permanente | `0414020138` |
| Remoção de dente retido (incluso/impactado) | `0414020251` |

**Três leituras de produto:**

1. **O código nacional é o TUSS do setor público.** Ter a coluna torna o catálogo interoperável
   e prepara o terreno para o item 29 do §5 (c) (TISS/TUSS) sem retrabalho de modelo.
2. **A unidade de cobrança está no nome do procedimento** — *"por dente"*, *"por sextante"*,
   *"individual por sessão"*, *"por elemento"*. Isso confirma, por caminho independente, a
   necessidade da marca **"aceita faces"** (item 3 do §5 c) e sugere um campo irmão:
   **unidade de lançamento** (`dente` / `sextante` / `arcada` / `sessão` / `elemento`).
3. **"Meta mensal por grupo de procedimento" é recurso, não só contexto público.** Clínica
   privada com sócios ou com meta por especialidade tem o mesmo problema. Encosta na tabela de
   métricas (item 22 do §5 c).

---

## 2. Esquema da tabela de estoque

**De onde:** planilha "Lista geral de produtos" — cabeçalho apenas. As linhas (nome de
fornecedor e preço de compra pública) **não foram transcritas**.

```
ID · Código · Nome · Princípio · Fabricante · Lote · Validade · Quantidade · Alerta
```

**O que cada coluna ensina, comparado ao que os concorrentes fazem:**

| Coluna | Leitura |
|---|---|
| `Código` | código de catálogo próprio, independente do fabricante — permite trocar de fornecedor sem perder histórico |
| `Princípio` | princípio ativo, separado do nome comercial. Anestésico é o exemplo óbvio: o que falta não é "a marca X", é **articaína** |
| `Fabricante` | e a planilha real mostra o mesmo item com fabricantes diferentes — **um produto, N fornecedores** |
| `Lote` + `Validade` | rastreabilidade sanitária. O benchmark viu isso no Clinicorp para injetável (`VIDEOS.md`, CF05) |
| `Alerta` | **limiar por item**, não global. É o que transforma a tabela em vigilância |

**A modelagem que isso sugere** (não é o que a planilha faz — é o que ela revela que falta):
separar **item de catálogo** (código, nome, princípio, unidade) de **lote em estoque** (fabricante,
lote, validade, quantidade). Um para muitos. A planilha achata os dois numa linha só, e por isso
repete o mesmo produto várias vezes.

---

## 3. Taxonomia de serviços de terceiros e materiais permanentes

**De onde:** planilha de levantamento de serviços e itens das unidades. Transcritas as categorias
e os itens genéricos; **os quantitativos por unidade não foram transcritos**.

Quatro categorias, e é a taxonomia que **nenhum dos oito concorrentes tem**:

### A. Serviços de construção e reparo estrutural
Remover porta/janela · remover parede · construir parede ou fechar vão · construir/reparar
**bancada com cuba e torneira de acionamento por pedal** · construir casinha para o compressor ·
**construir rede elétrica, hidráulica e de ar para cadeiras odontológicas** · grade de proteção.

### B. Serviços elétricos, hidráulicos e afins
Conferir/reparar a rede da **cadeira odontológica**, do **compressor**, da **autoclave**, do
ar-condicionado, do computador, da internet e do **escovódromo**.

### C. Serviços de instalação
Instalar cadeira odontológica · compressor · ar-condicionado · **torneira de acionamento por
pedal** · prateleira · porta papel-toalha · dispensador de sabão · **suporte para descarpax** ·
suporte para autoclave · segredo de fechadura · toldo · lâmpadas.

### D. Compras (materiais permanentes)
**Autoclave (24 L, 110 V)** · ar-condicionado · transformador de tensão · **mocho odontológico** ·
torneira de pedal · grade de segurança · cadeados · porta papel-toalha · dispensador de sabão ·
mesa e cadeira de escritório · computador · estabilizador · cabo de rede · **armário vitrine**.

**A leitura de produto:** as categorias B e C descrevem **equipamento com ciclo de vida** —
cadeira, compressor, autoclave, ar-condicionado. Cada um tem instalação, manutenção periódica e,
no caso da autoclave, **calibragem com validade**. É a metade "serviços de terceiros" do item 21
do §5 (c), e ela não existe em nenhum concorrente fichado.

---

## 4. Estrutura de conformidade sanitária: POP e PGRSS

**De onde:** POP e PGRSS do CEO — **títulos de seção apenas**, nenhum conteúdo transcrito.

### 4.1 Os POPs que uma clínica odontológica mantém

O documento é declarado como *"baseado na Lei 13.317"*. Vinte e três procedimentos operacionais
padrão, em cinco blocos:

| Bloco | POPs |
|---|---|
| **Princípios** | Princípios gerais da limpeza e desinfecção |
| **Mãos e paramentação** | Lavagem simples das mãos · Higienização antisséptica alcoólica · Preparo cirúrgico de mãos e antebraços · Gorro, máscara e luvas · Avental de uso clínico · Uso único (descartáveis) · Barreiras plásticas: aplicação e troca |
| **Ciclo da autoclave** | Acondicionamento dos artigos · Carregamento · Operação · Esterilização · **Abortamento de ciclo** · Armazenamento dos artigos esterilizados · **Autoclave: controle de manutenção** |
| **Ambiente e artigos** | Limpeza e desinfecção de artigos e instrumentais · Limpeza dos ambientes · Superfície/piso com matéria orgânica · Lavatório · Esponja e escova sintética · Equipamentos periféricos · Após o atendimento |
| **Resíduos** | Disposição dos resíduos de serviços de saúde |

**Dois desses títulos são recurso de software, não papel:**
**"Abortamento de ciclo de esterilização"** é um evento que precisa de registro datado — se a
autoclave abortou, o material daquele ciclo não está estéril. E **"Autoclave: controle de
manutenção"** é vencimento com data, exatamente o que o item 21 do §5 (c) vigia.

### 4.2 Estrutura do PGRSS

Plano de Gerenciamento de Resíduos de Serviços de Saúde, em 14 seções:

```
1. Identificação          8. Transporte externo
2. Objetivos              9. Tratamento
3. Definições            10. Armazenamento externo
4. Classificação dos resíduos      11–12. (higiene ocupacional / capacitação)
5. Identificação e quantificação   13. Outros procedimentos
6. Rotinas de manejo               14. INDICADORES
   (segregação/acondicionamento/identificação)
7. Transporte interno
```

E os campos operacionais que o plano exige e que um software vigiaria: **periodicidade da coleta**
(o documento registra padrões como *"4 vezes por dia, 7 dias por semana"*, *"1× semanal"* e
*"trimestral"*), **empresa coletora contratada**, e **quantificação por peso**.

**A conclusão de produto:** POP e PGRSS não são documento morto — são **obrigações com data de
validade e responsável**. Um módulo que rastreia vigência de POP, periodicidade de coleta e
contrato de coletora transforma o item 21 do §5 (c) de "gestão de estoque" em **conformidade
sanitária**, que é a tese de Max e é mais forte.

---

## 5. Fluxo de referência e contrarreferência

**De onde:** protocolo do Departamento de Saúde Bucal e os critérios gerais de referência ao CEO.
Transcrito o fluxo; nomes de unidade e de pessoa **não foram transcritos**.

### A rede em quatro níveis

| Nível de atenção | Porta de entrada |
|---|---|
| Urgência e emergência | pronto-atendimento |
| Clínica geral e acompanhamento | unidade básica / ESF |
| Procedimentos especializados | Centro de Especialidades Odontológicas |
| Alta complexidade | hospital de referência |

**Referência** sobe o nível; **contrarreferência** devolve o paciente ao nível de origem.

### A máquina de estados do encaminhamento

O protocolo descreve um ciclo fechado, e é isso que interessa ao produto:

1. **Pré-requisito clínico** — o paciente só é encaminhado com **dor eliminada e infecção sob
   controle** (adequação do meio bucal, terapia periodontal básica, remoção de focos, selamento
   provisório). Urgência **não** se encaminha: resolve-se na origem.
2. **Guia de encaminhamento** preenchida, assinada e carimbada pelo profissional solicitante,
   com identificação da unidade de origem, do paciente e do serviço solicitado — **em duas vias**:
   uma fica no destino, outra volta preenchida para a origem.
3. **Interesse do paciente confirmado antes do encaminhamento** — a primeira linha do protocolo.
4. **Prioridade na fila do destino:** retornos antes de casos novos.
5. **Contrarreferência ao fim do tratamento**, com identificação do profissional e do que foi
   realizado, devolvendo o paciente à origem para conclusão e manutenção.
6. **Falta com justificativa** permite remarcação na própria sede ou por telefone.

**A leitura de produto:** clínica privada que trabalha com especialistas tem exatamente esse
ciclo — clínico geral encaminha, especialista atende, o caso volta. **Nenhum dos oito
concorrentes fichados modela isso.** O que existe no mercado é encaminhamento como texto livre
na evolução. Um encaminhamento com **estado** (`encaminhado → aceito → em atendimento →
contrarreferenciado`), formulário nas duas pontas e pré-requisito clínico declarado é lacuna de
mercado — e reusa o token do item 19 do §5 (c) quando o especialista for externo à clínica.

---

## 6. AMAQ — molde do instrumento de autoavaliação

**De onde:** instrumento oficial do Ministério da Saúde (AMAQ-CEO, ligado ao PMAQ).
**Uso:** molde para os questionários do programa de teste com a universidade
([`IDEIAS_MAX.md`](IDEIAS_MAX.md) → Ideias para o futuro).

### Arquitetura do instrumento

```
Unidade de Análise  →  Dimensão  →  Subdimensão (A–M)  →  Padrão de Qualidade
```

| Unidade de análise | Dimensão | Subdimensões |
|---|---|---|
| **Gestão** | Gestão municipal/estadual | A Implantação e implementação · B Organização e integração da rede · C Gestão do trabalho · D Participação, controle social e satisfação do usuário |
| | Gerência da unidade | E Apoio institucional · F Educação permanente · G Gestão do monitoramento e avaliação |
| | Estrutura | H Infraestrutura e equipamentos · I Insumos e instrumentais |
| **Equipe** | Perfil, processo de trabalho e atenção integral | J Perfil da equipe · K Organização do processo de trabalho · L Atenção integral · M Participação, controle social e satisfação do usuário |

### Três decisões metodológicas que valem copiar

1. **Subdimensão com peso declarado.** Cada uma vale um número de pontos fixado (por exemplo, a
   subdimensão A vale 90 pontos e a B, 40). O respondente sabe o peso do que está avaliando.
2. **Escala de 0 a 10 deliberadamente SEM rótulo.** O instrumento explica a escolha: rotular as
   categorias ("bom", "regular", "ruim") **influencia a percepção do respondente**. A escala é
   não comparativa — cada padrão é avaliado por si só.
3. **A autoavaliação é a primeira etapa de um ciclo, não um fim.** O documento estrutura
   *momentos autoavaliativos → planejamento → intervenção*. Questionário que não gera plano de
   ação não fecha o ciclo.

**Aplicação direta aos cinco eixos que Max definiu** (funcionalidades · UX/UI · segurança ·
facilidade de backup e migração · outros): cada eixo vira uma subdimensão com peso, cada pergunta
vira um padrão avaliado de 0 a 10 sem rótulo, e o resultado vira plano de ação priorizado pelo
produto do peso pela distância até 10.

---

## Norma citada nesta página

Todas públicas, referenciadas e não copiadas:

- **Lei 13.317/2016** — base declarada dos POPs de biossegurança.
- **PGRSS** — exigência de plano de gerenciamento de resíduos de serviços de saúde.
- **SIGTAP** — tabela de procedimentos do SUS (Ministério da Saúde).
- **AMAQ-CEO / PMAQ** — instrumento de autoavaliação do Ministério da Saúde.
- **Resolução CFO 118/2012** — Código de Ética Odontológica, já citado em
  [`COLETA.md`](COLETA.md) com artigo e link.
