import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AvisoTratamentoDeDados, VERSAO_TERMO_IA } from "./AvisoTratamentoDeDados";
import { useAceiteTermoIA, useRegistrarAceite } from "./api";

const formatoDataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Portão de aceite do termo de tratamento de dados.
 *
 * O QUE ELE FAZ, E POR QUE ASSIM
 *
 * Enquanto não houver aceite registrado **da versão vigente do termo**,
 * o conteúdo protegido (`children` — o formulário de credenciais) **não
 * é renderizado**. Não é campo desabilitado nem aviso ao lado: a tela de
 * credenciais só existe depois do aceite. Um disclaimer que se pode
 * ignorar rolando a página não prova ciência de nada.
 *
 * O aceite é gravado em `aba_ai.aceites_termo_ia` com quem aceitou,
 * quando e **qual versão** — a tabela não tem UPDATE nem DELETE para
 * ninguém, e a policy exige `usuario_id = auth.uid()`, de modo que
 * ninguém aceita em nome de outro.
 *
 * O botão só habilita depois de a caixa ser marcada. É uma fricção
 * deliberada: o gesto de marcar é o que distingue "li" de "cliquei no
 * botão azul para seguir".
 *
 * Depois de aceito, o termo continua visível na tela — o dado sai a cada
 * resposta do agente, não só no momento de configurar.
 */
export function PortaoAceite({ children }: { children: ReactNode }) {
  const { data: aceite, isLoading } = useAceiteTermoIA(VERSAO_TERMO_IA);
  const registrar = useRegistrarAceite();
  const [marcado, setMarcado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoAceitar() {
    setErro(null);
    try {
      await registrar.mutateAsync(VERSAO_TERMO_IA);
    } catch (e) {
      setErro(
        e instanceof Error
          ? `${e.message} — registrar o aceite exige papel de administrador da conta.`
          : "Não foi possível registrar o aceite.",
      );
    }
  }

  if (isLoading) return <span className="text-[11px] text-muted-foreground">Carregando…</span>;

  if (aceite) {
    return (
      <>
        <AvisoTratamentoDeDados />
        <span className="px-0.5 font-mono text-[9.5px] text-muted-foreground">
          termo {VERSAO_TERMO_IA} aceito em {formatoDataHora.format(new Date(aceite.aceitoEm))}
        </span>
        {children}
      </>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-3.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[12.5px] font-medium text-foreground">
          Antes de conectar uma IA, leia como os dados serão tratados
        </span>
        <span className="text-[10.5px] text-muted-foreground">
          O formulário de credenciais aparece depois do aceite. Registramos quem aceitou, quando e qual versão deste
          texto.
        </span>
      </div>

      <AvisoTratamentoDeDados />

      <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5">
        <input
          type="checkbox"
          checked={marcado}
          onChange={(e) => setMarcado(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-[10.5px] leading-relaxed text-secondary-foreground">
          Li e entendi que os dados enviados ao agente saem deste CRM para um provedor externo, que quem fornece este
          CRM não controla nem garante o tratamento feito por esse provedor, e que a escolha do provedor e a
          responsabilidade por ela são minhas.
        </span>
      </label>

      {erro && <span className="text-[10.5px] text-destructive">{erro}</span>}

      <Button
        size="sm"
        disabled={!marcado || registrar.isPending}
        onClick={() => void aoAceitar()}
        className="self-start"
      >
        {registrar.isPending ? "Registrando…" : "Aceitar e continuar"}
      </Button>

      <span className="font-mono text-[9px] text-muted-foreground">versão do termo: {VERSAO_TERMO_IA}</span>
    </Card>
  );
}
