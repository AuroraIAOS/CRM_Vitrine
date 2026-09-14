import { useState } from "react";
import { useAuth, type AccountRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ROTULO_PAPEL: Record<AccountRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  agent: "Profissional/Atendimento",
  viewer: "Leitura",
};

/**
 * Segundo estágio do login (Subetapa 03.9, item 24 do MVP): o e-mail pertence
 * a mais de um consultório, e nenhum foi escolhido nesta sessão. Enquanto a
 * escolha não é feita o banco nega tudo — esta tela é a única coisa que se vê.
 *
 * A escolha vale POR SESSÃO (decisão de Max, 2026-09-14): outro aparelho da
 * mesma pessoa escolhe a própria clínica.
 */
export function EscolherClinicaPage() {
  const { clinicas, escolherClinica, signOut, user } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);

  async function escolher(accountId: string) {
    setErro(null);
    setEnviando(accountId);
    const { error } = await escolherClinica(accountId);
    setEnviando(null);
    if (error) setErro(error);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-content">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Em qual clínica você vai trabalhar?</CardTitle>
          <p className="text-[12px] text-muted-foreground">
            {user?.email} pertence a {clinicas.length} clínicas. Os dados de uma nunca aparecem na outra.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {clinicas.map((c) => (
            <Button
              key={c.accountId}
              variant="outline"
              className="h-auto flex-col items-start gap-0.5 py-2"
              disabled={enviando !== null}
              onClick={() => void escolher(c.accountId)}
            >
              <span className="text-sm font-medium">{c.nome}</span>
              <span className="text-[11px] text-muted-foreground">
                {enviando === c.accountId ? "Entrando…" : ROTULO_PAPEL[c.papel]}
              </span>
            </Button>
          ))}
          {erro && <span className="text-sm text-destructive">{erro}</span>}
          <button type="button" className="mt-2 text-[11.5px] text-muted-foreground underline" onClick={() => void signOut()}>
            Sair
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
