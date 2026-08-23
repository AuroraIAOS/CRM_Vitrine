/**
 * Dados de demonstração compartilhados pelas três versões.
 *
 * Mesmos nomes, serviços e profissionais da conta de demonstração real
 * (`seed/`), para que as capturas destas versões possam ser comparadas
 * lado a lado com `screenshots/` sem que a diferença de dado polua a
 * diferença de desenho. Nenhum dado real de cliente aparece aqui.
 */

export const CONTA = { nome: "Clínica Aurora", plano: "Estética e saúde" };

export const USUARIO = { nome: "Helena Marques", papel: "Proprietária" };

export const PROFISSIONAIS = [
  { id: 0, nome: "Aline Prado",  curto: "Aline",  cor: "var(--serie-1)", especialidade: "Fisioterapia" },
  { id: 1, nome: "Marcos Dias",  curto: "Marcos", cor: "var(--serie-2)", especialidade: "Terapia corporal" },
  { id: 2, nome: "Tiago Rocha",  curto: "Tiago",  cor: "var(--serie-3)", especialidade: "Estética facial" },
];

export const PESSOAS = [
  { nome: "Ana Beatriz Moreira", vinculo: "Cliente", email: "ana@vitrinedemo.local",         tel: "(11) 98812-3344", dias: 1,  tags: ["Pacote ativo"],      prof: 2 },
  { nome: "Bianca Duarte",       vinculo: "Equipe",  email: "recepcao@vitrinedemo.local",    tel: "(11) 97711-2233", dias: 0,  tags: [],                    prof: null },
  { nome: "Camila Nogueira",     vinculo: "Lead",    email: "camila@vitrinedemo.local",      tel: "(11) 96655-4433", dias: 5,  tags: ["Indicação"],         prof: null },
  { nome: "Carlos Eduardo Pinto",vinculo: "Cliente", email: "carlos@vitrinedemo.local",      tel: "(11) 96541-8877", dias: 3,  tags: ["Pacote ativo"],      prof: 0 },
  { nome: "Daniela Vasques",     vinculo: "Cliente", email: "daniela@vitrinedemo.local",     tel: "(11) 95523-1177", dias: 4,  tags: [],                    prof: 1 },
  { nome: "Helena Marques",      vinculo: "Equipe",  email: "proprietaria@vitrinedemo.local",tel: "(11) 99988-7766", dias: 0,  tags: [],                    prof: null },
  { nome: "José Ricardo Alves",  vinculo: "Cliente", email: "jose@vitrinedemo.local",        tel: "(21) 95544-3322", dias: 9,  tags: ["Retorno"],           prof: 2 },
  { nome: "Karina Duarte",       vinculo: "Cliente", email: "karina@vitrinedemo.local",      tel: "(11) 95120-4488", dias: 2,  tags: ["Pacote ativo"],      prof: 0 },
  { nome: "Marina Lopes",        vinculo: "Lead",    email: "marina@vitrinedemo.local",      tel: "(11) 94433-2211", dias: 14, tags: ["Instagram"],         prof: null },
  { nome: "Patrícia Lima",       vinculo: "Lead",    email: "patricia@vitrinedemo.local",    tel: "(11) 94120-9955", dias: 4,  tags: ["Avaliação feita"],   prof: null },
  { nome: "Rafael Souza",        vinculo: "Lead",    email: "rafael@vitrinedemo.local",      tel: "(11) 93322-1100", dias: 28, tags: [],                    prof: null },
  { nome: "Sérgio Bastos",       vinculo: "Lead",    email: "sergio@vitrinedemo.local",      tel: "(11) 93011-7744", dias: 31, tags: [],                    prof: null },
  { nome: "Tiago Rocha",         vinculo: "Equipe",  email: "esteticista@vitrinedemo.local", tel: "(11) 92211-0099", dias: 0,  tags: [],                    prof: null },
  { nome: "Vanessa Corrêa",      vinculo: "Cliente", email: "vanessa@vitrinedemo.local",     tel: "(11) 91188-6655", dias: 6,  tags: ["Pacote ativo"],      prof: 1 },
];

export const hm = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

/** Semana de 17 a 21 de agosto. `dia` 0 = segunda. */
export const COMPROMISSOS = [
  { dia: 0, pessoa: "Daniela Vasques",      servico: "Massagem relaxante",       inicio: hm("09:00"), fim: hm("10:00"), prof: 1, sala: "Sala 2 — Corporal" },
  { dia: 0, pessoa: "Gustavo Amaral",       servico: "Peeling de diamante",      inicio: hm("10:00"), fim: hm("11:00"), prof: 2, sala: "Sala 1 — Facial" },
  { dia: 0, pessoa: "João Marcelo Reis",    servico: "Limpeza de pele profunda", inicio: hm("11:00"), fim: hm("12:00"), prof: 2, sala: "Sala 1 — Facial" },
  { dia: 0, pessoa: "Carlos Eduardo Pinto", servico: "Drenagem linfática",       inicio: hm("14:00"), fim: hm("15:00"), prof: 0, sala: "Sala 3" },
  { dia: 0, pessoa: "Fernanda Quirino",     servico: "Massagem relaxante",       inicio: hm("15:00"), fim: hm("16:00"), prof: 1, sala: "Sala 2 — Corporal" },

  // ── Terça: a colisão que a captura 05_agenda.png mostra quebrada
  { dia: 1, pessoa: "Helena Ribeiro",       servico: "Limpeza de pele profunda", inicio: hm("09:00"), fim: hm("10:00"), prof: 2, sala: "Sala 1 — Facial" },
  { dia: 1, pessoa: "Daniela Vasques",      servico: "Massagem relaxante",       inicio: hm("09:00"), fim: hm("10:00"), prof: 1, sala: "Sala 2 — Corporal" },
  { dia: 1, pessoa: "Karina Duarte",        servico: "Drenagem linfática",       inicio: hm("10:00"), fim: hm("11:00"), prof: 0, sala: "Sala 3" },
  { dia: 1, pessoa: "Eduardo Tavares",      servico: "Peeling de diamante",      inicio: hm("11:00"), fim: hm("12:00"), prof: 2, sala: "Sala 1 — Facial" },
  { dia: 1, pessoa: "Bloqueio",             servico: "Manutenção da Sala 2",     inicio: hm("13:00"), fim: hm("17:00"), prof: 1, sala: "Sala 2 — Corporal", bloqueio: true },
  { dia: 1, pessoa: "Gustavo Amaral",       servico: "Peeling de diamante",      inicio: hm("14:00"), fim: hm("15:00"), prof: 2, sala: "Sala 1 — Facial" },
  { dia: 1, pessoa: "Karina Duarte",        servico: "Peeling de diamante",      inicio: hm("15:00"), fim: hm("16:00"), prof: 0, sala: "Sala 3" },

  { dia: 2, pessoa: "Daniela Vasques",      servico: "Limpeza de pele profunda", inicio: hm("09:00"), fim: hm("10:00"), prof: 2, sala: "Sala 1 — Facial" },
  { dia: 2, pessoa: "Gustavo Amaral",       servico: "Drenagem linfática",       inicio: hm("10:00"), fim: hm("11:00"), prof: 0, sala: "Sala 3" },
  { dia: 2, pessoa: "João Marcelo Reis",    servico: "Limpeza de pele profunda", inicio: hm("11:00"), fim: hm("12:00"), prof: 2, sala: "Sala 1 — Facial" },
  { dia: 2, pessoa: "Ana Beatriz Moreira",  servico: "Massagem relaxante",       inicio: hm("11:00"), fim: hm("12:30"), prof: 1, sala: "Sala 2 — Corporal" },
  { dia: 2, pessoa: "Carlos Eduardo Pinto", servico: "Peeling de diamante",      inicio: hm("14:00"), fim: hm("15:00"), prof: 2, sala: "Sala 1 — Facial" },
  { dia: 2, pessoa: "Fernanda Quirino",     servico: "Limpeza de pele profunda", inicio: hm("15:00"), fim: hm("16:00"), prof: 2, sala: "Sala 1 — Facial" },

  { dia: 3, pessoa: "Isabela Fontes",       servico: "Drenagem linfática",       inicio: hm("09:00"), fim: hm("10:00"), prof: 0, sala: "Sala 3" },
  { dia: 3, pessoa: "Ana Beatriz Moreira",  servico: "Massagem relaxante",       inicio: hm("10:00"), fim: hm("11:00"), prof: 1, sala: "Sala 2 — Corporal" },
  { dia: 3, pessoa: "Eduardo Tavares",      servico: "Peeling de diamante",      inicio: hm("11:00"), fim: hm("12:00"), prof: 2, sala: "Sala 1 — Facial" },
  { dia: 3, pessoa: "Helena Ribeiro",       servico: "Limpeza de pele profunda", inicio: hm("14:00"), fim: hm("15:00"), prof: 2, sala: "Sala 1 — Facial" },
  { dia: 3, pessoa: "Karina Duarte",        servico: "Drenagem linfática",       inicio: hm("15:00"), fim: hm("16:00"), prof: 0, sala: "Sala 3" },

  { dia: 4, pessoa: "Daniela Vasques",      servico: "Massagem relaxante",       inicio: hm("09:00"), fim: hm("10:00"), prof: 1, sala: "Sala 2 — Corporal" },
  { dia: 4, pessoa: "Gustavo Amaral",       servico: "Peeling de diamante",      inicio: hm("10:00"), fim: hm("11:00"), prof: 2, sala: "Sala 1 — Facial" },
  { dia: 4, pessoa: "João Marcelo Reis",    servico: "Limpeza de pele profunda", inicio: hm("11:00"), fim: hm("12:00"), prof: 2, sala: "Sala 1 — Facial" },
  { dia: 4, pessoa: "Carlos Eduardo Pinto", servico: "Drenagem linfática",       inicio: hm("14:00"), fim: hm("15:00"), prof: 0, sala: "Sala 3" },
  { dia: 4, pessoa: "Vanessa Corrêa",       servico: "Limpeza de pele profunda", inicio: hm("15:30"), fim: hm("16:30"), prof: 2, sala: "Sala 1 — Facial" },
];

export const ETAPAS = [
  { nome: "Novo contato",       mediaDias: 3 },
  { nome: "Avaliação agendada", mediaDias: 5 },
  { nome: "Proposta enviada",   mediaDias: 7 },
  { nome: "Negociação",         mediaDias: 9 },
  { nome: "Fechado",            mediaDias: 2 },
];

export const NEGOCIOS = [
  { pessoa: "Marina Lopes",         valor: 400,  etapa: 0, dias: 2,  dono: 0, prox: "Primeiro contato por WhatsApp", quando: "hoje" },
  { pessoa: "Rafael Souza",         valor: 490,  etapa: 0, dias: 9,  dono: 1, prox: null,                            quando: null },
  { pessoa: "Camila Nogueira",      valor: 650,  etapa: 1, dias: 3,  dono: 2, prox: "Avaliação presencial",          quando: "qua 19/08" },
  { pessoa: "Bruno Aguiar",         valor: 740,  etapa: 1, dias: 6,  dono: 0, prox: "Confirmar horário",             quando: "amanhã" },
  { pessoa: "Letícia Ramos",        valor: 900,  etapa: 2, dias: 4,  dono: 2, prox: "Retorno da proposta",           quando: "sex 21/08" },
  { pessoa: "Diego Ferraz",         valor: 990,  etapa: 2, dias: 16, dono: 1, prox: null,                            quando: null },
  { pessoa: "Patrícia Lima",        valor: 1150, etapa: 3, dias: 4,  dono: 0, prox: "Retorno agendado",              quando: "ter 26/08" },
  { pessoa: "Sérgio Bastos",        valor: 1240, etapa: 3, dias: 31, dono: 1, prox: null,                            quando: null },
  { pessoa: "Ana Beatriz Moreira",  valor: 800,  etapa: 4, dias: 1,  dono: 2, prox: "Emitir contrato",               quando: "hoje" },
  { pessoa: "Carlos Eduardo Pinto", valor: 1300, etapa: 4, dias: 2,  dono: 0, prox: "Primeira sessão",               quando: "seg 24/08" },
  { pessoa: "Vanessa Corrêa",       valor: 1400, etapa: 4, dias: 3,  dono: 1, prox: null,                            quando: null },
];

export const CONVERSAS = [
  { pessoa: "Ana Beatriz Moreira",  previa: "Bom dia! Gostaria de remarcar minha sessão de quinta.", horas: 18,   naoLida: true,  ia: false },
  { pessoa: "Carlos Eduardo Pinto", previa: "Qual o valor da limpeza de pele profunda?",             horas: 2,    naoLida: true,  ia: true  },
  { pessoa: "Daniela Vasques",      previa: "Vou confirmar com meu marido e retorno.",               horas: 0,    naoLida: false, ia: false },
  { pessoa: "Karina Duarte",        previa: "Obrigada! Até a próxima.",                              horas: 0,    naoLida: false, ia: false },
  { pessoa: "Marina Lopes",         previa: "Vi o anúncio no Instagram, como funciona o pacote?",     horas: 21,   naoLida: true,  ia: true  },
];

export const KPIS = [
  { rotulo: "Atendimentos hoje",  ic: "▤", valor: "6",        delta: "+2",        dir: "pos", base: "vs. mesmo dia da semana passada", destino: "agenda" },
  { rotulo: "Novos leads",        ic: "◉", valor: "7",        delta: "+40%",      dir: "pos", base: "últimos 30 dias",                 destino: "pessoas" },
  { rotulo: "Taxa de ocupação",   ic: "◍", valor: "53%",      delta: "+2,2 p.p.", dir: "pos", base: "semana corrente",                 destino: "agenda" },
  { rotulo: "Receita do mês",     ic: "◧", valor: "R$ 2.210", delta: null,        dir: null,  base: "17 de 24 dias úteis decorridos",  destino: "funil" },
];

export const PENDENCIAS = [
  { texto: "Anamneses não preenchidas",  qtd: 4,  tom: "aviso"  },
  { texto: "Retornos a confirmar",       qtd: 30, tom: "neutro" },
  { texto: "Cobranças vencidas",         qtd: 2,  tom: "perigo" },
  { texto: "Conversas sem resposta",     qtd: 2,  tom: "aviso"  },
];

export const SERIE_SEMANAS = [
  { r: "01/06", v: 18 }, { r: "08/06", v: 19 }, { r: "15/06", v: 19 }, { r: "22/06", v: 21 },
  { r: "29/06", v: 19 }, { r: "06/07", v: 27 }, { r: "13/07", v: 27 }, { r: "20/07", v: 27 },
  { r: "27/07", v: 27 }, { r: "03/08", v: 34 }, { r: "10/08", v: 34 }, { r: "17/08", v: 38 },
];

export const SERVICOS = [
  { nome: "Limpeza de pele profunda", preco: 180, min: 60, pct: 28 },
  { nome: "Peeling de diamante",      preco: 220, min: 50, pct: 26 },
  { nome: "Drenagem linfática",       preco: 150, min: 60, pct: 24 },
  { nome: "Massagem relaxante",       preco: 140, min: 50, pct: 22 },
];

/** Linha do tempo da ficha de Ana Beatriz Moreira. */
export const TIMELINE = [
  { dia: "Hoje",        hora: "14:02", tipo: "msg",   titulo: "Mensagem enviada",        detalhe: "Confirmação do horário de quinta-feira" },
  { dia: "Hoje",        hora: "09:40", tipo: "msg",   titulo: "Mensagem recebida",       detalhe: "“Gostaria de remarcar minha sessão de quinta.”" },
  { dia: "Ontem",       hora: "16:15", tipo: "fin",   titulo: "Pagamento confirmado",    detalhe: "Parcela 3/10 do pacote · R$ 180,00" },
  { dia: "Ontem",       hora: "11:00", tipo: "atend", titulo: "Atendimento concluído",   detalhe: "Massagem relaxante · Marcos Dias · Sala 2" },
  { dia: "12 de agosto",hora: "10:30", tipo: "clin",  titulo: "Evolução registrada",     detalhe: "Boa resposta ao protocolo; manter frequência semanal" },
  { dia: "12 de agosto",hora: "10:00", tipo: "atend", titulo: "Atendimento concluído",   detalhe: "Limpeza de pele profunda · Tiago Rocha · Sala 1" },
];
