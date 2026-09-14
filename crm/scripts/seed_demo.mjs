/**
 * Seed de demonstração — Subetapa 02.13.a
 * =========================================
 *
 * Popula UMA conta de demonstração com dados fictícios cobrindo os 9 módulos
 * do v01, com **no mínimo 2 registros por estado** de cada tabela que tem
 * estado (pedido de Max). A lista de estados não foi inventada: saiu de uma
 * varredura das 49 restrições `CHECK ... = ANY (ARRAY[...])` dos schemas
 * `aba_*`, para "2 por situação" ser verificável e não um palpite.
 *
 * REGRAS QUE ESTE ARQUIVO NÃO PODE QUEBRAR
 *
 * 1. **Nenhum telefone real, nem inventado.** `docs/00` (Qualidade da
 *    02.13.a) e `handoffs/instrucoes.md` §6: o provedor completa dígitos ao
 *    rotear, e um número inventado pode cair em conta de terceiro — incidente
 *    real já registrado em projeto irmão (PDF de contrato e chave Pix
 *    enviados a estranho). Aqui os contatos usam o indicativo **+999**, que a
 *    ITU mantém reservado e que não roteia para assinante nenhum em lugar
 *    nenhum. Não é "um número que parece falso": é um número que não existe.
 * 2. **Nenhuma credencial no repositório.** A senha da conta de demonstração
 *    vive só no `.env` (gitignorado), nunca aqui.
 * 3. **Nenhum dado real de cliente.** Todos os nomes são fictícios e o
 *    prefixo `[demo]` no nome da conta deixa a origem explícita.
 * 4. **Sem escrita direta em tabela protegida.** `planos_cliente` e
 *    `saldos_plano` nascem por `aba_finance.vender_pacote()`, como a Qualidade
 *    da 02.8 exige — o seed usa o mesmo caminho do produto, não um atalho.
 *
 * IDEMPOTENTE. Rodar de novo não duplica: `--limpar` apaga a conta de
 * demonstração inteira (cascata) antes de semear.
 *
 * Uso:
 *   node seed/seed_demo.mjs            # semeia (limpa antes, se já existir)
 *   node seed/seed_demo.mjs --limpar   # só apaga, não semeia
 */

import { config } from "dotenv";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAMINHO_ENV = path.resolve(__dirname, "../../.env");
config({ path: CAMINHO_ENV });

const URL = process.env.SUPABASE__URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SENHA = process.env.DEMO_SENHA;
const DOMINIO = "vitrinedemo.local";
const NOME_CONTA = "[demo] Clínica Vitrine — Estética & Saúde";

for (const [nome, v] of Object.entries({ SUPABASE__URL: URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE, DEMO_SENHA: SENHA })) {
  if (!v) throw new Error(`seed_demo: variável de ambiente ausente (${nome}). Confira o .env da raiz.`);
}

/**
 * Guarda contra truncamento silencioso de segredo.
 *
 * Aconteceu de verdade: a primeira `DEMO_SENHA` foi gravada sem aspas e com
 * `#` no meio. O dotenv trata `#` como início de comentário em valor sem
 * aspas e leu só os 4 primeiros caracteres — e como este seed CRIAVA e o
 * script de sessão USAVA o mesmo valor truncado, tudo passou nos testes. Sete
 * usuários de um site público ficaram com senha de 4 caracteres, sem erro em
 * lugar nenhum. Truncar segredo não quebra: só enfraquece, em silêncio.
 *
 * Por isso a comparação é contra o ARQUIVO, não contra o que o dotenv devolve.
 */
{
  const linha = readFileSync(CAMINHO_ENV, "utf8").split(/\r?\n/).find((l) => l.startsWith("DEMO_SENHA="));
  const noArquivo = linha.slice("DEMO_SENHA=".length).replace(/^'/, "").replace(/'$/, "");
  if (noArquivo !== SENHA) {
    throw new Error(
      `seed_demo: DEMO_SENHA truncada pelo dotenv (${noArquivo.length} caracteres no .env, ${SENHA.length} lidos). ` +
        `Envolva o valor em aspas simples e evite '#' no meio.`,
    );
  }
  if (SENHA.length < 12) throw new Error(`seed_demo: DEMO_SENHA curta demais (${SENHA.length} caracteres). Mínimo 12.`);
}

const db = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

// ---------------------------------------------------------------- utilidades
const s = (schema) => db.schema(schema);
let passo = 0;
const log = (m) => console.log(`  ${String(++passo).padStart(2, "0")}. ${m}`);

function ok(r, oque) {
  if (r.error) throw new Error(`${oque}: ${r.error.message}`);
  return r.data;
}

/**
 * Insere e devolve as linhas criadas, **agrupadas por conjunto de colunas**.
 *
 * Num insert em lote o PostgREST uniformiza as colunas de todas as linhas: a
 * chave ausente numa delas é enviada como NULL explícito, e NULL explícito
 * **não cai no default da coluna** — derruba o NOT NULL. Isso mordeu três
 * vezes seguidas neste seed (`mensagens.criado_em`,
 * `transmissoes.contador_*`, `automacoes.config_gatilho`), sempre com a
 * mesma cara de "coluna obrigatória sem valor" quando o valor existia como
 * default.
 *
 * Agrupar por assinatura de colunas resolve a classe inteira: cada grupo
 * viaja com exatamente as suas chaves, e o banco aplica os defaults que
 * faltam. Alternativa seria repetir todo default à mão em toda linha —
 * frágil e silencioso quando o default mudar.
 */
async function inserir(schema, tabela, linhas, oque) {
  const grupos = new Map();
  for (const linha of linhas) {
    const assinatura = Object.keys(linha).sort().join("|");
    (grupos.get(assinatura) ?? grupos.set(assinatura, []).get(assinatura)).push(linha);
  }
  const criadas = [];
  for (const grupo of grupos.values()) {
    criadas.push(...ok(await s(schema).from(tabela).insert(grupo).select(), oque ?? `${schema}.${tabela}`));
  }
  return criadas;
}

const hoje = new Date();
const dia = (n) => {
  const d = new Date(hoje);
  d.setDate(d.getDate() + n);
  return d;
};
const iso = (d) => d.toISOString();
const data = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Horário no fuso da conta. `timestamp` cru vira UTC na sessão e cai fora do
 * expediente — o trigger `verificar_expediente_agendamento` recusa, e a
 * mensagem dele diz o fuso (armadilha registrada em instrucoes.md §5).
 */
function horaLocal(d, hora) {
  const base = new Date(d);
  // -03:00 é o fuso da conta (America/Sao_Paulo, sem horário de verão desde 2019).
  return `${data(base)}T${String(hora).padStart(2, "0")}:00:00-03:00`;
}

/** Próximo dia útil a partir de um deslocamento em dias. */
function diaUtil(offset) {
  const d = dia(offset);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + (offset >= 0 ? 1 : -1));
  return d;
}

/** Indicativo +999 — reservado pela ITU, não roteia. Ver cabeçalho, regra 1. */
const telefoneFicticio = (n) => `+9990000${String(n).padStart(4, "0")}`;

// ---------------------------------------------------------------- limpeza
async function localizarConta() {
  const contas = ok(await db.from("accounts").select("id, name, owner_user_id").eq("name", NOME_CONTA), "buscar conta demo");
  return contas[0] ?? null;
}

async function limpar() {
  const conta = await localizarConta();
  if (!conta) return log("nada a limpar — conta de demonstração não existe");

  // A ORDEM IMPORTA, e apagar a conta não basta.
  //
  // Duas descobertas medidas aqui: (1) apagar `profiles` primeiro falha,
  // porque `funcionarios.profile_id` é ON DELETE SET NULL e o DELETE do
  // perfil vira UPDATE no funcionário, batendo no CHECK
  // `funcionarios_ativo_exige_login`; (2) apagar a conta primeiro também
  // falha, porque **25 chaves estrangeiras dos schemas `aba_*` são RESTRICT
  // ou NO ACTION**, não CASCADE — foi decisão de integridade (dado clínico e
  // financeiro não some junto com o pai por acidente), e o preço é que a
  // limpeza precisa ser explícita e na ordem certa.
  //
  // Daí a lista abaixo: filhos antes de pais, módulo a módulo.
  const conta_id = conta.id;
  const perfis = ok(await db.from("profiles").select("user_id").eq("account_id", conta_id), "perfis da conta demo");

  // Filhas sem `account_id` próprio: saem pelo id do pai.
  const ids = async (schema, tabela, coluna = "id") =>
    ok(await s(schema).from(tabela).select(coluna).eq("account_id", conta_id), `ids de ${schema}.${tabela}`).map((r) => r[coluna]);

  const [transmissoesIds, fluxosIds, automacoesIds, funisIds, pessoasIds] = await Promise.all([
    ids("aba_messaging", "transmissoes"), ids("aba_automations", "fluxos"),
    ids("aba_automations", "automacoes"), ids("aba_sales", "funis"), ids("aba_people", "pessoas"),
  ]);
  const apagarPor = async (schema, tabela, coluna, valores) => {
    if (!valores.length) return;
    ok(await s(schema).from(tabela).delete().in(coluna, valores), `${schema}.${tabela}`);
  };
  await apagarPor("aba_messaging", "destinatarios_transmissao", "transmissao_id", transmissoesIds);
  await apagarPor("aba_automations", "fluxo_nos", "fluxo_id", fluxosIds);
  await apagarPor("aba_automations", "automacao_etapas", "automacao_id", automacoesIds);
  await apagarPor("aba_people", "pessoa_tags", "pessoa_id", pessoasIds);
  await apagarPor("aba_people", "pessoa_campos_customizados", "pessoa_id", pessoasIds);
  const etapas = [];
  for (const f of funisIds) etapas.push(...ok(await s("aba_sales").from("etapas_funil").select("id").eq("funil_id", f), "etapas").map((e) => e.id));

  const ORDEM = [
    ["aba_ai", ["ia_log_uso", "ia_trechos_conhecimento", "ia_documentos_conhecimento", "ia_configuracoes", "aceites_termo_ia"]],
    ["aba_automations", ["fluxo_execucoes", "fluxos", "automacao_logs", "automacao_execucoes_pendentes", "automacoes"]],
    ["aba_messaging", ["reacoes_mensagem", "mensagens", "transmissoes", "conversas", "eventos_provedor", "contatos_canal", "modelos_mensagem", "respostas_rapidas", "provedores_canal", "configuracao_whatsapp"]],
    ["aba_health", ["log_acesso", "respostas_anamnese", "evolucoes", "consentimentos", "prontuarios", "concessoes_prontuario", "formularios_anamnese"]],
    ["aba_finance", ["extrato_pacote", "saldos_pacote", "pacotes_cliente", "pagamentos", "envios_fatura", "itens_fatura", "faturas", "lancamentos_comissao", "regras_comissao", "parcelas_contrato", "contratos"]],
    ["aba_sales", ["oportunidades", "funis"]],
    ["aba_scheduling", ["lembretes", "agendamento_procedimentos", "agendamentos", "ausencias", "horarios_profissionais", "horarios_recursos", "recursos", "profissionais"]],
    ["aba_catalog", ["itens_pacote", "variantes_procedimento", "pacotes", "procedimentos", "categorias"]],
    ["aba_people", ["pessoa_notas", "campos_customizados", "tags", "leads", "clientes", "fornecedores", "funcionarios", "pessoas"]],
  ];
  for (const [schema, tabelas] of ORDEM) {
    for (const tabela of tabelas) {
      ok(await s(schema).from(tabela).delete().eq("account_id", conta_id), `limpar ${schema}.${tabela}`);
    }
  }
  if (etapas.length) ok(await s("aba_sales").from("etapas_funil").delete().in("id", etapas), "limpar etapas_funil");

  // Só agora: com os funcionários fora, apagar a conta não dispara mais o
  // SET NULL que batia no CHECK. `profiles` e `licensing` saem por cascata.
  ok(await db.from("accounts").delete().eq("id", conta_id), "apagar conta");
  for (const p of perfis) {
    const { error } = await db.auth.admin.deleteUser(p.user_id);
    if (error && !/not found/i.test(error.message)) throw new Error(`apagar usuário ${p.user_id}: ${error.message}`);
  }
  log(`conta de demonstração removida (${perfis.length} usuários)`);
}

// ---------------------------------------------------------------- equipe
const EQUIPE = [
  { chave: "owner", email: `proprietaria@${DOMINIO}`, nome: "Helena Marques", papel: "owner", cargo: "Proprietária" },
  { chave: "recepcao", email: `recepcao@${DOMINIO}`, nome: "Bianca Duarte", papel: "admin", cargo: "Recepcionista" },
  { chave: "prof1", email: `esteticista@${DOMINIO}`, nome: "Tiago Rocha", papel: "agent", cargo: "Esteticista" },
  { chave: "prof2", email: `fisioterapeuta@${DOMINIO}`, nome: "Aline Prado", papel: "agent", cargo: "Fisioterapeuta" },
  { chave: "prof3", email: `terapeuta@${DOMINIO}`, nome: "Marcos Dias", papel: "agent", cargo: "Terapeuta" },
  { chave: "profInativo", email: `afastado@${DOMINIO}`, nome: "Rafael Nunes", papel: "agent", cargo: "Massoterapeuta (afastado)" },
  { chave: "auxiliar", email: `auxiliar@${DOMINIO}`, nome: "Clara Vieira", papel: "viewer", cargo: "Auxiliar geral" },
];

async function criarEquipe() {
  const criados = {};

  // O proprietário nasce primeiro: `handle_new_user` cria conta + perfil
  // `owner`, e é essa conta que vira a conta de demonstração.
  for (const m of EQUIPE) {
    const { data: u, error } = await db.auth.admin.createUser({
      email: m.email,
      password: SENHA,
      email_confirm: true,
      user_metadata: { full_name: m.nome },
    });
    if (error) throw new Error(`criar usuário ${m.email}: ${error.message}`);
    criados[m.chave] = { ...m, userId: u.user.id };
  }
  log(`${EQUIPE.length} usuários criados`);

  const perfilOwner = ok(
    await db.from("profiles").select("id, account_id").eq("user_id", criados.owner.userId).single(),
    "perfil do proprietário",
  );
  const contaId = perfilOwner.account_id;

  ok(await db.from("accounts").update({ name: NOME_CONTA }).eq("id", contaId), "renomear conta demo");

  // Teto padrão de conta nova é 3 (medido). São 7 pessoas na demonstração —
  // sem elevar, o trigger `enforce_seat_limit` recusa a partir da quarta.
  // A mudança fica registrada em `licensing.limit_changes` pelo trigger de
  // auditoria, que é a trilha que o produto tem enquanto não existe painel.
  ok(
    await s("licensing").from("account_limits").update({ max_users: 10, notes: "Conta de demonstração (Subetapa 02.13.a)" }).eq("account_id", contaId),
    "elevar teto de assentos",
  );

  // Os demais entram na conta do proprietário. O trigger
  // `nascer_funcionario_do_perfil` cria o funcionário junto, na mudança de
  // account_id — a mesma cadeia do convite real da Subetapa 02.2.
  for (const m of EQUIPE.filter((x) => x.chave !== "owner")) {
    const perfil = ok(await db.from("profiles").select("id, account_id").eq("user_id", criados[m.chave].userId).single(), `perfil ${m.email}`);
    const contaAntiga = perfil.account_id;
    ok(await db.from("profiles").update({ account_id: contaId, account_role: m.papel }).eq("id", perfil.id), `mover perfil ${m.email}`);
    ok(await db.from("accounts").delete().eq("id", contaAntiga), `apagar conta órfã de ${m.email}`);
  }
  log("equipe consolidada numa conta só (1 owner · 1 admin · 4 agent · 1 viewer)");

  // funcionários já existem pelo trigger; só recebem cargo.
  for (const m of EQUIPE) {
    const perfil = ok(await db.from("profiles").select("id").eq("user_id", criados[m.chave].userId).single(), `perfil ${m.email}`);
    criados[m.chave].profileId = perfil.id;
    const func = ok(
      await s("aba_people").from("funcionarios").select("id").eq("profile_id", perfil.id).maybeSingle(),
      `funcionário de ${m.email}`,
    );
    if (func) {
      criados[m.chave].funcionarioId = func.id;
      ok(await s("aba_people").from("funcionarios").update({ cargo: m.cargo }).eq("id", func.id), `cargo de ${m.email}`);
    }
  }

  return { contaId, equipe: criados };
}

// ---------------------------------------------------------------- principal
async function semear() {
  const { contaId, equipe } = await criarEquipe();
  const conta = contaId;

  // ---------- profissionais: 3 ativos + 1 inativo ----------
  const profs = {};
  for (const [chave, ativo, cor, especialidade] of [
    ["prof1", true, "#5b87a8", "Estética facial"],
    ["prof2", true, "#8fb4a6", "Fisioterapia dermatofuncional"],
    ["prof3", true, "#c8b79a", "Terapias integrativas"],
    ["profInativo", false, "#a8827a", "Massoterapia"],
  ]) {
    const m = equipe[chave];
    const [p] = await inserir("aba_scheduling", "profissionais", [
      {
        account_id: conta,
        funcionario_id: m.funcionarioId,
        profile_id: m.profileId,
        nome_exibicao: m.nome,
        cor,
        especialidade,
        acesso_clinico: ativo,
        ativo,
      },
    ]);
    profs[chave] = p.id;
  }
  // Profissional afastado: funcionário desligado junto, senão o atributo
  // profissional inativo fica incoerente com um funcionário ativo.
  ok(
    await s("aba_people").from("funcionarios").update({ ativo: false }).eq("id", equipe.profInativo.funcionarioId),
    "desligar funcionário afastado",
  );
  log("4 profissionais (3 ativos com acesso clínico · 1 afastado)");

  // grade: seg-sex 09-18 para os 3 ativos
  await inserir(
    "aba_scheduling",
    "horarios_profissionais",
    ["prof1", "prof2", "prof3"].flatMap((k) =>
      [1, 2, 3, 4, 5].map((d) => ({ account_id: conta, profissional_id: profs[k], dia_semana: d, inicio: "09:00", fim: "18:00", ativo: true })),
    ),
  );

  // ---------- recursos: 2 salas + 2 equipamentos ----------
  const recursos = await inserir("aba_scheduling", "recursos", [
    { account_id: conta, nome: "Sala 1 — Facial", tipo: "sala", cor: "#5b87a8", ativo: true },
    { account_id: conta, nome: "Sala 2 — Corporal", tipo: "sala", cor: "#8fb4a6", ativo: true },
    { account_id: conta, nome: "Alta frequência", tipo: "equipamento", cor: "#c8b79a", ativo: true },
    { account_id: conta, nome: "Ultrassom (em manutenção)", tipo: "equipamento", cor: "#a8827a", ativo: false },
  ]);
  log("4 recursos (2 salas · 2 equipamentos, 1 inativo)");

  // ---------- catálogo ----------
  const cats = await inserir("aba_catalog", "categorias", [
    { account_id: conta, nome: "Estética facial", cor: "#5b87a8", posicao: 1, ativo: true },
    { account_id: conta, nome: "Corporal e bem-estar", cor: "#8fb4a6", posicao: 2, ativo: true },
  ]);
  const servicos = await inserir("aba_catalog", "procedimentos", [
    { account_id: conta, categoria_id: cats[0].id, nome: "Limpeza de pele profunda", duracao_padrao_minutos: 60, preco_base: 180, ativo: true },
    { account_id: conta, categoria_id: cats[0].id, nome: "Peeling de diamante", duracao_padrao_minutos: 60, preco_base: 220, ativo: true },
    { account_id: conta, categoria_id: cats[1].id, nome: "Massagem relaxante", duracao_padrao_minutos: 60, preco_base: 150, ativo: true },
    { account_id: conta, categoria_id: cats[1].id, nome: "Drenagem linfática", duracao_padrao_minutos: 60, preco_base: 160, ativo: true },
    { account_id: conta, categoria_id: cats[0].id, nome: "Microagulhamento (suspenso)", duracao_padrao_minutos: 60, preco_base: 350, ativo: false },
    { account_id: conta, categoria_id: cats[1].id, nome: "Bambuterapia (suspenso)", duracao_padrao_minutos: 60, preco_base: 190, ativo: false },
  ]);
  await inserir("aba_catalog", "variantes_procedimento", [
    { account_id: conta, procedimento_id: servicos[0].id, nome: "Padrão", preco: 180, duracao_minutos: 60, padrao: true, ativo: true },
    { account_id: conta, procedimento_id: servicos[0].id, nome: "Com extração estendida", preco: 240, duracao_minutos: 90, padrao: false, ativo: true },
    { account_id: conta, procedimento_id: servicos[2].id, nome: "Padrão", preco: 150, duracao_minutos: 60, padrao: true, ativo: true },
    { account_id: conta, procedimento_id: servicos[2].id, nome: "Sessão dupla", preco: 260, duracao_minutos: 120, padrao: false, ativo: false },
    { account_id: conta, procedimento_id: servicos[1].id, nome: "Peeling reforçado (suspenso)", preco: 300, duracao_minutos: 90, padrao: false, ativo: false },
  ]);
  const planos = await inserir("aba_catalog", "pacotes", [
    { account_id: conta, nome: "Pacote Facial — 5 sessões", preco_total: 800, dias_validade: 180, ativo: true },
    { account_id: conta, nome: "Pacote Corporal — 10 sessões", preco_total: 1300, dias_validade: 240, ativo: true },
    { account_id: conta, nome: "Pacote Verão (encerrado)", preco_total: 600, dias_validade: 90, ativo: false },
    { account_id: conta, nome: "Pacote Detox (descontinuado)", preco_total: 720, dias_validade: 120, ativo: false },
  ]);
  await inserir("aba_catalog", "itens_pacote", [
    { account_id: conta, pacote_id: planos[0].id, procedimento_id: servicos[0].id, sessoes_incluidas: 5 },
    { account_id: conta, pacote_id: planos[1].id, procedimento_id: servicos[2].id, sessoes_incluidas: 6 },
    { account_id: conta, pacote_id: planos[1].id, procedimento_id: servicos[3].id, sessoes_incluidas: 4 },
    { account_id: conta, pacote_id: planos[2].id, procedimento_id: servicos[3].id, sessoes_incluidas: 3 },
  ]);
  log("catálogo: 2 categorias · 6 serviços (4 ativos, 2 suspensos) · 5 variantes · 4 planos (2 ativos, 2 descontinuados)");

  // ---------- pessoas: 10 leads + 10 clientes ----------
  // 12 leads = **6 origens × 2** e **4 status × 3**, para os dois eixos
  // ficarem com pelo menos 2 em cada valor. A primeira versão tinha 10 e
  // deixava `manual`, `api` e `importacao` com um só — descoberto medindo,
  // não relendo o script.
  const NOMES_LEAD = [
    ["Marina Lopes", "novo", "whatsapp"],
    ["Rafael Souza", "novo", "indicacao"],
    ["Camila Nogueira", "novo", "presencial"],
    ["Bruno Aguiar", "qualificado", "whatsapp"],
    ["Letícia Ramos", "qualificado", "manual"],
    ["Diego Ferraz", "qualificado", "api"],
    ["Patrícia Lima", "desqualificado", "importacao"],
    ["Sérgio Bastos", "desqualificado", "manual"],
    ["Vanessa Corrêa", "desqualificado", "api"],
    ["Juliana Castro", "convertido", "indicacao"],
    ["André Pinheiro", "convertido", "presencial"],
    ["Renata Bittencourt", "convertido", "importacao"],
  ];
  const leads = [];
  for (let i = 0; i < NOMES_LEAD.length; i++) {
    const [nome, status, origem] = NOMES_LEAD[i];
    const [p] = await inserir("aba_people", "pessoas", [
      { account_id: conta, nome_exibicao: nome, email: `${nome.split(" ")[0].toLowerCase()}@${DOMINIO}`, telefone: telefoneFicticio(100 + i) },
    ]);
    await inserir("aba_people", "leads", [
      { id: p.id, account_id: conta, origem, status, como_encontrou: origem === "indicacao" ? "Indicação de cliente" : null, criado_em: iso(dia(-(i * 4 + 2))) },
    ]);
    leads.push(p.id);
  }
  log(`${NOMES_LEAD.length} leads (4 status x3 · 6 origens x2)`);

  const NOMES_CLI = [
    "Ana Beatriz Moreira", "Carlos Eduardo Pinto", "Daniela Vasques", "Eduardo Tavares", "Fernanda Quirino",
    "Gustavo Amaral", "Helena Ribeiro", "Isabela Fontes", "João Marcelo Reis", "Karina Duarte",
  ];
  const clientes = [];
  for (let i = 0; i < NOMES_CLI.length; i++) {
    const nome = NOMES_CLI[i];
    const [p] = await inserir("aba_people", "pessoas", [
      { account_id: conta, nome_exibicao: nome, email: `${nome.split(" ")[0].toLowerCase()}${i}@${DOMINIO}`, telefone: telefoneFicticio(200 + i) },
    ]);
    await inserir("aba_people", "clientes", [
      { id: p.id, account_id: conta, razao_social: nome, status: i < 8 ? "ativo" : "inativo", data_nascimento: `19${80 + i}-0${(i % 9) + 1}-1${i % 9}` },
    ]);
    clientes.push(p.id);
  }
  log("10 clientes (8 ativos · 2 inativos)");

  // Fornecedores: o quarto papel de `aba_people`, e o único que faltava na
  // primeira versão — a tela de Pessoas mostrava "Fornecedores · 0".
  for (const [nome, doc] of [["Distribuidora Derma Supply", "00.000.000/0001-00"], ["Cosméticos Bella Linha", "11.111.111/0001-11"]]) {
    const [p] = await inserir("aba_people", "pessoas", [
      { account_id: conta, nome_exibicao: nome, email: `contato@${nome.split(" ")[0].toLowerCase()}.invalid` },
    ]);
    await inserir("aba_people", "fornecedores", [{ id: p.id, account_id: conta, razao_social: nome, documento: doc }]);
  }
  log("2 fornecedores");

  const tags = await inserir("aba_people", "tags", [
    { account_id: conta, nome: "VIP", cor: "#c8b79a" },
    { account_id: conta, nome: "Retorno pendente", cor: "#a8827a" },
    { account_id: conta, nome: "Indicação", cor: "#8fb4a6" },
  ]);
  await inserir("aba_people", "pessoa_tags", [
    { pessoa_id: clientes[0], tag_id: tags[0].id },
    { pessoa_id: clientes[1], tag_id: tags[0].id },
    { pessoa_id: clientes[2], tag_id: tags[1].id },
    { pessoa_id: clientes[3], tag_id: tags[1].id },
    { pessoa_id: leads[8], tag_id: tags[2].id },
    { pessoa_id: leads[9], tag_id: tags[2].id },
  ]);
  await inserir("aba_people", "pessoa_notas", [
    { pessoa_id: clientes[0], account_id: conta, autor_id: equipe.recepcao.profileId, conteudo: "Prefere atendimento no período da manhã." },
    { pessoa_id: clientes[1], account_id: conta, autor_id: equipe.recepcao.profileId, conteudo: "Pediu para não receber mensagens promocionais." },
    { pessoa_id: leads[3], account_id: conta, autor_id: equipe.owner.profileId, conteudo: "Retornar após o feriado; demonstrou interesse no pacote facial." },
  ]);
  log("3 tags · 6 marcações · 3 notas");

  return { conta, equipe, profs, recursos, servicos, planos, leads, clientes, cats };
}

// ---------------------------------------------------------------- execução
const soLimpar = process.argv.includes("--limpar");

console.log(`\nSeed de demonstração — ${NOME_CONTA}\n`);
await limpar();
if (soLimpar) {
  console.log("\nLimpeza concluída.\n");
  process.exit(0);
}

const ctx = await semear();
const { semearOperacao } = await import("./seed_demo_parte2.mjs");
await semearOperacao(db, ctx, { log, inserir, ok, dia, iso, data, horaLocal, diaUtil, telefoneFicticio, s });

console.log(`\nPronto. Conta: ${NOME_CONTA}`);
console.log(`Login de demonstração: ${EQUIPE[0].email} (senha em DEMO_SENHA do .env)\n`);
