import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// .env real vive na raiz do repositório (C:\GitHub\CRM_Vitrine\.env), não em
// crm/ — um único arquivo de segredos para o projeto inteiro (Edge Functions,
// FTP, front-end), em vez de duplicar VITE_* aqui dentro. envDir aponta um
// nível acima para o Vite carregar de lá.
export default defineConfig({
  envDir: path.resolve(__dirname, ".."),
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "CRM Vitrine",
        short_name: "Vitrine",
        description: "CRM modular, clonável e comercializável",
        lang: "pt-BR",
        display: "standalone",
        // Paleta/ícone reais entram quando docs/04_DESIGN_E_MARCA.md fechar a
        // marca por conta — placeholder neutro até lá, não bloqueia o MVP.
        theme_color: "#111827",
        background_color: "#ffffff",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
