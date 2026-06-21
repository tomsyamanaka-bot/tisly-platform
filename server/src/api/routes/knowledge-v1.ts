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
  approveKnowledgeCandidateV1,
  bulkApproveKnowledgeCandidatesV1,
  bulkRejectKnowledgeCandidatesV1,
  getKnowledgeCandidateV1,
  getKnowledgeCandidatesStatsV1,
  listKnowledgeCandidateCategoriesV1,
  listKnowledgeCandidatesV1,
  rejectKnowledgeCandidateV1,
} from "../../knowledge/knowledge-candidates-store-v1.js";
import {
  runKnowledgeAutomationForProjectV1,
} from "../../knowledge/knowledge-automation-hooks-v1.js";
import { parseProjectPdfKnowledgeV1 } from "../../knowledge/knowledge-pdf-parser-v1.js";
import { runPhotoOcrV1 } from "../../knowledge/knowledge-photo-ocr-v1.js";
import {
  listKnowledgeAssetsV1,
  registerKnowledgeAssetV1,
  seedDefaultKnowledgeAssetsV1,
} from "../../knowledge/knowledge-assets-v1.js";
import {
  getMothershipExplorerProjectLinksV1,
  getMothershipExplorerTreeV1,
  searchMothershipExplorerV1,
} from "../../knowledge/mothership-explorer-v1.js";
import {
  SOURCE_LABELS_V1,
  STAGE_LABELS_V1,
} from "../../knowledge/knowledge-automation-types.js";
import {
  getKnowledgeQnapSyncStatusV1,
  resetKnowledgeQnapQueueItemV1,
  resetAllFailedKnowledgeQnapQueueV1,
} from "../../knowledge/knowledge-qnap-sync-store-v1.js";
import { getKnowledgeQnapConnectionInfoV1 } from "../../knowledge/knowledge-qnap-sync-service-v1.js";
import { searchKnowledgeIndexV1 } from "../../knowledge/knowledge-search-v1.js";
import { getKnowledgeDetailV1, buildQnapDeepLinksV1 } from "../../knowledge/knowledge-detail-v1.js";
import { tokenizeFieldMemoV1 } from "../../knowledge/knowledge-field-memo-v1.js";
import {
  parseUnifiedKnowledgeKindsV1,
  type UnifiedKnowledgeKindV1,
  unifiedKnowledgeSearchV1,
} from "../../knowledge/unified-knowledge-search-v1.js";
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

/** GET /api/knowledge/search-v1 — 統合キーワード検索（Cards/Candidates/Projects/PDF/Assets/Photos/PLC/ESP/3DPrint） */
knowledgeV1Router.get("/search-v1", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  ensureKnowledgeLibraryTemplatesV1();
  const q = String(req.query.q ?? "");
  const category = String(req.query.category ?? "");
  const projectNo = String(req.query.projectNo ?? "");
  const dateFrom = String(req.query.dateFrom ?? "");
  const dateTo = String(req.query.dateTo ?? "");
  const kindsRaw = String(req.query.kinds ?? "");
  const limitRaw = Number(req.query.limit ?? 50);
  const kinds = kindsRaw ? parseUnifiedKnowledgeKindsV1(kindsRaw) : undefined;
  res.json(
    unifiedKnowledgeSearchV1({
      query: q,
      category: category || undefined,
      projectNo: projectNo || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      kinds,
      limit: Number.isFinite(limitRaw) ? limitRaw : 50,
    })
  );
});

/** GET /api/knowledge/detail-v1?id=&kind= — 現場向けナレッジ詳細 */
knowledgeV1Router.get("/detail-v1", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  ensureKnowledgeLibraryTemplatesV1();
  const id = String(req.query.id ?? "").trim();
  if (!id) {
    res.status(400).json({ error: "id is required" });
    return;
  }
  const kindRaw = String(req.query.kind ?? "").trim();
  const allowedKinds = new Set([
    "knowledge_card",
    "candidate",
    "project",
    "pdf",
    "photo",
    "asset",
    "plc",
    "esp",
    "3dprint",
    "factory",
  ]);
  const kind = allowedKinds.has(kindRaw) ? (kindRaw as UnifiedKnowledgeKindV1) : undefined;
  const detail = getKnowledgeDetailV1(id, kind);
  if (!detail) {
    res.status(404).json({ error: "Knowledge item not found" });
    return;
  }
  res.json({ detail });
});

/** GET /api/knowledge/qnap-links-v1?path= — QNAP 深リンク（SMB / Web / コピー用） */
knowledgeV1Router.get("/qnap-links-v1", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const relPath = String(req.query.path ?? "").trim();
  if (!relPath) {
    res.status(400).json({ error: "path is required" });
    return;
  }
  res.json({ links: buildQnapDeepLinksV1(relPath) });
});

/** GET /api/knowledge/field-memo-tokenize?q= — 現場メモ単語分解（ルールベース） */
knowledgeV1Router.get("/field-memo-tokenize", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const q = String(req.query.q ?? "");
  const tokens = tokenizeFieldMemoV1(q);
  res.json({ text: q, engine: "rule_based_v1", tokens });
});

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
  const status = getKnowledgeQnapSyncStatusV1();
  const connection = getKnowledgeQnapConnectionInfoV1();
  res.json({ ...status, connection });
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

knowledgeV1Router.post("/qnap-sync/retry-all", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const reset = resetAllFailedKnowledgeQnapQueueV1();
  res.json({ ok: true, reset });
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

/** Knowledge Automation Engine v1 — 候補一覧 */
knowledgeV1Router.get("/candidates", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const status = String(req.query.status ?? "") as "pending" | "approved" | "rejected" | "";
  const projectId = String(req.query.projectId ?? "");
  const projectNo = String(req.query.projectNo ?? "");
  const category = String(req.query.category ?? "");
  const candidates = listKnowledgeCandidatesV1({
    status: status || undefined,
    projectId: projectId || undefined,
    projectNo: projectNo || undefined,
    category: category || undefined,
  });
  res.json({
    candidates,
    stats: getKnowledgeCandidatesStatsV1(),
    categories: listKnowledgeCandidateCategoriesV1(),
    labels: { stage: STAGE_LABELS_V1, source: SOURCE_LABELS_V1 },
  });
});

knowledgeV1Router.get("/candidates/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const candidate = getKnowledgeCandidateV1(String(req.params.id));
  if (!candidate) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }
  res.json({ candidate });
});

knowledgeV1Router.post("/candidates/bulk/approve", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    const body = req.body ?? {};
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (!ids.length) {
      res.status(400).json({ error: "ids required" });
      return;
    }
    res.json(bulkApproveKnowledgeCandidatesV1(ids));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Bulk approve failed" });
  }
});

knowledgeV1Router.post("/candidates/bulk/reject", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    const body = req.body ?? {};
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (!ids.length) {
      res.status(400).json({ error: "ids required" });
      return;
    }
    const reason = String(body.reason ?? "一括却下");
    res.json(bulkRejectKnowledgeCandidatesV1(ids, reason));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Bulk reject failed" });
  }
});

knowledgeV1Router.post("/candidates/:id/approve", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    const result = approveKnowledgeCandidateV1(String(req.params.id));
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Approve failed" });
  }
});

knowledgeV1Router.post("/candidates/:id/reject", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    const body = req.body ?? {};
    const candidate = rejectKnowledgeCandidateV1(
      String(req.params.id),
      String(body.reason ?? "")
    );
    res.json({ candidate });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Reject failed" });
  }
});

/** 手動トリガー — 案件の自動収集を再実行 */
knowledgeV1Router.post("/automation/run/:projectId", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    const project = getBusinessProject(String(req.params.projectId));
    if (!project) {
      res.status(404).json({ error: "project not found" });
      return;
    }
    const result = await runKnowledgeAutomationForProjectV1(project.id, project.status);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Automation failed" });
  }
});

/** PDF ルールベース解析プレビュー */
knowledgeV1Router.get("/automation/pdf-parse/:projectId", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    const kind = String(req.query.kind ?? "estimate") as "estimate" | "invoice" | "specification" | "report";
    const extract = parseProjectPdfKnowledgeV1({
      projectId: String(req.params.projectId),
      pdfKind: kind,
    });
    res.json({ extract, engine: "rule_based_v1" });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Parse failed" });
  }
});

/** 写真 OCR プレビュー */
knowledgeV1Router.post("/automation/photo-ocr", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    const body = req.body ?? {};
    const extract = await runPhotoOcrV1({
      photoId: String(body.photoId ?? ""),
      photoKind: body.photoKind === "completion" ? "completion" : "survey",
      title: String(body.title ?? ""),
      comment: body.comment ? String(body.comment) : undefined,
      fileName: body.fileName ? String(body.fileName) : undefined,
      url: body.url ? String(body.url) : undefined,
    });
    res.json({ extract });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "OCR failed" });
  }
});

/** PLC / 3DPrint / Factory 資産 */
knowledgeV1Router.get("/assets", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const domain = String(req.query.domain ?? "") as "PLC" | "3DPrint" | "Factory" | "";
  const projectNo = String(req.query.projectNo ?? "");
  res.json({
    assets: listKnowledgeAssetsV1({
      domain: domain || undefined,
      projectNo: projectNo || undefined,
    }),
  });
});

knowledgeV1Router.post("/assets", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    const body = req.body ?? {};
    const domain = String(body.domain ?? "PLC") as "PLC" | "3DPrint" | "Factory";
    const result = registerKnowledgeAssetV1({
      domain,
      subFolder: String(body.subFolder ?? "Templates"),
      fileName: String(body.fileName ?? "asset.txt"),
      title: String(body.title ?? "資産"),
      category: String(body.category ?? "その他"),
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      summary: String(body.summary ?? ""),
      projectNo: body.projectNo ? String(body.projectNo) : undefined,
      projectId: body.projectId ? String(body.projectId) : undefined,
      ladderDescription: body.ladderDescription ? String(body.ladderDescription) : undefined,
    });
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Asset register failed" });
  }
});

knowledgeV1Router.post("/assets/seed", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json(seedDefaultKnowledgeAssetsV1());
});

/** MotherShip Explorer */
knowledgeV1Router.get("/mothership/explorer", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json(getMothershipExplorerTreeV1());
});

knowledgeV1Router.get("/mothership/search", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const q = String(req.query.q ?? "");
  const projectNo = String(req.query.projectNo ?? "");
  res.json({ hits: searchMothershipExplorerV1(q, projectNo || undefined) });
});

knowledgeV1Router.get("/mothership/project/:projectNo", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json(getMothershipExplorerProjectLinksV1(String(req.params.projectNo)));
});
