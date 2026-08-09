/**
 * Eco-Water IoT API
 * POST /api/eco-water/telemetry
 * GET  /api/eco-water/status
 * GET  /api/eco-water/status/stream (SSE)
 */

import { Router } from "express";
import {
  getEcoWaterStatusV1,
  ingestEcoWaterTelemetryV1,
  resolveEcoWaterSiteKeyV1,
  subscribeEcoWaterTelemetryV1,
  validateEcoWaterTelemetryPacketV1,
} from "../../eco-water/eco-water-telemetry-store-v1.js";
import { generateEcoWaterCertificateHashV1 } from "../../eco-water/eco-water-cert-hash-v1.js";
import { listEcoWaterSitesV1 } from "../../eco-water/eco-water-sites-v1.js";

export const ecoWaterRouter = Router();

/**
 * 現場カタログ（PWA LIVE 切替用）
 * 既存デモサイト定義をそのまま返す
 */
ecoWaterRouter.get("/sites", (_req, res) => {
  res.json({
    ok: true,
    sites: listEcoWaterSitesV1(),
  });
});

/**
 * PLC / RP2350 / Modbus Gateway からの受信
 */
ecoWaterRouter.post("/telemetry", (req, res) => {
  const validated = validateEcoWaterTelemetryPacketV1(req.body);
  if (!validated.ok) {
    res.status(400).json({ ok: false, error: validated.error });
    return;
  }
  if (!resolveEcoWaterSiteKeyV1(validated.packet.site_id)) {
    res.status(400).json({
      ok: false,
      error: "site_id が不正です（例: EW-TKB）",
    });
    return;
  }
  try {
    const status = ingestEcoWaterTelemetryV1(validated.packet);
    res.status(200).json({
      ok: true,
      status,
      certificateHash: status.certificateHash,
      hashId: status.hashId,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "telemetry ingest failed";
    res.status(500).json({ ok: false, error: message });
  }
});

/**
 * 最新 pH・バルブ・履歴
 * ?site_id=EW-TKB
 */
ecoWaterRouter.get("/status", (req, res) => {
  const siteId = String(req.query.site_id ?? "").trim();
  if (!siteId) {
    res.status(400).json({
      ok: false,
      error: "query site_id が必要です（例: EW-TKB）",
    });
    return;
  }
  if (!resolveEcoWaterSiteKeyV1(siteId)) {
    res.status(404).json({
      ok: false,
      error: "site_id が見つかりません",
    });
    return;
  }
  const status = getEcoWaterStatusV1(siteId);
  res.json({
    ok: true,
    status,
    certificateHash: status.certificateHash,
    hashId: status.hashId,
  });
});

/**
 * Server-Sent Events
 * LIVE モードの PWA が購読可能
 */
ecoWaterRouter.get("/status/stream", (req, res) => {
  const siteId = String(req.query.site_id ?? "").trim();
  if (!siteId || !resolveEcoWaterSiteKeyV1(siteId)) {
    res.status(400).json({
      ok: false,
      error: "query site_id が必要です（例: EW-TKB）",
    });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (payload: unknown) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const initial = getEcoWaterStatusV1(siteId);
  send({
    ok: true,
    type: "snapshot",
    status: initial,
    certificateHash: initial.certificateHash,
    hashId: initial.hashId,
  });

  const resolved = resolveEcoWaterSiteKeyV1(siteId);
  const siteKey = resolved?.siteKey;

  const unsubscribe = subscribeEcoWaterTelemetryV1((status) => {
    if (siteKey && status.siteKey !== siteKey) return;
    send({
      ok: true,
      type: "update",
      status,
      certificateHash: status.certificateHash,
      hashId: status.hashId,
    });
  });

  // 接続維持用ハートビート
  const ping = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 25000);

  req.on("close", () => {
    clearInterval(ping);
    unsubscribe();
  });
});

/**
 * 証明書ハッシュ単発生成（ユーティリティ）
 * 中和完了レコード向け
 */
ecoWaterRouter.post("/certificate-hash", (req, res) => {
  const body = req.body ?? {};
  const sitePrefix = String(
    body.site_id || body.sitePrefix || body.hashIdPrefix || ""
  ).trim();
  const timestamp = String(
    body.timestamp || new Date().toISOString()
  ).trim();
  if (!sitePrefix) {
    res.status(400).json({
      ok: false,
      error: "site_id（または sitePrefix）が必要です",
    });
    return;
  }
  const resolved = resolveEcoWaterSiteKeyV1(sitePrefix);
  const prefix = resolved?.siteKey || sitePrefix;
  const cert = generateEcoWaterCertificateHashV1({
    sitePrefix: prefix,
    timestamp,
    salt: body.salt != null ? String(body.salt) : undefined,
    phBefore:
      body.ph_before != null ? Number(body.ph_before) : undefined,
    phAfter:
      body.ph_after != null
        ? Number(body.ph_after)
        : body.ph_value != null
          ? Number(body.ph_value)
          : undefined,
  });
  res.json({
    ok: true,
    ...cert,
  });
});
