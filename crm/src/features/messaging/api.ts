import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

function db() {
  return supabase.schema("aba_messaging");
}

/** supabase-js não decodifica o corpo JSON de erro da Edge Function sozinho — extrai `{error}` de dentro do Response guardado em FunctionsHttpError.context. */
async function mensagemDeErroEdgeFunction(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const corpo = await error.context.json();
      if (corpo?.error) return corpo.error as string;
    } catch {
      // corpo não era JSON — usa o fallback
    }
  }
  return (error as { message?: string })?.message ?? fallback;
}

export type ConfiguracaoWhatsapp = {
  idNumeroTelefone: string;
  idWaba: string | null;
  status: "conectado" | "desconectado";
  conectadoEm: string | null;
};

export function useConfiguracaoWhatsapp() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["config-whatsapp", profile?.accountId],
    enabled: !!profile?.accountId,
    queryFn: async (): Promise<ConfiguracaoWhatsapp | null> => {
      const { data, error } = await db()
        .from("configuracao_whatsapp")
        .select("id_numero_telefone, id_waba, status, conectado_em")
        .eq("account_id", profile!.accountId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { idNumeroTelefone: data.id_numero_telefone, idWaba: data.id_waba, status: data.status, conectadoEm: data.conectado_em };
    },
  });
}

/** Chama a Edge Function `whatsapp-configurar` — o token em claro nunca é lido de volta nem persistido no client (docs/00, Qualidade da 02.5). */
export function useConectarWhatsapp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { phoneNumberId: string; wabaId?: string; accessToken: string }) => {
      const { data, error } = await supabase.functions.invoke("whatsapp-configurar", {
        body: { phone_number_id: input.phoneNumberId, waba_id: input.wabaId || undefined, access_token: input.accessToken },
      });
      if (error) throw new Error(await mensagemDeErroEdgeFunction(error, "Falha ao conectar o WhatsApp"));
      return data as { ok: true; display_phone_number: string; verified_name?: string };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["config-whatsapp"] }),
  });
}

export type Conversa = {
  id: string;
  contatoId: string;
  contatoNome: string | null;
  contatoTelefone: string;
  status: "aberta" | "pendente" | "fechada";
  ultimaMensagemTexto: string | null;
  ultimaMensagemEm: string | null;
};

export function useConversas() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["conversas", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Conversa[]> => {
      const { data: conversas, error } = await db()
        .from("conversas")
        .select("id, contato_id, status, ultima_mensagem_texto, ultima_mensagem_em")
        .eq("account_id", accountId!)
        .order("ultima_mensagem_em", { ascending: false, nullsFirst: false });
      if (error) throw error;

      const contatoIds = Array.from(new Set((conversas ?? []).map((c) => c.contato_id)));
      let contatos: Record<string, { nome: string | null; telefone: string }> = {};
      if (contatoIds.length) {
        const { data, error: e2 } = await db().from("contatos_canal").select("id, nome, telefone").in("id", contatoIds);
        if (e2) throw e2;
        contatos = Object.fromEntries((data ?? []).map((c) => [c.id, { nome: c.nome, telefone: c.telefone }]));
      }

      return (conversas ?? []).map((c) => ({
        id: c.id,
        contatoId: c.contato_id,
        contatoNome: contatos[c.contato_id]?.nome ?? null,
        contatoTelefone: contatos[c.contato_id]?.telefone ?? "",
        status: c.status,
        ultimaMensagemTexto: c.ultima_mensagem_texto,
        ultimaMensagemEm: c.ultima_mensagem_em,
      }));
    },
  });

  // Realtime já habilitado em aba_messaging.conversas (020_aba_messaging.sql)
  // — atualiza a lista sozinha quando uma conversa nova chega ou muda.
  useEffect(() => {
    if (!accountId) return;
    const channel = supabase
      .channel(`conversas-${accountId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "aba_messaging", table: "conversas", filter: `account_id=eq.${accountId}` },
        () => void qc.invalidateQueries({ queryKey: ["conversas", accountId] }),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [accountId, qc]);

  return query;
}

export type Mensagem = {
  id: string;
  tipoRemetente: "cliente" | "agente" | "bot";
  conteudoTexto: string | null;
  status: string;
  criadoEm: string;
};

export function useMensagens(conversaId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["mensagens", conversaId],
    enabled: !!conversaId,
    queryFn: async (): Promise<Mensagem[]> => {
      const { data, error } = await db()
        .from("mensagens")
        .select("id, tipo_remetente, conteudo_texto, status, criado_em")
        .eq("conversa_id", conversaId!)
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((m) => ({
        id: m.id,
        tipoRemetente: m.tipo_remetente,
        conteudoTexto: m.conteudo_texto,
        status: m.status,
        criadoEm: m.criado_em,
      }));
    },
  });

  // "mensagem recebida aparece na conversa em tempo real" (Objetivo da
  // 02.5) — INSERT em aba_messaging.mensagens já está na publicação
  // supabase_realtime desde a Subetapa 01.6; só falta escutar.
  useEffect(() => {
    if (!conversaId) return;
    const channel = supabase
      .channel(`mensagens-${conversaId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "aba_messaging", table: "mensagens", filter: `conversa_id=eq.${conversaId}` },
        () => void qc.invalidateQueries({ queryKey: ["mensagens", conversaId] }),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [conversaId, qc]);

  return query;
}

export function useEnviarMensagem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { conversaId: string; texto: string }) => {
      const { data, error } = await supabase.functions.invoke("whatsapp-enviar", {
        body: { conversa_id: input.conversaId, texto: input.texto },
      });
      if (error) throw new Error(await mensagemDeErroEdgeFunction(error, "Falha ao enviar mensagem"));
      return data as { ok: true; mensagem: unknown };
    },
    onSuccess: (_data, input) => {
      void qc.invalidateQueries({ queryKey: ["mensagens", input.conversaId] });
      void qc.invalidateQueries({ queryKey: ["conversas"] });
    },
  });
}
