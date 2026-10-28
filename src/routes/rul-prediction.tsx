import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Kpi, PageTitle, Panel, RiskBadge, axis, grid, tooltipStyle } from "@/components/pm/ui";
import { engines, maintenanceAction, rulTrajectory } from "@/lib/pm-data";

export const Route = createFileRoute("/rul-prediction")({
  head: () => ({
    meta: [
      { title: "RUL Prediction — Predictive Maintenance Intelligence" },
      { name: "description", content: "Remaining Useful Life trajectory and confidence band for a selected turbofan engine." },
      { property: "og:title", content: "RUL Prediction — Predictive Maintenance Intelligence" },
      { property: "og:description", content: "Per-engine Remaining Useful Life forecasts with confidence intervals." },
    ],
  }),
  component: RulPage,
});

function RulPage() {
  const [id, setId] = useState(24);
  const e = engines[id - 1] ?? engines[0]!;
  const data = useMemo(() => rulTrajectory(id).map((d) => ({ ...d, band: [d.lower, d.upper] })), [id]);
  return (
    <>
      <PageTitle eyebrow="Inference" title="RUL Prediction" desc="Piecewise-linear target (capped at 125 cycles) against the model's sequence-wise prediction over a 30-cycle window." />
      <Panel className="mb-6">
        <label className="flex flex-wrap items-center gap-4 text-sm">
          <span className="eyebrow">Select engine</span>
          <input type="range" min={1} max={100} value={id} onChange={(ev) => setId(+ev.target.value)} className="w-64 accent-primary" />
          <span className="num font-semibold">#{String(id).padStart(3, "0")}</span>
          <RiskBadge risk={e.risk} />
        </label>
      </Panel>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Predicted RUL" value={e.predRul} unit="cycles" tone={e.risk === "Healthy" ? "healthy" : e.risk === "Warning" ? "warning" : "critical"} />
        <Kpi label="Ground truth RUL" value={e.trueRul} unit="cycles" />
        <Kpi label="Absolute error" value={Math.abs(e.predRul - e.trueRul)} unit="cycles" />
        <Kpi label="95% interval" value={`±10`} unit="cycles" note={maintenanceAction(e.risk)} />
      </div>
      <Panel title="RUL trajectory over engine life" sub="Shaded area: 95% confidence band (MC dropout, 50 passes)" className="mt-6">
        <div className="h-96">
          <ResponsiveContainer>
            <ComposedChart data={data}>
              <CartesianGrid {...grid} />
              <XAxis dataKey="cycle" {...axis} />
              <YAxis {...axis} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area dataKey="band" name="Confidence" fill="var(--chart-3)" fillOpacity={0.2} stroke="none" />
              <Line dataKey="actual" name="True RUL" stroke="var(--chart-2)" strokeDasharray="5 4" dot={false} strokeWidth={1.5} />
              <Line dataKey="predicted" name="Predicted RUL" stroke="var(--chart-1)" dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </>
  );
}
