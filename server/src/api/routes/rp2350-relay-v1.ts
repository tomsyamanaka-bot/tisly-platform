/**
 * RP2350 リレー制御 API
 * POST /api/devices/rp2350/relay/:channel/pulse
 * body: { durationMs?: number, reason?: string }
 */

import { Router } from "express";
import {
  queueRp2350RelayPulseV1,
  RP2350_DEFAULT_PULSE_MS_V1,
} from "../../device/rp2350-relay-pulse-v1.js";

export const rp2350RelayV1Router = Router();

rp2350RelayV1Router.post("/relay/:channel/pulse", (req, res) => {
  const result = queueRp2350RelayPulseV1({
    channel: req.params.channel,
    durationMs: req.body?.durationMs ?? RP2350_DEFAULT_PULSE_MS_V1,
    reason: req.body?.reason ? String(req.body.reason) : null,
  });
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json({
    message: `DO CH${result.channel} へ ${result.durationMs}ms パルスを送信しました`,
    ...result,
  });
});

/** 互換: /pulse?channel=1 でも呼べる */
rp2350RelayV1Router.post("/relay/pulse", (req, res) => {
  const result = queueRp2350RelayPulseV1({
    channel: req.body?.channel ?? req.query.channel ?? 1,
    durationMs: req.body?.durationMs ?? RP2350_DEFAULT_PULSE_MS_V1,
    reason: req.body?.reason ? String(req.body.reason) : null,
  });
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json({
    message: `DO CH${result.channel} へ ${result.durationMs}ms パルスを送信しました`,
    ...result,
  });
});
