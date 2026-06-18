import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();

describe("Health API extended (Phase 221-240)", () => {
  it("GET /api/health/full matches extended payload", async () => {
    const res = await request(app).get("/api/health/full");
    assert.equal(res.status, 200);
    assert.equal(res.body.endpoint, "/api/health/full");
  });

  it("GET /api/health includes postgres redis mqtt tv qnap disk memory", async () => {
    const res = await request(app).get("/api/health");
    assert.equal(res.status, 200);
    assert.ok(res.body.postgres);
    assert.ok(res.body.redis);
    assert.ok(res.body.mqtt);
    assert.ok(res.body.tv);
    assert.ok(res.body.qnap);
    assert.ok(res.body.disk);
    assert.ok(res.body.memory);
    assert.ok(Array.isArray(res.body.infrastructure));
    assert.equal(res.body.phase, "1461-1500-conoha-vps-auto-deploy");
    assert.ok(res.body.buildVersion);
    assert.ok(typeof res.body.uptime === "number");
    assert.ok(res.body.database);
    assert.ok(res.body.websocket);
    assert.ok(res.body.productionUrl);
    assert.equal(typeof res.body.googleMapsApiConfigured, "boolean");
    assert.equal(typeof res.body.googleMapsApiKeyPresent, "boolean");
    assert.equal(res.body.commitShort, res.body.buildVersion.commitShort);
    assert.equal(typeof res.body.pdfEngine, "string");
    assert.ok(["puppeteer", "html_fallback"].includes(res.body.pdfEngine));
    assert.equal(typeof res.body.pdfEngineReady, "boolean");
    assert.ok("chromiumExecutablePath" in res.body);
    assert.ok("pdfLastError" in res.body);
    assert.equal(res.body.integrations.googleMapsApiConfigured, res.body.googleMapsApiConfigured);
    const oauth = res.body.googleCalendarOAuth;
    assert.ok(oauth);
    assert.equal(typeof oauth.calendarEnabled, "boolean");
    assert.equal(typeof oauth.hasAccessToken, "boolean");
    assert.equal(typeof oauth.hasRefreshToken, "boolean");
    assert.equal(typeof oauth.redirectUri, "string");
    assert.equal(typeof oauth.redirectUriMatchesExpected, "boolean");
    assert.equal(typeof oauth.scopes, "string");
    assert.equal(typeof oauth.clientIdMask, "string");
    assert.ok("lastOAuthError" in oauth);
    assert.ok("lastSyncError" in oauth);
    assert.deepEqual(res.body.integrations.googleCalendarOAuth, oauth);
    const raw = JSON.stringify(res.body);
    assert.ok(!raw.includes("GOCSPX-"));
    assert.ok(!raw.includes("refresh_token"));
    assert.ok(!/"access_token"\s*:\s*"/.test(raw));
  });

  it("GET /health reflects new phase", async () => {
    const res = await request(app).get("/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.phase, "1461-1500-conoha-vps-auto-deploy");
    assert.ok(res.body.features.includes("totp-2fa-otplib"));
  });

  it("GET /api/dashboard includes infrastructureHealth", async () => {
    const res = await request(app).get("/api/dashboard");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.infrastructureHealth));
    const names = res.body.infrastructureHealth.map((c: { name: string }) => c.name);
    assert.ok(names.includes("DB"));
    assert.ok(names.includes("Redis"));
  });
});
