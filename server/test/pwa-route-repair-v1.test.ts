import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-pwa-route-repair";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-pwa-route-repair-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("PWA Route Repair Phase1", () => {
  it("legacy /estimate redirects to /estimate-v1", async () => {
    const res = await request(app).get("/estimate").redirects(0);
    assert.equal(res.status, 301);
    assert.match(String(res.headers.location), /\/estimate-v1/);
  });

  it("legacy /invoice redirects to /estimate-v1 with tab=invoice", async () => {
    const res = await request(app).get("/invoice").redirects(0);
    assert.equal(res.status, 301);
    assert.match(String(res.headers.location), /\/estimate-v1/);
    assert.match(String(res.headers.location), /tab=invoice/);
  });

  it("legacy /drawing-editor redirects to /survey-drawing-v1", async () => {
    const res = await request(app).get("/drawing-editor").redirects(0);
    assert.equal(res.status, 301);
    assert.match(String(res.headers.location), /\/survey-drawing-v1/);
    const ok = await request(app).get("/survey-drawing-v1");
    assert.equal(ok.status, 200);
  });

  it("legacy /survey redirects to /survey-v1", async () => {
    const res = await request(app).get("/survey").redirects(0);
    assert.equal(res.status, 301);
    assert.match(String(res.headers.location), /\/survey-v1/);
  });

  it("legacy /projects redirects to /projects-v1", async () => {
    const res = await request(app).get("/projects").redirects(0);
    assert.equal(res.status, 301);
    assert.match(String(res.headers.location), /\/projects-v1/);
  });

  it("legacy /materials redirects to /field-check-v1", async () => {
    const res = await request(app).get("/materials").redirects(0);
    assert.equal(res.status, 301);
    assert.match(String(res.headers.location), /\/field-check-v1/);
  });

  it("GET /route-health serves diagnostic page", async () => {
    const res = await request(app).get("/route-health");
    assert.equal(res.status, 200);
    assert.match(res.text, /Route Health/);
  });

  it("GET /route-map lists redirects", async () => {
    const res = await request(app).get("/route-map");
    assert.equal(res.status, 200);
    assert.match(res.text, /301/);
    assert.match(res.text, /route-health/);
  });

  it("canonical practical routes return 200", async () => {
    for (const path of ["/estimate-v1", "/survey-v1", "/projects-v1", "/field-check-v1"]) {
      const res = await request(app).get(path);
      assert.equal(res.status, 200, path);
    }
  });
});

after(async () => {
  await closeDatabase();
});
