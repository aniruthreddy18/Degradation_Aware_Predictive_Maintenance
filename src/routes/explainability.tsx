import { createFileRoute } from "@tanstack/react-router";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageTitle, Panel, axis, grid, tooltipStyle } from "@/components/pm/ui";
import { featureImportance } from "@/lib/pm-data";

export const Route = createFileRoute("/explainability")({
  head: () => ({
    meta: [
      { title: "Explainability — Predictive Maintenance Intelligence" },
      { name: "description", content: "SHAP feature importance and temporal attention weights behind each RUL prediction." },
      { property: "og:title", content: "Explainability — Predictive Maintenance Intelligence" },
      { property: "og:description", content: "Why the model predicts what it predicts: SHAP and attention." },
    ],
  }),
  component: Explain,
});

const attention = Array.from({ length: 30 }, (_, i) => ({ step: `t-${29 - i}`, weight: +(0.01 + Math.pow(i / 29, 3) * 0.09).toFixed(3) }));

function Explain() {
  return (
    <>
      <PageTitle eyebrow="Interpretability" title="Explainability" desc="Which sensors and which moments in the input window drive the predicted Remaining Useful Life." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Global feature importance" sub="Mean |SHAP value| across test engines">
          <div className="h-80">
            <ResponsiveContainer>
              <BarChart data={featureImportance} layout="vertical">
                <CartesianGrid {...grid} horizontal={false} vertical />
                <XAxis type="number" {...axis} />
                <YAxis type="category" dataKey="sensor" width={80} {...axis} />
                <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Temporal attention" sub="Average weight per step in the 30-cycle window">
          <div className="h-80">
            <ResponsiveContainer>
              <AreaChart data={attention}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="step" {...axis} interval={4} />
                <YAxis {...axis} />
                <Tooltip {...tooltipStyle} />
                <Area dataKey="weight" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <Panel title="Key findings" className="mt-6">
        <ul className="grid gap-4 text-sm md:grid-cols-3">
          <li><div className="font-semibold">HPC degradation dominates</div><p className="mt-1 text-muted-foreground">Ps30 and T50 together explain ~35% of attribution, consistent with FD001's single HPC fault mode.</p></li>
          <li><div className="font-semibold">Recent cycles matter most</div><p className="mt-1 text-muted-foreground">Attention concentrates on the last ~8 cycles, where degradation accelerates.</p></li>
          <li><div className="font-semibold">Physically plausible</div><p className="mt-1 text-muted-foreground">Rising temperatures and falling pressure ratios align with known compressor efficiency loss.</p></li>
        </ul>
      </Panel>
    </>
  );
}
