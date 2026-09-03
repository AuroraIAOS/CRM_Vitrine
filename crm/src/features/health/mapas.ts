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
 * OS TRÊS ESTADOS DO ODONTOGRAMA (Subetapa 03.7) — e por que eles
 * substituíram o vocabulário de achado da 02.9.
 *
 * A 02.9 usava `restauracao`/`carie`/`em_tratamento`/`concluido`, que
 * misturava duas coisas: o ACHADO (o que o dente tem) e o MOMENTO (em
 * que ponto do tratamento aquilo está). Com a biblioteca da 03.7 o
 * achado passa a ser responsabilidade dela — ela distingue cárie por
 * face, material de restauração, diagnóstico pulpar, prótese e ortodontia
 * com um vocabulário que nenhum catálogo nosso alcançaria. Ao mapa resta
 * o eixo que o Objetivo do item 2 nomeia, que é o do TEMPO:
 *
 *   · `existente`  — está na boca hoje (carta de status da biblioteca);
 *   · `a_realizar` — planejado e ainda não feito (a carta de plano diverge
 *                    da de status naquele dente);
 *   · `executado`  — a sessão assinada anterior marcou como `a_realizar` e
 *                    esta já traz o achado no status.
 *
 * `executado` é DERIVADO, nunca digitado — mesma regra que a 03.16 aplica
 * aos alertas de anamnese. Ninguém marca "executado" à mão: ele nasce da
 * comparação entre o que a sessão anterior planejou e o que esta sessão
 * encontra. Marcar à mão permitiria declarar feito o que não foi.
 *
 * TROCA SEGURA, MEDIDA ANTES: `select` sobre `aba_health.evolucoes`
 * agrupado por `mapa_tipo` devolveu 2 linhas de odontograma com ZERO
 * marcações em produção (a única linha com marcação real é `facial`).
 * Nenhum dado existente usa o vocabulário antigo, então trocá-lo não é
 * migração de dado — é definição de um vocabulário que nunca chegou a ser
 * usado. Se houvesse linha gravada, a regra de `handoffs/instrucoes.md`
 * ("estado novo num CHECK exige revisar quem filtrava pelo estado
 * antigo") pediria conversão, não substituição.
 */
const ODONTOGRAMA: MapaClinicoDef = {
  chave: "odontograma",
  rotulo: "Odontograma",
  subtitulo: "32 dentes · notação FDI",
  // O odontograma não é desenhado em `<svg>` — é grade de dentes em
  // HTML, exatamente como no wireframe. viewBox fica só para uniformizar
  // o tipo; `MapaClinico` desvia deste caso.
  viewBox: "0 0 0 0",
  estados: [
    { chave: "existente", rotulo: "existente", ...AZUL },
    { chave: "a_realizar", rotulo: "a realizar", ...TAN },
    { chave: "executado", rotulo: "executado", ...SAGE },
  ],
  regioes: QUADRANTES_FDI.flat().map((fdi) => ({
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
   * Faces do dente alcançadas pelo achado — só o odontograma preenche.
   * Vocabulário da biblioteca: `mesial`, `distal`, `buccal`, `lingual`,
   * `occlusal`, `incisal`, `labial`, `palatal`, `subcrown`.
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
    // `faces` atravessa a validação em vez de ser recriado: quem grava é
    // o adaptador do odontograma, que já limitou os valores ao
    // vocabulário da biblioteca. Aqui só se garante que é array de
    // string — o mesmo cuidado que o resto da função tem com `nota`.
    const faces = Array.isArray(m.faces) ? m.faces.filter((f): f is string => typeof f === "string") : undefined;
    return [
      {
        regiao,
        estado,
        rotulo: regiaoDoMapa(tipo, regiao)!.rotulo,
        nota: typeof m.nota === "string" ? m.nota : "",
        ...(faces && faces.length > 0 ? { faces } : {}),
      },
    ];
  });
}
