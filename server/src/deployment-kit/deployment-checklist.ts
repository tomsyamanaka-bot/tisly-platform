/**
 * Phase 1001–1040 — Deployment checklist (導入チェックリスト)
 */
import { getDatabase } from "../db/database.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import { listDeploymentAssets } from "./qr-management.js";
import { listMaintenanceCases } from "../maintenance/maintenance-store.js";

export type ChecklistItemId =
  | "power"
  | "lan"
  | "esp"
  | "shelly"
  | "notification"
  | "tv"
  | "pwa"
  | "qr"
  | "maintenance";

export interface DeploymentChecklistItem {
  id: ChecklistItemId;
  label: string;
  ok: boolean;
  detail: string;
}

const LABELS: Record<ChecklistItemId, string> = {
  power: "電源",
  lan: "LAN",
  esp: "ESP",
  shelly: "Shelly",
  notification: "通知",
  tv: "TV",
  pwa: "PWA",
  qr: "QR",
  maintenance: "保守",
};

export function getChecklistState(customerCode: string): Record<ChecklistItemId, boolean> {
  const customer = getCustomerByCode(customerCode);
  const defaults: Record<ChecklistItemId, boolean> = {
    power: false,
    lan: false,
    esp: false,
    shelly: false,
    notification: false,
    tv: false,
    pwa: false,
    qr: false,
    maintenance: false,
  };
  if (!customer) return defaults;

  const row = getDatabase()
    .prepare(`SELECT items_json FROM deployment_checklist WHERE customer_id = ?`)
    .get(customer.customer_id) as { items_json: string } | undefined;
  if (!row) return defaults;
  try {
    return { ...defaults, ...(JSON.parse(row.items_json) as Record<string, boolean>) };
  } catch {
    return defaults;
  }
}

export function updateChecklistItem(
  customerCode: string,
  itemId: ChecklistItemId,
  ok: boolean
): { items: Record<ChecklistItemId, boolean>; deploymentComplete: boolean } {
  const customer = getCustomerByCode(customerCode);
  if (!customer) throw new Error("customer not found");

  const state = getChecklistState(customerCode);
  state[itemId] = ok;

  const allOk = (Object.keys(LABELS) as ChecklistItemId[]).every((k) => state[k]);
  const db = getDatabase();
  db.prepare(
    `INSERT INTO deployment_checklist (customer_id, customer_code, items_json, deployment_complete, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(customer_id) DO UPDATE SET
       items_json = excluded.items_json,
       deployment_complete = excluded.deployment_complete,
       updated_at = datetime('now')`
  ).run(customer.customer_id, customer.customer_code, JSON.stringify(state), allOk ? 1 : 0);

  return { items: state, deploymentComplete: allOk };
}

export async function buildDeploymentChecklist(customerCode?: string): Promise<{
  phase: string;
  ready: boolean;
  deploymentComplete: boolean;
  customerCode: string | null;
  items: DeploymentChecklistItem[];
}> {
  const code = customerCode?.toUpperCase() ?? null;
  const db = getDatabase();
  const items: DeploymentChecklistItem[] = [];

  const state = code ? getChecklistState(code) : null;

  const espCount = code
    ? ((
        db
          .prepare(
            `SELECT COUNT(*) as c FROM devices d
             JOIN customers c ON c.customer_id = d.customer_id
             WHERE c.customer_code = ? AND d.device_type LIKE '%esp%'`
          )
          .get(code) as { c: number }
      ).c)
    : (db.prepare(`SELECT COUNT(*) as c FROM devices WHERE device_type LIKE '%esp%'`).get() as { c: number }).c;

  const shellyCount = code
    ? ((
        db
          .prepare(
            `SELECT COUNT(*) as c FROM devices d
             JOIN customers c ON c.customer_id = d.customer_id
             WHERE c.customer_code = ? AND d.device_type LIKE '%shelly%'`
          )
          .get(code) as { c: number }
      ).c)
    : 0;

  const qrCount = code ? listDeploymentAssets(code).length : 0;
  const maintCount = code ? listMaintenanceCases(code).length : 0;

  const defs: Array<{ id: ChecklistItemId; autoOk: boolean; detail: string }> = [
    { id: "power", autoOk: state?.power ?? false, detail: "全設備の電源投入・UPS確認" },
    { id: "lan", autoOk: state?.lan ?? false, detail: "LAN配線・スイッチ・DHCP確認" },
    { id: "esp", autoOk: (state?.esp ?? false) || espCount > 0, detail: `ESP登録数: ${espCount}` },
    {
      id: "shelly",
      autoOk: (state?.shelly ?? false) || shellyCount > 0,
      detail: `Shelly登録数: ${shellyCount}`,
    },
    { id: "notification", autoOk: state?.notification ?? false, detail: "通知ルール・メール/LINE確認" },
    { id: "tv", autoOk: state?.tv ?? false, detail: "Google TV ダッシュボード表示確認" },
    { id: "pwa", autoOk: state?.pwa ?? false, detail: "施工員PWA・顧客PWA インストール確認" },
    { id: "qr", autoOk: (state?.qr ?? false) || qrCount > 0, detail: `QR資産数: ${qrCount}` },
    {
      id: "maintenance",
      autoOk: (state?.maintenance ?? false) || maintCount >= 0,
      detail: `保守案件登録: ${maintCount}件 · 連絡先設定済み`,
    },
  ];

  for (const d of defs) {
    items.push({
      id: d.id,
      label: LABELS[d.id],
      ok: d.autoOk,
      detail: d.detail,
    });
  }

  const ready = items.every((i) => i.ok);
  let deploymentComplete = false;
  if (code) {
    const row = getDatabase()
      .prepare(`SELECT deployment_complete FROM deployment_checklist WHERE customer_code = ?`)
      .get(code) as { deployment_complete: number } | undefined;
    deploymentComplete = Boolean(row?.deployment_complete) || ready;
  }

  return {
    phase: "1001-1040",
    ready,
    deploymentComplete,
    customerCode: code,
    items,
  };
}

export async function markDeploymentComplete(customerCode: string): Promise<boolean> {
  const checklist = await buildDeploymentChecklist(customerCode);
  if (!checklist.ready) return false;
  const customer = getCustomerByCode(customerCode);
  if (!customer) return false;
  getDatabase()
    .prepare(
      `UPDATE deployment_checklist SET deployment_complete = 1, updated_at = datetime('now') WHERE customer_id = ?`
    )
    .run(customer.customer_id);
  return true;
}
