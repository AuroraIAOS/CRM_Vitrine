#!/usr/bin/env node
/**
 * Coletor de vídeos do benchmark odontológico
 * ==========================================
 * Baixa legenda + vídeo de cada item das playlists dos concorrentes, extrai
 * frames pela skill `/watch` e monta um mosaico por vídeo, para a passada 1
 * (triagem) do `00_PLANO_DE_ACAO.md` §C2.
 *
 * Só material público do YouTube. Nunca faz login, nunca cria conta.
 *
 * POR QUE NÃO CHAMAR `watch.py <url>` DIRETO — quatro incompatibilidades
 * medidas nesta máquina em 2026-09-01, cada uma confrontada com teste antes de
 * virar diagnóstico (`CLAUDE.md` §11):
 *
 *   1. Sem runtime de JS no PATH, o yt-dlp não resolve o desafio do YouTube e a
 *      legenda volta HTTP 429. O Deno já estava instalado; faltava no PATH.
 *   2. O cliente padrão (`android vr`) devolve HTTP 403 no download de vídeo em
 *      TODOS os formatos, inclusive o progressivo 18. Testados tv, web_safari,
 *      ios e mweb — só `mweb` entrega o arquivo.
 *   3. Mas `mweb` descarta as legendas (exige PO token). Logo: legenda pelo
 *      cliente padrão, vídeo pelo mweb. Duas chamadas, não uma.
 *   4. A skill fixa `--sub-langs en.*`. O corpus é inteiramente em português —
 *      isso traria tradução automática do inglês em vez do original. Aqui se
 *      pede `pt-orig` (legenda original), com `pt` como reserva.
 *
 * (Uma quinta, fora deste arquivo: a skill usa `-vsync`, removido no ffmpeg 8+.
 * Corrigido para `-fps_mode` em `frames.py`, ver `fontes/VIDEOS.md`.)
 *
 *   node design/benchmark/assistir.mjs           # tudo o que ainda falta
 *   node design/benchmark/assistir.mjs clinicorp # só as fontes que casam
 *
 * Idempotente: vídeo já processado é pulado. O .mp4 é apagado depois dos
 * frames — 61 vídeos guardados seriam ~2,7 GB de lixo.
 *
 * Saída fora do repositório (matéria-prima, não entrega); só os frames eleitos
 * na passada 2 entram em `capturas/videos/`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const TRAB = process.env.BENCH_TRAB || path.join(os.homedir(), ".claude", "jobs", "bench-odonto");
const SAIDA = path.join(TRAB, "videos");
const SKILL = process.env.SKILL_DIR;
if (!SKILL || !fs.existsSync(path.join(SKILL, "scripts", "watch.py"))) {
  console.error("SKILL_DIR não aponta para a skill watch. Rode `source env.sh` antes.");
  process.exit(1);
}

const FONTES = [
  { id: "SD", nome: "Simples Dental — tutoriais", tipo: "playlist", ref: "PLM4ap8rtQMwwLQ3bR-RWekUKfmh3qQFzS" },
  { id: "CF", nome: "Clinicorp — funcionalidades", tipo: "playlist", ref: "PL8lA7OedxChOdaJw_8J7aIaWuRIQkjYyr" },
  { id: "CT", nome: "Clinicorp — tutoriais", tipo: "playlist", ref: "PL8lA7OedxChMJPBljMS8FFRVnyQfhzwXS" },
  { id: "CI", nome: "Clinicorp — institucional", tipo: "video", ref: "n2VFtChJrXI" },
  { id: "CP", nome: "Comparativo Simples Dental x Clinicorp", tipo: "video", ref: "kcHkfaylUq0" },
];

const MAX_FRAMES = 12;
const LARGURA = 512;   // por quadro; mosaico 3×4 = 1536×1152, abaixo do teto de 1568 px
const COLUNAS = 3;

fs.mkdirSync(SAIDA, { recursive: true });

function rodar(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], ...opts });
}

/** VTT de legenda automática repete cada linha a cada quadro; condensa para texto com marca de tempo. */
function condensarVTT(vtt) {
  const linhas = vtt.split(/\r?\n/);
  const saida = [];
  let ultima = "";
  let tempo = "";
  for (const l of linhas) {
    const m = l.match(/^(\d{2}):(\d{2}):(\d{2})\.\d{3}\s+-->/);
    if (m) { tempo = `${m[1] === "00" ? "" : m[1] + ":"}${m[2]}:${m[3]}`; continue; }
    const texto = l.replace(/<[^>]*>/g, "").trim();
    if (!texto || texto === "WEBVTT" || /^(Kind|Language):/.test(texto)) continue;
    if (texto === ultima) continue;
    // a legenda rolante repete o fim da linha anterior no começo da seguinte
    if (ultima && ultima.endsWith(texto)) continue;
    saida.push(`[${tempo}] ${texto}`);
    ultima = texto;
  }
  return saida.join("\n");
}

function enumerar(fonte) {
  if (fonte.tipo === "video") return [{ id: fonte.ref, title: null, duration: null }];
  const cru = rodar("yt-dlp", ["--flat-playlist", "-J", `https://www.youtube.com/playlist?list=${fonte.ref}`]);
  return JSON.parse(cru).entries.map((e) => ({ id: e.id, title: e.title, duration: e.duration }));
}

const filtro = process.argv[2]?.toLowerCase();
const indice = [];
const falhas = [];

for (const fonte of FONTES) {
  if (filtro && !`${fonte.id} ${fonte.nome}`.toLowerCase().includes(filtro)) continue;
  console.log(`\n═══ ${fonte.nome} ═══`);

  let itens;
  try { itens = enumerar(fonte); }
  catch (e) { console.log(`  ✗ não foi possível enumerar: ${e.message.split("\n")[0]}`); continue; }

  itens.forEach((item, i) => {
    const slug = `${fonte.id}${String(i + 1).padStart(2, "0")}`;
    const dir = path.join(SAIDA, slug);
    const mosaico = path.join(dir, "mosaico.jpg");

    if (fs.existsSync(mosaico)) {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf-8"));
      indice.push(meta);
      console.log(`  · ${slug} já processado — ${meta.titulo?.slice(0, 60) ?? ""}`);
      return;
    }
    fs.mkdirSync(dir, { recursive: true });
    const url = `https://www.youtube.com/watch?v=${item.id}`;

    try {
      // ── legenda: cliente PADRÃO (o mweb descarta legenda), original em pt
      try {
        rodar("yt-dlp", ["--write-auto-subs", "--sub-langs", "pt-orig,pt", "--sub-format", "vtt",
          "--skip-download", "-o", path.join(dir, "v.%(ext)s"), "--no-warnings", url]);
      } catch { /* sem legenda: registrado abaixo como lacuna, nunca suposto */ }

      const vtt = ["v.pt-orig.vtt", "v.pt.vtt"].map((f) => path.join(dir, f)).find(fs.existsSync);
      const transcricao = vtt ? condensarVTT(fs.readFileSync(vtt, "utf-8")) : "";
      fs.writeFileSync(path.join(dir, "transcricao.txt"), transcricao, "utf-8");

      // ── metadados + vídeo: cliente MWEB (o padrão dá 403)
      const info = JSON.parse(rodar("yt-dlp", ["-J", "--no-warnings",
        "--extractor-args", "youtube:player_client=mweb", url]));

      rodar("yt-dlp", ["-f", "18/worst[height<=480]", "--extractor-args", "youtube:player_client=mweb",
        "-o", path.join(dir, "v.%(ext)s"), "--no-part", "--no-warnings", url]);

      const mp4 = path.join(dir, "v.mp4");
      if (!fs.existsSync(mp4)) throw new Error("yt-dlp não produziu o arquivo de vídeo");

      // ── frames pela skill
      rodar("python", [path.join(SKILL, "scripts", "watch.py"), mp4,
        "--detail", "efficient", "--max-frames", String(MAX_FRAMES),
        "--resolution", String(LARGURA), "--no-whisper", "--out-dir", path.join(dir, "w")]);

      const dirFrames = path.join(dir, "w", "frames");
      const frames = fs.readdirSync(dirFrames).filter((f) => f.endsWith(".jpg")).sort();
      if (!frames.length) throw new Error("nenhum frame extraído");

      // ── mosaico: 1 leitura por vídeo em vez de 12
      // O ffmpeg do Windows não traz `-pattern_type glob`, e a skill numera os
      // frames pelo índice do quadro na origem (0001, 0011, 0021…), não em
      // sequência. Renumera-se antes, para poder usar a sequência %03d.
      const dirMos = path.join(dir, "mos");
      fs.mkdirSync(dirMos, { recursive: true });
      frames.forEach((f, k) =>
        fs.copyFileSync(path.join(dirFrames, f), path.join(dirMos, `s_${String(k + 1).padStart(3, "0")}.jpg`)));
      const linhas = Math.ceil(frames.length / COLUNAS);
      rodar("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "1",
        "-i", path.join(dirMos, "s_%03d.jpg"),
        "-filter_complex", `tile=${COLUNAS}x${linhas}`, "-frames:v", "1", mosaico]);
      fs.rmSync(dirMos, { recursive: true, force: true });

      fs.rmSync(mp4, { force: true });                       // ~45 MB por vídeo
      fs.rmSync(path.join(dir, "w"), { recursive: true, force: true });

      const meta = {
        slug, fonte: fonte.nome, id: item.id, url,
        titulo: info.title ?? item.title,
        duracao: info.duration ?? item.duration,
        publicado: info.upload_date ?? null,
        visualizacoes: info.view_count ?? null,
        temTranscricao: transcricao.length > 0,
        palavras: transcricao.split(/\s+/).filter(Boolean).length,
        frames: frames.length,
      };
      fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2), "utf-8");
      indice.push(meta);
      console.log(`  ✓ ${slug} ${String(meta.duracao ?? "?").padStart(4)}s ${String(meta.palavras).padStart(5)}pal ` +
        `${meta.temTranscricao ? "  " : "SL"} ${(meta.titulo ?? "").slice(0, 55)}`);
    } catch (e) {
      const msg = e.message.split("\n")[0].slice(0, 120);
      falhas.push({ slug, url, erro: msg });
      console.log(`  ✗ ${slug} ${msg}`);
    }
  });
}

// O índice é reconstruído a partir do disco, não do que esta execução processou.
// Sem isso, rodar com filtro (`node assistir.mjs clinicorp`) sobrescreveria o
// índice completo por um parcial — defeito real, encontrado ao gerar a passada 2.
const todos = fs.readdirSync(SAIDA, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => path.join(SAIDA, d.name, "meta.json"))
  .filter(fs.existsSync)
  .map((p) => JSON.parse(fs.readFileSync(p, "utf-8")))
  .sort((a, b) => a.slug.localeCompare(b.slug));

fs.writeFileSync(path.join(SAIDA, "_indice.json"),
  JSON.stringify({ indice: todos, falhas, coletadoEm: new Date().toISOString() }, null, 2), "utf-8");

const semLegenda = indice.filter((m) => !m.temTranscricao);
console.log(`\n${indice.length} vídeos processados, ${falhas.length} falha(s).`);
if (semLegenda.length) console.log(`${semLegenda.length} sem legenda (SL) — lacuna declarada, nunca suposta.`);
console.log(`índice: ${path.join(SAIDA, "_indice.json")}`);
