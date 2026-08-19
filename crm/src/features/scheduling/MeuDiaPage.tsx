import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useAgendamentosIntervalo,
  useAtualizarStatusAgendamento,
  useHorariosProfissional,
  useDefinirExpedientePadrao,
  STATUS_LABEL,
  STATUS_TONE,
  mensagemErroAgendamento,
  type Agendamento,
  type Profissional,
} from "./api";

function inicioDoDia(data: Date): Date {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}
function fimDoDia(data: Date): Date {
  const d = inicioDoDia(data);
  d.setDate(d.getDate() + 1);
  return d;
}

function ItemAgendamento({ agendamento }: { agendamento: Agendamento }) {
  const atualizar = useAtualizarStatusAgendamento();
  const [erro, setErro] = useState<string | null>(null);
  const inicioLocal = new Date(agendamento.inicio);
  const fimLocal = new Date(agendamento.fim);

  function acionar(status: Agendamento["status"]) {
    setErro(null);
    atualizar.mutate({ id: agendamento.id, status }, { onError: (err) => setErro(mensagemErroAgendamento(err)) });
  }

  return (
    <div className="grid grid-cols-[64px_1fr] gap-0 border-b border-hairline py-1 last:border-b-0">
      <div className="pt-3 font-mono text-[10px] text-muted-foreground">{format(inicioLocal, "HH:mm")}</div>
      <div className="py-2 pl-3">
        <div className="flex items-center justify-between gap-2 rounded-[5px] border-l-[3px] bg-content px-3 py-2.5" style={{ borderLeftColor: agendamento.profissionalCor }}>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11.5px] font-medium text-foreground">
              {agendamento.clienteNome} {agendamento.servicos.length > 0 ? `· ${agendamento.servicos.map((s) => s.nome).join(", ")}` : ""}
            </span>
            <span className="text-[10.5px] text-muted-foreground">
              {agendamento.recursoNome ? `${agendamento.recursoNome} · ` : ""}
              {format(inicioLocal, "HH:mm")}–{format(fimLocal, "HH:mm")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[agendamento.status]}>{STATUS_LABEL[agendamento.status]}</Badge>
            {(agendamento.status === "agendado" || agendamento.status === "confirmado") && (
              <Button size="sm" onClick={() => acionar("em_andamento")} disabled={atualizar.isPending}>
                Iniciar
              </Button>
            )}
            {agendamento.status === "em_andamento" && (
              <Button size="sm" onClick={() => acionar("concluido")} disabled={atualizar.isPending}>
                Concluir
              </Button>
            )}
          </div>
        </div>
        {erro && <span className="text-[10.5px] text-destructive">{erro}</span>}
      </div>
    </div>
  );
}

export function MeuDiaPage({ profissional }: { profissional: Profissional }) {
  const hoje = useMemo(() => new Date(), []);
  const { data: agendamentos } = useAgendamentosIntervalo(inicioDoDia(hoje).toISOString(), fimDoDia(hoje).toISOString(), profissional.id);
  const { data: horarios } = useHorariosProfissional(profissional.id);
  const definirExpediente = useDefinirExpedientePadrao();

  const lista = agendamentos ?? [];
  const ativos = lista.filter((a) => a.status !== "cancelado");
  const minutosOcupados = ativos.reduce((acc, a) => acc + (new Date(a.fim).getTime() - new Date(a.inicio).getTime()) / 60000, 0);
  const emAndamento = lista.find((a) => a.status === "em_andamento") ?? null;

  const inicioMes = useMemo(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1), [hoje]);
  const { data: agendamentosMes } = useAgendamentosIntervalo(inicioMes.toISOString(), new Date().toISOString(), profissional.id);
  const concluidosMes = (agendamentosMes ?? []).filter((a) => a.status === "concluido");
  const horasProducaoMes = concluidosMes.reduce((acc, a) => acc + (new Date(a.fim).getTime() - new Date(a.inicio).getTime()) / 3_600_000, 0);

  return (
    <div className="grid h-[calc(100vh-8.5rem)] grid-cols-1 gap-3 lg:grid-cols-[1fr_340px]">
      <div className="flex min-h-0 flex-col gap-3">
        <Card className="flex items-center justify-between gap-3 p-3.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[15px] font-medium text-foreground">{format(hoje, "EEEE, dd 'de' MMMM", { locale: ptBR })}</span>
            <span className="text-[11px] text-muted-foreground">
              {ativos.length} atendimento{ativos.length === 1 ? "" : "s"} · {(minutosOcupados / 60).toFixed(1)}h ocupadas
            </span>
          </div>
        </Card>

        {(!horarios || horarios.length === 0) && (
          <Card className="flex flex-wrap items-center justify-between gap-2 border-warning-tint bg-warning-tint p-3">
            <span className="text-[11.5px] text-warning-tint-foreground">Você ainda não tem jornada cadastrada — nenhum atendimento pode ser marcado assim.</span>
            <Button size="sm" variant="outline" disabled={definirExpediente.isPending} onClick={() => definirExpediente.mutate(profissional.id)}>
              Definir expediente padrão (seg–sáb 09h–18h)
            </Button>
          </Card>
        )}

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="border-b border-hairline px-3.5 py-2.5 text-[12.5px] font-medium text-foreground">Agenda do dia</div>
          <div className="flex-1 overflow-y-auto px-3.5 py-1.5">
            {lista.length === 0 ? (
              <div className="p-6 text-center text-[11.5px] text-muted-foreground">Nenhum atendimento hoje.</div>
            ) : (
              lista.map((a) => <ItemAgendamento key={a.id} agendamento={a} />)
            )}
          </div>
        </Card>
      </div>

      <div className="flex min-h-0 flex-col gap-3">
        <Card className="flex flex-col gap-2.5 p-3.5">
          <span className="text-[12.5px] font-medium text-foreground">Em atendimento agora</span>
          {emAndamento ? (
            <div className="flex flex-col gap-1 rounded-md bg-content p-3">
              <span className="text-[11.5px] font-medium text-foreground">{emAndamento.clienteNome}</span>
              <span className="text-[10px] text-muted-foreground">iniciado {format(new Date(emAndamento.inicio), "HH:mm")}</span>
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground">Nenhum atendimento em andamento.</span>
          )}
        </Card>

        <Card className="flex flex-col gap-2 p-3.5">
          <span className="text-[12.5px] font-medium text-foreground">Minha produção no mês</span>
          <div className="flex justify-between text-[11px] text-secondary-foreground">
            <span>Atendimentos concluídos</span>
            <span className="font-semibold text-foreground">{concluidosMes.length}</span>
          </div>
          <div className="flex justify-between text-[11px] text-secondary-foreground">
            <span>Horas produzidas</span>
            <span className="font-semibold text-foreground">{horasProducaoMes.toFixed(1)}h</span>
          </div>
        </Card>

        <Card className="flex-1 p-3.5 text-[10px] text-muted-foreground">
          Prontuário, evoluções e anamnese entram na Subetapa 02.9 (`aba_health`) — o perfil profissional não vê financeiro da conta nem prontuário de colegas.
        </Card>
      </div>
    </div>
  );
}
