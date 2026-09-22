import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOARD_TEMP_EMERGENCY_C_V1,
  BOARD_TEMP_TOMS_ALERT_C_V1,
  buildBoardTempEmergencyPushV1,
  buildBoardTempTomsPushV1,
  customerBoardTempLevelV1,
  formatCustomerBoardTempLabelV1,
  isCustomerPushUserV1,
  isTomsOpsPushUserV1,
  nextBoardTempAlertLatchesV1,
  resolvePushAudienceUserIdV1,
} from "../src/home/home-board-temp-alert-v1.js";

describe("home-board-temp-alert-v1", () => {
  it("fires TOMS-only at 50C and emergency at 60C", () => {
    const idle = { tomsNotified: false, emergencyNotified: false };
    const at49 = nextBoardTempAlertLatchesV1(49.9, idle);
    assert.equal(at49.fireToms, false);
    assert.equal(at49.fireEmergency, false);

    const at50 = nextBoardTempAlertLatchesV1(BOARD_TEMP_TOMS_ALERT_C_V1, idle);
    assert.equal(at50.fireToms, true);
    assert.equal(at50.fireEmergency, false);

    const latched = nextBoardTempAlertLatchesV1(52, {
      tomsNotified: true,
      emergencyNotified: false,
    });
    assert.equal(latched.fireToms, false);

    const at60 = nextBoardTempAlertLatchesV1(BOARD_TEMP_EMERGENCY_C_V1, {
      tomsNotified: true,
      emergencyNotified: false,
    });
    assert.equal(at60.fireToms, false);
    assert.equal(at60.fireEmergency, true);
  });

  it("keeps customer status calm until 60C", () => {
    assert.equal(customerBoardTempLevelV1(52), "normal");
    assert.match(formatCustomerBoardTempLabelV1(52), /軽微な注意/);
    assert.equal(customerBoardTempLevelV1(60), "warning");
    assert.match(formatCustomerBoardTempLabelV1(36.2), /適温・正常/);
  });

  it("routes TOMS vs customer user ids", () => {
    assert.equal(isTomsOpsPushUserV1("toms-ops"), true);
    assert.equal(isTomsOpsPushUserV1("admin-default"), true);
    assert.equal(isCustomerPushUserV1("customer-security"), true);
    assert.equal(isCustomerPushUserV1("home-security"), false);
    assert.equal(resolvePushAudienceUserIdV1("toms", "home-security"), "toms-ops");
    assert.equal(
      resolvePushAudienceUserIdV1("customer", "home-security"),
      "customer-security"
    );
    const toms = buildBoardTempTomsPushV1("豊島邸");
    assert.match(toms.body, /50℃/);
    assert.match(toms.body, /先回り点検/);
    const emg = buildBoardTempEmergencyPushV1("板橋自宅");
    assert.match(emg.body, /60℃/);
    assert.match(emg.body, /熱暴走/);
  });
});
