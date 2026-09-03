/**
 * Fallback do `<Suspense>` que a divisão por rota da Subetapa 03.3 exige.
 *
 * Deliberadamente discreto, e o motivo é medido: o `<Suspense>` vive dentro
 * do `AppShell`, então sidebar e header continuam pintados durante a troca
 * de rota — o que fica em branco é só a área de conteúdo. Um spinner
 * centralizado piscaria em toda navegação de chunk já em cache (a segunda
 * visita à mesma tela resolve em ~0 ms) e leria como lentidão que não
 * existe. Barra de progresso no topo da área comunica "está vindo" sem
 * fingir demora.
 *
 * `role="status"` + `aria-live="polite"` porque leitor de tela não vê o
 * conteúdo trocar: sem isto, a navegação é silenciosa para quem depende
 * dele. `sr-only` carrega o texto; a barra é puramente visual.
 */
export function CarregandoRota() {
  return (
    <div role="status" aria-live="polite" className="w-full">
      <div className="h-0.5 w-full overflow-hidden rounded-full bg-hairline">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
      </div>
      <span className="sr-only">Carregando a tela…</span>
    </div>
  );
}
