import { useAuth } from "@/lib/auth";
import { useMeuProfissional } from "./api";
import { AgendaSemanaPage } from "./AgendaSemanaPage";
import { MeuDiaPage } from "./MeuDiaPage";
import { BalcaoPage } from "./BalcaoPage";

/**
 * `/agenda` — ponto único de entrada que decide entre as três telas de
 * `aba_scheduling` (docs/01_ARQUITETURA.md §7.3, Qualidade da Subetapa
 * 02.6: "1n/1o são filtro de UI sobre o RBAC existente, nunca papel
 * novo"). Nenhuma checagem de permissão nova acontece aqui — a régua
 * real continua sendo `access.can()`/RLS; isto só escolhe QUAL
 * apresentação mostrar para quem já passou pelo RoleGate:
 *
 *   - `agent` com atributo profissional ativo → "Meu dia" (`1n`).
 *   - `admin` sem esse atributo → "Balcão" (`1o`), a tela de recepção.
 *   - Qualquer outro caso (owner, agent sem atributo, viewer) → a
 *     Agenda semanal completa (`1e`), que é onde o CRUD de fato mora
 *     (criar/editar/cancelar, arrastar para bloquear horário). Owner
 *     não está mapeado em nenhuma das duas telas reduzidas do
 *     wireframe — decisão desta subetapa: quem gerencia a conta vê a
 *     grade cheia por padrão.
 */
export function AgendaPage() {
  const { profile } = useAuth();
  const { data: meuProfissional, isLoading } = useMeuProfissional();

  if (isLoading) {
    return <div className="p-6 text-[12px] text-muted-foreground">Carregando…</div>;
  }
  if (meuProfissional) {
    return <MeuDiaPage profissional={meuProfissional} />;
  }
  if (profile?.accountRole === "admin") {
    return <BalcaoPage />;
  }
  return <AgendaSemanaPage />;
}
