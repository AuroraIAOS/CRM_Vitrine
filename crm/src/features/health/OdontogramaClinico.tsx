/**
 * Odontograma clínico — invólucro de `react-advanced-odontogram` 2.4.0
 * (Subetapa 03.7, item 2 do MVP; biblioteca escolhida por Max em
 * 2026-09-03).
 *
 * ============================================================
 * ESTE É O ÚNICO ARQUIVO DO PRODUTO QUE IMPORTA A BIBLIOTECA
 * ============================================================
 * E ele existe separado por causa disso. O núcleo pesa **436.343 B
 * gzip** medidos (`gzip -c dist/odontogram.js`, o método do §5 de
 * `design/ux/06_ORCAMENTO_DE_PESO.md`) — 2,7× o chunk de entrada inteiro
 * do Vitrine, que a Subetapa 03.3 deixou em 160.212 B. A restrição 1 da
 * Qualidade desta subetapa manda carregá-lo só atrás de `React.lazy`, e
 * aqui isso é feito em DOIS níveis:
 *
 *   1. `/prontuario` já é rota preguiçosa desde a 03.3;
 *   2. este componente é preguiçoso DENTRO dela — só é buscado quando
 *      alguém escolhe a aba "Odontograma".
 *
 * O segundo nível não é zelo: sem ele, todo dentista que abrisse uma
 * ficha para ler anamnese, anexo ou consentimento pagaria 436 KB por um
 * mapa que talvez nem olhasse. Enquanto o chunk viaja, a grade FDI leve
 * da Subetapa 02.9 (3.023 B gzip) desenha as marcações já gravadas — o
 * `fallback` do `<Suspense>` não é um spinner, é o odontograma anterior
 * funcionando em modo leitura.
 *
 * ============================================================
 * TRÊS GUARDAS, E POR QUE CADA UMA EXISTE
 * ============================================================
 * A biblioteca avisa no próprio README: *"One instance per page in this
 * release (engine state is a module-level singleton)"*. Num SPA isso tem
 * consequência clínica direta, e as três guardas abaixo saíram de ler o
 * código dela, não de desconfiança genérica:
 *
 * (a) VAZAMENTO ENTRE PACIENTES. O estado vive no módulo, não no
 *     componente. Abrir o paciente A, voltar e abrir o paciente B
 *     remontaria o componente sobre a boca do A. Por isso `chaveSessao`
 *     (`cliente:evolução`) dispara SEMPRE um `importStatus` — do payload
 *     salvo quando existe, e do PRISTINO quando não existe. Nunca "não
 *     faz nada porque não há o que carregar": não fazer nada é
 *     exatamente o bug.
 *
 * (b) `globals` SOBREVIVEM A UM IMPORT VAZIO. Lendo `jr` (importStatus)
 *     no bundle: `e.globals && (…)` — com `globals` ausente, os globais
 *     do estado anterior FICAM. E um deles, `edentulous`, é achado
 *     clínico: boca desdentada. Um `importStatus({})` para "limpar"
 *     carregaria o paciente B com a boca desdentada do A. É por isso que
 *     o reset passa o PRISTINO inteiro, com os cinco globais explícitos,
 *     e não um objeto vazio.
 *
 * (c) PERSISTÊNCIA EM `localStorage`. A biblioteca oferece
 *     `enablePersistence()`, que grava a carta inteira no navegador.
 *     Medido no bundle: ela NÃO é chamada em lugar nenhum do pacote
 *     (`Mo` nasce `null`, logo `isPersistenceEnabled()` é falso) — ou
 *     seja, é opt-in e nós simplesmente não optamos. Mesmo assim o
 *     componente desliga e limpa na montagem e na desmontagem, porque
 *     `localStorage` fica fora de TODO o regime de `aba_health`: sem
 *     RLS, sem `log_acesso`, sem revogação por coluna, e sobrevivendo ao
 *     logout. Prontuário em `localStorage` seria a única cópia de dado
 *     clínico do produto fora do banco.
 *
 * Fecha o conjunto o reset no `unmount`: sair da tela devolve o
 * singleton ao pristino antes de destruí-lo, para que a boca do
 * paciente não continue na memória do módulo enquanto o operador navega
 * por outras rotas.
 *
 * ============================================================
 * CSS
 * ============================================================
 * O import NÃO é o `react-advanced-odontogram/style.css` do README — é a
 * versão escopada, gerada por `scripts/escopar_css_odontograma.mjs`. O
 * motivo (colisão dos tokens `--card`/`--muted`/`--accent` e uma regra
 * `.dark` de topo, que quebrariam o tema do app inteiro) está no
 * cabeçalho daquele script, com a medição.
 *
 * ============================================================
 * TRADUÇÃO
 * ============================================================
 * `language="pt-br"`. A restrição 2 da Qualidade previa traduzir os 11
 * idiomas do componente porque não haveria português — a medição da
 * versão 2.4.0 desmentiu: são 12 idiomas, `pt-br` incluso, com **907 de
 * 907 chaves** e vocabulário odontológico brasileiro correto ("dente
 * decíduo", "cárie", "diagnóstico registrado"). O que restou de trabalho
 * real está em `TRADUCOES_COMPLEMENTARES`, abaixo.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  OdontogramShell,
  clearPersistedState,
  destroyOdontogram,
  disablePersistence,
  getPlanChanges,
  getStatusChart,
  getToothStateSummary,
  importStatus,
  isPersistenceEnabled,
  onStateChange,
  setReadOnly,
} from "react-advanced-odontogram";

// Ordem importa: o gerado primeiro, o nosso depois — em empate de
// especificidade, vence o último.
import "./odontograma-escopado.css";
import "./odontograma-integracao.css";
import type { Marcacao } from "./mapas";
import {
  payloadDeMarcacoes,
  podarPayload,
  projetarMarcacoes,
  type PayloadOdontograma,
} from "./odontograma";

/**
 * FORMA PRISTINA, CAPTURADA DA BIBLIOTECA INSTALADA — não cravada aqui.
 *
 * Roda na importação do módulo, antes de qualquer `importStatus`, quando
 * o singleton é comprovadamente virgem. É contra ela que se decide se um
 * dente tem achado e o que a poda pode descartar; e é ela que o reset
 * entre pacientes carrega. Capturar em vez de escrever à mão é o que faz
 * a poda continuar correta quando a biblioteca subir de versão e
 * acrescentar campo — um padrão escrito por nós envelheceria em silêncio
 * e passaria a gravar dente hígido como se tivesse achado.
 *
 * `getStatusChart()` é seguro antes de `initOdontogram()`: ele percorre a
 * lista fixa de dentes usando o valor padrão para o que não está no mapa
 * (`e.get(i) ?? ge()`), e os globais são variáveis de módulo já
 * inicializadas. Verificado no código da biblioteca, não suposto.
 */
const PRISTINO: PayloadOdontograma = JSON.parse(JSON.stringify(getStatusChart()));

/**
 * AUDITORIA DA TRADUÇÃO `pt-br`, e o resíduo declarado.
 *
 * A varredura comparou as 907 chaves de `pt-br` com as de `en`: 92 têm
 * valor idêntico, e a leitura uma a uma mostrou que quase todas são
 * idênticas COM RAZÃO — termo anatômico latino que não se traduz
 * (`mesial`, `distal`, `incisal`, `lingual`, `labial`), sigla clínica
 * (PD, GM, BOP, CAL, ICDAS, FDI, AAE), diagnóstico pulpar em latim, nome
 * próprio (`Zsigmondy-Palmer`, `Cairo`), marca de material (`e.max`,
 * `gradia`) e algarismo. Traduzir essas PIORARIA a tela para um dentista
 * brasileiro, que usa exatamente essas palavras.
 *
 * Sobram TRÊS que são inglês de verdade em rótulo de interface:
 *   · `view.odontogram`  → "Odontogram"    (deveria ser "Odontograma")
 *   · `perio.site.ML`    → "Mesio-lingual" (deveria ser "Mésio-lingual")
 *   · `perio.site.DL`    → "Disto-lingual" (acentuação idem)
 *
 * NÃO SÃO CORRIGIDAS AQUI, e o motivo é de superfície pública, não de
 * esforço: a biblioteca não expõe nenhuma via de override de tradução —
 * `index.d.ts` não declara `setTranslations`, dicionário, `i18n` nem
 * nada equivalente, e `language` é o único controle. As saídas
 * possíveis seriam reescrever texto no DOM depois da renderização
 * (agarrado a marcação de terceiro, que quebra na próxima versão sem
 * avisar) ou manter um fork do pacote. Nenhuma das duas se paga por três
 * strings, e a primeira é especialmente ruim numa tela clínica, onde
 * texto trocado por seletor frágil pode acabar trocando o rótulo errado.
 *
 * Resíduo registrado no Status da subetapa e em `handoffs/instrucoes.md`
 * — declarado, não escondido. Caminho certo se incomodar: abrir issue no
 * repositório do autor (MIT, ativo), que é onde a correção serve a todo
 * mundo em vez de só a nós.
 */

/** Lê um token de cor do tema vigente e devolve em forma consumível pela biblioteca. */
function corDoTema(token: string, alternativa: string): string {
  if (typeof window === "undefined") return alternativa;
  const valor = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return valor ? `hsl(${valor})` : alternativa;
}

export type Props = {
  /**
   * `cliente:evolução`. Trocar esta chave recarrega o odontograma do
   * zero — é a guarda (a) do cabeçalho, e o motivo de ela ser uma prop
   * obrigatória em vez de um efeito interno esperto.
   */
  chaveSessao: string;
  /** `evolucoes.marcacoes` cru, como veio de `ler_evolucoes()`. */
  marcacoesGravadas: unknown;
  /** Dentes que a última sessão ASSINADA deixou como `a_realizar`. */
  aRealizarAntes: Set<string>;
  /** Evolução assinada, ou usuário sem permissão de escrita. */
  somenteLeitura: boolean;
  /** Tema escuro vigente — `.dark` no `<html>`. */
  escuro: boolean;
  /** Projeção legível + payload podado, a cada edição do profissional. */
  onAlterar: (marcacoes: Marcacao[], payload: PayloadOdontograma) => void;
};

export default function OdontogramaClinico({
  chaveSessao,
  marcacoesGravadas,
  aRealizarAntes,
  somenteLeitura,
  escuro,
  onAlterar,
}: Props) {
  // `importStatus` dispara `onStateChange`. Sem esta trava, carregar uma
  // sessão salva seria indistinguível de o profissional ter editado, e a
  // tela nasceria "suja", oferecendo salvar o que acabou de ler.
  const carregando = useRef(false);
  const aoAlterar = useRef(onAlterar);
  aoAlterar.current = onAlterar;
  const antes = useRef(aRealizarAntes);
  antes.current = aRealizarAntes;

  const tema = useMemo(
    () => ({
      colors: {
        background: corDoTema("--content", escuro ? "#0f172a" : "#f3f6fb"),
        panel: corDoTema("--card", escuro ? "#1e293b" : "#ffffff"),
        card: corDoTema("--card", escuro ? "#1e293b" : "#ffffff"),
        text: corDoTema("--foreground", escuro ? "#f1f5f9" : "#1e2a3a"),
        muted: corDoTema("--muted-foreground", escuro ? "#94a3b8" : "#5b6b7d"),
        line: corDoTema("--border", escuro ? "#334155" : "#d7e0ec"),
        // O acento segue a cor que a conta escolheu em Configurações →
        // Aparência (migration 032), então o odontograma não destoa do
        // resto do produto por trazer o azul do autor da biblioteca.
        accent: corDoTema("--primary", "#3b7bff"),
        accent2: corDoTema("--success", "#12b981"),
      },
    }),
    [escuro],
  );

  // ---- guarda (c): persistência em localStorage, sempre desligada ----
  useEffect(() => {
    if (isPersistenceEnabled()) disablePersistence();
    clearPersistedState();
    return () => clearPersistedState();
  }, []);

  const emitir = useCallback(() => {
    const bruto = getStatusChart() as PayloadOdontograma;
    const planejados = new Set(getPlanChanges().map((p) => String(p.toothNo)));
    const projecao = projetarMarcacoes({
      payload: bruto,
      pristino: PRISTINO,
      planejados,
      aRealizarAntes: antes.current,
      resumo: (fdi) => getToothStateSummary(Number(fdi)),
    });
    aoAlterar.current(projecao, podarPayload(bruto, PRISTINO));
  }, []);

  // ---- guardas (a) e (b): carga/reset por sessão ----
  useEffect(() => {
    carregando.current = true;
    try {
      // `payloadDeMarcacoes` é chamado aqui e não no pai de propósito: o
      // pai não deve precisar conhecer o formato interno da biblioteca.
      const salvo = payloadDeMarcacoes(marcacoesGravadas);
      importStatus(salvo ?? PRISTINO);
    } finally {
      carregando.current = false;
    }
    // Sem `emitir()` aqui: carregar não é editar. Emitir marcaria o
    // rascunho como sujo e ofereceria "salvar" a quem só abriu a tela.
  }, [chaveSessao, marcacoesGravadas]);

  useEffect(() => {
    return onStateChange(() => {
      if (carregando.current) return;
      emitir();
    });
  }, [emitir]);

  useEffect(() => {
    setReadOnly(somenteLeitura);
  }, [somenteLeitura]);

  // ---- reset + destruição ao sair da tela ----
  useEffect(() => {
    return () => {
      carregando.current = true;
      importStatus(PRISTINO);
      destroyOdontogram();
    };
  }, []);

  return (
    // A classe é o que ancora TODO o CSS da biblioteca (ver
    // `odontograma-escopado.css`). Nenhum componente nosso mora aqui
    // dentro: os tokens `--card`/`--muted`/`--accent` valem com os
    // valores da biblioteca deste ponto para baixo.
    <div className="odontograma-escopo w-full overflow-auto">
      <OdontogramShell
        language="pt-br"
        numberingSystem="FDI"
        darkMode={escuro}
        themeConfig={tema}
        readOnly={somenteLeitura}
        enableNotes
      />
    </div>
  );
}
