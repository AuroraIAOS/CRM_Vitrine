import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Página PÚBLICA de assinatura do paciente (Subetapa 03.12). Sem login: o
 * token é a autenticação e a data de nascimento é a confirmação; quem decide
 * tudo é a Edge Function `token-externo` com o banco (freio por token,
 * validade, uso único, documento ainda assinável, hash do texto).
 *
 * O TOKEN VEM NO FRAGMENTO (`/assinar#<token>`), que o navegador não manda
 * ao servidor da página; ele sai da barra de endereço e segue no cabeçalho
 * `x-token-externo` (`handoffs/instrucoes.md` §5, Subetapa 03.11).
 *
 * O hash que volta assinado é o que o SERVIDOR calculou sobre o texto que
 * mostrou — a página só o devolve. O contrato vem em HTML gerado pelo banco
 * e é exibido num `iframe` com `sandbox` vazio: nenhum script roda.
 */

const FUNCAO = `${import.meta.env.VITE_SUPABASE__URL}/functions/v1/token-externo`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type Documento = { tipo: string; titulo: string; formato: "html" | "texto"; conteudo: string; hash: string };
type Etapa =
  | { nome: "validando" }
  | { nome: "erro"; texto: string }
  | { nome: "confirmar"; clinica: string; expiraEm: string }
  | { nome: "ler"; clinica: string; documento: Documento }
  | { nome: "assinado" };

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function AssinarPage() {
  const [token] = useState(() => window.location.hash.replace(/^#/, "").trim());
  const [etapa, setEtapa] = useState<Etapa>({ nome: "validando" });
  const [dataNascimento, setDataNascimento] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (!token) {
      setEtapa({ nome: "erro", texto: "Link incompleto. Peça um novo link à clínica." });
      return;
    }
    fetch(FUNCAO, { headers: { apikey: ANON, "x-token-externo": token } })
      .then((r) => r.json())
      .then((c: { ok: boolean; erro?: string; finalidade?: string; clinica?: string; expira_em?: string }) => {
        if (!c.ok) setEtapa({ nome: "erro", texto: c.erro ?? "Link inválido." });
        else if (c.finalidade !== "assinatura_paciente") setEtapa({ nome: "erro", texto: "Este link não é de assinatura." });
        else setEtapa({ nome: "confirmar", clinica: c.clinica ?? "", expiraEm: c.expira_em ?? "" });
      })
      .catch(() => setEtapa({ nome: "erro", texto: "Não foi possível validar o link. Tente de novo." }));
  }, [token]);

  async function abrir() {
    if (etapa.nome !== "confirmar") return;
    setOcupado(true);
    setAviso(null);
    try {
      const r = await fetch(FUNCAO, {
        method: "POST",
        headers: { apikey: ANON, "x-token-externo": token, "content-type": "application/json" },
        body: JSON.stringify({ acao: "abrir", data_nascimento: dataNascimento }),
      });
      const j = (await r.json()) as { ok: boolean; erro?: string; documento?: Documento };
      if (!j.ok || !j.documento) setAviso(j.erro ?? "Não foi possível abrir o documento.");
      else setEtapa({ nome: "ler", clinica: etapa.clinica, documento: j.documento });
    } catch {
      setAviso("Falha de rede. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function assinar(desenho: Blob) {
    if (etapa.nome !== "ler") return;
    setOcupado(true);
    setAviso(null);
    try {
      const corpo = new FormData();
      corpo.append("acao", "assinar");
      corpo.append("data_nascimento", dataNascimento);
      corpo.append("hash", etapa.documento.hash);
      corpo.append("desenho", desenho, "assinatura.png");
      const r = await fetch(FUNCAO, {
        method: "POST",
        headers: { apikey: ANON, "x-token-externo": token },
        body: corpo,
      });
      const j = (await r.json()) as { ok: boolean; erro?: string };
      if (j.ok) setEtapa({ nome: "assinado" });
      else setAviso(j.erro ?? "Não foi possível registrar a assinatura.");
    } catch {
      setAviso("Falha de rede. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex min-h-screen justify-center bg-background p-4">
      <Card className="flex w-full max-w-xl flex-col gap-3 p-5">
        <h1 className="text-[15px] font-medium text-foreground">Assinatura de documento</h1>

        {etapa.nome === "validando" && <span className="text-[12px] text-muted-foreground">Validando o link…</span>}
        {etapa.nome === "erro" && <span className="text-[12px] text-destructive">{etapa.texto}</span>}

        {etapa.nome === "confirmar" && (
          <>
            <span className="text-[12px] text-muted-foreground">
              <strong className="text-foreground">{etapa.clinica}</strong> pediu sua assinatura.
              {etapa.expiraEm ? ` O link vale até ${dataHora.format(new Date(etapa.expiraEm))}.` : ""}
            </span>
            <label htmlFor="data-nascimento" className="text-[12px] text-foreground">
              Para ver o documento, confirme sua data de nascimento
            </label>
            <input
              id="data-nascimento"
              type="date"
              value={dataNascimento}
              onChange={(e) => setDataNascimento(e.target.value)}
              className="h-10 rounded-md border bg-background px-2 text-[14px]"
            />
            <Button disabled={!dataNascimento || ocupado} onClick={() => void abrir()}>
              {ocupado ? "Conferindo…" : "Ver documento"}
            </Button>
          </>
        )}

        {etapa.nome === "ler" && (
          <>
            <span className="text-[12px] text-muted-foreground">
              {etapa.clinica} · {etapa.documento.titulo}
            </span>
            {etapa.documento.formato === "html" ? (
              <iframe
                title={etapa.documento.titulo}
                sandbox=""
                srcDoc={etapa.documento.conteudo}
                className="h-[420px] w-full rounded-md border bg-white"
              />
            ) : (
              <div className="max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-md border bg-content p-3 text-[13px] leading-relaxed text-foreground">
                {etapa.documento.conteudo}
              </div>
            )}
            <PainelAssinatura ocupado={ocupado} aoAssinar={(b) => void assinar(b)} />
            <span className="text-[10.5px] leading-relaxed text-muted-foreground">
              Assinatura eletrônica simples: registramos a data e a hora, o endereço de rede, o seu desenho e o código
              (sha256) do texto exato acima — código {etapa.documento.hash.slice(0, 12)}…. Não é certificado digital
              ICP-Brasil.
            </span>
          </>
        )}

        {etapa.nome === "assinado" && (
          <span className="text-[13px] text-foreground">Assinatura registrada. Obrigado — pode fechar esta página.</span>
        )}

        {aviso && (
          <span className="text-[12px] text-destructive" role="alert">
            {aviso}
          </span>
        )}
      </Card>
    </div>
  );
}

/** Canvas de desenho com dedo ou mouse; exporta PNG. */
function PainelAssinatura({ ocupado, aoAssinar }: { ocupado: boolean; aoAssinar: (png: Blob) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const [temTraco, setTemTraco] = useState(false);
  const [li, setLi] = useState(false);

  useEffect(() => {
    const c = canvasRef.current!;
    const escala = window.devicePixelRatio || 1;
    c.width = c.clientWidth * escala;
    c.height = c.clientHeight * escala;
    const ctx = c.getContext("2d")!;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }, []);

  function ponto(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function limpar() {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setTemTraco(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] text-foreground">Desenhe sua assinatura</span>
      <canvas
        ref={canvasRef}
        className="h-[160px] w-full touch-none rounded-md border bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          desenhando.current = true;
          const { x, y } = ponto(e);
          const ctx = e.currentTarget.getContext("2d")!;
          ctx.beginPath();
          ctx.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!desenhando.current) return;
          const { x, y } = ponto(e);
          const ctx = e.currentTarget.getContext("2d")!;
          ctx.lineTo(x, y);
          ctx.stroke();
          setTemTraco(true);
        }}
        onPointerUp={() => (desenhando.current = false)}
        onPointerLeave={() => (desenhando.current = false)}
      />
      <label className="flex items-start gap-2 text-[12px] text-foreground">
        <input type="checkbox" checked={li} onChange={(e) => setLi(e.target.checked)} className="mt-0.5" />
        Li o documento acima e concordo com ele.
      </label>
      <div className="flex gap-2">
        <Button
          disabled={!temTraco || !li || ocupado}
          onClick={() => canvasRef.current!.toBlob((b) => b && aoAssinar(b), "image/png")}
        >
          {ocupado ? "Registrando…" : "Assinar"}
        </Button>
        <Button variant="outline" disabled={ocupado} onClick={limpar}>
          Limpar
        </Button>
      </div>
    </div>
  );
}
