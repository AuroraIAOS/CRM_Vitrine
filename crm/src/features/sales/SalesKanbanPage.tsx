import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useFunilPadrao,
  useCriarFunilPadrao,
  useOportunidades,
  usePessoasParaSelecao,
  useCriarOportunidade,
  useMoverOportunidade,
  useFecharOportunidade,
  type Oportunidade,
} from "./api";

const formatoMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function EstadoVazio() {
  const criar = useCriarFunilPadrao();
  return (
    <Card className="flex flex-col items-center gap-3 p-10 text-center">
      <span className="text-[13px] font-medium text-foreground">Nenhum funil de vendas ainda</span>
      <span className="max-w-sm text-[11.5px] text-muted-foreground">
        Crie o funil "Comercial padrão" com as 5 etapas do fluxo comercial (Novo contato → Avaliação agendada → Proposta enviada → Negociação →
        Fechado) para começar a registrar negócios.
      </span>
      <Button size="sm" disabled={criar.isPending} onClick={() => criar.mutate()}>
        {criar.isPending ? "Criando..." : "Criar funil padrão"}
      </Button>
    </Card>
  );
}

function FormularioNovoNegocio({
  funilId,
  etapaPadraoId,
  onCriado,
}: {
  funilId: string;
  etapaPadraoId: string;
  onCriado: () => void;
}) {
  const { data: pessoas } = usePessoasParaSelecao();
  const criar = useCriarOportunidade();
  const [pessoaId, setPessoaId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [valor, setValor] = useState("");

  return (
    <form
      className="flex flex-col gap-2 rounded-md border border-border bg-content p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pessoaId) return;
        criar.mutate(
          { funilId, etapaId: etapaPadraoId, pessoaId, titulo, valor: Number(valor.replace(",", ".")) || 0 },
          {
            onSuccess: () => {
              setPessoaId("");
              setTitulo("");
              setValor("");
              onCriado();
            },
          },
        );
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-[11px] font-medium text-secondary-foreground">Pessoa</label>
          <select
            required
            className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
            value={pessoaId}
            onChange={(e) => setPessoaId(e.target.value)}
          >
            <option value="" disabled>
              Selecione...
            </option>
            {(pessoas ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome_exibicao}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-[11px] font-medium text-secondary-foreground">Título do negócio</label>
          <input
            required
            className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: Pacote 10 sessões"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-secondary-foreground">Valor (R$)</label>
          <input
            className="w-28 rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
            inputMode="decimal"
          />
        </div>
        <Button type="submit" size="sm" disabled={criar.isPending}>
          {criar.isPending ? "Criando..." : "Criar"}
        </Button>
      </div>
      {criar.isError && (
        <span className="text-[11.5px] text-destructive">{(criar.error as { message?: string })?.message ?? "Falha ao criar negócio"}</span>
      )}
    </form>
  );
}

function OportunidadeCard({ oportunidade }: { oportunidade: Oportunidade }) {
  const fechar = useFecharOportunidade();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: oportunidade.id,
    disabled: oportunidade.status !== "ativa",
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 10 : undefined } : undefined}
      className="flex flex-col gap-1.5 rounded-md border border-border bg-background p-2.5 text-left"
    >
      <span className="text-[11px] font-medium text-foreground">{oportunidade.pessoaNome}</span>
      <span className="text-[10.5px] text-muted-foreground">
        {oportunidade.titulo} · {formatoMoeda.format(oportunidade.valor)}
      </span>
      {oportunidade.status === "ativa" ? (
        <div className="flex gap-2 pt-0.5">
          <button
            type="button"
            className="text-[10px] font-medium text-success-tint-foreground hover:underline"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => fechar.mutate({ id: oportunidade.id, status: "ganha" })}
          >
            Ganha
          </button>
          <button
            type="button"
            className="text-[10px] font-medium text-destructive-tint-foreground hover:underline"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => fechar.mutate({ id: oportunidade.id, status: "perdida" })}
          >
            Perdida
          </button>
        </div>
      ) : (
        <Badge tone={oportunidade.status === "ganha" ? "success" : "danger"} className="w-fit">
          {oportunidade.status === "ganha" ? "Ganha" : "Perdida"}
        </Badge>
      )}
    </div>
  );
}

function Coluna({ etapa, oportunidades }: { etapa: { id: string; nome: string }; oportunidades: Oportunidade[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id });
  const total = oportunidades.reduce((acc, o) => acc + o.valor, 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card ${isOver ? "border-primary" : "border-border"}`}
    >
      <div className="flex flex-col gap-0.5 border-b border-hairline px-3 py-2.5">
        <span className="text-[11.5px] font-semibold text-foreground">{etapa.nome}</span>
        <span className="font-mono text-[9.5px] text-muted-foreground">
          {oportunidades.length} · {formatoMoeda.format(total)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2.5">
        {oportunidades.map((o) => (
          <OportunidadeCard key={o.id} oportunidade={o} />
        ))}
        {oportunidades.length === 0 && (
          <div className="flex-1 rounded-md border border-dashed border-input p-4 text-center text-[10px] text-muted-foreground">
            arrastar para cá
          </div>
        )}
      </div>
    </div>
  );
}

export function SalesKanbanPage() {
  const { data: funil, isLoading: carregandoFunil } = useFunilPadrao();
  const { data: oportunidades } = useOportunidades(funil?.id);
  const mover = useMoverOportunidade();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [arrastando, setArrastando] = useState<Oportunidade | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const lista = oportunidades ?? [];
  const ativas = lista.filter((o) => o.status === "ativa");
  const valorEmAberto = ativas.reduce((acc, o) => acc + o.valor, 0);
  const ticketMedio = ativas.length > 0 ? valorEmAberto / ativas.length : 0;

  const porEtapa = useMemo(() => {
    const mapa = new Map<string, Oportunidade[]>();
    for (const etapa of funil?.etapas ?? []) mapa.set(etapa.id, []);
    for (const o of lista) mapa.get(o.etapaId)?.push(o);
    return mapa;
  }, [funil, lista]);

  function handleDragStart(event: DragStartEvent) {
    const item = lista.find((o) => o.id === event.active.id);
    setArrastando(item ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setArrastando(null);
    const { active, over } = event;
    if (!over) return;
    const item = lista.find((o) => o.id === active.id);
    if (!item || item.etapaId === over.id) return;
    mover.mutate({ id: item.id, etapaId: String(over.id) });
  }

  if (carregandoFunil) return <div className="p-6 text-[12px] text-muted-foreground">Carregando…</div>;
  if (!funil) return <EstadoVazio />;

  return (
    <div className="flex h-full flex-col gap-3">
      <Card className="flex items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-3.5">
          <span className="text-[12.5px] font-medium text-foreground">{funil.nome}</span>
          <span className="text-[11px] text-muted-foreground">
            {lista.length} negócios · {formatoMoeda.format(valorEmAberto)} em aberto · ticket médio {formatoMoeda.format(ticketMedio)}
          </span>
        </div>
        <Button size="sm" variant={mostrarFormulario ? "outline" : "default"} onClick={() => setMostrarFormulario((v) => !v)}>
          {mostrarFormulario ? "Cancelar" : "+ Novo negócio"}
        </Button>
      </Card>

      {mostrarFormulario && funil.etapas[0] && (
        <FormularioNovoNegocio funilId={funil.id} etapaPadraoId={funil.etapas[0].id} onCriado={() => setMostrarFormulario(false)} />
      )}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-2.5 overflow-x-auto">
          {funil.etapas.map((etapa) => (
            <Coluna key={etapa.id} etapa={etapa} oportunidades={porEtapa.get(etapa.id) ?? []} />
          ))}
        </div>
        <DragOverlay>
          {arrastando && (
            <div className="flex flex-col gap-1.5 rounded-md border border-primary bg-background p-2.5 shadow-md">
              <span className="text-[11px] font-medium text-foreground">{arrastando.pessoaNome}</span>
              <span className="text-[10.5px] text-muted-foreground">
                {arrastando.titulo} · {formatoMoeda.format(arrastando.valor)}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
