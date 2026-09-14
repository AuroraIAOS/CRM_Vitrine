/**
 * Catálogo dos quatro mapas clínicos (telas `1h` e `1p`).
 *
 * A ARTE É PLACEHOLDER, O VOCABULÁRIO NÃO É LIVRE. `docs/04_DESIGN_E_
 * MARCA.md` §5.5 registra que os quatro mapas são esquema de wireframe
 * e que a arte definitiva (facial, corporal frente/costas, odontograma
 * de 32 dentes, meridianos) entra como SVG de biblioteca própria — asset
 * novo, fora do escopo da Subetapa 02.9. O que esta subetapa entrega é a
 * mecânica: região selecionável, estado por região, persistência da
 * marcação na evolução da sessão.
 *
 * O wireframe `1p` é explícito: "nomenclatura de pontos e meridianos vem
 * de tabela do módulo — nunca digitada livre". Enquanto a arte
 * definitiva não existe, o catálogo fechado mora aqui: região e estado
 * só podem ser um destes valores, e é isso que `MapaClinico` oferece
 * para clicar. Quando o asset de produção entrar, este arquivo é
 * candidato natural a virar tabela de `aba_health` — registrado como
 * pendência vigiada em `docs/00_PLANO_E_CRITERIOS.md`.
 *
 * Cores: as quatro famílias do wireframe (`docs/04` §5.2) — azul,
 * sage, tan e terracota. Ficam como literal hexadecimal aqui, e não
 * como token do Tailwind, porque são atributos de `<svg>` (`fill`,
 * `stroke`) preenchidos por dado, não classe de CSS.
 */

export const TIPOS_MAPA = ["facial", "corporal", "odontograma", "acupuntura"] as const;
export type TipoMapa = (typeof TIPOS_MAPA)[number];

export type EstadoMarcacao = {
  chave: string;
  rotulo: string;
  /** Borda do marcador. */
  traco: string;
  /** Preenchimento do marcador. */
  fundo: string;
};

export type RegiaoMapa = {
  chave: string;
  rotulo: string;
  /** Coordenadas no `viewBox` do mapa — centro da área clicável. */
  cx: number;
  cy: number;
  r: number;
  /** Só o mapa corporal e o de acupuntura têm dois lados. */
  lado?: "frente" | "costas";
};

export type MapaClinicoDef = {
  chave: TipoMapa;
  rotulo: string;
  /** Linha mono do cabeçalho, como no wireframe `1p`. */
  subtitulo: string;
  viewBox: string;
  estados: EstadoMarcacao[];
  regioes: RegiaoMapa[];
};

const AZUL: Pick<EstadoMarcacao, "traco" | "fundo"> = { traco: "#5b87a8", fundo: "#dfeaf1" };
const SAGE: Pick<EstadoMarcacao, "traco" | "fundo"> = { traco: "#8fb4a6", fundo: "#e9f0ec" };
const TAN: Pick<EstadoMarcacao, "traco" | "fundo"> = { traco: "#c8b79a", fundo: "#faf6ef" };
const TERRACOTA: Pick<EstadoMarcacao, "traco" | "fundo"> = { traco: "#a8827a", fundo: "#f8f0ee" };
/**
 * Dois tons a mais, e nenhuma família a mais. `docs/04_DESIGN_E_MARCA.md`
 * §5.2 fixa QUATRO famílias, e a Subetapa 03.7.a precisou de seis estados no
 * odontograma (achado A4). `TAN_FORTE` é o mesmo tan escurecido, para separar
 * "em execução" de "proposto" sem inventar cor; `NEUTRO` é cinza de propósito
 * — `nao_mais_necessario` tem de LER como aposentado, e dar-lhe uma cor da
 * paleta faria um estado morto disputar atenção com os vivos.
 */
const TAN_FORTE: Pick<EstadoMarcacao, "traco" | "fundo"> = { traco: "#9a8355", fundo: "#f2e9d8" };
const NEUTRO: Pick<EstadoMarcacao, "traco" | "fundo"> = { traco: "#9aa4ae", fundo: "#eef1f4" };

// ============================================================
// Mapa facial — estética
// ============================================================
const FACIAL: MapaClinicoDef = {
  chave: "facial",
  rotulo: "Mapa facial",
  subtitulo: "zonas · aplicações",
  viewBox: "0 0 180 220",
  estados: [
    { chave: "achado_ativo", rotulo: "achado ativo", ...AZUL },
    { chave: "em_melhora", rotulo: "em melhora", ...SAGE },
    { chave: "em_tratamento", rotulo: "em tratamento", ...TAN },
  ],
  regioes: [
    { chave: "testa", rotulo: "Testa", cx: 90, cy: 46, r: 13 },
    { chave: "zona_t", rotulo: "Zona T", cx: 90, cy: 92, r: 12 },
    { chave: "periorbital_dir", rotulo: "Periorbital direito", cx: 66, cy: 86, r: 9 },
    { chave: "periorbital_esq", rotulo: "Periorbital esquerdo", cx: 114, cy: 86, r: 9 },
    { chave: "malar_dir", rotulo: "Malar direito", cx: 62, cy: 118, r: 11 },
    { chave: "malar_esq", rotulo: "Malar esquerdo", cx: 118, cy: 118, r: 11 },
    { chave: "perioral", rotulo: "Perioral", cx: 90, cy: 140, r: 10 },
    { chave: "mento", rotulo: "Mento", cx: 90, cy: 162, r: 10 },
  ],
};

// ============================================================
// Mapa corporal — massagem e terapia (frente e costas)
// ============================================================
const CORPORAL: MapaClinicoDef = {
  chave: "corporal",
  rotulo: "Mapa corporal",
  subtitulo: "frente e costas · regiões",
  viewBox: "0 0 220 220",
  estados: [
    { chave: "dor", rotulo: "dor", ...TERRACOTA },
    { chave: "tensao", rotulo: "tensão", ...TAN },
    { chave: "area_tratada", rotulo: "área tratada na sessão", ...AZUL },
  ],
  regioes: [
    // Silhueta da frente ocupa x≈0–100; a das costas, x≈120–220.
    { chave: "cervical_frente", rotulo: "Cervical (frente)", cx: 50, cy: 40, r: 8, lado: "frente" },
    { chave: "ombro_dir", rotulo: "Ombro direito", cx: 25, cy: 52, r: 9, lado: "frente" },
    { chave: "ombro_esq", rotulo: "Ombro esquerdo", cx: 75, cy: 52, r: 9, lado: "frente" },
    { chave: "toracica_frente", rotulo: "Torácica anterior", cx: 50, cy: 62, r: 10, lado: "frente" },
    { chave: "abdome", rotulo: "Abdome", cx: 50, cy: 90, r: 11, lado: "frente" },
    { chave: "coxa_dir", rotulo: "Coxa direita", cx: 40, cy: 140, r: 10, lado: "frente" },
    { chave: "coxa_esq", rotulo: "Coxa esquerda", cx: 60, cy: 140, r: 10, lado: "frente" },
    { chave: "joelho_dir", rotulo: "Joelho direito", cx: 40, cy: 176, r: 8, lado: "frente" },
    { chave: "joelho_esq", rotulo: "Joelho esquerdo", cx: 60, cy: 176, r: 8, lado: "frente" },
    { chave: "cervical_costas", rotulo: "Cervical (costas)", cx: 170, cy: 44, r: 9, lado: "costas" },
    { chave: "trapezio_dir", rotulo: "Trapézio direito", cx: 148, cy: 54, r: 9, lado: "costas" },
    { chave: "trapezio_esq", rotulo: "Trapézio esquerdo", cx: 192, cy: 54, r: 9, lado: "costas" },
    { chave: "dorsal", rotulo: "Dorsal", cx: 170, cy: 72, r: 10, lado: "costas" },
    { chave: "lombar", rotulo: "Lombar", cx: 170, cy: 96, r: 10, lado: "costas" },
    { chave: "gluteo_dir", rotulo: "Glúteo direito", cx: 160, cy: 118, r: 9, lado: "costas" },
    { chave: "gluteo_esq", rotulo: "Glúteo esquerdo", cx: 180, cy: 118, r: 9, lado: "costas" },
    { chave: "posterior_coxa", rotulo: "Posterior de coxa", cx: 170, cy: 150, r: 9, lado: "costas" },
    { chave: "panturrilha", rotulo: "Panturrilhas", cx: 170, cy: 186, r: 9, lado: "costas" },
  ],
};

// ============================================================
// Odontograma — notação FDI, 32 dentes
// ============================================================

/** Quadrantes FDI na ordem em que o wireframe `1p` os desenha. */
export const QUADRANTES_FDI: number[][] = [
  [18, 17, 16, 15, 14, 13, 12, 11],
  [21, 22, 23, 24, 25, 26, 27, 28],
  [48, 47, 46, 45, 44, 43, 42, 41],
  [31, 32, 33, 34, 35, 36, 37, 38],
];

/**
 * As 20 posições decíduas (Subetapa 03.7.a, achado A3).
 *
 * Ficam SEPARADAS das permanentes, e não juntas numa lista de 52, porque a
 * grade leve desta tela é o `fallback` do odontograma completo e a boca adulta
 * é o caso comum: desenhar quatro linhas vazias em toda ficha de adulto
 * custaria altura em troca de nada. `MapaClinico` só as desenha quando há
 * marcação decídua de fato.
 */
export const QUADRANTES_FDI_DECIDUA: number[][] = [
  [55, 54, 53, 52, 51],
  [61, 62, 63, 64, 65],
  [85, 84, 83, 82, 81],
  [71, 72, 73, 74, 75],
];

/**
 * OS SEIS ESTADOS DO ODONTOGRAMA (Subetapa 03.7.a) — e por que eram três.
 *
 * A 02.9 usava `restauracao`/`carie`/`em_tratamento`/`concluido`, que
 * misturava o ACHADO (o que o dente tem) e o MOMENTO (em que ponto do
 * tratamento aquilo está). A 03.7 separou os dois e ficou com três estados de
 * tempo — `existente`, `a_realizar`, `executado` —, com `executado`
 * **derivado** da comparação entre a sessão assinada anterior e esta.
 *
 * A pesquisa `analise-ice` derrubou as duas coisas (achado A4):
 *
 *   1. TRÊS ESTADOS SÃO POUCOS. Falta separar rascunho de compromisso
 *      (`proposto` × `planejado` — só o primeiro se apaga), falta "começou e
 *      não terminou" (`em_execucao`, que é o tratamento em várias sessões) e
 *      falta "não é mais preciso" (`nao_mais_necessario`, que hoje só existia
 *      como desmarcar, o que APAGA o histórico que protege a clínica).
 *
 *   2. `executado` NÃO PODE SER DERIVADO. A instrução M1 de Max solta a
 *      cobrança na aprovação do contrato e faz a finalização depender de "o
 *      profissional executou em todas as faces planejadas". Trava financeira
 *      não se apoia em inferência entre duas evoluções: `executado` passa a
 *      ser fato AFIRMADO, com data e autor gravados no trabalho
 *      (`odontograma.ts`, restrição 2 da Qualidade da 03.7.a).
 *
 * `existente` sobrevive com o sentido que sempre teve: o dente tem achado, ou
 * dentição afirmada, e nenhum trabalho em aberto.
 *
 * TROCA SEGURA, REMEDIDA NA 03.7.a: `select` sobre `aba_health.evolucoes`
 * agrupado por `mapa_tipo` continua devolvendo ZERO marcação de odontograma
 * em produção. Nenhum dado existente usa o vocabulário anterior, então trocá-lo
 * não é migração de dado. Se houvesse linha gravada, a regra de
 * `handoffs/instrucoes.md` ("estado novo num CHECK exige revisar quem filtrava
 * pelo estado antigo") pediria conversão, não substituição.
 */
const ODONTOGRAMA: MapaClinicoDef = {
  chave: "odontograma",
  rotulo: "Odontograma",
  subtitulo: "52 posições · notação FDI",
  // A grade leve deste arquivo não é desenhada em `<svg>` — é grade de dentes
  // em HTML, como no wireframe, e serve de `fallback` enquanto o odontograma
  // autoral carrega. viewBox fica só para uniformizar o tipo; `MapaClinico`
  // desvia deste caso.
  viewBox: "0 0 0 0",
  estados: [
    { chave: "existente", rotulo: "existente", ...AZUL },
    { chave: "proposto", rotulo: "proposto", ...TAN },
    { chave: "planejado", rotulo: "planejado", ...TERRACOTA },
    { chave: "em_execucao", rotulo: "em execução", ...TAN_FORTE },
    { chave: "executado", rotulo: "executado", ...SAGE },
    { chave: "nao_mais_necessario", rotulo: "não é mais necessário", ...NEUTRO },
  ],
  regioes: [...QUADRANTES_FDI.flat(), ...QUADRANTES_FDI_DECIDUA.flat()].map((fdi) => ({
    chave: String(fdi),
    rotulo: `Dente ${fdi}`,
    cx: 0,
    cy: 0,
    r: 0,
  })),
};

// ============================================================
// Acupuntura — meridianos e pontos
// ============================================================
const ACUPUNTURA: MapaClinicoDef = {
  chave: "acupuntura",
  rotulo: "Acupuntura",
  subtitulo: "meridianos · pontos agulhados",
  viewBox: "0 0 100 220",
  estados: [
    { chave: "agulhado", rotulo: "ponto agulhado", ...AZUL },
    { chave: "em_acompanhamento", rotulo: "em acompanhamento", ...SAGE },
    { chave: "concluido", rotulo: "concluído", ...TAN },
  ],
  // Nomenclatura de ponto/indicação copiada do wireframe `1p`, que a
  // trata como catálogo fechado. Posição é esquemática — a arte
  // definitiva de meridianos ainda não existe.
  regioes: [
    { chave: "VG20", rotulo: "VG20 · cefaleia e concentração", cx: 50, cy: 12, r: 5 },
    { chave: "VC17", rotulo: "VC17 · ansiedade", cx: 50, cy: 62, r: 5 },
    { chave: "IG4", rotulo: "IG4 · dor de cabeça", cx: 19, cy: 98, r: 5 },
    { chave: "PC6", rotulo: "PC6 · náusea e sono", cx: 81, cy: 98, r: 5 },
    { chave: "E36", rotulo: "E36 · energia e digestão", cx: 40, cy: 150, r: 5 },
    { chave: "BP6", rotulo: "BP6 · ciclo menstrual", cx: 40, cy: 178, r: 5 },
    { chave: "F3", rotulo: "F3 · irritabilidade", cx: 60, cy: 192, r: 5 },
  ],
};

export const MAPAS: Record<TipoMapa, MapaClinicoDef> = {
  facial: FACIAL,
  corporal: CORPORAL,
  odontograma: ODONTOGRAMA,
  acupuntura: ACUPUNTURA,
};

export const LISTA_MAPAS: MapaClinicoDef[] = TIPOS_MAPA.map((t) => MAPAS[t]);

/** Uma marcação gravada em `aba_health.evolucoes.marcacoes`. */
export type Marcacao = {
  regiao: string;
  rotulo: string;
  estado: string;
  nota: string;
  /**
   * AS FACES DO TRABALHO — só o odontograma preenche.
   *
   * Vocabulário em português, o de `db/migrations/043_catalogo_regra_do_
   * codigo.sql`: `mesial`, `distal`, `vestibular`, `lingual`, `oclusal`,
   * `incisal`. **A 03.7 gravava aqui as faces do ACHADO, no vocabulário
   * inglês da biblioteca, e isso era o defeito A2:** a face que se orça é
   * onde o profissional vai TRABALHAR, não onde há doença — pode coincidir,
   * pode ser maior (restauração MOD sobre cárie só na oclusal) ou pode não
   * existir como achado (selante em face hígida). A face do achado agora vive
   * em `achados[].faces` (ver `odontograma.ts`).
   *
   * OPCIONAL DE PROPÓSITO, e não por comodidade: face é conceito de
   * dente. Mapa facial, corporal e de acupuntura marcam região, que não
   * tem face nenhuma — dar-lhes um `faces: []` obrigatório seria afirmar
   * "este mapa tem faces e nenhuma foi marcada", que é falso. `undefined`
   * ali diz a verdade: a pergunta não se aplica.
   *
   * É POR ESTE CAMPO que a Subetapa 03.8 lê dente e face para montar a
   * linha do orçamento (`plano · procedimento · dente · faces · valor`),
   * e é ele que a `quantidade_maxima` por unidade da 03.6 valida.
   */
  faces?: string[];
  /**
   * O registro clínico do dente, só no odontograma. Os três campos são
   * opcionais pelo mesmo motivo que `faces` é, e o tipo forte deles mora em
   * `odontograma.ts` — aqui eles atravessam como `unknown` de propósito:
   * `mapas.ts` é o catálogo dos QUATRO mapas e não deve conhecer o modelo
   * clínico de um deles. Quem valida a forma é `registrosDeMarcacoes()`.
   */
  denticao?: unknown;
  achados?: unknown;
  trabalhos?: unknown;
};

export function ehTipoMapa(valor: string | null | undefined): valor is TipoMapa {
  return !!valor && (TIPOS_MAPA as readonly string[]).includes(valor);
}

export function estadoDoMapa(tipo: TipoMapa, chave: string): EstadoMarcacao | undefined {
  return MAPAS[tipo].estados.find((e) => e.chave === chave);
}

export function regiaoDoMapa(tipo: TipoMapa, chave: string): RegiaoMapa | undefined {
  return MAPAS[tipo].regioes.find((r) => r.chave === chave);
}

/**
 * Descarta marcação cuja região ou estado não esteja no catálogo do mapa
 * — a coluna é `jsonb` e o banco só garante que é array (migration 024).
 * Conteúdo fora do vocabulário não vira marcador desenhado por engano.
 */
export function marcacoesValidas(tipo: TipoMapa, bruto: unknown): Marcacao[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const m = item as Record<string, unknown>;
    const regiao = typeof m.regiao === "string" ? m.regiao : "";
    const estado = typeof m.estado === "string" ? m.estado : "";
    if (!regiaoDoMapa(tipo, regiao) || !estadoDoMapa(tipo, estado)) return [];
    // `faces` atravessa a validação em vez de ser recriado: quem grava é o
    // odontograma, que já limitou os valores ao vocabulário das cinco faces.
    // Aqui só se garante que é array de string — o mesmo cuidado que o resto
    // da função tem com `nota`.
    const faces = Array.isArray(m.faces) ? m.faces.filter((f): f is string => typeof f === "string") : undefined;
    return [
      {
        regiao,
        estado,
        rotulo: regiaoDoMapa(tipo, regiao)!.rotulo,
        nota: typeof m.nota === "string" ? m.nota : "",
        ...(faces && faces.length > 0 ? { faces } : {}),
        // O registro clínico do dente atravessa CRU e é validado em
        // `registrosDeMarcacoes()` (`odontograma.ts`), que é quem conhece o
        // vocabulário de achado, trabalho e dentição. Filtrá-lo aqui, com o
        // catálogo dos quatro mapas na mão, seria validar com a régua errada
        // — e o modo de falha é o pior possível: campo clínico descartado em
        // silêncio no caminho do banco para a tela.
        ...(m.denticao !== undefined ? { denticao: m.denticao } : {}),
        ...(m.achados !== undefined ? { achados: m.achados } : {}),
        ...(m.trabalhos !== undefined ? { trabalhos: m.trabalhos } : {}),
      },
    ];
  });
}
