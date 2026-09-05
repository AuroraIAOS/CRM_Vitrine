import type { LucideIcon } from "lucide-react";
import {
  Users,
  CalendarDays,
  TrendingUp,
  Wallet,
  HeartPulse,
  Package,
  MessageSquare,
  Workflow,
  Sparkles,
  Settings,
  ClipboardList,
} from "lucide-react";
import type { ReadableModule } from "@/lib/access";

export type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  moduleKey: string;
};

/**
 * Rota e ícone são decisão de produto por módulo — só o CONJUNTO visível
 * (quais chaves aparecem) é dinâmico, vindo de `access.readable_modules()`.
 * `settings` fica fora do loop principal por ser `is_core=true`
 * (`docs/01_ARQUITETURA.md` §7.1) — renderizado à parte, no rodapé fixo.
 */
const MODULE_ROUTE: Record<string, string> = {
  people: "/pessoas",
  scheduling: "/agenda",
  sales: "/vendas",
  finance: "/financeiro",
  health: "/prontuario",
  treatment: "/plano",
  catalog: "/catalogo",
  messaging: "/mensagens",
  automations: "/automacoes",
  ai: "/ia",
  settings: "/configuracoes",
};

const MODULE_ICON: Record<string, LucideIcon> = {
  people: Users,
  scheduling: CalendarDays,
  sales: TrendingUp,
  finance: Wallet,
  health: HeartPulse,
  treatment: ClipboardList,
  catalog: Package,
  messaging: MessageSquare,
  automations: Workflow,
  ai: Sparkles,
  settings: Settings,
};

function toNavItem(module: ReadableModule): NavItem {
  return {
    label: module.module_label,
    path: MODULE_ROUTE[module.module_key] ?? `/${module.module_key}`,
    icon: MODULE_ICON[module.module_key] ?? Package,
    moduleKey: module.module_key,
  };
}

/**
 * MÓDULOS QUE EXISTEM NO BANCO E AINDA NÃO TÊM TELA.
 *
 * A lista nasceu na Subetapa 03.8, quando `treatment` entrou em
 * `access.modules` numa subetapa que era **só de banco** por decisão de
 * escopo — e o banco sozinho já mexia na tela, porque a navegação é
 * derivada de `access.readable_modules()` desde a 02.1. O efeito era
 * imediato e silencioso: `toNavItem` cai no `/${module_key}` quando não
 * conhece a rota, e o site publicado passou a mostrar um item "Plano"
 * apontando para uma rota inexistente.
 *
 * **A Subetapa 03.8.a esvaziou a lista**, que era o que o comentário
 * anterior prometia: `treatment` ganhou `/plano` no `MODULE_ROUTE` acima,
 * ícone próprio e a página de verdade. A lista FICA — vazia — porque o
 * mecanismo continua sendo necessário: a próxima linha nova em
 * `access.modules` acende um item de menu no minuto seguinte, e é aqui
 * que ela espera a tela dela.
 *
 * REGRA QUE FICA: navegação dirigida por dado transforma toda linha nova
 * de catálogo em mudança de interface. Antes de acrescentar módulo,
 * pergunte o que a tela publicada fará com ele hoje — e lembre que o
 * fallback que existe para ser tolerante é o mesmo que esconde a falta.
 */
const MODULOS_SEM_TELA = new Set<string>([]);

/** Itens do corpo rolável da sidebar — só módulos não-núcleo, na ordem de `position`. */
export function buildModuleNav(modules: ReadableModule[]): NavItem[] {
  return modules
    .filter((m) => !m.is_core && !MODULOS_SEM_TELA.has(m.module_key))
    .sort((a, b) => a.module_position - b.module_position)
    .map(toNavItem);
}

/** `Configurações` do rodapé fixo — só aparece se `access.can('settings','read')` permitir. */
export function findSettingsNavItem(modules: ReadableModule[]): NavItem | null {
  const settings = modules.find((m) => m.module_key === "settings");
  return settings ? toNavItem(settings) : null;
}
