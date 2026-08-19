import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import {
  useFaturas,
  useClientesParaSelecao,
  usePlanosDisponiveis,
  useCriarFaturaAvulsa,
  useVenderPlano,
  useRegistrarPagamento,
  usePlanoVendidoPorFatura,
  useEstornarSessao,
  mensagemErroFinanceiro,
  type Fatura,
  type StatusFatura,
} from "./api";

const formatoMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_LABEL: Record<StatusFatura, string> = {
  rascunho: "Rascunho",
  aberta: "A receber",
  enviada: "A receber",
  paga: "Recebido",
  vencida: "Vencido",
  cancelada: "Cancelada",
};

const STATUS_TONE: Record<StatusFatura, BadgeTone> = {
  rascunho: "neutral",
  aberta: "warning",
  enviada: "warning",
  paga: "success",
  vencida: "danger",
  cancelada: "neutral",
};

function FormularioNovoLancamento({ onFeito, onCancelar }: { onFeito: () => void; onCancelar: () => void }) {
  const [tipo, setTipo] = useState<"avulso" | "plano">("avulso");
  const { data: clientes } = useClientesParaSelecao();
  const { data: planos } = usePlanosDisponiveis();
  const criarAvulsa = useCriarFaturaAvulsa();
  const venderPlano = useVenderPlano();

  const [clienteId, setClienteId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [planoId, setPlanoId] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const planoSelecionado = (planos ?? []).find((p) => p.id === planoId);
  const pendente = criarAvulsa.isPending || venderPlano.isPending;

  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTipo("avulso")}
          className={`rounded-[5px] px-3 py-1.5 text-[11px] font-medium ${tipo === "avulso" ? "bg-content text-primary" : "text-secondary-foreground"}`}
        >
          Fatura avulsa
        </button>
        <button
          type="button"
          onClick={() => setTipo("plano")}
          className={`rounded-[5px] px-3 py-1.5 text-[11px] font-medium ${tipo === "plano" ? "bg-content text-primary" : "text-secondary-foreground"}`}
        >
          Venda de plano
        </button>
      </div>

      <form
        className="flex flex-col gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          if (!clienteId) return;

          if (tipo === "avulso") {
            criarAvulsa.mutate(
              { clienteId, descricao, valor: Number(valor.replace(",", ".")) || 0, dataVencimento: vencimento || undefined },
              { onSuccess: onFeito, onError: (err) => setErro(mensagemErroFinanceiro(err)) },
            );
          } else {
            if (!planoSelecionado) return;
            venderPlano.mutate(
              {
                clienteId,
                planoId: planoSelecionado.id,
                planoNome: planoSelecionado.nome,
                precoTotal: Number(valor.replace(",", ".")) || planoSelecionado.precoTotal,
                dataVencimento: vencimento || undefined,
              },
              { onSuccess: onFeito, onError: (err) => setErro(mensagemErroFinanceiro(err)) },
            );
          }
        }}
      >
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">Cliente</label>
            <select
              required
              className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
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

          {tipo === "avulso" ? (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-secondary-foreground">Referência</label>
              <input
                required
                className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: Sessão avulsa"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-secondary-foreground">Plano</label>
              <select
                required
                className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
                value={planoId}
                onChange={(e) => {
                  setPlanoId(e.target.value);
                  const p = (planos ?? []).find((pl) => pl.id === e.target.value);
                  if (p) setValor(String(p.precoTotal));
                }}
              >
                <option value="" disabled>
                  Selecione...
                </option>
                {(planos ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">Valor (R$)</label>
            <input
              required
              className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">Vencimento (opcional)</label>
            <input
              type="date"
              className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={pendente}>
            {pendente ? "Salvando..." : tipo === "avulso" ? "Criar lançamento" : "Vender plano"}
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

function FormularioPagamento({ fatura, onFeito }: { fatura: Fatura; onFeito: () => void }) {
  const registrar = useRegistrarPagamento();
  const [valor, setValor] = useState(String(fatura.saldo.toFixed(2)).replace(".", ","));
  const [forma, setForma] = useState("pix");
  const [erro, setErro] = useState<string | null>(null);

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        registrar.mutate(
          { faturaId: fatura.id, valor: Number(valor.replace(",", ".")) || 0, formaPagamento: forma },
          { onSuccess: onFeito, onError: (err) => setErro(mensagemErroFinanceiro(err)) },
        );
      }}
    >
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-secondary-foreground">Valor pago (R$)</label>
        <input
          required
          className="w-28 rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          inputMode="decimal"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-secondary-foreground">Forma</label>
        <select className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]" value={forma} onChange={(e) => setForma(e.target.value)}>
          <option value="pix">Pix</option>
          <option value="cartao">Cartão</option>
          <option value="dinheiro">Dinheiro</option>
          <option value="transferencia">Transferência</option>
          <option value="outro">Outro</option>
        </select>
      </div>
      <Button type="submit" size="sm" disabled={registrar.isPending}>
        {registrar.isPending ? "Registrando..." : "Registrar pagamento"}
      </Button>
      {erro && <span className="text-[11.5px] text-destructive">{erro}</span>}
    </form>
  );
}

function SecaoPlanoVendido({ faturaId }: { faturaId: string }) {
  const { data: plano } = usePlanoVendidoPorFatura(faturaId);
  const estornar = useEstornarSessao();
  const [erro, setErro] = useState<string | null>(null);

  if (!plano) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-hairline pt-3">
      <span className="text-[11.5px] font-medium text-foreground">
        Plano vendido: {plano.planoNome} <Badge tone={plano.status === "ativo" ? "success" : "neutral"}>{plano.status}</Badge>
      </span>
      <div className="flex flex-col gap-1.5">
        {plano.saldos.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <span className="text-[11px] text-secondary-foreground">
              {s.servicoNome} · {s.sessoesUsadas}/{s.sessoesTotais} sessões usadas
            </span>
            {s.sessoesUsadas > 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={estornar.isPending}
                onClick={() => {
                  setErro(null);
                  estornar.mutate(
                    { planoClienteId: plano.id, servicoId: s.servicoId },
                    { onError: (err) => setErro(mensagemErroFinanceiro(err)) },
                  );
                }}
              >
                Estornar sessão
              </Button>
            )}
          </div>
        ))}
      </div>
      {erro && <span className="text-[11px] text-destructive">{erro}</span>}
    </div>
  );
}

function DetalheFatura({ fatura, onFechar }: { fatura: Fatura; onFechar: () => void }) {
  const [mostrarPagamento, setMostrarPagamento] = useState(false);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12.5px] font-medium text-foreground">{fatura.clienteNome}</span>
          <span className="text-[11px] text-muted-foreground">
            {fatura.referencia ?? "—"} · emitida {format(new Date(fatura.dataEmissao), "dd/MM/yyyy", { locale: ptBR })}
            {fatura.dataVencimento ? ` · vence ${format(new Date(fatura.dataVencimento), "dd/MM/yyyy")}` : ""}
          </span>
        </div>
        <button type="button" onClick={onFechar} className="text-[11px] text-muted-foreground hover:text-foreground">
          fechar
        </button>
      </div>

      <div className="flex items-center gap-3">
        <Badge tone={STATUS_TONE[fatura.status]}>{STATUS_LABEL[fatura.status]}</Badge>
        <span className="text-[11px] text-secondary-foreground">
          {formatoMoeda.format(fatura.valor)} · pago {formatoMoeda.format(fatura.pago)} · saldo {formatoMoeda.format(fatura.saldo)}
        </span>
      </div>

      {fatura.saldo > 0 && fatura.status !== "cancelada" && (
        <div className="flex flex-col gap-2 border-t border-hairline pt-3">
          <Button size="sm" variant="outline" className="w-fit" onClick={() => setMostrarPagamento((v) => !v)}>
            {mostrarPagamento ? "Fechar" : "Registrar pagamento"}
          </Button>
          {mostrarPagamento && <FormularioPagamento fatura={fatura} onFeito={() => setMostrarPagamento(false)} />}
        </div>
      )}

      {fatura.planoClienteId && <SecaoPlanoVendido faturaId={fatura.id} />}
    </Card>
  );
}

export function LancamentosTab() {
  const { data: faturas } = useFaturas();
  const [mostrarNovo, setMostrarNovo] = useState(false);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);

  const lista = faturas ?? [];
  const selecionado = lista.find((f) => f.id === selecionadoId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setMostrarNovo((v) => !v)}>
          {mostrarNovo ? "Cancelar" : "+ Novo lançamento"}
        </Button>
      </div>

      {mostrarNovo && <FormularioNovoLancamento onFeito={() => setMostrarNovo(false)} onCancelar={() => setMostrarNovo(false)} />}

      <Card className="flex flex-col overflow-hidden">
        <div className="grid grid-cols-[80px_1.2fr_1fr_0.8fr_0.9fr_0.8fr] gap-2.5 border-b border-hairline px-3.5 py-2.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
          <span>Venc.</span>
          <span>Pessoa</span>
          <span>Referência</span>
          <span>Forma</span>
          <span>Valor</span>
          <span>Situação</span>
        </div>
        {lista.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setSelecionadoId(f.id === selecionadoId ? null : f.id)}
            className={`grid grid-cols-[80px_1.2fr_1fr_0.8fr_0.9fr_0.8fr] gap-2.5 border-b border-hairline px-3.5 py-2.5 text-left text-[11.5px] last:border-b-0 hover:bg-content ${selecionadoId === f.id ? "bg-content" : ""}`}
          >
            <span className="font-mono text-[10.5px] text-muted-foreground">{f.dataVencimento ? format(new Date(f.dataVencimento), "dd/MM") : "—"}</span>
            <span className="font-medium text-foreground">{f.clienteNome}</span>
            <span className="text-secondary-foreground">{f.referencia ?? "—"}</span>
            <span className="text-secondary-foreground">{f.ultimaFormaPagamento ?? "—"}</span>
            <span className="text-secondary-foreground">{formatoMoeda.format(f.valor)}</span>
            <Badge tone={STATUS_TONE[f.status]} className="w-fit">
              {STATUS_LABEL[f.status]}
            </Badge>
          </button>
        ))}
        {lista.length === 0 && <div className="p-6 text-center text-[11.5px] text-muted-foreground">Nenhum lançamento ainda.</div>}
      </Card>

      {selecionado && <DetalheFatura fatura={selecionado} onFechar={() => setSelecionadoId(null)} />}
    </div>
  );
}
