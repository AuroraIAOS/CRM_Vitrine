# Fichas técnicas dos repositórios

Avaliação dos 4 repositórios que Max forkou, feita em **2026-09-01** no bench
`bench/benchmark-odonto`. Matéria-prima do §5 (c) do [`../RELATORIO.md`](../RELATORIO.md).

**Nada foi adotado.** Os repositórios foram clonados em pasta temporária **fora** da árvore do
projeto; nenhuma dependência entrou no `crm/package.json`, nenhum arquivo foi copiado para
`crm/`. Isto é parecer, não implantação (`CLAUDE.md` §13).

**Portão aplicado antes de qualquer recomendação:** licença lida no arquivo e citada. Um
componente sob GPL e um sob MIT levam a decisões opostas, e recomendar adoção sem checar seria
entregar um problema jurídico embrulhado em recurso.

**Régua de compatibilidade:** a stack real do Vitrine é **React 18.3.1 + Vite 5.4.8 +
TypeScript 5.6.2** (`crm/package.json`, conferido, não de memória).

**Régua de peso:** o bundle de produção do Vitrine hoje é **284 KB gzip** num único chunk, e a
meta declarada em `design/ux/06_ORCAMENTO_DE_PESO.md` é cair para **120–170 KB** com divisão por
rota. Todo número de peso abaixo foi **medido**, não estimado — o método está no fim do arquivo.

---

## Quadro-resumo

| Repositório | Licença | Stack | Compatível? | Peso medido | Veredito |
|---|---|---|---|---|---|
| **TOOL_Odontogram01** | **MIT** ✅ | React 18/19 + TS + SVG | **Sim** | **426 KB gzip** | adotar **só atrás de rota preguiçosa** — nunca no bundle inicial |
| **TOOL_HOF_drarayssa** | **nenhuma** ❌ | React + three.js + drei + gsap | não avaliado | não medido | **não adotável** — sem licença, e o 3D estoura o orçamento |
| **TOOL_Text_Orally** | MIT ✅ | **Swift / iOS** (Xcode) | **Não** | — | só o **instrumento** é aproveitável, não o código |
| **TOOL_MuscleMap** | MIT ✅ | **SwiftUI**, iOS 17+/macOS 14+ | **Não** | — | referência conceitual apenas |

**Correção ao material de origem:** o briefing tratava o `TOOL_MuscleMap` como o único caso
não-odontológico/não-web. São **dois**: o `TOOL_Text_Orally` também é iOS — 70 arquivos `.swift`,
zero arquivos web, projeto Xcode (`Orofacial.xcodeproj`). Isso muda o que dá para fazer com ele.

---

## 1. TOOL_Odontogram01 — `react-advanced-odontogram`

**O mais importante dos quatro:** o odontograma é o item nº 1 da lista "importar agora" do
relatório, e este é o único candidato na nossa stack exata.

| | |
|---|---|
| **Licença** | **MIT** — `LICENSE`: *"MIT License. Copyright (c) 2026 Zoltán Dul"*; `package.json` confirma `"license": "MIT"`. Sem restrição de uso comercial. ✅ |
| **Versão** | 2.4.0, publicada no npm |
| **Stack** | React (peer `^18 \|\| ^19`) + TypeScript, SVG. **Casa com o Vitrine sem adaptação.** |
| **Dependências reais** | só duas: `dompurify` (sanitização do sistema de plugins) e `jspdf` — e o `jspdf` entra por **`await import("jspdf")`**, import dinâmico deliberado, com comentário no código explicando que quem nunca exporta PDF não o carrega |
| **Vitalidade** | último commit **2026-08-19** (13 dias antes desta avaliação); **191 arquivos de teste** |
| **Upstream** | `github.com/ZoliQua/React-Odontogram-Modul`, demonstração em `react-odontogram-modul.vercel.app` |

**O que traz (declarado no `package.json` e conferido na árvore de `src/`):** marcação de cárie
e restauração por face; estados endodôntico, protético e periodontal; numeração FDI, Universal e
Palmer; **periodontograma completo** (`PerioChart.tsx`, `perioClassification.ts`,
`perioGraphic.ts`); **exportação e importação HL7 FHIR R4** (`src/fhir/` com `toFhir.ts`,
`fromFhir.ts`, `codesystems.ts`, `iso3950.ts`, `toFhirPerio.ts`); escore ICDAS; sistema de
plugins com sanitização; tour guiado; tema.

### O achado que muda a recomendação

**O núcleo pesa 426 KB gzip.** Medido no pacote publicado, não estimado:

| Arquivo do `dist` | Bruto | **Gzip** |
|---|---|---|
| `odontogram.js` (núcleo) | 1,7 MB | **426 KB** |
| `style.css` | 56 KB | 10 KB |
| `notoSC-*.js` (fonte chinesa) | 488 KB | 297 KB — *chunk separado* |
| `notoArabic-*.js` | 472 KB | 228 KB — *chunk separado* |
| `roboto-*.js` | 72 KB | 42 KB — *chunk separado* |

**426 KB é 1,5× o bundle inteiro do Vitrine hoje (284 KB) e 2,5–3,5× a meta de 120–170 KB.**
As três fontes ficam em chunks próprios (só entram na exportação de PDF), então não somam — mas
o núcleo sozinho já é o problema.

**Veredito:** adotar **é viável e recomendado**, com uma condição inegociável — **só atrás de
`React.lazy` na rota do prontuário clínico**, nunca no carregamento inicial. Quem abre a agenda
ou o funil não pode pagar 426 KB por um odontograma que não vai ver. Isso pressupõe que a
divisão por rota de `06_ORCAMENTO_DE_PESO.md` seja feita **antes**, não depois.

**Duas pendências a resolver na adoção, ambas concretas:**

1. **Não tem português.** Os 11 idiomas de `src/i18n/translations.ts` são `ar, de, en, es, fr,
   hu, it, pl, ru, sk, zh`. Falta `pt-BR` — trabalho de tradução, não de engenharia, mas é
   trabalho real e o vocabulário odontológico é técnico.
2. **Como o estado clínico entra em `aba_health`.** O componente tem modelo próprio de dados; a
   ponte com `prontuarios`/`evolucoes` e com o `log_acesso` obrigatório precisa ser desenhada.
   O `src/fhir/` ajuda: exportar FHIR R4 é exatamente o vocabulário que a certificação SBIS/CFM
   (item 13 do relatório) pede, e ganhá-lo de graça é um argumento a favor da adoção.

---

## 2. TOOL_HOF_drarayssa — simulação 3D de harmonização orofacial

| | |
|---|---|
| **Licença** | **NENHUMA.** Não há `LICENSE`, e o `package.json` não declara campo `license`. ❌ |
| **Stack** | React + `three` + `@react-three/fiber` + `@react-three/drei` + `gsap` + Tailwind |
| **Vitalidade** | último commit 2026-07-24 |
| **O que é** | segundo o próprio README: *"A high-end luxury medical landing page"* para uma dentista, com *glassmorphism*, animações e uma simulação 3D de clareamento dental |

**Duas razões independentes para não adotar, e a primeira já basta:**

**A licença.** Ausência de licença **não** significa domínio público — significa o contrário:
sem concessão expressa, os direitos ficam integralmente com o autor, e copiar código dali para
um produto comercial é infração. Isto é bloqueio jurídico, não preferência técnica. Se Max
quiser o código, o caminho é pedir ao autor uma licença explícita — não copiar assumindo que
"está no GitHub, então pode".

**O peso.** `three` + `@react-three/fiber` + `drei` é um piso de tráfego de centenas de KB gzip
**antes** de qualquer modelo 3D — na mesma ordem de grandeza do app inteiro. Colide de frente
com a restrição de peso que Max declarou e que `06_ORCAMENTO_DE_PESO.md` mede.

**E é uma landing page, não um módulo.** Mesmo com licença e sem restrição de peso, não há
componente reutilizável a extrair: é um site de uma profissional, não uma biblioteca de
simulação. O valor real aqui é **de referência de UX** — o padrão "simulador visual de resultado
como argumento de venda" é o que o Simples Dental faz no módulo de HOF e o Santé no plano de
entrada. Esse padrão pode ser perseguido com meios muito mais baratos (antes/depois com
sobreposição em 2D, por exemplo).

---

## 3. TOOL_Text_Orally — avaliação de dor orofacial

| | |
|---|---|
| **Licença** | MIT — *"Copyright (c) 2023"*, autoria de uma equipe de 10 estudantes ✅ |
| **Stack** | **Swift / iOS.** Projeto Xcode (`Orofacial.xcodeproj`, `OrofacialTests`, `OrofacialUITests`); **70 arquivos `.swift`, zero arquivos web** |
| **Vitalidade** | último commit **2023-08-07** — 3 anos parado |
| **O que é** | app iOS "Orally" de avaliação de dor e sintomas orofaciais |

**Não é adotável como código.** O Vitrine é web; não há nada aqui que se porte sem reescrita
integral. Max o classificou como "versionamento futuro", o que continua certo — mas o que se
aproveita é o **instrumento**, não a implementação: o questionário, a escala e a lógica de
pontuação, que são conteúdo e podem ser reimplementados em qualquer stack.

**Onde encaixaria:** como modelo de anamnese aplicável em `aba_health` — o Vitrine já tem
`respostas_anamnese` e anamnese configurável no modelo de dados, então é preenchimento de
conteúdo, não módulo novo.

**Limite que precisa estar escrito antes de qualquer implementação:** instrumento de triagem
**nunca** é diagnóstico. `docs/05_COMPLIANCE_E_ETICA.md` e o Código de Ética Odontológica (Art.
17 e seguintes) põem o diagnóstico como ato privativo do cirurgião-dentista. Se isso entrar, tem
de entrar como coleta estruturada de queixa que **apoia** a avaliação clínica, com essa ressalva
visível na tela — não como resultado.

---

## 4. TOOL_MuscleMap — mapa muscular interativo

| | |
|---|---|
| **Licença** | MIT — *"Copyright (c) 2026 Melih Colpan"* ✅ |
| **Stack** | **SwiftUI**, iOS 17+ / macOS 14+, distribuído por Swift Package Manager e CocoaPods |
| **Vitalidade** | último commit 2026-04-20 |

**Não é adotável, e Max já sabia disso** — o briefing o trouxe explicitamente como fonte de
ideia, não de código. A ficha confirma: SwiftUI não roda em navegador, e não há caminho de porte.

**O que de fato se aproveita é a técnica**, e ela é aplicável em SVG na nossa stack:
mapa anatômico interativo com **realce por região**, **heatmap** (intensidade por cor sobre a
mesma estrutura) e **gesto** para seleção. Traduzido para odontologia, é exatamente o que um
odontograma de qualidade faz — e o `TOOL_Odontogram01` já faz, em SVG e em React. **Na prática,
o item 4 é atendido pelo item 1**, e não gera trabalho próprio.

---

## Como o peso foi medido

Sem estimativa e sem `npm install` no repositório de terceiro — o pacote publicado foi baixado
do registro oficial e medido arquivo a arquivo:

```bash
npm pack react-advanced-odontogram          # 2.4.0
tar -xzf react-advanced-odontogram-2.4.0.tgz
for f in package/dist/*.js package/dist/*.css; do
  echo "$(basename $f) $(gzip -c "$f" | wc -c) gzip"
done
```

A régua de comparação (284 KB gzip do bundle atual; meta de 120–170 KB) vem de
`design/ux/06_ORCAMENTO_DE_PESO.md` §linhas 23 e 65, que por sua vez a mediu no `dist/` real do
`crm/`.

## Proveniência

Tudo nesta página é **[verificado]**: licenças lidas nos arquivos `LICENSE` dos clones, stack
lida nos `package.json`/`Package.swift`, datas de commit lidas no `git log`, idiomas contados em
`src/i18n/translations.ts`, pesos medidos no pacote do npm. Nenhuma afirmação sobre esses
repositórios foi escrita de memória (`CLAUDE.md` §11).
