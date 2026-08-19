import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { useLancamentosComissao, useAtualizarStatusComissao, type StatusComissao } from "./api";

const formatoMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_LABEL: Record<StatusComissao, string> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  pago: "Pago",
  cancelado: "Cancelado",
};

const STATUS_TONE: Record<StatusComissao, BadgeTone> = {
  pendente: "neutral",
  aprovado: "warning",
  pago: "success",
  cancelado: "danger",
};

/**
 * `lancamentos_comissao` tem RLS restrita a `admin+` (docs/02 §2,
 * "um profissional não enxerga a comissão dos colegas") — a régua é o
 * banco: para quem não é admin, a query devolve conjunto vazio e esta
 * aba mostra o mesmo estado vazio de uma conta sem comissão nenhuma,
 * sem checagem de papel duplicada no client.
 */
export function ComissoesTab() {
  const { data: lancamentos } = useLancamentosComissao();
  const atualizar = useAtualizarStatusComissao();

  const lista = lancamentos ?? [];

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="grid grid-cols-[1fr_1fr_0.9fr_0.9fr_0.6fr_0.9fr_0.7fr_auto] gap-2.5 border-b border-hairline px-3.5 py-2.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
        <span>Profissional</span>
        <span>Serviço</span>
        <span>Data</span>
        <span>Base</span>
        <span>%</span>
        <span>Comissão</span>
        <span>Situação</span>
        <span></span>
      </div>
      {lista.map((l) => (
        <div
          key={l.id}
          className="grid grid-cols-[1fr_1fr_0.9fr_0.9fr_0.6fr_0.9fr_0.7fr_auto] items-center gap-2.5 border-b border-hairline px-3.5 py-2.5 text-[11.5px] last:border-b-0"
        >
          <span className="font-medium text-foreground">{l.profissionalNome}</span>
          <span className="text-secondary-foreground">{l.servicoNome}</span>
          <span className="font-mono text-[10.5px] text-muted-foreground">{format(new Date(l.criadoEm), "dd/MM", { locale: ptBR })}</span>
          <span className="text-secondary-foreground">{formatoMoeda.format(l.valorBase)}</span>
          <span className="text-secondary-foreground">{l.percentual}%</span>
          <span className="font-medium text-foreground">{formatoMoeda.format(l.valorComissao)}</span>
          <Badge tone={STATUS_TONE[l.status]} className="w-fit">
            {STATUS_LABEL[l.status]}
          </Badge>
          <div className="flex gap-1.5">
            {l.status === "pendente" && (
              <Button size="sm" variant="outline" disabled={atualizar.isPending} onClick={() => atualizar.mutate({ id: l.id, status: "aprovado" })}>
                Aprovar
              </Button>
            )}
            {l.status === "aprovado" && (
              <Button size="sm" disabled={atualizar.isPending} onClick={() => atualizar.mutate({ id: l.id, status: "pago" })}>
                Marcar pago
              </Button>
            )}
          </div>
        </div>
      ))}
      {lista.length === 0 && <div className="p-6 text-center text-[11.5px] text-muted-foreground">Nenhuma comissão lançada ainda.</div>}
    </Card>
  );
}
