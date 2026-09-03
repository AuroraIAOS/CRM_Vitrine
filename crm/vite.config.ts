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
         * O SERVICE WORKER DESFAZIA A DIVISÃO POR ROTA — medido na
         * Subetapa 03.7.
         *
         * `globPatterns` acima varre `dist/` inteiro, e precache é
         * download ANTECIPADO: tudo que entra nele é buscado na primeira
         * visita, antes de qualquer navegação. Com o odontograma
         * instalado, o manifesto saltou de **1.089 KiB para 4.404 KiB** —
         * ou seja, o `React.lazy` da 03.3 e o desta subetapa separavam os
         * chunks corretamente e o PWA os baixava todos assim mesmo,
         * segundos depois. A divisão continuava verdadeira no `dist/` e
         * falsa na rede, que é o único lugar onde ela importa.
         *
         * O que sai do precache, e por quê:
         *  · `OdontogramaClinico-*` (1.455 KiB + 68 KiB de CSS) — só quem
         *    abre a aba Odontograma precisa;
         *  · `jspdf` / `html2canvas` / `index.es-*` (727 KiB) — a
         *    biblioteca importa o gerador de PDF por `import()`
         *    dinâmico, exercido apenas ao exportar relatório;
         *  · `notoSC` + `notoArabic` + `roboto` (1.030 KiB) — fontes
         *    Unicode do PDF. As duas primeiras existem para chinês e
         *    árabe renderizarem no relatório; numa clínica odontológica
         *    brasileira elas nunca são pedidas, e mesmo assim eram quase
         *    1 MB cobrado de todo mundo na instalação.
         *
         * Não vira perda offline: `runtimeCaching` abaixo guarda cada um
         * na primeira vez que for de fato usado. A diferença é quem paga
         * — todos os usuários, sempre, contra quem usa, uma vez.
         */
        globIgnores: [
          "**/assets/OdontogramaClinico-*.{js,css}",
          "**/assets/jspdf.es.min-*.js",
          "**/assets/html2canvas.esm-*.js",
          // `index.es-*` é dependência do jspdf; o hífen depois de `.es`
          // impede colisão com o chunk de entrada, que é `index-*`.
          "**/assets/index.es-*.js",
          "**/assets/noto*-*.js",
          "**/assets/roboto-*.js",
        ],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/(OdontogramaClinico|jspdf|html2canvas|index\.es|noto|roboto)[-.].*\.(js|css)$/,
            // `CacheFirst` e não `StaleWhileRevalidate`: o nome do arquivo
            // carrega o hash do conteúdo, então uma versão nova é uma URL
            // nova — revalidar a antiga seria requisição garantidamente
            // inútil.
            handler: "CacheFirst",
            options: {
              cacheName: "vitrine-sob-demanda",
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
