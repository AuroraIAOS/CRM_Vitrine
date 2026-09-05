import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useClientesDaConta } from "@/features/health/api";
import { rotuloDoDegrau } from "@/features/finance/precos";
import {
  useAprovarOrcamento,
  useDefinirCondicoes,
  useFases,
  useMontarOrcamento,
  useNomesDeProcedimento,
  useOrcamentos,
  usePlanos,
  useProfissionaisComTipo,
  useSimularTroca,
  useTrocarProfissional,
  type LinhaSimulacao,
  type Orcamento,
  type Plano,
} from "./api";

/**
 * Tela do módulo `treatment` — rótulo **"Plano"** (Subetapa 03.8.a).
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
 * O PREÇO NÃO SE ESCOLHE — E NÃO HÁ ONDE ESCOLHER
 * ============================================================
 * Não existe nesta tela um seletor de tabela de preço. Não é uma decisão
 * de layout: `resolver_preco()` não tem parâmetro por onde recebê-la
 * (verificação (g) da migration `048`). O que a tela mostra é a
 * PROVENIÊNCIA — de qual degrau da escada e de qual tabela veio cada
 * número —, porque um valor congelado sem origem é um valor que ninguém
 * consegue auditar um ano depois.
 *
 * O que a pessoa escolhe é o **profissional que vai executar**, e essa
 * escolha move o preço pelo degrau "Tipo de profissional". Por isso a
 * troca passa por um aviso: a diferença aparece item a item ANTES de
 * confirmar. Sem isso, trocar o dentista de um procedimento já orçado
 * corrigiria o financeiro em silêncio.
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
            O preço se resolve pelo tipo do profissional que vai executar. Confira a diferença antes de confirmar —
            depois de aprovado, o valor congela.
          </span>
        </div>

        <div className="flex flex-col">
          <div className="grid grid-cols-[1fr_90px_90px_90px] gap-2 border-b border-border pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
            <span>Procedimento</span>
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
}: {
  orcamento: Orcamento;
  planoId: string;
  clienteId: string;
}) {
  const { profile } = useAuth();
  const ehAdmin = profile?.accountRole === "admin" || profile?.accountRole === "owner";

  const { data: profissionais = [] } = useProfissionaisComTipo();
  const simular = useSimularTroca();
  const trocar = useTrocarProfissional(planoId, clienteId);
  const condicoes = useDefinirCondicoes(planoId, clienteId);
  const aprovar = useAprovarOrcamento(planoId, clienteId);

  const [pendente, setPendente] = useState<{ id: string | null; nome: string; linhas: LinhaSimulacao[] } | null>(null);
  const [desconto, setDesconto] = useState(String(orcamento.desconto_valor ?? 0));
  const [motivo, setMotivo] = useState(orcamento.desconto_motivo ?? "");
  const [parcelas, setParcelas] = useState(String(orcamento.parcelas ?? 1));

  useEffect(() => {
    setDesconto(String(orcamento.desconto_valor ?? 0));
    setMotivo(orcamento.desconto_motivo ?? "");
    setParcelas(String(orcamento.parcelas ?? 1));
  }, [orcamento.id, orcamento.desconto_valor, orcamento.desconto_motivo, orcamento.parcelas]);

  const congelado = orcamento.estado !== "rascunho";

  async function pedirTroca(profissionalId: string) {
    const alvo = profissionais.find((p) => p.id === profissionalId) ?? null;
    const linhas = await simular.mutateAsync({ orcamentoId: orcamento.id, profissionalId: profissionalId || null });
    setPendente({ id: profissionalId || null, nome: alvo?.nome ?? "sem profissional", linhas });
  }

  return (
    <Card className="flex flex-col gap-3 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium text-foreground">Orçamento da opção {orcamento.opcao_rotulo}</span>
          <span className="text-[11px] text-muted-foreground">
            {congelado
              ? `Aprovado em ${orcamento.aprovado_em ? data.format(new Date(orcamento.aprovado_em)) : "—"} — os valores estão congelados.`
              : "Cada valor foi resolvido pela escada de preço, não escolhido."}
          </span>
        </div>
        {!congelado && (
          <Button
            onClick={() => aprovar.mutate(orcamento.id)}
            disabled={aprovar.isPending || orcamento.itens.length === 0}
          >
            {aprovar.isPending ? "Aprovando…" : "Aprovar orçamento"}
          </Button>
        )}
      </div>

      {/* Quem executa — a única escolha que move o preço. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-secondary-foreground">Executado por</span>
        <select
          value={orcamento.profissional_id ?? ""}
          disabled={congelado || simular.isPending}
          onChange={(e) => void pedirTroca(e.target.value)}
          className="rounded-[5px] border border-input bg-background px-2 py-1 text-[11px] text-foreground disabled:opacity-45"
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

      {/* Os itens, com a proveniência de cada valor. */}
      <div className="flex flex-col">
        <div className="grid grid-cols-[1fr_120px_100px] gap-2 border-b border-border pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
          <span>Procedimento</span>
          <span>Veio de</span>
          <span className="text-right">Valor</span>
        </div>
        {orcamento.itens.length === 0 && (
          <span className="py-3 text-[11px] text-muted-foreground">
            Nenhum procedimento nesta opção ainda. Monte a matriz do plano e recalcule o orçamento.
          </span>
        )}
        {orcamento.itens.map((i) => (
          <div
            key={i.id}
            className="grid grid-cols-[1fr_120px_100px] items-baseline gap-2 border-b border-hairline py-1.5 text-[11px] text-secondary-foreground last:border-b-0"
          >
            <span className="truncate">
              {i.procedimento}
              {i.dente && (
                <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                  dente {i.dente}
                  {i.faces?.length ? ` · ${i.faces.join(", ")}` : ""}
                </span>
              )}
            </span>
            <span className="truncate text-[10px] text-muted-foreground" title={i.tabela_preco ?? "preço do catálogo"}>
              {rotuloDoDegrau(i.degrau)}
            </span>
            <span className="text-right font-mono">{moeda.format(Number(i.valor_resolvido))}</span>
          </div>
        ))}
      </div>

      {/* As cinco condições de dinheiro — só a recepção mexe. */}
      <div className="flex flex-col gap-2 rounded-md border border-border bg-content p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-secondary-foreground">Condições comerciais</span>
          {!ehAdmin && (
            <span className="text-[10px] text-muted-foreground">
              desconto, parcela e juros são da recepção
            </span>
          )}
        </div>
        <div className="grid grid-cols-[110px_1fr_90px] gap-2">
          <input
            type="number"
            min={0}
            step="0.01"
            value={desconto}
            disabled={!ehAdmin || congelado}
            onChange={(e) => setDesconto(e.target.value)}
            placeholder="Desconto"
            aria-label="Desconto em reais"
            className="rounded-[5px] border border-input bg-background px-2 py-1 text-[11px] disabled:opacity-45"
          />
          <input
            value={motivo}
            disabled={!ehAdmin || congelado}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo do desconto"
            aria-label="Motivo do desconto"
            className="rounded-[5px] border border-input bg-background px-2 py-1 text-[11px] disabled:opacity-45"
          />
          <input
            type="number"
            min={1}
            max={120}
            value={parcelas}
            disabled={!ehAdmin || congelado}
            onChange={(e) => setParcelas(e.target.value)}
            placeholder="Parcelas"
            aria-label="Número de parcelas"
            className="rounded-[5px] border border-input bg-background px-2 py-1 text-[11px] disabled:opacity-45"
          />
        </div>
        {ehAdmin && !congelado && (
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
        {condicoes.error && (
          <span className="text-[10.5px] text-destructive">{(condicoes.error as Error).message}</span>
        )}
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
        <span className="font-mono text-[20px] text-foreground">{moeda.format(Number(orcamento.valor_liquido))}</span>
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
// A matriz: fase na linha, opção na coluna
// ============================================================
function Matriz({
  plano,
  opcaoAtiva,
  aoTrocarOpcao,
}: {
  plano: Plano;
  opcaoAtiva: string | null;
  aoTrocarOpcao: (id: string) => void;
}) {
  const { data: fases = [] } = useFases();
  const { data: nomes } = useNomesDeProcedimento();

  const usadas = useMemo(() => {
    const ids = new Set(plano.procedimentos.map((p) => p.fase_id));
    return fases.filter((f) => ids.has(f.id));
  }, [fases, plano.procedimentos]);

  // A FILA DE TRABALHO é derivada no banco (`fasado: false`) — diagnóstico
  // sem procedimento nenhum. É por ela que o planejamento começa.
  const fila = plano.diagnosticos.filter((d) => !d.fasado);

  return (
    <Card className="flex flex-col gap-3 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium text-foreground">{plano.titulo}</span>
          <span className="text-[11px] text-muted-foreground">
            Fase clínica na linha, opção concorrente na coluna. A ordem das fases é clínica, não comercial.
          </span>
        </div>
      </div>

      {plano.opcoes.length === 0 && (
        <span className="text-[11px] text-muted-foreground">Este plano ainda não tem nenhuma opção de tratamento.</span>
      )}

      {plano.opcoes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse">
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
                            <span
                              key={c.id}
                              className={`text-[11px] ${c.recusado_em ? "text-muted-foreground line-through" : "text-foreground"}`}
                            >
                              {nomes?.get(c.procedimento_id) ?? "procedimento"}
                              {c.dente && (
                                <span className="ml-1 font-mono text-[9.5px] text-muted-foreground">
                                  {c.dente}
                                  {c.faces?.length ? ` · ${c.faces.join(", ")}` : ""}
                                </span>
                              )}
                            </span>
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
                    Nenhum procedimento fasado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

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
    </Card>
  );
}

// ============================================================
export function PlanoPage() {
  const { clienteId } = useParams<{ clienteId: string }>();
  const { data: clientes = [] } = useClientesDaConta();
  const { data: planos = [], isPending, error } = usePlanos(clienteId ?? null);

  const [planoAtivo, setPlanoAtivo] = useState<string | null>(null);
  const [opcaoAtiva, setOpcaoAtiva] = useState<string | null>(null);

  const plano = planos.find((p) => p.id === planoAtivo) ?? planos[0] ?? null;
  const { data: orcamentos = [] } = useOrcamentos(plano?.id ?? null);
  const montar = useMontarOrcamento(plano?.id ?? null, clienteId ?? null);

  useEffect(() => {
    if (plano && !plano.opcoes.some((o) => o.id === opcaoAtiva)) {
      setOpcaoAtiva(plano.opcoes[0]?.id ?? null);
    }
  }, [plano, opcaoAtiva]);

  if (!clienteId) return <SelecionarPaciente />;

  const paciente = clientes.find((c) => c.id === clienteId);
  const orcamento = orcamentos.find((o) => o.opcao_id === opcaoAtiva) ?? null;
  const semAlcanceClinico = orcamentos.length > 0 && orcamentos.every((o) => !o.com_detalhe_clinico);

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
        {planos.length > 1 && (
          <select
            value={plano?.id ?? ""}
            onChange={(e) => setPlanoAtivo(e.target.value)}
            className="rounded-[5px] border border-input bg-background px-2 py-1 text-[11px]"
          >
            {planos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.titulo}
              </option>
            ))}
          </select>
        )}
      </div>

      {isPending && <span className="text-[11px] text-muted-foreground">Carregando o plano…</span>}
      {error && (
        <Card className="p-4 text-[11px] text-destructive">
          Não foi possível ler o plano: {(error as Error).message}
        </Card>
      )}

      {!isPending && planos.length === 0 && (
        <Card className="flex flex-col gap-1.5 p-4">
          <span className="text-[12px] text-foreground">Este paciente ainda não tem plano de tratamento.</span>
          <span className="text-[11px] text-muted-foreground">
            O plano nasce do odontograma, no prontuário: marque o achado e o trabalho a executar, e as opções
            concorrentes aparecem aqui.
          </span>
        </Card>
      )}

      {/* A tela DIZ o que não está mostrando. Coluna vazia sem explicação
          é lida como "não tem", e aqui o certo é "você não pode ver". */}
      {semAlcanceClinico && (
        <div className="rounded-md border border-border bg-content px-2.5 py-2 text-[10.5px] leading-relaxed text-muted-foreground">
          Você está vendo o orçamento <strong>sem o detalhe clínico</strong>: os valores, o total e o nome de cada
          procedimento aparecem; dente e face, não. Isso é o alcance clínico de <code>aba_health</code>, não uma falha
          de carregamento — quem precisa do detalhe pede a liberação ao proprietário da conta.
        </div>
      )}

      {plano && (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.1fr_1fr]">
          <Matriz plano={plano} opcaoAtiva={opcaoAtiva} aoTrocarOpcao={setOpcaoAtiva} />

          {orcamento ? (
            <PainelOrcamento orcamento={orcamento} planoId={plano.id} clienteId={clienteId} />
          ) : (
            <Card className="flex flex-col gap-2 p-3.5">
              <span className="text-[13px] font-medium text-foreground">Orçamento</span>
              <span className="text-[11px] text-muted-foreground">
                {opcaoAtiva
                  ? "Esta opção ainda não tem orçamento. Montar resolve o preço de cada procedimento pela escada — ninguém escolhe tabela."
                  : "Escolha uma opção do plano para ver o orçamento dela."}
              </span>
              {opcaoAtiva && (
                <Button
                  onClick={() =>
                    montar.mutate({ opcaoId: opcaoAtiva, profissionalId: plano.profissional_id ?? null })
                  }
                  disabled={montar.isPending}
                >
                  {montar.isPending ? "Resolvendo os preços…" : "Montar o orçamento"}
                </Button>
              )}
              {montar.error && (
                <span className="text-[10.5px] text-destructive">{(montar.error as Error).message}</span>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
