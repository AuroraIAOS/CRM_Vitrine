import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth, type AccountRole } from "@/lib/auth";
import { useEquipe, useCriarConvite, useDefinirProfissional, useMudarPapel, type ConviteCriado } from "./useEquipe";

const ROTULO_PAPEL: Record<AccountRole, string> = {
  owner: "Proprietário(a)",
  admin: "Administrador(a)",
  agent: "Membro",
  viewer: "Leitura",
};

const PAPEIS_CONVIDAVEIS: AccountRole[] = ["admin", "agent", "viewer"];

function Pill({ tone, children }: { tone: "success" | "warning" | "muted"; children: React.ReactNode }) {
  const classes =
    tone === "success"
      ? "bg-success-tint text-success-tint-foreground"
      : tone === "warning"
        ? "bg-warning-tint text-warning-tint-foreground"
        : "bg-content text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${classes}`}>{children}</span>;
}

function FormularioConvite({ onCriado }: { onCriado: (c: ConviteCriado) => void }) {
  const [role, setRole] = useState<AccountRole>("agent");
  const [label, setLabel] = useState("");
  const criar = useCriarConvite();

  return (
    <form
      className="flex flex-col gap-2 rounded-md border border-border bg-content p-3"
      onSubmit={(e) => {
        e.preventDefault();
        criar.mutate(
          { role, label: label || undefined },
          { onSuccess: (data) => onCriado(data) },
        );
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-secondary-foreground">Papel</label>
          <select
            className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
            value={role}
            onChange={(e) => setRole(e.target.value as AccountRole)}
          >
            {PAPEIS_CONVIDAVEIS.map((p) => (
              <option key={p} value={p}>
                {ROTULO_PAPEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-[11px] font-medium text-secondary-foreground">Rótulo (opcional)</label>
          <input
            className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
            placeholder="Ex.: Recepção — turno da tarde"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <Button type="submit" size="sm" disabled={criar.isPending}>
          {criar.isPending ? "Gerando..." : "Gerar convite"}
        </Button>
      </div>
      {criar.isError && (
        <span className="text-[11.5px] text-destructive">{(criar.error as { message?: string })?.message ?? "Falha ao criar convite"}</span>
      )}
    </form>
  );
}

function ConviteGerado({ convite }: { convite: ConviteCriado }) {
  const link = `${window.location.origin}/convite?token=${convite.token}`;
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-success bg-success-tint p-3">
      <span className="text-[11.5px] font-medium text-success-tint-foreground">
        Convite gerado — envie este link ao convidado. Ele só aparece uma vez, nunca fica salvo em texto legível.
      </span>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-[5px] border border-input bg-background px-2 py-1.5 font-mono text-[11px]">
          {link}
        </code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(link);
            setCopiado(true);
          }}
        >
          {copiado ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <span className="text-[10.5px] text-muted-foreground">
        Papel: {ROTULO_PAPEL[convite.role]} · expira em {new Date(convite.expires_at).toLocaleDateString("pt-BR")}
      </span>
    </div>
  );
}

export function EquipePage() {
  const { user, profile } = useAuth();
  const { data: membros, isLoading } = useEquipe();
  const definirProfissional = useDefinirProfissional();
  const mudarPapel = useMudarPapel();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [ultimoConvite, setUltimoConvite] = useState<ConviteCriado | null>(null);

  const podeGerenciar = profile?.accountRole === "owner" || profile?.accountRole === "admin";

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Equipe</CardTitle>
            <CardDescription>Convite → funcionário → atributo profissional (docs/01_ARQUITETURA.md §7.4)</CardDescription>
          </div>
          {podeGerenciar && (
            <Button size="sm" variant={mostrarFormulario ? "outline" : "default"} onClick={() => setMostrarFormulario((v) => !v)}>
              {mostrarFormulario ? "Cancelar" : "+ Convidar"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {mostrarFormulario && <FormularioConvite onCriado={setUltimoConvite} />}
          {ultimoConvite && <ConviteGerado convite={ultimoConvite} />}

          {isLoading && <span className="text-[12px] text-muted-foreground">Carregando…</span>}

          <div className="flex flex-col divide-y divide-hairline">
            {membros?.map((m) => (
              <div key={m.profileId} className="flex items-center justify-between gap-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[12.5px] font-medium">{m.nome}</span>
                  <span className="font-mono text-[10.5px] text-muted-foreground">{m.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  {m.funcionarioAtivo ? <Pill tone="success">Funcionário ativo</Pill> : <Pill tone="muted">Sem login ativo</Pill>}
                  {m.profissionalAtivo && <Pill tone="warning">Profissional</Pill>}

                  {podeGerenciar && m.accountRole === "agent" && m.funcionarioId && m.userId !== user?.id && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={definirProfissional.isPending}
                      onClick={() =>
                        definirProfissional.mutate({ funcionarioId: m.funcionarioId!, profissional: !m.profissionalAtivo })
                      }
                    >
                      {m.profissionalAtivo ? "Desligar profissional" : "Ligar profissional"}
                    </Button>
                  )}

                  {podeGerenciar && m.userId !== user?.id && m.accountRole !== "owner" ? (
                    <select
                      className="rounded-[5px] border border-input bg-background px-2 py-1 text-[11.5px]"
                      value={m.accountRole}
                      disabled={mudarPapel.isPending}
                      onChange={(e) => mudarPapel.mutate({ userId: m.userId, novoPapel: e.target.value as AccountRole })}
                    >
                      {PAPEIS_CONVIDAVEIS.map((p) => (
                        <option key={p} value={p}>
                          {ROTULO_PAPEL[p]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Pill tone="muted">{ROTULO_PAPEL[m.accountRole]}</Pill>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
