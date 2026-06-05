/**
 * Phase 1061–1070 — Installer field checklist (施工員専用)
 * Status: pending (未) | done (済) | needs_review (要確認)
 */
import { getDatabase } from "../db/database.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import { getDeploymentMqttStatus } from "../deployment-kit/deployment-mqtt.js";
import { testShellyConnection } from "../deployment-kit/shelly-provisioning.js";

export type FieldChecklistItemId =
  | "esp_registered"
  | "shelly_registered"
  | "mqtt_heartbeat"
  | "notification_test"
  | "google_tv"
  | "photo_before"
  | "photo_after"
  | "completion_report";

export type FieldChecklistStatus = "pending" | "done" | "needs_review";

export interface FieldChecklistItem {
  id: FieldChecklistItemId;
  label: string;
  status: FieldChecklistStatus;
  statusLabel: string;
  detail: string;
  autoEvaluated: boolean;
}

const STATUS_LABELS: Record<FieldChecklistStatus, string> = {
  pending: "未",
  done: "済",
  needs_review: "要確認",
};

const ITEM_LABELS: Record<FieldChecklistItemId, string> = {
  esp_registered: "ESP登録",
  shelly_registered: "Shelly登録",
  mqtt_heartbeat: "MQTT heartbeat確認",
  notification_test: "通知テスト",
  google_tv: "Google TV表示確認",
  photo_before: "施工前写真",
  photo_after: "施工後写真",
  completion_report: "完了レポート",
};

function getManualOverrides(customerId: string): Record<string, FieldChecklistStatus> {
  const row = getDatabase()
    .prepare(`SELECT installer_items_json FROM deployment_checklist WHERE customer_id = ?`)
    .get(customerId) as { installer_items_json: string | null } | undefined;
  if (!row?.installer_items_json) return {};
  try {
    return JSON.parse(row.installer_items_json) as Record<string, FieldChecklistStatus>;
  } catch {
    return {};
  }
}

function countDevices(customerId: string, pattern: string): number {
  return (
    getDatabase()
      .prepare(
        `SELECT COUNT(*) as c FROM devices WHERE customer_id = ? AND device_type LIKE ?`
      )
      .get(customerId, pattern) as { c: number }
  ).c;
}

function hasMqttHeartbeat(customerCode: string): boolean {
  const status = getDeploymentMqttStatus(customerCode);
  return status.devices.some(
    (d) => d.last_seen && d.heartbeat_status === "ok"
  );
}

function countPhotos(customerId: string, type: string): number {
  return (
    getDatabase()
      .prepare(
        `SELECT COUNT(*) as c FROM install_photos WHERE customer_id = ? AND photo_type = ?`
      )
      .get(customerId, type) as { c: number }
  ).c;
}

function hasNotificationTest(customerId: string): boolean {
  const rows = getDatabase()
    .prepare(
      `SELECT last_test_result FROM devices WHERE customer_id = ? AND last_test_result IS NOT NULL`
    )
    .all(customerId) as Array<{ last_test_result: string | null }>;
  for (const r of rows) {
    if (!r.last_test_result) continue;
    try {
      const t = JSON.parse(r.last_test_result) as { notification?: string };
      if (t.notification === "ok") return true;
    } catch {
      /* */
    }
  }
  return false;
}

function hasTvTest(customerId: string): boolean {
  const rows = getDatabase()
    .prepare(
      `SELECT last_test_result, device_type, heartbeat_status FROM devices WHERE customer_id = ?`
    )
    .all(customerId) as Array<{
    last_test_result: string | null;
    device_type: string | null;
    heartbeat_status: string | null;
  }>;
  for (const r of rows) {
    if (r.device_type?.toUpperCase() === "TV" && r.heartbeat_status === "ok") return true;
    if (!r.last_test_result) continue;
    try {
      const t = JSON.parse(r.last_test_result) as { tv?: string };
      if (t.tv === "ok") return true;
    } catch {
      /* */
    }
  }
  return false;
}

function hasCompletionReport(customerCode: string): boolean {
  const records = getDatabase()
    .prepare(
      `SELECT step FROM deployment_install_records WHERE customer_code = ? AND step = 'sign'`
    )
    .all(customerCode.toUpperCase()) as Array<{ step: string }>;
  return records.length > 0;
}

export function evaluateFieldChecklist(customerCode: string): {
  customerCode: string;
  phase: string;
  items: FieldChecklistItem[];
  summary: {
    pending: number;
    done: number;
    needsReview: number;
    total: number;
  };
} {
  const customer = getCustomerByCode(customerCode);
  if (!customer) throw new Error("customer not found");

  const overrides = getManualOverrides(customer.customer_id);
  const espCount = countDevices(customer.customer_id, "%esp%");
  const shellyCount = countDevices(customer.customer_id, "%shelly%");
  const mqttOk = hasMqttHeartbeat(customer.customer_code);
  const photoBefore = countPhotos(customer.customer_id, "before");
  const photoAfter = countPhotos(customer.customer_id, "after");
  const notifOk = hasNotificationTest(customer.customer_id);
  const tvOk = hasTvTest(customer.customer_id);
  const reportOk = hasCompletionReport(customer.customer_code);

  const autoStatus: Record<FieldChecklistItemId, FieldChecklistStatus> = {
    esp_registered: espCount > 0 ? "done" : "pending",
    shelly_registered: shellyCount > 0 ? "done" : "pending",
    mqtt_heartbeat: mqttOk ? "done" : espCount > 0 ? "needs_review" : "pending",
    notification_test: notifOk ? "done" : "pending",
    google_tv: tvOk ? "done" : "pending",
    photo_before: photoBefore > 0 ? "done" : "pending",
    photo_after: photoAfter > 0 ? "done" : "pending",
    completion_report: reportOk ? "done" : "pending",
  };

  const items: FieldChecklistItem[] = (Object.keys(ITEM_LABELS) as FieldChecklistItemId[]).map(
    (id) => {
      const manual = overrides[id];
      const auto = autoStatus[id];
      const status = manual ?? auto;
      const details: Record<FieldChecklistItemId, string> = {
        esp_registered: `ESP登録数: ${espCount}`,
        shelly_registered: `Shelly登録数: ${shellyCount}`,
        mqtt_heartbeat: mqttOk ? "heartbeat 受信済み" : "MQTT未確認 — テスト heartbeat を実行",
        notification_test: notifOk ? "通知テスト成功" : "通知テスト未実施",
        google_tv: tvOk ? "TV表示確認済み" : "Google TV 表示未確認",
        photo_before: `施工前写真: ${photoBefore}枚`,
        photo_after: `施工後写真: ${photoAfter}枚`,
        completion_report: reportOk ? "完了レポート生成済み" : "署名・完了レポート未作成",
      };
      return {
        id,
        label: ITEM_LABELS[id],
        status,
        statusLabel: STATUS_LABELS[status],
        detail: details[id],
        autoEvaluated: !manual,
      };
    }
  );

  return {
    customerCode: customer.customer_code,
    phase: "1061-1070",
    items,
    summary: {
      pending: items.filter((i) => i.status === "pending").length,
      done: items.filter((i) => i.status === "done").length,
      needsReview: items.filter((i) => i.status === "needs_review").length,
      total: items.length,
    },
  };
}

export function updateFieldChecklistItem(
  customerCode: string,
  itemId: FieldChecklistItemId,
  status: FieldChecklistStatus
): FieldChecklistItem {
  const customer = getCustomerByCode(customerCode);
  if (!customer) throw new Error("customer not found");
  if (!ITEM_LABELS[itemId]) throw new Error("unknown checklist item");
  if (!STATUS_LABELS[status]) throw new Error("invalid status");

  const db = getDatabase();
  const overrides = getManualOverrides(customer.customer_id);
  overrides[itemId] = status;

  db.prepare(
    `INSERT INTO deployment_checklist (customer_id, customer_code, items_json, installer_items_json, deployment_complete, updated_at)
     VALUES (?, ?, '{}', ?, 0, datetime('now'))
     ON CONFLICT(customer_id) DO UPDATE SET
       installer_items_json = excluded.installer_items_json,
       updated_at = datetime('now')`
  ).run(customer.customer_id, customer.customer_code, JSON.stringify(overrides));

  const ev = evaluateFieldChecklist(customerCode);
  const item = ev.items.find((i) => i.id === itemId);
  if (!item) throw new Error("item not found after update");
  return item;
}

export async function getInstallerHomeCards(customerCode: string): Promise<{
  todayWork: string;
  incompleteCount: number;
  photoShortage: number;
  mqttUnconfirmed: number;
  shellyUnconfirmed: number;
  fieldChecklist: ReturnType<typeof evaluateFieldChecklist>;
}> {
  const checklist = evaluateFieldChecklist(customerCode);
  const customer = getCustomerByCode(customerCode);
  if (!customer) throw new Error("customer not found");

  const mqttStatus = getDeploymentMqttStatus(customerCode);
  const mqttUnconfirmed = mqttStatus.devices.filter(
    (d) => !d.last_seen || d.heartbeat_status !== "ok"
  ).length;

  const shellyDevices = getDatabase()
    .prepare(
      `SELECT device_id, metadata_json FROM devices
       WHERE customer_id = ? AND device_type LIKE '%shelly%'`
    )
    .all(customer.customer_id) as Array<{ device_id: string; metadata_json: string | null }>;

  let shellyUnconfirmed = 0;
  for (const d of shellyDevices) {
    const test = await testShellyConnection({
      deviceId: d.device_id,
      customerCode,
    });
    if (!test.ok) shellyUnconfirmed++;
  }
  if (shellyDevices.length === 0) shellyUnconfirmed = 1;

  const photoBefore = countPhotos(customer.customer_id, "before");
  const photoAfter = countPhotos(customer.customer_id, "after");
  const photoShortage = (photoBefore === 0 ? 1 : 0) + (photoAfter === 0 ? 1 : 0);

  const incompleteCount =
    checklist.summary.pending + checklist.summary.needsReview;

  const today = new Date().toLocaleDateString("ja-JP");
  const todayWork = `${today} · 未完了 ${incompleteCount} 項目`;

  return {
    todayWork,
    incompleteCount,
    photoShortage,
    mqttUnconfirmed,
    shellyUnconfirmed,
    fieldChecklist: checklist,
  };
}
