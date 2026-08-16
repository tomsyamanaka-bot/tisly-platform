#!/usr/bin/env tsx
/**
 * SwitchBot Cloud API v1.1 — デバイス一覧・疎通確認
 *
 * 使い方:
 *   cd server
 *   npx tsx scripts/list_switchbot_devices.ts
 *
 * 必要 env: SWITCHBOT_TOKEN, SWITCHBOT_SECRET
 * 任意: SWITCHBOT_LOCK_DEVICE_ID, SWITCHBOT_AIR_CONDITIONER_DEVICE_ID
 */

import {
  getSwitchBotHomeEnvV1,
  getSwitchBotLockStatusV1,
  isSwitchBotHomeConfiguredV1,
  listSwitchBotDevicesV1,
} from "../src/home/switchbot_client.js";

async function main(): Promise<void> {
  const env = getSwitchBotHomeEnvV1();
  console.log("=== SwitchBot device list (HOME) ===");
  console.log(
    `configured: ${isSwitchBotHomeConfiguredV1(env) ? "yes" : "no"}`
  );
  console.log(
    `lockDeviceId: ${env.lockDeviceId || "(unset)"}`
  );
  console.log(
    `airConditionerDeviceId: ${env.airConditionerDeviceId || "(unset)"}`
  );
  console.log("");

  if (!isSwitchBotHomeConfiguredV1(env)) {
    console.error(
      "ERROR: Set SWITCHBOT_TOKEN and SWITCHBOT_SECRET in server/.env"
    );
    process.exitCode = 1;
    return;
  }

  const listed = await listSwitchBotDevicesV1(env);
  if (!listed.ok || !listed.data) {
    console.error("Failed to list devices:", listed.error);
    process.exitCode = 1;
    return;
  }

  const physical = listed.data.filter((d) => !d.infrared);
  const infrared = listed.data.filter((d) => d.infrared);

  console.log(`Physical devices (${physical.length}):`);
  for (const d of physical) {
    const mark =
      d.deviceId === env.lockDeviceId ? " ← SWITCHBOT_LOCK_DEVICE_ID" : "";
    console.log(
      `  - [${d.deviceType}] ${d.deviceName}  id=${d.deviceId}${mark}`
    );
  }

  console.log("");
  console.log(`Infrared remotes (${infrared.length}):`);
  for (const d of infrared) {
    const mark =
      d.deviceId === env.airConditionerDeviceId
        ? " ← SWITCHBOT_AIR_CONDITIONER_DEVICE_ID"
        : "";
    console.log(
      `  - [${d.deviceType}] ${d.deviceName}  id=${d.deviceId}${mark}`
    );
  }

  if (env.lockDeviceId) {
    console.log("");
    console.log("--- Lock status probe ---");
    const status = await getSwitchBotLockStatusV1(env.lockDeviceId, env);
    if (!status.ok || !status.data) {
      console.error("Lock status failed:", status.error);
    } else {
      const s = status.data;
      console.log(
        `  lockState=${s.lockState} doorState=${s.doorState} battery=${s.battery ?? "n/a"}`
      );
    }
  }

  console.log("");
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
