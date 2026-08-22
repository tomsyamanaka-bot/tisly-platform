/**
 * TiSLY HOME — ワンタップ一括シーン v1
 *
 * おでかけ / ただいま / おやすみ を
 * 防犯・照明・錠・風呂へ一括適用する。
 */

import { applyHomeControlV1 } from "./home-control-v1.js";
import { findHomeSiteV1, type HomeSiteV1 } from "./home-sites-v1.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";
import {
  homeGuardModeLabelJaV1,
  pauseHomeSecurityV1,
  updateHomeSecurityRulesV1,
} from "./home-security-rules-v1.js";

export type HomeSceneIdV1 = "away" | "welcome" | "goodnight";

export interface HomeSceneResultV1 {
  ok: boolean;
  scene: HomeSceneIdV1;
  siteId: string;
  message: string;
  actions: string[];
  error?: string;
}

const SCENE_LABELS: Record<HomeSceneIdV1, string> = {
  away: "🏠 おでかけ",
  welcome: "🚶 ただいま",
  goodnight: "🌙 おやすみ",
};

function allCircuitsOff(site: HomeSiteV1): string[] {
  const done: string[] = [];
  for (const c of site.ct.circuits) {
    if (c.on) {
      c.on = false;
      c.currentA = 0;
      done.push(`${c.label} OFF`);
    }
  }
  site.ct.mainCurrentA = 0;
  site.ct.powerW = 0;
  site.ct.peakCutActive = false;
  return done;
}

function nonEssentialCircuitsOff(site: HomeSiteV1): string[] {
  const done: string[] = [];
  for (const c of site.ct.circuits) {
    if (!c.on) continue;
    const label = c.label.toLowerCase();
    const keep =
      label.includes("風呂") ||
      label.includes("bath") ||
      label.includes("玄関") ||
      label.includes("entrance");
    if (keep) continue;
    c.on = false;
    c.currentA = 0;
    done.push(`${c.label} OFF`);
  }
  let totalA = 0;
  let totalW = 0;
  for (const c of site.ct.circuits) {
    if (!c.on) continue;
    totalA += c.currentA;
    totalW += c.currentA * c.voltage;
  }
  site.ct.mainCurrentA = Math.round(totalA * 10) / 10;
  site.ct.powerW = Math.round(totalW);
  return done;
}

/** シーンを実行 */
export async function applyHomeSceneV1(input: {
  siteId: string;
  scene: HomeSceneIdV1;
  actor?: string | null;
}): Promise<HomeSceneResultV1> {
  const siteId = String(input.siteId ?? "").trim();
  const scene = input.scene;
  const actor = String(input.actor ?? "app").trim() || "app";
  const site = findHomeSiteV1(siteId);

  if (!site || site.id !== siteId) {
    return {
      ok: false,
      scene,
      siteId,
      message: "物件が見つかりません",
      actions: [],
      error: "site_not_found",
    };
  }

  const actions: string[] = [];
  const label = SCENE_LABELS[scene];

  try {
    if (scene === "away") {
      const rules = updateHomeSecurityRulesV1(siteId, {
        guardMode: "always",
        securityPausedUntil: null,
      });
      actions.push(
        `防犯警戒: ${homeGuardModeLabelJaV1(rules.guardMode)}`
      );
      actions.push(...allCircuitsOff(site));
      const lockResult = await applyHomeControlV1({
        siteId,
        target: "lock",
        action: "lock",
        actor,
      });
      if (lockResult.ok) actions.push("玄関施錠");
    } else if (scene === "welcome") {
      const unlock = await applyHomeControlV1({
        siteId,
        target: "lock",
        action: "unlock",
        actor,
      });
      if (unlock.ok) actions.push("玄関解錠");
      pauseHomeSecurityV1(siteId, 3);
      actions.push("防犯威嚇ライト 3分間停止");
      const bath = await applyHomeControlV1({
        siteId,
        target: "bath",
        action: "auto_fill",
        actor,
      });
      if (bath.ok) actions.push("湯はり開始");
    } else if (scene === "goodnight") {
      actions.push(...nonEssentialCircuitsOff(site));
      const lockResult = await applyHomeControlV1({
        siteId,
        target: "lock",
        action: "lock",
        actor,
      });
      if (lockResult.ok) actions.push("玄関再施錠");
      const rules = updateHomeSecurityRulesV1(siteId, {
        guardMode: "night_only",
        securityPausedUntil: null,
      });
      actions.push(
        `防犯: ${homeGuardModeLabelJaV1(rules.guardMode)}（最大感度）`
      );
    }
  } catch (err) {
    return {
      ok: false,
      scene,
      siteId,
      message: err instanceof Error ? err.message : String(err),
      actions,
      error: "scene_failed",
    };
  }

  recordSystemLogV1({
    siteId,
    tenantId: site.tenantId,
    category: "scene_run",
    message: `${label} シーン実行`,
    detail: { scene, actions },
    actor,
  });

  return {
    ok: true,
    scene,
    siteId,
    message: `${label} を実行しました`,
    actions,
  };
}

/** シーン一覧（UI 用） */
export function listHomeScenesV1(): Array<{
  id: HomeSceneIdV1;
  label: string;
  emoji: string;
  description: string;
}> {
  return [
    {
      id: "away",
      label: "おでかけ",
      emoji: "🏠",
      description: "警戒ON · 全消灯 · 施錠",
    },
    {
      id: "welcome",
      label: "ただいま",
      emoji: "🚶",
      description: "解錠 · 威嚇停止 · 湯はり",
    },
    {
      id: "goodnight",
      label: "おやすみ",
      emoji: "🌙",
      description: "消灯 · 再施錠 · 夜間警戒",
    },
  ];
}
