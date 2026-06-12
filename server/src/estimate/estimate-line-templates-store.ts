import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import type { EstimateLineItem } from "../business/business-types.js";

export interface EstimateLineTemplateV1 {
  id: string;
  name: string;
  description: string;
  items: Partial<EstimateLineItem>[];
  sortOrder: number;
}

const SEED_TEMPLATES: Array<{ name: string; description: string; items: Partial<EstimateLineItem>[] }> = [
  {
    name: "防犯カメラ",
    description: "屋外カメラ・NVR・PoE配線",
    items: [
      { name: "屋外防犯カメラ設置", unit: "台", quantity: 4, unitPrice: 35000, category: "camera" },
      { name: "ネットワークビデオレコーダー（NVR）", unit: "式", quantity: 1, unitPrice: 85000, category: "camera" },
      { name: "PoEハブ", unit: "台", quantity: 1, unitPrice: 18000, category: "camera" },
      { name: "LAN配線工事", unit: "m", quantity: 30, unitPrice: 800, category: "lan" },
      { name: "設定・動作確認", unit: "式", quantity: 1, unitPrice: 25000, category: "other" },
    ],
  },
  {
    name: "LAN配線",
    description: "Cat6配線・パッチパネル",
    items: [
      { name: "Cat6 LANケーブル敷設", unit: "m", quantity: 50, unitPrice: 650, category: "lan" },
      { name: "RJ45モジュラープラグ加工", unit: "本", quantity: 10, unitPrice: 800, category: "lan" },
      { name: "パッチパネル設置", unit: "式", quantity: 1, unitPrice: 12000, category: "lan" },
      { name: "配線通路工事", unit: "式", quantity: 1, unitPrice: 15000, category: "other" },
    ],
  },
  {
    name: "エアコン",
    description: "エアコン取付一式",
    items: [
      { name: "エアコン本体", unit: "台", quantity: 1, unitPrice: 120000, category: "aircon" },
      { name: "標準取付工事", unit: "式", quantity: 1, unitPrice: 35000, category: "aircon" },
      { name: "配管・配線延長", unit: "m", quantity: 3, unitPrice: 5000, category: "aircon" },
      { name: "真空引き・ガス充填", unit: "式", quantity: 1, unitPrice: 8000, category: "aircon" },
    ],
  },
  {
    name: "コンセント",
    description: "コンセント増設",
    items: [
      { name: "コンセント増設（既存回路分岐）", unit: "口", quantity: 2, unitPrice: 8500, category: "outlet" },
      { name: "配線工事", unit: "m", quantity: 5, unitPrice: 1200, category: "outlet" },
      { name: "既存配線点検", unit: "式", quantity: 1, unitPrice: 5000, category: "other" },
    ],
  },
  {
    name: "照明",
    description: "LED照明交換",
    items: [
      { name: "LEDシーリングライト", unit: "台", quantity: 3, unitPrice: 12000, category: "lighting" },
      { name: "既存照明取外し・取付", unit: "台", quantity: 3, unitPrice: 4500, category: "lighting" },
      { name: "調光器取付", unit: "台", quantity: 1, unitPrice: 8000, category: "lighting" },
    ],
  },
  {
    name: "インターホン",
    description: "テレビドアホン交換",
    items: [
      { name: "テレビドアホン親機", unit: "台", quantity: 1, unitPrice: 45000, category: "intercom" },
      { name: "テレビドアホン子機", unit: "台", quantity: 1, unitPrice: 28000, category: "intercom" },
      { name: "取付・配線工事", unit: "式", quantity: 1, unitPrice: 22000, category: "intercom" },
    ],
  },
  {
    name: "EV",
    description: "EV充電器設置",
    items: [
      { name: "EV充電器本体", unit: "台", quantity: 1, unitPrice: 180000, category: "other" },
      { name: "専用回路新設（200V）", unit: "式", quantity: 1, unitPrice: 85000, category: "other" },
      { name: "配管・配線工事", unit: "m", quantity: 10, unitPrice: 3500, category: "other" },
      { name: "動作確認・説明", unit: "式", quantity: 1, unitPrice: 10000, category: "other" },
    ],
  },
  {
    name: "ネットワーク",
    description: "Wi-Fi AP・ルーター構築",
    items: [
      { name: "無線LANアクセスポイント", unit: "台", quantity: 2, unitPrice: 25000, category: "ap" },
      { name: "ルーター・スイッチ設置", unit: "式", quantity: 1, unitPrice: 35000, category: "ap" },
      { name: "LAN配線工事", unit: "m", quantity: 20, unitPrice: 800, category: "lan" },
      { name: "ネットワーク設定", unit: "式", quantity: 1, unitPrice: 18000, category: "other" },
    ],
  },
];

function rowToTemplate(row: Record<string, unknown>): EstimateLineTemplateV1 {
  let items: Partial<EstimateLineItem>[] = [];
  try {
    items = JSON.parse(String(row.items_json ?? "[]")) as Partial<EstimateLineItem>[];
  } catch {
    items = [];
  }
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    items,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export function listEstimateLineTemplatesV1(): EstimateLineTemplateV1[] {
  return getDatabase()
    .prepare(
      `SELECT * FROM estimate_line_templates WHERE active = 1 ORDER BY sort_order ASC, name ASC`
    )
    .all()
    .map((r) => rowToTemplate(r as Record<string, unknown>));
}

export function getEstimateLineTemplateV1(id: string): EstimateLineTemplateV1 | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM estimate_line_templates WHERE id = ? AND active = 1`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToTemplate(row) : null;
}

export function seedEstimateLineTemplatesV1(): void {
  const db = getDatabase();
  const count = (db.prepare(`SELECT COUNT(*) as c FROM estimate_line_templates`).get() as { c: number })
    .c;
  if (count > 0) return;
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO estimate_line_templates (id, name, description, items_json, sort_order, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
  );
  SEED_TEMPLATES.forEach((tpl, i) => {
    insert.run(uuid(), tpl.name, tpl.description, JSON.stringify(tpl.items), i, now, now);
  });
}
