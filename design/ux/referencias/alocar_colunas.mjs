/**
 * Alocação de colunas para compromissos que colidem no horário.
 *
 * Resolve o achado A01 de `design/ux/01_DIAGNOSTICO.md` — a agenda semanal renderiza
 * texto sobreposto quando dois atendimentos ocupam a mesma faixa. Ver também
 * `design/ux/04_PADROES_DE_TELA.md` §4.
 *
 * Algoritmo guloso clássico, O(n log n), sem dependência. Três invariantes:
 *   1. nenhum bloco cobre outro;
 *   2. blocos que colidem entre si têm a MESMA largura;
 *   3. cada bloco usa a maior largura possível, respeitando (2).
 *
 * Rodar os testes:  node design/ux/referencias/alocar_colunas.mjs
 */

/**
 * @typedef {{ id: string, inicio: number, fim: number }} Bloco
 *   `inicio`/`fim` em qualquer unidade monotônica (minutos desde a meia-noite,
 *   epoch em ms…), desde que a mesma para todos.
 * @typedef {Bloco & { coluna: number, total: number }} BlocoPosicionado
 */

/**
 * @param {Bloco[]} blocos
 * @returns {BlocoPosicionado[]}
 */
export function alocarColunas(blocos) {
  // início crescente; em empate, o mais longo primeiro (fica na coluna da esquerda,
  // que é o que a leitura ocidental espera do compromisso "principal")
  const ordenados = [...blocos].sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);

  /** @type {BlocoPosicionado[]} */
  const saida = [];
  /** @type {BlocoPosicionado[]} */
  let grupo = [];
  let fimDoGrupo = -Infinity;

  const fecharGrupo = () => {
    const largura = Math.max(...grupo.map((b) => b.coluna)) + 1;
    for (const b of grupo) b.total = largura; // invariante 2
    saida.push(...grupo);
    grupo = [];
  };

  for (const bloco of ordenados) {
    // um bloco que começa depois do fim de TODOS os anteriores abre grupo novo
    if (grupo.length && bloco.inicio >= fimDoGrupo) fecharGrupo();

    // primeira coluna cujo ocupante já terminou (invariante 1 + 3)
    let coluna = 0;
    while (grupo.some((b) => b.coluna === coluna && b.fim > bloco.inicio)) coluna++;

    grupo.push({ ...bloco, coluna, total: 0 });
    fimDoGrupo = Math.max(fimDoGrupo, bloco.fim);
  }
  if (grupo.length) fecharGrupo();

  return saida;
}

/** Converte "09:30" em minutos desde a meia-noite. */
export const hm = (s) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

// ---------------------------------------------------------------------------
// Testes — as três invariantes, contra casos que a agenda real produz.
// ---------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` ||
    process.argv[1]?.endsWith("alocar_colunas.mjs")) {
  let falhas = 0;
  const checar = (nome, condicao, detalhe = "") => {
    if (condicao) console.log(`  ok   ${nome}`);
    else { console.log(`  FALHA ${nome} ${detalhe}`); falhas++; }
  };

  const colide = (a, b) => a.inicio < b.fim && b.inicio < a.fim;

  /** Verifica as três invariantes sobre um resultado qualquer. */
  function verificarInvariantes(nome, entrada) {
    const r = alocarColunas(entrada);
    console.log(`\n${nome}  (${entrada.length} blocos)`);
    for (const b of r) {
      const larg = (100 / b.total).toFixed(1);
      console.log(`  ${b.id.padEnd(22)} col ${b.coluna}/${b.total}  →  ${larg}% de largura`);
    }

    // 1. nenhum par que colide no tempo divide a mesma coluna
    const sobreposto = r.some((a) =>
      r.some((b) => a !== b && a.coluna === b.coluna && colide(a, b)),
    );
    checar("invariante 1 — nenhum bloco cobre outro", !sobreposto);

    // 2. blocos que colidem têm a mesma largura
    const larguraDivergente = r.some((a) =>
      r.some((b) => a !== b && colide(a, b) && a.total !== b.total),
    );
    checar("invariante 2 — quem colide tem a mesma largura", !larguraDivergente);

    // 3. nenhuma coluna do grupo fica vazia (ninguém desperdiça largura)
    const colunasUsadas = new Set(r.map((b) => b.coluna));
    const maxTotal = Math.max(...r.map((b) => b.total));
    const semBuraco = [...Array(maxTotal).keys()].every((c) => colunasUsadas.has(c));
    checar("invariante 3 — sem coluna desperdiçada", semBuraco);

    return r;
  }

  // Caso A: exatamente o que a captura 05_agenda.png mostra quebrado —
  // dois profissionais atendendo em paralelo no mesmo horário.
  verificarInvariantes("Caso A · dois em paralelo (o bug de A01)", [
    { id: "Helena · 09-10", inicio: hm("09:00"), fim: hm("10:00") },
    { id: "Daniela · 09-10", inicio: hm("09:00"), fim: hm("10:00") },
    { id: "Gustavo · 10-11", inicio: hm("10:00"), fim: hm("11:00") },
  ]);

  // Caso B: cadeia — A toca B, B toca C, mas A não toca C.
  // O clássico que quebra implementações ingênuas: os três formam UM grupo.
  verificarInvariantes("Caso B · cadeia A-B-C", [
    { id: "A · 09:00-10:00", inicio: hm("09:00"), fim: hm("10:00") },
    { id: "B · 09:30-10:30", inicio: hm("09:30"), fim: hm("10:30") },
    { id: "C · 10:00-11:00", inicio: hm("10:00"), fim: hm("11:00") },
  ]);

  // Caso C: três simultâneos (clínica com 3 profissionais — o cenário da conta demo).
  verificarInvariantes("Caso C · três profissionais simultâneos", [
    { id: "Aline · 14-15", inicio: hm("14:00"), fim: hm("15:00") },
    { id: "Marcos · 14-15", inicio: hm("14:00"), fim: hm("15:00") },
    { id: "Tiago · 14-15", inicio: hm("14:00"), fim: hm("15:00") },
  ]);

  // Caso D: um bloco longo (bloqueio de agenda) atravessando vários curtos.
  verificarInvariantes("Caso D · bloqueio longo atravessando curtos", [
    { id: "Bloqueio · 09-13", inicio: hm("09:00"), fim: hm("13:00") },
    { id: "Curto 1 · 09-10", inicio: hm("09:00"), fim: hm("10:00") },
    { id: "Curto 2 · 10-11", inicio: hm("10:00"), fim: hm("11:00") },
    { id: "Curto 3 · 11-12", inicio: hm("11:00"), fim: hm("12:00") },
  ]);

  // Caso E: nada colide — todos devem ocupar 100%.
  const e = verificarInvariantes("Caso E · nenhuma colisão", [
    { id: "Manhã · 09-10", inicio: hm("09:00"), fim: hm("10:00") },
    { id: "Tarde · 14-15", inicio: hm("14:00"), fim: hm("15:00") },
  ]);
  checar("caso E — todos a 100% de largura", e.every((b) => b.total === 1));

  // Caso F: adjacência exata (10:00-11:00 e 11:00-12:00) NÃO é colisão.
  const f = alocarColunas([
    { id: "X", inicio: hm("10:00"), fim: hm("11:00") },
    { id: "Y", inicio: hm("11:00"), fim: hm("12:00") },
  ]);
  console.log("\nCaso F · adjacentes não colidem");
  checar("fim == início não gera coluna extra", f.every((b) => b.total === 1));

  console.log(`\n${falhas === 0 ? "Todos os casos passaram." : `${falhas} falha(s).`}`);
  process.exitCode = falhas === 0 ? 0 : 1;
}
