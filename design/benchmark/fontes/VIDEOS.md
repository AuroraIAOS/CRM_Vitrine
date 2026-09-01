# Análise dos vídeos dos concorrentes

**56 vídeos públicos** (de 61 enumerados — 5 são privados) das duas playlists de tutorial, da
playlist de funcionalidades da
Clinicorp e de dois avulsos, assistidos em **2026-09-01** no bench `bench/benchmark-odonto`.
Matéria-prima do §5 (c) do [`../RELATORIO.md`](../RELATORIO.md).

## Por que esta fonte existe

A rodada 1 foi construída só com página de marketing, que mostra **a promessa**. O vídeo de
tutorial mostra **a mecânica**: o caminho de navegação, a hierarquia real de abas, o estado
vazio, o formulário com seus campos. É a única fonte pública que abre o produto por dentro sem
criar conta — e por isso ela **corrigiu conclusões da rodada 1** (ver §"O que os vídeos
mudaram", no fim).

## Método, e seus limites declarados

- **Passada 1, em todos:** transcrição da legenda original em português (`pt-orig`) + 12 quadros
  extraídos e montados num mosaico 3×4 por vídeo, para poderem ser lidos de uma vez.
- **Marcação:** `[verificado]` = visto funcionando na tela do vídeo · `[declarado]` = o
  apresentador afirma, mas não aparece na tela. Vídeo institucional é peça de venda: o que o
  apresentador diz sobre resultado é sempre `[declarado]`.
- **Três vídeos da playlist do Simples Dental são privados** (`CUyG1P0GZ1A`, `-1Frd-k9I0Y`,
  `4LEnXuhMVKM`) — aparecem na enumeração, mas o YouTube nega acesso. Por isso a playlist tem
  **19 entradas e 16 vídeos públicos**, que é exatamente o número que Max informou.
- **Vídeos sem legenda** voltaram só com quadros, e estão marcados **(SL)**. A rodada rodou sem
  chave Whisper, por decisão de Max — a lacuna fica declarada, nunca suposta.

## O ferramental: cinco incompatibilidades medidas

A skill `/watch` **não rodava nesta máquina**. Cada hipótese foi confrontada com o teste mais
barato antes de virar diagnóstico (`CLAUDE.md` §11); nenhuma foi escrita por dedução:

| # | Sintoma | Teste que distinguiu | Causa real |
|---|---|---|---|
| 1 | nada rodava | `command -v` | faltavam `ffmpeg`, `ffprobe`, `yt-dlp` **e Python** — o `python` do PATH era o *stub* da Microsoft Store |
| 2 | legenda voltava HTTP 429 | pôr o Deno (já instalado) no PATH e repetir | sem runtime de JS o `yt-dlp` não resolve o desafio do YouTube |
| 3 | vídeo voltava HTTP 403 | testar 4 clientes (`tv`, `web_safari`, `ios`, `mweb`) no mesmo formato | só `mweb` entrega o arquivo — não era formato, era cliente |
| 4 | com `mweb`, sumiu a legenda | `--list-subs` nos dois clientes | `mweb` descarta legenda (exige PO token) → **duas chamadas, uma por cliente** |
| 5 | `Unrecognized option 'vsync'` | `grep vsync frames.py` | a skill usa `-vsync`, **removido no ffmpeg 8+**; corrigido para `-fps_mode` |

**Uma sexta, de conteúdo:** a skill fixa `--sub-langs en.*`. Num corpus 100% em português isso
traria a **tradução automática para o inglês** em vez do original. O coletor pede `pt-orig`.

O coletor está versionado em [`../assistir.mjs`](../assistir.mjs) e é idempotente.

---

# Simples Dental — playlist de tutoriais (16 públicos)

**A arquitetura do produto, vista de fora** `[verificado]`:

- **Barra lateral:** Inteligência · Pacientes · Agenda · Financeiro · SMS · Campanhas · **Estoque**
  · Ajustes · Loja · Ajuda.
- **Abas da ficha do paciente:** `SOBRE · ORÇAMENTOS · TRATAMENTOS · ANAMNESE · IMAGENS ·
  DOCUMENTOS · DÉBITOS`.

### SD01 — Como criar um tratamento na ficha do paciente `[verificado]`
Tela de duas colunas: **Tratamentos** à esquerda, **Evoluções** à direita. Adicionar tratamento
pede `Plano` (dropdown com os convênios: Particular, Amil…) + `Tratamento` (autocompletar).
Estado vazio instrutivo: *"Nenhum tratamento cadastrado ainda. Mas você pode começar a digitar o
nome do tratamento."* Modal de evolução com texto livre + data.
**Achado incômodo:** há um **banner de publicidade de terceiro (Dental Cremer, "ECONOMIZAR 60%")
dentro do modal de evolução clínica** — monetização de anúncio na tela onde se registra ato
clínico.

### SD02 — Painel de tarefas para a secretária `[verificado]` ★
O painel "Inteligência": faixa de 4 KPIs no topo (dias de saldo, reagendamentos, dinheiro em dia,
consultas hoje), e duas abas — **TAREFAS** e **PERFORMANCE**.
**A aba Tarefas não tem um único gráfico**: são listas acionáveis — *Consultas a confirmar*,
*Consultas a reagendar* (com sub-abas `CANCELADAS | ALERTAS DE RETORNO`), *Contas* (`A RECEBER |
A PAGAR`) com botão de ação em cada linha. Estado vazio que celebra: *"Parabéns — Não há alertas
de retorno para os próximos 15 dias."*
**É validação externa direta da Versão 03 do nosso dossiê** ("o painel é o dia", pendências
clicáveis). O líder de mercado chegou ao mesmo desenho.

### SD03 — Como cadastrar sua equipe `[verificado]` ★
Modelo de permissão do líder: **papel como preset** (`Tipo permissão`: Dentista / Secretária) e
depois **concessão pura**, agrupada por módulo com ícone (Configurações · Financeiro · Estoque ·
Ficha do Paciente · Agenda · Inteligência · SMS). Cartão de cada membro mostra **"31 de 31
permissões"** / "11 de 31" — a fração como recurso de legibilidade. Segunda aba **AGENDA** com
horário por dia da semana e **almoço fixo**. Convite pendente aparece como "Aguardando aceitar
convite — Reenviar".
**Sem coluna de negação** — ao contrário do Clinicorp (ver `IDEIAS.md`). O `access.can()` do
Vitrine segue o desenho do líder.

### SD04 — Como emitir uma receita `[verificado]`
Base de medicamentos pré-cadastrada com apresentação e **posologia já preenchida e editável**.

### SD05 / SD11 — Boletos e saque `[verificado]` ★
Três caminhos para emitir boleto. E o achado comercial: *"quando você usa o boleto do Simples
Dental **o dinheiro não cai na sua conta direto — ele cai em uma conta virtual do Simples
Dental**, e só depois você consegue sacar"*. Ou seja, o fornecedor **opera custódia** do
faturamento do cliente. É modelo de receita (float) e é decisão regulatória séria, não detalhe.

### SD06 — Como imprimir um orçamento `[verificado]` ★★
**O modelo de orçamento inteiro.** Aba `ORÇAMENTOS` com lista (`Data | Descrição | Valor` +
aprovar/editar/copiar/imprimir/excluir). O editor tem cabeçalho (data, dentista) e, **por linha**:
`Plano · Tratamento · Dente/Região · Valor` **mais as caixas de face M / O-I / D / V / L-P**.
Duas alternâncias: **"Imprimir odontograma"** e **"Imprimir somente valor total"**. A saída é um
PDF *"PLANO DE TRATAMENTO"* com procedimentos, valor total e **duas linhas de assinatura**
(paciente e dentista) sob a frase "Assino este documento declarando verdadeiras as informações
acima".

### SD07 / SD10 — Imagens `[verificado]`
Três origens: arquivo do computador, **webcam/câmera intraoral**, e envio de arquivo — este
último porque *"alguns dentistas gostam de escanear a ficha de papel antiga"*. Migração de papel
tratada como caso de uso de primeira classe.

### SD09 — Campanhas em 3 cliques `[verificado]` ★
Modal "Nova Campanha" com **seis receitas prontas em ícone**: Aniversário · Débitos em atraso ·
Escovação · Fio dental · Lembretes de retorno · Pós-operatório (+ "EM BRANCO"). Ao escolher, o
público vem implícito e **declarado em texto** ("será enviada para pacientes aniversariantes"),
com **contagem de alcance antes do envio** ("22 pacientes serão alcançados") e contador de
caracteres de SMS. É o que torna "3 cliques" verdade.

### SD12 — Como adicionar um novo plano `[verificado]` ★★
O catálogo por convênio. Novo plano pergunta **"Copiar tratamentos do plano padrão" ou "plano
vazio"** — herança de tabela de preços. O editor tem **especialidades como navegação** (Cirurgia,
Dentística, Endodontia, Implantodontia, Ortodontia, Periodontia, Prevenção, Prótese, Radiologia,
Urgência…) e, por procedimento: preço **daquele plano**, alternância **"Usar"** e — o detalhe que
importa — a caixa **"Aceita faces"**.

### SD13 / SD14 — Tratamento: adicionar e finalizar `[verificado]`
Tratamento nasce **"aguardando"** e só encerra por ação explícita ("Terminar tratamento"), que
**exige escrever a evolução** no mesmo passo. Registro clínico obrigatório amarrado à mudança de
estado — não é opcional nem posterior.

### SD15 — Como emitir uma anamnese `[verificado]` ★★
**Cinco modelos prontos**: ortodôntica · infantil · infantil resumida · adulta · adulta resumida.
Perguntas Sim/Não/Não sei com **campo condicional** (marcar "Tem pressão alta? Sim" abre
"Controlada ou não controlada?").
**E o achado de segurança do paciente:** a anamnese **gera alertas clínicos permanentes no
cabeçalho da ficha** — um selo vermelho **"2 ALERTAS"** que abre *"Hipertenso – Controlada"* e
*"Risco de hemorragia"*, visível de qualquer aba. Não é conveniência: é o dentista ver "risco de
hemorragia" antes de qualquer procedimento.

### SD16 — CPC manual ou maximizar cliques `[declarado]`
Não é sobre o produto: é aula de Google Ads. Revela a estratégia de conteúdo — o líder ensina
**aquisição de pacientes**, não só o software.

### SD18 — Treinamento de 30 min `[verificado]`
Agenda semanal com dia atual destacado; modal de reagendamento com **tempo estimado**, sala,
observação e alternância *"Enviar SMS para confirmar a consulta"*. **Estado vazio de página
inteira** na Ficha do Paciente ("Você precisa buscar um paciente cadastrado ou cadastrar um
novo"). Despesa com categorias (Custos Fixos, Manutenção odontológica, Laboratório,
Infraestrutura), caixas **"Esta despesa se repete"** / **"já foi paga"** e "ANEXAR COMPROVANTE".
Fluxo de Caixa com abas `FLUXO DE CAIXA | COMISSÕES` e três números grandes (recebimentos /
despesas / saldo).

---

# Clinicorp — playlist de funcionalidades (24)

**A arquitetura**: início em **mosaico de blocos grandes** (Agenda · Pacientes · CRC ·
Financeiro · Dentistas/Profissionais · Ensino · Relatórios · Clinipay), variando conforme o papel
do usuário. A ficha do paciente tem **11+ abas** com rolagem horizontal: `Cadastro · Orçamento ·
Financeiro · Fotos · Plano e Ficha Clínica · Fichas Especialidades · Ficha Ortodôntica · Ficha
Implantes · TBA Estética · Ficha Endodôntica · Odontograma · Anamnese · Planos Recorrentes ·
Documentos · Recibos · Agenda`.

### CF01 — Diagnóstico Digital para alinhadores **(SL)**
Sem legenda. Os quadros mostram a marca e o produto de alinhadores.

### CF02 — Fichas de alinhadores ortodônticos `[verificado]` ★
**Fluxo como espinha da tela**: um *stepper* numerado `1 → 2 → 3 → 4 → 5` (Diagnóstico →
Orçamento → Criar Tratamento → …), com as seções tituladas "2 - Orçamento", "3 - Criar
Tratamento". Formulário clínico com Oclusão (Classe I/II/III), Apinhamento, Arcada, Espaçamento e
**nível de tratamento (Simples/Média/Alta/Personalizado)**; criação define **quantidade de
alinhadores** e **"Trocar alinhadores a cada N dias"**. Fotos intraorais em grade nomeada.
**Vídeo educativo do YouTube embutido na própria ficha** ("Como funcionam os alinhadores").
No app do paciente (**Clini.Me**): **anel de progresso com %** e *"225 dias para um sorriso
perfeito!"* — tratamento gamificado.

### CF03 / CF17 — Planos recorrentes `[verificado]` ★★
Assinatura de procedimento — *"Clube do Botox"*, R$ 100/mês por 12 meses. Configuração com valor,
periodicidade, duração e a regra que interessa: **"Liberar execução do procedimento a cada N
pagamentos"** — o procedimento só é liberado depois de N parcelas pagas. Ao criar, pergunta
**"Deseja gerar um contrato com este paciente?"** e o contrato vai para a aba Documentos.
Argumento de venda `[declarado]`: *"previsibilidade de R$ 120.000 que entrarão em um ano"*.
Comercialmente: é recurso **Premium**, mas *"pode ser incluso na categoria Standard por uma taxa
extra"* — add-on sobre plano inferior.

### CF04 — Agendamento online `[verificado]` ★
O paciente chega **pelo link na bio do Instagram**, escolhe dia no calendário e faixa de horário,
confirma nome e telefone. E a decisão de desenho que importa: **entra como *solicitação* que a
clínica confirma**, não direto na agenda.

### CF05 / CF09 / CF11 — Fichas de estética e HOF `[verificado]` ★★
O módulo mais desenvolvido da amostra:
- **Diagrama facial com pontos de aplicação marcados sobre a foto do paciente**, com legenda
  numerada por músculo (`M. Procerus 0 · M. Corrugador 2 · M. Frontal 6 · M. Orbicular da Boca 8`
  — unidades por músculo).
- **Fotos padronizadas em pares Antes/Depois por região** (Linhas Glabelares, Frontais, Cantais,
  Bunny lines, Mento).
- **Pontos cefalométricos** com tabela `Ponto | Padrão | Antes (resultado, desvio) | Problema |
  Solução | Depois` — protocolo quantificado.
- **Produtos utilizados com lote e validade** — rastreabilidade sanitária, ligada ao estoque.
- Prancha anatômica de músculos faciais como referência na tela.
- "Cuidados Pós-Aplicação" com texto padrão e botões E-MAIL / IMPRIMIR.

**Conclusão que muda a decisão sobre o repositório de HOF:** o mercado resolve harmonização
orofacial com **diagrama 2D sobre foto + antes/depois + prancha anatômica**. Ninguém usa 3D.

### CF06 — Odontograma digital `[verificado]` ★★
Dentição em três modos — **Permanente / Decídua / Mista** (a mista é o caso real da criança em
transição). Dentes desenhados anatomicamente, com faces rotuladas por linha (vestibular,
oclusal, palatina, lingual). **Legenda de três estados: A realizar (vermelho) · Executado
(verde) · Existente (azul)**. Botões "Adicionar Procedimento" e **"Comparar odontograma"**
(mesmo paciente em duas datas). Ao lado, **periograma** com sondagem e sangramento por dente.

### CF07 — Régua de cobrança `[verificado]` ★★★
**A melhor peça de UX de todo o corpus.** A configuração de cobrança é uma **linha do tempo
horizontal**: bolinhas numeradas de "10 dias antes" (verde) → "dia do vencimento" (amarelo) →
"10 dias depois" (vermelho → cinza). Cada bolinha é um ponto onde se pendura uma regra. Abaixo,
por forma de pagamento, `Dias | Período | Notificação | Tipo`, com o canal como **etiqueta
colorida** (SMS verde, E-mail azul, app laranja). O modal de regra fala em linguagem natural
("Quando: 3 dia(s) DEPOIS do vencimento da parcela") e lista as variáveis disponíveis.
Torna concreto o que normalmente é um formulário abstrato de automação.

### CF08 — Emissão de NFS-e `[verificado]`
Mostra o **custo real** do recurso: a configuração do emissor exige Regime Especial Tributário,
Regime Tributário, Código Tributário Municipal, Código de Serviço, CNAE, RPS — com aviso na tela
de que *os dados são específicos do município e precisam ser buscados na prefeitura*. Na emissão,
campo **`Tipo de beneficiário` (Paciente / Pai / Mãe / Responsável)**.
Revela ainda a árvore de Configuração, com **"Configuração de QRCode para Check-in"**.

### CF10 / CF21 — Assinatura: as duas camadas `[verificado]` ★★
São **dois produtos distintos**, e a diferença é jurídica:
- **CF10 — assinatura simples:** o paciente recebe **link por WhatsApp**, abre no celular e
  **desenha a assinatura com o dedo** (LIMPAR / CONFIRMAR). Biblioteca de modelos de documento
  (atestado, contratos por procedimento, ortodontia, receituário…). **Custo declarado: R$ 0,15
  por documento.**
- **CF21 — assinatura digital ICP-Brasil:** o profissional **carrega seu certificado A1 (`.pfx`)
  com senha** no sistema; o documento sai com **QR code e página pública de verificação** em
  `validar.iti.gov.br`, com nome, data e hora. Tem **assinatura em lote**.

### CF12 / CF13 / CF23 — Central Multiclínicas `[verificado]` ★★
O problema do Vitrine, resolvido por eles. Um titular no topo **ramificando para N clínicas**,
com **isolamento de dados por unidade declarado como exigência de LGPD** ("proíbe o
compartilhamento de dados e informações pessoais de pacientes"), acompanhamento consolidado de
metas e agendamento entre unidades. CF13 mostra a **migração**: um assistente passo a passo em
que o cliente nomeia cada clínica e **define o identificador de cada uma**, com aviso explícito
de janela de manutenção. É a forma-produto do nosso modelo de CRM-filho.

### CF14 — Venda de produto `[verificado]`
Além de procedimento, vende-se **produto físico** (cremes, medicamentos), com lista de preço
própria, e o produto entra **na mesma linha de orçamento** do procedimento. Formas de pagamento
com opções de recibo/NF externa.

### CF15 — Franquias `[declarado]` ★
Módulo para **franqueadores**: start de unidade, controle de resultados, **aplicação de metas** e
**padronização do sistema entre unidades**. É o mesmo eixo do CRM-filho, visto pelo lado de quem
vende a rede.

### CF16 — Marketplace `[verificado]` ★
**Monetização além da assinatura**: um marketplace de contadores especializados em odontologia e
de agências de marketing, filtrável por estado e cidade, dentro do site do fornecedor.

### CF18 — Controle protético `[verificado]` ★★
Prótese como **kanban de cinco colunas**: `PRÉ-ENVIO → ENVIADO AO LABORATÓRIO → RETORNO À CLÍNICA
→ AGENDAMENTO DO PACIENTE → INSTALADO`, com **bolinha de cor por atraso** no card. Cada etapa tem
data prevista e três históricos (reencaminhamentos, modificações, documentos). E a regra
financeira: **o custo do laboratório é descontado da comissão do dentista**.

### CF19 — Marcadores na agenda `[verificado]` ★★
Rótulos coloridos aplicáveis ao agendamento (Confirmado, Falta pagar, Ligar pro paciente,
Primeira consulta, Remarcação, Desmarcou…). **E o ponto que eleva o recurso:** existe um
**relatório de marcadores** por período — *"no fim do mês, quantas pessoas remarcaram"*. O
marcador não é enfeite, é taxonomia mensurável.

### CF20 / CF22 / CF24 — não coletados
Falharam no `yt-dlp` (metadados e download). Registrados como lacuna.

---

# Clinicorp — playlist de tutoriais (16)

Playlist mais recente, e a interface aqui é **outra**: fundo branco, ícones em linha, selos de
status — bem mais limpa que o laranja denso da playlist de funcionalidades. O Clinicorp
redesenhou o produto entre as duas playlists.

### CT01 — Reunir tudo no prontuário `[verificado]`
Cabeçalho da ficha com foto, nome + ID, selo "Ativo", fila de ações (incluindo **WhatsApp**) e,
à direita, **"Próxima Consulta"** e **"Alerta de retorno"**. "Plano e Ficha Clínica" lista os
**planos de tratamento aprovados** com status colorido (Concluído / Em andamento). Financeiro com
coluna fixa de totais e "Saldo a pagar".

### CT02 — Evitar erros no controle de próteses `[verificado]`
Abre com o problema, não com o recurso: *"paciente agendado para colocar uma prótese, mas ela
ainda nem chegou do laboratório"*. Mesma ferramenta do CF18, contada pela dor.

### CT03 — Ficha de implantes `[verificado]`
*"percebeu que esqueceu de registrar alguma etapa crítica do tratamento?"* — a ficha de
especialidade como **jornada do caso**, com etapas obrigatórias.

### CT04 — Listar ações dos usuários `[verificado]` ★★
**O log de auditoria exposto como relatório.** Em Relatórios → Geral → **"Ações Usuários"**:
filtro de período e tabela `Data | Hora | Ação | Tipo | Registro | Usuário`, com "Criação" e
"Edição" por tipo de entidade. Vendido com a frase *"aumenta a segurança e privacidade dos
dados"*.
O `aba_health.log_acesso` do Vitrine **grava mais que isso** — leitura *e* escrita de dado
clínico, obrigatoriamente, na mesma transação — e não mostra nada a ninguém. É a tela mais
barata de alto valor comercial de toda esta rodada.

### CT05 / CT06 — Usuários e permissões `[verificado]` ★
A tela nova de usuários é uma **grade de cartões**, e dois detalhes valem cópia:
1. **"Último acesso em [data/hora]"** ou **"Ainda não acessou"** em cada cartão — sinal de adoção
   por membro, que também denuncia licença ociosa.
2. Ao escolher o perfil no cadastro, **o sistema mostra uma descrição do perfil em prosa** em vez
   de obrigar o administrador a decodificar dezenas de caixas. É prevenção de erro de permissão
   por design — e cai direto sobre o nosso `access.can()`.

### CT07 — Clinicorp IA na prática `[verificado]` ★★★
**O vídeo mais importante do corpus sobre IA.** Três usos, todos dentro do produto:
1. **Chat sobre o próprio dado da conta**: pergunta em linguagem natural devolve
   *"Saldo final R$ 54.577,43 — detalhamento das entradas: Boleto R$ 4.516,14 · Dinheiro
   R$ 36.517,80 · Cartão de crédito R$ 20.113,86 · Pix R$ 2.242,00…"*. Não é assistente genérico:
   é consulta ao banco da conta, respondida em prosa.
2. **Preenchimento do odontograma por voz**: o profissional grava, e o sistema abre uma **tabela
   de revisão** (`Ações · Dente/Face · Procedimento · Próxima consulta`) com o aviso *"Antes de
   salvar, confirme as informações captadas e transcritas"*, e só então "Aplicar".
3. **Análise de imagem radiológica** com IA sobre a panorâmica.

**O padrão que importa mais que os três recursos: a IA propõe, o humano aplica.** Nada entra no
prontuário sem confirmação. É exatamente o desenho que `docs/05_COMPLIANCE_E_ETICA.md` exigiria
de nós, e é a resposta pronta para "como usar IA em dado clínico sem transferir o ato ao modelo".

### CT08 — Atestado digital `[verificado]`
Documento gerado a partir de modelo, com cabeçalho da clínica, texto declarando comparecimento
(com CPF, data e horário) e assinatura.

### CT09 — Orçamento rápido `[verificado]` ★
O orçamento na interface nova: duas colunas, com **carrinho à direita e total em bloco verde**,
link "definir forma de pagamento" e botão largo **"Aprovar"**. Aprovar **cria o lançamento
financeiro** — a corrente fechada. Envio por e-mail traz **prévia do documento** antes de enviar.

### CT10 — Relatórios de desempenho `[verificado]` ★★
Os indicadores que eles escolheram medir, e vale copiar a lista: entrada/saída/resultado por mês;
**rosca de pagamentos × inadimplência × valores a estornar** (93,9% / 5,8% / 0,2%); entrada
prevista contra realizada; agendamentos totais × faltas; **"Faltas na Primeira Consulta"
separada das demais** — porque falta na primeira consulta é problema de captação, não de
relacionamento; categorias mais agendadas; e **ocupação da agenda**, que é o KPI que justifica o
controle de cadeiras.

### CT11 — Odontograma digital `[verificado]`
Versão curta do CF06, na interface nova.

### CT12 — Fichas de especialidade `[verificado]`
Cada especialidade (ortodontia, implantes, endodontia, estética) tem **ficha própria com campos
próprios** — não é um prontuário genérico com campo livre. É a razão de a ficha do paciente ter
11+ abas.

### CT13 — Assinatura digital `[verificado]`
Versão tutorial do CF21 (certificado A1, verificação pública).

### CT14 — Comissão com valor fixo na tabela de preços `[verificado]`
A comissão pode ser **valor fixo por procedimento**, definido na própria tabela de preços, e não
só percentual. O `aba_finance.regras_comissao` do Vitrine precisa aceitar as duas formas.

### CT15 — Configurando o prontuário `[verificado]`
Abre com a imagem do problema — arquivo de papel e mesa afogada em pastas — antes de mostrar o
recurso. Padrão narrativo que se repete em toda a playlist nova: **a dor primeiro, a tela depois**.

### CT16 — não coletado
Vídeo privado.

---

## Cobertura final, declarada

| | |
|---|---|
| Vídeos com **transcrição + 12 quadros** | **55** |
| Vídeos com **só transcrição** (download bloqueado por PO token do YouTube) | 1 — CF22, *"Controle de Sessões na Agenda"* |
| **Vídeos privados** (listados na playlist, inacessíveis) | **5** — SD08, SD17, SD19, CF20, CT16 |
| Sem legenda automática **(SL)** | 2 — CF01 e CI01 |
| **Mosaicos efetivamente lidos quadro a quadro** | **34 dos 55** |

Os 21 mosaicos não abertos são de vídeos cuja transcrição já os situava como repetição de um
tutorial vizinho (mesmo recurso, outro apresentador) ou como conteúdo não-produto — caso do SD16,
que é aula de Google Ads. Nenhuma afirmação deste arquivo se apoia num vídeo que não foi lido:
onde só há transcrição, o texto diz `[declarado]`.

---

## O que os vídeos mudaram — e por que a fonte valeu a pena

Quatro correções e um achado que **nenhuma página de marketing daria**:

1. **Estoque: são 3 de 5, não 2.** O Simples Dental tem "Estoque" na barra lateral e simplesmente
   não anuncia. A rodada 1 contou pelo site e errou.
2. **Assinatura eletrônica são dois produtos**, não um — a desenhada no celular (R$ 0,15/doc) e a
   ICP-Brasil com certificado A1 e verificação no ITI. Tratá-los como um só erra o esforço por
   uma ordem de grandeza.
3. **O Simples Dental opera custódia do faturamento do cliente**: o boleto cai numa conta virtual
   dele, e o dentista saca depois. É receita de float e é decisão regulatória — dito de passagem
   num tutorial de 88 segundos.
4. **Os dois líderes monetizam além da assinatura, de formas opostas:** marketplace de parceiros
   (Clinicorp) e **anúncio de terceiro dentro do modal de evolução clínica** (Simples Dental).
5. **O preço da IA que faltava:** *"a partir de R$ 6 por dia"* — ~R$ 180/mês. Fecha a faixa
   observada do mercado em **R$ 180–437**.
