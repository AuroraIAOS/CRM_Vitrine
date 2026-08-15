import { NavLink, Outlet } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { NAV } from "./nav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AppShell() {
  const { user, signOut } = useAuth();

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-4 border-r bg-muted/40 p-4">
        <span className="px-2 text-lg font-semibold">CRM Vitrine</span>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
                  isActive && "bg-accent text-accent-foreground font-medium",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex flex-col">
        <header className="flex items-center justify-between border-b px-6 py-3">
          <span className="text-sm text-muted-foreground">{user?.email}</span>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
