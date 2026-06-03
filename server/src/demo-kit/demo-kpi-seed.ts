import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import {
  createEstimate,
  createInvoiceFromEstimate,
  getBusinessProject,
  updateBusinessProject,
} from "../business/business-store.js";
import { generateQnapProjectPath } from "../business/services/qnapService.js";
import type { BusinessProject, EstimateLineItem } from "../business/business-types.js";
import { DEMO_PACK_CUSTOMERS } from "./demo-customer-pack.js";

export const DEMO_KPI_PREFIX = "BIZ-DEMO-";

const SKIP = { skipTransitionCheck: true } as const;

function lineItem(
  name: string,
  quantity: number,
  unit: string,
  unitPrice: number,
  costPrice: number
): EstimateLineItem {
  return {
    id: uuid(),
    category: "other",
    name,
    unit,
    quantity,
    unitPrice,
    amount: quantity * unitPrice,
    costPrice,
  };
}

const LINE_ITEMS: EstimateLineItem[] = [
  lineItem("セキュリティ工事一式", 1, "式", 480000, 290000),
  lineItem("ESP32 センサー", 4, "台", 18000, 9000),
  lineItem("年間保守", 1, "式", 96000, 36000),
];

function paidDateForMonth(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - (offset % 6));
  d.setDate(15);
  return d.toISOString().slice(0, 10);
}

function insertDemoProject(input: {
  id: string;
  projectNo: string;
  customerId: string;
  customerName: string;
  title: string;
  address: string;
  status: string;
  paidDate?: string | null;
}): void {
  const now = new Date().toISOString();
  const stub = {
    id: input.id,
    projectNo: input.projectNo,
    customerId: input.customerId,
    customerName: input.customerName,
    title: input.title,
    address: input.address,
    status: input.status,
    createdAt: now,
  };
  const qnapBasePath = generateQnapProjectPath(stub as BusinessProject);
  getDatabase()
    .prepare(
      `INSERT OR IGNORE INTO business_projects (
        id, project_no, customer_id, customer_name, title, address, phone, status,
        survey_schedule_json, survey_memo, survey_photos_json, estimate_id,
        construction_schedule_json, required_materials, construction_memo, construction_photos_json,
        completion_report_id, invoice_id, payment_due_date, paid_date, qnap_base_path,
        survey_project_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, '', ?, NULL, 'デモ KPI', '[]', NULL,
        NULL, '', '', '[]', NULL, NULL, NULL, ?, ?, NULL, datetime('now'), datetime('now'))`
    )
    .run(
      input.id,
      input.projectNo,
      input.customerId,
      input.customerName,
      input.title,
      input.address,
      input.status,
      input.paidDate ?? null,
      qnapBasePath
    );
}

function bootstrapPaidProject(projectId: string, paidDate: string): void {
  updateBusinessProject(projectId, { status: "survey_done" }, SKIP);
  const estimate = createEstimate(projectId, LINE_ITEMS, { fromAi: true });
  updateBusinessProject(projectId, { estimateId: estimate.id }, SKIP);
  updateBusinessProject(projectId, { status: "estimate_sent" }, SKIP);
  updateBusinessProject(projectId, { status: "construction_done" }, SKIP);
  createInvoiceFromEstimate(projectId, paidDate);
  updateBusinessProject(projectId, { status: "paid", paidDate }, SKIP);
}

export function seedDemoKpiProjects(): { projects: number } {
  const db = getDatabase();
  let created = 0;

  for (let i = 0; i < DEMO_PACK_CUSTOMERS.length; i++) {
    const c = DEMO_PACK_CUSTOMERS[i];
    const bcId = `BCU-DEMO-${c.customerCode}`;
    db.prepare(
      `INSERT OR IGNORE INTO business_customers (
        id, name, type, contact_name, phone, email, address, pricing_tier_id,
        payment_terms, invoice_closing_day, created_at, updated_at
      ) VALUES (?, ?, 'corporate', ?, '03-0000-0000', ?, ?, NULL, '月末締め翌月末払い', 31, datetime('now'), datetime('now'))`
    ).run(bcId, c.customerName, c.customerName, `demo@${c.customerCode.toLowerCase()}.local`, c.address);

    const projectId = `${DEMO_KPI_PREFIX}${c.customerCode}`;
    if (getBusinessProject(projectId)) continue;

    insertDemoProject({
      id: projectId,
      projectNo: `DEMO-${c.customerCode}`,
      customerId: bcId,
      customerName: c.customerName,
      title: `${c.customerName} セキュリティ導入`,
      address: c.address,
      status: "new",
      paidDate: null,
    });
    bootstrapPaidProject(projectId, paidDateForMonth(i));
    created += 1;
  }

  const unpaidId = `${DEMO_KPI_PREFIX}UNPAID`;
  if (!getBusinessProject(unpaidId)) {
    const bcId = `BCU-DEMO-TOMS001`;
    insertDemoProject({
      id: unpaidId,
      projectNo: "DEMO-UNPAID",
      customerId: bcId,
      customerName: DEMO_PACK_CUSTOMERS[0].customerName,
      title: "未入金デモ案件",
      address: DEMO_PACK_CUSTOMERS[0].address,
      status: "invoice_sent",
    });
    updateBusinessProject(unpaidId, { status: "survey_done" }, SKIP);
    const estimate = createEstimate(unpaidId, LINE_ITEMS);
    updateBusinessProject(unpaidId, { estimateId: estimate.id }, SKIP);
    updateBusinessProject(unpaidId, { status: "estimate_sent" }, SKIP);
    updateBusinessProject(unpaidId, { status: "construction_done" }, SKIP);
    createInvoiceFromEstimate(unpaidId);
    created += 1;
  }

  return { projects: created };
}

export function clearDemoKpiProjects(): void {
  const db = getDatabase();
  const rows = db
    .prepare(`SELECT id, estimate_id, invoice_id FROM business_projects WHERE id LIKE ?`)
    .all(`${DEMO_KPI_PREFIX}%`) as Array<{
    id: string;
    estimate_id: string | null;
    invoice_id: string | null;
  }>;
  for (const r of rows) {
    if (r.estimate_id) db.prepare(`DELETE FROM business_estimates WHERE id = ?`).run(r.estimate_id);
    if (r.invoice_id) db.prepare(`DELETE FROM business_invoices WHERE id = ?`).run(r.invoice_id);
    db.prepare(`DELETE FROM business_project_timeline WHERE project_id = ?`).run(r.id);
    db.prepare(`DELETE FROM business_projects WHERE id = ?`).run(r.id);
  }
  for (const c of DEMO_PACK_CUSTOMERS) {
    db.prepare(`DELETE FROM business_customers WHERE id = ?`).run(`BCU-DEMO-${c.customerCode}`);
  }
}
