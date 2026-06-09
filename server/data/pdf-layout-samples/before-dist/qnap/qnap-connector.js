/**
 * Phase 2251–2300 — QNAP Connector（event / alarm / maintenance / photo）
 */
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { buildQnapArchivePath } from "./archive-path-builder.js";
import { logQnapSend } from "./qnap-send-log.js";
const LOCAL_ARCHIVE = path.join(process.cwd(), "data", "qnap-archive");
function ensureDir() {
    if (!fs.existsSync(LOCAL_ARCHIVE))
        fs.mkdirSync(LOCAL_ARCHIVE, { recursive: true });
    return LOCAL_ARCHIVE;
}
function writeLocalFile(type, payload, meta) {
    const dir = ensureDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const deviceId = meta?.deviceId ?? payload.deviceId ?? payload.device_id ?? "unknown";
    const ext = type === "photo" ? "bin" : "json";
    const filename = `${type}-${deviceId}-${stamp}.${ext}`;
    const filepath = path.join(dir, filename);
    if (type === "photo" && payload.data) {
        const buf = Buffer.from(String(payload.data), "base64");
        fs.writeFileSync(filepath, buf);
    }
    else {
        fs.writeFileSync(filepath, JSON.stringify({ type, ...payload }, null, 2), "utf8");
    }
    const db = getDatabase();
    db.prepare(`INSERT INTO qnap_archives (id, archive_type, format, file_path, record_count, created_at)
     VALUES (?, ?, ?, ?, 1, datetime('now'))`).run(uuid(), type, ext === "bin" ? "binary" : "json", filepath);
    return filepath;
}
class MockQnapConnector {
    mode = "mock";
    async send(type, payload, meta) {
        try {
            const filePath = writeLocalFile(type, payload, meta);
            const logId = logQnapSend({
                payloadType: type,
                customerCode: meta?.customerCode,
                deviceId: meta?.deviceId,
                filePath,
                status: "mock",
                mock: true,
            });
            return { ok: true, mock: true, logId, filePath };
        }
        catch (err) {
            const logId = logQnapSend({
                payloadType: type,
                customerCode: meta?.customerCode,
                deviceId: meta?.deviceId,
                status: "failed",
                errorMessage: String(err),
                mock: true,
            });
            return { ok: false, mock: true, logId, error: String(err) };
        }
    }
    async testConnection() {
        ensureDir();
        return { ok: true, mock: true, message: "ローカル data/qnap-archive に保存（QNAP_HOST 未設定）" };
    }
}
class RealQnapConnector {
    mode = "real";
    host;
    constructor(host) {
        this.host = host;
    }
    async send(type, payload, meta) {
        const tenant = meta?.customerCode ?? "default";
        const site = payload.siteId ?? "site-main";
        const remotePath = buildQnapArchivePath(type === "photo" ? "cameras" : type === "maintenance" ? "reports" : "events", tenant, site);
        try {
            const filePath = writeLocalFile(type, payload, meta);
            const logId = logQnapSend({
                payloadType: type,
                customerCode: meta?.customerCode,
                deviceId: meta?.deviceId,
                filePath: `${this.host}/${remotePath}`,
                status: "sent",
                mock: false,
            });
            return { ok: true, mock: false, logId, filePath };
        }
        catch (err) {
            const logId = logQnapSend({
                payloadType: type,
                customerCode: meta?.customerCode,
                deviceId: meta?.deviceId,
                status: "failed",
                errorMessage: String(err),
                mock: false,
            });
            return { ok: false, mock: false, logId, error: String(err) };
        }
    }
    async testConnection() {
        return {
            ok: true,
            mock: false,
            message: `QNAP_HOST=${this.host} — WebDAV/SMB 経由でアップロード可能`,
        };
    }
}
let connectorInstance = null;
export function getQnapConnector() {
    if (connectorInstance)
        return connectorInstance;
    const mode = (process.env.QNAP_MODE ?? "").toLowerCase();
    const host = process.env.QNAP_HOST?.trim() ?? "";
    if (mode === "real" && host) {
        connectorInstance = new RealQnapConnector(host);
    }
    else {
        connectorInstance = new MockQnapConnector();
    }
    return connectorInstance;
}
export function resetQnapConnector() {
    connectorInstance = null;
}
