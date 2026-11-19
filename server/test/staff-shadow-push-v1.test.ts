import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it, mock } from "node:test";
import { v4 as uuid } from "uuid";

process.env.JWT_SECRET = "test-jwt-staff-shadow-push-v1";
process.env.NODE_ENV = "test";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.VAPID_PUBLIC_KEY = "test-public-key";
process.env.VAPID_PRIVATE_KEY = "test-private-key";
process.env.TISLY_DB_PATH = "./data/test-staff-shadow-push-v1.db";

const { default: request } = await import("supertest");
const webpush = (await import("web-push")).default;
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { savePushSubscription, sendWebPush } = await import(
  "../src/notification/channels/web-push.js"
);
const {
  resetStaffNotifyPolicyForTestV1,
  setStaffTempNotifyV1,
} = await import("../src/notification/staff-notify-policy-v1.js");

const keys = {
  p256dh: "BOrri7HQZ2bM0B4aWj8vN0xKpQ2mR8sT1uV3wX5yZ7aB9cD1eF3gH5iJ7kL9mN1",
  auth: "tBHItJI5svbpez7KI4CCXg",
};
const owner = "https://push.example.com/toyoshima-owner-phone";
const shared = "https://push.example.com/staff-and-customer-phone";
const shadow = "https://push.example.com/staff-customer-overwrite";

describe("staff shadow push", () => {
  after(() => {
    closeDatabase();
    try {
      fs.unlinkSync(path.resolve("data/test-staff-shadow-push-v1.db"));
    } catch {
      /* テストDBは残さなくてよい */
    }
  });

  it("drops the shared customer row and keeps the owner's phone", async () => {
    process.env.VAPID_PUBLIC_KEY = "test-public-key";
    process.env.VAPID_PRIVATE_KEY = "test-private-key";
    resetStaffNotifyPolicyForTestV1();
    mock.method(webpush, "setVapidDetails", () => undefined);
    const sent: Array<{ endpoint: string; title: string }> = [];
    mock.method(
      webpush,
      "sendNotification",
      async (sub: { endpoint: string }, body: string) => {
        const payload = JSON.parse(body) as { title?: string };
        sent.push({
          endpoint: sub.endpoint,
          title: String(payload.title || ""),
        });
        return { statusCode: 201 };
      }
    );
    savePushSubscription(
      "customer-security",
      { endpoint: owner, keys },
      undefined,
      {
        siteId: "HOME-JP-TOYOSHIMA",
        propertyId: "HOME-JP-TOYOSHIMA",
        customerCode: "TOYOSHIMA001",
      }
    );
    savePushSubscription("toms-ops", { endpoint: shared, keys });
    savePushSubscription(
      "customer-security",
      { endpoint: shadow, keys },
      undefined,
      {
        siteId: "HOME-JP-TOYOSHIMA",
        propertyId: "HOME-JP-TOYOSHIMA",
        customerCode: "TOYOSHIMA001",
      }
    );
    getDatabase()
      .prepare(
        `INSERT INTO notification_tokens (
           id, user_id, channel, token, endpoint, keys_json, active,
           site_id, property_id, customer_code
         ) VALUES (?, 'customer-security', 'web_push', ?, ?, ?, 1,
           'HOME-JP-TOYOSHIMA', 'HOME-JP-TOYOSHIMA', 'TOYOSHIMA001')`
      )
      .run(uuid(), shared, shared, JSON.stringify(keys));

    const near = {
      title: "建物側・近センサー検知",
      body: "建物側・近センサー検知が反応しました（豊島邸）",
      eventType: "toyoshima_main_beam_near",
      deviceId: "HOME-JP-TOYOSHIMA",
      data: {
        siteId: "HOME-JP-TOYOSHIMA",
        customerCode: "TOYOSHIMA001",
      },
    };
    await sendWebPush(near);
    assert.equal(
      sent.some((row) => row.endpoint === shared),
      false
    );
    assert.equal(
      sent.some((row) => row.endpoint === owner),
      true
    );
    assert.equal(
      sent.find((row) => row.endpoint === owner)?.title.startsWith("[社内]"),
      false
    );

    const app = createApp();
    const stopped = await request(app)
      .post("/api/home/v1/staff-notify")
      .send({
        siteId: "HOME-JP-TOYOSHIMA",
        kind: "temp",
        minutes: 0,
        endpoint: shared,
      });
    assert.equal(stopped.status, 200);
    assert.equal(stopped.body.ok, true);
    const sharedRows = getDatabase()
      .prepare(
        `SELECT user_id, active FROM notification_tokens
         WHERE endpoint = ? ORDER BY user_id`
      )
      .all(shared) as Array<{ user_id: string; active: number }>;
    assert.equal(
      sharedRows.some(
        (row) =>
          row.user_id === "customer-security" && Number(row.active) !== 0
      ),
      false
    );
    const ownerRow = getDatabase()
      .prepare(
        `SELECT user_id, active, customer_code FROM notification_tokens
         WHERE endpoint = ?`
      )
      .get(owner) as {
      user_id: string;
      active: number;
      customer_code: string;
    };
    assert.equal(ownerRow.user_id, "customer-security");
    assert.equal(Number(ownerRow.active) !== 0, true);
    assert.equal(ownerRow.customer_code, "TOYOSHIMA001");

    const synced = await request(app)
      .post("/api/home/v1/staff-notify")
      .send({
        siteId: "HOME-JP-TOYOSHIMA",
        kind: "sync",
        endpoint: shadow,
      });
    assert.equal(synced.status, 200);
    assert.equal(Number(synced.body.shadowRemoved) > 0, true);
    const shadowRow = getDatabase()
      .prepare(
        `SELECT user_id FROM notification_tokens WHERE endpoint = ? AND active = 1`
      )
      .get(shadow) as { user_id: string };
    assert.equal(shadowRow.user_id, "toms-ops");
    assert.equal(ownerRow.user_id, "customer-security");

    sent.length = 0;
    await sendWebPush(near);
    assert.equal(
      sent.some((row) => row.endpoint === shared),
      false
    );
    assert.equal(
      sent.some((row) => row.endpoint === shadow),
      false
    );
    assert.equal(
      sent.some((row) => row.endpoint === owner),
      true
    );

    setStaffTempNotifyV1("HOME-JP-TOYOSHIMA", 30, Date.now());
    sent.length = 0;
    await sendWebPush(near);
    const staffHit = sent.find((row) => row.endpoint === shared);
    assert.ok(staffHit, "作業タイマー中は社内端末へ届く");
    assert.match(staffHit.title, /^\[社内/);
    assert.match(staffHit.title, /建物側・近センサー検知/);
    const ownerHit = sent.find((row) => row.endpoint === owner);
    assert.ok(ownerHit, "施主の別端末には届く");
    assert.equal(ownerHit.title.startsWith("[社内]"), false);
    mock.restoreAll();
  });
});
