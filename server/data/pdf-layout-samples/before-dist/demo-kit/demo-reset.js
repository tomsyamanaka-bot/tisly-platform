import { getDatabase } from "../db/database.js";
import { clearDemoPackSurveyUploads, DEMO_PACK_CUSTOMERS, ensureDemoCustomerPack, } from "./demo-customer-pack.js";
import { clearDemoTimeline, seedDemoTimeline30Days } from "./demo-timeline-generator.js";
import { clearDemoFloorMaps, ensureDemoFloorMapsForAllCustomers } from "./demo-floor-maps.js";
import { clearDemoKpiProjects, seedDemoKpiProjects } from "./demo-kpi-seed.js";
import { markDemoResetScheduleRan } from "./demo-reset-schedule.js";
function runDemoKitSeed() {
    const customers = ensureDemoCustomerPack();
    const kpi = seedDemoKpiProjects();
    const timeline = seedDemoTimeline30Days();
    const floorMaps = ensureDemoFloorMapsForAllCustomers();
    return {
        ok: true,
        customers,
        timeline,
        floorMaps,
        kpi,
        at: new Date().toISOString(),
    };
}
export function clearDemoKitData() {
    const db = getDatabase();
    clearDemoTimeline();
    clearDemoFloorMaps();
    clearDemoKpiProjects();
    clearDemoPackSurveyUploads();
    for (const c of DEMO_PACK_CUSTOMERS) {
        db.prepare(`DELETE FROM survey_ai_estimates WHERE project_id IN (
      SELECT project_id FROM survey_projects WHERE customer_code = ?
    )`).run(c.customerCode);
        db.prepare(`DELETE FROM survey_photos WHERE project_id IN (
      SELECT project_id FROM survey_projects WHERE customer_code = ?
    )`).run(c.customerCode);
        db.prepare(`DELETE FROM survey_drawings WHERE project_id IN (
      SELECT project_id FROM survey_projects WHERE customer_code = ?
    )`).run(c.customerCode);
        db.prepare(`DELETE FROM survey_projects WHERE customer_code = ?`).run(c.customerCode);
        db.prepare(`DELETE FROM notification_logs WHERE device_id LIKE ?`).run(`${c.customerCode}-%`);
        db.prepare(`DELETE FROM device_timeline WHERE customer_id = ? AND (actor = 'demo-kit' OR title LIKE '%デモ%')`).run(c.customerId);
    }
}
/** デモデータを削除して再生成（営業前ワンクリックリセット） */
export function resetDemoKit() {
    clearDemoKitData();
    const result = runDemoKitSeed();
    markDemoResetScheduleRan();
    return result;
}
/** 起動時 idempotent シード（フルリセットは POST /api/demo-kit/reset のみ） */
export function ensureDemoKit() {
    return runDemoKitSeed();
}
