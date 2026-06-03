import { getCustomerByCode } from "../customer/customer-store.js";
import { getCustomerInstallChecklist } from "./install-checklist.js";
import { getDatabase } from "../db/database.js";

export function buildInstallCompletionReportHtml(customerCode: string, actor?: string): string {
  const customer = getCustomerByCode(customerCode);
  if (!customer) throw new Error("Customer not found");

  const checklist = getCustomerInstallChecklist(customer.customer_id);
  const db = getDatabase();
  const devices = db
    .prepare(
      `SELECT device_id, label, device_type, commissioning_status, commissioned_at, commissioned_by, site_id
       FROM devices WHERE customer_id = ? ORDER BY device_type, device_id`
    )
    .all(customer.customer_id) as Array<{
    device_id: string;
    label: string | null;
    device_type: string | null;
    commissioning_status: string | null;
    commissioned_at: string | null;
    commissioned_by: string | null;
    site_id: string | null;
  }>;

  const completedAt = new Date().toISOString();
  const openList = checklist.summary.openItems.map((o) => `<li>${escapeHtml(o)}</li>`).join("");
  const deviceRows = devices
    .map(
      (d) =>
        `<tr><td>${escapeHtml(d.device_id)}</td><td>${escapeHtml(d.label ?? "")}</td><td>${escapeHtml(d.device_type ?? "")}</td><td>${escapeHtml(d.commissioning_status ?? "draft")}</td></tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"/><title>施工完了レポート — ${escapeHtml(customer.customer_name)}</title>
<style>body{font-family:sans-serif;margin:2rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px}</style>
</head><body>
<h1>現場セットアップ完了レポート</h1>
<p><strong>顧客:</strong> ${escapeHtml(customer.customer_name)} (${escapeHtml(customer.customer_code)})</p>
<p><strong>登録機器:</strong> ${devices.length} 台（完了 ${checklist.summary.fullyComplete} / ${checklist.summary.totalDevices}）</p>
<p><strong>完了日時:</strong> ${completedAt}</p>
<p><strong>担当者:</strong> ${escapeHtml(actor ?? "—")}</p>
<h2>チェック結果</h2>
<ul>${openList || "<li>未完了項目なし</li>"}</ul>
<h2>設備一覧</h2>
<table><thead><tr><th>Device ID</th><th>Label</th><th>Type</th><th>Status</th></tr></thead><tbody>${deviceRows}</tbody></table>
<p class="hint">PDF 出力は既存 report 基盤へ接続 TODO</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
