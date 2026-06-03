import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getCustomerByCode, listSitesForCustomer } from "../customer/customer-store.js";
import { buildReportHtml, type BuiltReport } from "./report-builder.js";

export function buildCustomerWeeklyReport(
  customerCode: string,
  generatedBy: string
): BuiltReport | null {
  const customer = getCustomerByCode(customerCode);
  if (!customer) return null;

  const sites = listSitesForCustomer(customer.customer_id);
  const primarySite = sites[0]?.site_id ?? null;
  const exportId = `rpt-w-${customer.customer_code}-${Date.now()}-${uuid().slice(0, 8)}`;
  const generatedAt = new Date().toISOString();
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 86400_000);

  const tid = customer.tenant_id ?? customer.customer_id;
  let eventCount = 0;
  let alarmCount = 0;
  try {
    eventCount = (
      getDatabase()
        .prepare(
          `SELECT COUNT(*) as c FROM events
           WHERE (tenant_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?))
             AND created_at >= datetime('now', '-7 days')`
        )
        .get(tid, customer.customer_id) as { c: number }
    ).c;
    alarmCount = (
      getDatabase()
        .prepare(
          `SELECT COUNT(*) as c FROM events
           WHERE (tenant_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?))
             AND severity IN ('critical','alarm','warning')
             AND created_at >= datetime('now', '-7 days')`
        )
        .get(tid, customer.customer_id) as { c: number }
    ).c;
  } catch {
    eventCount = 0;
    alarmCount = 0;
  }

  const meta = {
    exportId,
    customerId: customer.customer_id,
    customerCode: customer.customer_code,
    customerName: customer.customer_name,
    siteId: primarySite,
    generatedBy,
    generatedAt,
    format: "html" as const,
    status: "generated" as const,
    reportType: "weekly" as const,
  };

  const period = { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  const sections = [
    {
      title: "週次サマリー",
      items: [
        { label: "期間", value: `${period.from} — ${period.to}` },
        { label: "イベント", value: eventCount },
        { label: "警報・警告", value: alarmCount },
        { label: "現場数", value: sites.length },
      ],
    },
  ];

  const html = buildReportHtml(meta, sections);
  return { meta, period, sections, html, pdfTodo: "Puppeteer PDF generation TODO" };
}
