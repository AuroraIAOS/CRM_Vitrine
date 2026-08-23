#!/usr/bin/env node
/**
 * Servidor local para navegar as três versões no navegador.
 *
 * Os módulos ES não carregam de `file://` por CORS — daí o servidor. Não
 * instala nada e não depende de rede: é `http` puro do Node.
 *
 *   node design/ux/versoes/servir.mjs
 *   → http://localhost:4180
 *
 * Na página, a barra flutuante embaixo troca de versão e de tela. Também dá
 * para pedir uma combinação exata pela URL:
 *   http://localhost:4180/?v=02&tela=agenda
 *   http://localhost:4180/?v=02&tela=pessoas&extra=paleta
 *   http://localhost:4180/?v=03&tela=inicio&capturar=1   (esconde a barra)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.argv[2]) || 4180;

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".md": "text/plain; charset=utf-8",
};

http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const arq = path.join(AQUI, rel === "/" ? "/index.html" : rel);
  // impede sair da pasta servida
  if (!path.resolve(arq).startsWith(path.resolve(AQUI))) {
    res.writeHead(403); return res.end("403");
  }
  fs.readFile(arq, (erro, dados) => {
    if (erro) { res.writeHead(404); return res.end("404 — " + rel); }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(arq)] ?? "application/octet-stream" });
    res.end(dados);
  });
}).listen(PORTA, () => {
  console.log(`Três versões servindo em http://localhost:${PORTA}`);
  console.log("Ctrl+C para encerrar.");
});
