import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LegendaMapa, MapaClinico } from "./MapaClinico";
import { AnamneseTab } from "./AnamneseTab";
import { EvolucoesTab } from "./EvolucoesTab";
import { AnexosTab } from "./AnexosTab";
import { ConsentimentosTab } from "./ConsentimentosTab";
import { ConcessoesPanel } from "./ConcessoesPanel";
import {
  useAssinarEvolucao,
  useAtualizarEvolucao,
  useClientesDaConta,
  useCriarEvolucao,
  useEvolucoes,
  useLogAcesso,
  usePodeAcessarClinico,
  useProfissionais,
  useProntuario,
  useSalvarProntuario,
  type ProntuarioEditavel,
} from "./api";
import { LISTA_MAPAS, MAPAS, ehTipoMapa, marcacoesValidas, type Marcacao, type TipoMapa } from "./mapas";

const formatoData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const formatoDataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const ABAS = [
  { chave: "anamnese", rotulo: "Anamnese" },
  { chave: "evolucoes", rotulo: "Evoluções" },
  { chave: "anexos", rotulo: "Anexos" },
  { chave: "consentimentos", rotulo: "Consentimentos" },
] as const;

type ChaveAba = (typeof ABAS)[number]["chave"];

// ============================================================
// Seleção de cliente — o prontuário é sempre DE alguém
// ============================================================
function SelecionarCliente() {
  const { data: clientes = [], isLoading } = useClientesDaConta();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-[15px] font-medium text-foreground">Prontuário</h1>
          <span className="text-[11.5px] text-muted-foreground">
            Escolha o cliente. Cada abertura de prontuário grava uma linha em <code>aba_health.log_acesso</code>.
          </span>
        </div>
        <Link to="/prontuario/mapas" className="text-[11px] text-primary underline-offset-2 hover:underline">
          Biblioteca de mapas clínicos
        </Link>
      </div>

      <Card className="flex flex-col divide-y">
        {isLoading && <span className="p-4 text-[11px] text-muted-foreground">Carregando…</span>}
        {!isLoading && clientes.length === 0 && (
          <span className="p-4 text-[11px] text-muted-foreground">
            Nenhum cliente cadastrado nesta conta. Cadastre em Pessoas antes de abrir um prontuário.
          </span>
        )}
        {clientes.map((c) => (
          <Link
            key={c.id}
            to={`/prontuario/${c.id}`}
            className="flex items-center justify-between px-4 py-2.5 text-[11.5px] text-foreground hover:bg-content"
          >
            <span>{c.nome}</span>
            <span className="text-[10.5px] text-muted-foreground">abrir prontuário →</span>
          </Link>
        ))}
      </Card>

      <ConcessoesPanel />
    </div>
  );
}

// ============================================================
// Ficha clínica (`aba_health.prontuarios`)
// ============================================================
function FichaClinica({
  clienteId,
  podeEscrever,
  aoFechar,
}: {
  clienteId: string;
  podeEscrever: boolean;
  aoFechar: () => void;
}) {
  const { data: prontuario } = useProntuario(clienteId);
  const salvar = useSalvarProntuario(clienteId);
  const [valores, setValores] = useState<ProntuarioEditavel>({
    tipoPele: null,
    medicamentos: null,
    alergias: null,
    restricoes: null,
    gestante: null,
    amamentando: null,
    condicoesCronicas: null,
    observacoesGerais: null,
  });
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (prontuario) {
      const { id: _id, clienteId: _clienteId, ...resto } = prontuario;
      setValores(resto);
    }
  }, [prontuario]);

  const campos: { chave: keyof ProntuarioEditavel; rotulo: string }[] = [
    { chave: "tipoPele", rotulo: "Tipo de pele" },
    { chave: "medicamentos", rotulo: "Medicamentos em uso" },
    { chave: "alergias", rotulo: "Alergias" },
    { chave: "restricoes", rotulo: "Restrições" },
    { chave: "condicoesCronicas", rotulo: "Condições crônicas" },
    { chave: "observacoesGerais", rotulo: "Observações gerais" },
  ];

  async function aoSalvar() {
    setErro(null);
    try {
      await salvar.mutateAsync({ id: prontuario?.id, valores });
      aoFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar a ficha clínica.");
    }
  }

  return (
    <div className="flex flex-col gap-2.5 border-b bg-content px-3.5 py-3">
      <div className="grid grid-cols-2 gap-2.5">
        {campos.map((campo) => (
          <div key={campo.chave} className="flex flex-col gap-1">
            <span className="text-[10.5px] font-medium text-secondary-foreground">{campo.rotulo}</span>
            <input
              value={(valores[campo.chave] as string | null) ?? ""}
              disabled={!podeEscrever}
              onChange={(e) =>
                setValores((v) => ({ ...v, [campo.chave]: e.target.value === "" ? null : e.target.value }))
              }
              className="h-8 rounded-md border bg-background px-2 text-[11px]"
            />
          </div>
        ))}
        <div className="col-span-2 flex gap-4">
          {(["gestante", "amamentando"] as const).map((chave) => (
            <label key={chave} className="flex items-center gap-1.5 text-[10.5px] text-secondary-foreground">
              <input
                type="checkbox"
                checked={valores[chave] === true}
                disabled={!podeEscrever}
                onChange={(e) => setValores((v) => ({ ...v, [chave]: e.target.checked }))}
              />
              {chave === "gestante" ? "Gestante" : "Amamentando"}
            </label>
          ))}
        </div>
      </div>
      {erro && <span className="text-[10.5px] text-destructive">{erro}</span>}
      <div className="flex gap-2">
        {podeEscrever && (
          <Button size="sm" onClick={() => void aoSalvar()} disabled={salvar.isPending}>
            Gravar ficha clínica
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={aoFechar}>
          Fechar
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Tela `1h`
// ============================================================
export function ProntuarioPage() {
  const { clienteId } = useParams<{ clienteId: string }>();
  if (!clienteId) return <SelecionarCliente />;
  return <ProntuarioDoCliente key={clienteId} clienteId={clienteId} />;
}

function ProntuarioDoCliente({ clienteId }: { clienteId: string }) {
  const { data: clientes = [] } = useClientesDaConta();
  const { data: podeLer, isLoading: verificando } = usePodeAcessarClinico(clienteId, "leitura");
  const { data: podeCriar } = usePodeAcessarClinico(clienteId, "criacao");
  const { data: podeAtualizar } = usePodeAcessarClinico(clienteId, "atualizacao");
  const { data: prontuario } = useProntuario(clienteId);
  const { data: evolucoes = [], isLoading: carregandoEvolucoes } = useEvolucoes(clienteId);
  const { data: profissionais = [] } = useProfissionais();
  const { data: log = [] } = useLogAcesso(clienteId);

  const criarEvolucao = useCriarEvolucao(clienteId);
  const atualizarEvolucao = useAtualizarEvolucao(clienteId);
  const assinarEvolucao = useAssinarEvolucao(clienteId);

  const [aba, setAba] = useState<ChaveAba>("anamnese");
  const [mapaAtivo, setMapaAtivo] = useState<TipoMapa>("facial");
  const [regiaoSelecionada, setRegiaoSelecionada] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Marcacao[] | null>(null);
  const [nota, setNota] = useState("");
  const [profissionalId, setProfissionalId] = useState<string>("");
  const [fichaAberta, setFichaAberta] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cliente = clientes.find((c) => c.id === clienteId);
  const sessaoAberta = useMemo(() => evolucoes.find((e) => !e.travada) ?? null, [evolucoes]);
  const sessoesAnteriores = useMemo(() => evolucoes.filter((e) => e.travada).slice(0, 3), [evolucoes]);

  // O mapa da sessão aberta manda no seletor: reabrir a tela não pode
  // trocar em silêncio o mapa em que as marcações foram feitas.
  useEffect(() => {
    if (sessaoAberta && ehTipoMapa(sessaoAberta.mapaTipo)) setMapaAtivo(sessaoAberta.mapaTipo);
  }, [sessaoAberta?.id, sessaoAberta?.mapaTipo]);

  useEffect(() => {
    if (profissionais.length && !profissionalId) setProfissionalId(profissionais[0].id);
  }, [profissionais, profissionalId]);

  /**
   * Com sessão aberta, o mapa mostra a sessão em curso. Sem sessão
   * aberta, mostra a ÚLTIMA SESSÃO ASSINADA daquele mapa, em leitura —
   * o wireframe `1p` promete "histórico comparável entre sessões", e um
   * mapa que esvazia assim que a sessão é assinada quebra exatamente
   * isso: na sessão seguinte a profissional não veria o que marcou na
   * anterior. Achado da evidência da Subetapa 02.9.
   */
  const evolucaoExibida = useMemo(
    () => sessaoAberta ?? evolucoes.find((e) => e.travada && e.mapaTipo === mapaAtivo) ?? null,
    [sessaoAberta, evolucoes, mapaAtivo],
  );
  const marcacoesPersistidas = useMemo(
    () => (evolucaoExibida ? marcacoesValidas(mapaAtivo, evolucaoExibida.marcacoes) : []),
    [evolucaoExibida, mapaAtivo],
  );
  const marcacoes = rascunho ?? marcacoesPersistidas;
  const sujo = rascunho !== null;

  if (verificando) {
    return <span className="text-[11px] text-muted-foreground">Verificando autorização…</span>;
  }

  // ============================================================
  // Cenário negado — recusa legível, sem revelar conteúdo nenhum
  // ============================================================
  if (!podeLer) {
    return (
      <div className="flex flex-col gap-3">
        {/* Sem link de retorno próprio: o caminho do AppShell já leva de volta. */}
        <Card className="flex flex-col gap-2.5 p-5">
          <span className="text-[13px] font-medium text-foreground">Acesso ao prontuário não autorizado</span>
          <p className="max-w-[62ch] text-[11.5px] leading-relaxed text-secondary-foreground">
            O prontuário deste cliente não está liberado para o seu usuário. Em <code>aba_health</code> não basta ser
            membro da conta: é preciso o atributo profissional ativo com funcionário ativo por trás, mais permissão do
            módulo Prontuário — ou uma concessão nominal registrada pelo proprietário da conta.
          </p>
          <p className="max-w-[62ch] text-[11px] leading-relaxed text-muted-foreground">
            Peça ao proprietário da conta uma concessão para este cliente. Nenhum dado clínico foi carregado nesta tela,
            e nenhuma leitura foi registrada em <code>log_acesso</code> — não houve leitura.
          </p>
        </Card>
      </div>
    );
  }

  const podeEscrever = podeCriar === true || podeAtualizar === true;

  async function abrirSessao() {
    setErro(null);
    if (!profissionalId) {
      setErro("Cadastre um profissional na conta antes de abrir uma sessão — toda evolução tem responsável.");
      return;
    }
    try {
      await criarEvolucao.mutateAsync({
        profissionalId,
        avaliacao: null,
        notasProcedimento: null,
        resultado: null,
        proximosPassos: null,
        mapaTipo: mapaAtivo,
        marcacoes: [],
      });
      setRascunho(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir a sessão.");
    }
  }

  function aplicarEstado(estadoChave: string) {
    if (!regiaoSelecionada) return;
    const regiao = MAPAS[mapaAtivo].regioes.find((r) => r.chave === regiaoSelecionada);
    if (!regiao) return;
    const atuais = marcacoes.filter((m) => m.regiao !== regiaoSelecionada);
    setRascunho([...atuais, { regiao: regiao.chave, rotulo: regiao.rotulo, estado: estadoChave, nota: nota.trim() }]);
    setRegiaoSelecionada(null);
    setNota("");
  }

  function removerMarcacao(regiaoChave: string) {
    setRascunho(marcacoes.filter((m) => m.regiao !== regiaoChave));
  }

  async function salvarRascunho() {
    setErro(null);
    if (!sessaoAberta) return;
    try {
      await atualizarEvolucao.mutateAsync({ id: sessaoAberta.id, mapaTipo: mapaAtivo, marcacoes });
      setRascunho(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar as marcações.");
    }
  }

  async function assinarSessao() {
    setErro(null);
    if (!sessaoAberta) return;
    try {
      if (sujo) {
        await atualizarEvolucao.mutateAsync({ id: sessaoAberta.id, mapaTipo: mapaAtivo, marcacoes });
      }
      await assinarEvolucao.mutateAsync(sessaoAberta.id);
      setRascunho(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível assinar a sessão.");
    }
  }

  const alergias = prontuario?.alergias?.trim();

  return (
    // Altura explícita, não `h-full`: dentro do `main` do AppShell (que é
    // `flex-1 overflow-auto p-4`) um filho com `h-full` não tem altura de
    // referência resolvida e cresce além da viewport sem gerar rolagem
    // utilizável — armadilha medida na Subetapa 02.5 e registrada em
    // `handoffs/instrucoes.md` §5. É isto que faz as quatro abas terem o
    // MESMO tamanho: a caixa é fixa e o conteúdo rola por dentro, em vez de
    // a página inteira esticar conforme a aba escolhida.
    <div className="flex h-[calc(100vh-8.5rem)] min-h-0 flex-col gap-3">
      <div className="flex items-center justify-end">
        {/* O retorno ao Prontuário é trabalho do caminho, no AppShell —
            havia um "← Prontuário" aqui fazendo a mesma coisa. */}
        <Link to="/prontuario/mapas" className="text-[11px] text-primary underline-offset-2 hover:underline">
          Biblioteca de mapas clínicos
        </Link>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1.35fr_1fr]">
        {/* ---------- Coluna esquerda: paciente + mapa ---------- */}
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <div className="h-[30px] w-[30px] rounded-full bg-accent" />
              <div className="flex flex-col">
                <span className="text-[12.5px] font-medium text-foreground">{cliente?.nome ?? "Cliente"}</span>
                <button
                  type="button"
                  onClick={() => setFichaAberta((v) => !v)}
                  className="self-start text-[10.5px] text-primary underline-offset-2 hover:underline"
                >
                  {fichaAberta ? "Fechar ficha clínica" : "Ficha clínica"}
                </button>
              </div>
            </div>
            {alergias && <Badge tone="danger">Alerta: {alergias}</Badge>}
          </div>

          {fichaAberta && (
            <FichaClinica clienteId={clienteId} podeEscrever={podeEscrever} aoFechar={() => setFichaAberta(false)} />
          )}

          {/* Seletor de mapa */}
          <div className="flex flex-wrap items-center gap-1.5 border-b px-3.5 py-2.5">
            {LISTA_MAPAS.map((m) => (
              <button
                key={m.chave}
                type="button"
                onClick={() => {
                  setMapaAtivo(m.chave);
                  setRegiaoSelecionada(null);
                  // Marcação pertence ao mapa em que foi feita — trocar de
                  // mapa não carrega marcação de um vocabulário para outro.
                  setRascunho(null);
                }}
                className={`rounded-md px-3 py-1.5 text-[11px] ${
                  mapaAtivo === m.chave
                    ? "bg-accent font-semibold text-primary"
                    : "border text-secondary-foreground hover:bg-content"
                }`}
              >
                {m.rotulo}
              </button>
            ))}
            <span className="ml-auto rounded-md border border-dashed px-3 py-1.5 text-[10.5px] text-muted-foreground">
              arte definitiva do mapa é asset a definir
            </span>
          </div>

          {/* Mapa + marcações da sessão */}
          <div className="grid min-h-0 flex-1 gap-3 p-3.5 md:grid-cols-[1fr_210px]">
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-content p-3.5">
              <MapaClinico
                tipo={mapaAtivo}
                marcacoes={marcacoes}
                regiaoSelecionada={regiaoSelecionada}
                onSelecionarRegiao={
                  sessaoAberta && podeEscrever
                    ? (chave) => {
                        setRegiaoSelecionada(chave);
                        setNota(marcacoes.find((m) => m.regiao === chave)?.nota ?? "");
                      }
                    : undefined
                }
              />
              <span className="text-center font-mono text-[9.5px] text-muted-foreground">
                placeholder — arte definitiva de cada mapa entra como SVG de biblioteca própria
              </span>
            </div>

            <div className="flex min-h-0 flex-col gap-2.5">
              <span className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
                {sessaoAberta ? "Marcações da sessão" : "Última sessão assinada"}
              </span>

              {!sessaoAberta && marcacoes.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {formatoData.format(new Date(evolucaoExibida!.registradoEm))} · somente leitura. Abra uma sessão nova
                  para marcar.
                </span>
              )}

              {!sessaoAberta && (
                <div className="flex flex-col gap-2 rounded-md border border-dashed p-2.5">
                  <span className="text-[10.5px] text-muted-foreground">
                    Nenhuma sessão aberta. Marcar exige uma evolução em rascunho.
                  </span>
                  {podeCriar && (
                    <>
                      {profissionais.length > 1 && (
                        <select
                          value={profissionalId}
                          onChange={(e) => setProfissionalId(e.target.value)}
                          className="h-7 rounded-md border px-1.5 text-[10.5px]"
                        >
                          {profissionais.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome}
                            </option>
                          ))}
                        </select>
                      )}
                      <Button size="sm" onClick={() => void abrirSessao()} disabled={criarEvolucao.isPending}>
                        Abrir sessão
                      </Button>
                    </>
                  )}
                </div>
              )}

              {regiaoSelecionada && (
                <div className="flex flex-col gap-1.5 rounded-md border p-2.5">
                  <span className="text-[11px] font-medium text-foreground">
                    {MAPAS[mapaAtivo].regioes.find((r) => r.chave === regiaoSelecionada)?.rotulo}
                  </span>
                  <input
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    placeholder="Observação da marcação"
                    className="h-7 rounded-md border px-2 text-[10.5px]"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {MAPAS[mapaAtivo].estados.map((estado) => (
                      <button
                        key={estado.chave}
                        type="button"
                        onClick={() => aplicarEstado(estado.chave)}
                        className="rounded-md border px-2 py-1 text-[10px]"
                        style={{ borderColor: estado.traco, background: estado.fundo, color: estado.traco }}
                      >
                        {estado.rotulo}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setRegiaoSelecionada(null)}
                    className="self-start text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                  >
                    cancelar
                  </button>
                </div>
              )}

              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
                {marcacoes.length === 0 && !regiaoSelecionada && (
                  <div className="rounded-md border border-dashed p-2.5 text-center text-[10px] text-muted-foreground">
                    {sessaoAberta ? "clique no mapa para marcar" : "sem marcações"}
                  </div>
                )}
                {marcacoes.map((m) => {
                  const estado = MAPAS[mapaAtivo].estados.find((e) => e.chave === m.estado);
                  return (
                    <div key={m.regiao} className="flex flex-col gap-1 rounded-md border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-2 rounded-full" style={{ background: estado?.traco }} />
                          <span className="text-[11px] font-medium text-foreground">{m.rotulo}</span>
                        </div>
                        {sessaoAberta && podeEscrever && (
                          <button
                            type="button"
                            onClick={() => removerMarcacao(m.regiao)}
                            className="text-[10px] text-muted-foreground hover:text-destructive"
                          >
                            remover
                          </button>
                        )}
                      </div>
                      <span className="text-[10.5px] text-muted-foreground">{m.nota || estado?.rotulo}</span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-auto flex flex-col gap-1.5">
                <span className="font-mono text-[9px] text-muted-foreground">LEGENDA</span>
                <LegendaMapa tipo={mapaAtivo} />
              </div>
            </div>
          </div>

          {erro && <span className="px-3.5 pb-1 text-[10.5px] text-destructive">{erro}</span>}

          {sessaoAberta && podeEscrever && (
            <div className="mt-auto flex gap-2 border-t px-3 py-2.5">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => void salvarRascunho()}
                disabled={!sujo || atualizarEvolucao.isPending}
              >
                Salvar rascunho
              </Button>
              <Button size="sm" className="flex-1" onClick={() => void assinarSessao()} disabled={assinarEvolucao.isPending}>
                Assinar e encerrar sessão
              </Button>
            </div>
          )}
        </Card>

        {/* ---------- Coluna direita: abas + sessões anteriores ---------- */}
        <div className="flex min-h-0 flex-col gap-3">
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex gap-0.5 border-b px-3 pt-2.5">
              {ABAS.map((a) => (
                <button
                  key={a.chave}
                  type="button"
                  onClick={() => setAba(a.chave)}
                  className={`px-2.5 py-2 text-[11.5px] ${
                    aba === a.chave
                      ? "border-b-2 border-primary font-semibold text-primary"
                      : "text-secondary-foreground hover:text-foreground"
                  }`}
                >
                  {a.rotulo}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              {aba === "anamnese" && <AnamneseTab clienteId={clienteId} podeEscrever={podeEscrever} />}
              {aba === "evolucoes" && (
                <EvolucoesTab
                  clienteId={clienteId}
                  evolucoes={evolucoes}
                  podeEscrever={podeEscrever}
                  carregando={carregandoEvolucoes}
                />
              )}
              {aba === "anexos" && (
                <AnexosTab clienteId={clienteId} evolucoes={evolucoes} podeEscrever={podeEscrever} />
              )}
              {aba === "consentimentos" && (
                <ConsentimentosTab clienteId={clienteId} podeEscrever={podeEscrever} />
              )}
            </div>
          </Card>

          <Card className="flex flex-col gap-2 p-3">
            <span className="text-[12px] font-medium text-foreground">Sessões anteriores</span>
            <div className="flex gap-2">
              {sessoesAnteriores.length === 0 && (
                <span className="text-[10.5px] text-muted-foreground">Nenhuma sessão assinada ainda.</span>
              )}
              {sessoesAnteriores.map((s) => (
                <div key={s.id} className="flex flex-1 flex-col gap-1 rounded-md border p-2.5">
                  <span className="font-mono text-[9.5px] text-muted-foreground">
                    {formatoData.format(new Date(s.registradoEm))}
                  </span>
                  <span className="truncate text-[10.5px] text-secondary-foreground">
                    {s.avaliacao ?? (ehTipoMapa(s.mapaTipo) ? MAPAS[s.mapaTipo].rotulo : "Sessão")}
                  </span>
                </div>
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">
              acesso restrito por IBAC — só profissional autorizado, e toda leitura fica registrada
            </span>
            {log.length > 0 && (
              <div className="flex flex-col gap-1 border-t pt-2">
                <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  Log de acesso · {log.length} registro(s) recentes
                </span>
                {log.slice(0, 4).map((l) => (
                  <span key={l.id} className="font-mono text-[9.5px] text-muted-foreground">
                    {formatoDataHora.format(new Date(l.ocorridoEm))} · {l.acao} · {l.tipoRegistro}
                  </span>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
