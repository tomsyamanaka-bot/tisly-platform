import { Router } from "express";
import { getPlatformSetting, setPlatformSetting } from "../../db/database.js";
import { logAudit } from "../../provisioning/audit-log.js";
import {
  applyQnapPlatformRuntimeEnvV1,
  getQnapInfraHealthV1,
  normalizeQnapPlatformSettingV1,
  runQnapPlatformConnectTestV1,
  setQnapInfraHealthV1,
  type QnapPlatformSettingV1,
} from "../../infrastructure/qnap-infra-health-v1.js";

export const settingsRouter = Router();

const KEYS = [
  "pwa",
  "push",
  "discord",
  "email",
  "tv",
  "heartbeat",
  "retention",
  "backup",
  "qnap",
] as const;

function toPublicQnapSetting(raw: QnapPlatformSettingV1 | null): Record<string, unknown> {
  const health = getQnapInfraHealthV1();
  const q = normalizeQnapPlatformSettingV1(raw ?? { mode: "mock" }, raw);
  return {
    mode: q.mode,
    host: q.host,
    username: q.username,
    hasPassword: Boolean(q.password),
    port: q.port ?? health.port,
    shareName: q.shareName || "TiSLY",
    lastConnectionTest: q.lastConnectionTest ?? null,
    healthStatus: health.status,
    healthDetail: health.detail,
    healthOk: health.ok,
    healthPort: health.port,
    healthMethod: health.method,
    healthTestedAt: health.testedAt,
  };
}

settingsRouter.get("/platform", (_req, res) => {
  const settings: Record<string, unknown> = {};
  for (const key of KEYS) {
    if (key === "qnap") {
      settings.qnap = toPublicQnapSetting(
        getPlatformSetting<QnapPlatformSettingV1>("qnap")
      );
      continue;
    }
    settings[key] = getPlatformSetting(key);
  }
  res.json({ settings, qnapHealth: getQnapInfraHealthV1() });
});

settingsRouter.put("/platform/:key", async (req, res) => {
  const key = req.params.key;
  if (!KEYS.includes(key as (typeof KEYS)[number])) {
    res.status(400).json({ error: "Invalid setting key" });
    return;
  }

  if (key === "qnap") {
    const previous = getPlatformSetting<QnapPlatformSettingV1>("qnap");
    const normalized = normalizeQnapPlatformSettingV1(req.body ?? {}, previous);

    // ランタイム env + ストレージ設定へ先に反映（疎通・保存が同じ資格情報を使う）
    applyQnapPlatformRuntimeEnvV1(normalized);

    let connect: Awaited<ReturnType<typeof runQnapPlatformConnectTestV1>> | null =
      null;
    if (normalized.mode === "real") {
      connect = await runQnapPlatformConnectTestV1({
        host: normalized.host,
        username: normalized.username,
        password: normalized.password || "",
        shareName: normalized.shareName,
      });
      if (connect.ok && connect.port) {
        normalized.port = connect.port;
        applyQnapPlatformRuntimeEnvV1(normalized);
      }
      normalized.lastConnectionTest = {
        ok: connect.ok,
        message: connect.message,
        testedAt: connect.testedAt,
        port: connect.port,
        webdavUrl: connect.webdavUrl,
        method: connect.method,
        logs: connect.logs,
      };
      normalized.healthStatus = connect.status;
    } else {
      setQnapInfraHealthV1({
        status: "YELLOW",
        ok: false,
        detail: "mock",
        mode: "mock",
        host: normalized.host,
        username: normalized.username,
        port: null,
        webdavUrl: null,
        method: "none",
        testedAt: new Date().toISOString(),
        errorCode: null,
        logs: ["mode=mock"],
      });
      normalized.healthStatus = "YELLOW";
      normalized.lastConnectionTest = {
        ok: false,
        message: "QNAP_MODE=mock（疎通テストスキップ）",
        testedAt: new Date().toISOString(),
        port: null,
        method: "none",
        logs: ["mode=mock"],
      };
    }

    setPlatformSetting("qnap", normalized);
    logAudit({
      action: "settings.update",
      entityType: "platform_setting",
      entityId: key,
      details: {
        mode: normalized.mode,
        host: normalized.host,
        username: normalized.username,
        connectOk: connect?.ok ?? false,
        healthStatus: normalized.healthStatus,
      },
      actorLabel: req.body?.actorLabel ?? "Operator",
    });

    const health = getQnapInfraHealthV1();
    res.json({
      ok: true,
      key,
      value: toPublicQnapSetting(normalized),
      connect: connect
        ? {
            ok: connect.ok,
            status: connect.status,
            message: connect.message,
            port: connect.port,
            method: connect.method,
            latencyMs: connect.latencyMs,
            logs: connect.logs,
          }
        : null,
      qnapHealth: health,
      infrastructureStatus: health.status,
    });
    return;
  }

  setPlatformSetting(key, req.body);
  logAudit({
    action: "settings.update",
    entityType: "platform_setting",
    entityId: key,
    details: req.body,
    actorLabel: req.body?.actorLabel ?? "Operator",
  });
  res.json({ ok: true, key, value: req.body });
});

settingsRouter.get("/rc1", (_req, res) => {
  res.json({
    retention: getPlatformSetting<{ days: number }>("retention") ?? { days: 90 },
    backup: getPlatformSetting<{ schedules: string[] }>("backup") ?? {
      schedules: ["daily", "weekly", "monthly"],
    },
    qnap: toPublicQnapSetting(getPlatformSetting<QnapPlatformSettingV1>("qnap")),
  });
});
