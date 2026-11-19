/**
 * 稼働テレメトリのログと社内 Push。
 * 施主端末には WDT 警告を出さない。
 */

import { sendWebPush } from "../notification/channels/web-push.js";
import { noteDeviceHealthV1 } from "./home-device-health-v1.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";

export async function applyDeviceHealthV1(input: {
  siteId: string;
  uptimeSec?: unknown;
  resetReason?: unknown;
  doLimitCuts?: unknown;
}): Promise<void> {
  let noted: ReturnType<typeof noteDeviceHealthV1>;
  try {
    noted = noteDeviceHealthV1(input);
  } catch (err) {
    console.error(
      "[device-health] note",
      err instanceof Error ? err.message : err
    );
    return;
  }
  if (!noted.stored) return;
  for (const cut of noted.newCuts) {
    const limit =
      cut.limitSec == null ? "上限" : `${cut.limitSec}秒`;
    try {
      recordSystemLogV1({
        siteId: input.siteId,
        category: "rp2350_comm",
        message: `DO${cut.ch} を連続${limit}で遮断`,
      });
    } catch (err) {
      console.error(
        "[device-health] cut log",
        err instanceof Error ? err.message : err
      );
    }
  }
  if (!noted.staffAlert) return;
  try {
    recordSystemLogV1({
      siteId: input.siteId,
      category: "rp2350_comm",
      message: noted.staffAlert,
    });
  } catch {
    /* ログ失敗でも心拍は続ける */
  }
  try {
    await sendWebPush({
      title: noted.staffAlert,
      body: "社内画面の連続稼働と起動理由を確認してください。",
      eventType: "ops_wdt_frequent",
      deviceId: input.siteId,
      url: "/app/security",
      audience: "toms",
    });
  } catch (err) {
    console.error(
      "[device-health] staff push",
      err instanceof Error ? err.message : err
    );
  }
}
