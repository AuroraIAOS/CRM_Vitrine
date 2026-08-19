import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { usePagamentosConciliacao } from "./api";

const formatoMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const LABEL_FORMA: Record<string, string> = {
  pix: "Pix",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
  plano: "Plano",
  outro: "Outro",
};

export function ConciliacaoTab() {
  const { data: pagamentos } = usePagamentosConciliacao();
  const lista = pagamentos ?? [];
  const total = lista.reduce((acc, p) => acc + p.valor, 0);

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
        <span className="text-[11.5px] text-muted-foreground">Livro de pagamentos recebidos — de-para entre o que foi cobrado e o que entrou</span>
        <span className="text-[11.5px] font-medium text-foreground">{formatoMoeda.format(total)}</span>
      </div>
      <div className="grid grid-cols-[90px_1.2fr_1.2fr_0.8fr_0.9fr] gap-2.5 border-b border-hairline px-3.5 py-2.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
        <span>Data</span>
        <span>Pessoa</span>
        <span>Referência</span>
        <span>Forma</span>
        <span>Valor</span>
      </div>
      {lista.map((p) => (
        <div key={p.id} className="grid grid-cols-[90px_1.2fr_1.2fr_0.8fr_0.9fr] gap-2.5 border-b border-hairline px-3.5 py-2.5 text-[11.5px] last:border-b-0">
          <span className="font-mono text-[10.5px] text-muted-foreground">{format(new Date(p.pagoEm), "dd/MM/yy", { locale: ptBR })}</span>
          <span className="font-medium text-foreground">{p.clienteNome}</span>
          <span className="text-secondary-foreground">{p.referencia ?? "—"}</span>
          <span className="text-secondary-foreground">{p.formaPagamento ? (LABEL_FORMA[p.formaPagamento] ?? p.formaPagamento) : "—"}</span>
          <span className="text-secondary-foreground">{formatoMoeda.format(p.valor)}</span>
        </div>
      ))}
      {lista.length === 0 && <div className="p-6 text-center text-[11.5px] text-muted-foreground">Nenhum pagamento registrado ainda.</div>}
    </Card>
  );
}
