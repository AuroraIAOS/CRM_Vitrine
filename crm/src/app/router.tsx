import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "./AppShell";
import { RoleGate } from "./RoleGate";
import { Placeholder } from "@/components/shared/Placeholder";
import { CarregandoRota } from "@/components/shared/CarregandoRota";

/* Divisão por rota — Subetapa 03.3.
   ----------------------------------------------------------------------
   Até aqui as 16 telas viajavam num chunk único de 290.553 B gzip: quem
   abria o login baixava a agenda, o prontuário, o editor de automações e o
   agente de IA antes de digitar a senha (`design/ux/06_ORCAMENTO_DE_PESO.md`
   §1). Cada `lazy()` abaixo vira um chunk próprio, buscado na primeira
   visita à rota.

   POR QUE `React.lazy` E NÃO `route.lazy`: a doc do react-router 7 apresenta
   `route.lazy` como a via do `RouterProvider` (que é o que este arquivo usa)
   e `React.lazy` + `<Suspense>` como a do `BrowserRouter`. A vantagem que
   `route.lazy` compra é eliminar o waterfall render-then-fetch de `loader`
   de rota — e este router não tem `loader` nenhum: os dados vêm de TanStack
   Query dentro dos componentes. Sem loader não há waterfall a eliminar, e o
   `<Suspense>` em volta do `<Outlet/>` do `AppShell` mantém sidebar e header
   pintados durante a troca, em vez do estado pendente em nível de router,
   que apagaria o shell inteiro. Se algum dia uma rota ganhar `loader`, esta
   escolha se reabre.

   LOGIN TAMBÉM É PREGUIÇOSO, e a medição é que decidiu isso. A primeira
   versão desta subetapa deixou `/login` eager pelo argumento plausível de
   que é a porta de entrada de sessão fria e não convém trocar 1 requisição
   por 2. O número desmentiu: `LoginPage` é o ÚNICO módulo do grafo eager que
   importa `zod` (132.680 B brutos), `react-hook-form` (95.784 B) e
   `@hookform/resolvers` (3.460 B) — 232 KB para validar dois campos —, e o
   chunk de entrada é pago por TODA carga de página, inclusive as de quem já
   está logado e nunca mais vê a tela de login. Como o CRM é usado logado e o
   login acontece uma vez por sessão, o eager cobrava o caso comum para
   beneficiar o caso raro. Com `/login` preguiçoso o chunk de entrada cai de
   186,70 para 160,36 kB gzip (números do próprio `vite build`; 160.202 B
   pelo `gzip -c` do §5) — a diferença entre estourar e não estourar o teto
   de 180 KB de `design/ux/06_ORCAMENTO_DE_PESO.md` §4.

   O contrapeso, medido e declarado para não virar número escondido: a rota
   `/login` passa a pagar 186.857 B (entrada + `zod` + `button` + a própria
   página) contra os 160.202 B de quem cai numa rota interna. Os 23.726 B são
   `zod`, que esta tela usa para validar dois campos. Trocar isso por
   validação nativa devolveria os 23.726 B, e NÃO foi feito aqui de propósito:
   todo formulário do produto usa `react-hook-form` + `zod`, e quebrar essa
   uniformidade uma subetapa depois da 03.2 — que existiu para restabelecê-la
   — custa mais do que os bytes valem. Fica registrado como observação
   medida, não como pendência de execução.

   O `.then((m) => ({ default: m.X }))` de cada linha não é cerimônia: as
   páginas são export NOMEADO e `React.lazy` exige um módulo com `default`.
   Sem o mapeamento nada quebra no build nem no typecheck — o erro só
   aparece em tempo de execução, ao navegar para a rota. */
const LoginPage = lazy(() =>
  import("@/features/auth/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const AceitarConvitePage = lazy(() =>
  import("@/features/convite/AceitarConvitePage").then((m) => ({ default: m.AceitarConvitePage })),
);
const DashboardPage = lazy(() =>
  import("@/features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const ConfiguracoesPage = lazy(() =>
  import("@/features/settings/ConfiguracoesPage").then((m) => ({ default: m.ConfiguracoesPage })),
);
const PessoasListPage = lazy(() =>
  import("@/features/people/PessoasListPage").then((m) => ({ default: m.PessoasListPage })),
);
const PessoaFichaPage = lazy(() =>
  import("@/features/people/PessoaFichaPage").then((m) => ({ default: m.PessoaFichaPage })),
);
const SalesKanbanPage = lazy(() =>
  import("@/features/sales/SalesKanbanPage").then((m) => ({ default: m.SalesKanbanPage })),
);
const AgendaPage = lazy(() =>
  import("@/features/scheduling/AgendaPage").then((m) => ({ default: m.AgendaPage })),
);
const CatalogoPage = lazy(() =>
  import("@/features/catalog/CatalogoPage").then((m) => ({ default: m.CatalogoPage })),
);
const FinanceiroPage = lazy(() =>
  import("@/features/finance/FinanceiroPage").then((m) => ({ default: m.FinanceiroPage })),
);
const MessagingPage = lazy(() =>
  import("@/features/messaging/MessagingPage").then((m) => ({ default: m.MessagingPage })),
);
const ProntuarioPage = lazy(() =>
  import("@/features/health/ProntuarioPage").then((m) => ({ default: m.ProntuarioPage })),
);
const MapasClinicosPage = lazy(() =>
  import("@/features/health/MapasClinicosPage").then((m) => ({ default: m.MapasClinicosPage })),
);
const AutomacoesPage = lazy(() =>
  import("@/features/automations/AutomacoesPage").then((m) => ({ default: m.AutomacoesPage })),
);
const AgentePage = lazy(() =>
  import("@/features/ai/AgentePage").then((m) => ({ default: m.AgentePage })),
);


// Rotas 1:1 com nav.ts (MODULE_ROUTE) + /suporte, que não é módulo de
// `access.modules`. Cada Placeholder vira página real na subetapa que
// constrói aquele módulo (docs/00_PLANO_E_CRITERIOS.md, Subetapas
// 02.3–02.12) — a rota já existe desde a 02.1 para a navegação funcionar,
// mesmo que access.can() esconda o item de quem não tem permissão.
// /configuracoes (tela 1m) entrega as 10 seções desde a Subetapa 02.12 —
// Equipe é a que já vinha da 02.2, reaproveitada sem alteração. A seção
// ativa fica em `?secao=`, não em estado local, para link direto e botão
// "voltar" funcionarem. /pessoas e
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
  // `/login` e `/convite` ficam fora do AppShell, logo fora do `<Suspense>`
  // dele — cada um precisa da fronteira própria, senão o chunk suspende sem
  // ninguém para capturar e o React derruba a árvore inteira.
  {
    path: "/login",
    element: (
      <Suspense fallback={<CarregandoRota />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: "/convite",
    element: (
      <Suspense fallback={<CarregandoRota />}>
        <AceitarConvitePage />
      </Suspense>
    ),
  },
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
          { path: "ia", element: <AgentePage /> },
          { path: "configuracoes", element: <ConfiguracoesPage /> },
          { path: "suporte", element: <Placeholder titulo="Suporte" /> },
        ],
      },
    ],
  },
]);
