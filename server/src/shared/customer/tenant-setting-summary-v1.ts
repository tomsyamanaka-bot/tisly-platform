/**
 * 社内画面向け — 保存済み防犯設定を日本語の一文にまとめる。
 * 既存のルール JSON は読取のみ。書き換えない。
 */

import { getHomeSecurityRulesV1 } from "../../home/home-security-rules-v1.js";
import {
  listCustomerTenantProfileCodesV1,
  resolveCustomerTenantProfileV1,
  type CustomerTenantProfileV1,
} from "./customer-tenant-profile-v1.js";

export interface TenantSensitivityPartV1 {
  label: string;
  ms: number;
}

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

interface TenantSummaryFactsV1 {
  mentionsFlash: boolean;
  mentionsMode: boolean;
  hideCameraOnCustomer: boolean;
  hideUnusedSensorsOnCustomer: boolean;
  sensitivity: Array<{ key: SensitivityKeyV1; label: string }>;
}

type SensitivityKeyV1 =
  | "debounceDi1Ms"
  | "debounceDi2Ms"
  | "debounceBeamMs";

const SUMMARY_FACTS_V1: Record<string, TenantSummaryFactsV1> = {
  TOYOSHIMA001: {
    mentionsFlash: true,
    mentionsMode: true,
    hideCameraOnCustomer: true,
    hideUnusedSensorsOnCustomer: true,
    sensitivity: [
      { key: "debounceDi1Ms", label: "外周" },
      { key: "debounceDi2Ms", label: "建物至近" },
      { key: "debounceBeamMs", label: "はなれ" },
    ],
  },
  TOMS001: {
    mentionsFlash: false,
    mentionsMode: false,
    hideCameraOnCustomer: true,
    hideUnusedSensorsOnCustomer: false,
    sensitivity: [
      { key: "debounceDi1Ms", label: "駐車場" },
      { key: "debounceDi2Ms", label: "ガレージ" },
    ],
  },
  TESTER001: {
    mentionsFlash: false,
    mentionsMode: false,
    hideCameraOnCustomer: true,
    hideUnusedSensorsOnCustomer: false,
    sensitivity: [
      { key: "debounceDi1Ms", label: "駐車場" },
      { key: "debounceDi2Ms", label: "ガレージ" },
    ],
  },
};

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
  return "連動は遠近2段階の常時点灯です。";
}

function customerSentence(input: TenantSettingSummaryInputV1): string {
  if (input.hideCameraOnCustomer && input.hideUnusedSensorsOnCustomer) {
    return "顧客側の画面ではカメラ映像と未使用センサーを非表示にしています。";
  }
  if (input.hideCameraOnCustomer) {
    return "顧客側の画面ではカメラ映像を非表示にしています。";
  }
  if (input.hideUnusedSensorsOnCustomer) {
    return "顧客側の画面では未使用センサーを非表示にしています。";
  }
  return "";
}

/** 設定値から日本語サマリーを組む（副作用なし） */
export function buildTenantSettingSummaryJaV1(
  input: TenantSettingSummaryInputV1
): string {
  const parts = [
    input.forceRelayTest
      ? "昼間もセンサー連動でライトが動くテスト設定です。"
      : "昼間は通知のみ。",
    `夜間（${input.scheduleStart}〜${input.scheduleEnd}）はセンサー検知で${input.lightingDurationSec}秒間ライト点灯。`,
  ];
  if (input.mentionsFlash) {
    parts.push(
      input.flashEnabled
        ? `至近検知時はフラッシュを${input.flashDurationSec}秒起動します。`
        : "至近検知時はフラッシュを起動しません。"
    );
  }
  if (input.mentionsMode) {
    parts.push(modeSentence(input.securityMode));
  }
  if (input.sensitivityParts.length) {
    const bits = input.sensitivityParts
      .map((part) => `${part.label}${part.ms}ms`)
      .join("、");
    parts.push(`感応度は${bits}です。`);
  }
  const customer = customerSentence(input);
  if (customer) parts.push(customer);
  return parts.join("");
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

function factsFor(code: string): TenantSummaryFactsV1 {
  return (
    SUMMARY_FACTS_V1[code] ?? {
      mentionsFlash: false,
      mentionsMode: false,
      hideCameraOnCustomer: false,
      hideUnusedSensorsOnCustomer: false,
      sensitivity: [
        { key: "debounceDi1Ms", label: "外周" },
        { key: "debounceDi2Ms", label: "至近" },
      ],
    }
  );
}

export interface TenantSettingSummaryResultV1 {
  ok: true;
  siteId: string;
  homeSiteId: string;
  customerCode: string;
  displayName: string;
  summary: string;
}

/** 保存済みルールを読んでサマリーを返す。ルールは変更しない。 */
export function buildTenantSettingSummaryForSiteV1(
  siteId: string
): TenantSettingSummaryResultV1 | null {
  const profile = profileForSiteId(siteId);
  if (!profile) return null;
  const rules = getHomeSecurityRulesV1(profile.homeSiteId);
  const facts = factsFor(profile.customerCode);
  const summary = buildTenantSettingSummaryJaV1({
    scheduleStart: rules.scheduleStart || "18:00",
    scheduleEnd: rules.scheduleEnd || "06:00",
    lightingDurationSec: rules.lightingDurationSec ?? 45,
    flashEnabled: rules.flashEnabled !== false,
    flashDurationSec: rules.flashDurationSec ?? 15,
    forceRelayTest: rules.forceRelayTest === true,
    securityMode: rules.securityMode || "2STEP",
    mentionsFlash: facts.mentionsFlash,
    mentionsMode: facts.mentionsMode,
    hideCameraOnCustomer: facts.hideCameraOnCustomer,
    hideUnusedSensorsOnCustomer: facts.hideUnusedSensorsOnCustomer,
    sensitivityParts: facts.sensitivity.map((part) => ({
      label: part.label,
      ms: rules[part.key] ?? rules.diConfirmMs ?? 100,
    })),
  });
  return {
    ok: true,
    siteId: profile.securitySiteId,
    homeSiteId: profile.homeSiteId,
    customerCode: profile.customerCode,
    displayName: profile.displayName,
    summary,
  };
}
