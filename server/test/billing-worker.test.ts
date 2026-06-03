import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";
import { getDatabase, closeDatabase } from "../src/db/database.js";
import { updateCustomerBilling } from "../src/billing/billing-store.js";

process.env.JWT_SECRET = "test-jwt-phase301";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-billing-worker.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.WORKERS_ENABLED = "false";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");

const app = createApp();

async function customerLogin(code: string, username: string) {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: code, username, password: "demo-remote-2026" });
}

describe("Phase 301-320 billing workers and ops", () => {
  let tomsToken = "";
  let plantToken = "";
  let platformAdminToken = "";

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
    const plat = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: process.env.ADMIN_PASSWORD ?? "admin" });
    if (plat.status === 200) platformAdminToken = plat.body.token;

    const toms = await customerLogin("TOMS001", "toms001.admin");
    assert.equal(toms.status, 200);
    tomsToken = toms.body.token;
    const plant = await customerLogin("PLANT001", "plant001.admin");
    assert.equal(plant.status, 200);
    plantToken = plant.body.token;
  });

  after(() => closeDatabase());

  it("Stripe mock webhook updates plan on subscription.updated", async () => {
    const db = getDatabase();
    const row = db
      .prepare(`SELECT customer_id FROM customers WHERE customer_code = 'TOMS001'`)
      .get() as { customer_id: string };
    updateCustomerBilling(row.customer_id, {
      stripe_customer_id: "cus_test_toms",
      stripe_subscription_id: "sub_test_toms",
    });

    const res = await request(app)
      .post("/api/billing/stripe/webhook")
      .set("Content-Type", "application/json")
      .send({
        id: "evt_test_1",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_test_toms",
            customer: "cus_test_toms",
            status: "active",
            current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
            items: { data: [{ price: { id: process.env.STRIPE_PRICE_PRO_REMOTE ?? "price_pro_remote" } }] },
            metadata: { customer_code: "TOMS001" },
          },
        },
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.handled, true);
    assert.equal(res.body.mock, true);
  });

  it("payment_failed sets last_invoice_status attention", async () => {
    const db = getDatabase();
    const row = db
      .prepare(`SELECT customer_id FROM customers WHERE customer_code = 'TOMS001'`)
      .get() as { customer_id: string };
    updateCustomerBilling(row.customer_id, { stripe_subscription_id: "sub_pay_fail" });

    const res = await request(app)
      .post("/api/billing/stripe/webhook")
      .send({
        id: "evt_test_2",
        type: "invoice.payment_failed",
        data: { object: { subscription: "sub_pay_fail", customer: "cus_test_toms" } },
      });
    assert.equal(res.status, 200);
    const billing = db
      .prepare(`SELECT last_invoice_status, subscription_status FROM customers WHERE customer_id = ?`)
      .get(row.customer_id) as { last_invoice_status: string; subscription_status: string };
    assert.equal(billing.last_invoice_status, "failed");
    assert.equal(billing.subscription_status, "past_due");
  });

  it("PRO_REMOTE allows webhook, Standard blocks", async () => {
    const ok = await request(app)
      .get("/api/customer/TOMS001/webhooks")
      .set("Authorization", `Bearer ${tomsToken}`);
    assert.equal(ok.status, 200);

    const blocked = await request(app)
      .get("/api/customer/PLANT001/webhooks")
      .set("Authorization", `Bearer ${plantToken}`);
    assert.equal(blocked.status, 403);
  });

  it("report email queue registers via send-email", async () => {
    const res = await request(app)
      .post("/api/customer/TOMS001/reports/send-email")
      .set("Authorization", `Bearer ${tomsToken}`)
      .send({ reportType: "monthly", to: "test@example.com" });
    assert.equal(res.status, 202);
    assert.ok(res.body.queue_id);
    const pending = (
      getDatabase()
        .prepare(`SELECT COUNT(*) as c FROM report_email_queue WHERE status = 'pending'`)
        .get() as { c: number }
    ).c;
    assert.ok(pending >= 1);
  });

  it("suspended contract blocks webhook create", async () => {
    const db = getDatabase();
    const row = db
      .prepare(`SELECT customer_id FROM customers WHERE customer_code = 'TOMS001'`)
      .get() as { customer_id: string };
    db.prepare(`UPDATE customers SET contract_status = 'suspended' WHERE customer_id = ?`).run(
      row.customer_id
    );
    const res = await request(app)
      .post("/api/customer/TOMS001/webhooks")
      .set("Authorization", `Bearer ${tomsToken}`)
      .send({ url: "https://example.com/hook" });
    assert.equal(res.status, 403);
    db.prepare(`UPDATE customers SET contract_status = 'active' WHERE customer_id = ?`).run(
      row.customer_id
    );
  });

  it("ops map requires customer scope", async () => {
    const noScope = await request(app).get("/api/ops/map");
    assert.ok([401, 403, 503].includes(noScope.status));

    if (!platformAdminToken) return;

    const allScope = await request(app)
      .get("/api/ops/map?customerCode=ALL")
      .set("Authorization", `Bearer ${platformAdminToken}`);
    assert.equal(allScope.status, 400);

    const map = await request(app)
      .get("/api/ops/map?customerCode=TOMS001")
      .set("Authorization", `Bearer ${platformAdminToken}`);
    assert.equal(map.status, 200);
    assert.equal(map.body.customerCode, "TOMS001");
    assert.ok(Array.isArray(map.body.sites));

    const hotelScoped = await request(app)
      .get("/api/ops/map?customerCode=HOTEL001")
      .set("Authorization", `Bearer ${platformAdminToken}`);
    assert.equal(hotelScoped.status, 200);
    assert.equal(hotelScoped.body.customerCode, "HOTEL001");
  });

  it("webhook delivery retry endpoint exists for PRO_REMOTE", async () => {
    if (!platformAdminToken) return;
    const list = await request(app)
      .get("/api/customer/TOMS001/webhooks/deliveries")
      .set("Authorization", `Bearer ${platformAdminToken}`);
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body.deliveries));
  });
});
