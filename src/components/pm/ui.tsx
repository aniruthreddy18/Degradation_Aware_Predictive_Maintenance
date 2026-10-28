import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Risk } from "@/lib/pm-data";

export function PageTitle({ eyebrow, title, desc }: { eyebrow: string; title: string; desc?: string }) {
  return (
    <div className="mb-6">
      <div className="eyebrow">{eyebrow}</div>
      <h1 className="mt-1 text-3xl font-semibold text-foreground">{title}</h1>
      {desc && <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{desc}</p>}
    </div>
  );
}

export function Panel({ title, sub, children, className, action }: { title?: string; sub?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cn("panel p-5", className)}>
      {title && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, unit, note, tone }: { label: string; value: ReactNode; unit?: string; note?: string; tone?: "healthy" | "warning" | "critical" }) {
  const bar = tone === "healthy" ? "bg-healthy" : tone === "warning" ? "bg-warning" : tone === "critical" ? "bg-critical" : "bg-primary";
  return (
    <div className="panel relative overflow-hidden p-4">
      <span className={cn("absolute inset-y-0 left-0 w-1", bar)} />
      <div className="eyebrow">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="num text-2xl font-semibold text-foreground">{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      {note && <div className="mt-1 text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

export function RiskBadge({ risk }: { risk: Risk }) {
  const c = risk === "Healthy" ? "text-healthy bg-healthy/10 border-healthy/30" : risk === "Warning" ? "text-warning bg-warning/10 border-warning/30" : "text-critical bg-critical/10 border-critical/30";
  return <span className={cn("inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium", c)}><span className="size-1.5 rounded-full bg-current" />{risk}</span>;
}

export const axis = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false } as const;
export const grid = { stroke: "var(--border)", strokeDasharray: "3 3", vertical: false } as const;
export const tooltipStyle = {
  contentStyle: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 },
  labelStyle: { color: "var(--foreground)", fontWeight: 600 },
} as const;
