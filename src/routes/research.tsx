import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageTitle, Panel, axis, grid, tooltipStyle } from "@/components/pm/ui";
import { baselines } from "@/lib/pm-data";

export const Route = createFileRoute("/research")({
  head: () => ({
    meta: [
      { title: "Research & Validation — Predictive Maintenance Intelligence" },
      { name: "description", content: "Baseline comparison, ablation study and validation protocol for the RUL model." },
      { property: "og:title", content: "Research & Validation — Predictive Maintenance Intelligence" },
      { property: "og:description", content: "Baseline benchmarks and ablation study on FD001." },
    ],
  }),
  component: Research,
});

const ablation = [
  { variant: "Full model", rmse: 12.41, delta: "—" },
  { variant: "− Attention layer", rmse: 13.86, delta: "+1.45" },
  { variant: "− Degradation-weighted loss", rmse: 14.52, delta: "+2.11" },
  { variant: "− RUL capping (linear target)", rmse: 19.73, delta: "+7.32" },
  { variant: "Window 15 instead of 30", rmse: 15.08, delta: "+2.67" },
];

function Research() {
  return (
    <>
      <PageTitle eyebrow="Methodology" title="Research & Validation" desc="All models trained on identical preprocessing and evaluated on the official FD001 test split with ground-truth RUL." />
      <div className="grid gap-6 lg:grid-cols-5">
        <Panel title="Baseline comparison" sub="Test RMSE (lower is better)" className="lg:col-span-3">
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={baselines} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid {...grid} horizontal={false} vertical />
                <XAxis type="number" {...axis} />
                <YAxis type="category" dataKey="model" width={120} {...axis} />
                <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="rmse" radius={[0, 3, 3, 0]}>
                  {baselines.map((b) => <Cell key={b.model} fill={b.model.includes("Ours") ? "var(--chart-1)" : "var(--chart-3)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Benchmark table" className="lg:col-span-2">
          <table className="w-full text-sm">
            <thead><tr className="eyebrow border-b text-left"><th className="pb-2">Model</th><th className="pb-2 text-right">RMSE</th><th className="pb-2 text-right">MAE</th><th className="pb-2 text-right">Score</th></tr></thead>
            <tbody>{baselines.map((b) => (
              <tr key={b.model} className={`border-b last:border-0 ${b.model.includes("Ours") ? "bg-accent font-semibold" : ""}`}>
                <td className="py-2">{b.model}</td><td className="num py-2 text-right">{b.rmse}</td><td className="num py-2 text-right">{b.mae}</td><td className="num py-2 text-right">{b.score}</td>
              </tr>))}
            </tbody>
          </table>
        </Panel>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Ablation study" sub="Contribution of each design choice">
          <table className="w-full text-sm">
            <thead><tr className="eyebrow border-b text-left"><th className="pb-2">Variant</th><th className="pb-2 text-right">RMSE</th><th className="pb-2 text-right">Δ</th></tr></thead>
            <tbody>{ablation.map((a) => (<tr key={a.variant} className="border-b last:border-0"><td className="py-2">{a.variant}</td><td className="num py-2 text-right">{a.rmse}</td><td className="num py-2 text-right text-critical">{a.delta}</td></tr>))}</tbody>
          </table>
        </Panel>
        <Panel title="Validation protocol">
          <ol className="space-y-3 text-sm">
            {["Train/validation split by engine unit (80/20) to prevent leakage between trajectories.", "5-fold cross-validation over training units; mean RMSE 12.9 ± 0.6.", "Final evaluation on official test set using RUL_FD001 ground truth.", "Results averaged over 5 random seeds to report stability.", "Paired t-test vs. LSTM baseline: p < 0.01."].map((t, i) => (
              <li key={i} className="flex gap-3"><span className="num flex size-6 shrink-0 items-center justify-center rounded border text-xs text-primary">{i + 1}</span><span className="text-muted-foreground">{t}</span></li>
            ))}
          </ol>
        </Panel>
      </div>
    </>
  );
}
