import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useNomesDeProcedimento, useProfissionaisComTipo } from "@/features/treatment/api";
import {
  DEGRAUS,
  rotuloDoDegrau,
  useComprometerTabela,
  useCriarTabelaPreco,
  useDefinirTarifa,
  useEncerrarTabela,
  useReajustarTabela,
  useTabelasPreco,
  useTarifas,
  type EscopoTabela,
} from "@/features/finance/precos";
import { CardSecao, Nota, Pill, Rotulo, TituloSecao, Vazio } from "./ui";

/**
 * Seção "Tabelas de preço" da tela `1m` (Subetapa 03.8.a).
 *
 * ============================================================
 * A SEÇÃO EXISTE PORQUE A ESCADA PRECISA DE DEGRAUS
 * ============================================================
 * O preço se resolve sozinho no momento do lançamento — mas alguém tem de
 * ter dito, antes, quanto custa cada procedimento em cada degrau. É esta a
 * tela onde isso se diz, e é da **recepção**: só `admin` escreve tabela de
 * preço e tarifa, por policy (`048` §10).
 *
 * ============================================================
 * NÃO HÁ BOTÃO DE EDITAR PREÇO COMPROMETIDO, E ISSO É O PONTO
 * ============================================================
 * Tarifa comprometida é imutável no banco (`23514`, gatilho
 * `conferir_tarifa_imutavel`). A tela não oferece a edição porque ela não
 * existe: um `UPDATE` no preço de ontem reescreveria, em silêncio, o valor
 * de um acordo já assinado, faturado e pago — e isso não tem conserto
 * retroativo. O caminho é **Reajustar**, que cria uma TABELA NOVA em
 * rascunho, copiando as tarifas com o percentual, para ser conferida antes
 * de valer.
 *
 * Os degraus `Clínica` e `Grupo de clínicas` aparecem sem discriminador:
 * multiunidade é a Subetapa 03.9, e não existe hoje tabela de unidade para
 * apontar. Eles já distinguem pela PRECEDÊNCIA, que é útil desde já — uma
 * tabela "Clínica" vence a "Prática", que é o padrão herdado da rede.
 */
export function TabelasDePreco() {
  const { profile } = useAuth();
  const ehAdmin = profile?.accountRole === "admin" || profile?.accountRole === "owner";

  const { data: tabelas = [], isPending, error } = useTabelasPreco();
  const { data: profissionais = [] } = useProfissionaisComTipo();
  const { data: nomes } = useNomesDeProcedimento();

  const criar = useCriarTabelaPreco();
  const comprometer = useComprometerTabela();
  const reajustar = useReajustarTabela();
  const encerrar = useEncerrarTabela();
  const definirTarifa = useDefinirTarifa();

  const [aberta, setAberta] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [escopo, setEscopo] = useState<EscopoTabela>("pratica");
  const [tipoId, setTipoId] = useState("");
  const [percentual, setPercentual] = useState("10");
  const [procedimentoId, setProcedimentoId] = useState("");
  const [valor, setValor] = useState("");

  const { data: tarifas = [] } = useTarifas(aberta);

  // Tipos distintos, deduzidos de quem os usa — a lista de tipos é catálogo
  // de `aba_scheduling`, e aqui só se precisa dela para escolher o degrau.
  const tipos = Array.from(
    new Map(profissionais.filter((p) => p.tipoId).map((p) => [p.tipoId!, p.tipo ?? p.tipoId!])).entries(),
  );

  if (isPending) return <Vazio>Carregando tabelas de preço…</Vazio>;
  if (error) return <Vazio>Não foi possível ler as tabelas: {(error as Error).message}</Vazio>;

  return (
    <div className="flex flex-col gap-3">
      <CardSecao>
        <TituloSecao
          titulo="A escada de preço"
          descricao="O preço se resolve percorrendo os degraus, do mais específico para o mais geral. Ninguém escolhe tabela na hora do lançamento."
        />
        <div className="flex flex-col">
          {DEGRAUS.map((d, i) => (
            <div
              key={d.escopo}
              className="grid grid-cols-[24px_150px_1fr] items-baseline gap-2 border-b border-hairline py-1.5 text-[11px] text-secondary-foreground last:border-b-0"
            >
              <span className="font-mono text-[10px] text-muted-foreground">{i + 1}º</span>
              <span>{d.rotulo}</span>
              <span className="text-[10.5px] text-muted-foreground">{d.nota}</span>
            </div>
          ))}
        </div>
        <Nota>
          A primeira tabela <strong>comprometida e vigente</strong> que tiver tarifa para o procedimento vence. Se
          nenhuma alcançar, vale o <code>preco_base</code> do catálogo — e o orçamento diz de qual degrau o número
          veio.
        </Nota>
      </CardSecao>

      <CardSecao>
        <TituloSecao
          titulo="Tabelas desta conta"
          descricao="Rascunho se edita; comprometida é imutável; encerrada continua existindo como proveniência do passado."
        />
        {tabelas.length === 0 ? (
          <Vazio>Nenhuma tabela de preço cadastrada. Sem nenhuma, todo orçamento resolve pelo catálogo.</Vazio>
        ) : (
          <div className="flex flex-col">
            <div className="grid grid-cols-[1fr_130px_80px_100px_1fr] gap-2 border-b border-border pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
              <span>Tabela</span>
              <span>Degrau</span>
              <span>Tarifas</span>
              <span>Estado</span>
              <span>Vigência</span>
            </div>
            {tabelas.map((t) => (
              <div key={t.id} className="flex flex-col border-b border-hairline last:border-b-0">
                <button
                  type="button"
                  onClick={() => setAberta(aberta === t.id ? null : t.id)}
                  className="grid grid-cols-[1fr_130px_80px_100px_1fr] items-center gap-2 py-2 text-left text-[11px] text-secondary-foreground hover:bg-content"
                >
                  <span className="truncate">{t.nome}</span>
                  <span className="text-[10.5px]">{rotuloDoDegrau(t.escopo)}</span>
                  <span className="font-mono">{t.tarifas}</span>
                  <span>
                    <Pill tom={t.estado === "comprometida" ? "success" : t.estado === "rascunho" ? "warning" : "muted"}>
                      {t.estado}
                    </Pill>
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {t.vigente_de ?? "—"} {t.vigente_ate ? `→ ${t.vigente_ate}` : t.vigente_de ? "→ em aberto" : ""}
                  </span>
                </button>

                {aberta === t.id && (
                  <div className="flex flex-col gap-2 bg-content px-3 py-2.5">
                    <div className="flex flex-col">
                      {tarifas.length === 0 && <Vazio>Nenhuma tarifa nesta tabela.</Vazio>}
                      {tarifas.map((tf) => (
                        <div
                          key={tf.id}
                          className="flex items-baseline justify-between border-b border-hairline py-1 text-[11px] text-secondary-foreground last:border-b-0"
                        >
                          <span className="truncate">{nomes?.get(tf.procedimento_id) ?? tf.procedimento_id}</span>
                          <span className="font-mono">
                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                              Number(tf.valor),
                            )}
                          </span>
                        </div>
                      ))}
                    </div>

                    {!ehAdmin && <Nota>Só a recepção define preço. Você está vendo em modo leitura.</Nota>}

                    {ehAdmin && t.estado === "rascunho" && (
                      <div className="flex flex-col gap-2">
                        <Rotulo>Acrescentar tarifa</Rotulo>
                        <div className="flex flex-wrap gap-2">
                          <select
                            value={procedimentoId}
                            onChange={(e) => setProcedimentoId(e.target.value)}
                            className="min-w-[200px] flex-1 rounded-[5px] border border-input bg-background px-2 py-1 text-[11px]"
                          >
                            <option value="">Escolha o procedimento…</option>
                            {Array.from(nomes ?? new Map()).map(([id, n]) => (
                              <option key={id} value={id}>
                                {n}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={valor}
                            onChange={(e) => setValor(e.target.value)}
                            placeholder="Valor"
                            aria-label="Valor da tarifa"
                            className="w-[110px] rounded-[5px] border border-input bg-background px-2 py-1 text-[11px]"
                          />
                          <Button
                            size="sm"
                            disabled={!procedimentoId || !valor || definirTarifa.isPending}
                            onClick={() =>
                              definirTarifa.mutate(
                                { tabelaId: t.id, procedimentoId, valor: Number(valor) },
                                { onSuccess: () => { setProcedimentoId(""); setValor(""); } },
                              )
                            }
                          >
                            Gravar
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={t.tarifas === 0 || comprometer.isPending}
                            onClick={() => comprometer.mutate({ tabelaId: t.id })}
                            title="A partir daqui a tarifa é imutável e a tabela entra na escada."
                          >
                            Comprometer
                          </Button>
                        </div>
                        {definirTarifa.error && (
                          <span className="text-[10.5px] text-destructive">
                            {(definirTarifa.error as Error).message}
                          </span>
                        )}
                      </div>
                    )}

                    {ehAdmin && t.estado === "comprometida" && (
                      <div className="flex flex-col gap-2">
                        <Nota tom="atencao">
                          Esta tabela está <strong>comprometida</strong>: nenhuma tarifa dela se altera nem se apaga.
                          Reajustar cria uma tabela nova, em rascunho, com as tarifas copiadas — nenhum valor já
                          acordado muda, porque o valor acordado está congelado na linha do orçamento.
                        </Nota>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="number"
                            step="0.1"
                            value={percentual}
                            onChange={(e) => setPercentual(e.target.value)}
                            aria-label="Percentual de reajuste"
                            className="w-[90px] rounded-[5px] border border-input bg-background px-2 py-1 text-[11px]"
                          />
                          <span className="text-[10.5px] text-muted-foreground">% de reajuste</span>
                          <Button
                            size="sm"
                            disabled={reajustar.isPending}
                            onClick={() => reajustar.mutate({ tabelaId: t.id, percentual: Number(percentual) || 0 })}
                          >
                            Reajustar (tabela nova)
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={encerrar.isPending}
                            onClick={() => encerrar.mutate(t.id)}
                            title="Tira a tabela da escada sem substituí-la. Ela continua existindo como proveniência."
                          >
                            Encerrar
                          </Button>
                        </div>
                        {(reajustar.error || encerrar.error) && (
                          <span className="text-[10.5px] text-destructive">
                            {((reajustar.error ?? encerrar.error) as Error).message}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardSecao>

      {ehAdmin && (
        <CardSecao>
          <TituloSecao titulo="Nova tabela de preço" descricao="Nasce em rascunho: só entra na escada quando for comprometida." />
          <div className="flex flex-wrap gap-2">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome da tabela"
              aria-label="Nome da tabela"
              className="min-w-[180px] flex-1 rounded-[5px] border border-input bg-background px-2 py-1 text-[11px]"
            />
            <select
              value={escopo}
              onChange={(e) => setEscopo(e.target.value as EscopoTabela)}
              className="rounded-[5px] border border-input bg-background px-2 py-1 text-[11px]"
            >
              {DEGRAUS.filter((d) => d.escopo !== "catalogo" && d.escopo !== "paciente").map((d) => (
                <option key={d.escopo} value={d.escopo}>
                  {d.rotulo}
                </option>
              ))}
            </select>
            {escopo === "tipo_profissional" && (
              <select
                value={tipoId}
                onChange={(e) => setTipoId(e.target.value)}
                className="rounded-[5px] border border-input bg-background px-2 py-1 text-[11px]"
              >
                <option value="">Escolha o tipo…</option>
                {tipos.map(([id, rotulo]) => (
                  <option key={id} value={id}>
                    {rotulo}
                  </option>
                ))}
              </select>
            )}
            <Button
              size="sm"
              disabled={!nome.trim() || (escopo === "tipo_profissional" && !tipoId) || criar.isPending}
              onClick={() =>
                criar.mutate(
                  {
                    nome: nome.trim(),
                    escopo,
                    tipo_profissional_id: escopo === "tipo_profissional" ? tipoId : null,
                  },
                  { onSuccess: () => { setNome(""); setTipoId(""); } },
                )
              }
            >
              Criar
            </Button>
          </div>
          {criar.error && <span className="text-[10.5px] text-destructive">{(criar.error as Error).message}</span>}
          <Nota>
            Tabela do degrau <strong>Paciente</strong> não se cria aqui: ela é o preço pessoal de alguém — cortesia ou
            acordo pontual — e nasce na ficha do próprio paciente. É também o degrau que receberá o convênio quando o
            convênio existir (D-V5).
          </Nota>
        </CardSecao>
      )}
    </div>
  );
}
