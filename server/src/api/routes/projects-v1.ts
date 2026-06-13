import { Router, type Response } from "express";
import path from "path";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement, normalizeRole } from "../../auth/roles.js";
import { buildFieldOpsDashboardV1Async } from "../../projects/field-ops-dashboard.js";
import {
  deleteProjectV1,
  getProjectDeletePreviewV1,
  getProjectDetailV1,
  listDeletedProjectsV1,
  listProjectsV1,
  restoreProjectV1,
} from "../../projects/projects-v1-store.js";
import {
  deleteProjectPdfV1,
  listProjectPdfsV1,
  type ProjectPdfKind,
  PDF_STORAGE_PROVIDER,
  regenerateProjectPdfV1,
  resolveProjectPdfFile,
  buildProjectPdfFileName,
} from "../../projects/project-pdf-store.js";
import { sendPdfFile } from "../../business/pdf/pdf-serve.js";
import { isValidPdfFile } from "../../business/pdf/pdf-validation.js";
import {
  getProjectPdfMeta,
  resetQnapBackupForResync,
} from "../../projects/project-pdf-qnap-store.js";
import { processQnapPdfBackupRow } from "../../storage/qnap-pdf-backup-service.js";
import { getStorageSettingsV1 } from "../../storage/storage-settings-store.js";
import {
  autoSaveCompletionReportPdfV1,
  maybeAutoSaveSpecificationPdfV1,
} from "../../projects/project-pdf-auto-save.js";

export const projectsV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

const PDF_KINDS: ProjectPdfKind[] = ["specification", "estimate", "report", "invoice"];

function assertRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
}

function isStorageAdmin(role: string): boolean {
  const n = normalizeRole(role);
  return n === "owner" || n === "admin" || n === "super_admin";
}

function parsePdfKind(raw: string): ProjectPdfKind | null {
  return PDF_KINDS.includes(raw as ProjectPdfKind) ? (raw as ProjectPdfKind) : null;
}

projectsV1Router.get("/dashboard", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    res.json(await buildFieldOpsDashboardV1Async());
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "dashboard failed" });
  }
});

projectsV1Router.get("/projects", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const customerCode = (req.query.customerCode as string) ?? req.admin?.customerCode;
  res.json({ projects: listProjectsV1({ customerCode }) });
});

projectsV1Router.get("/projects/deleted", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json({ projects: listDeletedProjectsV1() });
});

projectsV1Router.get("/projects/:id/delete-preview", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const source = (req.query.source as string) === "survey" ? "survey" : "business";
  const preview = getProjectDeletePreviewV1(String(req.params.id), source);
  if (!preview) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json(preview);
});

projectsV1Router.get("/projects/:id/pdfs", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const role = req.admin?.role ?? "viewer";
  const includeQnapError = isStorageAdmin(role);
  const settings = getStorageSettingsV1();
  const pdfs = listProjectPdfsV1(String(req.params.id), { includeQnapError });
  res.json({
    storageProvider: PDF_STORAGE_PROVIDER,
    storageBasePath: `uploads/business/${String(req.params.id)}/pdfs/`,
    qnapBackupEnabled: Boolean(settings.qnapBackupEnabled),
    isAdmin: includeQnapError,
    pdfs,
  });
});

projectsV1Router.get("/projects/:id/pdfs/:kind/file", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const projectId = String(req.params.id);
  const kind = parsePdfKind(String(req.params.kind));
  if (!kind) {
    res.status(400).json({ error: "kind must be specification, estimate, invoice, or report" });
    return;
  }
  let filePath = resolveProjectPdfFile(projectId, kind);
  if (!filePath || !isValidPdfFile(filePath)) {
    try {
      await regenerateProjectPdfV1(projectId, kind);
      filePath = resolveProjectPdfFile(projectId, kind);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "PDF generation failed" });
      return;
    }
  }
  if (!filePath || !isValidPdfFile(filePath)) {
    res.status(500).json({ error: "PDF generation failed" });
    return;
  }
  const suffix =
    kind === "estimate"
      ? path.basename(filePath).replace(/^estimate-/, "").replace(/\.pdf$/, "")
      : kind === "invoice"
        ? path.basename(filePath).replace(/^invoice-/, "").replace(/\.pdf$/, "")
        : path.basename(filePath).replace(/^completion-report-|^specification-/, "").replace(/\.pdf$/, "");
  sendPdfFile(res, filePath, buildProjectPdfFileName(kind, suffix));
});

projectsV1Router.post("/projects/:id/pdfs/:kind/regenerate", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const kind = parsePdfKind(String(req.params.kind));
  if (!kind) {
    res.status(400).json({ error: "kind must be specification, estimate, invoice, or report" });
    return;
  }
  try {
    const entry = await regenerateProjectPdfV1(String(req.params.id), kind);
    res.json({
      pdf: entry,
      pdfs: listProjectPdfsV1(String(req.params.id), {
        includeQnapError: isStorageAdmin(req.admin?.role ?? "viewer"),
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "regenerate failed";
    res.status(msg.includes("not found") || msg.startsWith("No ") ? 404 : 500).json({ error: msg });
  }
});

projectsV1Router.delete("/projects/:id/pdfs/:kind", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const kind = parsePdfKind(String(req.params.kind));
  if (!kind) {
    res.status(400).json({ error: "kind must be specification, estimate, invoice, or report" });
    return;
  }
  const ok = deleteProjectPdfV1(String(req.params.id), kind);
  if (!ok) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json({
    ok: true,
    pdfs: listProjectPdfsV1(String(req.params.id), {
      includeQnapError: isStorageAdmin(req.admin?.role ?? "viewer"),
    }),
  });
});

projectsV1Router.post("/projects/:id/pdfs/:kind/qnap-resync", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const kind = parsePdfKind(String(req.params.kind));
  if (!kind) {
    res.status(400).json({ error: "kind must be specification, estimate, invoice, or report" });
    return;
  }
  const projectId = String(req.params.id);
  const meta = resetQnapBackupForResync(projectId, kind);
  if (!meta) {
    res.status(404).json({ error: "PDF not found" });
    return;
  }
  const refreshed = getProjectPdfMeta(projectId, kind);
  if (refreshed) {
    await processQnapPdfBackupRow(refreshed);
  }
  res.json({
    ok: true,
    pdfs: listProjectPdfsV1(projectId, {
      includeQnapError: isStorageAdmin(req.admin?.role ?? "viewer"),
    }),
  });
});

projectsV1Router.post("/projects/:id/specification/create", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const projectId = String(req.params.id);
  try {
    const pdfPath = await maybeAutoSaveSpecificationPdfV1(projectId);
    if (!pdfPath) {
      res.status(404).json({ error: "specification not available" });
      return;
    }
    res.json({
      ok: true,
      pdfPath,
      pdfs: listProjectPdfsV1(projectId, {
        includeQnapError: isStorageAdmin(req.admin?.role ?? "viewer"),
      }),
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "create failed" });
  }
});

projectsV1Router.post("/projects/:id/restore", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const source = (req.query.source as string) === "survey" ? "survey" : "business";
  const ok = restoreProjectV1(String(req.params.id), source);
  if (!ok) {
    res.status(404).json({ error: "deleted project not found" });
    return;
  }
  res.json({ ok: true });
});

projectsV1Router.get("/projects/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const detail = getProjectDetailV1(String(req.params.id), req.query.source as string | undefined);
  if (!detail) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json(detail);
});

projectsV1Router.delete("/projects/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const source = (req.query.source as string) === "survey" ? "survey" : "business";
  const result = deleteProjectV1(String(req.params.id), source);
  if (!result) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json(result);
});
