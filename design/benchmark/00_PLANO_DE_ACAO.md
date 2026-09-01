# Plano de Ação — Benchmark de concorrentes em Odontologia

Aprovado por Max em **2026-08-31**. Executado no bench `bench/benchmark-odonto`.
**Este trabalho não altera o produto.** Nada fora de `design/benchmark/` é tocado, e o CODE
não funde este bench em `main` (`CLAUDE.md` §13).

---

## 1. Por que este benchmark existe

O dossiê de UX/UI está fechado (`design/ux/`, 7 documentos + protótipo) e as **três versões
completas** de aplicação estão prontas para escolha (`design/ux/versoes/`, 19 capturas). Falta
a escolha final — e, hoje, ela seria feita só com referência de CRM **genérico**: Attio,
Pipedrive, HubSpot, Zoho e RD Station, conforme `design/ux/referencias/CATALOGO.md`. Nenhum
desses vende para clínica odontológica.

O CRM Vitrine será vendido para o ramo odontológico, e o comprador desse mercado já usa (ou já
viu) software vertical — com odontograma, prontuário clínico, integração com convênio, controle
de insumos e um vocabulário próprio. Escolher a UX sem olhar esse mercado é escolher no escuro.

**Resultado pretendido:** benchmark de 8 concorrentes reais, com referência visual, ficha de
funcionalidades, análise comercial e análise jurídica, terminando em (a) lista de recursos a
importar agora e no futuro, (b) faixa de preço praticável e (c) parecer sobre qual das três
versões de UX serve melhor a esse mercado. A decisão continua sendo de Max.

---

## 2. Estrutura da pasta

```
design/benchmark/
├── README.md              porta de entrada: método, aviso de não-implantação, ordem de leitura
├── 00_PLANO_DE_ACAO.md    este arquivo
├── RELATORIO.md           ★ o único relatório — curto e direto, com as 4 seções pedidas
├── capturas/
│   ├── INDICE.md          tabela: arquivo → concorrente → tela → URL de origem → data
│   └── NN_<slug>_<tela>.png       ≥3 por concorrente, ≥24 no total
└── fontes/
    └── COLETA.md          log bruto: todo link visitado, data, o que foi extraído
```

**Por que `COLETA.md` existe:** ele absorve a matéria-prima — citações longas, tabelas de preço
completas, trechos de termo de uso — para que o `RELATORIO.md` possa ser realmente **curto**,
como Max pediu, sem perder rastreabilidade. O relatório afirma; a coleta prova.

---

## 3. Amostra — 5 brasileiros + 3 internacionais

### 3.1 Como os "TOP 3 mais vendidos" serão determinados

Não por opinião, e não pelo que o próprio fornecedor diz de si. O critério é declarado **antes**
da busca e aplicado igual a todos os candidatos, com 5 sinais públicos:

1. Nº de clínicas/usuários declarado no site oficial **e** em release de imprensa datado.
2. Volume de avaliações em Capterra/GetApp/G2 na região Brasil (volume, não nota).
3. Volume de avaliações e instalações do app móvel (Play Store / App Store).
4. Volume de reclamações no ReclameAqui — proxy grosseiro, mas real, de base instalada.
5. Presença em edital ou parceria de entidade do setor (CRO, ABO, redes de franquia).

O ranking aparece no `RELATORIO.md` **com os cinco números lado a lado**, para que Max possa
discordar do ranking olhando o mesmo dado. Onde o sinal não existir, a célula fica vazia —
nunca preenchida por estimativa.

### 3.2 Pool de candidatos (filtrado no passo B1; não é a lista final)

**Brasil — 5 vagas.** Clinicorp · Simples Dental · Dental Office · Odontosys · Dentalis ·
Ninsaúde Apolo · iClinic (módulo odonto) · Doctoralia/Docplanner (camada de captação) ·
Amplimed · Dental Manager.

**Internacional — 3 vagas, ficha mais curta, foco em UX/IA.** Dentrix e Dentrix Ascend (Henry
Schein One) · Curve Dental · Denticon (Planet DDS) · Open Dental (código aberto — o único cujo
software dá para inspecionar de verdade) · Eaglesoft (Patterson) · Weave e NexHealth (camada de
comunicação/CRM sobre o PMS) · Overjet e Pearl (IA de diagnóstico radiológico).

Se um candidato sair (site fora do ar, produto descontinuado, preço 100% sob consulta sem
nenhuma fonte secundária), o substituto vem do mesmo pool e a troca é registrada em `COLETA.md`
com o motivo.

### 3.3 Eixos de extração — os mesmos 4 para todos os 8

| Eixo | O que sai de cada concorrente |
|---|---|
| **A. Estética / UX-UI** | paleta (hex amostrado da captura), logomarca e tom da marca, tipografia, tema claro/escuro, densidade, padrão de navegação (sidebar/topo/abas), arquétipos de tela usados, idioma visual do odontograma |
| **B. Funcionalidades** | mapa de abas/módulos, estrutura de prontuário e anamnese, odontograma e periograma, imagem/RX, uso de IA (onde e para quê), agenda e confirmação, financeiro e convênio/TISS, estoque de materiais e insumos, WhatsApp e redes sociais, portal do paciente, teleodontologia, relatórios, app móvel, API/integrações |
| **C. Comercial** | modelo de cobrança (por usuário / por cadeira / por clínica), faixas e valores publicados, combos e módulos avulsos, taxa de implantação, desconto anual, teste grátis, política de migração de dados, relação preço ÷ funcionalidade |
| **D. Jurídico / bioético** | postura declarada de LGPD (encarregado/DPO, base legal), certificação SBIS/CFM de prontuário eletrônico e nível, guarda e retenção do prontuário, consentimento de imagem, compartilhamento com terceiros e treino de IA, criptografia declarada, cláusula de propriedade do dado clínico no termo de uso, aderência ao Código de Ética Odontológica |

O eixo D é o que nenhum benchmark de CRM genérico entrega, e é onde o Vitrine já tem vantagem
construída — `aba_health` com IBAC, `concessoes_prontuario` e `log_acesso` obrigatório em
leitura **e** escrita. Ele existe para **medir** essa vantagem contra o mercado, não para copiar.

---

## 4. Bloco `[Goal]`

Formato idêntico ao de `docs/00_PLANO_E_CRITERIOS.md`.

**Objetivo:** investigar 8 softwares reais de gestão/CRM para clínicas odontológicas (5 BR,
contendo os 3 mais vendidos do país por critério declarado, + 3 internacionais), extraindo os
4 eixos acima, e publicar em `design/benchmark/` as referências visuais + um único relatório
com: os itens de cada software; o diferencial que sustenta a venda de cada um; a lista de
recursos, tecnologias e UX a incluir agora e em versões futuras; e a análise de preço praticável.

**Conclusão (critério de finalização):** os 8 concorrentes fichados nos 4 eixos; ≥24 capturas em
`capturas/` com `INDICE.md` completo; `RELATORIO.md` com as seções (a)–(e) fechadas, incluindo o
parecer sobre as versões 01/02/03; `COLETA.md` com todo link datado; `git status` mostrando
alteração **exclusivamente** dentro de `design/benchmark/`; commit `docs:` + push no bench.

**Qualidade:**

- **Search-first sem exceção (`CLAUDE.md` §11).** Nada escrito de memória. Toda afirmação leva
  marcação de proveniência no padrão já usado em `design/ux/referencias/CATALOGO.md`:
  `[verificado]` com link e data de consulta · `[conhecido]` · `[a conferir]`.
- **Test-first no preço e no número.** Preço só entra como valor se estiver publicado em página
  pública; caso contrário entra literalmente como "sob consulta" — nunca estimado, nunca
  inferido de concorrente parecido. O mesmo vale para nº de clientes e market share.
- **Nenhuma norma jurídica citada de memória.** Resolução do CFO, exigência de certificação
  SBIS/CFM, prazo de guarda de prontuário e artigo da LGPD só entram com o texto oficial
  conferido na sessão e o link. Norma errada em documento vivo é herdada como verdade por
  sessões futuras — é exatamente o custo medido que motivou `CLAUDE.md` §11.
- **Coleta só de material público.** Site oficial, página de preço, tour de produto, help center,
  imprensa e frames de vídeo público de demonstração. **Sem cadastro, sem login, sem trial, sem
  formulário preenchido com dado de Max.** Informação que só exista atrás de cadastro é
  registrada como indisponível.
- **Uso das capturas.** Material de terceiro para benchmark interno, cada arquivo creditado no
  `INDICE.md` com URL e data. Nenhuma marca, logo ou captura de concorrente é reaproveitada como
  identidade do Vitrine, nem republicada fora deste repositório.
- **Relatório curto de verdade.** `RELATORIO.md` no teto de ~2.500 palavras. O que não couber vai
  para `COLETA.md`. Documento que ninguém lê inteiro não é entrega.
- **Nenhuma alteração fora de `design/benchmark/`.** Nada em `crm/`, `db/`, `supabase/`, `docs/`
  ou `design/ux/`.

**Evidência:** `RELATORIO.md` publicado no bench + `INDICE.md` das capturas + `COLETA.md` com os
links datados + saída de `git status` provando o isolamento da pasta.

**Esforço máximo do /goal:** 4 tentativas.

**Escalonamento de LLM:** Sonnet nas 3 primeiras (coleta, captura e redação das fichas); Opus na
última (síntese, análise de preço, parecer sobre as três versões).

**Se esgotar:** parar e emitir relatório curto (problema + causas + alternativas). Não completar
lacuna com estimativa para "fechar" o entregável.

---

## 5. Execução — 6 passos

| # | Passo | Portão de saída |
|---|---|---|
| **B0** | Preparar o bench: árvore limpa, branch `bench/benchmark-odonto`, esqueleto da pasta com este plano versionado | ✅ concluído em 2026-08-31 |
| **B1** | Definir a amostra com evidência: rodar as buscas de ranking (§3.1) sobre o pool de §3.2, montar a tabela dos 5 sinais, fechar os 5 BR + 3 internacionais | a amostra não avança sem os 5 sinais preenchidos (ou explicitamente vazios) para todo candidato considerado |
| **B2** | Coletar os eixos A–D: site oficial → página de preços → tour/recursos → help center (onde a tela real aparece sem trial) → termo de uso e política de privacidade → imprensa e reviews | tudo em `COLETA.md`, com data |
| **B3** | Capturar as referências visuais (Chrome MCP, janela de largura fixa, comparáveis entre si e com as 19 de `design/ux/versoes/telas/`) | ≥3 por concorrente (marca, tela de produto, preço); `INDICE.md` preenchido no mesmo passo — captura sem procedência é descartada |
| **B4** | Fichar e analisar: os 4 eixos de cada concorrente + o **diferencial** em uma frase — a única frase que explica por que aquele produto é comprado | sem essa frase, a ficha está incompleta |
| **B5** | Sintetizar (passada em Opus) | `RELATORIO.md` com (a)–(e), ver §6 |
| **B6** | Fechar: `README.md` da pasta, conferência dos critérios, commit `docs:` + push, relatar a Max e **parar** | merge é decisão exclusiva de Max |

---

## 6. O que o `RELATORIO.md` entrega

- **(a)** ficha resumida dos 8, tabela comparativa de funcionalidades e quadro de preços;
- **(b)** o diferencial de venda de cada um;
- **(c)** lista priorizada de recursos, tecnologias e UX a importar, separada em **agora** (cabe
  no MVP e no orçamento de peso de `design/ux/06_ORCAMENTO_DE_PESO.md`) e **futuro** (`+1.0`),
  com cada item apontando para o achado do dossiê de UX ou o módulo do Vitrine que ele toca, e
  marcando o que colide com `CLAUDE.md` §15 — colisão se **reporta**, não se implementa;
- **(d)** análise de preço: onde o Vitrine cai na régua do mercado, faixa praticável, modelo de
  cobrança recomendado e a justificativa preço ÷ funcionalidade;
- **(e)** parecer sobre qual das versões 01/02/03 serve melhor ao comprador odontológico — com
  fundamento, sem implantar nada.

---

## 7. Verificação do entregável

```bash
git status --short                          # só design/benchmark/ deve aparecer
git diff --stat main...bench/benchmark-odonto -- . ':!design/benchmark'   # deve sair vazio
ls design/benchmark/capturas/*.png | wc -l  # ≥ 24
grep -c "^| " design/benchmark/capturas/INDICE.md        # linhas = nº de capturas
grep -o "\[verificado\]\|\[conhecido\]\|\[a conferir\]" design/benchmark/RELATORIO.md | sort | uniq -c
wc -w design/benchmark/RELATORIO.md         # ≤ ~2.500 palavras
grep -n "R\$" design/benchmark/RELATORIO.md # todo valor deve ter fonte no COLETA.md
```

Conferência manual, item a item: cada preço citado no relatório tem link datado em `COLETA.md`;
cada captura do `INDICE.md` existe em disco e tem URL de origem; cada norma jurídica citada tem
link oficial; os 8 concorrentes têm os 4 eixos preenchidos e o diferencial em uma frase.

---

## 8. Fora de escopo

- **Nenhuma implantação.** Nada em `crm/`, `db/`, `supabase/`. A escolha da versão de UX e a
  adaptação final são etapa posterior, sob ordem de Max.
- **Nenhum cadastro, trial ou contato comercial** com concorrente.
- **Nenhum merge para `main`** (`CLAUDE.md` §13).
- **Nada de engenharia reversa, scraping em massa ou acesso a área logada** de concorrente.
- **Nenhum item de `CLAUDE.md` §15** (Evolution GO, RAG versionado, CLI de clonagem,
  HaveIBeenPwned) entra como proposta de implementação — se o benchmark indicar um deles, ele é
  reportado como achado, não planejado.
