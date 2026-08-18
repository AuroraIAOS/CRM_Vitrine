import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import {
  usePessoa,
  useAtualizarPessoa,
  useAtualizarStatusLead,
  useAtualizarStatusCliente,
  useConverterLead,
  useTagsDaConta,
  useCriarTag,
  useAdicionarTag,
  useRemoverTag,
  useNotas,
  useAdicionarNota,
  useCamposCustomizados,
  useCriarCampoCustomizado,
  useValoresCampos,
  useDefinirValorCampo,
  LEAD_STATUS_LABEL,
  CLIENTE_STATUS_LABEL,
  type PessoaDetalhe,
} from "./api";

type AbaFicha = "timeline" | "prontuario" | "financeiro" | "documentos" | "campos";

const ABAS: Array<{ key: AbaFicha; label: string }> = [
  { key: "timeline", label: "Linha do tempo" },
  { key: "prontuario", label: "Prontuário" },
  { key: "financeiro", label: "Financeiro" },
  { key: "documentos", label: "Documentos" },
  { key: "campos", label: "Campos personalizados" },
];

/** Módulo ainda não construído (docs/00 — Subetapas 02.8/02.9) — mesmo espírito do components/shared/Placeholder.tsx, só que dentro de uma aba. */
function AbaNaoImplementada({ modulo, subetapa }: { modulo: string; subetapa: string }) {
  return (
    <div className="flex items-center justify-center rounded-md border border-dashed border-input py-10 text-[11.5px] text-muted-foreground">
      {modulo} ainda não implementado — chega na Subetapa {subetapa}.
    </div>
  );
}

function CabecalhoPessoa({ pessoa }: { pessoa: PessoaDetalhe }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(pessoa.nomeExibicao);
  const [email, setEmail] = useState(pessoa.email ?? "");
  const [telefone, setTelefone] = useState(pessoa.telefone ?? "");
  const atualizar = useAtualizarPessoa(pessoa.id);
  const atualizarStatusLead = useAtualizarStatusLead(pessoa.id);
  const atualizarStatusCliente = useAtualizarStatusCliente(pessoa.id);
  const converter = useConverterLead();

  const podeConverter = pessoa.lead && pessoa.lead.status !== "convertido" && pessoa.lead.status !== "desqualificado";

  if (editando) {
    return (
      <Card className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">Nome</label>
            <input className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">E-mail</label>
            <input className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">Telefone</label>
            <input className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={atualizar.isPending}
            onClick={() =>
              atualizar.mutate({ nomeExibicao: nome, email: email || null, telefone: telefone || null }, { onSuccess: () => setEditando(false) })
            }
          >
            {atualizar.isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex items-start gap-4 p-4">
      <div className="h-14 w-14 shrink-0 rounded-full bg-accent" />
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[17px] font-medium text-foreground">{pessoa.nomeExibicao}</span>
          {pessoa.cliente && <Badge tone="success">Cliente</Badge>}
          {pessoa.lead && <Badge>Lead</Badge>}
          {pessoa.funcionario && <Badge tone="warning">Equipe</Badge>}
          {pessoa.fornecedor && <Badge>Fornecedor</Badge>}

          {pessoa.cliente && (
            <select
              className="rounded-[5px] border border-input bg-background px-1.5 py-0.5 text-[10.5px]"
              value={pessoa.cliente.status}
              disabled={atualizarStatusCliente.isPending}
              onChange={(e) => atualizarStatusCliente.mutate(e.target.value as "ativo" | "inativo")}
            >
              {Object.entries(CLIENTE_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
          {pessoa.lead && pessoa.lead.status !== "convertido" && (
            <select
              className="rounded-[5px] border border-input bg-background px-1.5 py-0.5 text-[10.5px]"
              value={pessoa.lead.status}
              disabled={atualizarStatusLead.isPending}
              onChange={(e) => atualizarStatusLead.mutate(e.target.value as "novo" | "qualificado" | "desqualificado")}
            >
              {(["novo", "qualificado", "desqualificado"] as const).map((v) => (
                <option key={v} value={v}>
                  {LEAD_STATUS_LABEL[v]}
                </option>
              ))}
            </select>
          )}
        </div>
        <span className="text-[11.5px] text-muted-foreground">
          {pessoa.email || "sem e-mail"} · {pessoa.telefone || "sem telefone"}
        </span>
        <span className="text-[10.5px] text-muted-foreground">Cadastrada em {format(new Date(pessoa.criadoEm), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {podeConverter && (
          <Button size="sm" disabled={converter.isPending} onClick={() => converter.mutate(pessoa.id)}>
            {converter.isPending ? "Convertendo..." : "Converter em cliente"}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
          Editar dados
        </Button>
      </div>
    </Card>
  );
}

function SecaoTags({ pessoa }: { pessoa: PessoaDetalhe }) {
  const { profile } = useAuth();
  const podeAdmin = profile?.accountRole === "owner" || profile?.accountRole === "admin";
  const { data: tagsConta } = useTagsDaConta();
  const criarTag = useCriarTag();
  const adicionar = useAdicionarTag(pessoa.id);
  const remover = useRemoverTag(pessoa.id);
  const [mostrarPicker, setMostrarPicker] = useState(false);
  const [novaTag, setNovaTag] = useState("");

  const disponiveis = (tagsConta ?? []).filter((t) => !pessoa.tags.some((pt) => pt.id === t.id));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pessoa.tags.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-content px-2 py-0.5 text-[10px] text-secondary-foreground">
          {t.nome}
          <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => remover.mutate(t.id)} aria-label={`Remover ${t.nome}`}>
            ×
          </button>
        </span>
      ))}
      <div className="relative">
        <button
          type="button"
          className="rounded-full border border-dashed border-input px-2 py-0.5 text-[10px] text-muted-foreground hover:border-primary"
          onClick={() => setMostrarPicker((v) => !v)}
        >
          + tag
        </button>
        {mostrarPicker && (
          <div className="absolute left-0 top-6 z-10 flex w-56 flex-col gap-1.5 rounded-md border border-border bg-background p-2 shadow-sm">
            {disponiveis.length === 0 && <span className="text-[10.5px] text-muted-foreground">Nenhuma tag disponível.</span>}
            {disponiveis.map((t) => (
              <button
                key={t.id}
                type="button"
                className="rounded-[5px] px-2 py-1 text-left text-[11px] hover:bg-content"
                onClick={() => {
                  adicionar.mutate(t.id);
                  setMostrarPicker(false);
                }}
              >
                {t.nome}
              </button>
            ))}
            {podeAdmin && (
              <div className="flex gap-1 border-t border-hairline pt-1.5">
                <input
                  placeholder="Nova tag"
                  className="flex-1 rounded-[5px] border border-input bg-background px-1.5 py-1 text-[11px]"
                  value={novaTag}
                  onChange={(e) => setNovaTag(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={!novaTag.trim() || criarTag.isPending}
                  onClick={() =>
                    criarTag.mutate(
                      { nome: novaTag.trim() },
                      {
                        onSuccess: (t) => {
                          adicionar.mutate(t.id);
                          setNovaTag("");
                          setMostrarPicker(false);
                        },
                      },
                    )
                  }
                >
                  +
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LinhaDoTempo({ pessoa }: { pessoa: PessoaDetalhe }) {
  const { data: notas } = useNotas(pessoa.id);

  type Evento = { data: string; titulo: string; detalhe: string };
  const eventos: Evento[] = [
    { data: pessoa.criadoEm, titulo: "Pessoa cadastrada", detalhe: pessoa.lead ? `Origem: ${pessoa.lead.origem}` : "Cadastro manual" },
    ...(pessoa.lead?.status === "convertido"
      ? [{ data: pessoa.criadoEm, titulo: "Convertida de lead em cliente", detalhe: `Origem: ${pessoa.lead.origem}` }]
      : []),
    ...(notas ?? []).map((n) => ({ data: n.criadoEm, titulo: "Nota registrada", detalhe: `${n.autor} · ${n.conteudo}` })),
  ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  if (eventos.length === 0) {
    return <span className="text-[11.5px] text-muted-foreground">Nenhum evento registrado ainda.</span>;
  }

  return (
    <div className="flex flex-col">
      {eventos.map((ev, i) => (
        <div key={i} className="grid grid-cols-[74px_1fr] gap-3 border-b border-hairline py-2.5 last:border-0">
          <span className="font-mono text-[10px] text-muted-foreground">{format(new Date(ev.data), "dd MMM", { locale: ptBR })}</span>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11.5px] font-medium text-foreground">{ev.titulo}</span>
            <span className="text-[11px] text-muted-foreground">{ev.detalhe}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function CamposPersonalizados({ pessoa }: { pessoa: PessoaDetalhe }) {
  const { profile } = useAuth();
  const podeAdmin = profile?.accountRole === "owner" || profile?.accountRole === "admin";
  const { data: definicoes } = useCamposCustomizados();
  const { data: valores } = useValoresCampos(pessoa.id);
  const definirValor = useDefinirValorCampo(pessoa.id);
  const criarCampo = useCriarCampoCustomizado();
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState("texto");

  return (
    <div className="flex flex-col gap-3">
      {(definicoes ?? []).length === 0 && <span className="text-[11.5px] text-muted-foreground">Nenhum campo personalizado definido ainda.</span>}
      {(definicoes ?? []).map((campo) => {
        const valorAtual = (valores ?? []).find((v) => v.campo_id === campo.id)?.valor ?? "";
        return (
          <div key={campo.id} className="flex items-center justify-between gap-3">
            <span className="text-[11.5px] text-secondary-foreground">{campo.nome}</span>
            <input
              className="w-56 rounded-[5px] border border-input bg-background px-2 py-1 text-[11.5px]"
              type={campo.tipoCampo === "numero" ? "number" : campo.tipoCampo === "data" ? "date" : "text"}
              defaultValue={typeof valorAtual === "string" ? valorAtual : JSON.stringify(valorAtual)}
              onBlur={(e) => {
                if (e.target.value === (typeof valorAtual === "string" ? valorAtual : "")) return;
                definirValor.mutate({ campoId: campo.id, valor: e.target.value });
              }}
            />
          </div>
        );
      })}
      {podeAdmin && (
        <div className="flex items-end gap-2 border-t border-hairline pt-3">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-[11px] font-medium text-secondary-foreground">Novo campo</label>
            <input className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
          </div>
          <select className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]" value={novoTipo} onChange={(e) => setNovoTipo(e.target.value)}>
            <option value="texto">Texto</option>
            <option value="numero">Número</option>
            <option value="data">Data</option>
            <option value="booleano">Sim/Não</option>
          </select>
          <Button
            size="sm"
            disabled={!novoNome.trim() || criarCampo.isPending}
            onClick={() => criarCampo.mutate({ nome: novoNome.trim(), tipoCampo: novoTipo }, { onSuccess: () => setNovoNome("") })}
          >
            + Adicionar
          </Button>
        </div>
      )}
    </div>
  );
}

function NotasInternas({ pessoaId }: { pessoaId: string }) {
  const { data: notas, isLoading } = useNotas(pessoaId);
  const adicionar = useAdicionarNota(pessoaId);
  const [conteudo, setConteudo] = useState("");

  return (
    <Card className="flex flex-1 flex-col gap-2.5 p-3.5">
      <span className="text-[12.5px] font-medium text-foreground">Notas internas</span>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!conteudo.trim()) return;
          adicionar.mutate(conteudo.trim(), { onSuccess: () => setConteudo("") });
        }}
      >
        <input
          className="flex-1 rounded-[5px] border border-input bg-background px-2 py-1.5 text-[11.5px]"
          placeholder="Escrever nota..."
          value={conteudo}
          onChange={(e) => setConteudo(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={!conteudo.trim() || adicionar.isPending}>
          +
        </Button>
      </form>
      <div className="flex flex-col gap-2 overflow-y-auto">
        {isLoading && <span className="text-[11px] text-muted-foreground">Carregando…</span>}
        {(notas ?? []).length === 0 && !isLoading && (
          <span className="rounded-md border border-dashed border-input p-3 text-center text-[10.5px] text-muted-foreground">Nenhuma nota ainda.</span>
        )}
        {(notas ?? []).map((n) => (
          <div key={n.id} className="flex flex-col gap-1 rounded-md bg-content p-2.5">
            <span className="text-[11px] leading-relaxed text-secondary-foreground">{n.conteudo}</span>
            <span className="font-mono text-[9.5px] text-muted-foreground">
              {n.autor} · {format(new Date(n.criadoEm), "dd MMM", { locale: ptBR })}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function PessoaFichaPage() {
  const { id } = useParams<{ id: string }>();
  const { data: pessoa, isLoading, isError } = usePessoa(id);
  const [aba, setAba] = useState<AbaFicha>("timeline");

  if (isLoading) return <div className="p-6 text-[12px] text-muted-foreground">Carregando…</div>;
  if (isError || !pessoa) {
    return (
      <Card className="p-6">
        <span className="text-[12px] text-destructive">Pessoa não encontrada.</span>{" "}
        <Link to="/pessoas" className="text-[12px] text-primary underline">
          Voltar à lista
        </Link>
      </Card>
    );
  }

  return (
    <div className="grid h-full grid-cols-[1.5fr_1fr] gap-3">
      <div className="flex min-h-0 flex-col gap-3">
        <CabecalhoPessoa pessoa={pessoa} />
        <Card className="flex flex-1 flex-col overflow-hidden">
          <div className="flex gap-1 border-b border-hairline px-3.5 pt-2">
            {ABAS.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => setAba(a.key)}
                className={
                  aba === a.key
                    ? "border-b-2 border-primary px-2.5 py-2 text-[11.5px] font-semibold text-accent-foreground"
                    : "px-2.5 py-2 text-[11.5px] text-muted-foreground hover:text-foreground"
                }
              >
                {a.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-3.5">
            <div className="mb-3">
              <SecaoTags pessoa={pessoa} />
            </div>
            {aba === "timeline" && <LinhaDoTempo pessoa={pessoa} />}
            {aba === "prontuario" && <AbaNaoImplementada modulo="Prontuário" subetapa="02.9" />}
            {aba === "financeiro" && <AbaNaoImplementada modulo="Financeiro" subetapa="02.8" />}
            {aba === "documentos" && <AbaNaoImplementada modulo="Documentos" subetapa="futura (backlog)" />}
            {aba === "campos" && <CamposPersonalizados pessoa={pessoa} />}
          </div>
        </Card>
      </div>
      <NotasInternas pessoaId={pessoa.id} />
    </div>
  );
}
