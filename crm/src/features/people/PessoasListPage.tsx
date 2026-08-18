import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  createColumnHelper,
  createPaginatedRowModel,
  flexRender,
  rowPaginationFeature,
  rowSelectionFeature,
  tableFeatures,
  useTable,
  type PaginationState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePessoas, useCriarPessoa, useExcluirPessoas, PAPEL_LABEL, PAPEL_TONE, type Papel, type PessoaListItem } from "./api";

// Features estáveis em escopo de módulo — @tanstack/react-table v9 exige
// registro explícito e reaproveitável (skill migrate-v8-to-v9: "Keep
// features, data, columns stable").
const features = tableFeatures({ rowPaginationFeature, paginatedRowModel: createPaginatedRowModel(), rowSelectionFeature });
const columnHelper = createColumnHelper<typeof features, PessoaListItem>();

const ABAS: Array<{ key: "todas" | Papel; label: string }> = [
  { key: "todas", label: "Todas" },
  { key: "lead", label: "Leads" },
  { key: "cliente", label: "Clientes" },
  { key: "funcionario", label: "Equipe" },
  { key: "fornecedor", label: "Fornecedores" },
];

const columns = columnHelper.columns([
  columnHelper.display({
    id: "select",
    header: (info) => (
      <input
        type="checkbox"
        checked={info.table.getIsAllPageRowsSelected()}
        onChange={info.table.getToggleAllPageRowsSelectedHandler()}
        aria-label="Selecionar todas"
      />
    ),
    cell: (info) => (
      <input type="checkbox" checked={info.row.getIsSelected()} onChange={info.row.getToggleSelectedHandler()} aria-label="Selecionar" />
    ),
  }),
  columnHelper.accessor("nomeExibicao", {
    header: "Nome",
    cell: (info) => (
      <Link to={`/pessoas/${info.row.original.id}`} className="flex items-center gap-2 hover:underline">
        <div className="h-6 w-6 shrink-0 rounded-full bg-accent" />
        <span className="font-medium text-foreground">{info.getValue()}</span>
      </Link>
    ),
  }),
  columnHelper.accessor("papel", {
    header: "Vínculo",
    cell: (info) => {
      const papel = info.getValue();
      return papel ? <Badge tone={PAPEL_TONE[papel]}>{PAPEL_LABEL[papel]}</Badge> : <span className="text-muted-foreground">—</span>;
    },
  }),
  columnHelper.display({
    id: "contato",
    header: "Contato",
    cell: (info) => <span className="text-muted-foreground">{info.row.original.email || info.row.original.telefone || "—"}</span>,
  }),
  columnHelper.display({
    id: "tags",
    header: "Tags",
    cell: (info) => {
      const tags = info.row.original.tags;
      if (tags.length === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 2).map((t) => (
            <Badge key={t.id}>{t.nome}</Badge>
          ))}
          {tags.length > 2 && <span className="text-[10px] text-muted-foreground">+{tags.length - 2}</span>}
        </div>
      );
    },
  }),
  columnHelper.accessor("criadoEm", {
    header: "Criado em",
    cell: (info) => (
      <span className="font-mono text-[10.5px] text-muted-foreground">{format(new Date(info.getValue()), "dd MMM", { locale: ptBR })}</span>
    ),
  }),
]);

function FormularioNovaPessoa({ onCriada }: { onCriada: () => void }) {
  const [papel, setPapel] = useState<"lead" | "cliente" | "fornecedor">("lead");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const criar = useCriarPessoa();

  return (
    <form
      className="flex flex-col gap-2 rounded-md border border-border bg-content p-3"
      onSubmit={(e) => {
        e.preventDefault();
        criar.mutate(
          { papel, nomeExibicao: nome, email: email || undefined, telefone: telefone || undefined },
          {
            onSuccess: () => {
              setNome("");
              setEmail("");
              setTelefone("");
              onCriada();
            },
          },
        );
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-secondary-foreground">Papel</label>
          <select
            className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
            value={papel}
            onChange={(e) => setPapel(e.target.value as typeof papel)}
          >
            <option value="lead">Lead</option>
            <option value="cliente">Cliente</option>
            <option value="fornecedor">Fornecedor</option>
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-[11px] font-medium text-secondary-foreground">Nome</label>
          <input
            required
            className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-[11px] font-medium text-secondary-foreground">E-mail (opcional)</label>
          <input
            type="email"
            className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-[11px] font-medium text-secondary-foreground">Telefone (opcional)</label>
          <input
            className="rounded-[5px] border border-input bg-background px-2 py-1.5 text-[12px]"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
          />
        </div>
        <Button type="submit" size="sm" disabled={criar.isPending}>
          {criar.isPending ? "Criando..." : "Criar"}
        </Button>
      </div>
      {criar.isError && (
        <span className="text-[11.5px] text-destructive">{(criar.error as { message?: string })?.message ?? "Falha ao criar pessoa"}</span>
      )}
    </form>
  );
}

export function PessoasListPage() {
  const { data: pessoas, isLoading } = usePessoas();
  const excluir = useExcluirPessoas();
  const [aba, setAba] = useState<"todas" | Papel>("todas");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const lista = pessoas ?? [];

  const contagens = useMemo(
    () => ({
      todas: lista.length,
      lead: lista.filter((p) => p.papel === "lead").length,
      cliente: lista.filter((p) => p.papel === "cliente").length,
      funcionario: lista.filter((p) => p.papel === "funcionario").length,
      fornecedor: lista.filter((p) => p.papel === "fornecedor").length,
    }),
    [lista],
  );

  const dadosFiltrados = useMemo(() => (aba === "todas" ? lista : lista.filter((p) => p.papel === aba)), [lista, aba]);

  useEffect(() => {
    setRowSelection({});
    setPagination((p) => ({ ...p, pageIndex: 0 }));
    setConfirmandoExclusao(false);
  }, [aba]);

  const table = useTable({
    features,
    columns,
    data: dadosFiltrados,
    getRowId: (row) => row.id,
    state: { pagination, rowSelection },
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
  });

  const selecionadas = table.getSelectedRowIds();

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex items-center justify-between gap-3 p-3">
        <div className="flex flex-wrap gap-1.5">
          {ABAS.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setAba(a.key)}
              className={
                aba === a.key
                  ? "rounded-[5px] bg-accent px-3 py-1.5 text-[11px] font-semibold text-accent-foreground"
                  : "rounded-[5px] px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-content"
              }
            >
              {a.label} · {contagens[a.key === "todas" ? "todas" : (a.key as Papel)]}
            </button>
          ))}
        </div>
        <Button size="sm" variant={mostrarFormulario ? "outline" : "default"} onClick={() => setMostrarFormulario((v) => !v)}>
          {mostrarFormulario ? "Cancelar" : "+ Nova pessoa"}
        </Button>
      </Card>

      {mostrarFormulario && <FormularioNovaPessoa onCriada={() => setMostrarFormulario(false)} />}

      {selecionadas.length > 0 && (
        <div className="flex items-center justify-between rounded-md border border-border bg-content px-3 py-2">
          <span className="text-[11.5px] text-secondary-foreground">{selecionadas.length} selecionada(s)</span>
          {confirmandoExclusao ? (
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] text-destructive">Excluir permanentemente?</span>
              <Button
                size="sm"
                variant="destructive"
                disabled={excluir.isPending}
                onClick={() =>
                  excluir.mutate(selecionadas, {
                    onSuccess: () => {
                      setConfirmandoExclusao(false);
                      setRowSelection({});
                    },
                  })
                }
              >
                {excluir.isPending ? "Excluindo..." : "Confirmar"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmandoExclusao(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setConfirmandoExclusao(true)}>
              Excluir selecionadas
            </Button>
          )}
        </div>
      )}

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-[12px] text-muted-foreground">Carregando…</div>
        ) : lista.length === 0 ? (
          <div className="p-6 text-[12px] text-muted-foreground">Nenhuma pessoa cadastrada ainda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11.5px]">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-hairline">
                    {hg.headers.map((h) => (
                      <th
                        key={h.id}
                        className="whitespace-nowrap px-3 py-2 text-left font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground"
                      >
                        {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-hairline last:border-0 hover:bg-content/60">
                    {row.getAllCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {lista.length > 0 && (
          <div className="flex items-center justify-between border-t border-hairline px-3 py-2">
            <span className="text-[10.5px] text-muted-foreground">
              {dadosFiltrados.length === 0
                ? "0 de 0"
                : `${pagination.pageIndex * pagination.pageSize + 1}–${Math.min(
                    (pagination.pageIndex + 1) * pagination.pageSize,
                    dadosFiltrados.length,
                  )} de ${dadosFiltrados.length}`}
            </span>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
                Anterior
              </Button>
              <Button size="sm" variant="outline" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
                Próxima
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
