import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import { getBusinessProject } from "../../business/business-store.js";
import {
  getDocumentCenterPreviewV1,
  getDocumentCenterProjectV1,
  getDocumentCenterTimelineV1,
  listDocumentCenterFavoritesV1,
  listDocumentCenterProjectsV1,
  listDocumentCenterRecentV1,
  measureDocumentCenterSearchMs,
  recordDocumentCenterRecentV1,
  resolveDocumentCenterItemV1,
  searchDocumentCenterV1,
  toggleDocumentCenterFavoriteV1,
} from "../../documents/document-center-v1-store.js";
import { DOCUMENT_TYPE_PRESENTATION } from "../../documents/document-center-v1-types.js";
import {
  getQnapStorageStatusForProjectV1,
  syncProjectDocumentsToQnapV1,
  syncStorageDocumentToQnapV1,
} from "../../storage/qnap-storage-v1-service.js";

export const documentsV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

function assertRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
}

function username(req: AuthedRequest): string {
  return req.admin?.username ?? "unknown";
}

documentsV1Router.get("/meta", ...auth, (_req: AuthedRequest, res) => {
  res.json({
    documentTypes: DOCUMENT_TYPE_PRESENTATION,
    sourceTypes: ["manual", "pdf", "drawing", "voice", "phone", "ai"],
  });
});

documentsV1Router.get("/projects", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const favoriteOnly = req.query.favoriteOnly === "true";
  const projects = listDocumentCenterProjectsV1(username(req));
  res.json({
    projects: favoriteOnly ? projects.filter((p) => p.favorite) : projects,
    count: projects.length,
  });
});

documentsV1Router.get("/projects/:projectId", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const detail = getDocumentCenterProjectV1(String(req.params.projectId), username(req));
  if (!detail) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json(detail);
});

documentsV1Router.get("/projects/:projectId/timeline", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const projectId = String(req.params.projectId);
  if (!getBusinessProject(projectId)) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  const events = getDocumentCenterTimelineV1(projectId);
  res.json({ events, count: events.length });
});

documentsV1Router.get("/search", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const q = String(req.query.q ?? "").trim();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50) || 50));
  const started = Date.now();
  const hits = searchDocumentCenterV1(q, limit);
  res.json({
    query: q,
    hits,
    count: hits.length,
    elapsedMs: Date.now() - started,
  });
});

documentsV1Router.get("/search/benchmark", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const q = String(req.query.q ?? "テスト");
  res.json({ query: q, elapsedMs: measureDocumentCenterSearchMs(q) });
});

documentsV1Router.get("/favorites", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const projects = listDocumentCenterFavoritesV1(username(req));
  res.json({ projects, count: projects.length });
});

documentsV1Router.post("/favorites/:projectId/toggle", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    const result = toggleDocumentCenterFavoriteV1(String(req.params.projectId), username(req));
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "toggle failed";
    if (msg === "project not found") {
      res.status(404).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

documentsV1Router.get("/recent", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const limit = Math.min(30, Math.max(1, Number(req.query.limit ?? 10) || 10));
  res.json({ items: listDocumentCenterRecentV1(username(req), limit) });
});

documentsV1Router.post("/recent", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body ?? {};
  const projectId = String(body.projectId ?? "").trim();
  const documentId = String(body.documentId ?? "").trim();
  const documentType = String(body.documentType ?? "").trim();
  const title = String(body.title ?? "").trim();
  const fileName = String(body.fileName ?? "").trim();
  if (!projectId || !documentId || !documentType) {
    res.status(400).json({ error: "projectId, documentId, documentType are required" });
    return;
  }
  if (!getBusinessProject(projectId)) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  recordDocumentCenterRecentV1({
    username: username(req),
    projectId,
    documentId,
    documentType: documentType as import("../../documents/document-center-v1-types.js").DocumentCenterTypeV1,
    title: title || fileName || documentId,
    fileName: fileName || title || documentId,
    previewUrl: body.previewUrl != null ? String(body.previewUrl) : null,
  });
  res.status(201).json({ ok: true });
});

documentsV1Router.get("/projects/:projectId/items/:documentId", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const item = resolveDocumentCenterItemV1(String(req.params.projectId), String(req.params.documentId));
  if (!item) {
    res.status(404).json({ error: "document not found" });
    return;
  }
  res.json({ item });
});

documentsV1Router.get("/projects/:projectId/preview/:documentId", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const preview = getDocumentCenterPreviewV1(
    String(req.params.projectId),
    String(req.params.documentId)
  );
  if (!preview) {
    res.status(404).json({ error: "document not found" });
    return;
  }
  res.json(preview);
});

documentsV1Router.get("/projects/:projectId/qnap/status", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const status = getQnapStorageStatusForProjectV1(String(req.params.projectId));
  if (!status) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json(status);
});

documentsV1Router.post("/qnap/sync/:documentId", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const documentId = String(req.params.documentId);
  const forceMockFail = req.body?.forceMockFail === true;
  try {
    const result = await syncStorageDocumentToQnapV1(documentId, { forceMockFail });
    if (result.status === "not_found") {
      res.status(404).json(result);
      return;
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "sync failed" });
  }
});

documentsV1Router.post("/projects/:projectId/qnap/sync-all", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const projectId = String(req.params.projectId);
  if (!getBusinessProject(projectId)) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  try {
    const result = await syncProjectDocumentsToQnapV1(projectId);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "sync failed" });
  }
});
