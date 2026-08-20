/**
 * 3D Floorplan Builder API
 * GET  /api/floorplan-builder/v1/presets
 * GET  /api/floorplan-builder/v1/configs
 * GET  /api/floorplan-builder/v1/active
 * GET  /api/floorplan-builder/v1/config/:id
 * POST /api/floorplan-builder/v1/save
 * POST /api/floorplan-builder/v1/activate
 * POST /api/floorplan-builder/v1/load-preset
 * POST /api/floorplan-builder/v1/detect
 * GET  /api/floorplan-builder/v1/security-bridge
 */

import { Router } from "express";
import { detectFloorplanFromImageV1 } from "../../floorplan-builder/floorplan-detect-v1.js";
import { FLOORPLAN_ROOM_PRESETS_V1 } from "../../floorplan-builder/floorplan-detect-rule-v1.js";
import { listFloorplanPresetsV1 } from "../../floorplan-builder/floorplan-presets-v1.js";
import {
  getActiveFloorplanConfigV1,
  getFloorplanConfigByIdV1,
  listFloorplanConfigsV1,
  loadPresetAsConfigV1,
  saveFloorplanConfigV1,
  setActiveFloorplanIdV1,
} from "../../floorplan-builder/floorplan-store-v1.js";
import type { FloorplanConfigV1 } from "../../floorplan-builder/floorplan-types-v1.js";

export const floorplanBuilderRouter = Router();

floorplanBuilderRouter.get("/presets", (_req, res) => {
  const presets = listFloorplanPresetsV1().map((p) => ({
    presetId: p.presetId,
    id: p.id,
    name: p.name,
    scaleLabel: p.scaleLabel,
    floors: p.floors.map((f) => ({
      id: f.id,
      label: f.label,
      enabled: f.enabled,
      roomCount: f.rooms.length,
    })),
  }));
  res.json({ ok: true, presets });
});

floorplanBuilderRouter.get("/configs", (_req, res) => {
  res.json({ ok: true, configs: listFloorplanConfigsV1() });
});

floorplanBuilderRouter.get("/active", (_req, res) => {
  const config = getActiveFloorplanConfigV1();
  res.json({ ok: true, config });
});

floorplanBuilderRouter.get("/config/:id", (req, res) => {
  const config = getFloorplanConfigByIdV1(req.params.id);
  if (!config) {
    res.status(404).json({ ok: false, error: "設定が見つかりません" });
    return;
  }
  res.json({ ok: true, config });
});

floorplanBuilderRouter.post("/save", (req, res) => {
  const body = req.body as FloorplanConfigV1 | undefined;
  if (!body || !body.id || !body.name || !Array.isArray(body.floors)) {
    res.status(400).json({
      ok: false,
      error: "id / name / floors が必要です",
    });
    return;
  }
  const saved = saveFloorplanConfigV1(body);
  res.json({ ok: true, config: saved });
});

floorplanBuilderRouter.post("/activate", (req, res) => {
  const id = String(req.body?.id ?? "").trim();
  if (!id) {
    res.status(400).json({ ok: false, error: "id が必要です" });
    return;
  }
  if (!setActiveFloorplanIdV1(id)) {
    res.status(404).json({ ok: false, error: "設定が見つかりません" });
    return;
  }
  res.json({ ok: true, config: getActiveFloorplanConfigV1() });
});

floorplanBuilderRouter.post("/load-preset", (req, res) => {
  const presetId = String(req.body?.presetId ?? "").trim();
  if (!presetId) {
    res.status(400).json({ ok: false, error: "presetId が必要です" });
    return;
  }
  const config = loadPresetAsConfigV1(presetId);
  if (!config) {
    res.status(404).json({ ok: false, error: "プリセットが見つかりません" });
    return;
  }
  res.json({ ok: true, config });
});

/** 方眼紙写真から部屋枠を自動検出（Gemini → rule_based fallback） */
floorplanBuilderRouter.post("/detect", async (req, res) => {
  try {
    const body = (req.body || {}) as {
      imageBase64?: string;
      forceRuleBased?: boolean;
    };
    const result = await detectFloorplanFromImageV1({
      imageBase64: body.imageBase64,
      forceRuleBased: Boolean(body.forceRuleBased),
    });
    res.json({
      ...result,
      roomPresets: [...FLOORPLAN_ROOM_PRESETS_V1],
    });
  } catch (err) {
    console.error("[floorplan-builder] detect failed", err);
    res.status(500).json({
      ok: false,
      error: "間取り解析に失敗しました",
    });
  }
});

/** Security 画面が背景立体マップとして読むブリッジ */
floorplanBuilderRouter.get("/security-bridge", (_req, res) => {
  const config = getActiveFloorplanConfigV1();
  res.json({
    ok: true,
    configId: config.id,
    name: config.name,
    security: config.security,
    floors: config.floors.map((f) => ({
      id: f.id,
      label: f.label,
      enabled: f.enabled,
    })),
    render: config.render,
  });
});
