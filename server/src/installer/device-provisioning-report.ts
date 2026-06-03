import { v4 as uuid } from "uuid";
import { getCustomerByCode } from "../customer/customer-store.js";
import { getDatabase } from "../db/database.js";
import { buildFirmwareConfig } from "./firmware-config.js";
import { getDeviceCertStatus } from "../provisioning/device-csr.js";

export interface DeviceProvisioningReportData {
  exportId: string;
  customerCode: string;
  customerName: string;
  deviceId: string;
  deviceType: string;
  serialNumber: string | null;
  mqtt: Record<string, unknown>;
  certificate: Record<string, unknown>;
  heartbeat: {
    status: string;
    lastHeartbeatAt: string | null;
    lastSeen: string | null;
    firstSeen: string | null;
  };
  map: { floorId: string | null; posX: number | null; posY: number | null };
  qrAvailable: boolean;
  installer: string | null;
  generatedAt: string;
}

export function buildDeviceProvisioningReportData(
  customerCode: string,
  deviceId: string,
  actor?: string
): DeviceProvisioningReportData {
  const customer = getCustomerByCode(customerCode);
  if (!customer) throw new Error("Customer not found");
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT device_id, device_type, serial_number, device_status, last_heartbeat_at,
              last_seen, first_seen, floor_id, pos_x, pos_y, commissioned_by
       FROM devices WHERE customer_id = ? AND device_id = ?`
    )
    .get(customer.customer_id, deviceId) as
    | {
        device_id: string;
        device_type: string;
        serial_number: string | null;
        device_status: string | null;
        last_heartbeat_at: string | null;
        last_seen: string | null;
        first_seen: string | null;
        floor_id: string | null;
        pos_x: number | null;
        pos_y: number | null;
        commissioned_by: string | null;
      }
    | undefined;
  if (!row) throw new Error("Device not found");

  const firmware = buildFirmwareConfig(customer.customer_id, deviceId);
  const cert = getDeviceCertStatus(customer.customer_id, deviceId);
  const qr = db
    .prepare(
      `SELECT id FROM qr_provisioning_tokens WHERE customer_id = ? AND device_id = ? LIMIT 1`
    )
    .get(customer.customer_id, deviceId);

  return {
    exportId: `prov-${uuid().slice(0, 8)}`,
    customerCode: customer.customer_code,
    customerName: customer.customer_name,
    deviceId: row.device_id,
    deviceType: row.device_type,
    serialNumber: row.serial_number,
    mqtt: {
      endpoint: firmware.endpoint,
      mqtt_topic: firmware.mqtt_topic,
      client_id: firmware.client_id,
      heartbeat_interval_sec: firmware.heartbeat_interval_sec,
      provisioning_mode: firmware.provisioning_mode,
    },
    certificate: { ...cert } as Record<string, unknown>,
    heartbeat: {
      status: row.device_status ?? "UNKNOWN",
      lastHeartbeatAt: row.last_heartbeat_at,
      lastSeen: row.last_seen,
      firstSeen: row.first_seen,
    },
    map: { floorId: row.floor_id, posX: row.pos_x, posY: row.pos_y },
    qrAvailable: !!qr,
    installer: actor ?? row.commissioned_by,
    generatedAt: new Date().toISOString(),
  };
}

export function buildDeviceProvisioningReportHtml(data: DeviceProvisioningReportData): string {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"/>
<title>Device Provisioning — ${data.deviceId}</title>
<style>body{font-family:sans-serif;margin:24px}h1{font-size:1.4rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:8px}</style>
</head><body>
<h1>${data.customerName} — Device Provisioning Report</h1>
<p>Export: ${data.exportId} · ${data.generatedAt}</p>
<table>
<tr><th>Device</th><td>${data.deviceId} (${data.deviceType})</td></tr>
<tr><th>Serial</th><td>${data.serialNumber ?? "—"}</td></tr>
<tr><th>MQTT Endpoint</th><td>${String(data.mqtt.endpoint ?? "—")}</td></tr>
<tr><th>MQTT Topic</th><td>${String(data.mqtt.mqtt_topic ?? "—")}</td></tr>
<tr><th>Certificate</th><td>${JSON.stringify(data.certificate)}</td></tr>
<tr><th>Heartbeat</th><td>${data.heartbeat.status} · last: ${data.heartbeat.lastHeartbeatAt ?? "—"}</td></tr>
<tr><th>Map</th><td>floor ${data.map.floorId ?? "—"} (${data.map.posX ?? "—"}, ${data.map.posY ?? "—"})</td></tr>
<tr><th>QR</th><td>${data.qrAvailable ? "issued" : "none"}</td></tr>
<tr><th>Installer</th><td>${data.installer ?? "—"}</td></tr>
</table>
</body></html>`;
}

export async function buildDeviceProvisioningReportPdf(
  data: DeviceProvisioningReportData
): Promise<Buffer> {
  const html = buildDeviceProvisioningReportHtml(data);
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
    if (!api?.launch) return Buffer.from(html, "utf-8");
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
    return Buffer.from(html, "utf-8");
  }
}
