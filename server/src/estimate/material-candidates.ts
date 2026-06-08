/** 現調カテゴリから見積部材候補を自動提示 */

import { listSurveyMaterialsV1 } from "../survey/survey-v1-store.js";
import {
  SURVEY_MATERIAL_CATEGORIES,
  SURVEY_MATERIAL_LABELS,
  type SurveyMaterialCategory,
} from "../survey/survey-v1-types.js";

export interface MaterialCandidateGroup {
  category: SurveyMaterialCategory;
  label: string;
  items: string[];
}

const CATEGORY_CANDIDATES: Record<SurveyMaterialCategory, string[]> = {
  camera: ["LAN", "PoE", "カメラ", "NVR", "モニター", "HDD", "配線"],
  wifi: ["AP", "LAN", "PoE", "ルーター", "アクセスポイント"],
  intercom: ["インターホン本体", "モニター", "電源", "配線"],
  electrical: ["コンセント", "ブレーカー", "配線", "電源タップ"],
  lighting: ["LED照明", "スイッチ", "配線"],
  lan: ["LANケーブル", "Hub", "Patch Panel", "配線"],
  antenna: ["アンテナ", "ブースター", "配線", "分配器"],
  other: ["部材", "配線", "施工費"],
};

export function buildMaterialCandidatesForSurvey(surveyProjectId: string): MaterialCandidateGroup[] {
  const materials = listSurveyMaterialsV1(surveyProjectId);
  const categories = new Set<SurveyMaterialCategory>();
  for (const m of materials) {
    categories.add(m.category);
  }
  if (!categories.size) {
    categories.add("camera");
  }
  return [...categories].map((cat) => ({
    category: cat,
    label: SURVEY_MATERIAL_LABELS[cat],
    items: CATEGORY_CANDIDATES[cat] ?? CATEGORY_CANDIDATES.other,
  }));
}

export function listAllMaterialCandidatePresets(): MaterialCandidateGroup[] {
  return SURVEY_MATERIAL_CATEGORIES.map((cat) => ({
    category: cat,
    label: SURVEY_MATERIAL_LABELS[cat],
    items: CATEGORY_CANDIDATES[cat],
  }));
}
