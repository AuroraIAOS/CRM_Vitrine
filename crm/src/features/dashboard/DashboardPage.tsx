import { Link } from "react-router-dom";
import { useResumoDashboard, type Kpi } from "./api";
import { BarrasSemanais, BarraProgresso, DonutServicos } from "./graficos";

/**
 * Tela `1b` do pacote ratificado — dashboard geral (Subetapa 02.12):
 * 4 KPI cards, barra semanal, donut de serviços e 3 painéis.
 *
 * **Nenhum número desta tela é literal.** A Conclusão da subetapa em
 * `docs/00_PLANO_E_CRITERIOS.md` é explícita: "KPI e gráfico saem de query
 * real". Cada card declara a própria janela de tempo em texto, porque um
 * número sem período é um número que cada pessoa interpreta como quer.
 *
 * Quando o número não pôde ser calculado — falta de permissão de módulo,
 * falta de alcance clínico, falta de grade de horário — a tela mostra o
 * MOTIVO, nunca zero. Ver o cabeçalho de `api.ts`.
 */

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">{children}</span>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-3 rounded-lg border border-border bg-background p-3.5 ${className ?? ""}`}>
      {children}
    </div>
  );
}

function TituloCard({ titulo, nota }: { titulo: string; nota?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[12.5px] font-medium text-foreground">{titulo}</span>
      {nota && <span className="shrink-0 text-[10.5px] text-muted-foreground">{nota}</span>}
    </div>
  );
}

function Delta({ delta, sufixo }: { delta: number | null; sufixo: string }) {
  if (delta === null) {
    return <span className="text-[10.5px] text-muted-foreground">sem base de comparação</span>;
  }
  const positivo = delta >= 0;
  return (
    <span className={`text-[10.5px] ${positivo ? "text-success-tint-foreground" : "text-destructive-tint-foreground"}`}>
      {positivo ? "+" : "−"}
      {Math.abs(delta).toFixed(delta % 1 === 0 ? 0 : 1)}
      {sufixo}
    </span>
  );
}

function CardKpi({
  rotulo,
  kpi,
  formatar,
  janela,
  sufixoDelta = "%",
}: {
  rotulo: string;
  kpi: Kpi;
  formatar: (v: number) => string;
  janela: string;
  sufixoDelta?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-background p-3.5">
      <Eyebrow>{rotulo}</Eyebrow>
      {kpi.indisponivel ? (
        <>
          <span className="text-[20px] font-medium text-muted-foreground">—</span>
          <span className="text-[10.5px] text-muted-foreground">{kpi.indisponivel}</span>
        </>
      ) : (
        <>
          <span className="text-[26px] font-medium leading-none text-foreground">{formatar(kpi.valor ?? 0)}</span>
          <Delta delta={kpi.delta} sufixo={sufixoDelta} />
        </>
      )}
      <span className="font-mono text-[9px] text-muted-foreground/70">{janela}</span>
    </div>
  );
}

export function DashboardPage() {
  const { data, isPending, error } = useResumoDashboard();

  if (error) {
    return (
      <Card>
        <TituloCard titulo="Não foi possível montar o dashboard" />
        <span className="text-[11px] text-destructive-tint-foreground">{(error as Error).message}</span>
      </Card>
    );
  }

  if (isPending || !data) {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[92px] animate-pulse rounded-lg border border-border bg-background" />
          ))}
        </div>
        <div className="h-[260px] animate-pulse rounded-lg border border-border bg-background" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 4 KPI cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <CardKpi
          rotulo="Atendimentos hoje"
          kpi={data.atendimentosHoje}
          formatar={(v) => String(v)}
          janela="vs. mesmo dia da semana passada"
        />
        <CardKpi
          rotulo="Novos leads"
          kpi={data.novosLeads}
          formatar={(v) => String(v)}
          janela="últimos 30 dias · vs. 30 anteriores"
        />
        <CardKpi
          rotulo="Taxa de ocupação"
          kpi={data.taxaOcupacao}
          formatar={(v) => `${Math.round(v)}%`}
          janela="semana corrente · vs. semana anterior"
          sufixoDelta=" p.p."
        />
        <CardKpi
          rotulo="Receita do mês"
          kpi={data.receitaMes}
          formatar={(v) => MOEDA.format(v)}
          janela="mês corrente · vs. mesmo trecho do anterior"
        />
      </div>

      {/* Barra semanal + donut */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.6fr_1fr]">
        <Card className="min-h-[260px]">
          <TituloCard titulo="Atendimentos por semana" nota={`últimas ${data.semanasNoGrafico} semanas`} />
          <BarrasSemanais serie={data.serieSemanal} semanas={data.semanasNoGrafico} />
        </Card>
        <Card className="min-h-[260px]">
          <TituloCard titulo="Serviços mais realizados" nota="últimos 90 dias" />
          <DonutServicos fatias={data.servicos} />
        </Card>
      </div>

      {/* 3 painéis */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 xl:grid-cols-[1fr_1fr_0.9fr]">
        <Card>
          <TituloCard titulo="Próximos atendimentos" nota="a partir de agora" />
          {data.proximosAtendimentos.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">Nenhum atendimento à frente na agenda.</span>
          ) : (
            <div className="flex flex-col">
              <div className="grid grid-cols-[52px_1fr_78px] gap-2 border-b border-hairline pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
                <span>Hora</span>
                <span>Pessoa · serviço</span>
                <span>Sala</span>
              </div>
              {data.proximosAtendimentos.map((a) => (
                <div
                  key={a.id}
                  className="grid grid-cols-[52px_1fr_78px] gap-2 border-b border-hairline py-2 text-[11px] text-secondary-foreground last:border-b-0"
                >
                  <span className="font-mono">{a.hora}</span>
                  <span className="truncate">
                    {a.pessoa} · {a.servico}
                  </span>
                  <span className="truncate">{a.sala}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <TituloCard titulo="Pendências da equipe" />
          <div className="flex flex-col gap-2">
            {data.pendencias.map((p) => (
              <div
                key={p.rotulo}
                className="flex items-center justify-between gap-2 rounded-md bg-content px-[11px] py-[9px]"
              >
                <span className="text-[11px] text-secondary-foreground">{p.rotulo}</span>
                {p.indisponivel ? (
                  <span className="shrink-0 text-[10px] text-muted-foreground">{p.indisponivel}</span>
                ) : (
                  <span className="shrink-0 text-[11px] font-semibold text-foreground">{p.valor}</span>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <TituloCard titulo="Ocupação por profissional" nota="semana corrente" />
          {data.ocupacaoPorProfissional.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">
              Nenhum profissional ativo.{" "}
              <Link to="/configuracoes" className="text-primary underline-offset-2 hover:underline">
                Configurações → Equipe
              </Link>
              .
            </span>
          ) : (
            <div className="flex flex-col gap-[11px]">
              {data.ocupacaoPorProfissional.map((p) => (
                <div key={p.id} className="flex flex-col gap-1.5">
                  <div className="flex justify-between gap-2 text-[11px] text-secondary-foreground">
                    <span className="truncate">{p.nome}</span>
                    {p.percentual === null ? (
                      <span className="shrink-0 text-[10px] text-muted-foreground">sem grade</span>
                    ) : (
                      <span className="shrink-0 font-mono">{Math.round(p.percentual)}%</span>
                    )}
                  </div>
                  {p.percentual !== null && <BarraProgresso percentual={p.percentual} />}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
