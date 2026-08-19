import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  useAlternarStatusFluxo,
  useApagarFluxo,
  useAvancarFluxo,
  useCriarFluxoExemplo,
  useEventosExecucao,
  useExecucoesFluxo,
  useFluxos,
  useIniciarFluxo,
  useNosFluxo,
} from "./api";

const formatoDataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * Fluxos conversacionais — a máquina de estado por pessoa
 * (`fluxo_execucoes`), distinta das automações determinísticas.
 *
 * O disparo aqui é **manual**, pela UI, e é isso que permite ver o rastro
 * sem depender do webhook da Meta (cuja pendência é da Subetapa 02.5).
 * Iniciar e avançar são funções do banco; a tela só as chama e mostra os
 * eventos que elas gravaram — `fluxo_execucoes` e `fluxo_execucao_eventos`
 * não têm policy de escrita para o usuário final, de propósito.
 */
export function FluxosTab() {
  const { data: fluxos = [], isLoading } = useFluxos();
  const criarExemplo = useCriarFluxoExemplo();
  const alternar = useAlternarStatusFluxo();
  const apagar = useApagarFluxo();
  const iniciar = useIniciarFluxo();
  const avancar = useAvancarFluxo();

  const [fluxoId, setFluxoId] = useState<string | null>(null);
  const [execucaoId, setExecucaoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const { data: nos = [] } = useNosFluxo(fluxoId);
  const { data: execucoes = [] } = useExecucoesFluxo(fluxoId);
  const { data: eventos = [] } = useEventosExecucao(execucaoId);

  const fluxo = fluxos.find((f) => f.id === fluxoId) ?? null;

  async function aoCriar() {
    setErro(null);
    if (!nome.trim()) {
      setErro("Dê um nome ao fluxo.");
      return;
    }
    try {
      const id = await criarExemplo.mutateAsync(nome.trim());
      setNome("");
      setFluxoId(id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível criar o fluxo.");
    }
  }

  async function aoIniciar() {
    setErro(null);
    if (!fluxoId) return;
    try {
      const id = await iniciar.mutateAsync({ fluxoId });
      setExecucaoId(id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível iniciar o fluxo.");
    }
  }

  async function aoAvancar() {
    setErro(null);
    if (!execucaoId) return;
    try {
      await avancar.mutateAsync({ execucaoId });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível avançar a execução.");
    }
  }

  return (
    <div className="grid min-h-0 gap-3 lg:grid-cols-[300px_1fr]">
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <span className="text-[12px] font-medium text-foreground">Fluxos · {fluxos.length}</span>
        </div>
        <div className="flex flex-col gap-1.5 border-b p-3">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do fluxo"
            className="h-8 rounded-md border px-2 text-[11px]"
          />
          <Button size="sm" onClick={() => void aoCriar()} disabled={criarExemplo.isPending}>
            + novo fluxo
          </Button>
          <span className="text-[10px] leading-relaxed text-muted-foreground">
            Nasce com início → mensagem → fim já ligados e ativo. Editor de canvas por nó é escopo reservado
            (`posicao_x`/`posicao_y` da migration 017).
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {isLoading && <span className="block p-3 text-[11px] text-muted-foreground">Carregando…</span>}
          {!isLoading && fluxos.length === 0 && (
            <span className="block p-3 text-[11px] text-muted-foreground">Nenhum fluxo conversacional ainda.</span>
          )}
          {fluxos.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFluxoId(f.id);
                setExecucaoId(null);
              }}
              className={`flex w-full flex-col gap-1 border-b px-3 py-2.5 text-left ${
                fluxoId === f.id ? "bg-content" : "hover:bg-content"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11.5px] font-medium text-foreground">{f.nome}</span>
                <Badge tone={f.status === "ativo" ? "success" : f.status === "rascunho" ? "warning" : "neutral"}>
                  {f.status}
                </Badge>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {f.tipoGatilho} · {f.contadorExecucoes} execução(ões)
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="flex min-h-0 flex-col overflow-hidden">
        {!fluxo && (
          <span className="p-4 text-[11px] text-muted-foreground">
            Escolha um fluxo à esquerda para ver os nós e disparar uma execução.
          </span>
        )}
        {fluxo && (
          <>
            <div className="flex items-center justify-between border-b px-3.5 py-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{fluxo.nome}</span>
                <span className="text-[10.5px] text-muted-foreground">
                  entrada: {fluxo.noEntradaId ?? "não definida"} · {nos.length} nó(s)
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void alternar.mutateAsync({ id: fluxo.id, status: fluxo.status === "ativo" ? "rascunho" : "ativo" })
                  }
                >
                  {fluxo.status === "ativo" ? "Pausar" : "Ativar"}
                </Button>
                <Button size="sm" onClick={() => void aoIniciar()} disabled={iniciar.isPending}>
                  Disparar execução
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void apagar.mutateAsync(fluxo.id);
                    setFluxoId(null);
                  }}
                >
                  Apagar
                </Button>
              </div>
            </div>

            {erro && <span className="px-3.5 pt-2 text-[10.5px] text-destructive">{erro}</span>}

            <div className="grid min-h-0 flex-1 gap-3 overflow-auto p-3.5 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Nós</span>
                {nos.map((n) => (
                  <div key={n.id} className="rounded-md border bg-background p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-primary">{n.chaveNo}</span>
                      <Badge tone="neutral">{n.tipoNo}</Badge>
                    </div>
                    {typeof n.config.texto === "string" && (
                      <span className="mt-1 block text-[10.5px] text-secondary-foreground">{n.config.texto}</span>
                    )}
                    {typeof n.config.proximo === "string" && (
                      <span className="font-mono text-[9.5px] text-muted-foreground">→ {n.config.proximo}</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2">
                <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  Execuções · fluxo_execucoes
                </span>
                {execucoes.length === 0 && (
                  <span className="text-[10.5px] text-muted-foreground">Nenhuma execução ainda.</span>
                )}
                {execucoes.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setExecucaoId(e.id)}
                    className={`flex flex-col gap-0.5 rounded-md border p-2.5 text-left ${
                      execucaoId === e.id ? "border-primary" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[9.5px] text-muted-foreground">
                        {formatoDataHora.format(new Date(e.iniciadoEm))}
                      </span>
                      <Badge tone={e.status === "ativa" ? "warning" : e.status === "concluida" ? "success" : "neutral"}>
                        {e.status}
                      </Badge>
                    </div>
                    <span className="text-[10.5px] text-secondary-foreground">
                      nó atual: {e.noAtualChave ?? "—"}
                      {e.motivoFim ? ` · ${e.motivoFim}` : ""}
                    </span>
                  </button>
                ))}

                {execucaoId && (
                  <>
                    <div className="flex items-center justify-between pt-1">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                        Eventos · fluxo_execucao_eventos
                      </span>
                      <Button size="sm" variant="outline" onClick={() => void aoAvancar()} disabled={avancar.isPending}>
                        Avançar
                      </Button>
                    </div>
                    {eventos.map((ev) => (
                      <div key={ev.id} className="flex items-baseline gap-2 border-b py-1">
                        <span className="font-mono text-[9px] text-muted-foreground">
                          {formatoDataHora.format(new Date(ev.criadoEm))}
                        </span>
                        <span className="text-[10.5px] text-foreground">{ev.tipoEvento}</span>
                        {ev.noChave && <span className="font-mono text-[9.5px] text-muted-foreground">{ev.noChave}</span>}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
