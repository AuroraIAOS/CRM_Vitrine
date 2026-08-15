import type { LucideIcon } from "lucide-react";
import { LayoutDashboard } from "lucide-react";

export type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
};

// Cresce por módulo (aba_people, aba_sales, ...) conforme a Etapa 02
// implementa cada tela real — não antecipar item de menu sem tela.
export const NAV: NavItem[] = [{ label: "Dashboard", path: "/", icon: LayoutDashboard }];
