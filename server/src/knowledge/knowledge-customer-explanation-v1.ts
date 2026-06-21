/** Knowledge Field UX V5 / Customer UI V1 — お客様向け説明（将来 AI 生成用にデータ構造分離） */

import type { KnowledgeDetailV1 } from "./knowledge-detail-v1.js";

export type KnowledgeCustomerExplanationSourceV1 = "mock_v1" | "ai_v1" | "manual_v1";

export interface KnowledgeCustomerExplanationV1 {
  knowledgeId: string;
  headline: string;
  simpleDescription: string;
  customerBenefits: string[];
  customerWarnings: string[];
  afterWorkCheckpoints: string[];
  recommendedFor: string[];
  relatedQuestions: string[];
  /** @deprecated 互換 — whatIsIt と同義 */
  whatIsIt: string;
  /** @deprecated 互換 */
  whereUsed: string;
  /** @deprecated 互換 — benefit の短文版 */
  benefit: string;
  /** @deprecated 互換 — customerWarnings の短文版 */
  cautions: string;
  /** @deprecated 互換 — afterWorkCheckpoints の短文版 */
  afterInstallPoints: string;
  source: KnowledgeCustomerExplanationSourceV1;
  generatedAt: string;
}

const CATEGORY_HINTS: Record<
  string,
  {
    headline?: string;
    simpleDescription?: string;
    customerBenefits?: string[];
    customerWarnings?: string[];
    afterWorkCheckpoints?: string[];
    recommendedFor?: string[];
    relatedQuestions?: string[];
    whatIsIt?: string;
    whereUsed?: string;
    benefit?: string;
    cautions?: string;
    afterInstallPoints?: string;
  }
> = {
  PLC: {
    headline: "設備を安全に動かすための参考資料",
    simpleDescription: "制御盤の動きを分かりやすく説明する資料です。施工内容のイメージを共有するために使います。",
    customerBenefits: [
      "誤配線や誤動作のリスクを減らせます",
      "設備が安定して動くようになります",
      "トラブル時の確認ポイントが明確になります",
    ],
    customerWarnings: ["通電中の作業は行いません", "停電・ロックアウトを必ず実施します"],
    afterWorkCheckpoints: [
      "ランプ表示が想定どおりか",
      "非常停止が正しく動くか",
      "再起動後も正常に動くか",
    ],
    recommendedFor: ["工場設備の更新", "制御盤の改修", "安全回路の見直し"],
    relatedQuestions: ["停止方法は？", "ランプの意味は？", "メンテナンス頻度は？"],
    whatIsIt: "制御盤の動作を安全に保つための参考資料です。",
    whereUsed: "盤内配線・プログラム確認・試運転の説明時に使います。",
    benefit: "誤配線や誤動作のリスクを減らし、安定した設備運転につながります。",
    cautions: "通電中の作業は行わず、必ず停電・ロックアウトを実施してください。",
    afterInstallPoints: "ランプ表示・非常停止・再起動後の動作をご確認ください。",
  },
  防犯: {
    headline: "防犯カメラ設置のご説明資料",
    simpleDescription: "カメラの設置位置と、どの範囲が見えるかを分かりやすくお伝えする資料です。",
    customerBenefits: [
      "見守りたい場所がはっきり分かります",
      "夜間の見え方も事前に確認できます",
      "録画・スマホ確認のイメージが持てます",
    ],
    customerWarnings: ["撮影範囲は事前にご確認ください", "プライバシーに配慮した設置を行います"],
    afterWorkCheckpoints: [
      "スマホやモニターで映像が見えるか",
      "夜間の明るさ・画質は問題ないか",
      "録画が正常に保存されているか",
    ],
    recommendedFor: ["防犯カメラ新設", "カメラ台数の追加", "録画機器の更新"],
    relatedQuestions: ["どこが映りますか？", "夜も見えますか？", "スマホで見られますか？"],
    whatIsIt: "防犯カメラ設置に関する施工参考資料です。",
    whereUsed: "設置位置の説明・配線経路・録画確認のご案内に使います。",
    benefit: "見守り範囲が明確になり、安心してご利用いただけます。",
    cautions: "プライバシーに配慮し、撮影範囲を事前にご確認ください。",
    afterInstallPoints: "スマホやモニターで映像が見えること、夜間の見え方をご確認ください。",
  },
};

function pickCategoryHint(category: string) {
  for (const [key, hint] of Object.entries(CATEGORY_HINTS)) {
    if (category.includes(key)) return hint;
  }
  return {};
}

function stripInternal(text: string): string {
  return text
    .replace(/QNAP|SMB|WebDAV|192\.168\.[^\s]+|\\\\[^\s]+|\/api\/[^\s]+|projectId[=:]\S+|userId[=:]\S+/gi, "")
    .trim();
}

/** mock 文章 — 将来 AI で差し替え可能 */
export function buildCustomerExplanationV1(detail: KnowledgeDetailV1): KnowledgeCustomerExplanationV1 {
  const hint = pickCategoryHint(detail.category || "");
  const title = detail.title || "この資料";
  const usage = detail.usage || detail.summary?.slice(0, 120) || "現場作業の参考情報";

  const headline = hint.headline ?? `${title}のご説明`;
  const simpleDescription =
    hint.simpleDescription ??
    `「${title}」は、今回の工事内容を分かりやすくお伝えするための資料です。${usage ? ` ${stripInternal(usage)}` : ""}`;

  const customerBenefits = hint.customerBenefits ?? [
    "施工内容が明確になり、仕上がりのイメージを共有しやすくなります",
    "完了後の確認ポイントが分かりやすくなります",
  ];

  const rawCaution =
    hint.cautions ??
    (detail.cautions
      ? stripInternal(detail.cautions) || "作業中は安全確認をお願いします。"
      : "作業中は安全確認をお願いします。");

  const customerWarnings = hint.customerWarnings ?? [rawCaution];

  const afterWorkCheckpoints = hint.afterWorkCheckpoints ?? [
    "施工後は表示・動作・見え方を一緒にご確認いただき、不明点があればお知らせください",
  ];

  const recommendedFor = hint.recommendedFor ?? ["設備工事のご説明", "施工前のイメージ共有", "引き渡し時の確認"];
  const relatedQuestions = hint.relatedQuestions ?? ["どこに設置しますか？", "工事後どう変わりますか？", "注意点はありますか？"];

  return {
    knowledgeId: detail.id,
    headline,
    simpleDescription: stripInternal(simpleDescription),
    customerBenefits,
    customerWarnings,
    afterWorkCheckpoints,
    recommendedFor,
    relatedQuestions,
    whatIsIt: hint.whatIsIt ?? `「${title}」は、今回の工事内容を分かりやすく説明するための資料です。`,
    whereUsed:
      hint.whereUsed ?? `設備の設置場所や作業内容のご説明時に、${stripInternal(usage)}としてご覧いただけます。`,
    benefit: hint.benefit ?? customerBenefits[0] ?? "施工内容が明確になり、安心してご確認いただけます。",
    cautions: rawCaution,
    afterInstallPoints: hint.afterInstallPoints ?? afterWorkCheckpoints[0] ?? "施工後の動作・見え方をご確認ください。",
    source: "mock_v1",
    generatedAt: new Date().toISOString(),
  };
}
