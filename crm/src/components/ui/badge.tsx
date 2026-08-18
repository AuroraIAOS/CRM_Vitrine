import { cn } from "@/lib/utils";

/** Badge/tag pill — 4 famílias semânticas de docs/04_DESIGN_E_MARCA.md §5.5. */
const TONE_CLASS = {
  neutral: "bg-content text-secondary-foreground",
  success: "bg-success-tint text-success-tint-foreground",
  warning: "bg-warning-tint text-warning-tint-foreground",
  danger: "bg-destructive-tint text-destructive-tint-foreground",
} as const;

export type BadgeTone = keyof typeof TONE_CLASS;

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", TONE_CLASS[tone], className)}>
      {children}
    </span>
  );
}
