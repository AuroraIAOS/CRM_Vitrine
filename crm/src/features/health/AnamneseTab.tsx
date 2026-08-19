import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  useCriarFormularioAnamnese,
  useFormulariosAnamnese,
  useResponderAnamnese,
  useRespostasAnamnese,
  type PerguntaAnamnese,
} from "./api";

const formatoData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Formulário-semente, oferecido quando a conta ainda não tem nenhum.
 * As perguntas são as que o wireframe `1h` mostra (queixa principal,
 * medicação contínua, alergias) mais as duas etapas que ele nomeia na
 * barra de progresso (hábitos, mapa). Não é dado de paciente — é
 * catálogo da conta, editável depois.
 */
const FORMULARIO_SEMENTE: { nome: string; perguntas: PerguntaAnamnese[] } = {
  nome: "Ficha de anamnese padrão",
  perguntas: [
    { chave: "queixa_principal", rotulo: "Queixa principal", tipo: "texto" },
    { chave: "medicacao_continua", rotulo: "Uso de medicação contínua", tipo: "sim_nao" },
    { chave: "alergias", rotulo: "Alergias e sensibilidades", tipo: "texto" },
    { chave: "historico", rotulo: "Histórico de procedimentos anteriores", tipo: "texto" },
    { chave: "habitos", rotulo: "Hábitos (sono, exposição solar, tabagismo)", tipo: "texto" },
  ],
};

/**
 * Aba Anamnese da tela `1h`.
 *
 * Duas fontes distintas, de propósito: o FORMULÁRIO vem por `select`
 * direto (catálogo da conta, sem `cliente_id`, fora do log — a fronteira
 * está documentada na migration 013), e as RESPOSTAS vêm de
 * `aba_health.ler_respostas_anamnese()`, que loga. Misturar as duas num
 * único caminho seria ou logar catálogo, ou ler resposta sem log.
 */
export function AnamneseTab({ clienteId, podeEscrever }: { clienteId: string; podeEscrever: boolean }) {
  const { data: formularios = [], isLoading: carregandoFormularios } = useFormulariosAnamnese();
  const { data: respostas = [], isLoading: carregandoRespostas } = useRespostasAnamnese(clienteId);
  const criarFormulario = useCriarFormularioAnamnese();
  const responder = useResponderAnamnese(clienteId);

  const formulario = formularios[0] ?? null;
  const [valores, setValores] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);

  const ultimaResposta = useMemo(
    () => respostas.find((r) => r.formularioId === formulario?.id) ?? null,
    [respostas, formulario?.id],
  );

  const preenchidas = formulario ? formulario.perguntas.filter((p) => (valores[p.chave] ?? "").trim()).length : 0;
  const total = formulario?.perguntas.length ?? 0;

  async function aoSalvar() {
    setErro(null);
    if (!formulario) return;
    if (preenchidas === 0) {
      setErro("Responda ao menos uma pergunta antes de salvar.");
      return;
    }
    try {
      await responder.mutateAsync({ formularioId: formulario.id, respostas: valores });
      setValores({});
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar a anamnese.");
    }
  }

  if (carregandoFormularios) return <span className="text-[11px] text-muted-foreground">Carregando…</span>;

  if (!formulario) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-dashed p-4">
        <span className="text-[11.5px] text-secondary-foreground">
          Esta conta ainda não tem formulário de anamnese. O formulário é catálogo da conta — as perguntas são
          configuráveis e valem para todos os clientes.
        </span>
        {podeEscrever && (
          <Button size="sm" onClick={() => void criarFormulario.mutateAsync(FORMULARIO_SEMENTE)} disabled={criarFormulario.isPending}>
            Criar formulário padrão
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Barra de etapas do wireframe — progresso real sobre as perguntas do formulário. */}
      <div className="flex items-center gap-2">
        {formulario.perguntas.map((p, i) => {
          const respondida = (valores[p.chave] ?? "").trim().length > 0;
          return (
            <div key={p.chave} className="flex flex-1 flex-col gap-1">
              <div className={`h-[3px] rounded-sm ${respondida ? "bg-[#5b87a8]" : "bg-[#eef2f4]"}`} />
              <span className="truncate text-[9.5px] text-muted-foreground">
                {i + 1} · {p.rotulo}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2.5">
        {formulario.perguntas.map((p) => (
          <div key={p.chave} className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-secondary-foreground">{p.rotulo}</span>
            {p.tipo === "sim_nao" ? (
              <div className="flex gap-1.5">
                {["Não", "Sim"].map((opcao) => (
                  <button
                    key={opcao}
                    type="button"
                    disabled={!podeEscrever}
                    onClick={() => setValores((v) => ({ ...v, [p.chave]: opcao }))}
                    className={`rounded-md border px-3 py-1.5 text-[10.5px] ${
                      valores[p.chave] === opcao ? "border-primary bg-accent text-primary" : "text-secondary-foreground"
                    }`}
                  >
                    {opcao}
                  </button>
                ))}
              </div>
            ) : (
              <textarea
                value={valores[p.chave] ?? ""}
                disabled={!podeEscrever}
                onChange={(e) => setValores((v) => ({ ...v, [p.chave]: e.target.value }))}
                rows={2}
                className="rounded-md border bg-content px-2.5 py-2 text-[11px] leading-relaxed"
              />
            )}
          </div>
        ))}
      </div>

      {erro && <span className="text-[10.5px] text-destructive">{erro}</span>}

      {podeEscrever && (
        <Button size="sm" onClick={() => void aoSalvar()} disabled={responder.isPending}>
          Gravar anamnese ({preenchidas}/{total})
        </Button>
      )}

      <div className="flex flex-col gap-2 border-t pt-3">
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
          Anamneses gravadas
        </span>
        {carregandoRespostas && <span className="text-[11px] text-muted-foreground">Carregando…</span>}
        {!carregandoRespostas && respostas.length === 0 && (
          <span className="text-[11px] text-muted-foreground">Nenhuma anamnese gravada para este cliente.</span>
        )}
        {respostas.map((r) => (
          <div key={r.id} className="rounded-md border p-2.5">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] text-muted-foreground">
                {formatoData.format(new Date(r.respondidoEm))}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {Object.keys(r.respostas).length} resposta(s)
              </span>
            </div>
            <dl className="mt-1.5 flex flex-col gap-1">
              {Object.entries(r.respostas).map(([chave, valor]) => {
                const pergunta = formulario.perguntas.find((p) => p.chave === chave);
                if (!valor) return null;
                return (
                  <div key={chave} className="flex flex-col">
                    <dt className="text-[10px] text-muted-foreground">{pergunta?.rotulo ?? chave}</dt>
                    <dd className="text-[11px] text-foreground">{valor}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
        {ultimaResposta && (
          <span className="text-[10px] text-muted-foreground">
            Última gravação em {formatoData.format(new Date(ultimaResposta.respondidoEm))} — respostas são versionadas
            por linha nova, nunca sobrescritas.
          </span>
        )}
      </div>
    </div>
  );
}
