/**
 * お客様ポータル通知 — Push 通知へ流用可能な構造
 */

import { v4 as uuid } from "uuid";
import { getDatabase } from "../../db/database.js";
import { classifyInspectionDeadlineV1 } from "./customer-inspection-v1.js";
import type { PropertyMasterV1 } from "./customer-property-master-v1.js";
import type { CustomerMasterV1 } from "./customer-master-v1.js";
import { buildCustomerDocumentUrlV1, buildCustomerProjectUrlV1 } from "../routes/tisly-routes-v1.js";
import { encodeCustomerShareIdV1 } from "./customer-share-id-v1.js";

export type CustomerNotificationKindV1 =
  | "comm_stop"
  | "alert"
  | "inspection"
  | "new_pdf"
  | "invoice_issued"
  | "estimate_updated";

export type CustomerNotificationSeverityV1 = "info" | "warning" | "danger";

export interface CustomerNotificationV1 {
  id: string;
  kind: CustomerNotificationKindV1;
  severity: CustomerNotificationSeverityV1;
  title: string;
  body: string;
  href?: string;
  propertyId?: string | null;
  projectRef?: string | null;
  createdAt: string;
  readAt?: string | null;
  /** Push ペイロード用 */
  pushPayload: {
    type: CustomerNotificationKindV1;
    customerCode: string;
    propertyId?: string | null;
    projectRef?: string | null;
    href?: string;
  };
}

function rowToNotification(row: Record<string, unknown>): CustomerNotificationV1 {
  let pushPayload: CustomerNotificationV1["pushPayload"] = {
    type: "new_pdf",
    customerCode: String(row.customer_code),
  };
  try {
    if (row.push_payload_json) {
      pushPayload = JSON.parse(String(row.push_payload_json)) as CustomerNotificationV1["pushPayload"];
    }
  } catch {
    /* keep default */
  }
  return {
    id: String(row.id),
    kind: String(row.kind) as CustomerNotificationKindV1,
    severity: String(row.severity) as CustomerNotificationSeverityV1,
    title: String(row.title),
    body: String(row.body),
    href: row.href != null ? String(row.href) : undefined,
    propertyId: row.property_id != null ? String(row.property_id) : null,
    projectRef: row.project_ref != null ? String(row.project_ref) : null,
    createdAt: String(row.created_at),
    readAt: row.read_at != null ? String(row.read_at) : null,
    pushPayload,
  };
}

export function insertCustomerNotificationV1(input: {
  customerCode: string;
  kind: CustomerNotificationKindV1;
  severity: CustomerNotificationSeverityV1;
  title: string;
  body: string;
  href?: string;
  propertyId?: string | null;
  projectRef?: string | null;
  dedupeKey?: string;
}): CustomerNotificationV1 {
  const db = getDatabase();
  if (input.dedupeKey) {
    const existing = db
      .prepare(
        `SELECT id FROM customer_portal_notifications
         WHERE customer_code = ? AND dedupe_key = ? AND read_at IS NULL
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(input.customerCode.toUpperCase(), input.dedupeKey) as { id: string } | undefined;
    if (existing) {
      const row = db
        .prepare(`SELECT * FROM customer_portal_notifications WHERE id = ?`)
        .get(existing.id) as Record<string, unknown>;
      return rowToNotification(row);
    }
  }

  const id = `NTF-${uuid().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  const pushPayload = {
    type: input.kind,
    customerCode: input.customerCode.toUpperCase(),
    propertyId: input.propertyId ?? null,
    projectRef: input.projectRef ?? null,
    href: input.href,
  };
  db.prepare(
    `INSERT INTO customer_portal_notifications
     (id, customer_code, property_id, project_ref, kind, severity, title, body, href, dedupe_key, push_payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.customerCode.toUpperCase(),
    input.propertyId ?? null,
    input.projectRef ?? null,
    input.kind,
    input.severity,
    input.title,
    input.body,
    input.href ?? null,
    input.dedupeKey ?? null,
    JSON.stringify(pushPayload),
    now
  );
  const row = db.prepare(`SELECT * FROM customer_portal_notifications WHERE id = ?`).get(id) as Record<
    string,
    unknown
  >;
  return rowToNotification(row);
}

export function listCustomerNotificationsV1(
  customerCode: string,
  opts?: { limit?: number; unreadOnly?: boolean }
): CustomerNotificationV1[] {
  const limit = opts?.limit ?? 20;
  const code = customerCode.trim().toUpperCase();
  const sql = opts?.unreadOnly
    ? `SELECT * FROM customer_portal_notifications WHERE customer_code = ? AND read_at IS NULL ORDER BY created_at DESC LIMIT ?`
    : `SELECT * FROM customer_portal_notifications WHERE customer_code = ? ORDER BY created_at DESC LIMIT ?`;
  return (getDatabase().prepare(sql).all(code, limit) as Array<Record<string, unknown>>).map(
    rowToNotification
  );
}

export function notifyInspectionDeadlinesV1(
  customerCode: string,
  properties: PropertyMasterV1[]
): void {
  for (const p of properties) {
    const status = classifyInspectionDeadlineV1(p.nextInspectionDate);
    if (status.urgency === "none" || status.urgency === "ok") continue;
    const ref = p.projectRef ?? "";
    const shareId = ref ? encodeCustomerShareIdV1(ref) : "";
    const href = shareId ? `${buildCustomerProjectUrlV1(shareId)}#maintenance` : undefined;
    const severity: CustomerNotificationSeverityV1 =
      status.urgency === "overdue" || status.urgency === "warn7" ? "danger" : "warning";
    insertCustomerNotificationV1({
      customerCode,
      kind: "inspection",
      severity,
      title: status.label,
      body: `${p.propertyName}の点検予定をご確認ください`,
      href,
      propertyId: p.propertyId,
      projectRef: p.projectRef,
      dedupeKey: `inspection:${p.propertyId}:${status.urgency}`,
    });
  }
}

export function notifyPdfSyncedV1(input: {
  customerCode: string;
  propertyId: string | null;
  projectRef: string;
  docType: string;
  label: string;
}): void {
  const shareId = encodeCustomerShareIdV1(input.projectRef);
  const kind: CustomerNotificationKindV1 =
    input.docType === "invoice"
      ? "invoice_issued"
      : input.docType === "estimate"
        ? "estimate_updated"
        : "new_pdf";
  insertCustomerNotificationV1({
    customerCode: input.customerCode,
    kind,
    severity: "info",
    title: `${input.label}が届きました`,
    body: "書類一覧からご確認いただけます",
    href: buildCustomerDocumentUrlV1(shareId, { docType: input.docType }),
    propertyId: input.propertyId,
    projectRef: input.projectRef,
    dedupeKey: `pdf:${input.projectRef}:${input.docType}`,
  });
}

export function buildSyntheticMonitoringNotificationsV1(
  customer: CustomerMasterV1,
  properties: PropertyMasterV1[]
): CustomerNotificationV1[] {
  const items: CustomerNotificationV1[] = [];
  for (const p of properties) {
    const status = classifyInspectionDeadlineV1(p.nextInspectionDate);
    if (status.color === "red" && status.urgency !== "none") {
      const ref = p.projectRef ?? "";
      const shareId = ref ? encodeCustomerShareIdV1(ref) : "";
      items.push({
        id: `syn-inspection-${p.propertyId}`,
        kind: "inspection",
        severity: status.urgency === "overdue" ? "danger" : "warning",
        title: status.label,
        body: p.propertyName,
        href: shareId ? `${buildCustomerProjectUrlV1(shareId)}#maintenance` : undefined,
        propertyId: p.propertyId,
        projectRef: p.projectRef,
        createdAt: new Date().toISOString(),
        pushPayload: {
          type: "inspection",
          customerCode: customer.customerCode,
          propertyId: p.propertyId,
          projectRef: p.projectRef,
        },
      });
    }
  }
  return items;
}
