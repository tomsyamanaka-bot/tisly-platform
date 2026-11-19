/**
 * 全物件の信号機。判定だけをまとめる。
 * 実機の版と保存設定は変えない。
 * お客様画面には出さない。
 */

import { TISLY_HEARTBEAT_OFFLINE_MS_V1 } from "./home-heartbeat-standard-v1.js";
import {
  OPS_CABINET_CAUTION_C_V1,
  OPS_CABINET_DANGER_C_V1,
  cabinetViewV1,
  listOpsSiteGroupsV1,
  maintenanceRemainingMinV1,
  sensorFloodActiveV1,
} from "./home-ops-safety-v1.js";
import { deviceHealthViewV1 } from "./home-device-health-v1.js";
import { readItabashiHeartbeatV1 } from "./home-itabashi-comm-v1.js";
import { listToyoshimaHeartbeatAtsV1 } from "./home-toyoshima-security-v1.js";
import { buildRyugasakiStatusV1 } from "./home-ryugasaki-security-v1.js";
import { buildKeepRisingStatusV1 } from "./home-keeprising-security-v1.js";
import {
  readTislyFirmwareBoardV1,
  type TislyOtaSiteKeyV1,
} from "../firmware/tisly-rp2350-ota-v1.js";
import {
  siteLifecycleOfV1,
  type SiteLifecycleStatusV1,
  type UnitPresenceV1,
} from "./site-lifecycle-v1.js";

export type SiteHealthLevelV1 = "critical" | "warning" | "ok";

export interface SiteSignalFactsV1 {
  offline: boolean;
  offlineAgeMs: number | null;
  maintenance: boolean;
  maintenanceRemainingMin: number | null;
  cabinetTempC: number | null;
  wdtFrequent: boolean;
  sensorFlood: boolean;
  firmwareMismatch: boolean;
}

export interface SiteSignalRowV1 {
  siteId: string;
  securitySiteId: string;
  displayName: string;
  customerCode: string;
  healthLevel: SiteHealthLevelV1;
  statusLabel: string;
  boardTempC: number | null;
  uptimeSec: number | null;
  uptimeLabel: string;
  runningVersion: string | null;
  latestVersion: string | null;
  versionsMatch: boolean | null;
  lastHeartbeatAt: string | null;
  lifecycleStatus: SiteLifecycleStatusV1;
}

const RANK: Record<SiteHealthLevelV1, number> = {
  critical: 0,
  warning: 1,
  ok: 2,
};

const SITE_META: Record<
  string,
  {
    customerCode: string;
    securitySiteId: string;
    otaKey: TislyOtaSiteKeyV1;
  }
> = {
  "HOME-JP-ITABASHI-LIVE": {
    customerCode: "TOMS001",
    securitySiteId: "SEC-JP-ITABASHI-LIVE",
    otaKey: "itabashi",
  },
  "HOME-JP-TOYOSHIMA": {
    customerCode: "TOYOSHIMA001",
    securitySiteId: "SEC-JP-TOYOSHIMA-001",
    otaKey: "toyoshima",
  },
  "HOME-JP-RYUGASAKI": {
    customerCode: "WASHMATE001",
    securitySiteId: "SEC-JP-RYUGASAKI-001",
    otaKey: "ryugasaki",
  },
  "HOME-JP-KEEPRISING": {
    customerCode: "KEEPRISING001",
    securitySiteId: "SEC-JP-KEEPRISING-001",
    otaKey: "keeprising",
  },
};

function tempText(tempC: number): string {
  return `${tempC.toFixed(1)}℃`;
}

function ageText(ageMs: number): string {
  const min = Math.max(1, Math.round(ageMs / 60_000));
  if (min < 60) return `${min}分`;
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  if (rest === 0) return `${hours}時間`;
  return `${hours}時間${rest}分`;
}

/** 異常、注意、正常の順で短い文言を決める。 */
export function classifySiteSignalV1(facts: SiteSignalFactsV1): {
  healthLevel: SiteHealthLevelV1;
  statusLabel: string;
} {
  const temp = facts.cabinetTempC;
  const hot =
    temp != null && temp >= OPS_CABINET_DANGER_C_V1;
  const warm =
    temp != null &&
    temp >= OPS_CABINET_CAUTION_C_V1 &&
    temp < OPS_CABINET_DANGER_C_V1;
  const lost = facts.offline && !facts.maintenance;
  if (lost || hot || facts.wdtFrequent || facts.sensorFlood) {
    if (lost) {
      const span =
        facts.offlineAgeMs == null
          ? "未受信"
          : ageText(facts.offlineAgeMs);
      return {
        healthLevel: "critical",
        statusLabel: `🔴 オフライン ${span}`,
      };
    }
    if (hot && temp != null) {
      return {
        healthLevel: "critical",
        statusLabel: `🔴 高温警報 ${tempText(temp)}`,
      };
    }
    if (facts.wdtFrequent) {
      return {
        healthLevel: "critical",
        statusLabel: "🔴 再起動が続いています",
      };
    }
    return {
      healthLevel: "critical",
      statusLabel: "🔴 センサー連続発報",
    };
  }
  if (facts.maintenance || warm || facts.firmwareMismatch) {
    if (facts.maintenance) {
      const left = facts.maintenanceRemainingMin ?? 1;
      return {
        healthLevel: "warning",
        statusLabel: `🟡 点検中 残り${left}分`,
      };
    }
    if (warm && temp != null) {
      return {
        healthLevel: "warning",
        statusLabel: `🟡 高温注意 ${tempText(temp)}`,
      };
    }
    return {
      healthLevel: "warning",
      statusLabel: "🟡 OTA更新待機",
    };
  }
  return { healthLevel: "ok", statusLabel: "オンライン" };
}

function lifeBucket(status: string | undefined): number {
  if (status === "demo") return 1;
  if (status === "archived") return 2;
  return 0;
}

export function sortSiteSignalsV1<
  T extends {
    healthLevel: SiteHealthLevelV1;
    displayName: string;
    lifecycleStatus?: string;
  }
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const life = lifeBucket(a.lifecycleStatus) - lifeBucket(b.lifecycleStatus);
    if (life !== 0) return life;
    const rank = RANK[a.healthLevel] - RANK[b.healthLevel];
    if (rank !== 0) return rank;
    return a.displayName.localeCompare(b.displayName, "ja");
  });
}

function offlineOf(
  ats: Array<string | null>,
  nowMs: number
): { offline: boolean; ageMs: number | null; latest: string | null } {
  let latest: string | null = null;
  let latestMs = 0;
  let missing = false;
  let worst: number | null = null;
  if (!ats.length) return { offline: false, ageMs: null, latest: null };
  for (const iso of ats) {
    if (!iso) {
      missing = true;
      continue;
    }
    const at = Date.parse(iso);
    if (!Number.isFinite(at)) {
      missing = true;
      continue;
    }
    if (!latest || at >= latestMs) {
      latest = iso;
      latestMs = at;
    }
    const age = nowMs - at;
    if (age >= TISLY_HEARTBEAT_OFFLINE_MS_V1) {
      worst = worst == null ? age : Math.max(worst, age);
    }
  }
  if (worst != null) return { offline: true, ageMs: worst, latest };
  if (missing) return { offline: true, ageMs: null, latest };
  return { offline: false, ageMs: null, latest };
}

function heartbeatOf(siteId: string): {
  ats: Array<string | null>;
  tempC: number | null;
} {
  if (siteId === "HOME-JP-ITABASHI-LIVE") {
    const row = readItabashiHeartbeatV1();
    return { ats: [row.lastHeartbeatAt], tempC: row.boardTempC };
  }
  if (siteId === "HOME-JP-TOYOSHIMA") {
    const life = siteLifecycleOfV1(siteId);
    const presence = new Map(
      (life?.units ?? []).map((unit) => [unit.id, unit.presence])
    );
    const rows = listToyoshimaHeartbeatAtsV1();
    const paired = [
      { id: "main", row: rows[0] },
      { id: "detached", row: rows[1] },
    ].filter((item) => {
      const state = presence.get(item.id) as UnitPresenceV1 | undefined;
      return state !== "planned" && item.row;
    });
    const temps = paired
      .map((item) => item.row?.tempC)
      .filter((n): n is number => n != null);
    return {
      ats: paired.map((item) => item.row?.at ?? null),
      tempC: temps.length ? Math.max(...temps) : null,
    };
  }
  if (siteId === "HOME-JP-RYUGASAKI") {
    const row = buildRyugasakiStatusV1();
    return { ats: [row.lastHeartbeatAt], tempC: row.boardTempC };
  }
  if (siteId === "HOME-JP-KEEPRISING") {
    const row = buildKeepRisingStatusV1();
    return { ats: [row.lastHeartbeatAt], tempC: row.boardTempC };
  }
  return { ats: [null], tempC: null };
}

function firmwareOf(otaKey: TislyOtaSiteKeyV1 | null): {
  runningVersion: string | null;
  latestVersion: string | null;
  versionsMatch: boolean | null;
} {
  if (!otaKey) {
    return {
      runningVersion: null,
      latestVersion: null,
      versionsMatch: null,
    };
  }
  try {
    return readTislyFirmwareBoardV1(otaKey);
  } catch {
    return {
      runningVersion: null,
      latestVersion: null,
      versionsMatch: null,
    };
  }
}

/** 登録現場を信号機の順で返す。 */
export function buildSiteSignalBoardV1(nowMs: number = Date.now()): {
  ok: true;
  generatedAt: string;
  counts: { critical: number; warning: number; ok: number; total: number };
  sites: SiteSignalRowV1[];
} {
  const rows: SiteSignalRowV1[] = [];
  for (const group of listOpsSiteGroupsV1()) {
    const life = siteLifecycleOfV1(group.key);
    if (!life || life.lifecycleStatus === "deleted") continue;
    const meta = SITE_META[group.key];
    let pulse = { ats: [null] as Array<string | null>, tempC: null as number | null };
    try {
      pulse = heartbeatOf(group.key);
    } catch {
      pulse = { ats: [null], tempC: null };
    }
    if (group.key !== "HOME-JP-TOYOSHIMA") {
      const main = life.units.find((unit) => unit.id === "main");
      if (main?.presence === "planned") {
        pulse = { ats: [], tempC: pulse.tempC };
      }
    }
    const link = offlineOf(pulse.ats, nowMs);
    const cabinet = cabinetViewV1(group.key).tempC;
    const temp = cabinet ?? pulse.tempC;
    const health = deviceHealthViewV1(group.key, nowMs);
    const remain = maintenanceRemainingMinV1(group.key, nowMs);
    const fw = firmwareOf(meta?.otaKey ?? null);
    const judged = classifySiteSignalV1({
      offline: link.offline,
      offlineAgeMs: link.ageMs,
      maintenance: remain != null,
      maintenanceRemainingMin: remain,
      cabinetTempC: temp,
      wdtFrequent: health.wdtFrequent,
      sensorFlood: sensorFloodActiveV1(group.key, nowMs),
      firmwareMismatch: fw.versionsMatch === false,
    });
    rows.push({
      siteId: group.key,
      securitySiteId: meta?.securitySiteId ?? group.key,
      displayName: group.name,
      customerCode: meta?.customerCode ?? "",
      healthLevel: judged.healthLevel,
      statusLabel: judged.statusLabel,
      boardTempC: temp,
      uptimeSec: health.uptimeSec,
      uptimeLabel: health.uptimeLabel,
      runningVersion: fw.runningVersion,
      latestVersion: fw.latestVersion,
      versionsMatch: fw.versionsMatch,
      lastHeartbeatAt: link.latest,
      lifecycleStatus: life.lifecycleStatus,
    });
  }
  const sites = sortSiteSignalsV1(rows);
  const counted = sites.filter((row) => row.lifecycleStatus === "active");
  const counts = {
    critical: 0,
    warning: 0,
    ok: 0,
    total: counted.length,
  };
  for (const row of counted) counts[row.healthLevel] += 1;
  return {
    ok: true,
    generatedAt: new Date(nowMs).toISOString(),
    counts,
    sites,
  };
}
