import { ROTULO_PROVEDOR, type Provedor } from "./api";

/**
 * Versão do termo. **Mudou o texto abaixo? Mude esta constante.**
 *
 * `aba_ai.aceites_termo_ia` guarda qual versão cada pessoa aceitou, e o
 * portão compara com esta. Sem isso, alterar o texto deixaria aceites
 * antigos valendo para um termo que ninguém leu — que é exatamente o
 * vício que um registro de aceite existe para não ter.
 */
export const VERSAO_TERMO_IA = "2026-08-19.1";

/**
 * Aviso de tratamento de dados por provedor externo de IA.
 *
 * POR QUE ELE EXISTE, E POR QUE ESTÁ ESCRITO ASSIM
 *
 * `docs/05_COMPLIANCE_E_ETICA.md` já exigia que o modelo
 * bring-your-own-key fosse "explícito na tela de configuração, não
 * escondido em letra miúda". Este componente é o cumprimento disso.
 *
 * O texto foi escrito como **transparência informada**, e não como
 * cláusula de isenção, por uma razão prática: perante a LGPD, quem
 * contrata o CRM é o **controlador** dos dados dos próprios clientes, o
 * fornecedor do CRM é **operador**, e o provedor de IA passa a ser
 * **suboperador**. Uma frase de "não me responsabilizo" não desfaz essa
 * cadeia sozinha — o que tem efeito real é o controlador saber, antes de
 * conectar a chave, que o dado sai do produto e para onde vai, e poder
 * decidir com consciência. Por isso o aviso descreve o fluxo e a
 * limitação de garantia em vez de tentar transferir culpa.
 *
 * A frase sobre a base de conhecimento não é enfeite: a base é texto
 * livre, escrito por gente, e vai **inteira** para o provedor a cada
 * resposta. O prontuário está bloqueado no banco para o agente — a base
 * de conhecimento não está, e é por ela que dado sensível vazaria para
 * fora do produto sem nenhuma trava técnica no caminho. Avisar no ponto
 * onde a pessoa digita é a única defesa que existe aí hoje.
 *
 * Este texto não substitui revisão jurídica antes do lançamento.
 */
export function AvisoTratamentoDeDados({ provedor }: { provedor?: Provedor }) {
  const nome = provedor ? ROTULO_PROVEDOR[provedor] : "o provedor escolhido";

  return (
    <div className="flex flex-col gap-2 rounded-md border border-warning-tint bg-warning-tint px-3.5 py-3">
      <span className="text-[11.5px] font-semibold text-warning-tint-foreground">
        Dados enviados a um serviço de IA de terceiro
      </span>

      <p className="text-[10.5px] leading-relaxed text-warning-tint-foreground">
        Ao usar o agente, o conteúdo das perguntas e os trechos da base de conhecimento <strong>saem deste CRM</strong>{" "}
        e são enviados a {nome}. A partir daí, o que acontece com esses dados é regido pelos termos e pela política de
        privacidade desse provedor — que ele pode alterar quando quiser.
      </p>

      <p className="text-[10.5px] leading-relaxed text-warning-tint-foreground">
        Quem fornece este CRM não opera esses serviços, não tem acesso a eles e{" "}
        <strong>não pode garantir</strong> como os dados são guardados, por quanto tempo, quem os acessa, nem se são
        usados para treinar modelos. Essa garantia só existiria com um modelo rodando em infraestrutura própria e
        isolada — o que este produto não oferece hoje.
      </p>

      <p className="text-[10.5px] leading-relaxed text-warning-tint-foreground">
        Antes de conectar uma chave, leia a política do provedor e confirme que ela atende às suas obrigações sobre os
        dados dos seus clientes. A escolha do provedor, e a responsabilidade por ela, é de quem conecta a chave.
      </p>

      <p className="text-[10.5px] leading-relaxed text-warning-tint-foreground">
        <strong>Não escreva dado de saúde, documento, endereço ou informação sigilosa na base de conhecimento.</strong>{" "}
        O prontuário está bloqueado para o agente por desenho, mas a base de conhecimento é texto livre e vai inteira
        para o provedor a cada resposta — é por ela que um dado sensível sairia do produto sem nenhuma trava no caminho.
      </p>
    </div>
  );
}
