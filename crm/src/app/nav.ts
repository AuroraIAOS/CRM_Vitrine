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

/** Itens do corpo rolável da sidebar — só módulos não-núcleo, na ordem de `position`. */
export function buildModuleNav(modules: ReadableModule[]): NavItem[] {
  return modules
    .filter((m) => !m.is_core)
    .sort((a, b) => a.module_position - b.module_position)
    .map(toNavItem);
}

/** `Configurações` do rodapé fixo — só aparece se `access.can('settings','read')` permitir. */
export function findSettingsNavItem(modules: ReadableModule[]): NavItem | null {
  const settings = modules.find((m) => m.module_key === "settings");
  return settings ? toNavItem(settings) : null;
}
