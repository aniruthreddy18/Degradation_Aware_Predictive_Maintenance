import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Kpi, PageTitle, Panel, QueryBoundary, RiskBadge, axis, grid, tooltipStyle } from "@/components/pm/ui";
import { predictRul, useEngine, useFleet, type EngineDetail, type PredictResult } from "@/lib/api";
import { maintenanceAction } from "@/lib/pm-data";

export const Route = createFileRoute("/rul-prediction")({
  head: () => ({
    meta: [
      { title: "RUL Prediction — Predictive Maintenance Intelligence" },
      { name: "description", content: "Remaining Useful Life trajectory and calibrated uncertainty band for a selected turbofan engine." },
      { property: "og:title", content: "RUL Prediction — Predictive Maintenance Intelligence" },
      { property: "og:description", content: "Per-engine Remaining Useful Life forecasts with calibrated intervals." },
    ],
  }),
  component: RulPage,
});

function RulPage() {
  const [id, setId] = useState(24);
  const fleet = useFleet();
  const detail = useEngine(id);
  const total = fleet.data?.engines.length ?? 100;
  return (
    <>
      <PageTitle eyebrow="Inference" title="RUL Prediction" desc="At every cycle the model sees only the previous 30 cycles of that engine, exactly as it would in operation. The true RUL (capped at 125) is shown for comparison." />
      <Panel className="mb-6">
        <label className="flex flex-wrap items-center gap-4 text-sm">
          <span className="eyebrow">Select engine</span>
          <input type="range" min={1} max={total} value={id} onChange={(ev) => setId(+ev.target.value)} className="w-64 accent-primary" aria-label="Engine id" />
          <span className="num font-semibold">#{String(id).padStart(3, "0")}</span>
          {detail.data && <RiskBadge risk={detail.data.engine.risk} />}
        </label>
      </Panel>
      <QueryBoundary query={detail}>{(d) => <EngineView d={d} />}</QueryBoundary>
    </>
  );
}

function EngineView({ d }: { d: EngineDetail }) {
  const { engine: e, trajectory } = d;
  const data = useMemo(() => trajectory.map((t) => ({ ...t, band: [t.lower, t.upper] })), [trajectory]);
  const [live, setLive] = useState<PredictResult | null>(null);
  const run = useMutation({
    mutationFn: () => {
      const keys = Object.keys(d.sensors);
      const n = d.sensors[keys[0]!]!.length;
      const rows = Array.from({ length: n }, (_, i) => Object.fromEntries(keys.map((k) => [k, d.sensors[k]![i]!])));
      return predictRul(rows);
    },
    onSuccess: setLive,
  });
  const tone = e.risk === "Healthy" ? "healthy" : e.risk === "Warning" ? "warning" : "critical";
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Predicted RUL" value={Math.round(e.predRul)} unit="cycles" tone={tone} note={`at cycle ${e.cycles}`} />
        <Kpi label="Ground-truth RUL" value={Math.round(e.trueRulCapped)} unit="cycles" {...(e.trueRul > 125 ? { note: `true ${Math.round(e.trueRul)} (capped at 125)` } : {})} />
        <Kpi label="Absolute error" value={Math.abs(e.predRul - e.trueRulCapped).toFixed(1)} unit="cycles" />
        <Kpi label="95% interval" value={`${Math.round(e.lower)}–${Math.round(e.upper)}`} unit="cycles" note={maintenanceAction(e.risk)} />
      </div>
      <Panel title="RUL trajectory over engine life" sub="Shaded area: calibrated 95% interval (MC dropout, 50 passes)" className="mt-6">
        <div className="h-96">
          <ResponsiveContainer>
            <ComposedChart data={data}>
              <CartesianGrid {...grid} />
              <XAxis dataKey="cycle" {...axis} />
              <YAxis domain={[0, 130]} {...axis} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={30} stroke="var(--critical)" strokeDasharray="2 4" />
              <ReferenceLine y={80} stroke="var(--warning)" strokeDasharray="2 4" />
              <Area dataKey="band" name="95% interval" fill="var(--chart-3)" fillOpacity={0.2} stroke="none" />
              <Line dataKey="actual" name="True RUL" stroke="var(--chart-2)" strokeDasharray="5 4" dot={false} strokeWidth={1.5} />
              <Line dataKey="predicted" name="Predicted RUL" stroke="var(--chart-1)" dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <Panel title="Live inference" sub="Sends this engine's raw sensor history to POST /api/predict and runs the served model on it" className="mt-6">
        <div className="flex flex-wrap items-center gap-4">
          <button onClick={() => run.mutate()} disabled={run.isPending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {run.isPending ? "Running…" : `Re-run model on ${trajectory.length + 29} cycles of history`}
          </button>
          {run.isError && <span role="alert" className="text-sm text-critical">{run.error instanceof Error ? run.error.message : "Request failed"}</span>}
          {live && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span>RUL <span className="num font-semibold">{live.rul}</span> cycles</span>
              <span className="text-muted-foreground">95% interval <span className="num">{live.lower}–{live.upper}</span></span>
              <RiskBadge risk={live.risk} />
              <span className="text-xs text-muted-foreground">{live.action}</span>
              {live.out_of_range_sensors.length > 0 && <span className="text-xs text-warning">Out-of-range sensors: {live.out_of_range_sensors.join(", ")}</span>}
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}
