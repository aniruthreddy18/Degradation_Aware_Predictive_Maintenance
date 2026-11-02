import { queryOptions, useQuery } from "@tanstack/react-query";
import type { Risk } from "@/lib/pm-data";

/** Base URL of the FastAPI backend. Empty = same origin (reverse proxy / Vite dev proxy on /api). */
const BASE = ((import.meta.env["VITE_API_URL"] as string | undefined) ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

// ---- types -----------------------------------------------------------------------------------
export interface Metrics { rmse: number; mae: number; score: number; r2: number }
export interface Engine {
  id: number; cycles: number; trueRul: number; trueRulCapped: number; predRul: number;
  lower: number; upper: number; health: number; risk: Risk; action: string;
}
export interface Fleet {
  summary: { total: number; healthy: number; warning: number; critical: number; avgRul: number };
  metrics: Metrics;
  engines: Engine[];
}
export interface TrajectoryPoint { cycle: number; actual: number; predicted: number; lower: number; upper: number }
export interface EngineDetail { engine: Engine; trajectory: TrajectoryPoint[]; sensors: Record<string, number[]> }
export interface SensorInfo {
  key: string; symbol: string; name: string; unit: string; kept: boolean; std: number; mean: number; corrRul: number; trend: "up" | "down";
}
export interface Served {
  id: string; seed: number; val_rmse: number; metrics: Metrics; metrics_uncapped: Metrics;
  coverage: number; interval_width: number; interval_k: number; level: number;
}
export interface Protocol {
  train_engines: number; val_engines: number; n_runs: number; seeds: number[]; splitter: string;
  scaler: string; test: string; trained_at: string; data: string;
}
export interface ModelInfo {
  served: Served;
  curve: { epoch: number; train: number; val: number; lr: number }[];
  errorHistogram: { bin: string; count: number }[];
  config: Record<string, string | number>;
  protocol: Protocol;
  scatter: { trueRul: number; predRul: number }[];
}
export interface VariantRow {
  variant: string; arch: string; feature_set: string; capped: boolean; n_seeds: number; n_params: number; n_channels: number;
  rmse: number; rmse_std: number; mae: number; mae_std: number; score: number; score_std: number; r2: number; r2_std: number;
  rmse_uncapped: number; val_rmse: number; epochs: number; rmse_runs: number[];
}
export interface Research {
  variants: Record<string, VariantRow>;
  paired: { a: string; b: string; n: number; mean_diff: number; t: number; p: number }[];
  protocol: Protocol;
  served: Served;
}
export interface Explain {
  method: string; baseline_val_rmse: number;
  sensors: { sensor: string; key: string; value: number }[];
  groups: { group: string; value: number }[];
  time: { step: string; weight: number }[];
}
export interface PredictResult {
  rul: number; lower: number; upper: number; std: number; health: number; risk: Risk; action: string;
  out_of_range_sensors: string[]; model: string; cycles_received: number; window_used: number;
}
export interface Health { status: string; model: string; engines: number; trained_at: string }

// ---- queries ---------------------------------------------------------------------------------
const stale = 5 * 60_000;
export const fleetQuery = queryOptions({ queryKey: ["fleet"], queryFn: () => request<Fleet>("/api/fleet"), staleTime: stale });
export const engineQuery = (id: number) =>
  queryOptions({ queryKey: ["engine", id], queryFn: () => request<EngineDetail>(`/api/engines/${id}`), staleTime: stale });
export const sensorsQuery = queryOptions({ queryKey: ["sensors"], queryFn: () => request<SensorInfo[]>("/api/sensors"), staleTime: stale });
export const modelQuery = queryOptions({ queryKey: ["model"], queryFn: () => request<ModelInfo>("/api/model"), staleTime: stale });
export const researchQuery = queryOptions({ queryKey: ["research"], queryFn: () => request<Research>("/api/research"), staleTime: stale });
export const explainQuery = queryOptions({ queryKey: ["explain"], queryFn: () => request<Explain>("/api/explain"), staleTime: stale });
export const healthQuery = queryOptions({ queryKey: ["health"], queryFn: () => request<Health>("/api/health"), refetchInterval: 30_000, retry: false });

export const useFleet = () => useQuery(fleetQuery);
export const useEngine = (id: number) => useQuery(engineQuery(id));
export const useSensors = () => useQuery(sensorsQuery);
export const useModel = () => useQuery(modelQuery);
export const useResearch = () => useQuery(researchQuery);
export const useExplain = () => useQuery(explainQuery);
export const useHealth = () => useQuery(healthQuery);

export function predictRul(readings: Record<string, number>[], apiKey?: string) {
  return request<PredictResult>("/api/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(apiKey ? { "X-API-Key": apiKey } : {}) },
    body: JSON.stringify({ readings }),
  });
}
