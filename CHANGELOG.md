# CHANGELOG — CRM Vitrine

Convenção: `+0.1` = correções/melhorias · `+1.0` = novas funcionalidades/serviços.

## [+1.0] - 2026-08-19 (Subetapa 02.13.a)
- **O CRM está no ar em https://vitrine.strategicepiphany.com**, com dados de demonstração em todos os nove módulos — uma clínica fictícia com equipe, agenda cheia, funil de vendas, financeiro, prontuários, conversas, automações e agente de IA.
- **A demonstração parece uma clínica em operação, e não um sistema recém-instalado**: 600 atendimentos ao longo de 13 semanas, taxa de ocupação em 53%, gráfico com volume crescente. A primeira versão do seed mostrava 2% de ocupação — número correto, mas que faz o produto parecer parado.
- **Cobertura conferida por contagem, não por confiança**: 130 combinações de estado verificadas, todas com pelo menos dois registros. A verificação encontrou 16 lacunas que o próprio gerador dava como preenchidas.
- **Nenhum número de telefone plausível no seed.** Os contatos usam um indicativo internacional reservado, que não chega a assinante nenhum — um número "que parece falso" ainda pode ser completado pelo provedor e atingir uma pessoa real, incidente já ocorrido em projeto irmão.
- **Corrigido: recarregar a página numa rota interna devolvia 404.** Abrir `/prontuario` direto pelo endereço, ou apertar F5 lá dentro, quebrava. Agora o servidor entrega o app e a navegação continua de onde estava.

## [+0.1] - 2026-08-19 (Subetapa 02.12b)
- **Corrigido: campo de formulário ilegível no modo escuro.** Fundo branco com letra branca, relatado em Prontuário, Automações e IA. A medição mostrou que **87 dos 103 campos do sistema** nunca tiveram a cor do tema — o modo claro escondia isso porque o branco do navegador coincide com o fundo claro. Corrigido de uma vez para o sistema inteiro, e não nas três telas em que foi visto.
- **Corrigido, e é o mais sério: a anamnese aceitava ser gravada pela metade.** Havia registro salvo com 3 respostas de 5. Num prontuário isso é pior que um campo em branco — a linha tem data, autor e aparência de ficha completa, e quem a ler depois não sabe se o paciente não tem alergia ou se a pergunta nunca foi feita. Agora **o banco recusa**, não só a tela: quem não tiver o que relatar escreve "nada consta".
- **O "caminho" no topo da tela virou navegação de verdade** — antes era só texto. Agora leva de volta, tem o fundo da área de conteúdo e apresenta cada passo em pílula, como as tags. O link "← Prontuário", que fazia o mesmo trabalho em duplicidade, saiu.
- **As quatro abas do prontuário passaram a ter o mesmo tamanho.** A de Anamnese esticava a página inteira; agora todas ocupam a mesma caixa e rolam por dentro. As legendas dos cinco passos saíram: repetiam, truncadas e minúsculas, o título que aparece logo abaixo em corpo legível.
- **Dashboard ganhou item próprio na navegação lateral** — só era alcançável clicando na logomarca.

## [+1.0] - 2026-08-19 (Subetapa 02.12)
- **Dashboard geral** (`/`, tela `1b`): quatro indicadores — atendimentos de hoje, novos leads, taxa de ocupação e receita do mês —, gráfico de 12 semanas, rosca dos serviços mais realizados e três painéis (próximos atendimentos, pendências da equipe, ocupação por profissional). **Todo número sai de consulta ao banco**, e cada card diz em texto de que período está falando: número sem período é número que cada pessoa lê como quer.
- **Quando um número não pode ser calculado, a tela diz o motivo em vez de mostrar zero.** Sem acesso ao Financeiro, "Receita do mês" mostra "sem acesso ao Financeiro", não "R$ 0" — que é indistinguível de "a clínica não faturou nada" e é a mensagem mais alarmante possível. O mesmo vale para o contador de anamneses de quem não tem alcance clínico: ele mostraria o número **máximo**, mandando a equipe atrás de um problema que não existe.
- **Profissional sem grade de horário aparece como "sem grade", não como 0%** — e sai do cálculo da taxa da clínica, em vez de inflá-la entrando no numerador sem entrar no denominador.
- **Configurações da conta** (`/configuracoes`, tela `1m`) com dez seções: aparência e layout, dados da conta, módulos e licença, perfis e permissões, equipe (já existente), serviços e agenda, formulários clínicos, integrações, chaves de IA e auditoria.
- **Aparência agora é da conta, não do navegador**: tema claro/escuro/sistema, densidade compacta ou espaçosa, cinco cores de destaque e duas famílias tipográficas, gravados no banco e aplicados no carregamento — sem rebuild por cliente. O **modo escuro** passa a existir de verdade, derivado da paleta ratificada, incluindo as quatro famílias de badge, que o placeholder herdado deixava ilegíveis.
- **O seletor de templates de layout mostra as quatro opções e entrega uma.** As outras três aparecem desabilitadas com o motivo escrito, e a recusa é do banco: a coluna aceita um único valor. Liberar outro template deixa de ser um clique e passa a exigir mudança deliberada no banco — que é quando o template de fato existir.
- **A matriz de perfis e permissões é resolvida pelo banco**, nunca recalculada na tela: o que cada papel pode fazer em cada módulo, com as exceções da conta marcadas e um botão para voltar ao padrão.
- **O grid de módulos não tem interruptor, e a tela explica por quê**: o proprietário enxerga todos os módulos por regra do sistema, antes de qualquer permissão ser consultada — um interruptor ali aceitaria o clique e não mudaria nada para quem o clicou.
- **A titularidade da conta não é editável por formulário nenhum**, aqui nem em outra tela; ela aparece em leitura, com a rotina de transferência indicada.

## [+0.1] - 2026-08-19 (Subetapa 02.12)
- **Corrigido: o valor "Vencido" do Financeiro zerava sozinho.** Desde que o agendador entrou no ar, a rotina diária que marca faturas vencidas mudava o estado delas — e a tela contava apenas os estados antigos. Resultado medido: R$ 960,00 em atraso viravam R$ 0,00 assim que a rotina rodava, e a fatura sumia também de "A receber". Não havia erro na tela, só um zero tranquilizador.

## [+1.0] - 2026-08-19 (Subetapa 02.11)
- **Módulo IA (`aba_ai`) ganha UI completa** (`/ia`, tela `1l`): métricas de uso do período, card de comportamento (instrução do agente, modelo, horário de atuação e interruptores de permissão), base de conhecimento com teste de recuperação, consumo registrado e um "Perguntar" que exercita o agente.
- **A conta cola a própria chave de IA** — o produto não tem chave de LLM própria. A chave é **verificada contra o provedor antes de ser gravada** (chave errada é recusada na hora, com a mensagem do próprio provedor, e nada é salvo), cifrada em AES-256-GCM e nunca devolvida: nem a tela nem o banco a mostram de volta, só os quatro últimos caracteres para o operador reconhecer qual está guardada.
- **O agente não lê prontuário, e isso é garantido pelo banco.** O interruptor existe no desenho e nasce travado por regra de integridade: um agente automático lê com privilégio de servidor, que não passa pelo controle de acesso clínico nem registra quem leu — liberar exigiria construir esse caminho auditado antes. Nem o proprietário da conta consegue ligá-lo.
- **Busca de conhecimento corrigida na raiz**: a recuperação exigia que o trecho contivesse **todas** as palavras da pergunta, então "quanto custa a limpeza de pele" não encontrava o trecho que responde exatamente isso. Agora ordena por relevância — e o defeito era silencioso, porque não achar nada parecia apenas base incompleta.
- **Mensagem de erro do provedor chega ao operador**: antes a tela dizia apenas "Edge Function returned a non-2xx status code" para chave errada, chave sem crédito e provedor fora do ar — três problemas com ações diferentes e a mesma mensagem inútil.
- **Aviso de tratamento de dados por terceiro, em destaque e antes da decisão** (pedido de Max): a tela declara que perguntas e base de conhecimento saem do CRM para o provedor escolhido, que o fornecedor do CRM não opera esses serviços e não pode garantir guarda, retenção ou uso para treinamento, e que a escolha do provedor é responsabilidade de quem conecta a chave. Aparece antes dos campos e continua visível depois de conectada.
- **Alerta no ponto onde o risco existe**: a base de conhecimento é texto livre e vai inteira ao provedor a cada resposta — o prontuário está bloqueado para o agente, ela não está. O aviso contra escrever dado de saúde, documento ou informação sigilosa fica no próprio formulário de edição, não numa página de termos.
- **OpenRouter como terceiro provedor** (`50 req/dia` grátis, `1000/dia` com US$10 em crédito, teto de `20/min` — números conferidos na documentação deles): a API usa o mesmo formato de *chat completions* da OpenAI, então o caminho já existente serviu. Cada provedor exibe sua própria nota de privacidade no momento da escolha — a do OpenRouter avisa que ali a política de dados é **de cada provedor roteado, não da plataforma**, e que há ajuste separado, na conta deles, sobre permitir roteamento a quem treina com os dados enviados.
- **Aceite do termo agora é registrado, e é porta**: enquanto a versão vigente do termo não for aceita, o formulário de credenciais **não é renderizado** — não é campo desabilitado, é tela que não existe. O aceite guarda quem aceitou, quando e qual versão; mudar o texto do termo gera versão nova e volta a exigir aceite. Ninguém aceita em nome de outro, e o registro não se edita nem se apaga.
- **Ciclo completo exercido com chave real** (OpenRouter, 2026-08-19): chave verificada e aceita pelo provedor, cifrada e guardada, agente ativado, pergunta real respondida com base no conhecimento cadastrado, e o consumo registrado — 546 tokens numa linha de `ia_log_uso`. O agente **obedeceu à permissão desligada**: com "consultar horários livres" em off, recusou afirmar disponibilidade e encaminhou para a equipe, exatamente como a regra manda.
- **Filtro de ruído da busca refeito sobre medição, não sobre intuição.** O primeiro critério (piso de relevância) fazia o oposto do prometido: uma palavra vazia num trecho curto pontuava **mais** que dois termos legítimos num trecho longo. O critério certo é a fração da pergunta que o trecho cobre — separa corretamente pergunta natural, palavra-chave isolada, ruído e assunto alheio, e os quatro casos viraram teste de regressão.
- **Limitação medida e registrada, não escondida:** a busca não reduz palavra ao radical, então "cancelar" não encontra "Cancelamentos". É o preço da escolha de não prender o produto a um idioma — está documentado como decisão pendente, com as três saídas possíveis.

## [+1.0] - 2026-08-19 (Subetapa 02.10)
- **O produto ganha motor.** `pg_cron` instalado e **cinco jobs no ar**: drenagem da fila de espera das automações (a cada minuto), disparo de lembretes vencidos (a cada 5 min), expiração de fluxo conversacional ocioso (de hora em hora), `marcar_faturas_vencidas()` e `expirar_planos()` (diários). As quatro rotinas que existiam no banco desde a Etapa 01 **sem ninguém que as chamasse** finalmente rodam — fatura passa a vencer, plano passa a expirar, lembrete passa a ficar pronto.
- **Módulo Automações (`aba_automations`) ganha UI completa** (`/automacoes`, tela `1k`): lista de automações com interruptor de ativação, editor de passos conectados verticalmente com cor por família (Gatilho azul / Condição sage / Ação tan), ramos sim/não da condição, log de execução passo a passo, e aba de Fluxos conversacionais com disparo e avanço de execução.
- **Painel do agendador dentro do produto**: os jobs, a agenda de cada um, a última corrida e o estado ficam visíveis para `admin+` — porque rotina de banco sem agendador falha em silêncio, e o sintoma (ausência de comportamento) não gera erro nem aparece em advisor. O schema `cron` **não** é exposto à API: expô-lo daria ao navegador `cron.schedule`, isto é, execução de SQL arbitrário como `postgres`.
- **O motor é honesto sobre o que não faz**: `esperar`, `aplicar tag`, `notificar equipe` e `condição` são executadas de verdade; `enviar WhatsApp` é **registrada no log como não executada**, com o motivo, enquanto a configuração de canal da Subetapa 02.5 não fechar. A tela mostra esse aviso no próprio passo.
- **Correção de uma janela aberta pelo estado novo**: `lembretes.status` ganhou `pronto`, e a trigger que cancela lembrete ao cancelar o atendimento passou a alcançar também esse estado — sem isso, um atendimento cancelado depois de o lembrete ficar pronto ainda enviaria o aviso ao cliente.
- Suíte de RLS ampliada de 117 para **130 testes** (13 novos) cobrindo o caminho que **ignora a RLS** (funções `SECURITY DEFINER` do motor): isolamento entre contas na fila, `automacao_logs` só de leitura, `cron` inacessível pelo navegador, e o ciclo completo de execução de fluxo.

## [+1.0] - 2026-08-19 (Subetapa 02.9)
- **Módulo Prontuário (`aba_health`) ganha UI completa** (`/prontuario`, telas `1h` e `1p`): ficha clínica, seletor dos 4 mapas clínicos com marcação por região, abas Anamnese/Evoluções/Anexos/Consentimentos, sessões anteriores e a biblioteca de mapas (`/prontuario/mapas`). A aba "Prontuário" da ficha da pessoa (tela `1d`), placeholder desde a Subetapa 02.3, passa a levar ao módulo.
- **Nenhuma leitura clínica passa por `select` direto** — ficha, anamnese, evolução e consentimento saem exclusivamente por `ler_prontuario()`, `ler_respostas_anamnese()`, `ler_evolucoes()` e `ler_consentimentos()`, que gravam `log_acesso` na mesma transação. Foto e documento são servidos pelo bucket privado `anexos-clinicos` por **URL assinada de 60 segundos**, nunca por link público.
- **Consentimento de uso de imagem trava a exibição da foto para todos, inclusive para quem a enviou** (decisão de Max, mantida): o envio nunca é bloqueado, a exibição sim — e quem explica o bloqueio é a tela, quem o aplica é a política do bucket.
- **Evolução assinada não se altera**: "Assinar e encerrar sessão" trava o registro no banco e a única continuação oferecida pela tela é adendo em linha nova, ligada à original.
- **Concessão nominal de prontuário ganha painel próprio** (portado do CRM Maximus): sem ele, o proprietário não tinha caminho de aplicação para autorizar alguém — só SQL. Uma negação vigente vence tudo, inclusive o próprio proprietário da conta.
- **Migration nova `025_aba_health_marcacoes_mapa.sql`** — primeira desde a Subetapa 02.1: `aba_health.evolucoes` ganha `mapa_tipo` e `marcacoes`, colunas que nascem sem `SELECT` para o usuário final e portanto só saem por `ler_evolucoes()`, herdando log, RLS e trava de evolução assinada sem abrir nenhuma superfície nova no schema mais sensível do produto. A arte definitiva dos 4 mapas segue como pendência de asset (`docs/04` §5.5), sem bloquear a subetapa.
- Suíte de RLS ampliada com 7 testes novos de `aba_health` (113/117 executados verdes; as 2 falhas restantes continuam sendo as pré-existentes da Subetapa 02.5, fora de escopo).

## [+1.0] - 2026-08-18 (Subetapa 02.8)
- **Módulo Financeiro (`aba_finance`) ganha UI completa** (`/financeiro`, tela `1g`): KPIs (recebido no mês, a receber, vencido, comissões a pagar), gráfico Faturado×Recebido de 6 meses via SVG inline, formas de pagamento do mês, e abas Lançamentos/Comissões/Conciliação.
- **Venda de plano pela UI** cria contrato + fatura + item por escrita direta e só então chama `aba_finance.vender_plano()` para gerar o saldo de sessões — nunca escrita direta em `saldos_plano`/`planos_cliente`. Pagamento registrado dá baixa automática na fatura via trigger existente. Atendimento concluído na Agenda consome saldo do plano e gera comissão automaticamente (novo campo "Consumir sessão do plano" no formulário de atendimento). Estorno de sessão sempre via `estornar_sessao()`, nunca `UPDATE` direto.
- Nenhuma migration nova — `aba_finance` já estava 100% aplicado desde a Subetapa 01.3; suíte de RLS revalidada sem regressão desta subetapa (106/108 executados verdes; as 2 falhas restantes são pré-existentes da Subetapa 02.5, fora de escopo).

## [+1.0] - 2026-08-18 (Subetapa 02.7)
- **Módulo Catálogo (`aba_catalog`) ganha UI completa** (`/catalogo`, tela `1i`): abas Serviços/Planos com contagem real, painel de Categorias, cards em destaque, tabela completa de serviços com a variante padrão de cada um, e o fluxo completo de variante de serviço → plano → item de plano.
- **Trocar a variante padrão de um serviço passa a ser sempre pela função `aba_catalog.definir_variante_padrao()`** — nunca `UPDATE` direto na coluna, que é exatamente o que garante no banco que existe no máximo uma variante padrão por serviço mesmo sob concorrência.
- Nenhuma migration nova — `aba_catalog` já estava 100% aplicado desde a Subetapa 01.3; suíte de RLS revalidada sem regressão desta subetapa (106/108 executados verdes; as 2 falhas restantes são pré-existentes da Subetapa 02.5, fora de escopo).

## [+1.0] - 2026-08-18 (Subetapa 02.6)
- **Módulo Agenda (`aba_scheduling`) ganha três telas**: grade semanal completa (`/agenda`, tela `1e`) com criação/edição/cancelamento de atendimento, bloqueio de horário (folga) e detecção automática de conflito; "Meu dia" (tela `1n`, perfil profissional) e "Balcão" (tela `1o`, perfil recepção) — as duas últimas são **filtro de UI sobre o RBAC já existente**, sem papel novo: `agent` com atributo profissional ativo vê `1n`; `admin` sem o atributo vê `1o`; os demais casos veem a grade completa.
- **Sobreposição de horário e violação de expediente/folga agora têm mensagem distinta e legível** — o banco já recusava as duas (`23P01`/`23514`), a UI passa a explicar qual das duas regras bloqueou em vez de um erro genérico.
- Nenhuma migration nova — `aba_scheduling` já estava 100% aplicado desde a Subetapa 01.3; suíte de RLS revalidada sem regressão desta subetapa (106/108 executados verdes; as 2 falhas restantes são pré-existentes da Subetapa 02.5, fora de escopo — ver `handoffs/instrucoes.md` §5).

## [+1.0] - 2026-08-18 (Subetapa 02.4)
- **Módulo Vendas (`aba_sales`) ganha kanban de pipeline** (`/vendas`): funil "Comercial padrão" provisionado sob demanda com as 5 etapas do design (Novo contato → Avaliação agendada → Proposta enviada → Negociação → Fechado), oportunidades arrastáveis entre etapas via `@dnd-kit`, sempre ligadas a `pessoa_id` (nunca a um contato de canal).
- **Ciclo de status `ativa → ganha | perdida` é terminal**: uma vez fechado (ganho ou perdido), o negócio sai da lista de "em aberto" e deixa de ser arrastável ou reabrível pela UI.
- Nenhuma migration nova — `aba_sales` já estava 100% aplicado desde a Subetapa 01.5; suíte de RLS revalidada sem regressão (110/110).

## [+1.0] - 2026-08-18 (Subetapa 02.3)
- **Módulo Pessoas (`aba_people`) ganha UI completa:** lista unificada (`/pessoas`) com abas Todas/Leads/Clientes/Equipe/Fornecedores por contagem real, tabela paginada com seleção múltipla e exclusão em lote (`@tanstack/react-table`), e ficha da pessoa (`/pessoas/:id`) com edição de dados, tags, notas internas, linha do tempo e campos personalizados.
- **Conversão de lead em cliente pela UI**, sempre via `aba_people.converter_lead()` (nunca `INSERT` direto) — tags, notas e campos personalizados sobrevivem à conversão, e a pessoa passa a exibir os dois papéis (Lead histórico + Cliente) ao mesmo tempo.
- **Dois bugs de apresentação corrigidos nesta sessão** (nenhum de RLS/banco): pessoa sem nenhum papel deixou de ser rotulada como "Lead" por engano; breadcrumb do shell deixou de cair em "core > dashboard" em sub-rotas de módulo (`/pessoas/:id` e qualquer futura).
- Nenhuma migration nova — `aba_people` já estava 100% aplicado desde a Subetapa 01.2; suíte de RLS revalidada sem regressão (110/110).

## [+1.0] - 2026-08-18 (Subetapa 02.2)
- **Fluxo de equipe de ponta a ponta:** owner/admin convida por e-mail (RPC `criar_convite`, token de 256 bits gerado e hasheado no banco), o convidado aceita (`resgatar_convite`) e é movido para a conta com o papel do convite, um `aba_people.funcionarios` nasce automaticamente e ativo (trigger `nascer_funcionario_do_perfil`), e o owner/admin liga ou desliga o atributo profissional (`aba_scheduling.definir_profissional`) por um interruptor — regra nova: só quem tem papel `agent` pode virar profissional.
- **Gestão de membro:** `set_member_role` (mudar papel), `remove_account_member` (remover, com conta pessoal nova) e `transfer_account_ownership` (transferir titularidade — fecha a promessa da correção de segurança A02 da Subetapa 01.8) portados do CRM Maximus.
- **UI nova:** aba Equipe em Configurações (lista de membros, formulário de convite com link copiável, toggle de profissional, seletor de papel) e página pública de aceite de convite (`/convite?token=...`).
- Suíte de RLS ampliada para 110 testes (10 novos cobrindo o fluxo de equipe); dois CHECKs de integridade novos (`funcionarios_ativo_exige_login`, `profissionais_ativo_exige_funcionario`) fecham a mesma classe de gap que a migration 075 do Maximus existe para corrigir.

## [+0.1] - 2026-08-18 (Subetapa 02.1)
- **Identidade visual ratificada aplicada ao app** — paleta e tipografia de `docs/04_DESIGN_E_MARCA.md` §5 substituem o placeholder neutro do shadcn/ui; IBM Plex Sans/Mono carregada; `AppShell` reconstruído no shell do pacote de wireframes (sidebar 236px, header 56px, breadcrumb mono, área de conteúdo `#f4f6f7`).
- **Sessão passa a resolver `public.profiles` e a navegação é 100% dirigida por `access.readable_modules()`** — nenhum módulo listado à mão no front; trocar o papel do usuário no banco muda o conjunto de itens visíveis sem nenhuma alteração de código.
- `access.modules.position` realinhado à ordem de navegação ratificada (`sales` antes de `catalog`/`messaging`), via migration `023` (UPDATE puro).
- Dependências de UI instaladas para os módulos das próximas subetapas: `@tanstack/react-table`, `date-fns`, `@dnd-kit/*`.
- Nenhuma mudança de dado do usuário final — só fundação de shell/sessão; os 11 módulos (9 `aba_*` + Configurações + Suporte) seguem como placeholder até as subetapas 02.3–02.12.

## [+0.1] - 2026-08-18 (Subetapa 02.0)
- **Plano da Etapa 02 reescrito de 8 para 17 subetapas** (02.0–02.16), à luz do design ratificado e de duas decisões de Max: o fluxo de convite/funcionário vira subetapa própria (02.2, antes da de Pessoas) e os módulos restantes ganham CRUD completo antes do deploy — a Etapa 02 passa a cobrir as 16 telas do design, e não só três módulos.
- **Divergência zero entre documentação e banco confirmada objeto a objeto** — 22 migrations, 12 schemas, contagem de tabela por schema e inventário de função conferidos contra o projeto Supabase real; nenhuma subetapa 02.x referencia nome que não exista.
- **Nove gaps de trabalho sem dono identificados e distribuídos:** identidade visual ainda em placeholder do shadcn, app sem resolução de perfil/papel, RPCs de convite inexistentes, `access.modules.position` desalinhado da navegação ratificada, `pg_cron` declarado mas não instalado, dependências de UI do design ausentes, dois itens de sidebar sem modelo de dados, e o CRM-Sindcom rebaixado de fonte de UI/UX para referência apenas de build e deploy.
- Duas pendências vigiadas novas abertas (`pg_cron` sem instalação; itens de navegação sem modelo de dados) e duas entradas novas em `handoffs/instrucoes.md` §5.
- Nenhuma migration nova, nenhuma linha de código — só plano, documentação e decisão registrada.

## [+0.1] - 2026-08-18 (Etapa de Transição 1 → 2)
- **Design do MVP ratificado.** Max concluiu o estágio de design no Claude Design; o pacote de 16 wireframes foi lido e interpretado por completo, e as decisões de arquitetura/UI que ele obriga ficam registradas em `docs/01_ARQUITETURA.md` §7 e `docs/04_DESIGN_E_MARCA.md` §5 (paleta, tipografia, biblioteca de ícones, padrões de componente, navegação/ordem de módulo).
- **Login multi-conta adiado para `+1.0`** (decisão de Max) — o schema atual (1 usuário = 1 conta) não suporta o seletor de conta que o wireframe mostra; a Etapa 02 constrói login single-account.
- **Fluxo de convite→funcionário→atributo profissional verificado migration a migration contra o CRM Maximus** (018/019/074/075/076) — mesmo desenho de 5 passos confirmado; a ponta final já estava portada fielmente desde a Subetapa 01.4 (`aba_health.pode_acessar()`); as RPCs que faltam continuam deferidas para a Etapa 02, agora com uma regra nova: o atributo profissional só pode ser concedido a `agent`, nunca a `admin`.
- Nenhuma migration nova, nenhuma mudança de comportamento do produto — só documentação e decisão registrada.

## [+0.1] - 2026-08-17 (Subetapa 01.9)
- `handoffs/HANDOFF_BUILD.md` preenchido por inteiro — estado real da fundação (22 migrations, 100/100 testes de RLS, webhook v3, bucket clínico, varredura de segredos zerada, portão adversarial com parecer favorável), artefatos e onde encontrá-los, resumo das 8 subetapas da Etapa 02, armadilhas conhecidas mais relevantes para quem constrói UI a partir de agora, e o primeiro passo concreto (Subetapa 02.0).
- **Portão de saída da Etapa 01 declarado aberto** em `docs/00_PLANO_E_CRITERIOS.md`: todos os schemas do MVP aplicados, RLS 100% verde, segredos zerados, portão adversarial executado e merge realizado. A Etapa 02 pode abrir.

## [+0.1] - 2026-08-17 (Subetapa 01.8)
- **Portão de segurança adversarial executado** sobre toda a fundação (Subetapas 01.2–01.6), em bench isolado: 35 ataques deliberados cobrindo os 6 vetores obrigatórios, mais LGPD/prontuário e o webhook público. **6 falhas reais encontradas e corrigidas**, numa base que já tinha 65 testes de RLS verdes e varredura de segredos zerada.
- **Corrigida uma falha crítica de tomada de conta:** era possível a um usuário autenticado sem perfil se inserir em conta alheia como proprietário e passar a enxergar os dados dela. A porta de entrada ficava aberta porque a trava de escalação de privilégio cobria alteração de perfil, mas não criação.
- **Corrigido o caminho pelo qual um administrador podia se apossar da titularidade da conta** reescrevendo o dono direto no registro, sem passar por transferência de posse.
- **Credenciais deixam de ser legíveis pela API:** o segredo de assinatura de webhook (que estava em texto puro), o hash de chave de API, o hash de token de convite e a chave de IA eram legíveis pelo papel mais fraco do produto — o de somente leitura. As oito colunas de credencial do banco agora ficam invisíveis para qualquer usuário, e acessíveis só ao servidor que legitimamente as opera.
- **Corrigido vazamento entre contas no webhook do WhatsApp:** uma atualização de status vinda da Meta podia alterar a mensagem de outro cliente do mesmo CRM. O isolamento entre contas foi restabelecido e provado contra o endpoint real, com assinatura verdadeira.
- Suíte de testes ampliada — **100/100 verdes** (os 65 anteriores continuam passando; 35 ataques novos viram testes de regressão permanentes).
- Parecer da auditoria e o detalhe achado a achado em `docs/RELATORIO_01.8_PORTAO_ADVERSARIAL.md`.

## [+0.1] - 2026-08-17 (Subetapa 01.7)
- Varredura de segredos executada sobre todo o histórico do repositório (`gitleaks detect`, 8 commits, `8bad058`…`7abcb92`): **saída zero** — `no leaks found`, nenhum achado real ou falso positivo, nenhuma supressão por fingerprint necessária.
- Confirmado por `git log`/`git ls-files` que `.env` nunca foi rastreado pelo git em nenhum commit do histórico.
- Item 11 da checklist de conformidade (`docs/00_PLANO_E_CRITERIOS.md`) fechado com evidência executável.

## [+1.0] - 2026-08-17 (Subetapa 01.6)
- `aba_messaging` aplicado por completo — contatos de canal, conversas, mensagens, reações, respostas rápidas, configuração do WhatsApp oficial, modelos de mensagem e transmissões, absorvendo o que no CRM Maximus ainda vivia solto em `public` desde o fork original.
- Webhook da Meta Cloud API no ar (`supabase/functions/whatsapp-webhook`): recusa toda requisição sem assinatura HMAC-SHA256 válida (`X-Hub-Signature-256`), aceita e persiste mensagem de teste corretamente, e trata reenvio do mesmo evento como idempotente — provado por 15/15 asserções de um teste ponta a ponta contra a função real, implantada em produção.
- Segredo de provedor e token de acesso do WhatsApp nunca legíveis pela API, nem por proprietário da conta — só o Edge Function, com privilégio de servidor, opera com eles.
- *Search-first* confirmou a versão vigente da Graph API (v26.0) e o contrato de webhook antes de qualquer linha de código.
- Suíte de RLS ampliada — 65/65 testes verdes no projeto.

## [+0.1] - 2026-08-16 (Subetapa 01.5)
- `aba_sales` (funis/etapas/oportunidades), `aba_automations` (automações + fluxos conversacionais de WhatsApp) e `aba_ai` (IA bring-your-own-key + base de conhecimento) aplicados por completo — três schemas novos, sem existir como módulo próprio no CRM Maximus (tabelas soltas em `public`, herdadas do fork antigo, nunca modularizadas nem com RBAC por conta).
- `aba_sales.oportunidades` referencia `pessoa_id`, nunca `contact_id` — uma oportunidade pode estar ligada a um lead ainda não convertido ou a um cliente já ativo, sem distinção artificial.
- Dois hardenings de segurança aplicados na própria tradução (não copiados do original, que tinha os dois problemas): log de automação deixa de aceitar escrita/apagamento pelo usuário final; busca de conhecimento de IA nasce `SECURITY INVOKER`, prevenindo de origem um vazamento de dado entre contas que o CRM Maximus só descobriu depois de aplicado em produção.
- IA sem `pgvector` nesta versão (decisão de escopo já registrada — busca semântica é `+1.0`); busca textual funciona sem extensão nenhuma.
- Suíte de RLS ampliada — 57/57 testes verdes no projeto, incluindo a prova de isolamento entre contas na busca de conhecimento de IA.

## [+0.1] - 2026-08-16 (Subetapa 01.4)
- `aba_health` aplicado por completo no Supabase — a peça de maior risco jurídico do produto (dado clínico/LGPD). `aba_health.pode_acessar()` embute as três camadas de autorização (papel, permissão por módulo, atributo profissional + concessão nominal) e já nasce com a regra "profissional exige funcionário ativo" do CRM Maximus, sem coluna nova, aproveitando a FK criada na Subetapa 01.3.
- Leitura de conteúdo clínico só existe através de funções que gravam log na mesma transação — não existe caminho de select direto que devolva prontuário/evolução/anamnese/consentimento sem deixar rastro em `log_acesso`. Escrita clínica (criação e atualização) também gera log automaticamente, por trigger.
- Bucket privado `anexos-clinicos` para foto de antes/depois e documento — nunca bucket público, decisão de acesso por `pode_acessar_anexo()` (nunca "qualquer membro da conta"), consentimento de uso de imagem travando só a leitura.
- Evolução clínica travada (`travada = true`) não aceita alteração — só adendo em nova linha.
- Suíte de RLS ampliada (`crm/tests/rls/05_aba_health.spec.ts`) — 8/8 testes verdes: negado/permitido, log incremental provado, coluna clínica bloqueada por privilégio, escrita logada, evolução travada, e a regra "funcionário ativo" provada isolada. 37/37 testes no projeto.

## [+0.1] - 2026-08-16 (Subetapa 01.3)
- `aba_catalog`, `aba_scheduling` e `aba_finance` aplicados por completo no Supabase, traduzidos a partir do CRM Maximus (categorias/serviços/variantes/planos; profissionais/agenda/agendamentos com restrição de exclusão por sobreposição; contratos/faturas/pagamentos/planos vendidos/comissão), com o hardening pós-auditoria e as regras de negócio (troca de variação padrão, lembretes automáticos, venda de plano, estorno de sessão, rotinas de vencimento) já embutidos no DDL inicial, não como patch posterior.
- `btree_gist` habilitado em `extensions` antes de `aba_scheduling` — restrição de exclusão por intervalo recusa dois agendamentos sobrepostos para o mesmo profissional/recurso no próprio banco.
- Pendência da Subetapa 01.2 fechada: `ALTER DEFAULT PRIVILEGES` (GRANT estreito, nunca `TRUNCATE`) agora nasce dentro da própria migration que cria cada schema novo, em vez de precisar de uma migration de correção posterior.
- Decisão de escopo registrada: a regra "profissional ativo exige funcionário" do Maximus (migration 075) não foi portada — depende de um fluxo de convite→funcionário que o Vitrine ainda não construiu. Só o desenho de FK foi trazido. Ver `handoffs/instrucoes.md` §5.
- Suíte de testes de RLS ampliada (`crm/tests/rls/02_aba_catalog.spec.ts`, `03_aba_scheduling.spec.ts`, `04_aba_finance.spec.ts`) — 29/29 testes verdes.

## [+0.1] - 2026-08-15 (Subetapa 01.2)
- Núcleo aplicado no Supabase: `public` (accounts/profiles/account_invitations/member_presence/api_keys/webhook_endpoints/notifications), `licensing` (teto de assentos) e `access` (RBAC fino, `access.can()` fail-closed desde o início).
- `aba_people` aplicado por completo: tabela-mãe `pessoas` + 4 papéis por chave compartilhada + tags/campos customizados/notas + `converter_lead()`.
- Dois achados de segurança reais, medidos ao vivo no banco (não hipotéticos), corrigidos na mesma subetapa: funções `SECURITY DEFINER` executáveis por `anon` apesar do `REVOKE FROM PUBLIC` (é preciso revogar de `anon` nominalmente — causa: concessão de fábrica do projeto Supabase); e toda tabela de `public` nascendo com `TRUNCATE`/`TRIGGER`/`REFERENCES` concedidos a `anon`/`authenticated` por padrão de fábrica do projeto (TRUNCATE não passa por RLS). Ver `handoffs/instrucoes.md` §5.
- Suíte de testes de RLS portada (`crm/tests/rls/`) — 11/11 testes verdes: RLS por papel, isolamento entre contas, e a camada `access.can()` provada isoladamente de `is_account_member()`.

## [+0.1] - 2026-08-15 (Subetapa 01.1)
- Bootstrap do repositório: app Vite+React 18+TS+PWA criado em `crm/`, espelhando a estrutura de `src/` do CRM-Sindcom (`app/`, `components/{ui,shared}`, `features/`, `lib/`).
- Client Supabase (`crm/src/lib/supabase.ts`) conectado ao projeto `uitwttyyppxvcgfdhnlz`; autenticação ponta a ponta validada (login → dashboard → logout) com usuário de teste criado e removido via Admin API.
- `.gitignore` da raiz substituído pelo boilerplate Node genérico por uma versão adaptada de `.gitignore.example` para Vite — inclui, pela primeira vez, a regra que impede `screenshots/` de ir ao remoto.
- `design/README.md` ampliado com os padrões concretos observados nos três modelos de referência em `screenshots/` (dashboard, agenda semanal, medical card/odontograma de `aba_health`).

## [+0.1] - 2026-08-15 (Subetapa 01.0)
- Subetapa 01.0 (Leitura de Referências e Planejamento da Etapa 01) concluída.
- `handoffs/instrucoes.md` criado no modelo do CRM Maximus, semeado com o hardening pós-auditoria (migrations 051–065/070/074–078) e as armadilhas dos dois repositórios de referência.
- `docs/00_PLANO_E_CRITERIOS.md` reformado: convenção `0X.0` de revisão de plano no início de cada Etapa; portões de entrada/saída explícitos nas 3 Etapas; esforço máximo e escalonamento de LLM em todas as subetapas da Etapa 01; subetapas novas de varredura de segredos (01.7/02.5) e portão de segurança adversarial (01.8/02.6) institucionalizadas como subetapas, não só pendência vigiada.
- Corrigido conflito de FK entre `aba_people.pessoas.contato_id` e `aba_messaging.contatos_canal` (`docs/02_MODELO_DE_DADOS.md` §3.3) — coluna passa a `UUID` sem `REFERENCES`, preservando a exportabilidade avulsa de `aba_people`.
- Corrigida contagem de migrations do CRM Maximus em `db/migrations/README.md` (001–079, não 001–077) e completado o mapa de origem por schema.
- `.env.example` eliminado do escopo do projeto (decisão de Max) — `docs/05_COMPLIANCE_E_ETICA.md` §1 atualizado.

## [+0.1] - 2026-08-12
- Fundação do projeto gerada pelo ESTÁGIO CRIATIVO (aurora-criativa), TIPO 02 — Organização.
- Reference lock fechado a partir dos repositórios CRM Sindcom e CRM Maximus: stack v01 = Vite + Supabase + hospedagem estática; RLS/RBAC/IBAC do Maximus preservados; Evolution GO fora do escopo v01.
- Modelo de dados redesenhado: tabela-mãe `aba_people.pessoas` unificando leads/clientes/funcionários/fornecedores (decisão desta sessão, substitui o modelo de identidades separadas do Maximus).
- Módulos novos definidos: `aba_sales`, `aba_automations`, `aba_ai` (existiam soltos em `public` no Maximus, nunca modularizados).
- Árvore de pastas, documentos de referência e handoffs gerados.
