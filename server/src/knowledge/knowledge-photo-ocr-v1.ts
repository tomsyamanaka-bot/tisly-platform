/** TiSLY Knowledge Automation Engine v1 — 写真 OCR（エンジン差し替え可能） */

import type { KnowledgePhotoOcrExtractV1 } from "./knowledge-automation-types.js";

export interface PhotoOcrInputV1 {
  photoId: string;
  photoKind: "survey" | "completion";
  title?: string;
  comment?: string;
  fileName?: string;
  url?: string;
}

export interface PhotoOcrEngineV1 {
  readonly name: string;
  extract(input: PhotoOcrInputV1): Promise<KnowledgePhotoOcrExtractV1>;
}

const MODEL_RE =
  /\b(?:DS|IPC|NVR|DVR|FX|Q|i-PRO|WV|Vivotek|Axis)[- ]?[A-Z0-9][A-Z0-9\-_/]{2,}\b/gi;
const PART_RE = /\b(?:型番|品番|モデル)[：:\s]*([A-Z0-9][A-Z0-9\-_/]{2,})\b/gi;
const BREAKER_RE = /\b(\d{1,3})\s*[Aa]\b|\b(\d{1,3})A\s*(?:ブレーカ|breaker|MCCB|ELB)\b/gi;
const DEVICE_KEYWORDS = ["盤", "ラック", "NVR", "スイッチ", "PoE", "配電", "ブレーカ", "カメラ", "Hub", "ルータ"];

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
}

function collectRawText(input: PhotoOcrInputV1): string {
  return [input.title, input.comment, input.fileName, input.url].filter(Boolean).join(" ");
}

function extractModelNumbers(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(MODEL_RE)) {
    if (m[0]) found.push(m[0].trim());
  }
  for (const m of text.matchAll(PART_RE)) {
    if (m[1]) found.push(m[1].trim());
  }
  return uniqueStrings(found);
}

function extractPartNumbers(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(PART_RE)) {
    if (m[1]) found.push(m[1].trim());
  }
  return uniqueStrings(found);
}

function extractBreakerCapacities(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(BREAKER_RE)) {
    const val = m[1] ?? m[2];
    if (val) found.push(`${val}A`);
  }
  return uniqueStrings(found);
}

function extractDeviceNames(text: string, title?: string): string[] {
  const found: string[] = [];
  if (title?.trim()) found.push(title.trim());
  for (const kw of DEVICE_KEYWORDS) {
    if (text.includes(kw)) found.push(kw);
  }
  return uniqueStrings(found);
}

/** v1 デフォルト — メタデータ + 正規表現（将来 Tesseract 等に差し替え） */
export class RuleBasedPhotoOcrEngineV1 implements PhotoOcrEngineV1 {
  readonly name = "rule_based_v1";

  async extract(input: PhotoOcrInputV1): Promise<KnowledgePhotoOcrExtractV1> {
    const rawText = collectRawText(input);
    return {
      modelNumbers: extractModelNumbers(rawText),
      partNumbers: extractPartNumbers(rawText),
      breakerCapacities: extractBreakerCapacities(rawText),
      deviceNames: extractDeviceNames(rawText, input.title),
      rawText,
      engine: this.name,
    };
  }
}

let activeOcrEngine: PhotoOcrEngineV1 = new RuleBasedPhotoOcrEngineV1();

export function getPhotoOcrEngineV1(): PhotoOcrEngineV1 {
  return activeOcrEngine;
}

export function setPhotoOcrEngineV1(engine: PhotoOcrEngineV1): void {
  activeOcrEngine = engine;
}

export async function runPhotoOcrV1(input: PhotoOcrInputV1): Promise<KnowledgePhotoOcrExtractV1> {
  return getPhotoOcrEngineV1().extract(input);
}

export function buildOcrCandidateTagsV1(
  extract: KnowledgePhotoOcrExtractV1,
  projectNo: string
): string[] {
  return uniqueStrings([
    "自動収集",
    "OCR",
    projectNo,
    ...extract.modelNumbers,
    ...extract.partNumbers,
    ...extract.breakerCapacities,
    ...extract.deviceNames,
  ]);
}

export function buildOcrCandidateSummaryV1(extract: KnowledgePhotoOcrExtractV1): string {
  const parts = [
    extract.modelNumbers.length ? `型番: ${extract.modelNumbers.join("、")}` : "",
    extract.partNumbers.length ? `品番: ${extract.partNumbers.join("、")}` : "",
    extract.breakerCapacities.length ? `ブレーカ: ${extract.breakerCapacities.join("、")}` : "",
    extract.deviceNames.length ? `機器: ${extract.deviceNames.join("、")}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "写真メタデータから候補を生成（OCR v1）";
}
