import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectFieldCheckDedupeKeys,
  departureMatchesFieldCheckKey,
  fieldCheckDedupeKey,
  renderDeparturePrepHtml,
} from "../public/js/departure-reminder.js";

describe("材料チェック重複抑制", () => {
  it("同一キーで出発カードの材料リンクを隠す", () => {
    const date = "2026-06-14";
    const departure = {
      id: "dep-1",
      date,
      projectId: "SVY-001",
      firstEventId: "ev-1",
      eventTitle: "守谷現場",
      departureTime: "08:00",
      reminderTime: "07:30",
      reminderEnabled: true,
      fieldCheckUrl: "/field-check-v1?projectId=SVY-001",
    };
    const intelligence = {
      events: [
        {
          eventId: "ev-1",
          projectId: "SVY-001",
          title: "守谷現場",
          fieldCheck: { url: "/field-check-v1?x=1", checked: 0, total: 3 },
        },
      ],
    };
    const keys = collectFieldCheckDedupeKeys(intelligence, date);
    assert.ok(keys.has(fieldCheckDedupeKey({ date, projectId: "SVY-001", eventId: "ev-1" })));
    assert.equal(departureMatchesFieldCheckKey(departure, keys), true);
    const html = renderDeparturePrepHtml(departure, { hideMaterialCheck: true });
    assert.ok(!html.includes("材料チェックを開く"));
    assert.match(html, /予定内カードから開く/);
  });
});
