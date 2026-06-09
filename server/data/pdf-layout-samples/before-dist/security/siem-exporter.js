import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { getPlatformSetting, setPlatformSetting } from "../db/database.js";
import { exportToLoki } from "../siem/loki-exporter.js";
import { exportToElastic } from "../siem/elastic-exporter.js";
import { exportToSyslog } from "../siem/syslog-exporter.js";
const SIEM_DIR = path.join(process.cwd(), "data", "siem");
function ensureSiemDir() {
    fs.mkdirSync(SIEM_DIR, { recursive: true });
}
function writeLocalNdjson(event) {
    ensureSiemDir();
    const line = JSON.stringify(event);
    const file = path.join(SIEM_DIR, `siem-${new Date().toISOString().slice(0, 10)}.ndjson`);
    fs.appendFileSync(file, line + "\n");
}
async function dispatchExternal(event) {
    const provider = config.siem.provider;
    if (provider === "none")
        return;
    try {
        if (provider === "loki" && config.siem.lokiUrl) {
            await exportToLoki(event, config.siem.lokiUrl);
        }
        else if (provider === "elastic" && config.siem.elasticUrl) {
            await exportToElastic(event, config.siem.elasticUrl, config.siem.elasticIndex);
        }
        else if (provider === "syslog") {
            await exportToSyslog(event, config.siem.syslogHost, config.siem.syslogPort);
        }
    }
    catch (e) {
        console.warn("[siem] external export failed:", e);
    }
}
export function exportSiemEvent(event) {
    if (!config.security.siemExportEnabled)
        return;
    writeLocalNdjson(event);
    void dispatchExternal(event);
    const prev = getPlatformSetting("security:siem-export") ?? { count: 0 };
    setPlatformSetting("security:siem-export", {
        count: prev.count + 1,
        lastAt: event.timestamp,
        lastAction: event.action,
        provider: config.siem.provider,
    });
}
export function getSiemExportStatus() {
    const meta = getPlatformSetting("security:siem-export");
    return {
        enabled: config.security.siemExportEnabled,
        exportCount: meta?.count ?? 0,
        lastAt: meta?.lastAt ?? null,
        provider: config.siem.provider,
    };
}
export function siemFromAudit(opts) {
    exportSiemEvent({
        timestamp: new Date().toISOString(),
        tenant_id: opts.tenantId ?? null,
        site_id: opts.siteId ?? null,
        user_id: opts.userId ?? null,
        action: opts.action,
        severity: opts.severity ?? "info",
        source_ip: opts.sourceIp ?? null,
        device_id: opts.deviceId ?? null,
        event_id: opts.eventId ?? null,
        message: opts.message,
    });
}
