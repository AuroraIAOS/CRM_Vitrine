/**
 * Vista de impressão + `window.print()` — o motor já decidido (D-V10).
 *
 * Nenhuma dependência de PDF: o navegador imprime (ou salva em PDF, pelo
 * próprio diálogo dele) um documento montado aqui. O documento vai num
 * `iframe` escondido, e não numa janela nova, porque janela aberta por
 * script é bloqueada pelo navegador com frequência — e um "imprimir" que às
 * vezes não abre nada é pior que nenhum.
 *
 * TODO TEXTO VINDO DO BANCO É ESCAPADO antes de entrar no HTML. O
 * documento canônico do contrato é a exceção, e por um motivo: ele já sai
 * escapado do banco (`aba_finance.escapar_html`), e escapá-lo de novo
 * mudaria o texto que tem o hash.
 */
import type { Orcamento } from "./api";

export function escaparHtml(texto: string | null | undefined): string {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ESTILO = `
  body { font-family: "IBM Plex Sans", Arial, sans-serif; color: #111; margin: 32px; font-size: 12px; line-height: 1.5; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #555; }
  td.valor, th.valor { text-align: right; white-space: nowrap; }
  ul { margin: 4px 0 0 16px; padding: 0; }
  .total { font-size: 16px; text-align: right; margin-top: 8px; }
  .nota { color: #555; font-size: 11px; }
  .assinaturas { margin-top: 48px; }
  .assinaturas .codigo { font-size: 11px; }
  .assinaturas .linhas { display: flex; gap: 48px; margin-top: 56px; }
  .assinaturas .linhas div { flex: 1; border-top: 1px solid #111; padding-top: 4px; text-align: center; }
  @media print { body { margin: 16mm; } }
`;

export function imprimirHtml(titulo: string, corpo: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const doc = frame.contentDocument!;
  doc.open();
  doc.write(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escaparHtml(titulo)}</title><style>${ESTILO}</style></head><body>${corpo}</body></html>`,
  );
  doc.close();

  const janela = frame.contentWindow!;
  janela.focus();
  janela.print();
  // O diálogo de impressão bloqueia até fechar; depois disso o iframe sai.
  setTimeout(() => frame.remove(), 1000);
}

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const data = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * O ORÇAMENTO APROVADO IMPRESSO (caminho feliz E4): o que a recepção leva ao
 * balcão para o paciente levar para casa e decidir.
 *
 * Dente e face só entram quando QUEM IMPRIME tem alcance clínico — a mesma
 * resposta que `ler_orcamentos` já deu (`com_detalhe_clinico`). A recepção
 * imprime o mesmo orçamento, com os mesmos valores, sem eles.
 */
export function htmlDoOrcamento(orcamento: Orcamento, paciente: string): string {
  const linhas = orcamento.itens
    .map((i) => {
      const onde =
        orcamento.com_detalhe_clinico && i.dente
          ? ` <span class="nota">(dente ${escaparHtml(i.dente)}${i.faces?.length ? ` · ${escaparHtml(i.faces.join(", "))}` : ""})</span>`
          : "";
      return `<tr><td>${escaparHtml(i.procedimento)}${i.tipo === "pacote" ? " <span class=\"nota\">(pacote)</span>" : ""}${onde}</td><td class="valor">${moeda.format(Number(i.valor_resolvido))}</td></tr>`;
    })
    .join("");

  const parcelas =
    orcamento.parcelas > 1
      ? `<p>Em ${orcamento.parcelas} parcelas de ${moeda.format(Number(orcamento.valor_liquido) / orcamento.parcelas)}.</p>`
      : "";

  return `
    <h1>Orçamento — opção ${escaparHtml(orcamento.opcao_rotulo)}</h1>
    <p>Paciente: ${escaparHtml(paciente)}<br/>
       Aprovado pelo profissional responsável em ${orcamento.aprovado_em ? data.format(new Date(orcamento.aprovado_em)) : "—"}.</p>
    <table><thead><tr><th>Serviço</th><th class="valor">Valor</th></tr></thead><tbody>${linhas}</tbody></table>
    <p>Valor dos serviços: ${moeda.format(Number(orcamento.valor_bruto))}${
      Number(orcamento.desconto_valor) > 0 ? ` · desconto: ${moeda.format(Number(orcamento.desconto_valor))}` : ""
    }</p>
    <p class="total"><strong>Total: ${moeda.format(Number(orcamento.valor_liquido))}</strong></p>
    ${parcelas}
    <p class="nota">Este orçamento não é contrato. Nenhum serviço é executado antes da assinatura do contrato pelas duas partes.
       Alterações de desconto, parcela ou juros exigem nova aprovação do profissional.</p>
  `;
}
