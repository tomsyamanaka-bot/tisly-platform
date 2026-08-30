/**
 * Print Generator V1 API
 * POST /api/print-generator/v1/prompt-parse
 */

import { Router } from "express";
import { parsePrintPromptV1 } from "../../print-generator/print-prompt-parse-v1.js";

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
