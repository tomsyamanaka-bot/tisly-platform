/**
 * TiSLY HOME — SwitchBot デバイス ID 解決
 *
 * env 明示指定を優先し、未設定時は /devices の deviceName で自動マッチ。
 * 結果は短時間キャッシュしてポーリング負荷を抑える。
 */

import {
  getSwitchBotHomeEnvV1,
  isSwitchBotHomeConfiguredV1,
  listSwitchBotDevicesV1,
  type SwitchBotDeviceV1,
  type SwitchBotHomeEnvV1,
} from "./switchbot_client.js";

export type HomeSwitchBotRoleV1 =
  | "lock"
  | "aircon"
  | "ceiling"
  | "bath_bot"
  | "meter"
  | "tv"
  | "humidifier"
  | "plug";

export interface HomeSwitchBotResolvedMapV1 {
  lock: string;
  aircon: string;
  ceiling: string;
  bathBot: string;
  meter: string;
  tv: string;
  humidifier: string;
  plug: string;
  /** 解決に使ったデバイス一覧のスナップショット件数 */
  deviceCount: number;
  resolvedAt: string;
}

const CACHE_TTL_MS = 60_000;
let cache: { at: number; map: HomeSwitchBotResolvedMapV1 } | null = null;

/** 役割ごとの env キー（任意） */
export function getSwitchBotRoleEnvIdsV1(
  env: SwitchBotHomeEnvV1 = getSwitchBotHomeEnvV1()
): Record<HomeSwitchBotRoleV1, string> {
  return {
    lock: env.lockDeviceId,
    aircon: env.airConditionerDeviceId,
    ceiling: env.ceilingDeviceId,
    bath_bot: env.bathBotDeviceId,
    meter: env.meterDeviceId,
    tv: env.tvDeviceId,
    humidifier: env.humidifierDeviceId,
    plug: env.plugDeviceId,
  };
}

function normalizeName(name: string): string {
  return String(name || "")
    .normalize("NFKC")
    .replace(/[\s　]+/g, "")
    .toLowerCase();
}

type MatchRule = {
  role: HomeSwitchBotRoleV1;
  /** deviceName 正規化後の部分一致（すべて満たす） */
  includesAll?: string[];
  /** いずれか一致 */
  includesAny?: string[];
  /** deviceType / remoteType 部分一致（任意） */
  typeIncludesAny?: string[];
  infrared?: boolean;
};

const NAME_RULES_V1: MatchRule[] = [
  {
    role: "lock",
    includesAny: ["板橋自宅", "板橋", "smartlock"],
    typeIncludesAny: ["lock"],
  },
  {
    role: "aircon",
    includesAny: ["エアコン"],
    typeIncludesAny: ["air conditioner", "airconditioner"],
    infrared: true,
  },
  {
    role: "ceiling",
    includesAny: ["シーリング"],
    typeIncludesAny: ["ceiling"],
  },
  {
    role: "bath_bot",
    includesAny: ["風呂"],
    typeIncludesAny: ["bot"],
  },
  {
    role: "meter",
    includesAny: ["温湿度"],
    typeIncludesAny: ["meter", "hub"],
  },
  {
    role: "tv",
    includesAny: ["テレビ"],
    typeIncludesAny: ["tv"],
    infrared: true,
  },
  {
    role: "humidifier",
    includesAny: ["加湿"],
    typeIncludesAny: ["humidifier"],
  },
  {
    role: "plug",
    includesAny: ["スリー電源", "スリー"],
    typeIncludesAny: ["plug"],
  },
];

function scoreDevice(device: SwitchBotDeviceV1, rule: MatchRule): number {
  const name = normalizeName(device.deviceName);
  const type = normalizeName(device.deviceType);
  if (rule.infrared === true && !device.infrared) return 0;
  if (rule.infrared === false && device.infrared) return 0;

  let score = 0;
  if (rule.includesAll?.length) {
    if (!rule.includesAll.every((p) => name.includes(normalizeName(p)))) {
      return 0;
    }
    score += 20;
  }
  if (rule.includesAny?.length) {
    const hit = rule.includesAny.some((p) =>
      name.includes(normalizeName(p))
    );
    if (!hit) return 0;
    score += 10;
  }
  if (rule.typeIncludesAny?.length) {
    if (rule.typeIncludesAny.some((p) => type.includes(normalizeName(p)))) {
      score += 5;
    }
  }
  return score;
}

function pickByRule(
  devices: SwitchBotDeviceV1[],
  rule: MatchRule
): string {
  let best: SwitchBotDeviceV1 | null = null;
  let bestScore = 0;
  for (const d of devices) {
    const s = scoreDevice(d, rule);
    if (s > bestScore) {
      bestScore = s;
      best = d;
    }
  }
  return best?.deviceId ?? "";
}

function emptyMap(): HomeSwitchBotResolvedMapV1 {
  return {
    lock: "",
    aircon: "",
    ceiling: "",
    bathBot: "",
    meter: "",
    tv: "",
    humidifier: "",
    plug: "",
    deviceCount: 0,
    resolvedAt: new Date().toISOString(),
  };
}

/**
 * env + デバイス名から役割→deviceId を解決
 */
export async function resolveHomeSwitchBotMapV1(options?: {
  forceRefresh?: boolean;
  env?: SwitchBotHomeEnvV1;
  devices?: SwitchBotDeviceV1[];
}): Promise<HomeSwitchBotResolvedMapV1> {
  const env = options?.env ?? getSwitchBotHomeEnvV1();
  const now = Date.now();
  if (
    !options?.forceRefresh &&
    cache &&
    now - cache.at < CACHE_TTL_MS
  ) {
    return cache.map;
  }

  const envIds = getSwitchBotRoleEnvIdsV1(env);
  const map = emptyMap();
  map.lock = envIds.lock;
  map.aircon = envIds.aircon;
  map.ceiling = envIds.ceiling;
  map.bathBot = envIds.bath_bot;
  map.meter = envIds.meter;
  map.tv = envIds.tv;
  map.humidifier = envIds.humidifier;
  map.plug = envIds.plug;

  let devices = options?.devices;
  if (!devices) {
    if (!isSwitchBotHomeConfiguredV1(env)) {
      cache = { at: now, map };
      return map;
    }
    const listed = await listSwitchBotDevicesV1(env);
    devices = listed.ok && listed.data ? listed.data : [];
  }
  map.deviceCount = devices.length;

  const roleToField: Record<
    HomeSwitchBotRoleV1,
    keyof Omit<HomeSwitchBotResolvedMapV1, "deviceCount" | "resolvedAt">
  > = {
    lock: "lock",
    aircon: "aircon",
    ceiling: "ceiling",
    bath_bot: "bathBot",
    meter: "meter",
    tv: "tv",
    humidifier: "humidifier",
    plug: "plug",
  };

  for (const rule of NAME_RULES_V1) {
    const field = roleToField[rule.role];
    if (map[field]) continue;
    map[field] = pickByRule(devices, rule);
  }

  map.resolvedAt = new Date().toISOString();
  cache = { at: now, map };
  return map;
}

/** テスト用キャッシュクリア */
export function clearHomeSwitchBotMapCacheV1(): void {
  cache = null;
}

export function homeIotDeviceKeyToRoleV1(
  deviceKey: string
): HomeSwitchBotRoleV1 | null {
  switch (String(deviceKey || "").trim()) {
    case "ceiling-yoma":
      return "ceiling";
    case "tv-1":
      return "tv";
    case "humidifier-yoma":
      return "humidifier";
    case "plug-three":
      return "plug";
    case "bath-bot":
      return "bath_bot";
    case "meter-52":
      return "meter";
    default:
      return null;
  }
}
