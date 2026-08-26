/**
 * 通話テキストから予定・材料・メモを
 * JSON 構造化する（Gemini + ルールフォールバック）
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const DEFAULT_MODEL = "gemini-3.6-flash";

export interface VoiceCallScheduleV1 {
  title: string;
  startAt: string;
  endAt: string;
  location: string;
}

export interface VoiceCallMaterialV1 {
  label: string;
  quantity: number;
  unit: string;
  orderTask: boolean;
}

export interface VoiceCallMemoV1 {
  summary3Lines: string[];
  customerRequests: string[];
  decisions: string[];
}

export interface VoiceCallExtractionV1 {
  schedule: VoiceCallScheduleV1 | null;
  materials: VoiceCallMaterialV1[];
  memo: VoiceCallMemoV1;
  provider: "gemini" | "rule_based";
  locale: "JP" | "AU";
  currency: "JPY" | "AUD";
}

function envTrim(key: string, fallback = ""): string {
  return (process.env[key] ?? fallback).trim();
}

export function getVoiceCallGeminiApiKeyV1(): string {
  return envTrim("GEMINI_API_KEY");
}

export function getVoiceCallGeminiModelV1(): string {
  return envTrim(
    "GEMINI_VOICE_CALL_MODEL",
    envTrim("GEMINI_SKETCH_MODEL", DEFAULT_MODEL)
  );
}

const EXTRACT_PROMPT = [
  "あなたは電気・空調・防犯工事の現場通話要約AIです。",
  "入力は通話録音テキストまたは会話メモです。",
  "説明文や Markdown は出さず、JSON のみ返す。",
  "存在しない予定・材料を捏造しない。不明は空文字/空配列。",
  "日時は Asia/Tokyo の ISO8601（秒なし）で返す。",
  "出力形式:",
  '{',
  '  "schedule": {',
  '    "title": "件名",',
  '    "startAt": "2026-08-27T10:00",',
  '    "endAt": "2026-08-27T12:00",',
  '    "location": "現場名または住所"',
  "  },",
  '  "materials": [',
  '    { "label": "部材名", "quantity": 1, "unit": "本", "orderTask": true }',
  "  ],",
  '  "memo": {',
  '    "summary3Lines": ["要約1", "要約2", "要約3"],',
  '    "customerRequests": ["要望"],',
  '    "decisions": ["決定事項"]',
  "  }",
  "}",
  "schedule が無い場合は null。",
].join("\n");

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function addHours(isoLocal: string, hours: number): string {
  const d = new Date(isoLocal);
  if (Number.isNaN(d.getTime())) return isoLocal;
  d.setHours(d.getHours() + hours);
  return toLocalIso(d);
}

function parseJapaneseDateHint(text: string): string | null {
  const now = new Date();
  if (/明後日/.test(text)) {
    now.setDate(now.getDate() + 2);
    now.setHours(10, 0, 0, 0);
    return toLocalIso(now);
  }
  if (/明日/.test(text)) {
    now.setDate(now.getDate() + 1);
    now.setHours(10, 0, 0, 0);
    return toLocalIso(now);
  }
  const m = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    const y = now.getFullYear();
    const d = new Date(y, month - 1, day, 10, 0, 0, 0);
    return toLocalIso(d);
  }
  const iso = text.match(
    /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/
  );
  if (iso) {
    const hh = iso[4] != null ? Number(iso[4]) : 10;
    const mm = iso[5] != null ? Number(iso[5]) : 0;
    return `${iso[1]}-${iso[2]}-${iso[3]}T${pad2(hh)}:${pad2(mm)}`;
  }
  return null;
}

function extractMaterialsRuleBased(text: string): VoiceCallMaterialV1[] {
  const lines = text
    .split(/[\n、,．。;；]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const qtyRe =
    /(.+?)\s*(\d+(?:\.\d+)?)\s*(台|個|本|式|巻|箱|セット|枚|m|メートル|kg)?/i;
  const out: VoiceCallMaterialV1[] = [];
  for (const line of lines) {
    if (!/(材料|部材|ケーブル|センサー|カメラ|配管|発注|手配)/.test(line)) {
      const m = line.match(qtyRe);
      if (!m || m[1].length > 40) continue;
      if (!/(VVF|ケーブル|センサ|カメラ|配管|スイッチ|HUB|PoE)/i.test(line)) {
        continue;
      }
    }
    const m = line.match(qtyRe);
    if (!m) continue;
    out.push({
      label: m[1].replace(/^(材料|部材|発注)[:：\s]*/u, "").trim() || line,
      quantity: Number(m[2]) || 1,
      unit: m[3] || "式",
      orderTask: /発注|手配|注文/.test(line),
    });
  }
  return out.slice(0, 20);
}

function extractMemoRuleBased(text: string): VoiceCallMemoV1 {
  const chunks = text
    .split(/[\n。\.！!？?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const summary3Lines = chunks.slice(0, 3);
  while (summary3Lines.length < 3) {
    summary3Lines.push("");
  }
  const customerRequests = chunks.filter((c) =>
    /希望|お願い|要望|してほしい|ください/.test(c)
  );
  const decisions = chunks.filter((c) =>
    /決定|確定|それで|了承|OK|合意/.test(c)
  );
  return {
    summary3Lines: summary3Lines.map((s) => s.slice(0, 120)),
    customerRequests: customerRequests.slice(0, 8),
    decisions: decisions.slice(0, 8),
  };
}

export function extractVoiceCallRuleBasedV1(
  transcript: string,
  opts?: { locale?: "JP" | "AU"; currency?: "JPY" | "AUD" }
): VoiceCallExtractionV1 {
  const text = String(transcript ?? "").trim();
  const startAt = parseJapaneseDateHint(text);
  let schedule: VoiceCallScheduleV1 | null = null;
  if (startAt) {
    const titleMatch = text.match(
      /(現調|見積|工事|点検|設置|打合せ|訪問)[^\n]{0,30}/
    );
    const locMatch = text.match(
      /(?:現場|場所|住所)[:：\s]*([^\n、。]{2,40})/
    );
    schedule = {
      title: (titleMatch?.[0] || "通話後フォロー予定").trim(),
      startAt,
      endAt: addHours(startAt, 2),
      location: (locMatch?.[1] || "").trim(),
    };
  }
  return {
    schedule,
    materials: extractMaterialsRuleBased(text),
    memo: extractMemoRuleBased(text),
    provider: "rule_based",
    locale: opts?.locale === "AU" ? "AU" : "JP",
    currency: opts?.currency === "AUD" ? "AUD" : "JPY",
  };
}

function safeParseJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no json object");
  return JSON.parse(body.slice(start, end + 1));
}

function normalizeExtraction(
  raw: unknown,
  fallbackText: string,
  opts?: { locale?: "JP" | "AU"; currency?: "JPY" | "AUD" }
): VoiceCallExtractionV1 {
  const base = extractVoiceCallRuleBasedV1(fallbackText, opts);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  let schedule: VoiceCallScheduleV1 | null = null;
  if (r.schedule && typeof r.schedule === "object") {
    const s = r.schedule as Record<string, unknown>;
    const title = String(s.title ?? "").trim();
    const startAt = String(s.startAt ?? "").trim();
    const endAt = String(s.endAt ?? "").trim() || addHours(startAt, 2);
    const location = String(s.location ?? "").trim();
    if (title && startAt) {
      schedule = { title, startAt, endAt, location };
    }
  }
  const materials: VoiceCallMaterialV1[] = [];
  if (Array.isArray(r.materials)) {
    for (const item of r.materials) {
      if (!item || typeof item !== "object") continue;
      const m = item as Record<string, unknown>;
      const label = String(m.label ?? "").trim();
      if (!label) continue;
      materials.push({
        label,
        quantity: Number(m.quantity) || 1,
        unit: String(m.unit ?? "式").trim() || "式",
        orderTask: Boolean(m.orderTask),
      });
    }
  }
  const memoRaw =
    r.memo && typeof r.memo === "object"
      ? (r.memo as Record<string, unknown>)
      : {};
  const summary3Lines = Array.isArray(memoRaw.summary3Lines)
    ? memoRaw.summary3Lines.map((x) => String(x).trim()).filter(Boolean)
    : base.memo.summary3Lines;
  while (summary3Lines.length < 3) summary3Lines.push("");
  return {
    schedule: schedule ?? base.schedule,
    materials: materials.length > 0 ? materials : base.materials,
    memo: {
      summary3Lines: summary3Lines.slice(0, 3),
      customerRequests: Array.isArray(memoRaw.customerRequests)
        ? memoRaw.customerRequests.map((x) => String(x).trim()).filter(Boolean)
        : base.memo.customerRequests,
      decisions: Array.isArray(memoRaw.decisions)
        ? memoRaw.decisions.map((x) => String(x).trim()).filter(Boolean)
        : base.memo.decisions,
    },
    provider: "gemini",
    locale: opts?.locale === "AU" ? "AU" : "JP",
    currency: opts?.currency === "AUD" ? "AUD" : "JPY",
  };
}

export async function extractVoiceCallSummaryV1(
  transcript: string,
  opts?: { locale?: "JP" | "AU"; currency?: "JPY" | "AUD" }
): Promise<VoiceCallExtractionV1> {
  const text = String(transcript ?? "").trim();
  if (!text) {
    return extractVoiceCallRuleBasedV1("", opts);
  }
  const apiKey = getVoiceCallGeminiApiKeyV1();
  if (!apiKey) {
    return extractVoiceCallRuleBasedV1(text, opts);
  }
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: getVoiceCallGeminiModelV1(),
    });
    const result = await model.generateContent([
      { text: EXTRACT_PROMPT },
      { text: `通話テキスト:\n${text.slice(0, 12000)}` },
    ]);
    const rawText = result.response.text();
    const parsed = safeParseJson(rawText);
    return normalizeExtraction(parsed, text, opts);
  } catch {
    return extractVoiceCallRuleBasedV1(text, opts);
  }
}
