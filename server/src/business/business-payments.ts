import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import {
  getBusinessProject,
  getEstimate,
  getInvoice,
  listBusinessProjects,
} from "./business-store.js";

export interface BusinessPayment {
  id: string;
  projectId: string;
  invoiceId: string | null;
  amount: number;
  paymentDate: string;
  method: string;
  memo: string;
  createdAt: string;
}

function rowToPayment(r: Record<string, unknown>): BusinessPayment {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    invoiceId: r.invoice_id != null ? String(r.invoice_id) : null,
    amount: Number(r.amount),
    paymentDate: String(r.payment_date),
    method: String(r.method ?? ""),
    memo: String(r.memo ?? ""),
    createdAt: String(r.created_at),
  };
}

export function createBusinessPayment(input: {
  projectId: string;
  invoiceId?: string | null;
  amount: number;
  paymentDate: string;
  method?: string;
  memo?: string;
}): BusinessPayment {
  const project = getBusinessProject(input.projectId);
  if (!project) throw new Error("project not found");
  const id = `BPY-${uuid().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO business_payments (
        id, project_id, invoice_id, amount, payment_date, method, memo, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.projectId,
      input.invoiceId ?? project.invoiceId ?? null,
      input.amount,
      input.paymentDate,
      input.method ?? "bank_transfer",
      input.memo ?? "",
      now
    );
  return rowToPayment(
    getDatabase()
      .prepare(`SELECT * FROM business_payments WHERE id = ?`)
      .get(id) as Record<string, unknown>
  );
}

export function listBusinessPayments(opts?: { projectId?: string }): BusinessPayment[] {
  if (opts?.projectId) {
    return getDatabase()
      .prepare(
        `SELECT * FROM business_payments WHERE project_id = ? ORDER BY payment_date DESC`
      )
      .all(opts.projectId)
      .map((r) => rowToPayment(r as Record<string, unknown>));
  }
  return getDatabase()
    .prepare(`SELECT * FROM business_payments ORDER BY payment_date DESC LIMIT 500`)
    .all()
    .map((r) => rowToPayment(r as Record<string, unknown>));
}

export interface AccountingCsvRow {
  customerName: string;
  projectTitle: string;
  invoiceDate: string;
  paymentDate: string;
  subtotalExTax: number;
  tax: number;
  totalInTax: number;
  paidAmount: number;
  status: string;
}

function csvEscape(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildAccountingExportCsv(): string {
  const header = [
    "顧客名",
    "案件名",
    "請求日",
    "入金日",
    "税抜",
    "消費税",
    "税込",
    "入金額",
    "状態",
  ];
  const rows: string[] = [header.join(",")];
  const payments = listBusinessPayments();
  const payByProject = new Map<string, BusinessPayment[]>();
  for (const p of payments) {
    const list = payByProject.get(p.projectId) ?? [];
    list.push(p);
    payByProject.set(p.projectId, list);
  }
  for (const project of listBusinessProjects()) {
    if (!project.invoiceId) continue;
    const inv = getInvoice(project.invoiceId);
    if (!inv) continue;
    const pays = payByProject.get(project.id) ?? [];
    const paidAmount = pays.reduce((s, p) => s + p.amount, 0);
    const lastPay = pays[0];
    const est = project.estimateId ? getEstimate(project.estimateId) : null;
    const row: AccountingCsvRow = {
      customerName: project.customerName,
      projectTitle: project.title,
      invoiceDate: inv.createdAt?.slice(0, 10) ?? "",
      paymentDate: lastPay?.paymentDate ?? project.paidDate ?? "",
      subtotalExTax: inv.subtotal,
      tax: inv.tax,
      totalInTax: inv.total,
      paidAmount,
      status: project.status,
    };
    rows.push(
      [
        row.customerName,
        row.projectTitle,
        row.invoiceDate,
        row.paymentDate,
        row.subtotalExTax,
        row.tax,
        row.totalInTax,
        row.paidAmount,
        row.status,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return rows.join("\n");
}
