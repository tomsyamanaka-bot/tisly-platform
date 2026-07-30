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

describe("Light UI regression (neon class compat)", () => {
  it("css defines light tokens and white cards", () => {
    const css = read("css/tisly-neon-dark-v1.css");
    assert.match(css, /--tisly-neon-bg:\s*#ffffff/);
    assert.match(css, /--tisly-neon-surface:\s*#ffffff/);
    assert.match(css, /background:\s*#ffffff/);
    assert.match(css, /color-scheme:\s*light/);
    assert.match(css, /box-shadow:\s*0 4px 6px -1px rgba\(0,\s*0,\s*0,\s*0\.1\)/);
    assert.match(css, /border:\s*1px solid #dddddd/);
    assert.match(css, /--tisly-neon-tap-min:\s*48px/);
    assert.match(css, /tisly-neon-tap-glow/);
    assert.match(css, /body\.tisly-neon-dark/);
    assert.match(css, /#4facfe/);
    assert.match(css, /#a855f7/);
  });

  it("js mounts without clearing existing data", () => {
    const js = read("js/tisly-neon-dark-v1.js");
    assert.match(js, /NEON_DARK_VERSION = "neon-dark-v1"/);
    assert.match(js, /mountNeonDarkModeV1/);
    assert.match(js, /enableNeonDarkModeV1/);
    assert.match(js, /tisly-neon-pulse/);
    assert.match(js, /isCustomerFacingPath/);
    assert.match(js, /#ffffff/);
    assert.doesNotMatch(js, /localStorage\.clear/);
    assert.doesNotMatch(js, /indexedDB\.deleteDatabase/);
    assert.doesNotMatch(js, /removeChild\(/);
  });

  it("practical nav loads neon dark module", () => {
    const nav = read("js/tisly-practical-nav.js");
    assert.match(nav, /tisly-neon-dark-v1/);
    assert.match(nav, /mountNeonDarkModeV1/);
  });

  it("service worker caches light ui assets", () => {
    const sw = read("service-worker.js");
    assert.match(sw, /tisly-pwa-v2421-light-ui/);
    assert.match(sw, /\/css\/tisly-neon-dark-v1\.css/);
    assert.match(sw, /\/js\/tisly-neon-dark-v1\.js/);
  });

  it("neon css and js are served", async () => {
    const app = createApp();
    const css = await request(app).get("/css/tisly-neon-dark-v1.css");
    assert.equal(css.status, 200);
    assert.match(css.text, /--tisly-neon-bg:\s*#ffffff/);

    const js = await request(app).get("/js/tisly-neon-dark-v1.js");
    assert.equal(js.status, 200);
    assert.match(js.text, /mountNeonDarkModeV1/);
  });

  it("remote v1 appends stylesheet without removing remote css", () => {
    const html = read("remote-v1.html");
    assert.match(html, /\/css\/remote-v1\.css/);
    assert.match(html, /\/css\/tisly-neon-dark-v1\.css/);
    assert.match(html, /tisly-neon-dark/);
  });

  it("app hub uses white theme-color and login card", () => {
    const html = read("app-hub.html");
    assert.match(html, /theme-color" content="#ffffff"/);
    assert.match(html, /login-card-friendly/);
    assert.match(html, /btn-login-friendly/);
  });
});
