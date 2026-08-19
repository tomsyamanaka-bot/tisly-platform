/**
 * 既存ナレッジへ統一ジャンルを紐づける。
 * タイトル・タグは削除せず、タグ末尾へ追記する。
 */

import { ECO_WATER_FIELD_MODULE_SEED_IDS } from "./knowledge-eco-water-field-seed-v1.js";
import { ECO_WATER_PH_MODULE_SEED_IDS } from "./knowledge-eco-water-ph-seed-v1.js";
import { SECURITY_FLOOR_MODULE_SEED_IDS } from "./knowledge-security-floor-seed-v1.js";
import type { TislyUnifiedGenreV1 } from "../shared/genres/tisly-genres-v1.js";
import {
  appendUnifiedGenreTagsV1,
  inferUnifiedGenreV1,
} from "../shared/genres/tisly-genres-v1.js";

const IOT_SEED_IDS = new Set<string>([
  ...ECO_WATER_PH_MODULE_SEED_IDS,
  ...ECO_WATER_FIELD_MODULE_SEED_IDS,
  ...SECURITY_FLOOR_MODULE_SEED_IDS,
]);

const WIRING_SEED_IDS = new Set<string>([
  "kn-seed-ew-rs485-modbus-001",
  "kn-seed-ew-sensor-install-001",
]);

export interface KnowledgeGenreBindableV1 {
  id: string;
  title: string;
  summary?: string;
  genre: string;
  tags: string[];
  unifiedGenre?: string;
  [key: string]: unknown;
}

function looksLikeIot(item: KnowledgeGenreBindableV1): boolean {
  if (IOT_SEED_IDS.has(item.id)) return true;
  const hay = `${item.title} ${item.summary ?? ""} ${(item.tags ?? []).join(" ")}`;
  return /pH|RS485|Modbus|ESP32|RP2350|IoT|Eco-Water|水質/i.test(
    hay
  );
}

function looksLikeElectrical(
  item: KnowledgeGenreBindableV1
): boolean {
  if (WIRING_SEED_IDS.has(item.id)) return true;
  const hay = `${item.title} ${item.summary ?? ""} ${(item.tags ?? []).join(" ")}`;
  return /配線手順|配線工事|VVF|電源配線/.test(hay);
}

/** 既存カードへ IOT関連 / 電気工事 を追記紐づけ */
export function bindUnifiedGenresToKnowledgeItemV1<
  T extends KnowledgeGenreBindableV1,
>(item: T): { item: T; changed: boolean } {
  const extra: TislyUnifiedGenreV1[] = [];
  if (looksLikeIot(item)) extra.push("IOT関連");
  if (looksLikeElectrical(item)) extra.push("電気工事");

  const inferred =
    inferUnifiedGenreV1(item) || extra[0] || "";
  const unifiedGenre =
    item.unifiedGenre || inferred || extra[0] || item.genre;
  const tags = appendUnifiedGenreTagsV1(item.tags, extra);
  const changed =
    tags.length !== item.tags.length ||
    String(item.unifiedGenre ?? "") !== String(unifiedGenre);

  if (!changed) return { item, changed: false };
  return {
    item: {
      ...item,
      tags,
      unifiedGenre,
    },
    changed: true,
  };
}
