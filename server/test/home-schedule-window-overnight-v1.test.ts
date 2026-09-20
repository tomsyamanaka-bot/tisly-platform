import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getJstMinutesOfDayV1,
  isHomeScheduleWindowActiveV1,
  isWithinTimeRange,
} from "../src/home/home-security-rules-v1.js";

/** JST の時分を表す Date（UTC 換算） */
function jstDate(hour: number, minute: number): Date {
  return new Date(Date.UTC(2026, 8, 7, hour - 9, minute, 0));
}

describe("isWithinTimeRange overnight", () => {
  it("covers overnight 18:00-06:00", () => {
    assert.equal(isWithinTimeRange("18:00", "06:00", jstDate(18, 0)), true);
    assert.equal(isWithinTimeRange("18:00", "06:00", jstDate(19, 0)), true);
    assert.equal(isWithinTimeRange("18:00", "06:00", jstDate(23, 30)), true);
    assert.equal(isWithinTimeRange("18:00", "06:00", jstDate(0, 0)), true);
    assert.equal(isWithinTimeRange("18:00", "06:00", jstDate(5, 59)), true);
    assert.equal(isWithinTimeRange("18:00", "06:00", jstDate(6, 0)), false);
    assert.equal(isWithinTimeRange("18:00", "06:00", jstDate(12, 0)), false);
    assert.equal(isWithinTimeRange("18:00", "06:00", jstDate(17, 59)), false);
  });

  it("covers same-day 09:00-17:00", () => {
    assert.equal(isWithinTimeRange("09:00", "17:00", jstDate(9, 0)), true);
    assert.equal(isWithinTimeRange("09:00", "17:00", jstDate(12, 0)), true);
    assert.equal(isWithinTimeRange("09:00", "17:00", jstDate(17, 0)), false);
    assert.equal(isWithinTimeRange("09:00", "17:00", jstDate(8, 0)), false);
  });

  it("treats equal start/end as all-day", () => {
    assert.equal(isWithinTimeRange("00:00", "00:00", jstDate(12, 0)), true);
  });

  it("uses UTC+9 arithmetic (hour12 trap)", () => {
    /* 19:00 JST = 10:00 UTC — 夜間窓内でブロックしない */
    const sevenPm = new Date("2026-09-20T10:00:00.000Z");
    assert.equal(getJstMinutesOfDayV1(sevenPm), 19 * 60);
    assert.equal(isWithinTimeRange("18:00", "06:00", sevenPm), true);
    const intlHour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Tokyo",
        hour: "2-digit",
        hourCycle: "h23",
      }).formatToParts(sevenPm).find((p) => p.type === "hour")?.value
    );
    assert.equal(intlHour, 19);
    /* 18:00 JST = 09:00 UTC — hour12 だと 6 時になる */
    const dusk = new Date("2026-09-20T09:00:00.000Z");
    assert.equal(getJstMinutesOfDayV1(dusk), 18 * 60);
    assert.equal(isWithinTimeRange("18:00", "06:00", dusk), true);
    /* 12:00 JST = 03:00 UTC — 日中は窓外 */
    const noon = new Date("2026-09-20T03:00:00.000Z");
    assert.equal(getJstMinutesOfDayV1(noon), 12 * 60);
    assert.equal(isWithinTimeRange("18:00", "06:00", noon), false);
    /* 21:00 JST = 12:00 UTC */
    const night = new Date("2026-09-20T12:00:00.000Z");
    assert.equal(getJstMinutesOfDayV1(night), 21 * 60);
    assert.equal(isWithinTimeRange("18:00", "06:00", night), true);
    /* 00:30 JST = 15:30 UTC 前日 */
    const afterMidnight = new Date("2026-09-19T15:30:00.000Z");
    assert.equal(getJstMinutesOfDayV1(afterMidnight), 30);
    assert.equal(isWithinTimeRange("18:00", "06:00", afterMidnight), true);
  });
});

describe("isHomeScheduleWindowActiveV1 overnight", () => {
  it("covers overnight 18:00-06:00", () => {
    assert.equal(
      isHomeScheduleWindowActiveV1("18:00", "06:00", jstDate(18, 0)),
      true
    );
    assert.equal(
      isHomeScheduleWindowActiveV1("18:00", "06:00", jstDate(19, 0)),
      true
    );
    assert.equal(
      isHomeScheduleWindowActiveV1("18:00", "06:00", jstDate(23, 30)),
      true
    );
    assert.equal(
      isHomeScheduleWindowActiveV1("18:00", "06:00", jstDate(0, 0)),
      true
    );
    assert.equal(
      isHomeScheduleWindowActiveV1("18:00", "06:00", jstDate(5, 59)),
      true
    );
    assert.equal(
      isHomeScheduleWindowActiveV1("18:00", "06:00", jstDate(6, 0)),
      false
    );
    assert.equal(
      isHomeScheduleWindowActiveV1("18:00", "06:00", jstDate(12, 0)),
      false
    );
    assert.equal(
      isHomeScheduleWindowActiveV1("18:00", "06:00", jstDate(17, 59)),
      false
    );
  });

  it("covers same-day 09:00-17:00", () => {
    assert.equal(
      isHomeScheduleWindowActiveV1("09:00", "17:00", jstDate(9, 0)),
      true
    );
    assert.equal(
      isHomeScheduleWindowActiveV1("09:00", "17:00", jstDate(12, 0)),
      true
    );
    assert.equal(
      isHomeScheduleWindowActiveV1("09:00", "17:00", jstDate(17, 0)),
      false
    );
    assert.equal(
      isHomeScheduleWindowActiveV1("09:00", "17:00", jstDate(8, 0)),
      false
    );
  });
});
