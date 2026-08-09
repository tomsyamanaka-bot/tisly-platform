/**
 * Eco-Water 証明書ハッシュ共通ヘルパー
 * 形式: EW-[SITE]-[TIMESTAMP]-[SALT]
 * SHA-256 で改ざん防止IDを生成する
 */

import { createHash, randomBytes } from "node:crypto";
import { formatEcoWaterHashIdV1 } from "./eco-water-sites-v1.js";

/** 中和完了判定の目標 pH（±許容） */
export const ECO_WATER_NEUTRAL_TARGET_PH_V1 = 7.2;
export const ECO_WATER_NEUTRAL_TOLERANCE_V1 = 0.05;

/**
 * 入力文字列を SHA-256 hex に変換
 * Node 専用（PWA 側は subtle を継続）
 */
export function sha256HexNodeV1(text: string): string {
  return createHash("sha256")
    .update(String(text ?? ""), "utf8")
    .digest("hex");
}

/**
 * 証明書用 canonical 文字列を組み立てる
 * 形式: EW-[SITE]-[TIMESTAMP]-[SALT]
 * SITE は TKB / MRY 等（Prefix の EW- を除く）
 */
export function buildEcoWaterCertCanonicalV1(input: {
  sitePrefix: string;
  timestamp: string;
  salt?: string;
}): { canonical: string; salt: string; siteKey: string; siteToken: string } {
  const raw = String(input.sitePrefix || "EW")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+$/, "");
  // 表示用 Prefix（EW-TKB）と SITE トークン（TKB）を分離
  const siteKey = raw.startsWith("EW-")
    ? raw
    : raw.startsWith("EW") && raw.length > 2 && !raw.includes("-")
      ? `EW-${raw.slice(2)}`
      : raw.startsWith("EW")
        ? raw
        : `EW-${raw}`;
  const siteToken = siteKey.replace(/^EW-/, "") || "SITE";
  const ts = String(input.timestamp || new Date().toISOString())
    .trim()
    .replace(/\s+/g, "T");
  const salt =
    String(input.salt || "").trim() ||
    randomBytes(8).toString("hex");
  const canonical = `EW-${siteToken}-${ts}-${salt}`;
  return { canonical, salt, siteKey, siteToken };
}

/**
 * 中和完了レコード向け改ざん防止ハッシュを生成
 * API 応答・履歴双方で共通利用する
 */
export function generateEcoWaterCertificateHashV1(input: {
  sitePrefix: string;
  timestamp: string;
  salt?: string;
  phBefore?: number;
  phAfter?: number;
}): {
  certificateHash: string;
  hashId: string;
  canonical: string;
  salt: string;
} {
  const { canonical, salt, siteKey } =
    buildEcoWaterCertCanonicalV1(input);
  // pH も結合して一意性を強化（上書きなし）
  const withPh = [
    canonical,
    input.phBefore != null ? String(input.phBefore) : "",
    input.phAfter != null ? String(input.phAfter) : "",
  ]
    .filter((p) => p !== "")
    .join("|");
  const certificateHash = sha256HexNodeV1(withPh);
  const hashId = formatEcoWaterHashIdV1(certificateHash, siteKey);
  return { certificateHash, hashId, canonical, salt };
}

/**
 * pH が中和完了（約 7.2）に到達したか
 */
export function isEcoWaterNeutralCompletePhV1(ph: number): boolean {
  const n = Number(ph);
  if (!Number.isFinite(n)) return false;
  return (
    Math.abs(n - ECO_WATER_NEUTRAL_TARGET_PH_V1) <=
    ECO_WATER_NEUTRAL_TOLERANCE_V1
  );
}
