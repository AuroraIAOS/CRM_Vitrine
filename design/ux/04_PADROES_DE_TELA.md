# 04 — Padrões de tela

Uma receita por arquétipo. Um CRM tem sete arquétipos de tela e dezesseis telas — se cada
arquétipo tiver um padrão, as dezesseis ficam coerentes de graça, e a décima sétima nasce
pronta.

Todos os desenhos abaixo estão renderizados e funcionando em [`prototipo.html`](prototipo.html).

---

## 1. O shell: navegação, e o fim do `aba_`

**Resolve N01, N02, N05.**

### Os rótulos

Os nomes de schema (`ABA_PEOPLE`, `ABA_SCHEDULING`…) saem da tela. O que fica são **grupos
por trabalho**, que é como o usuário organiza o dia — não por módulo de software:

| Grupo | Itens | Schema por trás (invisível) |
|---|---|---|
| **Atendimento** | Agenda · Prontuário | `aba_scheduling`, `aba_health` |
| **Relacionamento** | Pessoas · Mensagens | `aba_people`, `aba_messaging` |
| **Comercial** | Funil · Catálogo · Financeiro | `aba_sales`, `aba_catalog`, `aba_finance` |
| **Automação** | Fluxos · Agente de IA | `aba_automations`, `aba_ai` |

Quatro grupos em vez de nove cabeçalhos — a sidebar encolhe e passa a ter hierarquia. O
mapa `moduleKey → { grupo, rótulo }` mora ao lado de `nav.ts` e é a única mudança necessária;
`access.readable_modules()` continua sendo a régua do que aparece.

Duas notas de coerência com o que já está decidido:
- A **ordem** dentro de cada grupo respeita `docs/01` §7.1 (a ordem do wireframe é a fonte de
  verdade), e o agrupamento não a altera — só a envelopa.
- "Vendas" vira **"Funil"**: é o nome que o usuário usa para aquela tela, e "Vendas" já é
  ambíguo com o Financeiro.

### O topo da sidebar é do cliente, não do software

Onde hoje está "CRM Vitrine" deve estar a marca do CRM-filho (logo + nome da conta). É o item
"Identidade visual por conta" do backlog, e a sidebar é onde ele aparece. Enquanto não
houver, o nome da conta já resolve — e já é mais útil que o nome do software.

### O header ganha função

56px hoje ocupados por um avatar. O que deve morar ali, da esquerda para a direita:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [🔍 Buscar pessoa, negócio, atendimento…        ⌘K ]     [🔔 3]  [avatar] │
└──────────────────────────────────────────────────────────────────────────┘
```

E nada além disso. O `AppShell.tsx` está certo ao recusar "chrome decorativo sem função" — os
botões "Período" e "Filtros" do wireframe pertencem ao cabeçalho de página, onde há contexto
para eles, não ao header global.

### Colapso

Sidebar de 236px → faixa de 60px só de ícones, com o rótulo em tooltip. Estado guardado em
`localStorage`, custo zero. Em telas abaixo de 1024px, colapsa por padrão.

---

## 2. Tela de lista (Pessoas, Catálogo, Financeiro, Prontuário)

**Resolve T01–T05, N04.**

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Pessoas                                          [ Importar ]  [+ Nova ]  │  PageHeader
│  31 cadastradas                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│  Todas·31   Leads·12   Clientes·10   Equipe·7   Fornecedores·2             │  recorte
├────────────────────────────────────────────────────────────────────────────┤
│  [🔍 Buscar…]   [Vínculo ▾] [Tag ▾] [+ Filtro]        [⚏ Densidade] [⚙]    │  FilterBar
├────────────────────────────────────────────────────────────────────────────┤
│  ☐ │ NOME ↑        │ VÍNCULO │ CONTATO        │ ÚLTIMO CONTATO │ ⋯         │  thead fixo
│  ☐ │ (HM) Helena…  │ Equipe  │ …@vitrine…     │ há 3 dias      │ ⋯         │
└────────────────────────────────────────────────────────────────────────────┘
│  1–25 de 31        [25 por página ▾]              [‹] 1 2 [›]              │
```

### As sete regras

1. **Uma ação primária**, no cabeçalho de página, sólida. Nunca dentro do card de conteúdo.
2. **Recorte ≠ filtro.** As abas com contagem são recortes salvos (perguntas frequentes); a
   barra de filtro é a pergunta de agora. Misturar os dois é o erro mais comum.
3. **`thead` fixo.** `position: sticky; top: 0` — sem isso, rolar perde a coluna.
4. **Seleção revela ação.** Marcar o primeiro item substitui o `thead` pela barra de ações em
   massa: "3 selecionadas · Etiquetar · Atribuir · Exportar · Arquivar", com um "Selecionar
   todas as 31" quando a página inteira estiver marcada.
5. **Ordenação no cabeçalho**, com a seta indicando direção e a coluna ordenada em destaque.
6. **A linha inteira é o alvo** de abrir o registro; o kebab do fim para o resto. Nunca fazer
   do nome um link estreito de 80px quando há uma linha de 1200px disponível.
7. **Número à direita, texto à esquerda**, com `tabular-nums` (`02_FUNDACAO_VISUAL.md` §9).

### Colunas

Conjunto padrão enxuto (5–6), o resto atrás do ⚙. **Coluna que nunca tem dado não é coluna
padrão** (T03). "Último contato" — que hoje não existe — vale mais que "Criado em" em quase
todo CRM: a pergunta operacional é "de quem eu não cuido há tempo demais", não "quem entrou
primeiro".

---

## 3. Tela de funil (kanban)

**Resolve K01–K04.**

### Anatomia do card

O card de hoje gasta suas três linhas repetindo a coluna. O que ele deve dizer:

```
┌────────────────────────────────────┐
│ Patrícia Lima                  ⋯   │  ← quem (14px, semibold)
│ R$ 1.150,00                        │  ← quanto (14px, tabular-nums)
│ ● Retorno em 2 dias                │  ← próxima ação + quando
│ (AP)                    14 dias    │  ← dono (avatar) + tempo na etapa
└────────────────────────────────────┘
```

**Tempo na etapa é o campo que falta e o que mais importa** (K03). Ele muda de cor sozinho e
vira o sistema de alerta do funil:

| Dias na etapa | Tratamento |
|---|---|
| ≤ metade da média da etapa | cinza, discreto |
| até a média | neutro |
| acima da média | âmbar |
| mais que o dobro | terracota + o card ganha barra na borda esquerda |

Isso responde "o que está travado?" sem relatório nenhum, e o dado já existe — é a data da
última mudança de etapa.

### O cabeçalho da coluna

`Negociação · 4 · R$ 3.790,00` já está certo. Falta só a barra de proporção sob o título
(a fatia daquela etapa no total em aberto), que transforma cinco números em uma forma.

### As ações de desfecho

"Ganha"/"Perdida" saem do corpo do card (K02) e vão para o kebab e para o hover. **"Perdida"
abre um seletor de motivo** — preço, prazo, concorrente, sem resposta, sem perfil. Sem motivo
de perda, nenhuma análise de funil é possível, e é a única coisa que o funil precisa coletar
que a agenda não coleta.

### Coluna vazia

Contorno tracejado com "Arraste um negócio para cá" — que é também a única pista de que os
cards são arrastáveis. E a altura da coluna acompanha o conteúdo, com rolagem própria a
partir de ~8 cards; nunca 1.000px fixos (K04).

---

## 4. Agenda semanal

**Resolve A01–A04.** É a tela mais crítica e a que tem o defeito mais grave.

### O algoritmo de colisão (A01)

Clássico, `O(n log n)`, sem biblioteca. Três passos:

```ts
type Bloco = { inicio: number; fim: number; coluna?: number; total?: number };

export function alocarColunas(blocos: Bloco[]): Required<Bloco>[] {
  const ordenados = [...blocos].sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);
  const saida: Required<Bloco>[] = [];
  let grupo: Required<Bloco>[] = [];   // blocos que se tocam entre si
  let fimDoGrupo = -Infinity;

  const fecharGrupo = () => {
    const largura = Math.max(...grupo.map((b) => b.coluna)) + 1;
    grupo.forEach((b) => (b.total = largura));   // 2ª regra: quem colide tem a MESMA largura
    saida.push(...grupo);
    grupo = [];
  };

  for (const bloco of ordenados) {
    if (bloco.inicio >= fimDoGrupo && grupo.length) fecharGrupo();
    // primeira coluna livre: nenhuma outra do grupo naquela coluna ainda está aberta
    let coluna = 0;
    while (grupo.some((b) => b.coluna === coluna && b.fim > bloco.inicio)) coluna++;
    grupo.push({ ...bloco, coluna, total: 0 });
    fimDoGrupo = Math.max(fimDoGrupo, bloco.fim);
  }
  if (grupo.length) fecharGrupo();
  return saida;
}
```

E o posicionamento, que é só aritmética:

```css
.bloco {
  left:  calc(var(--coluna) / var(--total) * 100%);
  width: calc(100% / var(--total) - 2px);
}
```

As três invariantes que definem "certo" (e que valem como teste):
1. **Nenhum bloco cobre outro.** Nunca.
2. **Blocos que colidem têm a mesma largura** — sem isso o olho lê hierarquia onde não há.
3. **Cada bloco usa a maior largura possível**, respeitando a regra 2.

> **Está implementado e testado**, não é pseudocódigo:
> [`referencias/alocar_colunas.mjs`](referencias/alocar_colunas.mjs) traz a função completa e
> uma suíte que verifica as três invariantes contra os seis casos que a agenda real produz —
> dois em paralelo (o bug de A01), cadeia A-B-C, três profissionais simultâneos, bloqueio
> longo atravessando compromissos curtos, nenhuma colisão, e adjacência exata. Rodar com
> `node design/ux/referencias/alocar_colunas.mjs`; os seis passam.
>
> O caso da **cadeia A-B-C** é o que quebra implementações ingênuas: A colide com B, B colide
> com C, mas A não colide com C. Os três formam **um só** grupo e ficam com 50% cada — A e C
> dividem a coluna 0 porque não se tocam. Uma implementação que agrupasse só por par
> daria larguras diferentes a A e B, violando a invariante 2.

Dois blocos em paralelo ficam com ~48% cada, o que é largura suficiente para nome e serviço
na escala tipográfica proposta. A partir de quatro simultâneos, o bloco vira só a hora e a
inicial, com o resto no popover — que é o que o Google Calendar faz.

### Os outros três

- **Linha do "agora"** (A02): 2px na cor de destaque, atravessando a coluna do dia atual,
  com uma bolinha na régua de horas. `setInterval` de 60s.
- **Legenda que filtra** (A03): as bolinhas de profissional viram `checkbox` (`aria-pressed`).
  Clicar isola; `alt`+clicar isola só aquele. Estado em `localStorage`.
- **Faixa e fim de semana** (A04): horário de funcionamento por conta (07–19h vira 08–18h e
  já devolve 2 faixas), e sábado/domingo em coluna estreita que expande ao clique — a menos
  que haja compromisso neles, quando nascem abertos.

### Interação que falta e é barata

Arrastar o bloco para remarcar, e arrastar a borda inferior para mudar a duração. O `dnd-kit`
já está instalado. É o gesto que a recepção espera de qualquer agenda desde 2010.

---

## 5. Caixa de entrada (mensagens)

**Resolve M01–M04.** Três painéis, e o do meio é o que trabalha.

### A janela de 24 horas é o elemento organizador (M02)

Ela aparece em dois lugares:

**Na lista**, como um pequeno indicador ao lado do tempo:
```
Ana Beatriz          🟢 18h        ← dentro da janela, 18h restantes
Carlos Eduardo       🟠 2h         ← janela fechando
Daniela              ⚪ fechada    ← só template
```

**No compositor**, mudando o que a caixa de texto é:
- **Dentro da janela:** campo de texto normal, com a contagem regressiva discreta no canto.
- **Fora da janela:** o campo é **substituído** por um seletor de template aprovado, com a
  explicação em uma linha ("A janela de 24h fechou. Só é possível enviar um template
  aprovado pela Meta."). Não desabilitar o campo em silêncio — o usuário precisa saber
  *por quê*, ou vai achar que o sistema quebrou.

A honestidade que o projeto já pratica em outros lugares (`README.md`: "registrando no log o
passo que não executa em vez de fingir sucesso") aplicada aqui: **é melhor a interface dizer
que não pode do que deixar o atendente descobrir pelo erro da Meta.**

### O resto

- **Pré-selecionar a primeira conversa** ao abrir (M01). Painel de contexto nunca vazio.
- **Filtros** na lista: `Não lidas` · `Minhas` · `Sem resposta` · `Janela aberta` (M04).
- **Estado da conexão** no topo, como `StatusIndicator`, não como link solto (M03).
- **"IA respondendo"** — o wireframe `1j` previa esse indicador. É importante: o atendente
  precisa ver que o agente está no controle daquela conversa antes de digitar por cima.

---

## 6. Ficha de registro (pessoa, negócio, prontuário)

**Resolve E03, D01 (parcial).** É a tela onde o usuário passa mais tempo e a que hoje está
mais vazia.

```
┌──────────────────────────────────────────────────────┬──────────────────────┐
│ (HM) Helena Marques  [Equipe]                        │  Próximo             │
│      📞 (11) 9… · ✉ helena@…                         │  Ter 24/08 · 14h     │
│      [💬 WhatsApp] [📅 Agendar] [💰 Cobrar]  [Editar] │  Limpeza de pele     │
├──────────────────────────────────────────────────────┤                      │
│ Linha do tempo │ Prontuário │ Financeiro │ Documentos │  Notas internas      │
├──────────────────────────────────────────────────────┤  ┌────────────────┐  │
│  HOJE                                                │  │ Escrever nota… │  │
│  14:02  Mensagem enviada — confirmação de horário    │  └────────────────┘  │
│  ONTEM                                               │                      │
│  09:15  Atendimento concluído — Peeling              │  Tags                │
└──────────────────────────────────────────────────────┴──────────────────────┘
```

Quatro decisões:

1. **Ações rápidas no cabeçalho.** WhatsApp, agendar, cobrar. São as três coisas que se faz
   com uma pessoa num CRM de clínica; hoje exigem sair da ficha e ir a outro módulo.
2. **Contato é clicável** — `tel:` e link direto de WhatsApp. E "sem telefone" não é lápide:
   é um botão "+ Adicionar telefone".
3. **A coluna direita começa pelo que é urgente** (próximo atendimento, pendência), não pelo
   campo de nota vazio. Nota é importante, mas não é a primeira pergunta de quem abre a ficha.
4. **Linha do tempo agrupada por dia**, com o dia como cabeçalho fixo ("HOJE", "ONTEM",
   "12 de agosto") e ícone por tipo de evento. E filtro por tipo quando passar de ~20 eventos.

---

## 7. Painel (dashboard)

**Resolve D01–D04.**

- **Todo KPI é um link.** "7 novos leads" abre `/pessoas?vinculo=lead&periodo=30d`. Sem isso,
  o painel informa mas não trabalha (D01).
- **Um seletor de período global** no cabeçalho de página, que rege todos os cartões. Hoje
  cada cartão tem sua janela em letra miúda ("últimos 30 dias", "semana corrente", "mês
  corrente") — três janelas diferentes lado a lado impedem qualquer comparação mental.
- **Gráfico com eixo.** Três linhas de grade rotuladas, valor no hover, e o último ponto
  sempre destacado (D03).
- **Cor neutra para dado neutro.** Ocupação não é sucesso (D04) — `--chart-1` ou `--chart-4`.
- **A hierarquia da NN/g:** um número responde "está tudo bem?"; o resto se alcança
  clicando. Quatro KPIs, dois gráficos e três listas é o limite antes de o painel virar
  papel de parede.
- **Delta sem base:** quando não houver comparação, usar a linha para o dado que sustenta o
  número ("0 de 6 agendados hoje") em vez de "sem base de comparação" (D02).

---

## 8. Formulário

Não há tela de formulário nas capturas, mas há formulário em quase toda tela. As regras que
evitam retrabalho:

- **Rótulo sempre visível, acima do campo.** Nunca só placeholder — ele some quando se
  digita, e é a causa nº 1 de erro em formulário longo.
- **Coluna única.** Formulário em duas colunas dobra o erro de preenchimento em qualquer
  estudo sério; a exceção são pares naturalmente curtos (CEP+UF, data+hora).
- **Erro abaixo do campo**, em texto, com o campo marcado por `aria-invalid` e
  `aria-describedby`. Nunca só a borda vermelha: cor sozinha não é informação acessível.
- **Validar ao sair do campo**, não a cada tecla. Validar enquanto se digita acusa erro em
  e-mail incompleto e treina o usuário a ignorar o aviso.
- **Botão primário à direita, "Cancelar" como texto à esquerda.** E o primário desabilitado
  enquanto salva, com o rótulo mudando para "Salvando…".
- **Ação destrutiva pede confirmação com o nome do alvo** ("Excluir Helena Marques?"), e o
  botão de confirmação diz o verbo ("Excluir"), nunca "OK".
