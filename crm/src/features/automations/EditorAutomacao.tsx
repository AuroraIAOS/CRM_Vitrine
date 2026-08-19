import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CORES_FAMILIA,
  TIPOS_ETAPA,
  TIPOS_GATILHO,
  definicaoEtapa,
  useAdicionarEtapa,
  useEtapas,
  useExecutarAutomacao,
  useLogsAutomacao,
  useRemoverEtapa,
  type Automacao,
  type Etapa,
} from "./api";

const formatoDataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Editor de passos da tela `1k`: cards conectados verticalmente, com a
 * borda esquerda de 3px colorida por família (Gatilho azul / Condição
 * sage / Ação tan, `docs/04_DESIGN_E_MARCA.md` §5.5).
 *
 * O card de Gatilho não é uma etapa: é a própria automação
 * (`automacoes.tipo_gatilho`). Por isso ele abre a lista, não pode ser
 * removido, e não aparece no seletor de "+ adicionar passo".
 */
function CardEtapa({
  familia,
  eyebrow,
  titulo,
  detalhe,
  aviso,
  aoRemover,
}: {
  familia: keyof typeof CORES_FAMILIA;
  eyebrow: string;
  titulo: string;
  detalhe?: string;
  aviso?: string;
  aoRemover?: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border bg-background p-3"
      style={{ borderLeft: `3px solid ${CORES_FAMILIA[familia]}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{eyebrow}</span>
        {aoRemover && (
          <button
            type="button"
            onClick={aoRemover}
            className="text-[10px] text-muted-foreground hover:text-destructive"
          >
            remover
          </button>
        )}
      </div>
      <span className="text-[12px] font-medium text-foreground">{titulo}</span>
      {detalhe && <span className="text-[10.5px] text-muted-foreground">{detalhe}</span>}
      {aviso && (
        <span className="rounded bg-warning-tint px-2 py-1 text-[10px] text-warning-tint-foreground">{aviso}</span>
      )}
    </div>
  );
}

function Conector() {
  return <div className="mx-auto h-3 w-px bg-border" />;
}

export function EditorAutomacao({ automacao }: { automacao: Automacao }) {
  const { data: etapas = [], isLoading } = useEtapas(automacao.id);
  const { data: logs = [] } = useLogsAutomacao(automacao.id);
  const adicionar = useAdicionarEtapa(automacao.id);
  const remover = useRemoverEtapa(automacao.id);
  const executar = useExecutarAutomacao();

  const [adicionando, setAdicionando] = useState(false);
  const [tipoNovo, setTipoNovo] = useState(TIPOS_ETAPA[0].chave);
  const [valorConfig, setValorConfig] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ultimoLog, setUltimoLog] = useState<string | null>(null);

  const gatilho = TIPOS_GATILHO.find((g) => g.chave === automacao.tipoGatilho);
  // Só as etapas de raiz na lista principal — as de ramo aparecem
  // aninhadas sob a condição que as governa.
  const raiz = etapas.filter((e) => e.etapaPaiId === null);

  function configPara(tipo: string): Record<string, string> {
    switch (tipo) {
      case "definir_tag":
        return { tag: valorConfig || "automação" };
      case "esperar":
        return { minutos: valorConfig || "60" };
      case "notificar_equipe":
        return { titulo: valorConfig || "Automação executada" };
      case "enviar_whatsapp":
        return { modelo: valorConfig || "lembrete_sessao" };
      case "condicao":
        return { campo: "origem", igual_a: valorConfig || "whatsapp" };
      default:
        return {};
    }
  }

  async function aoAdicionar() {
    setErro(null);
    try {
      await adicionar.mutateAsync({
        tipoEtapa: tipoNovo,
        configEtapa: configPara(tipoNovo),
        posicao: raiz.length,
      });
      setValorConfig("");
      setAdicionando(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível adicionar o passo.");
    }
  }

  async function aoTestar() {
    setErro(null);
    setUltimoLog(null);
    try {
      const logId = await executar.mutateAsync({ automacaoId: automacao.id, contexto: { origem: "whatsapp" } });
      setUltimoLog(logId);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível executar a automação.");
    }
  }

  function etapasDoRamo(paiId: string, ramo: "sim" | "nao"): Etapa[] {
    return etapas.filter((e) => e.etapaPaiId === paiId && e.ramo === ramo);
  }

  const totalExecucoes = automacao.contadorExecucoes;
  const falhas = logs.filter((l) => l.status === "falhou").length;
  const parciais = logs.filter((l) => l.status === "parcial").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b px-3.5 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium text-foreground">{automacao.nome}</span>
          <span className="text-[10.5px] text-muted-foreground">
            {automacao.executadoEm
              ? `última execução ${formatoDataHora.format(new Date(automacao.executadoEm))}`
              : "nunca executada"}
            {" · "}
            {totalExecucoes} execução(ões)
          </span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void aoTestar()} disabled={executar.isPending}>
            {executar.isPending ? "Executando…" : "Testar"}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto bg-[#fbfcfd] p-4">
        {/* Gatilho — é a automação, não uma etapa */}
        <CardEtapa
          familia="gatilho"
          eyebrow="Gatilho"
          titulo={gatilho?.rotulo ?? automacao.tipoGatilho}
          detalhe={gatilho?.detalhe}
        />

        {isLoading && <span className="text-[11px] text-muted-foreground">Carregando passos…</span>}

        {raiz.map((etapa) => {
          const def = definicaoEtapa(etapa.tipoEtapa);
          const ramos = etapa.tipoEtapa === "condicao";
          return (
            <div key={etapa.id} className="flex flex-col">
              <Conector />
              <CardEtapa
                familia={def?.familia ?? "acao"}
                eyebrow={def?.familia === "condicao" ? "Condição" : "Ação"}
                titulo={def?.rotulo ?? etapa.tipoEtapa}
                detalhe={
                  Object.entries(etapa.configEtapa)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ") || def?.descricao
                }
                aviso={def && !def.executaDeVerdade ? def.descricao : undefined}
                aoRemover={() => void remover.mutateAsync(etapa.id)}
              />
              {ramos && (
                <div className="mt-2 grid gap-2 pl-6 md:grid-cols-2">
                  {(["sim", "nao"] as const).map((ramo) => (
                    <div key={ramo} className="flex flex-col gap-1.5 rounded-md border border-dashed p-2.5">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                        ramo {ramo}
                      </span>
                      {etapasDoRamo(etapa.id, ramo).length === 0 && (
                        <span className="text-[10px] text-muted-foreground">sem passos</span>
                      )}
                      {etapasDoRamo(etapa.id, ramo).map((sub) => {
                        const subDef = definicaoEtapa(sub.tipoEtapa);
                        return (
                          <div
                            key={sub.id}
                            className="rounded border bg-background px-2 py-1.5 text-[10.5px] text-secondary-foreground"
                            style={{ borderLeft: `3px solid ${CORES_FAMILIA[subDef?.familia ?? "acao"]}` }}
                          >
                            {subDef?.rotulo ?? sub.tipoEtapa}
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() =>
                          void adicionar.mutateAsync({
                            tipoEtapa: "notificar_equipe",
                            configEtapa: { titulo: `Ramo ${ramo} da condição` },
                            etapaPaiId: etapa.id,
                            ramo,
                            posicao: etapasDoRamo(etapa.id, ramo).length,
                          })
                        }
                        className="self-start text-[10px] text-primary underline-offset-2 hover:underline"
                      >
                        + passo neste ramo
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <Conector />

        {adicionando ? (
          <div className="flex flex-col gap-2 rounded-md border p-3">
            <select
              value={tipoNovo}
              onChange={(e) => setTipoNovo(e.target.value)}
              className="h-8 rounded-md border px-1.5 text-[11px]"
            >
              {TIPOS_ETAPA.map((t) => (
                <option key={t.chave} value={t.chave}>
                  {t.rotulo} — {t.descricao}
                </option>
              ))}
            </select>
            <input
              value={valorConfig}
              onChange={(e) => setValorConfig(e.target.value)}
              placeholder={
                tipoNovo === "esperar"
                  ? "minutos de espera (padrão 60)"
                  : tipoNovo === "definir_tag"
                    ? "nome da tag"
                    : tipoNovo === "condicao"
                      ? "origem esperada (ex.: whatsapp)"
                      : "título / modelo"
              }
              className="h-8 rounded-md border px-2 text-[11px]"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void aoAdicionar()} disabled={adicionar.isPending}>
                Adicionar passo
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdicionando(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdicionando(true)}
            className="rounded-md border border-dashed p-3 text-center text-[10.5px] text-muted-foreground hover:text-foreground"
          >
            + adicionar passo (esperar · condição · aplicar tag · notificar equipe · enviar WhatsApp)
          </button>
        )}
      </div>

      {erro && <span className="px-3.5 py-1 text-[10.5px] text-destructive">{erro}</span>}

      <div className="flex flex-wrap items-center gap-4 border-t px-3.5 py-2.5">
        <span className="text-[10.5px] text-muted-foreground">Execuções {totalExecucoes}</span>
        <span className="text-[10.5px] text-muted-foreground">Pausadas em espera {parciais}</span>
        <span className={`text-[10.5px] ${falhas > 0 ? "text-destructive" : "text-muted-foreground"}`}>
          Falhas {falhas}
        </span>
        {ultimoLog && <Badge tone="success">execução registrada</Badge>}
      </div>

      {logs.length > 0 && (
        <div className="max-h-[180px] overflow-auto border-t px-3.5 py-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            Log de execução
          </span>
          {logs.map((l) => (
            <div key={l.id} className="mt-1.5 flex flex-col gap-0.5 border-b pb-1.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9.5px] text-muted-foreground">
                  {formatoDataHora.format(new Date(l.criadoEm))}
                </span>
                <Badge tone={l.status === "sucesso" ? "success" : l.status === "parcial" ? "warning" : "danger"}>
                  {l.status}
                </Badge>
                <span className="text-[10px] text-muted-foreground">{l.eventoGatilho}</span>
              </div>
              {l.etapasExecutadas.map((etapa, i) => (
                <span key={i} className="pl-2 text-[10px] text-muted-foreground">
                  · {etapa.tipo_etapa} → {etapa.resultado}
                  {etapa.resultado === "nao_executado" && typeof etapa.detalhe?.motivo === "string"
                    ? ` (${etapa.detalhe.motivo})`
                    : ""}
                </span>
              ))}
              {l.mensagemErro && <span className="pl-2 text-[10px] text-muted-foreground">{l.mensagemErro}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
