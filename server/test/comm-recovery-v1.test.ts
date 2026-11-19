import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMM_RECOVERY_COOLDOWN_MS_V1,
  formatDowntimeJaV1,
  noteCommOfflineV1,
  peekCommOfflineV1,
  resetCommRecoveryForTestV1,
  takeCommRecoveryV1,
} from "../src/home/home-comm-recovery-v1.js";
import {
  classifyStaffEventClassV1,
  decideStaffNotifyV1,
  resetStaffNotifyPolicyForTestV1,
} from "../src/notification/staff-notify-policy-v1.js";

const SITE = "HOME-JP-ITABASHI-LIVE";

describe("communication recovery", () => {
  it("formats minutes and hours", () => {
    assert.equal(formatDowntimeJaV1(6 * 60_000), "約6分");
    assert.equal(formatDowntimeJaV1(90 * 60_000), "1時間30分");
  });

  it("pushes after a notified outage and clears the flags", () => {
    resetCommRecoveryForTestV1();
    noteCommOfflineV1(SITE, "main", 1_000, true);
    const plan = takeCommRecoveryV1({
      siteId: SITE,
      deviceKey: "main",
      siteName: "板橋自宅",
      atMs: 1_000 + 8 * 60_000,
      maintenance: false,
    });
    assert.equal(plan.action, "push");
    assert.equal(plan.downtimeLabel, "約8分");
    assert.match(plan.logMessage, /通信復旧（停止時間：約8分）/);
    assert.match(plan.staffTitle, /【通信復旧】\[社内\] 板橋自宅/);
    assert.match(plan.customerTitle, /システムの通信が正常に復帰しました/);
    const left = peekCommOfflineV1(SITE, "main");
    assert.equal(left.offlineSince, null);
    assert.equal(left.offlineNotified, false);
  });

  it("logs only during maintenance", () => {
    resetCommRecoveryForTestV1();
    noteCommOfflineV1(SITE, "main", 1_000, true);
    const plan = takeCommRecoveryV1({
      siteId: SITE,
      siteName: "板橋自宅",
      atMs: 1_000 + 10 * 60_000,
      maintenance: true,
    });
    assert.equal(plan.action, "log");
    assert.equal(plan.reason, "maintenance");
    assert.equal(peekCommOfflineV1(SITE, "main").offlineSince, null);
  });

  it("suppresses a second push inside 15 minutes", () => {
    resetCommRecoveryForTestV1();
    const firstAt = 10_000;
    noteCommOfflineV1(SITE, "main", firstAt, true);
    const first = takeCommRecoveryV1({
      siteId: SITE,
      siteName: "板橋自宅",
      atMs: firstAt + 6 * 60_000,
      maintenance: false,
    });
    assert.equal(first.action, "push");
    noteCommOfflineV1(SITE, "main", firstAt + 7 * 60_000, true);
    const second = takeCommRecoveryV1({
      siteId: SITE,
      siteName: "板橋自宅",
      atMs: firstAt + 8 * 60_000,
      maintenance: false,
    });
    assert.equal(second.action, "log");
    assert.equal(second.reason, "cooldown");
    assert.ok(8 * 60_000 < COMM_RECOVERY_COOLDOWN_MS_V1);
  });

  it("keeps a titled recovery as critical without rewriting it", () => {
    resetStaffNotifyPolicyForTestV1();
    assert.equal(
      classifyStaffEventClassV1("comm_recovery"),
      "critical_maintenance"
    );
    const title =
      "🟢 【通信復旧】[社内] 板橋自宅：通信が正常に復帰しました（停止時間：約8分）";
    const plan = decideStaffNotifyV1({
      siteId: SITE,
      eventType: "comm_recovery",
      title,
    });
    assert.equal(plan.eventClass, "critical_maintenance");
    assert.equal(plan.deliver, true);
    assert.equal(plan.title, title);
  });
});
