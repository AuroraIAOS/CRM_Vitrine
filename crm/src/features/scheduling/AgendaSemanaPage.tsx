import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NovoAtendimentoForm } from "./NovoAtendimentoForm";
import {
  useProfissionais,
  useProfissionaisSemJornada,
  useDefinirExpedientePadrao,
  useAgendamentosIntervalo,
  useAtualizarStatusAgendamento,
  useCancelarAgendamento,
  useCriarAusencia,
  STATUS_LABEL,
  STATUS_TONE,
  mensagemErroAgendamento,
  type Agendamento,
  type Profissional,
} from "./api";

// Grade 07:00–20:00 — cobre um dia comercial comum; profissional com
// jornada fora dessa faixa continua sendo recusado normalmente pelo
// banco, só não fica visível na grade (limite de exibição, não de
// negócio). Domingo a segunda: 7 colunas (Seg–Dom), diferente das 6 do
// wireframe (Seg–Sáb) — decisão desta subetapa, para não esconder um
// agendamento real de domingo que o banco aceitaria.
const HORA_INICIO_GRADE = 7;
const HORA_FIM_GRADE = 20;
const ALTURA_LINHA_PX = 48;
const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function inicioDaSemana(data: Date): Date {
  const dia = data.getDay(); // 0=domingo
  const deslocamento = dia === 0 ? -6 : 1 - dia;
  const seg = new Date(data);
  seg.setHours(0, 0, 0, 0);
  seg.setDate(seg.getDate() + deslocamento);
  return seg;
}

function addDias(data: Date, dias: number): Date {
  const nova = new Date(data);
  nova.setDate(nova.getDate() + dias);
  return nova;
}

const formatoMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function BlocoAgendamento({ agendamento, onSelecionar }: { agendamento: Agendamento; onSelecionar: () => void }) {
  const inicioLocal = new Date(agendamento.inicio);
  const fimLocal = new Date(agendamento.fim);
  const minutosInicio = inicioLocal.getHours() * 60 + inicioLocal.getMinutes();
  const minutosFim = fimLocal.getHours() * 60 + fimLocal.getMinutes();
  const minutosGradeInicio = HORA_INICIO_GRADE * 60;
  const minutosGradeFim = HORA_FIM_GRADE * 60;

  const top = Math.max(0, ((minutosInicio - minutosGradeInicio) / 60) * ALTURA_LINHA_PX);
  const altura = Math.max(20, ((Math.min(minutosFim, minutosGradeFim) - Math.max(minutosInicio, minutosGradeInicio)) / 60) * ALTURA_LINHA_PX);

  if (minutosFim <= minutosGradeInicio || minutosInicio >= minutosGradeFim) return null;

  const cancelado = agendamento.status === "cancelado" || agendamento.status === "nao_compareceu";

  return (
    <button
      type="button"
      onClick={onSelecionar}
      style={{ top, height: altura, borderLeftColor: agendamento.profissionalCor }}
      className={`absolute left-1 right-1 flex flex-col gap-0.5 overflow-hidden rounded-[5px] border-l-[3px] bg-content px-2 py-1 text-left ${cancelado ? "opacity-45" : ""}`}
    >
      <span className="truncate text-[10.5px] font-semibold text-foreground">{agendamento.clienteNome}</span>
      <span className="truncate text-[9.5px] text-muted-foreground">
        {agendamento.servicos.map((s) => s.nome).join(", ") || agendamento.profissionalNome}
      </span>
      <span className="font-mono text-[9px] text-muted-foreground">
        {format(inicioLocal, "HH:mm")}–{format(fimLocal, "HH:mm")}
      </span>
    </button>
  );
}

function PainelDetalhe({ agendamento, onFechar }: { agendamento: Agendamento; onFechar: () => void }) {
  const atualizarStatus = useAtualizarStatusAgendamento();
  const cancelar = useCancelarAgendamento();
  const [erro, setErro] = useState<string | null>(null);
  const inicioLocal = new Date(agendamento.inicio);
  const fimLocal = new Date(agendamento.fim);

  function acionar(fn: () => Promise<unknown> | void) {
    setErro(null);
    Promise.resolve(fn()).catch((err) => setErro(mensagemErroAgendamento(err)));
  }

  return (
    <Card className="flex w-[300px] flex-shrink-0 flex-col gap-3 p-4">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12.5px] font-medium text-foreground">{agendamento.clienteNome}</span>
          <span className="text-[11px] text-muted-foreground">
            {format(inicioLocal, "dd/MM · HH:mm", { locale: ptBR })}–{format(fimLocal, "HH:mm")}
          </span>
        </div>
        <button type="button" onClick={onFechar} className="text-[11px] text-muted-foreground hover:text-foreground">
          fechar
        </button>
      </div>

      <Badge tone={STATUS_TONE[agendamento.status]} className="w-fit">
        {STATUS_LABEL[agendamento.status]}
      </Badge>

      <div className="flex flex-col gap-1 text-[11px] text-secondary-foreground">
        <span>Profissional: {agendamento.profissionalNome}</span>
        {agendamento.recursoNome && <span>Sala: {agendamento.recursoNome}</span>}
        {agendamento.servicos.length > 0 && (
          <span>
            Serviços: {agendamento.servicos.map((s) => `${s.nome} (${formatoMoeda.format(s.precoTotal)})`).join(", ")}
          </span>
        )}
        {agendamento.observacoes && <span>Obs.: {agendamento.observacoes}</span>}
        {agendamento.motivoCancelamento && <span>Motivo do cancelamento: {agendamento.motivoCancelamento}</span>}
      </div>

      {agendamento.status !== "cancelado" && agendamento.status !== "concluido" && (
        <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
          {agendamento.status === "agendado" && (
            <Button size="sm" variant="outline" onClick={() => acionar(() => atualizarStatus.mutateAsync({ id: agendamento.id, status: "confirmado" }))}>
              Confirmar
            </Button>
          )}
          {(agendamento.status === "agendado" || agendamento.status === "confirmado") && (
            <Button size="sm" onClick={() => acionar(() => atualizarStatus.mutateAsync({ id: agendamento.id, status: "em_andamento" }))}>
              Iniciar atendimento
            </Button>
          )}
          {agendamento.status === "em_andamento" && (
            <Button size="sm" onClick={() => acionar(() => atualizarStatus.mutateAsync({ id: agendamento.id, status: "concluido" }))}>
              Concluir
            </Button>
          )}
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => acionar(() => atualizarStatus.mutateAsync({ id: agendamento.id, status: "nao_compareceu" }))}
            >
              Não compareceu
            </Button>
            <Button size="sm" variant="destructive" onClick={() => acionar(() => cancelar.mutateAsync({ id: agendamento.id }))}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {erro && <span className="text-[11px] text-destructive">{erro}</span>}
    </Card>
  );
}

function FormularioBloquearHorario({ profissionais, onFeito }: { profissionais: Profissional[]; onFeito: () => void }) {
  const criar = useCriarAusencia();
  const [profissionalId, setProfissionalId] = useState(profissionais[0]?.id ?? "");
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [horaInicio, setHoraInicio] = useState("12:00");
  const [horaFim, setHoraFim] = useState("13:00");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  return (
    <Card className="flex flex-col gap-2 p-3">
      <span className="text-[11.5px] font-medium text-foreground">Bloquear horário (folga/indisponibilidade)</span>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          const inicio = new Date(`${data}T${horaInicio}:00`);
          const fim = new Date(`${data}T${horaFim}:00`);
          criar.mutate(
            { profissionalId, inicio: inicio.toISOString(), fim: fim.toISOString(), motivo: motivo || undefined },
            { onSuccess: () => { setMotivo(""); onFeito(); }, onError: (err) => setErro(mensagemErroAgendamento(err)) },
          );
        }}
      >
        <select
          required
          className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
          value={profissionalId}
          onChange={(e) => setProfissionalId(e.target.value)}
        >
          {profissionais.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nomeExibicao}
            </option>
          ))}
        </select>
        <input required type="date" className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]" value={data} onChange={(e) => setData(e.target.value)} />
        <input required type="time" className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
        <input required type="time" className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
        <input className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]" placeholder="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <Button type="submit" size="sm" disabled={criar.isPending}>
          {criar.isPending ? "Salvando..." : "Bloquear"}
        </Button>
        {erro && <span className="text-[11px] text-destructive">{erro}</span>}
      </form>
    </Card>
  );
}

function AvisoSemJornada() {
  const { data: semJornada } = useProfissionaisSemJornada();
  const definir = useDefinirExpedientePadrao();
  if (!semJornada || semJornada.length === 0) return null;

  return (
    <Card className="flex flex-wrap items-center justify-between gap-2 border-warning-tint bg-warning-tint p-3">
      <span className="text-[11.5px] text-warning-tint-foreground">
        Sem jornada cadastrada, todo agendamento é recusado (fora de expediente): {semJornada.map((p) => p.nomeExibicao).join(", ")}
      </span>
      <div className="flex gap-2">
        {semJornada.map((p) => (
          <Button key={p.id} size="sm" variant="outline" disabled={definir.isPending} onClick={() => definir.mutate(p.id)}>
            Definir expediente padrão · {p.nomeExibicao}
          </Button>
        ))}
      </div>
    </Card>
  );
}

export function AgendaSemanaPage() {
  const [referencia, setReferencia] = useState(() => new Date());
  const [mostrarNovo, setMostrarNovo] = useState(false);
  const [mostrarBloqueio, setMostrarBloqueio] = useState(false);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);

  const { data: profissionais } = useProfissionais();
  const seg = useMemo(() => inicioDaSemana(referencia), [referencia]);
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => addDias(seg, i)), [seg]);
  const fimIntervalo = useMemo(() => addDias(seg, 7), [seg]);

  const { data: agendamentos } = useAgendamentosIntervalo(seg.toISOString(), fimIntervalo.toISOString());

  const porDia = useMemo(() => {
    const mapa = new Map<string, Agendamento[]>();
    for (const dia of dias) mapa.set(dia.toDateString(), []);
    for (const a of agendamentos ?? []) {
      const chave = new Date(a.inicio).toDateString();
      mapa.get(chave)?.push(a);
    }
    return mapa;
  }, [dias, agendamentos]);

  const selecionado = useMemo(() => agendamentos?.find((a) => a.id === selecionadoId) ?? null, [agendamentos, selecionadoId]);

  const linhasHora = Array.from({ length: HORA_FIM_GRADE - HORA_INICIO_GRADE }, (_, i) => HORA_INICIO_GRADE + i);

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col gap-3">
      <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setReferencia((d) => addDias(d, -7))}>
              ← semana
            </Button>
            <Button size="sm" variant="outline" onClick={() => setReferencia(new Date())}>
              Hoje
            </Button>
            <Button size="sm" variant="outline" onClick={() => setReferencia((d) => addDias(d, 7))}>
              semana →
            </Button>
          </div>
          <span className="text-[12.5px] font-medium text-foreground">
            {format(seg, "dd 'de' MMM", { locale: ptBR })} – {format(addDias(seg, 6), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
          </span>
          <div className="flex flex-wrap gap-3">
            {(profissionais ?? []).map((p) => (
              <div key={p.id} className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: p.cor }} />
                <span className="text-[10.5px] text-muted-foreground">{p.nomeExibicao}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setMostrarBloqueio((v) => !v)}>
            {mostrarBloqueio ? "Fechar bloqueio" : "Bloquear horário"}
          </Button>
          <Button size="sm" onClick={() => setMostrarNovo((v) => !v)}>
            {mostrarNovo ? "Cancelar" : "+ Novo atendimento"}
          </Button>
        </div>
      </Card>

      <AvisoSemJornada />

      {mostrarBloqueio && (profissionais?.length ?? 0) > 0 && (
        <FormularioBloquearHorario profissionais={profissionais!} onFeito={() => setMostrarBloqueio(false)} />
      )}

      {mostrarNovo && (
        <NovoAtendimentoForm profissionais={profissionais ?? []} onCriado={() => setMostrarNovo(false)} onCancelar={() => setMostrarNovo(false)} />
      )}

      {(profissionais?.length ?? 0) === 0 && (
        <Card className="p-4 text-[11.5px] text-muted-foreground">
          Nenhum profissional ativo ainda — ligue o atributo profissional de um funcionário em Configurações → Equipe para agendar.
        </Card>
      )}

      <div className="flex min-h-0 flex-1 gap-3">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="grid flex-shrink-0" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
            <div className="border-b border-hairline" />
            {dias.map((dia, i) => (
              <div key={i} className="border-b border-l border-hairline py-2 text-center">
                <div className="text-[11px] text-muted-foreground">{DIAS_SEMANA[i]}</div>
                <div className="text-[14px] font-medium text-foreground">{dia.getDate()}</div>
              </div>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="grid" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
              <div>
                {linhasHora.map((h) => (
                  <div key={h} style={{ height: ALTURA_LINHA_PX }} className="flex items-start justify-end border-r border-hairline pr-1.5 pt-0.5">
                    <span className="font-mono text-[9.5px] text-muted-foreground">{String(h).padStart(2, "0")}:00</span>
                  </div>
                ))}
              </div>
              {dias.map((dia, i) => (
                <div key={i} className="relative border-l border-hairline" style={{ height: ALTURA_LINHA_PX * linhasHora.length }}>
                  {linhasHora.map((h) => (
                    <div key={h} style={{ height: ALTURA_LINHA_PX }} className="border-b border-hairline" />
                  ))}
                  {(porDia.get(dia.toDateString()) ?? []).map((a) => (
                    <BlocoAgendamento key={a.id} agendamento={a} onSelecionar={() => setSelecionadoId(a.id)} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Card>

        {selecionado && <PainelDetalhe agendamento={selecionado} onFechar={() => setSelecionadoId(null)} />}
      </div>
    </div>
  );
}
