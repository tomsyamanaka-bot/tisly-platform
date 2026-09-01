import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customerControllerLabelV1,
  customerIoLabelV1,
  customerSiteTitleV1,
} from "../src/shared/customer/customer-display-labels-v1.js";
import { buildToyoshimaSecurityDashboardV1 } from "../src/home/home-toyoshima-security-v1.js";

describe("customer-display-labels-v1", () => {
  it("strips internal site ids from customer titles", () => {
    assert.equal(
      customerSiteTitleV1("豊島邸 (HOME-JP-TOYOSHIMA)"),
      "豊島邸"
    );
    assert.equal(
      customerSiteTitleV1("豊島邸 (Toyoshima Residence)"),
      "豊島邸"
    );
  });

  it("maps waveshare controller labels to field names", () => {
    assert.equal(
      customerControllerLabelV1(
        "Waveshare RP2350 8CH Relay Board (親機)"
      ),
      "主装置（8回路）"
    );
    assert.equal(
      customerControllerLabelV1(
        "Waveshare RP2350 6CH Relay Board (子機/拠点2)"
      ),
      "子機（6回路）"
    );
  });

  it("rewrites DI/DO to 入力/出力", () => {
    assert.equal(
      customerIoLabelV1("道路側 赤外線ビーム (DI1)"),
      "道路側 赤外線ビーム (入力1)"
    );
    assert.equal(
      customerIoLabelV1("100V 防犯ライト (DO1)"),
      "100V 防犯ライト (出力1)"
    );
  });
});

describe("toyoshima customer dashboard labels", () => {
  it("exposes Japanese customer labels and schedule fields", () => {
    const dash = buildToyoshimaSecurityDashboardV1();
    assert.equal(dash.displayName, "豊島邸");
    assert.match(dash.main.controllerLabel, /主装置/);
    assert.match(dash.detached.controllerLabel, /子機/);
    assert.ok(dash.commHealth);
    assert.ok(dash.notifySensors?.length === 3);
    assert.ok(dash.scheduleStart);
    assert.ok(dash.scheduleEnd);
    assert.match(dash.guardModeLabel, /警戒|24時間|解除/);
    assert.match(dash.main.di[0].label, /入力/);
  });
});
