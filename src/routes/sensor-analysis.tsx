import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageTitle, Panel, axis, grid, tooltipStyle } from "@/components/pm/ui";
import { informativeSensors, sensorSeries } from "@/lib/pm-data";
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
  const [sel, setSel] = useState<string>("s11");
  const data = useMemo(() => sensorSeries(24), []);
  const s = informativeSensors.find((x) => x.key === sel)!;
  return (
    <>
      <PageTitle eyebrow="Signal analysis" title="Sensor Analysis" desc="7 of 21 sensors are constant in FD001 and were dropped. The 14 remaining were min-max normalised; the 8 most degradation-sensitive are shown." />
      <Panel title={`${s.key.toUpperCase()} — ${s.name}`} sub={`Engine #024 · unit ${s.unit} · trend ${s.trend === "up" ? "increasing" : "decreasing"} with wear`}>
        <div className="h-80">
          <ResponsiveContainer>
            <LineChart data={data}>
              <CartesianGrid {...grid} />
              <XAxis dataKey="cycle" {...axis} />
              <YAxis domain={["auto", "auto"]} {...axis} />
              <Tooltip {...tooltipStyle} />
              <Line dataKey={sel} stroke="var(--chart-1)" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {informativeSensors.map((x) => (
          <button key={x.key} onClick={() => setSel(x.key)} className={cn("panel p-3 text-left transition-colors", sel === x.key && "ring-2 ring-primary")}>
            <div className="flex justify-between text-xs"><span className="num font-semibold text-foreground">{x.key.toUpperCase()}</span><span className="text-muted-foreground">{x.trend === "up" ? "↑" : "↓"} {x.unit}</span></div>
            <div className="mb-2 truncate text-xs text-muted-foreground">{x.name}</div>
            <div className="h-12">
              <ResponsiveContainer>
                <LineChart data={data}><YAxis hide domain={["auto", "auto"]} /><Line dataKey={x.key} stroke="var(--chart-2)" dot={false} strokeWidth={1} isAnimationActive={false} /></LineChart>
              </ResponsiveContainer>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
