import { Router } from "express";
import { v4 as uuid } from "uuid";
import { config } from "../../config.js";
import { normalizeUnifiedInput } from "../../event/unified-event.js";
import { recordHeartbeat } from "../../notification/heartbeat-monitor.js";
import { runDeviceRecovery } from "../../recovery/device-recovery.js";
import { requireIngestOrDeviceAuth } from "../../auth/device-auth.js";
import { createRateLimit } from "../../security/rate-limit-redis.js";
import { requireEventSignature } from "../../security/event-signature.js";
import { requireReplayProtection } from "../../security/replay-middleware.js";
import { ingestUnifiedEvent } from "../../security/ingest-handler.js";

export const testRouter = Router();

const testLimiter = createRateLimit({
  keyPrefix: "test-api",
  max: 60,
  windowMs: 60 * 1000,
});

testRouter.use(testLimiter);
testRouter.use(requireIngestOrDeviceAuth);
testRouter.use(requireEventSignature);
testRouter.use(requireReplayProtection);

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: config.defaultTenantId,
    site_id: "demo-test-site",
    device_id: "TEST-DEVICE-001",
    source_type: "system",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

testRouter.post("/event", async (req, res) => {
  const unified = normalizeUnifiedInput(
    baseBody({
      event_id: (req.body?.event_id as string) ?? (req.body?.eventId as string) ?? `test-evt-${uuid()}`,
      event_type: req.body?.eventType ?? "test_event",
      severity: req.body?.severity ?? "info",
      zone: req.body?.zone ?? "lab",
      message: req.body?.message ?? "実機なしテストイベント",
      payload: req.body?.payload ?? { channel: "test-api" },
      device_id: req.body?.deviceId ?? req.body?.device_id ?? "TEST-DEVICE-001",
      source_type: req.body?.sourceType ?? "system",
      site_id: req.body?.siteId ?? "demo-test-site",
    }),
    config.defaultTenantId
  );

  await ingestUnifiedEvent(unified, res, { sourceIp: req.ip });
});

testRouter.post("/alarm", async (req, res) => {
  const unified = normalizeUnifiedInput(
    baseBody({
      event_id: (req.body?.event_id as string) ?? `test-alarm-${uuid()}`,
      event_type: req.body?.eventType ?? "intrusion",
      severity: req.body?.severity ?? "alarm",
      zone: req.body?.zone ?? "perimeter",
      message: req.body?.message ?? "【テスト】警報 — 実機なしデモ",
      payload: req.body?.payload ?? { demo: true, alarm: true },
      device_id: req.body?.deviceId ?? "TEST-PLC-001",
      source_type: req.body?.sourceType ?? "plc",
    }),
    config.defaultTenantId
  );

  await ingestUnifiedEvent(unified, res, { sourceIp: req.ip });
});

testRouter.post("/heartbeat", (req, res) => {
  const deviceId = (req.body?.deviceId as string) ?? "TEST-ESP-001";
  recordHeartbeat(deviceId, req.body?.platform ?? "test-api");
  res.json({ ok: true, deviceId, status: "ok" });
});

testRouter.post("/recovery", async (req, res) => {
  const deviceId = (req.body?.deviceId as string) ?? "TEST-RP2350-001";
  const trigger =
    (req.body?.trigger as "heartbeat_lost" | "device_offline" | "mqtt_disconnect" | "manual") ??
    "heartbeat_lost";
  try {
    const result = await runDeviceRecovery(deviceId, trigger);
    res.json({ ok: true, result });
  } catch (e) {
    res.status(400).json({
      ok: false,
      error: e instanceof Error ? e.message : "recovery failed",
      hint: "先に POST /api/devices/register でデバイス登録してください",
    });
  }
});

testRouter.post("/tv-alert", async (req, res) => {
  const unified = normalizeUnifiedInput(
    baseBody({
      event_id: (req.body?.event_id as string) ?? `test-tv-${uuid()}`,
      event_type: "tv_alert",
      severity: req.body?.severity ?? "alarm",
      message: req.body?.message ?? "【TVテスト】警報オーバーレイ",
      device_id: req.body?.tvDeviceId ?? "TV-LOBBY-001",
      source_type: "tv-app",
      payload: {
        fullscreen: true,
        durationSec: req.body?.durationSec ?? 10,
        ...(req.body?.payload ?? {}),
      },
    }),
    config.defaultTenantId
  );

  await ingestUnifiedEvent(unified, res, { sourceIp: req.ip });
});

testRouter.get("/help", (_req, res) => {
  res.json({
    phase: "181-200",
    endpoints: [
      "POST /api/test/event",
      "POST /api/test/alarm",
      "POST /api/test/heartbeat",
      "POST /api/test/recovery",
      "POST /api/test/tv-alert",
    ],
    note: "実機なしで PWA / TV / Recovery / ダッシュボードを検証",
  });
});
