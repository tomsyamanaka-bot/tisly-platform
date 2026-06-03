import { buildTomsKpi, type TomsKpiByCustomer } from "./toms-kpi.js";

function csvEscape(v: string | number): string {
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function customerRow(c: TomsKpiByCustomer): string {
  return [
    c.customerId,
    c.customerName,
    c.revenue,
    c.grossProfit,
    c.uninvoiced,
    c.unpaid,
    c.maintenanceCount,
    c.anomalyCount,
  ]
    .map(csvEscape)
    .join(",");
}

const CUSTOMER_HEADER =
  "customer_id,customer_name,revenue,gross_profit,uninvoiced,unpaid,maintenance_count,anomaly_count";

export function exportTomsKpiCsv(): string {
  const k = buildTomsKpi();
  const lines = [
    "# TiSLY KPI Export",
    `generated_at,${csvEscape(new Date().toISOString())}`,
    "",
    "summary_metric,value",
    `revenue,${k.revenue}`,
    `gross_profit,${k.grossProfit}`,
    `uninvoiced,${k.uninvoiced}`,
    `unpaid,${k.unpaid}`,
    `maintenance_cases,${k.maintenanceCases}`,
    `anomaly_count,${k.anomalyCount}`,
    "",
    CUSTOMER_HEADER,
    ...(k.byCustomer || []).map(customerRow),
  ];
  return lines.join("\n") + "\n";
}

export function exportCustomerKpiCsv(customerId: string): string | null {
  const k = buildTomsKpi();
  const row = (k.byCustomer || []).find((c) => c.customerId === customerId);
  if (!row) return null;
  return [CUSTOMER_HEADER, customerRow(row)].join("\n") + "\n";
}
