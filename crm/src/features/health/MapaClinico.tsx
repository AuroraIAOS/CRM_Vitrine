/**
 * Mapa clínico clicável (telas `1h` e `1p`).
 *
 * ARTE É PLACEHOLDER — MECÂNICA NÃO É. `docs/04_DESIGN_E_MARCA.md` §5.5
 * registra que a arte definitiva dos quatro mapas (facial, corporal
 * frente/costas, odontograma de 32 dentes, meridianos) é asset novo que
 * ainda não existe em lugar nenhum do repositório, e que isso não
 * bloqueia a Subetapa 02.9. As silhuetas abaixo são as mesmas do
 * wireframe: esquema, não anatomia. O que é real e definitivo aqui é a
 * mecânica — região do catálogo fechado (`mapas.ts`), estado por região,
 * marcação persistida na evolução da sessão.
 *
 * Um componente, quatro mapas, como diz o `1p`: só a silhueta e o
 * vocabulário mudam; seleção, legenda e lista de marcações são as
 * mesmas.
 */

import { MAPAS, QUADRANTES_FDI, estadoDoMapa, type Marcacao, type TipoMapa } from "./mapas";

const TRACO_NEUTRO = "#cfd9de";
const PREENCHIMENTO_NEUTRO = "#f1f5f7";

type Props = {
  tipo: TipoMapa;
  marcacoes: Marcacao[];
  /** Ausente = mapa só de leitura (evolução assinada, tela `1p`). */
  onSelecionarRegiao?: (regiaoChave: string) => void;
  regiaoSelecionada?: string | null;
  /** Reduz a altura para caber em card de biblioteca (tela `1p`). */
  compacto?: boolean;
};

/** Silhueta de corpo — a mesma forma para frente, costas e acupuntura. */
function Silhueta({ deslocamentoX = 0 }: { deslocamentoX?: number }) {
  const x = deslocamentoX;
  return (
    <g fill={PREENCHIMENTO_NEUTRO} stroke={TRACO_NEUTRO}>
      <circle cx={x + 50} cy={22} r={15} />
      <rect x={x + 30} y={42} width={40} height={62} rx={10} />
      <rect x={x + 12} y={46} width={14} height={66} rx={7} />
      <rect x={x + 74} y={46} width={14} height={66} rx={7} />
      <rect x={x + 32} y={108} width={16} height={90} rx={8} />
      <rect x={x + 52} y={108} width={16} height={90} rx={8} />
    </g>
  );
}

function RostoFacial() {
  return (
    <g>
      <ellipse cx={90} cy={100} rx={58} ry={78} fill={PREENCHIMENTO_NEUTRO} stroke={TRACO_NEUTRO} />
      <line x1={90} y1={22} x2={90} y2={178} stroke="#e4eaee" strokeDasharray="4 4" />
      <line x1={34} y1={92} x2={146} y2={92} stroke="#e4eaee" strokeDasharray="4 4" />
      <line x1={40} y1={132} x2={140} y2={132} stroke="#e4eaee" strokeDasharray="4 4" />
    </g>
  );
}

function Meridianos() {
  return (
    <g fill="none" strokeDasharray="3 3">
      <path d="M40 48c-2 22 0 40 2 58" stroke="#5b87a8" />
      <path d="M60 48c2 22 0 40-2 58" stroke="#8fb4a6" />
      <path d="M42 110c-1 30-2 55-2 78" stroke="#5b87a8" />
    </g>
  );
}

/**
 * Odontograma não é `<svg>`: é grade de dentes, exatamente como o
 * wireframe `1p` desenha (dois arcos superiores, dois inferiores,
 * notação FDI legível em cada dente).
 */
function Odontograma({ marcacoes, onSelecionarRegiao, regiaoSelecionada, compacto }: Props) {
  const porRegiao = new Map(marcacoes.map((m) => [m.regiao, m]));

  function Dente({ fdi, superior }: { fdi: number; superior: boolean }) {
    const chave = String(fdi);
    const marcacao = porRegiao.get(chave);
    const estado = marcacao ? estadoDoMapa("odontograma", marcacao.estado) : undefined;
    const selecionado = regiaoSelecionada === chave;
    return (
      <button
        type="button"
        title={marcacao ? `${chave} · ${estado?.rotulo}${marcacao.nota ? ` · ${marcacao.nota}` : ""}` : `Dente ${chave}`}
        disabled={!onSelecionarRegiao}
        onClick={() => onSelecionarRegiao?.(chave)}
        className={`flex ${superior ? "items-end" : "items-start"} justify-center rounded-[3px] border font-mono text-[8px] transition-colors ${
          onSelecionarRegiao ? "cursor-pointer hover:border-primary" : "cursor-default"
        } ${selecionado ? "ring-2 ring-primary ring-offset-1" : ""}`}
        style={{
          width: compacto ? 18 : 22,
          height: compacto ? 22 : 26,
          borderColor: estado?.traco ?? TRACO_NEUTRO,
          background: estado?.fundo ?? "#fff",
          color: estado?.traco ?? "#9aa8b1",
        }}
      >
        {chave}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center gap-3.5">
        <div className="flex gap-[3px]">
          {QUADRANTES_FDI[0].map((fdi) => (
            <Dente key={fdi} fdi={fdi} superior />
          ))}
        </div>
        <div className="flex gap-[3px]">
          {QUADRANTES_FDI[1].map((fdi) => (
            <Dente key={fdi} fdi={fdi} superior />
          ))}
        </div>
      </div>
      <div className="h-px bg-border" />
      <div className="flex justify-center gap-3.5">
        <div className="flex gap-[3px]">
          {QUADRANTES_FDI[2].map((fdi) => (
            <Dente key={fdi} fdi={fdi} superior={false} />
          ))}
        </div>
        <div className="flex gap-[3px]">
          {QUADRANTES_FDI[3].map((fdi) => (
            <Dente key={fdi} fdi={fdi} superior={false} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function MapaClinico(props: Props) {
  const { tipo, marcacoes, onSelecionarRegiao, regiaoSelecionada, compacto } = props;
  const def = MAPAS[tipo];

  if (tipo === "odontograma") return <Odontograma {...props} />;

  const porRegiao = new Map(marcacoes.map((m) => [m.regiao, m]));
  const altura = compacto ? 200 : 300;

  return (
    <svg viewBox={def.viewBox} style={{ height: altura, maxHeight: "100%" }} role="img" aria-label={def.rotulo}>
      {tipo === "facial" && <RostoFacial />}
      {tipo === "corporal" && (
        <>
          <Silhueta />
          <Silhueta deslocamentoX={120} />
          <text x={50} y={214} textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize={8} fill="#9aa8b1">
            frente
          </text>
          <text x={170} y={214} textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize={8} fill="#9aa8b1">
            costas
          </text>
        </>
      )}
      {tipo === "acupuntura" && (
        <>
          <Silhueta />
          <Meridianos />
        </>
      )}

      {def.regioes.map((regiao) => {
        const marcacao = porRegiao.get(regiao.chave);
        const estado = marcacao ? estadoDoMapa(tipo, marcacao.estado) : undefined;
        const selecionada = regiaoSelecionada === regiao.chave;
        return (
          <g
            key={regiao.chave}
            onClick={() => onSelecionarRegiao?.(regiao.chave)}
            style={{ cursor: onSelecionarRegiao ? "pointer" : "default" }}
          >
            <title>
              {marcacao
                ? `${regiao.rotulo} · ${estado?.rotulo}${marcacao.nota ? ` · ${marcacao.nota}` : ""}`
                : regiao.rotulo}
            </title>
            <circle
              cx={regiao.cx}
              cy={regiao.cy}
              r={regiao.r}
              fill={estado?.fundo ?? "transparent"}
              stroke={estado?.traco ?? (selecionada ? "#3d7396" : "#a8b6bf")}
              strokeWidth={selecionada ? 2 : 1}
              strokeDasharray={marcacao ? undefined : "2 2"}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Legenda de estados do mapa — repetida igual nas telas `1h` e `1p`. */
export function LegendaMapa({ tipo }: { tipo: TipoMapa }) {
  return (
    <div className="flex flex-wrap gap-3">
      {MAPAS[tipo].estados.map((estado) => (
        <div key={estado.chave} className="flex items-center gap-1.5">
          <div
            className="h-[9px] w-[9px] rounded-full border"
            style={{ background: estado.fundo, borderColor: estado.traco }}
          />
          <span className="text-[10px] text-muted-foreground">{estado.rotulo}</span>
        </div>
      ))}
    </div>
  );
}
