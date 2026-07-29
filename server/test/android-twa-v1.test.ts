import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import request from "supertest";

const { createApp } = await import("../src/app.js");
const app = createApp();

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const assetlinksFile = path.join(root, "server", "public", ".well-known", "assetlinks.json");
const twaManifest = path.join(root, "android", "twa-manifest.json");

describe("android-twa-v1", () => {
  it("has Bubblewrap twa-manifest with Play package settings", () => {
    assert.ok(fs.existsSync(twaManifest), "android/twa-manifest.json");
    const m = JSON.parse(fs.readFileSync(twaManifest, "utf8"));
    assert.equal(m.packageId, "com.tisly.app");
    assert.equal(m.name, "TiSLY");
    assert.equal(m.host, "tisly.jp");
    assert.equal(m.startUrl, "/app");
    assert.ok(String(m.iconUrl).includes("/icons/icon-512.png"));
    assert.ok(String(m.webManifestUrl).includes("manifest.webmanifest"));
  });

  it("ships Digital Asset Links under public/.well-known", () => {
    assert.ok(fs.existsSync(assetlinksFile), "assetlinks.json");
    const links = JSON.parse(fs.readFileSync(assetlinksFile, "utf8"));
    assert.ok(Array.isArray(links) && links.length >= 1);
    assert.equal(links[0].target.package_name, "com.tisly.app");
    assert.ok(Array.isArray(links[0].target.sha256_cert_fingerprints));
  });

  it("serves /.well-known/assetlinks.json as JSON", async () => {
    const res = await request(app).get("/.well-known/assetlinks.json");
    assert.equal(res.status, 200);
    const ct = String(res.headers["content-type"] || "");
    assert.ok(ct.includes("application/json"), ct);
    assert.equal(res.body[0].target.package_name, "com.tisly.app");
  });
});
