import type { FatiaServico, PontoSemana } from "./api";

/**
 * SVG inline, sem biblioteca de chart — `docs/04_DESIGN_E_MARCA.md` §5.5
 * prescreve "donut/pizza via SVG inline (`stroke-dasharray`)" e "gráfico de
 * barras/linha via SVG inline (sem lib de gráfico)". Mesmo caminho já usado
 * no gráfico de 6 meses do Financeiro (Subetapa 02.8).
 *
 * As cores vêm de `--chart-*` (src/index.css), nunca de hex literal: desde
 * que o modo escuro existe, série clara sobre card escuro fica ilegível.
 */

const RAIO = 46;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;
const COR_FATIA = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-4))", "hsl(var(--chart-grid))"];

export function BarrasSemanais({ serie, semanas }: { serie: PontoSemana[]; semanas: number }) {
  const largura = 640;
  const altura = 200;
  const maximo = Math.max(1, ...serie.map((p) => p.total));
  const vaoTotal = largura / Math.max(1, serie.length);
  const larguraBarra = Math.min(26, vaoTotal * 0.55);

  const temDado = serie.some((p) => p.total > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full flex-1" preserveAspectRatio="none">
        <g stroke="hsl(var(--chart-grid))" strokeWidth={1}>
          {[40, 90, 140, 190].map((y) => (
            <line key={y} x1={0} y1={y} x2={largura} y2={y} />
          ))}
        </g>
        {serie.map((p, i) => {
          // Piso de 2px para a semana com zero atendimento continuar
          // ocupando lugar no eixo — barra ausente lê como "sem dado",
          // não como "nenhum atendimento", e são coisas diferentes.
          const alturaBarra = p.total === 0 ? 2 : Math.max(3, (p.total / maximo) * 146);
          return (
            <rect
              key={i}
              x={i * vaoTotal + (vaoTotal - larguraBarra) / 2}
              y={190 - alturaBarra}
              width={larguraBarra}
              height={alturaBarra}
              fill={p.corrente ? "hsl(var(--chart-1))" : "hsl(var(--chart-4))"}
            />
          );
        })}
      </svg>
      <div className="flex justify-between px-1 font-mono text-[8.5px] text-muted-foreground">
        {serie.map((p, i) => (
          <span key={i} className={p.corrente ? "text-accent-foreground" : undefined}>
            {p.rotulo}
          </span>
        ))}
      </div>
      {!temDado && (
        <span className="text-[10.5px] text-muted-foreground">
          Nenhum atendimento nas últimas {semanas} semanas.
        </span>
      )}
    </div>
  );
}

export function DonutServicos({ fatias }: { fatias: FatiaServico[] }) {
  let acumulado = 0;

  return (
    <div className="flex flex-1 items-center gap-[18px]">
      <svg viewBox="0 0 120 120" className="h-[118px] w-[118px] shrink-0">
        <circle cx={60} cy={60} r={RAIO} fill="none" stroke="hsl(var(--chart-grid))" strokeWidth={16} />
        {fatias.map((f, i) => {
          const comprimento = (f.percentual / 100) * CIRCUNFERENCIA;
          const rotacao = -90 + (acumulado / 100) * 360;
          acumulado += f.percentual;
          return (
            <circle
              key={f.nome}
              cx={60}
              cy={60}
              r={RAIO}
              fill="none"
              stroke={COR_FATIA[i] ?? COR_FATIA[COR_FATIA.length - 1]}
              strokeWidth={16}
              strokeDasharray={`${comprimento} ${CIRCUNFERENCIA - comprimento}`}
              transform={`rotate(${rotacao} 60 60)`}
            />
          );
        })}
      </svg>
      <div className="flex flex-col gap-2">
        {fatias.length === 0 && (
          <span className="text-[11px] text-muted-foreground">Nenhum serviço realizado no período.</span>
        )}
        {fatias.map((f, i) => (
          <div key={f.nome} className="flex items-center gap-2">
            <div
              className="h-[9px] w-[9px] shrink-0 rounded-[2px]"
              style={{ background: COR_FATIA[i] ?? COR_FATIA[COR_FATIA.length - 1] }}
            />
            <span className="text-[11px] text-secondary-foreground">
              {f.nome} · {Math.round(f.percentual)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BarraProgresso({ percentual }: { percentual: number }) {
  const limitado = Math.max(0, Math.min(100, percentual));
  return (
    <div className="h-[5px] rounded-[3px] bg-hairline">
      <div
        className="h-[5px] rounded-[3px]"
        style={{
          width: `${limitado}%`,
          // Acima de 75% a barra vira azul (série 1); abaixo, sage. É o
          // mesmo código de cor que o wireframe usa para separar quem
          // está lotado de quem tem folga na agenda.
          background: limitado >= 75 ? "hsl(var(--chart-1))" : "hsl(var(--chart-2))",
        }}
      />
    </div>
  );
}
