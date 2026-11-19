import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAstroWindowV1,
  hoursToHmV1,
  hmToMinutesV1,
  solarLocalHoursV1,
} from "../src/home/astro-schedule-v1.js";
import {
  deliveredLightScheduleV1,
  type HomeSecurityRulesV1,
} from "../src/home/home-security-rules-v1.js";

const TOKYO = { latitude: 35.68, longitude: 139.77 };

function hm(hours: number): string {
  return hoursToHmV1(hours);
}

describe("astronomical lighting schedule", () => {
  it("puts Tokyo summer sunset near 19:00 and winter near 16:30", () => {
    const summer = solarLocalHoursV1(
      "sunset",
      2026,
      6,
      21,
      TOKYO.latitude,
      TOKYO.longitude,
      32400
    );
    const winter = solarLocalHoursV1(
      "sunset",
      2026,
      12,
      22,
      TOKYO.latitude,
      TOKYO.longitude,
      32400
    );
    assert.ok(summer != null && winter != null);
    assert.ok(summer > 18.6 && summer < 19.4, hm(summer));
    assert.ok(winter > 16.2 && winter < 16.9, hm(winter));
  });

  it("applies sunset -15 and sunrise +15", () => {
    const window = buildAstroWindowV1({
      at: new Date("2026-12-22T03:00:00.000Z"),
      ...TOKYO,
      timezoneOffsetSec: 32400,
      sunsetOffsetMin: -15,
      sunriseOffsetMin: 15,
    });
    assert.ok(window);
    const start = hmToMinutesV1(window.startHm);
    const sunset = hmToMinutesV1(window.sunsetHm);
    const end = hmToMinutesV1(window.endHm);
    const sunrise = hmToMinutesV1(window.sunriseHm);
    assert.equal((start - sunset + 1440) % 1440, 1440 - 15);
    assert.equal((end - sunrise + 1440) % 1440, 15);
    assert.match(window.label, /本日の自動点灯時間/);
    assert.match(window.label, /日没-15分/);
    assert.match(window.label, /日の出\+15分/);
  });

  it("shifts the same place by one hour at Sydney offset", () => {
    const plus9 = solarLocalHoursV1(
      "sunset",
      2026,
      6,
      21,
      -33.87,
      151.21,
      32400
    );
    const plus10 = solarLocalHoursV1(
      "sunset",
      2026,
      6,
      21,
      -33.87,
      151.21,
      36000
    );
    assert.ok(plus9 != null && plus10 != null);
    const delta = (plus10 - plus9 + 24) % 24;
    assert.ok(Math.abs(delta - 1) < 0.02, `${plus9} ${plus10}`);
    assert.ok(plus10 < 17.5, hm(plus10));
  });

  it("keeps stored manual times unless astronomical mode is on", () => {
    const rules = {
      siteId: "HOME-JP-ITABASHI-LIVE",
      scheduleStart: "18:00",
      scheduleEnd: "06:00",
      lightingScheduleMode: "manual",
      latitude: TOKYO.latitude,
      longitude: TOKYO.longitude,
      timezoneOffsetSec: 32400,
      sunsetOffsetMin: -15,
      sunriseOffsetMin: 15,
    } as HomeSecurityRulesV1;
    const manual = deliveredLightScheduleV1(
      rules,
      new Date("2026-12-22T03:00:00.000Z")
    );
    assert.equal(manual.scheduleStart, "18:00");
    assert.equal(manual.scheduleEnd, "06:00");
    const astro = deliveredLightScheduleV1(
      { ...rules, lightingScheduleMode: "astronomical" },
      new Date("2026-12-22T03:00:00.000Z")
    );
    assert.notEqual(astro.scheduleStart, "18:00");
    assert.equal(astro.scheduleStart, astro.astro?.startHm);
  });
});
