import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { getDatabase } from "../src/db/database.js";
import { savePushSubscription } from "../src/notification/channels/web-push.js";
import {
  pushPropertiesOverlapV1,
  pushRowMatchesPropertyScopeV1,
} from "../src/notification/push-property-scope-v1.js";

describe("customer push property scope", () => {
  it("treats Toyoshima HOME and SEC ids as one property", () => {
    assert.equal(
      pushPropertiesOverlapV1(
        ["HOME-JP-TOYOSHIMA"],
        ["SEC-JP-TOYOSHIMA-001"]
      ),
      true
    );
    assert.equal(
      pushPropertiesOverlapV1(
        ["HOME-JP-TOYOSHIMA"],
        ["HOME-JP-ITABASHI-LIVE"]
      ),
      false
    );
  });

  it("keeps unscoped and toms tokens, and filters other properties", () => {
    assert.equal(
      pushRowMatchesPropertyScopeV1(
        { user_id: "customer-security", site_id: "SEC-JP-TOYOSHIMA-001", property_id: "HOME-JP-TOYOSHIMA" },
        "HOME-JP-TOYOSHIMA"
      ),
      true
    );
    assert.equal(
      pushRowMatchesPropertyScopeV1(
        { user_id: "customer-security", site_id: "SEC-JP-ITABASHI-LIVE", property_id: "HOME-JP-ITABASHI-LIVE" },
        "HOME-JP-TOYOSHIMA"
      ),
      false
    );
    assert.equal(
      pushRowMatchesPropertyScopeV1(
        { user_id: "customer-security", site_id: null, property_id: null },
        "HOME-JP-TOYOSHIMA"
      ),
      true
    );
    assert.equal(
      pushRowMatchesPropertyScopeV1(
        { user_id: "toms-ops", site_id: "SEC-JP-ITABASHI-LIVE", property_id: "HOME-JP-ITABASHI-LIVE" },
        "HOME-JP-TOYOSHIMA"
      ),
      true
    );
  });

  it("stores the open property on subscribe", async () => {
    const endpoint = `https://push.example.com/sub/customer-scope-${Date.now()}`;
    const app = createApp();
    const res = await request(app)
      .post("/api/notifications/subscribe")
      .send({
        audience: "customer",
        userId: "home-security",
        siteId: "SEC-JP-TOYOSHIMA-001",
        propertyId: "HOME-JP-TOYOSHIMA",
        customerCode: "TOSHIMA001",
        subscription: {
          endpoint,
          keys: {
            p256dh: "BOrri7HQZ2bM0B4aWj8vN0xKpQ2mR8sT1uV3wX5yZ7aB9cD1eF3gH5iJ7kL9mN1",
            auth: "tBHItJI5svbpez7KI4CCXg",
          },
        },
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.userId, "customer-security");
    const row = getDatabase()
      .prepare(
        `SELECT user_id, site_id, property_id, customer_code
         FROM notification_tokens WHERE endpoint = ?`
      )
      .get(endpoint) as {
      user_id: string;
      site_id: string;
      property_id: string;
      customer_code: string;
    };
    assert.equal(row.user_id, "customer-security");
    assert.equal(row.site_id, "SEC-JP-TOYOSHIMA-001");
    assert.equal(row.property_id, "HOME-JP-TOYOSHIMA");
    assert.equal(row.customer_code, "TOYOSHIMA001");
  });

  it("savePushSubscription keeps a later property overwrite", () => {
    const endpoint = `https://push.example.com/sub/customer-scope-overwrite-${Date.now()}`;
    const keys = {
      p256dh: "BOrri7HQZ2bM0B4aWj8vN0xKpQ2mR8sT1uV3wX5yZ7aB9cD1eF3gH5iJ7kL9mN1",
      auth: "tBHItJI5svbpez7KI4CCXg",
    };
    savePushSubscription("customer-security", { endpoint, keys }, undefined, {
      siteId: "SEC-JP-ITABASHI-LIVE",
      propertyId: "HOME-JP-ITABASHI-LIVE",
      customerCode: "TOMS001",
    });
    savePushSubscription("customer-security", { endpoint, keys }, undefined, {
      siteId: "SEC-JP-TOYOSHIMA-001",
      propertyId: "HOME-JP-TOYOSHIMA",
      customerCode: "TOYOSHIMA001",
    });
    const row = getDatabase()
      .prepare(
        `SELECT site_id, property_id, customer_code FROM pwa_subscriptions WHERE endpoint = ?`
      )
      .get(endpoint) as {
      site_id: string;
      property_id: string;
      customer_code: string;
    };
    assert.equal(row.site_id, "SEC-JP-TOYOSHIMA-001");
    assert.equal(row.property_id, "HOME-JP-TOYOSHIMA");
    assert.equal(row.customer_code, "TOYOSHIMA001");
  });
});
