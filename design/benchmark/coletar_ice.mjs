#!/usr/bin/env node
/**
 * Coletor do ICE Health System — pesquisa `analise-ice`
 * ====================================================
 * Reúne o material PÚBLICO do help center (`help.icehealthsystems.com`) e do
 * canal de suporte no YouTube, para a pesquisa descrita em
 * `00_PLANO_DE_ACAO_ICE.md`.
 *
 * Nunca faz login, nunca cria conta, nunca preenche formulário. O que estiver
 * atrás de cadastro é registrado como indisponível, não contornado — mesma
 * regra de conduta do benchmark de agosto (`00_PLANO_DE_ACAO.md` §4 e §8).
 *
 *   node design/benchmark/coletar_ice.mjs site       # as páginas + o texto
 *   node design/benchmark/coletar_ice.mjs imagens    # as imagens das seções-alvo
 *   node design/benchmark/coletar_ice.mjs video      # os 32 vídeos
 *   node design/benchmark/coletar_ice.mjs video 98J5 # só os que casam
 *
 * ── POR QUE ESTE ARQUIVO EXISTE, EM VEZ DE REUSAR OS TRÊS COLETORES DE AGOSTO
 *
 * `capturar.mjs`, `assistir.mjs` e `frames_video.mjs` continuam válidos e não
 * foram tocados. Duas diferenças medidas nesta máquina em 2026-09-03 (§2 do
 * plano) justificam um irmão em vez de uma reescrita:
 *
 *   1. SITE — `capturar.mjs` sobe um Chrome por puppeteer para tirar screenshot
 *      da página renderizada. Aqui isso é desperdício: o help center é
 *      Docusaurus 2.0-beta.17 SERVIDO ESTÁTICO (medido: `curl` de
 *      `treatment/create-treatment-options` devolve o `<article>` inteiro), e o
 *      que interessa não é a foto da página — são as IMAGENS DO PRODUTO que o
 *      próprio fornecedor publica em `/img/…`, que vêm como arquivo. Fonte
 *      melhor, custo menor, sem navegador no caminho.
 *
 *   2. VÍDEO — `assistir.mjs` e `frames_video.mjs` chamam `watch.py`, da skill
 *      `/watch`, que vive FORA do repositório. As duas correções pagas em
 *      agosto foram DESFEITAS pela atualização do plugin: `-vsync` voltou a
 *      `frames.py` (linhas 256 e 615) e `--sub-langs en.*` voltou a
 *      `download.py` (linhas 78 e 135). E `-vsync` quebra de verdade aqui:
 *      `ffmpeg -vsync vfr` devolve `Unrecognized option 'vsync'` no ffmpeg
 *      9.0.1 desta máquina; `-fps_mode vfr` funciona. Corrigir a skill uma
 *      terceira vez seria pagar a mesma tarde de novo — a extração passa a sair
 *      de `ffmpeg` chamado direto daqui, versionado e imune a atualização de
 *      plugin.
 *
 * ── O QUE CONTINUA VALENDO DAS CINCO INCOMPATIBILIDADES DE AGOSTO
 *
 * Reconferidas em 2026-09-03, uma a uma, antes de escrever este arquivo:
 *
 *   · yt-dlp, ffmpeg, ffprobe, Python e Deno estão no PATH (a instalação de
 *     agosto sobreviveu). Sem Deno a legenda voltaria HTTP 429.
 *   · O cliente padrão do yt-dlp ainda devolve HTTP 403 no download de vídeo.
 *     Só `mweb` entrega — medido no vídeo mais curto do canal.
 *   · `mweb` continua descartando legenda. Duas chamadas, não uma.
 *   · A skill fixa `--sub-langs en.*`. Aqui isso por acaso serviria (o corpus
 *     do ICE é em INGLÊS, ao contrário do de agosto), mas a legenda é pedida
 *     explicitamente como `en-orig,en` — original primeiro, tradução como
 *     reserva —, porque depender de coincidência não é método.
 *   · `-vsync` → `-fps_mode`, acima.
 *
 * Saída de matéria-prima fora do repositório; só o que sustenta uma tese entra
 * em `fontes/ice.md` e `capturas/ice/`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FONTES = path.join(AQUI, "fontes");
const CAPTURAS = path.join(AQUI, "capturas", "ice");
const TRAB = process.env.ICE_TRAB || path.join(os.homedir(), ".claude", "jobs", "analise-ice");

const BASE = "https://help.icehealthsystems.com";
const CANAL = "https://www.youtube.com/@icehealthsystemssupport3072/videos";

/** Seções cujo conteúdo o plano manda ler POR INTEIRO (§4, Conclusão). */
const ALVO = ["treatment", "financials", "gather", "patient", "configure", "schedule", "module", "report", "advanced"];
/** Seções coletadas por título+URL, lidas sob demanda. */
const SECUNDARIA = ["start", "support", "admonition", "release", "video"];

const PAUSA_MS = 200;     // cortesia com o servidor de terceiro
const MAX_FRAMES_CURTO = 12;
const COLUNAS = 3;

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const r = (c, a, o = {}) => execFileSync(c, a, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, ...o });

fs.mkdirSync(TRAB, { recursive: true });
fs.mkdirSync(CAPTURAS, { recursive: true });
fs.mkdirSync(FONTES, { recursive: true });

// ─────────────────────────────────────────────────────────────── utilidades

function decodar(s) {
  return s
    .replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

/**
 * HTML do `<article>` → markdown enxuto.
 * Preserva título, hierarquia de seção, item de lista, tabela e a POSIÇÃO das
 * imagens — que é o que diz a qual passo do caminho cada tela pertence. Texto
 * corrido sem essa estrutura perderia justamente o "caminho feliz × caminho
 * alternativo" que esta pesquisa foi aberta para extrair.
 */
function paraMarkdown(html) {
  let h = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // âncora de cabeçalho do Docusaurus ("#" clicável) e o ​ que ele deixa
    .replace(/<a[^>]*class="[^"]*hash-link[^"]*"[\s\S]*?<\/a>/gi, "")
    .replace(/​/g, "");

  const imagens = [];
  h = h.replace(/<img[^>]*>/gi, (tag) => {
    const src = (tag.match(/\bsrc="([^"]+)"/i) || [])[1];
    const alt = (tag.match(/\balt="([^"]*)"/i) || [])[1] || "";
    if (!src || /ice-logo|ice-health-logo/.test(src)) return " ";
    const abs = src.startsWith("http") ? src : BASE + src;
    imagens.push(abs);
    return `\n\n![${alt}](${abs})\n\n`;
  });

  h = h
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n")
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n\n#### $1\n\n")
    .replace(/<li[^>]*>/gi, "\n- ").replace(/<\/li>/gi, "")
    .replace(/<\/(p|div|ul|ol|section|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/tr>/gi, "\n").replace(/<\/t[dh]>/gi, " | ")
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
    .replace(/<[^>]+>/g, " ");

  const texto = decodar(h)
    .split("\n").map((l) => l.replace(/[ \t]+/g, " ").trimEnd()).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();

  return { texto, imagens };
}

function fatiarArtigo(html) {
  // O Docusaurus embrulha o conteúdo em <article>; o breadcrumb fica fora dele.
  const art = html.match(/<article[\s\S]*?<\/article>/i);
  const titulo = decodar((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").replace(/\s*\|\s*ICE.*$/i, "").trim();
  const trilha = [...html.matchAll(/<span[^>]*class="[^"]*breadcrumbs__link[^"]*"[^>]*>([\s\S]*?)<\/span>/gi)]
    .map((m) => decodar(m[1].replace(/<[^>]+>/g, "")).trim()).filter(Boolean);
  return { titulo, trilha, ...paraMarkdown(art ? art[0] : html) };
}

async function baixar(url, bin = false) {
  const res = await fetch(url, { headers: { "user-agent": "CRM-Vitrine-benchmark/1.0 (pesquisa interna; leitura de material publico)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return bin ? Buffer.from(await res.arrayBuffer()) : await res.text();
}

const secaoDe = (u) => u.replace(BASE, "").split("/").filter(Boolean)[0] || "(raiz)";

// ─────────────────────────────────────────────────────────────────── SITE

async function coletarSite() {
  console.log("═══ ICE — help center ═══");
  const xml = await baixar(`${BASE}/sitemap.xml`);
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  console.log(`sitemap: ${urls.length} URLs`);

  const paginas = [];
  const falhas = [];
  const cache = path.join(TRAB, "site.json");
  const feito = fs.existsSync(cache) ? JSON.parse(fs.readFileSync(cache, "utf-8")) : { paginas: [], falhas: [] };
  const jaTem = new Set(feito.paginas.map((p) => p.url));

  for (const [i, url] of urls.entries()) {
    if (jaTem.has(url)) { paginas.push(feito.paginas.find((p) => p.url === url)); continue; }
    const secao = secaoDe(url);
    if (secao === "search") continue;
    try {
      const html = await baixar(url);
      const p = { url, secao, alvo: ALVO.includes(secao), ...fatiarArtigo(html), coletadoEm: new Date().toISOString().slice(0, 10) };
      paginas.push(p);
      if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${urls.length} …`);
    } catch (e) {
      falhas.push({ url, erro: e.message });
      console.log(`  ✗ ${url} — ${e.message}`);
    }
    await dorme(PAUSA_MS);
  }

  fs.writeFileSync(cache, JSON.stringify({ paginas, falhas }, null, 1), "utf-8");
  const alvo = paginas.filter((p) => p.alvo);
  const chars = paginas.reduce((s, p) => s + p.texto.length, 0);
  const imgs = new Set(paginas.flatMap((p) => p.imagens));
  console.log(`\n${paginas.length} páginas · ${falhas.length} falha(s)`);
  console.log(`${alvo.length} nas seções-alvo (${ALVO.join(", ")})`);
  console.log(`${chars.toLocaleString("pt-BR")} chars de texto · ${imgs.size} imagens distintas`);
  console.log(`cru: ${cache}`);
}

// ────────────────────────────────────────────────────────────────── IMAGENS

async function coletarImagens() {
  const cache = path.join(TRAB, "site.json");
  if (!fs.existsSync(cache)) { console.error("rode `site` antes."); process.exit(1); }
  const { paginas } = JSON.parse(fs.readFileSync(cache, "utf-8"));

  // Uma imagem pode aparecer em várias páginas; guarda-se a primeira ocorrência
  // como procedência, e conta-se em quantas páginas ela reaparece — reincidência
  // é sinal de que aquela tela é central no produto, não decorativa.
  const mapa = new Map();
  for (const p of paginas.filter((x) => x.alvo)) {
    for (const src of p.imagens) {
      if (!mapa.has(src)) mapa.set(src, { src, paginas: [], });
      mapa.get(src).paginas.push(p.url);
    }
  }
  const lista = [...mapa.values()].sort((a, b) => b.paginas.length - a.paginas.length);
  console.log(`${lista.length} imagens distintas nas seções-alvo`);

  const dir = path.join(TRAB, "img");
  fs.mkdirSync(dir, { recursive: true });
  const baixadas = [];
  for (const [i, it] of lista.entries()) {
    const nome = path.basename(new URL(it.src).pathname);
    const destino = path.join(dir, nome);
    if (!fs.existsSync(destino)) {
      try { fs.writeFileSync(destino, await baixar(it.src, true)); await dorme(PAUSA_MS); }
      catch (e) { console.log(`  ✗ ${nome} — ${e.message}`); continue; }
    }
    baixadas.push({ ...it, arquivo: nome, bytes: fs.statSync(destino).size });
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${lista.length} …`);
  }
  fs.writeFileSync(path.join(TRAB, "imagens.json"), JSON.stringify(baixadas, null, 1), "utf-8");
  console.log(`\n${baixadas.length} imagens em ${dir}`);
  console.log("As que sustentarem uma tese entram em capturas/ice/ com crédito no INDICE.md.");
}

// ─────────────────────────────────────────────────────────────────── VÍDEO

/** VTT de legenda automática repete cada linha a cada quadro; condensa. */
function condensarVTT(vtt) {
  const saida = [];
  let ultima = "", tempo = "";
  for (const l of vtt.split(/\r?\n/)) {
    const m = l.match(/^(\d{2}):(\d{2}):(\d{2})\.\d{3}\s+-->/);
    if (m) { tempo = `${m[1] === "00" ? "" : m[1] + ":"}${m[2]}:${m[3]}`; continue; }
    const t = l.replace(/<[^>]*>/g, "").trim();
    if (!t || t === "WEBVTT" || /^(Kind|Language):/.test(t)) continue;
    if (t === ultima || (ultima && ultima.endsWith(t))) continue;
    saida.push(`[${tempo}] ${t}`);
    ultima = t;
  }
  return saida.join("\n");
}

function mosaico(frames, destino, colunas = COLUNAS) {
  const dm = fs.mkdtempSync(path.join(os.tmpdir(), "ice-mos-"));
  frames.forEach((f, k) => fs.copyFileSync(f, path.join(dm, `s_${String(k + 1).padStart(3, "0")}.jpg`)));
  const linhas = Math.ceil(frames.length / colunas);
  r("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "1", "-i", path.join(dm, "s_%03d.jpg"),
    "-filter_complex", `tile=${colunas}x${linhas}`, "-frames:v", "1", "-q:v", "3", destino]);
  fs.rmSync(dm, { recursive: true, force: true });
}

/**
 * Extração de quadros por ffmpeg direto — sem `watch.py` (ver cabeçalho).
 * `-fps_mode vfr` no lugar de `-vsync vfr`, removido no ffmpeg 8+.
 */
function extrairFrames(mp4, dir, quantos, largura) {
  fs.mkdirSync(dir, { recursive: true });
  const dur = parseFloat(r("ffprobe", ["-v", "error", "-show_entries", "format=duration",
    "-of", "default=nw=1:nk=1", mp4]).trim());
  const fps = quantos / dur;   // amostragem uniforme ao longo do vídeo inteiro
  r("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4,
    "-vf", `fps=${fps.toFixed(6)},scale=${largura}:-2`, "-fps_mode", "vfr", "-q:v", "3",
    path.join(dir, "f_%04d.jpg")]);
  return fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort().map((f) => path.join(dir, f));
}

async function coletarVideo(filtro) {
  console.log("═══ ICE — canal de suporte ═══");
  const lista = JSON.parse(r("yt-dlp", ["--flat-playlist", "-J", CANAL])).entries;
  console.log(`${lista.length} vídeos no canal`);

  const dirV = path.join(TRAB, "videos");
  fs.mkdirSync(dirV, { recursive: true });
  const falhas = [];

  for (const [i, it] of lista.entries()) {
    const slug = `ICE${String(i + 1).padStart(2, "0")}`;
    if (filtro && !`${slug} ${it.id} ${it.title}`.toLowerCase().includes(filtro.toLowerCase())) continue;
    const dir = path.join(dirV, slug);
    const meta = path.join(dir, "meta.json");
    if (fs.existsSync(meta)) { console.log(`  · ${slug} já processado`); continue; }
    fs.mkdirSync(dir, { recursive: true });

    const url = `https://www.youtube.com/watch?v=${it.id}`;
    // ≥15 min = vídeo longo: amostragem densa (1 quadro / ~30 s) e mosaicos de 12
    const longo = (it.duration ?? 0) >= 900;
    try {
      // legenda: cliente PADRÃO (o mweb descarta legenda); original primeiro
      try {
        r("yt-dlp", ["--write-auto-subs", "--sub-langs", "en-orig,en", "--sub-format", "vtt",
          "--skip-download", "-o", path.join(dir, "v.%(ext)s"), "--no-warnings", url]);
      } catch { /* sem legenda: declarado abaixo como lacuna, nunca suposto */ }
      const vtt = ["v.en-orig.vtt", "v.en.vtt"].map((f) => path.join(dir, f)).find(fs.existsSync);
      const transcricao = vtt ? condensarVTT(fs.readFileSync(vtt, "utf-8")) : "";
      fs.writeFileSync(path.join(dir, "transcricao.txt"), transcricao, "utf-8");

      // vídeo: cliente MWEB (o padrão dá 403)
      r("yt-dlp", ["-f", "18/worst[height<=480]", "--extractor-args", "youtube:player_client=mweb",
        "-o", path.join(dir, "v.%(ext)s"), "--no-part", "--no-warnings", url]);
      const mp4 = path.join(dir, "v.mp4");
      if (!fs.existsSync(mp4)) throw new Error("yt-dlp não produziu o arquivo de vídeo");

      const quantos = longo ? Math.ceil((it.duration ?? 3000) / 30) : MAX_FRAMES_CURTO;
      const frames = extrairFrames(mp4, path.join(dir, "f"), quantos, longo ? 1024 : 512);
      if (!frames.length) throw new Error("nenhum quadro extraído");

      const mosaicos = [];
      if (longo) {
        // um mosaico por bloco de 12 quadros ≈ 6 min de vídeo por imagem
        for (let k = 0; k < frames.length; k += 12) {
          const n = String(mosaicos.length + 1).padStart(2, "0");
          const destino = path.join(dir, `mosaico_${n}.jpg`);
          mosaico(frames.slice(k, k + 12), destino);
          mosaicos.push(destino);
        }
      } else {
        const destino = path.join(dir, "mosaico.jpg");
        mosaico(frames, destino);
        mosaicos.push(destino);
      }

      const m = {
        slug, id: it.id, url, titulo: it.title, duracao: it.duration, longo,
        temTranscricao: transcricao.length > 0,
        palavras: transcricao.split(/\s+/).filter(Boolean).length,
        quadros: frames.length, mosaicos: mosaicos.map((p) => path.basename(p)),
      };
      fs.writeFileSync(meta, JSON.stringify(m, null, 1), "utf-8");
      fs.rmSync(mp4, { force: true });                          // ~45 MB por vídeo
      fs.rmSync(path.join(dir, "f"), { recursive: true, force: true });
      console.log(`  ✓ ${slug} ${String(m.duracao).padStart(4)}s ${String(m.palavras).padStart(6)}pal ` +
        `${m.quadros}q/${mosaicos.length}mos ${m.temTranscricao ? "  " : "SL"} ${(m.titulo || "").slice(0, 52)}`);
    } catch (e) {
      const msg = e.message.split("\n")[0].slice(0, 120);
      falhas.push({ slug, url, erro: msg });
      console.log(`  ✗ ${slug} ${msg}`);
    }
  }
  fs.writeFileSync(path.join(dirV, "_falhas.json"), JSON.stringify(falhas, null, 1), "utf-8");
  console.log(`\n${falhas.length} falha(s). Matéria-prima: ${dirV}`);
}

// ──────────────────────────────────────────────────────────────────── main

const [cmd, arg] = process.argv.slice(2);
if (cmd === "site") await coletarSite();
else if (cmd === "imagens") await coletarImagens();
else if (cmd === "video") await coletarVideo(arg);
else {
  console.log("uso: coletar_ice.mjs site | imagens | video [filtro]");
  process.exit(1);
}
