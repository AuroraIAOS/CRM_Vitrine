import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

export type ReadableModule = {
  module_key: string;
  module_label: string;
  module_position: number;
  is_core: boolean;
};

/**
 * `access.readable_modules()` (003_core_access.sql) já aplica `access.can()`
 * no banco — nunca recalcular permissão no client. A navegação inteira do
 * app é derivada deste retorno (Subetapa 02.1, Qualidade: "nav.ts não
 * contém lista de módulos hardcoded").
 */
export function useReadableModules() {
  const { session, profileLoading } = useAuth();

  return useQuery({
    queryKey: ["readable-modules", session?.user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.schema("access").rpc("readable_modules");
      if (error) throw error;
      return (data ?? []) as ReadableModule[];
    },
    // profile pode ser null (achado A01) — a query roda mesmo assim, o
    // RPC devolve conjunto vazio (fail-closed no banco), nunca um erro.
    enabled: !!session && !profileLoading,
    staleTime: 5 * 60 * 1000,
  });
}
