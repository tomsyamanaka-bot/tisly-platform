import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";
import {
  buildPwaIconCheck,
  SAFARI_PWA_REINSTALL_STEPS,
  VPS_PWA_ICON_UPDATE_BLOCK,
} from "../src/pwa/pwa-icon-check.js";
import { APP_ICON_VERSION } from "../src/pwa/pwa-manifest-icons.js";

process.env.JWT_SECRET = "test-phase2041-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase2041-2080.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");
process.env.TISLY_PUBLIC_URL = "https://tisly.jp";
process.env.MQTT_MODE = "mock";
process.env.MQTT_MOCK_MODE = "true";
process.env.SHELLY_MODE = "mock";
process.env.QNAP_UPLOAD_MODE = "mock";
process.env.GOOGLE_OAUTH_ENABLED = "false";
process.env.GMAIL_SEND_MODE = "mock";
process.env.DEMO_RESET_ENABLED = "false";
process.env.INGEST_SECRET = "test-ingest-secret-ok-value";
process.env.DEPLOY_OPS_TOKEN = "test-deploy-ops-token";

const dbPath = process.env.TISLY_DB_PATH;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicDir = path.join(repoRoot, "server/public");

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 2041-2080 PWA icon production verification", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  after(() => closeDatabase());

  describe("pwa-icon-check builder", () => {
    it("buildPwaIconCheck reports ready with versioned manifest", () => {
      const report = buildPwaIconCheck();
      assert.equal(report.phase, "2041-2080");
      assert.equal(report.iconVersion, APP_ICON_VERSION);
      assert.ok(report.appleTouchIconExists);
      assert.ok(report.appHubHasAppleTouchIcon);
      assert.ok(report.manifestIconsVersioned);
      assert.ok(report.manifestNoOldIconUrls);
      assert.ok(report.ready);
      assert.ok(report.safariReinstallSteps.length >= 4);
    });

    it("VPS_PWA_ICON_UPDATE_BLOCK uses git pull origin master", () => {
      const text = VPS_PWA_ICON_UPDATE_BLOCK.join("\n");
      assert.ok(text.includes("cd /opt/tisly"));
      assert.ok(text.includes("git pull origin master"));
      assert.ok(text.includes("npm ci"));
      assert.ok(text.includes("npm run build"));
      assert.ok(text.includes("systemctl restart tisly-server"));
      assert.ok(text.includes("pwa-icon-check"));
    });

    it("SAFARI_PWA_REINSTALL_STEPS covers delete and reinstall", () => {
      const text = SAFARI_PWA_REINSTALL_STEPS.join("\n");
      assert.ok(text.includes("削除"));
      assert.ok(text.includes("https://tisly.jp/app"));
      assert.ok(text.includes("ホーム画面に追加"));
      assert.ok(text.includes("青い TiSLY ロゴ"));
      assert.ok(text.includes("緑盾"));
    });
  });

  describe("GET /api/deploy/pwa-icon-check", () => {
    it("returns icon asset checks with versioned URLs", async () => {
      const res = await request(app).get("/api/deploy/pwa-icon-check");
      assert.equal(res.status, 200);
      assert.equal(res.body.phase, "2041-2080");
      assert.equal(res.body.iconVersion, APP_ICON_VERSION);
      assert.ok(res.body.ready);
      const urls = (res.body.checks || []).map((c: { url: string }) => c.url);
      assert.ok(urls.some((u: string) => u.includes(`/icons/icon-192.png?v=${APP_ICON_VERSION}`)));
      assert.ok(urls.some((u: string) => u.includes(`/icons/icon-512.png?v=${APP_ICON_VERSION}`)));
      assert.ok(urls.some((u: string) => u === "/apple-touch-icon.png"));
      assert.ok(urls.some((u: string) => u.includes(`manifest.webmanifest?v=${APP_ICON_VERSION}`)));
    });
  });

  describe("manifest does not reference old unversioned icon URLs", () => {
    it("all static manifests use ?v= version query", () => {
      const manifests = fs
        .readdirSync(publicDir)
        .filter((f) => f.endsWith(".webmanifest") || f === "manifest.json");
      for (const file of manifests) {
        const raw = fs.readFileSync(path.join(publicDir, file), "utf8");
        assert.ok(
          !/"src"\s*:\s*"\/icons\/icon-192\.png"/.test(raw),
          `${file} has unversioned icon-192`
        );
        const json = JSON.parse(raw) as { icons?: { src: string }[] };
        for (const icon of json.icons ?? []) {
          if (icon.src.includes("/icons/icon-")) {
            assert.ok(
              icon.src.includes(`?v=${APP_ICON_VERSION}`),
              `${file}: ${icon.src} missing version`
            );
          }
        }
      }
    });
  });

  describe("apple-touch-icon and app-hub", () => {
    it("apple-touch-icon.png exists", () => {
      assert.ok(fs.existsSync(path.join(publicDir, "apple-touch-icon.png")));
    });

    it("GET /apple-touch-icon.png returns 200", async () => {
      const res = await request(app).get("/apple-touch-icon.png");
      assert.equal(res.status, 200);
      assert.ok(res.headers["content-type"]?.includes("image"));
    });

    it("app-hub HTML has apple-touch-icon link", async () => {
      const res = await request(app).get("/app");
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('rel="apple-touch-icon"'));
    });
  });

  describe("deployment checklist PWA icon section", () => {
    it("GET /deployment/checklist includes PWA icon verification UI", async () => {
      const res = await request(app).get("/deployment/checklist");
      assert.equal(res.status, 200);
      assert.ok(res.text.includes("2041") || res.text.includes("PWAアイコン本番確認"));
      assert.ok(res.text.includes("pwa-icon-grid"));
      assert.ok(res.text.includes("iphone-reinstall-steps"));
      assert.ok(res.text.includes("pwa-icon-checks"));
      assert.ok(res.text.includes("PWAアイコン反映"));
    });

    it("deployment-checklist.js fetches pwa-icon-check API", () => {
      const js = fs.readFileSync(
        path.join(publicDir, "js/deployment-checklist.js"),
        "utf8"
      );
      assert.ok(js.includes("/api/deploy/pwa-icon-check"));
      assert.ok(js.includes("PWAアイコン本番確認"));
      assert.ok(js.includes("pwa-icon-checks"));
    });
  });

  describe("docs vps_phase2041_launch.md", () => {
    it("exists with VPS deploy and iPhone reinstall steps", () => {
      const doc = fs.readFileSync(path.join(repoRoot, "docs/vps_phase2041_launch.md"), "utf8");
      for (const needle of [
        "git pull origin master",
        "npm ci",
        "systemctl restart tisly-server",
        `icon-192.png?v=${APP_ICON_VERSION}`,
        "apple-touch-icon.png",
        "青い TiSLY ロゴ",
        "緑盾",
        "APP_ICON_VERSION",
      ]) {
        assert.ok(doc.includes(needle), `doc missing: ${needle}`);
      }
    });
  });
});
