/** TiSLY Knowledge Automation Engine v1 — 写真 OCR（エンジン差し替え可能） */

import type {
  KnowledgePhotoOcrExtractV1,
  KnowledgePhotoOcrTypeV1,
} from "./knowledge-automation-types.js";

export interface PhotoOcrInputV1 {
  photoId: string;
  photoKind: "survey" | "completion";
  photoType?: KnowledgePhotoOcrTypeV1;
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
  /\b(?:DS|IPC|NVR|DVR|FX|Q|i-PRO|WV|Vivotek|Axis|Hikvision|Dahua|TP-Link|Ubiquiti|Buffalo|QNAP|Synology)[- ]?[A-Z0-9][A-Z0-9\-_/]{2,}\b/gi;
const PART_RE = /\b(?:型番|品番|モデル)[：:\s]*([A-Z0-9][A-Z0-9\-_/]{2,})\b/gi;
const BREAKER_RE = /\b(\d{1,3})\s*[Aa]\b|\b(\d{1,3})A\s*(?:ブレーカ|breaker|MCCB|ELB)\b/gi;
const CAPACITY_RE = /\b(\d+(?:\.\d+)?)\s*(GB|TB|Ah|mAh|VA|W|kW)\b/gi;
const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const PORT_RE = /\b(?:port|ポート)[：:\s#]*(\d{2,5})\b/gi;
const MANUFACTURER_RE =
  /\b(Hikvision|Dahua|Axis|i-PRO|Panasonic|Vivotek|Buffalo|TP-Link|Ubiquiti|Cisco|Netgear|QNAP|Synology|三菱|Mitsubishi|オムロン|Omron)\b/gi;

const DEVICE_KEYWORDS = ["盤", "ラック", "NVR", "スイッチ", "PoE", "配電", "ブレーカ", "カメラ", "Hub", "ルータ"];

const PHOTO_TYPE_KEYWORDS: Record<KnowledgePhotoOcrTypeV1, RegExp[]> = {
  panel: [/盤|配電|ラック|cabinet|panel/i],
  breaker: [/ブレーカ|breaker|MCCB|ELB|分電/i],
  model_label: [/型番|品番|label|ラベル|シリアル/i],
  camera_body: [/カメラ|camera|cctv|防犯/i],
  router_nvr: [/nvr|dvr|router|ルータ|recorder|スイッチ/i],
  unknown: [],
};

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
}

function collectRawText(input: PhotoOcrInputV1): string {
  return [input.title, input.comment, input.fileName, input.url].filter(Boolean).join(" ");
}

export function inferPhotoOcrTypeV1(input: PhotoOcrInputV1): KnowledgePhotoOcrTypeV1 {
  if (input.photoType && input.photoType !== "unknown") return input.photoType;
  const text = collectRawText(input);
  for (const [type, patterns] of Object.entries(PHOTO_TYPE_KEYWORDS) as Array<
    [KnowledgePhotoOcrTypeV1, RegExp[]]
  >) {
    if (type === "unknown") continue;
    if (patterns.some((re) => re.test(text))) return type;
  }
  return "unknown";
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

function extractCapacities(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(CAPACITY_RE)) {
    if (m[0]) found.push(m[0].trim());
  }
  return uniqueStrings(found);
}

function extractManufacturers(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(MANUFACTURER_RE)) {
    if (m[0]) found.push(m[0].trim());
  }
  return uniqueStrings(found);
}

function extractIpAddresses(text: string): string[] {
  return uniqueStrings(text.match(IP_RE) ?? []);
}

function extractPortNumbers(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(PORT_RE)) {
    if (m[1]) found.push(m[1]);
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

function buildExtract(
  input: PhotoOcrInputV1,
  engine: string,
  overrides?: Partial<KnowledgePhotoOcrExtractV1>
): KnowledgePhotoOcrExtractV1 {
  const rawText = collectRawText(input);
  const photoType = inferPhotoOcrTypeV1(input);
  return {
    modelNumbers: extractModelNumbers(rawText),
    partNumbers: extractPartNumbers(rawText),
    breakerCapacities: extractBreakerCapacities(rawText),
    deviceNames: extractDeviceNames(rawText, input.title),
    capacities: extractCapacities(rawText),
    manufacturers: extractManufacturers(rawText),
    ipAddresses: extractIpAddresses(rawText),
    portNumbers: extractPortNumbers(rawText),
    rawText,
    engine,
    photoType,
    ...overrides,
  };
}

/** v1 デフォルト — メタデータ + 正規表現（将来 Tesseract 等に差し替え） */
export class RuleBasedPhotoOcrEngineV1 implements PhotoOcrEngineV1 {
  readonly name = "rule_based_v1";

  async extract(input: PhotoOcrInputV1): Promise<KnowledgePhotoOcrExtractV1> {
    return buildExtract(input, this.name);
  }
}

/** 差し替え用ダミー — 本番 OCR 未接続時のプレースホルダ */
export class DummyPhotoOcrEngineV1 implements PhotoOcrEngineV1 {
  readonly name = "dummy_v1";

  async extract(input: PhotoOcrInputV1): Promise<KnowledgePhotoOcrExtractV1> {
    const photoType = inferPhotoOcrTypeV1(input);
    const base = buildExtract(input, this.name);
    return {
      ...base,
      rawText: base.rawText || `[dummy OCR] ${photoType} photo ${input.photoId}`,
      modelNumbers: base.modelNumbers.length ? base.modelNumbers : photoType === "model_label" ? ["DUMMY-MODEL-001"] : [],
      manufacturers: base.manufacturers.length ? base.manufacturers : [],
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
    ...(extract.photoType && extract.photoType !== "unknown" ? [extract.photoType] : []),
    ...extract.modelNumbers,
    ...extract.partNumbers,
    ...extract.breakerCapacities,
    ...extract.capacities,
    ...extract.manufacturers,
    ...extract.ipAddresses,
    ...extract.deviceNames,
  ]);
}

export function buildOcrCandidateSummaryV1(extract: KnowledgePhotoOcrExtractV1): string {
  const parts = [
    extract.photoType && extract.photoType !== "unknown" ? `種別: ${extract.photoType}` : "",
    extract.modelNumbers.length ? `型番: ${extract.modelNumbers.join("、")}` : "",
    extract.manufacturers.length ? `メーカー: ${extract.manufacturers.join("、")}` : "",
    extract.ipAddresses.length ? `IP: ${extract.ipAddresses.join("、")}` : "",
    extract.portNumbers.length ? `Port: ${extract.portNumbers.join("、")}` : "",
    extract.breakerCapacities.length ? `ブレーカ: ${extract.breakerCapacities.join("、")}` : "",
    extract.capacities.length ? `容量: ${extract.capacities.join("、")}` : "",
    extract.deviceNames.length ? `機器: ${extract.deviceNames.join("、")}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "写真メタデータから候補を生成（OCR v1）";
}

export { PHOTO_TYPE_KEYWORDS };
