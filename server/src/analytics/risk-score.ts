import type { ClassifiedEvent } from "./event-classifier.js";
import { classifyEvent } from "./event-classifier.js";

export type AiAlertPriority = "info" | "warning" | "alarm" | "critical";

export interface RiskScoreResult {
  score: number;
  priority: AiAlertPriority;
  factors: string[];
}

export function scoreToPriority(score: number): AiAlertPriority {
  if (score >= 80) return "critical";
  if (score >= 55) return "alarm";
  if (score >= 25) return "warning";
  return "info";
}

export function computeRiskScore(
  eventType: string,
  opts?: {
    createdAt?: string;
    concurrentCount?: number;
    siteAnomalyCount24h?: number;
  }
): RiskScoreResult {
  const classified = classifyEvent(
    eventType,
    opts?.createdAt,
    opts?.concurrentCount ?? 0
  );
  const factors: string[] = [];
  let score = classified.baseRisk;

  if (classified.isNightTime) {
    score = Math.min(100, score + 15);
    factors.push("深夜帯");
  }
  if (classified.isConcurrent) {
    score = Math.min(100, 95);
    factors.push("複数同時");
  }
  if ((opts?.siteAnomalyCount24h ?? 0) >= 5) {
    score = Math.min(100, score + 10);
    factors.push("24h内異常多発");
  }
  if (classified.category === "perimeter") factors.push("外周センサー");
  if (classified.category === "safety") factors.push("安全系");

  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score,
    priority: scoreToPriority(score),
    factors,
  };
}

export function mergeClassifiedRisk(c: ClassifiedEvent): RiskScoreResult {
  return computeRiskScore(c.eventType, {
    concurrentCount: c.isConcurrent ? 2 : 0,
  });
}
