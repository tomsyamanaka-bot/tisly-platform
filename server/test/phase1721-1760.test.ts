import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const PHASE_DOCS = [
  "docs/vps_first_launch_for_tomonori.md",
  "docs/vps_copy_paste_commands.md",
  "docs/production_url_checklist.md",
] as const;

const GITHUB_REQUIRED = [
  ".github/workflows/deploy.yml",
  "scripts/vps-first-deploy-check.sh",
  "scripts/vps-deploy-one-command.sh",
  "scripts/deploy.sh",
  "scripts/rollback.sh",
  "server/deploy/nginx/tisly.jp.conf",
  "server/deploy/systemd/tisly-server.service",
  "server/.env.production.example",
  "docs/tisly_vps_deploy_step_by_step.md",
] as const;

const PRODUCTION_URLS = [
  "https://tisly.jp/app",
  "https://tisly.jp/survey",
  "https://tisly.jp/business",
  "https://tisly.jp/sales",
  "https://tisly.jp/customer/TOMS001",
  "https://tisly.jp/customer/TOMS001/pro-remote",
  "https://tisly.jp/customer/TOMS001/install/home",
  "https://tisly.jp/tv/TOMS001",
  "https://tisly.jp/deployment/checklist",
] as const;

const SECRET_PLACEHOLDER = /ここに入れる|ここに貼り付け|your-password|change-me/i;
const REAL_SECRET_PATTERN =
  /(?:JWT_SECRET|ADMIN_PASSWORD_HASH|INGEST_SECRET|DEPLOY_OPS_TOKEN|MQTT_PASSWORD)\s*=\s*(?!\s*$)(?!\s*ここ)[a-zA-Z0-9+/=$]{20,}/;

describe("Phase 1721-1760 VPS Deploy Final Safety Check", () => {
  describe("launch guide docs exist", () => {
    for (const rel of PHASE_DOCS) {
      it(`${rel} exists`, () => {
        assert.ok(fs.existsSync(path.join(repoRoot, rel)), `${rel} missing`);
      });
    }

    it("vps_first_launch_for_tomonori.md references Phase 1721", () => {
      const doc = fs.readFileSync(
        path.join(repoRoot, "docs/vps_first_launch_for_tomonori.md"),
        "utf8",
      );
      assert.ok(doc.includes("1721"));
      assert.ok(doc.includes("/opt/tisly/server"));
      assert.ok(doc.includes("rollback"));
    });

    it("vps_copy_paste_commands.md has ordered blocks and placeholders", () => {
      const doc = fs.readFileSync(
        path.join(repoRoot, "docs/vps_copy_paste_commands.md"),
        "utf8",
      );
      assert.ok(doc.includes("ブロック 1"));
      assert.ok(doc.includes("ブロック 16"));
      assert.ok(doc.includes("JWT_SECRET=ここに入れる"));
      assert.ok(doc.includes("ADMIN_PASSWORD_HASH=ここに入れる"));
      assert.ok(!REAL_SECRET_PATTERN.test(doc), "real secrets must not appear in copy-paste doc");
    });

    it("production_url_checklist.md covers 9 URLs and check dimensions", () => {
      const doc = fs.readFileSync(
        path.join(repoRoot, "docs/production_url_checklist.md"),
        "utf8",
      );
      for (const url of PRODUCTION_URLS) {
        assert.ok(doc.includes(url), `missing URL: ${url}`);
      }
      for (const dim of [
        "表示 OK",
        "PWA installReady",
        "API 接続 OK",
        "404 なし",
        "500 なし",
        "iPhone",
        "Android",
        "Google TV",
      ]) {
        assert.ok(doc.includes(dim), `missing dimension: ${dim}`);
      }
    });
  });

  describe("GitHub deploy artifacts", () => {
    for (const rel of GITHUB_REQUIRED) {
      it(`${rel} exists`, () => {
        assert.ok(fs.existsSync(path.join(repoRoot, rel)), `${rel} missing`);
      });
    }

    it("deploy.yml does not echo VPS secrets", () => {
      const yml = fs.readFileSync(path.join(repoRoot, ".github/workflows/deploy.yml"), "utf8");
      assert.ok(!yml.includes("echo ${{ secrets."));
      assert.ok(yml.includes("secrets.VPS_HOST"));
    });
  });

  describe("security baseline", () => {
    it(".gitignore excludes .env and server/uploads", () => {
      const gi = fs.readFileSync(path.join(repoRoot, ".gitignore"), "utf8");
      assert.ok(gi.includes(".env"));
      assert.ok(gi.includes("server/uploads/"));
      assert.ok(gi.includes("server/node_modules/"));
    });

    it("tracked env files are examples only", () => {
      const tracked = execSync("git ls-files", { cwd: repoRoot, encoding: "utf8" })
        .split("\n")
        .filter((f) => f.includes(".env"));
      for (const f of tracked) {
        assert.ok(
          f.endsWith(".example") || f.endsWith(".production.example"),
          `non-example env tracked: ${f}`,
        );
      }
      assert.equal(
        tracked.filter((f) => f === ".env" || f.endsWith("/.env") || f.endsWith(".env.production"))
          .length,
        0,
      );
    });

    it("no real secrets in README or phase docs", () => {
      const targets = [
        "README.md",
        "docs/vps_first_launch_for_tomonori.md",
        "docs/vps_copy_paste_commands.md",
        "docs/env_fill_in_guide.md",
      ];
      for (const rel of targets) {
        const text = fs.readFileSync(path.join(repoRoot, rel), "utf8");
        assert.ok(!REAL_SECRET_PATTERN.test(text), `possible secret in ${rel}`);
      }
    });

    it(".env.production.example has empty secret placeholders", () => {
      const env = fs.readFileSync(
        path.join(repoRoot, "server/.env.production.example"),
        "utf8",
      );
      assert.match(env, /^JWT_SECRET=\s*$/m);
      assert.match(env, /^ADMIN_PASSWORD_HASH=\s*$/m);
      assert.match(env, /^INGEST_SECRET=\s*$/m);
      assert.ok(SECRET_PLACEHOLDER.test(env) || env.includes("JWT_SECRET="));
    });
  });
});
