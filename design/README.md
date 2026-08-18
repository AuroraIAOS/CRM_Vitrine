# design/ — CRM Vitrine

Aloque aqui arquivos-fonte de marca e referências de layout: paletas, tipografias, logos, prints/mockups de distribuição de sidebar/grid, explorações de múltiplos templates de configuração de CRM-filho.

Diretrizes gerais (paleta, tom, componentes-chave) ficam documentadas em `docs/04_DESIGN_E_MARCA.md` — esta pasta guarda os arquivos, aquele documento guarda a decisão.

## Ponto de partida

O sistema de tema Light/Dark + cor de destaque do CRM Maximus já é funcional e será reaproveitado como base (ver `docs/04_DESIGN_E_MARCA.md` §1) — qualquer arquivo de referência sobre ele pode entrar aqui para consulta do Claude CODE.

## Referências visuais

O repo 'screenshot/' possui três modelos de design de CRM que poderão ser consultados e utilizados como referência para construcao de novos layout e design. Os modelos CRM 01 e 02 já apresentam estruturas de layout mais próximas daquilo que o CRM Vitrine já se propõe a ser neste momento (MVP). O CRM 03, por sua vez, é um excelente exemplo de um CRM voltado para serviços de odontologia e, portanto, pode ser explorado como template para designs futuros. Ainda assim, o CRM 03 apresenta estruturas e formas de distribuição das páginas de profissionais, clientes, documentos DE anamnese e outras estruturas de bastante interesse que JÁ poderão inspirar o design atual do nosso CRM vitrine MVP, além da inspiração que vem do CRM Sindcom.

### Padrões concretos observados (inspeção da Subetapa 01.1)

- **`CRM_01_modelo_design` (Smile360, dental):** sidebar ícone+label (Dashboard/Schedule/Appointments/Patients/Doctors/Messages/Payments/Settings) — praticamente 1:1 com os módulos do Vitrine (`aba_people`→Patients, `aba_scheduling`→Schedule/Appointments, `aba_finance`→Payments). Topo com busca + toggle de tema + notificação + avatar de usuário. Dashboard: 4 KPI cards (com variação % e "View report") + gráfico de barras mensal + donut de distribuição + duas listas (próximo paciente / equipe em atendimento). Agenda em grid semanal (dia × hora, cartão colorido por compromisso) — referência direta para a UI de `aba_scheduling` na Subetapa 02.x.
- **`CRM_02_modelo_design` (Paws & Claws, vet):** case de UX (não é template de tela pronta) — paleta roxo/teal, cartões de "Appointments" segmentados por status (New/Assigned/Closed) com contagem. Menos aproveitável como template literal; mais como referência de paleta alternativa.
- **`CRM_03_modelo_design` (PrimeSmile, dental):** o mais denso dos três. Sidebar com "My clients"/"Shedule"/"Materials"/"Services"/"Analitics"/"Marketing"/"Events". Página de cliente com abas **Medical card / Documentation / Loyalty card** — o "Medical card" tem odontograma interativo (mapa de dentes clicável, com categorias Damage/Parodont/Endo/Constructions) — referência direta para a tela de prontuário de `aba_health` (sem copiar dado clínico nenhum, só a distribuição de layout). Página "Analitics" com abas Finance/Visit e sub-abas de tabela (Services/Doctors/Materials) — referência para relatórios de `aba_finance`.
- **Uso pretendido:** nenhuma decisão de design aqui bloqueia o MVP (`docs/04_DESIGN_E_MARCA.md` §4). Consultar estas pastas ao construir as telas da Etapa 02 (02.1 Pessoas, 02.2 Vendas) e, mais adiante, a tela de prontuário de `aba_health`.

## Pacote de wireframes ratificado (Claude Design, Etapa de Transição 1→2)

Max fechou o design do MVP no Claude Design e considera esta etapa concluída. Pacote em `wireframes-crm-sa-de-e-est-tica/` (handoff bundle padrão do Claude Design) — arquivo principal `project/CRM Vitrine Wireframes.dc.html` (16 telas, canvas de referência 1280×820), componente de shell compartilhado em `project/Shell.dc.html`, e `project/CRM_Vitrine.html` como fallback standalone (não foi necessário usá-lo — o arquivo principal leu 100% completo e consistente).

**As decisões de arquitetura que este pacote obrigou a tomar** (navegação/ordem de módulo, login multi-conta, perfis de UI reduzida, fluxo de convite/funcionário, paleta/tipografia/componentes) estão registradas em `docs/01_ARQUITETURA.md` §7 e `docs/04_DESIGN_E_MARCA.md` §5 — este README guarda só o inventário de arquivo/tela, não a decisão (mesma convenção do parágrafo de abertura acima).

**`_ds/` (dois design systems dentro do pacote) não foi usado** nos wireframes reais — ver `docs/01_ARQUITETURA.md` §7.5. Ignorar como fonte de decisão de paleta/tipografia.

### Inventário de telas (`CRM Vitrine Wireframes.dc.html`)

| ID | Tela | Módulo | Componentes-chave |
|---|---|---|---|
| 1a | Login / acesso | núcleo | form e-mail/senha + link mágico; painel de seletor de conta (multi-conta — ver `01_ARQUITETURA.md` §7.2, não entra na Etapa 02 como está) |
| 1b | Dashboard geral (admin) | núcleo | 4 KPI cards, barra semanal, donut de serviços, 3 painéis (agenda/pendências/ocupação) |
| 1c | Pessoas — lista unificada | `aba_people` | tabs com contagem, tabela paginada com seleção múltipla (TanStack Table citado no próprio wireframe) |
| 1d | Ficha da pessoa | `aba_people` | header + tabs (timeline/prontuário/financeiro/documentos/campos), agendamento/pacote/notas na coluna direita |
| 1e | Agenda semanal | `aba_scheduling` | grid semana×hora, bloco por profissional, nota sobre `btree_gist` |
| 1f | Vendas — pipeline kanban | `aba_sales` | 5 colunas, cards arrastáveis, stats de funil |
| 1g | Financeiro — recebimentos | `aba_finance` | KPIs, gráfico de linha 2 séries, tabs Lançamentos/Comissões/Conciliação |
| 1h | Prontuário e anamnese | `aba_health` | seletor de mapa clínico (facial/corporal/odontograma/acupuntura — placeholder, ver §5.5 de `04_DESIGN_E_MARCA.md`), tabs Anamnese/Evoluções/Anexos/Consentimentos |
| 1i | Catálogo de serviços e pacotes | `aba_catalog` | tabs com contagem, cards em destaque, tabela completa |
| 1j | Mensageria WhatsApp | `aba_messaging` | 3 painéis (lista/chat/contexto), indicador "IA respondendo", janela de 24h sinalizada |
| 1k | Automações — fluxos | `aba_automations` | lista de fluxos + editor de passos conectados, execução por `pg_cron` |
| 1l | IA / agente | `aba_ai` | métricas, card de comportamento (modelo/horário/4 toggles de permissão), base de conhecimento, transferências |
| 1m | Configurações da conta | núcleo (`settings`) | nav de 9 seções, seletor de 4 templates de layout (materializa `04_DESIGN_E_MARCA.md` §2), grid de módulos ativos |
| 1n | Perfil profissional — "Meu dia" | `aba_scheduling` | `agent` + atributo profissional ativo (ver `01_ARQUITETURA.md` §7.3) |
| 1o | Perfil recepção — "Balcão" | `aba_scheduling` | `admin`, sem atributo profissional (ver `01_ARQUITETURA.md` §7.3) |
| 1p | Biblioteca de mapas clínicos | `aba_health` | especificação isolada dos 4 mapas — arte 100% placeholder, asset de produção ainda não existe |