import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useClientesDaConta, useEvolucoes } from "@/features/health/api";
import { FACES, ROTULO_ACHADO, registrosDeMarcacoes } from "@/features/health/odontograma";
import { rotuloDoDegrau, rotuloDoPrecoAplicado } from "@/features/finance/precos";
import {
  useAcrescentarItem,
  useAprovarOrcamento,
  useContratarOpcao,
  useContratosDoCliente,
  useExecucaoLiberada,
  useMarcarFaceExecutada,
  useCriarDiagnostico,
  useCriarOpcao,
  useCriarPlano,
  useDefinirCondicoes,
  useFases,
  useMontarOrcamento,
  useMontarTodosOsOrcamentos,
  useNomesDeProcedimento,
  useOrcamentos,
  usePacotesDoCatalogo,
  usePlanos,
  usePlanosOrcados,
  usePodePlanejar,
  useProcedimentosDoCatalogo,
  useProfissionaisComTipo,
  useRemoverItem,
  useSimularTroca,
  useTrocarProfissional,
  type LinhaSimulacao,
  type Orcamento,
  type Plano,
} from "./api";
import { ContratosDoPaciente } from "./ContratosDoPaciente";
import { htmlDoOrcamento, imprimirHtml } from "./impressao";

/**
 * Tela do módulo `treatment` — rótulo **"Plano"** (Subetapas 03.8.a e 03.8.c).
 *
 * ============================================================
 * A MATRIZ E O ORÇAMENTO SÃO A MESMA TELA, DE PROPÓSITO
 * ============================================================
 * "Plano" e "orçamento" são duas palavras para duas coisas (Max,
 * 2026-09-04): o plano é o planejamento clínico, o orçamento é a vista
 * financeira dele. São conceitos distintos e uma conversa só — o
 * profissional monta as opções concorrentes e o paciente compara **preço**
 * entre elas. Separar em duas telas obrigaria a pessoa a guardar de
 * cabeça o que a outra dizia, que é exatamente o que a matriz existe para
 * evitar.
 *
 * ============================================================
 * O PLANO SE MONTA AQUI (Subetapa 03.8.c)
 * ============================================================
 * Até a 03.8.a esta tela só LIA a matriz: o plano da demonstração de
 * 2026-09-05 precisou nascer por SQL. Agora nasce aqui — plano, opção,
 * diagnóstico e célula —, e pode nascer do odontograma: o achado vira
 * diagnóstico, e o trabalho marcado na face vira a célula já com dente e
 * faces preenchidos. A célula aceita PROCEDIMENTO ou PACOTE (D-F1, D-F6).
 *
 * A TELA NÃO DECIDE QUEM PODE MONTAR. Pergunta ao banco
 * (`aba_treatment.pode_planejar`) para mostrar os controles ou explicar a
 * ausência deles; quem decide é a RLS de cada `insert`, e a mensagem de
 * recusa dela aparece como veio.
 *
 * ============================================================
 * O PREÇO NÃO SE ESCOLHE — E NÃO HÁ ONDE ESCOLHER
 * ============================================================
 * Não existe nesta tela um seletor de tabela de preço. Não é uma decisão
 * de layout: a escada não tem parâmetro por onde recebê-la (verificação (e)
 * da migration `051`). O que a tela mostra é o **Preço aplicado** — de onde
 * veio cada número —, na língua da clínica (D-F4).
 *
 * ============================================================
 * QUEM APROVA, E O QUE DESFAZ A APROVAÇÃO (D-F3, D-F7)
 * ============================================================
 * Só o profissional que vai executar aprova. O banco diz a quem está
 * olhando se é essa pessoa (`sou_quem_aprova`), e a tela mostra o botão ou
 * explica por que ele não está ali. Se a recepção mexer em dinheiro depois
 * de aprovado, o orçamento volta a rascunho — e a tela AVISA, com quem mexeu
 * e no quê, porque um orçamento que "desaprovou sozinho" sem explicação é
 * indistinguível de defeito.
 *
 * ============================================================
 * O QUE ESTA TELA MOSTRA DEPENDE DE QUEM ESTÁ OLHANDO
 * ============================================================
 * `ler_orcamentos()` devolve `com_detalhe_clinico`. Quem tem alcance
 * clínico vê dente e face — e a leitura fica registrada em
 * `aba_health.log_acesso`. Quem não tem vê o mesmo orçamento, com os
 * mesmos valores, sem dente e sem face. A tela **diz** isso, em vez de
 * mostrar coluna vazia: ausência silenciosa é lida como "não tem", e aqui
 * o certo é "você não pode ver".
 */

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const data = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

const ROTULO_COLUNA_DINHEIRO: Record<string, string> = {
  desconto_valor: "desconto",
  desconto_motivo: "motivo do desconto",
  promocao: "promoção",
  parcelas: "parcelas",
  taxa_juros: "juros",
  taxa_multa_atraso: "mora",
};

const campo =
  "rounded-[5px] border border-input bg-background px-2 py-1 text-[11px] text-foreground disabled:opacity-45";

function Erro({ erro }: { erro: unknown }) {
  if (!erro) return null;
  return <span className="text-[10.5px] text-destructive">{(erro as Error).message}</span>;
}

// ============================================================
// Sem paciente na rota: escolher de quem é o plano
// ============================================================
function SelecionarPaciente() {
  const { data: clientes = [], isLoading } = useClientesDaConta();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-[15px] font-medium text-foreground">Plano</h1>
        <span className="text-[11.5px] text-muted-foreground">
          O planejamento clínico do paciente e o orçamento dele. Cada abertura grava uma linha em{" "}
          <code>aba_health.log_acesso</code>.
        </span>
      </div>

      <Card className="flex flex-col divide-y">
        {isLoading && <span className="p-4 text-[11px] text-muted-foreground">Carregando…</span>}
        {!isLoading && clientes.length === 0 && (
          <span className="p-4 text-[11px] text-muted-foreground">
            Nenhum paciente cadastrado nesta conta. Cadastre em Pessoas antes de montar um plano.
          </span>
        )}
        {clientes.map((c) => (
          <Link
            key={c.id}
            to={`/plano/${c.id}`}
            className="flex items-center justify-between px-4 py-2.5 text-[11.5px] text-foreground hover:bg-content"
          >
            <span>{c.nome}</span>
            <span className="text-[10.5px] text-muted-foreground">abrir plano →</span>
          </Link>
        ))}
      </Card>
    </div>
  );
}

// ============================================================
// O diálogo que avisa a diferença ANTES de confirmar
// ============================================================
function AvisoDeDiferenca({
  linhas,
  profissional,
  aoConfirmar,
  aoCancelar,
  confirmando,
}: {
  linhas: LinhaSimulacao[];
  profissional: string;
  aoConfirmar: () => void;
  aoCancelar: () => void;
  confirmando: boolean;
}) {
  const total = linhas.reduce((s, l) => s + Number(l.diferenca), 0);
  const semEfeito = linhas.every((l) => Number(l.diferenca) === 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <Card className="flex max-h-[80vh] w-full max-w-[560px] flex-col gap-3 overflow-auto p-4">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-foreground">
            Trocar para {profissional} muda o orçamento
          </span>
          <span className="text-[11px] text-muted-foreground">
            O preço depende também do tipo do profissional que vai executar. Confira a diferença antes de confirmar —
            depois de aprovado, o valor congela.
          </span>
        </div>

        <div className="flex flex-col">
          <div className="grid grid-cols-[1fr_90px_90px_90px] gap-2 border-b border-border pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
            <span>Item</span>
            <span className="text-right">Hoje</span>
            <span className="text-right">Novo</span>
            <span className="text-right">Diferença</span>
          </div>
          {linhas.map((l) => {
            const d = Number(l.diferenca);
            return (
              <div
                key={l.item_id}
                className="grid grid-cols-[1fr_90px_90px_90px] items-baseline gap-2 border-b border-hairline py-1.5 text-[11px] text-secondary-foreground last:border-b-0"
              >
                <span className="truncate">
                  {l.procedimento}
                  <span className="ml-1.5 text-[9.5px] text-muted-foreground">
                    {rotuloDoDegrau(l.degrau_atual)} → {rotuloDoDegrau(l.degrau_novo)}
                  </span>
                </span>
                <span className="text-right font-mono">{moeda.format(Number(l.valor_atual))}</span>
                <span className="text-right font-mono">{moeda.format(Number(l.valor_novo))}</span>
                <span
                  className={`text-right font-mono ${d > 0 ? "text-destructive" : d < 0 ? "text-success" : "text-muted-foreground"}`}
                >
                  {d > 0 ? "+" : ""}
                  {moeda.format(d)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-baseline justify-between rounded-md bg-content px-3 py-2">
          <span className="text-[11px] text-secondary-foreground">
            {semEfeito ? "Nenhum valor muda com esta troca." : "Diferença total"}
          </span>
          <span className={`font-mono text-[13px] ${total > 0 ? "text-destructive" : total < 0 ? "text-success" : "text-foreground"}`}>
            {total > 0 ? "+" : ""}
            {moeda.format(total)}
          </span>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={aoCancelar} disabled={confirmando}>
            Cancelar
          </Button>
          <Button onClick={aoConfirmar} disabled={confirmando}>
            {confirmando ? "Aplicando…" : "Confirmar a troca"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// A vista financeira de UMA opção
// ============================================================
function PainelOrcamento({
  orcamento,
  planoId,
  clienteId,
  pacienteNome,
}: {
  orcamento: Orcamento;
  planoId: string;
  clienteId: string;
  pacienteNome: string;
}) {
  const { profile } = useAuth();
  const ehAdmin = profile?.accountRole === "admin" || profile?.accountRole === "owner";

  const { data: profissionais = [] } = useProfissionaisComTipo();
  const simular = useSimularTroca();
  const trocar = useTrocarProfissional(planoId, clienteId);
  const condicoes = useDefinirCondicoes(planoId, clienteId);
  const aprovar = useAprovarOrcamento(planoId, clienteId);
  const contratar = useContratarOpcao(clienteId);
  const { data: contratos = [] } = useContratosDoCliente(clienteId);
  const contrato = contratos.find((c) => c.orcamento_id === orcamento.id && c.status !== "cancelado") ?? null;

  const [pendente, setPendente] = useState<{ id: string | null; nome: string; linhas: LinhaSimulacao[] } | null>(null);
  const [desconto, setDesconto] = useState(String(orcamento.desconto_valor ?? 0));
  const [motivo, setMotivo] = useState(orcamento.desconto_motivo ?? "");
  const [parcelas, setParcelas] = useState(String(orcamento.parcelas ?? 1));

  useEffect(() => {
    setDesconto(String(orcamento.desconto_valor ?? 0));
    setMotivo(orcamento.desconto_motivo ?? "");
    setParcelas(String(orcamento.parcelas ?? 1));
  }, [orcamento.id, orcamento.desconto_valor, orcamento.desconto_motivo, orcamento.parcelas]);

  const aprovado = orcamento.estado === "aprovado";
  const emRascunho = orcamento.estado === "rascunho";
  // Itens e profissional congelam fora do rascunho. DINHEIRO NÃO: a recepção
  // pode mexer num orçamento aprovado — e o efeito é devolvê-lo a rascunho
  // (D-F3). Travar o campo obrigaria a pedir ao profissional que
  // "desaprovasse" primeiro, que é trabalho sem valor.
  // Orçamento CONTRATADO não muda mais (migration `052`, D-V4): o contrato é
  // cópia fiel dele. Deixar o campo aberto prometeria uma devolução a
  // rascunho que o banco recusa — achado pela evidência de tela da 03.8.b.
  const dinheiroEditavel = ehAdmin && orcamento.estado !== "recusado" && !contrato;
  const executor = profissionais.find((p) => p.id === orcamento.profissional_id) ?? null;

  async function pedirTroca(profissionalId: string) {
    const alvo = profissionais.find((p) => p.id === profissionalId) ?? null;
    const linhas = await simular.mutateAsync({ orcamentoId: orcamento.id, profissionalId: profissionalId || null });
    setPendente({ id: profissionalId || null, nome: alvo?.nome ?? "sem profissional", linhas });
  }

  return (
    <Card className="flex flex-col gap-3 p-3.5" data-orcamento-opcao={orcamento.opcao_rotulo}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium text-foreground">Orçamento da opção {orcamento.opcao_rotulo}</span>
          <span className="text-[11px] text-muted-foreground" data-estado-orcamento={orcamento.estado}>
            {aprovado
              ? `Aprovado em ${orcamento.aprovado_em ? data.format(new Date(orcamento.aprovado_em)) : "—"} pelo profissional que vai executar — pode ir ao paciente.`
              : emRascunho
                ? "Rascunho: o preço de cada item foi decidido pelas tabelas de preço, ninguém escolheu. Só vai ao paciente depois de aprovado."
                : "Recusado."}
          </span>
        </div>
        {emRascunho && orcamento.sou_quem_aprova && (
          <Button
            onClick={() => aprovar.mutate(orcamento.id)}
            disabled={aprovar.isPending || orcamento.itens.length === 0}
          >
            {aprovar.isPending ? "Aprovando…" : "Aprovar orçamento"}
          </Button>
        )}
      </div>

      {/* O AVISO DE NOVA APROVAÇÃO (D-F3). Sem ele, o orçamento que estava
          aprovado ontem aparece em rascunho hoje e ninguém sabe por quê. */}
      {emRascunho && orcamento.ultima_devolucao && (
        <div
          className="rounded-md border border-warning bg-warning-tint px-2.5 py-2 text-[11px] leading-relaxed text-foreground"
          role="status"
          data-aviso="reaprovacao"
        >
          <strong>Precisa de nova aprovação.</strong> Este orçamento estava aprovado e voltou a rascunho em{" "}
          {data.format(new Date(orcamento.ultima_devolucao.em))}
          {orcamento.ultima_devolucao.por_nome ? `, quando ${orcamento.ultima_devolucao.por_nome} alterou ` : ", quando alguém alterou "}
          {orcamento.ultima_devolucao.colunas.map((c) => ROTULO_COLUNA_DINHEIRO[c] ?? c).join(", ") || "o orçamento"}. O
          profissional que vai executar precisa aprová-lo de novo antes de ele ir ao paciente.
        </div>
      )}

      {emRascunho && !orcamento.sou_quem_aprova && (
        <span className="text-[10.5px] text-muted-foreground">
          {orcamento.profissional_id
            ? `Quem aprova é ${executor?.nome ?? "o profissional que vai executar"} — é quem responde pelo número.`
            : "Defina quem vai executar: só essa pessoa aprova o orçamento."}
        </span>
      )}
      <Erro erro={aprovar.error} />

      {/* E4 e E5: o aprovado vai ao paciente IMPRESSO, e a opção escolhida
          vira contrato. Quem pode contratar é a recepção — a tela mostra o
          botão a todos os que veem o aprovado e o banco recusa os demais,
          com o motivo. */}
      {aprovado && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-content px-2.5 py-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => imprimirHtml(`Orçamento — ${pacienteNome}`, htmlDoOrcamento(orcamento, pacienteNome))}
          >
            Imprimir orçamento
          </Button>
          {contrato ? (
            <span className="text-[10.5px] text-muted-foreground" data-contratado>
              Esta opção já foi contratada — o contrato está em Contratos, abaixo.
            </span>
          ) : (
            <>
              <Button
                size="sm"
                disabled={contratar.isPending}
                onClick={() => contratar.mutate(orcamento.id)}
              >
                {contratar.isPending ? "Contratando…" : "Contratar esta opção"}
              </Button>
              <span className="text-[10.5px] text-muted-foreground">
                As outras opções orçadas deste plano ficam registradas como recusadas.
              </span>
            </>
          )}
        </div>
      )}
      <Erro erro={contratar.error} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-secondary-foreground">Executado por</span>
        <select
          value={orcamento.profissional_id ?? ""}
          disabled={!emRascunho || simular.isPending}
          onChange={(e) => void pedirTroca(e.target.value)}
          aria-label="Profissional que vai executar"
          className={campo}
        >
          <option value="">(sem profissional definido)</option>
          {profissionais.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
              {p.tipo ? ` — ${p.tipo}` : ""}
            </option>
          ))}
        </select>
        {simular.isPending && <span className="text-[10.5px] text-muted-foreground">calculando a diferença…</span>}
      </div>

      {/* Os itens, com o preço aplicado a cada um (D-F4). */}
      <div className="flex flex-col">
        <div className="grid grid-cols-[1fr_140px_100px] gap-2 border-b border-border pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
          <span>Item</span>
          <span>Preço aplicado</span>
          <span className="text-right">Valor</span>
        </div>
        {orcamento.itens.length === 0 && (
          <span className="py-3 text-[11px] text-muted-foreground">
            Nenhum item nesta opção ainda. Acrescente procedimentos ou pacotes na matriz e gere o orçamento de novo.
          </span>
        )}
        {orcamento.itens.map((i) => (
          <div
            key={i.id}
            className="grid grid-cols-[1fr_140px_100px] items-baseline gap-2 border-b border-hairline py-1.5 text-[11px] text-secondary-foreground last:border-b-0"
          >
            <span className="truncate">
              {i.procedimento}
              {i.tipo === "pacote" && (
                <span className="ml-1.5 rounded-[3px] bg-content px-1 text-[9.5px] text-muted-foreground">pacote</span>
              )}
              {i.dente && (
                <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                  dente {i.dente}
                  {i.faces?.length ? ` · ${i.faces.join(", ")}` : ""}
                </span>
              )}
            </span>
            <span
              className="truncate text-[10px] text-muted-foreground"
              title={i.tabela_preco ? `Tabela: ${i.tabela_preco}` : "Preço do próprio cadastro"}
            >
              {rotuloDoPrecoAplicado(i.degrau, i.tipo)}
            </span>
            <span className="text-right font-mono">{moeda.format(Number(i.valor_resolvido))}</span>
          </div>
        ))}
      </div>

      {/* As condições de dinheiro — só a recepção mexe. */}
      <div className="flex flex-col gap-2 rounded-md border border-border bg-content p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-secondary-foreground">Condições comerciais</span>
          {contrato ? (
            <span className="text-[10px] text-muted-foreground">congeladas: esta opção já foi contratada</span>
          ) : !ehAdmin && (
            <span className="text-[10px] text-muted-foreground">desconto, parcela e juros são da recepção</span>
          )}
        </div>
        <div className="grid grid-cols-[110px_1fr_90px] gap-2">
          <input
            type="number"
            min={0}
            step="0.01"
            value={desconto}
            disabled={!dinheiroEditavel}
            onChange={(e) => setDesconto(e.target.value)}
            placeholder="Desconto"
            aria-label="Desconto em reais"
            className={campo}
          />
          <input
            value={motivo}
            disabled={!dinheiroEditavel}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo do desconto"
            aria-label="Motivo do desconto"
            className={campo}
          />
          <input
            type="number"
            min={1}
            max={120}
            value={parcelas}
            disabled={!dinheiroEditavel}
            onChange={(e) => setParcelas(e.target.value)}
            placeholder="Parcelas"
            aria-label="Número de parcelas"
            className={campo}
          />
        </div>
        {dinheiroEditavel && aprovado && (
          <span className="text-[10.5px] text-muted-foreground">
            Este orçamento já está aprovado. Salvar uma condição diferente <strong>devolve-o a rascunho</strong>, e o
            profissional precisa aprová-lo de novo.
          </span>
        )}
        {dinheiroEditavel && (
          <Button
            variant="secondary"
            onClick={() =>
              condicoes.mutate({
                orcamentoId: orcamento.id,
                condicoes: {
                  desconto_valor: Number(desconto) || 0,
                  desconto_motivo: motivo.trim() || null,
                  parcelas: Number(parcelas) || 1,
                },
              })
            }
            disabled={condicoes.isPending}
          >
            {condicoes.isPending ? "Salvando…" : "Salvar condições"}
          </Button>
        )}
        <Erro erro={condicoes.error} />
      </div>

      <div className="flex items-baseline justify-between border-t border-border pt-2">
        <div className="flex flex-col">
          <span className="text-[10.5px] text-muted-foreground">
            {moeda.format(Number(orcamento.valor_bruto))}
            {Number(orcamento.desconto_valor) > 0 && ` − ${moeda.format(Number(orcamento.desconto_valor))} de desconto`}
          </span>
          {orcamento.parcelas > 1 && (
            <span className="text-[10.5px] text-muted-foreground">
              em {orcamento.parcelas}× de {moeda.format(Number(orcamento.valor_liquido) / orcamento.parcelas)}
            </span>
          )}
        </div>
        <span className="font-mono text-[20px] text-foreground" data-valor-liquido={Number(orcamento.valor_liquido)}>
          {moeda.format(Number(orcamento.valor_liquido))}
        </span>
      </div>

      {pendente && (
        <AvisoDeDiferenca
          linhas={pendente.linhas}
          profissional={pendente.nome}
          confirmando={trocar.isPending}
          aoCancelar={() => setPendente(null)}
          aoConfirmar={async () => {
            await trocar.mutateAsync({ orcamentoId: orcamento.id, profissionalId: pendente.id });
            setPendente(null);
          }}
        />
      )}
    </Card>
  );
}

// ============================================================
// Do odontograma para o plano
// ============================================================
/**
 * Lê o odontograma MAIS RECENTE do paciente e oferece dois gestos: o
 * ACHADO vira diagnóstico (com as faces do achado), e o TRABALHO vira a
 * célula, com dente e as faces DO TRABALHO já preenchidos — nunca as do
 * achado, que é o defeito A2 que a 03.7.a corrigiu.
 *
 * Só monta quando a pessoa pede: abrir o odontograma é leitura de
 * prontuário, e ela fica registrada em `aba_health.log_acesso`. Carregar por
 * conta própria a cada abertura do plano registraria uma leitura que
 * ninguém fez.
 */
function DoOdontograma({
  clienteId,
  diagnosticosExistentes,
  aoCriarDiagnostico,
  aoLancarTrabalho,
  criando,
}: {
  clienteId: string;
  diagnosticosExistentes: { dente: string | null; descricao: string }[];
  aoCriarDiagnostico: (d: { dente: string; faces: string[]; descricao: string }) => void;
  aoLancarTrabalho: (t: { dente: string; faces: string[] }) => void;
  criando: boolean;
}) {
  const { data: evolucoes = [], isPending, error } = useEvolucoes(clienteId);

  const registros = useMemo(() => {
    for (const e of evolucoes) {
      if (e.mapaTipo !== "odontograma") continue;
      const r = registrosDeMarcacoes(e.marcacoes);
      if (r.length) return { registros: r, em: e.registradoEm };
    }
    return null;
  }, [evolucoes]);

  if (isPending) return <span className="text-[11px] text-muted-foreground">Lendo o odontograma…</span>;
  if (error) return <Erro erro={error} />;
  if (!registros) {
    return (
      <span className="text-[11px] text-muted-foreground">
        Este paciente ainda não tem odontograma marcado. Marque achados e trabalhos no prontuário.
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1.5" data-bloco="do-odontograma">
      <span className="text-[10.5px] text-muted-foreground">
        Odontograma de {data.format(new Date(registros.em))}.
      </span>
      {registros.registros.map((r) => (
        <div key={r.regiao} className="flex flex-col gap-1 border-b border-hairline py-1.5 last:border-b-0">
          <span className="font-mono text-[11px] text-foreground">Dente {r.regiao}</span>
          {(r.achados ?? []).map((a, i) => {
            const descricao = `${ROTULO_ACHADO[a.tipo]}${a.faces.length ? ` (${a.faces.join(", ")})` : ""}${a.nota ? ` — ${a.nota}` : ""}`;
            const jaExiste = diagnosticosExistentes.some((d) => d.dente === r.regiao && d.descricao === descricao);
            return (
              <div key={`a${i}`} className="flex items-center justify-between gap-2 text-[11px] text-secondary-foreground">
                <span>achado: {descricao}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={jaExiste || criando}
                  onClick={() => aoCriarDiagnostico({ dente: r.regiao, faces: a.faces, descricao })}
                >
                  {jaExiste ? "já é diagnóstico" : "virar diagnóstico"}
                </Button>
              </div>
            );
          })}
          {(r.trabalhos ?? [])
            .filter((t) => t.estado === "proposto" || t.estado === "planejado")
            .map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 text-[11px] text-secondary-foreground">
                <span>
                  trabalho: {t.descricao || "sem descrição"}
                  {t.faces.length ? ` (${t.faces.join(", ")})` : ""}
                </span>
                <Button size="sm" variant="ghost" onClick={() => aoLancarTrabalho({ dente: r.regiao, faces: t.faces })}>
                  lançar na matriz
                </Button>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// A execução de uma célula, face a face (Subetapa 03.8.b, passo 36)
// ============================================================
/**
 * Uma célula de procedimento tem uma unidade de trabalho por face planejada
 * — ou uma só, quando foi planejada sem face. Cada unidade executada mostra
 * a DATA e o AUTOR que o banco gravou; cada unidade que falta vira um botão,
 * se a execução estiver liberada, ou a explicação de por que não está.
 */
function ExecucaoDaCelula({
  celula,
  liberadaPor,
  marcando,
  aoMarcar,
}: {
  celula: Plano["procedimentos"][number];
  liberadaPor: string | null;
  marcando: boolean;
  aoMarcar: (face: string | null) => void;
}) {
  const unidades: (string | null)[] = celula.faces?.length ? celula.faces : [null];
  const feitas = new Map((celula.execucoes ?? []).map((e) => [e.face ?? "", e]));
  const faltam = unidades.filter((u) => !feitas.has(u ?? ""));

  return (
    <div className="flex flex-col gap-0.5 pl-1 text-[10px]" data-execucao-celula={celula.id}>
      {(celula.execucoes ?? []).map((e) => (
        <span key={e.face ?? "-"} className="text-success" data-face-executada={e.face ?? "unidade"}>
          ✓ {e.face ?? "executado"} · {data.format(new Date(e.executado_em))}
          {e.executado_por_nome ? ` · ${e.executado_por_nome}` : ""}
        </span>
      ))}
      {faltam.length > 0 && liberadaPor && (
        <span className="flex flex-wrap items-center gap-1">
          {faltam.map((u) => (
            <button
              key={u ?? "-"}
              type="button"
              disabled={marcando}
              onClick={() => aoMarcar(u)}
              className="rounded-[4px] border border-border px-1.5 py-0.5 text-[10px] text-secondary-foreground hover:bg-content disabled:opacity-45"
              data-marcar-face={u ?? "unidade"}
            >
              marcar {u ?? "executado"}
            </button>
          ))}
          {liberadaPor === "dispensa" && <span className="text-muted-foreground">(dispensado de contrato)</span>}
        </span>
      )}
      {faltam.length > 0 && !liberadaPor && (
        <span className="text-muted-foreground">sem contrato assinado — não se executa</span>
      )}
    </div>
  );
}

// ============================================================
// A matriz: fase na linha, opção na coluna — e a montagem dela
// ============================================================
function proximoRotulo(existentes: string[]): string {
  for (let i = 0; i < 26; i++) {
    const r = String.fromCharCode(65 + i);
    if (!existentes.includes(r)) return r;
  }
  return String(existentes.length + 1);
}

function Matriz({
  plano,
  clienteId,
  opcaoAtiva,
  aoTrocarOpcao,
  podeMontar,
}: {
  plano: Plano;
  clienteId: string;
  opcaoAtiva: string | null;
  aoTrocarOpcao: (id: string) => void;
  podeMontar: boolean;
}) {
  const { data: fases = [] } = useFases();
  const { data: nomes } = useNomesDeProcedimento();
  const { data: procedimentos = [] } = useProcedimentosDoCatalogo();
  const { data: pacotes = [] } = usePacotesDoCatalogo();

  const criarOpcao = useCriarOpcao(clienteId);
  const criarDiagnostico = useCriarDiagnostico(clienteId);
  const acrescentar = useAcrescentarItem(plano.id, clienteId);
  const remover = useRemoverItem(plano.id, clienteId);
  // PASSO 36: marcar a face executada. Liberada é o BANCO que diz — contrato
  // assinado ou dispensa do proprietário (D-V8) —; a tela só mostra o botão
  // onde ele vai ser aceito e explica onde não vai.
  const { data: liberadas } = useExecucaoLiberada(plano.id);
  const marcarFace = useMarcarFaceExecutada(plano.id, clienteId);

  const nomeDoPacote = useMemo(() => new Map(pacotes.map((p) => [p.id, p.nome])), [pacotes]);

  // ---- o formulário da célula
  const [aberto, setAberto] = useState(false);
  const [faseId, setFaseId] = useState("");
  const [itemSel, setItemSel] = useState("");
  const [dente, setDente] = useState("");
  const [faces, setFaces] = useState<string[]>([]);
  const [diagnosticoId, setDiagnosticoId] = useState("");

  // ---- o formulário de diagnóstico
  const [diagAberto, setDiagAberto] = useState(false);
  const [diagDente, setDiagDente] = useState("");
  const [diagDescricao, setDiagDescricao] = useState("");

  const [odontogramaAberto, setOdontogramaAberto] = useState(false);

  const fasesAtivas = fases.filter((f) => f.ativa);
  useEffect(() => {
    if (!faseId && fasesAtivas.length) {
      setFaseId(fasesAtivas.find((f) => f.chave === "definitiva")?.id ?? fasesAtivas[0].id);
    }
  }, [faseId, fasesAtivas]);

  const ehPacote = itemSel.startsWith("pacote:");
  const idDoItem = itemSel.slice(itemSel.indexOf(":") + 1);
  const procEscolhido = !ehPacote ? procedimentos.find((p) => p.id === idDoItem) ?? null : null;
  const aceitaFace = !!procEscolhido?.facesMaximo;

  const usadas = useMemo(() => {
    const ids = new Set(plano.procedimentos.map((p) => p.fase_id));
    return fases.filter((f) => ids.has(f.id));
  }, [fases, plano.procedimentos]);

  // A FILA DE TRABALHO é derivada no banco (`fasado: false`) — diagnóstico
  // sem procedimento nenhum. É por ela que o planejamento começa.
  const fila = plano.diagnosticos.filter((d) => !d.fasado);

  function nomeDaCelula(c: Plano["procedimentos"][number]) {
    if (c.pacote_id) return nomeDoPacote.get(c.pacote_id) ?? "pacote";
    return nomes?.get(c.procedimento_id ?? "") ?? "procedimento";
  }

  function limparItem() {
    setItemSel("");
    setDente("");
    setFaces([]);
    setDiagnosticoId("");
  }

  return (
    <Card className="flex flex-col gap-3 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium text-foreground">{plano.titulo}</span>
          <span className="text-[11px] text-muted-foreground">
            Fase clínica na linha, opção concorrente na coluna. A ordem das fases é clínica, não comercial.
          </span>
        </div>
        {podeMontar && (
          <Button
            size="sm"
            variant="secondary"
            disabled={criarOpcao.isPending}
            onClick={() =>
              criarOpcao.mutate(
                {
                  planoId: plano.id,
                  rotulo: proximoRotulo(plano.opcoes.map((o) => o.rotulo)),
                  ordem: plano.opcoes.length + 1,
                },
                { onSuccess: (id) => aoTrocarOpcao(id) },
              )
            }
          >
            + Opção {proximoRotulo(plano.opcoes.map((o) => o.rotulo))}
          </Button>
        )}
      </div>
      <Erro erro={criarOpcao.error} />

      {plano.opcoes.length === 0 && (
        <span className="text-[11px] text-muted-foreground">
          Este plano ainda não tem nenhuma opção de tratamento.
          {podeMontar ? " Crie a opção A para começar." : ""}
        </span>
      )}

      {plano.opcoes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse" data-matriz>
            <thead>
              <tr>
                <th className="w-[130px] border-b border-border pb-1.5 text-left font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
                  Fase
                </th>
                {plano.opcoes.map((o) => (
                  <th key={o.id} className="border-b border-border pb-1.5 text-left">
                    <button
                      type="button"
                      onClick={() => aoTrocarOpcao(o.id)}
                      className={`rounded-[5px] px-2 py-1 text-[11px] ${
                        o.id === opcaoAtiva ? "bg-accent font-semibold text-accent-foreground" : "text-secondary-foreground hover:bg-content"
                      }`}
                    >
                      Opção {o.rotulo}
                      {o.consentida_em && <span className="ml-1 text-[9.5px] text-success">consentida</span>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usadas.map((f) => (
                <tr key={f.id}>
                  <td className="border-b border-hairline py-2 align-top text-[11px] text-secondary-foreground">
                    {f.rotulo}
                  </td>
                  {plano.opcoes.map((o) => {
                    const celulas = plano.procedimentos.filter((p) => p.fase_id === f.id && p.opcao_id === o.id);
                    return (
                      <td key={o.id} className="border-b border-hairline py-2 align-top">
                        <div className="flex flex-col gap-1">
                          {celulas.length === 0 && <span className="text-[10.5px] text-muted-foreground">—</span>}
                          {celulas.map((c) => (
                            <div key={c.id} className="flex flex-col gap-0.5">
                            <span
                              data-celula={c.pacote_id ? "pacote" : "procedimento"}
                              className={`group flex items-baseline justify-between gap-1.5 text-[11px] ${c.recusado_em ? "text-muted-foreground line-through" : "text-foreground"}`}
                            >
                              <span>
                                {nomeDaCelula(c)}
                                {c.pacote_id && <span className="ml-1 text-[9.5px] text-muted-foreground">(pacote)</span>}
                                {c.dente && (
                                  <span className="ml-1 font-mono text-[9.5px] text-muted-foreground">
                                    {c.dente}
                                    {c.faces?.length ? ` · ${c.faces.join(", ")}` : ""}
                                  </span>
                                )}
                              </span>
                              {podeMontar && c.estado === "proposto" && !c.recusado_em && (
                                <button
                                  type="button"
                                  aria-label={`Remover ${nomeDaCelula(c)}`}
                                  onClick={() => remover.mutate(c.id)}
                                  disabled={remover.isPending}
                                  className="shrink-0 text-[10px] text-muted-foreground hover:text-destructive"
                                >
                                  ×
                                </button>
                              )}
                            </span>
                            {c.procedimento_id && !c.recusado_em && (c.estado === "planejado" || c.estado === "em_execucao" || c.estado === "executado") && (
                              <ExecucaoDaCelula
                                celula={c}
                                liberadaPor={liberadas?.get(c.id) ?? null}
                                marcando={marcarFace.isPending}
                                aoMarcar={(face) => marcarFace.mutate({ celulaId: c.id, face })}
                              />
                            )}
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {usadas.length === 0 && (
                <tr>
                  <td colSpan={plano.opcoes.length + 1} className="py-3 text-[11px] text-muted-foreground">
                    Nenhum item fasado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <Erro erro={remover.error} />
      <Erro erro={marcarFace.error} />

      {fila.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-md border border-border bg-content p-2.5">
          <span className="text-[11px] font-medium text-secondary-foreground">
            Fila de trabalho — diagnósticos ainda não fasados
          </span>
          {fila.map((d) => (
            <span key={d.id} className="text-[11px] text-muted-foreground">
              {d.dente ? <span className="font-mono">{d.dente} </span> : null}
              {d.descricao}
            </span>
          ))}
        </div>
      )}

      {/* ---------------- A MONTAGEM ---------------- */}
      {podeMontar && plano.opcoes.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={aberto ? "default" : "secondary"} onClick={() => setAberto(!aberto)}>
              Acrescentar item à opção
            </Button>
            <Button size="sm" variant={diagAberto ? "default" : "secondary"} onClick={() => setDiagAberto(!diagAberto)}>
              Novo diagnóstico
            </Button>
            <Button
              size="sm"
              variant={odontogramaAberto ? "default" : "secondary"}
              onClick={() => setOdontogramaAberto(!odontogramaAberto)}
            >
              Trazer do odontograma
            </Button>
          </div>

          {odontogramaAberto && (
            <div className="rounded-md border border-border p-2.5">
              <DoOdontograma
                clienteId={clienteId}
                diagnosticosExistentes={plano.diagnosticos}
                criando={criarDiagnostico.isPending}
                aoCriarDiagnostico={(d) => criarDiagnostico.mutate({ planoId: plano.id, ...d })}
                aoLancarTrabalho={(t) => {
                  setAberto(true);
                  setDente(t.dente);
                  setFaces(t.faces);
                  if (itemSel.startsWith("pacote:")) setItemSel("");
                }}
              />
            </div>
          )}

          {diagAberto && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2.5" data-form="diagnostico">
              <input
                value={diagDente}
                onChange={(e) => setDiagDente(e.target.value)}
                placeholder="Dente (FDI)"
                aria-label="Dente do diagnóstico"
                className={`${campo} w-[90px]`}
              />
              <input
                value={diagDescricao}
                onChange={(e) => setDiagDescricao(e.target.value)}
                placeholder="Diagnóstico (ex.: cárie oclusal)"
                aria-label="Descrição do diagnóstico"
                className={`${campo} min-w-[200px] flex-1`}
              />
              <Button
                size="sm"
                disabled={!diagDescricao.trim() || criarDiagnostico.isPending}
                onClick={() =>
                  criarDiagnostico.mutate(
                    { planoId: plano.id, dente: diagDente.trim() || null, faces: [], descricao: diagDescricao.trim() },
                    { onSuccess: () => { setDiagDente(""); setDiagDescricao(""); } },
                  )
                }
              >
                Gravar diagnóstico
              </Button>
            </div>
          )}
          <Erro erro={criarDiagnostico.error} />

          {aberto && (
            <div className="flex flex-col gap-2 rounded-md border border-border p-2.5" data-form="item">
              <div className="flex flex-wrap items-center gap-2">
                <select value={opcaoAtiva ?? ""} onChange={(e) => aoTrocarOpcao(e.target.value)} aria-label="Opção" className={campo}>
                  {plano.opcoes.map((o) => (
                    <option key={o.id} value={o.id}>
                      Opção {o.rotulo}
                    </option>
                  ))}
                </select>
                <select value={faseId} onChange={(e) => setFaseId(e.target.value)} aria-label="Fase" className={campo}>
                  {fasesAtivas.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.rotulo}
                    </option>
                  ))}
                </select>
                <select
                  value={itemSel}
                  onChange={(e) => setItemSel(e.target.value)}
                  aria-label="Procedimento ou pacote"
                  className={`${campo} min-w-[220px] flex-1`}
                >
                  <option value="">Escolha o procedimento ou o pacote…</option>
                  <optgroup label="Procedimentos">
                    {procedimentos.map((p) => (
                      <option key={p.id} value={`procedimento:${p.id}`}>
                        {p.nome}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Pacotes">
                    {pacotes
                      .filter((p) => p.ativo)
                      .map((p) => (
                        <option key={p.id} value={`pacote:${p.id}`}>
                          {p.nome}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>

              {!ehPacote && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={dente}
                    onChange={(e) => setDente(e.target.value)}
                    placeholder="Dente (FDI)"
                    aria-label="Dente"
                    className={`${campo} w-[90px]`}
                  />
                  {aceitaFace &&
                    FACES.map((f) => (
                      <label key={f} className="flex items-center gap-1 text-[10.5px] text-secondary-foreground">
                        <input
                          type="checkbox"
                          checked={faces.includes(f)}
                          onChange={() => setFaces(faces.includes(f) ? faces.filter((x) => x !== f) : [...faces, f])}
                        />
                        {f}
                      </label>
                    ))}
                  {procEscolhido?.facesMaximo && (
                    <span className="text-[10px] text-muted-foreground">
                      {procEscolhido.facesMinimo ?? 0} a {procEscolhido.facesMaximo} face(s)
                    </span>
                  )}
                </div>
              )}
              {ehPacote && (
                <span className="text-[10.5px] text-muted-foreground">
                  Pacote não se lança por dente nem por face — é um combo de sessões.
                </span>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={diagnosticoId}
                  onChange={(e) => setDiagnosticoId(e.target.value)}
                  aria-label="Diagnóstico vinculado"
                  className={`${campo} min-w-[200px] flex-1`}
                >
                  <option value="">Sem diagnóstico vinculado</option>
                  {plano.diagnosticos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.dente ? `${d.dente} — ` : ""}
                      {d.descricao}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={!opcaoAtiva || !faseId || !itemSel || acrescentar.isPending}
                  onClick={() =>
                    acrescentar.mutate(
                      {
                        planoId: plano.id,
                        opcaoId: opcaoAtiva!,
                        faseId,
                        item: { tipo: ehPacote ? "pacote" : "procedimento", id: idDoItem },
                        dente: dente.trim() || null,
                        faces,
                        diagnosticoId: diagnosticoId || null,
                      },
                      { onSuccess: limparItem },
                    )
                  }
                >
                  {acrescentar.isPending ? "Gravando…" : "Gravar na opção"}
                </Button>
              </div>
              <Erro erro={acrescentar.error} />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ============================================================
// Plano novo
// ============================================================
function NovoPlano({ clienteId, aoCriar }: { clienteId: string; aoCriar: (id: string) => void }) {
  const { data: profissionais = [] } = useProfissionaisComTipo();
  const criar = useCriarPlano(clienteId);
  const [titulo, setTitulo] = useState("");
  const [profissionalId, setProfissionalId] = useState("");

  return (
    <div className="flex flex-col gap-2" data-form="plano">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título do plano (ex.: Reabilitação anterior)"
          aria-label="Título do plano"
          className={`${campo} min-w-[220px] flex-1`}
        />
        <select
          value={profissionalId}
          onChange={(e) => setProfissionalId(e.target.value)}
          aria-label="Profissional responsável"
          className={campo}
        >
          <option value="">Profissional responsável…</option>
          {profissionais.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
              {p.tipo ? ` — ${p.tipo}` : ""}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={criar.isPending}
          onClick={() =>
            criar.mutate({ titulo, profissionalId: profissionalId || null }, { onSuccess: (id) => aoCriar(id) })
          }
        >
          {criar.isPending ? "Criando…" : "Criar plano"}
        </Button>
      </div>
      <Erro erro={criar.error} />
    </div>
  );
}

// ============================================================
// A vista da recepção: o orçamento sem o plano clínico
// ============================================================
/**
 * Quem não tem alcance clínico — a recepção, tipicamente — recebe
 * `ler_planos` vazio, e é assim que tem de ser. Mas é a recepção que
 * apresenta o orçamento e mexe em desconto e parcela (D-F3), então ela
 * precisa CHEGAR ao orçamento. Chega por `planos_orcados_do_cliente`, que
 * não devolve nada clínico, e lê cada orçamento por `ler_orcamentos`, que já
 * esconde dente e face de quem não tem alcance.
 */
function OrcamentosDaRecepcao({
  clienteId,
  pacienteNome,
  planosOrcados,
}: {
  clienteId: string;
  pacienteNome: string;
  planosOrcados: { plano_id: string; criado_em: string }[];
}) {
  const [planoId, setPlanoId] = useState(planosOrcados[planosOrcados.length - 1]?.plano_id ?? null);
  const { data: orcamentos = [], isPending } = useOrcamentos(planoId);

  return (
    <div className="flex flex-col gap-3" data-vista="recepcao">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-content px-2.5 py-2 text-[10.5px] leading-relaxed text-muted-foreground">
        <span className="flex-1">
          Você vê os <strong>orçamentos</strong> deste paciente, sem o plano clínico: o planejamento é dado de saúde e
          fica com quem tem alcance clínico. Desconto, parcela e juros são seus; a aprovação é do profissional que vai
          executar.
        </span>
        {planosOrcados.length > 1 && (
          <select value={planoId ?? ""} onChange={(e) => setPlanoId(e.target.value)} aria-label="Plano" className={campo}>
            {planosOrcados.map((p) => (
              <option key={p.plano_id} value={p.plano_id}>
                Plano de {data.format(new Date(p.criado_em))}
              </option>
            ))}
          </select>
        )}
      </div>
      {isPending && <span className="text-[11px] text-muted-foreground">Carregando os orçamentos…</span>}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {planoId &&
          orcamentos.map((o) => (
            <PainelOrcamento key={o.id} orcamento={o} planoId={planoId} clienteId={clienteId} pacienteNome={pacienteNome} />
          ))}
      </div>
    </div>
  );
}

// ============================================================
export function PlanoPage() {
  const { clienteId } = useParams<{ clienteId: string }>();
  const { data: clientes = [] } = useClientesDaConta();
  const { data: planos = [], isPending, error } = usePlanos(clienteId ?? null);
  const { data: podeMontar = false } = usePodePlanejar(clienteId ?? null, "criacao");
  const { data: planosOrcados = [] } = usePlanosOrcados(clienteId ?? null);

  const [planoAtivo, setPlanoAtivo] = useState<string | null>(null);
  const [opcaoAtiva, setOpcaoAtiva] = useState<string | null>(null);
  const [criandoPlano, setCriandoPlano] = useState(false);

  const plano = planos.find((p) => p.id === planoAtivo) ?? planos[0] ?? null;
  const { data: orcamentos = [] } = useOrcamentos(plano?.id ?? null);
  const montar = useMontarOrcamento(plano?.id ?? null, clienteId ?? null);
  const montarTodos = useMontarTodosOsOrcamentos(plano?.id ?? null, clienteId ?? null);

  useEffect(() => {
    if (plano && !plano.opcoes.some((o) => o.id === opcaoAtiva)) {
      setOpcaoAtiva(plano.opcoes[0]?.id ?? null);
    }
  }, [plano, opcaoAtiva]);

  if (!clienteId) return <SelecionarPaciente />;

  const paciente = clientes.find((c) => c.id === clienteId);
  const orcamento = orcamentos.find((o) => o.opcao_id === opcaoAtiva) ?? null;
  const semAlcanceClinico = orcamentos.length > 0 && orcamentos.every((o) => !o.com_detalhe_clinico);
  // Plano nenhum visível, mas orçamento existente: é a recepção (ou outro
  // papel sem alcance clínico). Não é "paciente sem plano".
  const vistaDaRecepcao = !isPending && !error && planos.length === 0 && planosOrcados.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[15px] font-medium text-foreground">{paciente?.nome ?? "Plano"}</h1>
          <span className="text-[11.5px] text-muted-foreground">
            Plano de tratamento e orçamento. <Link to="/plano" className="text-primary underline-offset-2 hover:underline">trocar de paciente</Link>
            {" · "}
            <Link to={`/prontuario/${clienteId}`} className="text-primary underline-offset-2 hover:underline">
              abrir prontuário
            </Link>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {planos.length > 1 && (
            <select
              value={plano?.id ?? ""}
              onChange={(e) => setPlanoAtivo(e.target.value)}
              aria-label="Plano"
              className={campo}
            >
              {planos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titulo}
                </option>
              ))}
            </select>
          )}
          {podeMontar && planos.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setCriandoPlano(!criandoPlano)}>
              + Novo plano
            </Button>
          )}
        </div>
      </div>

      {isPending && <span className="text-[11px] text-muted-foreground">Carregando o plano…</span>}
      {error && (
        <Card className="p-4 text-[11px] text-destructive">
          Não foi possível ler o plano: {(error as Error).message}
        </Card>
      )}

      {vistaDaRecepcao && (
        <OrcamentosDaRecepcao clienteId={clienteId} pacienteNome={paciente?.nome ?? "Paciente"} planosOrcados={planosOrcados} />
      )}

      {(criandoPlano || (!isPending && !error && planos.length === 0 && !vistaDaRecepcao)) && (
        <Card className="flex flex-col gap-2 p-4">
          {planos.length === 0 && (
            <span className="text-[12px] text-foreground">Este paciente ainda não tem plano de tratamento.</span>
          )}
          {podeMontar ? (
            <>
              <span className="text-[11px] text-muted-foreground">
                Crie o plano, depois as opções concorrentes. Os itens podem vir do odontograma do prontuário.
              </span>
              <NovoPlano
                clienteId={clienteId}
                aoCriar={(id) => {
                  setPlanoAtivo(id);
                  setCriandoPlano(false);
                }}
              />
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              Montar plano exige alcance clínico sobre este paciente e a permissão de criação do módulo Plano. Quem
              precisa pede a liberação ao proprietário da conta.
            </span>
          )}
        </Card>
      )}

      {/* A tela DIZ o que não está mostrando. Coluna vazia sem explicação
          é lida como "não tem", e aqui o certo é "você não pode ver". */}
      {semAlcanceClinico && (
        <div className="rounded-md border border-border bg-content px-2.5 py-2 text-[10.5px] leading-relaxed text-muted-foreground">
          Você está vendo o orçamento <strong>sem o detalhe clínico</strong>: os valores, o total e o nome de cada
          item aparecem; dente e face, não. Isso é o alcance clínico de <code>aba_health</code>, não uma falha
          de carregamento — quem precisa do detalhe pede a liberação ao proprietário da conta.
        </div>
      )}

      {plano && plano.opcoes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={montarTodos.isPending}
            onClick={() =>
              montarTodos.mutate({ opcoes: plano.opcoes.map((o) => o.id), profissionalId: plano.profissional_id ?? null })
            }
          >
            {montarTodos.isPending ? "Decidindo os preços…" : "Gerar orçamento de todas as opções"}
          </Button>
          <span className="text-[10.5px] text-muted-foreground">
            O preço de cada item é decidido pelas tabelas de preço — ninguém escolhe tabela.
          </span>
          <Erro erro={montarTodos.error} />
        </div>
      )}

      {plano && (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.1fr_1fr]">
          <Matriz
            plano={plano}
            clienteId={clienteId}
            opcaoAtiva={opcaoAtiva}
            aoTrocarOpcao={setOpcaoAtiva}
            podeMontar={podeMontar}
          />

          {orcamento ? (
            <PainelOrcamento
              orcamento={orcamento}
              planoId={plano.id}
              clienteId={clienteId}
              pacienteNome={paciente?.nome ?? "Paciente"}
            />
          ) : (
            <Card className="flex flex-col gap-2 p-3.5">
              <span className="text-[13px] font-medium text-foreground">Orçamento</span>
              <span className="text-[11px] text-muted-foreground">
                {opcaoAtiva
                  ? "Esta opção ainda não tem orçamento. Gerar decide o preço de cada item pelas tabelas de preço — ninguém escolhe tabela."
                  : "Escolha uma opção do plano para ver o orçamento dela."}
              </span>
              {opcaoAtiva && (
                <Button
                  onClick={() =>
                    montar.mutate({ opcaoId: opcaoAtiva, profissionalId: plano.profissional_id ?? null })
                  }
                  disabled={montar.isPending}
                >
                  {montar.isPending ? "Decidindo os preços…" : "Gerar o orçamento desta opção"}
                </Button>
              )}
              <Erro erro={montar.error} />
            </Card>
          )}
        </div>
      )}

      {/* Os contratos aparecem SEMPRE, para os dois lados. O pacote vendido no
          Financeiro (D-F14) nasce contrato sem plano e sem orçamento, e é para
          cá que o aviso de lá manda a recepção — esconder o bloco sem plano
          deixaria esse contrato sem tela onde se assinar. */}
      {!isPending && (
        <ContratosDoPaciente clienteId={clienteId} pacienteNome={paciente?.nome ?? "Paciente"} />
      )}
    </div>
  );
}
