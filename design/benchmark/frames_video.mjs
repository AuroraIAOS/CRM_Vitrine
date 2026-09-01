#!/usr/bin/env node
/**
 * Passada 2 — referências visuais em alta resolução
 * ================================================
 * Para os vídeos que a passada 1 (`assistir.mjs`) elegeu como ricos em tela de
 * produto, rebaixa o vídeo, extrai os quadros a 1024 px — a resolução em que
 * se consegue LER o texto da interface — e monta um mosaico por vídeo em
 * `capturas/videos/`.
 *
 * Um arquivo por vídeo, e cada arquivo sustenta uma tese declarada no
 * `capturas/videos/INDICE.md`. Quadro sem tese é descartado, não arquivado
 * (`00_PLANO_DE_ACAO.md` §9.2).
 *
 * Usa o mesmo caminho de download já medido em `assistir.mjs`: legenda pelo
 * cliente padrão, vídeo pelo `mweb`.
 *
 *   node design/benchmark/frames_video.mjs        # todos os eleitos
 *   node design/benchmark/frames_video.mjs CF07   # só um
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DESTINO = path.join(AQUI, "capturas", "videos");
const TRAB = fs.mkdtempSync(path.join(os.tmpdir(), "bench-frames-"));
const SKILL = process.env.SKILL_DIR;
if (!SKILL) { console.error("SKILL_DIR ausente — rode `source env.sh`."); process.exit(1); }

// slug → { id, tese }. A tese é o que aquele mosaico prova, e vai para o ÍNDICE.
const ELEITOS = {
  SD06: { id: "OQKZ4hVsE_Y", tese: "O modelo de orçamento: linha com plano, procedimento, dente, faces e valor; alternâncias de impressão; PDF com duas assinaturas" },
  SD02: { id: "ZBqfPsHXQKk", tese: "O painel como lista de tarefas acionáveis, não de gráficos" },
  SD03: { id: "0hIcXQnBLQ4", tese: "Permissão por concessão pura, agrupada por módulo, com papel-preset e contador 'x de 31'" },
  SD15: { id: "yFUmC0KPcVw", tese: "Alertas clínicos derivados da anamnese, fixos no cabeçalho da ficha" },
  SD12: { id: "F8dPvKQ0M_o", tese: "Catálogo com preço por convênio, herança do plano padrão e a marca 'aceita faces'" },
  CF06: { id: "Ue2xkFTG0jk", tese: "Odontograma com dentição permanente/decídua/mista, três estados e comparação entre datas" },
  CF07: { id: "kAr3W0oS6Xk", tese: "A régua de cobrança como linha do tempo — a melhor peça de UX do corpus" },
  CF18: { id: "SJmqRJp7Ors", tese: "Controle protético como kanban de cinco etapas com cor de atraso" },
  CF04: { id: "Zt1nJ4l1Zqk", tese: "Agendamento online entrando como solicitação a confirmar, com entrada pelo Instagram" },
  CF05: { id: "n0m5cJ1kHwU", tese: "Faceograma 2D: pontos sobre a foto do paciente, pares antes/depois e rastreio de lote" },
  CT07: { id: "0Rr7zqKqcnE", tese: "IA em três usos, e o padrão ético: a IA propõe, o humano confirma antes de aplicar" },
  CT04: { id: "8sSHXQ3-mJc", tese: "O log de auditoria exposto como relatório ao cliente" },
  CT09: { id: "nS0nT4z-9nA", tese: "Aprovar o orçamento gera o lançamento financeiro — a corrente fechada" },
};

// Os ids reais vêm do índice da passada 1; o mapa acima é só ordem e tese.
const IDX = path.join(os.homedir(), ".claude", "jobs", "bench-odonto", "videos", "_indice.json");
const porSlug = Object.fromEntries(
  (JSON.parse(fs.readFileSync(IDX, "utf-8")).indice ?? []).map((m) => [m.slug, m])
);

const filtro = process.argv[2]?.toUpperCase();
fs.mkdirSync(DESTINO, { recursive: true });
const r = (c, a, o = {}) => execFileSync(c, a, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], ...o });

for (const [slug, alvo] of Object.entries(ELEITOS)) {
  if (filtro && slug !== filtro) continue;
  const meta = porSlug[slug];
  if (!meta) { console.log(`  · ${slug} não está no índice da passada 1 — pulado`); continue; }
  const saida = path.join(DESTINO, `${slug}_${meta.fonte.includes("Simples") ? "simplesdental" : "clinicorp"}.jpg`);
  if (fs.existsSync(saida)) { console.log(`  · ${slug} já existe`); continue; }

  const dir = path.join(TRAB, slug);
  fs.mkdirSync(dir, { recursive: true });
  try {
    r("yt-dlp", ["-f", "18/worst[height<=480]", "--extractor-args", "youtube:player_client=mweb",
      "-o", path.join(dir, "v.%(ext)s"), "--no-part", "--no-warnings", meta.url]);
    r("python", [path.join(SKILL, "scripts", "watch.py"), path.join(dir, "v.mp4"),
      "--detail", "efficient", "--max-frames", "12", "--resolution", "1024",
      "--no-whisper", "--out-dir", path.join(dir, "w")]);

    const df = path.join(dir, "w", "frames");
    const fr = fs.readdirSync(df).filter((f) => f.endsWith(".jpg")).sort();
    const dm = path.join(dir, "m");
    fs.mkdirSync(dm, { recursive: true });
    fr.forEach((f, k) => fs.copyFileSync(path.join(df, f), path.join(dm, `s_${String(k + 1).padStart(3, "0")}.jpg`)));
    r("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "1", "-i", path.join(dm, "s_%03d.jpg"),
      "-filter_complex", `tile=3x${Math.ceil(fr.length / 3)}`, "-frames:v", "1", "-q:v", "3", saida]);
    console.log(`  ✓ ${path.basename(saida).padEnd(28)} ${fr.length} quadros · ${(fs.statSync(saida).size / 1024).toFixed(0)} KB`);
  } catch (e) {
    console.log(`  ✗ ${slug} ${e.message.split("\n")[0].slice(0, 90)}`);
  }
}
fs.rmSync(TRAB, { recursive: true, force: true });
