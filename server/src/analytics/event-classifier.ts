/** AI Analytics — event classification for risk scoring */

export type EventCategory =
  | "intrusion"
  | "perimeter"
  | "access"
  | "environment"
  | "safety"
  | "connectivity"
  | "recovery"
  | "camera"
  | "other";

export interface ClassifiedEvent {
  eventType: string;
  category: EventCategory;
  isNightTime: boolean;
  isConcurrent: boolean;
  baseRisk: number;
}

const CATEGORY_MAP: Record<string, EventCategory> = {
  intrusion: "intrusion",
  perimeter: "perimeter",
  window_open: "access",
  door_open: "access",
  motion: "access",
  temperature_high: "environment",
  estop: "safety",
  heartbeat: "connectivity",
  heartbeat_alarm: "connectivity",
  heartbeat_warning: "connectivity",
  recovery: "recovery",
  camera_motion: "camera",
};

export function classifyEventCategory(eventType: string): EventCategory {
  return CATEGORY_MAP[eventType] ?? "other";
}

export function isNightHour(date: Date = new Date()): boolean {
  const h = date.getHours();
  return h >= 23 || h < 3;
}

export function classifyEvent(
  eventType: string,
  createdAt?: string,
  concurrentCount = 0
): ClassifiedEvent {
  const category = classifyEventCategory(eventType);
  const at = createdAt ? new Date(createdAt) : new Date();
  const night = isNightHour(at);
  const concurrent = concurrentCount >= 2;
  let baseRisk = 5;
  if (eventType === "window_open") baseRisk = 10;
  else if (eventType === "motion" || eventType === "door_open") baseRisk = 15;
  else if (eventType === "intrusion" && night) baseRisk = 70;
  else if (eventType === "intrusion") baseRisk = 50;
  else if (eventType === "perimeter") baseRisk = 45;
  else if (eventType === "estop") baseRisk = 90;
  else if (eventType === "temperature_high") baseRisk = 25;
  else if (eventType === "heartbeat_alarm") baseRisk = 40;
  if (concurrent) baseRisk = Math.min(100, baseRisk + 25);
  return { eventType, category, isNightTime: night, isConcurrent: concurrent, baseRisk };
}
