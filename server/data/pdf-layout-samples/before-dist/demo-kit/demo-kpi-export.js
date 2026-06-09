import { buildTomsKpi } from "../toms/toms-kpi.js";
function csvEscape(v) {
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}
/** 異常1件あたりの出動コスト想定（円）— デモ用 */
const DISPATCH_COST_PER_ANOMALY = 28000;
export function estimateDispatchReductionJpy(anomalyCount) {
    return Math.round(anomalyCount * 0.65 * DISPATCH_COST_PER_ANOMALY);
}
export function exportDemoKpiCsv() {
    const k = buildTomsKpi();
    const dispatchSave = estimateDispatchReductionJpy(k.anomalyCount);
    const lines = [
        "# TiSLY 営業デモ KPI",
        `generated_at,${csvEscape(new Date().toISOString())}`,
        "",
        "metric,value,label_ja",
        `revenue,${k.revenue},売上`,
        `gross_profit,${k.grossProfit},粗利`,
        `project_count,${k.projectCount},案件数`,
        `unpaid,${k.unpaid},未入金`,
        `maintenance_cases,${k.maintenanceCases},保守件数`,
        `anomaly_count,${k.anomalyCount},異常件数`,
        `dispatch_reduction_estimate,${dispatchSave},出動削減見込み`,
    ];
    return lines.join("\n") + "\n";
}
