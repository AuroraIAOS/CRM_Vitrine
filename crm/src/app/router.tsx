import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "./AppShell";
import { RoleGate } from "./RoleGate";
import { LoginPage } from "@/features/auth/LoginPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { Placeholder } from "@/components/shared/Placeholder";

// Rotas 1:1 com nav.ts (MODULE_ROUTE) + /suporte, que não é módulo de
// `access.modules`. Cada Placeholder vira página real na subetapa que
// constrói aquele módulo (docs/00_PLANO_E_CRITERIOS.md, Subetapas
// 02.3–02.12) — a rota já existe desde a 02.1 para a navegação funcionar,
// mesmo que access.can() esconda o item de quem não tem permissão.
export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RoleGate />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "pessoas", element: <Placeholder titulo="Pessoas" /> },
          { path: "agenda", element: <Placeholder titulo="Agenda" /> },
          { path: "vendas", element: <Placeholder titulo="Vendas" /> },
          { path: "financeiro", element: <Placeholder titulo="Financeiro" /> },
          { path: "prontuario", element: <Placeholder titulo="Prontuário" /> },
          { path: "catalogo", element: <Placeholder titulo="Catálogo" /> },
          { path: "mensagens", element: <Placeholder titulo="Mensagens" /> },
          { path: "automacoes", element: <Placeholder titulo="Automações" /> },
          { path: "ia", element: <Placeholder titulo="IA" /> },
          { path: "configuracoes", element: <Placeholder titulo="Configurações" /> },
          { path: "suporte", element: <Placeholder titulo="Suporte" /> },
        ],
      },
    ],
  },
]);
