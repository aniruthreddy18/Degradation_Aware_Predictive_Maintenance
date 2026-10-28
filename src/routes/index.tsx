import { createFileRoute, Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight } from "lucide-react";
import { Kpi, PageTitle, Panel, RiskBadge, axis, grid, tooltipStyle } from "@/components/pm/ui";
import { engines, fleet, metrics, riskColor, maintenanceAction } from "@/lib/pm-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview — Predictive Maintenance Intelligence" },
      { name: "description", content: "Fleet-level RUL, risk distribution and maintenance priorities for 100 FD001 turbofan engines." },
      { property: "og:title", content: "Overview — Predictive Maintenance Intelligence" },
      { property: "og:description", content: "Fleet-level RUL, risk and maintenance priorities for FD001 engines." },
    ],
  }),
  component: Overview,
});

const pipeline = ["Data", "Sensor Degradation", "Deep Learning", "RUL Prediction", "Risk", "Maintenance Decision"];

function Overview() {
  const riskData = [
    { name: "Healthy", value: fleet.healthy },
    { name: "Warning", value: fleet.warning },
    { name: "Critical", value: fleet.critical },
  ] as const;
  const rulBins = Array.from({ length: 8 }, (_, i) => ({
    bin: `${i * 20}–${i * 20 + 19}`,
    count: engines.filter((e) => e.predRul >= i * 20 && e.predRul < i * 20 + 20).length,
  }));
  const priority = [...engines].sort((a, b) => a.predRul - b.predRul).slice(0, 8);

  return (
    <>
      <PageTitle eyebrow="Executive summary" title="Fleet Overview" desc="Current state of the FD001 test fleet as estimated by the degradation-aware LSTM model." />

      <div className="panel mb-6 flex flex-wrap items-center gap-2 p-3">
        {pipeline.map((p, i) => (
          <div key={p} className="flex items-center gap-2">
            <span className="rounded border bg-background px-3 py-1.5 text-xs font-medium text-foreground"><span className="num mr-1.5 text-primary">{String(i + 1).padStart(2, "0")}</span>{p}</span>
            {i < pipeline.length - 1 && <ArrowRight className="size-3.5 text-muted-foreground" />}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Total Engines" value={fleet.total} note="FD001 test set" />
        <Kpi label="Healthy" value={fleet.healthy} tone="healthy" note="RUL > 80 cycles" />
        <Kpi label="Warning" value={fleet.warning} tone="warning" note="30 – 80 cycles" />
        <Kpi label="Critical" value={fleet.critical} tone="critical" note="RUL ≤ 30 cycles" />
        <Kpi label="Avg. Predicted RUL" value={fleet.avgRul} unit="cycles" />
        <Kpi label="Test RMSE" value={metrics.rmse} unit="cycles" note={`MAE ${metrics.mae}`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Risk distribution" sub="Engines by health category">
          <div className="h-56">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={[...riskData]} dataKey="value" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="var(--card)">
                  {riskData.map((d) => <Cell key={d.name} fill={riskColor[d.name]} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 text-xs">
            {riskData.map((d) => <span key={d.name} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: riskColor[d.name] }} />{d.name} <span className="num text-muted-foreground">{d.value}</span></span>)}
          </div>
        </Panel>
        <Panel title="Predicted RUL distribution" sub="Engine count per 20-cycle band" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={rulBins}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="bin" {...axis} />
                <YAxis {...axis} />
                <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="count" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Panel title="Maintenance priority queue" sub="Lowest predicted RUL first" className="lg:col-span-3" action={<Link to="/engine-health" className="text-xs font-medium text-primary hover:underline">All engines →</Link>}>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left eyebrow"><th className="pb-2">Engine</th><th className="pb-2">Cycles</th><th className="pb-2">Pred. RUL</th><th className="pb-2">Risk</th><th className="hidden pb-2 md:table-cell">Action</th></tr></thead>
            <tbody>
              {priority.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="num py-2 font-medium">#{String(e.id).padStart(3, "0")}</td>
                  <td className="num py-2 text-muted-foreground">{e.cycles}</td>
                  <td className="num py-2 font-semibold">{e.predRul}</td>
                  <td className="py-2"><RiskBadge risk={e.risk} /></td>
                  <td className="hidden py-2 text-xs text-muted-foreground md:table-cell">{maintenanceAction(e.risk)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Predicted vs. true RUL" sub="Each point is one test engine" className="lg:col-span-2">
          <div className="h-72">
            <ResponsiveContainer>
              <ScatterChart>
                <CartesianGrid {...grid} vertical />
                <XAxis dataKey="trueRul" name="True" type="number" {...axis} />
                <YAxis dataKey="predRul" name="Predicted" type="number" {...axis} />
                <Tooltip {...tooltipStyle} />
                <Scatter data={engines} fill="var(--chart-1)" fillOpacity={0.7} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </>
  );
}
