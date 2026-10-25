import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { mock, describe, it } from "node:test";
import request from "supertest";
import webpush from "web-push";
import { createApp } from "../src/app.js";
import { getDatabase } from "../src/db/database.js";
import {
  savePushSubscription,
  sendWebPush,
} from "../src/notification/channels/web-push.js";
import {
  loadEnabledStaffFocusMapV1,
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
    const client = fs.readFileSync(
      path.join(
        process.cwd(),
        "public/js/features/security/staff-notify-focus-v1.js"
      ),
      "utf8"
    );
    const remember = client.slice(
      client.indexOf("async function rememberActiveSiteV1"),
      client.indexOf("async function saveMuteForCurrentSiteV1")
    );
    assert.match(remember, /activeSiteId/);
    assert.doesNotMatch(remember, /muteOtherSites/);
    assert.match(client, /showSiteMute/);
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
      staffFocusAllowsPushV1(
        { endpoint, user_id: "home-security" },
        "HOME-JP-ITABASHI-LIVE",
        focused
      ),
      false
    );
    assert.equal(
      staffFocusAllowsPushV1(row, "TOYOSHIMA001", focused),
      true
    );
    assert.equal(
      staffFocusAllowsPushV1(row, "", focused),
      true
    );
  });

  it("lets a newer account mute override an older browser off switch", () => {
    const endpoint = "https://push.example.com/stale-off";
    const muted = new Map([
      [
        endpoint,
        {
          enabled: false,
          siteId: "SEC-JP-TOYOSHIMA-001",
          propertyId: "SEC-JP-TOYOSHIMA-001",
          updatedAt: "2026-10-25 00:00:00",
        },
      ],
      [
        "user:toms-ops",
        {
          enabled: true,
          siteId: "HOME-JP-ITABASHI-LIVE",
          propertyId: "SEC-JP-ITABASHI-LIVE",
          updatedAt: "2026-10-25T01:00:00.000Z",
        },
      ],
    ]);
    assert.equal(
      staffFocusAllowsPushV1(
        { endpoint, user_id: "toms-ops" },
        "TOYOSHIMA001",
        muted
      ),
      false
    );
    assert.equal(
      staffFocusAllowsPushV1(
        { endpoint, user_id: "home-security" },
        "TOYOSHIMA001",
        muted
      ),
      false
    );
    assert.equal(
      staffFocusAllowsPushV1(
        { endpoint, user_id: "field-operator" },
        "TOYOSHIMA001",
        muted
      ),
      false
    );
    assert.equal(
      staffFocusAllowsPushV1(
        { endpoint, user_id: "customer-security" },
        "TOYOSHIMA001",
        muted
      ),
      true
    );
    assert.equal(
      staffFocusAllowsPushV1(
        { endpoint, user_id: "cu-owner" },
        "TOYOSHIMA001",
        muted
      ),
      true
    );
    assert.equal(
      staffFocusAllowsPushV1(
        { endpoint, user_id: "toms-ops" },
        "HOME-JP-ITABASHI-LIVE",
        muted
      ),
      true
    );

    const released = new Map([
      [
        endpoint,
        {
          enabled: false,
          siteId: "SEC-JP-TOYOSHIMA-001",
          propertyId: "SEC-JP-TOYOSHIMA-001",
          updatedAt: "2026-10-25T02:00:00.000Z",
        },
      ],
      [
        "user:toms-ops",
        {
          enabled: true,
          siteId: "HOME-JP-ITABASHI-LIVE",
          propertyId: "SEC-JP-ITABASHI-LIVE",
          updatedAt: "2026-10-25T01:00:00.000Z",
        },
      ],
    ]);
    assert.equal(
      staffFocusAllowsPushV1(
        { endpoint, user_id: "toms-ops" },
        "TOYOSHIMA001",
        released
      ),
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

  it("skips another site's push and still keeps the alert log", async () => {
    process.env.VAPID_PUBLIC_KEY =
      process.env.VAPID_PUBLIC_KEY || "test-public-key";
    process.env.VAPID_PRIVATE_KEY =
      process.env.VAPID_PRIVATE_KEY || "test-private-key";
    const sent: string[] = [];
    mock.method(webpush, "setVapidDetails", () => undefined);
    mock.method(webpush, "sendNotification", async (sub: { endpoint: string }) => {
      sent.push(sub.endpoint);
      return { statusCode: 201 };
    });
    const stamp = Date.now();
    const staffEndpoint = `https://push.example.com/mute-staff-${stamp}`;
    const legacyEndpoint = `https://push.example.com/mute-legacy-${stamp}`;
    const customerEndpoint = `https://push.example.com/mute-customer-${stamp}`;
    const keys = {
      p256dh: "BOrri7HQZ2bM0B4aWj8vN0xKpQ2mR8sT1uV3wX5yZ7aB9cD1eF3gH5iJ7kL9mN1",
      auth: "tBHItJI5svbpez7KI4CCXg",
    };
    const staleEndpoint = `https://push.example.com/mute-stale-${stamp}`;
    savePushSubscription("toms-ops", { endpoint: staffEndpoint, keys });
    savePushSubscription("home-security", { endpoint: legacyEndpoint, keys });
    savePushSubscription("toms-ops", { endpoint: staleEndpoint, keys });
    saveStaffNotifyFocusV1({
      endpoint: staleEndpoint,
      enabled: false,
      siteId: "SEC-JP-TOYOSHIMA-001",
    });
    savePushSubscription(
      "customer-security",
      { endpoint: customerEndpoint, keys },
      undefined,
      {
        siteId: "HOME-JP-TOYOSHIMA",
        propertyId: "HOME-JP-TOYOSHIMA",
        customerCode: "TOYOSHIMA001",
      }
    );
    const app = createApp();
    const pref = await request(app).post("/api/user/preferences").send({
      endpoint: staffEndpoint,
      userId: "toms-ops",
      muteOtherSites: true,
      activeSiteId: "HOME-JP-ITABASHI-LIVE",
      propertyId: "SEC-JP-ITABASHI-LIVE",
    });
    assert.equal(pref.status, 200);
    assert.equal(pref.body.muteOtherSites, true);
    assert.equal(pref.body.activeSiteId, "HOME-JP-ITABASHI-LIVE");
    const readStale = await request(app)
      .get("/api/user/preferences")
      .query({ endpoint: staleEndpoint, userId: "toms-ops" });
    assert.equal(readStale.status, 200);
    assert.equal(readStale.body.muteOtherSites, true);
    assert.equal(readStale.body.activeSiteId, "HOME-JP-ITABASHI-LIVE");
    getDatabase()
      .prepare(
        `UPDATE pwa_subscriptions SET user_id = 'customer-security' WHERE endpoint = ?`
      )
      .run(staffEndpoint);
    const staffToken = getDatabase()
      .prepare(
        `SELECT user_id, site_id FROM notification_tokens WHERE endpoint = ?`
      )
      .get(staffEndpoint) as { user_id: string; site_id: string | null };
    assert.equal(staffToken.user_id, "toms-ops");

    try {
      const direct = await sendWebPush({
        title: "豊島邸テスト",
        body: "別現場",
        eventType: "staff_focus_mute_probe",
        deviceId: "HOME-JP-TOYOSHIMA",
        data: { siteId: "TOYOSHIMA001", customerCode: "TOYOSHIMA001" },
      });
      assert.equal(sent.includes(staffEndpoint), false);
      assert.equal(sent.includes(legacyEndpoint), false);
      assert.equal(sent.includes(staleEndpoint), false);
      assert.equal(sent.includes(customerEndpoint), true);
      assert.equal((direct.sent ?? 0) >= 1, true);

      const before = (
        getDatabase()
          .prepare(
            `SELECT COUNT(*) AS n FROM home_system_logs_v1
             WHERE site_id = 'HOME-JP-TOYOSHIMA' AND category = 'sensor_alert'`
          )
          .get() as { n: number }
      ).n;
      const triggered = await request(app)
        .post("/api/home/v1/hardware/test-di-trigger")
        .send({
          siteId: "HOME-JP-TOYOSHIMA",
          building: "main",
          di: 1,
        });
      assert.equal(triggered.status, 200);
      assert.equal(sent.includes(staffEndpoint), false);
      assert.equal(sent.includes(legacyEndpoint), false);
      assert.equal(sent.includes(staleEndpoint), false);
      const after = (
        getDatabase()
          .prepare(
            `SELECT COUNT(*) AS n FROM home_system_logs_v1
             WHERE site_id = 'HOME-JP-TOYOSHIMA' AND category = 'sensor_alert'`
          )
          .get() as { n: number }
      ).n;
      assert.equal(after > before, true);

      sent.length = 0;
      await sendWebPush({
        title: "板橋テスト",
        body: "選択中の現場",
        eventType: "staff_focus_allow_probe",
        deviceId: "HOME-JP-ITABASHI-LIVE",
        data: { siteId: "HOME-JP-ITABASHI-LIVE" },
      });
      assert.equal(sent.includes(staffEndpoint), true);
      assert.equal(sent.includes(legacyEndpoint), true);
      assert.equal(sent.includes(staleEndpoint), true);
      assert.equal(sent.includes(customerEndpoint), false);
    } finally {
      await request(app).post("/api/user/preferences").send({
        endpoint: staffEndpoint,
        userId: "toms-ops",
        muteOtherSites: false,
        activeSiteId: "HOME-JP-ITABASHI-LIVE",
      });
      mock.restoreAll();
    }
  });

  it("keeps each site's mute when the active site changes", async () => {
    const app = createApp();
    const userId = "toms-ops";
    const staff = { endpoint: "https://push.example.com/mute-by-site", user_id: userId };
    try {
      const itabashi = await request(app).post("/api/user/preferences").send({
        userId,
        activeSiteId: "HOME-JP-ITABASHI-LIVE",
        propertyId: "SEC-JP-ITABASHI-LIVE",
        muteOtherSites: true,
      });
      assert.equal(itabashi.status, 200);
      assert.equal(itabashi.body.muteOtherSites, true);
      assert.equal(itabashi.body.mutedSites.includes("HOME-JP-ITABASHI-LIVE"), true);

      const toyoshima = await request(app).post("/api/user/preferences").send({
        userId,
        activeSiteId: "SEC-JP-TOYOSHIMA-001",
        propertyId: "HOME-JP-TOYOSHIMA",
        muteOtherSites: false,
      });
      assert.equal(toyoshima.body.muteOtherSites, false);
      assert.equal(toyoshima.body.activeSiteId, "SEC-JP-TOYOSHIMA-001");
      assert.equal(toyoshima.body.muteBySite["HOME-JP-ITABASHI-LIVE"], true);
      assert.equal(toyoshima.body.muteBySite["SEC-JP-TOYOSHIMA-001"], false);

      const readItabashi = await request(app).get("/api/user/preferences").query({
        userId,
        siteId: "HOME-JP-ITABASHI-LIVE",
      });
      assert.equal(readItabashi.body.muteOtherSites, true);
      assert.equal(readItabashi.body.activeSiteId, "SEC-JP-TOYOSHIMA-001");
      const readToyoshima = await request(app).get("/api/user/preferences").query({
        userId,
        siteId: "SEC-JP-TOYOSHIMA-001",
      });
      assert.equal(readToyoshima.body.muteOtherSites, false);

      const back = await request(app).post("/api/user/preferences").send({
        userId,
        activeSiteId: "HOME-JP-ITABASHI-LIVE",
        propertyId: "SEC-JP-ITABASHI-LIVE",
      });
      assert.equal(back.body.muteOtherSites, true);
      assert.equal(back.body.activeSiteId, "HOME-JP-ITABASHI-LIVE");
      const stillToyoshima = await request(app)
        .get("/api/user/preferences")
        .query({ userId, siteId: "SEC-JP-TOYOSHIMA-001" });
      assert.equal(stillToyoshima.body.muteOtherSites, false);

      const muted = loadEnabledStaffFocusMapV1();
      assert.equal(staffFocusAllowsPushV1(staff, "TOYOSHIMA001", muted), false);
      assert.equal(
        staffFocusAllowsPushV1(staff, "HOME-JP-ITABASHI-LIVE", muted),
        true
      );
      assert.equal(
        staffFocusAllowsPushV1(
          { endpoint: staff.endpoint, user_id: "customer-security" },
          "TOYOSHIMA001",
          muted
        ),
        true
      );

      await request(app).post("/api/user/preferences").send({
        userId,
        activeSiteId: "SEC-JP-TOYOSHIMA-001",
      });
      const open = loadEnabledStaffFocusMapV1();
      assert.equal(
        staffFocusAllowsPushV1(staff, "HOME-JP-ITABASHI-LIVE", open),
        true
      );
      assert.equal(staffFocusAllowsPushV1(staff, "TOYOSHIMA001", open), true);
    } finally {
      await request(app).post("/api/user/preferences").send({
        userId,
        activeSiteId: "HOME-JP-ITABASHI-LIVE",
        muteOtherSites: false,
      });
      await request(app).post("/api/user/preferences").send({
        userId,
        activeSiteId: "SEC-JP-TOYOSHIMA-001",
        muteOtherSites: false,
      });
    }
  });
});
