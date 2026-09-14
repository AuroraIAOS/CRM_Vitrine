/**
 * Seed de demonstração — parte 2 (operação): agenda, financeiro, prontuário,
 * vendas, mensageria, automações e IA.
 *
 * Separado de `seed_demo.mjs` por tamanho, não por natureza: a parte 1 monta
 * a conta, a equipe e o catálogo (o que tudo aqui depende), e esta monta o
 * movimento. Ver o cabeçalho da parte 1 para as quatro regras que este seed
 * não pode quebrar.
 */

export async function semearOperacao(db, ctx, u) {
  const { conta, equipe, profs, recursos, servicos, planos, leads, clientes } = ctx;
  const { log, inserir, ok, dia, iso, horaLocal, diaUtil, telefoneFicticio, s } = u;

  // ================================================================ AGENDA
  //
  // A agenda é gerada, não listada à mão, e o motivo é de VITRINE: a primeira
  // versão tinha 18 atendimentos espalhados em 6 datas, e o dashboard mostrou
  // **taxa de ocupação de 2%**. O número estava certo — a conta é minutos
  // agendados sobre minutos disponíveis, e 1 atendimento por profissional numa
  // semana de 45 horas dá isso mesmo. Mas uma demonstração que exibe 2% de
  // ocupação e um gráfico de 12 semanas quase vazio não mostra o produto
  // funcionando; mostra uma clínica parada. Um seed de vitrine precisa ter
  // volume de clínica de verdade.
  //
  // Regras que a geração respeita:
  //  - só dias úteis, 09h-17h, no fuso da conta (o trigger
  //    `verificar_expediente_agendamento` recusa fora da grade 09-18);
  //  - cada profissional em horários distintos no mesmo dia, e cada sala
  //    ocupada por um só atendimento por hora — sem sobreposição;
  //  - status coerente com o tempo: passado conclui, falta ou cancela;
  //    hoje está em andamento; futuro está agendado ou confirmado.
  const HORAS = [9, 10, 11, 14, 15]; // 5 de 9 horas disponíveis ≈ 55% de ocupação
  const CHAVES_PROF = ["prof1", "prof2", "prof3"];

  const linhasAgenda = [];
  for (let semana = 11; semana >= -1; semana--) {
    for (let d = 0; d < 5; d++) {
      const offset = -(semana * 7) + d - ((new Date().getDay() + 6) % 7);
      const data_ = dia(offset);
      if (data_.getDay() === 0 || data_.getDay() === 6) continue;
      for (let h = 0; h < HORAS.length; h++) {
        for (let p = 0; p < CHAVES_PROF.length; p++) {
          // Rareia o passado distante e o futuro, para o gráfico ter relevo
          // em vez de um platô — clínica real não tem semana idêntica à outra.
          const densidade = semana > 6 ? 2 : semana > 2 ? 3 : semana >= 0 ? 5 : 3;
          if (h >= densidade) continue;

          const inicio = horaLocal(data_, HORAS[h]);
          const passou = new Date(inicio) < new Date();
          const i = linhasAgenda.length;
          const status = passou
            ? i % 11 === 0 ? "cancelado" : i % 7 === 0 ? "nao_compareceu" : "concluido"
            : offset === 0 ? "em_andamento" : i % 3 === 0 ? "confirmado" : "agendado";

          linhasAgenda.push({
            account_id: conta,
            cliente_id: clientes[i % clientes.length],
            profissional_id: profs[CHAVES_PROF[p]],
            // Sala por profissional: dois profissionais nunca dividem sala no
            // mesmo horário, porque cada um tem a sua.
            recurso_id: recursos[p].id,
            inicio,
            fim: horaLocal(data_, HORAS[h] + 1),
            status,
            valor_cobrado: status === "concluido" ? [180, 220, 150, 160][i % 4] : null,
            forma_pagamento: status === "concluido" ? ["pix", "cartao", "dinheiro", "transferencia"][i % 4] : null,
            motivo_cancelamento: status === "cancelado" ? "Cliente remarcou por telefone" : null,
            criado_por: equipe.recepcao.userId,
          });
        }
      }
    }
  }

  // Em lotes: um insert por atendimento levaria minutos com este volume.
  const agendamentos = [];
  for (let i = 0; i < linhasAgenda.length; i += 100) {
    agendamentos.push(...(await inserir("aba_scheduling", "agendamentos", linhasAgenda.slice(i, i + 100))));
  }
  const linhasServico = agendamentos.map((a, i) => ({
    account_id: conta, agendamento_id: a.id, procedimento_id: servicos[i % 4].id,
    preco: [180, 220, 150, 160][i % 4], duracao_minutos: 60,
  }));
  for (let i = 0; i < linhasServico.length; i += 100) {
    await inserir("aba_scheduling", "agendamento_procedimentos", linhasServico.slice(i, i + 100));
  }
  log(`agenda: ${agendamentos.length} atendimentos em 13 semanas, cobrindo os 6 estados`);

  await inserir("aba_scheduling", "ausencias", [
    { account_id: conta, profissional_id: profs.prof2, inicio: iso(diaUtil(9)), fim: iso(diaUtil(11)), motivo: "Congresso de dermatofuncional", criado_por: equipe.owner.userId },
    { account_id: conta, profissional_id: profs.prof3, inicio: iso(diaUtil(14)), fim: iso(diaUtil(15)), motivo: "Férias", criado_por: equipe.owner.userId },
  ]);

  // Lembretes nos 5 estados. Os 'pendente' apontam para atendimento FUTURO —
  // o job `disparar-lembretes-vencidos` roda a cada 5 minutos desde a 02.10 e
  // converteria um lembrete de data passada em 'pronto' logo após o seed.
  const futuros = agendamentos.filter((a) => new Date(a.inicio) > new Date());
  const passados = agendamentos.filter((a) => new Date(a.inicio) <= new Date());
  await inserir("aba_scheduling", "lembretes", [
    { account_id: conta, agendamento_id: futuros[0].id, alvo: "cliente", enviar_em: iso(dia(2)), status: "pendente" },
    { account_id: conta, agendamento_id: futuros[1].id, alvo: "profissional", enviar_em: iso(dia(2)), status: "pendente" },
    { account_id: conta, agendamento_id: futuros[2].id, alvo: "cliente", enviar_em: iso(dia(5)), status: "pronto" },
    { account_id: conta, agendamento_id: futuros[3].id, alvo: "cliente", enviar_em: iso(dia(5)), status: "pronto" },
    { account_id: conta, agendamento_id: passados[0].id, alvo: "cliente", enviar_em: iso(dia(-12)), status: "enviado" },
    { account_id: conta, agendamento_id: passados[1].id, alvo: "profissional", enviar_em: iso(dia(-12)), status: "enviado" },
    { account_id: conta, agendamento_id: passados[2].id, alvo: "cliente", enviar_em: iso(dia(-9)), status: "falhou", erro: "Número não encontrado no WhatsApp" },
    { account_id: conta, agendamento_id: passados[3].id, alvo: "cliente", enviar_em: iso(dia(-9)), status: "falhou", erro: "Janela de 24h expirada" },
    { account_id: conta, agendamento_id: passados[4].id, alvo: "cliente", enviar_em: iso(dia(-6)), status: "cancelado" },
    { account_id: conta, agendamento_id: passados[5].id, alvo: "cliente", enviar_em: iso(dia(-6)), status: "cancelado" },
  ]);
  log("2 ausências · 10 lembretes cobrindo os 5 estados");

  // ================================================================ VENDAS
  const [funil] = await inserir("aba_sales", "funis", [{ account_id: conta, nome: "Funil comercial" }]);
  const etapas = await inserir(
    "aba_sales",
    "etapas_funil",
    ["Novo contato", "Avaliação agendada", "Proposta enviada", "Negociação", "Fechado"].map((nome, i) => ({ funil_id: funil.id, nome, ordem: i + 1 })),
  );

  const oportunidades = [];
  // 2 por etapa, todas ativas — é o pedido explícito de Max.
  for (let e = 0; e < etapas.length; e++) {
    for (let k = 0; k < 2; k++) {
      const pessoa = [...leads, ...clientes][(e * 2 + k) % (leads.length + clientes.length)];
      oportunidades.push({
        account_id: conta,
        funil_id: funil.id,
        etapa_id: etapas[e].id,
        pessoa_id: pessoa,
        titulo: `${etapas[e].nome} — oportunidade ${k + 1}`,
        valor: 400 + e * 250 + k * 90,
        previsao_fechamento: `${iso(dia(10 + e * 5)).slice(0, 10)}`,
        status: "ativa",
      });
    }
  }
  // Mais 2 ganhas e 2 perdidas, para os três valores de `status` terem >=2.
  for (let k = 0; k < 2; k++) {
    oportunidades.push({
      account_id: conta, funil_id: funil.id, etapa_id: etapas[4].id, pessoa_id: clientes[k],
      titulo: `Pacote fechado — cliente ${k + 1}`, valor: 800 + k * 500, status: "ganha",
    });
    oportunidades.push({
      account_id: conta, funil_id: funil.id, etapa_id: etapas[3].id, pessoa_id: leads[6 + k],
      titulo: `Proposta recusada ${k + 1}`, valor: 600 + k * 200, status: "perdida",
    });
  }
  await inserir("aba_sales", "oportunidades", oportunidades);
  log(`vendas: funil com 5 etapas · ${oportunidades.length} oportunidades (2 por etapa + 2 ganhas + 2 perdidas)`);

  // ================================================================ FINANCEIRO
  const faturas = {};
  async function fatura(numero, clienteIdx, status, valor, vencOffset, pago) {
    const [f] = await inserir("aba_finance", "faturas", [
      {
        account_id: conta, cliente_id: clientes[clienteIdx], numero,
        data_emissao: iso(dia(vencOffset - 10)).slice(0, 10),
        data_vencimento: iso(dia(vencOffset)).slice(0, 10),
        status,
      },
    ]);
    await inserir("aba_finance", "itens_fatura", [
      { account_id: conta, fatura_id: f.id, descricao: "Atendimento estético", quantidade: 1, valor_unitario: valor },
    ]);
    if (pago) {
      await inserir("aba_finance", "pagamentos", [
        { account_id: conta, fatura_id: f.id, valor: pago.valor, pago_em: iso(dia(pago.off)).slice(0, 10), forma_pagamento: pago.forma, confirmado_por: equipe.recepcao.userId },
      ]);
    }
    (faturas[status] ??= []).push(f);
    return f;
  }

  // 2 por estado das 6 situações de fatura.
  await fatura("2026-0001", 0, "rascunho", 180, 12, null);
  await fatura("2026-0002", 1, "rascunho", 220, 14, null);
  await fatura("2026-0003", 2, "aberta", 150, 8, null);
  await fatura("2026-0004", 3, "aberta", 350, 10, null);
  await fatura("2026-0005", 4, "enviada", 190, 6, null);
  await fatura("2026-0006", 5, "enviada", 260, 9, null);
  await fatura("2026-0007", 0, "paga", 180, -12, { valor: 180, off: -12, forma: "pix" });
  await fatura("2026-0008", 1, "paga", 240, -8, { valor: 240, off: -8, forma: "cartao" });
  await fatura("2026-0009", 2, "paga", 160, -3, { valor: 160, off: -3, forma: "dinheiro" });
  await fatura("2026-0010", 3, "paga", 300, -1, { valor: 300, off: -1, forma: "transferencia" });
  await fatura("2026-0011", 6, "vencida", 210, -20, null);
  await fatura("2026-0012", 7, "vencida", 175, -15, null);
  await fatura("2026-0013", 8, "cancelada", 190, -5, null);
  await fatura("2026-0014", 9, "cancelada", 140, -7, null);
  // Segunda rodada de faturas pagas: fecha as 6 formas de pagamento com 2
  // cada. A primeira versão cobria 4 formas com 1 cada — medido depois de
  // rodar, não previsto ao escrever.
  await fatura("2026-0015", 4, "paga", 180, -14, { valor: 180, off: -14, forma: "pix" });
  await fatura("2026-0016", 5, "paga", 220, -13, { valor: 220, off: -13, forma: "cartao" });
  await fatura("2026-0017", 6, "paga", 150, -11, { valor: 150, off: -11, forma: "dinheiro" });
  await fatura("2026-0018", 7, "paga", 260, -9, { valor: 260, off: -9, forma: "transferencia" });
  await fatura("2026-0019", 0, "paga", 160, -6, { valor: 160, off: -6, forma: "plano" });
  await fatura("2026-0020", 1, "paga", 160, -5, { valor: 160, off: -5, forma: "plano" });
  await fatura("2026-0021", 2, "paga", 90, -4, { valor: 90, off: -4, forma: "outro" });
  await fatura("2026-0022", 3, "paga", 110, -2, { valor: 110, off: -2, forma: "outro" });
  log("financeiro: 22 faturas cobrindo os 6 estados · pagamentos nas 6 formas (2 cada)");

  await inserir("aba_finance", "contratos", [
    { account_id: conta, cliente_id: clientes[0], pacote_id: planos[0].id, descricao: "Pacote facial anual", valor: 800, status: "ativo", ciclo_cobranca: "mensal", forma_pagamento: "pix", data_inicio: iso(dia(-30)).slice(0, 10) },
    { account_id: conta, cliente_id: clientes[1], pacote_id: planos[1].id, descricao: "Pacote corporal", valor: 1300, status: "ativo", ciclo_cobranca: "trimestral", forma_pagamento: "credito", data_inicio: iso(dia(-20)).slice(0, 10) },
    { account_id: conta, cliente_id: clientes[2], descricao: "Proposta em elaboração", valor: 500, status: "rascunho", ciclo_cobranca: "unica", data_inicio: iso(dia(2)).slice(0, 10) },
    { account_id: conta, cliente_id: clientes[3], descricao: "Proposta em revisão", valor: 700, status: "rascunho", ciclo_cobranca: "unica", data_inicio: iso(dia(3)).slice(0, 10) },
    { account_id: conta, cliente_id: clientes[4], descricao: "Contrato concluído", valor: 900, status: "encerrado", ciclo_cobranca: "anual", data_inicio: iso(dia(-400)).slice(0, 10) },
    { account_id: conta, cliente_id: clientes[5], descricao: "Contrato concluído (2025)", valor: 650, status: "encerrado", ciclo_cobranca: "unica", data_inicio: iso(dia(-380)).slice(0, 10) },
    { account_id: conta, cliente_id: clientes[6], descricao: "Cancelado por desistência", valor: 400, status: "cancelado", ciclo_cobranca: "unica", data_inicio: iso(dia(-60)).slice(0, 10) },
    { account_id: conta, cliente_id: clientes[7], descricao: "Cancelado — mudança de cidade", valor: 550, status: "cancelado", ciclo_cobranca: "mensal", data_inicio: iso(dia(-45)).slice(0, 10) },
    // Fecha os 4 ciclos de cobrança com 2 cada (trimestral e anual tinham 1).
    { account_id: conta, cliente_id: clientes[8], descricao: "Acompanhamento trimestral", valor: 1100, status: "ativo", ciclo_cobranca: "trimestral", forma_pagamento: "boleto", data_inicio: iso(dia(-15)).slice(0, 10) },
    { account_id: conta, cliente_id: clientes[9], descricao: "Plano anual de manutenção", valor: 2400, status: "ativo", ciclo_cobranca: "anual", forma_pagamento: "debito", data_inicio: iso(dia(-10)).slice(0, 10) },
  ]);

  // Planos vendidos: SEMPRE por `vender_pacote()`. `planos_cliente` e
  // `saldos_plano` não aceitam escrita direta por decisão da Subetapa 02.8, e
  // o seed usa o mesmo caminho do produto em vez de contornar a regra.
  const vendidos = [];
  // 8 vendas para os 4 estados de plano do cliente terem 2 cada.
  for (const [idx, planoIdx, expiraOff] of [[0, 0, 150], [1, 1, 200], [2, 0, -5], [3, 1, -10], [4, 0, 120], [5, 1, 90], [6, 0, -20], [7, 1, -30]]) {
    const f = faturas.paga[idx % faturas.paga.length];
    const r = ok(
      await s("aba_finance").rpc("vender_pacote", {
        p_cliente_id: clientes[idx],
        p_pacote_id: planos[planoIdx].id,
        p_preco_total: planos[planoIdx].preco_total,
        p_fatura_id: f.id,
        p_expira_em: iso(dia(expiraOff)),
      }),
      "vender_pacote",
    );
    vendidos.push(r);
  }
  // Estados de plano do cliente: 2 ativos (acima), 2 vencidos (expira no
  // passado — expirar_pacotes() do pg_cron os marcará), e 2 marcados à mão.
  // 2 por estado: os dois primeiros ficam 'ativo' (como nasceram), e os
  // demais recebem os outros três estados, dois a dois.
  const pc = ok(await s("aba_finance").from("pacotes_cliente").select("id").eq("account_id", conta), "planos vendidos");
  const marcar = async (indices, status) => {
    for (const i of indices) if (pc[i]) ok(await s("aba_finance").from("pacotes_cliente").update({ status }).eq("id", pc[i].id), `plano ${status}`);
  };
  await marcar([2, 3], "esgotado");
  await marcar([4, 5], "vencido");
  await marcar([6, 7], "cancelado");
  log(`4 planos vendidos por vender_pacote() · 10 contratos (4 estados · 4 ciclos)`);

  await inserir("aba_finance", "regras_comissao", [
    { account_id: conta, profissional_id: profs.prof1, percentual: 30, ativo: true },
    { account_id: conta, profissional_id: profs.prof2, percentual: 35, ativo: true },
    { account_id: conta, profissional_id: profs.prof3, procedimento_id: servicos[2].id, percentual: 40, ativo: true },
    { account_id: conta, profissional_id: profs.profInativo, percentual: 25, ativo: false },
  ]);
  const concluidos = agendamentos.filter((a) => a.status === "concluido");
  await inserir(
    "aba_finance",
    "lancamentos_comissao",
    [
      ["pendente", 0], ["pendente", 1], ["aprovado", 2], ["aprovado", 0],
      ["pago", 1], ["pago", 2], ["cancelado", 0], ["cancelado", 1],
    ].map(([status, i], k) => ({
      account_id: conta,
      // `idx_lancamentos_comissao_um_por_agendamento` é único: um lançamento
      // por atendimento. Os primeiros ficam vinculados ao atendimento que os
      // gerou; os demais são lançamentos avulsos (a coluna é nula por
      // desenho, justamente para comissão fora de atendimento existir).
      agendamento_id: k < concluidos.length ? concluidos[k].id : null,
      profissional_id: profs[["prof1", "prof2", "prof3"][i]],
      procedimento_id: servicos[i].id,
      valor_base: 180,
      percentual: 30,
      valor_comissao: 54,
      status,
      pago_em: status === "pago" ? iso(dia(-4)) : null,
    })),
  );
  log("4 regras de comissão · 8 lançamentos nos 4 estados");

  // ================================================================ PRONTUÁRIO
  const [formulario] = await inserir("aba_health", "formularios_anamnese", [
    {
      account_id: conta,
      nome: "Ficha de anamnese padrão",
      versao: 1,
      ativo: true,
      perguntas: [
        { chave: "queixa_principal", rotulo: "Queixa principal", tipo: "texto" },
        { chave: "medicacao_continua", rotulo: "Uso de medicação contínua", tipo: "sim_nao" },
        { chave: "alergias", rotulo: "Alergias e sensibilidades", tipo: "texto" },
        { chave: "historico", rotulo: "Histórico de procedimentos anteriores", tipo: "texto" },
        { chave: "habitos", rotulo: "Hábitos (sono, exposição solar, tabagismo)", tipo: "texto" },
      ],
    },
  ]);

  for (let i = 0; i < 4; i++) {
    await inserir("aba_health", "prontuarios", [
      {
        account_id: conta, cliente_id: clientes[i],
        tipo_pele: ["Mista", "Oleosa", "Seca", "Normal"][i],
        medicamentos: i % 2 ? "nada consta" : "Anticoncepcional oral",
        alergias: i % 2 ? "Ácido salicílico" : "nada consta",
        restricoes: "nada consta",
        gestante: false, amamentando: false,
        condicoes_cronicas: "nada consta",
        observacoes_gerais: "Paciente fictício de demonstração.",
        atualizado_por: equipe.prof1.userId,
      },
    ]);
    // Anamnese COMPLETA — o trigger da migration 034 recusa qualquer
    // pergunta em branco, e é isso que se quer demonstrar.
    await inserir("aba_health", "respostas_anamnese", [
      {
        account_id: conta, cliente_id: clientes[i], formulario_id: formulario.id,
        coletado_por: equipe.prof1.userId,
        respostas: {
          queixa_principal: ["Manchas na face", "Oleosidade excessiva", "Ressecamento", "Linhas finas"][i],
          medicacao_continua: i % 2 ? "Sim" : "Nao",
          alergias: i % 2 ? "Ácido salicílico" : "nada consta",
          historico: i < 2 ? "Peeling em 2025" : "nada consta",
          habitos: "Sono regular; usa protetor solar diariamente",
        },
      },
    ]);
  }

  await inserir("aba_health", "evolucoes", [
    { account_id: conta, cliente_id: clientes[0], profissional_id: profs.prof1, agendamento_id: concluidos[0]?.id ?? null, avaliacao: "Pele mista com comedões em zona T.", notas_procedimento: "Limpeza profunda com extração.", resultado: "Boa resposta, sem intercorrência.", proximos_passos: "Retorno em 30 dias.", travada: true, mapa_tipo: "facial", marcacoes: [] },
    { account_id: conta, cliente_id: clientes[1], profissional_id: profs.prof2, avaliacao: "Retenção hídrica em membros inferiores.", notas_procedimento: "Drenagem linfática manual.", resultado: "Redução de edema.", proximos_passos: "Série de 6 sessões.", travada: true, mapa_tipo: "corporal", marcacoes: [] },
    { account_id: conta, cliente_id: clientes[2], profissional_id: profs.prof3, avaliacao: "Tensão cervical.", notas_procedimento: "Sessão de acupuntura.", travada: false, mapa_tipo: "acupuntura", marcacoes: [] },
    { account_id: conta, cliente_id: clientes[3], profissional_id: profs.prof1, avaliacao: "Avaliação inicial em rascunho.", travada: false, mapa_tipo: "odontograma", marcacoes: [] },
    // Segunda evolução de cada tipo de mapa: os 4 mapas clínicos precisam de
    // 2 registros cada para a biblioteca de mapas não ter tipo com um só.
    { account_id: conta, cliente_id: clientes[4], profissional_id: profs.prof1, avaliacao: "Reavaliação facial após 30 dias.", notas_procedimento: "Segunda limpeza de pele.", resultado: "Redução de comedões.", proximos_passos: "Manutenção trimestral.", travada: true, mapa_tipo: "facial", marcacoes: [] },
    { account_id: conta, cliente_id: clientes[5], profissional_id: profs.prof2, avaliacao: "Acompanhamento corporal.", notas_procedimento: "Drenagem — sessão 2.", resultado: "Boa evolução.", proximos_passos: "Seguir a série.", travada: false, mapa_tipo: "corporal", marcacoes: [] },
    { account_id: conta, cliente_id: clientes[6], profissional_id: profs.prof3, avaliacao: "Segunda sessão de acupuntura.", notas_procedimento: "Pontos cervicais.", travada: true, mapa_tipo: "acupuntura", marcacoes: [] },
    { account_id: conta, cliente_id: clientes[7], profissional_id: profs.prof1, avaliacao: "Mapeamento odontológico de apoio.", notas_procedimento: "Registro para encaminhamento.", travada: false, mapa_tipo: "odontograma", marcacoes: [] },
  ]);

  await inserir("aba_health", "consentimentos", [
    { account_id: conta, cliente_id: clientes[0], tipo: "tratamento_dados", versao_texto: "v1", concedido: true, concedido_em: iso(dia(-30)), coletado_por: equipe.recepcao.userId },
    { account_id: conta, cliente_id: clientes[1], tipo: "tratamento_dados", versao_texto: "v1", concedido: true, concedido_em: iso(dia(-25)), coletado_por: equipe.recepcao.userId },
    { account_id: conta, cliente_id: clientes[0], tipo: "procedimento", versao_texto: "v1", concedido: true, concedido_em: iso(dia(-20)), coletado_por: equipe.prof1.userId },
    { account_id: conta, cliente_id: clientes[2], tipo: "procedimento", versao_texto: "v1", concedido: true, concedido_em: iso(dia(-18)), coletado_por: equipe.prof1.userId },
    { account_id: conta, cliente_id: clientes[0], tipo: "uso_imagem", versao_texto: "v1", concedido: true, concedido_em: iso(dia(-15)), coletado_por: equipe.prof1.userId },
    { account_id: conta, cliente_id: clientes[3], tipo: "uso_imagem", versao_texto: "v1", concedido: false, revogado_em: iso(dia(-2)), coletado_por: equipe.recepcao.userId },
  ]);

  await inserir("aba_health", "concessoes_prontuario", [
    { account_id: conta, usuario_concedido_id: equipe.recepcao.userId, escopo: "cliente_unico", cliente_id: clientes[0], efeito: "permitir", motivo: "Apoio administrativo em caso específico", expira_em: iso(dia(30)), concedido_por: equipe.owner.userId },
    { account_id: conta, usuario_concedido_id: equipe.auxiliar.userId, escopo: "cliente_unico", cliente_id: clientes[1], efeito: "permitir", motivo: "Digitalização de ficha antiga", expira_em: iso(dia(15)), concedido_por: equipe.owner.userId },
    { account_id: conta, usuario_concedido_id: equipe.profInativo.userId, escopo: "todos_registros", efeito: "negar", motivo: "Profissional afastado — acesso suspenso", concedido_por: equipe.owner.userId },
    { account_id: conta, usuario_concedido_id: equipe.auxiliar.userId, escopo: "cliente_unico", cliente_id: clientes[2], efeito: "negar", motivo: "Cliente pediu restrição nominal", concedido_por: equipe.owner.userId },
    // Segunda concessão de escopo amplo: os 2 escopos precisam de 2 cada.
    { account_id: conta, usuario_concedido_id: equipe.prof2.userId, escopo: "todos_registros", efeito: "permitir", motivo: "Cobertura durante afastamento de colega", expira_em: iso(dia(45)), concedido_por: equipe.owner.userId },
  ]);
  log("prontuário: 4 fichas · 4 anamneses completas · 8 evoluções (4 mapas x2) · 6 consentimentos (3 tipos) · 5 concessões (2 efeitos · 2 escopos)");

  // ================================================================ MENSAGERIA
  //
  // A configuração de canal vem PRIMEIRO e não é detalhe: sem uma linha em
  // `configuracao_whatsapp`, a tela `1j` mostra "Conectar WhatsApp" e as
  // conversas semeadas ficam invisíveis — o módulo parece não configurado
  // mesmo com 6 conversas e 22 mensagens no banco. Descoberto abrindo a tela,
  // não lendo o script.
  //
  // O token é um marcador inequívoco, não credencial: a coluna é cifrada em
  // repouso e negada a `authenticated`, e a demonstração não envia mensagem
  // nenhuma (o token é inválido, então um envio real falharia — que é o
  // comportamento correto para uma vitrine).
  await inserir("aba_messaging", "configuracao_whatsapp", [
    {
      account_id: conta,
      id_numero_telefone: "DEMONSTRACAO-SEM-NUMERO-REAL",
      id_waba: "DEMONSTRACAO-SEM-WABA-REAL",
      token_acesso_cifrado: "DEMONSTRACAO-SEM-TOKEN-REAL",
      status: "conectado",
      conectado_em: iso(dia(-40)),
    },
  ]);
  // Telefones com indicativo +999 (reservado pela ITU, não roteia) — ver a
  // regra 1 no cabeçalho da parte 1. Nunca inventar número plausível.
  const contatos = await inserir(
    "aba_messaging",
    "contatos_canal",
    clientes.slice(0, 6).map((_, i) => ({
      account_id: conta,
      telefone: telefoneFicticio(300 + i),
      nome: ["Ana Beatriz", "Carlos Eduardo", "Daniela", "Eduardo", "Fernanda", "Gustavo"][i],
    })),
  );

  const conversas = await inserir("aba_messaging", "conversas", [
    { account_id: conta, contato_id: contatos[0].id, provedor: "meta", status: "aberta", ultima_mensagem_texto: "Bom dia! Gostaria de remarcar.", ultima_mensagem_em: iso(dia(0)), contador_nao_lidas: 2, agente_responsavel_id: equipe.recepcao.userId },
    { account_id: conta, contato_id: contatos[1].id, provedor: "meta", status: "aberta", ultima_mensagem_texto: "Qual o valor da limpeza de pele?", ultima_mensagem_em: iso(dia(0)), contador_nao_lidas: 1 },
    { account_id: conta, contato_id: contatos[2].id, provedor: "meta", status: "pendente", ultima_mensagem_texto: "Vou confirmar e retorno.", ultima_mensagem_em: iso(dia(-1)), contador_nao_lidas: 0 },
    { account_id: conta, contato_id: contatos[3].id, provedor: "meta", status: "pendente", ultima_mensagem_texto: "Aguardando retorno da cliente.", ultima_mensagem_em: iso(dia(-2)), contador_nao_lidas: 0 },
    { account_id: conta, contato_id: contatos[4].id, provedor: "meta", status: "fechada", ultima_mensagem_texto: "Obrigada! Até a próxima.", ultima_mensagem_em: iso(dia(-6)), contador_nao_lidas: 0 },
    { account_id: conta, contato_id: contatos[5].id, provedor: "meta", status: "fechada", ultima_mensagem_texto: "Atendimento concluído.", ultima_mensagem_em: iso(dia(-9)), contador_nao_lidas: 0 },
  ]);

  const mensagens = [];
  const ESTADOS_MSG = ["enviando", "enviada", "entregue", "lida", "falhou"];
  for (let i = 0; i < conversas.length; i++) {
    mensagens.push(
      { conversa_id: conversas[i].id, account_id: conta, tipo_remetente: "cliente", tipo_conteudo: "texto", conteudo_texto: "Olá! Tudo bem?", status: "entregue", provedor: "meta", criado_em: iso(dia(-i - 1)) },
      { conversa_id: conversas[i].id, account_id: conta, tipo_remetente: "agente", remetente_id: equipe.recepcao.userId, tipo_conteudo: "texto", conteudo_texto: "Olá! Como posso ajudar?", status: ESTADOS_MSG[i % ESTADOS_MSG.length], provedor: "meta", criado_em: iso(dia(-i - 1)) },
      { conversa_id: conversas[i].id, account_id: conta, tipo_remetente: "bot", tipo_conteudo: "texto", conteudo_texto: "Atendimento fora do horário; responderemos em breve.", status: "entregue", provedor: "meta", criado_em: iso(dia(-i - 1)) },
    );
  }
  // Um par a mais para 'enviando' e 'falhou' terem >=2 cada.
  //
  // `criado_em` explícito aqui não é redundância: num insert em LOTE o
  // PostgREST uniformiza as colunas de todas as linhas, e a chave ausente
  // numa delas vira NULL explícito — que derruba o NOT NULL em vez de cair
  // no default da coluna. Ou todas as linhas do lote trazem o campo, ou
  // nenhuma traz.
  mensagens.push(
    { conversa_id: conversas[0].id, account_id: conta, tipo_remetente: "agente", remetente_id: equipe.recepcao.userId, tipo_conteudo: "imagem", url_midia: "https://exemplo.invalid/demo.jpg", conteudo_texto: "Foto do procedimento", status: "enviando", provedor: "meta", criado_em: iso(dia(0)) },
    { conversa_id: conversas[1].id, account_id: conta, tipo_remetente: "agente", remetente_id: equipe.recepcao.userId, tipo_conteudo: "documento", url_midia: "https://exemplo.invalid/orcamento.pdf", conteudo_texto: "Orçamento", status: "falhou", provedor: "meta", criado_em: iso(dia(0)) },
    { conversa_id: conversas[2].id, account_id: conta, tipo_remetente: "agente", remetente_id: equipe.recepcao.userId, tipo_conteudo: "texto", conteudo_texto: "Confirmo seu horário de amanhã.", status: "enviada", provedor: "meta", criado_em: iso(dia(-1)) },
    { conversa_id: conversas[3].id, account_id: conta, tipo_remetente: "agente", remetente_id: equipe.recepcao.userId, tipo_conteudo: "texto", conteudo_texto: "Segue o endereço da clínica.", status: "lida", provedor: "meta", criado_em: iso(dia(-2)) },
  );
  await inserir("aba_messaging", "mensagens", mensagens);

  await inserir("aba_messaging", "modelos_mensagem", [
    { account_id: conta, nome: "lembrete_atendimento", categoria: "utilidade", idioma: "pt_BR", texto_corpo: "Olá {{1}}, seu atendimento é amanhã às {{2}}.", status: "APPROVED" },
    { account_id: conta, nome: "confirmacao_agendamento", categoria: "utilidade", idioma: "pt_BR", texto_corpo: "Agendamento confirmado para {{1}}.", status: "APPROVED" },
    { account_id: conta, nome: "promocao_verao", categoria: "marketing", idioma: "pt_BR", texto_corpo: "Condição especial de verão para {{1}}!", status: "PENDING" },
    { account_id: conta, nome: "reativacao_cliente", categoria: "marketing", idioma: "pt_BR", texto_corpo: "Sentimos sua falta, {{1}}.", status: "PENDING" },
    { account_id: conta, nome: "codigo_acesso", categoria: "autenticacao", idioma: "pt_BR", texto_corpo: "Seu código é {{1}}.", status: "DRAFT" },
    { account_id: conta, nome: "codigo_recuperacao", categoria: "autenticacao", idioma: "pt_BR", texto_corpo: "Use {{1}} para recuperar o acesso.", status: "DRAFT" },
    { account_id: conta, nome: "modelo_antigo", categoria: "marketing", idioma: "pt_BR", texto_corpo: "Texto reprovado.", status: "REJECTED", motivo_rejeicao: "Conteúdo promocional sem opt-in" },
    { account_id: conta, nome: "modelo_antigo_2", categoria: "marketing", idioma: "pt_BR", texto_corpo: "Outro texto reprovado.", status: "REJECTED", motivo_rejeicao: "Variável sem exemplo declarado" },
    // Os quatro estados restantes do ciclo de vida de modelo na Meta. São
    // estados que a Meta atribui, não a clínica — mas a tela precisa saber
    // desenhá-los, e um demo que só mostra APPROVED esconde metade da vida
    // real de um modelo.
    { account_id: conta, nome: "aviso_pausado", categoria: "utilidade", idioma: "pt_BR", texto_corpo: "Aviso pausado {{1}}.", status: "PAUSED" },
    { account_id: conta, nome: "aviso_pausado_2", categoria: "utilidade", idioma: "pt_BR", texto_corpo: "Segundo aviso pausado {{1}}.", status: "PAUSED" },
    { account_id: conta, nome: "campanha_desativada", categoria: "marketing", idioma: "pt_BR", texto_corpo: "Campanha desativada.", status: "DISABLED" },
    { account_id: conta, nome: "campanha_desativada_2", categoria: "marketing", idioma: "pt_BR", texto_corpo: "Outra campanha desativada.", status: "DISABLED" },
    { account_id: conta, nome: "modelo_em_recurso", categoria: "marketing", idioma: "pt_BR", texto_corpo: "Modelo em recurso.", status: "IN_APPEAL" },
    { account_id: conta, nome: "modelo_em_recurso_2", categoria: "utilidade", idioma: "pt_BR", texto_corpo: "Outro modelo em recurso.", status: "IN_APPEAL" },
    { account_id: conta, nome: "modelo_a_remover", categoria: "marketing", idioma: "pt_BR", texto_corpo: "Marcado para remoção.", status: "PENDING_DELETION" },
    { account_id: conta, nome: "modelo_a_remover_2", categoria: "utilidade", idioma: "pt_BR", texto_corpo: "Também marcado para remoção.", status: "PENDING_DELETION" },
  ]);

  await inserir("aba_messaging", "respostas_rapidas", [
    { account_id: conta, criado_por: equipe.recepcao.userId, titulo: "Horário de funcionamento", tipo: "texto", conteudo_texto: "Atendemos de segunda a sexta, das 9h às 18h." },
    { account_id: conta, criado_por: equipe.recepcao.userId, titulo: "Formas de pagamento", tipo: "texto", conteudo_texto: "Aceitamos Pix, cartão e dinheiro." },
  ]);

  // Contadores explícitos nas TRÊS linhas — insert em lote uniformiza as
  // colunas e a chave ausente vira NULL, não o default (mesma armadilha das
  // mensagens acima).
  const contadores = (enviados = 0, entregues = 0, lidos = 0, respondidos = 0, falhados = 0) => ({
    contador_enviados: enviados, contador_entregues: entregues, contador_lidos: lidos,
    contador_respondidos: respondidos, contador_falhados: falhados,
  });
  // Os CINCO estados de transmissão, 2 cada. A primeira versão tinha três
  // estados com um registro cada — e ainda deixava 'enviando' e 'falhou' de
  // fora por completo, que é o tipo de omissão que só a medição pega.
  const transmissoes = await inserir("aba_messaging", "transmissoes", [
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Campanha de retorno", nome_modelo: "reativacao_cliente", idioma_modelo: "pt_BR", status: "rascunho", agendado_para: null, total_destinatarios: 0, ...contadores() },
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Convite para avaliação", nome_modelo: "reativacao_cliente", idioma_modelo: "pt_BR", status: "rascunho", agendado_para: null, total_destinatarios: 0, ...contadores() },
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Aviso de recesso", nome_modelo: "lembrete_atendimento", idioma_modelo: "pt_BR", status: "agendada", agendado_para: iso(dia(5)), total_destinatarios: 3, ...contadores() },
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Lembrete de retorno trimestral", nome_modelo: "lembrete_atendimento", idioma_modelo: "pt_BR", status: "agendada", agendado_para: iso(dia(9)), total_destinatarios: 4, ...contadores() },
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Disparo em andamento", nome_modelo: "promocao_verao", idioma_modelo: "pt_BR", status: "enviando", agendado_para: null, total_destinatarios: 6, ...contadores(2, 1, 0, 0, 0) },
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Aviso de horário especial", nome_modelo: "lembrete_atendimento", idioma_modelo: "pt_BR", status: "enviando", agendado_para: null, total_destinatarios: 5, ...contadores(3, 2, 1, 0, 0) },
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Promoção de verão", nome_modelo: "promocao_verao", idioma_modelo: "pt_BR", status: "enviada", agendado_para: null, total_destinatarios: 6, ...contadores(6, 5, 4, 2, 1) },
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Campanha de indicação", nome_modelo: "reativacao_cliente", idioma_modelo: "pt_BR", status: "enviada", agendado_para: null, total_destinatarios: 4, ...contadores(4, 4, 3, 1, 0) },
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Disparo interrompido", nome_modelo: "promocao_verao", idioma_modelo: "pt_BR", status: "falhou", agendado_para: null, total_destinatarios: 5, ...contadores(1, 0, 0, 0, 4) },
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Campanha sem modelo aprovado", nome_modelo: "modelo_antigo", idioma_modelo: "pt_BR", status: "falhou", agendado_para: null, total_destinatarios: 3, ...contadores(0, 0, 0, 0, 3) },
  ]);
  await inserir(
    "aba_messaging",
    "destinatarios_transmissao",
    [
      ["pendente", 0], ["pendente", 1], ["enviado", 2], ["enviado", 3],
      ["entregue", 0], ["entregue", 1], ["lido", 2], ["lido", 3],
      ["respondido", 4], ["respondido", 5], ["falhou", 0], ["falhou", 1],
    ].map(([status, i], k) => ({
      transmissao_id: transmissoes[k < 2 ? 2 : 6].id,
      contato_id: contatos[i].id,
      status,
      mensagem_erro: status === "falhou" ? "Número sem WhatsApp ativo" : null,
    })),
  );
  log("mensageria: 6 contatos · 6 conversas (3 estados) · 20 mensagens · 16 modelos (8 estados) · 10 transmissões (5 estados) · 12 destinatários (6 estados)");

  // ================================================================ AUTOMAÇÕES
  const automacoes = await inserir("aba_automations", "automacoes", [
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Boas-vindas a novo contato", tipo_gatilho: "primeira_mensagem_recebida", ativo: true, descricao: "Responde a primeira mensagem fora do horário." },
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Palavra-chave: orçamento", tipo_gatilho: "palavra_chave", config_gatilho: { palavras: ["orçamento", "preço", "valor"] }, ativo: true },
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Reativação manual", tipo_gatilho: "manual", ativo: false },
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Pós-atendimento (em revisão)", tipo_gatilho: "manual", ativo: false },
    // Segundo registro de cada gatilho: os 3 tipos precisam de 2 cada.
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Primeiro contato fora do horário", tipo_gatilho: "primeira_mensagem_recebida", ativo: false, descricao: "Variante para fim de semana." },
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Palavra-chave: cancelar", tipo_gatilho: "palavra_chave", config_gatilho: { palavras: ["cancelar", "desmarcar"] }, ativo: true },
  ]);
  await inserir("aba_automations", "automacao_etapas", [
    { automacao_id: automacoes[0].id, tipo_etapa: "enviar_mensagem", config_etapa: { texto: "Olá! Recebemos sua mensagem." }, posicao: 1 },
    { automacao_id: automacoes[0].id, tipo_etapa: "condicao", config_etapa: { campo: "horario", operador: "fora_expediente" }, posicao: 2 },
    { automacao_id: automacoes[0].id, etapa_pai_id: null, ramo: "sim", tipo_etapa: "enviar_mensagem", config_etapa: { texto: "Retornaremos no próximo dia útil." }, posicao: 3 },
    { automacao_id: automacoes[0].id, etapa_pai_id: null, ramo: "nao", tipo_etapa: "encaminhar", config_etapa: {}, posicao: 4 },
    { automacao_id: automacoes[1].id, tipo_etapa: "enviar_mensagem", config_etapa: { texto: "Envio a tabela de valores." }, posicao: 1 },
    { automacao_id: automacoes[1].id, tipo_etapa: "definir_tag", config_etapa: { tag: "Interesse em orçamento" }, posicao: 2 },
  ]);

  const fluxos = await inserir("aba_automations", "fluxos", [
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Triagem de primeiro contato", tipo_gatilho: "primeira_mensagem_recebida", status: "ativo", politica_fallback: { tentativas: 2, acao: "encaminhar" } },
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Agendamento guiado", tipo_gatilho: "palavra_chave", config_gatilho: { palavras: ["agendar", "horário"] }, status: "ativo" },
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Pesquisa de satisfação", tipo_gatilho: "manual", status: "rascunho" },
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Fluxo de campanha 2025", tipo_gatilho: "manual", status: "arquivado" },
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Retorno pós-procedimento", tipo_gatilho: "manual", status: "rascunho" },
    { account_id: conta, criado_por: equipe.owner.userId, nome: "Campanha antiga (2024)", tipo_gatilho: "manual", status: "arquivado" },
  ]);
  for (const f of fluxos.slice(0, 2)) {
    await inserir("aba_automations", "fluxo_nos", [
      { fluxo_id: f.id, chave_no: "inicio", tipo_no: "inicio", config: {}, posicao_x: 0, posicao_y: 0 },
      { fluxo_id: f.id, chave_no: "menu", tipo_no: "enviar_botoes", config: { texto: "Como posso ajudar?", botoes: ["Agendar", "Valores", "Falar com atendente"] }, posicao_x: 0, posicao_y: 1 },
      { fluxo_id: f.id, chave_no: "coleta", tipo_no: "coletar_entrada", config: { variavel: "servico_desejado" }, posicao_x: 0, posicao_y: 2 },
      { fluxo_id: f.id, chave_no: "encaminha", tipo_no: "encaminhar", config: {}, posicao_x: 0, posicao_y: 3 },
      { fluxo_id: f.id, chave_no: "fim", tipo_no: "fim", config: {}, posicao_x: 0, posicao_y: 4 },
    ]);
  }
  await inserir(
    "aba_automations",
    "fluxo_execucoes",
    [["ativa", 0], ["ativa", 1], ["concluida", 2], ["concluida", 3], ["encaminhada", 4], ["encaminhada", 5], ["expirada", 0], ["expirada", 1], ["pausada_por_agente", 2], ["pausada_por_agente", 3], ["falhou", 4], ["falhou", 5]].map(
      ([status, i]) => ({
        fluxo_id: fluxos[Number(i) % 2].id,
        account_id: conta,
        conversa_id: conversas[Number(i)].id,
        status,
        no_atual_chave: status === "ativa" ? "menu" : "fim",
        variaveis: {},
        finalizado_em: status === "ativa" ? null : iso(dia(-2)),
        motivo_fim: status === "falhou" ? "Erro ao chamar o provedor" : null,
      }),
    ),
  );
  log("automações: 6 automações (3 gatilhos x2) · 6 etapas · 6 fluxos (3 estados) · 10 nós · 12 execuções (6 estados)");

  // ================================================================ IA
  // `chave_api` é NOT NULL e cifrada em repouso. A demonstração NÃO leva
  // chave de verdade (bring-your-own-key, docs/00): entra um marcador
  // inequívoco e o agente nasce DESLIGADO, para a tela mostrar o módulo
  // configurado sem fingir que responderia.
  // O aceite do termo de tratamento de dados é o portão da Subetapa 02.11:
  // sem ele a tela `1l` para no aviso e não mostra o módulo. Numa vitrine
  // interessa ver o agente configurado — o portão continua existindo e
  // aparece para qualquer conta nova. Registro fictício, de usuário
  // fictício, como todo o resto deste seed.
  await inserir("aba_ai", "aceites_termo_ia", [
    { account_id: conta, usuario_id: equipe.owner.userId, versao_termo: "2026-08-19.1", aceito_em: iso(dia(-40)) },
  ]);

  await inserir("aba_ai", "ia_configuracoes", [
    {
      account_id: conta, criado_por: equipe.owner.userId,
      provedor: "openrouter", modelo: "meta-llama/llama-3.3-70b-instruct:free",
      chave_api: "DEMONSTRACAO-SEM-CHAVE-REAL",
      prompt_sistema: "Você atende uma clínica de estética. Seja cordial e objetivo. Nunca prometa resultado clínico.",
      ativo: false, resposta_automatica_ativa: false,
      pode_consultar_horarios: true, pode_criar_agendamento: false,
      pode_ler_prontuario: false, pode_conceder_desconto: false,
      horario_atuacao: "24h · humano das 09h às 18h",
    },
  ]);

  const docs = await inserir("aba_ai", "ia_documentos_conhecimento", [
    { account_id: conta, criado_por: equipe.owner.userId, titulo: "Tabela de preços", conteudo: "A limpeza de pele profunda custa R$ 180,00 e dura 60 minutos. O peeling de diamante custa R$ 220,00." },
    { account_id: conta, criado_por: equipe.owner.userId, titulo: "Política de cancelamento", conteudo: "Cancelamentos com menos de 24 horas de antecedência são cobrados pela metade do valor da sessão." },
    { account_id: conta, criado_por: equipe.owner.userId, titulo: "Horário de funcionamento", conteudo: "A clínica atende de segunda a sexta, das 9h às 18h. Não abrimos aos sábados." },
  ]);
  await inserir(
    "aba_ai",
    "ia_trechos_conhecimento",
    docs.flatMap((d, i) => [
      { documento_id: d.id, account_id: conta, indice_trecho: 0, conteudo: d.titulo + " — " + ["A limpeza de pele profunda custa R$ 180,00 e dura 60 minutos.", "Cancelamento com menos de 24 horas é cobrado pela metade.", "Atendemos de segunda a sexta, das 9h às 18h."][i] },
    ]),
  );
  await inserir("aba_ai", "ia_log_uso", [
    { account_id: conta, conversa_id: conversas[0].id, modo: "resposta_automatica", provedor: "openrouter", modelo: "meta-llama/llama-3.3-70b-instruct:free", tokens_prompt: 267, tokens_resposta: 279, criado_em: iso(dia(-3)) },
    { account_id: conta, conversa_id: conversas[1].id, modo: "resposta_automatica", provedor: "openrouter", modelo: "meta-llama/llama-3.3-70b-instruct:free", tokens_prompt: 210, tokens_resposta: 188, criado_em: iso(dia(-2)) },
    { account_id: conta, conversa_id: conversas[2].id, modo: "rascunho", provedor: "openrouter", modelo: "meta-llama/llama-3.3-70b-instruct:free", tokens_prompt: 180, tokens_resposta: 140, criado_em: iso(dia(-1)) },
    { account_id: conta, conversa_id: conversas[3].id, modo: "rascunho", provedor: "openrouter", modelo: "meta-llama/llama-3.3-70b-instruct:free", tokens_prompt: 155, tokens_resposta: 96, criado_em: iso(dia(0)) },
  ]);
  log("IA: agente configurado e DESLIGADO (sem chave real) · 3 documentos · 3 trechos · 4 registros de uso (2 modos)");
}
