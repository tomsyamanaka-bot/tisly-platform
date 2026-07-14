/**
 * Print Models V1 API — STL + slice metadata for PWA 3D viewer
 *
 * POST /api/print-models/v1/upload
 * GET  /api/print-models/v1/models
 * GET  /api/print-models/v1/models/:id
 * GET  /api/print-models/v1/models/:id/stl
 * GET  /api/print-models/v1/models/:id/gcode
 * DELETE /api/print-models/v1/models/:id
 */

import fs from "fs";
import { Router } from "express";
import {
  deletePrintModelV1,
  getPrintModelFilePathV1,
  getPrintModelV1,
  listPrintModelsV1,
  upsertPrintModelV1,
} from "../../print-models/print-models-store-v1.js";

export const printModelsV1Router = Router();

function checkUploadToken(req: { headers: Record<string, unknown> }): boolean {
  const expected = (process.env.TISLY_PRINT_UPLOAD_TOKEN || "").trim();
  if (!expected) return true; // demo / local: open when unset
  const auth = String(req.headers.authorization || "");
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerToken = String(req.headers["x-tisly-upload-token"] || "").trim();
  return bearer === expected || headerToken === expected;
}

printModelsV1Router.get("/models", (_req, res) => {
  const models = listPrintModelsV1();
  res.json({
    ok: true,
    count: models.length,
    models,
    viewerPath: "/print-model-viewer",
  });
});

printModelsV1Router.get("/models/:id", (req, res) => {
  const model = getPrintModelV1(String(req.params.id || ""));
  if (!model) {
    res.status(404).json({ error: "model not found" });
    return;
  }
  res.json({ ok: true, model });
});

printModelsV1Router.get("/models/:id/stl", (req, res) => {
  const id = String(req.params.id || "");
  const filePath = getPrintModelFilePathV1(id, "stl");
  const model = getPrintModelV1(id);
  if (!filePath || !model || !fs.existsSync(filePath)) {
    res.status(404).json({ error: "STL not found" });
    return;
  }
  res.setHeader("Content-Type", "model/stl");
  res.setHeader("Content-Disposition", `inline; filename="${model.stlFileName}"`);
  res.sendFile(filePath);
});

printModelsV1Router.get("/models/:id/gcode", (req, res) => {
  const id = String(req.params.id || "");
  const filePath = getPrintModelFilePathV1(id, "gcode");
  const model = getPrintModelV1(id);
  if (!filePath || !model || !model.gcodeFileName || !fs.existsSync(filePath)) {
    res.status(404).json({ error: "G-code not found" });
    return;
  }
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `inline; filename="${model.gcodeFileName}"`);
  res.sendFile(filePath);
});

printModelsV1Router.post("/upload", (req, res) => {
  if (!checkUploadToken(req as { headers: Record<string, unknown> })) {
    res.status(401).json({ error: "upload token required" });
    return;
  }
  try {
    const body = req.body ?? {};
    if (!body.stlBase64 && !body.stl_base64) {
      res.status(400).json({ error: "stlBase64 is required" });
      return;
    }
    const model = upsertPrintModelV1({
      id: body.id != null ? String(body.id) : undefined,
      name: body.name != null ? String(body.name) : undefined,
      notes: body.notes != null ? String(body.notes) : null,
      source: body.source != null ? String(body.source) : "automation",
      slice: body.slice ?? body.metadata ?? body.meta,
      stlFileName: body.stlFileName != null ? String(body.stlFileName) : undefined,
      stlBase64: String(body.stlBase64 ?? body.stl_base64),
      gcodeFileName: body.gcodeFileName != null ? String(body.gcodeFileName) : undefined,
      gcodeBase64: body.gcodeBase64 ?? body.gcode_base64 ?? null,
    });
    res.status(201).json({
      ok: true,
      model,
      viewerUrl: `/print-model-viewer?id=${encodeURIComponent(model.id)}`,
    });
  } catch (e) {
    res.status(400).json({
      error: e instanceof Error ? e.message : "upload failed",
    });
  }
});

printModelsV1Router.delete("/models/:id", (req, res) => {
  if (!checkUploadToken(req as { headers: Record<string, unknown> })) {
    res.status(401).json({ error: "upload token required" });
    return;
  }
  const ok = deletePrintModelV1(String(req.params.id || ""));
  if (!ok) {
    res.status(404).json({ error: "model not found" });
    return;
  }
  res.json({ ok: true });
});
