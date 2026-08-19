import { useState } from "react";
import { Card } from "@/components/ui/card";
import { useResumoFinanceiro } from "./api";
import { LancamentosTab } from "./LancamentosTab";
import { ComissoesTab } from "./ComissoesTab";
import { ConciliacaoTab } from "./ConciliacaoTab";

const formatoMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function CardKpi({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <Card className="flex flex-col gap-1.5 p-3.5">
      <span className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">{rotulo}</span>
      <span className={`text-[24px] font-medium ${destaque ? "text-destructive" : "text-foreground"}`}>{formatoMoeda.format(valor)}</span>
    </Card>
  );
}

/** SVG inline, sem lib de gráfico (docs/04_DESIGN_E_MARCA.md §5.5) — 2 séries reais: faturado (aba_finance.faturas.data_emissao) × recebido (aba_finance.pagamentos.pago_em), últimos 6 meses. */
function GraficoFaturadoRecebido({ serie }: { serie: { mes: string; faturado: number; recebido: number }[] }) {
  const largura = 560;
  const altura = 140;
  const maximo = Math.max(1, ...serie.map((p) => Math.max(p.faturado, p.recebido)));
  const passoX = largura / Math.max(1, serie.length - 1);

  function pontos(chave: "faturado" | "recebido") {
    return serie.map((p, i) => `${i * passoX},${altura - (p[chave] / maximo) * (altura - 10) - 5}`).join(" ");
  }

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full" style={{ height: 140 }}>
        <g stroke="hsl(var(--chart-grid))">
          <line x1="0" y1={altura * 0.25} x2={largura} y2={altura * 0.25} />
          <line x1="0" y1={altura * 0.5} x2={largura} y2={altura * 0.5} />
          <line x1="0" y1={altura * 0.75} x2={largura} y2={altura * 0.75} />
          <line x1="0" y1={altura} x2={largura} y2={altura} />
        </g>
        <polyline points={pontos("faturado")} fill="none" stroke="hsl(var(--chart-3))" strokeWidth={2} strokeDasharray="4 3" />
        <polyline points={pontos("recebido")} fill="none" stroke="hsl(var(--chart-1))" strokeWidth={2} />
      </svg>
      <div className="flex justify-between px-1 font-mono text-[9px] text-muted-foreground">
        {serie.map((p, i) => (
          <span key={i}>{p.mes}</span>
        ))}
      </div>
      <div className="flex gap-4">
        <div className="flex items-center gap-1.5">
          <div className="h-0.5 w-3 bg-[hsl(var(--chart-1))]" />
          <span className="text-[10.5px] text-muted-foreground">Recebido</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-0.5 w-3 bg-[hsl(var(--chart-3))]" />
          <span className="text-[10.5px] text-muted-foreground">Faturado</span>
        </div>
      </div>
    </div>
  );
}

function FormasPagamento({ formas }: { formas: { forma: string; valor: number }[] }) {
  const total = Math.max(1, ...formas.map((f) => f.valor));
  return (
    <div className="flex flex-col gap-2.5">
      {formas.map((f) => (
        <div key={f.forma} className="flex flex-col gap-1">
          <div className="flex justify-between text-[11px] text-secondary-foreground">
            <span>{f.forma}</span>
            <span>{formatoMoeda.format(f.valor)}</span>
          </div>
          <div className="h-[5px] rounded-[3px] bg-content">
            <div className="h-[5px] rounded-[3px] bg-primary" style={{ width: `${(f.valor / total) * 100}%` }} />
          </div>
        </div>
      ))}
      {formas.length === 0 && <span className="text-[11px] text-muted-foreground">Nenhum pagamento recebido este mês.</span>}
    </div>
  );
}

export function FinanceiroPage() {
  const { data: resumo } = useResumoFinanceiro();
  const [aba, setAba] = useState<"lancamentos" | "comissoes" | "conciliacao">("lancamentos");

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <CardKpi rotulo="Recebido no mês" valor={resumo?.recebidoNoMes ?? 0} />
        <CardKpi rotulo="A receber" valor={resumo?.aReceber ?? 0} />
        <CardKpi rotulo="Vencido" valor={resumo?.vencido ?? 0} destaque={(resumo?.vencido ?? 0) > 0} />
        <CardKpi rotulo="Comissões a pagar" valor={resumo?.comissoesAPagar ?? 0} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.4fr_1fr]">
        <Card className="flex flex-col gap-2.5 p-3.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[12.5px] font-medium text-foreground">Faturado × Recebido</span>
            <span className="text-[10.5px] text-muted-foreground">6 meses</span>
          </div>
          <GraficoFaturadoRecebido serie={resumo?.serieMensal ?? []} />
        </Card>
        <Card className="flex flex-col gap-2.5 p-3.5">
          <span className="text-[12.5px] font-medium text-foreground">Formas de pagamento (mês)</span>
          <FormasPagamento formas={resumo?.formasPagamento ?? []} />
        </Card>
      </div>

      <Card className="flex gap-2 p-2">
        {(
          [
            ["lancamentos", "Lançamentos"],
            ["comissoes", "Comissões"],
            ["conciliacao", "Conciliação"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setAba(key)}
            className={`rounded-[5px] px-3 py-1.5 text-[11px] font-medium ${aba === key ? "bg-content text-primary" : "text-secondary-foreground"}`}
          >
            {label}
          </button>
        ))}
      </Card>

      {aba === "lancamentos" && <LancamentosTab />}
      {aba === "comissoes" && <ComissoesTab />}
      {aba === "conciliacao" && <ConciliacaoTab />}
    </div>
  );
}
