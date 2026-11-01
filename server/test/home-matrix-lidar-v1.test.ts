import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-matrix-lidar-v1";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-matrix-lidar-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
delete process.env.REMOTE_TEST_TOKEN;

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { getHomeSecurityRulesV1 } = await import(
  "../src/home/home-security-rules-v1.js"
);
const { analyzeMatrixLidarV1 } = await import(
  "../src/home/home-matrix-lidar-v1.js"
);

const app = createApp();
const siteId = "HOME-JP-ITABASHI-LIVE";

function farGrid(): number[] {
  return Array.from({ length: 64 }, () => 3200);
}

function withNear(base: number[], points: Array<[number, number, number]>): number[] {
  const next = base.slice();
  for (const [x, y, mm] of points) next[y * 8 + x] = mm;
  return next;
}

describe("matrix lidar", () => {
  after(() => {
    closeDatabase();
  });

  it("turns a right-side cluster into a leftward move", () => {
    const right = withNear(farGrid(), [
      [6, 3, 500],
      [7, 3, 480],
      [6, 4, 520],
    ]);
    const first = analyzeMatrixLidarV1(right, null);
    assert.equal(first.present, true);
    assert.equal(first.direction, "still");
    const left = withNear(farGrid(), [
      [2, 3, 500],
      [3, 3, 480],
      [2, 4, 520],
    ]);
    const second = analyzeMatrixLidarV1(left, first);
    assert.equal(second.direction, "left");
    const clear = analyzeMatrixLidarV1(farGrid(), second);
    assert.equal(clear.present, false);
    assert.equal(clear.direction, "none");
  });

  it("stores the frame and leaves security rules unchanged", async () => {
    const before = JSON.stringify(getHomeSecurityRulesV1(siteId));
    const matrix = withNear(farGrid(), [
      [4, 4, 600],
      [5, 4, 580],
      [4, 5, 610],
    ]);
    const posted = await request(app)
      .post("/api/home/v1/itabashi/lidar")
      .send({
        siteId,
        deviceId: "rp2350-itabashi-main-01",
        matrix,
      });
    assert.equal(posted.status, 200);
    assert.equal(posted.body.ok, true);
    assert.equal(posted.body.snapshot.status, "detected");
    assert.equal(posted.body.snapshot.directionLabel, "その場にいます");

    const got = await request(app).get(
      "/api/home/v1/itabashi/lidar?siteId=HOME-JP-ITABASHI-LIVE"
    );
    assert.equal(got.status, 200);
    assert.equal(got.body.snapshot.present, true);
    assert.equal(got.body.snapshot.matrix[4 + 4 * 8], 600);
    assert.equal(JSON.stringify(getHomeSecurityRulesV1(siteId)), before);

    const other = await request(app)
      .post("/api/home/v1/itabashi/lidar")
      .send({ siteId: "TOYOSHIMA001", matrix });
    assert.equal(other.status, 400);
  });

  it("keeps all 64 raw millimeters, including far cells", async () => {
    const matrix = farGrid();
    matrix[0] = 0;
    matrix[1] = 9000;
    matrix[2] = 350;
    const posted = await request(app)
      .post("/api/home/v1/itabashi/lidar")
      .send({
        siteId,
        deviceId: "rp2350-itabashi-main-01",
        matrix,
      });
    assert.equal(posted.status, 200);
    assert.equal(posted.body.snapshot.matrix.length, 64);
    assert.equal(posted.body.snapshot.matrix[0], 0);
    assert.equal(posted.body.snapshot.matrix[1], 9000);
    assert.equal(posted.body.snapshot.matrix[2], 350);
  });
});
