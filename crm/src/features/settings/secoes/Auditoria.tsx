import { useAuditoria } from "../api";
import { CardSecao, Nota, TituloSecao, Vazio } from "./ui";

/**
 * Seção "Auditoria" da tela `1m`.
 *
 * Dois registros que o banco mantém sozinho e que ninguém consegue apagar
 * pela interface: leitura/escrita de registro clínico
 * (`aba_health.log_acesso`, gravado por função, não por política) e mudança
 * de teto de assentos (`licensing.limit_changes`, gravado por trigger).
 *
 * `log_acesso` está sob a mesma RLS restritiva do resto de `aba_health` —
 * quem não tem alcance clínico vê a lista vazia. Está dito na tela, porque
 * lista vazia lê como "ninguém acessou nada", que é outra afirmação.
 */
export function Auditoria() {
  const { data, isPending, error } = useAuditoria();

  if (isPending) return <Vazio>Carregando auditoria…</Vazio>;
  if (error) return <Vazio>Não foi possível ler a auditoria: {(error as Error).message}</Vazio>;

  return (
    <div className="flex flex-col gap-3">
      <CardSecao>
        <TituloSecao titulo="Acessos a registro clínico" descricao="Últimos 12 eventos registrados pelo banco." />
        {(data?.clinica ?? []).length === 0 ? (
          <Vazio>Nenhum acesso registrado — ou você não tem alcance clínico para enxergar o log.</Vazio>
        ) : (
          <div className="flex flex-col">
            {data!.clinica.map((l) => (
              <div
                key={l.id}
                className="grid grid-cols-[130px_1fr_auto] items-center gap-2 border-b border-hairline py-2 text-[11px] text-secondary-foreground last:border-b-0"
              >
                <span className="font-mono text-[10px] text-muted-foreground">
                  {new Date(l.quando).toLocaleString("pt-BR")}
                </span>
                <span>{l.o_que}</span>
                <code className="font-mono text-[9px] text-muted-foreground">{l.detalhe.slice(0, 8)}</code>
              </div>
            ))}
          </div>
        )}
        <Nota>
          Este log é gravado por <strong>função do banco</strong>, não por política de RLS — política autoriza, mas não
          registra. É por isso que ele existe: sem ele, uma leitura permitida passaria sem deixar rastro.
        </Nota>
      </CardSecao>

      <CardSecao>
        <TituloSecao titulo="Mudanças de licença" descricao="Alterações no teto de assentos da conta." />
        {(data?.licenca ?? []).length === 0 ? (
          <Vazio>Nenhuma alteração registrada.</Vazio>
        ) : (
          <div className="flex flex-col">
            {data!.licenca.map((l) => (
              <div
                key={l.id}
                className="grid grid-cols-[130px_1fr_auto] items-center gap-2 border-b border-hairline py-2 text-[11px] text-secondary-foreground last:border-b-0"
              >
                <span className="font-mono text-[10px] text-muted-foreground">
                  {new Date(l.quando).toLocaleString("pt-BR")}
                </span>
                <span className="font-mono">{l.o_que}</span>
                <span className="font-mono text-[10px]">{l.detalhe}</span>
              </div>
            ))}
          </div>
        )}
        <Nota>
          O teto de assentos ainda é alterado direto no banco, sem tela de gestão — pendência aberta em{" "}
          <code>docs/00</code>. Este registro é o que existe hoje de trilha: a mudança não tem interface, mas não
          acontece em silêncio.
        </Nota>
      </CardSecao>
    </div>
  );
}
