import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ROTULO_CONSENTIMENTO,
  TIPOS_CONSENTIMENTO,
  consentimentoVigente,
  useConsentimentos,
  useRegistrarConsentimento,
  useRevogarConsentimento,
  type TipoConsentimento,
} from "./api";

const formatoData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Consentimentos do cliente. Lido por `aba_health.ler_consentimentos()`,
 * como toda leitura clínica — a lista aqui é o que gerou uma linha de
 * `log_acesso` ao abrir a aba.
 *
 * Registrar consentimento é sempre LINHA NOVA, nunca edição da anterior:
 * `aba_health.consentimento_vigente()` (migration 014) olha a linha mais
 * recente do tipo. Reescrever a linha antiga apagaria o histórico de
 * quando o cliente consentiu, que é justamente a evidência que o
 * consentimento existe para produzir.
 */
export function ConsentimentosTab({ clienteId, podeEscrever }: { clienteId: string; podeEscrever: boolean }) {
  const { data: consentimentos = [], isLoading } = useConsentimentos(clienteId);
  const registrar = useRegistrarConsentimento(clienteId);
  const revogar = useRevogarConsentimento(clienteId);

  const [tipo, setTipo] = useState<TipoConsentimento>("tratamento_dados");
  const [versaoTexto, setVersaoTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function aoRegistrar(concedido: boolean) {
    setErro(null);
    if (!versaoTexto.trim()) {
      setErro("Descreva a versão do termo apresentado ao cliente — é ela que fica registrada como evidência.");
      return;
    }
    try {
      await registrar.mutateAsync({ tipo, versaoTexto: versaoTexto.trim(), concedido });
      setVersaoTexto("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar o consentimento.");
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-2">
        {TIPOS_CONSENTIMENTO.map((t) => {
          const vigente = consentimentoVigente(consentimentos, t);
          return (
            <div key={t} className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-[11.5px] text-secondary-foreground">{ROTULO_CONSENTIMENTO[t]}</span>
              <Badge tone={vigente ? "success" : "warning"}>{vigente ? "vigente" : "sem consentimento"}</Badge>
            </div>
          );
        })}
      </div>

      <p className="rounded-md bg-content px-3 py-2 text-[10.5px] leading-relaxed text-muted-foreground">
        Sem <strong>uso de imagem</strong> vigente, a foto clínica continua sendo enviada e guardada, mas não é exibida
        para ninguém — nem para quem a enviou. A trava é da política do bucket privado, não desta tela.
      </p>

      {podeEscrever && (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <span className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
            Registrar consentimento
          </span>
          <div className="flex flex-wrap gap-1.5">
            {TIPOS_CONSENTIMENTO.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`rounded-md border px-2.5 py-1.5 text-[10.5px] ${
                  tipo === t ? "border-primary bg-accent text-primary" : "text-secondary-foreground"
                }`}
              >
                {ROTULO_CONSENTIMENTO[t]}
              </button>
            ))}
          </div>
          <input
            value={versaoTexto}
            onChange={(e) => setVersaoTexto(e.target.value)}
            placeholder="Versão do termo (ex.: Termo de uso de imagem v2 — 2026)"
            className="h-8 rounded-md border px-2 text-[11px]"
          />
          {erro && <span className="text-[10.5px] text-destructive">{erro}</span>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void aoRegistrar(true)} disabled={registrar.isPending}>
              Registrar como concedido
            </Button>
            <Button size="sm" variant="outline" onClick={() => void aoRegistrar(false)} disabled={registrar.isPending}>
              Registrar recusa
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">Histórico</span>
        {isLoading && <span className="text-[11px] text-muted-foreground">Carregando…</span>}
        {!isLoading && consentimentos.length === 0 && (
          <span className="text-[11px] text-muted-foreground">Nenhum consentimento registrado.</span>
        )}
        {consentimentos.map((c) => (
          <div key={c.id} className="grid grid-cols-[74px_1fr_auto] items-center gap-3 border-b py-2">
            <span className="font-mono text-[10px] text-muted-foreground">
              {formatoData.format(new Date(c.concedidoEm ?? c.criadoEm))}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11.5px] font-medium text-foreground">{ROTULO_CONSENTIMENTO[c.tipo]}</span>
              <span className="text-[10.5px] text-muted-foreground">{c.versaoTexto}</span>
            </div>
            <div className="flex items-center gap-2">
              {c.revogadoEm ? (
                <Badge tone="danger">revogado</Badge>
              ) : c.concedido ? (
                <Badge tone="success">concedido</Badge>
              ) : (
                <Badge tone="warning">recusado</Badge>
              )}
              {podeEscrever && c.concedido && !c.revogadoEm && (
                <Button size="sm" variant="ghost" onClick={() => void revogar.mutateAsync(c.id)}>
                  Revogar
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
