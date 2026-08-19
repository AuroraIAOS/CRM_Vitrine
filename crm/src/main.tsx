import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth";
import { PreferenciasProvider } from "@/lib/preferencias";
import { router } from "@/app/router";
import { queryClient } from "@/lib/queryClient";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* Dentro do AuthProvider porque a preferência é POR CONTA — só há o
            que aplicar depois de o perfil resolver a conta (Subetapa 02.12). */}
        <PreferenciasProvider>
          <RouterProvider router={router} />
        </PreferenciasProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
