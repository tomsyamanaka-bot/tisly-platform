/**
 * 社内マルチ NAS 固定ホスト（見積書・請求書 vs システム）
 *
 * - nastoms (192.168.1.134) … 見積書・請求書 PDF の保存先
 * - TiSLYNAS (192.168.1.10) … 将来のシステムデータ・ログ保管（MotherShip）
 */

/** 書類保存用 NAS（見積書・請求書 PDF） */
export const DOCUMENT_NAS_NAME = "nastoms";
export const DOCUMENT_NAS_HOST = "192.168.1.134";
/** WebDAV 未設定時のデフォルトポート（8080 管理/WebDAV 優先） */
export const DOCUMENT_NAS_DEFAULT_PORT = 8080;
/**
 * スマートポートフォールバック候補
 * http:8080（パス付き）→ http:5005 → https:5006 → http:5000
 */
export const DOCUMENT_NAS_FALLBACK_PORTS = [8080, 5005, 5006, 5000] as const;
export const DOCUMENT_NAS_SHARE = "TiSLY";
/** 8080 向け WebDAV ルートパス候補 */
export const DOCUMENT_NAS_WEBDAV_PATHS = ["/", "/Public/", "/TiSLY/"] as const;

/** システム用 NAS（MotherShip / 将来の TiSLY システムデータ） */
export const SYSTEM_NAS_NAME = "TiSLYNAS";
export const SYSTEM_NAS_HOST = "192.168.1.10";

export const DOCUMENT_NAS_LABEL =
  `書類保存用NAS (${DOCUMENT_NAS_NAME}): ${DOCUMENT_NAS_HOST}（見積書・請求書PDFの保存先）`;

export const SYSTEM_NAS_LABEL =
  `システム用NAS (${SYSTEM_NAS_NAME}): ${SYSTEM_NAS_HOST}（将来のTiSLYシステムデータ・ログ保管用）`;

/** 5006 / 5001 / 443 は HTTPS WebDAV（5005 は HTTP） */
export function webDavProtocolForPort(port: number): "http" | "https" {
  const p = Number(port);
  if (p === 443 || p === 5001 || p === 5006) return "https";
  return "http";
}

/** 書類保存先フォルダ（nastoms /TiSLY 共有上） */
export const DOCUMENT_NAS_SAVE_FOLDER = "Invoices_Estimates";
export const DOCUMENT_NAS_SAVE_ABSOLUTE_PREFIX = "/TiSLY/Invoices_Estimates";
export const DOCUMENT_NAS_SAVE_PUBLIC_ABSOLUTE_PREFIX =
  "/Public/TiSLY/Invoices_Estimates";

/** 接続成功トースト — nastoms への接続に成功しました（ポート N） */
export function documentNasConnectSuccessMessage(
  port?: number | null
): string {
  const p = Number(port);
  const portNum =
    Number.isFinite(p) && p > 0 ? p : DOCUMENT_NAS_DEFAULT_PORT;
  return `${DOCUMENT_NAS_NAME} への接続に成功しました（ポート ${portNum}）`;
}

/** 見積・請求 PDF の QNAP 保存成功トースト（絶対パス付き） */
export function documentNasPdfSaveSuccessMessage(
  absolutePaths?: string | string[] | null
): string {
  const paths = Array.isArray(absolutePaths)
    ? absolutePaths.map((p) => String(p || "").trim()).filter(Boolean)
    : String(absolutePaths || "")
        .trim()
        ? [String(absolutePaths).trim()]
        : [];
  if (paths.length > 0) {
    return `QNAP保存成功: ${paths.join(" / ")}`;
  }
  return "QNAP保存成功";
}

/** リモート全滅時のローカル一時保存トースト */
export function documentNasPdfSavePendingMessage(): string {
  return "一時保存完了（QNAPへ自動同期待ち）";
}

/** API が保存をバックグラウンド開始した直後の応答メッセージ */
export function documentNasPdfSaveAcceptedMessage(): string {
  return "QNAPへの保存処理を開始しました（キュー保存完了）";
}

/** PWA 即時フィードバック（保存要求受付） */
export function documentNasPdfSaveRequestSentMessage(): string {
  return `${DOCUMENT_NAS_NAME} へ保存要求を送信しました`;
}

/**
 * 成功トースト（保存完了）
 * — 見積一覧 QNAP 保存は documentNasPdfSaveSuccessMessage を優先
 */
export function documentNasSaveSuccessMessage(
  _host = DOCUMENT_NAS_HOST,
  _port?: number | null,
  folderPath?: string | null
): string {
  return documentNasPdfSaveSuccessMessage(folderPath);
}

/**
 * ポート候補順: 8080 → 5005 → 5006 → 5000（設定値は先頭付近に挿入）
 */
export function listDocumentNasPortCandidates(
  configuredPort?: number | null
): number[] {
  const configured = Number(configuredPort);
  const configuredOk =
    Number.isFinite(configured) && configured > 0 ? configured : null;
  const order = [
    ...DOCUMENT_NAS_FALLBACK_PORTS,
    configuredOk,
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
  const fromLocal = Number(process.env.QNAP_LOCAL_PORT || "");
  if (Number.isFinite(fromLocal) && fromLocal > 0) return fromLocal;
  // 互換: QNAP_PORT（ユーザー指定・デプロイ用エイリアス）
  const fromPort = Number(process.env.QNAP_PORT || "");
  if (Number.isFinite(fromPort) && fromPort > 0) return fromPort;
  return DOCUMENT_NAS_DEFAULT_PORT;
}

/**
 * VPS→QNAP プロキシ失敗時の現場向けメッセージ。
 * スマホは CORS/Mixed Content を避けて VPS API のみ叩く前提。
 */
export function formatVpsToQnapProxyError(
  host: string,
  port: number | null | undefined,
  errorCode: string,
  detail?: string | null
): string {
  const h = String(host || DOCUMENT_NAS_HOST).trim() || DOCUMENT_NAS_HOST;
  const p = Number(port);
  const dest =
    Number.isFinite(p) && p > 0 ? `${h}:${p}` : h;
  const code = String(errorCode || "").trim();
  const extra = String(detail || "").trim();

  if (code === "ETIMEDOUT" || /timeout/i.test(code)) {
    return `VPSから ${DOCUMENT_NAS_NAME} への接続がタイムアウトしました。Tailscale / LAN接続状態を確認してください`;
  }
  if (code === "ECONNREFUSED" || code === "ALL_PORTS_REFUSED") {
    const base = `QNAP (${h}) の WebDAV サービスが有効になっているか、QNAPコントロールパネルをご確認ください`;
    if (extra && (extra.includes("=") || extra.includes("不通") || extra.includes(":"))) {
      return `${base}｜${extra}`;
    }
    return base;
  }
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH") {
    return `VPSから${dest}へ到達できません。VPN（Tailscale）やルーティングを確認してください`;
  }
  if (code === "ENOTFOUND") {
    return `VPSから${dest}のホスト名を解決できません。IP・DNSを確認してください`;
  }
  if (code === "401 Unauthorized" || code === "403 Forbidden") {
    return "QNAP認証エラー: ストレージ設定画面で QNAP (nastoms) のログインパスワードを確認・入力してください";
  }
  if (code === "404 Not Found") {
    return "保存先の共有フォルダ（例: /Invoices_Estimates/）が存在しません";
  }
  if (code === "TLS_CERT") {
    return `VPSから${dest}へのTLS証明書検証に失敗しました。QNAP_WEBDAV_TLS_INSECURE を確認してください`;
  }
  if (code === "NOT_CONFIGURED") {
    return "QNAP接続情報が未設定です。ストレージ設定または QNAP_WEBDAV_URL / QNAP_LOCAL_HOST を確認してください";
  }
  if (extra && !extra.includes(`VPSから${dest}`)) {
    return `VPSから${dest}へのQNAP保存に失敗しました（${code || "ERROR"}）: ${extra}`;
  }
  return (
    extra ||
    `VPSから${dest}へのQNAP保存に失敗しました。IP・VPN・QNAPのWebDAV有効化を確認してください`
  );
}
