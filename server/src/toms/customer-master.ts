import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { listBusinessProjects, listCustomers } from "../business/business-store.js";
import type { BusinessProject } from "../business/business-types.js";

export interface CustomerMasterRecord {
  id: string;
  businessCustomerId: string | null;
  name: string;
  company: string;
  address: string;
  phone: string;
  email: string;
  sites: Array<{ name: string; address: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerMasterDetail extends CustomerMasterRecord {
  projects: BusinessProject[];
  constructionHistory: BusinessProject[];
  invoiceHistory: Array<{ projectId: string; invoiceNo: string; total: number }>;
  paymentHistory: Array<{ projectId: string; amount: number; date: string }>;
  maintenanceHistory: unknown[];
}

function parseSites(raw: string): Array<{ name: string; address: string }> {
  try {
    return JSON.parse(raw) as Array<{ name: string; address: string }>;
  } catch {
    return [];
  }
}

function rowToCustomer(r: Record<string, unknown>): CustomerMasterRecord {
  return {
    id: String(r.id),
    businessCustomerId: r.business_customer_id != null ? String(r.business_customer_id) : null,
    name: String(r.name),
    company: String(r.company ?? ""),
    address: String(r.address ?? ""),
    phone: String(r.phone ?? ""),
    email: String(r.email ?? ""),
    sites: parseSites(String(r.sites_json ?? "[]")),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function syncCustomerMasterFromBusiness(): number {
  const existing = new Set(
    (
      getDatabase()
        .prepare(`SELECT business_customer_id FROM toms_customer_master WHERE business_customer_id IS NOT NULL`)
        .all() as Array<{ business_customer_id: string }>
    ).map((r) => r.business_customer_id)
  );
  let added = 0;
  for (const c of listCustomers()) {
    if (existing.has(c.id)) continue;
    const id = `CM-${uuid().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    const sites = [{ name: c.name, address: c.address ?? "" }];
    getDatabase()
      .prepare(
        `INSERT INTO toms_customer_master
         (id, business_customer_id, name, company, address, phone, email, sites_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        c.id,
        c.name,
        c.type === "company" ? c.name : "",
        c.address ?? "",
        c.phone ?? "",
        c.email ?? "",
        JSON.stringify(sites),
        now,
        now
      );
    added++;
  }
  return added;
}

export function listCustomerMaster(): CustomerMasterRecord[] {
  syncCustomerMasterFromBusiness();
  const rows = getDatabase()
    .prepare(`SELECT * FROM toms_customer_master ORDER BY name ASC`)
    .all() as Array<Record<string, unknown>>;
  return rows.map(rowToCustomer);
}

export function getCustomerMaster(id: string): CustomerMasterDetail | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM toms_customer_master WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const base = rowToCustomer(row);
  const bizId = base.businessCustomerId;
  const projects = listBusinessProjects().filter(
    (p) => p.customerId === bizId || p.customerName === base.name
  );
  const invoiceHistory: CustomerMasterDetail["invoiceHistory"] = [];
  const paymentHistory: CustomerMasterDetail["paymentHistory"] = [];
  for (const p of projects) {
    if (p.invoiceId) {
      const inv = getDatabase()
        .prepare(`SELECT invoice_no, total FROM business_invoices WHERE id = ?`)
        .get(p.invoiceId) as { invoice_no: string; total: number } | undefined;
      if (inv) {
        invoiceHistory.push({
          projectId: p.id,
          invoiceNo: inv.invoice_no,
          total: inv.total,
        });
      }
    }
    const pays = getDatabase()
      .prepare(`SELECT amount, payment_date FROM business_payments WHERE project_id = ?`)
      .all(p.id) as Array<{ amount: number; payment_date: string }>;
    for (const pay of pays) {
      paymentHistory.push({
        projectId: p.id,
        amount: pay.amount,
        date: pay.payment_date,
      });
    }
  }

  const maint = getDatabase()
    .prepare(
      `SELECT * FROM maintenance_cases WHERE customer_code LIKE ? OR site_name LIKE ? ORDER BY updated_at DESC LIMIT 30`
    )
    .all(`%${base.name.slice(0, 4)}%`, `%${base.name}%`) as unknown[];

  return {
    ...base,
    projects,
    constructionHistory: projects.filter((p) =>
      ["construction_scheduled", "construction_done", "paid", "closed"].includes(p.status)
    ),
    invoiceHistory,
    paymentHistory,
    maintenanceHistory: maint,
  };
}

export function upsertCustomerMaster(input: {
  name: string;
  company?: string;
  address?: string;
  phone?: string;
  email?: string;
  sites?: Array<{ name: string; address: string }>;
}): CustomerMasterRecord {
  const id = `CM-${uuid().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO toms_customer_master
       (id, business_customer_id, name, company, address, phone, email, sites_json, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.name,
      input.company ?? "",
      input.address ?? "",
      input.phone ?? "",
      input.email ?? "",
      JSON.stringify(input.sites ?? []),
      now,
      now
    );
  return getCustomerMaster(id)!;
}
