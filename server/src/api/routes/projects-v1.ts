import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
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
} from "../../projects/project-pdf-store.js";

export const projectsV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

const PDF_KINDS: ProjectPdfKind[] = ["estimate", "invoice", "report"];

function assertRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
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
  const pdfs = listProjectPdfsV1(String(req.params.id));
  res.json({
    storageProvider: PDF_STORAGE_PROVIDER,
    storageBasePath: `uploads/business/${String(req.params.id)}/pdfs/`,
    pdfs,
  });
});

projectsV1Router.get("/projects/:id/pdfs/:kind/file", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const kind = parsePdfKind(String(req.params.kind));
  if (!kind) {
    res.status(400).json({ error: "kind must be estimate, invoice, or report" });
    return;
  }
  const filePath = resolveProjectPdfFile(String(req.params.id), kind);
  if (!filePath) {
    res.status(404).json({ error: "PDF not found" });
    return;
  }
  res.type("application/pdf").sendFile(filePath);
});

projectsV1Router.post("/projects/:id/pdfs/:kind/regenerate", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const kind = parsePdfKind(String(req.params.kind));
  if (!kind) {
    res.status(400).json({ error: "kind must be estimate, invoice, or report" });
    return;
  }
  try {
    const entry = await regenerateProjectPdfV1(String(req.params.id), kind);
    res.json({ pdf: entry, pdfs: listProjectPdfsV1(String(req.params.id)) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "regenerate failed";
    res.status(msg.includes("not found") || msg.startsWith("No ") ? 404 : 500).json({ error: msg });
  }
});

projectsV1Router.delete("/projects/:id/pdfs/:kind", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const kind = parsePdfKind(String(req.params.kind));
  if (!kind) {
    res.status(400).json({ error: "kind must be estimate, invoice, or report" });
    return;
  }
  const ok = deleteProjectPdfV1(String(req.params.id), kind);
  if (!ok) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json({ ok: true, pdfs: listProjectPdfsV1(String(req.params.id)) });
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
