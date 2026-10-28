import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageTitle, Panel, RiskBadge } from "@/components/pm/ui";
import { engines, maintenanceAction, type Risk } from "@/lib/pm-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/engine-health")({
  head: () => ({
    meta: [
      { title: "Engine Health — Predictive Maintenance Intelligence" },
      { name: "description", content: "Health index, risk level and recommended action for every FD001 test engine." },
      { property: "og:title", content: "Engine Health — Predictive Maintenance Intelligence" },
      { property: "og:description", content: "Per-engine health index and maintenance recommendations." },
    ],
  }),
  component: EngineHealth,
});

const filters = ["All", "Healthy", "Warning", "Critical"] as const;

function EngineHealth() {
  const [f, setF] = useState<(typeof filters)[number]>("All");
  const list = useMemo(() => engines.filter((e) => f === "All" || e.risk === (f as Risk)), [f]);
  const barTone = (r: Risk) => (r === "Healthy" ? "bg-healthy" : r === "Warning" ? "bg-warning" : "bg-critical");

  return (
    <>
      <PageTitle eyebrow="Fleet monitoring" title="Engine Health" desc="Health index is derived from predicted RUL normalised to the 125-cycle degradation cap." />
      <div className="mb-4 flex gap-1 rounded-md border bg-card p-1 w-fit">
        {filters.map((x) => (
          <button key={x} onClick={() => setF(x)} className={cn("rounded px-3 py-1.5 text-xs font-medium", f === x ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{x}</button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((e) => (
          <Panel key={e.id} className="p-4">
            <div className="flex items-center justify-between">
              <span className="num text-sm font-semibold">Engine #{String(e.id).padStart(3, "0")}</span>
              <RiskBadge risk={e.risk} />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="eyebrow">Health index</span>
              <span className="num text-lg font-semibold">{e.health}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted"><div className={cn("h-full rounded-full", barTone(e.risk))} style={{ width: `${e.health}%` }} /></div>
            <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Cycles run</dt><dd className="num text-right">{e.cycles}</dd>
              <dt className="text-muted-foreground">Predicted RUL</dt><dd className="num text-right font-medium">{e.predRul}</dd>
            </dl>
            <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">{maintenanceAction(e.risk)}</p>
          </Panel>
        ))}
      </div>
    </>
  );
}
