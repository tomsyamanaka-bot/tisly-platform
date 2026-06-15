/** DB破損（????? 等）テキスト — 見積・請求 PDF / 一覧 UI 表示用 */

const CORRUPT_QMARK_RE = /^\?{3,}$/;
const CORRUPT_QMARK_RUN_RE = /\?{3,}/g;

export interface ProjectDisplayNameFields {
  customerName?: string | null;
  customer_name?: string | null;
  clientName?: string | null;
  companyName?: string | null;
  projectName?: string | null;
  siteName?: string | null;
  title?: string | null;
}

function pickDisplayNameCandidate(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = (value ?? "").trim();
    if (!trimmed) continue;
    if (CORRUPT_QMARK_RE.test(trimmed)) continue;
    const cleaned = stripCorruptQuestionMarkRuns(trimmed);
    if (cleaned) return cleaned;
  }
  return null;
}

/** 一覧・詳細の表示名 — customerName → clientName → companyName → projectName → siteName → title → 未設定 */
export function resolveProjectDisplayName(
  fields: ProjectDisplayNameFields,
  fallback = "未設定"
): string {
  return (
    pickDisplayNameCandidate(
      fields.customerName,
      fields.customer_name,
      fields.clientName,
      fields.companyName,
      fields.projectName,
      fields.siteName,
      fields.title
    ) ?? fallback
  );
}

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
