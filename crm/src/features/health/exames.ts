/**
 * Caixa de entrada de exames (Subetapa 03.11, migration 060).
 *
 * O laboratório manda o arquivo por link com token (infraestrutura da
 * 03.10); o arquivo espera aqui o aceite do profissional antes de entrar
 * no prontuário. Três regras deste arquivo:
 *
 * 1. **Nenhuma leitura por tabela.** `remessas_externas` não tem GRANT
 *    para `authenticated`: a caixa sai de `ler_caixa_de_entrada()` e os
 *    exames do prontuário de `ler_exames_importados()`, que gravam
 *    `log_acesso` por linha devolvida. Por isso `staleTime: Infinity` e
 *    sem refetch em foco — refresh automático seria log falso
 *    (`handoffs/instrucoes.md` §5, Subetapa 02.9).
 * 2. **A transição é do banco.** Validar e importar são RPC; rejeitar
 *    passa pela Edge Function `remessa-rejeitar`, que também apaga os
 *    bytes. A tela nunca decide se uma transição existe.
 * 3. **Arquivo só por URL assinada de 60 s**, e a policy do bucket nega
 *    rejeitada na mesma transação da rejeição.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { TTL_URL_ASSINADA_SEGUNDOS } from "./api";

function db() {
  return supabase.schema("aba_health");
}

export const BUCKET_REMESSAS = "remessas-externas";

export type StatusRemessa = "recebida" | "validada" | "importada" | "rejeitada";

export const STATUS_REMESSA_ROTULO: Record<StatusRemessa, string> = {
  recebida: "Recebida",
  validada: "Conferida",
  importada: "No prontuário",
  rejeitada: "Rejeitada",
};

export type RemessaCaixa = {
  remessaId: string;
  clienteId: string;
  clienteNome: string;
  laboratorioId: string;
  laboratorioNome: string;
  status: StatusRemessa;
  mime: string;
  tamanhoBytes: number;
  nomeOriginal: string | null;
  arquivoCaminho: string | null;
  ipOrigem: string | null;
  userAgent: string | null;
  recebidaEm: string;
  processadaEm: string | null;
  motivoRejeicao: string | null;
  arquivoExpurgadoEm: string | null;
};

type LinhaCaixa = {
  remessa_id: string;
  cliente_id: string;
  cliente_nome: string;
  laboratorio_id: string;
  laboratorio_nome: string;
  status: StatusRemessa;
  mime: string;
  tamanho_bytes: number;
  nome_original: string | null;
  arquivo_caminho: string | null;
  ip_origem: string | null;
  user_agent: string | null;
  recebida_em: string;
  processada_em: string | null;
  motivo_rejeicao: string | null;
  arquivo_expurgado_em: string | null;
};

/** `null` = o que espera decisão (recebida e conferida). */
export function useCaixaDeEntrada(status: StatusRemessa | null) {
  return useQuery({
    queryKey: ["health-caixa-entrada", status],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<RemessaCaixa[]> => {
      const { data, error } = await db().rpc("ler_caixa_de_entrada", { p_status: status });
      if (error) throw error;
      return ((data ?? []) as LinhaCaixa[]).map((r) => ({
        remessaId: r.remessa_id,
        clienteId: r.cliente_id,
        clienteNome: r.cliente_nome,
        laboratorioId: r.laboratorio_id,
        laboratorioNome: r.laboratorio_nome,
        status: r.status,
        mime: r.mime,
        tamanhoBytes: r.tamanho_bytes,
        nomeOriginal: r.nome_original,
        arquivoCaminho: r.arquivo_caminho,
        ipOrigem: r.ip_origem,
        userAgent: r.user_agent,
        recebidaEm: r.recebida_em,
        processadaEm: r.processada_em,
        motivoRejeicao: r.motivo_rejeicao,
        arquivoExpurgadoEm: r.arquivo_expurgado_em,
      }));
    },
  });
}

export type ExameImportado = {
  remessaId: string;
  laboratorioNome: string;
  mime: string;
  tamanhoBytes: number;
  nomeOriginal: string | null;
  arquivoCaminho: string;
  sha256Hex: string;
  recebidaEm: string;
  importadaEm: string;
};

export function useExamesImportados(clienteId: string | null) {
  return useQuery({
    queryKey: ["health-exames", clienteId],
    enabled: !!clienteId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ExameImportado[]> => {
      const { data, error } = await db().rpc("ler_exames_importados", { p_cliente_id: clienteId });
      if (error) throw error;
      return (
        (data ?? []) as {
          remessa_id: string;
          laboratorio_nome: string;
          mime: string;
          tamanho_bytes: number;
          nome_original: string | null;
          arquivo_caminho: string;
          sha256_hex: string;
          recebida_em: string;
          importada_em: string;
        }[]
      ).map((r) => ({
        remessaId: r.remessa_id,
        laboratorioNome: r.laboratorio_nome,
        mime: r.mime,
        tamanhoBytes: r.tamanho_bytes,
        nomeOriginal: r.nome_original,
        arquivoCaminho: r.arquivo_caminho,
        sha256Hex: r.sha256_hex,
        recebidaEm: r.recebida_em,
        importadaEm: r.importada_em,
      }));
    },
  });
}

/** Abre o arquivo numa aba nova com URL assinada na hora. `null` = recusado. */
export async function assinarUrlRemessa(caminho: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET_REMESSAS)
    .createSignedUrl(caminho, TTL_URL_ASSINADA_SEGUNDOS);
  if (error || !data) return null;
  return data.signedUrl;
}

function invalidarCaixa(qc: ReturnType<typeof useQueryClient>, clienteId?: string) {
  void qc.invalidateQueries({ queryKey: ["health-caixa-entrada"] });
  if (clienteId) void qc.invalidateQueries({ queryKey: ["health-exames", clienteId] });
}

/** Conferir (recebida → validada) e aceitar (validada → importada). */
export function useProcessarRemessa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { remessaId: string; clienteId: string; para: "validada" | "importada" }) => {
      const { error } = await db().rpc("processar_remessa_externa", {
        p_remessa_id: p.remessaId,
        p_para: p.para,
      });
      if (error) throw error;
    },
    onSuccess: (_d, p) => invalidarCaixa(qc, p.clienteId),
  });
}

/** Rejeitar pela Edge Function: a mesma chamada nega a leitura e apaga os bytes. */
export function useRejeitarRemessa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { remessaId: string; motivo: string }) => {
      const { data, error } = await supabase.functions.invoke("remessa-rejeitar", {
        body: { remessa_id: p.remessaId, motivo: p.motivo },
      });
      if (error) throw error;
      const r = data as { ok: boolean; erro?: string; arquivo_expurgado?: boolean };
      if (!r.ok) throw new Error(r.erro ?? "Não foi possível rejeitar.");
      return r;
    },
    onSuccess: () => invalidarCaixa(qc),
  });
}

export type LinkEmitido = { concessaoId: string; url: string; expiraEm: string };

/**
 * Emite o link do laboratório. O token cru volta UMA vez: ele vai no
 * FRAGMENTO da URL (`#`), que o navegador não manda ao servidor da página
 * — não aparece em log de hospedagem —, e a página pública o repassa à
 * Edge Function no cabeçalho `x-token-externo`.
 */
export function useEmitirLinkExame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      clienteId: string;
      laboratorioId: string;
      validadeDias: number;
      usosMaximos: number | null;
    }): Promise<LinkEmitido> => {
      const { data, error } = await db().rpc("emitir_concessao_externa", {
        p_cliente_id: p.clienteId,
        p_pessoa_id: p.laboratorioId,
        p_finalidade: "recepcao_exame",
        p_validade: `${p.validadeDias} days`,
        p_usos_maximos: p.usosMaximos,
      });
      if (error) throw error;
      const linha = (data as { concessao_id: string; token: string; token_expira_em: string }[])[0];
      return {
        concessaoId: linha.concessao_id,
        url: `${window.location.origin}/enviar-exame#${linha.token}`,
        expiraEm: linha.token_expira_em,
      };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["health-concessoes-externas"] }),
  });
}

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
