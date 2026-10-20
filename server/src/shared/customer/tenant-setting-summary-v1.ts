/**
 * 社内画面向け — 保存済み設定から日本語サマリーを組む。
 * 物件ごとの定型文は持たない。既存 JSON は読取のみ。
 */

import { getHomeSecurityRulesV1 } from "../../home/home-security-rules-v1.js";
import type { HomeSecurityRulesV1 } from "../../home/home-security-rules-v1.js";
import { listHomeSitesV1 } from "../../home/home-sites-v1.js";
import { listSecuritySitesV1 } from "../../security-floor/security-floor-sites-v1.js";
import type { SecuritySiteV1 } from "../../security-floor/security-floor-sites-v1.js";
import { getCustomerPortalModulesV1 } from "./customer-portal-modules-v1.js";
import {
  listCustomerTenantProfileCodesV1,
  resolveCustomerTenantProfileV1,
  type CustomerTenantProfileV1,
} from "./customer-tenant-profile-v1.js";

export interface SettingsSummarySensitivityV1 {
  label: string;
  ms: number;
}

/** generateSettingsSummary が読む設定データ */
export interface SettingsSummaryTenantDataV1 {
  scheduleStart: string;
  scheduleEnd: string;
  lightingDurationSec: number;
  forceRelayTest: boolean;
  flashEnabled?: boolean;
  flashDurationSec?: number;
  securityMode?: string;
  sensitivity: SettingsSummarySensitivityV1[];
  /** 顧客画面で出していないもの。空ならその文は出さない */
  customerHidden: string[];
}

export interface TenantSensitivityPartV1 {
  label: string;
  ms: number;
}

/** 既存テスト互換の入力 */
export interface TenantSettingSummaryInputV1 {
  scheduleStart: string;
  scheduleEnd: string;
  lightingDurationSec: number;
  flashEnabled: boolean;
  flashDurationSec: number;
  forceRelayTest: boolean;
  securityMode: string;
  mentionsFlash: boolean;
  mentionsMode: boolean;
  sensitivityParts: TenantSensitivityPartV1[];
  hideCameraOnCustomer: boolean;
  hideUnusedSensorsOnCustomer: boolean;
}

function modeSentence(mode: string): string {
  if (mode === "DIRECT") {
    return "遠近を分けず、検知でライトを同時に点灯します。";
  }
  if (mode === "SILENT") {
    return "センサー検知ではライトを出さず、通知だけです。";
  }
  if (mode === "two_stage_blink") {
    return "連動は遠近2段階の威嚇点滅です。";
  }
  if (mode === "2STEP") {
    return "連動は遠近2段階の常時点灯です。";
  }
  return "";
}

function joinHidden(labels: string[]): string {
  const list = labels.map((label) => label.trim()).filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) {
    return `顧客側の画面では${list[0]}を非表示にしています。`;
  }
  return `顧客側の画面では${list.join("と")}を非表示にしています。`;
}

/**
 * テナント設定データから日本語サマリーを動的に組み立てる。
 * 物件名や現場固有の定型文は含めない。
 */
export function generateSettingsSummary(
  tenantData: SettingsSummaryTenantDataV1
): string {
  const parts = [
    tenantData.forceRelayTest
      ? "昼間もセンサー連動でライトが動くテスト設定です。"
      : "昼間は通知のみ。",
    `夜間（${tenantData.scheduleStart}〜${tenantData.scheduleEnd}）はセンサー検知で${tenantData.lightingDurationSec}秒間ライト点灯。`,
  ];
  if (typeof tenantData.flashEnabled === "boolean") {
    parts.push(
      tenantData.flashEnabled
        ? `至近検知時はフラッシュを${tenantData.flashDurationSec ?? 15}秒起動します。`
        : "至近検知時はフラッシュを起動しません。"
    );
  }
  const mode = modeSentence(String(tenantData.securityMode || ""));
  if (mode) parts.push(mode);
  if (tenantData.sensitivity.length) {
    const bits = tenantData.sensitivity
      .map((part) => `${part.label}${part.ms}ms`)
      .join("、");
    parts.push(`感応度は${bits}です。`);
  }
  const hidden = joinHidden(tenantData.customerHidden);
  if (hidden) parts.push(hidden);
  return parts.join("");
}

/** 旧入力形。中身は generateSettingsSummary に渡す */
export function buildTenantSettingSummaryJaV1(
  input: TenantSettingSummaryInputV1
): string {
  const customerHidden = [
    ...(input.hideCameraOnCustomer ? ["カメラ映像"] : []),
    ...(input.hideUnusedSensorsOnCustomer ? ["未使用センサー"] : []),
  ];
  return generateSettingsSummary({
    scheduleStart: input.scheduleStart,
    scheduleEnd: input.scheduleEnd,
    lightingDurationSec: input.lightingDurationSec,
    forceRelayTest: input.forceRelayTest,
    flashEnabled: input.mentionsFlash ? input.flashEnabled : undefined,
    flashDurationSec: input.flashDurationSec,
    securityMode: input.mentionsMode ? input.securityMode : undefined,
    sensitivity: input.sensitivityParts,
    customerHidden,
  });
}

function profileForSiteId(siteId: string): CustomerTenantProfileV1 | null {
  const id = String(siteId || "").trim();
  if (!id) return null;
  for (const code of listCustomerTenantProfileCodesV1()) {
    const profile = resolveCustomerTenantProfileV1(code);
    if (!profile) continue;
    if (profile.securitySiteId === id || profile.homeSiteId === id) {
      return profile;
    }
  }
  return null;
}

function exactSecuritySite(siteId: string): SecuritySiteV1 | null {
  const id = String(siteId || "").trim();
  return (
    listSecuritySitesV1().find(
      (site) => site.id === id || site.propertyId === id
    ) ?? null
  );
}

function shortSensorLabel(label: string): string {
  return label
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sensitivityFromRules(
  rules: HomeSecurityRulesV1,
  site: SecuritySiteV1 | null
): SettingsSummarySensitivityV1[] {
  const sensors = site?.sensors ?? [];
  const named = sensors.filter((sensor) =>
    /DI\s*1|DI1|DI\s*2|DI2|ビーム/.test(
      `${sensor.label} ${sensor.customerLabel || ""} ${sensor.deviceId || ""}`
    )
  );
  const keys = [
    ["debounceDi1Ms", "DI1"],
    ["debounceDi2Ms", "DI2"],
    ["debounceBeamMs", "ビーム"],
  ] as const;
  const parts: SettingsSummarySensitivityV1[] = [];
  keys.forEach(([key, fallback], index) => {
    const ms = rules[key] ?? rules.diConfirmMs;
    if (typeof ms !== "number") return;
    const sensor = named[index];
    const label = sensor
      ? shortSensorLabel(sensor.customerLabel || sensor.label) || fallback
      : fallback;
    parts.push({ label, ms });
  });
  return parts;
}

function customerHiddenFromSite(
  site: SecuritySiteV1 | null,
  customerCode: string
): string[] {
  if (!site) return [];
  const hidden: string[] = [];
  const cameras = site.sensors.filter((sensor) => sensor.kind === "camera");
  if (cameras.length && customerCode) {
    const modules = getCustomerPortalModulesV1(customerCode);
    if (!modules.includes("camera_preview_v1")) {
      hidden.push("カメラ映像");
    }
  }
  const unusedFloors = site.floors
    .filter((floor) => floor.enabled === false && floor.id !== "roof")
    .map((floor) => floor.label);
  if (unusedFloors.length) {
    hidden.push(`未使用の階（${unusedFloors.join("・")}）`);
  }
  return hidden;
}

function mentionsFlash(
  rules: HomeSecurityRulesV1,
  site: SecuritySiteV1 | null
): boolean {
  const sensors = site?.sensors ?? [];
  return sensors.some((sensor) =>
    /フラッシュ|パトライト/.test(
      `${sensor.label} ${sensor.customerLabel || ""}`
    )
  ) || rules.flashEnabled === false;
}

function mentionsMode(
  rules: HomeSecurityRulesV1,
  site: SecuritySiteV1 | null
): boolean {
  const sensors = site?.sensors ?? [];
  const beamCount = sensors.filter((sensor) =>
    /ビーム|DI1|DI2/.test(`${sensor.label} ${sensor.customerLabel || ""}`)
  ).length;
  return beamCount >= 2 && Boolean(rules.securityMode);
}

export interface TenantSettingSummaryResultV1 {
  ok: true;
  siteId: string;
  homeSiteId: string;
  customerCode: string;
  displayName: string;
  summary: string;
}

/** 保存済みルールと現場カタログからサマリーを返す。ルールは変更しない。 */
export function buildTenantSettingSummaryForSiteV1(
  siteId: string
): TenantSettingSummaryResultV1 | null {
  const id = String(siteId || "").trim();
  if (!id) return null;
  const profile = profileForSiteId(id);
  const security =
    exactSecuritySite(profile?.securitySiteId || id) ||
    exactSecuritySite(profile?.homeSiteId || id);
  const home = listHomeSitesV1().find(
    (site) =>
      site.id === (profile?.homeSiteId || security?.propertyId || id)
  );
  if (!profile && !security && !home) return null;
  const homeSiteId =
    profile?.homeSiteId || home?.id || security?.propertyId || security?.id || id;
  const rules = getHomeSecurityRulesV1(homeSiteId);
  const customerCode = profile?.customerCode || "";
  const summary = generateSettingsSummary({
    scheduleStart: rules.scheduleStart || "18:00",
    scheduleEnd: rules.scheduleEnd || "06:00",
    lightingDurationSec: rules.lightingDurationSec ?? 45,
    forceRelayTest: rules.forceRelayTest === true,
    flashEnabled: mentionsFlash(rules, security)
      ? rules.flashEnabled !== false
      : undefined,
    flashDurationSec: rules.flashDurationSec ?? 15,
    securityMode: mentionsMode(rules, security)
      ? rules.securityMode || "2STEP"
      : undefined,
    sensitivity: sensitivityFromRules(rules, security),
    customerHidden: customerHiddenFromSite(security, customerCode),
  });
  return {
    ok: true,
    siteId: profile?.securitySiteId || security?.id || id,
    homeSiteId,
    customerCode,
    displayName:
      profile?.displayName ||
      security?.displayName ||
      home?.displayName ||
      id,
    summary,
  };
}
