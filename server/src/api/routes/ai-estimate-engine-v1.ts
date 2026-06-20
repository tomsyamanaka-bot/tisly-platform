import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import {
  buildAiEstimateDocumentCenterContextV1,
  getAiEstimateEngineStatsV1,
  toCustomerMasterV1,
  toCustomerPriceOverrideV1,
  toMaterialMasterV1,
  toRankMasterV1,
  toWorkMasterV1,
} from "../../master/ai-estimate-engine-v1.js";
import { buildAiEstimateCandidatesV2 } from "../../master/ai-estimate-engine-v2.js";
import { MASTER_V1_CUSTOMER_TYPES } from "../../master/master-v1-types.js";
import {
  createMasterV1Customer,
  createMasterV1CustomerPrice,
  createMasterV1Material,
  createMasterV1Rank,
  createMasterV1WorkItem,
  deleteMasterV1Customer,
  deleteMasterV1CustomerPrice,
  deleteMasterV1Material,
  deleteMasterV1Rank,
  deleteMasterV1WorkItem,
  getMasterV1Customer,
  getMasterV1CustomerPrice,
  getMasterV1Material,
  getMasterV1Rank,
  getMasterV1WorkItem,
  listMasterV1CustomerPrices,
  listMasterV1Customers,
  listMasterV1Materials,
  listMasterV1Ranks,
  listMasterV1WorkItems,
  updateMasterV1Customer,
  updateMasterV1CustomerPrice,
  updateMasterV1Material,
  updateMasterV1Rank,
  updateMasterV1WorkItem,
} from "../../master/master-v1-store.js";

export const aiEstimateEngineV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

function assertRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
}

function listOpts(req: AuthedRequest) {
  return {
    q: req.query.q as string | undefined,
    categoryMain: req.query.categoryMain as string | undefined,
    favoriteOnly: req.query.favoriteOnly === "true",
    activeOnly: req.query.activeOnly !== "false",
    missingFilter:
      req.query.missingFilter === "cost" || req.query.missingFilter === "sell"
        ? (req.query.missingFilter as "cost" | "sell")
        : undefined,
  };
}

aiEstimateEngineV1Router.get("/meta", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json({
    schemaVersion: "ai_estimate_engine_v1",
    customerTypes: MASTER_V1_CUSTOMER_TYPES,
    workCategories: [
      "防犯カメラ",
      "LAN / ネットワーク",
      "Wi-Fi / AP",
      "電気工事",
      "照明",
      "コンセント",
      "インターホン",
      "電話",
      "エアコン",
      "その他",
    ],
    uiPath: "/master-v1",
    apiBase: "/api/ai-estimate-engine/v1",
  });
});

aiEstimateEngineV1Router.get("/stats", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json(getAiEstimateEngineStatsV1());
});

aiEstimateEngineV1Router.get(
  "/document-center/:projectId",
  ...auth,
  (req: AuthedRequest, res) => {
    if (!assertRole(req, res)) return;
    const ctx = buildAiEstimateDocumentCenterContextV1(String(req.params.projectId));
    if (!ctx) {
      res.status(404).json({ error: "project not found" });
      return;
    }
    res.json(ctx);
  }
);

// Phase1 — customer_master_v1
aiEstimateEngineV1Router.get("/customer-master", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const customerId = req.query.customerId as string | undefined;
  if (customerId) {
    const c = getMasterV1Customer(customerId);
    if (!c) {
      res.status(404).json({ error: "customer not found" });
      return;
    }
    res.json({ customer: toCustomerMasterV1(c) });
    return;
  }
  res.json({
    customers: listMasterV1Customers(listOpts(req)).map(toCustomerMasterV1),
  });
});

aiEstimateEngineV1Router.post("/customer-master", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  if (!body.name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const item = createMasterV1Customer({
    name: String(body.name),
    customerType: body.customerType != null ? String(body.customerType) : "一般",
    standardMarkupRate: body.standardMarkupRate != null ? Number(body.standardMarkupRate) : 2,
    standardDiscountRate: body.standardDiscountRate != null ? Number(body.standardDiscountRate) : 0,
    standardLaborUnitPrice:
      body.standardLaborUnitPrice != null ? Number(body.standardLaborUnitPrice) : 8000,
    standardTravelFee: body.standardTravelFee != null ? Number(body.standardTravelFee) : 5000,
    rankId: body.rankId != null ? String(body.rankId) : null,
    customerCode: body.customerCode != null ? String(body.customerCode) : undefined,
    contactName: body.contactName != null ? String(body.contactName) : null,
    phone: body.phone != null ? String(body.phone) : null,
    favorite: Boolean(body.favorite),
  });
  res.status(201).json({ customer: toCustomerMasterV1(item) });
});

aiEstimateEngineV1Router.patch("/customer-master/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const item = updateMasterV1Customer(String(req.params.id), {
    name: body.name != null ? String(body.name) : undefined,
    customerType: body.customerType != null ? String(body.customerType) : undefined,
    standardMarkupRate:
      body.standardMarkupRate != null ? Number(body.standardMarkupRate) : undefined,
    standardDiscountRate:
      body.standardDiscountRate != null ? Number(body.standardDiscountRate) : undefined,
    standardLaborUnitPrice:
      body.standardLaborUnitPrice != null ? Number(body.standardLaborUnitPrice) : undefined,
    standardTravelFee: body.standardTravelFee != null ? Number(body.standardTravelFee) : undefined,
    rankId: body.rankId !== undefined ? (body.rankId != null ? String(body.rankId) : null) : undefined,
    favorite: body.favorite !== undefined ? Boolean(body.favorite) : undefined,
  });
  if (!item) {
    res.status(404).json({ error: "customer not found" });
    return;
  }
  res.json({ customer: toCustomerMasterV1(item) });
});

aiEstimateEngineV1Router.delete("/customer-master/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  if (!deleteMasterV1Customer(String(req.params.id))) {
    res.status(404).json({ error: "customer not found" });
    return;
  }
  res.json({ ok: true });
});

// Phase2 — rank_master_v1
aiEstimateEngineV1Router.get("/rank-master", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json({ ranks: listMasterV1Ranks(listOpts(req)).map(toRankMasterV1) });
});

aiEstimateEngineV1Router.post("/rank-master", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  if (!body.name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const item = createMasterV1Rank({
    name: String(body.name),
    costMultiplier: body.markupRate != null ? Number(body.markupRate) : 2,
    laborMultiplier: body.laborMultiplier != null ? Number(body.laborMultiplier) : 2,
    grossMarginRate: body.grossMarginRate != null ? Number(body.grossMarginRate) : 50,
    discountRate: body.discountRate != null ? Number(body.discountRate) : 0,
    memo: body.memo != null ? String(body.memo) : null,
  });
  res.status(201).json({ rank: toRankMasterV1(item) });
});

aiEstimateEngineV1Router.patch("/rank-master/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const item = updateMasterV1Rank(String(req.params.id), {
    name: body.name != null ? String(body.name) : undefined,
    costMultiplier: body.markupRate != null ? Number(body.markupRate) : undefined,
    laborMultiplier: body.laborMultiplier != null ? Number(body.laborMultiplier) : undefined,
    grossMarginRate: body.grossMarginRate != null ? Number(body.grossMarginRate) : undefined,
    discountRate: body.discountRate != null ? Number(body.discountRate) : undefined,
    memo: body.memo !== undefined ? (body.memo != null ? String(body.memo) : null) : undefined,
  });
  if (!item) {
    res.status(404).json({ error: "rank not found" });
    return;
  }
  res.json({ rank: toRankMasterV1(item) });
});

aiEstimateEngineV1Router.delete("/rank-master/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  if (!deleteMasterV1Rank(String(req.params.id))) {
    res.status(404).json({ error: "rank not found" });
    return;
  }
  res.json({ ok: true });
});

// Phase3 — work_master_v1
aiEstimateEngineV1Router.get("/work-master", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json({ workItems: listMasterV1WorkItems(listOpts(req)).map(toWorkMasterV1) });
});

aiEstimateEngineV1Router.post("/work-master", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  if (!body.name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const item = createMasterV1WorkItem({
    name: String(body.name),
    categoryMain: body.categoryMain != null ? String(body.categoryMain) : "その他",
    categorySub: body.categorySub != null ? String(body.categorySub) : "",
    standardLabor: body.standardLabor != null ? Number(body.standardLabor) : 1,
    standardHours: body.standardHours != null ? Number(body.standardHours) : 1,
    standardCost: body.standardCost != null ? Number(body.standardCost) : 0,
    laborCost: body.laborCost != null ? Number(body.laborCost) : 0,
    standardSellPrice: body.standardUnitPrice != null ? Number(body.standardUnitPrice) : 0,
    unit: body.unit != null ? String(body.unit) : "式",
    memo: body.memo != null ? String(body.memo) : null,
    favorite: Boolean(body.favorite),
  });
  res.status(201).json({ workItem: toWorkMasterV1(item) });
});

aiEstimateEngineV1Router.patch("/work-master/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const item = updateMasterV1WorkItem(String(req.params.id), {
    name: body.name != null ? String(body.name) : undefined,
    categoryMain: body.categoryMain != null ? String(body.categoryMain) : undefined,
    categorySub: body.categorySub != null ? String(body.categorySub) : undefined,
    standardLabor: body.standardLabor != null ? Number(body.standardLabor) : undefined,
    standardHours: body.standardHours != null ? Number(body.standardHours) : undefined,
    standardCost: body.standardCost != null ? Number(body.standardCost) : undefined,
    laborCost: body.laborCost != null ? Number(body.laborCost) : undefined,
    standardSellPrice: body.standardUnitPrice != null ? Number(body.standardUnitPrice) : undefined,
    memo: body.memo !== undefined ? (body.memo != null ? String(body.memo) : null) : undefined,
    favorite: body.favorite !== undefined ? Boolean(body.favorite) : undefined,
  });
  if (!item) {
    res.status(404).json({ error: "work item not found" });
    return;
  }
  res.json({ workItem: toWorkMasterV1(item) });
});

aiEstimateEngineV1Router.delete("/work-master/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  if (!deleteMasterV1WorkItem(String(req.params.id))) {
    res.status(404).json({ error: "work item not found" });
    return;
  }
  res.json({ ok: true });
});

// Phase4 — material_master_v1
aiEstimateEngineV1Router.get("/material-master", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json({ materials: listMasterV1Materials(listOpts(req)).map(toMaterialMasterV1) });
});

aiEstimateEngineV1Router.post("/material-master", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  if (!body.name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const item = createMasterV1Material({
    name: String(body.name),
    categoryMain: body.categoryMain != null ? String(body.categoryMain) : "その他",
    categorySub: body.categorySub != null ? String(body.categorySub) : "",
    maker: body.maker != null ? String(body.maker) : null,
    model: body.model != null ? String(body.model) : null,
    supplier: body.supplier != null ? String(body.supplier) : null,
    cost: body.cost != null ? Number(body.cost) : 0,
    standardSellPrice: body.standardSellPrice != null ? Number(body.standardSellPrice) : 0,
    unit: body.unit != null ? String(body.unit) : "個",
    memo: body.memo != null ? String(body.memo) : null,
    favorite: Boolean(body.favorite),
  });
  res.status(201).json({ material: toMaterialMasterV1(item) });
});

aiEstimateEngineV1Router.patch("/material-master/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const item = updateMasterV1Material(String(req.params.id), {
    name: body.name != null ? String(body.name) : undefined,
    categoryMain: body.categoryMain != null ? String(body.categoryMain) : undefined,
    maker: body.maker !== undefined ? (body.maker != null ? String(body.maker) : null) : undefined,
    model: body.model !== undefined ? (body.model != null ? String(body.model) : null) : undefined,
    supplier: body.supplier !== undefined ? (body.supplier != null ? String(body.supplier) : null) : undefined,
    cost: body.cost != null ? Number(body.cost) : undefined,
    standardSellPrice: body.standardSellPrice != null ? Number(body.standardSellPrice) : undefined,
    memo: body.memo !== undefined ? (body.memo != null ? String(body.memo) : null) : undefined,
    favorite: body.favorite !== undefined ? Boolean(body.favorite) : undefined,
  });
  if (!item) {
    res.status(404).json({ error: "material not found" });
    return;
  }
  res.json({ material: toMaterialMasterV1(item) });
});

aiEstimateEngineV1Router.delete("/material-master/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  if (!deleteMasterV1Material(String(req.params.id))) {
    res.status(404).json({ error: "material not found" });
    return;
  }
  res.json({ ok: true });
});

// Phase5 — customer_price_override_v1
aiEstimateEngineV1Router.get("/customer-price-override", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const customerId = req.query.customerId as string | undefined;
  const prices = listMasterV1CustomerPrices(customerId ? { customerId } : undefined);
  res.json({ overrides: prices.map(toCustomerPriceOverrideV1) });
});

aiEstimateEngineV1Router.post("/customer-price-override", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  if (!body.customerId || !body.itemId || !body.itemType) {
    res.status(400).json({ error: "customerId, itemType, itemId are required" });
    return;
  }
  const item = createMasterV1CustomerPrice({
    customerId: String(body.customerId),
    itemType: body.itemType === "material" ? "material" : "work",
    itemId: String(body.itemId),
    unitPrice:
      body.laborOrMaterialUnitPrice != null
        ? Number(body.laborOrMaterialUnitPrice)
        : Number(body.unitPrice ?? 0),
    costPrice: body.costPrice != null ? Number(body.costPrice) : 0,
    memo: body.memo != null ? String(body.memo) : null,
  });
  res.status(201).json({ override: toCustomerPriceOverrideV1(item) });
});

aiEstimateEngineV1Router.patch("/customer-price-override/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const item = updateMasterV1CustomerPrice(String(req.params.id), {
    unitPrice:
      body.laborOrMaterialUnitPrice != null
        ? Number(body.laborOrMaterialUnitPrice)
        : body.unitPrice != null
          ? Number(body.unitPrice)
          : undefined,
    costPrice: body.costPrice != null ? Number(body.costPrice) : undefined,
    memo: body.memo !== undefined ? (body.memo != null ? String(body.memo) : null) : undefined,
  });
  if (!item) {
    res.status(404).json({ error: "override not found" });
    return;
  }
  res.json({ override: toCustomerPriceOverrideV1(item) });
});

aiEstimateEngineV1Router.delete("/customer-price-override/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  if (!deleteMasterV1CustomerPrice(String(req.params.id))) {
    res.status(404).json({ error: "override not found" });
    return;
  }
  res.json({ ok: true });
});

// —— AI見積エンジン v2 — 見積候補 ——

aiEstimateEngineV1Router.get("/candidates-v2", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const sketchId = req.query.sketchId ? String(req.query.sketchId) : undefined;
  const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
  const customerId = req.query.customerId ? String(req.query.customerId) : null;
  const mmPerPx = req.query.mmPerPx ? Number(req.query.mmPerPx) : undefined;
  if (!sketchId && !projectId) {
    res.status(400).json({ error: "sketchId or projectId is required" });
    return;
  }
  const preview = buildAiEstimateCandidatesV2({ sketchId, projectId, customerId, mmPerPx });
  if (!preview) {
    res.status(404).json({ error: "candidates not found" });
    return;
  }
  res.json(preview);
});
