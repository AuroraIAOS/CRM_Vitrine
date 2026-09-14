import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCategorias, useCriarCategoria, useAlternarAtivoCategoria, useProcedimentos, usePacotes } from "./api";
import { ProcedimentosTab } from "./ProcedimentosTab";
import { PacotesTab } from "./PacotesTab";

function PainelCategorias() {
  const { data: categorias } = useCategorias();
  const criar = useCriarCategoria();
  const alternarAtivo = useAlternarAtivoCategoria();
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("#3d7396");

  return (
    <Card className="flex flex-col gap-3 p-4">
      <span className="text-[12.5px] font-medium text-foreground">Categorias</span>
      <div className="flex flex-col gap-1.5">
        {(categorias ?? []).map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: c.cor }} />
              <span className="text-[11.5px] text-foreground">{c.nome}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={c.ativo ? "success" : "neutral"}>{c.ativo ? "Ativa" : "Inativa"}</Badge>
              <button
                type="button"
                className="text-[10.5px] text-primary hover:underline"
                onClick={() => alternarAtivo.mutate({ id: c.id, ativo: !c.ativo })}
              >
                {c.ativo ? "desativar" : "ativar"}
              </button>
            </div>
          </div>
        ))}
        {(categorias ?? []).length === 0 && <span className="text-[11.5px] text-muted-foreground">Nenhuma categoria ainda.</span>}
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          criar.mutate({ nome, cor }, { onSuccess: () => setNome("") });
        }}
      >
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-[11px] font-medium text-secondary-foreground">Nova categoria</label>
          <input
            required
            className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Estética facial"
          />
        </div>
        <input type="color" className="h-8 w-10 rounded-[5px] border border-input" value={cor} onChange={(e) => setCor(e.target.value)} />
        <Button type="submit" size="sm" disabled={criar.isPending}>
          {criar.isPending ? "Criando..." : "Criar"}
        </Button>
      </form>
    </Card>
  );
}

export function CatalogoPage() {
  const [aba, setAba] = useState<"procedimentos" | "pacotes">("procedimentos");
  const [mostrarCategorias, setMostrarCategorias] = useState(false);
  const { data: procedimentos } = useProcedimentos();
  const { data: planos } = usePacotes();

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAba("procedimentos")}
            className={`rounded-[5px] px-3 py-1.5 text-[11px] font-medium ${aba === "procedimentos" ? "bg-content text-primary" : "text-secondary-foreground"}`}
          >
            Procedimentos · {procedimentos?.length ?? 0}
          </button>
          <button
            type="button"
            onClick={() => setAba("pacotes")}
            className={`rounded-[5px] px-3 py-1.5 text-[11px] font-medium ${aba === "pacotes" ? "bg-content text-primary" : "text-secondary-foreground"}`}
          >
            Pacotes · {planos?.length ?? 0}
          </button>
        </div>
        <Button size="sm" variant="outline" onClick={() => setMostrarCategorias((v) => !v)}>
          {mostrarCategorias ? "Fechar categorias" : "Categorias"}
        </Button>
      </Card>

      {mostrarCategorias && <PainelCategorias />}

      {aba === "procedimentos" ? <ProcedimentosTab /> : <PacotesTab />}
    </div>
  );
}
