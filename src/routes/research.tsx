import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Cell, ErrorBar, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageTitle, Panel, QueryBoundary, axis, grid, tooltipStyle } from "@/components/pm/ui";
import { useResearch, type Research, type VariantRow } from "@/lib/api";

export const Route = createFileRoute("/research")({
  head: () => ({
    meta: [
      { title: "Research & Validation — Predictive Maintenance Intelligence" },
      { name: "description", content: "Model benchmark, ablation study and validation protocol for the RUL model, measured over several seeds." },
      { property: "og:title", content: "Research & Validation — Predictive Maintenance Intelligence" },
      { property: "og:description", content: "Benchmark and ablation study on FD001." },
    ],
  }),
  component: ResearchPage,
});

const LABEL: Record<string, string> = {
  lstm_raw: "LSTM · raw sensors (baseline)",
  lstm_da: "DA-LSTM · degradation features",
  gru_da: "GRU · degradation features",
  cnn_da: "1D-CNN · degradation features",
  mlp_da: "MLP · degradation features",
  lstm_stats: "LSTM · raw + rolling stats",
  lstm_dyn: "LSTM · raw + trend & rate of change",
  lstm_da_nocap: "DA-LSTM · linear (uncapped) RUL target",
};
const BENCH = ["lstm_raw", "lstm_da", "gru_da", "cnn_da", "mlp_da"];
const ABL = ["lstm_raw", "lstm_stats", "lstm_dyn", "lstm_da", "lstm_da_nocap"];

function ResearchPage() {
  const q = useResearch();
  return (
    <>
      <PageTitle eyebrow="Methodology" title="Research & Validation" desc="Every variant uses the same engine-wise splits, windows, scaling and metrics. Numbers are the mean ± standard deviation of the official FD001 test score over independent training runs (different seeds and different engine splits)." />
      <QueryBoundary query={q}>{(r) => <ResearchBody r={r} />}</QueryBoundary>
    </>
  );
}

const pm = (m: number, s: number, d = 2) => (s > 0 ? `${m.toFixed(d)} ± ${s.toFixed(d)}` : m.toFixed(d));

function ResearchBody({ r }: { r: Research }) {
  const rows = (keys: string[]) => keys.map((k) => r.variants[k]).filter((x): x is VariantRow => !!x);
  const bench = rows(BENCH).map((v) => ({ ...v, name: LABEL[v.variant]!, err: [v.rmse_std, v.rmse_std] }));
  const abl = rows(ABL);
  const ref = r.variants["lstm_da"];
  const pairedT = r.paired[0];
  const p = r.protocol;
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-5">
        <Panel title="Model benchmark" sub="Test RMSE in cycles (lower is better), mean ± std over seeds" className="lg:col-span-3">
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={bench} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid {...grid} horizontal={false} vertical />
                <XAxis type="number" {...axis} />
                <YAxis type="category" dataKey="name" width={190} {...axis} />
                <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="rmse" radius={[0, 3, 3, 0]}>
                  {bench.map((b) => <Cell key={b.variant} fill={b.variant === "lstm_da" ? "var(--chart-1)" : "var(--chart-3)"} />)}
                  <ErrorBar dataKey="err" width={4} stroke="var(--foreground)" direction="x" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Benchmark table" className="lg:col-span-2">
          <table className="w-full text-sm">
            <thead><tr className="eyebrow border-b text-left"><th className="pb-2">Model</th><th className="pb-2 text-right">RMSE</th><th className="pb-2 text-right">MAE</th><th className="pb-2 text-right">Score</th></tr></thead>
            <tbody>{bench.map((b) => (
              <tr key={b.variant} className={`border-b last:border-0 ${b.variant === "lstm_da" ? "bg-accent font-semibold" : ""}`}>
                <td className="py-2 pr-2">{b.name}</td><td className="num whitespace-nowrap py-2 pl-3 text-right">{pm(b.rmse, b.rmse_std)}</td><td className="num py-2 pl-3 text-right">{b.mae.toFixed(2)}</td><td className="num py-2 pl-3 text-right">{Math.round(b.score)}</td>
              </tr>))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">{Math.min(...bench.map((b) => b.n_seeds))}–{Math.max(...bench.map((b) => b.n_seeds))} seeds per model (the baseline and proposed LSTM get the most) · {p.n_runs} training runs in total.</p>
        </Panel>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Ablation study" sub="Does degradation-awareness help? Same LSTM, same data — only the input features / target change">
          <table className="w-full text-sm">
            <thead><tr className="eyebrow border-b text-left"><th className="pb-2">Variant</th><th className="pb-2 text-right">RMSE</th><th className="pb-2 text-right">NASA score</th><th className="pb-2 text-right">Δ RMSE vs full</th></tr></thead>
            <tbody>{abl.map((a) => {
              const d = ref ? a.rmse - ref.rmse : 0;
              return (
                <tr key={a.variant} className={`border-b last:border-0 ${a.variant === "lstm_da" ? "bg-accent font-semibold" : ""}`}>
                  <td className="py-2 pr-2">{LABEL[a.variant]}</td>
                  <td className="num whitespace-nowrap py-2 pl-3 text-right">{pm(a.rmse, a.rmse_std)}</td>
                  <td className="num py-2 text-right">{Math.round(a.score)}</td>
                  <td className={`num py-2 text-right ${a.variant === "lstm_da" ? "" : d > 0 ? "text-critical" : "text-healthy"}`}>{a.variant === "lstm_da" ? "—" : `${d > 0 ? "+" : ""}${d.toFixed(2)}`}</td>
                </tr>
              );
            })}</tbody>
          </table>
          {pairedT && (
            <p className="mt-3 text-xs text-muted-foreground">
              Paired t-test, baseline LSTM vs DA-LSTM over {pairedT.n} shared seeds: mean RMSE difference {pairedT.mean_diff > 0 ? "+" : ""}{pairedT.mean_diff.toFixed(2)} cycles (baseline − DA), p = {pairedT.p.toFixed(3)}.
              {pairedT.n < 8 && " With so few runs this test has low power; treat it as indicative rather than conclusive."}
            </p>
          )}
        </Panel>
        <Panel title="Validation protocol">
          <ol className="space-y-3 text-sm">
            {[
              `Training engines are split ${p.train_engines}/${p.val_engines} by engine id (${p.splitter}), so no engine contributes windows to both sides.`,
              `Scaling statistics are ${p.scaler}; validation and test data are only transformed.`,
              `Early stopping and checkpoint selection use the validation engines only. The served checkpoint (${r.served.id}) was chosen by validation RMSE, never by test score.`,
              `Final evaluation: ${p.test}. RUL targets use the cap-125 convention; RMSE against the uncapped truth is reported on Model Performance.`,
              `Seeds ${p.seeds.join(", ")} give different initialisations and different engine splits; ${p.n_runs} runs were trained in total.`,
              `Limitation: FD001 has one operating condition and one fault mode, so results may not transfer to FD002–FD004.`,
            ].map((t, i) => (
              <li key={i} className="flex gap-3"><span className="num flex size-6 shrink-0 items-center justify-center rounded border text-xs text-primary">{i + 1}</span><span className="text-muted-foreground">{t}</span></li>
            ))}
          </ol>
        </Panel>
      </div>
    </>
  );
}
