import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "./AppShell";
import { RoleGate } from "./RoleGate";
import { LoginPage } from "@/features/auth/LoginPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { AceitarConvitePage } from "@/features/convite/AceitarConvitePage";
import { EquipePage } from "@/features/settings/EquipePage";
import { PessoasListPage } from "@/features/people/PessoasListPage";
import { PessoaFichaPage } from "@/features/people/PessoaFichaPage";
import { SalesKanbanPage } from "@/features/sales/SalesKanbanPage";
import { MessagingPage } from "@/features/messaging/MessagingPage";
import { Placeholder } from "@/components/shared/Placeholder";

// Rotas 1:1 com nav.ts (MODULE_ROUTE) + /suporte, que não é módulo de
// `access.modules`. Cada Placeholder vira página real na subetapa que
// constrói aquele módulo (docs/00_PLANO_E_CRITERIOS.md, Subetapas
// 02.3–02.12) — a rota já existe desde a 02.1 para a navegação funcionar,
// mesmo que access.can() esconda o item de quem não tem permissão.
// /configuracoes já entrega a aba Equipe (Subetapa 02.2) — as demais 8
// seções de Configurações (1m) entram na Subetapa 02.12. /pessoas e
// /pessoas/:id (telas 1c/1d) já entregues pela Subetapa 02.3. /vendas
// (tela 1f, kanban) já entregue pela Subetapa 02.4. /mensagens (tela
// 1j, 3 painéis + Meta Cloud API real) já entregue pela Subetapa 02.5.
export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/convite", element: <AceitarConvitePage /> },
  {
    element: <RoleGate />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "pessoas", element: <PessoasListPage /> },
          { path: "pessoas/:id", element: <PessoaFichaPage /> },
          { path: "agenda", element: <Placeholder titulo="Agenda" /> },
          { path: "vendas", element: <SalesKanbanPage /> },
          { path: "financeiro", element: <Placeholder titulo="Financeiro" /> },
          { path: "prontuario", element: <Placeholder titulo="Prontuário" /> },
          { path: "catalogo", element: <Placeholder titulo="Catálogo" /> },
          { path: "mensagens", element: <MessagingPage /> },
          { path: "automacoes", element: <Placeholder titulo="Automações" /> },
          { path: "ia", element: <Placeholder titulo="IA" /> },
          { path: "configuracoes", element: <EquipePage /> },
          { path: "suporte", element: <Placeholder titulo="Suporte" /> },
        ],
      },
    ],
  },
]);
