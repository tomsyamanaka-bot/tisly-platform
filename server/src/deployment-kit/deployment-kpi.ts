/**
 * Phase 1001–1040 — Deployment KPI metrics
 */
import { getDatabase } from "../db/database.js";

export interface DeploymentKpi {
  customerCount: number;
  siteCount: number;
  deviceCount: number;
  maintenanceCount: number;
  monthlyContractCount: number;
  deploymentCompleteCount: number;
  assetQrCount: number;
  phase: string;
}

export function buildDeploymentKpi(): DeploymentKpi {
  const db = getDatabase();

  const customerCount = (db.prepare(
    `SELECT COUNT(*) as c FROM customers WHERE status = 'active'`
  ).get() as { c: number }).c;

  const siteCount = (db.prepare(
    `SELECT COUNT(*) as c FROM sites WHERE status = 'active' OR status IS NULL`
  ).get() as { c: number }).c;

  const deviceCount = (db.prepare(`SELECT COUNT(*) as c FROM devices`).get() as { c: number }).c;

  const maintenanceCount = (db.prepare(
    `SELECT COUNT(*) as c FROM maintenance_cases`
  ).get() as { c: number }).c;

  const monthlyContractCount = (db.prepare(
    `SELECT COUNT(*) as c FROM customers
     WHERE status = 'active' AND subscription_status IN ('active', 'trialing')`
  ).get() as { c: number }).c;

  let deploymentCompleteCount = 0;
  let assetQrCount = 0;
  try {
    deploymentCompleteCount = (
      db.prepare(`SELECT COUNT(*) as c FROM deployment_checklist WHERE deployment_complete = 1`).get() as {
        c: number;
      }
    ).c;
    assetQrCount = (db.prepare(`SELECT COUNT(*) as c FROM deployment_assets`).get() as { c: number }).c;
  } catch {
    /* tables may not exist yet in old DB */
  }

  return {
    customerCount,
    siteCount,
    deviceCount,
    maintenanceCount,
    monthlyContractCount,
    deploymentCompleteCount,
    assetQrCount,
    phase: "1001-1040",
  };
}
