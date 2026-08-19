import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AnexoRecusado,
  ehImagem,
  consentimentoVigente,
  useAtualizarEvolucao,
  useConsentimentos,
  useEnviarAnexo,
  useUrlAssinadaAnexo,
  type AnexoEvolucao,
  type Evolucao,
} from "./api";

const formatoData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Uma imagem clínica. A URL é assinada na hora, com TTL de 60s, e só sai
 * se a política do bucket privado autorizar naquele instante — o que
 * inclui cobrar consentimento de uso de imagem vigente.
 *
 * Quando `imagemLiberada` é falso, a tela nem pede a assinatura: pedir
 * produziria o mesmo `null`, mas gastaria uma ida ao servidor para
 * descobrir o que o consentimento já disse. A explicação vem da tela; a
 * TRAVA continua sendo do banco — desligar esta condição não libera foto
 * nenhuma, só troca a explicação por um quadrado quebrado.
 */
function PreviaAnexo({ anexo, imagemLiberada }: { anexo: AnexoEvolucao; imagemLiberada: boolean }) {
  const imagem = ehImagem(anexo.caminho);
  const { data: url, isLoading } = useUrlAssinadaAnexo(anexo.caminho, !imagem || imagemLiberada);

  if (imagem && !imagemLiberada) {
    return (
      <div className="flex h-[120px] flex-col items-center justify-center gap-1.5 rounded-md border border-dashed bg-content px-3 text-center">
        <span className="text-[10.5px] font-medium text-secondary-foreground">Exibição bloqueada</span>
        <span className="text-[10px] leading-relaxed text-muted-foreground">
          Sem consentimento de uso de imagem vigente. A foto está guardada e íntegra — o bloqueio vale para todos,
          inclusive para quem a enviou.
        </span>
      </div>
    );
  }

  if (isLoading) {
    return <div className="h-[120px] rounded-md border bg-content" />;
  }

  if (!url) {
    return (
      <div className="flex h-[120px] items-center justify-center rounded-md border border-dashed bg-content px-3 text-center text-[10px] text-muted-foreground">
        O servidor recusou assinar o acesso a este arquivo.
      </div>
    );
  }

  if (imagem) {
    return <img src={url} alt={anexo.nome} className="h-[120px] w-full rounded-md border object-cover" />;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex h-[120px] items-center justify-center rounded-md border bg-content text-[11px] text-primary underline-offset-2 hover:underline"
    >
      Abrir documento
    </a>
  );
}

/**
 * Aba Anexos da tela `1h`.
 *
 * O anexo pertence a uma EVOLUÇÃO (`aba_health.evolucoes.anexos` guarda o
 * caminho, nunca a URL — URL assinada guardada é link morto). Por isso o
 * envio exige uma sessão aberta: anexo sem sessão não tem onde ser
 * registrado, e criar uma evolução escondida só para pendurar o arquivo
 * seria inventar um registro clínico que ninguém pediu.
 */
export function AnexosTab({
  clienteId,
  evolucoes,
  podeEscrever,
}: {
  clienteId: string;
  evolucoes: Evolucao[];
  podeEscrever: boolean;
}) {
  const { data: consentimentos = [] } = useConsentimentos(clienteId);
  const enviar = useEnviarAnexo(clienteId);
  const atualizar = useAtualizarEvolucao(clienteId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);

  const imagemLiberada = consentimentoVigente(consentimentos, "uso_imagem");
  const sessaoAberta = evolucoes.find((e) => !e.travada) ?? null;

  const todos = evolucoes.flatMap((e) => e.anexos.map((a) => ({ anexo: a, evolucao: e })));

  async function aoEscolherArquivo(arquivo: File) {
    setErro(null);
    if (!sessaoAberta) {
      setErro("Abra uma sessão no painel do mapa antes de anexar — o anexo é registrado dentro da evolução.");
      return;
    }
    try {
      const anexo = await enviar.mutateAsync(arquivo);
      await atualizar.mutateAsync({ id: sessaoAberta.id, anexos: [...sessaoAberta.anexos, anexo] });
    } catch (e) {
      if (e instanceof AnexoRecusado) setErro(e.message);
      else setErro(e instanceof Error ? e.message : "Não foi possível enviar o anexo.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
          Bucket privado · URL assinada de 60s
        </span>
        <Badge tone={imagemLiberada ? "success" : "warning"}>
          {imagemLiberada ? "imagem liberada" : "imagem bloqueada"}
        </Badge>
      </div>

      {podeEscrever && (
        <div className="flex flex-col gap-1.5">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) void aoEscolherArquivo(arquivo);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={enviar.isPending || atualizar.isPending}
          >
            {enviar.isPending ? "Enviando…" : "Anexar arquivo"}
          </Button>
          <span className="text-[10px] text-muted-foreground">
            PNG, JPEG, WebP ou PDF · até 10 MB. O envio nunca é bloqueado por falta de consentimento — só a exibição.
          </span>
          {erro && <span className="text-[10.5px] text-destructive">{erro}</span>}
        </div>
      )}

      {todos.length === 0 && <span className="text-[11px] text-muted-foreground">Nenhum anexo neste prontuário.</span>}

      <div className="grid grid-cols-2 gap-2.5">
        {todos.map(({ anexo, evolucao }) => (
          <div key={anexo.caminho} className="flex flex-col gap-1.5">
            <PreviaAnexo anexo={anexo} imagemLiberada={imagemLiberada} />
            <div className="flex flex-col">
              <span className="truncate text-[10.5px] text-foreground">{anexo.nome}</span>
              <span className="font-mono text-[9px] text-muted-foreground">
                {formatoData.format(new Date(evolucao.registradoEm))} · {tamanhoLegivel(anexo.tamanho)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
