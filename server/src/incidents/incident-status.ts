export type IncidentStatus =
  | "open"
  | "acknowledged"
  | "escalated"
  | "resolved"
  | "closed";

export type IncidentSeverity = "info" | "warning" | "alarm" | "critical";

export const OPEN_INCIDENT_STATUSES: IncidentStatus[] = ["open", "acknowledged", "escalated"];

export function isOpenStatus(status: string): boolean {
  return OPEN_INCIDENT_STATUSES.includes(status as IncidentStatus);
}

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  if (from === to) return true;
  if (from === "closed" || from === "resolved") return false;
  if (to === "closed" || to === "resolved") return true;
  if (to === "escalated") return from === "open" || from === "acknowledged";
  if (to === "acknowledged") return from === "open";
  return true;
}
