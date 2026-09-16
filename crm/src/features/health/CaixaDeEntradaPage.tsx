import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePessoas } from "@/features/people/api";
import { useClientesDaConta } from "./api";
import {
  STATUS_REMESSA_ROTULO,
  assinarUrlRemessa,
  tamanhoLegivel,
  useCaixaDeEntrada,
  useEmitirLinkExame,
  useProcessarRemessa,
  useRejeitarRemessa,
  type LinkEmitido,
  type RemessaCaixa,
  type StatusRemessa,
} from "./exames";

const formatoDataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

const TOM: Record<StatusRemessa, "neutral" | "success" | "warning" | "danger"> = {
  recebida: "warning",
  validada: "neutral",
  importada: "success",
  rejeitada: "danger",
};

const FILTROS: { chave: StatusRemessa | null; rotulo: string }[] = [
  { chave: null, rotulo: "Aguardando decisão" },
  { chave: "importada", rotulo: "No prontuário" },
  { chave: "rejeitada", rotulo: "Rejeitadas" },
];

/**
 * Caixa de entrada de exames (Subetapa 03.11). O arquivo do laboratório
 * cai aqui, NÃO no prontuário: conferir e aceitar são dois atos, e só o
 * aceite o migra. Quem decide se cada ato é possível é o banco
 * (`processar_remessa_externa`); os botões só aparecem no estado em que
 * a transição existe, para a tela não oferecer o que vai ser recusado.
 */
export function CaixaDeEntradaPage() {
  const [filtro, setFiltro] = useState<StatusRemessa | null>(null);
  const { data: remessas = [], isLoading, error } = useCaixaDeEntrada(filtro);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-[15px] font-medium text-foreground">Caixa de entrada de exames</h1>
          <span className="text-[11.5px] text-muted-foreground">
            O laboratório envia pelo link; o exame só entra no prontuário depois de conferido e aceito.
          </span>
        </div>
        <Link to="/prontuario" className="text-[11px] text-primary underline-offset-2 hover:underline">
          Prontuário
        </Link>
      </div>

      <EmitirLink />

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <Button
              key={f.rotulo}
              size="sm"
              variant={filtro === f.chave ? "default" : "outline"}
              onClick={() => setFiltro(f.chave)}
            >
              {f.rotulo}
            </Button>
          ))}
        </div>

        {isLoading && <span className="text-[11.5px] text-muted-foreground">Carregando…</span>}
        {error && (
          <span className="text-[11.5px] text-destructive">
            Não foi possível ler a caixa de entrada: {(error as Error).message}
          </span>
        )}
        {!isLoading && !error && remessas.length === 0 && (
          <span className="text-[11.5px] text-muted-foreground">Nenhum exame neste filtro.</span>
        )}

        <ul className="flex flex-col divide-y">
          {remessas.map((r) => (
            <LinhaRemessa key={r.remessaId} remessa={r} />
          ))}
        </ul>
      </Card>
    </div>
  );
}

function LinhaRemessa({ remessa: r }: { remessa: RemessaCaixa }) {
  const processar = useProcessarRemessa();
  const rejeitar = useRejeitarRemessa();
  const [rejeitando, setRejeitando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const ocupado = processar.isPending || rejeitar.isPending;

  async function abrir() {
    if (!r.arquivoCaminho) return;
    const url = await assinarUrlRemessa(r.arquivoCaminho);
    if (!url) {
      setAviso("O servidor recusou assinar o acesso a este arquivo.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function erro(e: unknown) {
    setAviso(e instanceof Error ? e.message : "Não foi possível concluir.");
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12.5px] font-medium text-foreground">
            {r.clienteNome} <span className="font-normal text-muted-foreground">· {r.laboratorioNome}</span>
          </span>
          <span className="text-[11px] text-muted-foreground">
            {r.nomeOriginal ?? "arquivo sem nome"} · {r.mime} · {tamanhoLegivel(r.tamanhoBytes)} · recebido{" "}
            {formatoDataHora.format(new Date(r.recebidaEm))}
          </span>
          <span className="text-[10.5px] text-muted-foreground">
            Origem: {r.ipOrigem ?? "IP não registrado"}
            {r.userAgent ? ` · ${r.userAgent.slice(0, 80)}` : ""}
          </span>
          {r.status === "rejeitada" && (
            <span className="text-[10.5px] text-muted-foreground">
              Motivo: {r.motivoRejeicao} ·{" "}
              {r.arquivoExpurgadoEm ? "arquivo apagado" : "arquivo ilegível, remoção pendente"}
            </span>
          )}
        </div>
        <Badge tone={TOM[r.status]}>{STATUS_REMESSA_ROTULO[r.status]}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {r.arquivoCaminho && (
          <Button size="sm" variant="outline" onClick={abrir}>
            Abrir arquivo
          </Button>
        )}
        {r.status === "recebida" && (
          <Button
            size="sm"
            variant="secondary"
            disabled={ocupado}
            onClick={() =>
              processar.mutate({ remessaId: r.remessaId, clienteId: r.clienteId, para: "validada" }, { onError: erro })
            }
          >
            Conferi: é deste paciente e está legível
          </Button>
        )}
        {r.status === "validada" && (
          <Button
            size="sm"
            disabled={ocupado}
            onClick={() =>
              processar.mutate({ remessaId: r.remessaId, clienteId: r.clienteId, para: "importada" }, { onError: erro })
            }
          >
            Aceitar no prontuário
          </Button>
        )}
        {(r.status === "recebida" || r.status === "validada") && !rejeitando && (
          <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => setRejeitando(true)}>
            Rejeitar
          </Button>
        )}
      </div>

      {rejeitando && (
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            className="h-8 min-w-[240px] flex-1 rounded-md border bg-background px-2 text-[12px]"
            placeholder="Motivo (ex.: exame de outro paciente)"
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={ocupado || motivo.trim().length < 3}
            onClick={() =>
              rejeitar.mutate(
                { remessaId: r.remessaId, motivo: motivo.trim() },
                { onError: erro, onSuccess: () => setRejeitando(false) },
              )
            }
          >
            Rejeitar e apagar o arquivo
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRejeitando(false)}>
            Cancelar
          </Button>
        </div>
      )}

      {aviso && <span className="text-[11px] text-destructive">{aviso}</span>}
    </li>
  );
}

/**
 * O link sai uma vez: o banco guarda só o hash do token. Nenhum canal
 * envia daqui (é da 03.12); a clínica copia e entrega ao laboratório.
 */
function EmitirLink() {
  const { data: clientes = [] } = useClientesDaConta();
  const { data: pessoas = [] } = usePessoas();
  const laboratorios = pessoas.filter((p) => p.papel === "fornecedor");
  const emitir = useEmitirLinkExame();

  const [clienteId, setClienteId] = useState("");
  const [laboratorioId, setLaboratorioId] = useState("");
  const [validadeDias, setValidadeDias] = useState(7);
  const [usoUnico, setUsoUnico] = useState(false);
  const [emitido, setEmitido] = useState<LinkEmitido | null>(null);
  const [copiado, setCopiado] = useState(false);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <span className="text-[12.5px] font-medium text-foreground">Pedir exame ao laboratório</span>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          Paciente
          <select
            className="h-8 min-w-[200px] rounded-md border bg-background px-2 text-[12px] text-foreground"
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
          >
            <option value="">Escolha…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          Laboratório (fornecedor)
          <select
            className="h-8 min-w-[200px] rounded-md border bg-background px-2 text-[12px] text-foreground"
            value={laboratorioId}
            onChange={(e) => setLaboratorioId(e.target.value)}
          >
            <option value="">Escolha…</option>
            {laboratorios.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nomeExibicao}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          Validade (dias)
          <input
            type="number"
            min={1}
            max={90}
            className="h-8 w-20 rounded-md border bg-background px-2 text-[12px] text-foreground"
            value={validadeDias}
            onChange={(e) => setValidadeDias(Math.min(90, Math.max(1, Number(e.target.value) || 1)))}
          />
        </label>
        <label className="flex h-8 items-center gap-1.5 text-[11px] text-muted-foreground">
          <input type="checkbox" checked={usoUnico} onChange={(e) => setUsoUnico(e.target.checked)} />
          Um arquivo só
        </label>
        <Button
          size="sm"
          disabled={!clienteId || !laboratorioId || emitir.isPending}
          onClick={() =>
            emitir.mutate(
              { clienteId, laboratorioId, validadeDias, usosMaximos: usoUnico ? 1 : null },
              {
                onSuccess: (l) => {
                  setEmitido(l);
                  setCopiado(false);
                },
              },
            )
          }
        >
          Gerar link
        </Button>
      </div>

      {emitir.error && <span className="text-[11px] text-destructive">{(emitir.error as Error).message}</span>}

      {emitido && (
        <div className="flex flex-col gap-1.5 rounded-md border border-dashed p-3">
          <span className="text-[11px] text-muted-foreground">
            Este link aparece só agora. Vale até {formatoDataHora.format(new Date(emitido.expiraEm))}.
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <code className="break-all rounded bg-content px-2 py-1 text-[11px]">{emitido.url}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(emitido.url).then(() => setCopiado(true));
              }}
            >
              {copiado ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
