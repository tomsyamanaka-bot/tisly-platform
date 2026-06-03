import type { Response } from "express";
import type { CustomerPlan } from "./types.js";

export type PlanFeature =
  | "pwa"
  | "external_notify"
  | "lan_ops"
  | "basic_log"
  | "notify"
  | "recovery"
  | "ai_basic"
  | "customer_portal"
  | "tv_dashboard"
  | "qnap"
  | "ai_full"
  | "soc_noc"
  | "remote_maintenance"
  | "sales_report";

const PLAN_FEATURES: Record<CustomerPlan, Set<PlanFeature>> = {
  Lite: new Set(["pwa"]),
  Standard: new Set(["pwa", "lan_ops", "basic_log"]),
  PRO: new Set([
    "pwa",
    "lan_ops",
    "basic_log",
    "notify",
    "recovery",
    "ai_basic",
  ]),
  PRO_REMOTE: new Set([
    "pwa",
    "lan_ops",
    "basic_log",
    "notify",
    "recovery",
    "ai_basic",
    "customer_portal",
    "tv_dashboard",
    "qnap",
    "ai_full",
    "soc_noc",
    "remote_maintenance",
    "sales_report",
    "external_notify",
  ]),
};

export function planHasFeature(plan: CustomerPlan, feature: PlanFeature): boolean {
  return PLAN_FEATURES[plan]?.has(feature) ?? false;
}

export function requirePlanFeature(
  plan: CustomerPlan,
  feature: PlanFeature,
  res: Response
): boolean {
  if (planHasFeature(plan, feature)) return true;
  res.status(403).json({
    error: "Plan restriction",
    plan,
    feature,
    hint: "Upgrade plan to access this feature",
  });
  return false;
}

export function listPlanFeatures(plan: CustomerPlan): PlanFeature[] {
  return [...(PLAN_FEATURES[plan] ?? [])];
}
