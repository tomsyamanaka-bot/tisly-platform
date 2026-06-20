import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import { getBusinessProject } from "../../business/business-store.js";
import {
  getLatestStorageDocumentForKindV1,
  mapPracticalKindToDocumentType,
} from "../../storage/storage-documents-v1-store.js";
import {
  getQnapStorageStatusForProjectV1,
  retryFailedQnapStorageV1,
  runQnapStorageConnectionTestV1,
  syncProjectDocumentsToQnapV1,
  syncStorageDocumentToQnapV1,
} from "../../storage/qnap-storage-v1-service.js";
import {
  resyncAllFailedQnapStorageV1,
  resyncAllPendingQnapStorageV1,
  runQnapStorageIntegrityCheckV1,
  runQnapStorageIntegrityResyncV1,
} from "../../storage/qnap-storage-integrity-v1-service.js";
import { getQnapStorageHealthV1 } from "../../storage/qnap-storage-v1-config.js";

export const qnapStorageV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

function assertRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
}

qnapStorageV1Router.post("/test", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    const result = await runQnapStorageConnectionTestV1();
    res.json({ ...result, qnapHealth: getQnapStorageHealthV1() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "test failed" });
  }
});

qnapStorageV1Router.get("/integrity", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const projectId = String(req.query.projectId ?? "").trim() || undefined;
  try {
    const report = await runQnapStorageIntegrityCheckV1(projectId);
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "integrity check failed" });
  }
});

qnapStorageV1Router.post("/integrity/run", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const projectId = req.body?.projectId ? String(req.body.projectId) : undefined;
  const mode = req.body?.mode === "pending" || req.body?.mode === "failed" ? req.body.mode : "all";
  try {
    const result = await runQnapStorageIntegrityResyncV1({ mode, projectId });
    res.json({ ok: true, ...result, qnapHealth: getQnapStorageHealthV1() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "integrity resync failed" });
  }
});

qnapStorageV1Router.post("/resync/pending", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const projectId = req.body?.projectId ? String(req.body.projectId) : undefined;
  try {
    const result = await resyncAllPendingQnapStorageV1(projectId);
    res.json({ ok: true, result, qnapHealth: getQnapStorageHealthV1() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "resync failed" });
  }
});

qnapStorageV1Router.post("/resync/failed", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const projectId = req.body?.projectId ? String(req.body.projectId) : undefined;
  try {
    const result = await resyncAllFailedQnapStorageV1(projectId);
    res.json({ ok: true, result, qnapHealth: getQnapStorageHealthV1() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "resync failed" });
  }
});

qnapStorageV1Router.post("/sync/:documentId", ...auth, async (req: AuthedRequest, res) => {
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

qnapStorageV1Router.post("/sync-project/:projectId", ...auth, async (req: AuthedRequest, res) => {
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
    const msg = e instanceof Error ? e.message : "sync failed";
    if (msg === "project not found") {
      res.status(404).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

qnapStorageV1Router.get("/status/:projectId", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const projectId = String(req.params.projectId);
  const status = getQnapStorageStatusForProjectV1(projectId);
  if (!status) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json(status);
});

qnapStorageV1Router.post("/retry-failed", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const projectId = req.body?.projectId ? String(req.body.projectId) : undefined;
  if (projectId && !getBusinessProject(projectId)) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  try {
    const result = await retryFailedQnapStorageV1(projectId);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "retry failed" });
  }
});

/** 書類種別から documentId を解決（PWA 用） */
qnapStorageV1Router.get("/document-id/:projectId/:kind", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const projectId = String(req.params.projectId);
  const kind = String(req.params.kind) as "estimate" | "invoice" | "specification" | "completion";
  if (!getBusinessProject(projectId)) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  const docType = mapPracticalKindToDocumentType(kind);
  const doc = getLatestStorageDocumentForKindV1(projectId, docType);
  if (!doc) {
    res.status(404).json({ error: "document not registered" });
    return;
  }
  res.json({ documentId: doc.id, document: doc });
});
