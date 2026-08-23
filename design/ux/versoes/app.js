/**
 * Renderizador das três versões.
 *
 * Um só DOM, três peles (estilos.css) e algumas ramificações estruturais
 * explícitas aqui — onde a diferença entre as versões é de ARRANJO, não de
 * aparência: a sidebar agrupada, a ficha em painel lateral, a paleta de
 * comandos, o tratamento da janela de 24 h.
 *
 * Toda ramificação está marcada com `V === "01" | "02" | "03"` para que a
 * decisão fique legível — não há herança escondida entre versões.
 */
import {
  CONTA, USUARIO, PROFISSIONAIS, PESSOAS, COMPROMISSOS, ETAPAS, NEGOCIOS,
  CONVERSAS, KPIS, PENDENCIAS, SERIE_SEMANAS, SERVICOS, TIMELINE, hm,
} from "./dados.js";

const raiz = document.documentElement;
const V = () => raiz.dataset.v;
const el = (sel) => document.querySelector(sel);

/* ═══════════════════ utilidades ═══════════════════ */
const iniciais = (n) => n.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
const matiz = (n) => [...n].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const avatar = (nome, cls = "") =>
  `<span class="avatar ${cls}" style="background:hsl(${matiz(nome)} 32% 88%);color:hsl(${matiz(nome)} 38% 28%)">${iniciais(nome)}</span>`;
const brl = (v) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const brlCurto = (v) => "R$ " + v.toLocaleString("pt-BR");
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const humano = (d) => (d === 0 ? "hoje" : d === 1 ? "ontem" : d < 30 ? `há ${d} dias` : `há ${Math.round(d / 30)} mês`);
const CLASSE_VINC = { Equipe: "badge-azul", Cliente: "badge-ok", Lead: "badge-neutro" };

/**
 * Alocação de colunas para compromissos que colidem — achado A01.
 * Idêntico a design/ux/referencias/alocar_colunas.mjs, que traz a suíte
 * que verifica as três invariantes em seis casos.
 */
function alocarColunas(blocos) {
  const ord = [...blocos].sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);
  const saida = []; let grupo = []; let fimGrupo = -Infinity;
  const fechar = () => {
    const larg = Math.max(...grupo.map((b) => b.coluna)) + 1;
    for (const b of grupo) b.total = larg;
    saida.push(...grupo); grupo = [];
  };
  for (const b of ord) {
    if (grupo.length && b.inicio >= fimGrupo) fechar();
    let coluna = 0;
    while (grupo.some((g) => g.coluna === coluna && g.fim > b.inicio)) coluna++;
    grupo.push({ ...b, coluna, total: 0 });
    fimGrupo = Math.max(fimGrupo, b.fim);
  }
  if (grupo.length) fechar();
  return saida;
}

/* ═══════════════════ navegação ═══════════════════ */
const TELAS = [
  { id: "inicio",    rotulo: "Início" },
  { id: "pessoas",   rotulo: "Pessoas" },
  { id: "ficha",     rotulo: "Ficha da pessoa" },
  { id: "agenda",    rotulo: "Agenda" },
  { id: "funil",     rotulo: "Funil" },
  { id: "mensagens", rotulo: "Mensagens" },
];

/** A sidebar é uma das três diferenças estruturais mais visíveis. */
function navPorVersao() {
  if (V() === "01") {
    // Lista plana, como praticamente todo CRM comercial faz.
    return [{ grupo: null, itens: [
      { id: "inicio", r: "Início", i: "▦" }, { id: "pessoas", r: "Pessoas", i: "◉" },
      { id: "agenda", r: "Agenda", i: "▤" }, { id: "funil", r: "Funil de vendas", i: "◈" },
      { id: null, r: "Prontuário", i: "✚" }, { id: null, r: "Catálogo", i: "▣" },
      { id: null, r: "Financeiro", i: "◧" }, { id: "mensagens", r: "Mensagens", i: "◍" },
      { id: null, r: "Automações", i: "◐" }, { id: null, r: "Inteligência artificial", i: "✦" },
    ]}];
  }
  if (V() === "02") {
    // Denso, com contagem viva e atalho à mostra.
    return [
      { grupo: "Workspace", itens: [
        { id: "inicio", r: "Painel", i: "▦", k: "G I" },
        { id: null, r: "Minhas tarefas", i: "◇", n: "7" },
      ]},
      { grupo: "Registros", itens: [
        { id: "pessoas", r: "Pessoas", i: "◉", n: "31" },
        { id: "funil", r: "Negócios", i: "◈", n: "14" },
        { id: null, r: "Serviços", i: "▣", n: "12" },
        { id: null, r: "Lançamentos", i: "◧", n: "86" },
      ]},
      { grupo: "Operação", itens: [
        { id: "agenda", r: "Agenda", i: "▤", k: "G A" },
        { id: "mensagens", r: "Caixa de entrada", i: "◍", n: "3" },
        { id: null, r: "Prontuário", i: "✚" },
        { id: null, r: "Fluxos", i: "◐" },
        { id: null, r: "Agente", i: "✦" },
      ]},
    ];
  }
  // V03 — quatro grupos por tipo de trabalho (04_PADROES_DE_TELA.md §1).
  return [
    { grupo: null, itens: [{ id: "inicio", r: "Início", i: "▦" }] },
    { grupo: "Atendimento",    itens: [{ id: "agenda", r: "Agenda", i: "▤" }, { id: null, r: "Prontuário", i: "✚" }] },
    { grupo: "Relacionamento", itens: [{ id: "pessoas", r: "Pessoas", i: "◉" }, { id: "mensagens", r: "Mensagens", i: "◍" }] },
    { grupo: "Comercial",      itens: [{ id: "funil", r: "Funil", i: "◈" }, { id: null, r: "Catálogo", i: "▣" }, { id: null, r: "Financeiro", i: "◧" }] },
    { grupo: "Automação",      itens: [{ id: null, r: "Fluxos", i: "◐" }, { id: null, r: "Agente de IA", i: "✦" }] },
  ];
}

function pintarLateral(telaAtual) {
  const marca = V() === "02"
    ? `<div class="logo">CA</div><div><div class="nome">${CONTA.nome}</div></div>`
    : `<div class="logo">CA</div><div><div class="nome">${CONTA.nome}</div><div class="sub">${CONTA.plano}</div></div>`;

  const nav = navPorVersao().map((g) => `
    ${g.grupo ? `<div class="nav-grupo">${g.grupo}</div>` : ""}
    ${g.itens.map((it) => `
      <button class="nav-item" ${it.id === telaAtual ? 'aria-current="page"' : ""}
              ${it.id ? `data-ir="${it.id}"` : "disabled"}>
        <span class="ic" aria-hidden="true">${it.i}</span>${it.r}
        ${it.n ? `<span class="conta-badge">${it.n}</span>` : ""}
        ${it.k ? `<span class="conta-badge">${it.k}</span>` : ""}
      </button>`).join("")}`).join("");

  el("#lateral").innerHTML = `
    <div class="marca">${marca}</div>
    <nav class="nav">${nav}</nav>
    <div class="nav-rodape">
      <button class="nav-item"><span class="ic" aria-hidden="true">⚙</span>Configurações</button>
      <button class="nav-item"><span class="ic" aria-hidden="true">◎</span>Suporte</button>
    </div>`;
}

function pintarTopo(telaAtual) {
  const rotulo = TELAS.find((t) => t.id === telaAtual)?.rotulo ?? "";
  const av = `${avatar(USUARIO.nome)}<span style="font-size:var(--fs-sm);font-weight:500">${USUARIO.nome}</span>`;

  if (V() === "01") {
    el("#topo").innerHTML = `
      <div class="busca-topo" style="margin-left:0"><span aria-hidden="true">⌕</span>Buscar em todo o CRM…</div>
      <div class="acoes-topo">
        <button class="btn-icone" aria-label="Notificações">◔</button>
        <button class="btn-icone" aria-label="Ajuda">?</button>
        <span class="linha" style="gap:.5rem">${av}</span>
      </div>`;
    return;
  }
  if (V() === "02") {
    el("#topo").innerHTML = `
      <span class="mono" style="font-size:var(--fs-xs);color:var(--txt-muted)">${CONTA.nome} / ${rotulo}</span>
      <div class="busca-topo" style="margin-left:auto"><span aria-hidden="true">⌕</span>Buscar…<kbd>⌘K</kbd></div>
      <div class="acoes-topo" style="margin-left:0">
        <button class="btn btn-texto btn-sm">Compartilhar</button>
        <button class="btn-icone" aria-label="Notificações">◔</button>
        ${avatar(USUARIO.nome)}
      </div>`;
    return;
  }
  // V03 — busca visível com o atalho à mostra, e o estado do canal ao lado.
  el("#topo").innerHTML = `
    <div class="busca-topo"><span aria-hidden="true">⌕</span>Buscar pessoa, negócio, atendimento…<kbd>Ctrl K</kbd></div>
    <div class="acoes-topo">
      <span class="status-con on"><span class="pt"></span>WhatsApp conectado</span>
      <button class="btn-icone" aria-label="Notificações">◔</button>
      <span class="linha" style="gap:.5rem">${av}</span>
    </div>`;
}

/* ═══════════════════ peças reutilizadas ═══════════════════ */
const cabPagina = (titulo, contexto, acoes) => `
  <div class="cab-pagina">
    <div><h2>${titulo}</h2><div class="contexto">${contexto}</div></div>
    <div class="acoes">${acoes}</div>
  </div>`;

const gradeKpi = () => `
  <div class="grade-kpi">
    ${KPIS.map((k) => `
      <button class="kpi" data-ir="${k.destino}">
        <div class="cab-kpi">
          <span class="ic-kpi" aria-hidden="true">${k.ic}</span>
          <span class="eyebrow">${k.rotulo}</span>
          <span class="seta" aria-hidden="true">→</span>
        </div>
        <div class="valor">${k.valor}</div>
        ${k.delta ? `<div class="delta ${k.dir}">${k.delta}</div>` : ""}
        <div class="base">${k.base}</div>
      </button>`).join("")}
  </div>`;

function graficoBarras() {
  const max = Math.max(...SERIE_SEMANAS.map((s) => s.v));
  return `
    <div class="grade-y" style="padding-right:2.25rem">
      ${[1, .66, .33].map((f) => `<div class="lg" style="top:${(1 - f) * 8.5}rem"><span>${Math.round(max * f)}</span></div>`).join("")}
      <div class="barras">
        ${SERIE_SEMANAS.map((s, i) => `<div class="b ${i === SERIE_SEMANAS.length - 1 ? "fim" : ""}"
            style="height:${(s.v / max) * 100}%" title="${s.r}: ${s.v}"></div>`).join("")}
      </div>
      <div class="rot-barras">${SERIE_SEMANAS.map((s) => `<span>${s.r}</span>`).join("")}</div>
    </div>`;
}

function donut() {
  let acc = 0;
  const raio = 34, circ = 2 * Math.PI * raio;
  const cores = ["var(--serie-1)", "var(--serie-2)", "var(--serie-3)", "var(--serie-4)"];
  const fatias = SERVICOS.map((s, i) => {
    const dash = (s.pct / 100) * circ;
    const seg = `<circle cx="45" cy="45" r="${raio}" fill="none" stroke="${cores[i]}" stroke-width="15"
       stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-acc}" transform="rotate(-90 45 45)"/>`;
    acc += dash; return seg;
  }).join("");
  return `
    <div class="linha" style="gap:1.25rem;flex-wrap:nowrap">
      <svg width="90" height="90" viewBox="0 0 90 90" role="img" aria-label="Distribuição de serviços">${fatias}</svg>
      <ul style="display:grid;gap:.375rem;flex:1">
        ${SERVICOS.map((s, i) => `<li class="linha" style="gap:.5rem;flex-wrap:nowrap">
          <span class="pt" style="color:${cores[i]}"></span>
          <span style="font-size:var(--fs-sm);flex:1">${s.nome}</span>
          <span class="mono" style="font-size:var(--fs-xs);color:var(--txt-muted)">${s.pct}%</span></li>`).join("")}
      </ul>
    </div>`;
}

/* ═══════════════════ TELA: início ═══════════════════ */
function telaInicio() {
  if (V() === "01") {
    return `
      ${cabPagina("Painel", "Visão geral da Clínica Aurora · agosto de 2026",
        `<button class="btn btn-contorno">Exportar</button><button class="btn btn-primario">+ Novo agendamento</button>`)}
      ${gradeKpi()}
      <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:var(--gap);margin-bottom:var(--gap)">
        <section class="card"><div class="card-cab"><h4>Atendimentos por semana</h4>
          <span class="aparte">últimas 12 semanas</span></div>
          <div class="card-pad">${graficoBarras()}</div></section>
        <section class="card"><div class="card-cab"><h4>Serviços mais realizados</h4>
          <span class="aparte">90 dias</span></div>
          <div class="card-pad">${donut()}</div></section>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--gap)">
        <section class="card"><div class="card-cab"><h4>Próximos atendimentos</h4></div>
          ${COMPROMISSOS.filter((c) => c.dia === 1 && !c.bloqueio).slice(0, 5).map((c) => `
            <div class="item-lista"><span class="mono" style="font-size:var(--fs-xs);color:var(--txt-muted);width:3rem">${hhmm(c.inicio)}</span>
              <div><b style="font-size:var(--fs-sm)">${c.pessoa}</b>
              <div style="font-size:var(--fs-xs);color:var(--txt-muted)">${c.servico}</div></div>
              <span class="badge badge-neutro" style="margin-left:auto">${c.sala}</span></div>`).join("")}
        </section>
        <section class="card"><div class="card-cab"><h4>Pendências da equipe</h4></div>
          ${PENDENCIAS.map((p) => `<div class="item-lista">${p.texto}<span class="qtd">${p.qtd}</span></div>`).join("")}
        </section>
      </div>`;
  }

  if (V() === "02") {
    const porEtapa = ETAPAS.map((e, i) => {
      const ns = NEGOCIOS.filter((n) => n.etapa === i);
      return { ...e, qtd: ns.length, soma: ns.reduce((s, n) => s + n.valor, 0),
               travados: ns.filter((n) => n.dias > e.mediaDias * 2).length };
    });
    return `
      ${cabPagina("Painel", `Atualizado há 2 min · <span class="mono">31 pessoas · 14 negócios · 6 atendimentos hoje</span>`,
        `<button class="btn btn-contorno btn-sm">Período: 30 d ▾</button><button class="btn btn-contorno btn-sm">Editar painel</button>`)}
      ${gradeKpi()}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--gap);margin-bottom:var(--gap)">
        <section class="card"><div class="card-cab"><h4>Precisa de você</h4>
          <span class="aparte mono">7 itens</span></div>
          ${[["Negócios parados há mais que o dobro da média", 2, "perigo"],
             ["Conversas sem resposta há mais de 2 h", 2, "aviso"],
             ["Anamneses não preenchidas", 4, "aviso"],
             ["Cobranças vencidas", 2, "perigo"]].map(([t, q, tom]) => `
            <div class="item-lista"><span class="badge badge-${tom}">${q}</span>
              <span style="font-size:var(--fs-sm)">${t}</span>
              <span style="margin-left:auto;color:var(--txt-faint)">→</span></div>`).join("")}
        </section>
        <section class="card"><div class="card-cab"><h4>Funil por etapa</h4>
          <span class="aparte mono">tempo médio na etapa</span></div>
          <div class="card-pad" style="display:grid;gap:.5rem">
            ${porEtapa.map((e) => `
              <div>
                <div class="linha" style="gap:.5rem;flex-wrap:nowrap;font-size:var(--fs-xs)">
                  <span style="flex:1">${e.nome}</span>
                  <span class="mono" style="color:var(--txt-muted)">${e.qtd}</span>
                  <span class="mono" style="width:5.5rem;text-align:right">${brlCurto(e.soma)}</span>
                  <span class="mono" style="width:3rem;text-align:right;color:${e.travados ? "var(--perigo-txt)" : "var(--txt-faint)"}">${e.mediaDias} d</span>
                </div>
                <div class="medidor" style="margin-top:.25rem"><i style="width:${(e.soma / 5000) * 100}%"></i></div>
              </div>`).join("")}
          </div>
        </section>
      </div>
      <section class="card"><div class="card-cab"><h4>Atendimentos por semana</h4>
        <span class="aparte mono">12 sem · pico 38</span></div>
        <div class="card-pad">${graficoBarras()}</div></section>`;
  }

  // V03 — o painel é "o dia", porque é isso que a recepção abre de manhã.
  const hoje = COMPROMISSOS.filter((c) => c.dia === 1);
  return `
    ${cabPagina("Início", "Terça-feira, 18 de agosto · 6 atendimentos · 3 profissionais em sala",
      `<button class="btn btn-contorno">Bloquear horário</button><button class="btn btn-primario">+ Novo atendimento</button>`)}
    ${gradeKpi()}
    <div class="grade-dia" style="margin-bottom:var(--gap)">
      <section class="card"><div class="card-cab"><h4>O dia de hoje</h4>
        <span class="aparte">a partir de agora</span></div>
        ${hoje.map((c) => `
          <div class="dia-item" style="--pcor:${PROFISSIONAIS[c.prof].cor}">
            <span class="bar"></span>
            <span class="h">${hhmm(c.inicio)}</span>
            <div class="quem" style="flex:1"><b>${c.pessoa}</b><span>${c.servico} · ${PROFISSIONAIS[c.prof].curto}</span></div>
            ${c.bloqueio ? `<span class="badge badge-neutro">bloqueio</span>`
                         : `<span class="badge badge-neutro">${c.sala}</span>`}
          </div>`).join("")}
      </section>
      <section class="card"><div class="card-cab"><h4>Pendências</h4>
        <span class="aparte">clique para abrir a lista</span></div>
        ${PENDENCIAS.map((p) => `
          <div class="item-lista"><span class="badge badge-${p.tom === "neutro" ? "neutro" : p.tom}">${p.qtd}</span>
            <span style="font-size:var(--fs-sm)">${p.texto}</span>
            <span style="margin-left:auto;color:var(--txt-faint)">→</span></div>`).join("")}
        <div class="card-pad" style="border-top:1px solid var(--hairline)">
          <div class="eyebrow" style="margin-bottom:.5rem">Ocupação da semana</div>
          ${PROFISSIONAIS.map((p, i) => `
            <div style="margin-bottom:.5rem">
              <div class="linha" style="gap:.5rem;flex-wrap:nowrap;font-size:var(--fs-xs)">
                <span style="flex:1">${p.nome}</span><span class="mono">${[53, 53, 51][i]}%</span></div>
              <div class="medidor" style="margin-top:.25rem"><i style="width:${[53, 53, 51][i]}%"></i></div>
            </div>`).join("")}
        </div>
      </section>
    </div>
    <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:var(--gap)">
      <section class="card"><div class="card-cab"><h4>Atendimentos por semana</h4>
        <span class="aparte">últimas 12 semanas</span></div>
        <div class="card-pad">${graficoBarras()}</div></section>
      <section class="card"><div class="card-cab"><h4>Serviços mais realizados</h4>
        <span class="aparte">90 dias</span></div>
        <div class="card-pad">${donut()}</div></section>
    </div>`;
}

/* ═══════════════════ TELA: pessoas ═══════════════════ */
function tabelaPessoas({ selecionadas = [] } = {}) {
  const cols = V() === "02"
    ? `<colgroup><col style="width:2.25rem"><col style="width:24%"><col style="width:6.5rem">
       <col style="width:8.5rem"><col><col style="width:9rem"><col style="width:8rem"></colgroup>`
    : `<colgroup><col style="width:2.5rem"><col style="width:28%"><col style="width:7.5rem">
       <col><col style="width:10rem"><col style="width:2.75rem"></colgroup>`;

  const cab = V() === "02"
    ? `<tr><th><input type="checkbox"></th><th>Nome</th><th>Vínculo</th><th>Telefone</th>
       <th>E-mail</th><th class="n">Último contato</th><th>Profissional</th></tr>`
    : `<tr><th><input type="checkbox"></th><th>Nome ↑</th><th>Vínculo</th><th>Contato</th>
       <th class="n">Último contato</th><th></th></tr>`;

  const linhas = PESSOAS.map((p) => {
    const sel = selecionadas.includes(p.nome);
    const prof = p.prof !== null ? PROFISSIONAIS[p.prof].nome : "—";
    return V() === "02"
      ? `<tr class="${sel ? "sel" : ""}">
          <td><input type="checkbox" ${sel ? "checked" : ""}></td>
          <td><span class="celula-nome">${avatar(p.nome)}${p.nome}</span></td>
          <td><span class="badge ${CLASSE_VINC[p.vinculo]}">${p.vinculo}</span></td>
          <td class="mono" style="color:var(--txt-2)">${p.tel}</td>
          <td style="color:var(--txt-muted)">${p.email}</td>
          <td class="n" style="color:var(--txt-muted)">${humano(p.dias)}</td>
          <td style="color:var(--txt-muted)">${prof}</td></tr>`
      : `<tr class="${sel ? "sel" : ""}">
          <td><input type="checkbox" ${sel ? "checked" : ""}></td>
          <td><span class="celula-nome">${avatar(p.nome)}${p.nome}</span></td>
          <td><span class="badge ${CLASSE_VINC[p.vinculo]}">${p.vinculo}</span></td>
          <td style="color:var(--txt-muted)">${p.email}</td>
          <td class="n" style="color:var(--txt-muted)">${humano(p.dias)}</td>
          <td><button class="btn-icone" aria-label="Ações de ${p.nome}">⋯</button></td></tr>`;
  }).join("");

  return `<table class="dados">${cols}<thead>${cab}</thead><tbody>${linhas}</tbody></table>`;
}

function telaPessoas() {
  const abas = `
    <div class="abas">
      <button aria-selected="true">Todas <span class="cont">31</span></button>
      <button aria-selected="false">Leads <span class="cont">12</span></button>
      <button aria-selected="false">Clientes <span class="cont">10</span></button>
      <button aria-selected="false">Equipe <span class="cont">7</span></button>
      <button aria-selected="false">Fornecedores <span class="cont">2</span></button>
    </div>`;

  if (V() === "01") {
    return `
      ${cabPagina("Pessoas", "Todos os contatos da Clínica Aurora",
        `<button class="btn btn-contorno">Importar</button><button class="btn btn-primario">+ Nova pessoa</button>`)}
      ${abas}
      <section class="card tabela-casca">
        <div class="card-cab">
          <input class="campo" style="max-width:18rem" placeholder="Buscar por nome ou e-mail…">
          <button class="btn btn-contorno btn-sm">Filtros</button>
          <span class="aparte">31 resultados</span>
        </div>
        ${tabelaPessoas()}
        <div class="rodape-tabela"><span>Mostrando 1–14 de 31</span>
          <div class="linha" style="margin-left:auto">
            <button class="btn btn-contorno btn-sm">Anterior</button>
            <button class="btn btn-sm" aria-pressed="true">1</button>
            <button class="btn btn-texto btn-sm">2</button>
            <button class="btn btn-texto btn-sm">3</button>
            <button class="btn btn-contorno btn-sm">Próxima</button>
          </div></div>
      </section>`;
  }

  if (V() === "02") {
    return `
      ${cabPagina("Pessoas", `<span class="mono">31 registros · 3 visões salvas</span>`,
        `<button class="btn btn-contorno btn-sm">Colunas</button>
         <button class="btn btn-contorno btn-sm">Exportar</button>
         <button class="btn btn-primario btn-sm">+ Nova</button>`)}
      <div class="abas">
        <button aria-selected="true">Todas <span class="cont">31</span></button>
        <button aria-selected="false">Leads sem contato <span class="cont">6</span></button>
        <button aria-selected="false">Pacote ativo <span class="cont">9</span></button>
        <button aria-selected="false">Clientes da Aline <span class="cont">4</span></button>
        <button aria-selected="false" style="color:var(--txt-faint)">+ Nova visão</button>
      </div>
      <div class="linha" style="margin-bottom:.625rem;gap:.375rem">
        <span class="chip">Vínculo <span class="op">é</span> <span class="val">Cliente</span> ✕</span>
        <span class="chip">Último contato <span class="op">&gt;</span> <span class="val">7 dias</span> ✕</span>
        <span class="chip add">+ Filtro</span>
        <span class="mono" style="margin-left:auto;font-size:var(--fs-xs);color:var(--txt-muted);white-space:nowrap">
          <kbd>J</kbd> <kbd>K</kbd> navegar · <kbd>X</kbd> marcar · <kbd>⏎</kbd> abrir</span>
      </div>
      <section class="card tabela-casca">
        <div class="barra-massa">
          <span>2 selecionadas</span>
          <button class="btn btn-texto btn-sm" style="color:inherit">Etiquetar</button>
          <button class="btn btn-texto btn-sm" style="color:inherit">Atribuir</button>
          <button class="btn btn-texto btn-sm" style="color:inherit">Adicionar ao fluxo</button>
          <button class="btn btn-texto btn-sm" style="color:inherit">Exportar</button>
          <span class="mono" style="margin-left:auto;font-size:var(--fs-eyebrow)">Selecionar todas as 31</span>
        </div>
        ${tabelaPessoas({ selecionadas: ["Ana Beatriz Moreira", "Carlos Eduardo Pinto"] })}
        <div class="rodape-tabela"><span class="mono">1–14 / 31</span>
          <span style="margin-left:auto" class="mono">carregamento contínuo</span></div>
      </section>`;
  }

  // V03
  return `
    ${cabPagina("Pessoas", "31 cadastradas · 12 leads · 10 clientes · 7 na equipe",
      `<button class="btn btn-contorno">Importar</button><button class="btn btn-primario">+ Nova pessoa</button>`)}
    ${abas}
    <div class="linha" style="margin-bottom:.75rem">
      <input class="campo" style="max-width:20rem" placeholder="Buscar por nome, telefone ou e-mail…">
      <button class="btn btn-contorno btn-sm">Vínculo ▾</button>
      <button class="btn btn-contorno btn-sm">Profissional ▾</button>
      <button class="btn btn-texto btn-sm">+ Filtro</button>
      <div class="linha" style="margin-left:auto;gap:.25rem">
        <span class="eyebrow">Densidade</span>
        <button class="btn btn-contorno btn-sm">Compacta</button>
        <button class="btn btn-sm" aria-pressed="true">Confortável</button>
      </div>
    </div>
    <section class="card tabela-casca">
      <div class="barra-massa">
        <span>2 selecionadas</span>
        <button class="btn btn-texto btn-sm" style="color:inherit">Etiquetar</button>
        <button class="btn btn-texto btn-sm" style="color:inherit">Atribuir a profissional</button>
        <button class="btn btn-texto btn-sm" style="color:inherit">Exportar</button>
        <button class="btn btn-texto btn-sm" style="color:inherit;margin-left:auto">Limpar seleção</button>
      </div>
      ${tabelaPessoas({ selecionadas: ["Ana Beatriz Moreira", "Karina Duarte"] })}
      <div class="rodape-tabela"><span>1–14 de 31</span>
        <select class="campo" style="width:auto;height:1.75rem;font-size:var(--fs-xs);padding:0 .375rem">
          <option>25 por página</option></select>
        <div class="linha" style="margin-left:auto">
          <button class="btn btn-contorno btn-sm">‹</button>
          <span class="mono">1 / 2</span>
          <button class="btn btn-contorno btn-sm">›</button>
        </div></div>
    </section>`;
}

/* ═══════════════════ TELA: ficha ═══════════════════ */
function corpoFicha({ compacto = false } = {}) {
  const p = PESSOAS.find((x) => x.nome === "Ana Beatriz Moreira");
  let diaAtual = null;
  const tl = TIMELINE.map((t) => {
    const cab = t.dia !== diaAtual ? `<div class="tl-dia">${t.dia}</div>` : "";
    diaAtual = t.dia;
    return `${cab}<div class="tl-h">${t.hora}</div><div class="tl-c"><b>${t.titulo}</b><span>${t.detalhe}</span></div>`;
  }).join("");

  return { p, timeline: `<div class="tl">${tl}</div>`, compacto };
}

function telaFicha() {
  const { p, timeline } = corpoFicha();

  if (V() === "01") {
    return `
      <div class="linha" style="margin-bottom:.75rem;font-size:var(--fs-sm);color:var(--txt-muted)">
        <span>Pessoas</span><span>›</span><span style="color:var(--txt)">${p.nome}</span></div>
      <section class="card card-pad" style="margin-bottom:var(--gap)">
        <div class="ficha-cab">
          ${avatar(p.nome, "avatar-g")}
          <div class="quem" style="flex:1">
            <h3>${p.nome}</h3>
            <div class="contato"><span>${p.email}</span><span>${p.tel}</span>
              <span>Cliente desde 12 de maio de 2026</span></div>
          </div>
          <button class="btn btn-contorno">Editar</button>
          <button class="btn btn-primario">Novo agendamento</button>
        </div>
      </section>
      <div class="abas">
        <button aria-selected="true">Visão geral</button>
        <button aria-selected="false">Atendimentos</button>
        <button aria-selected="false">Prontuário</button>
        <button aria-selected="false">Financeiro</button>
        <button aria-selected="false">Documentos</button>
      </div>
      <div class="ficha">
        <section class="card"><div class="card-cab"><h4>Histórico</h4></div>
          <div class="card-pad">${timeline}</div></section>
        <div class="pilha">
          <section class="card"><div class="card-cab"><h4>Dados</h4></div>
            <div class="card-pad" style="display:grid;gap:.5rem;font-size:var(--fs-sm)">
              <div><div class="eyebrow">Vínculo</div>Cliente</div>
              <div><div class="eyebrow">Profissional</div>Tiago Rocha</div>
              <div><div class="eyebrow">Pacote</div>10 sessões · 3 usadas</div>
            </div></section>
          <section class="card"><div class="card-cab"><h4>Notas internas</h4></div>
            <div class="card-pad"><input class="campo" placeholder="Escrever nota…"></div></section>
        </div>
      </div>`;
  }

  if (V() === "02") {
    // A ficha não é uma página: é um painel sobre a lista. Nada de contexto se perde.
    return `
      ${telaPessoas()}
      <div class="veu"></div>
      <aside class="drawer">
        <div class="drawer-cab">
          ${avatar(p.nome)}
          <b style="font-size:var(--fs-sm)">${p.nome}</b>
          <span class="badge badge-ok">Cliente</span>
          <div class="linha" style="margin-left:auto;gap:.25rem">
            <kbd>↑</kbd><kbd>↓</kbd>
            <span class="mono" style="font-size:var(--fs-eyebrow);color:var(--txt-faint)">1 de 31</span>
            <button class="btn-icone" aria-label="Fechar">✕</button>
          </div>
        </div>
        <div class="drawer-corpo">
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:.5rem;margin-bottom:.875rem">
            ${[["Telefone", p.tel], ["E-mail", p.email], ["Profissional", "Tiago Rocha"],
               ["Pacote", "10 sessões · 3 usadas"], ["Receita acumulada", "R$ 1.620,00"],
               ["Último contato", "hoje"]].map(([k, v]) => `
              <div><div class="eyebrow">${k}</div>
                <div style="font-size:var(--fs-sm)">${v}</div></div>`).join("")}
          </div>
          <div class="abas" style="margin-bottom:.75rem">
            <button aria-selected="true">Atividade</button>
            <button aria-selected="false">Prontuário</button>
            <button aria-selected="false">Financeiro</button>
            <button aria-selected="false">Campos</button>
          </div>
          ${timeline}
        </div>
      </aside>`;
  }

  // V03 — ações rápidas no cabeçalho, e a coluna direita começa pelo que é urgente.
  return `
    <div class="linha" style="margin-bottom:.75rem;font-size:var(--fs-sm);color:var(--txt-muted)">
      <span style="color:var(--azul-txt)">Pessoas</span><span>›</span><span style="color:var(--txt)">${p.nome}</span></div>
    <section class="card card-pad" style="margin-bottom:var(--gap)">
      <div class="ficha-cab">
        ${avatar(p.nome, "avatar-g")}
        <div class="quem" style="flex:1">
          <div class="linha" style="gap:.5rem"><h3>${p.nome}</h3>
            <span class="badge badge-ok">Cliente</span>
            <span class="badge badge-neutro">Pacote ativo · 3 de 10</span></div>
          <div class="contato">
            <a href="#">${p.tel}</a><a href="#">${p.email}</a>
            <span>Cliente desde 12 de maio de 2026</span></div>
          <div class="acoes-rapidas">
            <button class="btn btn-contorno btn-sm">WhatsApp</button>
            <button class="btn btn-contorno btn-sm">Agendar</button>
            <button class="btn btn-contorno btn-sm">Cobrar</button>
            <button class="btn btn-contorno btn-sm">Anamnese</button>
          </div>
        </div>
        <button class="btn btn-contorno">Editar dados</button>
      </div>
    </section>
    <div class="abas">
      <button aria-selected="true">Linha do tempo</button>
      <button aria-selected="false">Prontuário</button>
      <button aria-selected="false">Financeiro</button>
      <button aria-selected="false">Documentos</button>
      <button aria-selected="false">Campos personalizados</button>
    </div>
    <div class="ficha">
      <section class="card"><div class="card-cab"><h4>Linha do tempo</h4>
        <span class="aparte">todos os eventos</span></div>
        <div class="card-pad">${timeline}</div></section>
      <div class="pilha">
        <section class="card"><div class="card-cab"><h4>Próximo atendimento</h4></div>
          <div class="card-pad">
            <div class="linha" style="gap:.625rem;flex-wrap:nowrap">
              <span class="mono" style="font-size:var(--fs-lg);font-weight:600">14:00</span>
              <div><b style="font-size:var(--fs-sm)">Quinta, 20/08</b>
                <div style="font-size:var(--fs-xs);color:var(--txt-muted)">Massagem relaxante · Marcos Dias</div></div>
            </div>
            <div class="linha" style="margin-top:.75rem">
              <button class="btn btn-contorno btn-sm">Remarcar</button>
              <button class="btn btn-texto btn-sm">Confirmar por WhatsApp</button>
            </div>
          </div></section>
        <section class="card"><div class="card-cab"><h4>Pendências</h4></div>
          <div class="item-lista"><span class="badge badge-aviso">1</span>
            <span style="font-size:var(--fs-sm)">Anamnese incompleta</span></div>
          <div class="item-lista"><span class="badge badge-ok">ok</span>
            <span style="font-size:var(--fs-sm)">Consentimento assinado</span></div>
        </section>
        <section class="card"><div class="card-cab"><h4>Notas internas</h4></div>
          <div class="card-pad"><input class="campo" placeholder="Escrever nota…"></div></section>
      </div>
    </div>`;
}

/* ═══════════════════ TELA: agenda ═══════════════════ */
function telaAgenda() {
  const H_INI = V() === "02" ? 7 : 8;
  const H_FIM = V() === "02" ? 20 : 18;
  const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
  const NUMS = [17, 18, 19, 20, 21];
  const total = (H_FIM - H_INI) * 60;
  const topo = (m) => ((m - H_INI * 60) / total) * 100;
  const alt = (a, b) => ((b - a) / total) * 100;
  const faixas = Array.from({ length: H_FIM - H_INI }, () => `<div class="faixa"></div>`).join("");

  const colunas = DIAS.map((_, d) => {
    const blocos = alocarColunas(COMPROMISSOS.filter((c) => c.dia === d));
    const cmps = blocos.map((c) => `
      <div class="cmp ${c.bloqueio ? "bloqueio" : ""}" style="
        top:${topo(c.inicio)}%; height:${alt(c.inicio, c.fim)}%;
        left:calc(${c.coluna} / ${c.total} * 100% + 2px);
        width:calc(100% / ${c.total} - 5px);
        --pcor:${PROFISSIONAIS[c.prof].cor}">
        <b>${c.pessoa}</b><i>${c.servico}</i>
        <span class="hora-cmp">${hhmm(c.inicio)}–${hhmm(c.fim)}</span>
      </div>`).join("");
    const agora = d === 1 ? `<div class="agora" style="top:${topo(hm("11:20"))}%"></div>` : "";
    return `<div class="col-dia">${faixas}${cmps}${agora}</div>`;
  }).join("");

  const regua = `<div class="regua">${Array.from({ length: H_FIM - H_INI }, (_, i) =>
    `<div class="h"><span>${String(H_INI + i).padStart(2, "0")}:00</span></div>`).join("")}</div>`;

  const cabs = `<div class="ag-cab"></div>` + DIAS.map((d, i) =>
    `<div class="ag-cab ${i === 1 ? "hoje" : ""}"><div class="dia-sem">${d}</div><div class="dia-num">${NUMS[i]}</div></div>`).join("");

  const filtros = PROFISSIONAIS.map((p) =>
    `<button class="btn btn-contorno btn-sm" aria-pressed="true">
      <span class="pt" style="color:${p.cor}"></span>${V() === "02" ? p.curto : p.nome}</button>`).join("");

  if (V() === "01") {
    return `
      ${cabPagina("Agenda", "17 a 23 de agosto de 2026",
        `<button class="btn btn-contorno">Bloquear horário</button><button class="btn btn-primario">+ Novo agendamento</button>`)}
      <section class="card agenda-casca">
        <div class="agenda-topo">
          <button class="btn btn-contorno btn-sm">‹</button>
          <button class="btn btn-contorno btn-sm">Hoje</button>
          <button class="btn btn-contorno btn-sm">›</button>
          <b style="font-size:var(--fs-md);margin-left:.5rem">Agosto de 2026</b>
          <div class="linha" style="margin-left:auto;gap:.25rem">
            <button class="btn btn-sm" aria-pressed="true">Semana</button>
            <button class="btn btn-texto btn-sm">Dia</button>
            <button class="btn btn-texto btn-sm">Mês</button>
          </div>
        </div>
        <div class="agenda" style="--dias:5">${cabs}${regua}${colunas}</div>
      </section>`;
  }

  if (V() === "02") {
    return `
      ${cabPagina("Agenda", `<span class="mono">17–21 ago · 27 atendimentos · 3 profissionais</span>`,
        `<button class="btn btn-contorno btn-sm">Sala ▾</button><button class="btn btn-contorno btn-sm">Serviço ▾</button>
         <button class="btn btn-primario btn-sm">+ Novo</button>`)}
      <section class="card agenda-casca">
        <div class="agenda-topo">
          <button class="btn-icone">‹</button><button class="btn btn-texto btn-sm">Hoje <kbd>T</kbd></button><button class="btn-icone">›</button>
          <span class="mono" style="font-size:var(--fs-xs);margin-left:.375rem">2026-W34</span>
          <div class="linha" style="margin-left:.75rem;gap:.25rem">${filtros}</div>
          <div class="linha" style="margin-left:auto;gap:.25rem">
            <button class="btn btn-texto btn-sm">Dia</button>
            <button class="btn btn-sm" aria-pressed="true">Semana</button>
            <button class="btn btn-texto btn-sm">Profissional</button>
            <button class="btn btn-texto btn-sm">Sala</button>
          </div>
        </div>
        <div class="agenda" style="--dias:5">${cabs}${regua}${colunas}</div>
      </section>`;
  }

  // V03 — expediente da conta (08–18h), fim de semana fora, filtro por profissional
  return `
    ${cabPagina("Agenda", "17 a 21 de agosto · expediente 08h–18h · 27 atendimentos",
      `<button class="btn btn-contorno">Bloquear horário</button><button class="btn btn-primario">+ Novo atendimento</button>`)}
    <section class="card agenda-casca">
      <div class="agenda-topo">
        <button class="btn btn-contorno btn-sm">← semana</button>
        <button class="btn btn-contorno btn-sm">Hoje</button>
        <button class="btn btn-contorno btn-sm">semana →</button>
        <div class="linha" style="margin-left:.75rem;gap:.375rem">
          <span class="eyebrow">Profissionais</span>${filtros}
        </div>
        <div class="linha" style="margin-left:auto;gap:.25rem">
          <button class="btn btn-texto btn-sm">Dia</button>
          <button class="btn btn-sm" aria-pressed="true">Semana</button>
          <button class="btn btn-texto btn-sm">Sáb/Dom</button>
        </div>
      </div>
      <div class="agenda" style="--dias:5">${cabs}${regua}${colunas}</div>
    </section>`;
}

/* ═══════════════════ TELA: funil ═══════════════════ */
function telaFunil() {
  const totalAberto = NEGOCIOS.reduce((s, n) => s + n.valor, 0);

  const colunas = ETAPAS.map((e, i) => {
    const ns = NEGOCIOS.filter((n) => n.etapa === i);
    const soma = ns.reduce((s, n) => s + n.valor, 0);
    const cards = ns.map((n) => {
      const razao = n.dias / e.mediaDias;
      const cls = razao > 2 ? "pg" : razao > 1 ? "av" : "ok";
      const dono = PROFISSIONAIS[n.dono];
      if (V() === "01") {
        return `<article class="neg">
          <div class="l1"><span class="pnome">${n.pessoa}</span></div>
          <div class="pvalor">${brl(n.valor)}</div>
          <div class="l3">${avatar(dono.nome)}
            <span style="font-size:var(--fs-xs);color:var(--txt-muted)">${dono.curto}</span></div>
        </article>`;
      }
      return `<article class="neg ${razao > 2 ? "travado" : ""}">
        <div class="l1"><span class="pnome">${n.pessoa}</span>
          <button class="btn-icone" style="margin-left:auto;width:1.25rem;height:1.25rem">⋯</button></div>
        <div class="pvalor">${brl(n.valor)}</div>
        <div class="prox">
          <span class="pt" style="color:${n.prox ? "var(--azul)" : "var(--perigo)"}"></span>
          ${n.prox ? `${n.prox} · ${n.quando}` : "Sem próxima ação definida"}</div>
        <div class="l3">${avatar(dono.nome)}
          <span class="idade ${cls}">${n.dias} d na etapa</span></div>
      </article>`;
    }).join("");

    return `<div class="col-funil">
      <div class="col-cab">
        <div class="tit"><h4>${e.nome}</h4><span class="q">${ns.length}</span></div>
        <div class="soma">${brlCurto(soma)}</div>
        <div class="prop"><i style="width:${(soma / totalAberto) * 100}%"></i></div>
      </div>
      ${cards}
      ${ns.length < 3 ? `<div class="col-vazia">Arraste um negócio para cá</div>` : ""}
    </div>`;
  }).join("");

  const cabecalho = V() === "01"
    ? cabPagina("Funil de vendas", `14 negócios abertos · ${brl(totalAberto)} em oportunidades`,
        `<button class="btn btn-contorno">Relatório</button><button class="btn btn-primario">+ Novo negócio</button>`)
    : V() === "02"
      ? cabPagina("Negócios", `<span class="mono">14 abertos · ${brlCurto(totalAberto)} · ticket médio ${brlCurto(945)} · 2 parados</span>`,
          `<button class="btn btn-contorno btn-sm">Agrupar por ▾</button><button class="btn btn-contorno btn-sm">Kanban ▾</button>
           <button class="btn btn-primario btn-sm">+ Novo</button>`)
      : cabPagina("Funil comercial", `14 negócios · ${brl(totalAberto)} em aberto · ticket médio ${brl(945)}`,
          `<button class="btn btn-contorno">Motivos de perda</button><button class="btn btn-primario">+ Novo negócio</button>`);

  return `${cabecalho}<div class="funil">${colunas}</div>
    ${V() === "03" ? `<p style="margin-top:.875rem;font-size:var(--fs-xs);color:var(--txt-muted)">
      A cor do tempo na etapa é relativa à média daquela etapa — âmbar acima da média, terracota acima do dobro.
      Dois negócios estão parados: Sérgio Bastos (31 d) e Diego Ferraz (16 d).</p>` : ""}`;
}

/* ═══════════════════ TELA: mensagens ═══════════════════ */
function telaMensagens() {
  const listaV01 = CONVERSAS.map((c) => `
    <div class="item-lista" style="align-items:flex-start">
      ${avatar(c.pessoa)}
      <div style="min-width:0;flex:1"><b style="font-size:var(--fs-sm)">${c.pessoa}</b>
        <div style="font-size:var(--fs-xs);color:var(--txt-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.previa}</div></div>
      <span style="font-size:var(--fs-xs);color:var(--txt-muted)">${c.horas ? `há ${Math.round((24 - c.horas) )} h` : "há 4 dias"}</span>
    </div>`).join("");

  const listaJanela = CONVERSAS.map((c) => {
    const badge = c.horas === 0 ? `<span class="badge badge-neutro">fechada</span>`
      : c.horas > 6 ? `<span class="badge badge-ok">${c.horas} h</span>`
      : `<span class="badge badge-aviso">${c.horas} h</span>`;
    return `<div class="conv">
      ${c.naoLida ? `<span class="nao-lida"></span>` : `<span style="width:.4375rem;flex:none"></span>`}
      ${avatar(c.pessoa)}
      <div class="txt"><div class="nm">${c.pessoa}
        ${c.ia ? `<span class="badge badge-azul">IA respondendo</span>` : ""}</div>
        <div class="pv">${c.previa}</div></div>
      <div style="flex:none;text-align:right">${badge}</div>
    </div>`;
  }).join("");

  const bolhas = `
    <div style="display:grid;gap:.5rem;padding:.875rem">
      <div style="justify-self:start;max-width:70%;background:var(--content);border-radius:8px 8px 8px 2px;padding:.5rem .625rem;font-size:var(--fs-sm)">
        Bom dia! Gostaria de remarcar minha sessão de quinta.
        <div class="mono" style="font-size:var(--fs-eyebrow);color:var(--txt-muted);margin-top:.25rem">09:40</div></div>
      <div style="justify-self:end;max-width:70%;background:var(--azul-tint);border-radius:8px 8px 2px 8px;padding:.5rem .625rem;font-size:var(--fs-sm)">
        Claro, Ana! Tenho quinta às 16h ou sexta às 10h. Qual prefere?
        <div class="mono" style="font-size:var(--fs-eyebrow);color:var(--azul-txt);margin-top:.25rem">14:02 · Helena</div></div>
    </div>`;

  if (V() === "01") {
    return `
      ${cabPagina("Mensagens", "Conversas de WhatsApp da clínica",
        `<button class="btn btn-contorno">Configurar canal</button><button class="btn btn-primario">+ Nova conversa</button>`)}
      <div style="display:grid;grid-template-columns:20rem 1fr;gap:var(--gap);height:32rem">
        <section class="card" style="overflow:auto">
          <div class="card-cab"><h4>Conversas</h4><span class="aparte">5</span></div>${listaV01}</section>
        <section class="card" style="display:grid;grid-template-rows:auto 1fr auto">
          <div class="card-cab">${avatar("Ana Beatriz Moreira")}<h4>Ana Beatriz Moreira</h4></div>
          <div style="overflow:auto">${bolhas}</div>
          <div style="padding:.75rem;border-top:1px solid var(--borda)" class="linha">
            <input class="campo" style="flex:1" placeholder="Escreva uma mensagem…">
            <button class="btn btn-primario">Enviar</button></div>
        </section>
      </div>`;
  }

  if (V() === "02") {
    return `
      ${cabPagina("Caixa de entrada", `<span class="mono">3 não lidas · 2 sem resposta há &gt; 2 h</span>`,
        `<button class="btn btn-contorno btn-sm">Regras</button><button class="btn btn-primario btn-sm">+ Conversa</button>`)}
      <div class="linha" style="margin-bottom:.625rem;gap:.375rem">
        <span class="chip"><span class="val">Não lidas</span> ✕</span>
        <span class="chip add">+ Filtro</span>
        <span class="mono" style="margin-left:auto;font-size:var(--fs-xs);color:var(--txt-muted)">
          <kbd>E</kbd> arquivar · <kbd>R</kbd> responder · <kbd>A</kbd> atribuir</span>
      </div>
      <div style="display:grid;grid-template-columns:19rem 1fr 15rem;gap:0;height:30rem;border:1px solid var(--borda);border-radius:var(--r);overflow:hidden;background:var(--card)">
        <section style="border-right:1px solid var(--borda);overflow:auto">${listaJanela}</section>
        <section style="display:grid;grid-template-rows:auto 1fr auto;border-right:1px solid var(--borda)">
          <div class="card-cab">${avatar("Ana Beatriz Moreira")}<h4>Ana Beatriz Moreira</h4>
            <span class="badge badge-ok" style="margin-left:auto">janela 18 h</span></div>
          <div style="overflow:auto">${bolhas}</div>
          <div style="padding:.625rem;border-top:1px solid var(--borda)" class="linha">
            <input class="campo" style="flex:1" placeholder="Responder…  ⌘⏎ envia">
            <button class="btn btn-primario btn-sm">Enviar</button></div>
        </section>
        <aside style="overflow:auto;padding:.75rem;background:var(--content)">
          <div class="eyebrow" style="margin-bottom:.5rem">Contexto</div>
          ${[["Vínculo", "Cliente"], ["Pacote", "3 de 10"], ["Próximo", "qui 20/08 14h"],
             ["Receita", "R$ 1.620,00"], ["Profissional", "Tiago Rocha"]].map(([k, v]) => `
            <div style="margin-bottom:.5rem"><div class="eyebrow">${k}</div>
              <div style="font-size:var(--fs-xs)">${v}</div></div>`).join("")}
        </aside>
      </div>`;
  }

  // V03 — a janela de 24 h organiza a tela; fora dela, o compositor muda de natureza.
  return `
    ${cabPagina("Mensagens", "5 conversas · 3 não lidas · canal oficial da Meta conectado",
      `<button class="btn btn-contorno">Templates</button><button class="btn btn-primario">+ Nova conversa</button>`)}
    <div class="linha" style="margin-bottom:.75rem">
      <button class="btn btn-sm" aria-pressed="true">Não lidas · 3</button>
      <button class="btn btn-contorno btn-sm">Minhas</button>
      <button class="btn btn-contorno btn-sm">Sem resposta · 2</button>
      <button class="btn btn-contorno btn-sm">Janela aberta · 3</button>
    </div>
    <div style="display:grid;grid-template-columns:21rem 1fr 16rem;gap:var(--gap);height:30rem">
      <section class="card" style="overflow:auto">
        <div class="card-cab"><h4>Conversas</h4><span class="aparte">janela de 24 h</span></div>
        ${listaJanela}</section>
      <section class="card" style="display:grid;grid-template-rows:auto 1fr auto">
        <div class="card-cab">${avatar("Daniela Vasques")}<h4>Daniela Vasques</h4>
          <span class="badge badge-neutro" style="margin-left:auto">janela fechada há 3 d</span></div>
        <div style="overflow:auto">
          <div style="display:grid;gap:.5rem;padding:.875rem">
            <div style="justify-self:start;max-width:70%;background:var(--content);border-radius:8px 8px 8px 2px;padding:.5rem .625rem;font-size:var(--fs-sm)">
              Vou confirmar com meu marido e retorno.
              <div class="mono" style="font-size:var(--fs-eyebrow);color:var(--txt-muted);margin-top:.25rem">15 ago · 17:20</div></div>
          </div>
        </div>
        <div style="padding:.75rem;border-top:1px solid var(--borda)">
          <div style="display:flex;gap:.625rem;align-items:flex-start;background:var(--aviso-tint);
                      border:1px solid color-mix(in srgb, var(--aviso) 45%, transparent);
                      border-radius:6px;padding:.625rem .75rem;font-size:var(--fs-sm);color:var(--aviso-txt)">
            <span aria-hidden="true">⏱</span>
            <div><b>A janela de 24 h fechou.</b> Só é possível enviar um template aprovado pela Meta.
              <div class="linha" style="margin-top:.5rem">
                <button class="btn btn-contorno btn-sm">Escolher template ▾</button>
                <span style="font-size:var(--fs-xs)">3 aprovados disponíveis</span></div></div>
          </div>
        </div>
      </section>
      <aside class="card" style="overflow:auto">
        <div class="card-cab"><h4>Contexto</h4></div>
        <div class="card-pad" style="display:grid;gap:.625rem">
          ${[["Vínculo", "Cliente"], ["Último atendimento", "12 de agosto"],
             ["Próximo", "não agendado"], ["Pacote", "encerrado"]].map(([k, v]) => `
            <div><div class="eyebrow">${k}</div><div style="font-size:var(--fs-sm)">${v}</div></div>`).join("")}
          <button class="btn btn-primario btn-sm" style="margin-top:.25rem">Agendar retorno</button>
        </div>
      </aside>
    </div>`;
}

/* ═══════════════════ paleta de comandos (assinatura da V02) ═══════════════════ */
function paletaComandos() {
  return `
    <div class="paleta-veu">
      <div class="paleta">
        <div class="p-busca"><span aria-hidden="true" style="color:var(--txt-muted)">⌕</span>
          <span>karina</span><span style="color:var(--txt-place)">|</span>
          <kbd style="margin-left:auto">esc</kbd></div>
        <div class="p-grupo eyebrow">Pessoas</div>
        <div class="p-item foco">${avatar("Karina Duarte")}
          <span>Karina Duarte <span style="color:var(--txt-faint)">· (11) 95120-4488</span></span>
          <span class="tipo">Cliente</span></div>
        <div class="p-grupo eyebrow">Atendimentos</div>
        <div class="p-item"><span class="pt" style="color:var(--serie-1)"></span>
          <span>Karina Duarte · Drenagem linfática <span style="color:var(--txt-faint)">· ter 18/08 10h</span></span>
          <span class="tipo">Agenda</span></div>
        <div class="p-item"><span class="pt" style="color:var(--serie-3)"></span>
          <span>Karina Duarte · Peeling de diamante <span style="color:var(--txt-faint)">· ter 18/08 15h</span></span>
          <span class="tipo">Agenda</span></div>
        <div class="p-grupo eyebrow">Ações</div>
        <div class="p-item"><span aria-hidden="true">+</span>Novo atendimento para Karina Duarte
          <span class="tipo">⌘⇧A</span></div>
      </div>
    </div>`;
}

/* ═══════════════════ montagem ═══════════════════ */
const RENDER = {
  inicio: telaInicio, pessoas: telaPessoas, ficha: telaFicha,
  agenda: telaAgenda, funil: telaFunil, mensagens: telaMensagens,
};

export function pintar(tela = "inicio", extra = null) {
  raiz.dataset.tela = tela;
  pintarLateral(tela === "ficha" ? "pessoas" : tela);
  pintarTopo(tela);
  el("#conteudo").innerHTML = `<div class="tela ativa">${RENDER[tela]()}</div>`
    + (extra === "paleta" ? paletaComandos() : "");
  el("#conteudo").scrollTop = 0;
}

export function ligarInteracao() {
  document.addEventListener("click", (e) => {
    const ir = e.target.closest("[data-ir]");
    if (ir) { pintar(ir.dataset.ir); return; }
    const v = e.target.closest("[data-versao]");
    if (v) {
      raiz.dataset.v = v.dataset.versao;
      document.querySelectorAll("[data-versao]").forEach((b) =>
        b.setAttribute("aria-pressed", String(b === v)));
      pintar(raiz.dataset.tela || "inicio");
    }
    const t = e.target.closest("[data-tela]");
    if (t) {
      document.querySelectorAll("[data-tela]").forEach((b) =>
        b.setAttribute("aria-pressed", String(b === t)));
      pintar(t.dataset.tela);
    }
  });
}
