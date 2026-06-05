/**
 * Phase 1001–1040 — First Customer Deployment Kit: Customer Wizard
 */
import { randomBytes } from "crypto";
import { v4 as uuid } from "uuid";
import { hashPassword } from "../auth/password.js";
import { getDatabase } from "../db/database.js";
import {
  customerUrls,
  getCustomerByCode,
  upsertCustomer,
} from "../customer/customer-store.js";
import type { CustomerPlan, CustomerRow } from "../customer/types.js";
import { logAudit } from "../provisioning/audit-log.js";

export interface CustomerWizardInput {
  customerName: string;
  siteName: string;
  address?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  plan?: CustomerPlan;
  codePrefix?: string;
  customerCode?: string;
}

export interface CustomerWizardResult {
  customer: CustomerRow;
  customerCode: string;
  siteName: string;
  contact: {
    contactName: string | null;
    phone: string | null;
    email: string | null;
  };
  initialPassword: string;
  loginUsername: string;
  urls: ReturnType<typeof customerUrls>;
}

export function generateNextCustomerCode(prefix = "TOMS"): string {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT customer_code FROM customers WHERE customer_code LIKE ? COLLATE NOCASE ORDER BY customer_code`
    )
    .all(`${prefix.toUpperCase()}%`) as { customer_code: string }[];

  let max = 0;
  const re = new RegExp(`^${prefix.toUpperCase()}(\\d+)$`, "i");
  for (const r of rows) {
    const m = r.customer_code.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix.toUpperCase()}${String(max + 1).padStart(3, "0")}`;
}

function generateInitialPassword(): string {
  return `TiSLY-${randomBytes(4).toString("hex")}`;
}

export function createCustomerWizard(input: CustomerWizardInput): CustomerWizardResult {
  const prefix = input.codePrefix ?? "TOMS";
  const customerCode = input.customerCode?.toUpperCase().trim() ?? generateNextCustomerCode(prefix);
  if (getCustomerByCode(customerCode)) {
    throw new Error(`customer code ${customerCode} already exists`);
  }

  const customerId = `cust-${customerCode.toLowerCase()}`;
  const customer = upsertCustomer({
    customerId,
    customerCode,
    customerName: input.customerName,
    plan: input.plan ?? "PRO_REMOTE",
    branding: { companyName: input.customerName, companyColor: "#1a7f37" },
  });

  const db = getDatabase();
  db.prepare(
    `INSERT INTO deployment_customer_contacts
       (customer_id, customer_code, site_name, address, contact_name, phone, email, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(customer_id) DO UPDATE SET
       site_name = excluded.site_name,
       address = excluded.address,
       contact_name = excluded.contact_name,
       phone = excluded.phone,
       email = excluded.email`
  ).run(
    customer.customer_id,
    customerCode,
    input.siteName,
    input.address ?? null,
    input.contactName ?? null,
    input.phone ?? null,
    input.email ?? null
  );

  const initialPassword = generateInitialPassword();
  const loginUsername = `${customerCode.toLowerCase()}.owner`;
  const passwordHash = hashPassword(initialPassword);

  db.prepare(
    `INSERT INTO customer_users (id, customer_id, username, password_hash, role, status)
     VALUES (?, ?, ?, ?, 'owner', 'active')
     ON CONFLICT(customer_id, username) DO UPDATE SET password_hash = excluded.password_hash`
  ).run(`cu-${customerCode}-owner`, customer.customer_id, loginUsername, passwordHash);

  db.prepare(
    `INSERT INTO deployment_checklist (customer_id, customer_code, items_json, deployment_complete, updated_at)
     VALUES (?, ?, ?, 0, datetime('now'))
     ON CONFLICT(customer_id) DO NOTHING`
  ).run(
    customer.customer_id,
    customerCode,
    JSON.stringify({
      power: false,
      lan: false,
      esp: false,
      shelly: false,
      notification: false,
      tv: false,
      pwa: false,
      qr: false,
      maintenance: false,
    })
  );

  logAudit({
    tenantId: customer.tenant_id ?? customer.customer_id,
    action: "deployment.customer.create",
    entityType: "customer",
    entityId: customer.customer_id,
    details: { customerCode, siteName: input.siteName },
  });

  return {
    customer,
    customerCode,
    siteName: input.siteName,
    contact: {
      contactName: input.contactName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
    },
    initialPassword,
    loginUsername,
    urls: customerUrls(customerCode),
  };
}

export function getCustomerContact(customerId: string) {
  return getDatabase()
    .prepare(`SELECT * FROM deployment_customer_contacts WHERE customer_id = ?`)
    .get(customerId) as
    | {
        customer_id: string;
        customer_code: string;
        site_name: string;
        address: string | null;
        contact_name: string | null;
        phone: string | null;
        email: string | null;
      }
    | undefined;
}
