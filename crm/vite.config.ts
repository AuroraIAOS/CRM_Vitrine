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
        /**
         * O PRECACHE JÁ DESFEZ A DIVISÃO POR ROTA UMA VEZ — e a guarda fica.
         *
         * `globPatterns` acima varre `dist/` inteiro, e precache é download
         * ANTECIPADO: tudo que entra nele é buscado na primeira visita, antes
         * de qualquer navegação. Com `react-advanced-odontogram` instalado, o
         * manifesto saltou de 1.089 KiB para 4.404 KiB enquanto a saída do
         * `vite build` mostrava, com toda a razão, um chunk de entrada
         * praticamente inalterado. Os dois números eram verdadeiros; só um
         * deles descrevia o que o usuário baixava (Subetapa 03.7).
         *
         * A Subetapa 03.7.a removeu a biblioteca, e com ela saíram os seis
         * `globIgnores` que existiam para domar o peso DELA — o odontograma de
         * 1.455 KiB, o `jspdf` e o `html2canvas` que ela importava por
         * `import()` dinâmico, e as 959 KiB de fontes Unicode de chinês e
         * árabe do relatório em PDF. Não há mais o que ignorar: o odontograma
         * autoral cabe no precache sem exceção nenhuma, e regra de exceção que
         * sobrevive ao objeto que a justificava é a próxima a enganar alguém.
         *
         * O QUE FICA é `scripts/conferir_precache.mjs`, com o teto de 1.400
         * KiB no fim do `npm run build`. Ele não é sobre o odontograma: é
         * sobre a PRÓXIMA dependência pesada, seja qual for.
         */
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
