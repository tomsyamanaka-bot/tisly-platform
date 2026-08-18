/**
 * 価格・原価マスター API
 * GET /api/price-cost-master/v1
 * GET /api/price-cost-master/v1/catalog
 */

import { Router } from "express";
import { requireAuth } from "../../auth/auth-middleware.js";
import {
  parsePriceCostTabV1,
  queryPriceCostMasterV1,
} from "../../price-cost-master/price-cost-master-v1.js";

export const priceCostMasterV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

priceCostMasterV1Router.get("/", ...auth, (req, res) => {
  const catalog = queryPriceCostMasterV1({
    tab: parsePriceCostTabV1(req.query.tab),
    q: String(req.query.q ?? ""),
    category: String(req.query.category ?? ""),
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
  });
  res.json({
    ok: true,
    uiPath: "/price-cost-master-v1",
    ...catalog,
  });
});
