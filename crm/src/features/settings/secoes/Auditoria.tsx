import { useAuditoria } from "../api";
import { Badge } from "@/components/ui/badge";
import { CardSecao, Nota, TituloSecao, Vazio } from "./ui";

const formatoDataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

/**
 * Seção "Auditoria" da tela `1m` — "Ações dos usuários" é o item 8 do
 * MVP odontológico (Subetapa 03.5), acrescentado à seção que a 02.12 já
 * tinha criado para a trilha de licenciamento.
 *
 * Dois registros que o banco mantém sozinho e que ninguém consegue apagar
 * pela interface: leitura/escrita de registro clínico
 * (`aba_health.log_acesso`, gravado por função, não por política) e mudança
 * de teto de assentos (`licensing.limit_changes`, gravado por trigger).
 *
 * `log_acesso` só é legível pelo `owner` desde a migration 041 — nem
 * `admin` vê a atividade dos colegas sobre dado clínico (decisão do
 * produto, não acidente de RLS). Por isso a tela nunca esconde a seção
 * "atrás" de uma checagem de papel: ela SEMPRE tenta mostrar, e um
 * conjunto vazio já é a resposta certa para quem não é owner — a mesma
 * régua de "declarar o alcance, não inventar número" que o resto de
 * `aba_health` usa. Nenhuma checagem de papel duplicada no client.
 */
export function Auditoria() {
  const { data, isPending, error } = useAuditoria();

  if (isPending) return <Vazio>Carregando auditoria…</Vazio>;
  if (error) return <Vazio>Não foi possível ler a auditoria: {(error as Error).message}</Vazio>;

  return (
    <div className="flex flex-col gap-3">
      <CardSecao>
        <TituloSecao
          titulo="Ações dos usuários"
          descricao="Quem acessou dado clínico e quantas vezes — visível só ao proprietário da conta."
        />
        {(data?.acoesPorUsuario ?? []).length === 0 ? (
          <Vazio>
            Nenhuma ação para mostrar — ou ninguém acessou dado clínico ainda, ou você não é o proprietário da conta
            (este relatório é exclusivo dele, mesmo para administrador).
          </Vazio>
        ) : (
          <div className="flex flex-col">
            <div className="grid grid-cols-[1fr_80px_80px_130px] gap-2 border-b border-hairline pb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>Usuário</span>
              <span className="text-right">Leituras</span>
              <span className="text-right">Escritas</span>
              <span className="text-right">Última ação</span>
            </div>
            {data!.acoesPorUsuario.map((u) => (
              <div
                key={u.userId}
                className="grid grid-cols-[1fr_80px_80px_130px] items-center gap-2 border-b border-hairline py-2 text-[11px] text-secondary-foreground last:border-b-0"
              >
                <span className="text-foreground">{u.nome}</span>
                <span className="text-right font-mono">{u.leituras}</span>
                <span className="text-right font-mono">{u.escritas}</span>
                <span className="text-right font-mono text-[10px] text-muted-foreground">{formatoDataHora.format(new Date(u.ultimaAcao))}</span>
              </div>
            ))}
          </div>
        )}
        <Nota>
          Contagem sobre os últimos 500 eventos de <code>aba_health.log_acesso</code> — janela declarada, não o
          histórico inteiro da conta. O log é gravado por <strong>função do banco</strong>, não por política de RLS —
          política autoriza, mas não registra. É por isso que ele existe: sem ele, uma leitura permitida passaria sem
          deixar rastro.
        </Nota>
      </CardSecao>

      <CardSecao>
        <TituloSecao titulo="Eventos recentes" descricao="Últimos 12 acessos, um por linha." acessorio={<Badge tone="neutral">detalhe</Badge>} />
        {(data?.clinica ?? []).length === 0 ? (
          <Vazio>Nenhum evento recente.</Vazio>
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
                <span className="text-[10px] text-muted-foreground">{l.detalhe}</span>
              </div>
            ))}
          </div>
        )}
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
