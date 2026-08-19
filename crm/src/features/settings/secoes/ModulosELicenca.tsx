import { useLicenca, useMatrizPermissoes, useModulosDaConta } from "../api";
import { CardSecao, LinhaDado, Nota, Pill, TituloSecao, Vazio } from "./ui";

/**
 * Seção "Módulos e licença" da tela `1m`.
 *
 * O wireframe desenha um INTERRUPTOR por módulo, e ele não foi construído
 * — de propósito, e por decisão de Max (2026-08-19), depois de a medição
 * abaixo ser apresentada.
 *
 * `access.can()` começa com `IF v_role = 'owner' THEN RETURN TRUE`, ANTES
 * de consultar `access.module_permissions`. Um interruptor de "desativar
 * módulo nesta conta" gravaria a linha, devolveria sucesso e **não
 * esconderia nada para quem acabou de clicar** — o proprietário continua
 * lendo o módulo. Um controle que aceita o comando e não produz o efeito
 * prometido é pior que um controle ausente: o ausente você percebe.
 *
 * Então este grid mostra ESTADO, e a edição de verdade vive em "Perfis e
 * permissões", que é onde o modelo de dados de fato permite mexer.
 */
export function ModulosELicenca() {
  const { data: modulos, isPending } = useModulosDaConta();
  const { data: licenca } = useLicenca();
  const { data: matriz } = useMatrizPermissoes();

  if (isPending || !modulos) return <Vazio>Carregando módulos…</Vazio>;

  const naoNucleo = modulos.filter((m) => !m.nucleo);

  /** Papéis (fora `owner`) que leem o módulo — vem da matriz resolvida pelo banco. */
  function quemLe(chave: string): string[] {
    return (matriz ?? [])
      .filter((c) => c.moduloChave === chave && c.acao === "read" && c.permitido)
      .map((c) => c.papel);
  }

  const ROTULO_PAPEL: Record<string, string> = { admin: "admin", agent: "membro", viewer: "leitura" };

  return (
    <div className="flex flex-col gap-3">
      <CardSecao>
        <TituloSecao
          titulo="Módulos ativos nesta conta"
          descricao="Os eixos que a licença Vitrine entrega."
          acessorio={
            <span className="shrink-0 text-[10.5px] text-muted-foreground">
              licença Vitrine · {naoNucleo.length} de {naoNucleo.length}
            </span>
          }
        />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {naoNucleo.map((m) => {
            const leitores = quemLe(m.chave);
            return (
              <div
                key={m.chave}
                className="flex flex-col gap-1.5 rounded-md border border-border p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-secondary-foreground">{m.rotulo}</span>
                  <Pill tom="success">ativo</Pill>
                </div>
                <span className="font-mono text-[9px] text-muted-foreground">aba_{m.chave}</span>
                <span className="text-[10px] text-muted-foreground">
                  {matriz === undefined
                    ? "—"
                    : leitores.length === 0
                      ? "só o proprietário lê"
                      : `lê: ${leitores.map((p) => ROTULO_PAPEL[p] ?? p).join(", ")}`}
                </span>
              </div>
            );
          })}
        </div>
        <Nota>
          Este grid não tem interruptor porque um interruptor aqui mentiria:{" "}
          <code>access.can()</code> devolve verdadeiro para o <strong>proprietário</strong> antes mesmo de consultar a
          tabela de permissões, então desligar um módulo não o esconderia de quem está olhando esta tela. Quem controla
          o acesso por papel é a seção <strong>Perfis e permissões</strong>.
        </Nota>
      </CardSecao>

      <CardSecao>
        <TituloSecao titulo="Licença e assentos" />
        <div className="flex flex-col">
          <LinhaDado rotulo="Pessoas com acesso">
            {licenca ? (
              <>
                {licenca.assentosUsados}
                {licenca.assentosMaximos !== null && ` de ${licenca.assentosMaximos}`}
              </>
            ) : (
              "—"
            )}
          </LinhaDado>
          <LinhaDado rotulo="Teto de usuários">
            {licenca?.assentosMaximos ?? <span className="text-muted-foreground">sem teto definido</span>}
          </LinhaDado>
          {licenca?.observacao && <LinhaDado rotulo="Observação">{licenca.observacao}</LinhaDado>}
        </div>
        <Nota>
          O teto de assentos é <strong>somente leitura</strong> aqui. Ele é limite comercial da licença, não
          configuração que a própria conta ajusta — e o banco concorda: <code>licensing.account_limits</code> não tem
          política de escrita para ninguém abaixo da plataforma. Toda mudança fica registrada em{" "}
          <code>limit_changes</code> e aparece na seção Auditoria.
        </Nota>
      </CardSecao>
    </div>
  );
}
