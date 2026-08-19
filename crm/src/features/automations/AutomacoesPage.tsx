import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EditorAutomacao } from "./EditorAutomacao";
import { FluxosTab } from "./FluxosTab";
import {
  TIPOS_GATILHO,
  useAlternarAutomacao,
  useApagarAutomacao,
  useAutomacoes,
  useCriarAutomacao,
  useExecucoesPendentes,
  useJobsCron,
} from "./api";

const formatoDataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Painel do agendador — a metade da Subetapa 02.10 que não é tela, e sim
 * motor. `pg_cron` substitui o pinger externo que o CRM Maximus precisava
 * (`docs/01_ARQUITETURA.md` §2), e a razão de o painel existir é que
 * rotina de banco sem agendador **falha em silêncio**: o sintoma é
 * ausência de comportamento, que não gera erro, não aparece em teste e
 * não acusa em advisor. Aqui ela aparece.
 *
 * Só `admin+` recebe linhas — a própria função no banco devolve conjunto
 * vazio para os demais, e a tela não repete a checagem de papel.
 */
function PainelAgendador() {
  const { data: jobs = [], isLoading } = useJobsCron();
  const { data: pendentes = [] } = useExecucoesPendentes();

  if (isLoading) return null;
  if (jobs.length === 0) return null;

  return (
    <Card className="flex flex-col gap-2 p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-foreground">Agendador · pg_cron</span>
        <span className="text-[10px] text-muted-foreground">
          {pendentes.length > 0 ? `${pendentes.length} execução(ões) na fila de espera` : "fila de espera vazia"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left">
          <thead>
            <tr className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              <th className="py-1 pr-3 font-normal">Job</th>
              <th className="py-1 pr-3 font-normal">Agenda</th>
              <th className="py-1 pr-3 font-normal">Última corrida</th>
              <th className="py-1 font-normal">Estado</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.jobid} className="border-t">
                <td className="py-1.5 pr-3 text-[11px] text-foreground">{j.jobname}</td>
                <td className="py-1.5 pr-3 font-mono text-[10px] text-muted-foreground">{j.schedule}</td>
                <td className="py-1.5 pr-3 font-mono text-[10px] text-muted-foreground">
                  {j.ultimaExecucao ? formatoDataHora.format(new Date(j.ultimaExecucao)) : "ainda não rodou"}
                </td>
                <td className="py-1.5">
                  <Badge tone={j.ultimoStatus === "succeeded" ? "success" : j.ultimoStatus ? "danger" : "neutral"}>
                    {j.ultimoStatus ?? (j.active ? "agendado" : "inativo")}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="text-[10px] leading-relaxed text-muted-foreground">
        Execução agendada por pg_cron, dentro do próprio banco — sem serviço externo. O schema `cron` não é exposto à
        API: esta lista vem de uma função de leitura restrita a admin+.
      </span>
    </Card>
  );
}

export function AutomacoesPage() {
  const { data: automacoes = [], isLoading } = useAutomacoes();
  const criar = useCriarAutomacao();
  const alternar = useAlternarAutomacao();
  const apagar = useApagarAutomacao();

  const [aba, setAba] = useState<"automacoes" | "fluxos">("automacoes");
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [gatilho, setGatilho] = useState(TIPOS_GATILHO[0].chave);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!selecionada && automacoes.length) setSelecionada(automacoes[0].id);
  }, [automacoes, selecionada]);

  const automacao = automacoes.find((a) => a.id === selecionada) ?? null;

  async function aoCriar() {
    setErro(null);
    if (!nome.trim()) {
      setErro("Dê um nome à automação.");
      return;
    }
    try {
      const id = await criar.mutateAsync({ nome: nome.trim(), tipoGatilho: gatilho });
      setNome("");
      setCriando(false);
      setSelecionada(id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível criar a automação.");
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex gap-1 border-b">
        {(
          [
            { chave: "automacoes", rotulo: "Automações" },
            { chave: "fluxos", rotulo: "Fluxos conversacionais" },
          ] as const
        ).map((a) => (
          <button
            key={a.chave}
            type="button"
            onClick={() => setAba(a.chave)}
            className={`px-3 py-2 text-[11.5px] ${
              aba === a.chave
                ? "border-b-2 border-primary font-semibold text-primary"
                : "text-secondary-foreground hover:text-foreground"
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {aba === "fluxos" ? (
        <FluxosTab />
      ) : (
        <div className="grid min-h-0 gap-3 lg:grid-cols-[300px_1fr]">
          {/* Lista de automações */}
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b px-3 py-2.5">
              <span className="text-[12px] font-medium text-foreground">Automações · {automacoes.length}</span>
              <button
                type="button"
                onClick={() => setCriando((v) => !v)}
                className="text-[10.5px] text-primary underline-offset-2 hover:underline"
              >
                {criando ? "cancelar" : "+ nova"}
              </button>
            </div>

            {criando && (
              <div className="flex flex-col gap-1.5 border-b p-3">
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Nome da automação"
                  className="h-8 rounded-md border px-2 text-[11px]"
                />
                <select
                  value={gatilho}
                  onChange={(e) => setGatilho(e.target.value)}
                  className="h-8 rounded-md border px-1.5 text-[11px]"
                >
                  {TIPOS_GATILHO.map((g) => (
                    <option key={g.chave} value={g.chave}>
                      {g.rotulo}
                    </option>
                  ))}
                </select>
                {erro && <span className="text-[10.5px] text-destructive">{erro}</span>}
                <Button size="sm" onClick={() => void aoCriar()} disabled={criar.isPending}>
                  Criar
                </Button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto">
              {isLoading && <span className="block p-3 text-[11px] text-muted-foreground">Carregando…</span>}
              {!isLoading && automacoes.length === 0 && (
                <span className="block p-3 text-[11px] leading-relaxed text-muted-foreground">
                  Nenhuma automação nesta conta. Crie a primeira — o agendador já está de pé e vai executá-la.
                </span>
              )}
              {automacoes.map((a) => (
                <div
                  key={a.id}
                  className={`flex flex-col gap-1 border-b px-3 py-2.5 ${selecionada === a.id ? "bg-content" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelecionada(a.id)}
                      className="flex-1 text-left text-[11.5px] font-medium text-foreground"
                    >
                      {a.nome}
                    </button>
                    {/* Toggle switch do wireframe: trilho pill 26×14 (docs/04 §5.5) */}
                    <button
                      type="button"
                      aria-label={a.ativo ? "Desativar automação" : "Ativar automação"}
                      onClick={() => void alternar.mutateAsync({ id: a.id, ativo: !a.ativo })}
                      className="relative h-[14px] w-[26px] rounded-full transition-colors"
                      style={{ background: a.ativo ? "#5b87a8" : "#dde4e8" }}
                    >
                      <span
                        className="absolute top-[2px] h-[10px] w-[10px] rounded-full bg-white transition-all"
                        style={{ left: a.ativo ? 14 : 2 }}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      {TIPOS_GATILHO.find((g) => g.chave === a.tipoGatilho)?.rotulo ?? a.tipoGatilho} ·{" "}
                      {a.contadorExecucoes} execuções
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void apagar.mutateAsync(a.id);
                        if (selecionada === a.id) setSelecionada(null);
                      }}
                      className="text-[10px] text-muted-foreground hover:text-destructive"
                    >
                      apagar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t bg-[#fbfcfd] p-3">
              <span className="text-[10px] leading-relaxed text-muted-foreground">
                execução agendada por pg_cron — sem serviço externo
              </span>
            </div>
          </Card>

          {/* Editor */}
          <Card className="flex min-h-0 flex-col overflow-hidden">
            {automacao ? (
              <EditorAutomacao automacao={automacao} />
            ) : (
              <span className="p-4 text-[11px] text-muted-foreground">
                Escolha uma automação à esquerda, ou crie a primeira.
              </span>
            )}
          </Card>
        </div>
      )}

      <PainelAgendador />
    </div>
  );
}
