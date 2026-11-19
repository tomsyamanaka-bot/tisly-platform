/**
 * 物件の本番・デモ・アーカイブと、
 * 親機・子機の設置状態。
 * 点灯設定と実機の版は触らない。
 */

import fs from "fs";
import path from "path";

export type SiteLifecycleStatusV1 =
  | "active"
  | "demo"
  | "archived"
  | "deleted";

export type UnitPresenceV1 = "active" | "planned";
export type UnitRoleV1 = "parent" | "child";
export type UnitKindV1 = "rp2350" | "modbus";

export interface SiteUnitV1 {
  id: string;
  name: string;
  role: UnitRoleV1;
  kind: UnitKindV1;
  modbusId: string | null;
  presence: UnitPresenceV1;
}

export interface SiteLifecycleV1 {
  siteId: string;
  displayName: string;
  customerCode: string;
  securitySiteId: string;
  lifecycleStatus: SiteLifecycleStatusV1;
  units: SiteUnitV1[];
}

interface StoredSiteV1 {
  lifecycleStatus?: SiteLifecycleStatusV1;
  units?: SiteUnitV1[];
}

interface StoredFileV1 {
  sites: Record<string, StoredSiteV1>;
}

const DEFAULTS: SiteLifecycleV1[] = [
  {
    siteId: "HOME-JP-ITABASHI-LIVE",
    displayName: "板橋自宅",
    customerCode: "TOMS001",
    securitySiteId: "SEC-JP-ITABASHI-LIVE",
    lifecycleStatus: "active",
    units: [
      {
        id: "main",
        name: "母屋",
        role: "parent",
        kind: "rp2350",
        modbusId: null,
        presence: "active",
      },
    ],
  },
  {
    siteId: "HOME-JP-TOYOSHIMA",
    displayName: "豊島邸",
    customerCode: "TOYOSHIMA001",
    securitySiteId: "SEC-JP-TOYOSHIMA-001",
    lifecycleStatus: "active",
    units: [
      {
        id: "main",
        name: "母屋",
        role: "parent",
        kind: "rp2350",
        modbusId: null,
        presence: "active",
      },
      {
        id: "detached",
        name: "はなれ",
        role: "child",
        kind: "rp2350",
        modbusId: "1",
        presence: "planned",
      },
    ],
  },
  {
    siteId: "HOME-JP-RYUGASAKI",
    displayName: "ウォッシュメイト龍ヶ崎店",
    customerCode: "WASHMATE001",
    securitySiteId: "SEC-JP-RYUGASAKI-001",
    lifecycleStatus: "archived",
    units: [
      {
        id: "main",
        name: "店舗",
        role: "parent",
        kind: "rp2350",
        modbusId: null,
        presence: "active",
      },
    ],
  },
  {
    siteId: "HOME-JP-KEEPRISING",
    displayName: "Keep Rising",
    customerCode: "KEEPRISING001",
    securitySiteId: "SEC-JP-KEEPRISING-001",
    lifecycleStatus: "demo",
    units: [
      {
        id: "main",
        name: "店舗",
        role: "parent",
        kind: "rp2350",
        modbusId: null,
        presence: "active",
      },
    ],
  },
];

let memoryMode = false;
let memoryFile: StoredFileV1 = { sites: {} };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function storePath(): string {
  return path.join(process.cwd(), "data", "site-lifecycle-v1.json");
}

function emptyFile(): StoredFileV1 {
  return { sites: {} };
}

function loadFile(): StoredFileV1 {
  if (memoryMode) return memoryFile;
  try {
    const raw = fs.readFileSync(storePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredFileV1>;
    return { sites: parsed.sites ?? {} };
  } catch {
    return emptyFile();
  }
}

function saveFile(file: StoredFileV1): void {
  if (memoryMode) {
    memoryFile = file;
    return;
  }
  const dest = storePath();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(file), "utf8");
  fs.renameSync(tmp, dest);
}

/** テストは現場の JSON を書かない。 */
export function useSiteLifecycleMemoryForTestV1(): void {
  memoryMode = true;
  memoryFile = emptyFile();
}

export function resetSiteLifecycleForTestV1(): void {
  useSiteLifecycleMemoryForTestV1();
}

function canonicalSiteId(siteId: string): string {
  const raw = String(siteId || "").trim();
  const upper = raw.toUpperCase();
  for (const row of DEFAULTS) {
    const ids = [
      row.siteId,
      row.securitySiteId,
      row.customerCode,
    ];
    if (ids.some((id) => id.toUpperCase() === upper)) {
      return row.siteId;
    }
  }
  return raw;
}

function overlay(base: SiteLifecycleV1, stored?: StoredSiteV1): SiteLifecycleV1 {
  const next = clone(base);
  if (!stored) return next;
  if (stored.lifecycleStatus) {
    next.lifecycleStatus = stored.lifecycleStatus;
  }
  if (Array.isArray(stored.units) && stored.units.length) {
    next.units = clone(stored.units);
  }
  return next;
}

export function siteLifecycleOfV1(siteId: string): SiteLifecycleV1 | null {
  const key = canonicalSiteId(siteId);
  const base = DEFAULTS.find((row) => row.siteId === key);
  const stored = loadFile().sites[key];
  if (!base && !stored) return null;
  const seed = base ?? {
    siteId: key,
    displayName: key,
    customerCode: "",
    securitySiteId: key,
    lifecycleStatus: "active" as const,
    units: [
      {
        id: "main",
        name: "親機",
        role: "parent" as const,
        kind: "rp2350" as const,
        modbusId: null,
        presence: "active" as const,
      },
    ],
  };
  return overlay(seed, stored);
}

export function listSiteLifecyclesV1(): SiteLifecycleV1[] {
  const file = loadFile();
  const keys = new Set<string>(DEFAULTS.map((row) => row.siteId));
  for (const key of Object.keys(file.sites)) keys.add(key);
  const rows: SiteLifecycleV1[] = [];
  for (const key of keys) {
    const row = siteLifecycleOfV1(key);
    if (row && row.lifecycleStatus !== "deleted") rows.push(row);
  }
  return rows;
}

export function siteAllowsLiveWatchV1(siteId: string): boolean {
  const row = siteLifecycleOfV1(siteId);
  return row?.lifecycleStatus === "active";
}

export function unitPresenceV1(
  siteId: string,
  unitId: string
): UnitPresenceV1 | "unknown" {
  const row = siteLifecycleOfV1(siteId);
  const unit = row?.units.find((item) => item.id === unitId);
  if (!unit) return "unknown";
  return unit.presence;
}

/** 本番かつ設置済みの子機だけ監視する。 */
export function unitAllowsLiveWatchV1(
  siteId: string,
  unitId: string
): boolean {
  if (!siteAllowsLiveWatchV1(siteId)) return false;
  const presence = unitPresenceV1(siteId, unitId);
  if (presence === "unknown") return true;
  return presence === "active";
}

export function watchedHeartbeatSlotsV1(
  slots: Array<{ presence: UnitPresenceV1 | "unknown"; at: string | null }>,
  nowMs: number
): { offline: boolean; ageMs: number | null } {
  const watched = slots.filter((slot) => slot.presence !== "planned");
  if (!watched.length) return { offline: false, ageMs: null };
  let missing = false;
  let worst: number | null = null;
  for (const slot of watched) {
    if (!slot.at) {
      missing = true;
      continue;
    }
    const at = Date.parse(slot.at);
    if (!Number.isFinite(at)) {
      missing = true;
      continue;
    }
    const age = nowMs - at;
    if (age >= 330_000) {
      worst = worst == null ? age : Math.max(worst, age);
    }
  }
  if (worst != null) return { offline: true, ageMs: worst };
  if (missing) return { offline: true, ageMs: null };
  return { offline: false, ageMs: null };
}

function writeSite(next: SiteLifecycleV1): SiteLifecycleV1 {
  const file = loadFile();
  file.sites[next.siteId] = {
    lifecycleStatus: next.lifecycleStatus,
    units: clone(next.units),
  };
  saveFile(file);
  return next;
}

export function setSiteLifecycleV1(
  siteId: string,
  status: Exclude<SiteLifecycleStatusV1, "deleted">
): { ok: boolean; site?: SiteLifecycleV1; message?: string } {
  const row = siteLifecycleOfV1(siteId);
  if (!row || row.lifecycleStatus === "deleted") {
    return { ok: false, message: "物件が見つかりません" };
  }
  if (status !== "active" && status !== "demo" && status !== "archived") {
    return { ok: false, message: "状態を選べません" };
  }
  row.lifecycleStatus = status;
  return { ok: true, site: writeSite(row) };
}

export function deleteSiteLifecycleV1(
  siteId: string,
  confirm: string
): { ok: boolean; message: string } {
  const row = siteLifecycleOfV1(siteId);
  if (!row || row.lifecycleStatus === "deleted") {
    return { ok: false, message: "物件が見つかりません" };
  }
  if (row.lifecycleStatus === "active") {
    return {
      ok: false,
      message: "削除するには先にアーカイブへ変更してください",
    };
  }
  if (confirm !== "削除") {
    return { ok: false, message: "確認の文字が違います" };
  }
  row.lifecycleStatus = "deleted";
  writeSite(row);
  return { ok: true, message: "一覧と監視から外しました" };
}

function cleanName(raw: unknown): string {
  return String(raw ?? "").trim().slice(0, 40);
}

export function addSiteUnitV1(
  siteId: string,
  input: {
    name: string;
    role?: UnitRoleV1;
    kind?: UnitKindV1;
    modbusId?: string | null;
    presence?: UnitPresenceV1;
  }
): { ok: boolean; site?: SiteLifecycleV1; message?: string } {
  const row = siteLifecycleOfV1(siteId);
  if (!row || row.lifecycleStatus === "deleted") {
    return { ok: false, message: "物件が見つかりません" };
  }
  const name = cleanName(input.name);
  if (!name) return { ok: false, message: "名前を入力してください" };
  const kind = input.kind === "modbus" ? "modbus" : "rp2350";
  const hasParent = row.units.some((unit) => unit.role === "parent");
  const role: UnitRoleV1 =
    input.role === "parent" && !hasParent ? "parent" : "child";
  const presence: UnitPresenceV1 =
    input.presence === "active" ? "active" : "planned";
  const modbusId = cleanName(input.modbusId) || null;
  row.units.push({
    id: `unit-${Date.now().toString(36)}`,
    name,
    role,
    kind,
    modbusId,
    presence,
  });
  return { ok: true, site: writeSite(row) };
}

export function setUnitPresenceV1(
  siteId: string,
  unitId: string,
  presence: UnitPresenceV1
): { ok: boolean; site?: SiteLifecycleV1; message?: string } {
  const row = siteLifecycleOfV1(siteId);
  const unit = row?.units.find((item) => item.id === unitId);
  if (!row || !unit || row.lifecycleStatus === "deleted") {
    return { ok: false, message: "ユニットが見つかりません" };
  }
  if (presence !== "active" && presence !== "planned") {
    return { ok: false, message: "状態を選べません" };
  }
  unit.presence = presence;
  return { ok: true, site: writeSite(row) };
}

export function deleteSiteUnitV1(
  siteId: string,
  unitId: string
): { ok: boolean; site?: SiteLifecycleV1; message?: string } {
  const row = siteLifecycleOfV1(siteId);
  const unit = row?.units.find((item) => item.id === unitId);
  if (!row || !unit || row.lifecycleStatus === "deleted") {
    return { ok: false, message: "ユニットが見つかりません" };
  }
  if (unit.role === "parent" || row.units.length <= 1) {
    return { ok: false, message: "親機だけは消せません" };
  }
  row.units = row.units.filter((item) => item.id !== unitId);
  return { ok: true, site: writeSite(row) };
}
