import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getBusinessProject } from "../business/business-store.js";
import { getFieldProjectByBusinessId } from "../field/field-project-store.js";

export const DEPLOYMENT_CHECKLIST_ITEMS = [
  { id: "esp_install", label: "ESP設置", description: "制御盤設置・配線確認" },
  { id: "shelly_install", label: "Shelly設置", description: "リレー・スマートスイッチ設置" },
  { id: "camera_install", label: "カメラ設置", description: "外周・玄関カメラ取付" },
  { id: "sensor_install", label: "センサー設置", description: "室内センサー・ドアセンサー" },
  { id: "mqtt_test", label: "MQTT疎通", description: "ブローカー接続・heartbeat確認" },
  { id: "google_tv_display", label: "Google TV表示", description: "TVダッシュボード表示確認" },
  { id: "pro_remote_display", label: "PRO Remote表示", description: "フロアマップ・設備表示" },
  { id: "customer_portal_check", label: "顧客ポータル確認", description: "ログイン・設備一覧" },
  { id: "qr_apply", label: "QR貼付", description: "設備QRラベル貼付" },
  { id: "photo_save", label: "写真保存", description: "施工写真アップロード" },
  { id: "completion_report", label: "完了報告", description: "完了報告書作成" },
] as const;

export type DeploymentChecklistItemId = (typeof DEPLOYMENT_CHECKLIST_ITEMS)[number]["id"];

export interface DeploymentChecklistItemState {
  itemId: DeploymentChecklistItemId;
  label: string;
  description: string;
  completed: boolean;
  completedAt: string | null;
  completedBy: string | null;
  note: string | null;
}

export interface DeploymentChecklistRC2 {
  projectId: string;
  customerCode: string;
  projectTitle: string;
  items: DeploymentChecklistItemState[];
  completedCount: number;
  totalCount: number;
  allComplete: boolean;
  updatedAt: string;
}

function resolveProjectId(projectId: string): {
  businessProjectId: string;
  customerCode: string;
  title: string;
} | null {
  const biz = getBusinessProject(projectId);
  if (biz) {
    return {
      businessProjectId: biz.id,
      customerCode: biz.customerId,
      title: biz.title,
    };
  }
  const field = getFieldProjectByBusinessId(projectId);
  if (field) {
    return {
      businessProjectId: field.businessProjectId,
      customerCode: field.customerCode,
      title: field.customerName,
    };
  }
  return null;
}

function ensureChecklistRows(projectId: string): void {
  const db = getDatabase();
  for (const item of DEPLOYMENT_CHECKLIST_ITEMS) {
    db.prepare(
      `INSERT OR IGNORE INTO deployment_checklist_rc2 (id, project_id, item_id, completed, created_at, updated_at)
       VALUES (?, ?, ?, 0, datetime('now'), datetime('now'))`
    ).run(`DCL-${projectId}-${item.id}`, projectId, item.id);
  }
}

export function getDeploymentChecklistRC2(projectId: string): DeploymentChecklistRC2 | null {
  const resolved = resolveProjectId(projectId);
  if (!resolved) return null;

  const bizId = resolved.businessProjectId;
  ensureChecklistRows(bizId);

  const rows = getDatabase()
    .prepare(
      `SELECT * FROM deployment_checklist_rc2 WHERE project_id = ? ORDER BY item_id`
    )
    .all(bizId) as Array<Record<string, unknown>>;

  const itemMap = new Map(rows.map((r) => [String(r.item_id), r]));
  const items: DeploymentChecklistItemState[] = DEPLOYMENT_CHECKLIST_ITEMS.map((def) => {
    const row = itemMap.get(def.id);
    return {
      itemId: def.id,
      label: def.label,
      description: def.description,
      completed: Boolean(row?.completed),
      completedAt: row?.completed_at ? String(row.completed_at) : null,
      completedBy: row?.completed_by ? String(row.completed_by) : null,
      note: row?.note ? String(row.note) : null,
    };
  });

  const completedCount = items.filter((i) => i.completed).length;
  const latest = rows.reduce((max, r) => {
    const u = String(r.updated_at ?? "");
    return u > max ? u : max;
  }, new Date().toISOString());

  return {
    projectId: bizId,
    customerCode: resolved.customerCode,
    projectTitle: resolved.title,
    items,
    completedCount,
    totalCount: items.length,
    allComplete: completedCount === items.length,
    updatedAt: latest,
  };
}

export function completeDeploymentChecklistItem(
  projectId: string,
  itemId: string,
  actor?: string,
  note?: string
): DeploymentChecklistItemState | null {
  const resolved = resolveProjectId(projectId);
  if (!resolved) return null;

  const def = DEPLOYMENT_CHECKLIST_ITEMS.find((i) => i.id === itemId);
  if (!def) return null;

  const bizId = resolved.businessProjectId;
  ensureChecklistRows(bizId);
  const now = new Date().toISOString();

  getDatabase()
    .prepare(
      `UPDATE deployment_checklist_rc2 SET
        completed = 1, completed_at = ?, completed_by = ?, note = COALESCE(?, note), updated_at = ?
       WHERE project_id = ? AND item_id = ?`
    )
    .run(now, actor ?? "installer", note ?? null, now, bizId, itemId);

  const checklist = getDeploymentChecklistRC2(bizId);
  return checklist?.items.find((i) => i.itemId === itemId) ?? null;
}
