import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import { searchKnowledgeIndexV1 } from "../../knowledge/knowledge-search-v1.js";
import {
  getKnowledgeCardV1,
  getKnowledgeStructureV1,
  listKnowledgeCardsV1,
  loadKnowledgeSearchIndexV1,
  loadWorkCategoriesMaster,
  saveKnowledgeCardV1,
} from "../../knowledge/knowledge-store-v1.js";

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
