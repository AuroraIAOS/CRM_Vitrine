import { Link } from "react-router-dom";
import { useResumoServicosAgenda } from "../api";
import { CardSecao, LinhaDado, Nota, TituloSecao, Vazio } from "./ui";

/**
 * Seção "Serviços e agenda" da tela `1m`.
 *
 * Resumo do que está configurado, com atalho para o módulo que edita.
 * Duplicar aqui os formulários de catálogo e de agenda criaria dois donos
 * para a mesma regra — e é o tipo de duplicação que envelhece mal: uma das
 * duas telas deixa de acompanhar a validação da outra e ninguém percebe.
 */
export function ServicosEAgenda() {
  const { data, isPending, error } = useResumoServicosAgenda();

  if (isPending) return <Vazio>Carregando resumo…</Vazio>;
  if (error) return <Vazio>Não foi possível ler o resumo: {(error as Error).message}</Vazio>;
  if (!data) return <Vazio>Sem dados.</Vazio>;

  const semGrade = data.profissionaisAtivos - data.profissionaisComGrade;

  return (
    <div className="flex flex-col gap-3">
      <CardSecao>
        <TituloSecao
          titulo="Catálogo"
          descricao="O que a clínica vende."
          acessorio={
            <Link to="/catalogo" className="shrink-0 text-[10.5px] text-primary underline-offset-2 hover:underline">
              abrir Catálogo →
            </Link>
          }
        />
        <div className="flex flex-col">
          <LinhaDado rotulo="Serviços ativos">{data.servicosAtivos}</LinhaDado>
          <LinhaDado rotulo="Categorias">{data.categorias}</LinhaDado>
          <LinhaDado rotulo="Planos ativos">{data.planosAtivos}</LinhaDado>
        </div>
      </CardSecao>

      <CardSecao>
        <TituloSecao
          titulo="Agenda"
          descricao="Quem atende, onde e em que horário."
          acessorio={
            <Link to="/agenda" className="shrink-0 text-[10.5px] text-primary underline-offset-2 hover:underline">
              abrir Agenda →
            </Link>
          }
        />
        <div className="flex flex-col">
          <LinhaDado rotulo="Profissionais ativos">{data.profissionaisAtivos}</LinhaDado>
          <LinhaDado rotulo="Com grade de horário">
            {data.profissionaisComGrade} de {data.profissionaisAtivos}
          </LinhaDado>
          <LinhaDado rotulo="Salas e recursos ativos">{data.recursosAtivos}</LinhaDado>
        </div>
        {semGrade > 0 && (
          <Nota tom="atencao">
            {semGrade} profissional{semGrade > 1 ? "is" : ""} ativo{semGrade > 1 ? "s" : ""} sem grade de horário. Sem
            grade não há denominador: esse profissional some do cálculo de <strong>taxa de ocupação</strong> do
            dashboard, e a taxa da clínica sai mais alta do que é.
          </Nota>
        )}
      </CardSecao>
    </div>
  );
}
