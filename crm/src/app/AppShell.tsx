import { Suspense } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { LogOut, LifeBuoy, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useReadableModules } from "@/lib/access";
import { buildModuleNav, findSettingsNavItem, type NavItem } from "./nav";
import { cn } from "@/lib/utils";
import { CarregandoRota } from "@/components/shared/CarregandoRota";

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

  /**
   * O caminho é a navegação de volta do app — não é enfeite.
   *
   * Até a Subetapa 02.12b ele era uma string solta, e por isso cada tela que
   * precisava voltar inventava um link próprio ("← Prontuário" aparecia duas
   * vezes em `ProntuarioPage`). Duas peças fazendo o mesmo trabalho é uma a
   * mais: a que fica é esta, porque está em todas as telas.
   *
   * O primeiro segmento (`aba_health`, `core`) é **namespace, não lugar** —
   * não há para onde ele levar, então não é link. O segundo é a página, e
   * navega sempre: estando numa sub-rota, ele é o retorno; estando na
   * própria página, ele recarrega, que é o comportamento normal de um
   * caminho.
   */
  const trilha: { rotulo: string; caminho: string | null }[] = currentModule
    ? [
        { rotulo: `aba_${currentModule.moduleKey}`, caminho: null },
        { rotulo: currentModule.label, caminho: currentModule.path },
      ]
    : settingsItem && location.pathname.startsWith(settingsItem.path)
      ? [
          { rotulo: "core", caminho: null },
          { rotulo: settingsItem.label, caminho: settingsItem.path },
        ]
      : location.pathname === "/suporte"
        ? [
            { rotulo: "core", caminho: null },
            { rotulo: "Suporte", caminho: "/suporte" },
          ]
        : [
            { rotulo: "core", caminho: null },
            { rotulo: "Dashboard", caminho: "/" },
          ];

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
          {/* Dashboard não é módulo de `access.modules` — é a tela inicial da
              conta, e todo membro a alcança (o conteúdo dela é que se reduz
              por permissão, KPI a KPI). Ficava acessível só pela logomarca,
              o que é caminho que ninguém adivinha. */}
          <NavLink to="/" end className={navLinkClass(location.pathname === "/")}>
            <LayoutDashboard className="h-3.5 w-3.5" />
            Dashboard
          </NavLink>
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

      {/* Área de conteúdo: faixa do caminho + canvas.
          A faixa usa `bg-content`, o mesmo fundo do canvas, para o caminho
          pertencer à área de conteúdo em vez de virar uma terceira barra;
          os segmentos ganham forma de pílula, o mesmo vocabulário já usado
          nas tags (docs/04 §5.5). */}
      <section className="col-start-2 row-start-2 flex flex-col overflow-hidden">
        <nav aria-label="Caminho" className="flex items-center gap-1.5 border-b border-border bg-content px-4 py-[7px]">
          {trilha.map((passo, i) => (
            <div key={passo.rotulo} className="flex items-center gap-1.5">
              {i > 0 && <span className="font-mono text-[10px] text-muted-foreground/60">›</span>}
              {passo.caminho ? (
                <Link
                  to={passo.caminho}
                  className="rounded-full border border-border bg-background px-2.5 py-[3px] font-mono text-[10.5px] text-secondary-foreground transition-colors hover:border-primary hover:text-accent-foreground"
                >
                  {passo.rotulo}
                </Link>
              ) : (
                <span className="rounded-full px-2 py-[3px] font-mono text-[10.5px] text-muted-foreground">
                  {passo.rotulo}
                </span>
              )}
            </div>
          ))}
        </nav>
        <main className="flex-1 overflow-auto bg-content p-4">
          {/* Fronteira da divisão por rota (Subetapa 03.3). Fica AQUI, e não
              em volta do `<RouterProvider>`, porque é isto que mantém
              sidebar, header e breadcrumb pintados enquanto o chunk da tela
              nova chega — suspender acima do shell apagaria a navegação
              inteira a cada troca de rota. */}
          <Suspense fallback={<CarregandoRota />}>
            <Outlet />
          </Suspense>
        </main>
      </section>
    </div>
  );
}
