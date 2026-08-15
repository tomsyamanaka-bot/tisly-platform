import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import {
  getPropertyByIdV1,
  listPropertiesForCustomerV1,
} from "../shared/customer/customer-property-master-v1.js";
import { resolveDevicePropertyByNameV1 } from "./device-property-focus-v1.js";

export interface PropertyDeviceBindingV1 {
  id: string;
  customerCode: string;
  propertyId: string;
  deviceId: string;
  deviceType: string;
  connectionStatus: "online";
  boundBy: string | null;
  boundAt: string;
}

export class DeviceBindingConflictError extends Error {
  readonly currentPropertyId: string;

  constructor(currentPropertyId: string) {
    super("device is already bound to another property");
    this.name = "DeviceBindingConflictError";
    this.currentPropertyId = currentPropertyId;
  }
}

const DEVICE_ID_PATTERN = /^TISLY-[A-Z0-9][A-Z0-9-]{2,63}$/;
/**
 * 現場で使う自由入力デバイスID。
 * 例: TOMS001-RP-01 / TISLY-BOX-001。
 * 英数と - _ のみで、英字を1文字以上含める。
 */
const DEVICE_ID_FREE_PATTERN_V1 = /^[A-Z0-9][A-Z0-9_-]{3,63}$/;

function isAllowedDeviceIdV1(value: string): boolean {
  if (DEVICE_ID_PATTERN.test(value)) return true;
  return (
    DEVICE_ID_FREE_PATTERN_V1.test(value) && /[A-Z]/.test(value)
  );
}

export function normalizeDeviceIdV1(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("device_id required");

  let candidate = raw;
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as {
        device_id?: unknown;
        deviceId?: unknown;
      };
      candidate = String(parsed.device_id ?? parsed.deviceId ?? "");
    } catch {
      throw new Error("invalid QR payload");
    }
  }

  const normalized = candidate.trim().toUpperCase();
  if (!isAllowedDeviceIdV1(normalized)) {
    throw new Error("invalid device_id");
  }
  return normalized;
}

function rowToBinding(
  row: Record<string, unknown>
): PropertyDeviceBindingV1 {
  return {
    id: String(row.id),
    customerCode: String(row.customer_code),
    propertyId: String(row.property_id),
    deviceId: String(row.device_id),
    deviceType: String(row.device_type),
    connectionStatus: "online",
    boundBy: row.bound_by == null ? null : String(row.bound_by),
    boundAt: String(row.bound_at),
  };
}

export function getDeviceBindingV1(
  deviceId: string
): PropertyDeviceBindingV1 | null {
  const row = getDatabase()
    .prepare(
      `SELECT * FROM property_device_bindings_v1
       WHERE device_id = ?`
    )
    .get(deviceId) as Record<string, unknown> | undefined;
  return row ? rowToBinding(row) : null;
}

export function bindDeviceToPropertyV1(input: {
  customerCode: string;
  propertyId: string;
  deviceId: unknown;
  boundBy?: string;
}): PropertyDeviceBindingV1 {
  const customerCode = input.customerCode.trim().toUpperCase();
  const property = getPropertyByIdV1(input.propertyId);
  if (!property || property.customerCode !== customerCode) {
    throw new Error("property not found");
  }

  const deviceId = normalizeDeviceIdV1(input.deviceId);
  const existing = getDeviceBindingV1(deviceId);
  if (existing) {
    if (
      existing.customerCode === customerCode &&
      existing.propertyId === property.propertyId
    ) {
      return existing;
    }
    throw new DeviceBindingConflictError(existing.propertyId);
  }

  const id = `PDB-${uuid().slice(0, 12).toUpperCase()}`;
  getDatabase()
    .prepare(
      `INSERT INTO property_device_bindings_v1
       (id, customer_code, property_id, device_id,
        device_type, connection_status, bound_by, bound_at)
       VALUES (?, ?, ?, ?, 'RP2350', 'online', ?, ?)`
    )
    .run(
      id,
      customerCode,
      property.propertyId,
      deviceId,
      input.boundBy?.trim() || null,
      new Date().toISOString()
    );
  return getDeviceBindingV1(deviceId)!;
}

/**
 * ポート保存などで使う自動バインド（UPSERT）。
 * 未バインドの新規物件名・新規デバイスIDでも、
 * 物件作成と機器紐付けを同時に完了させ、
 * 409コンフリクトを起こさず必ずバインドを返す。
 */
export function ensureDevicePropertyBindingV1(input: {
  customerCode: string;
  deviceId: unknown;
  propertyName?: unknown;
  propertyId?: unknown;
  boundBy?: string;
}): {
  binding: PropertyDeviceBindingV1;
  bindingCreated: boolean;
  propertyCreated: boolean;
} {
  const customerCode = input.customerCode.trim().toUpperCase();
  const deviceId = normalizeDeviceIdV1(input.deviceId);
  const existing = getDeviceBindingV1(deviceId);

  const requestedName = String(input.propertyName ?? "").trim();
  const requestedId = String(input.propertyId ?? "").trim();

  // 物件名があれば解決（無い名前は末尾に新規追記）。
  let propertyId = "";
  let propertyCreated = false;
  if (requestedName) {
    const resolved = resolveDevicePropertyByNameV1({
      customerCode,
      propertyName: requestedName,
      propertyId: requestedId,
    });
    propertyId = resolved.property.propertyId;
    propertyCreated = resolved.created;
  } else if (requestedId) {
    propertyId = requestedId;
  }

  // 既にバインド済みなら 409 を避けて既存を優先する。
  if (existing) {
    return {
      binding: existing,
      bindingCreated: false,
      propertyCreated,
    };
  }

  // 物件名・IDが無い新規デバイスは解決できない。
  if (!propertyId) {
    throw new Error("物件名を入力してください");
  }

  const binding = bindDeviceToPropertyV1({
    customerCode,
    propertyId,
    deviceId,
    boundBy: input.boundBy,
  });
  return { binding, bindingCreated: true, propertyCreated };
}

export function listPropertyDeviceStateV1(customerCode: string) {
  const code = customerCode.trim().toUpperCase();
  const bindings = (
    getDatabase()
      .prepare(
        `SELECT * FROM property_device_bindings_v1
         WHERE customer_code = ?
         ORDER BY bound_at DESC`
      )
      .all(code) as Array<Record<string, unknown>>
  ).map(rowToBinding);

  const byProperty = new Map<string, PropertyDeviceBindingV1[]>();
  for (const binding of bindings) {
    const current = byProperty.get(binding.propertyId) ?? [];
    current.push(binding);
    byProperty.set(binding.propertyId, current);
  }

  return listPropertiesForCustomerV1(code).map((property) => {
    const devices = byProperty.get(property.propertyId) ?? [];
    return {
      ...property,
      devices,
      connectionStatus:
        devices.length > 0 ? ("online" as const) : ("unbound" as const),
      statusLabel:
        devices.length > 0
          ? "接続済み（オンライン）"
          : "機器未登録",
    };
  });
}

export function listDeviceIdsForLabelsV1(
  customerCode: string
): string[] {
  const code = customerCode.trim().toUpperCase();
  const rows = getDatabase()
    .prepare(
      `SELECT device_id FROM property_device_bindings_v1
       WHERE customer_code = ?
       UNION
       SELECT d.device_id FROM devices d
       LEFT JOIN customers c ON c.customer_id = d.customer_id
       WHERE c.customer_code = ? COLLATE NOCASE
       ORDER BY device_id`
    )
    .all(code, code) as Array<{ device_id: string }>;
  return rows.map((row) => row.device_id);
}

export interface DeletedPropertyBindingV1 {
  propertyId: string;
  deviceIds: string[];
}

/**
 * 物件と実機監視データを同一トランザクションで削除し、
 * バインド・設定だけが残る不整合を防止する。
 */
export function deletePropertyBindingV1(input: {
  customerCode: string;
  propertyId: unknown;
}): DeletedPropertyBindingV1 {
  const customerCode = input.customerCode.trim().toUpperCase();
  const propertyId = String(input.propertyId ?? "").trim();
  if (!propertyId) throw new Error("property_id required");

  const database = getDatabase();
  const property = database
    .prepare(
      `SELECT property_id, customer_code
       FROM customer_portal_properties
       WHERE property_id = ?`
    )
    .get(propertyId) as
    | { property_id: string; customer_code: string }
    | undefined;
  if (
    !property ||
    property.customer_code.trim().toUpperCase() !== customerCode
  ) {
    throw new Error("property not found");
  }

  const deviceIds = (
    database
      .prepare(
        `SELECT device_id FROM property_device_bindings_v1
         WHERE property_id = ? AND customer_code = ?`
      )
      .all(propertyId, customerCode) as Array<{ device_id: string }>
  ).map((row) => row.device_id);

  database.transaction(() => {
    const childTables = [
      "device_emergency_events_v1",
      "device_port_telemetry_v1",
      "device_field_notes_v1",
      "device_rs485_configs_v1",
      "device_port_configs_v1",
    ];
    for (const deviceId of deviceIds) {
      for (const table of childTables) {
        database
          .prepare(`DELETE FROM ${table} WHERE device_id = ?`)
          .run(deviceId);
      }
    }
    database
      .prepare(
        `DELETE FROM property_device_bindings_v1
         WHERE property_id = ? AND customer_code = ?`
      )
      .run(propertyId, customerCode);
    database
      .prepare(
        `DELETE FROM customer_portal_properties
         WHERE property_id = ? AND customer_code = ?`
      )
      .run(propertyId, customerCode);
  })();

  return { propertyId, deviceIds };
}
