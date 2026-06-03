import { getDatabase } from "../db/database.js";
import { getCustomerById } from "../customer/customer-store.js";
import { getDeviceLabelData } from "./device-label.js";

export function buildDevicesLabelsCsv(customerId: string): string {
  const customer = getCustomerById(customerId);
  const customerName = customer?.customer_name ?? customer?.customer_code ?? "";
  const rows = getDatabase()
    .prepare(
      `SELECT d.device_id, d.serial_number, d.label, d.device_type, d.site_id, d.zone_id,
              d.cert_status, d.trust_level, d.commissioned_at,
              s.name as site_name, z.name as zone_name
       FROM devices d
       LEFT JOIN sites s ON s.id = d.site_id
       LEFT JOIN zones z ON z.id = d.zone_id
       WHERE d.customer_id = ? ORDER BY d.device_id`
    )
    .all(customerId) as Array<{
    device_id: string;
    serial_number: string | null;
    label: string | null;
    device_type: string | null;
    site_id: string | null;
    zone_id: string | null;
    cert_status: string | null;
    trust_level: string | null;
    commissioned_at: string | null;
    site_name: string | null;
    zone_name: string | null;
  }>;

  const header =
    "device_id,serial,customer,site,zone,label,device_type,install_date,cert_status,trust_level,qr_payload";
  const lines = rows.map((r) => {
    const labelData = getDeviceLabelData(customerId, r.device_id);
    return [
      csvEscape(r.device_id),
      csvEscape(r.serial_number ?? ""),
      csvEscape(customerName),
      csvEscape(r.site_name ?? r.site_id ?? ""),
      csvEscape(r.zone_name ?? r.zone_id ?? ""),
      csvEscape(r.label ?? ""),
      csvEscape(r.device_type ?? ""),
      csvEscape(r.commissioned_at ?? ""),
      csvEscape(r.cert_status ?? "none"),
      csvEscape(r.trust_level ?? "none"),
      csvEscape(labelData.qrPayload),
    ].join(",");
  });
  return [header, ...lines].join("\n") + "\n";
}

export function getDeviceLabelJson(customerId: string, customerCode: string, deviceId: string) {
  const data = getDeviceLabelData(customerId, deviceId);
  const row = getDatabase()
    .prepare(
      `SELECT commissioned_at FROM devices WHERE device_id = ? AND customer_id = ?`
    )
    .get(deviceId, customerId) as { commissioned_at: string | null } | undefined;
  return {
    device_id: data.deviceId,
    serial: data.serial,
    customer: customerCode,
    site: data.site,
    zone: data.zone,
    qr: data.qrPayload,
    install_date: row?.commissioned_at ?? null,
    label_text: data.labelText,
    expires_at: data.expiresAt,
  };
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildDeviceLabelSvg(customerId: string, deviceId: string): string {
  const data = getDeviceLabelData(customerId, deviceId);
  const lines = data.labelText.split(" · ");
  const textY = lines.map((_, i) => 28 + i * 18).join(" ");
  const textNodes = lines
    .map((line, i) => `<text x="12" y="${28 + i * 18}" font-size="12" fill="#111">${escapeXml(line)}</text>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="280" height="${40 + lines.length * 18}">
  <rect width="100%" height="100%" fill="#fff" stroke="#1a7f37" stroke-width="2" rx="6"/>
  <text x="12" y="16" font-size="10" fill="#1a7f37" font-weight="bold">TiSLY Device Label</text>
  ${textNodes}
  <rect x="180" y="8" width="88" height="88" fill="#f3f4f6" stroke="#ccc"/>
  <text x="188" y="52" font-size="9" fill="#666">QR placeholder</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
