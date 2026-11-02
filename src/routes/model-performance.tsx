import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Kpi, PageTitle, Panel, QueryBoundary, axis, grid, tooltipStyle } from "@/components/pm/ui";
import { useModel, type ModelInfo } from "@/lib/api";

export const Route = createFileRoute("/model-performance")({
  head: () => ({
    meta: [
      { title: "Model Performance — Predictive Maintenance Intelligence" },
      { name: "description", content: "RMSE, MAE, NASA scoring function and training convergence of the RUL model." },
      { property: "og:title", content: "Model Performance — Predictive Maintenance Intelligence" },
      { property: "og:description", content: "Accuracy metrics and training curves for the RUL model." },
    ],
  }),
  component: Perf,
});

function Perf() {
  const q = useModel();
  return (
    <>
      <PageTitle eyebrow="Evaluation" title="Model Performance" desc="Metrics of the served model on the official 100-engine FD001 test set, scored at the last observed cycle of each engine against RUL_FD001 (true RUL capped at 125)." />
      <QueryBoundary query={q}>{(m) => <PerfBody m={m} />}</QueryBoundary>
    </>
  );
}

function PerfBody({ m }: { m: ModelInfo }) {
  const k = m.served.metrics;
  const best = m.curve.reduce((a, b) => (b.val < a.val ? b : a));
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="RMSE" value={k.rmse.toFixed(2)} unit="cycles" note={`uncapped truth: ${m.served.metrics_uncapped.rmse.toFixed(2)}`} />
        <Kpi label="MAE" value={k.mae.toFixed(2)} unit="cycles" />
        <Kpi label="NASA Score" value={Math.round(k.score)} note="Asymmetric; penalises late predictions" />
        <Kpi label="R²" value={k.r2.toFixed(3)} note={`95% interval covers ${(m.served.coverage * 100).toFixed(0)}% of test engines`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Training convergence" sub={`RMSE (cycles) per epoch · best validation epoch ${best.epoch} of ${m.curve.length}`}>
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={m.curve}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="epoch" {...axis} />
                <YAxis {...axis} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line dataKey="train" name="Train" stroke="var(--chart-1)" dot={false} strokeWidth={2} />
                <Line dataKey="val" name="Validation (held-out engines)" stroke="var(--chart-4)" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Prediction error distribution" sub="Predicted − true RUL (cycles), 100 test engines">
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={m.errorHistogram}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="bin" {...axis} />
                <YAxis {...axis} allowDecimals={false} />
                <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="count" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <Panel title="Model configuration" sub={`Served checkpoint ${m.served.id} · chosen by validation RMSE ${m.served.val_rmse.toFixed(2)}, not by test score`} className="mt-6">
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(m.config).map(([k2, v]) => (
            <div key={k2} className="flex justify-between gap-4 border-b py-1.5"><dt className="capitalize text-muted-foreground">{k2.replace(/_/g, " ")}</dt><dd className="num text-right text-xs font-medium">{String(v)}</dd></div>
          ))}
        </dl>
      </Panel>
    </>
  );
}
