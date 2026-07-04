import { describe, it, before, after } from "node:test";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-knowledge-module-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-knowledge-module-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();
const publicDir = path.resolve("public");

describe("knowledge-module-v1 PWA", () => {
  before(() => {});

  after(async () => {
    await closeDatabase();
  });

  it("GET /knowledge-module-v1 returns HTML shell", async () => {
    const res = await request(app).get("/knowledge-module-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /id="kn-root"/);
    assert.match(res.text, /knowledge-module\.bundle\.js/);
    assert.match(res.text, /knowledge-module-v1-nav\.js/);
    assert.match(res.text, /tisly-practical-nav\.css/);
  });

  it("bundle includes required mock entries and genre tabs", () => {
    const bundlePath = path.join(
      publicDir,
      "js/features/knowledge/knowledge-module.bundle.js"
    );
    assert.ok(fs.existsSync(bundlePath), "bundle must exist — run npm run build:knowledge-module");
    const src = fs.readFileSync(bundlePath, "utf8");
    assert.match(src, /kn-mock-cola-silo/);
    assert.match(src, /kn-mock-belt-tape/);
    assert.match(src, /kn-mock-rp2350-poe/);
    assert.match(src, /kn-mock-plc-self-hold/);
    assert.match(src, /RP2350-POE-ETH-8DI-8RO/);
    assert.match(src, /kn-genre-tab/);
    assert.match(src, /data-genre/);
    assert.match(src, /kn-genre-tabs/);
    const mockPath = path.join(publicDir, "js/features/knowledge/data/mockKnowledge.ts");
    const mockSrc = fs.readFileSync(mockPath, "utf8");
    assert.match(mockSrc, /防犯カメラ/);
    assert.match(mockSrc, /セキュリティー/);
    assert.match(mockSrc, /TV工事/);
    assert.match(mockSrc, /空調/);
  });

  it("TSX source files exist under features/knowledge", () => {
    const base = path.join(publicDir, "js/features/knowledge");
    assert.ok(fs.existsSync(path.join(base, "components/SearchBar.tsx")));
    assert.ok(fs.existsSync(path.join(base, "components/KnowledgeCard.tsx")));
    assert.ok(fs.existsSync(path.join(base, "pages/index.tsx")));
  });
});
