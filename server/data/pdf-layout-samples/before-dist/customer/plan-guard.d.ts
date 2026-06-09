import type { Response } from "express";
import type { CustomerPlan } from "./types.js";
export type PlanFeature = "pwa" | "external_notify" | "lan_ops" | "basic_log" | "notify" | "recovery" | "ai_basic" | "customer_portal" | "tv_dashboard" | "qnap" | "ai_full" | "soc_noc" | "remote_maintenance" | "sales_report";
export declare function planHasFeature(plan: CustomerPlan, feature: PlanFeature): boolean;
export declare function requirePlanFeature(plan: CustomerPlan, feature: PlanFeature, res: Response): boolean;
export declare function listPlanFeatures(plan: CustomerPlan): PlanFeature[];
