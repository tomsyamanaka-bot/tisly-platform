/**
 * 社内顧客管理向けログイン認証情報
 *
 * ハッシュは復元できないため、
 * 初期パスワード（デモ／テスター）と
 * 発行直後の平文のみを保持する。
 * 既存テナント配列は削除しない。
 */

import {
  TESTER_CUSTOMER_CODE_V1,
  TESTER_LOGIN_PASSWORD_V1,
  TESTER_USERNAME_V1,
} from "./tester-tenant-v1.js";

export const CUSTOMER_PORTAL_ENTRY_URL_V1 = "https://tisly.jp/customer";

export type CustomerLoginPasswordSourceV1 =
  | "seed-demo"
  | "tester"
  | "last-issued"
  | "unknown";

export interface CustomerLoginCredentialV1 {
  customerCode: string;
  username: string;
  password: string | null;
  passwordKnown: boolean;
  source: CustomerLoginPasswordSourceV1;
  portalUrl: string;
}

/** 顧客コード → ユーザー名 → 最終発行PW */
const LAST_ISSUED_PASSWORDS_V1: Record<string, Record<string, string>> = {};

function normalizeCodeV1(code: string | null | undefined): string {
  return String(code ?? "").trim().toUpperCase();
}

function normalizeUserV1(username: string | null | undefined): string {
  return String(username ?? "").trim().toLowerCase();
}

/** 正規顧客のデモ初期パスワード */
export function resolveCanonicalDemoPasswordV1(): string {
  const fromEnv = String(process.env.CUSTOMER_DEMO_PASSWORD ?? "").trim();
  return fromEnv || "demo-remote-2026";
}

/** テスター初期パスワード（ENV 優先） */
export function resolveTesterLoginPasswordV1(): string {
  const fromEnv = String(process.env.TESTER001_PASSWORD ?? "").trim();
  return fromEnv || TESTER_LOGIN_PASSWORD_V1;
}

/**
 * 発行・再発行した平文を記憶する。
 * 既存キーは上書きせずユーザー単位で追記。
 */
export function rememberIssuedPasswordV1(
  customerCode: string,
  username: string,
  password: string
): void {
  const code = normalizeCodeV1(customerCode);
  const user = normalizeUserV1(username);
  const pw = String(password ?? "");
  if (!code || !user || pw.length < 8) return;
  if (!LAST_ISSUED_PASSWORDS_V1[code]) {
    LAST_ISSUED_PASSWORDS_V1[code] = {};
  }
  LAST_ISSUED_PASSWORDS_V1[code][user] = pw;
  LAST_ISSUED_PASSWORDS_V1[code]["*"] = pw;
}

export function pickPrimaryUsernameV1(
  customerCode: string,
  usernames: string[]
): string {
  const code = normalizeCodeV1(customerCode);
  const names = usernames.map((n) => normalizeUserV1(n)).filter(Boolean);
  const lower = code.toLowerCase();
  const preferred = [
    `${lower}.admin`,
    `${lower}.owner`,
    TESTER_USERNAME_V1,
  ];
  for (const id of preferred) {
    if (names.includes(id)) return id;
  }
  return names[0] || `${lower}.owner`;
}

function resolveKnownPasswordV1(
  code: string,
  username: string
): { password: string | null; source: CustomerLoginPasswordSourceV1 } {
  const issuedUser = LAST_ISSUED_PASSWORDS_V1[code]?.[username];
  if (issuedUser) {
    return { password: issuedUser, source: "last-issued" };
  }
  const issuedAny = LAST_ISSUED_PASSWORDS_V1[code]?.["*"];
  if (issuedAny) {
    return { password: issuedAny, source: "last-issued" };
  }
  if (code === TESTER_CUSTOMER_CODE_V1) {
    return {
      password: resolveTesterLoginPasswordV1(),
      source: "tester",
    };
  }
  if (code === "TOMS001" || code === "TOYOSHIMA001") {
    return {
      password: resolveCanonicalDemoPasswordV1(),
      source: "seed-demo",
    };
  }
  return { password: null, source: "unknown" };
}

/** 詳細パネル用の認証3点を組み立てる */
export function resolveLoginCredentialV1(
  customerCode: string,
  usernames: string[]
): CustomerLoginCredentialV1 {
  const code = normalizeCodeV1(customerCode);
  const username = pickPrimaryUsernameV1(code, usernames);
  const known = resolveKnownPasswordV1(code, username);
  return {
    customerCode: code,
    username,
    password: known.password,
    passwordKnown: Boolean(known.password),
    source: known.source,
    portalUrl: CUSTOMER_PORTAL_ENTRY_URL_V1,
  };
}

/** 3点一括コピー用テキスト */
export function formatLoginBundleTextV1(
  cred: CustomerLoginCredentialV1
): string {
  const pw = cred.passwordKnown && cred.password
    ? cred.password
    : "（平文未保存・再発行で記録）";
  return [
    "【TiSLY 顧客入口】",
    `入口: ${CUSTOMER_PORTAL_ENTRY_URL_V1}`,
    `顧客コード: ${cred.customerCode}`,
    `ログインID: ${cred.username}`,
    `パスワード: ${pw}`,
  ].join("\n");
}
