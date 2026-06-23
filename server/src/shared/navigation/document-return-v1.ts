/**
 * 書類閲覧画面の戻り先 — history.back() を使わない
 */

export const DOCUMENT_CENTER_FALLBACK_V1 = "/document-center-v1";

export function resolveDocumentReturnUrlV1(opts: {
  returnUrl?: string | null;
  returnParam?: string | null;
  projectId?: string | null;
}): string {
  const raw = String(opts.returnUrl ?? opts.returnParam ?? "").trim();
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }
  if (opts.projectId) {
    return `${DOCUMENT_CENTER_FALLBACK_V1}?projectId=${encodeURIComponent(opts.projectId)}`;
  }
  return DOCUMENT_CENTER_FALLBACK_V1;
}
