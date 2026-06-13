/** DB破損（????? 等）テキスト — 見積・請求 PDF 表示用 */

const CORRUPT_QMARK_RE = /^\?{3,}$/;

export function isCorruptQuestionMarkText(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return false;
  return CORRUPT_QMARK_RE.test(trimmed);
}

/** 宛名・件名など — 破損時は「未設定」 */
export function sanitizePdfDisplayText(
  value: string | null | undefined,
  fallback = "未設定"
): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  if (isCorruptQuestionMarkText(trimmed)) return fallback;
  return trimmed;
}

/** 備考 — 破損時は空欄 */
export function sanitizePdfNotesText(value: string | null | undefined): string {
  return sanitizePdfDisplayText(value, "");
}

/** 明細項目名 — 破損時は空（行除外） */
export function sanitizePdfItemText(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed || isCorruptQuestionMarkText(trimmed)) return "";
  return trimmed.split(/\n/).map((line) => {
    const t = line.trim();
    if (!t || isCorruptQuestionMarkText(t)) return "";
    return t;
  }).filter(Boolean).join("\n");
}
