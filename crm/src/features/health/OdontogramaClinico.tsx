/**
 * Odontograma clínico autoral — Subetapa 03.7.a (decisão D-I1 de Max,
 * 2026-09-03).
 *
 * ============================================================
 * POR QUE ESTE ARQUIVO FOI REESCRITO DO ZERO
 * ============================================================
 * A versão da 03.7 era um invólucro de `react-advanced-odontogram` 2.4.0. A
 * pesquisa `analise-ice` mediu, no sourcemap do próprio pacote, que **o clique
 * daquela biblioteca é no DENTE, nunca na face** (`src/odontogram.ts`:
 * `tile.addEventListener("click", (e) => onToothClick(toothNo, e))`, e
 * `onToothClick` só manipula `selectedTeeth`), e que o único popover é
 * exclusivo de toque. Face clicável e pop-up por dente são o coração do que a
 * 03.8 precisa — Max decidiu construir o nosso.
 *
 * ============================================================
 * O SVG É CONTRATO DE NOMES, NUNCA GEOMETRIA (restrição 1)
 * ============================================================
 * Max declarou que provavelmente vai redesenhar os desenhos. Este componente
 * foi escrito para não perceber a troca:
 *
 *   · a arte vem dos 26 arquivos de `dentes/`, importados como texto no build;
 *   · o clique resolve a região por `data-face` / `data-regiao` do próprio
 *     alvo do evento — nunca por coordenada, nunca por ordem de path, nunca
 *     por `id` (os 26 arquivos são instanciados nas 52 posições, e `id`
 *     repetido no mesmo documento é HTML inválido);
 *   · a marcação é aplicada reescrevendo `data-face="X"` para acrescentar
 *     `data-marcado`, o que depende só do nome;
 *   · `scripts/validar_dentes_svg.mjs` roda no `npm run build` e QUEBRA O
 *     BUILD se um desenho perder uma região nomeada.
 *
 * ============================================================
 * TRÊS GUARDAS DA 03.7 QUE DEIXARAM DE SER NECESSÁRIAS
 * ============================================================
 * A biblioteca guardava o estado num SINGLETON DE MÓDULO, e as três guardas
 * da 03.7 (`chaveSessao` forçando `importStatus`, forma pristina capturada ao
 * vivo, `disablePersistence`/`clearPersistedState`) existiam por causa disso:
 * abrir o paciente A e depois o B remontava o componente sobre a boca do A, e
 * `importStatus({})` não limpava `globals` — inclusive `edentulous`, que é
 * achado clínico.
 *
 * Aqui **não há estado de módulo**. O registro clínico é `props.registros`,
 * que vem do prontuário e é derivado da evolução exibida; trocar de paciente
 * troca a prop, e não há memória nenhuma para vazar. **A lição não se apaga**
 * — ela fica em `handoffs/instrucoes.md` §5, e vale para a próxima peça de
 * terceiro que este produto embutir.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import "./odontograma.css";
import { estadoDoMapa } from "./mapas";
import {
  ESTADOS_DENTICAO,
  ESTADOS_TRABALHO,
  ROTULO_ACHADO,
  ROTULO_DENTICAO,
  TIPOS_ACHADO,
  LINHAS_ODONTOGRAMA,
  denticaoDerivada,
  estaNaBoca,
  facesDoAchado,
  facesDoTrabalho,
  normalizarRegistro,
  novoId,
  posicaoDe,
  temConteudo,
  type AchadoDente,
  type EstadoDenticao,
  type EstadoTrabalho,
  type FaceDente,
  type PosicaoDente,
  type RegistroDente,
  type TipoAchado,
  type TrabalhoDente,
} from "./odontograma";

/**
 * A arte, importada como TEXTO no build.
 *
 * `eager` de propósito: são 26 arquivos pequenos (46 KB somados, antes do
 * gzip) e este módulo inteiro já é preguiçoso — buscar cada dente por rede no
 * momento em que o profissional clica seria 26 requisições para economizar
 * alguns KB num chunk que só viaja para quem abriu a aba Odontograma.
 */
const DESENHOS = import.meta.glob("./dentes/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Marca aplicada a uma face: o que existe NELA. */
type MarcaFace = "trabalho" | "achado" | "ambos";

/**
 * Acrescenta `data-marcado` / `data-alvo` às faces do desenho.
 *
 * Reescrita de string em vez de manipulação do DOM depois da montagem, e o
 * motivo é de correção, não de gosto: com 52 posições, um efeito que varre
 * `querySelectorAll` a cada render tem uma janela em que a tela mostra a
 * marcação do dente anterior. Aqui o desenho já nasce pintado, e o resultado
 * é memoizável por (desenho × marcas).
 *
 * Depende SÓ do nome da face — é a mesma dependência que o validador cobra.
 */
function pintar(svg: string, marcas: Record<string, MarcaFace>, alvo: FaceDente[]): string {
  return svg.replace(/data-face="([a-z]+)"/g, (inteiro, face: string) => {
    const marca = marcas[face] ? ` data-marcado="${marcas[face]}"` : "";
    const selecao = alvo.includes(face as FaceDente) ? ` data-alvo="sim"` : "";
    return `${inteiro}${marca}${selecao}`;
  });
}

export type Props = {
  /** Registro clínico da boca, já validado por `registrosDeMarcacoes()`. */
  registros: RegistroDente[];
  /** Idade do paciente em anos, para DERIVAR a dentição (A3). `null` = desconhecida. */
  idade: number | null;
  /** Evolução assinada, ou usuário sem permissão de escrita. */
  somenteLeitura: boolean;
  /** Autor de `executado` — o profissional da sessão aberta (A4, restrição 2). */
  profissionalId: string | null;
  onAlterar: (registros: RegistroDente[]) => void;
};

export default function OdontogramaClinico({
  registros,
  idade,
  somenteLeitura,
  profissionalId,
  onAlterar,
}: Props) {
  const arcadaRef = useRef<HTMLDivElement>(null);
  const [alvo, setAlvo] = useState<{ fdi: string; topo: number; esquerda: number } | null>(null);
  const [facesSelecionadas, setFacesSelecionadas] = useState<FaceDente[]>([]);

  const porFdi = useMemo(() => new Map(registros.map((r) => [r.regiao, r])), [registros]);

  const denticaoDe = useCallback(
    (fdi: string): EstadoDenticao => porFdi.get(fdi)?.denticao ?? denticaoDerivada(fdi, idade),
    [porFdi, idade],
  );

  /**
   * Grava um dente. Recebe o registro JÁ montado e devolve a lista inteira —
   * dente sem conteúdo sai da lista, porque mapa clínico registra o que foi
   * encontrado, não as 52 posições.
   */
  const gravarDente = useCallback(
    (fdi: string, muda: (atual: RegistroDente) => RegistroDente) => {
      const atual: RegistroDente = porFdi.get(fdi) ?? {
        regiao: fdi,
        rotulo: `Dente ${fdi}`,
        estado: "existente",
        nota: "",
      };
      const novo = normalizarRegistro(muda(atual));
      const resto = registros.filter((r) => r.regiao !== fdi);
      const lista = temConteudo(novo) ? [...resto, novo] : resto;
      onAlterar(lista.sort((a, b) => a.regiao.localeCompare(b.regiao)));
    },
    [porFdi, registros, onAlterar],
  );

  // ---- clique: o alvo do evento resolve dente e região sozinho ----
  const aoClicar = useCallback(
    (evento: React.MouseEvent<HTMLDivElement>) => {
      const el = (evento.target as Element).closest<HTMLElement>("[data-face], [data-regiao]");
      const caixa = (evento.target as Element).closest<HTMLElement>("[data-dente]");
      if (!el || !caixa || !arcadaRef.current) return;
      const fdi = caixa.dataset.dente!;
      const face = el.dataset.face as FaceDente | undefined;

      const r = caixa.getBoundingClientRect();
      const base = arcadaRef.current.getBoundingClientRect();
      setAlvo({ fdi, topo: r.bottom - base.top + 6, esquerda: Math.max(0, r.left - base.left - 140) });

      // Clicar numa face ALTERNA a seleção; clicar na coroa ou na raiz abre o
      // dente sem escolher face, que é como se registra o que vale para o
      // dente inteiro (extração, coroa total, fratura de coroa).
      setFacesSelecionadas((antes) => {
        if (alvo?.fdi !== fdi) return face ? [face] : [];
        if (!face) return [];
        return antes.includes(face) ? antes.filter((f) => f !== face) : [...antes, face];
      });
    },
    [alvo?.fdi],
  );

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAlvo(null);
        setFacesSelecionadas([]);
      }
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, []);

  function Posicao({ pos }: { pos: PosicaoDente }) {
    const registro = porFdi.get(pos.fdi);
    const denticao = denticaoDe(pos.fdi);
    const estado = registro ? estadoDoMapa("odontograma", registro.estado) : undefined;

    const marcas: Record<string, MarcaFace> = {};
    for (const f of facesDoAchado(registro?.achados)) marcas[f] = "achado";
    for (const f of facesDoTrabalho(registro?.trabalhos)) {
      marcas[f] = marcas[f] === "achado" ? "ambos" : "trabalho";
    }

    const bruto = DESENHOS[`./dentes/${pos.desenho}.svg`];
    const svg = pintar(bruto, marcas, alvo?.fdi === pos.fdi ? facesSelecionadas : []);

    return (
      <div
        className="od-posicao"
        data-dente={pos.fdi}
        data-espelhado={pos.espelhado ? "sim" : "nao"}
        data-na-boca={estaNaBoca(denticao) ? "sim" : "nao"}
        data-selecionado={alvo?.fdi === pos.fdi ? "sim" : "nao"}
        {...(estado ? { "data-estado": registro!.estado } : {})}
        title={`${pos.fdi} · ${pos.nome} · ${ROTULO_DENTICAO[denticao]}${registro?.nota ? ` · ${registro.nota}` : ""}`}
        style={
          estado
            ? ({ "--od-estado-fundo": estado.fundo, "--od-estado-traco": estado.traco } as React.CSSProperties)
            : undefined
        }
      >
        <span className="od-numero">{pos.fdi}</span>
        {/* O conteúdo vem dos nossos próprios arquivos, embutidos no build —
            nunca de dado de usuário nem de rede. É a única forma de manter os
            `data-face` do desenho como alvo de evento sem reimplementar um
            parser de SVG em React. */}
        <div className="od-desenho" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    );
  }

  const posicaoAlvo = alvo ? posicaoDe(alvo.fdi) : undefined;

  return (
    <div className="odontograma flex min-h-0 flex-col gap-3 p-3" data-editavel={somenteLeitura ? "nao" : "sim"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
          52 posições · notação FDI · clique na face
        </span>
        <span className="text-[10px] text-muted-foreground">
          {idade === null
            ? "idade do paciente desconhecida — dentição permanente assumida"
            : `${idade.toFixed(1)} anos · dentição derivada da idade, editável dente a dente`}
        </span>
      </div>

      <div ref={arcadaRef} className="od-arcada relative" onClick={somenteLeitura ? undefined : aoClicar}>
        {LINHAS_ODONTOGRAMA.map((linha) => (
          <div key={linha.chave} className="od-linha" data-arcada={linha.posicoes[0].arcada} data-linha={linha.chave}>
            {/* A folga da linha média entra no MEIO da linha, e não como duas
                listas separadas, para que `flex: 1 1 0` distribua a largura
                entre as 16 (ou 10) posições da linha inteira — foi assim que a
                arcada deixou de depender de largura fixa por dente. */}
            {linha.posicoes.slice(0, linha.posicoes.length / 2).map((pos) => (
              <Posicao key={pos.fdi} pos={pos} />
            ))}
            <div className="od-meio" />
            {linha.posicoes.slice(linha.posicoes.length / 2).map((pos) => (
              <Posicao key={pos.fdi} pos={pos} />
            ))}
          </div>
        ))}

        {alvo && posicaoAlvo && (
          <PopupDente
            pos={posicaoAlvo}
            registro={porFdi.get(alvo.fdi)}
            denticao={denticaoDe(alvo.fdi)}
            derivada={denticaoDerivada(alvo.fdi, idade)}
            facesSelecionadas={facesSelecionadas}
            somenteLeitura={somenteLeitura}
            profissionalId={profissionalId}
            posicaoTela={{ topo: alvo.topo, esquerda: alvo.esquerda }}
            onAlternarFace={(f) =>
              setFacesSelecionadas((antes) => (antes.includes(f) ? antes.filter((x) => x !== f) : [...antes, f]))
            }
            onFechar={() => {
              setAlvo(null);
              setFacesSelecionadas([]);
            }}
            onGravar={(muda) => gravarDente(alvo.fdi, muda)}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Pop-up por dente — o que está registrado e o que está planejado
// ============================================================

/**
 * É a peça que a 03.7 não tinha e que a 03.8 exige. Ele mostra, no mesmo
 * lugar, as TRÊS coisas que o profissional precisa ver ao decidir o que
 * orçar naquele dente: o estado de dentição (A3), os achados com as faces
 * onde há doença, e os trabalhos com as faces onde vai haver trabalho (A2).
 *
 * As duas listas são separadas na tela porque são separadas no modelo — e
 * porque a 03.7 provou que juntá-las não dá erro, dá orçamento coerente
 * consigo mesmo e errado quanto ao negócio.
 */
function PopupDente({
  pos,
  registro,
  denticao,
  derivada,
  facesSelecionadas,
  somenteLeitura,
  profissionalId,
  posicaoTela,
  onAlternarFace,
  onFechar,
  onGravar,
}: {
  pos: PosicaoDente;
  registro: RegistroDente | undefined;
  denticao: EstadoDenticao;
  derivada: EstadoDenticao;
  facesSelecionadas: FaceDente[];
  somenteLeitura: boolean;
  profissionalId: string | null;
  posicaoTela: { topo: number; esquerda: number };
  onAlternarFace: (f: FaceDente) => void;
  onFechar: () => void;
  onGravar: (muda: (atual: RegistroDente) => RegistroDente) => void;
}) {
  const [tipoAchado, setTipoAchado] = useState<TipoAchado>("carie");
  const [descricao, setDescricao] = useState("");
  const listaAchados: AchadoDente[] = registro?.achados ?? [];
  const listaTrabalhos: TrabalhoDente[] = registro?.trabalhos ?? [];

  return (
    <div
      className="od-popup"
      data-dente-aberto={pos.fdi}
      style={{ top: posicaoTela.topo, left: posicaoTela.esquerda }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-[12px] font-medium text-foreground">Dente {pos.fdi}</span>
          <span className="text-[10px] text-muted-foreground">{pos.nome}</span>
        </div>
        <button type="button" onClick={onFechar} className="text-[10px] text-muted-foreground hover:text-foreground">
          fechar
        </button>
      </div>

      {/* -------------------------------------------------- A3: dentição -- */}
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Dentição</span>
        <select
          data-campo="denticao"
          value={denticao}
          disabled={somenteLeitura}
          onChange={(e) => {
            const valor = e.target.value as EstadoDenticao;
            onGravar((atual) => ({ ...atual, denticao: valor }));
          }}
          className="h-7 rounded-md border px-1.5 text-[10.5px]"
        >
          {ESTADOS_DENTICAO.map((d) => (
            <option key={d} value={d}>
              {ROTULO_DENTICAO[d]}
            </option>
          ))}
        </select>
        {!registro?.denticao && (
          <span className="text-[9.5px] text-muted-foreground">
            derivado da idade ({ROTULO_DENTICAO[derivada]}) — escolher aqui afirma o estado e passa a valer
          </span>
        )}
      </label>

      {/* ----------------------------------------------------- faces ------ */}
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          Faces selecionadas
        </span>
        <div className="flex flex-wrap gap-1">
          {pos.faces.map((f) => (
            <button
              key={f}
              type="button"
              className="od-chip"
              data-face-chip={f}
              data-ativo={facesSelecionadas.includes(f) ? "sim" : "nao"}
              disabled={somenteLeitura}
              onClick={() => onAlternarFace(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="text-[9.5px] text-muted-foreground">
          {facesSelecionadas.length === 0
            ? "nenhuma face — o que for acrescentado vale para o dente inteiro"
            : facesSelecionadas.join(" · ")}
        </span>
      </div>

      {/* ------------------------------------------- A2: achado × trabalho -- */}
      <div className="flex flex-col gap-1.5 border-t pt-2">
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          Achados — onde há doença
        </span>
        {listaAchados.length === 0 && <span className="text-[10px] text-muted-foreground">nenhum achado</span>}
        {listaAchados.map((a, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-[10.5px]">
            <span>
              {ROTULO_ACHADO[a.tipo]}
              {a.faces.length > 0 && (
                <span className="font-mono text-[9.5px] text-muted-foreground"> · {a.faces.join(", ")}</span>
              )}
            </span>
            {!somenteLeitura && (
              <button
                type="button"
                className="text-[9.5px] text-muted-foreground hover:text-destructive"
                onClick={() =>
                  onGravar((atual) => ({
                    ...atual,
                    achados: (atual.achados ?? []).filter((_, j) => j !== i),
                  }))
                }
              >
                remover
              </button>
            )}
          </div>
        ))}
        {!somenteLeitura && (
          <div className="flex gap-1">
            <select
              data-campo="tipo-achado"
              value={tipoAchado}
              onChange={(e) => setTipoAchado(e.target.value as TipoAchado)}
              className="h-7 flex-1 rounded-md border px-1.5 text-[10.5px]"
            >
              {TIPOS_ACHADO.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_ACHADO[t]}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px]"
              data-acao="acrescentar-achado"
              onClick={() =>
                onGravar((atual) => ({
                  ...atual,
                  achados: [...(atual.achados ?? []), { faces: [...facesSelecionadas], tipo: tipoAchado }],
                }))
              }
            >
              achado
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 border-t pt-2">
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          Trabalho — onde o profissional vai trabalhar
        </span>
        {listaTrabalhos.length === 0 && <span className="text-[10px] text-muted-foreground">nada planejado</span>}
        {listaTrabalhos.map((t) => (
          <div key={t.id} className="flex flex-col gap-1 rounded-md border p-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px]">{t.descricao || "procedimento"}</span>
              {/* SÓ `proposto` se apaga. O resto sai do plano por mudança de
                  estado e permanece no histórico — é o registro do que se
                  propôs que protege a clínica depois (`docs/02` §12.4). */}
              {!somenteLeitura && t.estado === "proposto" && (
                <button
                  type="button"
                  className="text-[9.5px] text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    onGravar((atual) => ({
                      ...atual,
                      trabalhos: (atual.trabalhos ?? []).filter((x) => x.id !== t.id),
                    }))
                  }
                >
                  remover
                </button>
              )}
            </div>
            {t.faces.length > 0 && (
              <span className="font-mono text-[9.5px] text-muted-foreground">{t.faces.join(" · ")}</span>
            )}
            <select
              data-campo="estado-trabalho"
              data-trabalho={t.id}
              value={t.estado}
              disabled={somenteLeitura}
              onChange={(e) => {
                const estado = e.target.value as EstadoTrabalho;
                onGravar((atual) => ({
                  ...atual,
                  trabalhos: (atual.trabalhos ?? []).map((x) =>
                    x.id !== t.id
                      ? x
                      : {
                          ...x,
                          estado,
                          // `executado` É FATO AFIRMADO (A4, restrição 2): a
                          // data e o autor nascem no ato de afirmar, e somem
                          // se o estado voltar atrás. A trava de finalização
                          // de contrato da 03.8.a lê exatamente isto — e uma
                          // data sobrevivente de um trabalho que voltou para
                          // `planejado` afirmaria execução que não houve.
                          ...(estado === "executado"
                            ? {
                                executadoEm: new Date().toISOString(),
                                ...(profissionalId ? { executadoPor: profissionalId } : {}),
                              }
                            : { executadoEm: undefined, executadoPor: undefined }),
                        },
                  ),
                }));
              }}
              className="h-7 rounded-md border px-1.5 text-[10.5px]"
            >
              {ESTADOS_TRABALHO.map((e) => (
                <option key={e} value={e}>
                  {estadoDoMapa("odontograma", e)?.rotulo ?? e}
                </option>
              ))}
            </select>
            {t.estado === "executado" && t.executadoEm && (
              <span className="font-mono text-[9px] text-muted-foreground">
                executado em {new Date(t.executadoEm).toLocaleString("pt-BR")}
                {t.executadoPor ? " · autor registrado" : " · SEM AUTOR (sessão sem profissional)"}
              </span>
            )}
          </div>
        ))}
        {!somenteLeitura && (
          <div className="flex gap-1">
            <input
              data-campo="descricao-trabalho"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="procedimento a executar"
              className="h-7 flex-1 rounded-md border px-2 text-[10.5px]"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px]"
              data-acao="propor-trabalho"
              onClick={() => {
                onGravar((atual) => ({
                  ...atual,
                  trabalhos: [
                    ...(atual.trabalhos ?? []),
                    {
                      id: novoId(),
                      faces: [...facesSelecionadas],
                      estado: "proposto" as EstadoTrabalho,
                      ...(descricao.trim() ? { descricao: descricao.trim() } : {}),
                    },
                  ],
                }));
                setDescricao("");
              }}
            >
              propor
            </Button>
          </div>
        )}
      </div>

      <span className="font-mono text-[9px] text-muted-foreground">
        faces do trabalho: {facesDoTrabalho(listaTrabalhos).join(" · ") || "—"} · faces do achado:{" "}
        {facesDoAchado(listaAchados).join(" · ") || "—"}
      </span>
      <span className="text-[9.5px] text-muted-foreground">
        As duas listas são distintas de propósito, e é o achado A2 desta subetapa: a 03.8 orça a de cima.
      </span>
    </div>
  );
}
