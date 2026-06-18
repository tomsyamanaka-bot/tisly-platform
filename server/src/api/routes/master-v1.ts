import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import {
  MASTER_V1_CHIP_FILTERS,
  MASTER_V1_MAIN_CATEGORIES,
  MASTER_V1_MISSING_FILTERS,
} from "../../master/master-v1-categories.js";
import {
  MASTER_V1_MATERIAL_CATEGORIES,
  MASTER_V1_WORK_CATEGORIES,
  type MasterV1Entity,
  type MasterV1MissingFilter,
} from "../../master/master-v1-types.js";
import {
  bulkUpdateMasterV1,
  createMasterV1Category,
  createMasterV1Customer,
  createMasterV1CustomerPrice,
  createMasterV1Material,
  createMasterV1Rank,
  createMasterV1SymbolMapping,
  createMasterV1WorkItem,
  deleteMasterV1Category,
  deleteMasterV1Customer,
  deleteMasterV1CustomerPrice,
  deleteMasterV1Material,
  deleteMasterV1Rank,
  deleteMasterV1SymbolMapping,
  deleteMasterV1WorkItem,
  getMasterV1Category,
  getMasterV1Customer,
  getMasterV1CustomerPrice,
  getMasterV1Material,
  getMasterV1Rank,
  getMasterV1SymbolMapping,
  getMasterV1WorkItem,
  listMasterV1Categories,
  listMasterV1CustomerPrices,
  listMasterV1Customers,
  listMasterV1Materials,
  listMasterV1Ranks,
  listMasterV1SymbolMappings,
  listMasterV1WorkItems,
  updateMasterV1Category,
  updateMasterV1Customer,
  updateMasterV1CustomerPrice,
  updateMasterV1Material,
  updateMasterV1Rank,
  updateMasterV1SymbolMapping,
  updateMasterV1WorkItem,
  reorderMasterV1Categories,
} from "../../master/master-v1-store.js";
import { exportMasterV1Csv, importMasterV1Csv } from "../../master/master-v1-csv.js";
import {
  buildEstimatePreviewBySketchId,
  buildEstimatePreviewFromLayers,
  listSymbolMappingSummary,
} from "../../master/estimate-preview-service.js";
import { saveMasterV1EstimateDraft, getMasterV1EstimateDraft, getLatestMasterV1EstimateDraftBySketch } from "../../master/master-v1-draft-estimate-store.js";
import {
  createEstimateFromMasterDraftV1,
  summarizeMasterPreviewPricing,
} from "../../master/master-v1-estimate-apply-service.js";
import {
  createStorageProvider,
  getDefaultStorageProvider,
  STORAGE_PROVIDER_KINDS,
} from "../../storage/storage-provider-factory.js";
import type { StorageProviderKind } from "../../storage/storage-provider.js";
import type { SurveyDrawingAiExportV1 } from "../../survey/survey-drawing-v1-types.js";

export const masterV1Router = Router();

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
  const chip = req.query.chip as string | undefined;
  const favoriteOnly = req.query.favoriteOnly === "true" || chip === "__favorite__";
  const missingRaw = req.query.missingFilter as string | undefined;
  const missingFilter: MasterV1MissingFilter | undefined =
    missingRaw === "cost" ||
    missingRaw === "sell" ||
    missingRaw === "supplier" ||
    missingRaw === "model" ||
    missingRaw === "category"
      ? missingRaw
      : undefined;
  return {
    q: req.query.q as string | undefined,
    category: req.query.category as string | undefined,
    categoryMain: (req.query.categoryMain as string | undefined) || (chip && chip !== "__favorite__" ? chip : undefined),
    categorySub: req.query.categorySub as string | undefined,
    favoriteOnly,
    activeOnly: req.query.activeOnly !== "false",
    missingFilter,
  };
}

function parseTagsBody(body: Record<string, unknown>): string[] | undefined {
  if (body.tags == null) return undefined;
  if (Array.isArray(body.tags)) return body.tags.map(String);
  if (typeof body.tags === "string") {
    return body.tags.split(/[,、\s]+/).filter(Boolean);
  }
  return [];
}

function parseExtraMaterialIds(body: Record<string, unknown>): string[] | undefined {
  if (body.extraMaterialIds == null) return undefined;
  if (Array.isArray(body.extraMaterialIds)) return body.extraMaterialIds.map(String);
  if (typeof body.extraMaterialIds === "string") {
    return body.extraMaterialIds.split(/[,、\s]+/).filter(Boolean);
  }
  return [];
}

masterV1Router.get("/meta", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const categories = listMasterV1Categories();
  res.json({
    workCategories: MASTER_V1_WORK_CATEGORIES,
    materialCategories: MASTER_V1_MATERIAL_CATEGORIES,
    mainCategories: MASTER_V1_MAIN_CATEGORIES,
    chipFilters: MASTER_V1_CHIP_FILTERS,
    missingFilters: MASTER_V1_MISSING_FILTERS,
    categories,
    storageProviders: STORAGE_PROVIDER_KINDS,
    csvEntities: ["customers", "ranks", "work-items", "materials"] as MasterV1Entity[],
  });
});

// —— Categories ——

masterV1Router.get("/categories", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const kind = req.query.kind as "work" | "material" | "both" | undefined;
  const categoryMain = req.query.categoryMain as string | undefined;
  res.json({ categories: listMasterV1Categories({ kind, categoryMain }) });
});

masterV1Router.post("/categories", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  if (!body.categoryMain || !body.categorySub) {
    res.status(400).json({ error: "categoryMain and categorySub are required" });
    return;
  }
  const item = createMasterV1Category({
    kind: body.kind === "work" || body.kind === "material" ? body.kind : "both",
    categoryMain: String(body.categoryMain),
    categorySub: String(body.categorySub),
    sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
    active: body.active !== false,
  });
  res.status(201).json(item);
});

masterV1Router.patch("/categories/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const item = updateMasterV1Category(String(req.params.id), {
    kind: body.kind === "work" || body.kind === "material" || body.kind === "both" ? body.kind : undefined,
    categoryMain: body.categoryMain != null ? String(body.categoryMain) : undefined,
    categorySub: body.categorySub != null ? String(body.categorySub) : undefined,
    sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
    active: body.active !== undefined ? Boolean(body.active) : undefined,
  });
  if (!item) {
    res.status(404).json({ error: "category not found" });
    return;
  }
  res.json(item);
});

masterV1Router.delete("/categories/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  if (!deleteMasterV1Category(String(req.params.id))) {
    res.status(404).json({ error: "category not found" });
    return;
  }
  res.json({ ok: true });
});

// —— Customers ——

masterV1Router.get("/customers", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json({ customers: listMasterV1Customers(listOpts(req)) });
});

masterV1Router.get("/customers/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const item = getMasterV1Customer(String(req.params.id));
  if (!item) {
    res.status(404).json({ error: "customer not found" });
    return;
  }
  res.json(item);
});

masterV1Router.post("/customers", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  if (!body.name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const item = createMasterV1Customer({
    name: String(body.name),
    customerCode: body.customerCode != null ? String(body.customerCode) : undefined,
    rankId: body.rankId != null ? String(body.rankId) : null,
    contactName: body.contactName != null ? String(body.contactName) : null,
    phone: body.phone != null ? String(body.phone) : null,
    email: body.email != null ? String(body.email) : null,
    address: body.address != null ? String(body.address) : null,
    memo: body.memo != null ? String(body.memo) : null,
    favorite: Boolean(body.favorite),
    active: body.active !== false,
    sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
  });
  res.status(201).json(item);
});

masterV1Router.patch("/customers/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const item = updateMasterV1Customer(String(req.params.id), {
    customerCode: body.customerCode != null ? String(body.customerCode) : undefined,
    name: body.name != null ? String(body.name) : undefined,
    rankId: body.rankId !== undefined ? (body.rankId != null ? String(body.rankId) : null) : undefined,
    contactName: body.contactName !== undefined ? (body.contactName != null ? String(body.contactName) : null) : undefined,
    phone: body.phone !== undefined ? (body.phone != null ? String(body.phone) : null) : undefined,
    email: body.email !== undefined ? (body.email != null ? String(body.email) : null) : undefined,
    address: body.address !== undefined ? (body.address != null ? String(body.address) : null) : undefined,
    memo: body.memo !== undefined ? (body.memo != null ? String(body.memo) : null) : undefined,
    favorite: body.favorite !== undefined ? Boolean(body.favorite) : undefined,
    active: body.active !== undefined ? Boolean(body.active) : undefined,
    sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
  });
  if (!item) {
    res.status(404).json({ error: "customer not found" });
    return;
  }
  res.json(item);
});

masterV1Router.delete("/customers/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  if (!deleteMasterV1Customer(String(req.params.id))) {
    res.status(404).json({ error: "customer not found" });
    return;
  }
  res.json({ ok: true });
});

// —— Ranks ——

masterV1Router.get("/ranks", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json({ ranks: listMasterV1Ranks(listOpts(req)) });
});

masterV1Router.post("/ranks", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  if (!body.name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const item = createMasterV1Rank({
    name: String(body.name),
    costMultiplier: body.costMultiplier != null ? Number(body.costMultiplier) : undefined,
    laborMultiplier: body.laborMultiplier != null ? Number(body.laborMultiplier) : undefined,
    memo: body.memo != null ? String(body.memo) : null,
    sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
    active: body.active !== false,
  });
  res.status(201).json(item);
});

masterV1Router.patch("/ranks/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const item = updateMasterV1Rank(String(req.params.id), {
    name: body.name != null ? String(body.name) : undefined,
    costMultiplier: body.costMultiplier != null ? Number(body.costMultiplier) : undefined,
    laborMultiplier: body.laborMultiplier != null ? Number(body.laborMultiplier) : undefined,
    memo: body.memo !== undefined ? (body.memo != null ? String(body.memo) : null) : undefined,
    sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
    active: body.active !== undefined ? Boolean(body.active) : undefined,
  });
  if (!item) {
    res.status(404).json({ error: "rank not found" });
    return;
  }
  res.json(item);
});

masterV1Router.delete("/ranks/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  if (!deleteMasterV1Rank(String(req.params.id))) {
    res.status(404).json({ error: "rank not found" });
    return;
  }
  res.json({ ok: true });
});

// —— Work items ——

masterV1Router.get("/work-items", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json({ workItems: listMasterV1WorkItems(listOpts(req)) });
});

masterV1Router.post("/work-items", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  if (!body.name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const categoryMain = body.categoryMain ?? body.category;
  if (!categoryMain) {
    res.status(400).json({ error: "categoryMain is required" });
    return;
  }
  const item = createMasterV1WorkItem({
    categoryMain: String(categoryMain),
    categorySub: body.categorySub != null ? String(body.categorySub) : "",
    name: String(body.name),
    code: body.code != null ? String(body.code) : undefined,
    unit: body.unit != null ? String(body.unit) : body.defaultUnit != null ? String(body.defaultUnit) : undefined,
    defaultQuantity: body.defaultQuantity != null ? Number(body.defaultQuantity) : undefined,
    standardCost: body.standardCost != null ? Number(body.standardCost) : undefined,
    laborCost: body.laborCost != null ? Number(body.laborCost) : undefined,
    standardSellPrice: body.standardSellPrice != null ? Number(body.standardSellPrice) : undefined,
    tags: parseTagsBody(body),
    memo: body.memo != null ? String(body.memo) : null,
    favorite: body.isFavorite !== undefined ? Boolean(body.isFavorite) : Boolean(body.favorite),
    active: body.active !== false,
    sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
  });
  res.status(201).json(item);
});

masterV1Router.patch("/work-items/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const item = updateMasterV1WorkItem(String(req.params.id), {
    categoryMain: body.categoryMain != null ? String(body.categoryMain) : body.category != null ? String(body.category) : undefined,
    categorySub: body.categorySub != null ? String(body.categorySub) : undefined,
    code: body.code != null ? String(body.code) : undefined,
    name: body.name != null ? String(body.name) : undefined,
    unit: body.unit != null ? String(body.unit) : body.defaultUnit != null ? String(body.defaultUnit) : undefined,
    defaultQuantity: body.defaultQuantity != null ? Number(body.defaultQuantity) : undefined,
    standardCost: body.standardCost != null ? Number(body.standardCost) : undefined,
    laborCost: body.laborCost != null ? Number(body.laborCost) : undefined,
    standardSellPrice: body.standardSellPrice != null ? Number(body.standardSellPrice) : undefined,
    tags: parseTagsBody(body),
    memo: body.memo !== undefined ? (body.memo != null ? String(body.memo) : null) : undefined,
    favorite: body.isFavorite !== undefined ? Boolean(body.isFavorite) : body.favorite !== undefined ? Boolean(body.favorite) : undefined,
    active: body.active !== undefined ? Boolean(body.active) : undefined,
    sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
  });
  if (!item) {
    res.status(404).json({ error: "work item not found" });
    return;
  }
  res.json(item);
});

masterV1Router.delete("/work-items/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  if (!deleteMasterV1WorkItem(String(req.params.id))) {
    res.status(404).json({ error: "work item not found" });
    return;
  }
  res.json({ ok: true });
});

// —— Materials ——

masterV1Router.get("/materials", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json({ materials: listMasterV1Materials(listOpts(req)) });
});

masterV1Router.post("/materials", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  if (!body.name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const categoryMain = body.categoryMain ?? body.category;
  if (!categoryMain) {
    res.status(400).json({ error: "categoryMain is required" });
    return;
  }
  const item = createMasterV1Material({
    categoryMain: String(categoryMain),
    categorySub: body.categorySub != null ? String(body.categorySub) : "",
    name: String(body.name),
    code: body.code != null ? String(body.code) : undefined,
    maker: body.maker != null ? String(body.maker) : null,
    model: body.model != null ? String(body.model) : null,
    supplier: body.supplier != null ? String(body.supplier) : null,
    unit: body.unit != null ? String(body.unit) : body.defaultUnit != null ? String(body.defaultUnit) : undefined,
    defaultQuantity: body.defaultQuantity != null ? Number(body.defaultQuantity) : undefined,
    cost: body.cost != null ? Number(body.cost) : undefined,
    standardSellPrice: body.standardSellPrice != null ? Number(body.standardSellPrice) : undefined,
    stockManaged: body.stockManaged !== undefined ? Boolean(body.stockManaged) : undefined,
    tags: parseTagsBody(body),
    memo: body.memo != null ? String(body.memo) : null,
    favorite: body.isFavorite !== undefined ? Boolean(body.isFavorite) : Boolean(body.favorite),
    active: body.active !== false,
    sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
  });
  res.status(201).json(item);
});

masterV1Router.patch("/materials/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const item = updateMasterV1Material(String(req.params.id), {
    categoryMain: body.categoryMain != null ? String(body.categoryMain) : body.category != null ? String(body.category) : undefined,
    categorySub: body.categorySub != null ? String(body.categorySub) : undefined,
    code: body.code != null ? String(body.code) : undefined,
    name: body.name != null ? String(body.name) : undefined,
    maker: body.maker !== undefined ? (body.maker != null ? String(body.maker) : null) : undefined,
    model: body.model !== undefined ? (body.model != null ? String(body.model) : null) : undefined,
    supplier: body.supplier !== undefined ? (body.supplier != null ? String(body.supplier) : null) : undefined,
    unit: body.unit != null ? String(body.unit) : body.defaultUnit != null ? String(body.defaultUnit) : undefined,
    defaultQuantity: body.defaultQuantity != null ? Number(body.defaultQuantity) : undefined,
    cost: body.cost != null ? Number(body.cost) : undefined,
    standardSellPrice: body.standardSellPrice != null ? Number(body.standardSellPrice) : undefined,
    stockManaged: body.stockManaged !== undefined ? Boolean(body.stockManaged) : undefined,
    tags: parseTagsBody(body),
    memo: body.memo !== undefined ? (body.memo != null ? String(body.memo) : null) : undefined,
    favorite: body.isFavorite !== undefined ? Boolean(body.isFavorite) : body.favorite !== undefined ? Boolean(body.favorite) : undefined,
    active: body.active !== undefined ? Boolean(body.active) : undefined,
    sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
  });
  if (!item) {
    res.status(404).json({ error: "material not found" });
    return;
  }
  res.json(item);
});

masterV1Router.delete("/materials/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  if (!deleteMasterV1Material(String(req.params.id))) {
    res.status(404).json({ error: "material not found" });
    return;
  }
  res.json({ ok: true });
});

// —— Customer prices ——

masterV1Router.get("/customer-prices", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const customerId = req.query.customerId as string | undefined;
  res.json({ prices: listMasterV1CustomerPrices({ customerId }) });
});

masterV1Router.post("/customer-prices", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  if (!body.customerId || !body.itemType || !body.itemId) {
    res.status(400).json({ error: "customerId, itemType, itemId are required" });
    return;
  }
  const item = createMasterV1CustomerPrice({
    customerId: String(body.customerId),
    itemType: body.itemType === "material" ? "material" : "work",
    itemId: String(body.itemId),
    unitPrice: Number(body.unitPrice) || 0,
    costPrice: Number(body.costPrice) || 0,
    memo: body.memo != null ? String(body.memo) : null,
  });
  res.status(201).json(item);
});

masterV1Router.patch("/customer-prices/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const item = updateMasterV1CustomerPrice(String(req.params.id), {
    customerId: body.customerId != null ? String(body.customerId) : undefined,
    itemType: body.itemType === "material" ? "material" : body.itemType === "work" ? "work" : undefined,
    itemId: body.itemId != null ? String(body.itemId) : undefined,
    unitPrice: body.unitPrice != null ? Number(body.unitPrice) : undefined,
    costPrice: body.costPrice != null ? Number(body.costPrice) : undefined,
    memo: body.memo !== undefined ? (body.memo != null ? String(body.memo) : null) : undefined,
  });
  if (!item) {
    res.status(404).json({ error: "customer price not found" });
    return;
  }
  res.json(item);
});

masterV1Router.delete("/customer-prices/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  if (!deleteMasterV1CustomerPrice(String(req.params.id))) {
    res.status(404).json({ error: "customer price not found" });
    return;
  }
  res.json({ ok: true });
});

// —— Symbol mappings ——

masterV1Router.get("/symbol-mappings", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json(listSymbolMappingSummary());
});

masterV1Router.post("/symbol-mappings", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  if (!body.symbolType || !body.label) {
    res.status(400).json({ error: "symbolType and label are required" });
    return;
  }
  const item = createMasterV1SymbolMapping({
    mappingKind: body.mappingKind === "line" ? "line" : "symbol",
    symbolType: String(body.symbolType),
    label: String(body.label),
    categoryMain: body.categoryMain != null ? String(body.categoryMain) : null,
    categorySub: body.categorySub != null ? String(body.categorySub) : null,
    workItemId: body.workItemId != null ? String(body.workItemId) : null,
    materialId: body.materialId != null ? String(body.materialId) : null,
    extraMaterialIds: parseExtraMaterialIds(body) ?? [],
    qtyPerUnit: body.qtyPerUnit != null ? Number(body.qtyPerUnit) : 1,
    memo: body.memo != null ? String(body.memo) : null,
    active: body.active !== false,
    sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
  });
  res.status(201).json(item);
});

masterV1Router.patch("/symbol-mappings/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const item = updateMasterV1SymbolMapping(String(req.params.id), {
    mappingKind: body.mappingKind === "line" ? "line" : body.mappingKind === "symbol" ? "symbol" : undefined,
    symbolType: body.symbolType != null ? String(body.symbolType) : undefined,
    label: body.label != null ? String(body.label) : undefined,
    categoryMain: body.categoryMain !== undefined ? (body.categoryMain != null ? String(body.categoryMain) : null) : undefined,
    categorySub: body.categorySub !== undefined ? (body.categorySub != null ? String(body.categorySub) : null) : undefined,
    workItemId: body.workItemId !== undefined ? (body.workItemId != null ? String(body.workItemId) : null) : undefined,
    materialId: body.materialId !== undefined ? (body.materialId != null ? String(body.materialId) : null) : undefined,
    extraMaterialIds: parseExtraMaterialIds(body),
    qtyPerUnit: body.qtyPerUnit != null ? Number(body.qtyPerUnit) : undefined,
    memo: body.memo !== undefined ? (body.memo != null ? String(body.memo) : null) : undefined,
    active: body.active !== undefined ? Boolean(body.active) : undefined,
    sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
  });
  if (!item) {
    res.status(404).json({ error: "symbol mapping not found" });
    return;
  }
  res.json(item);
});

masterV1Router.delete("/symbol-mappings/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  if (!deleteMasterV1SymbolMapping(String(req.params.id))) {
    res.status(404).json({ error: "symbol mapping not found" });
    return;
  }
  res.json({ ok: true });
});

// —— Estimate preview ——

masterV1Router.get("/estimate-preview", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const sketchId = String(req.query.sketchId || "");
  const customerId = req.query.customerId ? String(req.query.customerId) : null;
  if (!sketchId) {
    res.status(400).json({ error: "sketchId is required" });
    return;
  }
  const preview = buildEstimatePreviewBySketchId(sketchId, customerId);
  if (!preview) {
    res.status(404).json({ error: "sketch not found" });
    return;
  }
  res.json(preview);
});

masterV1Router.post("/estimate-preview", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as {
    sketchId?: string;
    projectId?: string;
    customerId?: string | null;
    layers?: SurveyDrawingAiExportV1;
  };
  const preview = buildEstimatePreviewFromLayers(body);
  if (!preview) {
    res.status(400).json({ error: "sketchId or layers is required" });
    return;
  }
  res.json(preview);
});

masterV1Router.post("/estimate-preview/apply", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as {
    sketchId?: string;
    projectId?: string;
    customerId?: string | null;
    layers?: SurveyDrawingAiExportV1;
    preview?: ReturnType<typeof buildEstimatePreviewFromLayers>;
  };
  let preview = body.preview ?? null;
  if (!preview) {
    preview = buildEstimatePreviewFromLayers(body);
  }
  if (!preview) {
    res.status(400).json({ error: "preview data is required" });
    return;
  }
  const draft = saveMasterV1EstimateDraft({
    projectId: body.projectId ?? preview.projectId,
    sketchId: body.sketchId ?? preview.sketchId,
    customerId: body.customerId ?? preview.customerId,
    preview,
  });
  res.status(201).json({ draft });
});

masterV1Router.get("/estimate-drafts/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const draft = getMasterV1EstimateDraft(String(req.params.id));
  if (!draft) {
    res.status(404).json({ error: "draft not found" });
    return;
  }
  res.json({
    draft,
    pricingSummary: summarizeMasterPreviewPricing(draft.preview),
  });
});

masterV1Router.get("/estimate-drafts/by-sketch/:sketchId", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const draft = getLatestMasterV1EstimateDraftBySketch(String(req.params.sketchId));
  if (!draft) {
    res.status(404).json({ error: "draft not found" });
    return;
  }
  res.json({
    draft,
    pricingSummary: summarizeMasterPreviewPricing(draft.preview),
  });
});

masterV1Router.post("/estimate-drafts/:id/apply-to-estimate", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    const detail = createEstimateFromMasterDraftV1(String(req.params.id), req.admin?.username);
    res.status(201).json({
      draft: getMasterV1EstimateDraft(String(req.params.id)),
      detail,
      businessProjectId: detail.businessProjectId,
      estimateUrl: `/estimate-v1?project=${encodeURIComponent(detail.businessProjectId)}&masterDraftId=${encodeURIComponent(String(req.params.id))}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "apply failed";
    const status = msg === "master draft not found" ? 404 : 400;
    res.status(status).json({ error: msg });
  }
});

masterV1Router.post("/categories/reorder", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as { orders?: Array<{ id: string; sortOrder: number }> };
  const orders = Array.isArray(body.orders) ? body.orders : [];
  if (!orders.length) {
    res.status(400).json({ error: "orders are required" });
    return;
  }
  const updated = reorderMasterV1Categories(
    orders.map((o) => ({ id: String(o.id), sortOrder: Number(o.sortOrder) || 0 }))
  );
  res.json({ updated, categories: listMasterV1Categories({ activeOnly: false }) });
});

// —— CSV ——

masterV1Router.get("/csv/:entity", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const entity = String(req.params.entity) as MasterV1Entity;
  const csv = exportMasterV1Csv(entity);
  res.type("text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="master-v1-${entity}.csv"`);
  res.send("\uFEFF" + csv);
});

masterV1Router.post("/csv/:entity/import", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const entity = String(req.params.entity) as MasterV1Entity;
  const body = req.body as { csv?: string };
  if (!body.csv) {
    res.status(400).json({ error: "csv text is required" });
    return;
  }
  res.json(importMasterV1Csv(entity, body.csv));
});

// —— Bulk update ——

masterV1Router.post("/bulk-update", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as { entity?: string; ids?: string[]; patch?: Record<string, unknown> };
  const entity = body.entity;
  if (entity !== "customers" && entity !== "work-items" && entity !== "materials") {
    res.status(400).json({ error: "entity must be customers, work-items, or materials" });
    return;
  }
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
  if (!ids.length) {
    res.status(400).json({ error: "ids are required" });
    return;
  }
  const updated = bulkUpdateMasterV1(entity, ids, body.patch ?? {});
  res.json({ updated, total: ids.length });
});

// —— Storage provider ——

masterV1Router.get("/storage-providers", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json({
    kinds: STORAGE_PROVIDER_KINDS,
    default: "local",
  });
});

masterV1Router.post("/storage-providers/test", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as { kind?: StorageProviderKind; config?: Record<string, unknown> };
  const kind = (body.kind || "local") as StorageProviderKind;
  const provider =
    kind === "local"
      ? getDefaultStorageProvider("local")
      : createStorageProvider({
          kind,
          webdavUrl: body.config?.webdavUrl != null ? String(body.config.webdavUrl) : undefined,
          host: body.config?.host != null ? String(body.config.host) : undefined,
          port: body.config?.port != null ? Number(body.config.port) : undefined,
          shareName: body.config?.shareName != null ? String(body.config.shareName) : undefined,
          username: body.config?.username != null ? String(body.config.username) : undefined,
          password: body.config?.password != null ? String(body.config.password) : undefined,
        });
  const result = await provider.testConnection();
  res.json(result);
});
