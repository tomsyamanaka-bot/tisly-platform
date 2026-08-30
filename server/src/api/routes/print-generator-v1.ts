/**
 * Print Generator V1 API
 * POST /api/print-generator/v1/prompt-parse
 * POST /api/print-generator/v1/sketch-extract
 */

import { Router } from "express";
import { parsePrintPromptV1 } from "../../print-generator/print-prompt-parse-v1.js";
import {
  PRINT_SKETCH_MAX_IMAGES_V1,
  parsePrintSketchImagesV1,
  type PrintSketchImageInputV1,
} from "../../print-generator/print-sketch-vision-v1.js";

export const printGeneratorV1Router = Router();

printGeneratorV1Router.post("/prompt-parse", async (req, res) => {
  try {
    const prompt = String(
      req.body?.prompt ?? req.body?.text ?? ""
    ).trim();
    const result = await parsePrintPromptV1(prompt);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "prompt_parse_failed",
    });
  }
});

printGeneratorV1Router.post("/sketch-extract", async (req, res) => {
  try {
    const rawImages = Array.isArray(req.body?.images)
      ? (req.body.images as PrintSketchImageInputV1[])
      : [];
    const imageMetas = Array.isArray(req.body?.imageMetas)
      ? (req.body.imageMetas as Array<{ width: number; height: number }>)
      : undefined;
    const hintText = String(req.body?.hintText ?? "").trim();
    const result = await parsePrintSketchImagesV1({
      images: rawImages.slice(0, PRINT_SKETCH_MAX_IMAGES_V1),
      imageMetas,
      hintText,
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json({
      ...result,
      imageCount: Math.min(rawImages.length, PRINT_SKETCH_MAX_IMAGES_V1),
      maxImages: PRINT_SKETCH_MAX_IMAGES_V1,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "sketch_extract_failed",
    });
  }
});
