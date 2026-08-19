import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCriarEvolucao, useProfissionais, type Evolucao } from "./api";
import { MAPAS, ehTipoMapa, marcacoesValidas } from "./mapas";

const formatoData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

/**
 * Aba Evoluções da tela `1h`.
 *
 * A regra que a tela materializa: evolução ASSINADA (`travada = true`)
 * não se altera. O banco recusa o `UPDATE` com `23514`
 * (`impedir_alteracao_evolucao_travada`, migration 013) — a tela nem
 * oferece o caminho, e em vez dele oferece o único que existe: adendo em
 * linha nova, referenciando a original por `adendo_de_id`.
 */
export function EvolucoesTab({
  clienteId,
  evolucoes,
  podeEscrever,
  carregando,
}: {
  clienteId: string;
  evolucoes: Evolucao[];
  podeEscrever: boolean;
  carregando: boolean;
}) {
  const { data: profissionais = [] } = useProfissionais();
  const criar = useCriarEvolucao(clienteId);

  const [adendoDe, setAdendoDe] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const porId = new Map(evolucoes.map((e) => [e.id, e]));

  async function gravarAdendo(original: Evolucao) {
    setErro(null);
    if (!texto.trim()) {
      setErro("Escreva o adendo antes de gravar.");
      return;
    }
    try {
      await criar.mutateAsync({
        profissionalId: original.profissionalId,
        avaliacao: texto.trim(),
        notasProcedimento: null,
        resultado: null,
        proximosPassos: null,
        mapaTipo: original.mapaTipo,
        marcacoes: [],
        adendoDeId: original.id,
      });
      setTexto("");
      setAdendoDe(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar o adendo.");
    }
  }

  if (carregando) return <span className="text-[11px] text-muted-foreground">Carregando…</span>;
  if (evolucoes.length === 0) {
    return (
      <span className="text-[11px] text-muted-foreground">
        Nenhuma evolução registrada. Abra uma sessão no painel do mapa para começar.
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {evolucoes.map((e) => {
        const original = e.adendoDeId ? porId.get(e.adendoDeId) : null;
        const marcacoes = ehTipoMapa(e.mapaTipo) ? marcacoesValidas(e.mapaTipo, e.marcacoes) : [];
        return (
          <div key={e.id} className="grid grid-cols-[74px_1fr] gap-3 border-b py-2.5">
            <span className="font-mono text-[10px] text-muted-foreground">
              {formatoData.format(new Date(e.registradoEm))}
            </span>
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {e.travada ? <Badge tone="success">assinada</Badge> : <Badge tone="warning">rascunho</Badge>}
                {e.adendoDeId && <Badge tone="neutral">adendo</Badge>}
                {ehTipoMapa(e.mapaTipo) && <Badge tone="neutral">{MAPAS[e.mapaTipo].rotulo}</Badge>}
                {marcacoes.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">{marcacoes.length} marcação(ões)</span>
                )}
              </div>
              {original && (
                <span className="text-[10px] text-muted-foreground">
                  Complementa a evolução de {formatoData.format(new Date(original.registradoEm))}
                </span>
              )}
              {e.avaliacao && <span className="text-[11.5px] text-foreground">{e.avaliacao}</span>}
              {e.notasProcedimento && (
                <span className="text-[11px] text-secondary-foreground">{e.notasProcedimento}</span>
              )}
              {e.resultado && <span className="text-[11px] text-secondary-foreground">Resultado: {e.resultado}</span>}
              {e.proximosPassos && (
                <span className="text-[11px] text-secondary-foreground">Próximos passos: {e.proximosPassos}</span>
              )}
              {marcacoes.length > 0 && (
                <ul className="flex flex-col gap-0.5">
                  {marcacoes.map((m) => (
                    <li key={m.regiao} className="text-[10.5px] text-muted-foreground">
                      · {m.rotulo}
                      {m.nota ? ` — ${m.nota}` : ""}
                    </li>
                  ))}
                </ul>
              )}

              {podeEscrever && e.travada && adendoDe !== e.id && (
                <button
                  type="button"
                  onClick={() => {
                    setAdendoDe(e.id);
                    setTexto("");
                    setErro(null);
                  }}
                  className="self-start text-[10.5px] text-primary underline-offset-2 hover:underline"
                >
                  Registrar adendo
                </button>
              )}

              {adendoDe === e.id && (
                <div className="flex flex-col gap-1.5 rounded-md border p-2.5">
                  <span className="text-[10px] text-muted-foreground">
                    Evolução assinada não se altera — o adendo entra como linha nova ligada a esta.
                  </span>
                  <textarea
                    value={texto}
                    onChange={(ev) => setTexto(ev.target.value)}
                    rows={3}
                    className="rounded-md border bg-content px-2.5 py-2 text-[11px] leading-relaxed"
                  />
                  {erro && <span className="text-[10.5px] text-destructive">{erro}</span>}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void gravarAdendo(e)} disabled={criar.isPending}>
                      Gravar adendo
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAdendoDe(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {profissionais.length === 0 && (
        <span className="text-[10px] text-muted-foreground">
          Nenhum profissional cadastrado na conta — toda evolução precisa de um responsável.
        </span>
      )}
    </div>
  );
}
