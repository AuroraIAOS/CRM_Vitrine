import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth";

/**
 * Por ora só exige sessão válida. Gate por papel/módulo (is_account_member +
 * access.can) entra quando `access`/`public.profiles` existirem (Subetapa
 * 01.2 em diante) — não simular RBAC no client antes de o RLS existir no banco.
 */
export function RoleGate() {
  const { session, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;

  return <Outlet />;
}
