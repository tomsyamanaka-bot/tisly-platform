process.env.JWT_SECRET = "test-jwt-secret-32-characters-long!!";
process.env.ADMIN_USERNAME = "admin";
process.env.REQUIRE_2FA = "false";
process.env.RATE_LIMIT_PROVIDER = "memory";

import { hashPassword } from "../src/auth/password.js";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { getDatabase } from "../src/db/database.js";
import {
  setupTotp,
  verifyTotpCode,
  enableTotp,
  isTotpEnabled,
  disableTotp,
} from "../src/auth/totp.js";
import { authenticator } from "otplib";

const app = createApp();

async function loginToken(): Promise<string> {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ username: "admin", password: "testpass" });
  assert.equal(res.status, 200);
  return res.body.token as string;
}

before(() => {
  getDatabase();
  disableTotp("admin-default");
});

after(() => {
  disableTotp("admin-default");
});

describe("2FA production (Phase 211-215)", () => {
  it("setup returns QR and secret (not mock)", async () => {
    const token = await loginToken();
    const res = await request(app)
      .post("/api/auth/2fa/setup")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.mock, false);
    assert.ok(res.body.qrDataUrl?.startsWith("data:image"));
    assert.ok(res.body.secret);
  });

  it("verify and enable flow with otplib", async () => {
    const userId = "admin-default";
    disableTotp(userId);
    const setup = await setupTotp(userId);
    const code = authenticator.generate(setup.secret);
    assert.ok(verifyTotpCode(userId, code));
    assert.ok(enableTotp(userId, code));
    assert.ok(isTotpEnabled(userId));
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "testpass", totpCode: authenticator.generate(setup.secret) });
    assert.equal(login.status, 200);
    disableTotp(userId);
  });

  it("POST /api/auth/2fa/enable requires valid code", async () => {
    const token = await loginToken();
    await request(app)
      .post("/api/auth/2fa/setup")
      .set("Authorization", `Bearer ${token}`);
    const bad = await request(app)
      .post("/api/auth/2fa/enable")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "000000" });
    assert.equal(bad.status, 401);
  });
});
