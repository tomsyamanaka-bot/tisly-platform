/** 案件連動 — 工事テンプレ選択から持ち物・発注・現調部材を一括生成 */

import type { SurveyMaterialCategory } from "../survey/survey-v1-types.js";
import type { ProjectRefV1 } from "./field-ops-types.js";
import { generateFieldCheckItemsV1 } from "./field-check-v1-store.js";
import { generatePurchaseLinesV1 } from "./purchase-v1-store.js";
import { aggregateNeedsFromTemplates, setProjectWorkTemplates } from "./work-templates-store.js";
import { getDatabase } from "../db/database.js";
import { v4 as uuid } from "uuid";

export function applyWorkTemplatesToProject(
  ref: ProjectRefV1,
  templateIds: string[]
): {
  templateIds: string[];
  fieldCheckCount: number;
  purchaseLineCount: number;
  surveyMaterialCount: number;
} {
  const applied = setProjectWorkTemplates(ref, templateIds);
  const fieldItems = generateFieldCheckItemsV1(ref);
  const purchaseLines = generatePurchaseLinesV1(ref);
  let surveyMaterialCount = 0;
  if (ref.source === "survey") {
    surveyMaterialCount = syncSurveyMaterialsFromTemplates(ref.projectId, applied);
  }
  return {
    templateIds: applied,
    fieldCheckCount: fieldItems.length,
    purchaseLineCount: purchaseLines.length,
    surveyMaterialCount,
  };
}

function mapToSurveyCategory(materialCategory: string | null, label: string): SurveyMaterialCategory {
  const cat = materialCategory ?? "";
  if (cat.includes("カメラ") || cat === "NVR" || cat === "HDD") return "camera";
  if (cat === "LAN") return "lan";
  if (cat === "電源") return "electrical";
  if (cat.includes("Wi-Fi") || cat.includes("wifi")) return "wifi";
  if (label.toLowerCase().includes("lan") || label.includes("RJ45")) return "lan";
  return "other";
}

function syncSurveyMaterialsFromTemplates(surveyProjectId: string, templateIds: string[]): number {
  const needs = aggregateNeedsFromTemplates(templateIds).filter((n) => n.itemType === "material");
  const db = getDatabase();
  db.prepare(
    `DELETE FROM survey_materials WHERE project_id = ? AND memo = '__auto_template__'`
  ).run(surveyProjectId);
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO survey_materials (
      id, project_id, category, item_label, quantity, memo, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, '__auto_template__', ?, ?, ?)`
  );
  let order = 0;
  for (const n of needs) {
    insert.run(
      uuid(),
      surveyProjectId,
      mapToSurveyCategory(n.category, n.label),
      n.label,
      n.qty,
      order++,
      now,
      now
    );
  }
  return needs.length;
}
