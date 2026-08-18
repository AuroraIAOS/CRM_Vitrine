import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth";

/**
 * Exige sessão válida. O gate por papel/módulo é o banco (`access.can()`/
 * RLS), nunca duplicado aqui — este componente só decide se renderiza o
 * app ou manda para o login; o *conjunto* de telas que o usuário enxerga
 * vem de `access.readable_modules()` (Subetapa 02.1, `lib/access.ts`).
 */
export function RoleGate() {
  const { session, loading, profileLoading } = useAuth();

  if (loading || (session && profileLoading)) return null;
  if (!session) return <Navigate to="/login" replace />;

  return <Outlet />;
}
