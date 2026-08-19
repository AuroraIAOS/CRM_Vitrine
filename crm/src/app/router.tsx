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
import { AgendaPage } from "@/features/scheduling/AgendaPage";
import { CatalogoPage } from "@/features/catalog/CatalogoPage";
import { FinanceiroPage } from "@/features/finance/FinanceiroPage";
import { MessagingPage } from "@/features/messaging/MessagingPage";
import { ProntuarioPage } from "@/features/health/ProntuarioPage";
import { MapasClinicosPage } from "@/features/health/MapasClinicosPage";
import { AutomacoesPage } from "@/features/automations/AutomacoesPage";
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
// /agenda (telas 1e/1n/1o) já entregue pela Subetapa 02.6 — AgendaPage
// decide entre as três apresentações conforme o perfil do usuário
// logado (docs/01_ARQUITETURA.md §7.3), nunca por rota separada.
// /catalogo (tela 1i, abas Serviços/Planos + painel de Categorias) já
// entregue pela Subetapa 02.7. /financeiro (tela 1g, KPIs + gráfico +
// abas Lançamentos/Comissões/Conciliação) já entregue pela Subetapa 02.8.
// /prontuario, /prontuario/:clienteId (tela 1h) e /prontuario/mapas
// (tela 1p) já entregues pela Subetapa 02.9.
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
          { path: "agenda", element: <AgendaPage /> },
          { path: "vendas", element: <SalesKanbanPage /> },
          { path: "financeiro", element: <FinanceiroPage /> },
          { path: "prontuario", element: <ProntuarioPage /> },
          // Rota estática antes da dinâmica não é acidente: `mapas`
          // também casaria com `:clienteId`.
          { path: "prontuario/mapas", element: <MapasClinicosPage /> },
          { path: "prontuario/:clienteId", element: <ProntuarioPage /> },
          { path: "catalogo", element: <CatalogoPage /> },
          { path: "mensagens", element: <MessagingPage /> },
          { path: "automacoes", element: <AutomacoesPage /> },
          { path: "ia", element: <Placeholder titulo="IA" /> },
          { path: "configuracoes", element: <EquipePage /> },
          { path: "suporte", element: <Placeholder titulo="Suporte" /> },
        ],
      },
    ],
  },
]);
