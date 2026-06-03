import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-pricing-csv";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-pricing-csv.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();
const CSV = `customer_code,contractor_code,work_category,item_name,unit,unit_price,tax_type,active
TOMS001,,camera,CSVテスト項目,式,12345,standard,true`;

describe("Phase 561-580 pricing CSV", () => {
  let token = "";

  before(async () => {
    closeDatabase();
    for (const p of [
      process.env.TISLY_DB_PATH!,
      `${process.env.TISLY_DB_PATH}-wal`,
      `${process.env.TISLY_DB_PATH}-shm`,
    ]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
    getDatabase();
    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "TOMS001",
        username: "toms001.manager",
        password: "demo-remote-2026",
      });
    token = login.body.token;
  });

  after(() => closeDatabase());

  it("import and export csv", async () => {
    const imp = await request(app)
      .post("/api/business/pricing/import-csv")
      .set("Authorization", `Bearer ${token}`)
      .send({ csv: CSV });
    assert.equal(imp.status, 200);
    assert.ok(imp.body.imported >= 1);

    const exp = await request(app)
      .get("/api/business/pricing/export-csv?customer_code=TOMS001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(exp.status, 200);
    assert.match(exp.text, /CSVテスト項目/);
  });
});
