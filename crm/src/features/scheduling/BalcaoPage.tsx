import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NovoAtendimentoForm } from "./NovoAtendimentoForm";
import {
  useProfissionais,
  useAgendamentosIntervalo,
  useAtualizarStatusAgendamento,
  STATUS_LABEL,
  STATUS_TONE,
  mensagemErroAgendamento,
  type Agendamento,
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

function ChegadaItem({ agendamento }: { agendamento: Agendamento }) {
  const atualizar = useAtualizarStatusAgendamento();
  const [erro, setErro] = useState<string | null>(null);
  const inicioLocal = new Date(agendamento.inicio);

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-[11.5px] font-medium text-foreground">{agendamento.clienteNome}</span>
          <span className="text-[10px] text-muted-foreground">
            {format(inicioLocal, "HH:mm")} · {agendamento.servicos.map((s) => s.nome).join(", ") || "—"} · {agendamento.profissionalNome}
          </span>
        </div>
        <Badge tone={STATUS_TONE[agendamento.status]}>{STATUS_LABEL[agendamento.status]}</Badge>
      </div>
      {agendamento.status === "agendado" && (
        <Button
          size="sm"
          disabled={atualizar.isPending}
          onClick={() => {
            setErro(null);
            atualizar.mutate({ id: agendamento.id, status: "confirmado" }, { onError: (err) => setErro(mensagemErroAgendamento(err)) });
          }}
        >
          Check-in
        </Button>
      )}
      {erro && <span className="text-[10.5px] text-destructive">{erro}</span>}
    </div>
  );
}

export function BalcaoPage() {
  const hoje = useMemo(() => new Date(), []);
  const { data: profissionais } = useProfissionais();
  const { data: agendamentos } = useAgendamentosIntervalo(inicioDoDia(hoje).toISOString(), fimDoDia(hoje).toISOString());
  const [mostrarNovo, setMostrarNovo] = useState(false);

  const lista = (agendamentos ?? []).filter((a) => a.status !== "cancelado");

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col gap-3">
      {mostrarNovo && (
        <NovoAtendimentoForm profissionais={profissionais ?? []} onCriado={() => setMostrarNovo(false)} onCancelar={() => setMostrarNovo(false)} />
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
            <span className="text-[12.5px] font-medium text-foreground">Chegadas de hoje</span>
            <span className="text-[10.5px] text-muted-foreground">{lista.length} previstas</span>
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
            {lista.length === 0 ? (
              <span className="text-center text-[11px] text-muted-foreground">Nenhum atendimento hoje.</span>
            ) : (
              lista.map((a) => <ChegadaItem key={a.id} agendamento={a} />)
            )}
          </div>
        </Card>

        <div className="flex min-h-0 flex-col gap-3">
          <Card className="p-3.5 text-[10.5px] text-muted-foreground">
            Sala de espera e encaixes ("Lista de espera e encaixe") ficam fora da navegação do v01 — item do backlog de versionamento
            (`docs/00_PLANO_E_CRITERIOS.md`).
          </Card>
          <Card className="flex-1 p-3.5 text-[10.5px] text-muted-foreground">
            Caixa do dia (recebido/a receber/pendências vencidas) entra na Subetapa 02.8 (`aba_finance`).
          </Card>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <Card className="flex flex-col gap-2 p-3.5">
            <span className="text-[12.5px] font-medium text-foreground">Ações do balcão</span>
            <Button size="sm" onClick={() => setMostrarNovo((v) => !v)}>
              {mostrarNovo ? "Fechar formulário" : "Novo agendamento"}
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/pessoas">Cadastrar pessoa</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/mensagens">Abrir conversa no WhatsApp</Link>
            </Button>
            <Button size="sm" variant="outline" disabled title="Prontuário/anamnese entram na Subetapa 02.9">
              Enviar link de anamnese
            </Button>
          </Card>
          <Card className="flex-1 p-3.5 text-[10.5px] leading-relaxed text-muted-foreground">
            Recepção não acessa prontuário — a régua é `access.can('health', ...)`/RLS, não uma checagem no front.
          </Card>
        </div>
      </div>
    </div>
  );
}
