import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-route-contract-p27";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-route-contract-p27.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { TISLY_LEGACY_REDIRECTS_V1 } = await import("../src/shared/routes/tisly-routes-v1.js");
const { CUSTOMER_JS_VERSION_V1, CUSTOMER_SW_TOKEN_V1 } = await import(
  "../src/shared/customer/customer-cache-v1.js"
);

const app = createApp();
const publicDir = path.join(process.cwd(), "public");

after(async () => {
  await closeDatabase();
});

const PHASE27_ROUTES = [
  "/app",
  "/schedule-v1",
  "/survey-v1",
  "/survey-drawing-v1",
  "/estimate-v1",
  "/estimate-v1?tab=invoice",
  "/projects-v1",
  "/field-checklist-v1",
  "/field-check-v1",
  "/field-check-v1?tab=orders",
  "/project-dashboard-v1",
  "/document-center-v1",
  "/customer",
  "/route-health",
];

describe("route-contract-phase27-v1 — stable URLs", () => {
  for (const p of PHASE27_ROUTES) {
    it(`${p} returns 200`, async () => {
      const res = await request(app).get(p);
      assert.equal(res.status, 200, `${p} should be 200`);
    });
  }

  for (const r of TISLY_LEGACY_REDIRECTS_V1) {
    it(`${r.from} → 301 ${r.to}`, async () => {
      const res = await request(app).get(r.from).redirects(0);
      assert.equal(res.status, 301);
      assert.ok(String(res.headers.location).includes(r.to.split("?")[0]));
    });
  }
});

describe("route-contract-phase27-v1 — phase27 assets", () => {
  it("SW and customer JS version phase27", () => {
    const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf-8");
    assert.equal(CUSTOMER_SW_TOKEN_V1, "v2407-phase28");
    assert.equal(CUSTOMER_JS_VERSION_V1, "customer-v1-phase27");
    assert.ok(sw.includes(CUSTOMER_SW_TOKEN_V1));
  });

  it("no history.go in public JS (except route-health detector)", () => {
    const jsDir = path.join(publicDir, "js");
    const skip = new Set(["route-health.js"]);
    const files = fs.readdirSync(jsDir).filter((f) => f.endsWith(".js") && !skip.has(f));
    for (const f of files) {
      const content = fs.readFileSync(path.join(jsDir, f), "utf-8");
      assert.doesNotMatch(content, /history\.go\(/, `${f} must not use history.go`);
    }
  });

  it("route-health includes Phase27 diagnostics", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/route-health.js"), "utf-8");
    assert.ok(js.includes("checkPhase27NavigationAndShare"));
    assert.ok(js.includes("navigationStackDiagnostics"));
  });
});
