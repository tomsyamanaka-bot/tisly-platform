/**
 * カメラプレビュー API v1
 * H.View RTSP サブストリーム / モック WebRTC
 */

import { Router } from "express";
import {
  buildCameraPreviewSessionV1,
  buildMockCameraStreamSvgV1,
  findCameraPresetHueV1,
  findCameraPresetStatusV1,
  listCameraPreviewsForCustomerV1,
} from "../../camera/camera-preview-v1.js";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";

export const cameraPreviewV1Router = Router();

cameraPreviewV1Router.get(
  "/list",
  requireAuth("viewer"),
  (req: AuthedRequest, res) => {
    const self = String(req.admin?.customerCode ?? "").trim().toUpperCase();
    const q = String(req.query.customerCode ?? "").trim().toUpperCase();
    const code = q || self;
    if (!code) {
      res.status(400).json({ status: "error", error: "customerCode required" });
      return;
    }
    if (self && q && self !== q && !["TOMS001"].includes(self)) {
      res.status(403).json({ status: "error", error: "他テナントのカメラは閲覧できません" });
      return;
    }
    res.json({
      status: "ok",
      customerCode: code,
      cameras: listCameraPreviewsForCustomerV1(code),
    });
  }
);

cameraPreviewV1Router.get(
  "/session/:cameraId",
  requireAuth("viewer"),
  (req: AuthedRequest, res) => {
    const self = String(req.admin?.customerCode ?? "").trim().toUpperCase();
    const code = String(req.query.customerCode ?? self).trim().toUpperCase();
    const session = buildCameraPreviewSessionV1({
      customerCode: code,
      cameraId: String(req.params.cameraId),
    });
    if (!session) {
      res.status(404).json({ status: "error", error: "カメラが見つかりません" });
      return;
    }
    res.json({ status: "ok", session });
  }
);

cameraPreviewV1Router.get("/mock-stream/:cameraId", (req, res) => {
  const cameraId = String(req.params.cameraId);
  const label = String(req.query.label ?? cameraId);
  const status = (String(req.query.status ?? "normal") ||
    "normal") as "normal" | "recording" | "doorbell";
  const hue = Number(req.query.hue ?? 215);
  const svg = buildMockCameraStreamSvgV1({
    label,
    status,
    hue: Number.isFinite(hue) ? hue : 215,
  });
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(svg);
});

/** 認証付きモックストリーム（セッション連動） */
cameraPreviewV1Router.get(
  "/mock-stream-auth/:cameraId",
  requireAuth("viewer"),
  (req: AuthedRequest, res) => {
    const code = String(req.admin?.customerCode ?? "").trim().toUpperCase();
    const cameraId = String(req.params.cameraId);
    const status = findCameraPresetStatusV1(code, cameraId);
    const hue = findCameraPresetHueV1(code, cameraId);
    const tile = listCameraPreviewsForCustomerV1(code).find(
      (t) => t.id === cameraId
    );
    const svg = buildMockCameraStreamSvgV1({
      label: tile?.label ?? cameraId,
      status,
      hue,
    });
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(svg);
  }
);
