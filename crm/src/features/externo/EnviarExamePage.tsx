import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Página PÚBLICA do laboratório (Subetapa 03.11). Sem login: o token é a
 * autenticação, e quem decide tudo é a Edge Function `token-externo` com
 * o banco (freio por token, validade, revogação, usos, tipo pelos bytes).
 *
 * O TOKEN VEM NO FRAGMENTO (`/enviar-exame#<token>`): o navegador não
 * manda o `#` ao servidor que hospeda a página, então o token não cai em
 * log de hospedagem. A página o lê uma vez, tira da barra de endereço e o
 * repassa no cabeçalho `x-token-externo` — nunca na URL da Edge Function
 * (`handoffs/instrucoes.md` §6, Subetapa 03.10).
 *
 * Nada do paciente aparece aqui: a resposta do GET traz só a clínica, a
 * validade e os usos restantes (059).
 */

const FUNCAO = `${import.meta.env.VITE_SUPABASE__URL}/functions/v1/token-externo`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const MAX_BYTES = 20 * 1024 * 1024;

type Consulta =
  | { ok: true; clinica: string; expira_em: string; usos_restantes: number | null; aceita_arquivo: boolean }
  | { ok: false; erro?: string };

const formatoDataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function EnviarExamePage() {
  // Leitura pura no inicializador (o StrictMode o chama duas vezes); a
  // limpeza da barra de endereço vai no efeito.
  const [token] = useState(() => window.location.hash.replace(/^#/, "").trim());
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (!token) {
      setConsulta({ ok: false, erro: "Link incompleto. Peça um novo link à clínica." });
      return;
    }
    fetch(FUNCAO, { headers: { apikey: ANON, "x-token-externo": token } })
      .then((r) => r.json())
      .then((c: Consulta) => setConsulta(c))
      .catch(() => setConsulta({ ok: false, erro: "Não foi possível validar o link. Tente de novo." }));
  }, [token]);

  async function enviar() {
    if (!arquivo) return;
    if (arquivo.size > MAX_BYTES) {
      setResultado({ ok: false, texto: "Arquivo acima de 20 MB." });
      return;
    }
    setEnviando(true);
    setResultado(null);
    try {
      const corpo = new FormData();
      corpo.append("arquivo", arquivo);
      const r = await fetch(FUNCAO, {
        method: "POST",
        headers: { apikey: ANON, "x-token-externo": token },
        body: corpo,
      });
      const j = (await r.json()) as { ok: boolean; erro?: string };
      setResultado(
        j.ok
          ? { ok: true, texto: "Exame recebido. A clínica vai conferir antes de anexar ao prontuário." }
          : { ok: false, texto: j.erro ?? "Não foi possível enviar." },
      );
      if (j.ok) setArquivo(null);
    } catch {
      setResultado({ ok: false, texto: "Falha de rede. Tente de novo." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="flex w-full max-w-md flex-col gap-3 p-5">
        <h1 className="text-[15px] font-medium text-foreground">Envio de exame</h1>

        {!consulta && <span className="text-[12px] text-muted-foreground">Validando o link…</span>}

        {consulta && !consulta.ok && <span className="text-[12px] text-destructive">{consulta.erro}</span>}

        {consulta?.ok && (
          <>
            <span className="text-[12px] text-muted-foreground">
              Para: <strong className="text-foreground">{consulta.clinica}</strong> · link válido até{" "}
              {formatoDataHora.format(new Date(consulta.expira_em))}
              {consulta.usos_restantes !== null ? ` · envios restantes: ${consulta.usos_restantes}` : ""}
            </span>
            {consulta.aceita_arquivo ? (
              <>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="text-[12px]"
                  onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                />
                <span className="text-[10.5px] text-muted-foreground">PDF, JPEG ou PNG, até 20 MB.</span>
                <Button disabled={!arquivo || enviando} onClick={enviar}>
                  {enviando ? "Enviando…" : "Enviar exame"}
                </Button>
              </>
            ) : (
              <span className="text-[12px] text-destructive">Este link não recebe arquivo.</span>
            )}
          </>
        )}

        {resultado && (
          <span className={`text-[12px] ${resultado.ok ? "text-success-tint-foreground" : "text-destructive"}`}>
            {resultado.texto}
          </span>
        )}
      </Card>
    </div>
  );
}
