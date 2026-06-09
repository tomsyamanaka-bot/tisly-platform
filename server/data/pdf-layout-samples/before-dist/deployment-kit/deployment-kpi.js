/**
 * Phase 1001–1040 — Deployment KPI metrics
 */
import { getDatabase } from "../db/database.js";
export function buildDeploymentKpi() {
    const db = getDatabase();
    const customerCount = db.prepare(`SELECT COUNT(*) as c FROM customers WHERE status = 'active'`).get().c;
    const siteCount = db.prepare(`SELECT COUNT(*) as c FROM sites WHERE status = 'active' OR status IS NULL`).get().c;
    const deviceCount = db.prepare(`SELECT COUNT(*) as c FROM devices`).get().c;
    const maintenanceCount = db.prepare(`SELECT COUNT(*) as c FROM maintenance_cases`).get().c;
    const monthlyContractCount = db.prepare(`SELECT COUNT(*) as c FROM customers
     WHERE status = 'active' AND subscription_status IN ('active', 'trialing')`).get().c;
    let deploymentCompleteCount = 0;
    let assetQrCount = 0;
    try {
        deploymentCompleteCount = db.prepare(`SELECT COUNT(*) as c FROM deployment_checklist WHERE deployment_complete = 1`).get().c;
        assetQrCount = db.prepare(`SELECT COUNT(*) as c FROM deployment_assets`).get().c;
    }
    catch {
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
