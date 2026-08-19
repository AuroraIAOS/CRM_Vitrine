import { useAuth, type AccountRole } from "@/lib/auth";
import { useDefinirPermissao, useMatrizPermissoes, useRemoverExcecao, type CelulaPermissao } from "../api";
import { CardSecao, Nota, Pill, TituloSecao, Vazio } from "./ui";

/**
 * Seção "Perfis e permissões" da tela `1m` — a matriz papel × módulo × ação.
 *
 * A permissão efetiva **não é recalculada aqui**. Ela vem pronta de
 * `access.matriz_permissoes()` (migration 033), que resolve no próprio
 * banco a exceção de `access.module_permissions` contra o padrão de
 * `access.default_permission()`. Reimplementar essa regra em TypeScript é
 * o que o `CLAUDE.md` §14 proíbe, e o motivo é concreto: no dia em que o
 * padrão mudar, a cópia no navegador continuaria exibindo a regra antiga
 * sem errar visivelmente — a tela não quebraria, só mentiria.
 *
 * `owner` não aparece como linha editável porque `access.can()` o
 * curto-circuita para verdadeiro antes de olhar a tabela. Aparece como
 * texto, dizendo isso.
 */

const ACOES: { chave: CelulaPermissao["acao"]; rotulo: string }[] = [
  { chave: "read", rotulo: "Ler" },
  { chave: "create", rotulo: "Criar" },
  { chave: "update", rotulo: "Editar" },
  { chave: "delete", rotulo: "Excluir" },
];

const PAPEIS: { chave: AccountRole; rotulo: string }[] = [
  { chave: "admin", rotulo: "Administrador(a)" },
  { chave: "agent", rotulo: "Membro" },
  { chave: "viewer", rotulo: "Leitura" },
];

function Celula({
  celula,
  podeEditar,
  ocupado,
  aoAlternar,
  aoRestaurar,
}: {
  celula: CelulaPermissao | undefined;
  podeEditar: boolean;
  ocupado: boolean;
  aoAlternar: () => void;
  aoRestaurar: () => void;
}) {
  if (!celula) return <div className="h-[26px]" />;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={!podeEditar || ocupado}
        onClick={aoAlternar}
        title={celula.excecao ? "Exceção definida nesta conta" : "Valor padrão do papel"}
        className={`h-[22px] w-[22px] rounded-[4px] border text-[11px] leading-none transition-colors ${
          celula.permitido
            ? "border-primary bg-accent text-accent-foreground"
            : "border-input bg-background text-muted-foreground"
        } ${!podeEditar || ocupado ? "cursor-not-allowed opacity-60" : "hover:border-primary"}`}
      >
        {celula.permitido ? "✓" : "—"}
      </button>
      {celula.excecao && podeEditar && (
        <button
          type="button"
          onClick={aoRestaurar}
          disabled={ocupado}
          title="Voltar ao padrão do banco"
          className="text-[9px] text-muted-foreground underline-offset-2 hover:underline"
        >
          padrão
        </button>
      )}
    </div>
  );
}

export function PerfisEPermissoes() {
  const { profile } = useAuth();
  const { data: matriz, isPending, error } = useMatrizPermissoes();
  const definir = useDefinirPermissao();
  const remover = useRemoverExcecao();

  const ehOwner = profile?.accountRole === "owner";
  const ocupado = definir.isPending || remover.isPending;

  if (isPending) return <Vazio>Carregando matriz de permissões…</Vazio>;
  if (error) return <Vazio>Não foi possível ler a matriz: {(error as Error).message}</Vazio>;

  if (!matriz || matriz.length === 0) {
    return (
      <CardSecao>
        <TituloSecao titulo="Perfis e permissões" />
        <Nota tom="atencao">
          A matriz de permissões é visível a partir de <strong>administrador</strong> — o banco devolve conjunto vazio
          para os demais papéis, por desenho (fail-closed).
        </Nota>
      </CardSecao>
    );
  }

  const modulos = Array.from(new Map(matriz.map((c) => [c.moduloChave, c.moduloRotulo])).entries());
  const excecoes = matriz.filter((c) => c.excecao).length;

  function achar(papel: AccountRole, moduloChave: string, acao: CelulaPermissao["acao"]) {
    return matriz!.find((c) => c.papel === papel && c.moduloChave === moduloChave && c.acao === acao);
  }

  return (
    <div className="flex flex-col gap-3">
      <CardSecao>
        <TituloSecao
          titulo="Perfis e permissões"
          descricao="O que cada papel pode fazer em cada módulo."
          acessorio={
            <Pill tom={excecoes > 0 ? "warning" : "muted"}>
              {excecoes === 0 ? "tudo no padrão" : `${excecoes} exceção${excecoes > 1 ? "es" : ""}`}
            </Pill>
          }
        />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="w-[190px] py-1.5 text-left font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
                  Módulo
                </th>
                {PAPEIS.map((p) => (
                  <th
                    key={p.chave}
                    colSpan={ACOES.length}
                    className="border-l border-hairline py-1.5 text-center font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground"
                  >
                    {p.rotulo}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-border">
                <th />
                {PAPEIS.flatMap((p) =>
                  ACOES.map((a, i) => (
                    <th
                      key={`${p.chave}-${a.chave}`}
                      className={`py-1 text-center text-[9.5px] font-normal text-muted-foreground ${
                        i === 0 ? "border-l border-hairline" : ""
                      }`}
                    >
                      {a.rotulo}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {modulos.map(([chave, rotulo]) => (
                <tr key={chave} className="border-b border-hairline last:border-b-0">
                  <td className="py-1.5 text-[11px] text-secondary-foreground">
                    {rotulo}
                    <span className="ml-1.5 font-mono text-[9px] text-muted-foreground">{chave}</span>
                  </td>
                  {PAPEIS.flatMap((p) =>
                    ACOES.map((a, i) => {
                      const celula = achar(p.chave, chave, a.chave);
                      return (
                        <td key={`${p.chave}-${a.chave}`} className={`py-1.5 ${i === 0 ? "border-l border-hairline" : ""}`}>
                          <div className="flex justify-center">
                            <Celula
                              celula={celula}
                              podeEditar={ehOwner}
                              ocupado={ocupado}
                              aoAlternar={() =>
                                definir.mutate({
                                  papel: p.chave,
                                  moduloChave: chave,
                                  acao: a.chave,
                                  permitido: !(celula?.permitido ?? false),
                                })
                              }
                              aoRestaurar={() => remover.mutate({ papel: p.chave, moduloChave: chave, acao: a.chave })}
                            />
                          </div>
                        </td>
                      );
                    }),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(definir.isError || remover.isError) && (
          <Nota tom="atencao">
            {((definir.error ?? remover.error) as Error)?.message}
          </Nota>
        )}
      </CardSecao>

      <CardSecao>
        <TituloSecao titulo="O que esta matriz não controla" />
        <Nota>
          <strong>Proprietário(a) não tem linha aqui.</strong> Não é omissão: <code>access.can()</code> devolve
          verdadeiro para esse papel antes de consultar a tabela, então uma linha de proprietário aceitaria o clique e
          não mudaria nada.
        </Nota>
        <Nota>
          <strong>Prontuário tem regime próprio.</strong> Marcar "Ler" em <code>health</code> não basta para ninguém
          enxergar registro clínico: <code>aba_health.pode_acessar()</code> ainda exige atributo profissional com
          acesso clínico ou concessão nominal, e registra cada leitura em <code>log_acesso</code>. Esta matriz é uma
          das condições, nunca a única.
        </Nota>
        {!ehOwner && (
          <Nota tom="atencao">
            Você está como <strong>{profile?.accountRole}</strong>: a matriz é visível, mas só o proprietário escreve
            (política de <code>access.module_permissions</code>). Os botões estão desabilitados porque o banco recusaria
            de qualquer forma.
          </Nota>
        )}
      </CardSecao>
    </div>
  );
}
