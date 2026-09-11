/**
 * 全現場 RP2350 PoE LAN OTA
 * 既存物件データは削除せず upsert のみ
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDatabase } from "../db/database.js";

export type TislyOtaSiteKeyV1 = "toyoshima" | "itabashi";
export type TislyOtaChannelV1 = "staging" | "production";

export interface TislyOtaDeviceReportV1 {
  deviceId: string;
  building?: string;
  firmwareVersion: string;
  reportedAt: string;
}

export interface TislyOtaSiteStateV1 {
  siteKey: TislyOtaSiteKeyV1;
  version: string;
  stagingVersion: string;
  checksum: string;
  checksums: Record<string, string>;
  files: Record<string, string>;
  stagingFiles: Record<string, string>;
  pending: boolean;
  pendingStaging: boolean;
  force: boolean;
  lastDeployAt: string | null;
  lastStagingDeployAt: string | null;
  reported: Record<string, TislyOtaDeviceReportV1>;
}

export interface TislyOtaVersionPayloadV1 {
  ok: true;
  siteId: TislyOtaSiteKeyV1;
  displayName: string;
  homeSiteId: string;
  securitySiteId: string;
  version: string;
  checksum: string;
  checksums: Record<string, string>;
  files: string[];
  skipFiles: string[];
  pending: boolean;
  force: boolean;
  channel: TislyOtaChannelV1;
  has_ota_update: boolean;
  runningVersion: string | null;
  lastDeployAt: string | null;
}

interface TislyOtaStoreV1 {
  sites: Partial<Record<TislyOtaSiteKeyV1, TislyOtaSiteStateV1>>;
  updatedAt: string;
}

interface SiteProfileV1 {
  siteKey: TislyOtaSiteKeyV1;
  displayName: string;
  homeSiteId: string;
  securitySiteId: string;
  customerCode: string;
  aliases: string[];
  /* 実機上書き禁止（物件固有） */
  skipFiles: string[];
  fileMap: Record<string, string>;
}

const STORE_ID = "global";
const DEFAULT_VERSION = "1.0.0";
const SKIP_CONFIG = ["config.py"];

const SITE_PROFILES: SiteProfileV1[] = [
  {
    siteKey: "toyoshima",
    displayName: "豊島邸",
    homeSiteId: "HOME-JP-TOYOSHIMA",
    securitySiteId: "SEC-JP-TOYOSHIMA-001",
    customerCode: "TOYOSHIMA001",
    aliases: [
      "toyoshima",
      "TOYOSHIMA001",
      "TOSHIMA001",
      "HOME-JP-TOYOSHIMA",
      "SEC-JP-TOYOSHIMA-001",
    ],
    skipFiles: SKIP_CONFIG,
    fileMap: {
      "main.py": "main_toyoshima.py",
      "toyoshima_security.py": "toyoshima_security.py",
      "boot.py": "boot.py",
      "lib/tisly_ota.py": "lib/tisly_ota.py",
      "config.py": "config_toyoshima.py",
    },
  },
  {
    siteKey: "itabashi",
    displayName: "板橋自宅",
    homeSiteId: "HOME-JP-ITABASHI-LIVE",
    securitySiteId: "SEC-JP-ITABASHI-LIVE",
    customerCode: "TOMS001",
    aliases: [
      "itabashi",
      "TOMS001",
      "HOME001",
      "HOME-JP-ITABASHI-LIVE",
      "SEC-JP-ITABASHI-LIVE",
    ],
    skipFiles: SKIP_CONFIG,
    fileMap: {
      "main.py": "main.py",
      "security_light.py": "security_light.py",
      "boot.py": "boot.py",
      "lib/tisly_ota.py": "lib/tisly_ota.py",
      "config.py": "config.py",
    },
  },
];

let tableReady = false;

function nowIso(): string {
  return new Date().toISOString();
}

function sha256Text(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function combinedChecksum(checksums: Record<string, string>): string {
  const joined = Object.keys(checksums)
    .sort()
    .map((name) => `${name}:${checksums[name]}`)
    .join("|");
  return sha256Text(joined);
}

function emptySiteState(siteKey: TislyOtaSiteKeyV1): TislyOtaSiteStateV1 {
  return {
    siteKey,
    version: DEFAULT_VERSION,
    stagingVersion: DEFAULT_VERSION,
    checksum: "",
    checksums: {},
    files: {},
    stagingFiles: {},
    pending: false,
    pendingStaging: false,
    force: false,
    lastDeployAt: null,
    lastStagingDeployAt: null,
    reported: {},
  };
}

export function listTislyOtaSiteProfilesV1(): SiteProfileV1[] {
  return SITE_PROFILES.map((p) => ({
    ...p,
    aliases: [...p.aliases],
    skipFiles: [...p.skipFiles],
    fileMap: { ...p.fileMap },
  }));
}

export function resolveTislyOtaSiteKeyV1(
  raw: string | null | undefined
): TislyOtaSiteKeyV1 | "all" | null {
  const key = String(raw ?? "").trim();
  if (!key) return null;
  if (
    key === "all" ||
    key === "*" ||
    key === "core" ||
    key.toLowerCase() === "all-sites"
  ) {
    return "all";
  }
  const lower = key.toLowerCase();
  for (const profile of SITE_PROFILES) {
    if (profile.siteKey === lower) return profile.siteKey;
    if (profile.aliases.some((a) => a.toLowerCase() === lower)) {
      return profile.siteKey;
    }
  }
  return null;
}

export function getTislyOtaSiteProfileV1(
  siteKey: TislyOtaSiteKeyV1
): SiteProfileV1 {
  const found = SITE_PROFILES.find((p) => p.siteKey === siteKey);
  if (!found) {
    throw new Error(`unknown OTA site: ${siteKey}`);
  }
  return found;
}

function resolveFirmwareDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "rp2350/firmware"),
    path.resolve(process.cwd(), "../rp2350/firmware"),
    path.resolve(here, "../../../rp2350/firmware"),
    path.resolve(here, "../../../../rp2350/firmware"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "boot.py"))) return dir;
  }
  return candidates[1];
}

function readMappedFiles(
  profile: SiteProfileV1
): { files: Record<string, string>; checksums: Record<string, string> } {
  const root = resolveFirmwareDir();
  const files: Record<string, string> = {};
  const checksums: Record<string, string> = {};
  for (const [dest, srcName] of Object.entries(profile.fileMap)) {
    const full = path.join(root, srcName);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, "utf8");
    files[dest] = text;
    checksums[dest] = sha256Text(text);
  }
  return { files, checksums };
}

function bumpPatchVersion(current: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(current || "").trim());
  if (!m) return "1.0.1";
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]) + 1;
  return `${major}.${minor}.${patch}`;
}

function ensureTableV1(): void {
  if (tableReady) return;
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS tisly_rp2350_ota_v1 (
      id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  tableReady = true;
}

function parseSiteState(
  siteKey: TislyOtaSiteKeyV1,
  raw: unknown
): TislyOtaSiteStateV1 {
  const base = emptySiteState(siteKey);
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const files =
    o.files && typeof o.files === "object"
      ? { ...(o.files as Record<string, string>) }
      : {};
  const stagingFiles =
    o.stagingFiles && typeof o.stagingFiles === "object"
      ? { ...(o.stagingFiles as Record<string, string>) }
      : {};
  const checksums =
    o.checksums && typeof o.checksums === "object"
      ? { ...(o.checksums as Record<string, string>) }
      : {};
  const reported: Record<string, TislyOtaDeviceReportV1> = {};
  if (o.reported && typeof o.reported === "object") {
    for (const [id, row] of Object.entries(
      o.reported as Record<string, unknown>
    )) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const ver = String(r.firmwareVersion ?? "").trim();
      if (!ver) continue;
      reported[id] = {
        deviceId: String(r.deviceId ?? id),
        building:
          typeof r.building === "string" ? r.building : undefined,
        firmwareVersion: ver,
        reportedAt:
          typeof r.reportedAt === "string" ? r.reportedAt : nowIso(),
      };
    }
  }
  return {
    ...base,
    version:
      typeof o.version === "string" && o.version.trim()
        ? o.version.trim()
        : base.version,
    stagingVersion:
      typeof o.stagingVersion === "string" && o.stagingVersion.trim()
        ? o.stagingVersion.trim()
        : base.stagingVersion,
    checksum: typeof o.checksum === "string" ? o.checksum : "",
    checksums,
    files,
    stagingFiles,
    pending: Boolean(o.pending),
    pendingStaging: Boolean(o.pendingStaging),
    force: Boolean(o.force),
    lastDeployAt:
      typeof o.lastDeployAt === "string" ? o.lastDeployAt : null,
    lastStagingDeployAt:
      typeof o.lastStagingDeployAt === "string"
        ? o.lastStagingDeployAt
        : null,
    reported,
  };
}

function emptyStore(): TislyOtaStoreV1 {
  return { sites: {}, updatedAt: nowIso() };
}

function loadStore(): TislyOtaStoreV1 {
  try {
    ensureTableV1();
    const row = getDatabase()
      .prepare(
        `SELECT state_json FROM tisly_rp2350_ota_v1 WHERE id = ?`
      )
      .get(STORE_ID) as { state_json?: string } | undefined;
    if (!row?.state_json) return emptyStore();
    const parsed = JSON.parse(row.state_json) as Record<string, unknown>;
    const sitesRaw =
      parsed.sites && typeof parsed.sites === "object"
        ? (parsed.sites as Record<string, unknown>)
        : parsed;
    const sites: TislyOtaStoreV1["sites"] = {};
    for (const key of ["toyoshima", "itabashi"] as TislyOtaSiteKeyV1[]) {
      if (sitesRaw[key]) {
        sites[key] = parseSiteState(key, sitesRaw[key]);
      }
    }
    return {
      sites,
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : nowIso(),
    };
  } catch {
    return emptyStore();
  }
}

function saveStore(store: TislyOtaStoreV1): void {
  ensureTableV1();
  const next: TislyOtaStoreV1 = {
    sites: { ...store.sites },
    updatedAt: nowIso(),
  };
  getDatabase()
    .prepare(
      `INSERT INTO tisly_rp2350_ota_v1 (id, state_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         state_json = excluded.state_json,
         updated_at = excluded.updated_at`
    )
    .run(STORE_ID, JSON.stringify(next), next.updatedAt);
}

function getOrCreateSite(
  store: TislyOtaStoreV1,
  siteKey: TislyOtaSiteKeyV1
): TislyOtaSiteStateV1 {
  const existing = store.sites[siteKey];
  if (existing) return existing;
  const created = emptySiteState(siteKey);
  store.sites[siteKey] = created;
  return created;
}

function pickRunningVersion(site: TislyOtaSiteStateV1): string | null {
  const versions = Object.values(site.reported)
    .map((r) => r.firmwareVersion)
    .filter(Boolean);
  if (versions.length === 0) return null;
  return versions.sort().reverse()[0] ?? null;
}

function allDevicesMatch(
  site: TislyOtaSiteStateV1,
  version: string
): boolean {
  const rows = Object.values(site.reported);
  if (rows.length === 0) return false;
  return rows.every((r) => r.firmwareVersion === version);
}

export function getTislyOtaVersionV1(input: {
  siteKey: TislyOtaSiteKeyV1;
  channel?: TislyOtaChannelV1;
  deviceId?: string | null;
  reportedVersion?: string | null;
}): TislyOtaVersionPayloadV1 {
  const profile = getTislyOtaSiteProfileV1(input.siteKey);
  const channel = input.channel === "staging" ? "staging" : "production";
  const store = loadStore();
  const site = getOrCreateSite(store, input.siteKey);
  const live = readMappedFiles(profile);
  const pending =
    channel === "staging" ? site.pendingStaging : site.pending;
  const snapFiles =
    channel === "staging"
      ? Object.keys(site.stagingFiles).length
        ? site.stagingFiles
        : live.files
      : Object.keys(site.files).length
        ? site.files
        : live.files;
  const checksums: Record<string, string> = {};
  for (const [name, text] of Object.entries(snapFiles)) {
    checksums[name] = sha256Text(text);
  }
  const version =
    channel === "staging" ? site.stagingVersion : site.version;
  const reported =
    String(input.reportedVersion ?? "").trim() ||
    (input.deviceId && site.reported[input.deviceId]
      ? site.reported[input.deviceId].firmwareVersion
      : pickRunningVersion(site));
  const hasUpdate =
    Boolean(site.force) ||
    (pending && (!reported || reported !== version));
  return {
    ok: true,
    siteId: input.siteKey,
    displayName: profile.displayName,
    homeSiteId: profile.homeSiteId,
    securitySiteId: profile.securitySiteId,
    version,
    checksum: combinedChecksum(checksums),
    checksums,
    files: Object.keys(checksums).sort(),
    skipFiles: [...profile.skipFiles],
    pending,
    force: Boolean(site.force),
    channel,
    has_ota_update: hasUpdate,
    runningVersion: reported || null,
    lastDeployAt:
      channel === "staging"
        ? site.lastStagingDeployAt
        : site.lastDeployAt,
  };
}

export function getTislyOtaScriptV1(input: {
  siteKey: TislyOtaSiteKeyV1;
  name?: string | null;
  channel?: TislyOtaChannelV1;
}): { name: string; body: string; checksum: string } | null {
  const profile = getTislyOtaSiteProfileV1(input.siteKey);
  const channel = input.channel === "staging" ? "staging" : "production";
  const requested = String(input.name ?? "main.py").trim() || "main.py";
  if (!(requested in profile.fileMap)) return null;
  const store = loadStore();
  const site = store.sites[input.siteKey];
  const snap =
    channel === "staging" ? site?.stagingFiles : site?.files;
  if (snap && typeof snap[requested] === "string") {
    const body = snap[requested];
    return { name: requested, body, checksum: sha256Text(body) };
  }
  const live = readMappedFiles(profile);
  const body = live.files[requested];
  if (typeof body !== "string") return null;
  return { name: requested, body, checksum: sha256Text(body) };
}

export function deployTislyOtaFirmwareV1(input: {
  siteKey: TislyOtaSiteKeyV1 | "all";
  channel?: TislyOtaChannelV1;
  force?: boolean;
}): {
  ok: true;
  channel: TislyOtaChannelV1;
  sites: TislyOtaVersionPayloadV1[];
  message: string;
} {
  const channel = input.channel === "staging" ? "staging" : "production";
  const keys: TislyOtaSiteKeyV1[] =
    input.siteKey === "all" ? ["toyoshima", "itabashi"] : [input.siteKey];
  const store = loadStore();
  const at = nowIso();
  for (const key of keys) {
    const profile = getTislyOtaSiteProfileV1(key);
    const live = readMappedFiles(profile);
    const site = getOrCreateSite(store, key);
    const checksum = combinedChecksum(live.checksums);
    if (channel === "staging") {
      site.stagingFiles = { ...live.files };
      site.stagingVersion = bumpPatchVersion(site.stagingVersion);
      site.pendingStaging = true;
      site.lastStagingDeployAt = at;
    } else {
      site.files = { ...live.files };
      site.checksums = { ...live.checksums };
      site.checksum = checksum;
      site.version = bumpPatchVersion(site.version);
      site.pending = true;
      site.lastDeployAt = at;
    }
    site.force = Boolean(input.force);
    store.sites[key] = site;
  }
  saveStore(store);
  const sites = keys.map((key) =>
    getTislyOtaVersionV1({ siteKey: key, channel })
  );
  const names = sites.map((s) => s.displayName).join("・");
  const message =
    channel === "staging"
      ? `${names} へステージング配信を予約しました`
      : `${names} へ最新ファームウェア配信を予約しました`;
  return { ok: true, channel, sites, message };
}

export function recordTislyOtaDeviceFirmwareV1(input: {
  siteKey: TislyOtaSiteKeyV1;
  deviceId?: string | null;
  building?: string | null;
  firmwareVersion?: string | null;
}): TislyOtaVersionPayloadV1 {
  const version = String(input.firmwareVersion ?? "").trim();
  const store = loadStore();
  const site = getOrCreateSite(store, input.siteKey);
  if (version) {
    const id =
      String(input.deviceId ?? "").trim() ||
      String(input.building ?? "").trim() ||
      "default";
    /* 既存報告は消さず当該キーだけ更新 */
    site.reported = {
      ...site.reported,
      [id]: {
        deviceId: id,
        building: input.building ? String(input.building) : undefined,
        firmwareVersion: version,
        reportedAt: nowIso(),
      },
    };
    if (site.pending && allDevicesMatch(site, site.version)) {
      site.pending = false;
      site.force = false;
    }
    if (
      site.pendingStaging &&
      allDevicesMatch(site, site.stagingVersion)
    ) {
      site.pendingStaging = false;
    }
    store.sites[input.siteKey] = site;
    saveStore(store);
  }
  return getTislyOtaVersionV1({
    siteKey: input.siteKey,
    reportedVersion: version || null,
    deviceId: input.deviceId,
  });
}

export function listTislyOtaCatalogV1(channel?: TislyOtaChannelV1): {
  ok: true;
  channel: TislyOtaChannelV1;
  sites: TislyOtaVersionPayloadV1[];
} {
  const ch = channel === "staging" ? "staging" : "production";
  return {
    ok: true,
    channel: ch,
    sites: (["toyoshima", "itabashi"] as TislyOtaSiteKeyV1[]).map(
      (siteKey) => getTislyOtaVersionV1({ siteKey, channel: ch })
    ),
  };
}

/** テスト専用。本番の既存行は触らない */
export function resetTislyOtaStoreForTestV1(): void {
  try {
    ensureTableV1();
    getDatabase().exec(`DELETE FROM tisly_rp2350_ota_v1`);
  } catch {
    /* テーブル未作成なら無視 */
  }
}
