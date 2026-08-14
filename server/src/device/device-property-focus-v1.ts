/**
 * RP2350 機器QR登録 — デモ物件フォーカス & 物件名自由入力 v1。
 *
 * 既存の物件マスター（customer_portal_properties）は
 * 削除・改名しない。表示を絞り込むだけで、
 * 新しい物件名は末尾に追記登録する。
 */

import { v4 as uuid } from "uuid";
import {
  getPropertyByIdV1,
  listPropertiesForCustomerV1,
  upsertPropertyMasterV1,
  type PropertyMasterV1,
} from "../shared/customer/customer-property-master-v1.js";

/** RP2350 デモに使う物件の優先ヒント（表示順の判定用） */
export const DEVICE_DEMO_PROPERTY_IDS_V1 = [
  "PROP-DEMOHOME001",
] as const;

export const DEVICE_DEMO_PROPERTY_REFS_V1 = [
  "DEMO-HOME-001",
] as const;

export const DEVICE_DEMO_PROPERTY_NAME_HINTS_V1 = [
  "取手 佐藤邸",
  "佐藤邸",
  "TOMS設備デモ",
  "デモ戸建て防犯",
] as const;

export const DEVICE_PROPERTY_NAME_MAX_LENGTH_V1 = 120;

interface FocusCandidateV1 {
  propertyId: string;
  propertyName: string;
  projectRef?: string | null;
  devices?: unknown[];
}

/** 表示比較用に空白差を無視した形へそろえる */
function foldPropertyName(value: string): string {
  return value
    .replace(/[\s\u3000]+/g, "")
    .toLowerCase();
}

/**
 * 物件名を保存できる形へ整える。
 * 全角空白は半角にそろえ、連続空白は1つにする。
 */
export function normalizeDevicePropertyNameV1(
  value: unknown
): string {
  const normalized = String(value ?? "")
    .replace(/[\u3000]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    throw new Error("物件名を入力してください");
  }
  if (normalized.length > DEVICE_PROPERTY_NAME_MAX_LENGTH_V1) {
    throw new Error("物件名が長すぎます");
  }
  return normalized;
}

function isDemoProperty(property: FocusCandidateV1): boolean {
  if (
    DEVICE_DEMO_PROPERTY_IDS_V1.some(
      (id) => id === property.propertyId
    )
  ) {
    return true;
  }
  if (
    property.projectRef &&
    DEVICE_DEMO_PROPERTY_REFS_V1.some(
      (ref) => ref === property.projectRef
    )
  ) {
    return true;
  }
  const folded = foldPropertyName(property.propertyName);
  return DEVICE_DEMO_PROPERTY_NAME_HINTS_V1.some((hint) =>
    folded.includes(foldPropertyName(hint))
  );
}

/**
 * 機器QR登録画面で見せる物件だけに絞る。
 * 1) RP2350 が既に紐付いている物件
 * 2) デモ物件（取手 佐藤邸 / TOMS設備デモ 等）
 * 3) それも無ければ先頭1件
 */
export function selectDeviceFocusPropertiesV1<
  T extends FocusCandidateV1
>(properties: T[]): T[] {
  const bound = properties.filter(
    (property) => (property.devices?.length ?? 0) > 0
  );
  if (bound.length > 0) return bound;

  const demo = properties.find(isDemoProperty);
  if (demo) return [demo];

  return properties.slice(0, 1);
}

/** 既存物件IDと衝突しない新しい物件IDを作る */
function buildNewPropertyIdV1(): string {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `PROP-${uuid()
      .replace(/-/g, "")
      .slice(0, 10)
      .toUpperCase()}`;
    if (!getPropertyByIdV1(candidate)) return candidate;
  }
  throw new Error("物件IDを発行できませんでした");
}

/**
 * 入力された物件名から物件を解決する。
 * 既存物件名と一致すればその物件を返し、
 * 一致しない新しい名前だけ新規追記する。
 */
export function resolveDevicePropertyByNameV1(input: {
  customerCode: string;
  propertyName: unknown;
  propertyId?: unknown;
}): { property: PropertyMasterV1; created: boolean } {
  const customerCode = String(input.customerCode ?? "")
    .trim()
    .toUpperCase();
  if (!customerCode) {
    throw new Error("customerCode required");
  }
  const propertyName = normalizeDevicePropertyNameV1(
    input.propertyName
  );
  const folded = foldPropertyName(propertyName);

  const hintedId = String(input.propertyId ?? "").trim();
  if (hintedId) {
    const hinted = getPropertyByIdV1(hintedId);
    if (
      hinted &&
      hinted.customerCode === customerCode &&
      foldPropertyName(hinted.propertyName) === folded
    ) {
      return { property: hinted, created: false };
    }
  }

  const existing = listPropertiesForCustomerV1(customerCode).find(
    (property) =>
      foldPropertyName(property.propertyName) === folded
  );
  if (existing) {
    return { property: existing, created: false };
  }

  const property = upsertPropertyMasterV1({
    propertyId: buildNewPropertyIdV1(),
    customerCode,
    propertyName,
    address: "",
    projectRef: null,
    installedDate: null,
    nextInspectionDate: null,
  });
  return { property, created: true };
}
