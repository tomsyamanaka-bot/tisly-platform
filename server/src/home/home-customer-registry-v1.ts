/**
 * TiSLY HOME — 顧客物件レジストリ v1
 *
 * 「顧客を見る」専用の独立データ源。
 * 見積・請求・Customer Portal マスターからの自動引用は行わない。
 * 登録経路: 手動フォーム / PWA デバイス紐付け のみ。
 */

import { getDatabase } from "../db/database.js";
import {
  HOME_DEFAULT_SITE_ID_V1,
  HOME_SITES_V1,
  findHomeSiteV1,
  listHomeSitesV1,
  registerRuntimeHomeSiteV1,
  type HomeSiteV1,
} from "./home-sites-v1.js";
import { ensureHomeSeedV1 } from "./home-store-v1.js";

export type HomeSiteRegistrationSourceV1 = "manual" | "device_binding";

export interface HomeSiteRegistryRowV1 {
  siteId: string;
  tenantId: string;
  customerCode: string;
  countryCode: string;
  currency: string;
  displayName: string;
  addressLabel: string;
  voltageSpec: string;
  hotWaterSpec: string;
  planCode: string;
  planStatus: string;
  monthlyFee: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  registrationSource: HomeSiteRegistrationSourceV1;
  deviceId: string;
  createdAt: string;
  updatedAt: string;
}

const PLAN_FEES_V1: Record<string, number> = {
  home_basic: 1980,
  home_standard: 3800,
};

function nowIso(): string {
  return new Date().toISOString();
}

function slugSiteIdV1(displayName: string): string {
  const base = displayName
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u3040-\u30ff\u4e00-\u9faf-]/g, "")
    .slice(0, 24)
    .toUpperCase();
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  return `HOME-JP-${base || "SITE"}-${suffix}`;
}

function rowToRegistry(row: Record<string, unknown>): HomeSiteRegistryRowV1 {
  return {
    siteId: String(row.site_id),
    tenantId: String(row.tenant_id),
    customerCode: String(row.customer_code ?? ""),
    countryCode: String(row.country_code ?? "JP"),
    currency: String(row.currency ?? "JPY"),
    displayName: String(row.display_name),
    addressLabel: String(row.address_label ?? ""),
    voltageSpec: String(row.voltage_spec ?? ""),
    hotWaterSpec: String(row.hot_water_spec ?? ""),
    planCode: String(row.plan_code ?? "home_basic"),
    planStatus: String(row.plan_status ?? "active"),
    monthlyFee: Number(row.monthly_fee ?? 0),
    contactName: String(row.contact_name ?? ""),
    contactPhone: String(row.contact_phone ?? ""),
    contactEmail: String(row.contact_email ?? ""),
    registrationSource: (String(row.registration_source ?? "manual") ===
    "device_binding"
      ? "device_binding"
      : "manual") as HomeSiteRegistrationSourceV1,
    deviceId: String(row.linked_device_id ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** テンプレートから新規 HOME 物件オブジェクトを生成 */
function cloneHomeSiteFromTemplateV1(input: {
  siteId: string;
  displayName: string;
  addressLabel?: string;
  customerCode?: string;
  planCode?: string;
  monthlyFee?: number;
}): HomeSiteV1 {
  const template = findHomeSiteV1(HOME_DEFAULT_SITE_ID_V1);
  const planCode = input.planCode ?? "home_basic";
  return {
    ...structuredClone(template),
    id: input.siteId,
    displayName: input.displayName.trim(),
    addressLabel: String(input.addressLabel ?? "").trim() || template.addressLabel,
    customerCode: (input.customerCode ?? template.customerCode).toUpperCase(),
    planCode,
    planStatus: "active",
    monthlyFee: input.monthlyFee ?? PLAN_FEES_V1[planCode] ?? 1980,
    kind: "detached",
    notes: [`手動登録: ${input.displayName}`],
  };
}

function persistRegistryDevicesV1(site: HomeSiteV1): void {
  const db = getDatabase();
  const at = nowIso();
  const insertDevice = db.prepare(`
    INSERT OR IGNORE INTO home_devices_v1 (
      site_id, device_kind, device_key, label,
      control_channel, state_json, updated_at
    ) VALUES (
      @siteId, @deviceKind, @deviceKey, @label,
      @controlChannel, @stateJson, @at
    )
  `);
  const devices = [
    {
      deviceKind: "ct_panel",
      deviceKey: site.ct.deviceKey,
      label: site.ct.label,
      controlChannel: site.ct.controlChannel,
      state: site.ct,
    },
    {
      deviceKind: "bath_remote",
      deviceKey: site.bath.deviceKey,
      label: site.bath.label,
      controlChannel: site.bath.controlChannel,
      state: site.bath,
    },
    {
      deviceKind: "smart_lock",
      deviceKey: site.lock.deviceKey,
      label: site.lock.label,
      controlChannel: site.lock.controlChannel,
      state: site.lock,
    },
    {
      deviceKind: "intercom",
      deviceKey: site.intercom.deviceKey,
      label: site.intercom.label,
      controlChannel: site.intercom.controlChannel,
      state: site.intercom,
    },
    ...site.aircons.map((ac) => ({
      deviceKind: "aircon",
      deviceKey: ac.deviceKey,
      label: ac.label,
      controlChannel: ac.controlChannel,
      state: ac,
    })),
  ];
  for (const d of devices) {
    insertDevice.run({
      siteId: site.id,
      deviceKind: d.deviceKind,
      deviceKey: d.deviceKey,
      label: d.label,
      controlChannel: d.controlChannel,
      stateJson: JSON.stringify(d.state),
      at,
    });
  }
}

/** DB に登録済みの HOME 物件一覧（独立データ源） */
export function listHomeSiteRegistryV1(): HomeSiteRegistryRowV1[] {
  try {
    ensureHomeSeedV1();
    const db = getDatabase();
    const rows = db
      .prepare(
        `SELECT site_id, tenant_id, customer_code, country_code,
                currency, display_name, address_label, voltage_spec,
                hot_water_spec, plan_code, plan_status, monthly_fee,
                contact_name, contact_phone, contact_email,
                registration_source, linked_device_id,
                created_at, updated_at
         FROM home_sites_v1
         ORDER BY updated_at DESC, site_id`
      )
      .all() as Array<Record<string, unknown>>;
    return rows.map(rowToRegistry);
  } catch {
    return [];
  }
}

export function getHomeSiteRegistryV1(
  siteId: string
): HomeSiteRegistryRowV1 | null {
  const key = siteId.trim();
  if (!key) return null;
  return listHomeSiteRegistryV1().find((s) => s.siteId === key) ?? null;
}

export interface RegisterHomeSiteInputV1 {
  displayName: string;
  addressLabel?: string;
  planCode?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  customerCode?: string;
  registrationSource?: HomeSiteRegistrationSourceV1;
  deviceId?: string;
  siteId?: string;
}

/** 手動 / デバイス紐付けで HOME 物件を登録 */
export function registerHomeSiteV1(
  input: RegisterHomeSiteInputV1
): HomeSiteRegistryRowV1 {
  const displayName = String(input.displayName ?? "").trim();
  if (!displayName) throw new Error("物件名が必要です");

  ensureHomeSeedV1();
  const db = getDatabase();
  const existing = input.siteId?.trim();
  if (existing && getHomeSiteRegistryV1(existing)) {
    throw new Error("この物件IDは既に登録されています");
  }

  const siteId = existing || slugSiteIdV1(displayName);
  const planCode = String(input.planCode ?? "home_basic").trim() || "home_basic";
  const monthlyFee = PLAN_FEES_V1[planCode] ?? 1980;
  const customerCode = String(input.customerCode ?? "TOMS001")
    .trim()
    .toUpperCase();
  const at = nowIso();
  const template = findHomeSiteV1(HOME_DEFAULT_SITE_ID_V1);

  db.prepare(
    `INSERT INTO home_sites_v1 (
      site_id, tenant_id, customer_code, country_code,
      currency, kind, display_name, address_label,
      voltage_spec, hot_water_spec, plan_code,
      plan_status, monthly_fee,
      contact_name, contact_phone, contact_email,
      registration_source, linked_device_id,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )`
  ).run(
    siteId,
    template.tenantId,
    customerCode,
    "JP",
    "JPY",
    "detached",
    displayName,
    String(input.addressLabel ?? "").trim(),
    template.voltageSpec,
    template.hotWaterSpec,
    planCode,
    "active",
    monthlyFee,
    String(input.contactName ?? "").trim(),
    String(input.contactPhone ?? "").trim(),
    String(input.contactEmail ?? "").trim(),
    input.registrationSource ?? "manual",
    String(input.deviceId ?? "").trim(),
    at,
    at
  );

  const site = cloneHomeSiteFromTemplateV1({
    siteId,
    displayName,
    addressLabel: input.addressLabel,
    customerCode,
    planCode,
    monthlyFee,
  });
  registerRuntimeHomeSiteV1(site);
  persistRegistryDevicesV1(site);

  const row = getHomeSiteRegistryV1(siteId);
  if (!row) throw new Error("登録に失敗しました");
  return row;
}

export interface UpdateHomeSiteInputV1 {
  displayName?: string;
  addressLabel?: string;
  planCode?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  planStatus?: string;
}

/** 登録済み HOME 物件を更新 */
export function updateHomeSiteRegistryV1(
  siteId: string,
  input: UpdateHomeSiteInputV1
): HomeSiteRegistryRowV1 {
  const key = siteId.trim();
  const current = getHomeSiteRegistryV1(key);
  if (!current) throw new Error("物件が見つかりません");

  const displayName = String(input.displayName ?? current.displayName).trim();
  if (!displayName) throw new Error("物件名が必要です");

  const planCode = String(input.planCode ?? current.planCode).trim();
  const monthlyFee = PLAN_FEES_V1[planCode] ?? current.monthlyFee;
  const at = nowIso();

  getDatabase()
    .prepare(
      `UPDATE home_sites_v1 SET
        display_name = ?,
        address_label = ?,
        plan_code = ?,
        plan_status = ?,
        monthly_fee = ?,
        contact_name = ?,
        contact_phone = ?,
        contact_email = ?,
        updated_at = ?
       WHERE site_id = ?`
    )
    .run(
      displayName,
      String(input.addressLabel ?? current.addressLabel).trim(),
      planCode,
      String(input.planStatus ?? current.planStatus).trim(),
      monthlyFee,
      String(input.contactName ?? current.contactName).trim(),
      String(input.contactPhone ?? current.contactPhone).trim(),
      String(input.contactEmail ?? current.contactEmail).trim(),
      at,
      key
    );

  const runtime = findHomeSiteV1(key);
  if (runtime.id === key) {
    runtime.displayName = displayName;
    runtime.addressLabel = String(input.addressLabel ?? current.addressLabel).trim();
    runtime.planCode = planCode;
    runtime.monthlyFee = monthlyFee;
  }

  const row = getHomeSiteRegistryV1(key);
  if (!row) throw new Error("更新に失敗しました");
  return row;
}

/** PWA デバイス紐付け時に HOME 物件を自動登録（既存は再利用） */
export function ensureHomeSiteFromDeviceBindingV1(input: {
  propertyName: string;
  customerCode?: string;
  deviceId?: string;
  address?: string;
}): { siteId: string; created: boolean } {
  const name = String(input.propertyName ?? "").trim();
  if (!name) throw new Error("物件名が必要です");

  const existing = listHomeSiteRegistryV1().find(
    (s) =>
      s.displayName === name &&
      (!input.deviceId || s.deviceId === input.deviceId)
  );
  if (existing) {
    return { siteId: existing.siteId, created: false };
  }

  const row = registerHomeSiteV1({
    displayName: name,
    addressLabel: input.address,
    customerCode: input.customerCode,
    deviceId: input.deviceId,
    registrationSource: "device_binding",
  });
  return { siteId: row.siteId, created: true };
}

/** 起動時: DB 上の未ロード物件をランタイムへ復元 */
export function hydrateRuntimeHomeSitesFromDbV1(): void {
  try {
    ensureHomeSeedV1();
    const loadedIds = new Set(listHomeSitesV1().map((s) => s.id));
    for (const row of listHomeSiteRegistryV1()) {
      if (loadedIds.has(row.siteId)) continue;
      registerRuntimeHomeSiteV1(
        cloneHomeSiteFromTemplateV1({
          siteId: row.siteId,
          displayName: row.displayName,
          addressLabel: row.addressLabel,
          customerCode: row.customerCode,
          planCode: row.planCode,
          monthlyFee: row.monthlyFee,
        })
      );
    }
  } catch {
    // DB 未初期化でも続行
  }
}
