import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { assinarUrlRemessa, tamanhoLegivel, useExamesImportados } from "./exames";

const formatoData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Exames do paciente (Subetapa 03.11): só remessas ACEITAS na caixa de
 * entrada. A remessa importada é o próprio exame (decisão de Max,
 * `docs/02` §14.4) — o sha256 é o do arquivo que o laboratório mandou.
 */
export function ExamesTab({ clienteId }: { clienteId: string }) {
  const { data: exames = [], isLoading, error } = useExamesImportados(clienteId);
  const [aviso, setAviso] = useState<string | null>(null);

  async function abrir(caminho: string) {
    const url = await assinarUrlRemessa(caminho);
    if (!url) {
      setAviso("O servidor recusou assinar o acesso a este arquivo.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] text-muted-foreground">
          Exames recebidos de laboratório e aceitos na caixa de entrada.
        </span>
        <Link to="/prontuario/exames" className="text-[11px] text-primary underline-offset-2 hover:underline">
          Caixa de entrada
        </Link>
      </div>
      {isLoading && <span className="text-[11.5px] text-muted-foreground">Carregando…</span>}
      {error && <span className="text-[11.5px] text-destructive">{(error as Error).message}</span>}
      {!isLoading && !error && exames.length === 0 && (
        <span className="text-[11.5px] text-muted-foreground">Nenhum exame aceito para este paciente.</span>
      )}
      <ul className="flex flex-col divide-y">
        {exames.map((e) => (
          <li key={e.remessaId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-[12.5px] text-foreground">
                {e.nomeOriginal ?? "exame"} <span className="text-muted-foreground">· {e.laboratorioNome}</span>
              </span>
              <span className="text-[10.5px] text-muted-foreground">
                {tamanhoLegivel(e.tamanhoBytes)} · recebido {formatoData.format(new Date(e.recebidaEm))} · aceito{" "}
                {formatoData.format(new Date(e.importadaEm))} · sha256 {e.sha256Hex.slice(0, 12)}…
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={() => void abrir(e.arquivoCaminho)}>
              Abrir
            </Button>
          </li>
        ))}
      </ul>
      {aviso && <span className="text-[11px] text-destructive">{aviso}</span>}
    </div>
  );
}
