# 05 — Caminhos e funcionalidades

Layout é metade do trabalho; a outra metade é **quantos passos custa fazer a coisa**. Este
documento é sobre a segunda: os caminhos que todo CRM comercial oferece e que o Vitrine
ainda não tem, ordenados por quanto tempo devolvem a quem usa o produto oito horas por dia.

Nada aqui exige schema novo. Tudo se apoia em tabela que já existe.

---

## 1. Busca global — o item de maior retorno do dossiê inteiro

**Resolve N03.**

Hoje, para abrir a ficha de uma cliente: clicar em Pessoas → escolher a aba → paginar até
achar. Três a oito interações. Com busca global: `⌘K`, digitar três letras, `Enter`. Duas.

Multiplique por 40 vezes ao dia, por recepcionista.

### O que ela busca, em ordem de frequência

| Fonte | Campos | Por quê primeiro |
|---|---|---|
| **Pessoas** | nome, telefone, e-mail | 80% das buscas num CRM de clínica |
| **Agendamentos** | pessoa + serviço + data | "a Helena de terça" |
| **Negócios** | título, pessoa | funil |
| **Ir para** | os 9 módulos | navegação por teclado |
| **Ações** | "Nova pessoa", "Novo agendamento" | criar sem sair de onde está |

### O detalhe que decide se ela é boa ou frustrante: telefone

Numa clínica, metade das buscas é por telefone, e o telefone vem digitado de seis formas
diferentes. Buscar `ILIKE '%9988%'` contra `(11) 99988-7766` **não acha**. A solução é uma
coluna gerada com só os dígitos:

```sql
-- ilustrativo; a migration de verdade é decisão de outra sessão
ALTER TABLE aba_people.pessoas
  ADD COLUMN telefone_digitos text
  GENERATED ALWAYS AS (regexp_replace(coalesce(telefone,''), '\D', '', 'g')) STORED;
CREATE INDEX ON aba_people.pessoas (telefone_digitos text_pattern_ops);
```

O mesmo vale para nome com acento: `unaccent` no lado do banco, ou normalizar a busca no
cliente. "jose" precisa achar "José" — se não achar, o usuário conclui em dois dias que a
busca não funciona e volta a paginar.

### Como não virar "chrome decorativo"

`AppShell.tsx` recusou a busca global com um bom argumento: UI sem função é UI falsa. **A
forma de honrar isso é entregar a busca já funcionando com uma fonte só** — Pessoas. Um
campo que busca pessoas de verdade é honesto; um campo que busca nada não é. As outras
fontes entram depois, uma por vez.

E a RLS já protege o resultado: a busca roda como o usuário logado, então ela nunca devolve
o que ele não poderia ver na lista. A régua continua sendo `access.can()`/RLS, nunca o front.

---

## 2. Ações em massa

**Resolve T02.** Os checkboxes já estão na tela e não levam a nada.

As quatro ações que valem para Pessoas: **etiquetar**, **atribuir a profissional**,
**exportar CSV**, **arquivar**. Três regras que separam uma boa implementação de uma
irritante:

1. **A seleção sobrevive à paginação** — ou a barra diz claramente que não sobrevive.
   Selecionar 25, virar a página e perder a seleção sem aviso é o pior dos dois mundos.
2. **"Selecionar todos os 800"** aparece quando a página inteira está marcada, e é uma ação
   explícita, nunca automática.
3. **Toda ação em massa é desfazível** por 8 segundos, ou pede confirmação nomeando o
   escopo ("Arquivar 34 pessoas?"). Sem uma das duas, é acidente esperando acontecer.

---

## 3. Desfazer

**Resolve E02.** Não existe toast nem undo no produto.

O padrão que funciona é **otimista**: a interface aplica a mudança na hora, mostra
"Etiqueta aplicada a 12 pessoas · **Desfazer**" por 8 segundos, e só então consolida. Para
o usuário, tudo é instantâneo; para o dado, existe uma janela de arrependimento.

Onde importa mais, em ordem: excluir pessoa · arquivar em massa · marcar negócio como perdido
· cancelar atendimento · excluir anexo de prontuário.

**A exceção deliberada é `aba_health`.** Prontuário tem regime próprio (`CLAUDE.md` §5), e
registro clínico não se apaga — se corrige com nova evolução, preservando o histórico. Ali o
padrão certo não é "desfazer", é **não permitir a exclusão em primeiro lugar**, com trilha de
quem alterou o quê e quando. Vale a pena registrar isso explicitamente antes de alguém
generalizar o `undo` para todas as telas.

---

## 4. Visões salvas

**Resolve T01 (metade).** As abas de recorte já são visões salvas — fixas, definidas por
quem programou. O passo seguinte é o usuário criar as dele.

"Leads sem contato há 15 dias", "Clientes da Aline", "Pacotes vencendo este mês". Cada uma é
um conjunto de filtros com um nome. É o que Attio, Pipedrive e HubSpot chamam de *views*, e é
o que faz o CRM parar de ser um banco de dados com tabela e virar a ferramenta de trabalho
de cada pessoa da equipe.

Custo: uma tabela pequena (`nome`, `modulo`, `filtros jsonb`, `compartilhada`), que cabe no
schema do módulo. E um degrau intermediário barato antes disso: **guardar em `localStorage`
o último filtro usado por módulo**, para a tela reabrir onde o usuário parou.

---

## 5. Atalhos de teclado

**Resolve parte de E04.** Não custa peso e é o que faz a recepção operar rápido.

| Tecla | Ação | Escopo |
|---|---|---|
| `⌘K` / `Ctrl+K` | busca global | global |
| `/` | foca a busca da tela | qualquer lista |
| `n` | novo registro do módulo atual | lista |
| `j` / `k` | próximo / anterior na lista | lista |
| `Enter` | abre o item em foco | lista |
| `x` | marca/desmarca o item em foco | lista |
| `Esc` | fecha modal, limpa seleção, sai da busca | global |
| `←` / `→` | semana anterior / próxima | agenda |
| `t` | volta para hoje | agenda |
| `?` | mostra esta tabela | global |

Duas regras: **`?` é obrigatório** — atalho que ninguém descobre não existe; e **nenhum
atalho de uma tecla dispara enquanto o foco estiver num campo de texto**, senão digitar
"não" na nota vira "novo registro".

---

## 6. Criar sem sair de onde se está

O caminho para agendar uma cliente hoje: sair da ficha → ir à Agenda → achar o dia → criar →
buscar a pessoa de novo. Cinco passos, e o contexto se perde no meio.

O padrão do mercado é **criar no lugar**: um modal ou painel lateral que abre por cima do
contexto, já com o que se sabe preenchido. "Agendar" na ficha da Helena abre o formulário
com a Helena já escolhida. É a mesma tela de criação, invocada de outro lugar — não é código
novo, é onde o botão vive.

As três combinações que mais economizam num CRM de clínica:
- **Ficha da pessoa → agendar** (com a pessoa preenchida)
- **Agenda → nova pessoa** (quando quem liga ainda não é cadastrada)
- **Conversa do WhatsApp → agendar** (com a pessoa da conversa preenchida)

---

## 7. Painel que leva a algum lugar

**Resolve D01.** Todo número do painel deve ser um link para a lista que o produziu, já
filtrada. "2 cobranças vencidas" → `/financeiro?status=vencido`. "4 anamneses não
preenchidas" → a lista daquelas quatro pessoas.

Isso muda o que o painel é: de relatório para **fila de trabalho**. E é barato — as listas
já existem e já aceitam filtro; falta a URL carregar o filtro e o número virar `<a>`.

---

## 8. Duas funcionalidades de contexto clínico que o mercado tem e o Vitrine ainda não

Levantadas na pesquisa dos verticais brasileiros de estética e odontologia
(`referencias/CATALOGO.md`). Nenhuma das duas está no escopo do v01 — ficam registradas como
matéria-prima para o backlog, não como recomendação de fazer agora.

**Foto antes/depois presa à evolução.** É o recurso que Belle, Simples Agenda e Trinks
destacam primeiro em estética, porque é o que a cliente quer ver e o que a clínica usa para
vender pacote. `aba_health` já tem anexos e `Storage` com URL assinada de 60s
(`features/health/api.ts`) — o que falta é o par lado a lado com data, não a infraestrutura.

**Assinatura do termo de consentimento na recepção.** O wireframe `1h` já prevê a aba
"Consentimentos". Simples Dental vende assinatura em tablet como diferencial. É o tipo de
funcionalidade que fecha venda numa clínica, porque resolve um problema jurídico real.

Ambas são `+1.0` e ambas dependem de decisão de Max — entram aqui só porque um dossiê de UX
que ignora o que o concorrente vende está incompleto.

---

## Ordenado por retorno

| | Caminho | Devolve | Custo |
|---|---|---|---|
| 1 | **Busca global + `⌘K`** | 3–6 interações, ~40×/dia | médio |
| 2 | **Painel clicável** | tira o relatório do caminho | baixo |
| 3 | **Criar no lugar** | 5 passos → 2, nos 3 fluxos mais comuns | baixo |
| 4 | **Desfazer** | rede de segurança sobre dado de cliente | baixo |
| 5 | **Ações em massa** | operação de 40 itens vira uma | médio |
| 6 | **Atalhos de teclado** | velocidade de quem usa o dia todo | baixo |
| 7 | **Visões salvas** | o CRM vira ferramenta pessoal | médio |
| 8 | **Último filtro em `localStorage`** | reabrir onde parou | trivial |
