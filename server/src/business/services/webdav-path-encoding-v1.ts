/**
 * WebDAV パスエンコード v1
 * QNAP WebDAV 向けにパスセグメントを個別エンコードする
 */

/** スラッシュは維持し、各セグメントのみ encodeURIComponent */
export function encodeWebDavPath(remotePath: string): string {
  return remotePath
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

/**
 * WebDAV ベース URL に共有名が含まれる場合、
 * リモートキー先頭の重複共有名を除去する
 */
export function stripDuplicateWebDavSharePrefix(
  webDavBaseUrl: string,
  remotePath: string
): string {
  const key = remotePath.replace(/^\/+/, "");
  if (!key) return key;

  try {
    const urlPath = new URL(webDavBaseUrl).pathname.replace(/\/+$/, "");
    const segments = urlPath.split("/").filter(Boolean);
    const shareName = segments[segments.length - 1];
    if (!shareName) return key;

    const shareLower = shareName.toLowerCase();
    if (key.toLowerCase() === shareLower) return "";
    if (key.toLowerCase().startsWith(`${shareLower}/`)) {
      return key.slice(shareName.length + 1);
    }
  } catch {
    /* 無効 URL はそのまま */
  }

  return key;
}

/** エンコード済みフル URL を組み立てる */
export function buildWebDavFullUrl(webDavBaseUrl: string, remotePath: string): string {
  const base = webDavBaseUrl.replace(/\/+$/, "");
  const objectKey = stripDuplicateWebDavSharePrefix(base, remotePath);
  const encoded = encodeWebDavPath(objectKey);
  return encoded ? `${base}/${encoded}` : base;
}

/** MKCOL / PUT 成功とみなす HTTP ステータス */
export function isWebDavMkcolSuccessStatus(status: number): boolean {
  return status === 201 || status === 405 || status === 409;
}
