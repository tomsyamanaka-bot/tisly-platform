/**
 * お客様連絡ボタン設定 — 電話 / メール / 問い合わせフォーム ON/OFF
 */

import { getDatabase } from "../../db/database.js";
import { buildCustomerContactTelHrefV1 } from "./customer-project-actions-v1.js";
import type { CustomerContactV1 } from "./customer-view-model-v1.js";

export interface CustomerContactSettingsV1 {
  customerCode: string;
  phoneEnabled: boolean;
  emailEnabled: boolean;
  formEnabled: boolean;
  formUrl: string;
}

export interface CustomerContactActionV1 {
  id: "phone" | "email" | "form";
  emoji: string;
  label: string;
  href: string;
}

const DEFAULT_FORM_URL = "https://toms.co.jp/contact";

function rowToSettings(row: Record<string, unknown>): CustomerContactSettingsV1 {
  return {
    customerCode: String(row.customer_code),
    phoneEnabled: Number(row.phone_enabled ?? 1) === 1,
    emailEnabled: Number(row.email_enabled ?? 1) === 1,
    formEnabled: Number(row.form_enabled ?? 1) === 1,
    formUrl: String(row.form_url ?? DEFAULT_FORM_URL),
  };
}

export function getCustomerContactSettingsV1(customerCode: string): CustomerContactSettingsV1 {
  const code = String(customerCode ?? "").trim().toUpperCase();
  const row = getDatabase()
    .prepare(`SELECT * FROM customer_contact_settings WHERE customer_code = ? COLLATE NOCASE`)
    .get(code) as Record<string, unknown> | undefined;
  if (row) return rowToSettings(row);
  return {
    customerCode: code,
    phoneEnabled: true,
    emailEnabled: true,
    formEnabled: true,
    formUrl: DEFAULT_FORM_URL,
  };
}

export function upsertCustomerContactSettingsV1(
  settings: CustomerContactSettingsV1
): CustomerContactSettingsV1 {
  const now = new Date().toISOString();
  const code = settings.customerCode.trim().toUpperCase();
  getDatabase()
    .prepare(
      `INSERT INTO customer_contact_settings
       (customer_code, phone_enabled, email_enabled, form_enabled, form_url, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(customer_code) DO UPDATE SET
         phone_enabled = excluded.phone_enabled,
         email_enabled = excluded.email_enabled,
         form_enabled = excluded.form_enabled,
         form_url = excluded.form_url,
         updated_at = excluded.updated_at`
    )
    .run(
      code,
      settings.phoneEnabled ? 1 : 0,
      settings.emailEnabled ? 1 : 0,
      settings.formEnabled ? 1 : 0,
      settings.formUrl || DEFAULT_FORM_URL,
      now
    );
  return getCustomerContactSettingsV1(code);
}

export function buildCustomerContactActionsV1(
  contact: CustomerContactV1,
  settings: CustomerContactSettingsV1
): CustomerContactActionV1[] {
  const actions: CustomerContactActionV1[] = [];
  const telHref = buildCustomerContactTelHrefV1(contact);
  const email = String(contact.email ?? "").trim();
  const mailHref = email ? `mailto:${email}?subject=${encodeURIComponent("TiSLY お問い合わせ")}` : "";

  if (settings.phoneEnabled && telHref) {
    actions.push({ id: "phone", emoji: "📞", label: "電話", href: telHref });
  }
  if (settings.emailEnabled && mailHref) {
    actions.push({ id: "email", emoji: "✉️", label: "メール", href: mailHref });
  }
  if (settings.formEnabled && settings.formUrl) {
    actions.push({
      id: "form",
      emoji: "📝",
      label: "問い合わせフォーム",
      href: settings.formUrl,
    });
  }
  return actions;
}
