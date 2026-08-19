import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  usePlanos,
  useServicos,
  useCriarPlano,
  useAlternarAtivoPlano,
  useCriarItemPlano,
  useRemoverItemPlano,
  type Plano,
} from "./api";

const formatoMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function FormularioNovoPlano({ onCriado, onCancelar }: { onCriado: (planoId: string) => void; onCancelar: () => void }) {
  const criar = useCriarPlano();
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");
  const [diasValidade, setDiasValidade] = useState("");

  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <span className="text-[12.5px] font-medium text-foreground">Novo plano</span>
      <form
        className="flex flex-wrap items-end gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          criar.mutate(
            { nome, precoTotal: Number(preco.replace(",", ".")) || 0, diasValidade: diasValidade ? Number(diasValidade) : undefined },
            { onSuccess: (planoId) => onCriado(planoId) },
          );
        }}
      >
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-[11px] font-medium text-secondary-foreground">Nome do plano</label>
          <input
            required
            className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Pacote 10 sessões"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-secondary-foreground">Preço total (R$)</label>
          <input
            required
            className="w-32 rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-secondary-foreground">Validade (dias, opcional)</label>
          <input
            className="w-32 rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
            value={diasValidade}
            onChange={(e) => setDiasValidade(e.target.value)}
            inputMode="numeric"
          />
        </div>
        <Button type="submit" size="sm" disabled={criar.isPending}>
          {criar.isPending ? "Criando..." : "Criar plano"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancelar}>
          Cancelar
        </Button>
      </form>
    </Card>
  );
}

function FormularioNovoItem({ planoId }: { planoId: string }) {
  const { data: servicos } = useServicos();
  const criar = useCriarItemPlano();
  const [servicoId, setServicoId] = useState("");
  const [varianteId, setVarianteId] = useState("");
  const [sessoes, setSessoes] = useState(1);

  const servico = (servicos ?? []).find((s) => s.id === servicoId);

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!servicoId) return;
        criar.mutate(
          { planoId, servicoId, varianteId: varianteId || undefined, sessoesIncluidas: sessoes },
          { onSuccess: () => { setServicoId(""); setVarianteId(""); setSessoes(1); } },
        );
      }}
    >
      <select
        required
        className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
        value={servicoId}
        onChange={(e) => { setServicoId(e.target.value); setVarianteId(""); }}
      >
        <option value="" disabled>
          Serviço...
        </option>
        {(servicos ?? []).map((s) => (
          <option key={s.id} value={s.id}>
            {s.nome}
          </option>
        ))}
      </select>
      <select
        className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
        value={varianteId}
        onChange={(e) => setVarianteId(e.target.value)}
        disabled={!servico || servico.variantes.length === 0}
      >
        <option value="">Sem variante</option>
        {(servico?.variantes ?? []).map((v) => (
          <option key={v.id} value={v.id}>
            {v.nome}
          </option>
        ))}
      </select>
      <input
        required
        type="number"
        min={1}
        className="w-24 rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
        value={sessoes}
        onChange={(e) => setSessoes(Number(e.target.value))}
        placeholder="Sessões"
      />
      <Button type="submit" size="sm" disabled={criar.isPending}>
        {criar.isPending ? "Salvando..." : "+ Item"}
      </Button>
    </form>
  );
}

function DetalhePlano({ plano }: { plano: Plano }) {
  const remover = useRemoverItemPlano();

  return (
    <Card className="flex flex-col gap-3 p-4">
      <span className="text-[12.5px] font-medium text-foreground">Itens de {plano.nome}</span>
      <div className="flex flex-col gap-1.5">
        {plano.itens.length === 0 && <span className="text-[11.5px] text-muted-foreground">Nenhum item ainda — adicione ao menos um serviço.</span>}
        {plano.itens.map((i) => (
          <div key={i.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <span className="text-[11.5px] text-foreground">
              {i.servicoNome}
              {i.varianteNome ? ` · ${i.varianteNome}` : ""} · {i.sessoesIncluidas} {i.sessoesIncluidas === 1 ? "sessão" : "sessões"}
            </span>
            <button type="button" className="text-[10.5px] text-destructive hover:underline" onClick={() => remover.mutate(i.id)}>
              remover
            </button>
          </div>
        ))}
      </div>
      <FormularioNovoItem planoId={plano.id} />
    </Card>
  );
}

export function PlanosTab() {
  const { data: planos } = usePlanos();
  const alternarAtivo = useAlternarAtivoPlano();
  const [mostrarNovo, setMostrarNovo] = useState(false);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);

  const lista = planos ?? [];
  const selecionado = lista.find((p) => p.id === selecionadoId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setMostrarNovo((v) => !v)}>
          {mostrarNovo ? "Cancelar" : "+ Novo plano"}
        </Button>
      </div>

      {mostrarNovo && (
        <FormularioNovoPlano
          onCriado={(planoId) => {
            setMostrarNovo(false);
            setSelecionadoId(planoId);
          }}
          onCancelar={() => setMostrarNovo(false)}
        />
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {lista.map((p) => (
          <Card key={p.id} className={`flex cursor-pointer flex-col gap-2 p-3.5 ${selecionadoId === p.id ? "border-primary" : ""}`} onClick={() => setSelecionadoId(p.id === selecionadoId ? null : p.id)}>
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-medium text-foreground">{p.nome}</span>
              <Badge tone={p.ativo ? "success" : "neutral"}>{p.ativo ? "Ativo" : "Inativo"}</Badge>
            </div>
            <span className="text-[15px] font-medium text-foreground">{formatoMoeda.format(p.precoTotal)}</span>
            <span className="text-[10.5px] text-muted-foreground">
              {p.itens.length} item{p.itens.length === 1 ? "" : "s"}
              {p.diasValidade ? ` · validade ${p.diasValidade}d` : ""}
            </span>
            <button
              type="button"
              className="w-fit text-[10.5px] text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                alternarAtivo.mutate({ id: p.id, ativo: !p.ativo });
              }}
            >
              {p.ativo ? "desativar" : "ativar"}
            </button>
          </Card>
        ))}
        {lista.length === 0 && (
          <Card className="p-6 text-center text-[11.5px] text-muted-foreground md:col-span-2">Nenhum plano cadastrado ainda.</Card>
        )}
      </div>

      {selecionado && <DetalhePlano plano={selecionado} />}
    </div>
  );
}
