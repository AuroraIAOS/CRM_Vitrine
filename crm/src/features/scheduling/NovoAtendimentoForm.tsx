import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  useClientesParaSelecao,
  useCriarAgendamento,
  useRecursos,
  useServicos,
  usePlanosClienteAtivos,
  mensagemErroAgendamento,
  type Profissional,
} from "./api";

const formatoMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function hojeISO() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
}

/**
 * Formulário compartilhado de "Novo atendimento" — usado pela Agenda
 * semanal (`1e`) e pelo Balcão (`1o`). `inicio`/`fim` são construídos a
 * partir de <input type="date">/<input type="time">, interpretados no
 * fuso do navegador — assume-se alinhado ao fuso único e fixo da conta
 * (`aba_scheduling.fuso_horario_conta() = 'America/Sao_Paulo'`), já que
 * não há seletor de fuso no v01 nem biblioteca de timezone instalada.
 */
export function NovoAtendimentoForm({
  profissionais,
  profissionalIdPadrao,
  onCriado,
  onCancelar,
}: {
  profissionais: Profissional[];
  profissionalIdPadrao?: string;
  onCriado: () => void;
  onCancelar: () => void;
}) {
  const { data: clientes } = useClientesParaSelecao();
  const { data: servicos } = useServicos();
  const { data: recursos } = useRecursos();
  const criar = useCriarAgendamento();

  const [clienteId, setClienteId] = useState("");
  const [profissionalId, setProfissionalId] = useState(profissionalIdPadrao ?? "");
  const [recursoId, setRecursoId] = useState("");
  const [servicoId, setServicoId] = useState("");
  const [planoClienteId, setPlanoClienteId] = useState("");
  const { data: planosCliente } = usePlanosClienteAtivos(clienteId || undefined);
  const [data, setData] = useState(hojeISO());
  const [horaInicio, setHoraInicio] = useState("09:00");
  const [duracaoMinutos, setDuracaoMinutos] = useState(60);
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const servicoSelecionado = servicos?.find((s) => s.id === servicoId);

  function handleSelecionarServico(id: string) {
    setServicoId(id);
    const servico = servicos?.find((s) => s.id === id);
    if (servico) setDuracaoMinutos(servico.duracaoPadraoMinutos);
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <span className="text-[12.5px] font-medium text-foreground">Novo atendimento</span>
      <form
        className="flex flex-col gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          if (!clienteId || !profissionalId) return;

          const inicioLocal = new Date(`${data}T${horaInicio}:00`);
          const fimLocal = new Date(inicioLocal.getTime() + duracaoMinutos * 60_000);

          criar.mutate(
            {
              clienteId,
              profissionalId,
              recursoId: recursoId || undefined,
              inicio: inicioLocal.toISOString(),
              fim: fimLocal.toISOString(),
              observacoes: observacoes || undefined,
              servico: servicoSelecionado
                ? { servicoId: servicoSelecionado.id, preco: servicoSelecionado.precoBase, duracaoMinutos }
                : undefined,
              planoClienteId: planoClienteId || undefined,
            },
            {
              onSuccess: () => {
                setClienteId("");
                setServicoId("");
                setPlanoClienteId("");
                setObservacoes("");
                onCriado();
              },
              onError: (err) => setErro(mensagemErroAgendamento(err)),
            },
          );
        }}
      >
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">Cliente</label>
            <select
              required
              className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
              value={clienteId}
              onChange={(e) => {
                setClienteId(e.target.value);
                setPlanoClienteId("");
              }}
            >
              <option value="" disabled>
                Selecione...
              </option>
              {(clientes ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomeExibicao}
                </option>
              ))}
            </select>
          </div>

          {planosCliente && planosCliente.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-secondary-foreground">Consumir sessão do plano</label>
              <select
                className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
                value={planoClienteId}
                onChange={(e) => setPlanoClienteId(e.target.value)}
              >
                <option value="">Não consumir plano</option>
                {planosCliente.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.planoNome}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">Profissional</label>
            <select
              required
              className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
              value={profissionalId}
              onChange={(e) => setProfissionalId(e.target.value)}
            >
              <option value="" disabled>
                Selecione...
              </option>
              {profissionais.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nomeExibicao}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">Serviço (opcional)</label>
            <select
              className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
              value={servicoId}
              onChange={(e) => handleSelecionarServico(e.target.value)}
            >
              <option value="">Sem serviço vinculado</option>
              {(servicos ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome} · {formatoMoeda.format(s.precoBase)}
                </option>
              ))}
            </select>
          </div>

          {recursos && recursos.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-secondary-foreground">Sala/recurso (opcional)</label>
              <select
                className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
                value={recursoId}
                onChange={(e) => setRecursoId(e.target.value)}
              >
                <option value="">Sem sala vinculada</option>
                {recursos.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">Data</label>
            <input
              required
              type="date"
              className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">Hora início</label>
            <input
              required
              type="time"
              className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
              value={horaInicio}
              onChange={(e) => setHoraInicio(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">Duração (min)</label>
            <input
              required
              type="number"
              min={5}
              step={5}
              className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
              value={duracaoMinutos}
              onChange={(e) => setDuracaoMinutos(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">Observações</label>
            <input
              className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Opcional"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" size="sm" disabled={criar.isPending}>
            {criar.isPending ? "Salvando..." : "Agendar"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
          {erro && <span className="text-[11.5px] text-destructive">{erro}</span>}
        </div>
      </form>
    </Card>
  );
}
