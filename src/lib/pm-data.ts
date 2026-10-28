// Simulated, deterministic data modelled on NASA C-MAPSS FD001 (100 test engines, 21 sensors).
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const r = rng(42);

export type Risk = "Healthy" | "Warning" | "Critical";
export const riskOf = (rul: number): Risk => (rul > 80 ? "Healthy" : rul > 30 ? "Warning" : "Critical");

export interface Engine {
  id: number;
  cycles: number;
  trueRul: number;
  predRul: number;
  health: number;
  risk: Risk;
}

export const engines: Engine[] = Array.from({ length: 100 }, (_, i) => {
  const trueRul = Math.round(8 + r() * 137);
  const err = (r() - 0.5) * 2 * (6 + trueRul * 0.08);
  const predRul = Math.max(1, Math.round(trueRul + err));
  const cycles = Math.round(31 + r() * 270);
  return {
    id: i + 1,
    cycles,
    trueRul,
    predRul,
    health: Math.min(100, Math.round((predRul / 125) * 100)),
    risk: riskOf(predRul),
  };
});

export const fleet = {
  total: engines.length,
  healthy: engines.filter((e) => e.risk === "Healthy").length,
  warning: engines.filter((e) => e.risk === "Warning").length,
  critical: engines.filter((e) => e.risk === "Critical").length,
  avgRul: Math.round(engines.reduce((a, e) => a + e.predRul, 0) / engines.length),
};

export const metrics = { rmse: 12.41, mae: 9.37, score: 238.6, r2: 0.912 };

export const baselines = [
  { model: "Linear Regression", rmse: 31.95, mae: 25.6, score: 4562 },
  { model: "Random Forest", rmse: 18.42, mae: 13.9, score: 1103 },
  { model: "CNN (1D)", rmse: 18.45, mae: 13.4, score: 1287 },
  { model: "LSTM", rmse: 16.14, mae: 12.1, score: 338 },
  { model: "DA-LSTM (Ours)", rmse: 12.41, mae: 9.37, score: 239 },
];

export const informativeSensors = [
  { key: "s2", name: "T24 · LPC outlet temp", unit: "°R", base: 642.5, drift: 1.2, trend: "up" },
  { key: "s3", name: "T30 · HPC outlet temp", unit: "°R", base: 1589, drift: 14, trend: "up" },
  { key: "s4", name: "T50 · LPT outlet temp", unit: "°R", base: 1404, drift: 22, trend: "up" },
  { key: "s7", name: "P30 · HPC outlet pressure", unit: "psia", base: 554.3, drift: -2.4, trend: "down" },
  { key: "s11", name: "Ps30 · HPC static pressure", unit: "psia", base: 47.35, drift: 0.9, trend: "up" },
  { key: "s12", name: "phi · Fuel flow ratio", unit: "pps/psi", base: 522.3, drift: -2.1, trend: "down" },
  { key: "s15", name: "BPR · Bypass ratio", unit: "—", base: 8.41, drift: 0.12, trend: "up" },
  { key: "s21", name: "W32 · LPT coolant bleed", unit: "lbm/s", base: 23.36, drift: -0.35, trend: "down" },
] as const;

export const featureImportance = [
  { sensor: "s11 Ps30", value: 0.184 },
  { sensor: "s4 T50", value: 0.162 },
  { sensor: "s12 phi", value: 0.131 },
  { sensor: "s7 P30", value: 0.118 },
  { sensor: "s15 BPR", value: 0.097 },
  { sensor: "s3 T30", value: 0.088 },
  { sensor: "s21 W32", value: 0.074 },
  { sensor: "s2 T24", value: 0.061 },
  { sensor: "s9 Nc", value: 0.045 },
  { sensor: "s14 NRc", value: 0.04 },
];

/** Sensor trajectory for one engine life (cycles → normalized degradation). */
export function sensorSeries(engineId: number, length = 200) {
  const g = rng(engineId * 97);
  return Array.from({ length }, (_, c) => {
    const t = c / length;
    const deg = Math.pow(t, 2.2);
    const row: Record<string, number> = { cycle: c + 1 };
    informativeSensors.forEach((s) => {
      row[s.key] = +(s.base + s.drift * deg * 4 + (g() - 0.5) * Math.abs(s.drift) * 0.9).toFixed(3);
    });
    row["health"] = +(100 * (1 - deg)).toFixed(1);
    return row;
  });
}

/** RUL trajectory: piecewise-linear target (cap 125) vs prediction. */
export function rulTrajectory(engineId: number, life = 220) {
  const g = rng(engineId * 13);
  return Array.from({ length: life }, (_, c) => {
    const actual = Math.min(125, life - c);
    const pred = Math.max(0, actual + (g() - 0.5) * (8 + actual * 0.1));
    return { cycle: c + 1, actual, predicted: +pred.toFixed(1), lower: +Math.max(0, pred - 10).toFixed(1), upper: +(pred + 10).toFixed(1) };
  });
}

export const trainingCurve = Array.from({ length: 60 }, (_, i) => ({
  epoch: i + 1,
  train: +(55 * Math.exp(-i / 9) + 10.2 + Math.sin(i) * 0.3).toFixed(2),
  val: +(58 * Math.exp(-i / 10) + 12.1 + Math.cos(i) * 0.5).toFixed(2),
}));

export const errorHistogram = (() => {
  const bins: { bin: string; count: number }[] = [];
  for (let b = -40; b < 40; b += 8) {
    bins.push({ bin: `${b}`, count: engines.filter((e) => e.predRul - e.trueRul >= b && e.predRul - e.trueRul < b + 8).length });
  }
  return bins;
})();

export const riskColor: Record<Risk, string> = {
  Healthy: "var(--healthy)",
  Warning: "var(--warning)",
  Critical: "var(--critical)",
};

export const maintenanceAction = (risk: Risk) =>
  risk === "Critical" ? "Ground & inspect immediately" : risk === "Warning" ? "Schedule maintenance window" : "Continue normal operation";
