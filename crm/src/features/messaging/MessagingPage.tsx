import { useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useConfiguracaoWhatsapp,
  useConectarWhatsapp,
  useConversas,
  useMensagens,
  useEnviarMensagem,
  type Conversa,
} from "./api";

const JANELA_24H_MS = 24 * 60 * 60 * 1000;

function FormularioConectarWhatsapp({ onConectado }: { onConectado: () => void }) {
  const conectar = useConectarWhatsapp();
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [sucesso, setSucesso] = useState<string | null>(null);

  return (
    <Card className="mx-auto flex max-w-md flex-col gap-3 p-6">
      <span className="text-[13px] font-medium text-foreground">Conectar WhatsApp (Meta Cloud API)</span>
      <span className="text-[11.5px] text-muted-foreground">
        Cole os dados do painel de desenvolvedores da Meta (Casos de uso → Conectar no WhatsApp → Etapa 1. Experimente). O token nunca fica
        visível de novo depois de salvo.
      </span>
      <form
        className="flex flex-col gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          setSucesso(null);
          conectar.mutate(
            { phoneNumberId: phoneNumberId.trim(), wabaId: wabaId.trim() || undefined, accessToken: accessToken.trim() },
            {
              onSuccess: (data) => {
                const diag = (data as unknown as { diagnostico_assinatura_waba?: unknown }).diagnostico_assinatura_waba;
                setSucesso(
                  `Conectado: ${data.display_phone_number}${data.verified_name ? ` (${data.verified_name})` : ""}` +
                    (diag ? ` · assinatura WABA: ${JSON.stringify(diag)}` : ""),
                );
                setAccessToken("");
              },
            },
          );
        }}
      >
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-secondary-foreground">Phone Number ID</label>
          <input
            required
            className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-secondary-foreground">WhatsApp Business Account ID (opcional)</label>
          <input
            className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-secondary-foreground">Token de acesso</label>
          <input
            required
            type="password"
            autoComplete="off"
            className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={conectar.isPending}>
          {conectar.isPending ? "Verificando com a Meta..." : "Conectar"}
        </Button>
        {conectar.isError && <span className="text-[11.5px] text-destructive">{(conectar.error as Error).message}</span>}
        {sucesso && (
          <div className="flex flex-col gap-2">
            <span className="text-[11.5px] text-success-tint-foreground">{sucesso}</span>
            <Button type="button" variant="outline" size="sm" onClick={onConectado}>
              Ir para as conversas
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

function ListaConversas({
  conversas,
  selecionada,
  onSelecionar,
}: {
  conversas: Conversa[];
  selecionada: string | null;
  onSelecionar: (id: string) => void;
}) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="border-b border-hairline px-3 py-2.5">
        <span className="rounded-[5px] bg-accent px-2.5 py-1 text-[10.5px] font-semibold text-accent-foreground">
          Conversas · {conversas.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversas.length === 0 && (
          <div className="p-4 text-center text-[11px] text-muted-foreground">
            Nenhuma conversa ainda — mensagens aparecem aqui assim que alguém escrever no seu WhatsApp.
          </div>
        )}
        {conversas.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelecionar(c.id)}
            className={`flex w-full flex-col gap-1 border-b border-hairline px-3 py-2.5 text-left ${
              selecionada === c.id ? "bg-content" : "hover:bg-content/60"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-medium text-foreground">{c.contatoNome || c.contatoTelefone}</span>
              {c.ultimaMensagemEm && (
                <span className="font-mono text-[9px] text-muted-foreground">
                  {formatDistanceToNow(new Date(c.ultimaMensagemEm), { locale: ptBR, addSuffix: false })}
                </span>
              )}
            </div>
            <span className="truncate text-[10.5px] text-muted-foreground">{c.ultimaMensagemTexto || "—"}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function PainelConversa({ conversa }: { conversa: Conversa }) {
  const { data: mensagens } = useMensagens(conversa.id);
  const enviar = useEnviarMensagem();
  const [texto, setTexto] = useState("");

  const ultimaDoCliente = [...(mensagens ?? [])].reverse().find((m) => m.tipoRemetente === "cliente");
  const janelaAberta = ultimaDoCliente ? Date.now() - new Date(ultimaDoCliente.criadoEm).getTime() < JANELA_24H_MS : false;

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-accent" />
          <div className="flex flex-col">
            <span className="text-[11.5px] font-medium text-foreground">{conversa.contatoNome || conversa.contatoTelefone}</span>
            <span className="text-[10px] text-muted-foreground">{conversa.contatoTelefone}</span>
          </div>
        </div>
        <Badge tone={janelaAberta ? "success" : "neutral"}>{janelaAberta ? "Janela de 24h aberta" : "Janela de 24h fechada"}</Badge>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-content/40 p-3.5">
        {(mensagens ?? []).map((m) => (
          <div
            key={m.id}
            className={`flex max-w-[70%] flex-col gap-1 rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
              m.tipoRemetente === "agente"
                ? "self-end rounded-br-sm bg-accent text-accent-foreground"
                : "self-start rounded-bl-sm border border-border bg-background text-secondary-foreground"
            }`}
          >
            <span>{m.conteudoTexto}</span>
            <span className="self-end font-mono text-[9px] opacity-70">{format(new Date(m.criadoEm), "HH:mm")}</span>
          </div>
        ))}
        {(mensagens ?? []).length === 0 && <span className="text-center text-[11px] text-muted-foreground">Nenhuma mensagem ainda.</span>}
      </div>
      <form
        className="flex items-center gap-2 border-t border-hairline p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!texto.trim()) return;
          enviar.mutate({ conversaId: conversa.id, texto: texto.trim() }, { onSuccess: () => setTexto("") });
        }}
      >
        <input
          className="flex-1 rounded-[6px] border border-input bg-background px-3 py-2 text-[11.5px]"
          placeholder={janelaAberta ? "Escrever mensagem..." : "Janela de 24h fechada — só template (fora do escopo do v01)"}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={!janelaAberta || enviar.isPending}
        />
        <Button type="submit" disabled={!janelaAberta || !texto.trim() || enviar.isPending}>
          {enviar.isPending ? "Enviando..." : "Enviar"}
        </Button>
      </form>
      {enviar.isError && <span className="px-3 pb-2 text-[11px] text-destructive">{(enviar.error as Error).message}</span>}
    </Card>
  );
}

function PainelContexto({ conversa }: { conversa: Conversa | null }) {
  return (
    <Card className="flex flex-col gap-2 p-3.5">
      <span className="text-[12px] font-medium text-foreground">Contexto</span>
      {conversa ? (
        <div className="flex flex-col gap-1.5 text-[10.5px] text-muted-foreground">
          <span>Nome: {conversa.contatoNome || "—"}</span>
          <span>Telefone: {conversa.contatoTelefone}</span>
          <span>Status da conversa: {conversa.status}</span>
        </div>
      ) : (
        <span className="text-[10.5px] text-muted-foreground">Selecione uma conversa para ver o contexto.</span>
      )}
    </Card>
  );
}

export function MessagingPage() {
  const { data: config, isLoading: carregandoConfig } = useConfiguracaoWhatsapp();
  const { data: conversas, isLoading: carregandoConversas } = useConversas();
  const [conversaSelecionada, setConversaSelecionada] = useState<string | null>(null);
  const [forcarFormulario, setForcarFormulario] = useState(false);

  if (carregandoConfig) return <div className="p-6 text-[12px] text-muted-foreground">Carregando…</div>;
  if (!config || config.status !== "conectado" || forcarFormulario) {
    return <FormularioConectarWhatsapp onConectado={() => setForcarFormulario(false)} />;
  }

  const lista = conversas ?? [];
  const conversaAtiva = lista.find((c) => c.id === conversaSelecionada) ?? null;

  return (
    <div className="flex h-full flex-col gap-2">
      <button
        type="button"
        onClick={() => setForcarFormulario(true)}
        className="self-end text-[10.5px] text-muted-foreground underline hover:text-foreground"
      >
        Reconectar / trocar credenciais do WhatsApp
      </button>
      <div className="grid flex-1 grid-cols-[280px_1fr_250px] gap-3">
        {carregandoConversas ? (
          <div className="col-span-3 p-6 text-[12px] text-muted-foreground">Carregando…</div>
        ) : (
          <>
            <ListaConversas conversas={lista} selecionada={conversaSelecionada} onSelecionar={setConversaSelecionada} />
            {conversaAtiva ? (
              <PainelConversa conversa={conversaAtiva} />
            ) : (
              <Card className="flex items-center justify-center p-6 text-[11.5px] text-muted-foreground">
                Selecione uma conversa à esquerda.
              </Card>
            )}
            <PainelContexto conversa={conversaAtiva} />
          </>
        )}
      </div>
    </div>
  );
}
