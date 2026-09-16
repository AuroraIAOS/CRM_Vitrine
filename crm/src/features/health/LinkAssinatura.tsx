import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import {
  useEmitirLinkAssinatura,
  useLinksDoDocumento,
  useRevogarLink,
  type DocumentoAssinavel,
  type LinkGerado,
} from "./assinaturaPorLink";

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

/**
 * "Assinar pelo celular": gera o link de uso único, mostra QR code e botão
 * de copiar UMA vez (o banco guarda só o hash), e lista os links anteriores
 * com o estado e o botão de cancelar. O aviso de que é assinatura
 * eletrônica simples fica visível — a camada ICP-Brasil é outro item.
 */
export function LinkAssinatura({
  documento,
  documentoId,
  clienteId,
  rotulo = "Enviar para o paciente assinar pelo celular",
}: {
  documento: DocumentoAssinavel;
  documentoId: string;
  clienteId?: string;
  rotulo?: string;
}) {
  const emitir = useEmitirLinkAssinatura();
  const revogar = useRevogarLink();
  const { data: links = [] } = useLinksDoDocumento(documento, documentoId, clienteId);
  const [aberto, setAberto] = useState(false);
  const [gerado, setGerado] = useState<LinkGerado | null>(null);
  const [copiado, setCopiado] = useState(false);

  const agora = Date.now();
  const ativos = links.filter((l) => !l.revogadoEm && l.usos === 0 && new Date(l.expiraEm).getTime() > agora);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="self-start text-[10.5px] text-primary underline-offset-2 hover:underline"
      >
        {rotulo}
        {ativos.length > 0 ? ` (${ativos.length} link aguardando)` : ""}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-2.5 text-[11px]" data-link-assinatura={documento}>
      <span className="text-[10.5px] text-muted-foreground">
        O paciente abre o link, confirma a data de nascimento, lê o documento e desenha a assinatura. Vale por 72 horas e
        para uma assinatura só. É assinatura eletrônica simples, com registro de data, IP e do texto assinado — não é
        certificado digital ICP-Brasil.
      </span>

      {!gerado && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={emitir.isPending}
            onClick={() =>
              emitir.mutate(
                { documento, documentoId, clienteId, qrCode: true },
                { onSuccess: (l) => { setGerado(l); setCopiado(false); } },
              )
            }
          >
            {emitir.isPending ? "Gerando…" : "Gerar link e QR code"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAberto(false)}>
            Fechar
          </Button>
        </div>
      )}
      {emitir.error && <span className="text-[10.5px] text-destructive">{(emitir.error as Error).message}</span>}

      {gerado && (
        <div className="flex flex-wrap items-start gap-3">
          <div className="rounded-md bg-white p-2">
            <QRCodeSVG value={gerado.url} size={148} level="M" marginSize={2} title="QR code do link de assinatura" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-[10.5px] text-muted-foreground">
              Aparece só agora. Vale até {dataHora.format(new Date(gerado.expiraEm))}.
            </span>
            <code className="break-all rounded bg-content px-2 py-1 text-[10.5px]">{gerado.url}</code>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void navigator.clipboard?.writeText(gerado.url).then(() => setCopiado(true))}
              >
                {copiado ? "Copiado" : "Copiar link"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setGerado(null); setAberto(false); }}>
                Concluir
              </Button>
            </div>
          </div>
        </div>
      )}

      {links.length > 0 && (
        <ul className="flex flex-col gap-1 border-t pt-2 text-[10.5px] text-muted-foreground">
          {links.map((l) => {
            const expirado = new Date(l.expiraEm).getTime() <= agora;
            const estado = l.revogadoEm
              ? "cancelado"
              : l.usos > 0
                ? "usado"
                : expirado
                  ? "expirado"
                  : `aguardando até ${dataHora.format(new Date(l.expiraEm))}`;
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-2">
                <span>
                  Link de {dataHora.format(new Date(l.criadoEm))} — {estado}
                </span>
                {!l.revogadoEm && l.usos === 0 && !expirado && (
                  <button
                    type="button"
                    disabled={revogar.isPending}
                    onClick={() => revogar.mutate(l.id)}
                    className="text-destructive underline-offset-2 hover:underline"
                  >
                    Cancelar link
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {revogar.error && <span className="text-[10.5px] text-destructive">{(revogar.error as Error).message}</span>}
    </div>
  );
}
