/**
 * 価格・原価マスターのユーザー追記ストア。
 * シード配列は改変せず、JSON へ merge / append する。
 */

import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { PRICE_COST_MASTER_SEED_V1 } from "./price-cost-master-seed-v1.js";
import { PRICE_COST_MASTER_TABS_V1 } from "./price-cost-master-types-v1.js";
import type {
  PriceCostMasterItemSeedV1,
  PriceCostMasterKindV1,
} from "./price-cost-master-types-v1.js";
import {
  isTislyUnifiedGenreV1,
  normalizeToUnifiedGenreV1,
} from "../shared/genres/tisly-genres-v1.js";

const USER_FILE = "user-items-v1.json";
const OVERLAY_FILE = "overlays-v1.json";

interface PriceCostMasterUserStoreV1 {
  items: PriceCostMasterItemSeedV1[];
  overlays: Record<string, Partial<PriceCostMasterItemSeedV1>>;
}

function getStoreDir(): string {
  const custom = String(
    process.env.PRICE_COST_MASTER_DATA_DIR ?? ""
  ).trim();
  return custom
    ? path.resolve(custom)
    : path.join(process.cwd(), "data", "price-cost-master");
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const parsed = JSON.parse(
      fs.readFileSync(filePath, "utf8")
    ) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(
    tempPath,
    `${JSON.stringify(data, null, 2)}\n`,
    "utf8"
  );
  fs.renameSync(tempPath, filePath);
}

function loadStore(): PriceCostMasterUserStoreV1 {
  const dir = getStoreDir();
  const items = readJsonFile<PriceCostMasterItemSeedV1[]>(
    path.join(dir, USER_FILE),
    []
  );
  const overlays = readJsonFile<
    Record<string, Partial<PriceCostMasterItemSeedV1>>
  >(path.join(dir, OVERLAY_FILE), {});
  return {
    items: Array.isArray(items) ? items : [],
    overlays:
      overlays && typeof overlays === "object" ? overlays : {},
  };
}

function seedIdSet(): Set<string> {
  return new Set(PRICE_COST_MASTER_SEED_V1.map((i) => i.id));
}

function applyOverlay(
  seed: PriceCostMasterItemSeedV1,
  overlay: Partial<PriceCostMasterItemSeedV1> | undefined
): PriceCostMasterItemSeedV1 {
  if (!overlay) return seed;
  return {
    ...seed,
    ...overlay,
    id: seed.id,
    kind: seed.kind,
  };
}

/** シード + ユーザー追記 + 上書きレイヤを結合 */
export function loadMergedPriceCostItemsV1(): PriceCostMasterItemSeedV1[] {
  const store = loadStore();
  const byId = new Map<string, PriceCostMasterItemSeedV1>();
  for (const seed of PRICE_COST_MASTER_SEED_V1) {
    byId.set(seed.id, applyOverlay(seed, store.overlays[seed.id]));
  }
  for (const item of store.items) {
    const id = String(item?.id ?? "").trim();
    if (!id || byId.has(id)) continue;
    byId.set(id, item);
  }
  return [...byId.values()];
}

function parseKind(raw: unknown): PriceCostMasterKindV1 {
  const value = String(raw ?? "").trim();
  if (
    (PRICE_COST_MASTER_TABS_V1 as readonly string[]).includes(
      value
    )
  ) {
    return value as PriceCostMasterKindV1;
  }
  return "parts";
}

function sanitizeItemInput(
  input: Partial<PriceCostMasterItemSeedV1>,
  kind: PriceCostMasterKindV1
): Omit<PriceCostMasterItemSeedV1, "id"> {
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("name is required");
  const genreRaw = String(input.genre ?? "").trim();
  const genre =
    normalizeToUnifiedGenreV1(genreRaw) ||
    (isTislyUnifiedGenreV1(genreRaw) ? genreRaw : "");
  if (!genre) throw new Error("genre is required");
  const costRaw = input.costPrice;
  const costPrice =
    costRaw == null || costRaw === ("" as unknown)
      ? null
      : Number(costRaw);
  const sellPrice = Number(input.sellPrice);
  if (!Number.isFinite(sellPrice)) {
    throw new Error("sellPrice is required");
  }
  const tags = Array.isArray(input.tags)
    ? input.tags.map((t) => String(t).trim()).filter(Boolean)
    : genre
      ? [genre]
      : [];
  if (genre && !tags.includes(genre)) tags.push(genre);
  return {
    kind,
    category: String(input.category ?? genre).trim() || genre,
    genre,
    name,
    costPrice:
      costPrice == null || !Number.isFinite(costPrice)
        ? null
        : costPrice,
    sellPrice,
    unitLabel: String(input.unitLabel ?? "式").trim() || "式",
    notes: String(input.notes ?? "").trim() || undefined,
    tags,
  };
}

export function createPriceCostMasterItemV1(
  input: Partial<PriceCostMasterItemSeedV1>
): PriceCostMasterItemSeedV1 {
  const kind = parseKind(input.kind);
  const body = sanitizeItemInput(input, kind);
  const item: PriceCostMasterItemSeedV1 = {
    id: `PCM-USER-${Date.now()}-${uuid().slice(0, 8)}`,
    ...body,
  };
  const store = loadStore();
  store.items.push(item);
  writeJsonFile(path.join(getStoreDir(), USER_FILE), store.items);
  return item;
}

export function updatePriceCostMasterItemV1(
  id: string,
  input: Partial<PriceCostMasterItemSeedV1>
): PriceCostMasterItemSeedV1 {
  const itemId = String(id ?? "").trim();
  if (!itemId) throw new Error("id is required");
  const store = loadStore();
  const seeds = seedIdSet();

  if (seeds.has(itemId)) {
    const seed = PRICE_COST_MASTER_SEED_V1.find(
      (i) => i.id === itemId
    )!;
    const kind = seed.kind;
    const next = sanitizeItemInput(
      { ...seed, ...store.overlays[itemId], ...input },
      kind
    );
    store.overlays[itemId] = {
      ...store.overlays[itemId],
      ...next,
    };
    writeJsonFile(
      path.join(getStoreDir(), OVERLAY_FILE),
      store.overlays
    );
    return applyOverlay(seed, store.overlays[itemId]);
  }

  const index = store.items.findIndex((i) => i.id === itemId);
  if (index < 0) throw new Error("item not found");
  const current = store.items[index];
  const next = sanitizeItemInput(
    { ...current, ...input },
    current.kind
  );
  store.items[index] = { ...current, ...next, id: current.id };
  writeJsonFile(path.join(getStoreDir(), USER_FILE), store.items);
  return store.items[index];
}
