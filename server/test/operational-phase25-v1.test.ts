import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-operational-phase25";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-operational-phase25.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { shareIdFromRef, buildCustomerDocumentViewV1 } = await import(
  "../src/shared/customer/customer-portal-data-v1.js"
);
const { buildCustomerDocumentUrlV1 } = await import(
  "../src/shared/routes/tisly-routes-v1.js"
);
const { sanitizeSharePayloadTextV1 } = await import(
  "../src/knowledge/knowledge-customer-share-filter-v1.js"
);
const { getCustomerPortalStatsV1 } = await import(
  "../src/shared/customer/customer-data-service-v1.js"
);

const app = createApp();
const publicDir = path.join(process.cwd(), "public");
const DEMO_SHARE = shareIdFromRef("DEMO-HOME-001");

describe("Operational Phase25 — PDF API", () => {
  it("ensure demo PDF documents exist", () => {
    const stats = getCustomerPortalStatsV1();
    assert.ok(stats.documentCount >= 3);
  });

  for (const docType of ["estimate", "invoice", "completion"] as const) {
    it(`file API returns 200 for doc-${docType}`, async () => {
      const res = await request(app).get(
        `/api/customer-portal/v1/file/${DEMO_SHARE}/doc-${docType}`
      );
      assert.equal(res.status, 200);
      assert.match(res.headers["content-type"] || "", /pdf|octet-stream/i);
    });
  }

  it("document API resolves docType query", async () => {
    const res = await request(app).get(
      `/api/customer-portal/v1/document/${DEMO_SHARE}?docType=estimate`
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.equal(res.body.fileId, "doc-estimate");
    assert.ok(res.body.previewUrl?.includes("/api/customer-portal/v1/file/"));
    assert.match(res.body.backUrl, /^\/customer\/project\//);
  });

  it("buildCustomerDocumentViewV1 backUrl is fixed project URL", () => {
    const view = buildCustomerDocumentViewV1(DEMO_SHARE, { docType: "estimate" });
    assert.ok(view);
    assert.match(view?.backUrl || "", /^\/customer\/project\//);
    assert.equal(view?.status, "ok");
  });

  it("project documents link to customer document viewer", async () => {
    const res = await request(app).get(`/api/customer-portal/v1/project/${DEMO_SHARE}`);
    assert.equal(res.status, 200);
    const estimate = res.body.documents?.find((d: { kind: string }) => d.kind === "estimate");
    assert.ok(estimate);
    assert.match(estimate.openUrl, /^\/customer\/document\//);
    assert.match(estimate.openUrl, /docType=estimate/);
  });
});

describe("Operational Phase25 — mojibake sanitize", () => {
  it("sanitizeSharePayloadTextV1 strips corrupt question marks", () => {
    assert.equal(sanitizeSharePayloadTextV1("???????", "未設定"), "未設定");
    assert.equal(sanitizeSharePayloadTextV1("LAN????設備", "LAN設備"), "LAN設備");
  });
});

describe("Operational Phase25 — customer document UI", () => {
  it("customer-document JS uses PDFを見る and fixed back", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/customer-document-v1.js"), "utf-8");
    assert.match(js, /CUSTOMER_DOCUMENT_ACTIONS\.pdfView/);
    assert.match(js, /goProjectBack/);
    assert.doesNotMatch(js, /history\.back/);
    assert.match(js, /書類を準備中です/);
    assert.match(js, /TOMSへご連絡/);
  });

  it("document URL builder supports docType", () => {
    const url = buildCustomerDocumentUrlV1(DEMO_SHARE, { docType: "invoice" });
    assert.match(url, /docType=invoice/);
  });

  for (const docType of ["completion", "estimate", "invoice"]) {
    it(`/customer/document/${docType} route returns 200`, async () => {
      const res = await request(app).get(
        `/customer/document/${DEMO_SHARE}?docType=${docType}`
      );
      assert.equal(res.status, 200);
      assert.doesNotMatch(res.text, /href="\/app"/);
    });
  }
});

after(async () => {
  await closeDatabase();
});
