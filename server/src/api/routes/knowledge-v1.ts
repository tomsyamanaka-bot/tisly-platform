import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import {
  convertProjectToKnowledgeV1,
  getProjectKnowledgeStatusV1,
} from "../../knowledge/knowledge-from-project-v1.js";
import { registerProjectPdfKnowledgeV1, searchPdfKnowledgeV1 } from "../../knowledge/knowledge-pdf-v1.js";
import {
  searchPhotoKnowledgeV1,
  updatePhotoKnowledgeMetaV1,
} from "../../knowledge/knowledge-photo-v1.js";
import { captureQuickKnowledgeV1 } from "../../knowledge/knowledge-quick-v1.js";
import {
  getKnowledgeQnapSyncStatusV1,
  resetKnowledgeQnapQueueItemV1,
} from "../../knowledge/knowledge-qnap-sync-store-v1.js";
import { searchKnowledgeIndexV1 } from "../../knowledge/knowledge-search-v1.js";
import { ensureKnowledgeLibraryTemplatesV1 } from "../../knowledge/knowledge-templates-v1.js";
import {
  getKnowledgeCardV1,
  getKnowledgeStructureV1,
  listKnowledgeCardsV1,
  loadKnowledgeSearchIndexV1,
  loadWorkCategoriesMaster,
  saveKnowledgeCardV1,
} from "../../knowledge/knowledge-store-v1.js";
import { getBusinessProject } from "../../business/business-store.js";

export const knowledgeV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

function assertRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
}

/** GET /api/knowledge/search?q= — v1 キーワード検索 */
knowledgeV1Router.get("/search", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const q = String(req.query.q ?? "");
  const type = String(req.query.type ?? "");
  if (type === "photo") {
    res.json({ query: q, engine: "keyword_v1", hits: searchPhotoKnowledgeV1(q) });
    return;
  }
  if (type === "pdf") {
    res.json({ query: q, engine: "keyword_v1", hits: searchPdfKnowledgeV1(q) });
    return;
  }
  const index = loadKnowledgeSearchIndexV1();
  const hits = searchKnowledgeIndexV1(index.entries, q);
  res.json({
    query: q,
    engine: "keyword_v1",
    indexUpdatedAt: index.updatedAt,
    hits,
  });
});

knowledgeV1Router.get("/cards", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json({ cards: listKnowledgeCardsV1() });
});

knowledgeV1Router.get("/cards/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const card = getKnowledgeCardV1(String(req.params.id));
  if (!card) {
    res.status(404).json({ error: "Knowledge card not found" });
    return;
  }
  res.json({ card });
});

knowledgeV1Router.post("/cards", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    const card = saveKnowledgeCardV1(req.body ?? {});
    res.status(201).json({ card });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Invalid card" });
  }
});

knowledgeV1Router.get("/categories", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json(loadWorkCategoriesMaster());
});

knowledgeV1Router.get("/structure", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json(getKnowledgeStructureV1());
});

/** Phase1 — 案件→Knowledge 変換 */
knowledgeV1Router.post("/from-project/:projectId", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    const result = convertProjectToKnowledgeV1(String(req.params.projectId));
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Conversion failed" });
  }
});

knowledgeV1Router.get("/from-project/:projectId/status", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json(getProjectKnowledgeStatusV1(String(req.params.projectId)));
});

/** Phase2 — 写真ナレッジ */
knowledgeV1Router.post("/photos/tag", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    const body = req.body ?? {};
    const project = getBusinessProject(String(body.projectId ?? ""));
    if (!project) {
      res.status(404).json({ error: "project not found" });
      return;
    }
    const card = updatePhotoKnowledgeMetaV1({
      photoKind: body.photoKind === "completion" ? "completion" : "survey",
      photoId: String(body.photoId ?? ""),
      projectId: project.id,
      projectNo: project.projectNo,
      customerName: project.customerName,
      title: String(body.title ?? ""),
      category: String(body.category ?? "その他"),
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      url: body.url ? String(body.url) : undefined,
    });
    res.status(201).json({ card });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Photo tag failed" });
  }
});

/** Phase3 — PDFナレッジ */
knowledgeV1Router.post("/pdfs/register", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    const body = req.body ?? {};
    const project = getBusinessProject(String(body.projectId ?? ""));
    if (!project) {
      res.status(404).json({ error: "project not found" });
      return;
    }
    const kind = String(body.kind ?? "") as "estimate" | "invoice" | "specification" | "report";
    const card = registerProjectPdfKnowledgeV1({
      projectId: project.id,
      projectNo: project.projectNo,
      customerName: project.customerName,
      category: String(body.category ?? "その他"),
      kind,
      fileName: String(body.fileName ?? "document.pdf"),
      localPath: String(body.localPath ?? ""),
    });
    res.status(201).json({ card });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "PDF register failed" });
  }
});

/** Phase5/6 — PLC / RP テンプレート */
knowledgeV1Router.post("/templates/seed", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json(ensureKnowledgeLibraryTemplatesV1());
});

/** Phase7 — QNAP 同期ステータス */
knowledgeV1Router.get("/qnap-sync/status", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json(getKnowledgeQnapSyncStatusV1());
});

knowledgeV1Router.post("/qnap-sync/retry/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const ok = resetKnowledgeQnapQueueItemV1(String(req.params.id));
  if (!ok) {
    res.status(404).json({ error: "Queue item not found" });
    return;
  }
  res.json({ ok: true });
});

/** Phase8 — 現場クイック登録 */
knowledgeV1Router.post("/quick", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    const body = req.body ?? {};
    const card = captureQuickKnowledgeV1({
      title: String(body.title ?? "現場メモ"),
      category: String(body.category ?? "その他"),
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      memo: String(body.memo ?? ""),
      imageBase64: body.imageBase64 ? String(body.imageBase64) : undefined,
      fileName: body.fileName ? String(body.fileName) : undefined,
    });
    res.status(201).json({ card });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Quick capture failed" });
  }
});
