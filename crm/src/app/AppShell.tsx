import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { LogOut, LifeBuoy } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useReadableModules } from "@/lib/access";
import { buildModuleNav, findSettingsNavItem, type NavItem } from "./nav";
import { cn } from "@/lib/utils";

/**
 * Shell do wireframe ratificado (`design/wireframes-crm-sa-de-e-est-tica/
 * project/Shell.dc.html`, docs/04 §5.5): grid 236px sidebar + 56px header.
 * A busca global do header, os botões "Período"/"Filtros" e os dois ícones
 * de notificação do wireframe ficam FORA desta subetapa — nenhum tem
 * função real ainda (busca global é item de backlog sem dono, docs/00
 * "Pendências vigiadas"; período/filtros dependem de tela de dados que
 * ainda não existe). Construir chrome decorativo sem função contraria
 * "nenhuma checagem/UI fake" — entram quando a subetapa que os usa existir.
 */
function navLinkClass(active: boolean) {
  return cn(
    "flex items-center gap-2 rounded-[5px] px-[7px] py-1 text-[11.5px] font-medium transition-colors",
    active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-content hover:text-foreground",
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  const location = useLocation();
  const active = location.pathname === item.path;
  const Icon = item.icon;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-[7px] font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/70">
        aba_{item.moduleKey}
      </span>
      <NavLink to={item.path} className={navLinkClass(active)}>
        <Icon className="h-3.5 w-3.5" />
        {item.label}
      </NavLink>
    </div>
  );
}

export function AppShell() {
  const { user, profile, signOut } = useAuth();
  const { data: modules } = useReadableModules();
  const location = useLocation();

  const moduleItems = buildModuleNav(modules ?? []);
  const settingsItem = findSettingsNavItem(modules ?? []);

  // startsWith, não só igualdade exata — cobre sub-rotas como /pessoas/:id
  // (Subetapa 02.3), que precisam continuar sob o breadcrumb do módulo pai.
  const currentModule = moduleItems.find(
    (item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`),
  );
  const breadcrumb = currentModule
    ? `aba_${currentModule.moduleKey} > ${currentModule.label}`
    : settingsItem && location.pathname === settingsItem.path
      ? `core > ${settingsItem.label}`
      : location.pathname === "/suporte"
        ? "core > Suporte"
        : "core > dashboard";

  return (
    <div className="grid min-h-screen grid-cols-[236px_1fr] grid-rows-[56px_1fr] bg-background text-foreground">
      {/* Cabeçalho da sidebar: logo + nome, leva à Dashboard (docs/01 §7.1 — não há item de nav próprio para o dashboard no wireframe) */}
      <Link
        to="/"
        className="col-start-1 row-start-1 flex items-center gap-[9px] border-b border-r border-border px-3"
      >
        <div className="h-[22px] w-[22px] rounded-[5px] bg-accent" />
        <span className="text-[12.5px] font-semibold tracking-[0.04em]">CRM Vitrine</span>
      </Link>

      {/* Header: identidade do usuário autenticado */}
      <header className="col-start-2 row-start-1 flex items-center justify-end gap-3 border-b border-border px-4">
        <div className="flex items-center gap-2 rounded-full border border-border py-[3px] pl-[3px] pr-[10px]">
          <div className="h-[22px] w-[22px] rounded-full bg-accent" />
          <span className="text-[11.5px] text-secondary-foreground">{profile?.fullName || user?.email}</span>
        </div>
      </header>

      {/* Sidebar: módulos dinâmicos (access.readable_modules()) + rodapé fixo */}
      <aside className="col-start-1 row-start-2 flex flex-col overflow-y-auto border-r border-border bg-background p-2">
        <nav className="flex flex-1 flex-col gap-[9px]">
          {moduleItems.map((item) => (
            <SidebarLink key={item.moduleKey} item={item} />
          ))}
        </nav>
        <div className="flex flex-col gap-0.5 border-t border-border pt-[9px]">
          {settingsItem && (
            <NavLink to={settingsItem.path} className={navLinkClass(location.pathname === settingsItem.path)}>
              <settingsItem.icon className="h-3.5 w-3.5" />
              {settingsItem.label}
            </NavLink>
          )}
          <NavLink to="/suporte" className={navLinkClass(location.pathname === "/suporte")}>
            <LifeBuoy className="h-3.5 w-3.5" />
            Suporte
          </NavLink>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex items-center gap-2 rounded-[5px] px-[7px] py-1 text-left text-[11.5px] font-medium text-muted-foreground hover:bg-content hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>
      </aside>

      {/* Área de conteúdo: faixa de breadcrumb mono + fundo #f4f6f7 */}
      <section className="col-start-2 row-start-2 flex flex-col overflow-hidden">
        <div className="flex items-center border-b border-border bg-background px-4 py-[9px]">
          <span className="font-mono text-[10.5px] text-muted-foreground">{breadcrumb}</span>
        </div>
        <main className="flex-1 overflow-auto bg-content p-4">
          <Outlet />
        </main>
      </section>
    </div>
  );
}
