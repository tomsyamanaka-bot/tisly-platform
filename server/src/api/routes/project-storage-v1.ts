import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import {
  createProjectStorageFoldersV1,
  listProjectStorageV1,
  saveProjectStorageDocumentV1,
  type ProjectStorageDocKind,
} from "../../storage/project-storage-v1.js";

export const projectStorageV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

const VALID_KINDS = new Set<ProjectStorageDocKind>([
  "estimate",
  "invoice",
  "specification",
  "report",
]);

function assertRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
}

projectStorageV1Router.get("/:projectId", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    res.json(listProjectStorageV1(String(req.params.projectId)));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "list failed";
    if (msg === "project not found") {
      res.status(404).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

projectStorageV1Router.post("/:projectId/create-folders", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    const result = createProjectStorageFoldersV1(String(req.params.projectId));
    res.status(result.created ? 201 : 200).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "create folders failed";
    if (msg === "project not found") {
      res.status(404).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

projectStorageV1Router.post("/:projectId/save-document", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body ?? {};
  const kind = String(body.kind ?? "") as ProjectStorageDocKind;
  if (!VALID_KINDS.has(kind)) {
    res.status(400).json({ error: "kind must be estimate|invoice|specification|report" });
    return;
  }
  try {
    const result = saveProjectStorageDocumentV1(
      String(req.params.projectId),
      kind,
      body.pdfPath != null ? String(body.pdfPath) : undefined
    );
    res.status(201).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "save failed";
    if (msg === "project not found") {
      res.status(404).json({ error: msg });
      return;
    }
    if (msg.startsWith("No local PDF") || msg.startsWith("PDF not found")) {
      res.status(400).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
});
