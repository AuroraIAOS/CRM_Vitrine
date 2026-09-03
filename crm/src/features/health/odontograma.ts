/**
 * Adaptador entre `react-advanced-odontogram` 2.4.0 e a coluna
 * `aba_health.evolucoes.marcacoes` (Subetapa 03.7).
 *
 * ============================================================
 * POR QUE ADAPTADOR E NÃO SCHEMA NOVO
 * ============================================================
 * A restrição 3 da Qualidade desta subetapa é explícita: o estado
 * clínico grava em `aba_health.evolucoes.marcacoes`, o modelo que a
 * migration `025` já criou, NUNCA em tabela clínica nova. A `025`
 * escolheu coluna em `evolucoes` para herdar de graça as quatro
 * superfícies que uma tabela própria obrigaria a reconstruir: RLS por
 * `pode_acessar()`, log de escrita por trigger, revogação de `SELECT`
 * por coluna (as duas colunas só saem por `ler_evolucoes()`) e a trava
 * de evolução assinada. Este arquivo é a ponte entre o modelo de dados
 * da biblioteca e essa coluna — e nada mais.
 *
 * ============================================================
 * O QUE VAI DENTRO DO ARRAY, E POR QUE ELE É HETEROGÊNEO
 * ============================================================
 * O CHECK `evolucoes_marcacoes_array` (migration 025) exige
 * `jsonb_typeof(marcacoes) = 'array'`. O payload da biblioteca é um
 * OBJETO (`{version, globals, teeth, plan, case}`). Os dois convivem
 * assim:
 *
 *   [ {regiao:"16", rotulo:"Dente 16", estado:"a_realizar", faces:[…]},
 *     …uma por dente com achado…,
 *     {regiao:"estado_nativo", …, payload:{version, globals, teeth, plan}} ]
 *
 * · Os itens de dente são a PROJEÇÃO LEGÍVEL. É o que a lista lateral do
 *   prontuário mostra, o que a grade FDI leve desenha enquanto o chunk
 *   pesado carrega, e — o que mais importa — é de onde a Subetapa 03.8
 *   lê `dente` e `faces` para montar a linha do orçamento.
 * · O item sentinela guarda o payload VERBATIM, e é ele que faz a
 *   marcação reaparecer na sessão seguinte com fidelidade total (cárie
 *   por face, material, diagnóstico pulpar, prótese, ortodontia, perio).
 *
 * A ESCOLHA DO SENTINELA NÃO É GAMBIARRA, é a propriedade que a torna
 * segura: `marcacoesValidas()` (mapas.ts, Subetapa 02.9) descarta todo
 * item cuja `regiao` não esteja no catálogo do mapa, e "estado_nativo"
 * não é um dos 32 dentes. Ou seja, TODO leitor anterior a esta subetapa
 * ignora o envelope por construção, sem precisar saber que ele existe e
 * sem nenhuma linha de código de compatibilidade. Nenhum leitor antigo
 * quebra, e nenhum desenha um 33º dente.
 *
 * ============================================================
 * PODA — POR QUE, E POR QUE SÓ NO NÍVEL DO DENTE
 * ============================================================
 * `getStatusChart()` serializa SEMPRE os 32 dentes, cada um com ~45
 * campos, mesmo quando a boca inteira está hígida — cerca de 22 KB de
 * JSON por carta, o dobro quando existe plano. Gravar isso em toda
 * evolução encheria a tabela clínica de valor-padrão.
 *
 * A poda remove os dentes IDÊNTICOS ao dente pristino. É segura, e a
 * segurança foi lida no código da biblioteca antes de ser usada, não
 * suposta: `ja(e, t)` (o desserializador por dente) começa com
 * `const i = ge(); if (!e || typeof e != "object") return i;` — dente
 * ausente no payload volta exatamente ao padrão. A poda NÃO desce ao
 * nível de campo, embora daria mais bytes: ali a mesma garantia não foi
 * verificada, e economizar KB em cima de suposição num schema clínico é
 * a troca errada.
 *
 * O PRISTINO NÃO É CRAVADO NESTE ARQUIVO. Ele é capturado ao vivo, da
 * própria biblioteca instalada, logo depois de um `importStatus({})` —
 * ver `OdontogramaClinico.tsx`. Cravar a forma padrão aqui congelaria a
 * versão 2.4.0 num arquivo nosso: a 2.5.0 que acrescentasse um campo
 * faria a poda comparar contra um padrão obsoleto e passar a gravar
 * dente hígido como se tivesse achado. Comparar contra o que a
 * biblioteca instalada diz ser o padrão é imune a isso.
 */

import type { Marcacao } from "./mapas";

/** `regiao` do item sentinela. Nunca é um dente — ver o cabeçalho. */
export const REGIAO_ESTADO_NATIVO = "estado_nativo";

export type DenteSerializado = Record<string, unknown>;

/** Forma do payload de `getStatusChart()` / `importStatus()`, v2.20. */
export type PayloadOdontograma = {
  version?: unknown;
  globals?: Record<string, unknown>;
  teeth?: Record<string, DenteSerializado>;
  /** Presente só quando a carta de plano diverge da de status. */
  plan?: Record<string, DenteSerializado>;
  case?: unknown;
};

export type EstadoDente = "existente" | "a_realizar" | "executado";

/**
 * Faces alcançadas por achado naquele dente — cárie e restauração, que
 * são os dois eixos que a biblioteca registra POR FACE. É este conjunto
 * que a 03.8 cobra por face.
 */
export function facesDoDente(dente: DenteSerializado | undefined): string[] {
  if (!dente) return [];
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((f): f is string => typeof f === "string") : []);
  return [...new Set([...lista(dente.caries), ...lista(dente.fillingSurfaces)])].sort();
}

/** Dois dentes serializados pelo mesmo serializador — comparação estrutural basta. */
function iguais(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Remove do payload todo dente idêntico ao pristino, nas duas cartas.
 * `globals`, `version` e `case` ficam intactos: `version` guia as
 * migrações do `importStatus`, e `globals.edentulous` é achado clínico
 * (boca desdentada), não preferência de exibição.
 */
export function podarPayload(payload: PayloadOdontograma, pristino: PayloadOdontograma): PayloadOdontograma {
  const podarCarta = (carta: Record<string, DenteSerializado> | undefined) => {
    if (!carta) return undefined;
    const saida: Record<string, DenteSerializado> = {};
    for (const [fdi, dente] of Object.entries(carta)) {
      if (!iguais(dente, pristino.teeth?.[fdi])) saida[fdi] = dente;
    }
    return saida;
  };
  const teeth = podarCarta(payload.teeth) ?? {};
  const plan = podarCarta(payload.plan);
  return {
    version: payload.version,
    globals: payload.globals,
    teeth,
    ...(plan && Object.keys(plan).length > 0 ? { plan } : {}),
    ...(payload.case !== undefined ? { case: payload.case } : {}),
  };
}

/** Dentes que têm algum achado na carta de status. */
export function dentesComAchado(payload: PayloadOdontograma, pristino: PayloadOdontograma): string[] {
  return Object.entries(payload.teeth ?? {})
    .filter(([fdi, dente]) => !iguais(dente, pristino.teeth?.[fdi]))
    .map(([fdi]) => fdi);
}

/**
 * Monta o item sentinela que carrega o payload podado.
 *
 * O tipo de retorno é `Marcacao & { payload }` de propósito: ele viaja
 * dentro do MESMO array das marcações de dente, que a API de
 * `evolucoes` tipa como `Marcacao[]`. Ter os quatro campos obrigatórios
 * não é decoração — é o que faz o item atravessar a fronteira de tipo
 * sem `as` nenhum, e é o que garante que um leitor desavisado que
 * ignorar o `payload` ainda leia um objeto coerente em vez de quebrar.
 */
export function itemEstadoNativo(payload: PayloadOdontograma): Marcacao & { payload: PayloadOdontograma } {
  return {
    regiao: REGIAO_ESTADO_NATIVO,
    rotulo: "Estado nativo do odontograma",
    estado: REGIAO_ESTADO_NATIVO,
    nota: "",
    payload,
  };
}

/** Recupera o payload gravado. `null` quando a evolução não tem envelope. */
export function payloadDeMarcacoes(bruto: unknown): PayloadOdontograma | null {
  if (!Array.isArray(bruto)) return null;
  for (const item of bruto) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    if (m.regiao !== REGIAO_ESTADO_NATIVO) continue;
    const p = m.payload;
    if (p && typeof p === "object" && !Array.isArray(p)) return p as PayloadOdontograma;
  }
  return null;
}

/**
 * Dentes que uma evolução anterior deixou marcados como `a_realizar` —
 * a metade esquerda da derivação de `executado`.
 */
export function regioesARealizar(marcacoes: Marcacao[]): Set<string> {
  return new Set(marcacoes.filter((m) => m.estado === "a_realizar").map((m) => m.regiao));
}

/**
 * Projeta o estado da biblioteca nas marcações legíveis do mapa.
 *
 * A regra dos três estados, na ordem em que decide (a ordem importa:
 * um dente planejado AGORA é `a_realizar` mesmo que já tivesse sido
 * planejado antes — o planejado que ainda diverge não virou executado):
 *
 *   1. o dente aparece no diff status→plano  → `a_realizar`
 *   2. a sessão anterior o marcou `a_realizar` e ele já não diverge
 *      → `executado`
 *   3. tem achado no status                  → `existente`
 *
 * Dente sem achado nenhum e sem plano não vira marcação — mapa clínico
 * lista o que foi encontrado, não os 32 dentes.
 */
export function projetarMarcacoes(entrada: {
  payload: PayloadOdontograma;
  pristino: PayloadOdontograma;
  /** Dentes com divergência status→plano, de `getPlanChanges()`. */
  planejados: Set<string>;
  /** Dentes que a última sessão assinada marcou como `a_realizar`. */
  aRealizarAntes: Set<string>;
  /** Resumo localizado do dente, de `getToothStateSummary()`. */
  resumo: (fdi: string) => string[];
}): Marcacao[] {
  const { payload, pristino, planejados, aRealizarAntes, resumo } = entrada;
  const comAchado = new Set(dentesComAchado(payload, pristino));
  const regioes = [...new Set([...comAchado, ...planejados])];

  return regioes
    .map((fdi) => {
      let estado: EstadoDente;
      if (planejados.has(fdi)) estado = "a_realizar";
      else if (aRealizarAntes.has(fdi) && comAchado.has(fdi)) estado = "executado";
      else estado = "existente";

      const faces = facesDoDente(payload.teeth?.[fdi]);
      return {
        regiao: fdi,
        rotulo: `Dente ${fdi}`,
        estado,
        // O texto vem da própria biblioteca, já em pt-BR e com o
        // vocabulário odontológico dela — escrever um resumo nosso
        // duplicaria (e desatualizaria) 907 chaves de tradução.
        nota: resumo(fdi).join(" · "),
        ...(faces.length > 0 ? { faces } : {}),
      } satisfies Marcacao;
    })
    .sort((a, b) => a.regiao.localeCompare(b.regiao));
}
