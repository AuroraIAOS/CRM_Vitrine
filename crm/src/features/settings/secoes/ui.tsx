import type { ReactNode } from "react";

/** Primitivas compartilhadas pelas 10 seções da tela `1m` (Subetapa 02.12). */

export function CardSecao({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-3 rounded-lg border border-border bg-background p-3.5 ${className ?? ""}`}>
      {children}
    </div>
  );
}

export function TituloSecao({ titulo, descricao, acessorio }: { titulo: string; descricao?: string; acessorio?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium text-foreground">{titulo}</span>
        {descricao && <span className="text-[11px] text-muted-foreground">{descricao}</span>}
      </div>
      {acessorio}
    </div>
  );
}

export function Rotulo({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-medium text-secondary-foreground">{children}</span>;
}

/**
 * Nota explicativa. Usada sempre que um controle aparece desabilitado —
 * um controle cinza sem motivo declarado é indistinguível de um bug.
 */
export function Nota({ children, tom = "muted" }: { children: ReactNode; tom?: "muted" | "atencao" }) {
  const classe =
    tom === "atencao"
      ? "border-warning/40 bg-warning-tint text-warning-tint-foreground"
      : "border-border bg-content text-muted-foreground";
  return <div className={`rounded-md border px-2.5 py-2 text-[10.5px] leading-relaxed ${classe}`}>{children}</div>;
}

export function Segmentado<T extends string>({
  opcoes,
  valor,
  aoTrocar,
  desabilitado,
}: {
  opcoes: { valor: T; rotulo: string; desabilitado?: boolean; titulo?: string }[];
  valor: T;
  aoTrocar: (v: T) => void;
  desabilitado?: boolean;
}) {
  return (
    <div className="flex gap-2">
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        const off = desabilitado || o.desabilitado;
        return (
          <button
            key={o.valor}
            type="button"
            title={o.titulo}
            disabled={off}
            onClick={() => aoTrocar(o.valor)}
            className={`flex-1 rounded-[5px] border px-2 py-2 text-[10.5px] transition-colors ${
              ativo
                ? "border-primary bg-accent font-medium text-accent-foreground"
                : "border-input text-muted-foreground hover:bg-content"
            } ${off ? "cursor-not-allowed opacity-45 hover:bg-transparent" : ""}`}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}

export function LinhaDado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-hairline py-2 last:border-b-0">
      <span className="text-[11px] text-muted-foreground">{rotulo}</span>
      <span className="text-right text-[11px] text-secondary-foreground">{children}</span>
    </div>
  );
}

export function Pill({ tom, children }: { tom: "success" | "warning" | "danger" | "muted"; children: ReactNode }) {
  const classes =
    tom === "success"
      ? "bg-success-tint text-success-tint-foreground"
      : tom === "warning"
        ? "bg-warning-tint text-warning-tint-foreground"
        : tom === "danger"
          ? "bg-destructive-tint text-destructive-tint-foreground"
          : "bg-content text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${classes}`}>{children}</span>;
}

export function Vazio({ children }: { children: ReactNode }) {
  return <span className="text-[11px] text-muted-foreground">{children}</span>;
}
