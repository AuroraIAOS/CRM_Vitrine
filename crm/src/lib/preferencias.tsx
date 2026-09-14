import { useEffect, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

/**
 * Aparência da conta (Subetapa 02.12, tela `1m` → card "Aparência e layout").
 *
 * `docs/04_DESIGN_E_MARCA.md` §4 exige que tema, cor de destaque e layout
 * sejam "variável de conta, resolvida em tempo de carregamento — não exige
 * rebuild por cliente". É literalmente o que este arquivo faz: lê a linha de
 * `public.account_preferences` (migration 032) e escreve quatro atributos no
 * `<html>`; `src/index.css` traz as variantes correspondentes.
 *
 * Nenhum hex aqui — o CSS é dono da cor (docs/04 §4).
 */

export type Tema = "light" | "dark" | "system";
export type Densidade = "compact" | "comfortable";
export type Accent = "clinical_blue" | "sage" | "tan" | "lilac" | "terracotta";
export type Tipografia = "sans" | "serif";
export type TemplateLayout = "fixed_sidebar";

export type Preferencias = {
  tema: Tema;
  densidade: Densidade;
  accent: Accent;
  tipografia: Tipografia;
  templateLayout: TemplateLayout;
};

export const PREFERENCIAS_PADRAO: Preferencias = {
  tema: "light",
  densidade: "comfortable",
  accent: "clinical_blue",
  tipografia: "sans",
  templateLayout: "fixed_sidebar",
};

/**
 * O único template ligável do v01. A lista existe para a tela materializar
 * visualmente as 4 opções de `docs/04` §2 sem mentir sobre quais funcionam —
 * `disponivel: false` casa com o CHECK de valor único da migration 032, que
 * é quem de fato recusa (23514). Múltiplos templates é item `+1.0` do
 * backlog, não pré-requisito de lançamento (`docs/04` §4).
 */
export const TEMPLATES_LAYOUT = [
  {
    valor: "fixed_sidebar" as const,
    rotulo: "Sidebar fixa",
    disponivel: true,
    motivo: null,
  },
  {
    valor: "collapsible_sidebar",
    rotulo: "Sidebar colapsável",
    disponivel: false,
    motivo: "O shell do v01 tem a sidebar em grade fixa de 236px. Colapsar exige estado de largura no AppShell.",
  },
  {
    valor: "top_nav",
    rotulo: "Top-nav",
    disponivel: false,
    motivo: "Move a navegação inteira para o header — é outro shell, não uma variação de estilo.",
  },
  {
    valor: "sidebar_panel",
    rotulo: "Sidebar + painel",
    disponivel: false,
    motivo: "Exige uma terceira coluna com dono de conteúdo definido; nenhuma das 16 telas ratificadas a usa.",
  },
] as const;

export const ACCENTS: { valor: Accent; rotulo: string; amostra: string }[] = [
  { valor: "clinical_blue", rotulo: "Azul clínico", amostra: "bg-[#5b87a8]" },
  { valor: "sage", rotulo: "Sage", amostra: "bg-[#8fb4a6]" },
  { valor: "tan", rotulo: "Tan dourado", amostra: "bg-[#c8b79a]" },
  { valor: "lilac", rotulo: "Lilás", amostra: "bg-[#9c8fa8]" },
  { valor: "terracotta", rotulo: "Terracota", amostra: "bg-[#a8827a]" },
];

function mapLinha(row: {
  theme: Tema;
  density: Densidade;
  accent: Accent;
  typography: Tipografia;
  layout_template: TemplateLayout;
}): Preferencias {
  return {
    tema: row.theme,
    densidade: row.density,
    accent: row.accent,
    tipografia: row.typography,
    templateLayout: row.layout_template,
  };
}

export function usePreferencias() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;

  return useQuery({
    queryKey: ["preferencias-conta", accountId],
    enabled: !!accountId,
    // Aparência muda por ação deliberada de um admin, não sozinha —
    // revalidar a cada foco de janela só produziria repintura.
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Preferencias> => {
      const { data, error } = await supabase
        .from("account_preferences")
        .select("theme, density, accent, typography, layout_template")
        .eq("account_id", accountId!)
        .maybeSingle();
      if (error) throw error;
      // Conta criada antes da migration 032 e não semeada por qualquer
      // motivo cai no padrão em vez de ficar sem tema.
      return data ? mapLinha(data) : PREFERENCIAS_PADRAO;
    },
  });
}

export function useSalvarPreferencias() {
  const { profile, user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (mudanca: Partial<Preferencias>) => {
      const payload: Record<string, unknown> = { updated_by: user?.id ?? null };
      if (mudanca.tema !== undefined) payload.theme = mudanca.tema;
      if (mudanca.densidade !== undefined) payload.density = mudanca.densidade;
      if (mudanca.accent !== undefined) payload.accent = mudanca.accent;
      if (mudanca.tipografia !== undefined) payload.typography = mudanca.tipografia;
      if (mudanca.templateLayout !== undefined) payload.layout_template = mudanca.templateLayout;

      const { error } = await supabase
        .from("account_preferences")
        .update(payload)
        .eq("account_id", profile!.accountId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["preferencias-conta"] });
    },
  });
}

/**
 * Carrega as @font-face da serifa só quando a conta a escolhe (Subetapa
 * 03.3). O `import()` dinâmico faz o Vite emitir `fontes-serifa.css` como
 * chunk próprio, injetado em tempo de execução — numa conta na tipografia
 * padrão ele nunca é pedido, e as três faces ficam fora do CSS inicial.
 *
 * O guard não é otimização: sem ele, cada repintura de preferência
 * reimportaria o módulo. O `import()` é idempotente por cache do próprio
 * bundler, mas a promessa pendente não é — e a troca de tema dispara este
 * efeito junto com a de tipografia.
 */
let serifaPedida = false;
function garantirFonteSerifa(tipografia: Tipografia) {
  if (tipografia !== "serif" || serifaPedida) return;
  serifaPedida = true;
  // Falha de rede aqui degrada para a pilha de fallback do `font-family`,
  // que é o comportamento certo: texto legível em fonte de sistema é
  // melhor que tela sem texto. Não há o que reportar ao usuário.
  void import("../fontes-serifa.css").catch(() => {
    serifaPedida = false;
  });
}

/**
 * Escreve a preferência no `<html>`. Fora do React state de propósito: o
 * tema precisa valer para a página inteira, inclusive o `body` e qualquer
 * overlay em portal, que não estão dentro de `#root`.
 */
function aplicarNoDocumento(p: Preferencias) {
  const raiz = document.documentElement;

  garantirFonteSerifa(p.tipografia);

  const escuro =
    p.tema === "dark" ||
    (p.tema === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  raiz.classList.toggle("dark", escuro);

  raiz.dataset.density = p.densidade;
  raiz.dataset.accent = p.accent;
  raiz.dataset.typography = p.tipografia;
}

export function PreferenciasProvider({ children }: { children: ReactNode }) {
  const { data: preferencias } = usePreferencias();
  const efetivas = preferencias ?? PREFERENCIAS_PADRAO;

  useEffect(() => {
    aplicarNoDocumento(efetivas);
  }, [efetivas.tema, efetivas.densidade, efetivas.accent, efetivas.tipografia]);

  // 'sistema' só é honesto se acompanhar a troca no meio da sessão — o
  // usuário pode mudar o tema do SO com o CRM aberto.
  useEffect(() => {
    if (efetivas.tema !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const aoMudar = () => aplicarNoDocumento(efetivas);
    mq.addEventListener("change", aoMudar);
    return () => mq.removeEventListener("change", aoMudar);
  }, [efetivas.tema, efetivas.densidade, efetivas.accent, efetivas.tipografia]);

  return <>{children}</>;
}
