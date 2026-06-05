/**
 * Phase 1001–1040 — First Customer handover package (PDF/HTML)
 */
import { config } from "../config.js";
import { getCustomerByCode, listDevicesForCustomer, customerUrls } from "../customer/customer-store.js";
import { getCustomerContact } from "./customer-wizard.js";
import { listDeploymentAssets } from "./qr-management.js";
import { getCustomerMaintenanceSummary } from "./maintenance-ticket.js";
import { getDatabase } from "../db/database.js";

export interface CustomerPackageData {
  customerCode: string;
  customerName: string;
  loginUrl: string;
  loginUsername: string;
  initialPasswordNote: string;
  devices: Array<{ deviceId: string; label: string; kind: string }>;
  qrList: Array<{ assetId: string; deviceId: string; label: string; detailUrl: string }>;
  maintenanceContact: { phone: string; email: string; hours: string };
  generatedAt: string;
}

export function buildCustomerPackageData(customerCode: string): CustomerPackageData | null {
  const customer = getCustomerByCode(customerCode);
  if (!customer) return null;

  const contact = getCustomerContact(customer.customer_id);
  const urls = customerUrls(customerCode);
  const devices = listDevicesForCustomer(customer.customer_id);
  const assets = listDeploymentAssets(customerCode);
  const maint = getCustomerMaintenanceSummary(customerCode);

  const ownerUser = getDatabase()
    .prepare(
      `SELECT username FROM customer_users WHERE customer_id = ? AND role = 'owner' LIMIT 1`
    )
    .get(customer.customer_id) as { username: string } | undefined;

  return {
    customerCode: customer.customer_code,
    customerName: customer.customer_name,
    loginUrl: `${config.publicUrl}${urls.customer}`,
    loginUsername: ownerUser?.username ?? `${customerCode.toLowerCase()}.owner`,
    initialPasswordNote: "初回パスワードは顧客登録時に発行済み。再発行は管理画面から。",
    devices: devices.map((d) => ({
      deviceId: d.deviceId,
      label: d.label ?? d.deviceId,
      kind: d.deviceType,
    })),
    qrList: assets.map((a) => ({
      assetId: a.assetId,
      deviceId: a.deviceId,
      label: a.label,
      detailUrl: `${config.publicUrl}/asset/${a.assetId}`,
    })),
    maintenanceContact: maint?.maintenanceContact ?? {
      phone: contact?.phone ?? "03-0000-0000",
      email: contact?.email ?? "maintenance@tisly.jp",
      hours: "平日 9:00–18:00",
    },
    generatedAt: new Date().toISOString(),
  };
}

export function buildCustomerPackageHtml(customerCode: string): string {
  const data = buildCustomerPackageData(customerCode);
  if (!data) return "<html><body>Customer not found</body></html>";

  const deviceRows = data.devices
    .map(
      (d) =>
        `<tr><td>${escapeHtml(d.deviceId)}</td><td>${escapeHtml(d.label)}</td><td>${escapeHtml(d.kind)}</td></tr>`
    )
    .join("");

  const qrRows = data.qrList
    .map(
      (q) =>
        `<tr><td>${escapeHtml(q.assetId)}</td><td>${escapeHtml(q.deviceId)}</td><td>${escapeHtml(q.label)}</td><td><a href="${escapeHtml(q.detailUrl)}">QR詳細</a></td></tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8"/>
  <title>TiSLY 顧客引渡し資料 — ${escapeHtml(data.customerCode)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; color: #1f2328; }
    h1 { color: #1a7f37; border-bottom: 2px solid #1a7f37; padding-bottom: 0.5rem; }
    h2 { margin-top: 2rem; color: #0969da; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { border: 1px solid #d0d7de; padding: 0.5rem; text-align: left; }
    th { background: #f6f8fa; }
    .box { background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
    .footer { margin-top: 3rem; font-size: 0.85rem; color: #57606a; }
  </style>
</head>
<body>
  <h1>TiSLY 顧客引渡し資料</h1>
  <p><strong>顧客:</strong> ${escapeHtml(data.customerName)} (${escapeHtml(data.customerCode)})</p>
  <p><strong>発行日:</strong> ${escapeHtml(data.generatedAt.slice(0, 10))}</p>

  <h2>ログイン情報</h2>
  <div class="box">
    <p><strong>ログインURL:</strong> <a href="${escapeHtml(data.loginUrl)}">${escapeHtml(data.loginUrl)}</a></p>
    <p><strong>ユーザー名:</strong> ${escapeHtml(data.loginUsername)}</p>
    <p><strong>初期パスワード:</strong> ${escapeHtml(data.initialPasswordNote)}</p>
  </div>

  <h2>設備一覧</h2>
  <table>
    <thead><tr><th>設備ID</th><th>名称</th><th>種類</th></tr></thead>
    <tbody>${deviceRows || "<tr><td colspan='3'>設備なし</td></tr>"}</tbody>
  </table>

  <h2>QR一覧</h2>
  <table>
    <thead><tr><th>資産ID</th><th>設備ID</th><th>名称</th><th>リンク</th></tr></thead>
    <tbody>${qrRows || "<tr><td colspan='4'>QR未登録</td></tr>"}</tbody>
  </table>

  <h2>保守連絡先</h2>
  <div class="box">
    <p><strong>電話:</strong> ${escapeHtml(data.maintenanceContact.phone)}</p>
    <p><strong>メール:</strong> ${escapeHtml(data.maintenanceContact.email)}</p>
    <p><strong>受付時間:</strong> ${escapeHtml(data.maintenanceContact.hours)}</p>
  </div>

  <p class="footer">TiSLY Platform — First Customer Deployment Kit (Phase 1001–1040)</p>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildCustomerPackagePdfBuffer(customerCode: string): Buffer {
  const html = buildCustomerPackageHtml(customerCode);
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000);
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${text.length + 50}>>stream
BT /F1 10 Tf 50 750 Td (${text.slice(0, 500).replace(/[()\\]/g, "")}) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
trailer<</Size 6/Root 1 0 R>>
startxref
0
%%EOF`;
  return Buffer.from(pdf);
}
