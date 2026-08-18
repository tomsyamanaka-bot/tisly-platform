/**
 * 価格・原価マスター API
 * GET /api/price-cost-master/v1
 * GET /api/price-cost-master/v1/catalog
 * POST /api/price-cost-master/v1/items
 * PATCH /api/price-cost-master/v1/items/:id
 */

import { Router } from "express";
import { requireAuth } from "../../auth/auth-middleware.js";
import {
  enrichPriceCostItemV1,
  parsePriceCostTabV1,
  queryPriceCostMasterV1,
} from "../../price-cost-master/price-cost-master-v1.js";
import {
  createPriceCostMasterItemV1,
  updatePriceCostMasterItemV1,
} from "../../price-cost-master/price-cost-master-store-v1.js";
import { TISLY_UNIFIED_GENRES_V1 } from "../../shared/genres/tisly-genres-v1.js";

export const priceCostMasterV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

priceCostMasterV1Router.get("/", ...auth, (req, res) => {
  const catalog = queryPriceCostMasterV1({
    tab: parsePriceCostTabV1(req.query.tab),
    q: String(req.query.q ?? ""),
    category: String(req.query.category ?? ""),
    genre: String(req.query.genre ?? ""),
  });
  res.json({
    ok: true,
    uiPath: "/price-cost-master-v1",
    ...catalog,
  });
});

priceCostMasterV1Router.get("/catalog", ...auth, (req, res) => {
  const catalog = queryPriceCostMasterV1({
    tab: parsePriceCostTabV1(req.query.tab),
    q: String(req.query.q ?? ""),
    category: String(req.query.category ?? ""),
    genre: String(req.query.genre ?? ""),
  });
  res.json({
    ok: true,
    uiPath: "/price-cost-master-v1",
    ...catalog,
  });
});

priceCostMasterV1Router.get("/genres", ...auth, (_req, res) => {
  res.json({
    ok: true,
    genres: [...TISLY_UNIFIED_GENRES_V1],
  });
});

priceCostMasterV1Router.post("/items", ...auth, (req, res) => {
  try {
    const item = enrichPriceCostItemV1(
      createPriceCostMasterItemV1(req.body ?? {})
    );
    res.status(201).json({ ok: true, item });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

priceCostMasterV1Router.patch("/items/:id", ...auth, (req, res) => {
  try {
    const item = enrichPriceCostItemV1(
      updatePriceCostMasterItemV1(
        String(req.params.id ?? ""),
        req.body ?? {}
      )
    );
    res.json({ ok: true, item });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    const status = message === "item not found" ? 404 : 400;
    res.status(status).json({ ok: false, error: message });
  }
});
