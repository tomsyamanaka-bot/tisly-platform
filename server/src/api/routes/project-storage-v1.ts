import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import { regenerateProjectPdfV1 } from "../../projects/project-pdf-store.js";
import {
  createProjectStorageFoldersV1,
  listProjectStorageV1,
  resolveProjectStorageProviderKind,
  resolveProjectStorageFilePath,
  saveProjectStorageDocumentV1,
  uploadProjectStorageFileV1,
  UPLOAD_FOLDER_TYPES,
  type ProjectStorageDocKind,
  type ProjectStorageFolderType,
} from "../../storage/project-storage-v1.js";

export const projectStorageV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

const VALID_KINDS = new Set<ProjectStorageDocKind>([
  "estimate",
  "invoice",
  "specification",
  "report",
]);

const VALID_FOLDER_TYPES = new Set<ProjectStorageFolderType>([
  "survey",
  "estimate",
  "invoice",
  "specification",
  "completion",
  "photos",
  "drawings",
  "others",
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
    res.json({
      ...listProjectStorageV1(String(req.params.projectId)),
      storageProvider: resolveProjectStorageProviderKind(),
    });
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

projectStorageV1Router.post("/:projectId/regenerate-document", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body ?? {};
  const kind = String(body.kind ?? "") as ProjectStorageDocKind;
  if (!VALID_KINDS.has(kind)) {
    res.status(400).json({ error: "kind must be estimate|invoice|specification|report" });
    return;
  }
  const projectId = String(req.params.projectId);
  try {
    await regenerateProjectPdfV1(projectId, kind);
    const result = saveProjectStorageDocumentV1(projectId, kind);
    res.status(200).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "regenerate failed";
    if (msg === "project not found") {
      res.status(404).json({ error: msg });
      return;
    }
    if (
      msg.startsWith("No ") ||
      msg.startsWith("PDF not found") ||
      msg === "No specification" ||
      msg === "No completion report"
    ) {
      res.status(400).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

projectStorageV1Router.get("/:projectId/file", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const projectId = String(req.params.projectId);
  const relativePath = String(req.query.relativePath ?? "").trim();
  if (!relativePath) {
    res.status(400).json({ error: "relativePath is required" });
    return;
  }
  try {
    const abs = resolveProjectStorageFilePath(projectId, relativePath);
    if (!abs) {
      res.status(404).json({ error: "file not found" });
      return;
    }
    res.sendFile(abs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "file read failed";
    res.status(500).json({ error: msg });
  }
});

projectStorageV1Router.post("/:projectId/upload-file", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body ?? {};
  const folderType = String(body.folderType ?? "") as ProjectStorageFolderType;
  if (!VALID_FOLDER_TYPES.has(folderType)) {
    res.status(400).json({
      error:
        "folderType must be survey|estimate|invoice|specification|completion|photos|drawings|others",
    });
    return;
  }
  if (!UPLOAD_FOLDER_TYPES.has(folderType)) {
    res.status(400).json({ error: "upload allowed only for photos|drawings|others" });
    return;
  }
  try {
    const result = uploadProjectStorageFileV1(String(req.params.projectId), folderType, {
      fileName: body.fileName != null ? String(body.fileName) : "upload.bin",
      fileBase64: String(body.fileBase64 ?? ""),
    });
    res.status(201).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upload failed";
    if (msg === "project not found") {
      res.status(404).json({ error: msg });
      return;
    }
    if (msg.includes("required") || msg.includes("empty") || msg.includes("must be")) {
      res.status(400).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
});
