/**
 * QNAP WebDAV HTTP Basic 認証の解決・ヘッダー生成（v1）
 *
 * 優先順（ユーザー）:
 *   QNAP_USER → QNAP_WEBDAV_USER → QNAP_USERNAME → ストレージ設定 → 既定 tomsadmin
 * 優先順（パスワード）:
 *   QNAP_PASSWORD → QNAP_WEBDAV_PASSWORD → ストレージ設定 → 空
 *
 * ユーザーが解決できれば Authorization: Basic を付与。
 * ユーザーもパスワードも無い場合のみ認証なし（ヘッダー省略）。
 */

export const QNAP_DEFAULT_BASIC_USER = "tomsadmin";

export const QNAP_AUTH_ERROR_TOAST =
  "QNAP認証エラー: ストレージ設定画面で QNAP (nastoms) のログインパスワードを確認・入力してください";

export type QnapBasicAuthCredentialsV1 = {
  username: string;
  password: string;
  /** Authorization ヘッダーを付与するか */
  hasAuth: boolean;
  source: "env" | "settings" | "default" | "none";
};

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const v of values) {
    const t = String(v ?? "").trim();
    if (t) return t;
  }
  return "";
}

/** 環境変数・設定から Basic 認証用ユーザー/パスを解決 */
export function resolveQnapBasicAuthCredentials(opts?: {
  settingsUsername?: string | null;
  settingsPassword?: string | null;
  /** false のとき既定ユーザー tomsadmin を使わない（明示的な未設定検知用） */
  allowDefaultUser?: boolean;
}): QnapBasicAuthCredentialsV1 {
  const allowDefault = opts?.allowDefaultUser !== false;
  const envUser = firstNonEmpty(
    process.env.QNAP_USER,
    process.env.QNAP_WEBDAV_USER,
    process.env.QNAP_USERNAME
  );
  const envPass = firstNonEmpty(
    process.env.QNAP_PASSWORD,
    process.env.QNAP_WEBDAV_PASSWORD
  );
  const settingsUser = String(opts?.settingsUsername ?? "").trim();
  const settingsPass = String(opts?.settingsPassword ?? "");

  let username = envUser || settingsUser;
  let source: QnapBasicAuthCredentialsV1["source"] = "none";
  if (envUser) source = "env";
  else if (settingsUser) source = "settings";

  if (!username && allowDefault) {
    username = QNAP_DEFAULT_BASIC_USER;
    source = "default";
  }

  const password = envPass || settingsPass;
  if (!username && !password) {
    return { username: "", password: "", hasAuth: false, source: "none" };
  }

  // パスワードだけ環境変数、ユーザーは設定／既定、など混在を許容
  if (envPass && source === "none") source = "env";
  else if (settingsPass && (source === "none" || source === "default")) {
    if (source === "none") source = "settings";
  }

  return {
    username,
    password,
    hasAuth: Boolean(username),
    source,
  };
}

export function buildQnapBasicAuthHeader(
  username: string,
  password: string
): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

/** Fetch / WebDAV 用ヘッダー。認証情報が無ければ Authorization を付けない */
export function qnapBasicAuthHeaders(
  username: string,
  password: string,
  extra?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = { ...(extra || {}) };
  const user = String(username || "").trim();
  if (user) {
    headers.Authorization = buildQnapBasicAuthHeader(user, password ?? "");
  }
  return headers;
}

export function isQnapAuthHttpStatus(status: number | string | null | undefined): boolean {
  const n = Number(status);
  if (n === 401 || n === 403) return true;
  const s = String(status || "");
  return (
    s === "401 Unauthorized" ||
    s === "403 Forbidden" ||
    /401|unauthorized|403|forbidden/i.test(s)
  );
}
