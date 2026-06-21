/** Knowledge Field UX V5 — お客様向け説明（将来 AI 生成用にデータ構造分離） */

import type { KnowledgeDetailV1 } from "./knowledge-detail-v1.js";

export type KnowledgeCustomerExplanationSourceV1 = "mock_v1" | "ai_v1" | "manual_v1";

export interface KnowledgeCustomerExplanationV1 {
  whatIsIt: string;
  whereUsed: string;
  benefit: string;
  cautions: string;
  afterInstallPoints: string;
  source: KnowledgeCustomerExplanationSourceV1;
  generatedAt: string;
}

const CATEGORY_HINTS: Record<string, Partial<KnowledgeCustomerExplanationV1>> = {
  PLC: {
    whatIsIt: "制御盤の動作を安全に保つための参考資料です。",
    whereUsed: "盤内配線・プログラム確認・試運転の説明時に使います。",
    benefit: "誤配線や誤動作のリスクを減らし、安定した設備運転につながります。",
    cautions: "通電中の作業は行わず、必ず停電・ロックアウトを実施してください。",
    afterInstallPoints: "ランプ表示・非常停止・再起動後の動作をご確認ください。",
  },
  防犯: {
    whatIsIt: "防犯カメラ設置に関する施工参考資料です。",
    whereUsed: "設置位置の説明・配線経路・録画確認のご案内に使います。",
    benefit: "見守り範囲が明確になり、安心してご利用いただけます。",
    cautions: "プライバシーに配慮し、撮影範囲を事前にご確認ください。",
    afterInstallPoints: "スマホやモニターで映像が見えること、夜間の見え方をご確認ください。",
  },
};

function pickCategoryHint(category: string): Partial<KnowledgeCustomerExplanationV1> {
  for (const [key, hint] of Object.entries(CATEGORY_HINTS)) {
    if (category.includes(key)) return hint;
  }
  return {};
}

/** mock 文章 — 将来 AI で差し替え可能 */
export function buildCustomerExplanationV1(detail: KnowledgeDetailV1): KnowledgeCustomerExplanationV1 {
  const hint = pickCategoryHint(detail.category || "");
  const title = detail.title || "この資料";
  const usage = detail.usage || detail.summary?.slice(0, 120) || "現場作業の参考情報";

  return {
    whatIsIt: hint.whatIsIt ?? `「${title}」は、今回の工事内容を分かりやすく説明するための資料です。`,
    whereUsed: hint.whereUsed ?? `設備の設置場所や作業内容のご説明時に、${usage}としてご覧いただけます。`,
    benefit: hint.benefit ?? "施工内容が明確になり、仕上がりのイメージを共有しやすくなります。",
    cautions:
      hint.cautions ??
      (detail.cautions
        ? detail.cautions.replace(/QNAP|SMB|WebDAV|192\.168\.[^\s]+/gi, "").trim() ||
          "作業中は安全確認をお願いします。"
        : "作業中は安全確認をお願いします。"),
    afterInstallPoints:
      hint.afterInstallPoints ??
      "施工後は表示・動作・見え方を一緒にご確認いただき、不明点があればお知らせください。",
    source: "mock_v1",
    generatedAt: new Date().toISOString(),
  };
}
