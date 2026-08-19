import { Link } from "react-router-dom";
import { useAlcanceClinico } from "@/features/dashboard/api";
import { useFormulariosClinicos } from "../api";
import { CardSecao, Nota, Pill, TituloSecao, Vazio } from "./ui";

/**
 * Seção "Formulários clínicos" da tela `1m`.
 *
 * `aba_health.formularios_anamnese` guarda o MODELO (perguntas), não
 * resposta de paciente — por isso ele é legível por quem lê o módulo, sem
 * passar pelo regime nominal de `pode_acessar()`. Ainda assim a seção
 * declara o alcance clínico de quem está olhando, porque quem não tem
 * alcance vê o formulário e **não** verá nenhuma resposta: sem esse aviso,
 * a tela sugeriria um acesso que não existe.
 */
export function FormulariosClinicos() {
  const { data: formularios, isPending, error } = useFormulariosClinicos();
  const { data: temAlcance } = useAlcanceClinico();

  if (isPending) return <Vazio>Carregando formulários…</Vazio>;
  if (error) return <Vazio>Não foi possível ler os formulários: {(error as Error).message}</Vazio>;

  return (
    <div className="flex flex-col gap-3">
      <CardSecao>
        <TituloSecao
          titulo="Modelos de anamnese"
          descricao="As perguntas que a equipe aplica antes do primeiro atendimento."
          acessorio={
            <Link to="/prontuario" className="shrink-0 text-[10.5px] text-primary underline-offset-2 hover:underline">
              abrir Prontuário →
            </Link>
          }
        />
        {(formularios ?? []).length === 0 ? (
          <Vazio>Nenhum modelo de anamnese cadastrado nesta conta.</Vazio>
        ) : (
          <div className="flex flex-col">
            <div className="grid grid-cols-[1fr_70px_90px_70px] gap-2 border-b border-border pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
              <span>Formulário</span>
              <span>Versão</span>
              <span>Perguntas</span>
              <span>Estado</span>
            </div>
            {(formularios ?? []).map((f) => (
              <div
                key={f.id}
                className="grid grid-cols-[1fr_70px_90px_70px] items-center gap-2 border-b border-hairline py-2 text-[11px] text-secondary-foreground last:border-b-0"
              >
                <span className="truncate">{f.nome}</span>
                <span className="font-mono">v{f.versao}</span>
                <span className="font-mono">{f.perguntas}</span>
                <span>
                  <Pill tom={f.ativo ? "success" : "muted"}>{f.ativo ? "ativo" : "inativo"}</Pill>
                </span>
              </div>
            ))}
          </div>
        )}
      </CardSecao>

      <CardSecao>
        <TituloSecao titulo="Seu alcance clínico" />
        <Nota tom={temAlcance ? "muted" : "atencao"}>
          {temAlcance ? (
            <>
              Você tem alcance clínico <strong>amplo</strong> — enxerga prontuário e respostas de anamnese desta conta.
              Cada leitura fica registrada em <code>aba_health.log_acesso</code>, com seu identificador. Isso não é
              vigilância: é o que torna o registro clínico auditável.
            </>
          ) : (
            <>
              Você <strong>não</strong> tem alcance clínico amplo. Vê os modelos de formulário acima porque eles são
              estrutura, não dado de paciente — mas nenhuma resposta preenchida aparecerá para você em lugar nenhum do
              sistema, e o dashboard mostra "sem alcance clínico" no lugar do contador de anamneses em vez de um
              número que seria falso.
            </>
          )}
        </Nota>
        <Nota>
          O vocabulário dos mapas clínicos (regiões, estados, pontos e meridianos) ainda vive em código, não em tabela
          desta conta — pendência registrada em <code>docs/00</code>, a reabrir junto com a arte de produção dos mapas.
        </Nota>
      </CardSecao>
    </div>
  );
}
