import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-neon-dark-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-neon-dark-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");

const publicDir = path.join(process.cwd(), "public");

function read(rel: string) {
  return fs.readFileSync(path.join(publicDir, rel), "utf-8");
}

describe("Neon Dark Mode UI v1", () => {
  it("neon css defines dark tokens and glass cards", () => {
    const css = read("css/tisly-neon-dark-v1.css");
    assert.match(css, /--tisly-neon-cyan:\s*#00f2fe/);
    assert.match(css, /--tisly-neon-blue:\s*#4facfe/);
    assert.match(css, /--tisly-neon-alert:\s*#ff007f/);
    assert.match(css, /--tisly-neon-bg:\s*#0d0f12/);
    assert.match(css, /backdrop-filter:\s*blur/);
    assert.match(css, /rgba\(0,\s*242,\s*254,\s*0\.3\)/);
    assert.match(css, /--tisly-neon-tap-min:\s*48px/);
    assert.match(css, /tisly-neon-tap-glow/);
    assert.match(css, /body\.tisly-neon-dark/);
  });

  it("neon js mounts without clearing existing data", () => {
    const js = read("js/tisly-neon-dark-v1.js");
    assert.match(js, /NEON_DARK_VERSION = "neon-dark-v1"/);
    assert.match(js, /mountNeonDarkModeV1/);
    assert.match(js, /enableNeonDarkModeV1/);
    assert.match(js, /tisly-neon-pulse/);
    assert.match(js, /isCustomerFacingPath/);
    assert.doesNotMatch(js, /localStorage\.clear/);
    assert.doesNotMatch(js, /indexedDB\.deleteDatabase/);
    assert.doesNotMatch(js, /removeChild\(/);
  });

  it("practical nav loads neon dark module", () => {
    const nav = read("js/tisly-practical-nav.js");
    assert.match(nav, /tisly-neon-dark-v1/);
    assert.match(nav, /mountNeonDarkModeV1/);
  });

  it("service worker caches neon assets", () => {
    const sw = read("service-worker.js");
    assert.match(sw, /tisly-pwa-v2420-neon-dark/);
    assert.match(sw, /\/css\/tisly-neon-dark-v1\.css/);
    assert.match(sw, /\/js\/tisly-neon-dark-v1\.js/);
  });

  it("neon css and js are served", async () => {
    const app = createApp();
    const css = await request(app).get("/css/tisly-neon-dark-v1.css");
    assert.equal(css.status, 200);
    assert.match(css.text, /--tisly-neon-cyan/);

    const js = await request(app).get("/js/tisly-neon-dark-v1.js");
    assert.equal(js.status, 200);
    assert.match(js.text, /mountNeonDarkModeV1/);
  });

  it("remote v1 appends neon stylesheet without removing remote css", () => {
    const html = read("remote-v1.html");
    assert.match(html, /\/css\/remote-v1\.css/);
    assert.match(html, /\/css\/tisly-neon-dark-v1\.css/);
    assert.match(html, /tisly-neon-dark/);
  });
});
