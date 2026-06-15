/** 案件表示名 — customerName → clientName → companyName → projectName → siteName → title → 未設定 */

const CORRUPT_QMARK_RE = /^\?{3,}$/;
const CORRUPT_QMARK_RUN_RE = /\?{3,}/g;

function isCorruptQuestionMarkText(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return false;
  return CORRUPT_QMARK_RE.test(trimmed) || CORRUPT_QMARK_RUN_RE.test(trimmed);
}

function stripCorruptQuestionMarkRuns(value) {
  return String(value ?? "")
    .replace(CORRUPT_QMARK_RUN_RE, "")
    .trim();
}

function pickDisplayNameCandidate(...values) {
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) continue;
    if (CORRUPT_QMARK_RE.test(trimmed)) continue;
    const cleaned = stripCorruptQuestionMarkRuns(trimmed);
    if (cleaned) return cleaned;
  }
  return null;
}

export function resolveProjectDisplayName(fields, fallback = "未設定") {
  return (
    pickDisplayNameCandidate(
      fields?.customerName,
      fields?.customer_name,
      fields?.clientName,
      fields?.companyName,
      fields?.projectName,
      fields?.siteName,
      fields?.title
    ) ?? fallback
  );
}
