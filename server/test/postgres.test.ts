process.env.DB_PROVIDER = "sqlite";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { getDbProvider, resetDbProviderForTests } from "../src/db/db-provider.js";

const app = createApp();

describe("PostgreSQL infrastructure (Phase 201-220)", () => {
  it("GET /api/db/status returns sqlite provider by default", async () => {
    resetDbProviderForTests();
    const res = await request(app).get("/api/db/status");
    assert.equal(res.status, 200);
    assert.equal(res.body.provider, "sqlite");
    assert.equal(res.body.reachable, true);
    assert.ok(res.body.table_count >= 1);
    assert.equal(getDbProvider().type, "sqlite");
  });

  it("postgres provider reports unreachable without server", async () => {
    process.env.DB_PROVIDER = "postgres";
    process.env.POSTGRES_HOST = "127.0.0.1";
    process.env.POSTGRES_PORT = "59999";
    resetDbProviderForTests();
    const provider = getDbProvider();
    assert.equal(provider.type, "postgres");
    assert.equal(provider.ping(), false);
    process.env.DB_PROVIDER = "sqlite";
    resetDbProviderForTests();
  });
});
