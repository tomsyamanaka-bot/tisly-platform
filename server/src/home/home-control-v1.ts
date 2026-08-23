/**
 * TiSLY HOME — ワンタップ制御 v1
 *
 * 4大デバイスへの制御命令を1つの
 * 入口（applyHomeControlV1）にまとめる。
 * 既存の物件配列は削除せず対象値のみ更新。
 *
 * 玄関ロック / エアコンは SwitchBot Cloud API が設定されていれば
 * 実機へコマンド送信し、未設定・失敗時はモック状態更新へフォールバック。
 */

import {
  findHomeSiteV1,
  type HomeAirconFanV1,
  type HomeAirconModeV1,
  type HomeAirconSwingV1,
  type HomeAccessEntryV1,
  type HomeAirconV1,
  type HomeCredentialTypeV1,
  type HomeIntercomVisitorV1,
  type HomeIotSwitchV1,
  type HomeSiteV1,
} from "./home-sites-v1.js";
import {
  getSwitchBotHomeEnvV1,
  isSwitchBotHomeConfiguredV1,
  sendSwitchBotAirconPowerV1,
  sendSwitchBotAirconSetAllV1,
  sendSwitchBotBotPressV1,
  sendSwitchBotLockCommandV1,
  sendSwitchBotPowerCommandV1,
} from "./switchbot_client.js";
import { resolveHomeSwitchBotMapV1 } from "./home-switchbot-map-v1.js";
import {
  toggleOneshotBathFillV1,
  hydrateHomeBathStateV1,
  syncBathEstimationForSiteV1,
} from "./home-bath-state-v1.js";
import { applyHomeSecurityLightControlV1 } from "./home-security-light-v1.js";

/** 制御対象デバイス種別 */
export type HomeControlTargetV1 =
  | "circuit"
  | "bath"
  | "aircon"
  | "lock"
  | "intercom"
  | "security_light"
  | "iot";

export interface HomeControlInputV1 {
  siteId: string;
  target: HomeControlTargetV1;
  action: string;
  /** 対象デバイス（回路ID / エアコンキー） */
  deviceKey?: string | null;
  /** 温度・ON/OFF 等の値 */
  value?: unknown;
  /** 操作者（ログ用） */
  actor?: string | null;
}

export interface HomeControlResultV1 {
  ok: boolean;
  error?: string;
  siteId?: string;
  target?: HomeControlTargetV1;
  action?: string;
  deviceKey?: string | null;
  /** 人間向けの結果メッセージ */
  message?: string;
  /** 制御後の状態スナップショット */
  state?: unknown;
}

const AIRCON_MIN_TEMP_C = 16;
const AIRCON_MAX_TEMP_C = 32;
const BATH_MIN_TEMP_C = 32;
const BATH_MAX_TEMP_C = 48;
const ACCESS_LOG_MAX = 20;
const VISITOR_LOG_MAX = 20;

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * 分岐回路のリレー ON/OFF
 * 既存回路は削除せず対象のみ更新。
 */
export function setHomeCircuitStateV1(
  siteId: string,
  circuitId: string,
  on: boolean
): HomeSiteV1 | null {
  const site = findHomeSiteV1(siteId);
  if (!site || site.id !== siteId) return null;
  const circuit = site.ct.circuits.find((c) => c.id === circuitId);
  if (!circuit) return null;
  circuit.on = Boolean(on);
  // OFF は電流0、ON は代表値へ復帰
  if (!circuit.on) {
    circuit.currentA = 0;
  } else if (circuit.currentA === 0) {
    circuit.currentA = circuit.voltage >= 200 ? 8.0 : 4.0;
  }
  recomputeMainCurrentV1(site);
  return site;
}

/**
 * 分岐回路の合計から主幹電流・電力を再計算
 * 主幹CT = 通電中回路の電流合計
 * 消費電力 = 各回路の 電流 × 電圧
 */
export function recomputeMainCurrentV1(site: HomeSiteV1): void {
  let totalA = 0;
  let totalW = 0;
  for (const c of site.ct.circuits) {
    if (!c.on) continue;
    totalA += c.currentA;
    totalW += c.currentA * c.voltage;
  }
  site.ct.mainCurrentA = Math.round(totalA * 10) / 10;
  site.ct.powerW = Math.round(totalW);
  site.ct.peakCutActive =
    site.ct.mainCurrentA >= site.ct.warnThresholdA;
}

/** 風呂リモコン制御 */
export function applyHomeBathControlV1(
  site: HomeSiteV1,
  action: string,
  value: unknown
): HomeControlResultV1 {
  const bath = site.bath;
  const oneshot =
    bath.uiProfile === "oneshot_autofill" ||
    site.operationMode === "live";

  switch (action) {
    case "auto_fill": {
      // 実機ワンショット: 推定30分タイマー付き
      if (oneshot) {
        syncBathEstimationForSiteV1(site);
        hydrateHomeBathStateV1(site.id);
        const toggled = toggleOneshotBathFillV1({
          site,
          actor: "app",
        });
        if (!toggled.ok) {
          return {
            ok: false,
            error: toggled.error || "湯はり操作に失敗しました",
          };
        }
        return {
          ok: true,
          message: toggled.message,
          state: site.bath,
        };
      }
      const next = toBool(value, !bath.autoFill);
      bath.autoFill = next;
      bath.fillState = next ? "filling" : "idle";
      bath.fillPercent = next ? Math.max(bath.fillPercent, 5) : 0;
      bath.lastPulseMessage = null;
      return {
        ok: true,
        message: next
          ? "自動お湯はりを開始しました"
          : "自動お湯はりを停止しました",
        state: bath,
      };
    }
    case "reheat": {
      if (oneshot) {
        return {
          ok: false,
          error: "この物件では追いだきは非対応です",
        };
      }
      const next = toBool(value, !bath.reheating);
      bath.reheating = next;
      if (next) {
        bath.currentTempC =
          Math.round(
            Math.min(bath.setTempC, bath.currentTempC + 1.5) * 10
          ) / 10;
      }
      return {
        ok: true,
        message: next
          ? "追いだきを開始しました"
          : "追いだきを停止しました",
        state: bath,
      };
    }
    case "keep_warm": {
      if (oneshot) {
        return {
          ok: false,
          error: "この物件ではふろ保温は非対応です",
        };
      }
      const next = toBool(value, !bath.keepWarm);
      bath.keepWarm = next;
      return {
        ok: true,
        message: next
          ? "ふろ保温を ON にしました"
          : "ふろ保温を OFF にしました",
        state: bath,
      };
    }
    case "set_temp": {
      if (oneshot) {
        return {
          ok: false,
          error: "この物件では給湯温度設定は非対応です",
        };
      }
      bath.setTempC = clampNumber(
        value,
        BATH_MIN_TEMP_C,
        BATH_MAX_TEMP_C,
        bath.setTempC
      );
      return {
        ok: true,
        message: `給湯温度を ${bath.setTempC}℃ に設定しました`,
        state: bath,
      };
    }
    case "temp_up":
    case "temp_down": {
      if (oneshot) {
        return {
          ok: false,
          error: "この物件では給湯温度設定は非対応です",
        };
      }
      // ワンタップの ±1℃ 調整
      const delta = action === "temp_up" ? 1 : -1;
      bath.setTempC = clampNumber(
        bath.setTempC + delta,
        BATH_MIN_TEMP_C,
        BATH_MAX_TEMP_C,
        bath.setTempC
      );
      return {
        ok: true,
        message: `給湯温度を ${bath.setTempC}℃ に設定しました`,
        state: bath,
      };
    }
    default:
      return { ok: false, error: "未対応の風呂操作です" };
  }
}

function isPrimarySwitchBotAirconV1(ac: HomeAirconV1): boolean {
  // リビング（先頭）エアコンのみ実機 IR に紐づける
  return ac.deviceKey === "ac-living";
}

async function dispatchLockToSwitchBotV1(
  nextLocked: boolean
): Promise<{ used: boolean; note?: string }> {
  const env = getSwitchBotHomeEnvV1();
  const map = await resolveHomeSwitchBotMapV1({ env });
  const lockId = map.lock || env.lockDeviceId;
  if (!isSwitchBotHomeConfiguredV1(env) || !lockId) {
    return { used: false };
  }
  const command = nextLocked ? "lock" : "unlock";
  const result = await sendSwitchBotLockCommandV1(command, lockId, env);
  if (result.skipped) return { used: false };
  if (!result.ok) {
    return {
      used: true,
      note: `（SwitchBot: ${result.error} → モック反映）`,
    };
  }
  return { used: true, note: "（SwitchBot 送信）" };
}

async function dispatchAirconToSwitchBotV1(
  ac: HomeAirconV1,
  action: string
): Promise<{ used: boolean; note?: string }> {
  if (!isPrimarySwitchBotAirconV1(ac)) {
    return { used: false };
  }
  const env = getSwitchBotHomeEnvV1();
  const map = await resolveHomeSwitchBotMapV1({ env });
  const acId = map.aircon || env.airConditionerDeviceId;
  if (!isSwitchBotHomeConfiguredV1(env) || !acId) {
    return { used: false };
  }

  if (action === "power") {
    const powerResult = await sendSwitchBotAirconPowerV1(
      ac.power,
      acId,
      env
    );
    if (powerResult.skipped) return { used: false };
    if (!powerResult.ok) {
      const setAll = await sendSwitchBotAirconSetAllV1({
        deviceId: acId,
        temperatureC: ac.setTempC,
        mode: ac.mode,
        fan: ac.fan,
        power: ac.power,
        env,
      });
      if (!setAll.ok) {
        return {
          used: true,
          note: `（SwitchBot: ${powerResult.error || setAll.error} → モック反映）`,
        };
      }
      return { used: true, note: "（SwitchBot 送信）" };
    }
    return { used: true, note: "（SwitchBot 送信）" };
  }

  if (
    action === "set_temp" ||
    action === "temp_up" ||
    action === "temp_down" ||
    action === "mode" ||
    action === "fan" ||
    action === "peak_save"
  ) {
    const setAll = await sendSwitchBotAirconSetAllV1({
      deviceId: acId,
      temperatureC: ac.setTempC,
      mode: ac.mode,
      fan: ac.fan,
      power: ac.power,
      env,
    });
    if (setAll.skipped) return { used: false };
    if (!setAll.ok) {
      return {
        used: true,
        note: `（SwitchBot: ${setAll.error} → モック反映）`,
      };
    }
    return { used: true, note: "（SwitchBot 送信）" };
  }

  return { used: false };
}

function findIotSwitchV1(
  site: HomeSiteV1,
  deviceKey: string | null | undefined
): HomeIotSwitchV1 | null {
  const key = String(deviceKey || "").trim();
  if (!key || !site.iotSwitches?.length) return null;
  return site.iotSwitches.find((s) => s.deviceKey === key) ?? null;
}

/** IoT スイッチ（シーリング / TV / 加湿器 / スリー電源）ローカル更新 */
export function applyHomeIotControlV1(
  site: HomeSiteV1,
  deviceKey: string | null | undefined,
  action: string,
  value: unknown
): HomeControlResultV1 {
  const sw = findIotSwitchV1(site, deviceKey);
  if (!sw) return { ok: false, error: "IoT デバイスが見つかりません" };
  if (action !== "power" && action !== "toggle") {
    return { ok: false, error: "未対応の IoT 操作です" };
  }
  const next =
    action === "toggle" ? !sw.power : toBool(value, !sw.power);
  sw.power = next;
  sw.updatedAt = nowIso();
  return {
    ok: true,
    message: next
      ? `${sw.label} を ON にしました`
      : `${sw.label} を OFF にしました`,
    state: sw,
  };
}

async function dispatchIotToSwitchBotV1(
  sw: HomeIotSwitchV1
): Promise<{ used: boolean; note?: string }> {
  const env = getSwitchBotHomeEnvV1();
  const map = await resolveHomeSwitchBotMapV1({ env });
  const roleByKey: Record<string, "ceiling" | "tv" | "humidifier" | "plug"> =
    {
      "ceiling-yoma": "ceiling",
      "tv-1": "tv",
      "humidifier-yoma": "humidifier",
      "plug-three": "plug",
    };
  const role = roleByKey[sw.deviceKey];
  const deviceId = role ? String(map[role] || "").trim() : "";
  if (!deviceId) return { used: false };
  const result = await sendSwitchBotPowerCommandV1(deviceId, sw.power, env);
  if (result.skipped) return { used: false };
  if (!result.ok) {
    return {
      used: true,
      note: `（SwitchBot: ${result.error} → モック反映）`,
    };
  }
  return { used: true, note: "（SwitchBot 送信）" };
}

/**
 * 風呂 oneshot: SwitchBot Bot press を優先。失敗時は RP2350 へフォールバック。
 */
async function dispatchBathBotOrRelayV1(
  site: HomeSiteV1,
  action: string,
  value: unknown
): Promise<HomeControlResultV1> {
  const oneshot =
    site.bath.uiProfile === "oneshot_autofill" ||
    site.operationMode === "live";
  if (!(oneshot && action === "auto_fill")) {
    return applyHomeBathControlV1(site, action, value);
  }

  const env = getSwitchBotHomeEnvV1();
  const map = await resolveHomeSwitchBotMapV1({ env });
  const botId = String(map.bathBot || "").trim();
  if (botId) {
    const press = await sendSwitchBotBotPressV1(botId, env);
    if (press.ok) {
      // Bot 成功時は RP2350 を叩かず UI 状態のみ更新
      syncBathEstimationForSiteV1(site);
      hydrateHomeBathStateV1(site.id);
      const filling =
        site.bath.fillState === "filling" || site.bath.autoFill;
      if (filling) {
        site.bath.fillState = "idle";
        site.bath.autoFill = false;
        site.bath.fillPercent = 0;
        site.bath.fillStartedAt = null;
        site.bath.fillEstimatedEndAt = null;
        site.bath.lastPulseMessage = "Bot 押下（停止）送信完了";
      } else {
        const startedAt = nowIso();
        site.bath.fillState = "filling";
        site.bath.autoFill = true;
        site.bath.fillPercent = 5;
        site.bath.fillStartedAt = startedAt;
        site.bath.fillEstimatedEndAt = new Date(
          Date.now() + 30 * 60 * 1000
        ).toISOString();
        site.bath.lastPulseMessage =
          "湯はり指令送信完了（SwitchBot Bot）";
      }
      return {
        ok: true,
        message: `${site.bath.lastPulseMessage}（SwitchBot press）`,
        state: site.bath,
      };
    }
    // Bot 失敗 → RP2350 フォールバック
    const fallback = applyHomeBathControlV1(site, action, value);
    if (fallback.ok && fallback.message) {
      return {
        ...fallback,
        message: `${fallback.message}（SwitchBot Bot 失敗 → RP2350）`,
      };
    }
    return fallback;
  }

  return applyHomeBathControlV1(site, action, value);
}

function normalizeCredentialV1(value: unknown): HomeCredentialTypeV1 {
  const raw =
    typeof value === "object" && value !== null
      ? String((value as { credentialType?: string }).credentialType ?? "")
      : "";
  const allowed: HomeCredentialTypeV1[] = [
    "nfc",
    "rfid",
    "pin",
    "app",
    "key",
  ];
  return allowed.includes(raw as HomeCredentialTypeV1)
    ? (raw as HomeCredentialTypeV1)
    : "app";
}

/**
 * 統合制御エントリポイント
 * PWA からの1タップ操作はここへ集約する。
 * ロック / エアコン / IoT は設定時に SwitchBot へ非同期送信する。
 */
export async function applyHomeControlV1(
  input: HomeControlInputV1
): Promise<HomeControlResultV1> {
  const siteId = String(input.siteId || "").trim();
  const site = findHomeSiteV1(siteId);
  if (!site || site.id !== siteId) {
    return { ok: false, error: "物件が見つかりません" };
  }
  const action = String(input.action || "").trim();
  if (!action) {
    return { ok: false, error: "action が必要です" };
  }

  let result: HomeControlResultV1;
  switch (input.target) {
    case "circuit": {
      const circuitId = String(input.deviceKey || "").trim();
      const on = toBool(input.value, true);
      const updated = setHomeCircuitStateV1(site.id, circuitId, on);
      result = updated
        ? {
            ok: true,
            message: on
              ? "回路を通電しました"
              : "回路を遮断しました",
            state: updated.ct,
          }
        : { ok: false, error: "回路が見つかりません" };
      break;
    }
    case "bath":
      result = await dispatchBathBotOrRelayV1(site, action, input.value);
      break;
    case "aircon": {
      result = applyHomeAirconControlV1(
        site,
        input.deviceKey,
        action,
        input.value
      );
      if (result.ok && result.state) {
        const ac = result.state as HomeAirconV1;
        try {
          const sb = await dispatchAirconToSwitchBotV1(ac, action);
          if (sb.note && result.message) {
            result = { ...result, message: `${result.message}${sb.note}` };
          }
        } catch {
          if (result.message) {
            result = {
              ...result,
              message: `${result.message}（SwitchBot 通信エラー → モック反映）`,
            };
          }
        }
      }
      break;
    }
    case "iot": {
      result = applyHomeIotControlV1(
        site,
        input.deviceKey,
        action,
        input.value
      );
      if (result.ok && result.state) {
        const sw = result.state as HomeIotSwitchV1;
        try {
          const sb = await dispatchIotToSwitchBotV1(sw);
          if (sb.note && result.message) {
            result = { ...result, message: `${result.message}${sb.note}` };
          }
        } catch {
          if (result.message) {
            result = {
              ...result,
              message: `${result.message}（SwitchBot 通信エラー → モック反映）`,
            };
          }
        }
      }
      break;
    }
    case "lock": {
      if (action !== "toggle" && action !== "lock" && action !== "unlock") {
        result = { ok: false, error: "未対応の施錠操作です" };
        break;
      }
      const nextLocked =
        action === "toggle" ? !site.lock.locked : action === "lock";
      let sbNote = "";
      try {
        const sb = await dispatchLockToSwitchBotV1(nextLocked);
        if (sb.note) sbNote = sb.note;
      } catch {
        sbNote = "（SwitchBot 通信エラー → モック反映）";
      }
      result = applyHomeLockControlV1(
        site,
        nextLocked ? "lock" : "unlock",
        input.value,
        input.actor
      );
      if (result.ok && sbNote && result.message) {
        result = { ...result, message: `${result.message}${sbNote}` };
      }
      break;
    }
    case "security_light": {
      result = applyHomeSecurityLightControlV1({
        siteId: site.id,
        action,
        actor: input.actor,
      });
      break;
    }
    case "intercom": {
      result = applyHomeIntercomControlV1(
        site,
        action,
        input.value,
        input.actor
      );
      if (result.ok && action === "unlock_door") {
        let sbNote = "";
        try {
          const sb = await dispatchLockToSwitchBotV1(false);
          if (sb.note) sbNote = sb.note;
        } catch {
          sbNote = "（SwitchBot 通信エラー → モック反映）";
        }
        applyHomeLockControlV1(
          site,
          "unlock",
          { credentialType: "app" },
          input.actor || "インターホン応答"
        );
        if (sbNote && result.message) {
          result = { ...result, message: `${result.message}${sbNote}` };
        }
      }
      break;
    }
    default:
      result = { ok: false, error: "未対応の制御対象です" };
  }

  return {
    ...result,
    siteId: site.id,
    target: input.target,
    action,
    deviceKey: input.deviceKey ?? null,
  };
}

/** エアコン制御（ローカル状態更新。実機送信は applyHomeControlV1 側） */
export function applyHomeAirconControlV1(
  site: HomeSiteV1,
  deviceKey: string | null | undefined,
  action: string,
  value: unknown
): HomeControlResultV1 {
  const key = String(deviceKey || "").trim();
  const ac =
    site.aircons.find((a) => a.deviceKey === key) || site.aircons[0];
  if (!ac) return { ok: false, error: "エアコンが見つかりません" };

  switch (action) {
    case "power": {
      const next = toBool(value, !ac.power);
      ac.power = next;
      ac.powerW = next ? (ac.mode === "fan" ? 90 : 740) : 0;
      return {
        ok: true,
        message: next
          ? `${ac.label} を運転開始しました`
          : `${ac.label} を停止しました`,
        state: ac,
      };
    }
    case "set_temp": {
      ac.setTempC = clampNumber(
        value,
        AIRCON_MIN_TEMP_C,
        AIRCON_MAX_TEMP_C,
        ac.setTempC
      );
      return {
        ok: true,
        message: `設定温度を ${ac.setTempC}℃ にしました`,
        state: ac,
      };
    }
    case "temp_up":
    case "temp_down": {
      const delta = action === "temp_up" ? 1 : -1;
      ac.setTempC = clampNumber(
        ac.setTempC + delta,
        AIRCON_MIN_TEMP_C,
        AIRCON_MAX_TEMP_C,
        ac.setTempC
      );
      return {
        ok: true,
        message: `設定温度を ${ac.setTempC}℃ にしました`,
        state: ac,
      };
    }
    case "mode": {
      const modes: HomeAirconModeV1[] = [
        "cool",
        "heat",
        "dry",
        "fan",
      ];
      const next = String(value ?? "") as HomeAirconModeV1;
      if (!modes.includes(next)) {
        return { ok: false, error: "未対応の運転モードです" };
      }
      ac.mode = next;
      if (ac.power) ac.powerW = next === "fan" ? 90 : 740;
      return {
        ok: true,
        message: "運転モードを変更しました",
        state: ac,
      };
    }
    case "fan": {
      const fans: HomeAirconFanV1[] = ["auto", "low", "mid", "high"];
      const next = String(value ?? "") as HomeAirconFanV1;
      if (!fans.includes(next)) {
        return { ok: false, error: "未対応の風量です" };
      }
      ac.fan = next;
      return { ok: true, message: "風量を変更しました", state: ac };
    }
    case "swing": {
      const swings: HomeAirconSwingV1[] = [
        "auto",
        "up",
        "middle",
        "down",
      ];
      const next = String(value ?? "") as HomeAirconSwingV1;
      if (!swings.includes(next)) {
        return { ok: false, error: "未対応の風向です" };
      }
      ac.swing = next;
      return { ok: true, message: "風向を変更しました", state: ac };
    }
    case "peak_save": {
      const next = toBool(value, !ac.peakSaveActive);
      ac.peakSaveActive = next;
      if (next) {
        // ピーク時は設定温度を1℃緩めて節電
        ac.setTempC = clampNumber(
          ac.mode === "heat" ? ac.setTempC - 1 : ac.setTempC + 1,
          AIRCON_MIN_TEMP_C,
          AIRCON_MAX_TEMP_C,
          ac.setTempC
        );
      }
      return {
        ok: true,
        message: next
          ? "ピーク時自動セーブ運転を ON にしました"
          : "ピーク時自動セーブ運転を OFF にしました",
        state: ac,
      };
    }
    default:
      return { ok: false, error: "未対応のエアコン操作です" };
  }
}

/** 玄関スマートロック制御（ローカル状態更新） */
export function applyHomeLockControlV1(
  site: HomeSiteV1,
  action: string,
  value: unknown,
  actor: string | null | undefined
): HomeControlResultV1 {
  const lock = site.lock;
  if (action !== "toggle" && action !== "lock" && action !== "unlock") {
    return { ok: false, error: "未対応の施錠操作です" };
  }
  const nextLocked =
    action === "toggle" ? !lock.locked : action === "lock";
  lock.locked = nextLocked;

  const entry: HomeAccessEntryV1 = {
    id: `acc-${Date.now()}`,
    credentialType: normalizeCredentialV1(value),
    holderName: String(actor || "TiSLY アプリ操作"),
    action: nextLocked ? "lock" : "unlock",
    occurredAt: nowIso(),
  };
  lock.accessLog = [entry, ...lock.accessLog].slice(0, ACCESS_LOG_MAX);

  return {
    ok: true,
    message: nextLocked ? "施錠しました 🔒" : "解錠しました 🔓",
    state: lock,
  };
}

/**
 * スマートインターホン制御
 * unlock_door は玄関錠と連動（解錠は呼び出し側で実機送信）
 */
export function applyHomeIntercomControlV1(
  site: HomeSiteV1,
  action: string,
  value: unknown,
  actor: string | null | undefined
): HomeControlResultV1 {
  const ic = site.intercom;
  const at = nowIso();

  const pushVisitor = (
    label: string,
    handledAs: HomeIntercomVisitorV1["handledAs"]
  ): void => {
    const entry: HomeIntercomVisitorV1 = {
      id: `vis-${Date.now()}`,
      label,
      occurredAt: at,
      handledAs,
    };
    ic.visitors = [entry, ...ic.visitors].slice(0, VISITOR_LOG_MAX);
    ic.lastVisitAt = at;
  };

  switch (action) {
    case "ring": {
      // 実機 webhook / デモ操作からの呼出発生
      ic.state = "ringing";
      pushVisitor(
        String(value || "来訪者") || "来訪者",
        "missed"
      );
      return {
        ok: true,
        message: "インターホンが呼び出されています 🔔",
        state: ic,
      };
    }
    case "answer": {
      if (ic.state === "ringing") {
        const latest = ic.visitors[0];
        if (latest) latest.handledAs = "answered";
      }
      ic.state = "talking";
      return {
        ok: true,
        message: `通話を開始しました（${String(
          actor || "TiSLY アプリ操作"
        )}）`,
        state: ic,
      };
    }
    case "auto_response": {
      if (ic.state === "ringing") {
        const latest = ic.visitors[0];
        if (latest) latest.handledAs = "auto";
      } else {
        pushVisitor("自動応答", "auto");
      }
      ic.state = "auto_responded";
      return {
        ok: true,
        message: `自動応答しました：「${ic.autoResponseMessage}」`,
        state: ic,
      };
    }
    case "unlock_door": {
      if (!ic.unlockLinkEnabled) {
        return {
          ok: false,
          error: "この住まいはインターホンからの解錠を許可していません",
        };
      }
      const latest = ic.visitors[0];
      if (latest && ic.state === "ringing") latest.handledAs = "unlocked";
      else pushVisitor("インターホンから解錠", "unlocked");
      ic.state = "idle";
      return {
        ok: true,
        message: "玄関を解錠しました 🔓",
        state: ic,
      };
    }
    case "dismiss": {
      ic.state = "idle";
      return { ok: true, message: "呼出を閉じました", state: ic };
    }
    case "set_auto_message": {
      const next = String(value ?? "").trim();
      if (!next) {
        return { ok: false, error: "自動応答メッセージが空です" };
      }
      ic.autoResponseMessage = next.slice(0, 120);
      return {
        ok: true,
        message: "自動応答メッセージを更新しました",
        state: ic,
      };
    }
    default:
      return { ok: false, error: "未対応のインターホン操作です" };
  }
}
