/** DB破損（????? 等）テキスト — 見積・請求 PDF 表示用 */

const CORRUPT_QMARK_RE = /^\?{3,}$/;
const CORRUPT_QMARK_RUN_RE = /\?{3,}/g;

export function isCorruptQuestionMarkText(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return false;
  return CORRUPT_QMARK_RE.test(trimmed) || CORRUPT_QMARK_RUN_RE.test(trimmed);
}

function stripCorruptQuestionMarkRuns(value: string): string {
  return value.replace(CORRUPT_QMARK_RUN_RE, "").trim();
}

function isUnsafePdfText(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  return !trimmed || isCorruptQuestionMarkText(trimmed);
}

/** 宛名・件名・作業場所 — 空/破損時は fallback（既定: 未設定） */
export function sanitizePdfRequiredField(
  value: string | null | undefined,
  fallback = "未設定"
): string {
  if (isUnsafePdfText(value)) return fallback;
  const cleaned = stripCorruptQuestionMarkRuns((value ?? "").trim());
  return cleaned || fallback;
}

/** @deprecated sanitizePdfRequiredField を使用 */
export function sanitizePdfDisplayText(
  value: string | null | undefined,
  fallback = "未設定"
): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return fallback;
  if (isCorruptQuestionMarkText(trimmed)) return fallback;
  return trimmed;
}

/** 備考 — 空/破損時は空欄（備考ブロック非表示） */
export function sanitizePdfNotesText(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed || isCorruptQuestionMarkText(trimmed)) return "";
  return trimmed;
}

/** 明細項目名 — 空/破損時は「作業一式」 */
export function sanitizePdfItemText(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed || isCorruptQuestionMarkText(trimmed)) return "作業一式";
  const lines = trimmed
    .split(/\n/)
    .map((line) => stripCorruptQuestionMarkRuns(line.trim()))
    .filter(Boolean);
  return lines.join("\n") || "作業一式";
}
