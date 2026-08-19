import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConhecimentoPanel } from "./ConhecimentoPanel";
import {
  MODELOS,
  ROTULO_PROVEDOR,
  useAtualizarConfiguracaoIA,
  useConfigurarChave,
  useConfiguracaoIA,
  useLogUso,
  useResumoUso,
  useTestarAgente,
  type Provedor,
} from "./api";

const formatoDataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const formatoNumero = new Intl.NumberFormat("pt-BR");

/** Interruptor do wireframe: trilho pill 26×14 (`docs/04` §5.5). */
function Interruptor({
  ligado,
  aoAlternar,
  desabilitado,
}: {
  ligado: boolean;
  aoAlternar?: () => void;
  desabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={desabilitado}
      onClick={aoAlternar}
      className={`relative h-[14px] w-[26px] shrink-0 rounded-full transition-colors ${
        desabilitado ? "cursor-not-allowed opacity-60" : ""
      }`}
      style={{ background: ligado ? "#5b87a8" : "#dde4e8" }}
      aria-pressed={ligado}
    >
      <span
        className="absolute top-[2px] h-[10px] w-[10px] rounded-full bg-white transition-all"
        style={{ left: ligado ? 14 : 2 }}
      />
    </button>
  );
}

function Metrica({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{rotulo}</span>
      <span className="text-[17px] font-medium text-foreground">{valor}</span>
    </div>
  );
}

/**
 * Formulário da chave. A chave **nunca** é lida de volta do banco: a
 * coluna é ilegível para `authenticated` desde a migration 022, e a Edge
 * Function devolve só os quatro últimos caracteres. Por isso o campo
 * nasce sempre vazio — não há o que preencher — e a tela mostra o sufixo
 * ao lado, que é como o operador reconhece qual chave está guardada.
 */
function FormularioChave({ jaConfigurada }: { jaConfigurada: boolean }) {
  const configurar = useConfigurarChave();
  const [provedor, setProvedor] = useState<Provedor>("anthropic");
  const [modelo, setModelo] = useState(MODELOS.anthropic[0].id);
  const [chave, setChave] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sufixo, setSufixo] = useState<string | null>(null);

  const modelosDoProvedor = MODELOS[provedor];

  async function aoSalvar() {
    setErro(null);
    setSufixo(null);
    if (!chave.trim()) {
      setErro("Cole a chave do provedor.");
      return;
    }
    if (!modelo.trim()) {
      setErro("Informe o identificador do modelo.");
      return;
    }
    try {
      const r = await configurar.mutateAsync({ provedor, modelo: modelo.trim(), chaveApi: chave.trim() });
      setSufixo(r.chave_final);
      setChave(""); // não fica em memória do formulário depois de enviada
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar a chave.");
    }
  }

  return (
    <Card className="flex flex-col gap-2.5 p-3.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[12.5px] font-medium text-foreground">
          {jaConfigurada ? "Trocar a chave da conta" : "Conectar a IA desta conta"}
        </span>
        <span className="text-[10.5px] leading-relaxed text-muted-foreground">
          A chave é da sua conta no provedor — este produto não tem chave própria de IA. Ela é verificada, cifrada e
          guardada; nem esta tela nem o banco a devolvem depois.
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] text-secondary-foreground">Provedor</span>
          <select
            value={provedor}
            onChange={(e) => {
              const p = e.target.value as Provedor;
              setProvedor(p);
              setModelo(MODELOS[p][0]?.id ?? "");
            }}
            className="h-8 rounded-md border px-1.5 text-[11px]"
          >
            {(Object.keys(ROTULO_PROVEDOR) as Provedor[]).map((p) => (
              <option key={p} value={p}>
                {ROTULO_PROVEDOR[p]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] text-secondary-foreground">Modelo</span>
          {modelosDoProvedor.length > 0 ? (
            <select
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              className="h-8 rounded-md border px-1.5 text-[11px]"
            >
              {modelosDoProvedor.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.rotulo}
                  {m.nota ? ` — ${m.nota}` : ""}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              placeholder="identificador do modelo (ex.: o da documentação do provedor)"
              className="h-8 rounded-md border px-2 text-[11px]"
            />
          )}
        </label>
      </div>

      {modelosDoProvedor.length === 0 && (
        <span className="text-[10px] leading-relaxed text-muted-foreground">
          Copie o identificador exato da documentação do provedor. Ele não é validado ao salvar — um nome errado só
          aparece no teste do agente, com a mensagem do próprio provedor.
        </span>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] text-secondary-foreground">Chave da API</span>
        <input
          type="password"
          value={chave}
          onChange={(e) => setChave(e.target.value)}
          placeholder="cole aqui a chave da sua conta no provedor"
          autoComplete="off"
          className="h-8 rounded-md border px-2 font-mono text-[11px]"
        />
      </label>

      {erro && <span className="text-[10.5px] text-destructive">{erro}</span>}
      {sufixo && (
        <span className="text-[10.5px] text-success-tint-foreground">
          Chave verificada e guardada cifrada — termina em <span className="font-mono">…{sufixo}</span>
        </span>
      )}

      <Button size="sm" onClick={() => void aoSalvar()} disabled={configurar.isPending}>
        {configurar.isPending ? "Verificando com o provedor…" : "Verificar e guardar"}
      </Button>
    </Card>
  );
}

export function AgentePage() {
  const { data: config, isLoading } = useConfiguracaoIA();
  const { data: resumo } = useResumoUso(30);
  const { data: log = [] } = useLogUso();
  const atualizar = useAtualizarConfiguracaoIA();
  const testar = useTestarAgente();

  const [instrucao, setInstrucao] = useState("");
  const [horario, setHorario] = useState("");
  const [pergunta, setPergunta] = useState("Quanto custa a limpeza de pele?");
  const [resposta, setResposta] = useState<string | null>(null);
  const [detalheTeste, setDetalheTeste] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setInstrucao(config.promptSistema ?? "");
      setHorario(config.horarioAtuacao ?? "");
    }
  }, [config?.id]);

  async function aoTestar() {
    setErro(null);
    setResposta(null);
    setDetalheTeste(null);
    try {
      const r = await testar.mutateAsync(pergunta);
      setResposta(r.texto);
      setDetalheTeste(
        `${r.provedor} · ${r.modelo} · ${r.tokens_prompt} tokens de entrada · ${r.tokens_resposta} de saída · ` +
          `${r.trechos_usados} trecho(s) da base · ${r.log_gravado ? "consumo registrado" : "FALHA ao registrar consumo"}`,
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível falar com o provedor.");
    }
  }

  if (isLoading) return <span className="text-[11px] text-muted-foreground">Carregando…</span>;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* Faixa de métricas do topo (wireframe 1l) */}
      <Card className="flex flex-wrap items-center gap-6 p-3.5">
        <div className="flex items-center gap-2.5">
          <div className="h-[34px] w-[34px] rounded-lg bg-accent" />
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-foreground">Agente de atendimento</span>
            <span className="text-[10.5px] text-muted-foreground">
              chave própria da conta · modelo configurável
            </span>
          </div>
        </div>

        <Metrica rotulo="Chamadas (30 dias)" valor={formatoNumero.format(resumo?.chamadas ?? 0)} />
        <Metrica rotulo="Conversas atendidas" valor={formatoNumero.format(resumo?.conversasUnicas ?? 0)} />
        <Metrica rotulo="Respostas automáticas" valor={formatoNumero.format(resumo?.respostasAutomaticas ?? 0)} />
        <Metrica rotulo="Tokens no período" valor={formatoNumero.format(resumo?.tokensTotal ?? 0)} />

        {config && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-secondary-foreground">{config.ativo ? "Ativo" : "Desativado"}</span>
            <Interruptor
              ligado={config.ativo}
              aoAlternar={() => void atualizar.mutateAsync({ ativo: !config.ativo })}
            />
          </div>
        )}
      </Card>

      {!config && <FormularioChave jaConfigurada={false} />}

      {config && (
        <div className="grid min-h-0 gap-3 lg:grid-cols-2">
          {/* Comportamento */}
          <Card className="flex min-h-0 flex-col gap-3 p-3.5">
            <span className="text-[12.5px] font-medium text-foreground">Comportamento</span>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-secondary-foreground">Instrução do agente</span>
              <textarea
                value={instrucao}
                onChange={(e) => setInstrucao(e.target.value)}
                onBlur={() => void atualizar.mutateAsync({ promptSistema: instrucao })}
                rows={5}
                placeholder="Como o agente deve atender: tom, o que informa, quando transfere para humano."
                className="rounded-md border bg-content px-2.5 py-2 text-[11px] leading-relaxed"
              />
            </label>

            <div className="grid gap-2.5 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-secondary-foreground">Modelo</span>
                <select
                  value={config.modelo}
                  onChange={(e) => void atualizar.mutateAsync({ modelo: e.target.value })}
                  className="h-8 rounded-md border px-1.5 text-[11px]"
                >
                  {MODELOS[config.provedor].length > 0 ? (
                    MODELOS[config.provedor].map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.rotulo}
                      </option>
                    ))
                  ) : (
                    <option value={config.modelo}>{config.modelo}</option>
                  )}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-secondary-foreground">Horário de atuação</span>
                <input
                  value={horario}
                  onChange={(e) => setHorario(e.target.value)}
                  onBlur={() => void atualizar.mutateAsync({ horarioAtuacao: horario })}
                  placeholder="ex.: 24h · humano 08–18h"
                  className="h-8 rounded-md border px-2 text-[11px]"
                />
              </label>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-secondary-foreground">Permissões</span>

              {[
                {
                  chave: "podeConsultarHorarios" as const,
                  rotulo: "Consultar horários livres",
                  ligado: config.podeConsultarHorarios,
                },
                {
                  chave: "podeCriarAgendamento" as const,
                  rotulo: "Criar agendamento",
                  ligado: config.podeCriarAgendamento,
                },
                {
                  chave: "podeConcederDesconto" as const,
                  rotulo: "Conceder desconto",
                  ligado: config.podeConcederDesconto,
                },
              ].map((p) => (
                <div key={p.chave} className="flex items-center justify-between rounded-md bg-content px-2.5 py-2">
                  <span className="text-[10.5px] text-secondary-foreground">{p.rotulo}</span>
                  <Interruptor
                    ligado={p.ligado}
                    aoAlternar={() => void atualizar.mutateAsync({ [p.chave]: !p.ligado })}
                  />
                </div>
              ))}

              {/* Prontuário — travado no banco, não apenas ausente daqui. */}
              <div className="flex items-center justify-between rounded-md bg-content px-2.5 py-2">
                <div className="flex flex-col gap-0.5 pr-3">
                  <span className="text-[10.5px] text-secondary-foreground">Ler prontuário</span>
                  <span className="text-[9.5px] leading-relaxed text-muted-foreground">
                    Bloqueado no banco. O agente lê com privilégio de servidor, que não passa pelo controle de acesso
                    clínico nem gera registro de quem leu — liberar exigiria construir esse caminho auditado antes.
                  </span>
                </div>
                <Interruptor ligado={false} desabilitado />
              </div>
            </div>
          </Card>

          {/* Conhecimento + teste + consumo */}
          <div className="flex min-h-0 flex-col gap-3">
            <ConhecimentoPanel />

            <Card className="flex flex-col gap-2 p-3.5">
              <span className="text-[12.5px] font-medium text-foreground">Testar o agente</span>
              <input
                value={pergunta}
                onChange={(e) => setPergunta(e.target.value)}
                className="h-8 rounded-md border px-2 text-[11px]"
              />
              <Button size="sm" variant="outline" onClick={() => void aoTestar()} disabled={testar.isPending}>
                {testar.isPending ? "Perguntando ao provedor…" : "Perguntar"}
              </Button>
              {erro && <span className="text-[10.5px] text-destructive">{erro}</span>}
              {resposta && (
                <div className="flex flex-col gap-1 rounded-md border bg-content p-2.5">
                  <span className="text-[11px] leading-relaxed text-foreground">{resposta}</span>
                  {detalheTeste && (
                    <span className="font-mono text-[9.5px] text-muted-foreground">{detalheTeste}</span>
                  )}
                </div>
              )}
            </Card>

            <Card className="flex flex-col gap-1.5 p-3.5">
              <span className="text-[12.5px] font-medium text-foreground">Consumo registrado</span>
              {log.length === 0 && (
                <span className="text-[10.5px] text-muted-foreground">
                  Nenhuma chamada ainda — ou seu papel não vê o log de consumo.
                </span>
              )}
              {log.map((l) => (
                <div key={l.id} className="flex items-center justify-between border-b py-1 last:border-b-0">
                  <span className="font-mono text-[9.5px] text-muted-foreground">
                    {formatoDataHora.format(new Date(l.criadoEm))}
                  </span>
                  <span className="text-[10.5px] text-secondary-foreground">
                    {l.modelo} · {formatoNumero.format(l.tokensTotal)} tokens
                  </span>
                  <Badge tone={l.modo === "rascunho" ? "neutral" : "success"}>{l.modo}</Badge>
                </div>
              ))}
            </Card>
          </div>
        </div>
      )}

      {config && <FormularioChave jaConfigurada />}
    </div>
  );
}
