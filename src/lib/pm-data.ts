// Shared, pure helpers. All numbers shown in the UI come from the backend API (see lib/api.ts).
export type Risk = "Healthy" | "Warning" | "Critical";

export const riskOf = (rul: number): Risk => (rul > 80 ? "Healthy" : rul > 30 ? "Warning" : "Critical");

export const riskColor: Record<Risk, string> = {
  Healthy: "var(--healthy)",
  Warning: "var(--warning)",
  Critical: "var(--critical)",
};

export const maintenanceAction = (risk: Risk) =>
  risk === "Critical" ? "Ground & inspect immediately" : risk === "Warning" ? "Schedule maintenance window" : "Continue normal operation";
