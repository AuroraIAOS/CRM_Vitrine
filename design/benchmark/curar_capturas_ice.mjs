#!/usr/bin/env node
/**
 * Curadoria das evidências visuais do ICE
 * =======================================
 * Escolhe, do material bruto coletado por `coletar_ice.mjs`, o que entra em
 * `capturas/ice/` — e gera o `INDICE.md` no mesmo passo, no padrão de
 * `capturas/concorrentes/INDICE.md`.
 *
 *   node design/benchmark/curar_capturas_ice.mjs
 *
 * **Captura sem tese é descartada, não arquivada** (`00_PLANO_DE_ACAO.md` §9.2).
 * Por isso a lista abaixo é escrita à mão: cada entrada declara o que aquela
 * imagem prova. O bruto tem 1.023 imagens de site e 48 mosaicos de vídeo;
 * despejar tudo no repositório seria trocar curadoria por volume.
 *
 * O crédito é obrigatório e sai daqui: arquivo → o que prova → URL de origem →
 * data. Material de terceiro para benchmark interno, nunca reaproveitado como
 * identidade do Vitrine nem republicado fora deste repositório.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DESTINO = path.join(AQUI, "capturas", "ice");
const TRAB = process.env.ICE_TRAB || path.join(os.homedir(), ".claude", "jobs", "analise-ice");
const IMG = path.join(TRAB, "img");
const VID = path.join(TRAB, "videos");
const BASE = "https://help.icehealthsystems.com";
const COLETA = "2026-09-03";

fs.mkdirSync(DESTINO, { recursive: true });

/** [arquivo de origem, nome no repositório, página de origem, tese] */
const SITE = [
  // ── o odontograma: o coração da NOTA 03
  ["2020-09-22-14-57-40.png", "site_01_odontograma_geral.png", "gather/general-odontogram-overview",
    "**A peça central.** Permanentes (2,3,7…30) e decíduos (A,B,C,H…T) na MESMA arcada, cada um no seu sistema de numeração — a dentição mista do ICE não é um modo de exibição, é o estado real dente a dente. Cada dente tem TRÊS vistas empilhadas: raiz+coroa lateral, a roseta oclusal de 5 regiões e a coroa em vista oclusal. Marcação por face, em cor, em qualquer das três"],
  ["2020-09-22-15-09-01.png", "site_02_odontograma_legenda.png", "gather/general-odontogram-overview",
    "A legenda de cor inteira, e ela tem só quatro cores: vermelho = achado diagnóstico existente, preto = material existente, verde = procedimento planejado ou em andamento, azul = procedimento concluído ou achado já tratado. Compare com os três estados da Subetapa 03.7 (`existente`/`a_realizar`/`executado`)"],
  ["2020-09-22-14-57-51.png", "site_03_odontograma_visuais.png", "gather/general-odontogram-overview",
    "Desenhos especializados por tipo de tratamento — implante, coroa, núcleo, endodontia e faceta têm forma própria no desenho, não só cor. É o que distingue um odontograma de um mapa colorido"],
  ["2020-09-22-14-58-04.png", "site_04_odontograma_asterisco.png", "gather/general-odontogram-overview",
    "O caso alternativo declarado: tratamento sem face selecionada e sem visual próprio vira um **asterisco vermelho ao lado do número do dente**, com o código no hover. O desenho não silencia o que não sabe desenhar"],
  ["2020-09-22-11-37-02.png", "site_05_denticao_por_idade.png", "gather/patient-dentition-overview",
    "A dentição inicial sai da IDADE do paciente, em 12 faixas de 0-9 meses a 20+ anos, cada uma com a lista exata de dentes erupcionados e não erupcionados"],
  ["2020-09-22-14-28-55.png", "site_06_editar_denticao.png", "gather/change-a-patients-dentition",
    "O modo de edição de dentição: adicionar, supranumerário, substituir (permanente ↔ decíduo), erupcionar, não-erupcionar, ausente, remover — por dente ou por seleção múltipla com Ctrl/Shift"],
  ["2020-09-22-14-29-46.png", "site_07_denticao_selecao.png", "gather/change-a-patients-dentition",
    "Seleção múltipla de dentes em azul antes de aplicar a mudança de dentição — o mesmo gesto que a 03.7 não tem"],
  ["2020-04-06-15-28-42.png", "site_08_quick_charting.png", "gather/../treatment/enter-a-procedure-with-quick-charting",
    "**A resposta direta à NOTA 03, característica 2:** clicar num dente OU NUMA FACE abre um pop-up com cinco códigos configuráveis e um `Search for code…`. É o pop-up da imagem `06` de Max, e é a entrada de dado — não um painel lateral"],
  ["2020-04-06-15-28-55.png", "site_09_quick_charting_status.png", "gather/../treatment/enter-a-procedure-with-quick-charting",
    "O status na mesma linha do pop-up: PP proposto · PL planejado · IP em andamento · CO concluído. Duas escolhas e o procedimento está lançado no dente e na face"],
  ["2020-09-22-10-42-24.png", "site_10_charting_settings.png", "gather/charting-overview",
    "As opções de exibição do odontograma por profissional — sextantes em vez de quadrantes, zoom no hover e **micro-superfícies**: entrada em detalhe fino, com o faturamento indo para a face-pai"],

  // ── treatment planning: o que o ICE chama de "orçamento"
  ["quick-reference-guide-treatment-planning.jpeg", "site_11_treatment_planning_guia.jpeg", "treatment/navigate-treatment-planning",
    "**O guia oficial do Treatment Planning, anotado pelo próprio fornecedor.** Diagnósticos não fasados à esquerda; fases (Emergency/Systemic/Acute/Disease Control/Definitive) em linhas; Opção A e Opção B em COLUNAS; procedimento aninhado dentro do diagnóstico que ele trata. À direita, os Health Facts com alergia, condição e medicação em cores — o item 5 do nosso MVP"],
  ["2020-10-22-10-19-26.png", "site_12_requisitos_pendentes.png", "treatment/navigate-treatment-planning",
    "O pop-over de requisitos com pendência: consentimento de tratamento, consentimento informado, pré-determinação de convênio, validação por supervisor e vínculo obrigatório a um achado. **O procedimento carrega as próprias pré-condições**"],
  ["2020-10-22-10-19-29.png", "site_13_requisitos_cumpridos.png", "treatment/navigate-treatment-planning",
    "O mesmo pop-over com tudo cumprido — o vermelho vira verde e cada item vira link para o documento que o satisfez"],
  ["2020-10-22-11-55-45.png", "site_14_opcao_tratamento.png", "treatment/create-treatment-options",
    "A escolha da opção (A/B) no momento de lançar o procedimento — a coluna é campo do formulário, não uma tela à parte"],
  ["2020-10-22-11-55-49.png", "site_15_adicionar_coluna.png", "treatment/create-treatment-options",
    "Opções são colunas e o número delas é livre: `+` acrescenta, `X` remove — e o `X` some se a coluna tiver procedimento dentro"],
  ["2020-10-22-11-21-07.gif", "site_16_arrastar_fase.gif", "treatment/phase-a-diagnosis-or-treatment",
    "Arrastar e soltar como método principal de fasear diagnóstico e procedimento — o gesto que organiza o plano inteiro"],
  ["2020-10-22-11-21-31.gif", "site_17_vincular_diagnostico.gif", "treatment/phase-a-diagnosis-or-treatment",
    "Soltar o procedimento DENTRO do diagnóstico o vincula; soltar fora o deixa solto. O vínculo procedimento↔diagnóstico é um gesto, não um campo"],
  ["2020-04-06-14-13-04.png", "site_18_codigo_ou_area.png", "treatment/enter-a-procedure",
    "**Escolher o código primeiro OU a área primeiro**, e a primeira escolha filtra a segunda pelas regras do código: escolher `3O` e buscar resina exclui os códigos que só valem em dente anterior"],
  ["2020-04-06-14-13-08.png", "site_19_procedure_input.png", "treatment/enter-a-procedure",
    "A janela `Procedure Input` inteira — status, data, opção de tratamento, dente/área e faces, e profissionais adicionais com papel. É a imagem `07` que Max separou, vista pela documentação"],
  ["2020-10-20-12-03-57.png", "site_20_status_procedimento.png", "treatment/update-a-procedures-status",
    "O pop-over de edição rápida com o status atual destacado em azul — o mesmo controle PP/PL/IP/CO/NLN da imagem `08` de Max"],
  ["2020-10-21-13-06-16.png", "site_21_step_set.png", "treatment/enter-a-step-set",
    "**Step set:** um código de procedimento partido em etapas, cada uma com status, data e consulta próprios — e uma delas marcada como a etapa faturável. É a coroa em várias sessões, modelada"],
  ["2020-04-06-12-33-42.png", "site_22_finding_input.png", "gather/enter-a-diagnosis-or-existing-material",
    "A entrada de achado sobre o odontograma: diagnóstico ou material existente, com seleção de faces. Selecionar 30 MOD, 3 OD e 2 MOD cria TRÊS linhas, uma por dente — não uma linha com três dentes"],
  ["2020-10-22-14-27-52.png", "site_23_consentimento_selecao.png", "treatment/consent-to-treatment",
    "O painel de plano em modo consentimento: caixa de seleção por procedimento, e `Select All` por fase ou por opção. O consentimento é sobre um SUBCONJUNTO escolhido do plano"],
  ["2020-10-23-11-49-50.png", "site_24_consentimento_formulario.png", "treatment/consent-to-treatment",
    "**A resposta à PV3.** O formulário gerado a partir de um modelo de documento; quando o modelo traz o tipo de pergunta `Consent Table`, ele exibe o tratamento por fase COM as estimativas de convênio. É o nosso 'PDF Plano de Tratamento com duas assinaturas' — e ele é um documento configurável, não uma vista de impressão"],

  // ── financeiro e convênio: a resposta à PV1
  ["2020-07-23-15-38-01.png", "site_25_financeiro_workspace.png", "financials/financials-introduction",
    "**As cinco seções do financeiro do paciente**, anotadas pelo fornecedor: responsável e convênio, saldos, faixas de vencimento, botões de ação e abas de transação"],
  ["2020-07-23-15-52-23.png", "site_26_saldos.png", "financials/financials-introduction",
    "Sete saldos distintos, não um: paciente, convênio, total, planos futuros, paciente-completo, pré-pagamento total e reembolsos pendentes"],
  ["2020-07-23-16-20-23.png", "site_27_aging.png", "financials/financials-introduction",
    "As faixas de vencimento, e a regra: o status financeiro do paciente é definido pela faixa MAIS ANTIGA com saldo em aberto"],
  ["2020-11-05-13-54-42.png", "site_28_fee_schedules.png", "configure/practice-settings-fee-schedules",
    "**A resposta à PV1.** A tabela de preço é entidade própria, com rascunho e data de vigência — e se aplica na ordem `Paciente > Tipo de profissional > Clínica > Grupo de clínicas > Prática`"],
  ["2020-11-05-13-54-54.png", "site_29_fee_rates.png", "configure/practice-settings-fee-schedules",
    "Rascunho de tarifas criado a partir de outra tabela com ajuste percentual (103% para subir 3%) e **congelado ao ser comprometido** — tarifa comprometida não se edita, só se cria a próxima"],
  ["insurance-policy-benefits-coverages-exceptions.png", "site_30_coberturas.png", "financials/manage-insurance-payers-and-policies",
    "Cobertura por CATEGORIA de procedimento: percentual ou valor, teto anual ou vitalício, franquia dispensada, número de ocorrências, e se a categoria exige pré-determinação, CID-10 ou profissional encaminhador"],
  ["insurance-policy-exception-add.png", "site_31_excecao_por_codigo.png", "financials/manage-insurance-payers-and-policies",
    "A exceção por CÓDIGO, que é onde o modelo fica realmente fino: idade mínima e máxima, frequência, ocorrências e 'excluir da guia'. O exemplo do próprio fornecedor: preventiva coberta a 80%, mas flúor não coberto acima de 16 anos"],
  ["insurance-policy-view-new.png", "site_32_apolice.png", "financials/manage-insurance-payers-and-policies",
    "A apólice inteira. Note `Policy Type` = Capitação · Percentual por categoria · Medicaid · Percentual PPO, e que PPO exige uma TABELA DE PREÇO própria mais um código de ajuste contratual"],
  ["20089398.png", "site_33_predeterminacao.png", "financials/create-a-predetermination",
    "A pré-determinação (pré-autorização): por padrão só lista os procedimentos que a apólice do paciente EXIGE que passem por ela. É o orçamento submetido ao convênio antes do tratamento"],

  // ── permissão e alerta
  ["2021-03-25-13-20-32.png", "site_34_permissoes_grupo.png", "configure/practice-settings-provider-group-permissions",
    "**Para a Subetapa 03.21.a.** A permissão é ADITIVA por grupo: o usuário pertence a N grupos e soma as permissões de todos. Sem papel fixo, sem hierarquia — quem não está em grupo nenhum só vê o próprio painel e a ajuda"],
  ["10262030.png", "site_35_warnings.png", "report/check-warnings-instead-of-running-reports",
    "**Warnings:** relatório que devolve linha vira mensagem acionável no painel, com contagem e link para a lista. Valida o item 12 do nosso MVP (painel como lista de tarefas, não de gráficos) por um caminho independente"],
];

/** [slug do vídeo, mosaico, nome no repositório, tese] */
const VIDEOS = [
  ["ICE12", "mosaico_01.jpg", "vid_overview_01_recepcao.jpg",
    "**System overview (50 min), 0-6 min.** O login da RECEPCIONISTA: grade de agenda com cadeiras e recursos ao lado dos profissionais, marcação de chegada, cadastro da apólice de convênio e vínculo de profissional principal"],
  ["ICE12", "mosaico_03.jpg", "vid_overview_02_anamnese.jpg",
    "12-18 min. A anamnese com perguntas em árvore que ACRESCENTAM health facts ao registro — hipertensão, diabetes, varfarina — e a integração Lexicomp consultada dentro do formulário"],
  ["ICE12", "mosaico_05.jpg", "vid_overview_03_denticao_achados.jpg",
    "18-24 min. O dentista edita a dentição (marca 4 dentes como ausentes, substitui o 11 permanente pelo decíduo H), lança materiais existentes e diagnósticos por face, e entra o periograma"],
  ["ICE12", "mosaico_06.jpg", "vid_overview_04_plano_opcoes.jpg",
    "26-32 min. O plano: diagnóstico arrastado para a fase, resina na Opção A e coroa (como step set de 4 etapas) na Opção B, e o pop-over de requisitos exigindo consentimento e validação"],
  ["ICE12", "mosaico_07.jpg", "vid_overview_05_checkout.jpg",
    "32-38 min. A volta à recepção: procedimento marcado como concluído VIRA COBRANÇA, pagamento parcial de $50, extrato ad hoc em PDF com as faixas de vencimento"],
  ["ICE12", "mosaico_09.jpg", "vid_overview_06_validacao.jpg",
    "44-50 min. A validação: o supervisor revê tudo que a aluna lançou — formulários, sinais vitais, periograma, odontograma — e devolve por mensagem interna. Não temos equivalente"],
  ["ICE13", "mosaico_01.jpg", "vid_billing_01_estimativa.jpg",
    "**Billing overview (49 min), 0-6 min.** A apólice entra na ficha, o procedimento é lançado e o pop-over já mostra `Estimate: Ins. $200.00 / Pt. $50.00` — a estimativa nasce no ato clínico, com o convênio e a tabela de preço"],
  ["ICE13", "mosaico_03.jpg", "vid_billing_02_guia_fila.jpg",
    "8-14 min. A guia entra numa FILA por tipo (papel/eletrônica), é revista uma a uma, aprovada ou retida, e só então submetida em lote — um PDF único com todos os formulários preenchidos"],
  ["ICE13", "mosaico_05.jpg", "vid_billing_03_alocacao.jpg",
    "18-24 min. O pagamento do convênio chega como LOTE e é alocado charge a charge, de vários pacientes, sem sair da tela — negação, ajuste contratual, transferência entre contas e código de motivo"],
  ["ICE13", "mosaico_07.jpg", "vid_billing_04_fee_schedule.jpg",
    "30-36 min. A mesma consulta custa $250 com um profissional e $400 com um especialista, porque a tabela de preço resolve por `Paciente > Tipo de profissional > Clínica > Grupo > Padrão` sozinha"],
  ["ICE13", "mosaico_08.jpg", "vid_billing_05_ajuste_contratual.jpg",
    "36-44 min. O caso difícil: o convênio pagou 160 em vez de 320. Ajuste contratual de 200 reduz a cobrança ao valor acordado e o crédito de 40 é transferido ao paciente — o desconto contratual chega a ele, e continua reportável"],
  ["ICE01", "mosaico.jpg", "vid_curto_01_materiais_apoio.jpg",
    "Material de apoio dentro do próprio sistema — artigo, vídeo e guia de referência acessíveis sem sair da tela"],
  ["ICE20", "mosaico.jpg", "vid_curto_02_criar_paciente.jpg",
    "Criação de paciente em 60 segundos, com busca prévia obrigatória para não duplicar registro"],
  ["ICE21", "mosaico.jpg", "vid_curto_03_navegacao.jpg",
    "A navegação: Practice / Provider / Patient / Individual / External Provider / References — cinco escopos de sujeito, não uma lista de módulos"],
  ["ICE27", "mosaico.jpg", "vid_curto_04_paineis.jpg",
    "Painéis: a tela é montada pelo usuário a partir de widgets, e o conjunto vira uma 'panel view' que pode ser compartilhada pelo administrador"],
  ["ICE29", "mosaico.jpg", "vid_curto_05_risco.jpg",
    "Relatório de avaliação de risco do paciente"],
  ["ICE30", "mosaico.jpg", "vid_curto_06_cartas.jpg",
    "Cartas: documento gerado por modelo, com dados do paciente injetados — o mecanismo que também gera o termo de consentimento"],
  ["ICE05", "mosaico.jpg", "vid_curto_07_encaminhamento.jpg",
    "Encaminhamento para laboratório de exame, com formulário e anexo — o análogo do nosso item 23 (contrarreferência)"],
  ["ICE32", "mosaico.jpg", "vid_curto_08_dados_pesquisa.jpg",
    "Propriedades de dado para apoio clínico e de pesquisa — o vocabulário estruturado que torna o prontuário reportável"],
];

const linhas = [];
let copiadas = 0, faltando = [];

for (const [origem, nome, pagina, tese] of SITE) {
  const de = path.join(IMG, origem);
  if (!fs.existsSync(de)) { faltando.push(origem); continue; }
  fs.copyFileSync(de, path.join(DESTINO, nome));
  copiadas++;
  const url = `${BASE}/${pagina.replace(/^gather\/\.\.\//, "")}`;
  linhas.push(`| \`${nome}\` | ${tese} | [${url.replace(BASE + "/", "")}](${url}) | ${COLETA} |`);
}

// Mosaico de vídeo recomprimido: a matéria-prima sai a ~600 KB por imagem e o
// repositório não precisa disso para uma leitura de estrutura.
for (const [slug, mosaico, nome, tese] of VIDEOS) {
  const de = path.join(VID, slug, mosaico);
  if (!fs.existsSync(de)) { faltando.push(`${slug}/${mosaico}`); continue; }
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", de, "-vf", "scale=1600:-2", "-q:v", "6", path.join(DESTINO, nome)]);
  copiadas++;
  const meta = JSON.parse(fs.readFileSync(path.join(VID, slug, "meta.json"), "utf-8"));
  linhas.push(`| \`${nome}\` | ${tese} | [${meta.url}](${meta.url}) | ${COLETA} |`);
}

const svgs = fs.readdirSync(DESTINO).filter((f) => f.startsWith("svg_")).sort();

const indice = `# Índice das evidências visuais — ICE Health System

**${copiadas} referências** da pesquisa \`analise-ice\`, coletadas em **${COLETA}** por
[\`../../coletar_ice.mjs\`](../../coletar_ice.mjs) e escolhidas por
[\`../../curar_capturas_ice.mjs\`](../../curar_capturas_ice.mjs), mais ${svgs.length} arquivos
da amostra da NOTA 04, que são **nossos**.

Todas de **material público**: as \`site_*\` são as imagens do produto que o próprio fornecedor
publica no help center; as \`vid_*\` são mosaicos de quadros de vídeos públicos do canal de
suporte no YouTube. **Sem cadastro, sem login, sem trial, sem formulário preenchido** — o que
estivesse atrás de cadastro foi registrado como indisponível, não contornado.

**Captura sem tese foi descartada, não arquivada.** O bruto tem **1.023 imagens** de site e
**48 mosaicos** de vídeo; o que está aqui é o que sustenta uma afirmação do
[\`../../RELATORIO.md\`](../../RELATORIO.md) ou do [\`../../fontes/ice.md\`](../../fontes/ice.md).

Material de terceiro, para benchmark interno. Nenhuma marca, logo ou tela do ICE é reaproveitada
como identidade do Vitrine nem republicada fora deste repositório. **A estética do ICE não se
copia** — o interesse é estrutura, campo de formulário, caminho feliz e caminho alternativo
(NOTA 05 de Max).

Diferença de formato em relação a [\`../concorrentes/INDICE.md\`](../concorrentes/INDICE.md),
declarada: lá as capturas são PNG 3360×2100 renderizados por navegador, para comparar lado a lado
com \`design/ux/versoes/telas/\`. Aqui a fonte é melhor — **a imagem original do produto,
publicada pelo fornecedor** —, e ela vem no tamanho em que ele a publica. Renderizar a página do
help center para fotografar uma imagem que já é arquivo seria perder resolução de propósito.

| Arquivo | O que prova | Origem | Data |
|---|---|---|---|
${linhas.join("\n")}

## Amostra da NOTA 04 — arquivos nossos, não do ICE

Prova de que o caminho "o CODE gera o SVG" produz face, raiz e coroa individualmente
endereçáveis. Gerados por [\`../../gerar_dentes_svg.mjs\`](../../gerar_dentes_svg.mjs) e provados
em navegador real por [\`../../provar_dentes_svg.mjs\`](../../provar_dentes_svg.mjs) — 18/18
asserções verdes, 24 cliques devolvendo região e dente corretos.

| Arquivo | O que é |
|---|---|
| \`svg_1_incisivo_11.svg\` | Incisivo central superior direito: 5 faces + coroa + 1 raiz |
| \`svg_2_premolar_14.svg\` | Primeiro pré-molar superior direito: 5 faces + coroa + 2 raízes |
| \`svg_3_molar_16.svg\` | Primeiro molar superior direito: 5 faces + coroa + 3 raízes |
| \`svg_prova.html\` | Página que resolve a região pelo alvo do clique, sem cálculo de coordenada |
| \`svg_prova_captura.png\` | A prova rodando, com os três estados de marcação pintados |
`;

fs.writeFileSync(path.join(DESTINO, "INDICE.md"), indice, "utf-8");
console.log(`${copiadas} capturas em capturas/ice/ · ${svgs.length} arquivos da amostra NOTA 04`);
if (faltando.length) console.log(`FALTANDO (${faltando.length}): ${faltando.join(", ")}`);
const bytes = fs.readdirSync(DESTINO).reduce((s, f) => s + fs.statSync(path.join(DESTINO, f)).size, 0);
console.log(`peso total: ${(bytes / 1048576).toFixed(1)} MB`);
