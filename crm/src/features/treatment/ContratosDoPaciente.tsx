import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useAssinarComoProfissional,
  useContratosDoCliente,
  useDocumentoDoContrato,
  useEmitirDocumento,
  useEncerrarContrato,
  useRegistrarAssinaturaPaciente,
  useRegistrarExecucaoItem,
  type Contrato,
} from "./api";
import { imprimirHtml } from "./impressao";

/**
 * Os contratos do paciente (Subetapa 03.8.b).
 *
 * ============================================================
 * A ORDEM DOS GESTOS É A ORDEM DO BALCÃO (E5)
 * ============================================================
 *   1. a recepção contrata a opção aprovada (no painel do orçamento);
 *   2. emite o DOCUMENTO — HTML canônico com hash (D-V10);
 *   3. o profissional assina — ou a assinatura dele DERIVA da aprovação,
 *      quando o contrato é cópia fiel do orçamento que ele aprovou (D-F3);
 *   4. o paciente assina o papel, e a recepção registra digitando o CÓDIGO
 *      impresso nele. É esse código que liga o papel assinado ao documento:
 *      assinar é assinar um conteúdo, e o banco recusa código de outro;
 *   5. com as duas, o contrato é ASSINADO: soltam-se as faturas previstas e
 *      as sessões do pacote, e a execução fica liberada (D-V8).
 *
 * ============================================================
 * "ENCERRAR" MOSTRA POR QUE NÃO PODE, EM VEZ DE SUMIR
 * ============================================================
 * A trava dupla (pago tudo E executado tudo) é do banco. A tela mostra as
 * duas metades lado a lado — saldo e trabalho —, porque um contrato que "não
 * fecha" sem explicação é lido como defeito, e o motivo é justamente o que a
 * recepção precisa dizer ao paciente.
 */

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

const ROTULO_STATUS: Record<Contrato["status"], string> = {
  rascunho: "Rascunho",
  assinado: "Assinado",
  ativo: "Ativo (anterior à assinatura)",
  encerrado: "Encerrado",
  cancelado: "Cancelado",
};

const campo =
  "rounded-[5px] border border-input bg-background px-2 py-1 text-[11px] text-foreground disabled:opacity-45";

/** O código que vai impresso no papel: os 8 primeiros caracteres do hash. */
export const codigoDoDocumento = (hash: string) => hash.slice(0, 8).toUpperCase();

function Erro({ erro }: { erro: unknown }) {
  if (!erro) return null;
  return <span className="text-[10.5px] text-destructive">{(erro as Error).message}</span>;
}

function DocumentoDoContrato({ contrato, pacienteNome }: { contrato: Contrato; pacienteNome: string }) {
  const { data: doc } = useDocumentoDoContrato(contrato.documento_hash ? contrato.id : null);
  const [aberto, setAberto] = useState(false);
  if (!contrato.documento_hash || !doc?.html) return null;

  // O papel leva o documento GUARDADO — o texto que tem o hash —, mais o
  // código e as linhas de assinatura. O que se acrescenta é moldura, e fica
  // fora do conteúdo que o hash cobre.
  const paraImprimir = () =>
    imprimirHtml(
      `Contrato — ${pacienteNome}`,
      `${doc.html}
       <footer class="assinaturas">
         <p class="codigo">Código do documento: <strong>${codigoDoDocumento(doc.hash!)}</strong><br/><small>${doc.hash}</small></p>
         <div class="linhas"><div>Profissional responsável</div><div>Paciente</div></div>
       </footer>`,
    );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10.5px] text-muted-foreground">
          Documento emitido em {dataHora.format(new Date(contrato.documento_emitido_em!))} · código{" "}
          <strong className="font-mono text-foreground" data-codigo-documento>
            {codigoDoDocumento(contrato.documento_hash)}
          </strong>
        </span>
        <Button size="sm" variant="ghost" onClick={() => setAberto(!aberto)}>
          {aberto ? "Fechar documento" : "Ver documento"}
        </Button>
        <Button size="sm" variant="ghost" onClick={paraImprimir}>
          Imprimir para assinar
        </Button>
      </div>
      {aberto && (
        <iframe
          title="Documento do contrato"
          sandbox=""
          srcDoc={doc.html}
          className="h-[360px] w-full rounded-md border border-border bg-white"
          data-documento-contrato
        />
      )}
    </div>
  );
}

function CartaoContrato({ contrato, clienteId, pacienteNome }: { contrato: Contrato; clienteId: string; pacienteNome: string }) {
  const emitir = useEmitirDocumento(clienteId);
  const assinarProfissional = useAssinarComoProfissional(clienteId);
  const registrarPaciente = useRegistrarAssinaturaPaciente(clienteId);
  const encerrar = useEncerrarContrato(clienteId);
  const executarItem = useRegistrarExecucaoItem(clienteId);
  const [codigo, setCodigo] = useState("");
  const [codigoErrado, setCodigoErrado] = useState(false);

  const rascunho = contrato.status === "rascunho";
  const assinado = contrato.status === "assinado";
  const hash = contrato.documento_hash;
  const assProf = contrato.assinaturas.find((a) => a.parte === "profissional" && a.hash_assinado === hash);
  const s = contrato.situacao;

  return (
    <Card className="flex flex-col gap-3 p-3.5" data-contrato={contrato.id} data-status-contrato={contrato.status}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium text-foreground">
            Contrato {contrato.opcao_rotulo ? `da opção ${contrato.opcao_rotulo}` : "avulso"}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {ROTULO_STATUS[contrato.status]}
            {contrato.assinado_em ? ` em ${dataHora.format(new Date(contrato.assinado_em))}` : ""}
            {contrato.encerrado_em ? ` · encerrado em ${dataHora.format(new Date(contrato.encerrado_em))}` : ""}
            {contrato.profissional_nome ? ` · responsável: ${contrato.profissional_nome}` : ""}
          </span>
        </div>
        <span className="font-mono text-[16px] text-foreground">{moeda.format(Number(contrato.valor))}</span>
      </div>

      <div className="flex flex-col">
        {contrato.itens.map((i) => (
          <div
            key={i.id}
            className="flex items-baseline justify-between gap-2 border-b border-hairline py-1.5 text-[11px] text-secondary-foreground last:border-b-0"
            data-item-contrato={i.tipo}
          >
            <span>
              {i.nome}
              <span className="ml-1.5 rounded-[3px] bg-content px-1 text-[9.5px] text-muted-foreground">{i.tipo}</span>
              {i.quantidade > 1 && <span className="ml-1 text-muted-foreground">× {i.quantidade}</span>}
              {i.tipo === "procedimento" && assinado && (
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  executado {i.executadas ?? 0} de {i.quantidade}
                </span>
              )}
            </span>
            <span className="flex items-center gap-2">
              {i.tipo === "procedimento" && assinado && (i.executadas ?? 0) < i.quantidade && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={executarItem.isPending}
                  onClick={() => executarItem.mutate(i.id)}
                >
                  registrar execução
                </Button>
              )}
              <span className="font-mono">{moeda.format(Number(i.valor_total))}</span>
            </span>
          </div>
        ))}
      </div>
      <Erro erro={executarItem.error} />
      {Number(contrato.desconto_valor) > 0 && (
        <span className="text-[10.5px] text-muted-foreground">
          {moeda.format(Number(contrato.valor_bruto))} − {moeda.format(Number(contrato.desconto_valor))} de desconto
        </span>
      )}

      {/* ---------- documento e assinaturas ---------- */}
      {rascunho && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-content p-2.5">
          {!hash ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex-1 text-[11px] text-muted-foreground">
                Emita o documento para colher as assinaturas. Mudar uma linha depois disso descarta o documento e as
                assinaturas feitas sobre ele.
              </span>
              <Button size="sm" disabled={emitir.isPending} onClick={() => emitir.mutate(contrato.id)}>
                {emitir.isPending ? "Emitindo…" : "Emitir documento"}
              </Button>
            </div>
          ) : (
            <DocumentoDoContrato contrato={contrato} pacienteNome={pacienteNome} />
          )}
          <Erro erro={emitir.error} />

          {hash && (
            <div className="flex flex-col gap-1.5 text-[11px]">
              <span className={assProf ? "text-success" : "text-secondary-foreground"} data-assinatura="profissional">
                {assProf
                  ? `✓ Profissional: ${assProf.via === "aprovacao_orcamento" ? "assinatura derivada da aprovação do orçamento" : "assinou em pessoa"} (${dataHora.format(new Date(assProf.assinada_em))})`
                  : "○ Profissional ainda não assinou este documento."}
              </span>
              {!assProf && contrato.sou_o_profissional && (
                <Button
                  size="sm"
                  className="self-start"
                  disabled={assinarProfissional.isPending}
                  onClick={() => assinarProfissional.mutate({ contratoId: contrato.id, hash })}
                >
                  Assinar como profissional responsável
                </Button>
              )}
              {!assProf && !contrato.sou_o_profissional && (
                <span className="text-[10.5px] text-muted-foreground">
                  Quem assina pela parte profissional é {contrato.profissional_nome ?? "o profissional responsável"} — e
                  assina antes do paciente.
                </span>
              )}
              <Erro erro={assinarProfissional.error} />

              <span className="text-secondary-foreground" data-assinatura="paciente">
                ○ Paciente: assina o papel impresso; a recepção registra digitando o código dele.
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                  placeholder="Código impresso"
                  aria-label="Código do documento assinado pelo paciente"
                  maxLength={8}
                  className={`${campo} w-[110px] font-mono`}
                />
                <Button
                  size="sm"
                  disabled={!assProf || codigo.length !== 8 || registrarPaciente.isPending}
                  onClick={() => {
                    // O código confere o PAPEL com o documento; o banco recebe o
                    // hash inteiro e recusa se não for o atual.
                    if (codigo !== codigoDoDocumento(hash)) {
                      registrarPaciente.reset();
                      setCodigoErrado(true);
                      return;
                    }
                    setCodigoErrado(false);
                    registrarPaciente.mutate({ contratoId: contrato.id, hash });
                  }}
                >
                  {registrarPaciente.isPending ? "Registrando…" : "Registrar assinatura do paciente"}
                </Button>
              </div>
              {codigoErrado && (
                <span className="text-[10.5px] text-destructive" role="alert">
                  O código digitado não é o deste documento. Confira o papel que o paciente assinou.
                </span>
              )}
              <Erro erro={registrarPaciente.error} />
            </div>
          )}
        </div>
      )}

      {!rascunho && hash && (
        <div className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">
          <DocumentoDoContrato contrato={contrato} pacienteNome={pacienteNome} />
          {contrato.assinaturas.map((a) => (
            <span key={a.parte}>
              ✓ {a.parte === "profissional" ? "Profissional" : "Paciente"} —{" "}
              {a.via === "aprovacao_orcamento" ? "derivada da aprovação" : "presencial"},{" "}
              {dataHora.format(new Date(a.assinada_em))}
              {a.registrada_por_nome ? `, registrada por ${a.registrada_por_nome}` : ""}
            </span>
          ))}
        </div>
      )}

      {/* ---------- a trava dupla ---------- */}
      {(assinado || contrato.status === "encerrado") && s && (
        <div className="grid grid-cols-2 gap-2" data-trava-dupla>
          <div className={`rounded-md border px-2.5 py-2 ${s.falta_pagamento ? "border-warning bg-warning-tint" : "border-success bg-success-tint"}`}>
            <span className="block text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Dinheiro</span>
            <span className="text-[11.5px] text-foreground" data-metade="pagamento">
              {s.falta_pagamento
                ? `Falta receber ${moeda.format(Number(s.saldo_devedor))}`
                : `Pago: ${moeda.format(Number(s.valor_pago))}`}
            </span>
          </div>
          <div className={`rounded-md border px-2.5 py-2 ${s.falta_execucao ? "border-warning bg-warning-tint" : "border-success bg-success-tint"}`}>
            <span className="block text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Trabalho</span>
            <span className="text-[11.5px] text-foreground" data-metade="execucao">
              {s.unidades_executadas} de {s.unidades_previstas} executados
            </span>
          </div>
        </div>
      )}
      {assinado && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-1 text-[10.5px] text-muted-foreground">
            {s?.pode_encerrar
              ? "Tudo pago e tudo executado: o contrato pode ser encerrado."
              : "O contrato só se encerra quando não faltar dinheiro nem trabalho — as duas coisas ao mesmo tempo."}
          </span>
          <Button size="sm" variant="secondary" disabled={encerrar.isPending} onClick={() => encerrar.mutate(contrato.id)}>
            Encerrar contrato
          </Button>
        </div>
      )}
      <Erro erro={encerrar.error} />
    </Card>
  );
}

export function ContratosDoPaciente({ clienteId, pacienteNome }: { clienteId: string; pacienteNome: string }) {
  const { data: contratos = [], isPending, error } = useContratosDoCliente(clienteId);

  return (
    <div className="flex flex-col gap-2" data-bloco="contratos">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium text-foreground">Contratos</span>
        <span className="text-[11px] text-muted-foreground">
          Nenhum serviço se executa sem contrato assinado pelas duas partes. A cobrança nasce da assinatura.
        </span>
      </div>
      {isPending && <span className="text-[11px] text-muted-foreground">Carregando os contratos…</span>}
      {error && <Erro erro={error} />}
      {!isPending && !error && contratos.length === 0 && (
        <span className="text-[11px] text-muted-foreground">
          Este paciente ainda não tem contrato. A recepção contrata a opção aprovada no painel do orçamento.
        </span>
      )}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {contratos.map((c) => (
          <CartaoContrato key={c.id} contrato={c} clienteId={clienteId} pacienteNome={pacienteNome} />
        ))}
      </div>
    </div>
  );
}
