import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/**
 * Dashboard real chega na Etapa 02 (aba_people/aba_sales/aba_finance com
 * dado de verdade). Esta página prova, na Subetapa 01.1, que o client
 * Supabase conecta e a sessão autenticada chega até a UI.
 */
export function DashboardPage() {
  const { user, session } = useAuth();

  return (
    <div className="m-6 flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Bootstrap confirmado</CardTitle>
          <CardDescription>Subetapa 01.1 — conexão Supabase + autenticação</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <span>
            Usuário autenticado: <strong>{user?.email}</strong>
          </span>
          <span className="text-muted-foreground">
            Sessão válida até {session ? new Date(session.expires_at! * 1000).toLocaleString("pt-BR") : "—"}
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
