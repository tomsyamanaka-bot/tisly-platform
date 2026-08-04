/**
 * QNAP Basic 認証解決ユニットテスト
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  QNAP_AUTH_ERROR_TOAST,
  QNAP_DEFAULT_BASIC_USER,
  buildQnapBasicAuthHeader,
  isQnapAuthHttpStatus,
  qnapBasicAuthHeaders,
  resolveQnapBasicAuthCredentials,
} from "../src/storage/qnap-basic-auth-v1.js";

describe("qnap-basic-auth-v1", () => {
  it("defaults username to tomsadmin when allowDefaultUser", () => {
    const prevUser = process.env.QNAP_USER;
    const prevWebUser = process.env.QNAP_WEBDAV_USER;
    const prevName = process.env.QNAP_USERNAME;
    delete process.env.QNAP_USER;
    delete process.env.QNAP_WEBDAV_USER;
    delete process.env.QNAP_USERNAME;
    try {
      const auth = resolveQnapBasicAuthCredentials({
        settingsUsername: "",
        settingsPassword: "secret",
        allowDefaultUser: true,
      });
      assert.equal(auth.username, QNAP_DEFAULT_BASIC_USER);
      assert.equal(auth.username, "tomsadmin");
      assert.equal(auth.password, "secret");
      assert.equal(auth.hasAuth, true);
    } finally {
      if (prevUser === undefined) delete process.env.QNAP_USER;
      else process.env.QNAP_USER = prevUser;
      if (prevWebUser === undefined) delete process.env.QNAP_WEBDAV_USER;
      else process.env.QNAP_WEBDAV_USER = prevWebUser;
      if (prevName === undefined) delete process.env.QNAP_USERNAME;
      else process.env.QNAP_USERNAME = prevName;
    }
  });

  it("prefers QNAP_USER / QNAP_PASSWORD over settings", () => {
    const prevUser = process.env.QNAP_USER;
    const prevPass = process.env.QNAP_PASSWORD;
    process.env.QNAP_USER = "env-user";
    process.env.QNAP_PASSWORD = "env-pass";
    try {
      const auth = resolveQnapBasicAuthCredentials({
        settingsUsername: "ui-user",
        settingsPassword: "ui-pass",
      });
      assert.equal(auth.username, "env-user");
      assert.equal(auth.password, "env-pass");
      assert.equal(auth.source, "env");
    } finally {
      if (prevUser === undefined) delete process.env.QNAP_USER;
      else process.env.QNAP_USER = prevUser;
      if (prevPass === undefined) delete process.env.QNAP_PASSWORD;
      else process.env.QNAP_PASSWORD = prevPass;
    }
  });

  it("omits Authorization when no username", () => {
    const headers = qnapBasicAuthHeaders("", "pass", { Depth: "0" });
    assert.equal(headers.Authorization, undefined);
    assert.equal(headers.Depth, "0");
  });

  it("builds Basic Authorization header", () => {
    const h = buildQnapBasicAuthHeader("tomsadmin", "x");
    assert.match(h, /^Basic /);
    const decoded = Buffer.from(h.slice(6), "base64").toString("utf8");
    assert.equal(decoded, "tomsadmin:x");
    const headers = qnapBasicAuthHeaders("tomsadmin", "x");
    assert.equal(headers.Authorization, h);
  });

  it("detects 401/403 and exposes toast constant", () => {
    assert.equal(isQnapAuthHttpStatus(401), true);
    assert.equal(isQnapAuthHttpStatus("403 Forbidden"), true);
    assert.equal(isQnapAuthHttpStatus(200), false);
    assert.match(QNAP_AUTH_ERROR_TOAST, /ストレージ設定画面/);
  });
});
