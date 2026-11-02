import { createFileRoute } from "@tanstack/react-router";
import { PageTitle, Panel } from "@/components/pm/ui";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About the Project — Predictive Maintenance Using Deep Learning" },
      { name: "description", content: "Objectives, dataset and methodology of the college research project on deep-learning predictive maintenance." },
      { property: "og:title", content: "About — Predictive Maintenance Using Deep Learning" },
      { property: "og:description", content: "Research objectives, dataset and methodology." },
    ],
  }),
  component: About,
});

function About() {
  return (
    <>
      <PageTitle eyebrow="Research project" title="Predictive Maintenance of Machines Using Deep Learning" desc="A university research demonstration of data-driven prognostics for aircraft turbofan engines." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Objective" className="lg:col-span-2">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Unplanned engine failures are costly and dangerous, while fixed-interval maintenance wastes useful component life.
            This project estimates each engine's Remaining Useful Life from multivariate sensor streams so maintenance can be
            scheduled just before failure. A degradation-aware LSTM is fed explicit wear indicators (rolling mean and spread, local trend and rate of change of each sensor) so it can track how sensor signatures evolve as
            the high-pressure compressor wears. Predictions are served by a FastAPI backend with calibrated uncertainty intervals.
          </p>
        </Panel>
        <Panel title="Dataset">
          <dl className="space-y-1.5 text-sm">
            {[["Source", "NASA Ames PCoE"], ["Subset", "FD001"], ["Train engines", "100"], ["Test engines", "100"], ["Sensors", "21"], ["Op. conditions", "1 (sea level)"], ["Fault mode", "HPC degradation"]].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b py-1 last:border-0"><dt className="text-muted-foreground">{k}</dt><dd className="num text-xs font-medium">{v}</dd></div>
            ))}
          </dl>
        </Panel>
      </div>
      <Panel title="Methodology" className="mt-6">
        <ol className="grid gap-4 text-sm md:grid-cols-3 lg:grid-cols-6">
          {[["Data", "Load FD001, drop 7 constant sensors"], ["Preprocess", "Train-only scaling, 30-cycle windows"], ["Label", "Piecewise RUL, capped at 125"], ["Model", "LSTM on degradation features"], ["Evaluate", "RMSE, MAE, NASA score"], ["Decide", "Risk tiers → maintenance action"]].map(([t, d], i) => (
            <li key={t} className="rounded-md border bg-background p-3"><div className="num text-xs text-primary">{String(i + 1).padStart(2, "0")}</div><div className="mt-1 font-semibold">{t}</div><p className="mt-1 text-xs text-muted-foreground">{d}</p></li>
          ))}
        </ol>
      </Panel>
      <p className="mt-6 text-xs text-muted-foreground">Reference: A. Saxena et al., "Damage Propagation Modeling for Aircraft Engine Run-to-Failure Simulation," PHM 2008.</p>
    </>
  );
}
