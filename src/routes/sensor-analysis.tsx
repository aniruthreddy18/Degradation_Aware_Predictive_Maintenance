import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageTitle, Panel, QueryBoundary, axis, grid, tooltipStyle } from "@/components/pm/ui";
import { useEngine, useSensors, type SensorInfo } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sensor-analysis")({
  head: () => ({
    meta: [
      { title: "Sensor Analysis — Predictive Maintenance Intelligence" },
      { name: "description", content: "Degradation trends of the informative C-MAPSS sensors across an engine's life." },
      { property: "og:title", content: "Sensor Analysis — Predictive Maintenance Intelligence" },
      { property: "og:description", content: "Sensor degradation trends across engine life." },
    ],
  }),
  component: SensorPage,
});

function SensorPage() {
  const q = useSensors();
  return (
    <>
      <PageTitle eyebrow="Signal analysis" title="Sensor Analysis" desc="7 of the 21 FD001 sensors are constant or near-constant and were dropped. The 14 informative sensors are ranked by their Spearman correlation with the capped RUL on the training set." />
      <QueryBoundary query={q}>{(s) => <SensorBody sensors={s} />}</QueryBoundary>
    </>
  );
}

function SensorBody({ sensors }: { sensors: SensorInfo[] }) {
  const kept = useMemo(() => sensors.filter((s) => s.kept).sort((a, b) => Math.abs(b.corrRul) - Math.abs(a.corrRul)), [sensors]);
  const dropped = sensors.filter((s) => !s.kept);
  const [sel, setSel] = useState<string>(kept[0]?.key ?? "s11");
  const [eid, setEid] = useState(24);
  const engine = useEngine(eid);
  const s = kept.find((x) => x.key === sel) ?? kept[0]!;
  return (
    <>
      <Panel className="mb-6">
        <label className="flex flex-wrap items-center gap-4 text-sm">
          <span className="eyebrow">Test engine</span>
          <input type="range" min={1} max={100} value={eid} onChange={(ev) => setEid(+ev.target.value)} className="w-64 accent-primary" aria-label="Engine id" />
          <span className="num font-semibold">#{String(eid).padStart(3, "0")}</span>
        </label>
      </Panel>
      <QueryBoundary query={engine}>
        {(d) => {
          const series = (key: string) => d.sensors[key]!.map((v, i) => ({ cycle: i + 1, [key]: v }));
          const data = series(s.key);
          return (
            <>
              <Panel title={`${s.key.toUpperCase()} — ${s.symbol} · ${s.name}`} sub={`Engine #${String(eid).padStart(3, "0")} · unit ${s.unit} · ρ(RUL) = ${s.corrRul} (${s.trend === "up" ? "rises" : "falls"} with wear)`}>
                <div className="h-80">
                  <ResponsiveContainer>
                    <LineChart data={data}>
                      <CartesianGrid {...grid} />
                      <XAxis dataKey="cycle" {...axis} />
                      <YAxis domain={["auto", "auto"]} {...axis} />
                      <Tooltip {...tooltipStyle} />
                      <Line dataKey={s.key} stroke="var(--chart-1)" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {kept.map((x) => (
                  <button key={x.key} onClick={() => setSel(x.key)} className={cn("panel p-3 text-left transition-colors", sel === x.key && "ring-2 ring-primary")}>
                    <div className="flex justify-between text-xs"><span className="num font-semibold text-foreground">{x.key.toUpperCase()} · {x.symbol}</span><span className="text-muted-foreground">{x.trend === "up" ? "↑" : "↓"} ρ {x.corrRul}</span></div>
                    <div className="mb-2 truncate text-xs text-muted-foreground">{x.name} ({x.unit})</div>
                    <div className="h-12">
                      <ResponsiveContainer>
                        <LineChart data={series(x.key)}><YAxis hide domain={["auto", "auto"]} /><Line dataKey={x.key} stroke="var(--chart-2)" dot={false} strokeWidth={1} isAnimationActive={false} /></LineChart>
                      </ResponsiveContainer>
                    </div>
                  </button>
                ))}
              </div>
            </>
          );
        }}
      </QueryBoundary>
      <Panel title="Dropped sensors" sub="Standard deviation across the whole training set is ~0, so they cannot carry degradation information" className="mt-6">
        <div className="flex flex-wrap gap-2 text-xs">
          {dropped.map((x) => <span key={x.key} className="num rounded border bg-background px-2 py-1">{x.key} · {x.symbol} <span className="text-muted-foreground">σ={x.std}</span></span>)}
        </div>
      </Panel>
    </>
  );
}
