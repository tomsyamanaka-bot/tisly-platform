import { getDatabase } from "../db/database.js";
import { getDeviceLabelData } from "./device-label.js";

export function buildDevicesLabelsCsv(customerId: string): string {
  const rows = getDatabase()
    .prepare(
      `SELECT device_id, serial_number, label, device_type, site_id, zone_id, cert_status, trust_level
       FROM devices WHERE customer_id = ? ORDER BY device_id`
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
  }>;

  const header = "device_id,serial,label,device_type,site_id,zone_id,cert_status,trust_level";
  const lines = rows.map((r) =>
    [
      csvEscape(r.device_id),
      csvEscape(r.serial_number ?? ""),
      csvEscape(r.label ?? ""),
      csvEscape(r.device_type ?? ""),
      csvEscape(r.site_id ?? ""),
      csvEscape(r.zone_id ?? ""),
      csvEscape(r.cert_status ?? "none"),
      csvEscape(r.trust_level ?? "none"),
    ].join(",")
  );
  return [header, ...lines].join("\n") + "\n";
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
