import { getDatabase } from "../db/database.js";
import { listDevicesForCustomer } from "../customer/customer-store.js";
import { getCustomerByCode } from "../customer/customer-store.js";

export const FIELD_ASSET_KINDS = ["ESP", "Shelly", "Camera", "SwitchBot", "Sensor"] as const;
export type FieldAssetKind = (typeof FIELD_ASSET_KINDS)[number];
export type FieldAssetHealth = "正常" | "注意" | "異常";

export interface FieldAssetRow {
  assetId: string;
  deviceId: string;
  deviceKind: FieldAssetKind | string;
  label: string;
  customerCode: string;
  health: FieldAssetHealth;
  healthCode: "normal" | "warning" | "abnormal";
  lastSeen: string | null;
  source: "qr" | "device";
}

function mapDeviceStatus(status: string | null | undefined): {
  health: FieldAssetHealth;
  healthCode: "normal" | "warning" | "abnormal";
} {
  const s = (status ?? "").toLowerCase();
  if (s === "online" || s === "ok" || s === "normal" || s === "active") {
    return { health: "正常", healthCode: "normal" };
  }
  if (s === "warning" || s === "degraded" || s === "alarm") {
    return { health: "注意", healthCode: "warning" };
  }
  return { health: "異常", healthCode: "abnormal" };
}

function normalizeKind(kind: string, label: string): FieldAssetKind | string {
  const k = kind.toLowerCase();
  const l = label.toLowerCase();
  if (k.includes("esp") || l.includes("esp")) return "ESP";
  if (k.includes("shelly") || l.includes("shelly")) return "Shelly";
  if (k.includes("camera") || k.includes("cam") || l.includes("カメラ")) return "Camera";
  if (k.includes("switchbot") || l.includes("switchbot")) return "SwitchBot";
  if (k.includes("sensor") || l.includes("センサ")) return "Sensor";
  return kind;
}

export function listFieldAssets(filters?: {
  customerCode?: string;
  kind?: string;
  health?: string;
  limit?: number;
}): FieldAssetRow[] {
  const limit = filters?.limit ?? 200;
  const rows: FieldAssetRow[] = [];
  const seen = new Set<string>();

  let sql = `SELECT * FROM asset_qr_tokens WHERE 1=1`;
  const params: unknown[] = [];
  if (filters?.customerCode) {
    sql += ` AND customer_code = ?`;
    params.push(filters.customerCode.toUpperCase());
  }
  sql += ` ORDER BY updated_at DESC LIMIT ?`;
  params.push(limit);

  const qrRows = getDatabase().prepare(sql).all(...params) as Array<Record<string, unknown>>;
  for (const r of qrRows) {
    const deviceId = String(r.device_id);
    const key = `qr:${deviceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = normalizeKind(String(r.device_kind), String(r.label));
    rows.push({
      assetId: String(r.asset_id),
      deviceId,
      deviceKind: kind,
      label: String(r.label),
      customerCode: String(r.customer_code),
      ...mapDeviceStatus("online"),
      lastSeen: r.updated_at != null ? String(r.updated_at) : null,
      source: "qr",
    });
  }

  if (filters?.customerCode) {
    const customer = getCustomerByCode(filters.customerCode);
    if (customer) {
      for (const d of listDevicesForCustomer(customer.customer_id)) {
        const key = `dev:${d.deviceId}`;
        if (seen.has(key)) {
          const existing = rows.find((x) => x.deviceId === d.deviceId);
          if (existing) {
            const mapped = mapDeviceStatus(d.deviceStatus ?? d.heartbeatStatus);
            existing.health = mapped.health;
            existing.healthCode = mapped.healthCode;
            existing.lastSeen = d.lastSeen ?? existing.lastSeen;
          }
          continue;
        }
        seen.add(key);
        const kind = normalizeKind(d.deviceType ?? "", d.label ?? d.deviceId);
        const mapped = mapDeviceStatus(d.deviceStatus ?? d.heartbeatStatus);
        rows.push({
          assetId: d.deviceId,
          deviceId: d.deviceId,
          deviceKind: kind,
          label: d.label ?? d.deviceId,
          customerCode: filters.customerCode.toUpperCase(),
          health: mapped.health,
          healthCode: mapped.healthCode,
          lastSeen: d.lastSeen ?? null,
          source: "device",
        });
      }
    }
  }

  let result = rows;
  if (filters?.kind) {
    const k = filters.kind.toLowerCase();
    result = result.filter((r) => String(r.deviceKind).toLowerCase() === k);
  }
  if (filters?.health) {
    const h = filters.health;
    result = result.filter(
      (r) =>
        r.healthCode === h ||
        r.health === h ||
        (h === "normal" && r.health === "正常") ||
        (h === "warning" && r.health === "注意") ||
        (h === "abnormal" && r.health === "異常")
    );
  }
  return result.slice(0, limit);
}

export function summarizeFieldAssets(customerCode?: string): Record<string, number> {
  const assets = listFieldAssets({ customerCode, limit: 500 });
  const summary: Record<string, number> = {
    total: assets.length,
    normal: 0,
    warning: 0,
    abnormal: 0,
  };
  for (const kind of FIELD_ASSET_KINDS) {
    summary[kind] = assets.filter((a) => a.deviceKind === kind).length;
  }
  for (const a of assets) {
    if (a.healthCode === "normal") summary.normal++;
    else if (a.healthCode === "warning") summary.warning++;
    else summary.abnormal++;
  }
  return summary;
}
