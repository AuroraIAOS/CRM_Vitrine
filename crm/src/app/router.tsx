import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "./AppShell";
import { RoleGate } from "./RoleGate";
import { LoginPage } from "@/features/auth/LoginPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RoleGate />,
    children: [
      {
        element: <AppShell />,
        children: [{ index: true, element: <DashboardPage /> }],
      },
    ],
  },
]);
