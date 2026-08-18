/* @ds-bundle: {"format":4,"namespace":"AlmaPuraDesignSystem_756237","components":[],"sourceHashes":{"ui_kits/aurora/App.jsx":"e005ab144ea8","ui_kits/aurora/Conversation.jsx":"8825bb0d86cf","ui_kits/aurora/LeadList.jsx":"54f89af6b7d9","ui_kits/aurora/Sidebar.jsx":"100d7175eb6c","ui_kits/aurora/Suggestion.jsx":"ea94a82413a5","ui_kits/aurora/Topbar.jsx":"ad3f120f2adc","ui_kits/landing/App.jsx":"9e0285245ddb","ui_kits/landing/Bio.jsx":"53bfd6bf4d6b","ui_kits/landing/CTA.jsx":"f6a8cb75cdbd","ui_kits/landing/Footer.jsx":"9b2f23938fc1","ui_kits/landing/Hero.jsx":"cd129830e3ee","ui_kits/landing/Method.jsx":"7d485e96bac8","ui_kits/landing/Nav.jsx":"cae7a34fe132","ui_kits/landing/Pain.jsx":"9d9536ff32c8","ui_kits/landing/Quiz.jsx":"602543fd4d85","ui_kits/landing/primitives.jsx":"c40fd029ca54"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.AlmaPuraDesignSystem_756237 = window.AlmaPuraDesignSystem_756237 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// ui_kits/aurora/App.jsx
try { (() => {
function App() {
  const [activeLead, setActiveLead] = useState(1);
  return /*#__PURE__*/React.createElement("div", {
    className: "au-shell",
    "data-screen-label": "AURORA Dashboard"
  }, /*#__PURE__*/React.createElement(Sidebar, {
    active: "inbox"
  }), /*#__PURE__*/React.createElement("main", null, /*#__PURE__*/React.createElement(Topbar, null), /*#__PURE__*/React.createElement("div", {
    className: "au-body"
  }, /*#__PURE__*/React.createElement(KpiRow, null), /*#__PURE__*/React.createElement("div", {
    className: "au-grid"
  }, /*#__PURE__*/React.createElement(LeadList, {
    activeId: activeLead,
    onSelect: setActiveLead
  }), /*#__PURE__*/React.createElement(Conversation, null), /*#__PURE__*/React.createElement(Suggestion, null)))));
}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/aurora/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/aurora/Conversation.jsx
try { (() => {
function Conversation() {
  // Single canonical lead transcript for Ana C.
  const msgs = [{
    side: 'lead',
    text: 'Oi, vi o anúncio sobre terapia integrativa. Tenho me sentido sem energia há meses, mesmo dormindo bem. Funciono no trabalho mas chego em casa e desmorono. Como funciona?',
    meta: 'Ana C. · 14:02 · WhatsApp'
  }, {
    side: 'aurora',
    text: 'Oi, Ana. Que bom que escreveu. Antes de qualquer coisa: o que você descreveu — funcionar por fora e desmoronar por dentro — tem nome. E tem método. Posso te perguntar há quanto tempo isso vem assim?',
    meta: 'AURORA · 14:03'
  }, {
    side: 'lead',
    text: 'Uns 6 meses. Piorou depois que mudei de cargo. Já fiz terapia tradicional mas a sensação é que não evoluiu.',
    meta: 'Ana C. · 14:05'
  }, {
    side: 'aurora',
    text: 'Entendi. O Método Alma Pura trabalha em três etapas — começa nomeando o padrão (Observação Samsara), depois integra emoção e razão, depois ensina o ciclo de impermanência. Tudo em prazo definido, não conversa sem fim. Quer fazer uma avaliação inicial gratuita?',
    meta: 'AURORA · 14:06'
  }, {
    side: 'lead',
    text: 'Quero sim. Tenho disponibilidade quarta de manhã.',
    meta: 'Ana C. · agora'
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "au-panel au-conv"
  }, /*#__PURE__*/React.createElement("div", {
    className: "au-panel-head"
  }, /*#__PURE__*/React.createElement("h3", null, "Ana C. \xB7 conversa ativa"), /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, "P1 \xB7 Mulher Funcional")), /*#__PURE__*/React.createElement("div", {
    className: "au-msgs"
  }, msgs.map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: `au-msg ${m.side}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "bubble"
  }, m.text), /*#__PURE__*/React.createElement("div", {
    className: "meta"
  }, m.meta)))), /*#__PURE__*/React.createElement("div", {
    className: "au-composer"
  }, /*#__PURE__*/React.createElement("input", {
    placeholder: "Responder como Maxwell \u2014 AURORA sugere abaixo \u2192"
  }), /*#__PURE__*/React.createElement("button", {
    className: "send"
  }, "Enviar")));
}
window.Conversation = Conversation;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/aurora/Conversation.jsx", error: String((e && e.message) || e) }); }

// ui_kits/aurora/LeadList.jsx
try { (() => {
const LEADS = [{
  id: 1,
  initials: 'AC',
  name: 'Ana C.',
  preview: 'Tenho me sentido sem energia há meses. Vi o anúncio…',
  meta: 'agora',
  tag: 'p1',
  tagTone: 'seal',
  active: true
}, {
  id: 2,
  initials: 'RB',
  name: 'Rodrigo B.',
  preview: 'Não consigo dormir, mente não para. Indicação?',
  meta: '12 min',
  tag: 'p2',
  tagTone: 'blue'
}, {
  id: 3,
  initials: 'MS',
  name: 'Maria S.',
  preview: 'Já fiz terapia mas não evoluiu. Como funciona o método?',
  meta: '34 min',
  tag: 'p1',
  tagTone: 'seal'
}, {
  id: 4,
  initials: 'JF',
  name: 'Joana F.',
  preview: 'Quero saber sobre o pacote de 4 sessões.',
  meta: '1h',
  tag: 'lead-quente',
  tagTone: 'gold'
}, {
  id: 5,
  initials: 'LC',
  name: 'Lucas C.',
  preview: 'Tenho 26 anos e me sinto travado em tudo.',
  meta: '2h',
  tag: 'p3',
  tagTone: 'sage'
}, {
  id: 6,
  initials: 'PT',
  name: 'Patrícia T.',
  preview: 'Crise de pânico ontem. Preciso de avaliação urgente.',
  meta: '4h',
  tag: 'urgente',
  tagTone: 'gold'
}, {
  id: 7,
  initials: 'DS',
  name: 'Daniela S.',
  preview: 'Falei com vocês mês passado. Quero retomar.',
  meta: 'ontem',
  tag: 'retorno',
  tagTone: 'sage'
}];
function LeadList({
  activeId,
  onSelect
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "au-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "au-panel-head"
  }, /*#__PURE__*/React.createElement("h3", null, "Leads \xB7 n\xE3o atribu\xEDdos"), /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, "12 ativos")), /*#__PURE__*/React.createElement("div", {
    className: "au-leads"
  }, LEADS.map(l => /*#__PURE__*/React.createElement("div", {
    key: l.id,
    className: `au-lead${activeId === l.id ? ' active' : ''}`,
    onClick: () => onSelect(l.id)
  }, /*#__PURE__*/React.createElement("div", {
    className: "dot"
  }, l.initials), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, l.name), /*#__PURE__*/React.createElement("div", {
    className: "preview"
  }, l.preview), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: `badge badge-${l.tagTone}`,
    style: {
      fontSize: '0.56rem',
      padding: '2px 8px',
      letterSpacing: '0.14em'
    }
  }, l.tag))), /*#__PURE__*/React.createElement("div", {
    className: "meta"
  }, l.meta)))));
}
window.LeadList = LeadList;
window.LEADS = LEADS;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/aurora/LeadList.jsx", error: String((e && e.message) || e) }); }

// ui_kits/aurora/Sidebar.jsx
try { (() => {
const {
  useState
} = React;

/* Tiny mark used as the dashboard's brand glyph */
function MarkGlyph() {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 200 220",
    className: "mark"
  }, /*#__PURE__*/React.createElement("g", {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.4",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "100",
    cy: "100",
    r: "3.5",
    fill: "currentColor",
    opacity: "0.9"
  }), Array.from({
    length: 12
  }).map((_, i) => {
    const angle = i / 12 * 2 * Math.PI;
    const x = 100 + Math.cos(angle) * 70;
    const y = 100 + Math.sin(angle) * 70;
    const tx = 100 + Math.cos(angle) * 80;
    const ty = 100 + Math.sin(angle) * 80;
    return /*#__PURE__*/React.createElement("g", {
      key: i
    }, /*#__PURE__*/React.createElement("line", {
      x1: "100",
      y1: "100",
      x2: x,
      y2: y
    }), /*#__PURE__*/React.createElement("ellipse", {
      cx: tx,
      cy: ty,
      rx: "6",
      ry: "9",
      transform: `rotate(${angle * 180 / Math.PI + 90} ${tx} ${ty})`
    }));
  })));
}
function Sidebar({
  active = 'inbox'
}) {
  const sections = [{
    key: 'inbox',
    label: 'Caixa de entrada',
    count: 12
  }, {
    key: 'pipeline',
    label: 'Pipeline',
    count: 28
  }, {
    key: 'agenda',
    label: 'Agenda',
    count: 4
  }, {
    key: 'pacientes',
    label: 'Pacientes',
    count: 47
  }];
  const utility = [{
    key: 'protocolos',
    label: 'Protocolos'
  }, {
    key: 'tags',
    label: 'Tags & segmentos'
  }, {
    key: 'settings',
    label: 'Configurações'
  }];
  return /*#__PURE__*/React.createElement("aside", {
    className: "au-side"
  }, /*#__PURE__*/React.createElement("div", {
    className: "au-side-brand"
  }, /*#__PURE__*/React.createElement(MarkGlyph, null), /*#__PURE__*/React.createElement("span", {
    className: "wm"
  }, "AURORA"), /*#__PURE__*/React.createElement("span", {
    className: "pill"
  }, "beta")), /*#__PURE__*/React.createElement("div", {
    className: "au-section-label"
  }, "Opera\xE7\xE3o"), /*#__PURE__*/React.createElement("nav", {
    className: "au-nav"
  }, sections.map(s => /*#__PURE__*/React.createElement("a", {
    href: "#",
    key: s.key,
    className: s.key === active ? 'active' : '',
    onClick: e => e.preventDefault()
  }, /*#__PURE__*/React.createElement("span", null, s.label), /*#__PURE__*/React.createElement("span", {
    className: "badge-mini"
  }, s.count)))), /*#__PURE__*/React.createElement("div", {
    className: "au-section-label",
    style: {
      marginTop: 'var(--sp-4)'
    }
  }, "Sistema"), /*#__PURE__*/React.createElement("nav", {
    className: "au-nav"
  }, utility.map(s => /*#__PURE__*/React.createElement("a", {
    href: "#",
    key: s.key,
    onClick: e => e.preventDefault()
  }, s.label))), /*#__PURE__*/React.createElement("div", {
    className: "au-side-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "avatar"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/terapeuta_05.png",
    alt: ""
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "who"
  }, "Maxwell Ribeiro"), /*#__PURE__*/React.createElement("div", {
    className: "role"
  }, "Operador \xB7 Instituto"))));
}
window.Sidebar = Sidebar;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/aurora/Sidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/aurora/Suggestion.jsx
try { (() => {
function Suggestion() {
  return /*#__PURE__*/React.createElement("div", {
    className: "au-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "au-panel-head"
  }, /*#__PURE__*/React.createElement("h3", null, "Sugest\xE3o AURORA"), /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, "confian\xE7a 92%")), /*#__PURE__*/React.createElement("div", {
    className: "au-sugg-body"
  }, /*#__PURE__*/React.createElement("span", {
    className: "au-sugg-pill"
  }, "\u2605 A\xE7\xE3o proposta"), /*#__PURE__*/React.createElement("h4", null, "Agendar avalia\xE7\xE3o inicial \xB7 quarta-feira manh\xE3"), /*#__PURE__*/React.createElement("p", null, "A lead expressou disponibilidade. Perfil P1 (Mulher Funcional) com indicadores de burnout silenciado e hist\xF3rico de terapia anterior insatisfat\xF3ria. Protocolo indicado: ", /*#__PURE__*/React.createElement("strong", null, "4 sess\xF5es integrativas"), "."), /*#__PURE__*/React.createElement("div", {
    className: "au-time"
  }, /*#__PURE__*/React.createElement("div", {
    className: "when"
  }, "Quarta \xB7 21 maio \xB7 09:00"), "Avalia\xE7\xE3o inicial (60 min) \u2014 Google Meet \xB7 09:00\u201310:00"), /*#__PURE__*/React.createElement("div", {
    className: "au-sugg-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, "Confirmar agendamento"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Editar mensagem")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--sp-4)',
      paddingTop: 'var(--sp-4)',
      borderTop: '1px dashed rgba(46,55,51,0.12)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "au-kpi-label",
    style: {
      marginBottom: 8
    }
  }, "Tags atribu\xEDdas"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "badge badge-seal",
    style: {
      fontSize: '0.58rem'
    }
  }, "P1"), /*#__PURE__*/React.createElement("span", {
    className: "badge badge-blue",
    style: {
      fontSize: '0.58rem'
    }
  }, "burnout"), /*#__PURE__*/React.createElement("span", {
    className: "badge badge-sage",
    style: {
      fontSize: '0.58rem'
    }
  }, "retorno-terapia"), /*#__PURE__*/React.createElement("span", {
    className: "badge badge-gold",
    style: {
      fontSize: '0.58rem'
    }
  }, "quente")))));
}
window.Suggestion = Suggestion;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/aurora/Suggestion.jsx", error: String((e && e.message) || e) }); }

// ui_kits/aurora/Topbar.jsx
try { (() => {
function Topbar() {
  return /*#__PURE__*/React.createElement("div", {
    className: "au-top"
  }, /*#__PURE__*/React.createElement("h1", null, "Caixa de entrada"), /*#__PURE__*/React.createElement("span", {
    className: "sub"
  }, "\xB7 12 leads ativos \xB7 3 aguardando a\xE7\xE3o"), /*#__PURE__*/React.createElement("div", {
    className: "au-search"
  }, /*#__PURE__*/React.createElement("span", {
    className: "icon"
  }, "\u2315"), /*#__PURE__*/React.createElement("input", {
    placeholder: "Buscar lead, n\xFAmero, tag..."
  })));
}
function KpiRow() {
  const kpis = [{
    label: 'Leads esta semana',
    value: '47',
    delta: '+12% vs. semana passada',
    dir: 'up'
  }, {
    label: 'Qualificados (AURORA)',
    value: '23',
    delta: '49% conversão',
    dir: 'up'
  }, {
    label: 'Agendamentos',
    value: '11',
    delta: '+3 esta semana',
    dir: 'up'
  }, {
    label: 'Tempo médio resposta',
    value: '4 min',
    delta: '−1 min',
    dir: 'up'
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "au-kpi"
  }, kpis.map(k => /*#__PURE__*/React.createElement("div", {
    className: "au-kpi-card",
    key: k.label
  }, /*#__PURE__*/React.createElement("div", {
    className: "au-kpi-label"
  }, k.label), /*#__PURE__*/React.createElement("div", {
    className: "au-kpi-value"
  }, k.value), /*#__PURE__*/React.createElement("div", {
    className: `au-kpi-delta ${k.dir === 'down' ? 'down' : ''}`
  }, k.delta))));
}
Object.assign(window, {
  Topbar,
  KpiRow
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/aurora/Topbar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/landing/App.jsx
try { (() => {
function App() {
  const [view, setView] = useState('landing');
  const goQuiz = () => {
    setView('quiz');
    window.scrollTo(0, 0);
  };
  const goHome = () => {
    setView('landing');
    window.scrollTo(0, 0);
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(DandelionDefs, null), view === 'landing' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Nav, {
    onGoQuiz: goQuiz,
    onGoHome: goHome
  }), /*#__PURE__*/React.createElement("main", null, /*#__PURE__*/React.createElement(Hero, {
    onGoQuiz: goQuiz
  }), /*#__PURE__*/React.createElement(Pain, null), /*#__PURE__*/React.createElement(Method, null), /*#__PURE__*/React.createElement(Bio, null), /*#__PURE__*/React.createElement(CTA, {
    onGoQuiz: goQuiz
  })), /*#__PURE__*/React.createElement(Footer, null)) : /*#__PURE__*/React.createElement(Quiz, {
    onExit: goHome
  }));
}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/landing/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/landing/Bio.jsx
try { (() => {
function Bio() {
  return /*#__PURE__*/React.createElement("section", {
    className: "lp-section bleed-meadow",
    id: "sobre"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--ff-display)',
      fontSize: '0.78rem',
      letterSpacing: '0.32em',
      color: 'var(--accent)',
      marginBottom: 'var(--sp-3)'
    }
  }, "03 \u2014 FUNDADOR"), /*#__PURE__*/React.createElement("h2", {
    style: {
      marginBottom: 'var(--sp-6)',
      maxWidth: '24ch'
    }
  }, "Quem est\xE1 do ", /*#__PURE__*/React.createElement("em", null, "outro lado da tela"), "."), /*#__PURE__*/React.createElement("div", {
    className: "lp-bio"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lp-bio-portrait"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/terapeuta_05.png",
    alt: "Maxwell Ribeiro"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Eyebrow, {
    color: "var(--ap-gold-700)"
  }, "Maxwell Ribeiro"), /*#__PURE__*/React.createElement("h3", {
    style: {
      marginTop: 'var(--sp-2)',
      marginBottom: 'var(--sp-4)'
    }
  }, "Int\xE9rprete da Consci\xEAncia Humana"), /*#__PURE__*/React.createElement("p", {
    className: "body",
    style: {
      marginBottom: 'var(--sp-4)'
    }
  }, "Bi\xF3logo e mestre em ci\xEAncias, professor universit\xE1rio de neurofisiologia, embriologia e metodologia cient\xEDfica desde 2015. Forma\xE7\xE3o cl\xEDnica em hipnose, regress\xE3o, TISE, constela\xE7\xE3o familiar, MTC, psicodrama, chakraterapia e neuroci\xEAncia cognitiva aplicada."), /*#__PURE__*/React.createElement("p", {
    className: "body",
    style: {
      color: 'var(--fg-muted)',
      marginBottom: 'var(--sp-5)'
    }
  }, "30 anos estudando religi\xF5es comparadas, 8 anos de pr\xE1tica budista e tao\xEDsta. N\xE3o \xE9 coach. N\xE3o \xE9 guru. \xC9 o que falta no mercado: ", /*#__PURE__*/React.createElement("em", {
    style: {
      fontFamily: 'var(--ff-italic)',
      fontStyle: 'italic',
      color: 'var(--seal)'
    }
  }, "ci\xEAncia com alma, profundidade sem fanatismo, m\xE9todo sem frieza"), "."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Chip, null, "Mestre em Ci\xEAncias"), /*#__PURE__*/React.createElement(Chip, null, "Professor universit\xE1rio \xB7 desde 2015"), /*#__PURE__*/React.createElement(Chip, null, "Brasil \xB7 Portugal \xB7 Online"))))));
}
window.Bio = Bio;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/landing/Bio.jsx", error: String((e && e.message) || e) }); }

// ui_kits/landing/CTA.jsx
try { (() => {
function CTA({
  onGoQuiz
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "lp-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lp-cta-hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lp-cta-hero-bg"
  }), /*#__PURE__*/React.createElement(Eyebrow, {
    color: "var(--ap-gold-300)"
  }, "Pr\xF3ximo passo"), /*#__PURE__*/React.createElement("h2", {
    style: {
      marginTop: 'var(--sp-3)'
    }
  }, "5 minutos. 5 perguntas.", /*#__PURE__*/React.createElement("br", null), "Um espelho honesto."), /*#__PURE__*/React.createElement("p", null, "O quiz de avalia\xE7\xE3o \xE9 gratuito, sem julgamento e sem diagn\xF3stico \u2014 apenas um convite para nomear o que est\xE1 acontecendo agora. Ao final, voc\xEA recebe uma indica\xE7\xE3o de protocolo e a op\xE7\xE3o de agendar uma conversa."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--sp-6)',
      display: 'flex',
      gap: 12,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "gold",
    onClick: onGoQuiz
  }, "Fazer quiz \xB7 come\xE7ar"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    style: {
      color: 'var(--ap-paper)',
      borderColor: 'rgba(251,249,243,0.4)'
    }
  }, "Conversar pelo WhatsApp")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--sp-6)',
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "gold"
  }, "100% gratuito"), /*#__PURE__*/React.createElement(Badge, {
    tone: "seal"
  }, "Sem cadastro inicial")))));
}
window.CTA = CTA;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/landing/CTA.jsx", error: String((e && e.message) || e) }); }

// ui_kits/landing/Footer.jsx
try { (() => {
function Footer() {
  return /*#__PURE__*/React.createElement("footer", {
    className: "lp-footer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement(Wordmark, {
    size: "lg"
  }), /*#__PURE__*/React.createElement("div", {
    className: "slogan"
  }, "\"A luz da ci\xEAncia na profundidade da alma.\""), /*#__PURE__*/React.createElement("div", {
    className: "meta"
  }, "Instituto Alma Pura", /*#__PURE__*/React.createElement("span", {
    style: {
      margin: '0 12px'
    }
  }, "\xB7"), "Terapia integrativa online", /*#__PURE__*/React.createElement("span", {
    style: {
      margin: '0 12px'
    }
  }, "\xB7"), "Brasil \xB7 Portugal \xB7 Mundo"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--sp-5)',
      display: 'flex',
      gap: 24,
      justifyContent: 'center',
      fontFamily: 'var(--ff-body)',
      fontSize: '0.7rem',
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: 'var(--fg-whisper)'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      color: 'inherit',
      textDecoration: 'none'
    }
  }, "Termos"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      color: 'inherit',
      textDecoration: 'none'
    }
  }, "Privacidade"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      color: 'inherit',
      textDecoration: 'none'
    }
  }, "Contato"))));
}
window.Footer = Footer;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/landing/Footer.jsx", error: String((e && e.message) || e) }); }

// ui_kits/landing/Hero.jsx
try { (() => {
function Hero({
  onGoQuiz
}) {
  return /*#__PURE__*/React.createElement("header", {
    className: "lp-hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lp-hero-bg"
  }), /*#__PURE__*/React.createElement("div", {
    className: "lp-hero-veil"
  }), /*#__PURE__*/React.createElement("div", {
    className: "wrap lp-hero-content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lp-hero-kicker"
  }, /*#__PURE__*/React.createElement("span", {
    className: "line"
  }), /*#__PURE__*/React.createElement("span", {
    className: "eyebrow",
    style: {
      color: 'var(--ap-gold-700)'
    }
  }, "Instituto Alma Pura \xB7 Terapia Integrativa")), /*#__PURE__*/React.createElement("h1", {
    className: "display"
  }, "Voc\xEA funciona por fora", /*#__PURE__*/React.createElement("br", null), "e ", /*#__PURE__*/React.createElement("em", null, "desmorona"), /*#__PURE__*/React.createElement("br", null), "por dentro."), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 'var(--sp-5)'
    }
  }), /*#__PURE__*/React.createElement("p", {
    className: "lead"
  }, "Ansiedade que n\xE3o passa, exaust\xE3o que f\xE9rias n\xE3o curam, sensa\xE7\xE3o de vazio mesmo com tudo certo. Tem m\xE9todo para isso \u2014 n\xE3o autoajuda, n\xE3o f\xF3rmula. Reorganiza\xE7\xE3o emocional com base cient\xEDfica e filos\xF3fica."), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 'var(--sp-6)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--sp-3)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: onGoQuiz
  }, "Come\xE7ar pelo quiz"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost"
  }, "Conhecer o m\xE9todo")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap',
      marginTop: 'var(--sp-5)'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "seal",
    dot: true
  }, "100% online"), /*#__PURE__*/React.createElement(Badge, {
    tone: "gold"
  }, "Brasil \xB7 Portugal"), /*#__PURE__*/React.createElement(Badge, {
    tone: "sage"
  }, "Base cient\xEDfica"))));
}
window.Hero = Hero;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/landing/Hero.jsx", error: String((e && e.message) || e) }); }

// ui_kits/landing/Method.jsx
try { (() => {
function Method() {
  const steps = [{
    num: '01',
    glyph: 'bud',
    title: 'Observação Samsara',
    sub: 'Nomear o estado presente',
    body: 'Identificamos o padrão de sofrimento que está ativo agora — sem julgamento, sem corrigir. O sofrimento ganha forma e nome, deixa de ser identidade e vira processo.',
    tag: 'Etapa 1',
    tone: 'seal'
  }, {
    num: '02',
    glyph: 'full',
    title: 'Integração Límbico-Cortical',
    sub: 'Sentir antes de pensar',
    body: 'A emoção emerge no sistema límbico antes do córtex organizá-la. A técnica permite sentir plenamente, e só então integrar com a razão — alfabetização emocional real.',
    tag: 'Etapa 2',
    tone: 'gold'
  }, {
    num: '03',
    glyph: 'seed',
    title: 'Wu-Wei · Impermanência',
    sub: 'Deixar fluir, sem resistir',
    body: 'Filosofia taoísta integrada à neurofisiologia. Resistência intensifica, dramatização aprisiona. Observar, sentir e permitir transforma — e a emoção segue seu ciclo natural.',
    tag: 'Etapa 3',
    tone: 'sage'
  }];
  return /*#__PURE__*/React.createElement("section", {
    className: "lp-section bleed-mist",
    id: "metodo"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--ff-display)',
      fontSize: '0.78rem',
      letterSpacing: '0.32em',
      color: 'var(--accent)',
      marginBottom: 'var(--sp-3)'
    }
  }, "02 \u2014 M\xC9TODO"), /*#__PURE__*/React.createElement("h2", {
    style: {
      marginBottom: 'var(--sp-3)',
      maxWidth: '22ch'
    }
  }, "M\xE9todo Alma Pura \u2014 ", /*#__PURE__*/React.createElement("em", null, "tr\xEAs etapas"), " autorais."), /*#__PURE__*/React.createElement("p", {
    className: "lead"
  }, "Ciclo vivo, n\xE3o sequ\xEAncia r\xEDgida. Integra psicologia contemplativa budista, filosofia tao\xEDsta e neurofisiologia emocional."), /*#__PURE__*/React.createElement("div", {
    className: "lp-method-grid"
  }, steps.map((s, i) => /*#__PURE__*/React.createElement(Card, {
    key: i,
    variant: "seal",
    style: {
      paddingTop: 'var(--sp-6)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "lp-step",
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Dandelion, {
    id: s.glyph,
    size: 44,
    color: "var(--seal)"
  }), /*#__PURE__*/React.createElement("span", {
    className: "lp-step-num"
  }, s.num)), /*#__PURE__*/React.createElement("h3", null, s.title), /*#__PURE__*/React.createElement(Eyebrow, {
    color: "var(--ap-gold-700)",
    style: {
      marginBottom: 'var(--sp-3)'
    }
  }, s.sub), /*#__PURE__*/React.createElement("p", {
    className: "body",
    style: {
      fontSize: '0.94rem',
      color: 'var(--fg-muted)',
      flexGrow: 1
    }
  }, s.body), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--sp-4)'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: s.tone
  }, s.tag)))))), /*#__PURE__*/React.createElement("hr", {
    className: "rule rule-gold",
    style: {
      marginTop: 'var(--sp-9)'
    }
  }), /*#__PURE__*/React.createElement("blockquote", {
    className: "quote",
    style: {
      maxWidth: '52ch',
      margin: '0 auto',
      textAlign: 'center',
      marginTop: 'var(--sp-6)'
    }
  }, "\"Sofrimento n\xE3o \xE9 fraqueza. \xC9 desorganiza\xE7\xE3o \u2014 e desorganiza\xE7\xE3o pode ser compreendida e transformada.\""), /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      textAlign: 'center',
      marginTop: 'var(--sp-4)',
      color: 'var(--ap-gold-700)'
    }
  }, "\u2014 Maxwell Ribeiro, fundador")));
}
window.Method = Method;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/landing/Method.jsx", error: String((e && e.message) || e) }); }

// ui_kits/landing/Nav.jsx
try { (() => {
function Nav({
  onGoQuiz,
  onGoHome
}) {
  return /*#__PURE__*/React.createElement("nav", {
    className: "nav"
  }, /*#__PURE__*/React.createElement("div", {
    className: "nav-inner"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onGoHome,
    style: {
      background: 'transparent',
      border: 0,
      cursor: 'pointer',
      padding: 0
    }
  }, /*#__PURE__*/React.createElement(Wordmark, null)), /*#__PURE__*/React.createElement("div", {
    className: "nav-links"
  }, /*#__PURE__*/React.createElement("a", {
    href: "#metodo"
  }, "M\xE9todo"), /*#__PURE__*/React.createElement("a", {
    href: "#sobre"
  }, "Sobre Maxwell"), /*#__PURE__*/React.createElement("a", {
    href: "#tecnicas"
  }, "T\xE9cnicas"), /*#__PURE__*/React.createElement("a", {
    href: "#blog"
  }, "Blog"), /*#__PURE__*/React.createElement("a", {
    href: "#quiz",
    onClick: e => {
      e.preventDefault();
      onGoQuiz();
    },
    style: {
      color: 'var(--seal)'
    }
  }, "Fazer quiz"))));
}
window.Nav = Nav;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/landing/Nav.jsx", error: String((e && e.message) || e) }); }

// ui_kits/landing/Pain.jsx
try { (() => {
function Pain() {
  const items = [{
    h: 'Acorda cansada',
    p: 'O alarme dispara e o peso já está lá. A noite não restaura. O corpo sabe o que a mente ainda não conseguiu nomear.'
  }, {
    h: 'Sorri nas reuniões',
    p: 'Por fora, está tudo certo. Por dentro, algo está se desorganizando há tempos — e ninguém ao redor parece notar.'
  }, {
    h: 'Já tentou de tudo',
    p: 'Meditação, autoajuda, conversa com amigas, talvez uma terapia que não evoluiu. Cansou de tentar — quer método com prazo.'
  }];
  return /*#__PURE__*/React.createElement("section", {
    className: "lp-section bleed-paper"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sec-num",
    style: {
      fontFamily: 'var(--ff-display)',
      fontSize: '0.78rem',
      letterSpacing: '0.32em',
      color: 'var(--accent)',
      marginBottom: 'var(--sp-3)'
    }
  }, "01 \u2014 ESPELHO"), /*#__PURE__*/React.createElement("h2", {
    style: {
      maxWidth: '20ch',
      marginBottom: 'var(--sp-3)'
    }
  }, "Voc\xEA reconhece ", /*#__PURE__*/React.createElement("em", null, "algo aqui"), "?"), /*#__PURE__*/React.createElement("p", {
    className: "lead",
    style: {
      marginBottom: 'var(--sp-7)'
    }
  }, "Identificar \xE9 o primeiro passo. Sofrimento n\xE3o \xE9 fraqueza \u2014 \xE9 desorganiza\xE7\xE3o. E desorganiza\xE7\xE3o pode ser compreendida."), /*#__PURE__*/React.createElement("div", {
    className: "lp-pain-grid"
  }, items.map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "lp-pain"
  }, /*#__PURE__*/React.createElement(Eyebrow, {
    color: "var(--seal)"
  }, `0${i + 1}`), /*#__PURE__*/React.createElement("h4", null, it.h), /*#__PURE__*/React.createElement("p", null, it.p))))));
}
window.Pain = Pain;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/landing/Pain.jsx", error: String((e && e.message) || e) }); }

// ui_kits/landing/Quiz.jsx
try { (() => {
const QUIZ_QUESTIONS = [{
  q: 'Como você descreveria seu estado interno nas últimas semanas?',
  options: ['Constantemente acelerada, mesmo em repouso', 'Vazia por dentro, sem energia para nada', 'Presa em conflitos que se repetem', 'Confusa, sem saber o que sinto']
}, {
  q: 'Quando algo difícil acontece, qual sua reação mais frequente?',
  options: ['Travo. Não consigo decidir nem reagir.', 'Exploto. Depois me arrependo.', 'Engulo. Sigo como se nada fosse.', 'Racionalizo até esgotar.']
}, {
  q: 'Como está seu sono nos últimos 30 dias?',
  options: ['Demoro a dormir — a mente não para.', 'Durmo, mas acordo várias vezes.', 'Acordo cansada, como se não tivesse dormido.', 'O sono está bem.']
}, {
  q: 'Você já tentou outras formas de cuidado emocional?',
  options: ['Sim, terapia tradicional — não evoluiu como esperava.', 'Sim, meditação ou autoajuda — não bastou.', 'Sim, várias coisas — quero algo com método.', 'Não, esta seria minha primeira tentativa séria.']
}, {
  q: 'O que você busca agora?',
  options: ['Entender o que está acontecendo comigo.', 'Mudar um padrão que se repete há tempos.', 'Atravessar uma fase específica difícil.', 'Algo profundo, com prazo e método claros.']
}];
function Quiz({
  onExit
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);
  const select = i => {
    const next = {
      ...answers,
      [step]: i
    };
    setAnswers(next);
    // gently advance after a beat
    setTimeout(() => {
      if (step < QUIZ_QUESTIONS.length - 1) {
        setStep(step + 1);
      } else {
        setDone(true);
      }
    }, 280);
  };
  if (done) {
    return /*#__PURE__*/React.createElement("div", {
      className: "lp-quiz-shell"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-quiz"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-result"
    }, /*#__PURE__*/React.createElement(Dandelion, {
      id: "full",
      size: 56,
      color: "var(--seal)",
      style: {
        marginBottom: 12
      }
    }), /*#__PURE__*/React.createElement(Eyebrow, {
      color: "var(--ap-gold-700)"
    }, "Indica\xE7\xE3o preliminar"), /*#__PURE__*/React.createElement("h2", {
      style: {
        marginTop: 'var(--sp-3)'
      }
    }, "Voc\xEA parece estar no ", /*#__PURE__*/React.createElement("em", null, "momento da Observa\xE7\xE3o"), "."), /*#__PURE__*/React.createElement("p", {
      className: "body",
      style: {
        marginBottom: 'var(--sp-5)'
      }
    }, "A primeira etapa do M\xE9todo Alma Pura \xE9 nomear o padr\xE3o que est\xE1 ativo. A partir da\xED, t\xE9cnicas integrativas trabalham na reorganiza\xE7\xE3o emocional com prazo e estrutura definidos \u2014 n\xE3o conversa infinita."), /*#__PURE__*/React.createElement(Card, {
      variant: "meadow",
      style: {
        marginBottom: 'var(--sp-5)'
      }
    }, /*#__PURE__*/React.createElement(Eyebrow, {
      color: "var(--seal)"
    }, "Protocolo sugerido"), /*#__PURE__*/React.createElement("h3", {
      style: {
        marginTop: 8,
        marginBottom: 'var(--sp-3)'
      }
    }, "Pacote de 4 sess\xF5es integrativas"), /*#__PURE__*/React.createElement("p", {
      className: "body",
      style: {
        fontSize: '0.92rem',
        color: 'var(--fg-muted)'
      }
    }, "Processo com come\xE7o, meio e fim. Avalia\xE7\xE3o inicial gratuita, seguida de tr\xEAs encontros de 60 min \u2014 100% online."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        marginTop: 'var(--sp-3)',
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement(Chip, null, "60 min / sess\xE3o"), /*#__PURE__*/React.createElement(Chip, null, "Online \xB7 Zoom"), /*#__PURE__*/React.createElement(Chip, null, "R$ 700 ou \u20AC180"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "primary"
    }, "Agendar avalia\xE7\xE3o inicial"), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost"
    }, "Conversar pelo WhatsApp")), /*#__PURE__*/React.createElement("button", {
      className: "lp-quiz-back",
      onClick: onExit,
      style: {
        marginTop: 'var(--sp-6)'
      }
    }, "\u2190 Voltar ao in\xEDcio"))));
  }
  const q = QUIZ_QUESTIONS[step];
  const progress = (step + 1) / QUIZ_QUESTIONS.length * 100;
  const selected = answers[step];
  return /*#__PURE__*/React.createElement("div", {
    className: "lp-quiz-shell"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lp-quiz"
  }, /*#__PURE__*/React.createElement(Eyebrow, {
    color: "var(--seal)"
  }, "Quiz \xB7 5 perguntas"), /*#__PURE__*/React.createElement("div", {
    className: "quiz-progress",
    style: {
      margin: '12px 0 8px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "quiz-progress-fill",
    style: {
      width: `${progress}%`
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      marginBottom: 'var(--sp-5)'
    }
  }, "Pergunta ", step + 1, " de ", QUIZ_QUESTIONS.length), /*#__PURE__*/React.createElement("h2", null, q.q), /*#__PURE__*/React.createElement("div", {
    className: "stack-2"
  }, q.options.map((o, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: `quiz-option${selected === i ? ' is-selected' : ''}`,
    onClick: () => select(i)
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), /*#__PURE__*/React.createElement("span", null, o)))), /*#__PURE__*/React.createElement("div", {
    className: "lp-quiz-foot"
  }, /*#__PURE__*/React.createElement("button", {
    className: "lp-quiz-back",
    onClick: () => step === 0 ? onExit() : setStep(step - 1)
  }, "\u2190 ", step === 0 ? 'Sair' : 'Voltar'), /*#__PURE__*/React.createElement("div", {
    className: "mono"
  }, step + 1, " / ", QUIZ_QUESTIONS.length))));
}
window.Quiz = Quiz;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/landing/Quiz.jsx", error: String((e && e.message) || e) }); }

// ui_kits/landing/primitives.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Shared primitives for the Alma Pura landing UI kit.
   These mirror the .btn / .badge / .chip / .card classes in components.css,
   but as small React wrappers so JSX stays readable. */

const {
  useState,
  useEffect,
  useRef
} = React;
function Button({
  variant = 'primary',
  children,
  onClick,
  style,
  ...rest
}) {
  const cls = `btn btn-${variant}`;
  return /*#__PURE__*/React.createElement("button", _extends({
    className: cls,
    onClick: onClick,
    style: style
  }, rest), children);
}
function Badge({
  tone = 'seal',
  dot,
  children,
  style
}) {
  const cls = `badge badge-${tone}${dot ? ' badge-dot' : ''}`;
  return /*#__PURE__*/React.createElement("span", {
    className: cls,
    style: style
  }, children);
}
function Chip({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "chip",
    style: style
  }, children);
}
function Card({
  variant,
  children,
  style
}) {
  const cls = variant ? `card card-${variant}` : 'card';
  return /*#__PURE__*/React.createElement("div", {
    className: cls,
    style: style
  }, children);
}
function Eyebrow({
  children,
  color,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      color: color || undefined,
      ...style
    }
  }, children);
}
function Wordmark({
  size = 'md'
}) {
  const fontSize = size === 'lg' ? '1.6rem' : size === 'sm' ? '0.78rem' : '0.92rem';
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--ff-display)',
      fontWeight: 500,
      letterSpacing: '0.24em',
      fontSize,
      color: 'var(--ap-graphite)'
    }
  }, "ALMA ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--accent)',
      margin: '0 8px'
    }
  }, "\xB7"), " PURA");
}

/* Dandelion SVG symbols — inline once at top of page; reference via <use> elsewhere. */
function DandelionDefs() {
  return /*#__PURE__*/React.createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    style: {
      position: 'absolute',
      width: 0,
      height: 0
    },
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("symbol", {
    id: "ap-bud",
    viewBox: "0 0 60 120"
  }, /*#__PURE__*/React.createElement("g", {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "0.8",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M30 30 C 30 60, 29 90, 30 118"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "30",
    cy: "22",
    rx: "8",
    ry: "14"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M30 32 L 23 42 M30 32 L 37 42"
  }))), /*#__PURE__*/React.createElement("symbol", {
    id: "ap-full",
    viewBox: "0 0 200 220"
  }, /*#__PURE__*/React.createElement("g", {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "0.7",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "100",
    cy: "100",
    r: "3.5",
    fill: "currentColor",
    opacity: "0.9"
  }), Array.from({
    length: 20
  }).map((_, i) => {
    const angle = i / 20 * 2 * Math.PI;
    const x = 100 + Math.cos(angle) * 70;
    const y = 100 + Math.sin(angle) * 70;
    const tx = 100 + Math.cos(angle) * 78;
    const ty = 100 + Math.sin(angle) * 78;
    return /*#__PURE__*/React.createElement("g", {
      key: i
    }, /*#__PURE__*/React.createElement("line", {
      x1: "100",
      y1: "100",
      x2: x,
      y2: y
    }), /*#__PURE__*/React.createElement("ellipse", {
      cx: tx,
      cy: ty,
      rx: "4",
      ry: "7",
      transform: `rotate(${angle * 180 / Math.PI + 90} ${tx} ${ty})`
    }));
  }))), /*#__PURE__*/React.createElement("symbol", {
    id: "ap-seed",
    viewBox: "0 0 40 60"
  }, /*#__PURE__*/React.createElement("g", {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "0.7",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "20",
    y1: "28",
    x2: "20",
    y2: "56"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "20",
    y1: "28",
    x2: "20",
    y2: "6"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "20",
    y1: "28",
    x2: "10",
    y2: "8"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "20",
    y1: "28",
    x2: "30",
    y2: "8"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "20",
    y1: "28",
    x2: "4",
    y2: "18"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "20",
    y1: "28",
    x2: "36",
    y2: "18"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "20",
    cy: "28",
    r: "1.5",
    fill: "currentColor"
  })))));
}
function Dandelion({
  id,
  size = 32,
  color,
  style
}) {
  return /*#__PURE__*/React.createElement("svg", {
    style: {
      width: size,
      height: size,
      color: color || 'var(--seal)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("use", {
    href: `#ap-${id}`
  }));
}
Object.assign(window, {
  Button,
  Badge,
  Chip,
  Card,
  Eyebrow,
  Wordmark,
  DandelionDefs,
  Dandelion
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/landing/primitives.jsx", error: String((e && e.message) || e) }); }

})();
