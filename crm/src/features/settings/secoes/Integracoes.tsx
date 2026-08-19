import { Link } from "react-router-dom";
import { useIntegracoes } from "../api";
import { CardSecao, LinhaDado, Nota, Pill, TituloSecao, Vazio } from "./ui";

/**
 * Seção "Integrações" da tela `1m`.
 *
 * Estado das conexões externas — nunca o segredo delas. As três tabelas
 * lidas aqui têm coluna escondida de `authenticated` por narrowing
 * (`configuracao_whatsapp.token_acesso_cifrado`, `api_keys.key_hash`,
 * `webhook_endpoints.secret`), e `api.ts` lista as colunas nominalmente:
 * `select('*')` devolveria `42501` e a investigação iria parar em RLS.
 */

function tomDoStatus(status: string): "success" | "warning" | "danger" | "muted" {
  if (status === "conectado" || status === "ativo") return "success";
  if (status === "erro" || status === "falha") return "danger";
  if (status === "desconectado" || status === "pendente") return "warning";
  return "muted";
}

export function Integracoes() {
  const { data, isPending, error } = useIntegracoes();

  if (isPending) return <Vazio>Carregando integrações…</Vazio>;
  if (error) return <Vazio>Não foi possível ler as integrações: {(error as Error).message}</Vazio>;
  if (!data) return <Vazio>Sem dados.</Vazio>;

  const ativas = data.chavesApi.filter((k) => !k.revogadaEm);

  return (
    <div className="flex flex-col gap-3">
      <CardSecao>
        <TituloSecao
          titulo="WhatsApp · Meta Cloud API"
          descricao="O canal por onde a mensageria entra e sai."
          acessorio={
            <Link to="/mensagens" className="shrink-0 text-[10.5px] text-primary underline-offset-2 hover:underline">
              abrir Mensagens →
            </Link>
          }
        />
        {data.whatsapp ? (
          <div className="flex flex-col">
            <LinhaDado rotulo="Estado">
              <Pill tom={tomDoStatus(data.whatsapp.status)}>{data.whatsapp.status}</Pill>
            </LinhaDado>
            <LinhaDado rotulo="Número (id da Meta)">
              <code className="font-mono text-[10px]">{data.whatsapp.idNumero ?? "—"}</code>
            </LinhaDado>
            <LinhaDado rotulo="Conectado em">
              {data.whatsapp.conectadoEm ? new Date(data.whatsapp.conectadoEm).toLocaleString("pt-BR") : "—"}
            </LinhaDado>
            {data.whatsapp.ultimoErro && (
              <LinhaDado rotulo="Último erro">
                <span className="text-destructive-tint-foreground">{data.whatsapp.ultimoErro}</span>
              </LinhaDado>
            )}
          </div>
        ) : (
          <Vazio>Nenhum número conectado nesta conta.</Vazio>
        )}
        <Nota>
          O token de acesso do canal <strong>não aparece aqui e não pode aparecer</strong>: a coluna é cifrada em
          repouso e negada a <code>authenticated</code> no banco, inclusive para o proprietário da conta.
        </Nota>
      </CardSecao>

      <CardSecao>
        <TituloSecao titulo="Webhooks de saída" />
        {data.webhooks.length === 0 ? (
          <Vazio>Nenhum webhook configurado.</Vazio>
        ) : (
          <div className="flex flex-col">
            {data.webhooks.map((w) => (
              <LinhaDado key={w.id} rotulo={w.url}>
                <span className="flex items-center justify-end gap-2">
                  {w.falhas > 0 && <Pill tom="danger">{w.falhas} falha(s)</Pill>}
                  <Pill tom={w.ativo ? "success" : "muted"}>{w.ativo ? "ativo" : "inativo"}</Pill>
                </span>
              </LinhaDado>
            ))}
          </div>
        )}
      </CardSecao>

      <CardSecao>
        <TituloSecao
          titulo="Chaves de API"
          acessorio={<Pill tom={ativas.length > 0 ? "success" : "muted"}>{ativas.length} ativa(s)</Pill>}
        />
        {data.chavesApi.length === 0 ? (
          <Vazio>Nenhuma chave de API emitida.</Vazio>
        ) : (
          <div className="flex flex-col">
            {data.chavesApi.map((k) => (
              <LinhaDado key={k.id} rotulo={k.nome}>
                <span className="flex items-center justify-end gap-2">
                  <code className="font-mono text-[10px] text-muted-foreground">{k.prefixo}…</code>
                  {k.revogadaEm ? (
                    <Pill tom="danger">revogada</Pill>
                  ) : (
                    <Pill tom="success">{k.ultimoUso ? "em uso" : "sem uso"}</Pill>
                  )}
                </span>
              </LinhaDado>
            ))}
          </div>
        )}
        <Nota>
          Só o prefixo é visível — o restante da chave existe apenas como hash no banco, e nem esse hash é legível pela
          API. Chave perdida se revoga e se emite outra; não há caminho de "mostrar de novo", por desenho.
        </Nota>
      </CardSecao>
    </div>
  );
}
