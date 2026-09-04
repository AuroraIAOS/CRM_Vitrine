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

/**
 * MÓDULOS QUE EXISTEM NO BANCO E AINDA NÃO TÊM TELA.
 *
 * `treatment` (rótulo "Planos") nasceu na Subetapa 03.8 — schema, RLS,
 * regras e operações —, e a decisão de Max foi entregar a subetapa **só no
 * banco**: a tela da matriz (fase na linha, opção na coluna) vem junto com o
 * preço, na 03.8.a. A linha em `access.modules` é necessária desde já, porque
 * é ela que faz o módulo aparecer na matriz de permissões e é dela que
 * `access.can('treatment', ...)` depende.
 *
 * Sem esta lista, o efeito seria imediato e visível: `toNavItem` cai no
 * `/${module_key}` quando não conhece a rota, e o site publicado passaria a
 * mostrar um item de menu "Planos" que leva a lugar nenhum. É a armadilha que
 * a Subetapa 03.6.b já pagou por outro caminho — mudar o banco antes de a
 * tela saber — e aqui ela foi vista antes de publicar, não depois.
 *
 * **Tirar a chave daqui é parte da subetapa que entregar a tela**, e o
 * `MODULE_ROUTE` acima é onde a rota nova se declara. Enquanto a chave estiver
 * nesta lista, o módulo é invisível na navegação e continua inteiro na matriz
 * de permissões — que é exatamente a divisão certa entre "existe" e "tem
 * porta".
 */
const MODULOS_SEM_TELA = new Set<string>(["treatment"]);

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
