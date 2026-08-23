# Catálogo de referências

O que foi consultado, e **o que copiar de cada um**. Um catálogo de referência que só lista
nomes não serve para nada; cada entrada aqui termina num padrão concreto e no achado de
`../01_DIAGNOSTICO.md` que ele resolve.

Marcação de proveniência, porque nem toda linha tem o mesmo peso de prova:
**[verificado]** — conferido em fonte pública nesta sessão, com link ·
**[conhecido]** — padrão consolidado e estável do setor, sem verificação nesta sessão ·
**[a conferir]** — vale olhar o produto ao vivo antes de decidir.

---

## 1. CRMs líderes — o que o mercado global consolidou

### Attio · https://attio.com
O CRM com a melhor interface em operação hoje, e a referência mais próxima do que o Vitrine
quer ser: dado estruturado, denso, rápido, sem parecer planilha. **[verificado]** — resenhas
de 2026 convergem em apontá-lo como o melhor UI de CRM, com layouts flexíveis no estilo
Notion e objetos customizados.

**Copiar:**
- **Navegação por teclado como padrão, não como recurso.** `⌘K` abre tudo; a lista se percorre
  com `j`/`k`. → N03, `05_CAMINHOS.md` §5.
- **Densidade real e ajustável** na tabela, com altura de linha que muda de verdade. → F02.
- **Ficha de registro como "tudo sobre esta pessoa em uma tela"**, com a linha do tempo
  unificada no centro. → `04_PADROES_DE_TELA.md` §6.

### Pipedrive · https://pipedrive.com
O funil visual, feito por quem vende. **[verificado]** — a análise de mercado de 2026 destaca
a conversão etapa a etapa **com tempo-na-etapa** como a visualização que responde mais
perguntas que qualquer outra num CRM.

**Copiar:**
- **Tempo na etapa no card**, mudando de cor conforme envelhece. É o achado K03, e é a única
  coisa que transforma o kanban de lista bonita em ferramenta de gestão.
- **Motivo de perda obrigatório** ao marcar um negócio como perdido. → K02.
- **Cabeçalho de coluna com contagem e soma**, que o Vitrine já faz certo.

### HubSpot · https://hubspot.com
O mais "aproachável" dos grandes, e a referência de como não assustar um usuário não-técnico.

**Copiar:** **[conhecido]**
- **Barra de ações em massa que substitui o cabeçalho** da tabela ao selecionar. → T02.
- **Estados vazios que ensinam** — cada lista vazia explica o que aparece ali e oferece a ação.
  → E03.
- **Cartão de contato com ações rápidas** (ligar, e-mail, agendar) no topo. → `04` §6.

### Close · https://close.com · e Folk · https://folk.app
Dois CRMs pequenos e bem desenhados, úteis como referência de escala compatível com a do
Vitrine — não são suítes gigantes. **[a conferir]** Close é forte em caixa de entrada
unificada com telefonia; Folk é forte em simplicidade de tabela e enriquecimento de contato.

### Intercom / Front / Missive
Não são CRMs, são caixas de entrada — e é delas que vem o padrão de três painéis que o
Vitrine adotou na tela de mensagens. **[conhecido]**

**Copiar:**
- **Pré-seleção da conversa mais recente** ao abrir. → M01.
- **Filtros de triagem** no topo da lista: não lidas · minhas · sem resposta. → M04.
- **Painel de contexto que nunca fica vazio** — quando não há conversa selecionada, ele mostra
  o resumo da fila, não uma frase pedindo que se escolha algo.

---

## 2. CRMs e softwares brasileiros — o vocabulário que o cliente reconhece

Esta seção importa mais do que parece: o cliente de Max é uma clínica brasileira, e ela
compara o Vitrine com o que já viu. Vocabulário estranho custa venda.

### RD Station CRM · https://www.rdstation.com/crm/
**[verificado]** — é a solução brasileira de referência em funil, da mesma empresa da
automação de marketing. **Copiar:** o vocabulário. "Negócio", "Funil", "Etapa", "Ganho/Perdido"
são os termos que o vendedor brasileiro já usa — e são os que o Vitrine já usa. Bom sinal.

### Ploomes · https://ploomes.com
**[verificado]** — CRM brasileiro com foco em proposta comercial, assinatura digital e funil.
Vende-se como "robusto mas intuitivo, ideal para quem não conhece CRM". **Copiar:** a
postura — o produto assume que o usuário é iniciante, e o *onboarding* é parte da interface,
não um manual à parte.

### Agendor · https://agendor.com.br
**[a conferir]** — CRM brasileiro de PME, forte em simplicidade e em app móvel para vendedor
de rua. Vale olhar pela navegação móvel, que é a lacuna que este dossiê não cobre.

---

## 3. Verticais de saúde e estética — os concorrentes diretos do CRM-filho

É aqui que o Vitrine ganha ou perde a venda para uma clínica de estética.

### Belle Software · https://www.bellesoftware.com.br
**[verificado]** — destaca IA que transcreve áudio e organiza resumo do prontuário, e
atendimento no WhatsApp com agendamento direto no sistema.

**Relevante para o Vitrine:** o `aba_ai` já faz *bring-your-own-key* e já responde pergunta
com base de conhecimento. **A transcrição de áudio para dentro da evolução clínica é o passo
que o concorrente já dá e que o Vitrine tem infraestrutura para dar.** Fica como matéria de
backlog, não como recomendação desta sessão.

### Simples Agenda · https://www.simplesagenda.com.br
**[verificado]** — anamnese digital, pacotes de sessões, agenda online, WhatsApp e Pix.
Destaque explícito para **fotos antes e depois anexadas ao histórico da cliente**.

**Relevante:** `aba_health` já tem anexo com URL assinada de 60s. O par antes/depois lado a
lado com data é apresentação, não infraestrutura nova. → `05_CAMINHOS.md` §8.

### Trinks · https://negocios.trinks.com
**[verificado]** — pacotes de serviço, agendamento recorrente, ficha de anamnese digital,
histórico com fotos.

**Relevante:** **agendamento recorrente** é o que uma clínica de estética mais faz (pacote de
10 sessões semanais) e é onde uma agenda que não trata bem a repetição custa caro. Vale
verificar como `aba_scheduling` trata série de atendimentos antes de investir em outra coisa.

### iClinic · https://iclinic.com.br · e Simples Dental · https://simplesdental.com
**[verificado]** — iClinic cobre agenda, prontuário, financeiro, estoque e multiunidades.
Simples Dental destaca **assinatura digital de prontuário em tablet na recepção, com validade
jurídica**.

**Relevante:** a aba "Consentimentos" do wireframe `1h` já existe no desenho. A assinatura na
recepção é o que fecha o ciclo, e é argumento jurídico — não estético — numa venda para
clínica. → `05_CAMINHOS.md` §8.

### CRM 03 do próprio repo (`screenshots/CRM_03_modelo_design`, PrimeSmile)
Já inventariado em `design/README.md`. O **odontograma clicável** e a organização
Medical card / Documentation / Loyalty card continuam sendo a melhor referência disponível
para a tela de prontuário — e a arte de produção dos 4 mapas clínicos segue sendo a pendência
aberta de `docs/04` §5.5.

---

## 4. Design systems públicos — as regras objetivas

Estes não são inspiração, são régua. Quando houver dúvida sobre um número, é aqui que se olha.

### IBM Carbon · https://carbondesignsystem.com
O mais rigoroso em **densidade e tabela de dados**. Oferece a tabela em várias alturas de
linha e trata densidade como decisão de produto, não de gosto. → F02, T05.

### Shopify Polaris · https://polaris.shopify.com
**[verificado]** — a melhor referência para **lista de recursos**: o `IndexTable` cobre
seleção, ordenação, filtro, visões salvas, ações em massa e paginação como um padrão só. O
espaçamento é todo em incrementos de 4px, e a orientação para tabela é usar **linha divisória
leve**, reduzindo "tinta não-dado". → T01, T02, `02_FUNDACAO_VISUAL.md` §5.

### Atlassian Design System · https://atlassian.design
A melhor referência de **cabeçalho de página** e de hierarquia de ação primária/secundária.
Corpo padrão de 14px. → N04.

### Radix UI · https://radix-ui.com · e shadcn/ui · https://ui.shadcn.com
A base que o projeto já escolheu. Radix entrega comportamento e acessibilidade; shadcn entrega
o código-fonte para copiar. **A vantagem que importa para a restrição de peso: não é
dependência de componente, é arquivo no repo.** → `03_COMPONENTES.md`.

### WCAG 2.2 · https://www.w3.org/TR/WCAG22/
**[verificado]** — os três critérios que este dossiê aciona:
- **SC 1.4.3** Contraste mínimo — 4,5:1 para texto normal. → F03, F04.
- **SC 1.4.11** Contraste de não-texto — 3:1 para o que identifica um componente. → F05.
- **SC 2.4.13** Aparência do foco — indicador com perímetro equivalente a 2px e 3:1 entre os
  estados. → `02_FUNDACAO_VISUAL.md` §6.
- **SC 2.5.8** Tamanho do alvo (mínimo) — 24×24px CSS, com exceção por espaçamento. → E04.

### Nielsen Norman Group · https://nngroup.com
**[verificado]** — a referência sobre **skeleton screens**: o esqueleto reduz a percepção de
espera justamente por dar pistas de como a página vai ficar, o que um *spinner* não faz.
→ E01.

---

## 5. Plataforma — o que já é seguro usar em 2026

Verificado contra MDN e web.dev nesta sessão, porque a resposta muda com o tempo e chutar
custa caro:

| Recurso | Situação | Onde usar no Vitrine |
|---|---|---|
| **`:has()`** | Baseline desde dez/2023 **[verificado]** | seleção de linha, estado de card, validação de formulário sem JS |
| **Container queries (tamanho)** | Baseline desde fev/2023 **[verificado]** | card de KPI e card de negócio que se adaptam ao container, não à janela |
| **Container queries (estilo)** | Baseline "newly available" em mai/2026 **[verificado]** | ainda cedo para depender |
| **View Transitions (mesmo documento)** | Baseline "newly available" desde out/2025 **[verificado]** | transição entre lista e ficha — bom, mas opcional |
| **View Transitions (entre documentos)** | **não** é Baseline **[verificado]** | não usar |
| **`text-wrap: balance`** | amplamente disponível **[conhecido]** | título de card e de KPI, evita a palavra órfã |
| **`font-variant-numeric: tabular-nums`** | universal **[conhecido]** | toda coluna de dinheiro e hora → `02` §9 |

**Container queries merecem destaque** para este projeto especificamente: o Vitrine vende
templates de layout configuráveis (`docs/04` §2), então o mesmo card precisa funcionar numa
coluna estreita e numa larga. Container query resolve isso sem `props` de tamanho e sem
JavaScript — é exatamente o caso de uso para o qual ela foi criada.

---

## 6. Onde este dossiê deliberadamente não foi

Registrado para que a lacuna seja escolha visível e não esquecimento:

- **Responsividade e móvel.** `docs/04` §5.3 deixou explicitamente em aberto o comportamento
  abaixo de 1280px. As capturas analisadas são todas de tela larga. Uma recepção usa desktop,
  mas o profissional consultando "Meu dia" (tela `1n`) provavelmente não — e o `vite-plugin-pwa`
  já está instalado, o que sugere que a intenção móvel existe. **É a maior lacuna deste dossiê
  e merece sessão própria.**
- **Onboarding e primeiro uso.** Como um CRM-filho recém-clonado se apresenta na primeira
  abertura, com zero dado. Todo estado vazio deste dossiê ajuda, mas o fluxo em si não foi
  desenhado.
- **Impressão e exportação.** Prontuário, recibo, comprovante. Folha de estilo de impressão é
  barata e nenhuma clínica vive sem papel.
- **Tema escuro.** As correções de contraste de `02` §3 foram medidas só no tema claro. O
  bloco `.dark` precisa da mesma passagem, com o mesmo script.
