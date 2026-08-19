import { useAuth } from "@/lib/auth";
import {
  ACCENTS,
  TEMPLATES_LAYOUT,
  usePreferencias,
  useSalvarPreferencias,
  PREFERENCIAS_PADRAO,
  type Accent,
  type Densidade,
  type Tema,
  type Tipografia,
} from "@/lib/preferencias";
import { CardSecao, Nota, Rotulo, Segmentado, TituloSecao } from "./ui";

/**
 * Seção "Aparência e layout" da tela `1m`.
 *
 * Tudo aqui grava de verdade em `public.account_preferences` (migration
 * 032) e aparece na hora — `src/lib/preferencias.tsx` reescreve os
 * atributos do `<html>` e o `src/index.css` traz as variantes.
 *
 * As duas exceções aparecem DESABILITADAS COM O MOTIVO ESCRITO, nunca
 * como controle que finge gravar:
 *  - os outros 3 templates de layout (o CHECK da migration 032 recusa);
 *  - o upload de logomarca (exige bucket de Storage por conta — resto do
 *    item `branding` do backlog `+1.0`).
 */

function MiniaturaTemplate({ valor }: { valor: string }) {
  const base = "h-[52px] rounded-[4px] bg-content";
  if (valor === "fixed_sidebar") {
    return (
      <div className={`${base} grid grid-cols-[22px_1fr] grid-rows-[10px_1fr] gap-[2px]`}>
        <div className="col-span-2 bg-input" />
        <div className="bg-[hsl(var(--chart-4))]" />
        <div className="bg-hairline" />
      </div>
    );
  }
  if (valor === "collapsible_sidebar") {
    return (
      <div className={`${base} grid grid-cols-[11px_1fr] grid-rows-[10px_1fr] gap-[2px]`}>
        <div className="col-span-2 bg-input" />
        <div className="bg-[hsl(var(--chart-4))]" />
        <div className="bg-hairline" />
      </div>
    );
  }
  if (valor === "top_nav") {
    return (
      <div className={`${base} flex flex-col gap-[2px]`}>
        <div className="h-[10px] bg-input" />
        <div className="h-[8px] bg-[hsl(var(--chart-4))]" />
        <div className="flex-1 bg-hairline" />
      </div>
    );
  }
  return (
    <div className={`${base} grid grid-cols-[18px_1fr_18px] grid-rows-[10px_1fr] gap-[2px]`}>
      <div className="col-span-3 bg-input" />
      <div className="bg-[hsl(var(--chart-4))]" />
      <div className="bg-hairline" />
      <div className="bg-[hsl(var(--chart-4))]" />
    </div>
  );
}

export function Aparencia() {
  const { profile } = useAuth();
  const { data } = usePreferencias();
  const salvar = useSalvarPreferencias();
  const p = data ?? PREFERENCIAS_PADRAO;

  const podeEditar = profile?.accountRole === "owner" || profile?.accountRole === "admin";
  const bloqueado = !podeEditar || salvar.isPending;

  return (
    <div className="flex flex-col gap-3">
      <CardSecao>
        <TituloSecao
          titulo="Template de layout"
          descricao="Resolvido no carregamento por conta — não exige rebuild por cliente."
        />
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {TEMPLATES_LAYOUT.map((t) => {
            const ativo = t.valor === p.templateLayout;
            return (
              <div
                key={t.valor}
                title={t.motivo ?? undefined}
                className={`flex flex-col gap-[7px] rounded-[7px] p-[9px] ${
                  ativo ? "border-2 border-primary" : "border border-border"
                } ${t.disponivel ? "" : "opacity-45"}`}
              >
                <MiniaturaTemplate valor={t.valor} />
                <span
                  className={`text-[10.5px] ${ativo ? "font-semibold text-accent-foreground" : "text-muted-foreground"}`}
                >
                  {t.rotulo}
                </span>
              </div>
            );
          })}
        </div>
        <Nota>
          O v01 tem um template só, e isso está garantido pelo banco: a coluna <code>layout_template</code> aceita
          apenas <code>fixed_sidebar</code> (CHECK da migration 032). Os outros três aparecem para o seletor
          materializar as 4 opções de <code>docs/04</code> §2 — ligá-los é item <code>+1.0</code> do backlog e exige
          migration deliberada, não um clique.
        </Nota>
      </CardSecao>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <CardSecao>
          <TituloSecao titulo="Tema e densidade" />
          <div className="flex flex-col gap-2">
            <Rotulo>Tema</Rotulo>
            <Segmentado<Tema>
              valor={p.tema}
              desabilitado={bloqueado}
              aoTrocar={(v) => salvar.mutate({ tema: v })}
              opcoes={[
                { valor: "light", rotulo: "Claro" },
                { valor: "dark", rotulo: "Escuro" },
                { valor: "system", rotulo: "Sistema" },
              ]}
            />
            <Rotulo>Densidade</Rotulo>
            <Segmentado<Densidade>
              valor={p.densidade}
              desabilitado={bloqueado}
              aoTrocar={(v) => salvar.mutate({ densidade: v })}
              opcoes={[
                { valor: "compact", rotulo: "Compacto" },
                { valor: "comfortable", rotulo: "Espaçoso" },
              ]}
            />
            <Rotulo>Cor de destaque</Rotulo>
            <div className="flex flex-wrap gap-[7px]">
              {ACCENTS.map((a) => (
                <button
                  key={a.valor}
                  type="button"
                  title={a.rotulo}
                  disabled={bloqueado}
                  onClick={() => salvar.mutate({ accent: a.valor as Accent })}
                  className={`h-[26px] w-[26px] rounded-[5px] ${a.amostra} ${
                    p.accent === a.valor ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
                  } ${bloqueado ? "cursor-not-allowed opacity-50" : ""}`}
                />
              ))}
              <div
                title="Cor livre exige validar contraste de texto sobre tint — a paleta ratificada garante isso par a par, cor arbitrária não."
                className="flex h-[26px] w-[26px] cursor-not-allowed items-center justify-center rounded-[5px] border border-dashed border-input text-[13px] text-muted-foreground opacity-45"
              >
                +
              </div>
            </div>
          </div>
        </CardSecao>

        <CardSecao>
          <TituloSecao titulo="Marca do CRM-filho" />
          <div className="flex items-center gap-2.5">
            <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[7px] border border-dashed border-input text-center text-[9px] text-muted-foreground opacity-60">
              logo
              <br />
              upload
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-secondary-foreground">Não disponível no v01</span>
              <span className="text-[10.5px] text-muted-foreground">
                Exige bucket de Storage por conta com política própria — é o restante do item{" "}
                <code>branding</code> do backlog (+1.0), não um campo a mais.
              </span>
            </div>
          </div>
          <Rotulo>Tipografia</Rotulo>
          <Segmentado<Tipografia>
            valor={p.tipografia}
            desabilitado={bloqueado}
            aoTrocar={(v) => salvar.mutate({ tipografia: v })}
            opcoes={[
              { valor: "sans", rotulo: "Sans neutra" },
              { valor: "serif", rotulo: "Serifa editorial" },
            ]}
          />
          <Nota>
            O tipo monoespaçado dos metadados (eyebrow de KPI, breadcrumb, hora da agenda) não acompanha a troca —
            ele é vocabulário de metadado em <code>docs/04</code> §5.1, não uma escolha de estilo.
          </Nota>
        </CardSecao>
      </div>

      {!podeEditar && (
        <Nota tom="atencao">
          Aparência é editável a partir de <strong>administrador</strong>. Você está como{" "}
          <strong>{profile?.accountRole}</strong> — a tela mostra o que vale para a conta, e o banco recusaria a
          escrita de qualquer forma (RLS de <code>account_preferences</code>).
        </Nota>
      )}
      {salvar.isError && (
        <Nota tom="atencao">Não foi possível salvar: {(salvar.error as Error).message}</Nota>
      )}
    </div>
  );
}
