import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { LegendaMapa, MapaClinico } from "./MapaClinico";
import { LISTA_MAPAS, type Marcacao, type TipoMapa } from "./mapas";

/**
 * Tela `1p` — biblioteca de mapas clínicos.
 *
 * O wireframe é explícito sobre o que esta tela existe para mostrar: "um
 * componente, quatro mapas — escolhido pelo serviço. Mesma mecânica em
 * todos: mapa clicável à esquerda, marcações da sessão à direita,
 * legenda por estado". É especificação de componente, não tela de dado —
 * NENHUM prontuário é lido aqui, e por isso nenhuma linha de
 * `aba_health.log_acesso` é gerada: não há leitura clínica a registrar.
 *
 * As marcações abaixo são de demonstração, vivem só no estado local e
 * nunca tocam o banco. É a diferença entre demonstrar a mecânica e expor
 * dado de paciente para ilustrar um catálogo.
 */
export function MapasClinicosPage() {
  const [demonstracao, setDemonstracao] = useState<Record<string, Marcacao[]>>({});

  function alternarRegiao(tipo: TipoMapa, regiaoChave: string, rotulo: string, estadoChave: string) {
    setDemonstracao((atual) => {
      const doMapa = atual[tipo] ?? [];
      const jaMarcada = doMapa.find((m) => m.regiao === regiaoChave);
      const semEla = doMapa.filter((m) => m.regiao !== regiaoChave);
      // Um clique percorre os estados do mapa e volta a "sem marcação" —
      // a mesma ideia da tela `1h`, condensada num clique só porque aqui
      // não existe painel de sessão para escolher o estado.
      if (!jaMarcada) return { ...atual, [tipo]: [...semEla, { regiao: regiaoChave, rotulo, estado: estadoChave, nota: "" }] };
      return { ...atual, [tipo]: semEla };
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[15px] font-medium text-foreground">Um componente, quatro mapas</h1>
          <p className="max-w-[86ch] text-[11.5px] leading-relaxed text-muted-foreground">
            Mesma mecânica em todos: mapa clicável, marcações da sessão, legenda por estado, histórico comparável entre
            sessões. Só a arte e o vocabulário das regiões mudam. As formas abaixo são esquemas de wireframe — a arte
            definitiva de cada mapa entra como SVG de biblioteca própria, asset ainda não existente no repositório
            (docs/04 §5.5). Clique para ver a mecânica; nada aqui é gravado.
          </p>
        </div>
        <Link to="/prontuario" className="shrink-0 text-[11px] text-primary underline-offset-2 hover:underline">
          ← Prontuário
        </Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {LISTA_MAPAS.map((mapa) => (
          <Card key={mapa.chave} className="flex flex-col gap-2.5 p-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[12.5px] font-medium text-foreground">{mapa.rotulo}</span>
              <span className="font-mono text-[9.5px] text-muted-foreground">{mapa.subtitulo}</span>
            </div>
            <div className="flex justify-center rounded-md border bg-content p-3.5">
              <MapaClinico
                tipo={mapa.chave}
                compacto
                marcacoes={demonstracao[mapa.chave] ?? []}
                onSelecionarRegiao={(chave) => {
                  const regiao = mapa.regioes.find((r) => r.chave === chave);
                  if (regiao) alternarRegiao(mapa.chave, chave, regiao.rotulo, mapa.estados[0].chave);
                }}
              />
            </div>
            <LegendaMapa tipo={mapa.chave} />
            <span className="text-[10px] leading-relaxed text-muted-foreground">
              {mapa.regioes.length} região(ões) no catálogo fechado — nomenclatura vem do módulo, nunca digitada livre.
            </span>
          </Card>
        ))}
      </div>
    </div>
  );
}
