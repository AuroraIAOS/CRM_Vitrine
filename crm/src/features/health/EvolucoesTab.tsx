import { useState } from "react";
import { LinkAssinatura } from "./LinkAssinatura";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useCriarEvolucao,
  useNomesDeUsuarios,
  useProfissionais,
  useRegistrarRecusaAssinatura,
  type Evolucao,
  type TextoSessao,
} from "./api";
import { MAPAS, ehTipoMapa, marcacoesValidas } from "./mapas";

const formatoData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const formatoDataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Os cinco lugares de escrever a sessão (Subetapa 03.7.b).
 *
 * As quatro primeiras colunas existem desde a 013 e a tela nunca as havia
 * oferecido: o prontuário registrava desenho e não registrava palavra. A
 * quinta, `intercorrencia`, nasceu na 053 por D-F15 — evento adverso não
 * cabe dentro de "resultado", e um relatório precisa achar um sem ler o
 * outro. Os rótulos são os da clínica, não os nomes das colunas.
 */
const CAMPOS: { chave: keyof TextoSessao; rotulo: string; dica: string; linhas: number }[] = [
  { chave: "avaliacao", rotulo: "Avaliação", dica: "Queixa, exame e o que se observou.", linhas: 3 },
  { chave: "notasProcedimento", rotulo: "Conduta", dica: "O que foi feito na sessão.", linhas: 3 },
  { chave: "intercorrencia", rotulo: "Intercorrência", dica: "Evento adverso ou imprevisto. Vazio = nenhuma.", linhas: 2 },
  { chave: "resultado", rotulo: "Resultado", dica: "Como a sessão terminou.", linhas: 2 },
  { chave: "proximosPassos", rotulo: "Próximos passos", dica: "Retorno, orientação, encaminhamento.", linhas: 2 },
];

export type SessaoEmCurso = {
  evolucao: Evolucao | null;
  texto: TextoSessao;
  textoSujo: boolean;
  marcacoesSujas: boolean;
  aoAlterarTexto: (chave: keyof TextoSessao, valor: string) => void;
  aoSalvar: () => void;
  aoAssinar: () => void;
  aoAbrir: () => void;
  salvando: boolean;
  assinando: boolean;
  abrindo: boolean;
  podeCriar: boolean;
  profissionalId: string;
  aoEscolherProfissional: (id: string) => void;
  erro: string | null;
};

/**
 * Aba Evoluções da tela `1h`.
 *
 * DUAS METADES, separadas pelo fecho:
 *
 *   · ANTES do fecho, a sessão em curso: o profissional escreve durante o
 *     atendimento e salva quantas vezes quiser. O que ele escreveu fica NA
 *     evolução, não num adendo posterior.
 *
 *   · DEPOIS do fecho (`travada = true`), nada se altera. O banco recusa o
 *     `UPDATE` com `23514` (`impedir_alteracao_evolucao_travada`, 013); a
 *     tela oferece os dois únicos gestos que existem: adendo em linha nova e
 *     registrar que o paciente recusou assinar (D-F16) — sobre o texto final,
 *     uma única vez, com data e autor gravados pelo banco.
 */
export function EvolucoesTab({
  clienteId,
  evolucoes,
  podeEscrever,
  carregando,
  sessao,
}: {
  clienteId: string;
  evolucoes: Evolucao[];
  podeEscrever: boolean;
  carregando: boolean;
  sessao: SessaoEmCurso;
}) {
  const { data: profissionais = [] } = useProfissionais();
  const criar = useCriarEvolucao(clienteId);
  const recusar = useRegistrarRecusaAssinatura(clienteId);
  const { data: nomes = {} } = useNomesDeUsuarios(
    evolucoes.map((e) => e.recusaAssinaturaPor).filter((id): id is string => !!id),
  );

  const [adendoDe, setAdendoDe] = useState<string | null>(null);
  const [recusaDe, setRecusaDe] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const porId = new Map(evolucoes.map((e) => [e.id, e]));
  const emCurso = sessao.evolucao;

  function abrirFormulario(tipo: "adendo" | "recusa", id: string) {
    setAdendoDe(tipo === "adendo" ? id : null);
    setRecusaDe(tipo === "recusa" ? id : null);
    setTexto("");
    setErro(null);
  }

  async function gravarAdendo(original: Evolucao) {
    setErro(null);
    if (!texto.trim()) {
      setErro("Escreva o adendo antes de gravar.");
      return;
    }
    try {
      await criar.mutateAsync({
        profissionalId: original.profissionalId,
        avaliacao: texto.trim(),
        notasProcedimento: null,
        resultado: null,
        proximosPassos: null,
        mapaTipo: original.mapaTipo,
        marcacoes: [],
        adendoDeId: original.id,
      });
      setTexto("");
      setAdendoDe(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar o adendo.");
    }
  }

  async function gravarRecusa(evolucao: Evolucao) {
    setErro(null);
    if (!texto.trim()) {
      setErro('Escreva o motivo. Se o paciente não deu motivo, registre "não informou".');
      return;
    }
    try {
      await recusar.mutateAsync({ evolucaoId: evolucao.id, motivo: texto });
      setTexto("");
      setRecusaDe(null);
    } catch (e) {
      // A mensagem é a do banco, e ela é escrita para quem está na tela.
      setErro(e instanceof Error ? e.message : "Não foi possível registrar a recusa.");
    }
  }

  if (carregando) return <span className="text-[11px] text-muted-foreground">Carregando…</span>;

  const historico = evolucoes.filter((e) => e.id !== emCurso?.id);

  return (
    <div className="flex flex-col gap-3">
      {/* ---------- A sessão em curso ---------- */}
      {podeEscrever && emCurso && (
        <section
          data-testid="sessao-em-curso"
          className="flex flex-col gap-2.5 rounded-lg border border-primary/40 bg-content p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium text-foreground">Sessão em curso</span>
            <Badge tone="warning">aberta</Badge>
            <span className="font-mono text-[10px] text-muted-foreground">
              desde {formatoDataHora.format(new Date(emCurso.registradoEm))}
            </span>
            {(sessao.textoSujo || sessao.marcacoesSujas) && (
              <span className="text-[10.5px] text-warning-tint-foreground">alterações não salvas</span>
            )}
          </div>
          <p className="max-w-[70ch] text-[10.5px] leading-relaxed text-muted-foreground">
            Escreva durante o atendimento e salve quantas vezes quiser. Ao terminar, leia para o paciente e assine: a
            evolução assinada não se altera, e o que vier depois entra como adendo.
          </p>
          <div className="grid gap-2.5 md:grid-cols-2">
            {CAMPOS.map((c) => (
              <label
                key={c.chave}
                className={`flex flex-col gap-1 ${c.chave === "avaliacao" || c.chave === "notasProcedimento" ? "md:col-span-2" : ""}`}
              >
                <span className="text-[11px] font-medium text-foreground">{c.rotulo}</span>
                <textarea
                  name={c.chave}
                  value={sessao.texto[c.chave] ?? ""}
                  onChange={(ev) => sessao.aoAlterarTexto(c.chave, ev.target.value)}
                  rows={c.linhas}
                  placeholder={c.dica}
                  className="rounded-md border px-2.5 py-2 text-[11.5px] leading-relaxed"
                />
              </label>
            ))}
          </div>
          {sessao.erro && <span className="text-[10.5px] text-destructive">{sessao.erro}</span>}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={sessao.aoSalvar}
              disabled={(!sessao.textoSujo && !sessao.marcacoesSujas) || sessao.salvando}
            >
              Salvar rascunho
            </Button>
            <Button size="sm" onClick={sessao.aoAssinar} disabled={sessao.assinando}>
              Assinar e encerrar sessão
            </Button>
          </div>
        </section>
      )}

      {!emCurso && sessao.podeCriar && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2.5">
          <span className="text-[10.5px] text-muted-foreground">Nenhuma sessão aberta.</span>
          {profissionais.length > 1 && (
            <select
              value={sessao.profissionalId}
              onChange={(e) => sessao.aoEscolherProfissional(e.target.value)}
              className="h-7 rounded-md border px-1.5 text-[10.5px]"
            >
              {profissionais.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          )}
          <Button size="sm" onClick={sessao.aoAbrir} disabled={sessao.abrindo}>
            Abrir sessão
          </Button>
          {sessao.erro && <span className="text-[10.5px] text-destructive">{sessao.erro}</span>}
        </div>
      )}

      {/* ---------- O histórico ---------- */}
      {historico.length === 0 && !emCurso && (
        <span className="text-[11px] text-muted-foreground">Nenhuma evolução registrada.</span>
      )}

      {historico.map((e) => {
        const original = e.adendoDeId ? porId.get(e.adendoDeId) : null;
        const marcacoes = ehTipoMapa(e.mapaTipo) ? marcacoesValidas(e.mapaTipo, e.marcacoes) : [];
        const podeRecusar =
          podeEscrever && e.travada && !e.adendoDeId && !e.recusaAssinaturaEm && !e.assinaturaPacienteEm;
        return (
          <div key={e.id} data-evolucao-id={e.id} className="grid grid-cols-[74px_1fr] gap-3 border-b py-2.5">
            <span className="font-mono text-[10px] text-muted-foreground">
              {formatoData.format(new Date(e.registradoEm))}
            </span>
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {e.travada ? <Badge tone="success">assinada</Badge> : <Badge tone="warning">rascunho</Badge>}
                {e.adendoDeId && <Badge tone="neutral">adendo</Badge>}
                {e.intercorrencia && <Badge tone="danger">intercorrência</Badge>}
                {e.recusaAssinaturaEm && <Badge tone="warning">paciente recusou assinar</Badge>}
                {e.assinaturaPacienteEm && <Badge tone="success">paciente assinou</Badge>}
                {ehTipoMapa(e.mapaTipo) && <Badge tone="neutral">{MAPAS[e.mapaTipo].rotulo}</Badge>}
                {marcacoes.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">{marcacoes.length} marcação(ões)</span>
                )}
              </div>
              {original && (
                <span className="text-[10px] text-muted-foreground">
                  Complementa a evolução de {formatoData.format(new Date(original.registradoEm))}
                </span>
              )}
              {e.avaliacao && <span className="text-[11.5px] text-foreground">{e.avaliacao}</span>}
              {e.notasProcedimento && (
                <span className="text-[11px] text-secondary-foreground">Conduta: {e.notasProcedimento}</span>
              )}
              {e.intercorrencia && (
                <span className="rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-foreground">
                  Intercorrência: {e.intercorrencia}
                </span>
              )}
              {e.resultado && <span className="text-[11px] text-secondary-foreground">Resultado: {e.resultado}</span>}
              {e.proximosPassos && (
                <span className="text-[11px] text-secondary-foreground">Próximos passos: {e.proximosPassos}</span>
              )}
              {marcacoes.length > 0 && (
                <ul className="flex flex-col gap-0.5">
                  {marcacoes.map((m) => (
                    <li key={m.regiao} className="text-[10.5px] text-muted-foreground">
                      · {m.rotulo}
                      {m.nota ? ` — ${m.nota}` : ""}
                    </li>
                  ))}
                </ul>
              )}

              {e.recusaAssinaturaEm && (
                <div data-testid="recusa-registrada" className="rounded-md border border-dashed px-2.5 py-1.5 text-[10.5px]">
                  <span className="text-foreground">
                    Recusa de assinatura registrada em {formatoDataHora.format(new Date(e.recusaAssinaturaEm))}
                    {e.recusaAssinaturaPor && nomes[e.recusaAssinaturaPor] ? ` por ${nomes[e.recusaAssinaturaPor]}` : ""}
                  </span>
                  {e.recusaAssinaturaMotivo && (
                    <span className="block text-secondary-foreground">Motivo: {e.recusaAssinaturaMotivo}</span>
                  )}
                </div>
              )}

              {e.assinaturaPacienteEm && (
                <div data-testid="assinatura-paciente" className="rounded-md border border-dashed px-2.5 py-1.5 text-[10.5px]">
                  <span className="text-foreground">
                    Paciente assinou pelo celular em {formatoDataHora.format(new Date(e.assinaturaPacienteEm))}
                  </span>
                  <span className="block font-mono text-muted-foreground">
                    Texto assinado: sha256 {e.assinaturaPacienteHash?.slice(0, 16)}…
                  </span>
                </div>
              )}

              {podeRecusar && recusaDe !== e.id && adendoDe !== e.id && (
                <LinkAssinatura documento="evolucao" documentoId={e.id} />
              )}

              {adendoDe !== e.id && recusaDe !== e.id && (podeEscrever && e.travada) && (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => abrirFormulario("adendo", e.id)}
                    className="self-start text-[10.5px] text-primary underline-offset-2 hover:underline"
                  >
                    Registrar adendo
                  </button>
                  {podeRecusar && (
                    <button
                      type="button"
                      onClick={() => abrirFormulario("recusa", e.id)}
                      className="self-start text-[10.5px] text-primary underline-offset-2 hover:underline"
                    >
                      Paciente recusou assinar
                    </button>
                  )}
                </div>
              )}

              {adendoDe === e.id && (
                <div className="flex flex-col gap-1.5 rounded-md border p-2.5">
                  <span className="text-[10px] text-muted-foreground">
                    Evolução assinada não se altera — o adendo entra como linha nova ligada a esta.
                  </span>
                  <textarea
                    value={texto}
                    onChange={(ev) => setTexto(ev.target.value)}
                    rows={3}
                    className="rounded-md border bg-content px-2.5 py-2 text-[11px] leading-relaxed"
                  />
                  {erro && <span className="text-[10.5px] text-destructive">{erro}</span>}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void gravarAdendo(e)} disabled={criar.isPending}>
                      Gravar adendo
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAdendoDe(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {recusaDe === e.id && (
                <div data-testid="form-recusa" className="flex flex-col gap-1.5 rounded-md border p-2.5">
                  <span className="text-[10px] text-muted-foreground">
                    O paciente ouviu esta evolução e não quis assinar. A recusa fica registrada com a data e o seu nome, uma
                    única vez, e não se desfaz.
                  </span>
                  <textarea
                    name="motivo-recusa"
                    value={texto}
                    onChange={(ev) => setTexto(ev.target.value)}
                    rows={2}
                    placeholder='Motivo dado pelo paciente, ou "não informou".'
                    className="rounded-md border bg-content px-2.5 py-2 text-[11px] leading-relaxed"
                  />
                  {erro && <span className="text-[10.5px] text-destructive">{erro}</span>}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void gravarRecusa(e)} disabled={recusar.isPending}>
                      Registrar recusa
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRecusaDe(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {profissionais.length === 0 && (
        <span className="text-[10px] text-muted-foreground">
          Nenhum profissional cadastrado na conta — toda evolução precisa de um responsável.
        </span>
      )}
    </div>
  );
}
