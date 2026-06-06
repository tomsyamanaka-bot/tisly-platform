/**
 * Phase 1461–1500 — 本番統合監査（/api/deploy/audit）
 */

import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../config.js";
import { getDatabase } from "../db/database.js";
import { getDbProvider } from "../db/db-provider.js";
import { PostgresProvider } from "../db/postgres-provider.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..", "..");

export type AuditItemStatus = "pass" | "fail" | "warn";

export interface ProductionAuditItem {
  id: string;
  label: string;
  status: AuditItemStatus;
  message: string;
}

export interface ProductionAuditReport {
  generatedAt: string;
  ready: boolean;
  readyLabel: string;
  phase: string;
  publicUrl: string;
  items: ProductionAuditItem[];
}

function nginxConfPath(): string {
  return path.join(serverRoot, "deploy/nginx/tisly.jp.conf");
}

function checkHttps(): ProductionAuditItem {
  const url = config.publicUrl;
  const ok = url.startsWith("https://") && !url.includes("localhost");
  return {
    id: "https",
    label: "HTTPS",
    status: ok ? "pass" : "fail",
    message: ok ? `${url} — TLS 想定` : `本番 URL が HTTPS ではありません: ${url}`,
  };
}

function checkWss(): ProductionAuditItem {
  const conf = nginxConfPath();
  if (!fs.existsSync(conf)) {
    return { id: "wss", label: "WSS", status: "warn", message: "nginx 設定テンプレ未検出" };
  }
  const text = fs.readFileSync(conf, "utf8");
  const hasWs = text.includes("location /ws") && text.includes("Upgrade");
  const hasSsl = text.includes("ssl_certificate");
  const ok = hasWs && hasSsl;
  return {
    id: "wss",
    label: "WSS",
    status: ok ? "pass" : hasWs ? "warn" : "fail",
    message: ok
      ? "/ws Upgrade + SSL 設定あり"
      : hasWs
        ? "WebSocket あり — SSL ブロック要確認"
        : "nginx に /ws Upgrade 未設定",
  };
}

function checkSystemd(): ProductionAuditItem {
  if (process.platform !== "linux") {
    return {
      id: "systemd",
      label: "Systemd",
      status: "warn",
      message: "非 Linux 環境 — VPS 本番で systemctl 確認",
    };
  }
  try {
    const active = execSync("systemctl is-active tisly-server", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    const ok = active === "active";
    return {
      id: "systemd",
      label: "Systemd",
      status: ok ? "pass" : "fail",
      message: ok ? "tisly-server active" : `tisly-server: ${active}`,
    };
  } catch {
    const unitPath = path.join(serverRoot, "deploy/systemd/tisly-server.service");
    const exists = fs.existsSync(unitPath);
    return {
      id: "systemd",
      label: "Systemd",
      status: "warn",
      message: exists ? "ユニット定義あり — 未起動または未インストール" : "tisly-server 未検出",
    };
  }
}

function checkNginx(): ProductionAuditItem {
  const conf = nginxConfPath();
  if (!fs.existsSync(conf)) {
    return { id: "nginx", label: "Nginx", status: "fail", message: "tisly.jp.conf なし" };
  }
  const text = fs.readFileSync(conf, "utf8");
  const hasServer = text.includes("server_name tisly.jp");
  const hasProxy = text.includes("proxy_pass");
  const hasSsl = text.includes("ssl_certificate");
  const ok = hasServer && hasProxy && hasSsl;
  return {
    id: "nginx",
    label: "Nginx",
    status: ok ? "pass" : "warn",
    message: ok
      ? "tisly.jp + proxy_pass + SSL"
      : `server:${hasServer} proxy:${hasProxy} ssl:${hasSsl}`,
  };
}

function checkDisk(): ProductionAuditItem {
  try {
    const statfs = (fs as typeof fs & { statfsSync?: (p: string) => { bavail: number; bsize: number } })
      .statfsSync;
    if (statfs) {
      const s = statfs(path.join(serverRoot, "data"));
      const freeGb = (s.bavail * s.bsize) / 1024 ** 3;
      const ok = freeGb > 1;
      return {
        id: "disk",
        label: "Disk",
        status: ok ? "pass" : "fail",
        message: `空き ${freeGb.toFixed(1)} GB`,
      };
    }
  } catch {
    /* fall through */
  }
  const freePct = (os.freemem() / os.totalmem()) * 100;
  return {
    id: "disk",
    label: "Disk",
    status: freePct > 10 ? "pass" : "warn",
    message: `メモリ空き ${freePct.toFixed(0)}%（ディスク statfs 不可）`,
  };
}

function checkMemory(): ProductionAuditItem {
  const load = os.loadavg()[0] ?? 0;
  const cpus = os.cpus().length || 1;
  const ratio = load / cpus;
  const freePct = (os.freemem() / os.totalmem()) * 100;
  const ok = ratio < 2 && freePct > 15;
  return {
    id: "memory",
    label: "Memory",
    status: ok ? "pass" : ratio >= 2 ? "fail" : "warn",
    message: `load ${load.toFixed(2)} / ${cpus} CPU · 空き ${freePct.toFixed(0)}%`,
  };
}

async function checkDb(): Promise<ProductionAuditItem> {
  try {
    const provider = getDbProvider();
    let reachable = provider.ping();
    if (provider instanceof PostgresProvider) {
      reachable = await provider.pingAsync();
    } else {
      getDatabase().prepare("SELECT 1").get();
      reachable = true;
    }
    return {
      id: "db",
      label: "DB",
      status: reachable ? "pass" : "fail",
      message: reachable
        ? `${config.dbProvider} 接続 OK`
        : `${config.dbProvider} 到達不可`,
    };
  } catch (e) {
    return {
      id: "db",
      label: "DB",
      status: "fail",
      message: e instanceof Error ? e.message : "DB エラー",
    };
  }
}

function checkMqtt(): ProductionAuditItem {
  const subscriber = process.env.MQTT_SUBSCRIBER_ENABLED === "true";
  const mock = process.env.MQTT_MOCK_MODE === "true" || config.mqtt.mode === "mock";
  if (mock) {
    return {
      id: "mqtt",
      label: "MQTT",
      status: "warn",
      message: `mock モード (${config.mqtt.url})`,
    };
  }
  return {
    id: "mqtt",
    label: "MQTT",
    status: subscriber ? "pass" : "warn",
    message: subscriber
      ? `subscriber 有効 — ${config.mqtt.url}`
      : `subscriber 無効 — ${config.mqtt.url}`,
  };
}

export async function buildProductionAudit(): Promise<ProductionAuditReport> {
  const items: ProductionAuditItem[] = [
    checkHttps(),
    checkWss(),
    checkSystemd(),
    checkNginx(),
    checkDisk(),
    checkMemory(),
    await checkDb(),
    checkMqtt(),
  ];

  const ready = items.every((i) => i.status === "pass");

  return {
    generatedAt: new Date().toISOString(),
    ready,
    readyLabel: ready ? "PRODUCTION AUDIT PASS" : "PRODUCTION AUDIT ISSUES",
    phase: "1461-1500-conoha-vps-auto-deploy",
    publicUrl: config.publicUrl,
    items,
  };
}
