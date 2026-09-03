import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useServicos,
  useCategorias,
  useCriarServico,
  useAlternarAtivoServico,
  useCriarVariante,
  useDefinirVariantePadrao,
  useSemearProcedimentosSigtap,
  ROTULO_UNIDADE,
  type Servico,
  type UnidadeLancamento,
} from "./api";

const formatoMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function FormularioNovoServico({ onCriado, onCancelar }: { onCriado: () => void; onCancelar: () => void }) {
  const { data: categorias } = useCategorias();
  const criar = useCriarServico();
  const [categoriaId, setCategoriaId] = useState("");
  const [nome, setNome] = useState("");
  const [duracao, setDuracao] = useState(60);
  const [preco, setPreco] = useState("");
  const [requerProfissional, setRequerProfissional] = useState(true);
  const [requerRecurso, setRequerRecurso] = useState(false);
  const [aceitaFaces, setAceitaFaces] = useState(false);
  const [unidadeLancamento, setUnidadeLancamento] = useState<UnidadeLancamento | "">("");
  const [quantidadeMaxima, setQuantidadeMaxima] = useState("");
  const [codigoSigtap, setCodigoSigtap] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <span className="text-[12.5px] font-medium text-foreground">Novo serviço</span>
      <form
        className="flex flex-col gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          if (!categoriaId) return;
          // Espelha a CHECK do banco (servicos_aceita_faces_exige_unidade)
          // aqui na tela — a validação de verdade é a do banco, isto só
          // evita a viagem de ida e volta com um erro óbvio.
          if (aceitaFaces && !unidadeLancamento) {
            setErro("Procedimento que aceita face precisa de uma unidade de lançamento.");
            return;
          }
          criar.mutate(
            {
              categoriaId,
              nome,
              duracaoPadraoMinutos: duracao,
              precoBase: Number(preco.replace(",", ".")) || 0,
              requerProfissional,
              requerRecurso,
              aceitaFaces,
              unidadeLancamento: unidadeLancamento || undefined,
              quantidadeMaxima: quantidadeMaxima ? Number(quantidadeMaxima) : undefined,
              codigoSigtap: codigoSigtap.trim() || undefined,
            },
            { onSuccess: onCriado, onError: (err) => setErro((err as { message?: string })?.message ?? "Falha ao criar serviço") },
          );
        }}
      >
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">Categoria</label>
            <select
              required
              className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
            >
              <option value="" disabled>
                Selecione...
              </option>
              {(categorias ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">Nome do serviço</label>
            <input
              required
              className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Limpeza de pele"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">Duração padrão (min)</label>
            <input
              required
              type="number"
              min={5}
              step={5}
              className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
              value={duracao}
              onChange={(e) => setDuracao(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">Preço base (R$)</label>
            <input
              required
              className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-[11.5px] text-secondary-foreground">
            <input type="checkbox" checked={requerProfissional} onChange={(e) => setRequerProfissional(e.target.checked)} />
            Requer profissional
          </label>
          <label className="flex items-center gap-1.5 text-[11.5px] text-secondary-foreground">
            <input type="checkbox" checked={requerRecurso} onChange={(e) => setRequerRecurso(e.target.checked)} />
            Requer sala/recurso
          </label>
          <label className="flex items-center gap-1.5 text-[11.5px] text-secondary-foreground">
            <input type="checkbox" checked={aceitaFaces} onChange={(e) => setAceitaFaces(e.target.checked)} />
            Aceita marcação por face (odontograma)
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">
              Unidade de lançamento {aceitaFaces && <span className="text-destructive">*</span>}
            </label>
            <select
              required={aceitaFaces}
              className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
              value={unidadeLancamento}
              onChange={(e) => setUnidadeLancamento(e.target.value as UnidadeLancamento | "")}
            >
              <option value="">Sem unidade declarada</option>
              {(Object.keys(ROTULO_UNIDADE) as UnidadeLancamento[]).map((u) => (
                <option key={u} value={u}>
                  {ROTULO_UNIDADE[u]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">Quantidade máxima (opcional)</label>
            <input
              type="number"
              min={1}
              className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
              value={quantidadeMaxima}
              onChange={(e) => setQuantidadeMaxima(e.target.value)}
              placeholder="Ex.: 32"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">Código SIGTAP (opcional)</label>
            <input
              className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
              value={codigoSigtap}
              onChange={(e) => setCodigoSigtap(e.target.value)}
              placeholder="Ex.: 03.07.01.003-1"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={criar.isPending}>
            {criar.isPending ? "Criando..." : "Criar serviço"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
          {erro && <span className="text-[11.5px] text-destructive">{erro}</span>}
        </div>
      </form>
    </Card>
  );
}

function FormularioNovaVariante({ servicoId, onCriada }: { servicoId: string; onCriada: () => void }) {
  const criar = useCriarVariante();
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");
  const [duracao, setDuracao] = useState(60);

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        criar.mutate(
          { servicoId, nome, preco: Number(preco.replace(",", ".")) || 0, duracaoMinutos: duracao },
          { onSuccess: () => { setNome(""); setPreco(""); onCriada(); } },
        );
      }}
    >
      <input
        required
        className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
        placeholder="Nome da variante"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
      />
      <input
        required
        className="w-28 rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
        placeholder="Preço"
        value={preco}
        onChange={(e) => setPreco(e.target.value)}
        inputMode="decimal"
      />
      <input
        required
        type="number"
        min={5}
        step={5}
        className="w-24 rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
        value={duracao}
        onChange={(e) => setDuracao(Number(e.target.value))}
      />
      <Button type="submit" size="sm" disabled={criar.isPending}>
        {criar.isPending ? "Salvando..." : "+ Variante"}
      </Button>
    </form>
  );
}

function DetalheServico({ servico }: { servico: Servico }) {
  const definirPadrao = useDefinirVariantePadrao();

  return (
    <Card className="flex flex-col gap-3 p-4">
      <span className="text-[12.5px] font-medium text-foreground">Variantes de {servico.nome}</span>

      {(servico.aceitaFaces || servico.unidadeLancamento || servico.quantidadeMaxima || servico.codigoSigtap) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-content px-3 py-2 text-[10.5px] text-secondary-foreground">
          {servico.codigoSigtap && (
            <span>
              SIGTAP: <code className="font-mono">{servico.codigoSigtap}</code>
            </span>
          )}
          {servico.unidadeLancamento && <span>Lançado {ROTULO_UNIDADE[servico.unidadeLancamento].toLowerCase()}</span>}
          {servico.quantidadeMaxima != null && <span>Máximo de {servico.quantidadeMaxima} por unidade</span>}
          {servico.aceitaFaces && <Badge tone="neutral">Aceita marcação por face</Badge>}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {servico.variantes.length === 0 && <span className="text-[11.5px] text-muted-foreground">Nenhuma variante ainda — o preço base do serviço vale sozinho.</span>}
        {servico.variantes.map((v) => (
          <div key={v.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div className="flex items-center gap-2.5">
              <span className="text-[11.5px] font-medium text-foreground">{v.nome}</span>
              <span className="text-[10.5px] text-muted-foreground">
                {formatoMoeda.format(v.preco)} · {v.duracaoMinutos} min
              </span>
              {v.padrao && <Badge tone="success">Padrão</Badge>}
            </div>
            {!v.padrao && (
              <Button size="sm" variant="outline" disabled={definirPadrao.isPending} onClick={() => definirPadrao.mutate(v.id)}>
                Definir padrão
              </Button>
            )}
          </div>
        ))}
      </div>
      <FormularioNovaVariante servicoId={servico.id} onCriada={() => {}} />
    </Card>
  );
}

/**
 * Semente do catálogo (item 22) — ação opcional e idempotente (nunca
 * automática): a clínica clica quando quiser, e rodar de novo só
 * informa quantos já existiam, não duplica.
 */
function BotaoSemearSigtap() {
  const semear = useSemearProcedimentosSigtap();
  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={semear.isPending}
        onClick={() => {
          setErro(null);
          setResultado(null);
          semear.mutate(undefined, {
            onSuccess: (r) => setResultado(`${r.inseridos} procedimento(s) adicionado(s) · ${r.jaExistentes} já existia(m)`),
            onError: (err) => setErro((err as { message?: string })?.message ?? "Falha ao semear o catálogo"),
          });
        }}
      >
        {semear.isPending ? "Semeando..." : "Semear procedimentos SIGTAP"}
      </Button>
      {resultado && <span className="text-[10.5px] text-success">{resultado}</span>}
      {erro && <span className="text-[10.5px] text-destructive">{erro}</span>}
    </div>
  );
}

export function ServicosTab() {
  const { data: servicos } = useServicos();
  const alternarAtivo = useAlternarAtivoServico();
  const [mostrarNovo, setMostrarNovo] = useState(false);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);

  const lista = servicos ?? [];
  const destaque = lista.filter((s) => s.ativo).slice(0, 3);
  const selecionado = lista.find((s) => s.id === selecionadoId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="max-w-md text-[10.5px] leading-relaxed text-muted-foreground">
          "Semear" cadastra os 64 procedimentos odontológicos comuns da Atenção Básica, com código SIGTAP, unidade de
          lançamento e a quantidade máxima já validada pelo banco — não apaga nem duplica o que a conta já tem.
        </p>
        <div className="flex flex-col items-end gap-2">
          <BotaoSemearSigtap />
          <Button size="sm" onClick={() => setMostrarNovo((v) => !v)}>
            {mostrarNovo ? "Cancelar" : "+ Novo serviço"}
          </Button>
        </div>
      </div>

      {mostrarNovo && <FormularioNovoServico onCriado={() => setMostrarNovo(false)} onCancelar={() => setMostrarNovo(false)} />}

      {destaque.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {destaque.map((s) => {
            const padrao = s.variantes.find((v) => v.padrao);
            return (
              <Card key={s.id} className="flex flex-col gap-2 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-medium text-foreground">{s.nome}</span>
                  <Badge tone={s.ativo ? "success" : "neutral"}>{s.ativo ? "Ativo" : "Inativo"}</Badge>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {s.categoriaNome} · {s.duracaoPadraoMinutos} min
                </span>
                <span className="text-[17px] font-medium text-foreground">{formatoMoeda.format(padrao ? padrao.preco : s.precoBase)}</span>
                <span className="text-[10.5px] text-muted-foreground">
                  {s.variantes.length} variante{s.variantes.length === 1 ? "" : "s"}
                  {padrao ? ` · padrão: ${padrao.nome}` : ""}
                </span>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="flex flex-col overflow-hidden">
        <div className="grid grid-cols-[1.6fr_1fr_0.7fr_0.7fr_1fr_0.7fr] gap-2.5 border-b border-hairline px-3.5 py-2.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
          <span>Serviço</span>
          <span>Categoria</span>
          <span>Duração</span>
          <span>Preço</span>
          <span>Variante padrão</span>
          <span>Situação</span>
        </div>
        {lista.map((s) => {
          const padrao = s.variantes.find((v) => v.padrao);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelecionadoId(s.id === selecionadoId ? null : s.id)}
              className={`grid grid-cols-[1.6fr_1fr_0.7fr_0.7fr_1fr_0.7fr] gap-2.5 border-b border-hairline px-3.5 py-2.5 text-left text-[11.5px] last:border-b-0 hover:bg-content ${selecionadoId === s.id ? "bg-content" : ""}`}
            >
              <span className="flex flex-col gap-0.5">
                <span className="font-medium text-foreground">{s.nome}</span>
                {(s.aceitaFaces || s.codigoSigtap) && (
                  <span className="flex items-center gap-1">
                    {s.aceitaFaces && <Badge tone="neutral">faces</Badge>}
                    {s.codigoSigtap && (
                      <span className="font-mono text-[9px] text-muted-foreground" title="Código SIGTAP">
                        {s.codigoSigtap}
                      </span>
                    )}
                  </span>
                )}
              </span>
              <span className="text-secondary-foreground">{s.categoriaNome}</span>
              <span className="text-secondary-foreground">{s.duracaoPadraoMinutos} min</span>
              <span className="text-secondary-foreground">{formatoMoeda.format(s.precoBase)}</span>
              <span className="text-secondary-foreground">{padrao ? padrao.nome : "—"}</span>
              <span className="flex items-center gap-2">
                <Badge tone={s.ativo ? "success" : "neutral"}>{s.ativo ? "Ativo" : "Inativo"}</Badge>
                <span
                  role="button"
                  className="text-[10.5px] text-primary hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    alternarAtivo.mutate({ id: s.id, ativo: !s.ativo });
                  }}
                >
                  {s.ativo ? "desativar" : "ativar"}
                </span>
              </span>
            </button>
          );
        })}
        {lista.length === 0 && <div className="p-6 text-center text-[11.5px] text-muted-foreground">Nenhum serviço cadastrado ainda.</div>}
      </Card>

      {selecionado && <DetalheServico servico={selecionado} />}
    </div>
  );
}
