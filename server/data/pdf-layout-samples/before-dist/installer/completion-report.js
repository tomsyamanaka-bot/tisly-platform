import { v4 as uuid } from "uuid";
import { getCustomerByCode } from "../customer/customer-store.js";
import { getCustomerInstallChecklist } from "./install-checklist.js";
import { getDatabase } from "../db/database.js";
import { listInstallPhotos } from "./install-photos.js";
import { getDeviceCertStatus } from "../provisioning/device-csr.js";
export function buildCompletionReportMeta(customerCode, actor, opts) {
    const customer = getCustomerByCode(customerCode);
    if (!customer)
        throw new Error("Customer not found");
    const db = getDatabase();
    const photoCount = db
        .prepare(`SELECT COUNT(*) as c FROM install_photos WHERE customer_id = ?`)
        .get(customer.customer_id).c;
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
const REPORT_I18N = {
    ja: {
        reportTitle: "現場セットアップ完了レポート",
        title: "現場セットアップ完了レポート",
        customer: "顧客",
        site: "現場名",
        devices: "登録機器",
        completedAt: "完了日時",
        installer: "施工担当者",
        openItems: "未完了項目",
        checklist: "チェックリスト",
        deviceList: "設備一覧",
        warnings: "未完了警告",
        photos: "施工写真",
        mqttRtt: "MQTT RTT 結果",
        certs: "証明書状態",
        provHistory: "QR / NFC 登録履歴",
        noOpen: "未完了項目なし",
        noPhotos: "写真なし",
        noHistory: "履歴なし",
        dryRun: "DRY RUN — デモ用レポート（DB未更新）",
    },
    en: {
        reportTitle: "Field Installation Completion Report",
        title: "Field Installation Completion Report",
        customer: "Customer",
        site: "Site",
        devices: "Registered devices",
        completedAt: "Completed at",
        installer: "Installer",
        openItems: "Open items",
        checklist: "Checklist",
        deviceList: "Device list",
        warnings: "Warnings",
        photos: "Install photos",
        mqttRtt: "MQTT RTT results",
        certs: "Certificate status",
        provHistory: "QR / NFC provisioning history",
        noOpen: "No open items",
        noPhotos: "No photos",
        noHistory: "No history",
        dryRun: "DRY RUN — demo report (DB not updated)",
    },
};
export function buildInstallCompletionReportHtml(customerCode, actor, opts) {
    const locale = opts?.locale === "en" ? "en" : "ja";
    const L = REPORT_I18N[locale];
    const customer = getCustomerByCode(customerCode);
    if (!customer)
        throw new Error("Customer not found");
    const meta = buildCompletionReportMeta(customerCode, actor, opts);
    const checklist = getCustomerInstallChecklist(customer.customer_id);
    const db = getDatabase();
    const devices = db
        .prepare(`SELECT device_id, label, device_type, commissioning_status, commissioned_at, commissioned_by, site_id,
              cert_status, trust_level
       FROM devices WHERE customer_id = ? ORDER BY device_type, device_id`)
        .all(customer.customer_id);
    const siteRow = meta.siteName
        ? null
        : db
            .prepare(`SELECT name FROM sites WHERE customer_id = ? LIMIT 1`)
            .get(customer.customer_id);
    const siteName = meta.siteName ?? siteRow?.name ?? "—";
    const openList = checklist.summary.openItems.map((o) => `<li>${escapeHtml(o)}</li>`).join("");
    const photos = listInstallPhotos(customer.customer_id);
    const photoList = photos
        .map((p) => `<li>${escapeHtml(p.photoPath)} — ${escapeHtml(p.deviceId ?? "site")} (${escapeHtml(p.photoType)})</li>`)
        .join("");
    const provisionLogs = db
        .prepare(`SELECT action, entity_id, created_at FROM audit_logs
       WHERE tenant_id = ? AND action IN ('installer.qr.claim','installer.nfc.claim')
       ORDER BY created_at DESC LIMIT 20`)
        .all(customer.tenant_id ?? customer.customer_id);
    const provList = provisionLogs
        .map((l) => `<li>${escapeHtml(l.action)} — ${escapeHtml(l.entity_id ?? "")} @ ${escapeHtml(l.created_at)}</li>`)
        .join("");
    const rttRows = devices
        .map((d) => {
        let tests = {};
        const row = db
            .prepare(`SELECT last_test_result FROM devices WHERE device_id = ? AND customer_id = ?`)
            .get(d.device_id, customer.customer_id);
        if (row?.last_test_result) {
            try {
                tests = JSON.parse(row.last_test_result);
            }
            catch {
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
        }
        catch {
            return `<tr><td>${escapeHtml(d.device_id)}</td><td colspan="3">—</td></tr>`;
        }
    })
        .join("");
    const warnings = [];
    if (checklist.summary.openItems.length) {
        warnings.push(locale === "en"
            ? `${checklist.summary.openItems.length} open checklist item(s)`
            : `${checklist.summary.openItems.length} 件の未完了チェック項目`);
    }
    if (devices.some((d) => !d.commissioning_status || d.commissioning_status === "draft")) {
        warnings.push(locale === "en" ? "Devices still in draft / untested" : "未テスト / draft の設備があります");
    }
    const warnHtml = warnings.length
        ? `<ul>${warnings.map((w) => `<li class="open">${escapeHtml(w)}</li>`).join("")}</ul>`
        : `<p>${locale === "en" ? "No warnings" : "未完了警告なし"}</p>`;
    const deviceRows = devices
        .map((d) => `<tr><td>${escapeHtml(d.device_id)}</td><td>${escapeHtml(d.label ?? "")}</td><td>${escapeHtml(d.device_type ?? "")}</td><td>${escapeHtml(d.commissioning_status ?? "draft")}</td><td>${escapeHtml(d.cert_status ?? "none")}</td></tr>`)
        .join("");
    const checklistDevices = checklist.devices
        .map((dev) => {
        const items = dev.items
            .map((i) => `<li class="${i.completed ? "done" : "open"}">${escapeHtml(i.label)} ${i.completed ? "✓" : "—"}</li>`)
            .join("");
        return `<h3>${escapeHtml(dev.deviceId)}</h3><ul>${items}</ul>`;
    })
        .join("");
    const dryBanner = meta.dryRun ? `<div class="dry-run">${escapeHtml(L.dryRun)}</div>` : "";
    const completeLabel = locale === "en"
        ? `complete ${checklist.summary.fullyComplete} / ${checklist.summary.totalDevices}`
        : `完了 ${checklist.summary.fullyComplete} / ${checklist.summary.totalDevices}`;
    return `<!DOCTYPE html>
<html lang="${locale}"><head><meta charset="utf-8"/><title>${escapeHtml(L.title)} — ${escapeHtml(customer.customer_name)}</title>
<style>
body{font-family:sans-serif;margin:2rem}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px}
.dry-run{background:#fef3c7;border:2px solid #f59e0b;padding:12px;font-weight:bold;margin-bottom:1rem}
.hint{color:#666;font-size:0.9rem}
.done{color:green}.open{color:#b45309}
</style>
</head><body>
${dryBanner}
<h1>${escapeHtml(L.reportTitle)}</h1>
<p><strong>${escapeHtml(L.customer)}:</strong> ${escapeHtml(customer.customer_name)} (${escapeHtml(customer.customer_code)})</p>
<p><strong>${escapeHtml(L.site)}:</strong> ${escapeHtml(siteName)}</p>
<p><strong>${escapeHtml(L.devices)}:</strong> ${devices.length} (${completeLabel})</p>
<p><strong>${escapeHtml(L.completedAt)}:</strong> ${meta.generatedAt}</p>
<p><strong>${escapeHtml(L.installer)}:</strong> ${escapeHtml(meta.actor ?? "—")}</p>
<p><strong>export_id:</strong> ${escapeHtml(meta.exportId)}</p>
<h2>${escapeHtml(L.openItems)}</h2>
<ul>${openList || `<li>${escapeHtml(L.noOpen)}</li>`}</ul>
<h2>${escapeHtml(L.checklist)}</h2>
${checklistDevices || "<p>—</p>"}
<h2>${escapeHtml(L.deviceList)}</h2>
<table><thead><tr><th>Device ID</th><th>Label</th><th>Type</th><th>Status</th><th>Cert</th></tr></thead><tbody>${deviceRows}</tbody></table>
<h2>${escapeHtml(L.warnings)}</h2>
${warnHtml}
<h2>${escapeHtml(L.photos)} (${photos.length})</h2>
<ul>${photoList || `<li>${escapeHtml(L.noPhotos)}</li>`}</ul>
<h2>${escapeHtml(L.mqttRtt)}</h2>
<table><thead><tr><th>Device</th><th>RTT ms</th><th>Tested at</th></tr></thead><tbody>${rttRows}</tbody></table>
<h2>${escapeHtml(L.certs)}</h2>
<table><thead><tr><th>Device</th><th>Status</th><th>CSR</th><th>Cert</th></tr></thead><tbody>${certRows}</tbody></table>
<h2>${escapeHtml(L.provHistory)}</h2>
<ul>${provList || `<li>${escapeHtml(L.noHistory)}</li>`}</ul>
<p class="hint">PDF: ${locale === "en" ? "HTML fallback when Puppeteer unavailable" : "Puppeteer 未インストール時は HTML フォールバック"}</p>
</body></html>`;
}
export async function buildInstallCompletionReportPdf(html) {
    try {
        const { createRequire } = await import("module");
        const req = createRequire(import.meta.url);
        const puppeteer = req("puppeteer");
        const api = puppeteer.default ?? puppeteer;
        if (!api?.launch)
            return null;
        const browser = await api.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });
        const pdf = await page.pdf({ format: "A4", printBackground: true });
        await browser.close();
        return Buffer.from(pdf);
    }
    catch {
        return null;
    }
}
function escapeHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
