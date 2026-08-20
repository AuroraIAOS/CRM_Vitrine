import { Link } from "react-router-dom";
import { useEstadoIA } from "../api";
import { CardSecao, LinhaDado, Nota, Pill, TituloSecao, Vazio } from "./ui";

/**
 * Seção "Chaves de IA" da tela `1m`.
 *
 * Mostra ESTADO. A chave em si não é exibida aqui, nem poderia ser: a
 * coluna `aba_ai.ia_configuracoes.chave_api` é cifrada em AES-256-GCM e
 * negada a `authenticated` desde a migration 022 — `select` dela devolve
 * `42501` até para o proprietário da conta (medido na Subetapa 02.11).
 *
 * Colar ou trocar a chave é ato da tela `1l` (/ia), que passa pela Edge
 * Function `ia-configurar` — a única que tem a `ENCRYPTION_KEY` e que
 * verifica a chave contra o provedor ANTES de gravar.
 */
export function ChavesDeIA() {
  const { data, isPending, error } = useEstadoIA();

  if (isPending) return <Vazio>Carregando estado da IA…</Vazio>;
  if (error) return <Vazio>Não foi possível ler a configuração: {(error as Error).message}</Vazio>;

  return (
    <div className="flex flex-col gap-3">
      <CardSecao>
        <TituloSecao
          titulo="Agente de IA"
          descricao="Chave própria da conta — o produto não tem chave de LLM."
          acessorio={
            <Link to="/ia" className="shrink-0 text-[10.5px] text-primary underline-offset-2 hover:underline">
              abrir IA →
            </Link>
          }
        />
        {!data?.configurada ? (
          <Vazio>Nenhuma chave conectada nesta conta. A conexão acontece na tela do módulo IA.</Vazio>
        ) : (
          <div className="flex flex-col">
            <LinhaDado rotulo="Provedor">
              <code className="font-mono text-[10.5px]">{data.provedor}</code>
            </LinhaDado>
            <LinhaDado rotulo="Modelo">
              <code className="font-mono text-[10.5px]">{data.modelo ?? "—"}</code>
            </LinhaDado>
            <LinhaDado rotulo="Agente">
              <Pill tom={data.ativo ? "success" : "muted"}>{data.ativo ? "ativo" : "desligado"}</Pill>
            </LinhaDado>
            <LinhaDado rotulo="Resposta automática">
              <Pill tom={data.respostaAutomatica ? "warning" : "muted"}>
                {data.respostaAutomatica ? "ligada" : "desligada"}
              </Pill>
            </LinhaDado>
          </div>
        )}
        <Nota>
          <strong>A chave nunca é devolvida — nem para esta tela, nem para a do módulo.</strong> Ela é gravada cifrada
          e a coluna é negada à API; o que a interface pode mostrar é que existe uma, de qual provedor. Se a chave se
          perder, o caminho é colar outra, não recuperar esta.
        </Nota>
        <Nota>
          <strong>O agente não lê prontuário</strong>, e isso é garantia de banco, não promessa de configuração: um
          CHECK em <code>ia_configuracoes</code> recusa ligar essa permissão — nem o proprietário consegue. Um agente
          automático lê com privilégio de servidor, que não passa pelo controle de acesso clínico nem registra quem
          leu; liberar exigiria construir esse caminho auditado antes.
        </Nota>
      </CardSecao>
    </div>
  );
}
