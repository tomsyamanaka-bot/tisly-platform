/**
 * 通話後クイック音声要約 API v1
 */

import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import { listFieldCheckProjectsV1 } from "../../field-ops/field-check-v1-store.js";
import {
  extractVoiceCallSummaryV1,
  type VoiceCallExtractionV1,
} from "../../voice-call/voice-call-extract-v1.js";
import { commitVoiceCallSummaryV1 } from "../../voice-call/voice-call-commit-v1.js";

export const voiceCallSummaryV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

function assertRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
}

voiceCallSummaryV1Router.get(
  "/projects",
  ...auth,
  (req: AuthedRequest, res) => {
    if (!assertRole(req, res)) return;
    const projects = listFieldCheckProjectsV1().map((p) => ({
      id: p.id,
      title: p.title,
      source: p.source,
      customerName: p.customerName ?? "",
    }));
    res.json({ projects });
  }
);

voiceCallSummaryV1Router.post(
  "/extract",
  ...auth,
  async (req: AuthedRequest, res) => {
    if (!assertRole(req, res)) return;
    const body = req.body as Record<string, unknown>;
    const transcript = String(body.transcript ?? "").trim();
    if (!transcript) {
      res.status(400).json({ error: "transcript is required" });
      return;
    }
    const locale = body.locale === "AU" ? "AU" : "JP";
    const currency = body.currency === "AUD" ? "AUD" : "JPY";
    try {
      const extraction = await extractVoiceCallSummaryV1(transcript, {
        locale,
        currency,
      });
      res.json({ extraction });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "extract failed";
      res.status(500).json({ error: msg });
    }
  }
);

voiceCallSummaryV1Router.post(
  "/commit",
  ...auth,
  async (req: AuthedRequest, res) => {
    if (!assertRole(req, res)) return;
    const body = req.body as Record<string, unknown>;
    const extraction = body.extraction as VoiceCallExtractionV1 | undefined;
    if (!extraction || typeof extraction !== "object") {
      res.status(400).json({ error: "extraction is required" });
      return;
    }
    try {
      const result = await commitVoiceCallSummaryV1({
        extraction,
        projectSource:
          body.projectSource === "survey" ||
          body.projectSource === "business" ||
          body.projectSource === "field_check"
            ? body.projectSource
            : undefined,
        projectId:
          body.projectId != null ? String(body.projectId) : undefined,
        tenantId: body.tenantId != null ? String(body.tenantId) : undefined,
        countryCode: body.countryCode === "AU" ? "AU" : "JP",
        currency: body.currency === "AUD" ? "AUD" : "JPY",
        transcript:
          body.transcript != null ? String(body.transcript) : undefined,
      });
      res.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "commit failed";
      res.status(500).json({ error: msg });
    }
  }
);
