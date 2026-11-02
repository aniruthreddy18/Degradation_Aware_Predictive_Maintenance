import { createFileRoute } from "@tanstack/react-router";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageTitle, Panel, QueryBoundary, axis, grid, tooltipStyle } from "@/components/pm/ui";
import { useExplain, type Explain } from "@/lib/api";

export const Route = createFileRoute("/explainability")({
  head: () => ({
    meta: [
      { title: "Explainability — Predictive Maintenance Intelligence" },
      { name: "description", content: "Permutation importance and temporal saliency behind each RUL prediction." },
      { property: "og:title", content: "Explainability — Predictive Maintenance Intelligence" },
      { property: "og:description", content: "Which sensors and which moments drive the predicted RUL." },
    ],
  }),
  component: ExplainPage,
});

function ExplainPage() {
  const q = useExplain();
  return (
    <>
      <PageTitle eyebrow="Interpretability" title="Explainability" desc="Which sensors, which derived degradation features and which moments of the 30-cycle input window drive the predicted Remaining Useful Life." />
      <QueryBoundary query={q}>{(e) => <ExplainBody e={e} />}</QueryBoundary>
    </>
  );
}

const GROUP_LABEL: Record<string, string> = { raw: "Raw values", mean: "Rolling mean", std: "Rolling std", trend: "Local trend (slope)", roc: "Rate of change" };

function ExplainBody({ e }: { e: Explain }) {
  const top = e.sensors.slice(0, 10);
  const total = e.sensors.reduce((a, b) => a + Math.max(b.value, 0), 0) || 1;
  const top2 = top.slice(0, 2);
  const share = Math.round((100 * top2.reduce((a, b) => a + Math.max(b.value, 0), 0)) / total);
  const peak = e.time.reduce((a, b) => (b.weight > a.weight ? b : a));
  const lastQuarter = Math.round(100 * e.time.slice(-8).reduce((a, b) => a + b.weight, 0));
  const topGroup = [...e.groups].sort((a, b) => b.value - a.value)[0]!;
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Sensor importance" sub="Increase in validation RMSE (cycles) when a sensor's features are shuffled across samples">
          <div className="h-80">
            <ResponsiveContainer>
              <BarChart data={top} layout="vertical">
                <CartesianGrid {...grid} horizontal={false} vertical />
                <XAxis type="number" {...axis} />
                <YAxis type="category" dataKey="sensor" width={90} {...axis} />
                <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="value" name="ΔRMSE (cycles)" fill="var(--chart-1)" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Which part of the window matters" sub="Share of input×gradient saliency per time step, averaged over the 100 test engines">
          <div className="h-80">
            <ResponsiveContainer>
              <AreaChart data={e.time}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="step" {...axis} interval={4} />
                <YAxis {...axis} />
                <Tooltip {...tooltipStyle} />
                <Area dataKey="weight" name="Saliency share" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <Panel title="Importance by feature type" sub="Permuting all sensors' features of one type at once" className="mt-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {e.groups.map((g) => (
            <div key={g.group} className="rounded-md border bg-background p-3">
              <div className="eyebrow">{GROUP_LABEL[g.group] ?? g.group}</div>
              <div className="num mt-1 text-xl font-semibold">+{g.value.toFixed(2)}<span className="ml-1 text-xs font-normal text-muted-foreground">cycles</span></div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Key findings" sub="Generated from the numbers above" className="mt-6">
        <ul className="grid gap-4 text-sm md:grid-cols-3">
          <li><div className="font-semibold">Dominant sensors</div><p className="mt-1 text-muted-foreground">{top2.map((s) => s.sensor).join(" and ")} account for about {share}% of the total permutation importance across the 14 sensors.</p></li>
          <li><div className="font-semibold">Where in the window</div><p className="mt-1 text-muted-foreground">Saliency peaks at {peak.step}; the most recent 8 cycles carry {lastQuarter}% of the total.</p></li>
          <li><div className="font-semibold">Feature types</div><p className="mt-1 text-muted-foreground">Shuffling “{GROUP_LABEL[topGroup.group] ?? topGroup.group}” hurts most (+{topGroup.value.toFixed(2)} cycles RMSE). Overlapping features are partly redundant, so importances don't simply add up.</p></li>
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">Method: {e.method}. Baseline validation RMSE {e.baseline_val_rmse.toFixed(2)} cycles.</p>
      </Panel>
    </>
  );
}
