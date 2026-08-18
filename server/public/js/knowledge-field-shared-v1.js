/** Knowledge Field UX V1 — 共有定数・現場メモ分解（AI 未使用） */

export const STORAGE_FIELD_FAVORITES = "tisly_knowledge_field_favorites_v1";
export const STORAGE_FIELD_RECENT = "tisly_knowledge_field_recent_v1";

export const DEFAULT_FIELD_FAVORITES = [
  "自己保持",
  "非常停止",
  "点滅",
  "タイマー",
  "インターロック",
  "5.5kW",
  "厨房機器",
  "PoEカメラ",
  "RP2350",
  "DINレール",
  "換気扇",
  "VVF2.0",
  "EVブレーカー",
  "自火報",
  "養殖DO",
];

export const EXAMPLE_SEARCHES = [
  "自己保持",
  "非常停止",
  "5.5kW",
  "厨房機器",
  "PoEカメラ",
  "RP2350",
  "DINレール",
  "換気扇",
  "VVF2.0",
  "pHセンサー",
  "クエン酸",
];

export const KIND_LAUNCHERS = [
  { label: "PLC", kinds: "plc", query: "PLC" },
  { label: "RP2350", kinds: "esp", query: "RP2350" },
  { label: "3DPrint", kinds: "3dprint", query: "3DPrint" },
  { label: "PDF", kinds: "pdf", query: "PDF" },
  { label: "写真", kinds: "photo", query: "写真" },
  { label: "案件", kinds: "project", query: "案件" },
];

export const CATEGORY_LAUNCHERS = [
  "防犯カメラ",
  "LAN",
  "Wi-Fi",
  "インターホン",
  "照明",
  "コンセント",
  "EV",
  "アンテナ",
  "エアコン",
  "厨房機器",
  "動力200V",
  "PLC",
  "TiSLY",
  "消防",
  "自火報",
  "養殖",
  "3DPrint",
  "Factory",
  "RP2350",
  "ESP",
  "Eco-Water",
];

export const KIND_LABELS = {
  knowledge_card: "カード",
  candidate: "候補",
  project: "案件",
  pdf: "PDF",
  photo: "写真",
  asset: "資産",
  plc: "PLC",
  esp: "ESP/RP",
  "3dprint": "3DPrint",
  factory: "Factory",
};

const MEMO_STOP = new Set([
  "の", "を", "に", "は", "が", "で", "と", "か",
  "確認", "確認したい", "したい", "など", "機器", "装置", "回路",
]);

const MEMO_PATTERNS = [
  /\d+\.?\d*\s*kW/gi,
  /\d+\.?\d*\s*A\b/gi,
  /\d+\.?\d*\s*V\b/gi,
  /VVF[\d.]+/gi,
  /PoE\s*カメラ/gi,
  /\bPoE\b/gi,
  /RP2350/gi,
  /ESP32/gi,
  /DIN\s*レール/gi,
  /EVブレーカー/gi,
  /自火報/gi,
  /\bDO\b/gi,
];

/** 現場メモから検索語をルールベースで抽出 */
export function tokenizeFieldMemo(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return [];

  const tokens = [];

  for (const pattern of MEMO_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    let m;
    while ((m = re.exec(raw)) !== null) {
      const v = m[0].replace(/\s+/g, "").trim();
      if (v) tokens.push(v);
    }
  }

  const segments = raw
    .replace(/[、。．，,.!?！？]/g, " ")
    .split(/(?:の|で|を|に|は|が|と|か|して|したい|など|確認)+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);

  for (const seg of segments) {
    if (MEMO_STOP.has(seg)) continue;
    const cleaned = seg.replace(/(機器|装置|回路)$/u, "").trim();
    const token = cleaned.length >= 2 ? cleaned : seg;
    if (token.length >= 2 && !MEMO_STOP.has(token)) tokens.push(token);
  }

  return [...new Set(tokens.map((t) => t.trim()).filter(Boolean))];
}

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getFieldFavorites() {
  const saved = readJson(STORAGE_FIELD_FAVORITES, null);
  if (Array.isArray(saved) && saved.length) return saved;
  return [...DEFAULT_FIELD_FAVORITES];
}

export function pushFieldRecent(q) {
  const trimmed = q.trim();
  if (!trimmed) return;
  let recent = readJson(STORAGE_FIELD_RECENT, []);
  recent = [trimmed, ...recent.filter((x) => x !== trimmed)].slice(0, 20);
  writeJson(STORAGE_FIELD_RECENT, recent);
}

export function hitFlags(hit) {
  return {
    photo: hit.kind === "photo" || (hit.tags || []).some((t) => /写真|photo/i.test(t)),
    pdf: hit.kind === "pdf" || Boolean(hit.openUrl?.includes("document-viewer")),
    plc: hit.kind === "plc",
    print3d: hit.kind === "3dprint" || (hit.fileFormats || []).some((f) => /stl|step|gcode/i.test(f)),
  };
}
