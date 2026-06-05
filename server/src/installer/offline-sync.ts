import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { claimQrProvisioning } from "../provisioning/qr-provisioning.js";
import { claimNfcProvisioning } from "../provisioning/nfc-provisioning.js";
import { completeChecklistItem, type ChecklistItemId } from "./install-checklist.js";
import {
  updateFieldChecklistItem,
  type FieldChecklistItemId,
  type FieldChecklistStatus,
} from "./installer-field-checklist.js";
import { runDeviceConnectivityTest, type DeviceTestKind } from "./device-connectivity-test.js";
import { saveInstallPhoto, INSTALL_PHOTO_TYPES, isValidInstallPhotoType } from "./install-photos.js";

export type OfflineSyncAction =
  | "qr_claim"
  | "nfc_claim"
  | "map_placement"
  | "checklist_complete"
  | "photo_upload"
  | "test_result"
  | "mqtt_test_result"
  | "field_checklist_update";

export interface OfflineSyncEntry {
  id?: string;
  action: OfflineSyncAction;
  clientAt?: string;
  body: Record<string, unknown>;
}

export interface OfflineSyncResultItem {
  id: string;
  action: OfflineSyncAction;
  status: "applied" | "skipped" | "rejected" | "warning" | "conflict" | "merged";
  message: string;
}

export interface OfflineSyncReport {
  ok: boolean;
  applied: number;
  skipped: number;
  rejected: number;
  warnings: number;
  results: OfflineSyncResultItem[];
}

function deviceUpdatedAt(deviceId: string, customerId: string): string | null {
  const row = getDatabase()
    .prepare(`SELECT updated_at FROM devices WHERE device_id = ? AND customer_id = ?`)
    .get(deviceId, customerId) as { updated_at: string | null } | undefined;
  return row?.updated_at ?? null;
}

function isAlreadyClaimed(deviceId: string, customerId: string): boolean {
  const row = getDatabase()
    .prepare(
      `SELECT commissioning_status FROM devices WHERE device_id = ? AND customer_id = ?`
    )
    .get(deviceId, customerId) as { commissioning_status: string | null } | undefined;
  return row?.commissioning_status === "claimed" || row?.commissioning_status === "completed";
}

function photoExists(customerId: string, fileName: string): boolean {
  const row = getDatabase()
    .prepare(
      `SELECT id FROM install_photos WHERE customer_id = ? AND photo_path LIKE ? LIMIT 1`
    )
    .get(customerId, `%${fileName}`) as { id: string } | undefined;
  return !!row;
}

export function processOfflineSync(
  customerId: string,
  entries: OfflineSyncEntry[],
  actor?: string
): OfflineSyncReport {
  const results: OfflineSyncResultItem[] = [];
  let applied = 0;
  let skipped = 0;
  let rejected = 0;
  let warnings = 0;

  for (const entry of entries) {
    const id = entry.id ?? uuid();
    const body = entry.body ?? {};

    try {
      switch (entry.action) {
        case "qr_claim": {
          const deviceId = String(body.device_id ?? "");
          if (isAlreadyClaimed(deviceId, customerId)) {
            results.push({
              id,
              action: entry.action,
              status: "rejected",
              message: "Device already claimed",
            });
            rejected++;
            break;
          }
          const serverAt = deviceUpdatedAt(deviceId, customerId);
          if (serverAt && entry.clientAt && serverAt > entry.clientAt) {
            results.push({
              id,
              action: entry.action,
              status: "conflict",
              message: "Server record newer than client — manual merge required",
            });
            warnings++;
            rejected++;
            break;
          }
          claimQrProvisioning({
            customerId,
            deviceId,
            deviceType: String(body.device_type ?? "ESP32"),
            serialNumber: String(body.serial_number ?? deviceId),
            provisioningToken: String(body.provisioning_token ?? ""),
            siteId: body.siteId as string | undefined,
            floorId: body.floorId as string | undefined,
            zoneId: body.zoneId as string | undefined,
            claimedBy: actor,
          });
          results.push({ id, action: entry.action, status: "applied", message: "QR claim applied" });
          applied++;
          break;
        }
        case "nfc_claim": {
          const nfcUid = String(body.nfcUid ?? "");
          const explicitId = body.deviceId ? String(body.deviceId) : null;
          if (explicitId && isAlreadyClaimed(explicitId, customerId)) {
            results.push({
              id,
              action: entry.action,
              status: "rejected",
              message: "Device already claimed",
            });
            rejected++;
            break;
          }
          const claimed = claimNfcProvisioning({
            customerId,
            nfcUid,
            deviceId: body.deviceId as string | undefined,
            deviceType: body.deviceType as string | undefined,
            serialNumber: body.serialNumber as string | undefined,
            siteId: body.siteId as string | undefined,
            floorId: body.floorId as string | undefined,
            claimedBy: actor,
          });
          results.push({
            id,
            action: entry.action,
            status: "applied",
            message: `NFC claim: ${claimed.deviceId}`,
          });
          applied++;
          break;
        }
        case "map_placement": {
          const deviceId = String(body.deviceId ?? "");
          const serverAt = deviceUpdatedAt(deviceId, customerId);
          if (serverAt && entry.clientAt && serverAt > entry.clientAt) {
            results.push({
              id,
              action: entry.action,
              status: "conflict",
              message: "Server map position newer — manual merge required",
            });
            warnings++;
            break;
          }
          getDatabase()
            .prepare(
              `UPDATE devices SET pos_x = ?, pos_y = ?, floor_id = COALESCE(?, floor_id),
               rotation = COALESCE(?, rotation), updated_at = datetime('now')
               WHERE device_id = ? AND customer_id = ?`
            )
            .run(
              body.posX ?? null,
              body.posY ?? null,
              body.floorId ?? null,
              body.rotation ?? null,
              deviceId,
              customerId
            );
          results.push({ id, action: entry.action, status: "applied", message: "Map placement synced" });
          applied++;
          break;
        }
        case "checklist_complete": {
          const item = String(body.item ?? "") as ChecklistItemId;
          const deviceId = String(body.deviceId ?? "");
          completeChecklistItem(customerId, deviceId, item, actor);
          results.push({
            id,
            action: entry.action,
            status: "applied",
            message: "Checklist item idempotent complete",
          });
          applied++;
          break;
        }
        case "photo_upload": {
          const fileName = String(body.fileName ?? "");
          if (fileName && photoExists(customerId, fileName)) {
            results.push({
              id,
              action: entry.action,
              status: "skipped",
              message: "Duplicate photo skipped",
            });
            skipped++;
            break;
          }
          const imageBase64 = String(body.imageBase64 ?? "");
          const customerCode = String(body.customerCode ?? "");
          if (imageBase64 && customerCode) {
            const photoType = String(body.photoType ?? "install");
            if (!isValidInstallPhotoType(photoType) && photoType !== "install") {
              results.push({
                id,
                action: entry.action,
                status: "rejected",
                message: `Invalid photoType: ${photoType}`,
              });
              rejected++;
              break;
            }
            saveInstallPhoto({
              customerId,
              customerCode,
              deviceId: body.deviceId as string | undefined,
              siteId: body.siteId as string | undefined,
              photoType: isValidInstallPhotoType(photoType) ? photoType : "install",
              imageBase64,
              fileName,
              uploadedBy: actor,
            });
            results.push({
              id,
              action: entry.action,
              status: "applied",
              message: "Install photo synced from offline queue",
            });
            applied++;
            break;
          }
          results.push({
            id,
            action: entry.action,
            status: "skipped",
            message: "Photo missing imageBase64 — use live upload endpoint",
          });
          skipped++;
          break;
        }
        case "mqtt_test_result": {
          const deviceId = String(body.deviceId ?? "");
          const row = getDatabase()
            .prepare(`SELECT id, last_test_result FROM devices WHERE device_id = ? AND customer_id = ?`)
            .get(deviceId, customerId) as { id: string; last_test_result: string | null } | undefined;
          if (!row) {
            results.push({ id, action: entry.action, status: "rejected", message: "Device not found" });
            rejected++;
            break;
          }
          let merged: Record<string, unknown> = {};
          if (row.last_test_result) {
            try {
              merged = JSON.parse(row.last_test_result) as Record<string, unknown>;
            } catch {
              /* */
            }
          }
          merged = {
            ...merged,
            mqttLiveRttMs: body.rtt_ms != null ? Number(body.rtt_ms) : merged.mqttLiveRttMs,
            mqttLiveAt: entry.clientAt ?? new Date().toISOString(),
            mqttLiveMock: body.mock ?? true,
          };
          getDatabase()
            .prepare(`UPDATE devices SET last_test_result = ?, updated_at = datetime('now') WHERE id = ?`)
            .run(JSON.stringify(merged), row.id);
          results.push({
            id,
            action: entry.action,
            status: "applied",
            message: "MQTT test result synced",
          });
          applied++;
          break;
        }
        case "test_result": {
          const kind = String(body.kind ?? "heartbeat") as DeviceTestKind;
          const deviceId = String(body.deviceId ?? "");
          runDeviceConnectivityTest(customerId, deviceId, kind);
          results.push({ id, action: entry.action, status: "applied", message: `Test ${kind} synced` });
          applied++;
          break;
        }
        case "field_checklist_update": {
          const customer = getDatabase()
            .prepare(`SELECT customer_code FROM customers WHERE customer_id = ?`)
            .get(customerId) as { customer_code: string } | undefined;
          if (!customer) {
            results.push({ id, action: entry.action, status: "rejected", message: "Customer not found" });
            rejected++;
            break;
          }
          const itemId = String(body.itemId ?? "") as FieldChecklistItemId;
          const status = String(body.status ?? "pending") as FieldChecklistStatus;
          updateFieldChecklistItem(customer.customer_code, itemId, status);
          results.push({
            id,
            action: entry.action,
            status: "applied",
            message: `Field checklist ${itemId} → ${status}`,
          });
          applied++;
          break;
        }
        default:
          results.push({
            id,
            action: entry.action,
            status: "rejected",
            message: "Unknown action",
          });
          rejected++;
      }
    } catch (e) {
      results.push({
        id,
        action: entry.action,
        status: "rejected",
        message: String(e),
      });
      rejected++;
    }
  }

  return {
    ok: rejected === 0,
    applied,
    skipped,
    rejected,
    warnings,
    results,
  };
}
