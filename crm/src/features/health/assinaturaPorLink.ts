/**
 * Assinatura do paciente por link (Subetapa 03.12, migration 061).
 *
 * Três documentos pelo mesmo mecanismo: a parte do paciente no contrato,
 * o aceite da evolução travada e o consentimento a partir de um modelo de
 * termo. A clínica gera o link (uso único, 72 h) e o entrega por QR code
 * ou cópia; nenhum canal dispara daqui.
 *
 * O token cru volta UMA vez e vai no FRAGMENTO da URL (`/assinar#token`),
 * que o navegador não manda ao servidor da página. Quem decide se pode
 * gerar, e o que o paciente vê, é o banco (`emitir_link_assinatura`,
 * `documento_para_assinatura`); a tela não recalcula permissão nem hash.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

function db() {
  return supabase.schema("aba_health");
}

export type DocumentoAssinavel = "contrato" | "evolucao" | "consentimento";

export type LinkGerado = { concessaoId: string; url: string; expiraEm: string };

export function useEmitirLinkAssinatura() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      documento: DocumentoAssinavel;
      documentoId: string;
      clienteId?: string;
      qrCode: boolean;
    }): Promise<LinkGerado> => {
      const { data, error } = await db().rpc("emitir_link_assinatura", {
        p_documento: p.documento,
        p_documento_id: p.documentoId,
        p_cliente_id: p.clienteId ?? null,
        p_canal: p.qrCode ? "qr_code" : null,
      });
      if (error) throw error;
      const l = (data as { concessao_id: string; token: string; token_expira_em: string }[])[0];
      return {
        concessaoId: l.concessao_id,
        url: `${window.location.origin}/assinar#${l.token}`,
        expiraEm: l.token_expira_em,
      };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["links-assinatura"] }),
  });
}

export type LinkEmitido = {
  id: string;
  expiraEm: string;
  revogadoEm: string | null;
  usos: number;
  criadoEm: string;
};

const COLUNA_ALVO: Record<DocumentoAssinavel, string> = {
  contrato: "contrato_id",
  evolucao: "evolucao_id",
  consentimento: "modelo_consentimento_id",
};

/** Links já emitidos para o documento (sem o hash do token, que não se lê). */
export function useLinksDoDocumento(documento: DocumentoAssinavel, documentoId: string, clienteId?: string) {
  return useQuery({
    queryKey: ["links-assinatura", documento, documentoId, clienteId ?? null],
    queryFn: async (): Promise<LinkEmitido[]> => {
      let q = db()
        .from("concessoes_externas")
        .select("id, token_expira_em, token_revogado_em, usos, criado_em")
        .eq("finalidade", "assinatura_paciente")
        .eq(COLUNA_ALVO[documento], documentoId)
        .order("criado_em", { ascending: false })
        .limit(5);
      if (clienteId) q = q.eq("cliente_id", clienteId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((l) => ({
        id: l.id as string,
        expiraEm: l.token_expira_em as string,
        revogadoEm: (l.token_revogado_em as string) ?? null,
        usos: l.usos as number,
        criadoEm: l.criado_em as string,
      }));
    },
  });
}

export function useRevogarLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (concessaoId: string) => {
      const { error } = await db().rpc("revogar_concessao_externa", { p_concessao_id: concessaoId });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["links-assinatura"] }),
  });
}

export type AssinaturaRecebida = {
  assinaturaId: string;
  documento: DocumentoAssinavel;
  contratoId: string | null;
  evolucaoId: string | null;
  consentimentoId: string | null;
  hashDocumento: string;
  canal: "qr_code" | "link";
  assinadaEm: string;
};

/** Assinaturas por link do paciente. Grava `log_acesso` por linha: sem refetch automático. */
export function useAssinaturasPorLink(clienteId: string | null) {
  return useQuery({
    queryKey: ["assinaturas-por-link", clienteId],
    enabled: !!clienteId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<AssinaturaRecebida[]> => {
      const { data, error } = await db().rpc("ler_assinaturas_externas", { p_cliente_id: clienteId });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((a) => ({
        assinaturaId: a.assinatura_id as string,
        documento: a.documento as DocumentoAssinavel,
        contratoId: (a.contrato_id as string) ?? null,
        evolucaoId: (a.evolucao_id as string) ?? null,
        consentimentoId: (a.consentimento_id as string) ?? null,
        hashDocumento: a.hash_documento as string,
        canal: a.canal as "qr_code" | "link",
        assinadaEm: a.assinada_em as string,
      }));
    },
  });
}

// ------------------------------------------------------------------
// Modelos de termo de consentimento
// ------------------------------------------------------------------

export type ModeloConsentimento = {
  id: string;
  tipo: "tratamento_dados" | "procedimento" | "procedimento_informado" | "uso_imagem";
  versao: number;
  titulo: string;
  texto: string;
  criadoEm: string;
};

/** Só os vigentes: versão publicada substitui a anterior. */
export function useModelosConsentimento() {
  return useQuery({
    queryKey: ["modelos-consentimento"],
    queryFn: async (): Promise<ModeloConsentimento[]> => {
      const { data, error } = await db()
        .from("modelos_consentimento")
        .select("id, tipo, versao, titulo, texto, criado_em")
        .is("arquivado_em", null)
        .order("tipo");
      if (error) throw error;
      return (data ?? []).map((m) => ({
        id: m.id as string,
        tipo: m.tipo as ModeloConsentimento["tipo"],
        versao: m.versao as number,
        titulo: m.titulo as string,
        texto: m.texto as string,
        criadoEm: m.criado_em as string,
      }));
    },
  });
}

export function usePublicarModelo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { tipo: ModeloConsentimento["tipo"]; titulo: string; texto: string }) => {
      const { error } = await db().rpc("publicar_modelo_consentimento", {
        p_tipo: p.tipo,
        p_titulo: p.titulo,
        p_texto: p.texto,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["modelos-consentimento"] }),
  });
}
