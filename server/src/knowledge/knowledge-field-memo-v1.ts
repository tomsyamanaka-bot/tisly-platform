/** Knowledge Field UX V1 — 現場メモからのルールベース単語分解（AI 未使用） */

const FIELD_MEMO_STOP_WORDS = new Set([
  "の",
  "を",
  "に",
  "は",
  "が",
  "で",
  "と",
  "か",
  "確認",
  "確認したい",
  "したい",
  "など",
  "機器",
  "装置",
  "回路",
  "使用",
  "使用する",
]);

const FIELD_MEMO_PATTERNS: RegExp[] = [
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
  /5\.5\s*kW/gi,
];

/** 現場メモ文から検索キーワードを抽出 */
export function tokenizeFieldMemoV1(text: string): string[] {
  const raw = String(text ?? "").trim();
  if (!raw) return [];

  const tokens: string[] = [];
  let remaining = raw;

  for (const pattern of FIELD_MEMO_PATTERNS) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(remaining)) !== null) {
      const value = match[0].replace(/\s+/g, "").trim();
      if (value) tokens.push(value);
    }
  }

  const segments = remaining
    .replace(/[、。．，,.!?！？]/g, " ")
    .split(/(?:の|で|を|に|は|が|と|か|して|したい|など|確認)+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);

  for (const seg of segments) {
    if (FIELD_MEMO_STOP_WORDS.has(seg)) continue;
    const cleaned = seg.replace(/(機器|装置|回路)$/u, "").trim();
    const token = cleaned.length >= 2 ? cleaned : seg;
    if (token.length >= 2 && !FIELD_MEMO_STOP_WORDS.has(token)) {
      tokens.push(token);
    }
  }

  return [...new Set(tokens.map((t) => t.trim()).filter(Boolean))];
}
