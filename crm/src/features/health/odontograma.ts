/**
 * Modelo do odontograma autoral (Subetapa 03.7.a).
 *
 * ============================================================
 * O QUE MUDOU EM RELAÇÃO À 03.7, E POR QUÊ
 * ============================================================
 * A 03.7 embutia `react-advanced-odontogram`, e este arquivo era um
 * ADAPTADOR: ele traduzia o payload da biblioteca (um objeto de 32 dentes ×
 * ~45 campos) para dentro de `aba_health.evolucoes.marcacoes`, com item
 * sentinela, poda e forma pristina capturada ao vivo. A pesquisa `analise-ice`
 * mediu que o clique daquela biblioteca é no DENTE, nunca na face
 * (`src/odontogram.ts`: `tile.addEventListener("click", (e) =>
 * onToothClick(toothNo, e))`), e Max decidiu pelo componente próprio (D-I1,
 * 2026-09-03). Com componente próprio o envelope fica MAIS SIMPLES: o
 * sentinela, a poda e o pristino deixam de existir, e a projeção legível
 * passa a ser o dado inteiro.
 *
 * A restrição 3 da Qualidade continua valendo ao pé da letra: grava em
 * `aba_health.evolucoes.marcacoes` (migration `025`), NUNCA em tabela clínica
 * nova. A `025` escolheu coluna em `evolucoes` para herdar de graça as quatro
 * superfícies que uma tabela própria obrigaria a reconstruir — RLS por
 * `pode_acessar()`, log de escrita por trigger, revogação de `SELECT` por
 * coluna e a trava de evolução assinada.
 *
 * ============================================================
 * OS TRÊS ACHADOS DE MODELO QUE ESTA SUBETAPA CORRIGE
 * ============================================================
 * A2 — A FACE DO ACHADO NÃO É A FACE DO TRABALHO. A 03.7 tinha uma lista só
 *      (`facesDoDente()` somava `caries` + `fillingSurfaces`, que é ONDE HÁ
 *      DOENÇA) e o comentário dela dizia "é este conjunto que a 03.8 cobra por
 *      face". Errado quanto ao negócio: a face que se orça é onde o
 *      profissional vai TRABALHAR — pode coincidir, pode ser maior
 *      (restauração MOD sobre cárie só na oclusal) ou pode não existir como
 *      achado (selante em face hígida). Aqui são duas listas: `achados` e
 *      `trabalhos`, cada uma com faces próprias, e `Marcacao.faces` — o campo
 *      que a Subetapa 03.8 lê — carrega a união das faces dos TRABALHOS.
 *
 * A3 — A DENTIÇÃO É ESTADO POR DENTE, não modo da tela. Seis valores, porque
 *      as quatro maneiras de dizer "não está na boca" têm consequências
 *      diferentes sobre quais códigos são aceitos. Derivado da idade,
 *      editável dente a dente, e o que o profissional afirma vence a
 *      derivação — por isso `denticao` só existe no registro gravado quando
 *      foi AFIRMADO; a derivação nunca é persistida.
 *
 * A4 — TRÊS ESTADOS VIRAM CINCO, e `executado` deixa de ser inferência. A
 *      03.7 derivava `executado` comparando duas evoluções ("a sessão
 *      assinada anterior marcou `a_realizar` e esta já traz no status"). É
 *      elegante e não sustenta a trava de finalização de contrato da 03.8.a,
 *      que depende de "o profissional executou em todas as faces planejadas".
 *      Aqui `executado` é FATO AFIRMADO, com data e autor gravados no próprio
 *      trabalho (restrição 2 da Qualidade).
 */

import contrato from "./dentes/contrato.json";
import type { Marcacao } from "./mapas";

// ============================================================
// Vocabulário fechado
// ============================================================

/**
 * As cinco faces. O centro troca de nome entre anterior (`incisal`) e
 * posterior (`oclusal`) — nome diferente, mesma posição, porque é o NOME que
 * a 03.8 cobra e é assim que a face se chama clinicamente.
 *
 * Vocabulário em português, alinhado a `db/migrations/043_catalogo_regra_do_
 * codigo.sql` (`faces_maximo` de 1 a 5, "mesial, distal, vestibular, lingual,
 * oclusal/incisal"). A 03.7 gravava o vocabulário INGLÊS da biblioteca
 * (`occlusal`, `buccal`) — a troca é parte de sair dela.
 */
export const FACES = ["mesial", "distal", "vestibular", "lingual", "oclusal", "incisal"] as const;
export type FaceDente = (typeof FACES)[number];

/** Regiões que não são face: o clique nelas seleciona o dente inteiro. */
export const REGIOES_NAO_FACE = ["coroa", "raiz"] as const;
export type RegiaoNaoFace = (typeof REGIOES_NAO_FACE)[number];

/**
 * A3 — estado de dentição por posição.
 *
 * As quatro maneiras de dizer "não está na boca" são distintas de propósito:
 * `nao_erupcionado` é cronologia (vai nascer), `ausente` é agenesia ou perda
 * antiga sem registro, `removido` é extração com data, `substituido` é o
 * decíduo que já deu lugar ao permanente. Confundi-las produz orçamento sobre
 * dente que não existe — e cada uma aceita um conjunto diferente de códigos,
 * que é o que a 03.8 vai consultar.
 */
export const ESTADOS_DENTICAO = [
  "erupcionado",
  "nao_erupcionado",
  "ausente",
  "removido",
  "supranumerario",
  "substituido",
] as const;
export type EstadoDenticao = (typeof ESTADOS_DENTICAO)[number];

export const ROTULO_DENTICAO: Record<EstadoDenticao, string> = {
  erupcionado: "erupcionado",
  nao_erupcionado: "não erupcionado",
  ausente: "ausente",
  removido: "removido",
  supranumerario: "supranumerário",
  substituido: "substituído",
};

/**
 * A4 — o ciclo de vida do trabalho, em cinco estados.
 *
 * `proposto` é rascunho e é o ÚNICO que se apaga; o resto sai do plano mas
 * permanece no histórico, porque o registro do que se propôs é o que protege
 * a clínica depois (`docs/02_MODELO_DE_DADOS.md` §12.4). `em_execucao` existe
 * para o tratamento em várias sessões. `executado` é fato afirmado, com data
 * e autor.
 */
export const ESTADOS_TRABALHO = [
  "proposto",
  "planejado",
  "em_execucao",
  "executado",
  "nao_mais_necessario",
] as const;
export type EstadoTrabalho = (typeof ESTADOS_TRABALHO)[number];

/**
 * Catálogo de achado. Deliberadamente curto: achado é o QUE ESTÁ na boca, e o
 * MVP não faz periodontia (item 48, futuro) nem endodontia detalhada. O que
 * importa para a 03.8 não é a riqueza do catálogo — é o achado existir como
 * entrada separada do trabalho, com faces próprias (A2).
 */
export const TIPOS_ACHADO = ["carie", "restauracao", "fratura", "desgaste", "outro"] as const;
export type TipoAchado = (typeof TIPOS_ACHADO)[number];

export const ROTULO_ACHADO: Record<TipoAchado, string> = {
  carie: "cárie",
  restauracao: "restauração",
  fratura: "fratura",
  desgaste: "desgaste",
  outro: "outro achado",
};

// ============================================================
// O registro de um dente — o que vai para `marcacoes`
// ============================================================

export type AchadoDente = {
  /** Faces alcançadas. Vazio = achado do dente inteiro (fratura de coroa, p.ex.). */
  faces: FaceDente[];
  tipo: TipoAchado;
  nota?: string;
};

export type TrabalhoDente = {
  /** Identificador local do item, para editar e remover sem ambiguidade. */
  id: string;
  /** AS FACES DO TRABALHO — é esta lista que a Subetapa 03.8 orça (A2). */
  faces: FaceDente[];
  estado: EstadoTrabalho;
  /** Descrição livre enquanto o vínculo com `aba_catalog.procedimentos` não existe (03.8). */
  descricao?: string;
  /** Preenchidos JUNTOS, e só quando `estado === "executado"` (A4, restrição 2). */
  executadoEm?: string;
  executadoPor?: string;
};

/**
 * Um item do array `marcacoes`, para o mapa `odontograma`.
 *
 * Estende `Marcacao` em vez de substituí-la porque o array é o MESMO dos
 * outros três mapas clínicos e a API de `evolucoes` o tipa como `Marcacao[]`.
 * Os campos extras são opcionais pelo mesmo motivo que `faces` já era: eles
 * são conceito de dente, e mapa facial/corporal/acupuntura não tem dente
 * nenhum — `undefined` ali diz a verdade ("a pergunta não se aplica"), um
 * array vazio mentiria.
 */
export type RegistroDente = Marcacao & {
  /** Só quando AFIRMADO pelo profissional. A derivação por idade nunca é gravada. */
  denticao?: EstadoDenticao;
  achados?: AchadoDente[];
  trabalhos?: TrabalhoDente[];
};

// ============================================================
// As 52 posições
// ============================================================

export type Denticao = "permanente" | "decidua";
export type Arcada = "superior" | "inferior";

export type PosicaoDente = {
  /** Número FDI, como string — é a chave de `Marcacao.regiao`. */
  fdi: string;
  quadrante: number;
  /** 1 a 8 no permanente, 1 a 5 no decíduo. */
  posicao: number;
  denticao: Denticao;
  arcada: Arcada;
  /** `anterior` (1–3) ou `posterior` — o vocabulário de `servicos.regiao_dentaria` (03.6.a). */
  grupo: "anterior" | "posterior";
  /** Chave do desenho em `dentes/`, sem a extensão. */
  desenho: string;
  /** Quadrantes 2 e 3 são a mesma arte espelhada — mesial troca de lado na tela. */
  espelhado: boolean;
  faces: FaceDente[];
  nome: string;
};

const NOMES_PERMANENTE = [
  "Incisivo central",
  "Incisivo lateral",
  "Canino",
  "1º pré-molar",
  "2º pré-molar",
  "1º molar",
  "2º molar",
  "3º molar",
];
const NOMES_DECIDUA = [
  "Incisivo central decíduo",
  "Incisivo lateral decíduo",
  "Canino decíduo",
  "1º molar decíduo",
  "2º molar decíduo",
];

const LADO: Record<number, string> = {
  1: "superior direito",
  2: "superior esquerdo",
  3: "inferior esquerdo",
  4: "inferior direito",
  5: "superior direito",
  6: "superior esquerdo",
  7: "inferior esquerdo",
  8: "inferior direito",
};

function montarPosicao(quadrante: number, posicao: number): PosicaoDente {
  const decidua = quadrante >= 5;
  const denticao: Denticao = decidua ? "decidua" : "permanente";
  const arcada: Arcada = [1, 2, 5, 6].includes(quadrante) ? "superior" : "inferior";
  const grupo = posicao <= 3 ? "anterior" : "posterior";
  const centro = (grupo === "anterior" ? contrato.faces.centroAnterior : contrato.faces.centroPosterior) as FaceDente;
  return {
    fdi: `${quadrante}${posicao}`,
    quadrante,
    posicao,
    denticao,
    arcada,
    grupo,
    desenho: `${denticao}-${arcada}-${posicao}`,
    // Quadrantes 2 e 3 ficam à direita da linha média na tela; a arte nasce
    // com mesial à direita, então lá ela precisa do espelho.
    espelhado: [2, 3, 6, 7].includes(quadrante),
    faces: [...(contrato.faces.comuns as FaceDente[]), centro],
    nome: `${(decidua ? NOMES_DECIDUA : NOMES_PERMANENTE)[posicao - 1]} ${LADO[quadrante]}`,
  };
}

/**
 * Layout do odontograma, linha a linha, na ordem em que aparece na tela.
 *
 * Quatro linhas: permanente superior, decídua superior, decídua inferior,
 * permanente inferior. Dentro de cada linha os quadrantes da DIREITA do
 * paciente (1, 4, 5, 8) vêm primeiro e em ordem decrescente, que é a
 * convenção do odontograma — o dente 11 fica encostado na linha média.
 *
 * Dentição mista não é modo: as quatro linhas existem sempre, e o que decide
 * o que se vê é o ESTADO de cada posição (A3).
 */
export const LINHAS_ODONTOGRAMA: { chave: string; rotulo: string; posicoes: PosicaoDente[] }[] = [
  {
    chave: "permanente-superior",
    rotulo: "Permanente superior",
    posicoes: [
      ...[8, 7, 6, 5, 4, 3, 2, 1].map((p) => montarPosicao(1, p)),
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((p) => montarPosicao(2, p)),
    ],
  },
  {
    chave: "decidua-superior",
    rotulo: "Decídua superior",
    posicoes: [
      ...[5, 4, 3, 2, 1].map((p) => montarPosicao(5, p)),
      ...[1, 2, 3, 4, 5].map((p) => montarPosicao(6, p)),
    ],
  },
  {
    chave: "decidua-inferior",
    rotulo: "Decídua inferior",
    posicoes: [
      ...[5, 4, 3, 2, 1].map((p) => montarPosicao(8, p)),
      ...[1, 2, 3, 4, 5].map((p) => montarPosicao(7, p)),
    ],
  },
  {
    chave: "permanente-inferior",
    rotulo: "Permanente inferior",
    posicoes: [
      ...[8, 7, 6, 5, 4, 3, 2, 1].map((p) => montarPosicao(4, p)),
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((p) => montarPosicao(3, p)),
    ],
  },
];

export const POSICOES: PosicaoDente[] = LINHAS_ODONTOGRAMA.flatMap((l) => l.posicoes);

const POR_FDI = new Map(POSICOES.map((p) => [p.fdi, p]));

export function posicaoDe(fdi: string): PosicaoDente | undefined {
  return POR_FDI.get(fdi);
}

// ============================================================
// A3 — dentição derivada da idade
// ============================================================

/** Idade em anos (fracionária), ou `null` quando não há data de nascimento. */
export function idadeEmAnos(dataNascimento: string | null | undefined, referencia = new Date()): number | null {
  if (!dataNascimento) return null;
  const nasc = new Date(dataNascimento);
  if (Number.isNaN(nasc.getTime())) return null;
  const anos = (referencia.getTime() - nasc.getTime()) / (365.2425 * 24 * 3600 * 1000);
  return anos >= 0 ? anos : null;
}

/**
 * O estado de dentição que a cronologia sugere para aquela posição.
 *
 * DERIVAR NÃO É DECIDIR. Isto é ponto de partida de tela: pinta a boca de uma
 * criança de 4 anos com os decíduos presentes e os permanentes ainda por
 * nascer, em vez de exigir 52 cliques antes da primeira consulta. O que o
 * profissional afirmar vence, e é só o afirmado que vai para o banco.
 *
 * Sem data de nascimento não há derivação: devolve `erupcionado` para o
 * permanente e `substituido` para o decíduo — a boca adulta, que é o caso
 * mais comum numa clínica —, e a tela diz que a idade não é conhecida em vez
 * de fingir que derivou.
 */
export function denticaoDerivada(fdi: string, idade: number | null): EstadoDenticao {
  const pos = posicaoDe(fdi);
  if (!pos) return "ausente";
  const i = pos.posicao - 1;
  if (pos.denticao === "permanente") {
    const [inicio] = contrato.cronologia.permanente.erupcao[i];
    if (idade === null) return "erupcionado";
    return idade < inicio ? "nao_erupcionado" : "erupcionado";
  }
  const [inicioErupcao] = contrato.cronologia.decidua.erupcao[i];
  const [, fimEsfoliacao] = contrato.cronologia.decidua.esfoliacao[i];
  if (idade === null) return "substituido";
  if (idade < inicioErupcao) return "nao_erupcionado";
  if (idade >= fimEsfoliacao) return "substituido";
  return "erupcionado";
}

/** Uma posição sem dente na boca não recebe marcação nova, e é desenhada apagada. */
export function estaNaBoca(estado: EstadoDenticao): boolean {
  return estado === "erupcionado" || estado === "supranumerario";
}

// ============================================================
// Projeção — do registro para a tela e para o banco
// ============================================================

/**
 * O estado DOMINANTE do dente, que é o que colore o desenho e o que a lista
 * lateral mostra. A ordem é de urgência clínica decrescente: o que está em
 * execução vence o que está planejado, que vence o que é só proposta; o que
 * já foi executado só aparece quando não há nada em aberto; e um dente sem
 * trabalho nenhum, mas com achado ou com dentição afirmada, é `existente`.
 */
const PRECEDENCIA: EstadoTrabalho[] = [
  "em_execucao",
  "planejado",
  "proposto",
  "executado",
  "nao_mais_necessario",
];

export function estadoDominante(trabalhos: TrabalhoDente[] | undefined): EstadoTrabalho | "existente" {
  for (const estado of PRECEDENCIA) {
    if (trabalhos?.some((t) => t.estado === estado)) return estado;
  }
  return "existente";
}

/** União ordenada das faces dos TRABALHOS — o campo que a Subetapa 03.8 lê (A2). */
export function facesDoTrabalho(trabalhos: TrabalhoDente[] | undefined): FaceDente[] {
  const ordem = FACES as readonly string[];
  return [...new Set((trabalhos ?? []).flatMap((t) => t.faces))].sort(
    (a, b) => ordem.indexOf(a) - ordem.indexOf(b),
  ) as FaceDente[];
}

/** União ordenada das faces dos ACHADOS — onde há doença, não onde haverá trabalho. */
export function facesDoAchado(achados: AchadoDente[] | undefined): FaceDente[] {
  const ordem = FACES as readonly string[];
  return [...new Set((achados ?? []).flatMap((a) => a.faces))].sort(
    (a, b) => ordem.indexOf(a) - ordem.indexOf(b),
  ) as FaceDente[];
}

/** Um dente só vira linha em `marcacoes` quando tem conteúdo de verdade. */
export function temConteudo(r: RegistroDente): boolean {
  return (
    (r.achados?.length ?? 0) > 0 ||
    (r.trabalhos?.length ?? 0) > 0 ||
    !!r.denticao ||
    (r.nota ?? "").trim().length > 0
  );
}

/**
 * Recalcula os campos derivados do registro (`estado`, `faces`, `rotulo`,
 * `nota`) a partir de achados, trabalhos e dentição.
 *
 * Existe UM lugar que faz isso, e ele é chamado sempre que o registro muda —
 * porque `estado` e `faces` são a metade do item que os OUTROS leem (a lista
 * lateral, a grade FDI leve da 02.9, e a Subetapa 03.8). Espalhar o cálculo
 * pela tela é como se tem duas verdades sobre o mesmo dente.
 */
export function normalizarRegistro(r: RegistroDente): RegistroDente {
  const pos = posicaoDe(r.regiao);
  const faces = facesDoTrabalho(r.trabalhos);
  const partes: string[] = [];
  if (r.denticao && r.denticao !== "erupcionado") partes.push(ROTULO_DENTICAO[r.denticao]);
  for (const a of r.achados ?? []) {
    partes.push(a.faces.length ? `${ROTULO_ACHADO[a.tipo]} (${a.faces.join(", ")})` : ROTULO_ACHADO[a.tipo]);
  }
  for (const t of r.trabalhos ?? []) {
    const alvo = t.faces.length ? ` ${t.faces.join(", ")}` : "";
    partes.push(`${t.descricao || "procedimento"}${alvo}`);
  }
  return {
    ...r,
    rotulo: pos ? `Dente ${r.regiao}` : r.rotulo,
    estado: estadoDominante(r.trabalhos),
    nota: partes.join(" · "),
    ...(faces.length > 0 ? { faces } : {}),
  };
}

/**
 * Lê os registros gravados, descartando o que não é dente do catálogo.
 *
 * Aceita — e descarta em silêncio — o item sentinela `estado_nativo` que a
 * 03.7 gravava: ele não é um dos 52 dentes, e `regiaoDoMapa()` já o rejeitava
 * por construção. Nenhuma evolução de produção tem odontograma com marcação
 * (medido antes de trocar o vocabulário), mas a compatibilidade custa zero
 * linha e evita que uma sessão antiga de demonstração quebre a tela.
 */
export function registrosDeMarcacoes(bruto: unknown): RegistroDente[] {
  if (!Array.isArray(bruto)) return [];
  const saida: RegistroDente[] = [];
  for (const item of bruto) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const regiao = typeof m.regiao === "string" ? m.regiao : "";
    if (!posicaoDe(regiao)) continue;
    saida.push(
      normalizarRegistro({
        regiao,
        rotulo: `Dente ${regiao}`,
        estado: "existente",
        nota: "",
        denticao: lerDenticao(m.denticao),
        achados: lerAchados(m.achados),
        trabalhos: lerTrabalhos(m.trabalhos),
      }),
    );
  }
  return saida.sort((a, b) => a.regiao.localeCompare(b.regiao));
}

function lerFaces(v: unknown): FaceDente[] {
  if (!Array.isArray(v)) return [];
  return v.filter((f): f is FaceDente => typeof f === "string" && (FACES as readonly string[]).includes(f));
}

function lerDenticao(v: unknown): EstadoDenticao | undefined {
  return typeof v === "string" && (ESTADOS_DENTICAO as readonly string[]).includes(v)
    ? (v as EstadoDenticao)
    : undefined;
}

function lerAchados(v: unknown): AchadoDente[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const lista = v.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const a = item as Record<string, unknown>;
    if (typeof a.tipo !== "string" || !(TIPOS_ACHADO as readonly string[]).includes(a.tipo)) return [];
    return [
      {
        faces: lerFaces(a.faces),
        tipo: a.tipo as TipoAchado,
        ...(typeof a.nota === "string" && a.nota ? { nota: a.nota } : {}),
      },
    ];
  });
  return lista.length ? lista : undefined;
}

function lerTrabalhos(v: unknown): TrabalhoDente[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const lista = v.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const t = item as Record<string, unknown>;
    if (typeof t.estado !== "string" || !(ESTADOS_TRABALHO as readonly string[]).includes(t.estado)) return [];
    const executado = t.estado === "executado";
    return [
      {
        id: typeof t.id === "string" && t.id ? t.id : novoId(),
        faces: lerFaces(t.faces),
        estado: t.estado as EstadoTrabalho,
        ...(typeof t.descricao === "string" && t.descricao ? { descricao: t.descricao } : {}),
        // Data e autor só atravessam junto com o estado que os justifica: um
        // `executadoEm` sobrevivente de um trabalho que voltou para
        // `planejado` afirmaria execução que não houve, e é a trava
        // financeira da 03.8.a que leria isso.
        ...(executado && typeof t.executadoEm === "string" ? { executadoEm: t.executadoEm } : {}),
        ...(executado && typeof t.executadoPor === "string" ? { executadoPor: t.executadoPor } : {}),
      },
    ];
  });
  return lista.length ? lista : undefined;
}

let contador = 0;
/** Id local de trabalho. Não é chave de banco — só distingue itens do mesmo dente. */
export function novoId(): string {
  contador += 1;
  return `t${Date.now().toString(36)}${contador.toString(36)}`;
}
