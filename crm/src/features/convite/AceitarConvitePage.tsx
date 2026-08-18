import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type PeekResultado =
  | { ok: true; account_name: string; role: string; expires_at: string }
  | { ok: false; reason: "not_found" | "expired" | "used" };

const MOTIVO_MENSAGEM: Record<string, string> = {
  not_found: "Convite não encontrado — confira se o link foi copiado por inteiro.",
  expired: "Este convite expirou. Peça um novo link a quem convidou.",
  used: "Este convite já foi resgatado.",
};

const schemaCadastro = z.object({
  fullName: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});
type FormCadastro = z.infer<typeof schemaCadastro>;

/**
 * Rota pública (fora do RoleGate) — /convite?token=... . O token em
 * claro só existe nesta URL e no momento em que criar_convite() o
 * devolveu (Subetapa 02.2); nunca é gravado em texto legível no banco.
 */
export function AceitarConvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";
  const { session, signUp } = useAuth();
  const [pendenteConfirmacao, setPendenteConfirmacao] = useState(false);

  const peek = useQuery({
    queryKey: ["peek-convite", token],
    enabled: !!token,
    queryFn: async (): Promise<PeekResultado> => {
      const { data, error } = await supabase.rpc("peek_convite", { p_token: token });
      if (error) throw error;
      return data as PeekResultado;
    },
  });

  const resgatar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("resgatar_convite", { p_token: token });
      if (error) throw error;
    },
    onSuccess: () => navigate("/", { replace: true }),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormCadastro>({ resolver: zodResolver(schemaCadastro) });

  async function onCadastrar(values: FormCadastro) {
    const { error } = await signUp(values.email, values.password, values.fullName);
    if (error) return;
    // signUp() pode devolver sessão ativa na hora (confirmação de e-mail
    // desligada no projeto) ou exigir clique em e-mail de confirmação —
    // não há como saber sem tentar; useAuth().session reage sozinho
    // quando a sessão chega (onAuthStateChange), e o botão "Aceitar
    // convite" abaixo aparece assim que existir.
    setPendenteConfirmacao(true);
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-content">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 text-sm text-muted-foreground">Link de convite inválido — falta o token.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-content">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>CRM Vitrine</CardTitle>
          <CardDescription>Convite de equipe</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {peek.isLoading && <span className="text-sm text-muted-foreground">Verificando convite…</span>}

          {peek.data && !peek.data.ok && (
            <span className="text-sm text-destructive">{MOTIVO_MENSAGEM[peek.data.reason]}</span>
          )}

          {peek.data?.ok && (
            <>
              <p className="text-sm">
                Você foi convidado para <strong>{peek.data.account_name}</strong>.
              </p>

              {session ? (
                <>
                  <Button onClick={() => resgatar.mutate()} disabled={resgatar.isPending}>
                    {resgatar.isPending ? "Aceitando..." : "Aceitar convite"}
                  </Button>
                  {resgatar.isError && (
                    <span className="text-sm text-destructive">
                      {(resgatar.error as { message?: string })?.message ?? "Falha ao aceitar o convite"}
                    </span>
                  )}
                </>
              ) : pendenteConfirmacao ? (
                <span className="text-sm text-muted-foreground">
                  Cadastro enviado. Se o projeto exigir confirmação de e-mail, confira sua caixa de entrada e depois{" "}
                  <Link className="text-primary underline" to={`/login?redirect=${encodeURIComponent(`/convite?token=${token}`)}`}>
                    entre por aqui
                  </Link>{" "}
                  para concluir.
                </span>
              ) : (
                <form className="flex flex-col gap-3" onSubmit={handleSubmit(onCadastrar)}>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium">Nome</label>
                    <input className="rounded-md border bg-background px-3 py-2 text-sm" {...register("fullName")} />
                    {errors.fullName && <span className="text-xs text-destructive">{errors.fullName.message}</span>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium">E-mail</label>
                    <input type="email" className="rounded-md border bg-background px-3 py-2 text-sm" {...register("email")} />
                    {errors.email && <span className="text-xs text-destructive">{errors.email.message}</span>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium">Senha</label>
                    <input type="password" className="rounded-md border bg-background px-3 py-2 text-sm" {...register("password")} />
                    {errors.password && <span className="text-xs text-destructive">{errors.password.message}</span>}
                  </div>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Criando conta..." : "Criar conta e aceitar"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Já tem uma conta?{" "}
                    <Link className="text-primary underline" to={`/login?redirect=${encodeURIComponent(`/convite?token=${token}`)}`}>
                      Entrar
                    </Link>
                  </span>
                </form>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
