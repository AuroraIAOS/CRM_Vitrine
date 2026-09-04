
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { EquipePage } from "./EquipePage";
import { Aparencia } from "./secoes/Aparencia";
import { Auditoria } from "./secoes/Auditoria";
import { ChavesDeIA } from "./secoes/ChavesDeIA";
import { DadosDaConta } from "./secoes/DadosDaConta";
import { FormulariosClinicos } from "./secoes/FormulariosClinicos";
import { Integracoes } from "./secoes/Integracoes";
import { ModulosELicenca } from "./secoes/ModulosELicenca";
import { PerfisEPermissoes } from "./secoes/PerfisEPermissoes";
import { ServicosEAgenda } from "./secoes/ServicosEAgenda";

/**
 * Tela `1m` do pacote ratificado — Configurações da conta (Subetapa 02.12).
 *
 * A nav da esquerda tem as 10 seções desenhadas no wireframe. **Equipe** já
 * existia desde a Subetapa 02.2 e entra aqui sem alteração — as outras nove
 * são desta subetapa.
 *
 * A seção ativa vive na query string (`?secao=`) e não em estado local: um
 * link para "Configurações → Equipe" precisa abrir na Equipe, e o botão
 * "voltar" do navegador precisa desfazer a troca de seção. Estado local
 * daria a impressão de navegação sem ser navegação.
 */

const SECOES = [
  { chave: "aparencia", rotulo: "Aparência e layout", componente: Aparencia },
  { chave: "conta", rotulo: "Dados da conta", componente: DadosDaConta },
  { chave: "modulos", rotulo: "Módulos e licença", componente: ModulosELicenca },
  { chave: "permissoes", rotulo: "Perfis e permissões", componente: PerfisEPermissoes },
  { chave: "equipe", rotulo: "Equipe", componente: EquipePage },
  { chave: "procedimentos", rotulo: "Serviços e agenda", componente: ServicosEAgenda },
  { chave: "formularios", rotulo: "Formulários clínicos", componente: FormulariosClinicos },
  { chave: "integracoes", rotulo: "Integrações", componente: Integracoes },
  { chave: "ia", rotulo: "Chaves de IA", componente: ChavesDeIA },
  { chave: "auditoria", rotulo: "Auditoria", componente: Auditoria },
] as const;

type ChaveSecao = (typeof SECOES)[number]["chave"];

const PADRAO: ChaveSecao = "aparencia";

export function ConfiguracoesPage() {
  const [params, setParams] = useSearchParams();
  const pedida = params.get("secao");
  const ativa: ChaveSecao = SECOES.some((s) => s.chave === pedida) ? (pedida as ChaveSecao) : PADRAO;
  const Secao = SECOES.find((s) => s.chave === ativa)!.componente;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[210px_1fr]">
      <nav className="flex h-max flex-col gap-0.5 rounded-lg border border-border bg-background p-2.5">
        {SECOES.map((s) => (
          <button
            key={s.chave}
            type="button"
            onClick={() => setParams({ secao: s.chave })}
            className={cn(
              "rounded-[5px] px-2.5 py-[7px] text-left text-[11.5px] transition-colors",
              s.chave === ativa
                ? "bg-accent font-semibold text-accent-foreground"
                : "text-muted-foreground hover:bg-content hover:text-foreground",
            )}
          >
            {s.rotulo}
          </button>
        ))}
      </nav>

      <div className="min-w-0">
        <Secao />
      </div>
    </div>
  );
}
