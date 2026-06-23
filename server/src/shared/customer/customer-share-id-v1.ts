/**
 * お客様ポータル shareId エンコード — URL 安全な案件参照
 */

export function encodeCustomerShareIdV1(projectRef: string): string {
  return Buffer.from(String(projectRef ?? "").trim(), "utf8").toString("base64url");
}

export function decodeCustomerShareIdV1(shareId: string): string {
  const raw = String(shareId ?? "").trim();
  if (!raw) return "";
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    if (decoded && decoded.length >= 2) return decoded;
  } catch {
    /* fall through */
  }
  return raw;
}
