import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { getDatabase } from "../src/db/database.js";
import { savePushSubscription } from "../src/notification/channels/web-push.js";
import {
  saveStaffNotifyFocusV1,
  staffFocusAllowsPushV1,
} from "../src/notification/staff-notify-focus-v1.js";

describe("staff notify focus", () => {
  it("shows the mute switch only on the internal security screen", () => {
    const staff = fs.readFileSync(
      path.join(process.cwd(), "public/security-v1.html"),
      "utf8"
    );
    const customer = fs.readFileSync(
      path.join(process.cwd(), "public/security-customer-v1.html"),
      "utf8"
    );
    assert.match(staff, /id="sf-notify-focus-toggle"/);
    assert.match(
      staff,
      /🔔 選択中の現場のみ通知を受信（他現場ミュート）/
    );
    assert.doesNotMatch(customer, /sf-notify-focus-toggle/);
    assert.match(
      fs.readFileSync(
        path.join(process.cwd(), "public/service-worker.js"),
        "utf8"
      ),
      /staffFocusBlocksNotification/
    );
  });

  it("defaults to every site and mutes other sites only while enabled", () => {
    const endpoint = "https://push.example.com/staff-focus-toyoshima";
    const row = { endpoint, user_id: "toms-ops" };
    const empty = new Map();
    assert.equal(
      staffFocusAllowsPushV1(row, "HOME-JP-ITABASHI-LIVE", empty),
      true
    );

    const focused = new Map([
      [
        endpoint,
        {
          siteId: "SEC-JP-TOYOSHIMA-001",
          propertyId: "HOME-JP-TOYOSHIMA",
        },
      ],
    ]);
    assert.equal(
      staffFocusAllowsPushV1(row, "HOME-JP-ITABASHI-LIVE", focused),
      false
    );
    assert.equal(
      staffFocusAllowsPushV1(row, "HOME-JP-TOYOSHIMA", focused),
      true
    );
    assert.equal(
      staffFocusAllowsPushV1(row, "SEC-JP-TOYOSHIMA-001", focused),
      true
    );
    assert.equal(
      staffFocusAllowsPushV1(
        { endpoint, user_id: "customer-security" },
        "HOME-JP-ITABASHI-LIVE",
        focused
      ),
      true
    );
    assert.equal(
      staffFocusAllowsPushV1(row, "", focused),
      true
    );
  });

  it("keeps the subscription row and remembers the switch", async () => {
    const endpoint = `https://push.example.com/staff-focus-${Date.now()}`;
    const app = createApp();
    savePushSubscription(
      "toms-ops",
      {
        endpoint,
        keys: {
          p256dh: "BOrri7HQZ2bM0B4aWj8vN0xKpQ2mR8sT1uV3wX5yZ7aB9cD1eF3gH5iJ7kL9mN1",
          auth: "tBHItJI5svbpez7KI4CCXg",
        },
      },
      undefined,
      {
        siteId: "SEC-JP-ITABASHI-LIVE",
        propertyId: "HOME-JP-ITABASHI-LIVE",
        customerCode: null,
      }
    );
    const before = getDatabase()
      .prepare(
        `SELECT site_id, property_id, customer_code, active
         FROM notification_tokens WHERE endpoint = ?`
      )
      .get(endpoint) as {
      site_id: string;
      property_id: string;
      customer_code: string | null;
      active: number;
    };

    const on = await request(app)
      .post("/api/notifications/staff-focus")
      .send({
        endpoint,
        enabled: true,
        siteId: "SEC-JP-TOYOSHIMA-001",
        propertyId: "HOME-JP-TOYOSHIMA",
      });
    assert.equal(on.status, 200);
    assert.equal(on.body.enabled, true);
    assert.equal(on.body.siteId, "SEC-JP-TOYOSHIMA-001");

    const readOn = await request(app).get("/api/notifications/staff-focus").query({
      endpoint,
    });
    assert.equal(readOn.status, 200);
    assert.equal(readOn.body.enabled, true);
    assert.equal(readOn.body.propertyId, "HOME-JP-TOYOSHIMA");

    const off = await request(app)
      .post("/api/notifications/staff-focus")
      .send({ endpoint, enabled: false, siteId: "SEC-JP-TOYOSHIMA-001" });
    assert.equal(off.status, 200);
    assert.equal(off.body.enabled, false);

    const readOff = await request(app)
      .get("/api/notifications/staff-focus")
      .query({ endpoint });
    assert.equal(readOff.body.enabled, false);

    const after = getDatabase()
      .prepare(
        `SELECT site_id, property_id, customer_code, active
         FROM notification_tokens WHERE endpoint = ?`
      )
      .get(endpoint) as typeof before;
    assert.deepEqual(after, before);

    const missing = await request(app)
      .post("/api/notifications/staff-focus")
      .send({ endpoint: "", enabled: true, siteId: "SEC-JP-TOYOSHIMA-001" });
    assert.equal(missing.status, 400);
  });

  it("round-trips an enabled focus used by the push filter", () => {
    const endpoint = `https://push.example.com/staff-focus-filter-${Date.now()}`;
    const saved = saveStaffNotifyFocusV1({
      endpoint,
      enabled: true,
      siteId: "SEC-JP-TOYOSHIMA-001",
      propertyId: "HOME-JP-TOYOSHIMA",
    });
    assert.equal(saved.enabled, true);
    const map = new Map([
      [endpoint, { siteId: saved.siteId, propertyId: saved.propertyId }],
    ]);
    assert.equal(
      staffFocusAllowsPushV1(
        { endpoint, user_id: "toms-ops" },
        "SEC-JP-ITABASHI-LIVE",
        map
      ),
      false
    );
    saveStaffNotifyFocusV1({
      endpoint,
      enabled: false,
      siteId: "SEC-JP-TOYOSHIMA-001",
    });
    assert.equal(
      staffFocusAllowsPushV1(
        { endpoint, user_id: "toms-ops" },
        "SEC-JP-ITABASHI-LIVE",
        new Map()
      ),
      true
    );
  });
});
