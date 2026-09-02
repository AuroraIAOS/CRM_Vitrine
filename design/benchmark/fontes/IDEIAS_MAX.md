# Ideias de Max — avaliação para MVP e versionamentos futuros

Seis ideias de desenvolvimento trazidas por Max em **2026-09-01**, mais um bloco de ideias de
futuro. Avaliadas contra o schema real do Vitrine (39 migrations), contra o que o benchmark
encontrou nos oito concorrentes, e contra o padrão já em produção no **CRM Sindcom**.

**Este arquivo avalia; não implementa.** Nada fora de `design/benchmark/` foi tocado.

**Origem que distingue esta fonte das outras:** Max foi **diretor de Saúde Bucal** de um município,
responsável por 33 clínicos gerais na Estratégia Saúde da Família e 8 especialistas num Centro de
Especialidades Odontológicas. As ideias abaixo não são hipóteses de produto — são problemas que
ele administrou.

---

## Quadro-resumo

| # | Ideia | Veredito | Por quê, em uma linha |
|---|---|---|---|
| 1 | **Caixa de entrada de exames e imagens por token** | **MVP** | diferencial que nenhum dos 8 concorrentes tem, e o padrão já está construído e depurado no Sindcom |
| 2 | **Assinatura do paciente por link multicanal** | **MVP** | exigência do CFO por procedimento; o concorrente faz só por WhatsApp e cobra por documento |
| 3 | **Envio do prontuário ao paciente** | **futuro**, como Max pediu | a *obrigação* já existe (Art. 18, I do CFO); o *mecanismo* precisa de desenho de LGPD antes |
| 4 | **Catálogo de procedimentos** | **MVP** | já era o item 3 do §5 (c); a novidade é a codificação |
| 5 | **Estoque de materiais e serviços** | **parte no MVP** | os *alertas* são o que importa e são baratos; o inventário completo é `+1.0` |
| 6 | **Tabela de métricas para a plataforma Aurora** | **MVP** | é a única que **não dá para adiar**: retroajustar coleta em N instâncias já vendidas é caro |

---

## 1. Caixa de entrada de exames e imagens por token

**O problema, como Max o descreve:** clínicas de exame e imagem mandam resultado **por e-mail**.
É a prática corrente e é um vetor de vazamento de dado sensível de saúde — exatamente a classe
que o Art. 11 da LGPD trata como especial e que o Art. 14 do Código de Ética Odontológica cobre
por sigilo.

**A solução idealizada:** link com token individual e rastreável → instância privada e temporária
→ arquivo cai numa **caixa de entrada do profissional** → o dentista analisa e **aceita** → só
então o arquivo migra para o prontuário permanente.

**Por que isso é forte:** o benchmark fichou oito concorrentes e **nenhum tem isso**. Todos
resolvem imagem por *upload* feito pela própria clínica (arquivo, webcam, escaneamento da ficha
de papel). O laboratório externo continua mandando e-mail. É uma lacuna de mercado inteira, com
argumento jurídico pronto.

### O padrão já existe, e já foi depurado — CRM Sindcom

O Sindcom resolve o mesmo problema para contadores enviarem folha de funcionários. As duas peças
de banco (`sql/20_comunicacao_externa.sql` e `sql/21_remessas_recepcao.sql`) são portáveis quase
sem tradução:

| Peça do Sindcom | O que faz | Tradução no Vitrine |
|---|---|---|
| `envios_campanha` | a **concessão**: `token uuid unique`, `token_expira_em` (padrão 90 dias), `token_revogado_em`, mais `enviado_em` / `primeira_remessa_em` / `ultima_remessa_em` | `aba_health.convites_exame` — token por laboratório e por paciente |
| `remessas_dados` | o **item da caixa de entrada**: `arquivo_path` em bucket privado, `status` em `recebida → validada → importada → rejeitada`, `ip_origem`, `user_agent`, `processada_em`, `processada_por` | `aba_health.exames_recebidos` — a máquina de estados é a mesma que Max descreveu ("aceita" = `importada`) |
| `tentativas_remessa` | o **freio** do endpoint público, com `motivo` enumerado (`token_inexistente` / `expirado` / `revogado` / `arquivo_invalido`) | idem, sem mudança |

**Três lições medidas que vêm de brinde** — e é por isso que Max mandou estudar o repo:

1. **O freio é por token, nunca pela entidade.** O comentário do Sindcom explica: travar a
   *contabilidade* permitiria a um atacante **silenciar um contador legítimo só errando token de
   propósito**. Traduzido: travar o *laboratório* deixaria qualquer um bloquear o envio de
   exames de uma clínica inteira. É DoS por design evitado.
2. **Bucket privado com `public = false`, mais `file_size_limit` e `allowed_mime_types` no
   próprio Storage** — segunda camada, independente da validação da Edge Function. Se a checagem
   da função quebrar num refactor futuro, o Storage ainda recusa.
3. **A armadilha que só a medição pegou:** `storage.objects` com RLS ligada e **zero policies**
   bloqueia o `authenticated` inteiro, não só o `anon` — e o sintoma é **"Object not found"**,
   que *parece arquivo inexistente, não permissão negada*. Quem construir a tela de leitura sem
   saber disso perde horas caçando o arquivo errado.

**Onde encosta:** `aba_health` (bucket `anexos-clinicos` já existe, com `pode_acessar_anexo()`),
`aba_people.fornecedores` (o laboratório é fornecedor) e uma Edge Function pública nova —
mesma classe do `whatsapp-webhook`, que já sabemos endurecer.

**Ressalva de escopo:** é a ideia mais cara das seis. Se o MVP apertar, o corte natural é
entregar **só o caminho do paciente** (o próprio paciente envia a imagem por link) e deixar o
laboratório para `+1.0` — mas a caixa de entrada com aceite explícito deve nascer junto, porque
é ela que impede o arquivo de terceiro de cair direto no prontuário.

---

## 2. Assinatura do paciente por link multicanal

**Contexto de Max:** CRO e CFO exigem o registro de todo procedimento no prontuário com
assinatura do paciente e do profissional.

**O que o benchmark mostrou** (`VIDEOS.md`, CF10 e CF21): o Clinicorp tem **duas** camadas —
a assinatura desenhada com o dedo, enviada **só por WhatsApp**, a **R$ 0,15 por documento**; e a
ICP-Brasil com certificado A1 do profissional, com QR code e verificação pública no ITI.

**A ideia de Max melhora a primeira em dois eixos:**

- **Multicanal** — WhatsApp **+ e-mail + SMS**. O concorrente tem um canal só. Paciente idoso sem
  WhatsApp, ou clínica cujo número caiu na janela de 24 h, hoje simplesmente não assina.
- **Token rastreável, revogável e com expiração programada**, no padrão do Sindcom — que o
  concorrente não anuncia ter. Um link de assinatura sem expiração é um documento assinável para
  sempre por quem tiver o link.

**Onde encosta:** a mesma tabela de token do item 1 (`token`, `token_expira_em`,
`token_revogado_em`, `tentativas_*`) serve aos dois. **Construir uma vez, usar em dois lugares** —
é o argumento mais forte para fazer os dois no mesmo ciclo.

E encosta em `aba_health.consentimentos`, que **já existe** e hoje não tem tela.

**A camada ICP-Brasil (certificado A1) fica para `+1.0`** — é o que a Lei 13.787/2018 Art. 2º §2º
prefere, mas exige guarda de certificado do profissional, que é problema de custódia de chave
privada. Não é MVP.

---

## 3. Envio do prontuário ao paciente

Max pediu explicitamente para **deixar provisionada**, e está certo. Duas observações que ajudam
a decisão futura:

- **A obrigação já existe e é do dentista, não do software.** O **Art. 18, I** do Código de Ética
  Odontológica torna infração *"negar, ao paciente ou periciado, acesso a seu prontuário, deixar
  de lhe fornecer cópia quando solicitada"*. Ou seja: não é recurso opcional, é cumprimento de
  dever profissional. O software que facilita isso reduz risco ético do cliente.
- **O ponto sensível não é gerar o PDF, é entregar.** Um prontuário completo com imagens é o
  documento mais sensível do sistema. Entregar por link exige o mesmo token do item 1, com
  expiração curta, e provavelmente uma segunda prova de identidade — porque quem pede o
  prontuário por telefone pode não ser o paciente.
- Já está no §5 (c) do relatório como item 7 ("exportação do prontuário pelo dono da conta"), que
  é o caso **mais simples** (o dentista exporta). O caso de Max (**o paciente solicita**) é o
  degrau seguinte.

---

## 4. Catálogo de procedimentos

**Já é o item 3 do §5 (c)** — o elo do catálogo na corrente
*catálogo → odontograma → orçamento → financeiro*. A ideia de Max acrescenta duas coisas:

1. **A lista do SUS como semente.** O `fontes/procedimentos.txt` que Max já pôs no repo tem
   **84 procedimentos** da Atenção Básica. É uma base honesta para o cadastro inicial de qualquer
   clínica — muito melhor que a tela vazia com que o cliente começa hoje.
2. **KPIs por procedimento.** O benchmark mostrou (`VIDEOS.md`, CT10) que o concorrente mede
   "categorias mais agendadas". Com o catálogo estruturado, isso sai de graça.

**Onde encosta:** `aba_catalog.servicos` e `variantes_servico` **já existem**. O que falta é a
semente e a marca **"aceita faces"** (item 3 do §5 c), que liga o catálogo ao odontograma.

**Um acréscimo que a pasta de referência de Max torna possível — ver a lista de aprovação no fim
deste arquivo:** a mesma lista de procedimentos existe lá **com o código SIGTAP** de cada um
(`Aplicação de cariostático → 0101020058`). Código nacional padronizado é o que torna o catálogo
interoperável — mesma função que o TUSS cumpre no setor privado.

---

## 5. Estoque de materiais (permanentes e consumíveis) e serviços de terceiros

**O argumento de Max é o melhor das seis ideias**, e vale citar: *"vira um problema sério se o
profissional descobre que seu estoque de anestésico está zerado ou se uma manutenção está vencida
no dia da fiscalização sanitária"*.

Isso reposiciona o módulo. O benchmark tratava estoque como **gestão**; Max mostra que ele é
**conformidade sanitária**. São coisas diferentes: gestão pode esperar, fiscalização não.

**O que o benchmark encontrou de estoque nos concorrentes:**

| | |
|---|---|
| Clinicorp | controle de estoque com validade; **controle protético** como kanban à parte |
| EasyDental | estoque + controle de protéticos, no plano de R$ 219 |
| Simples Dental | tem "Estoque" na barra lateral — **e não anuncia no site** (achado do vídeo SD18) |
| Santé, Dental Office, os 3 internacionais | não têm |

E nenhum deles cobre **serviço de terceiro com vencimento** (calibragem, manutenção, dedetização,
contrato). Essa metade é lacuna de mercado.

**Recomendação de recorte:**

- **MVP — só os alertas.** Uma tabela de itens com `validade`, `quantidade_minima` e
  `proximo_vencimento`, mais um job de alerta. É barato, e é o que evita o desastre que Max
  descreve. O painel de tarefas (item 12 do §5 c) já tem onde mostrar.
- **`+1.0` — o inventário completo:** entrada e saída, lote, vínculo com
  `aba_people.fornecedores` (**que já existe**), e o kanban de prótese (item 21 do §5 c), que
  reusa o componente de `aba_sales.etapas_funil`.
- **`+1.0` — o "banco de materiais e serviços modelo"** que Max propõe a partir de atas de
  licitação pública. É bom e é viável: ata de registro de preço é **documento público**. Ver a
  lista de aprovação no fim deste arquivo.

---

## 6. Tabela de métricas e a plataforma Aurora

**A única das seis que não dá para adiar.** O motivo é estrutural: quando houver N CRMs-filhos
vendidos e rodando, retroajustar coleta de métrica em todos eles é uma migração coordenada em N
bancos. Nascer com a tabela custa quase nada; acrescentá-la depois custa caro em cada instância.

**O desenho que a ideia pede, e as três travas que ele precisa ter:**

1. **A tabela guarda contagem, nunca linha de dado.** Não é "anonimização" (que é reversível e
   dá trabalho provar) — é **agregação na origem**: a tabela só aceita número e categoria.
   Estruturalmente incapaz de vazar dado personalíssimo, não apenas proibida de fazê-lo. Essa
   distinção é o que sustenta a frase do Termo de Uso.
2. **A cláusula no Termo de Uso é obrigatória e precisa ser específica.** Max já previu isso.
   Vale acrescentar: dizer *quais* métricas, não "métricas de uso".
3. **Métrica agregada de clínica ainda é informação comercial sensível.** Faturamento e número de
   pacientes de uma clínica não são dado pessoal, mas são segredo de negócio dela. O consolidado
   entre CRMs-filhos é seguro; o dado individual identificável por clínica precisa da mesma
   régua de acesso que o resto — `access.can()`, não "quem tem a URL do painel Aurora".

**O uso local que Max descreve é o melhor argumento de venda da tabela**, e é imediato: a série
temporal permite correlação. O exemplo dele merece ser citado porque é bom —
*"correlação positiva entre campanha e aumento de reclamações pode indicar que o setor de
comunicação não está atendendo os leads que a campanha trouxe, e a campanha está gerando
marketing negativo"*. Isso é análise que o concorrente não oferece: eles mostram o número, não a
relação entre números.

**Quais métricas, a partir do que o benchmark viu medir** (`VIDEOS.md`, CT10 e SD02):
faturamento; nº de clientes ativos; nº de profissionais; nº de procedimentos por categoria;
**taxa de falta** (que exige o valor `faltou` no enum — item 4 do §5 c); **taxa de falta na
primeira consulta**, separada; **ocupação da agenda**; taxa de conversão de orçamento;
inadimplência; nº de mensagens enviadas.

---

## Ideias para o futuro — programa de teste com a universidade

Registrado aqui e apontado em [`../DIRETRIZES_FORA_DO_BENCHMARK.md`](../DIRETRIZES_FORA_DO_BENCHMARK.md),
porque é plano de validação de produto, não de benchmark.

Max tem acesso a uma universidade e a uma rede de profissionais, e propõe dois grupos: dentistas
convidados (pagos com acesso vitalício) e alunos participando de um estudo de desenvolvimento
tecnológico (pagos com desconto vitalício escalonado — 100% para o TOP 3, 50% para o TOP 10, 50%
por 12 meses para o TOP 15), com curso, palestra e certificado de horas acadêmicas.

**Dois reparos que valem antes de executar:**

- **Estudo com alunos e questionário estruturado costuma pedir comitê de ética** quando o
  resultado vira publicação ou quando se coletam dados dos participantes. Se for só avaliação de
  produto para uso interno, não; se virar artigo ou trabalho acadêmico, provavelmente sim. Vale
  confirmar com a instituição antes de prometer certificado.
- **Teste de CRM clínico com aluno não pode usar paciente real.** O ambiente precisa nascer com
  dado de demonstração; caso contrário, prontuário de paciente real entra num sistema em teste,
  operado por quem ainda não é profissional habilitado — o que colide com o Art. 14 do Código de
  Ética (sigilo) e com a LGPD.

**Os cinco eixos de questionário que Max define estão certos** e um deles é especialmente bem
escolhido: **"facilidade em backup e upload de dados, visando facilitar a migração de quem vem de
outro CRM concorrente"**. O benchmark reforça: o Clinicorp promete importação em 3 dias e vende
migração assistida como recurso (`VIDEOS.md`, CF13). Migração é objeção de venda antes de ser
recurso técnico.

**Existe um instrumento pronto que serve de molde** — ver a lista de aprovação abaixo.

---

## O acervo de gestão pública — aprovado e transcrito

A pasta `Odonto_CEO` (620 arquivos) foi **lida integralmente**. Max aprovou seis itens em
**2026-09-01**, com a instrução *"transcreva só as estruturas"*.

**Nenhum arquivo do acervo entrou neste repositório.** O que existe é a transcrição das
estruturas em [`REFERENCIA_ODONTO_CEO.md`](REFERENCIA_ODONTO_CEO.md):

| # | Estrutura | Onde reforça |
|---|---|---|
| 1 | **Códigos SIGTAP** por procedimento, e a pactuação por grupo com meta mensal | itens 3, 22 e 23 do §5 (c) — e revela o campo irmão de "aceita faces": **unidade de lançamento** (`dente`/`sextante`/`arcada`/`sessão`) |
| 2 | **Esquema da tabela de estoque** (`Código · Princípio · Fabricante · Lote · Validade · Alerta`) | item 21 — e sugere separar *item de catálogo* de *lote em estoque* |
| 3 | **Taxonomia de serviços de terceiros** em 4 categorias, com os equipamentos de ciclo de vida | item 21 — a metade que **nenhum dos 8 concorrentes tem** |
| 4 | **23 POPs + as 14 seções do PGRSS** | item 21 — converte "estoque" em **conformidade sanitária**, que é a tese de Max |
| 5 | **Fluxo de referência e contrarreferência** com máquina de estados | **lacuna de mercado nova** — ver abaixo |
| 6 | **AMAQ**, molde do instrumento de autoavaliação | os questionários do programa da universidade |

### O que o acervo acrescentou que o benchmark não tinha

**Um recurso novo, que nenhum dos oito concorrentes modela: o encaminhamento com
contrarreferência.** Clínica privada que trabalha com especialistas tem o mesmo ciclo do CEO —
clínico geral encaminha, especialista atende, o caso volta para conclusão e manutenção. O que
existe no mercado é encaminhamento como texto livre na evolução clínica. Um encaminhamento com
**estado** (`encaminhado → aceito → em atendimento → contrarreferenciado`), formulário nas duas
pontas e pré-requisito clínico declarado (*"só encaminha com dor eliminada e infecção sob
controle"*) é lacuna inteira — e reusa o token do item 19 quando o especialista for externo.
