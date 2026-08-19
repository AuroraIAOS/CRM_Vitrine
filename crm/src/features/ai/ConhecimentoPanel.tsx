import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  useApagarDocumento,
  useBuscarConhecimento,
  useDocumentosConhecimento,
  useSalvarDocumento,
} from "./api";

const formatoData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

/**
 * Base de conhecimento da tela `1l`.
 *
 * O documento é o que a pessoa escreve; os **trechos** são o que o agente
 * recupera. A quebra em trechos acontece ao salvar (por parágrafo), e é
 * `aba_ai.buscar_conhecimento_textual()` — busca lexical com `ts_rank` —
 * que decide quais entram no contexto da resposta.
 *
 * A busca desta tela usa exatamente a mesma função que a Edge Function
 * usa ao responder. Não é uma prévia aproximada: é o mesmo caminho, e é
 * por isso que ela serve para conferir se um documento novo realmente
 * responde à pergunta que se espera dele.
 */
export function ConhecimentoPanel() {
  const { data: documentos = [], isLoading } = useDocumentosConhecimento();
  const salvar = useSalvarDocumento();
  const apagar = useApagarDocumento();
  const buscar = useBuscarConhecimento();

  const [editando, setEditando] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [consulta, setConsulta] = useState("");
  const [achados, setAchados] = useState<{ id: string; conteudo: string; relevancia: number }[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function abrirNovo() {
    setCriando(true);
    setEditando(null);
    setTitulo("");
    setConteudo("");
    setErro(null);
  }

  function abrirEdicao(doc: { id: string; titulo: string; conteudo: string }) {
    setEditando(doc.id);
    setCriando(false);
    setTitulo(doc.titulo);
    setConteudo(doc.conteudo);
    setErro(null);
  }

  async function aoSalvar() {
    setErro(null);
    if (!titulo.trim() || !conteudo.trim()) {
      setErro("Título e conteúdo são obrigatórios.");
      return;
    }
    try {
      await salvar.mutateAsync({ id: editando ?? undefined, titulo: titulo.trim(), conteudo: conteudo.trim() });
      setCriando(false);
      setEditando(null);
      setTitulo("");
      setConteudo("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar o documento.");
    }
  }

  async function aoBuscar() {
    setErro(null);
    if (!consulta.trim()) return;
    try {
      setAchados(await buscar.mutateAsync(consulta.trim()));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na busca.");
    }
  }

  const emFormulario = criando || editando !== null;

  return (
    <Card className="flex min-h-0 flex-1 flex-col gap-2.5 p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-medium text-foreground">Base de conhecimento</span>
        <button
          type="button"
          onClick={() => (emFormulario ? (setCriando(false), setEditando(null)) : abrirNovo())}
          className="text-[10.5px] text-primary underline-offset-2 hover:underline"
        >
          {emFormulario ? "cancelar" : "+ documento"}
        </button>
      </div>

      {emFormulario && (
        <div className="flex flex-col gap-1.5 rounded-md border p-2.5">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título (ex.: Tabela de preços e pacotes)"
            className="h-8 rounded-md border px-2 text-[11px]"
          />
          <textarea
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            rows={6}
            placeholder={"Um parágrafo por assunto — cada parágrafo vira um trecho recuperável.\n\nDeixe uma linha em branco entre eles."}
            className="rounded-md border bg-content px-2.5 py-2 text-[11px] leading-relaxed"
          />
          {/* Alerta no ponto exato onde o risco existe. O que for escrito
              aqui é enviado ao provedor de IA a cada resposta — a base é
              o único caminho pelo qual dado sensível sai do produto sem
              trava técnica nenhuma (o prontuário está bloqueado no banco;
              isto aqui não está, porque é texto livre). */}
          <span className="rounded bg-warning-tint px-2 py-1.5 text-[9.5px] leading-relaxed text-warning-tint-foreground">
            O que você escrever aqui é enviado ao provedor de IA a cada resposta do agente. Não inclua dado de saúde,
            documento, endereço ou qualquer informação sigilosa de cliente.
          </span>
          {erro && <span className="text-[10.5px] text-destructive">{erro}</span>}
          <Button size="sm" onClick={() => void aoSalvar()} disabled={salvar.isPending}>
            {editando ? "Salvar alterações" : "Adicionar documento"}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-[1fr_60px_52px] gap-2 border-b pb-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        <span>Documento</span>
        <span>Atualizado</span>
        <span>Trechos</span>
      </div>

      {isLoading && <span className="text-[11px] text-muted-foreground">Carregando…</span>}
      {!isLoading && documentos.length === 0 && (
        <span className="text-[10.5px] leading-relaxed text-muted-foreground">
          Nenhum documento ainda. Sem base de conhecimento o agente não tem no que se fundamentar — e foi instruído a
          dizer que vai confirmar com a equipe em vez de inventar preço ou prazo.
        </span>
      )}

      <div className="flex min-h-0 flex-col overflow-auto">
        {documentos.map((d) => (
          <div key={d.id} className="grid grid-cols-[1fr_60px_52px] items-center gap-2 border-b py-1.5">
            <button
              type="button"
              onClick={() => abrirEdicao(d)}
              className="truncate text-left text-[11px] text-foreground hover:text-primary"
            >
              {d.titulo}
            </button>
            <span className="font-mono text-[9.5px] text-muted-foreground">
              {formatoData.format(new Date(d.atualizadoEm))}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10.5px] text-secondary-foreground">{d.trechos}</span>
              <button
                type="button"
                onClick={() => void apagar.mutateAsync(d.id)}
                className="text-[9.5px] text-muted-foreground hover:text-destructive"
              >
                apagar
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5 border-t pt-2.5">
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          Testar a recuperação
        </span>
        <div className="flex gap-1.5">
          <input
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="o que um cliente perguntaria"
            className="h-8 flex-1 rounded-md border px-2 text-[11px]"
          />
          <Button size="sm" variant="outline" onClick={() => void aoBuscar()} disabled={buscar.isPending}>
            Buscar
          </Button>
        </div>
        {achados !== null && achados.length === 0 && (
          <span className="text-[10px] text-muted-foreground">
            Nenhum trecho casou — o agente responderia que vai confirmar com a equipe.
          </span>
        )}
        {achados?.map((a) => (
          <div key={a.id} className="rounded-md border bg-content p-2">
            <span className="font-mono text-[9px] text-muted-foreground">
              relevância {a.relevancia.toFixed(4)}
            </span>
            <p className="text-[10.5px] leading-relaxed text-secondary-foreground">{a.conteudo}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
