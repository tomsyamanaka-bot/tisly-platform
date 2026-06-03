import { v4 as uuid } from "uuid";
import { getCustomerByCode } from "../customer/customer-store.js";
import { getCustomerInstallChecklist } from "./install-checklist.js";
import { getDatabase } from "../db/database.js";
import { listInstallPhotos } from "./install-photos.js";
import { getDeviceCertStatus } from "../provisioning/device-csr.js";

export interface CompletionReportMeta {
  exportId: string;
  customerCode: string;
  customerName: string;
  siteName: string | null;
  actor: string | null;
  generatedAt: string;
  dryRun: boolean;
  photoCount: number;
}

export function buildCompletionReportMeta(
  customerCode: string,
  actor?: string,
  opts?: { dryRun?: boolean; siteName?: string | null }
): CompletionReportMeta {
  const customer = getCustomerByCode(customerCode);
  if (!customer) throw new Error("Customer not found");
  const db = getDatabase();
  const photoCount = (
    db
      .prepare(`SELECT COUNT(*) as c FROM install_photos WHERE customer_id = ?`)
      .get(customer.customer_id) as { c: number }
  ).c;

  return {
    exportId: `rpt-${uuid().slice(0, 8)}`,
    customerCode: customer.customer_code,
    customerName: customer.customer_name,
    siteName: opts?.siteName ?? null,
    actor: actor ?? null,
    generatedAt: new Date().toISOString(),
    dryRun: opts?.dryRun ?? false,
    photoCount,
  };
}

export function buildInstallCompletionReportHtml(
  customerCode: string,
  actor?: string,
  opts?: { dryRun?: boolean; siteName?: string | null }
): string {
  const customer = getCustomerByCode(customerCode);
  if (!customer) throw new Error("Customer not found");

  const meta = buildCompletionReportMeta(customerCode, actor, opts);
  const checklist = getCustomerInstallChecklist(customer.customer_id);
  const db = getDatabase();
  const devices = db
    .prepare(
      `SELECT device_id, label, device_type, commissioning_status, commissioned_at, commissioned_by, site_id,
              cert_status, trust_level
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
    cert_status: string | null;
    trust_level: string | null;
  }>;

  const siteRow = meta.siteName
    ? null
    : (db
        .prepare(`SELECT name FROM sites WHERE customer_id = ? LIMIT 1`)
        .get(customer.customer_id) as { name: string } | undefined);
  const siteName = meta.siteName ?? siteRow?.name ?? "—";

  const openList = checklist.summary.openItems.map((o) => `<li>${escapeHtml(o)}</li>`).join("");
  const photos = listInstallPhotos(customer.customer_id);
  const photoList = photos
    .map(
      (p) =>
        `<li>${escapeHtml(p.photoPath)} — ${escapeHtml(p.deviceId ?? "site")} (${escapeHtml(p.photoType)})</li>`
    )
    .join("");

  const provisionLogs = db
    .prepare(
      `SELECT action, entity_id, created_at FROM audit_logs
       WHERE tenant_id = ? AND action IN ('installer.qr.claim','installer.nfc.claim')
       ORDER BY created_at DESC LIMIT 20`
    )
    .all(customer.tenant_id ?? customer.customer_id) as Array<{
    action: string;
    entity_id: string | null;
    created_at: string;
  }>;
  const provList = provisionLogs
    .map((l) => `<li>${escapeHtml(l.action)} — ${escapeHtml(l.entity_id ?? "")} @ ${escapeHtml(l.created_at)}</li>`)
    .join("");

  const rttRows = devices
    .map((d) => {
      let tests: Record<string, unknown> = {};
      const row = db
        .prepare(`SELECT last_test_result FROM devices WHERE device_id = ? AND customer_id = ?`)
        .get(d.device_id, customer.customer_id) as { last_test_result: string | null } | undefined;
      if (row?.last_test_result) {
        try {
          tests = JSON.parse(row.last_test_result) as Record<string, unknown>;
        } catch {
          /* */
        }
      }
      const ms = tests.mqttRttMs ?? "—";
      const mock = tests.mqttRttMock ? " (mock)" : "";
      return `<tr><td>${escapeHtml(d.device_id)}</td><td>${escapeHtml(String(ms))}${mock}</td><td>${escapeHtml(String(tests.mqttRttAt ?? "—"))}</td></tr>`;
    })
    .join("");

  const certRows = devices
    .map((d) => {
      try {
        const st = getDeviceCertStatus(customer.customer_id, d.device_id);
        return `<tr><td>${escapeHtml(d.device_id)}</td><td>${escapeHtml(st.certStatus)}</td><td>${st.csrRegistered ? "CSR✓" : "—"}</td><td>${st.certIssued ? "issued" : "—"}</td></tr>`;
      } catch {
        return `<tr><td>${escapeHtml(d.device_id)}</td><td colspan="3">—</td></tr>`;
      }
    })
    .join("");

  const warnings: string[] = [];
  if (checklist.summary.openItems.length) {
    warnings.push(`${checklist.summary.openItems.length} 件の未完了チェック項目`);
  }
  if (devices.some((d) => !d.commissioning_status || d.commissioning_status === "draft")) {
    warnings.push("未テスト / draft の設備があります");
  }
  const warnHtml = warnings.length
    ? `<ul>${warnings.map((w) => `<li class="open">${escapeHtml(w)}</li>`).join("")}</ul>`
    : "<p>未完了警告なし</p>";

  const deviceRows = devices
    .map(
      (d) =>
        `<tr><td>${escapeHtml(d.device_id)}</td><td>${escapeHtml(d.label ?? "")}</td><td>${escapeHtml(d.device_type ?? "")}</td><td>${escapeHtml(d.commissioning_status ?? "draft")}</td><td>${escapeHtml(d.cert_status ?? "none")}</td></tr>`
    )
    .join("");

  const checklistDevices = checklist.devices
    .map((dev) => {
      const items = dev.items
        .map(
          (i) =>
            `<li class="${i.completed ? "done" : "open"}">${escapeHtml(i.label)} ${i.completed ? "✓" : "—"}</li>`
        )
        .join("");
      return `<h3>${escapeHtml(dev.deviceId)}</h3><ul>${items}</ul>`;
    })
    .join("");

  const dryBanner = meta.dryRun
    ? `<div class="dry-run">DRY RUN — デモ用レポート（DB未更新）</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"/><title>施工完了レポート — ${escapeHtml(customer.customer_name)}</title>
<style>
body{font-family:sans-serif;margin:2rem}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px}
.dry-run{background:#fef3c7;border:2px solid #f59e0b;padding:12px;font-weight:bold;margin-bottom:1rem}
.hint{color:#666;font-size:0.9rem}
.done{color:green}.open{color:#b45309}
</style>
</head><body>
${dryBanner}
<h1>現場セットアップ完了レポート</h1>
<p><strong>顧客:</strong> ${escapeHtml(customer.customer_name)} (${escapeHtml(customer.customer_code)})</p>
<p><strong>現場名:</strong> ${escapeHtml(siteName)}</p>
<p><strong>登録機器:</strong> ${devices.length} 台（完了 ${checklist.summary.fullyComplete} / ${checklist.summary.totalDevices}）</p>
<p><strong>完了日時:</strong> ${meta.generatedAt}</p>
<p><strong>施工担当者:</strong> ${escapeHtml(meta.actor ?? "—")}</p>
<p><strong>export_id:</strong> ${escapeHtml(meta.exportId)}</p>
<h2>未完了項目</h2>
<ul>${openList || "<li>未完了項目なし</li>"}</ul>
<h2>チェックリスト</h2>
${checklistDevices || "<p>—</p>"}
<h2>設備一覧</h2>
<table><thead><tr><th>Device ID</th><th>Label</th><th>Type</th><th>Status</th><th>Cert</th></tr></thead><tbody>${deviceRows}</tbody></table>
<h2>未完了警告</h2>
${warnHtml}
<h2>施工写真（${photos.length} 件）</h2>
<ul>${photoList || "<li>写真なし</li>"}</ul>
<h2>MQTT RTT 結果</h2>
<table><thead><tr><th>Device</th><th>RTT ms</th><th>Tested at</th></tr></thead><tbody>${rttRows}</tbody></table>
<h2>証明書状態</h2>
<table><thead><tr><th>Device</th><th>Status</th><th>CSR</th><th>Cert</th></tr></thead><tbody>${certRows}</tbody></table>
<h2>QR / NFC 登録履歴</h2>
<ul>${provList || "<li>履歴なし</li>"}</ul>
<p class="hint">PDF: Puppeteer 未インストール時は HTML フォールバック</p>
</body></html>`;
}

export async function buildInstallCompletionReportPdf(html: string): Promise<Buffer | null> {
  try {
    const { createRequire } = await import("module");
    const req = createRequire(import.meta.url);
    const puppeteer = req("puppeteer") as {
      default?: {
        launch: (opts: object) => Promise<{
          newPage: () => Promise<{
            setContent: (h: string, o: object) => Promise<void>;
            pdf: (o: object) => Promise<Uint8Array>;
          }>;
          close: () => Promise<void>;
        }>;
      };
      launch?: (opts: object) => Promise<{
        newPage: () => Promise<{
          setContent: (h: string, o: object) => Promise<void>;
          pdf: (o: object) => Promise<Uint8Array>;
        }>;
        close: () => Promise<void>;
      }>;
    };
    const api = puppeteer.default ?? puppeteer;
    if (!api?.launch) return null;
    const browser = await api.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();
    return Buffer.from(pdf);
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
