/**
 * RP2350 全現場 OTA API
 * GET  /api/firmware/:siteId/version
 * GET  /api/firmware/:siteId/script
 * POST /api/firmware/:siteId/deploy
 */

import { Router } from "express";
import {
  deployTislyOtaFirmwareV1,
  getTislyOtaScriptV1,
  getTislyOtaVersionV1,
  listTislyOtaCatalogV1,
  resolveTislyOtaSiteKeyV1,
  type TislyOtaChannelV1,
} from "../../firmware/tisly-rp2350-ota-v1.js";

export const firmwareRouter = Router();

function parseChannel(raw: unknown): TislyOtaChannelV1 {
  return String(raw ?? "").trim() === "staging"
    ? "staging"
    : "production";
}

firmwareRouter.get("/catalog", (req, res) => {
  const channel = parseChannel(req.query.channel);
  res.setHeader("Cache-Control", "no-store");
  res.json(listTislyOtaCatalogV1(channel));
});

firmwareRouter.get("/:siteId/version", (req, res) => {
  const resolved = resolveTislyOtaSiteKeyV1(req.params.siteId);
  res.setHeader("Cache-Control", "no-store");
  if (!resolved) {
    res.status(404).json({ ok: false, error: "unknown firmware site" });
    return;
  }
  const channel = parseChannel(req.query.channel);
  if (resolved === "all") {
    res.json(listTislyOtaCatalogV1(channel));
    return;
  }
  const payload = getTislyOtaVersionV1({
    siteKey: resolved,
    channel,
    deviceId: String(req.query.deviceId ?? "").trim() || null,
    reportedVersion:
      String(
        req.query.firmware_version ?? req.query.version ?? ""
      ).trim() || null,
  });
  res.json(payload);
});

firmwareRouter.get("/:siteId/script", (req, res) => {
  const resolved = resolveTislyOtaSiteKeyV1(req.params.siteId);
  res.setHeader("Cache-Control", "no-store");
  if (!resolved || resolved === "all") {
    res.status(400).json({
      ok: false,
      error: "siteId must be a specific site",
    });
    return;
  }
  const name = String(req.query.name ?? req.query.file ?? "main.py");
  const script = getTislyOtaScriptV1({
    siteKey: resolved,
    name,
    channel: parseChannel(req.query.channel),
  });
  if (!script) {
    res.status(404).json({ ok: false, error: "unknown script name" });
    return;
  }
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Firmware-Name", script.name);
  res.setHeader("X-Firmware-Checksum", script.checksum);
  res.send(script.body);
});

firmwareRouter.post("/:siteId/deploy", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const pathKey = resolveTislyOtaSiteKeyV1(req.params.siteId);
  const bodyKey = resolveTislyOtaSiteKeyV1(
    String(body.currentSiteId ?? body.siteId ?? "")
  );
  const allSites =
    body.allSites === true ||
    body.scope === "all" ||
    pathKey === "all" ||
    bodyKey === "all";
  if (!allSites && !pathKey && !bodyKey) {
    res.status(404).json({ ok: false, error: "unknown firmware site" });
    return;
  }
  /* 単独配信は選択中の
   * currentSiteId を path より優先する
   */
  let siteKey: "toyoshima" | "itabashi" | "all";
  if (allSites) {
    siteKey = "all";
  } else if (bodyKey) {
    siteKey = bodyKey;
  } else if (pathKey) {
    siteKey = pathKey;
  } else {
    res.status(404).json({ ok: false, error: "unknown firmware site" });
    return;
  }
  const result = deployTislyOtaFirmwareV1({
    siteKey,
    channel: parseChannel(body.channel ?? req.query.channel),
    force: body.force === true,
  });
  res.json(result);
});
