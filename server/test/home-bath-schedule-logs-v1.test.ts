import assert from "node:assert/strict";
import { describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { findHomeSiteV1 } from "../src/home/home-sites-v1.js";
import {
  HOME_BATH_FILL_DURATION_MS_V1,
  startBathFillV1,
  stopBathFillV1,
  syncBathEstimationForSiteV1,
} from "../src/home/home-bath-state-v1.js";
import {
  cancelBathScheduleV1,
  createBathDelayScheduleV1,
  createBathDailyScheduleV1,
  computeNextDailyRunAtV1,
  listBathSchedulesV1,
  tickBathSchedulesV1,
} from "../src/home/home-bath-schedule-v1.js";
import { recordSystemLogV1 } from "../src/home/home-system-log-v1.js";
import { getDatabase } from "../src/db/database.js";
import { resetRemoteTestState } from "../src/remote-test/remote-test-state.js";
import { applyHomeControlV1 } from "../src/home/home-control-v1.js";
import { buildHomeCustomerDashboardV1 } from "../src/home/home-dashboard-v1.js";

const app = createApp();
const ITABASHI_SITE = "HOME-JP-ITABASHI-LIVE";

describe("home-bath-schedule-logs-v1", () => {
  it("starts oneshot bath with 30-minute estimation", () => {
    resetRemoteTestState();
    const site = findHomeSiteV1(ITABASHI_SITE);
    site.bath.fillState = "idle";
    site.bath.fillStartedAt = null;
    site.bath.fillEstimatedEndAt = null;

    const result = startBathFillV1({ site, actor: "test", source: "manual" });
    assert.equal(result.ok, true);
    assert.equal(site.bath.fillState, "filling");
    assert.ok(site.bath.fillStartedAt);
    assert.ok(site.bath.fillEstimatedEndAt);
    const remainMs =
      Date.parse(site.bath.fillEstimatedEndAt!) - Date.now();
    assert.ok(remainMs > HOME_BATH_FILL_DURATION_MS_V1 - 5000);
    assert.ok(remainMs <= HOME_BATH_FILL_DURATION_MS_V1);
  });

  it("stops filling bath with another pulse", () => {
    resetRemoteTestState();
    const site = findHomeSiteV1(ITABASHI_SITE);
    startBathFillV1({ site, actor: "test", source: "manual" });
    const stopped = stopBathFillV1({ site, actor: "test" });
    assert.equal(stopped.ok, true);
    assert.equal(site.bath.fillState, "idle");
    assert.equal(site.bath.lastPulseMessage, "停止中");
  });

  it("toggles auto_fill: start then stop via control API", async () => {
    resetRemoteTestState();
    const site = findHomeSiteV1(ITABASHI_SITE);
    site.bath.fillState = "idle";
    site.bath.fillEstimatedEndAt = null;

    const start = await applyHomeControlV1({
      siteId: ITABASHI_SITE,
      target: "bath",
      action: "auto_fill",
    });
    assert.equal(start.ok, true);
    assert.equal(site.bath.fillState, "filling");

    const stop = await applyHomeControlV1({
      siteId: ITABASHI_SITE,
      target: "bath",
      action: "auto_fill",
    });
    assert.equal(stop.ok, true);
    assert.equal(site.bath.fillState, "idle");
  });

  it("auto completes bath after estimated end", () => {
    const site = findHomeSiteV1(ITABASHI_SITE);
    site.bath.fillState = "filling";
    site.bath.fillEstimatedEndAt = new Date(Date.now() - 1000).toISOString();
    const changed = syncBathEstimationForSiteV1(site);
    assert.equal(changed, true);
    assert.equal(site.bath.fillState, "done");
    assert.match(site.bath.lastPulseMessage || "", /湯はり完了/);
  });

  it("creates delay and daily schedules", () => {
    const delay = createBathDelayScheduleV1({
      siteId: ITABASHI_SITE,
      delayMinutes: 30,
      actor: "test",
    });
    assert.equal(delay.kind, "delay");
    assert.equal(delay.delayMinutes, 30);
    assert.ok(delay.nextRunAt);

    const daily = createBathDailyScheduleV1({
      siteId: ITABASHI_SITE,
      dailyTime: "18:30",
      actor: "test",
    });
    assert.equal(daily.kind, "daily");
    assert.equal(daily.dailyTime, "18:30");
    assert.ok(daily.nextRunAt);

    const next = computeNextDailyRunAtV1("18:30");
    assert.ok(Date.parse(next) > Date.now());
  });

  it("executes due delay schedule and logs it", () => {
    resetRemoteTestState();
    const site = findHomeSiteV1(ITABASHI_SITE);
    site.bath.fillState = "idle";

    const schedule = createBathDelayScheduleV1({
      siteId: ITABASHI_SITE,
      delayMinutes: 30,
      actor: "test",
    });

    const db = getDatabase();
    db.prepare(
      `UPDATE home_bath_schedules_v1
       SET next_run_at = ?
       WHERE id = ?`
    ).run(new Date(Date.now() - 1000).toISOString(), schedule.id);

    const executed = tickBathSchedulesV1();
    assert.ok(executed >= 1);
    assert.equal(site.bath.fillState, "filling");

    cancelBathScheduleV1({
      siteId: ITABASHI_SITE,
      scheduleId: schedule.id,
      actor: "test",
    });
    const remaining = listBathSchedulesV1(ITABASHI_SITE);
    assert.ok(!remaining.some((s) => s.id === schedule.id));
  });

  it("exposes /api/logs and bath dashboard countdown fields", async () => {
    recordSystemLogV1({
      siteId: ITABASHI_SITE,
      category: "manual_control",
      message: "板橋自宅: テストログ",
      actor: "test",
    });

    const logsRes = await request(app).get(
      `/api/logs?siteId=${ITABASHI_SITE}&limit=5`
    );
    assert.equal(logsRes.status, 200);
    assert.equal(logsRes.body.ok, true);
    assert.ok(Array.isArray(logsRes.body.logs));
    assert.ok(logsRes.body.logs.some((l: { message: string }) =>
      l.message.includes("テストログ")
    ));

    const dash = buildHomeCustomerDashboardV1(ITABASHI_SITE);
    assert.ok("remainingSeconds" in dash.bath);
    assert.ok("countdownLabel" in dash.bath);
    assert.ok("fillEstimatedEndAt" in dash.bath);
  });

  it("exposes bath schedule API", async () => {
    const list = await request(app).get(
      `/api/home/v1/bath-schedules?siteId=${ITABASHI_SITE}`
    );
    assert.equal(list.status, 200);
    assert.equal(list.body.ok, true);
    assert.deepEqual(list.body.delayOptions, [30, 60, 90]);

    const create = await request(app)
      .post("/api/home/v1/bath-schedules")
      .send({
        siteId: ITABASHI_SITE,
        kind: "delay",
        delayMinutes: 60,
        actor: "test",
      });
    assert.equal(create.status, 201);
    assert.equal(create.body.schedule.kind, "delay");

    const del = await request(app)
      .delete(
        `/api/home/v1/bath-schedules/${create.body.schedule.id}?siteId=${ITABASHI_SITE}`
      )
      .send({ actor: "test" });
    assert.equal(del.status, 200);
    assert.equal(del.body.ok, true);
  });
});
