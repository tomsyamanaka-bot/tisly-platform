import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import request from "supertest";

process.env.JWT_SECRET = "test-jwt-remote-knowledge-v1";
process.env.REMOTE_TEST_TOKEN = "test-remote-token-v1";
process.env.TISLY_DB_PATH = "./data/test-remote-knowledge-v1.db";

const { createApp } = await import("../src/app.js");

const publicDir = path.join(process.cwd(), "public");

describe("Remote v1 + Knowledge v1 PWA routes", () => {
  const app = createApp();

  it("GET /remote-v1 serves HTML with device grid", async () => {
    const res = await request(app).get("/remote-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /Remote v1/);
    assert.match(res.text, /remote-v1\.js/);
    assert.match(res.text, /device-grid/);
  });

  it("GET /knowledge-v1 serves search UI", async () => {
    const res = await request(app).get("/knowledge-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /Knowledge/);
    assert.match(res.text, /search-input/);
    assert.match(res.text, /knowledge-v1\.js/);
  });

  it("GET /knowledge-register-v1 preserves registration UI", async () => {
    const res = await request(app).get("/knowledge-register-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /ナレッジ登録/);
    assert.match(res.text, /knowledge-register-v1\.js/);
  });

  it("remote-v1.js has 8 devices and neon state labels", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/remote-v1.js"), "utf-8");
    assert.match(js, /DEVICES/);
    assert.match(js, /🟢 ON/);
    assert.match(js, /⚪ OFF/);
    assert.match(js, /api\/remote-test/);
    assert.equal((js.match(/ch:/g) || []).length >= 8, true);
  });

  it("knowledge-v1.js has mock articles and popup modal", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/knowledge-v1.js"), "utf-8");
    assert.match(js, /コーラ瓶サイロの作り方/);
    assert.match(js, /メガー0MΩトラップ/);
    assert.match(js, /エアコン裏結露対策/);
    assert.match(js, /#IoT/);
    assert.match(js, /openModal/);
  });

  it("static CSS assets exist", () => {
    assert.ok(fs.existsSync(path.join(publicDir, "css/remote-v1.css")));
    assert.ok(fs.existsSync(path.join(publicDir, "css/knowledge-v1.css")));
  });
});
