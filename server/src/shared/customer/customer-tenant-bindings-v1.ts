/**
 * 顧客テナント連動デバイス v1
 *
 * RP2350 / NVR 等の紐付けを JSON で保持。
 * 既存行は上書きせず merge 保存。
 */

import { getDatabase } from "../../db/database.js";

export interface CustomerTenantBindingsV1 {
  customerCode: string;
  /** 母屋 RP2350 deviceId */
  rp2350MainId?: string | null;
  /** はなれ RP2350 deviceId */
  rp2350DetachedId?: string | null;
  /** NVR ホスト名または IP */
  nvrHost?: string | null;
  nvrLabel?: string | null;
  /** H.View RTSP ベース（例: rtsp://192.168.1.50:554） */
  nvrRtspBase?: string | null;
  /**
   * Guard Viewer / EZCloud 共有プレビュー URL
   * （PWA iframe / Web 埋め込み用 · 方法A）
   */
  cloudStreamUrl?: string | null;
  /** cloudStreamUrl の別名（互換） */
  shareUrl?: string | null;
  /**
   * ネイティブアプリ起動用 URL
   * （ストアリンク / ディープリンク）
   */
  nvrAppOpenUrl?: string | null;
  updatedAt?: string;
}

/** 既定値（追記のみ — 既存テナントの参考） */
const DEFAULT_BINDINGS_V1: Record<
  string,
  Omit<CustomerTenantBindingsV1, "customerCode" | "updatedAt">
> = {
  TOMS001: {
    rp2350MainId: "rp2350-itabashi-main-01",
    rp2350DetachedId: null,
    nvrHost: "192.168.1.80",
    nvrLabel: "H.View NVR（板橋自宅）",
    nvrRtspBase: "rtsp://192.168.1.80:554",
  },
  // テスターは板橋自宅 RP2350 と同一結線
  TESTER001: {
    rp2350MainId: "rp2350-itabashi-main-01",
    rp2350DetachedId: null,
    nvrHost: "192.168.1.80",
    nvrLabel: "H.View NVR（板橋自宅）",
    nvrRtspBase: "rtsp://192.168.1.80:554",
  },
  TOYOSHIMA001: {
    rp2350MainId: "rp2350-toyoshima-main-01",
    rp2350DetachedId: "rp2350-toyoshima-detached-01",
    nvrHost: "192.168.10.50",
    nvrLabel: "H.View NVR（豊島邸）",
    nvrRtspBase: "rtsp://192.168.10.50:554",
    // 方法A: Guard Viewer / EZCloud 共有リンク
    // （未設定時は PWA で設定案内を表示）
    cloudStreamUrl: null,
    shareUrl: null,
    nvrAppOpenUrl: null,
  },
};

/** 共有プレビュー URL を正規化（cloud / share 統合） */
export function resolveCloudStreamUrlV1(
  bindings: Pick<
    CustomerTenantBindingsV1,
    "cloudStreamUrl" | "shareUrl"
  > | null | undefined
): string | null {
  const cloud = String(bindings?.cloudStreamUrl ?? "").trim();
  if (cloud) return cloud;
  const share = String(bindings?.shareUrl ?? "").trim();
  return share || null;
}

export function ensureCustomerTenantBindingsTableV1(): void {
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS customer_tenant_bindings_v1 (
      customer_code TEXT PRIMARY KEY,
      bindings_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function mergeBindings(
  code: string,
  stored: Partial<CustomerTenantBindingsV1> | null
): CustomerTenantBindingsV1 {
  const defaults = DEFAULT_BINDINGS_V1[code] ?? {};
  return {
    customerCode: code,
    rp2350MainId: stored?.rp2350MainId ?? defaults.rp2350MainId ?? null,
    rp2350DetachedId:
      stored?.rp2350DetachedId ?? defaults.rp2350DetachedId ?? null,
    nvrHost: stored?.nvrHost ?? defaults.nvrHost ?? null,
    nvrLabel: stored?.nvrLabel ?? defaults.nvrLabel ?? null,
    nvrRtspBase: stored?.nvrRtspBase ?? defaults.nvrRtspBase ?? null,
    cloudStreamUrl:
      stored?.cloudStreamUrl ?? defaults.cloudStreamUrl ?? null,
    shareUrl: stored?.shareUrl ?? defaults.shareUrl ?? null,
    nvrAppOpenUrl:
      stored?.nvrAppOpenUrl ?? defaults.nvrAppOpenUrl ?? null,
    updatedAt: stored?.updatedAt,
  };
}

export function getCustomerTenantBindingsV1(
  customerCode: string
): CustomerTenantBindingsV1 {
  ensureCustomerTenantBindingsTableV1();
  const code = String(customerCode || "").trim().toUpperCase();
  const alias = code === "TOSHIMA001" ? "TOYOSHIMA001" : code;
  const row = getDatabase()
    .prepare(
      `SELECT bindings_json, updated_at FROM customer_tenant_bindings_v1
       WHERE customer_code = ? COLLATE NOCASE`
    )
    .get(alias) as { bindings_json: string; updated_at: string } | undefined;
  if (!row) {
    return mergeBindings(alias, null);
  }
  try {
    const parsed = JSON.parse(row.bindings_json) as Partial<CustomerTenantBindingsV1>;
    return mergeBindings(alias, { ...parsed, updatedAt: row.updated_at });
  } catch {
    return mergeBindings(alias, null);
  }
}

export function upsertCustomerTenantBindingsV1(
  input: CustomerTenantBindingsV1
): CustomerTenantBindingsV1 {
  ensureCustomerTenantBindingsTableV1();
  const code = String(input.customerCode || "").trim().toUpperCase();
  if (!code) throw new Error("customerCode is required");
  const now = new Date().toISOString();
  const current = getCustomerTenantBindingsV1(code);
  const merged: CustomerTenantBindingsV1 = {
    customerCode: code,
    rp2350MainId: input.rp2350MainId ?? current.rp2350MainId ?? null,
    rp2350DetachedId:
      input.rp2350DetachedId ?? current.rp2350DetachedId ?? null,
    nvrHost: input.nvrHost ?? current.nvrHost ?? null,
    nvrLabel: input.nvrLabel ?? current.nvrLabel ?? null,
    nvrRtspBase: input.nvrRtspBase ?? current.nvrRtspBase ?? null,
    cloudStreamUrl:
      input.cloudStreamUrl !== undefined
        ? input.cloudStreamUrl || null
        : (current.cloudStreamUrl ?? null),
    shareUrl:
      input.shareUrl !== undefined
        ? input.shareUrl || null
        : (current.shareUrl ?? null),
    nvrAppOpenUrl:
      input.nvrAppOpenUrl !== undefined
        ? input.nvrAppOpenUrl || null
        : (current.nvrAppOpenUrl ?? null),
    updatedAt: now,
  };
  const { updatedAt: _u, customerCode: _c, ...payload } = merged;
  getDatabase()
    .prepare(
      `INSERT INTO customer_tenant_bindings_v1 (customer_code, bindings_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(customer_code) DO UPDATE SET
         bindings_json = excluded.bindings_json,
         updated_at = excluded.updated_at`
    )
    .run(code, JSON.stringify(payload), now);
  return merged;
}
