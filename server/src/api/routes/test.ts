import { Router } from "express";
import { v4 as uuid } from "uuid";
import { config } from "../../config.js";
import { normalizeUnifiedInput, unifiedToTislyEvent } from "../../event/unified-event.js";
import { recordHeartbeat } from "../../notification/heartbeat-monitor.js";
import { getNotificationService } from "../../notification/notification-service.js";
import { runDeviceRecovery } from "../../recovery/device-recovery.js";
import { broadcast } from "../../ws/hub.js";

export const testRouter = Router();

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
      event_id: `test-evt-${uuid()}`,
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

  const service = getNotificationService();
  const id = await service.processEvent(unifiedToTislyEvent(unified));
  broadcast({ type: "event", payload: { ...unified, id }, at: unified.created_at });
  res.status(201).json({ ok: true, id, unified });
});

testRouter.post("/alarm", async (req, res) => {
  const unified = normalizeUnifiedInput(
    baseBody({
      event_id: `test-alarm-${uuid()}`,
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

  const service = getNotificationService();
  const id = await service.processEvent(unifiedToTislyEvent(unified));
  broadcast({ type: "alarm", payload: { ...unified, id }, at: unified.created_at });
  res.status(201).json({ ok: true, id, severity: unified.severity });
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
      event_id: `test-tv-${uuid()}`,
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

  const service = getNotificationService();
  const id = await service.processEvent(unifiedToTislyEvent(unified));
  broadcast({
    type: "alarm",
    payload: { ...unified, id, target: "tv" },
    at: unified.created_at,
  });
  res.status(201).json({ ok: true, id, tvDeviceId: unified.device_id });
});

testRouter.get("/help", (_req, res) => {
  res.json({
    phase: "101-120",
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
