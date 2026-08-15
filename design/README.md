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