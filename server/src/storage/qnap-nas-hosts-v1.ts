/**
 * 社内マルチ NAS 固定ホスト（見積書・請求書 vs システム）
 *
 * - nastoms (192.168.1.134) … 見積書・請求書 PDF の保存先
 * - TiSLYNAS (192.168.1.10) … 将来のシステムデータ・ログ保管（MotherShip）
 */

/** 書類保存用 NAS（見積書・請求書 PDF） */
export const DOCUMENT_NAS_NAME = "nastoms";
export const DOCUMENT_NAS_HOST = "192.168.1.134";
/** WebDAV 未設定時のデフォルトポート（QNAP 標準 HTTP / Web 管理） */
export const DOCUMENT_NAS_DEFAULT_PORT = 8080;
/** スマートポートフォールバック候補（設定値の次） */
export const DOCUMENT_NAS_FALLBACK_PORTS = [5000, 5006, 8080, 55222] as const;
export const DOCUMENT_NAS_SHARE = "TiSLY";

/** システム用 NAS（MotherShip / 将来の TiSLY システムデータ） */
export const SYSTEM_NAS_NAME = "TiSLYNAS";
export const SYSTEM_NAS_HOST = "192.168.1.10";

export const DOCUMENT_NAS_LABEL =
  `書類保存用NAS (${DOCUMENT_NAS_NAME}): ${DOCUMENT_NAS_HOST}（見積書・請求書PDFの保存先）`;

export const SYSTEM_NAS_LABEL =
  `システム用NAS (${SYSTEM_NAS_NAME}): ${SYSTEM_NAS_HOST}（将来のTiSLYシステムデータ・ログ保管用）`;

/** 5006 / 5001 / 443 は HTTPS WebDAV */
export function webDavProtocolForPort(port: number): "http" | "https" {
  const p = Number(port);
  if (p === 443 || p === 5001 || p === 5006) return "https";
  return "http";
}

/** 成功トースト用 — 保存先ホスト:ポートが分かる文言 */
export function documentNasSaveSuccessMessage(
  host = DOCUMENT_NAS_HOST,
  port?: number | null
): string {
  const h = String(host || DOCUMENT_NAS_HOST).trim() || DOCUMENT_NAS_HOST;
  const p = Number(port);
  const hostPart =
    Number.isFinite(p) && p > 0
      ? `${h}:${p}`
      : `${h}:${DOCUMENT_NAS_DEFAULT_PORT}`;
  return `${DOCUMENT_NAS_NAME} (${hostPart}) へ見積書・請求書を保存しました`;
}

/**
 * ポート候補順: 設定値 → 5000 → 5006 → 8080 → 55222
 */
export function listDocumentNasPortCandidates(
  configuredPort?: number | null
): number[] {
  const configured = Number(configuredPort);
  const configuredOk =
    Number.isFinite(configured) && configured > 0 ? configured : null;
  const order = [
    configuredOk,
    DOCUMENT_NAS_DEFAULT_PORT,
    ...DOCUMENT_NAS_FALLBACK_PORTS,
  ];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const p of order) {
    const n = Number(p);
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * ローカル Wi-Fi 向けホスト解決。
 * 優先: 明示 host → QNAP_LOCAL_HOST → 書類用デフォルト
 */
export function resolveDocumentNasLocalHost(
  explicitHost?: string | null
): string {
  const fromArg = String(explicitHost || "").trim();
  if (fromArg) return fromArg;
  const fromEnv = String(process.env.QNAP_LOCAL_HOST || "").trim();
  if (fromEnv) return fromEnv;
  return DOCUMENT_NAS_HOST;
}

export function resolveDocumentNasLocalPort(
  explicitPort?: number | null
): number {
  const n = Number(explicitPort);
  if (Number.isFinite(n) && n > 0) return n;
  const fromEnv = Number(process.env.QNAP_LOCAL_PORT || "");
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return DOCUMENT_NAS_DEFAULT_PORT;
}
