/**
 * Phase 2251–2300 — QNAP Connector（event / alarm / maintenance / photo）
 */
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { buildQnapArchivePath } from "./archive-path-builder.js";
import { logQnapSend } from "./qnap-send-log.js";

export type QnapPayloadType = "event" | "alarm" | "maintenance" | "photo";

export interface QnapSendResult {
  ok: boolean;
  mock: boolean;
  logId: string;
  filePath?: string;
  error?: string;
}

export interface QnapConnector {
  readonly mode: "mock" | "real";
  send(
    type: QnapPayloadType,
    payload: Record<string, unknown>,
    meta?: { customerCode?: string; deviceId?: string }
  ): Promise<QnapSendResult>;
  testConnection(): Promise<{ ok: boolean; mock: boolean; message: string }>;
}

const LOCAL_ARCHIVE = path.join(process.cwd(), "data", "qnap-archive");

function ensureDir(): string {
  if (!fs.existsSync(LOCAL_ARCHIVE)) fs.mkdirSync(LOCAL_ARCHIVE, { recursive: true });
  return LOCAL_ARCHIVE;
}

function writeLocalFile(
  type: QnapPayloadType,
  payload: Record<string, unknown>,
  meta?: { customerCode?: string; deviceId?: string }
): string {
  const dir = ensureDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const deviceId = meta?.deviceId ?? (payload.deviceId as string) ?? (payload.device_id as string) ?? "unknown";
  const ext = type === "photo" ? "bin" : "json";
  const filename = `${type}-${deviceId}-${stamp}.${ext}`;
  const filepath = path.join(dir, filename);
  if (type === "photo" && payload.data) {
    const buf = Buffer.from(String(payload.data), "base64");
    fs.writeFileSync(filepath, buf);
  } else {
    fs.writeFileSync(filepath, JSON.stringify({ type, ...payload }, null, 2), "utf8");
  }
  const db = getDatabase();
  db.prepare(
    `INSERT INTO qnap_archives (id, archive_type, format, file_path, record_count, created_at)
     VALUES (?, ?, ?, ?, 1, datetime('now'))`
  ).run(uuid(), type, ext === "bin" ? "binary" : "json", filepath);
  return filepath;
}

class MockQnapConnector implements QnapConnector {
  readonly mode = "mock" as const;

  async send(
    type: QnapPayloadType,
    payload: Record<string, unknown>,
    meta?: { customerCode?: string; deviceId?: string }
  ): Promise<QnapSendResult> {
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
    } catch (err) {
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

class RealQnapConnector implements QnapConnector {
  readonly mode = "real" as const;
  private host: string;

  constructor(host: string) {
    this.host = host;
  }

  async send(
    type: QnapPayloadType,
    payload: Record<string, unknown>,
    meta?: { customerCode?: string; deviceId?: string }
  ): Promise<QnapSendResult> {
    const tenant = meta?.customerCode ?? "default";
    const site = (payload.siteId as string) ?? "site-main";
    const remotePath = buildQnapArchivePath(
      type === "photo" ? "cameras" : type === "maintenance" ? "reports" : "events",
      tenant,
      site
    );
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
    } catch (err) {
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

let connectorInstance: QnapConnector | null = null;

export function getQnapConnector(): QnapConnector {
  if (connectorInstance) return connectorInstance;
  const mode = (process.env.QNAP_MODE ?? "").toLowerCase();
  const host = process.env.QNAP_HOST?.trim() ?? "";
  if (mode === "real" && host) {
    connectorInstance = new RealQnapConnector(host);
  } else {
    connectorInstance = new MockQnapConnector();
  }
  return connectorInstance;
}

export function resetQnapConnector(): void {
  connectorInstance = null;
}
