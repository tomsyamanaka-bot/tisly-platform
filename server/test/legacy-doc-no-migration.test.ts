import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-legacy-doc-no";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-legacy-doc-no-migration.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const {
  isLegacyEstimateNo,
  isLegacyInvoiceNo,
  migrateLegacyDocNumbersV1,
} = await import("../src/business/legacy-doc-no-migration.js");
const {
  isTomsEstimateNo,
  isTomsInvoiceNo,
  generateTomsEstimateNo,
  generateTomsInvoiceNo,
} = await import("../src/business/toms-document-format.js");
const { v4: uuid } = await import("uuid");

describe("Legacy doc number migration v1", () => {
  before(() => {
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
  });

  after(() => closeDatabase());

  it("旧見積番号を検出する", () => {
    assert.equal(isLegacyEstimateNo("MO-26-0619-001-001"), true);
    assert.equal(isLegacyEstimateNo("260608-001"), true);
    assert.equal(isLegacyEstimateNo("MO-26-0619-001"), false);
  });

  it("旧請求番号を検出する", () => {
    assert.equal(isLegacyInvoiceNo("MO-26-0619-001-001"), true);
    assert.equal(isLegacyInvoiceNo("INV-MO-26-0619-001"), false);
  });

  it("旧見積番号を TOMS 標準へ移行する", () => {
    const db = getDatabase();
    const projectId = uuid();
    const estimateId = uuid();
    const legacyNo = "MO-26-0619-001-001";
    const now = "2026-06-19T10:00:00.000Z";

    db.prepare(
      `INSERT INTO business_projects (
        id, project_no, customer_id, customer_name, title, address, municipality,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'estimate_created', ?, ?)`
    ).run(
      projectId,
      "MO-26-0619-001",
      "cust-1",
      "移行テスト",
      "現場A",
      "茨城県守谷市",
      "守谷市",
      now,
      now
    );

    db.prepare(
      `INSERT INTO business_estimates (
        id, project_id, estimate_no, customer_name, title, items_json,
        subtotal, tax, total, internal_cost, gross_profit, gross_profit_rate,
        shusei_discount_amount, shusei_discount_memo, pdf_path, header_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, '[]', 1000, 100, 1100, 500, 500, 50, 0, '', NULL, ?, ?, ?)`
    ).run(
      estimateId,
      projectId,
      legacyNo,
      "移行テスト",
      "現場A",
      JSON.stringify({ estimateNo: legacyNo, addressee: "移行テスト", subject: "現場A" }),
      now,
      now
    );

    const report = migrateLegacyDocNumbersV1(db);
    assert.equal(report.estimate.beforeLegacyCount, 1);
    assert.equal(report.estimate.migratedCount, 1);
    assert.equal(report.estimate.afterLegacyCount, 0);

    const row = db
      .prepare(`SELECT estimate_no, header_json FROM business_estimates WHERE id = ?`)
      .get(estimateId) as { estimate_no: string; header_json: string };
    assert.match(row.estimate_no, /^MO-\d{2}-\d{4}-\d{3}$/);
    assert.equal(isTomsEstimateNo(row.estimate_no), true);
    const header = JSON.parse(row.header_json) as { estimateNo: string };
    assert.equal(header.estimateNo, row.estimate_no);
  });

  it("新形式見積番号は再移行されない", () => {
    const db = getDatabase();
    const tomsNo = generateTomsEstimateNo({ address: "茨城県守谷市" });
    const projectId = uuid();
    const estimateId = uuid();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO business_projects (
        id, project_no, customer_id, customer_name, title, address, municipality,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'estimate_created', ?, ?)`
    ).run(
      projectId,
      "MO-26-0620-001",
      "cust-2",
      "再移行なし",
      "現場B",
      "茨城県守谷市",
      "守谷市",
      now,
      now
    );

    db.prepare(
      `INSERT INTO business_estimates (
        id, project_id, estimate_no, customer_name, title, items_json,
        subtotal, tax, total, internal_cost, gross_profit, gross_profit_rate,
        shusei_discount_amount, shusei_discount_memo, pdf_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, '[]', 1000, 100, 1100, 500, 500, 50, 0, '', NULL, ?, ?)`
    ).run(estimateId, projectId, tomsNo, "再移行なし", "現場B", now, now);

    const before = db.prepare(`SELECT estimate_no FROM business_estimates WHERE id = ?`).get(estimateId) as {
      estimate_no: string;
    };
    const report = migrateLegacyDocNumbersV1(db);
    const after = db.prepare(`SELECT estimate_no FROM business_estimates WHERE id = ?`).get(estimateId) as {
      estimate_no: string;
    };
    assert.equal(after.estimate_no, before.estimate_no);
    assert.equal(report.estimate.migratedCount, 0);
  });

  it("重複時に安全採番される", () => {
    const db = getDatabase();
    const existingNo = generateTomsEstimateNo({ address: "茨城県守谷市" });
    const at = new Date();
    const cityPrefix = existingNo.replace(/-\d{3}$/, "");

    for (let i = 0; i < 2; i++) {
      const projectId = uuid();
      const estimateId = uuid();
      const legacyNo = `LEGACY-DUP-${i}-${Date.now()}`;
      const now = at.toISOString();
      db.prepare(
        `INSERT INTO business_projects (
          id, project_no, customer_id, customer_name, title, address, municipality,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'estimate_created', ?, ?)`
      ).run(
        projectId,
        `MO-26-0620-00${i + 2}`,
        "cust-dup",
        "重複テスト",
        "現場",
        "茨城県守谷市",
        "守谷市",
        now,
        now
      );
      db.prepare(
        `INSERT INTO business_estimates (
          id, project_id, estimate_no, customer_name, title, items_json,
          subtotal, tax, total, internal_cost, gross_profit, gross_profit_rate,
          shusei_discount_amount, shusei_discount_memo, pdf_path, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, '[]', 1000, 100, 1100, 500, 500, 50, 0, '', NULL, ?, ?)`
      ).run(estimateId, projectId, legacyNo, "重複テスト", "現場", now, now);
    }

    const report = migrateLegacyDocNumbersV1(db);
    const migrated = db
      .prepare(`SELECT estimate_no FROM business_estimates WHERE estimate_no LIKE ? ORDER BY estimate_no`)
      .all(`${cityPrefix}-%`) as { estimate_no: string }[];
    const nums = migrated.map((r) => Number(String(r.estimate_no).slice(-3)));
    assert.ok(new Set(nums).size === nums.length, "duplicate seq detected");
    assert.ok(report.estimate.migratedCount >= 2);
  });

  it("請求番号 INV- 形式を生成する", () => {
    const no = generateTomsInvoiceNo({ address: "茨城県常総市" });
    assert.match(no, /^INV-JY-\d{2}-\d{4}-\d{3}$/);
    assert.equal(isTomsInvoiceNo(no), true);
  });
});
