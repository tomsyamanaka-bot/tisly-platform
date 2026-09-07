import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
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
});

describe("isHomeScheduleWindowActiveV1 overnight", () => {
  it("covers overnight 18:00-06:00", () => {
    assert.equal(
      isHomeScheduleWindowActiveV1("18:00", "06:00", jstDate(18, 0)),
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
