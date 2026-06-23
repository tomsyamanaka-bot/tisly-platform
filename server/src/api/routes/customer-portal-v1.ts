import { Router } from "express";
import {
  buildCustomerPortalLandingV1,
  buildCustomerHomeListViewV1,
  buildCustomerHomeByShareIdV1,
  buildCustomerProjectViewV1,
  buildCustomerDocumentViewV1,
  buildCustomerMonitoringViewV1,
} from "../../shared/customer/customer-portal-data-v1.js";
import {
  TISLY_LEGACY_REDIRECTS_V1,
  TISLY_INTERNAL_ROUTES_V1,
  TISLY_CUSTOMER_ROUTES_V1,
} from "../../shared/routes/tisly-routes-v1.js";

export const customerPortalV1Router = Router();

customerPortalV1Router.get("/landing", (_req, res) => {
  res.json({ status: "ok", ...buildCustomerPortalLandingV1() });
});

customerPortalV1Router.get("/home/:customerCode", (req, res) => {
  const data = buildCustomerHomeListViewV1(String(req.params.customerCode));
  res.json({ status: "ok", ...data });
});

customerPortalV1Router.get("/home-by-share/:shareId", (req, res) => {
  const data = buildCustomerHomeByShareIdV1(String(req.params.shareId));
  if (!data) {
    res.status(404).json({ status: "error", error: "物件が見つかりません" });
    return;
  }
  res.json({ status: "ok", ...data });
});

customerPortalV1Router.get("/project/:shareId", (req, res) => {
  const data = buildCustomerProjectViewV1(String(req.params.shareId));
  if (!data) {
    res.status(404).json({ status: "error", error: "案件が見つかりません" });
    return;
  }
  res.json({ status: "ok", ...data });
});

customerPortalV1Router.get("/document/:shareId", (req, res) => {
  const fileId = typeof req.query.fileId === "string" ? req.query.fileId : undefined;
  const data = buildCustomerDocumentViewV1(String(req.params.shareId), fileId);
  if (!data) {
    res.status(404).json({ status: "error", error: "資料が見つかりません" });
    return;
  }
  res.json({ status: "ok", ...data });
});

customerPortalV1Router.get("/monitoring/:shareId", (req, res) => {
  const data = buildCustomerMonitoringViewV1(String(req.params.shareId));
  if (!data) {
    res.status(404).json({ status: "error", error: "監視画面が見つかりません" });
    return;
  }
  res.json({ status: "ok", ...data });
});

customerPortalV1Router.get("/route-contract", (_req, res) => {
  res.json({
    status: "ok",
    internalRoutes: TISLY_INTERNAL_ROUTES_V1,
    customerRoutes: TISLY_CUSTOMER_ROUTES_V1,
    legacyRedirects: TISLY_LEGACY_REDIRECTS_V1,
    separation: {
      internalPrefix: "/app",
      customerPrefix: "/customer",
      crossNavigationBlocked: true,
    },
  });
});
