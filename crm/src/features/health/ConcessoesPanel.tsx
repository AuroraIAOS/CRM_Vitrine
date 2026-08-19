import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useEquipe } from "@/features/settings/useEquipe";
import { useClientesDaConta, useConcederAcesso, useConcessoes, useRevogarConcessao, type Concessao } from "./api";

const formatoData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Painel de concessões de prontuário (camada IBAC), portado de
 * `src/modules/health/grants-panel.tsx` do CRM Maximus.
 *
 * Sem ele, `aba_health.pode_acessar()` só abriria pelo atributo
 * profissional e não existiria caminho de APLICAÇÃO para o proprietário
 * autorizar alguém nominalmente — o cenário permitido da Subetapa 02.9 só
 * poderia ser produzido por SQL, o que é o oposto de "profissional com
 * concessão lê e escreve pela UI".
 *
 * A tela não repete checagem de papel: quem não é `admin+` recebe lista
 * vazia da própria RLS, e quem não é `owner` recebe erro do banco ao
 * tentar gravar. A regra fica num lugar só — no banco.
 */
export function ConcessoesPanel() {
  const { data: concessoes = [], isLoading } = useConcessoes();
  const { data: equipe = [] } = useEquipe();
  const { data: clientes = [] } = useClientesDaConta();
  const conceder = useConcederAcesso();
  const revogar = useRevogarConcessao();

  const [aberto, setAberto] = useState(false);
  const [usuarioId, setUsuarioId] = useState("");
  const [escopo, setEscopo] = useState<Concessao["escopo"]>("cliente_unico");
  const [clienteId, setClienteId] = useState("");
  const [efeito, setEfeito] = useState<Concessao["efeito"]>("permitir");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const nomePorUsuario = new Map(equipe.map((m) => [m.userId, m.nome]));
  const nomePorCliente = new Map(clientes.map((c) => [c.id, c.nome]));

  async function aoConceder() {
    setErro(null);
    if (!usuarioId) {
      setErro("Escolha a quem a concessão se aplica.");
      return;
    }
    if (escopo === "cliente_unico" && !clienteId) {
      setErro("Concessão de cliente único precisa apontar o cliente.");
      return;
    }
    try {
      await conceder.mutateAsync({ usuarioConcedidoId: usuarioId, escopo, clienteId, efeito, motivo: motivo.trim() });
      setMotivo("");
      setAberto(false);
    } catch (e) {
      setErro(
        e instanceof Error
          ? `${e.message} — conceder acesso clínico é atribuição exclusiva do proprietário da conta.`
          : "Não foi possível registrar a concessão.",
      );
    }
  }

  // Sem concessão nenhuma e sem equipe carregada, o painel não tem o que
  // dizer a quem não é admin+ — a RLS já o esvaziou.
  if (!isLoading && concessoes.length === 0 && equipe.length === 0) return null;

  return (
    <Card className="flex flex-col gap-2.5 p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[12px] font-medium text-foreground">Concessões de prontuário</span>
          <span className="text-[10.5px] text-muted-foreground">
            Autorização nominal, acima do papel. Uma negação vigente vence tudo, inclusive o atributo profissional.
          </span>
        </div>
        <Button size="sm" variant={aberto ? "ghost" : "outline"} onClick={() => setAberto((v) => !v)}>
          {aberto ? "Cancelar" : "Nova concessão"}
        </Button>
      </div>

      {aberto && (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10.5px] text-secondary-foreground">Usuário</span>
              <select
                value={usuarioId}
                onChange={(e) => setUsuarioId(e.target.value)}
                className="h-8 rounded-md border px-1.5 text-[11px]"
              >
                <option value="">Selecione…</option>
                {equipe.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.nome} · {m.accountRole}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10.5px] text-secondary-foreground">Escopo</span>
              <select
                value={escopo}
                onChange={(e) => setEscopo(e.target.value as Concessao["escopo"])}
                className="h-8 rounded-md border px-1.5 text-[11px]"
              >
                <option value="cliente_unico">Um cliente</option>
                <option value="todos_registros">Todos os prontuários</option>
              </select>
            </label>
            {escopo === "cliente_unico" && (
              <label className="flex flex-col gap-1">
                <span className="text-[10.5px] text-secondary-foreground">Cliente</span>
                <select
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  className="h-8 rounded-md border px-1.5 text-[11px]"
                >
                  <option value="">Selecione…</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-[10.5px] text-secondary-foreground">Efeito</span>
              <select
                value={efeito}
                onChange={(e) => setEfeito(e.target.value as Concessao["efeito"])}
                className="h-8 rounded-md border px-1.5 text-[11px]"
              >
                <option value="permitir">Permitir</option>
                <option value="negar">Negar</option>
              </select>
            </label>
          </div>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (fica registrado junto da concessão)"
            className="h-8 rounded-md border px-2 text-[11px]"
          />
          {erro && <span className="text-[10.5px] text-destructive">{erro}</span>}
          <Button size="sm" onClick={() => void aoConceder()} disabled={conceder.isPending}>
            Registrar concessão
          </Button>
        </div>
      )}

      {isLoading && <span className="text-[11px] text-muted-foreground">Carregando…</span>}
      {!isLoading && concessoes.length === 0 && (
        <span className="text-[11px] text-muted-foreground">
          Nenhuma concessão registrada — o acesso depende só do atributo profissional e da permissão do módulo.
        </span>
      )}
      {concessoes.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11.5px] text-foreground">
              {nomePorUsuario.get(c.usuarioConcedidoId) ?? c.usuarioConcedidoId.slice(0, 8)}
              {" · "}
              {c.escopo === "todos_registros"
                ? "todos os prontuários"
                : (nomePorCliente.get(c.clienteId ?? "") ?? "cliente")}
            </span>
            <span className="font-mono text-[9.5px] text-muted-foreground">
              {formatoData.format(new Date(c.criadoEm))}
              {c.motivo ? ` · ${c.motivo}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={c.efeito === "permitir" ? "success" : "danger"}>{c.efeito}</Badge>
            <Button size="sm" variant="ghost" onClick={() => void revogar.mutateAsync(c.id)}>
              Revogar
            </Button>
          </div>
        </div>
      ))}
    </Card>
  );
}
