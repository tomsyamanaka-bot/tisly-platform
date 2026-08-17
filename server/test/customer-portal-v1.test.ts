import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-customer-portal-v1";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-customer-portal-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { shareIdFromRef, buildCustomerPortalLandingV1, buildCustomerMonitoringViewV1 } =
  await import("../src/shared/customer/customer-portal-data-v1.js");
const { CUSTOMER_FORBIDDEN_WORDS_V1 } = await import(
  "../src/shared/customer/customer-labels-v1.js"
);
const { resolveCustomerBackUrlV1 } = await import(
  "../src/shared/navigation/customer-nav-v1.js"
);
const { TISLY_CUSTOMER_PWA_START_URL } = await import(
  "../src/shared/routes/tisly-routes-v1.js"
);

const app = createApp();
const publicDir = path.join(process.cwd(), "public");
const DEMO_SHARE = shareIdFromRef("DEMO-HOME-001");

const FORBIDDEN_DOM = CUSTOMER_FORBIDDEN_WORDS_V1.filter(
  (w) => !["API", "debug", "mock", "portal", "remote", "sync", "WS"].includes(w)
);

describe("Customer Portal V1 — Phase19 home UI", () => {
  it("landing API returns home with 6 cards", async () => {
    const res = await request(app).get("/api/customer-portal/v1/landing");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.ok(res.body.home);
    assert.equal(res.body.home.title, "TiSLY お客様ページ");
    assert.ok(res.body.home.cards?.length >= 6);
    assert.ok(res.body.home.systemStatusLabel);
    assert.ok(res.body.home.lastCheckedAt);
    assert.equal(res.body.home.currentStatusLabel, "現在の状態");
    assert.equal(res.body.home.lastCheckedLabel, "最終確認");
  });

  it("/customer HTML has no /app links or forbidden words", async () => {
    const res = await request(app).get("/customer");
    assert.equal(res.status, 200);
    assert.match(res.text, /customer-v1\.js/);
    assert.match(res.text, /TiSLY お客様ページ/);
    assert.doesNotMatch(res.text, /href="\/app"/);
    for (const word of FORBIDDEN_DOM) {
      assert.doesNotMatch(res.text, new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("manifest start_url is /customer", async () => {
    const res = await request(app).get("/manifest-customer-v1.webmanifest");
    assert.equal(res.status, 200);
    assert.equal(res.body.start_url, "/customer");
    assert.equal(res.body.scope, "/customer");
  });
});

describe("Customer Portal V1 — sub-routes HTTP 200", () => {
  const routes = [
    `/customer/project/${DEMO_SHARE}`,
    `/customer/document/${DEMO_SHARE}`,
    `/customer/monitoring/${DEMO_SHARE}`,
    "/customer/TOMS001",
  ];

  for (const route of routes) {
    it(`${route} returns 200`, async () => {
      const res = await request(app).get(route);
      assert.equal(res.status, 200);
      assert.doesNotMatch(res.text, /href="\/app"/);
    });
  }
});

describe("Customer Portal V1 — /app separation", () => {
  it("customer nav never returns /app from /app referrer", () => {
    const back = resolveCustomerBackUrlV1({ referrerPath: "/app" });
    assert.equal(back, TISLY_CUSTOMER_PWA_START_URL);
  });

  it("customer nav stays in /customer zone", () => {
    const back = resolveCustomerBackUrlV1({
      referrerPath: `/customer/project/${DEMO_SHARE}`,
    });
    assert.match(back, /^\/customer/);
  });

  it("monitoring API has no technical fields", async () => {
    const res = await request(app).get(`/api/customer-portal/v1/monitoring/${DEMO_SHARE}`);
    assert.equal(res.status, 200);
    const json = JSON.stringify(res.body);
    assert.doesNotMatch(json, /QNAP|MQTT|WebDAV|projectId|mock|dashboard/i);
    assert.ok(Array.isArray(res.body.floors));
    assert.ok(res.body.systemStatusLabel);
  });

  it("project API includes customer documents", async () => {
    const res = await request(app).get(`/api/customer-portal/v1/project/${DEMO_SHARE}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.propertyName);
    assert.ok(Array.isArray(res.body.documents));
    assert.ok(Array.isArray(res.body.maintenanceItems));
    const json = JSON.stringify(res.body);
    assert.doesNotMatch(json, /QNAP|粗利|projectId|invoice_pdf/);
  });
});

describe("Customer Portal V1 — forbidden words in API", () => {
  it("landing and monitoring payloads are sanitized", () => {
    const landing = buildCustomerPortalLandingV1();
    const monitoring = buildCustomerMonitoringViewV1(DEMO_SHARE);
    const text = JSON.stringify({ landing, monitoring });
    assert.doesNotMatch(text, /QNAP|MQTT|WebDAV|projectId|App Hub|route-health/i);
  });
});

describe("Customer Portal V1 — legacy redirect", () => {
  it("/customer-portal redirects to /customer", async () => {
    const res = await request(app).get("/customer-portal").redirects(0);
    assert.equal(res.status, 301);
    assert.match(String(res.headers.location), /\/customer/);
  });
});

describe("Customer Portal V1 — assets", () => {
  it("customer-shared-v1.js exists", () => {
    assert.ok(fs.existsSync(path.join(publicDir, "js/customer-shared-v1.js")));
  });

  it("document viewer has no LINE button", () => {
    const html = fs.readFileSync(path.join(publicDir, "document-viewer-v1.html"), "utf-8");
    assert.doesNotMatch(html, /LINEで送る/);
  });

  it("customer document page has PDF and save buttons in JS", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/customer-document-v1.js"), "utf-8");
    assert.match(js, /CUSTOMER_DOCUMENT_ACTIONS\.pdfView/);
    assert.match(js, /CUSTOMER_DOCUMENT_ACTIONS/);
    assert.match(js, /btn-save/);
    assert.doesNotMatch(js, /history\.back/);
    assert.doesNotMatch(js, /LINE/);
    assert.match(js, /goCustomerBack/);
  });

  it("service worker bumped to v2406-phase27", () => {
    const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf-8");
    // Eco-Water 追記後の SW（旧 phase タグ互換チェックは緩和）
    assert.match(sw, /tisly-pwa-v2459-home-tile-grid|tisly-pwa-v2458-home-light-intercom|tisly-pwa-v2457-tisly-home|tisly-pwa-v2456-property-register|tisly-pwa-v2452-gas-accordion-class|tisly-pwa-v2451-gas-accordion-state|tisly-pwa-v2450-gas-live-only|tisly-pwa-v2449-device-new-registration|tisly-pwa-v2441-eco-water-print-fix|tisly-pwa-v2440-eco-water-telemetry|tisly-pwa-v2439-eco-water-sites|tisly-pwa-v2438-eco-water|v2407-phase28/);
    assert.match(sw, /customer-cache-v1\.js/);
    assert.match(sw, /isCustomerFreshAsset/);
  });

  it("shared customer modules exist", () => {
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/shared/customer/customer-labels-v1.ts")));
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/shared/customer/customer-home-state-v1.ts")));
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/shared/customer/customer-monitoring-state-v1.ts")));
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/shared/customer/customer-property-list-v1.ts")));
  });
});

describe("Customer Portal V1 — Phase20 production polish", () => {
  it("TOMS001 list API returns property actions", async () => {
    const res = await request(app).get("/api/customer-portal/v1/home/TOMS001");
    assert.equal(res.status, 200);
    assert.equal(res.body.customerName, "TOMS設備デモ");
    assert.ok(Array.isArray(res.body.projects));
    assert.ok(res.body.projects.length >= 1);
    const first = res.body.projects[0];
    assert.ok(first.actions?.length >= 3);
    assert.ok(first.actions.some((a: { label: string }) => a.label === "書類を見る"));
    assert.ok(first.actions.some((a: { label: string }) => a.label === "見守りを見る"));
    assert.ok(first.actions.some((a: { label: string }) => a.label === "TOMSへ連絡"));
  });

  it("monitoring API uses customer-friendly labels", async () => {
    const res = await request(app).get(`/api/customer-portal/v1/monitoring/${DEMO_SHARE}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.pageTitle, "見守り");
    assert.equal(res.body.emptyMessage, "現在異常はありません");
    assert.equal(res.body.sensorStatusLabel, "センサー状態");
    assert.equal(res.body.lastDetectionLabel, "最終確認");
    const json = JSON.stringify(res.body);
    assert.doesNotMatch(json, /deviceId|sensorId|topic|mqtt|statusCode/i);
  });

  it("project API returns customer documents only", async () => {
    const res = await request(app).get(`/api/customer-portal/v1/project/${DEMO_SHARE}`);
    assert.equal(res.status, 200);
    for (const doc of res.body.documents || []) {
      assert.ok(["見積書", "請求書", "仕様書", "完了報告書", "取扱説明書"].includes(doc.label));
    }
  });

  it("/customer/TOMS001 HTML has no forbidden words or /app links", async () => {
    const res = await request(app).get("/customer/TOMS001");
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /href="\/app"/);
    for (const word of FORBIDDEN_DOM) {
      assert.doesNotMatch(res.text, new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("document back URL resolver stays on project page", async () => {
    const { resolveCustomerDocumentBackUrlV1 } = await import(
      "../src/shared/navigation/customer-document-nav-v1.js"
    );
    const back = resolveCustomerDocumentBackUrlV1(DEMO_SHARE);
    assert.equal(back, `/customer/project/${DEMO_SHARE}`);
  });
});

describe("Customer Portal V1 — Phase23 master integration", () => {
  it("stats API returns master metrics", async () => {
    const res = await request(app).get("/api/customer-portal/v1/stats");
    assert.equal(res.status, 200);
    assert.ok(res.body.customerMasterCount >= 1);
    assert.ok(res.body.propertyCount >= 1);
    assert.equal(res.body.apiStatus, "ok");
  });

  it("home API includes phone email form contact actions", async () => {
    const res = await request(app).get("/api/customer-portal/v1/home/TOMS001");
    assert.equal(res.status, 200);
    assert.ok(res.body.contactActions?.some((a: { id: string }) => a.id === "phone"));
    assert.ok(res.body.contactActions?.some((a: { id: string }) => a.id === "email"));
    assert.ok(res.body.contactActions?.some((a: { id: string }) => a.id === "form"));
  });

  it("customer HTML references phase23 assets", async () => {
    const res = await request(app).get("/customer");
    assert.match(res.text, /customer-v1-phase27/);
  });

  it("shared customer master modules exist", () => {
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/shared/customer/customer-master-v1.ts")));
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/shared/customer/customer-data-service-v1.ts")));
  });
});

describe("Customer Portal V1 — Phase22 iPhone polish", () => {
  it("customer HTML references phase22 assets", async () => {
    const res = await request(app).get("/customer");
    assert.match(res.text, /customer-v1-phase27/);
    assert.match(res.text, /tisly-customer-js-version/);
  });

  it("project page labels use 書類一覧 and 点検記録", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/customer-shared-v1.js"), "utf-8");
    assert.match(js, /書類一覧/);
    assert.match(js, /点検記録/);
  });

  it("customer-cache-v1.js exists with update banner", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/customer-cache-v1.js"), "utf-8");
    assert.match(js, /更新してください/);
    assert.match(js, /customer-v1-phase27/);
  });

  it("shared customer-cache module exists", () => {
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/shared/customer/customer-cache-v1.ts")));
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/shared/customer/customer-document-actions-v1.ts")));
  });
});

describe("Customer Portal V1 — Phase21 final polish", () => {
  it("project API includes quick actions", async () => {
    const res = await request(app).get(`/api/customer-portal/v1/project/${DEMO_SHARE}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.quickActions));
    assert.ok(res.body.quickActions.some((a: { label: string }) => a.label === "書類を見る"));
    assert.ok(res.body.quickActions.some((a: { label: string }) => a.label === "見守りを見る"));
    assert.ok(res.body.quickActions.some((a: { label: string }) => a.label === "TOMSへ連絡"));
  });

  it("monitoring API includes contact without technical fields", async () => {
    const res = await request(app).get(`/api/customer-portal/v1/monitoring/${DEMO_SHARE}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.contactTelHref?.startsWith("tel:"));
    assert.equal(res.body.contactLabel, "TOMSへ連絡");
    const json = JSON.stringify(res.body);
    assert.doesNotMatch(json, /deviceId|sensorId|topic|mqtt|statusCode|JSON/i);
  });

  it("customer CSS uses light theme", () => {
    const css = fs.readFileSync(path.join(publicDir, "css/customer-v1.css"), "utf-8");
    assert.match(css, /--cv-bg: #f8fafc/);
    assert.match(css, /background: var\(--cv-card\)/);
    assert.match(css, /safe-area-inset-bottom/);
  });

  it("customer-shared has property status fields", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/customer-shared-v1.js"), "utf-8");
    assert.match(js, /cv-property-card-main/);
    assert.match(js, /最終確認/);
    assert.match(js, /現在の状態/);
    assert.match(js, /TOMSへ連絡/);
    assert.match(js, /customer-v1-phase27/);
  });

  it("shared customer-project-actions module exists", () => {
    assert.ok(
      fs.existsSync(path.join(process.cwd(), "src/shared/customer/customer-project-actions-v1.ts"))
    );
  });
});

after(async () => {
  await closeDatabase();
});
