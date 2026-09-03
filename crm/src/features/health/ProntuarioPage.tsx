import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
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
import {
  REGIAO_ESTADO_NATIVO,
  itemEstadoNativo,
  payloadDeMarcacoes,
  regioesARealizar,
  type PayloadOdontograma,
} from "./odontograma";

/**
 * SEGUNDO NÍVEL DE PREGUIÇA — Subetapa 03.7.
 *
 * `/prontuario` já é rota preguiçosa desde a 03.3. Este `lazy()` aninhado
 * existe porque `react-advanced-odontogram` pesa **436.343 B gzip
 * medidos**, contra 11.070 B do chunk inteiro desta página. Deixá-lo
 * junto do resto do prontuário cobraria 436 KB de todo mundo que abre uma
 * ficha para ler anamnese, anexo ou consentimento — a maioria das
 * aberturas — por um mapa que talvez nem seja consultado. Aqui ele só
 * viaja quando alguém escolhe a aba "Odontograma".
 *
 * O `fallback` do `<Suspense>` não é um spinner: é a grade FDI leve da
 * Subetapa 02.9 (3.023 B gzip), desenhando as marcações já gravadas em
 * modo leitura. Quem abre o odontograma vê o estado do paciente
 * imediatamente e ganha as ferramentas de edição quando o chunk chega.
 */
const OdontogramaClinico = lazy(() => import("./OdontogramaClinico"));

const formatoData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const formatoDataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * UMA FAIXA DE ABAS SÓ, para os oito conteúdos do paciente — decisão de
 * Max de 2026-09-03, durante a Subetapa 03.7.
 *
 * Até aqui a tela era partida em duas colunas: mapa clínico à esquerda,
 * com um seletor próprio de quatro botões, e as quatro abas de texto à
 * direita. O odontograma expôs o custo desse arranjo com número: o
 * componente precisa de ~1.030px para desenhar a arcada ao lado do
 * painel de controles, e a coluna esquerda entregava 458px numa tela de
 * 1680 — arcada cortada, painel de controles cortado, ficha dentária
 * quebrando uma palavra por linha.
 *
 * Unificando, o conteúdo escolhido recebe a LARGURA INTEIRA da página, e
 * some a assimetria de o odontograma ser "um mapa dentro de um painel"
 * enquanto a anamnese é "uma aba". Todos são a mesma coisa: um assunto
 * do mesmo paciente. Os quatro mapas ficam agrupados no fim da faixa,
 * separados por um divisor, porque compartilham entre si o que as
 * quatro primeiras não têm — dependem de uma sessão aberta para
 * receber marcação.
 */
const ABAS_TEXTO = [
  { chave: "anamnese", rotulo: "Anamnese" },
  { chave: "evolucoes", rotulo: "Evoluções" },
  { chave: "anexos", rotulo: "Anexos" },
  { chave: "consentimentos", rotulo: "Consentimentos" },
] as const;

type AbaTexto = (typeof ABAS_TEXTO)[number]["chave"];
type ChaveAba = AbaTexto | TipoMapa;

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
  const [regiaoSelecionada, setRegiaoSelecionada] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Marcacao[] | null>(null);
  const [nota, setNota] = useState("");
  const [profissionalId, setProfissionalId] = useState<string>("");
  const [fichaAberta, setFichaAberta] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cliente = clientes.find((c) => c.id === clienteId);
  const sessaoAberta = useMemo(() => evolucoes.find((e) => !e.travada) ?? null, [evolucoes]);
  const sessoesAnteriores = useMemo(() => evolucoes.filter((e) => e.travada).slice(0, 3), [evolucoes]);

  /**
   * O mapa da sessão aberta deixou de ser um EFEITO e virou um SINAL.
   *
   * Antes, reabrir a tela trocava o seletor sozinho para o mapa da
   * sessão — necessário quando havia um seletor escondido dentro de um
   * painel, porque o profissional podia não notar em qual mapa estava.
   * Com os mapas como abas, trocar de aba por conta própria seria pior
   * que o problema que resolvia: moveria a pessoa de tela sem ela pedir.
   * Em vez disso, a aba do mapa da sessão recebe uma marca visível, e
   * quem decide para onde ir continua sendo quem está olhando.
   */
  const mapaDaSessao =
    sessaoAberta && ehTipoMapa(sessaoAberta.mapaTipo) ? (sessaoAberta.mapaTipo as TipoMapa) : null;
  const ehAbaDeMapa = ehTipoMapa(aba);
  const mapaAtivo: TipoMapa = ehAbaDeMapa ? (aba as TipoMapa) : (mapaDaSessao ?? "facial");

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

  // ============================================================
  // Odontograma (Subetapa 03.7)
  // ============================================================
  const ehOdontograma = mapaAtivo === "odontograma";

  /**
   * O payload nativo da biblioteca, recuperado do item sentinela. Vem do
   * valor CRU (`evolucaoExibida.marcacoes`), nunca da lista já validada:
   * `marcacoesValidas()` descarta o sentinela de propósito, porque
   * "estado_nativo" não é um dos 32 dentes do catálogo.
   */
  const payloadPersistido = useMemo(
    () => (ehOdontograma && evolucaoExibida ? payloadDeMarcacoes(evolucaoExibida.marcacoes) : null),
    [ehOdontograma, evolucaoExibida],
  );
  const [payloadRascunho, setPayloadRascunho] = useState<PayloadOdontograma | null>(null);
  const payloadOdontograma = payloadRascunho ?? payloadPersistido;

  /**
   * Dentes que a última sessão ASSINADA de odontograma deixou como
   * `a_realizar` — a metade esquerda da derivação de `executado`
   * (ver `mapas.ts`). `evolucoes` já vem ordenada da mais recente para a
   * mais antiga; a exibida é excluída para a sessão não se comparar
   * consigo mesma, que devolveria "executado" para tudo que ela própria
   * acabou de planejar.
   */
  const aRealizarAntes = useMemo(() => {
    if (!ehOdontograma) return new Set<string>();
    const anterior = evolucoes.find(
      (e) => e.travada && e.mapaTipo === "odontograma" && e.id !== evolucaoExibida?.id,
    );
    return anterior ? regioesARealizar(marcacoesValidas("odontograma", anterior.marcacoes)) : new Set<string>();
  }, [ehOdontograma, evolucoes, evolucaoExibida?.id]);

  /** `.dark` no `<html>` é o sinal de tema que `lib/preferencias.tsx` mantém. */
  const [escuro, setEscuro] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const raiz = document.documentElement;
    const obs = new MutationObserver(() => setEscuro(raiz.classList.contains("dark")));
    obs.observe(raiz, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const aoAlterarOdontograma = useCallback((novas: Marcacao[], payload: PayloadOdontograma) => {
    setRascunho(novas);
    setPayloadRascunho(payload);
  }, []);

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
      setPayloadRascunho(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir a sessão.");
    }
  }

  /**
   * O que de fato vai para `aba_health.evolucoes.marcacoes`.
   *
   * Para os três mapas de região é a lista como está. Para o odontograma
   * é a projeção legível MAIS o item sentinela com o payload da
   * biblioteca — e o sentinela é acrescentado aqui, no único lugar que
   * grava, em vez de viver dentro do estado da tela. Se ele morasse em
   * `rascunho`, a lista lateral teria de filtrá-lo em todo lugar que a
   * renderiza, e bastaria um ponto esquecido para desenhar um 33º dente
   * chamado "estado_nativo".
   *
   * `payloadOdontograma` cai no persistido quando não há rascunho: salvar
   * uma sessão em que só o texto da evolução mudou não pode apagar o
   * estado do odontograma gravado antes.
   */
  function marcacoesParaGravar(): Marcacao[] {
    if (!ehOdontograma) return marcacoes;
    const dentes = marcacoes.filter((m) => m.regiao !== REGIAO_ESTADO_NATIVO);
    return payloadOdontograma ? [...dentes, itemEstadoNativo(payloadOdontograma)] : dentes;
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
      await atualizarEvolucao.mutateAsync({
        id: sessaoAberta.id,
        mapaTipo: mapaAtivo,
        marcacoes: marcacoesParaGravar(),
      });
      setRascunho(null);
      setPayloadRascunho(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar as marcações.");
    }
  }

  async function assinarSessao() {
    setErro(null);
    if (!sessaoAberta) return;
    try {
      if (sujo) {
        await atualizarEvolucao.mutateAsync({
          id: sessaoAberta.id,
          mapaTipo: mapaAtivo,
          marcacoes: marcacoesParaGravar(),
        });
      }
      await assinarEvolucao.mutateAsync(sessaoAberta.id);
      setRascunho(null);
      setPayloadRascunho(null);
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

      {/* ---------- Bloco único do paciente ---------- */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
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

        {/* ---------- Faixa única: 4 abas de texto + 4 mapas ---------- */}
        <div className="flex flex-wrap items-center gap-0.5 border-b px-3 pt-2.5">
          {ABAS_TEXTO.map((a) => (
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

          {/* Divisor: dali para a direita, tudo depende de sessão aberta. */}
          <span className="mx-2 h-4 w-px self-center bg-border" />

          {LISTA_MAPAS.map((m) => (
            <button
              key={m.chave}
              type="button"
              onClick={() => {
                setAba(m.chave);
                setRegiaoSelecionada(null);
                // Marcação pertence ao mapa em que foi feita — trocar de
                // mapa não carrega marcação de um vocabulário para outro.
                setRascunho(null);
                setPayloadRascunho(null);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-2 text-[11.5px] ${
                aba === m.chave
                  ? "border-b-2 border-primary font-semibold text-primary"
                  : "text-secondary-foreground hover:text-foreground"
              }`}
            >
              {m.rotulo}
              {/* A marca da sessão aberta: diz ONDE as marcações da sessão
                  em curso estão, sem arrastar ninguém para lá. */}
              {mapaDaSessao === m.chave && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-primary"
                  title="A sessão aberta registra as marcações neste mapa"
                />
              )}
            </button>
          ))}
        </div>

        {/* ---------- Corpo da aba ---------- */}
        {!ehAbaDeMapa && (
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
            {aba === "anexos" && <AnexosTab clienteId={clienteId} evolucoes={evolucoes} podeEscrever={podeEscrever} />}
            {aba === "consentimentos" && <ConsentimentosTab clienteId={clienteId} podeEscrever={podeEscrever} />}
          </div>
        )}

        {ehAbaDeMapa && (
          <>
            {/* Aviso que a faixa unificada tornou possível errar: com uma
                sessão aberta em OUTRO mapa, marcar aqui e salvar troca o
                `mapa_tipo` da evolução e substitui as marcações de lá.
                Antes o seletor ficava colado no mapa e o risco era o
                mesmo; agora ele está dito em voz alta. */}
            {mapaDaSessao && mapaDaSessao !== mapaAtivo && (
              // `text-warning-tint-foreground` junto do `bg-warning-tint`, e
              // não `text-secondary-foreground`: o par é o que a Subetapa
              // 02.12 fixou depois de o modo escuro revelar tint claro com
              // texto claro por cima em quatro famílias semânticas de uma vez.
              <div className="border-b bg-warning-tint px-3.5 py-2 text-[10.5px] text-warning-tint-foreground">
                A sessão aberta registra em <strong>{MAPAS[mapaDaSessao].rotulo}</strong>. Marcar aqui e salvar move a
                sessão para <strong>{MAPAS[mapaAtivo].rotulo}</strong> e substitui as marcações do outro mapa.
              </div>
            )}
            {/* Mapa + marcações da sessão */}
            <div className="grid min-h-0 flex-1 gap-3 p-3.5 md:grid-cols-[1fr_240px]">
            {ehOdontograma ? (
              /* O odontograma é o único mapa com arte de produção: a
                 biblioteca desenha os 32 dentes em SVG, com face, cárie,
                 endodontia, prótese e ortodontia. Por isso ele não leva a
                 tarja de "placeholder" que os outros três ainda levam. */
              <div className="flex min-h-0 flex-col overflow-auto rounded-lg border bg-content">
                <Suspense
                  fallback={
                    <div className="flex flex-col items-center justify-center gap-3 p-3.5">
                      <MapaClinico tipo="odontograma" marcacoes={marcacoes} />
                      <span className="text-center font-mono text-[9.5px] text-muted-foreground">
                        carregando o odontograma completo…
                      </span>
                    </div>
                  }
                >
                  <OdontogramaClinico
                    /* `key` além da prop: uma sessão nova precisa de
                       componente novo, não de um efeito reaproveitando o
                       anterior — o estado da biblioteca é singleton de
                       módulo, e remontar é a forma mais barata de garantir
                       que nada do paciente anterior sobreviva. */
                    key={`${clienteId}:${evolucaoExibida?.id ?? "nenhuma"}`}
                    chaveSessao={`${clienteId}:${evolucaoExibida?.id ?? "nenhuma"}`}
                    marcacoesGravadas={evolucaoExibida?.marcacoes}
                    aRealizarAntes={aRealizarAntes}
                    somenteLeitura={!sessaoAberta || !podeEscrever}
                    escuro={escuro}
                    onAlterar={aoAlterarOdontograma}
                  />
                </Suspense>
              </div>
            ) : (
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
            )}

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
                        {/* No odontograma não há "remover" aqui: a marcação
                            é desfeita no próprio dente, dentro do
                            componente. Um botão nesta lista apagaria a
                            projeção e deixaria o estado nativo intacto —
                            a linha sumiria da tela e voltaria no próximo
                            carregamento. */}
                        {sessaoAberta && podeEscrever && !ehOdontograma && (
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
                      {/* Faces em mono, que é o vocabulário de metadado da
                          identidade (`docs/04` §5). É esta linha que a
                          Subetapa 03.8 transforma em item de orçamento. */}
                      {m.faces && m.faces.length > 0 && (
                        <span className="font-mono text-[9.5px] text-muted-foreground">{m.faces.join(" · ")}</span>
                      )}
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
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => void assinarSessao()}
                  disabled={assinarEvolucao.isPending}
                >
                  Assinar e encerrar sessão
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* ---------- Rodapé de contexto: histórico e rastro de acesso ----------
          Desceu da coluna direita para cá quando as abas se unificaram. Vale
          para o paciente inteiro, não para a aba escolhida, então é rodapé e
          não conteúdo de aba. Em faixa horizontal, ocupa pouca altura — o que
          importa porque a altura que ele não usa é a que o odontograma usa. */}
      <Card className="flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-medium text-foreground">Sessões anteriores</span>
          {sessoesAnteriores.length === 0 && (
            <span className="text-[10.5px] text-muted-foreground">Nenhuma sessão assinada ainda.</span>
          )}
          {sessoesAnteriores.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
              <span className="font-mono text-[9.5px] text-muted-foreground">
                {formatoData.format(new Date(s.registradoEm))}
              </span>
              <span className="max-w-[26ch] truncate text-[10.5px] text-secondary-foreground">
                {s.avaliacao ?? (ehTipoMapa(s.mapaTipo) ? MAPAS[s.mapaTipo].rotulo : "Sessão")}
              </span>
            </div>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground">
            acesso restrito por IBAC — só profissional autorizado, e toda leitura fica registrada
          </span>
        </div>
        {log.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2">
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
  );
}
