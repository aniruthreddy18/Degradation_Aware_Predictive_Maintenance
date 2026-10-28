import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Kpi, PageTitle, Panel, axis, grid, tooltipStyle } from "@/components/pm/ui";
import { errorHistogram, metrics, trainingCurve } from "@/lib/pm-data";

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
  return (
    <>
      <PageTitle eyebrow="Evaluation" title="Model Performance" desc="Metrics computed on the 100-engine FD001 test set using the last observed cycle of each trajectory." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="RMSE" value={metrics.rmse} unit="cycles" />
        <Kpi label="MAE" value={metrics.mae} unit="cycles" />
        <Kpi label="NASA Score" value={metrics.score} note="Asymmetric; penalises late predictions" />
        <Kpi label="R²" value={metrics.r2} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Training convergence" sub="RMSE loss per epoch · early stopping at epoch 60">
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={trainingCurve}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="epoch" {...axis} />
                <YAxis {...axis} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line dataKey="train" name="Train" stroke="var(--chart-1)" dot={false} strokeWidth={2} />
                <Line dataKey="val" name="Validation" stroke="var(--chart-4)" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Prediction error distribution" sub="Predicted − true RUL (cycles)">
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={errorHistogram}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="bin" {...axis} />
                <YAxis {...axis} />
                <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="count" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <Panel title="Model configuration" className="mt-6">
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[["Architecture", "2× LSTM (64, 32) + attention"], ["Window length", "30 cycles"], ["Features", "14 sensors + 3 settings"], ["RUL cap", "125 cycles"], ["Optimizer", "Adam, lr 1e-3"], ["Batch size", "256"], ["Dropout", "0.2"], ["Loss", "Degradation-weighted MSE"]].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b py-1.5"><dt className="text-muted-foreground">{k}</dt><dd className="num text-right text-xs font-medium">{v}</dd></div>
          ))}
        </dl>
      </Panel>
    </>
  );
}
