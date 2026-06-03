import { getDatabase } from "../db/database.js";
import { countProjectsByStatus } from "../business/business-store.js";
import { expandStatusAliases } from "../business/business-status.js";
import type { BusinessProjectStatus } from "../business/business-types.js";

export interface TomsKpiMonth {
  month: string;
  revenue: number;
  grossProfit: number;
  projectCount: number;
}

export interface TomsKpiByCustomer {
  customerId: string;
  customerName: string;
  revenue: number;
  grossProfit: number;
  uninvoiced: number;
  unpaid: number;
  maintenanceCount: number;
  anomalyCount: number;
}

export interface TomsKpiBySite {
  siteName: string;
  address: string;
  projectCount: number;
  revenue: number;
  anomalyCount: number;
}

export interface TomsKpiDashboard {
  revenue: number;
  grossProfit: number;
  projectCount: number;
  uninvoiced: number;
  unpaid: number;
  maintenanceContracts: number;
  maintenanceCases: number;
  anomalyCount: number;
  avgConstructionDays: number;
  estimateApprovalRate: number;
  monthly: TomsKpiMonth[];
  byCustomer: TomsKpiByCustomer[];
  bySite: TomsKpiBySite[];
}

function grossFromTotal(total: number): number {
  return total - Math.round(total * 0.62);
}

export function buildTomsKpi(): TomsKpiDashboard {
  const paidRows = getDatabase()
    .prepare(
      `SELECT p.id, p.customer_id, p.customer_name, p.address, p.paid_date,
              i.total as invoice_total, e.total as estimate_total
       FROM business_projects p
       LEFT JOIN business_invoices i ON i.id = p.invoice_id
       LEFT JOIN business_estimates e ON e.id = p.estimate_id
       WHERE p.status IN ('paid','closed','partial_paid')`
    )
    .all() as Array<{
    id: string;
    customer_id: string;
    customer_name: string;
    address: string;
    paid_date: string | null;
    invoice_total: number | null;
    estimate_total: number | null;
  }>;

  let revenue = 0;
  let costBasis = 0;
  const monthMap = new Map<string, TomsKpiMonth>();
  const customerMap = new Map<string, TomsKpiByCustomer>();
  const siteMap = new Map<string, TomsKpiBySite>();

  for (const row of paidRows) {
    const total = Number(row.invoice_total ?? row.estimate_total ?? 0);
    revenue += total;
    costBasis += Math.round(total * 0.62);
    const month = (row.paid_date ?? "").slice(0, 7) || new Date().toISOString().slice(0, 7);
    const cur = monthMap.get(month) ?? {
      month,
      revenue: 0,
      grossProfit: 0,
      projectCount: 0,
    };
    cur.revenue += total;
    cur.grossProfit += grossFromTotal(total);
    cur.projectCount += 1;
    monthMap.set(month, cur);

    const cid = row.customer_id || "unknown";
    const ccur =
      customerMap.get(cid) ??
      ({
        customerId: cid,
        customerName: row.customer_name,
        revenue: 0,
        grossProfit: 0,
        uninvoiced: 0,
        unpaid: 0,
        maintenanceCount: 0,
        anomalyCount: 0,
      } satisfies TomsKpiByCustomer);
    ccur.revenue += total;
    ccur.grossProfit += grossFromTotal(total);
    customerMap.set(cid, ccur);

    const siteKey = (row.address || row.customer_name).slice(0, 80);
    const scur =
      siteMap.get(siteKey) ??
      ({
        siteName: row.customer_name,
        address: row.address,
        projectCount: 0,
        revenue: 0,
        anomalyCount: 0,
      } satisfies TomsKpiBySite);
    scur.projectCount += 1;
    scur.revenue += total;
    siteMap.set(siteKey, scur);
  }

  const projectCount = (
    getDatabase().prepare(`SELECT COUNT(*) as c FROM business_projects`).get() as { c: number }
  ).c;

  const uninvoiced = countProjectsByStatus(
    expandStatusAliases([
      "construction_done",
      "completion_report_created",
    ]) as BusinessProjectStatus[]
  );

  const unpaid = countProjectsByStatus(
    expandStatusAliases(["invoice_sent", "partial_paid"]) as BusinessProjectStatus[]
  );

  const maintenanceContracts = (
    getDatabase()
      .prepare(
        `SELECT COUNT(DISTINCT customer_code) as c FROM maintenance_cases WHERE status != 'closed'`
      )
      .get() as { c: number }
  ).c;

  const maintenanceCases = (
    getDatabase()
      .prepare(`SELECT COUNT(*) as c FROM toms_project_maintenance WHERE status != 'closed'`)
      .get() as { c: number }
  ).c;

  const staleMs = 15 * 60 * 1000;
  const now = Date.now();
  const devices = getDatabase()
    .prepare(`SELECT customer_id, last_seen FROM devices`)
    .all() as Array<{ customer_id: string; last_seen: string | null }>;
  let anomalyCount = 0;
  const anomalyByCustomer = new Map<string, number>();
  for (const d of devices) {
    const last = d.last_seen ? new Date(d.last_seen).getTime() : 0;
    if (!last || now - last > staleMs) {
      anomalyCount++;
      const cid = d.customer_id || "unknown";
      anomalyByCustomer.set(cid, (anomalyByCustomer.get(cid) ?? 0) + 1);
    }
  }
  for (const [cid, n] of anomalyByCustomer) {
    const c = customerMap.get(cid);
    if (c) c.anomalyCount = n;
  }

  const monthly = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  const constructionRows = getDatabase()
    .prepare(
      `SELECT project_id,
        MIN(CASE WHEN to_state = 'construction' THEN created_at END) as started,
        MIN(CASE WHEN to_state = 'completed' THEN created_at END) as done
       FROM toms_workflow_history
       GROUP BY project_id
       HAVING started IS NOT NULL AND done IS NOT NULL`
    )
    .all() as Array<{ started: string; done: string }>;
  let avgConstructionDays = 0;
  if (constructionRows.length > 0) {
    const totalDays = constructionRows.reduce((sum, r) => {
      const start = new Date(r.started).getTime();
      const end = new Date(r.done).getTime();
      return sum + Math.max(1, Math.round((end - start) / 86400000));
    }, 0);
    avgConstructionDays = Math.round(totalDays / constructionRows.length);
  }

  const estimateSent = (
    getDatabase()
      .prepare(
        `SELECT COUNT(*) as c FROM business_projects WHERE status IN ('estimate_sent','construction_scheduled','construction_done','paid','closed')`
      )
      .get() as { c: number }
  ).c;
  const estimateTotal = (
    getDatabase()
      .prepare(
        `SELECT COUNT(*) as c FROM business_projects WHERE status NOT IN ('draft','survey_scheduled','survey_done')`
      )
      .get() as { c: number }
  ).c;
  const estimateApprovalRate =
    estimateTotal > 0 ? Math.round((estimateSent / estimateTotal) * 100) : 0;

  const byCustomer = [...customerMap.values()].sort((a, b) => b.revenue - a.revenue);
  const bySite = [...siteMap.values()].sort((a, b) => b.revenue - a.revenue);

  return {
    revenue,
    grossProfit: revenue - costBasis,
    projectCount,
    uninvoiced,
    unpaid,
    maintenanceContracts,
    maintenanceCases,
    anomalyCount,
    avgConstructionDays,
    estimateApprovalRate,
    monthly,
    byCustomer,
    bySite,
  };
}

export function buildCustomerKpi(customerId: string, customerName: string): TomsKpiByCustomer {
  const kpi = buildTomsKpi();
  return (
    kpi.byCustomer.find((c) => c.customerId === customerId) ?? {
      customerId,
      customerName,
      revenue: 0,
      grossProfit: 0,
      uninvoiced: 0,
      unpaid: 0,
      maintenanceCount: 0,
      anomalyCount: 0,
    }
  );
}
