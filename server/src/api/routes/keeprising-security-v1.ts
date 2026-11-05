/**
 * Keep Rising の状態・設定・日中テスト。
 * 設定は決定操作の PUT だけで保存する。
 * 他の顧客コードからは変更できない。
 */

import type { Router } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import {
  KEEPRISING_CUSTOMER_CODE_V1,
  KEEPRISING_DEVICE_ID_V1,
  SEC_JP_KEEPRISING_SITE_ID_V1,
  applyKeepRisingDayTestV1,
  buildKeepRisingStatusV1,
  notifyKeepRisingDayTestV1,
  consumeKeepRisingDeviceCommandV1,
  processKeepRisingSecurityEventV1,
  recordKeepRisingHeartbeatV1,
  serializeKeepRisingCommandV1,
} from "../../home/home-keeprising-security-v1.js";
import {
  getKeepRisingCustomerSettingsV1,
  saveKeepRisingCustomerSettingsV1,
} from "../../home/home-keeprising-settings-v1.js";
import {
  extractTislyKittingFromHeartbeatV1,
  recordTislyOtaDeviceFirmwareV1,
} from "../../firmware/tisly-rp2350-ota-v1.js";

function noStore(res: { setHeader: (k: string, v: string) => void }): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function deviceTokenOk(req: { headers: Record<string, unknown> }): boolean {
  const expected = String(process.env.REMOTE_TEST_TOKEN ?? "").trim();
  if (!expected) return true;
  const token = String(req.headers["x-remote-test-token"] ?? "").trim();
  return token === expected;
}

function actorMayEdit(req: AuthedRequest): boolean {
  if (req.admin?.scope === "platform") return true;
  const code = String(req.admin?.customerCode ?? "").trim().toUpperCase();
  return code === KEEPRISING_CUSTOMER_CODE_V1 || code === "RISING001";
}

export function registerKeepRisingSecurityRoutesV1(router: Router): void {
  router.get("/keeprising/status", (_req, res) => {
    noStore(res);
    res.json(buildKeepRisingStatusV1());
  });

  router.get("/keeprising/settings", (_req, res) => {
    noStore(res);
    res.json({
      ok: true,
      settings: getKeepRisingCustomerSettingsV1(),
    });
  });

  router.put(
    "/keeprising/settings",
    requireAuth("viewer"),
    (req: AuthedRequest, res) => {
      if (!actorMayEdit(req)) {
        res.status(403).json({
          ok: false,
          error: "この物件の設定は変更できません",
        });
        return;
      }
      const settings = saveKeepRisingCustomerSettingsV1({
        siteId: SEC_JP_KEEPRISING_SITE_ID_V1,
        scheduleStart: req.body?.scheduleStart,
        scheduleEnd: req.body?.scheduleEnd,
        durationSec: req.body?.durationSec,
        floodModes: req.body?.floodModes,
        guardMode: req.body?.guardMode,
      });
      res.json({ ok: true, settings, savedBy: "confirm" });
    }
  );

  router.post(
    "/keeprising/day-test",
    requireAuth("viewer"),
    async (req: AuthedRequest, res) => {
      if (!actorMayEdit(req)) {
        res.status(403).json({
          ok: false,
          error: "この物件のテストは実行できません",
        });
        return;
      }
      const result = applyKeepRisingDayTestV1({
        di: req.body?.di,
        confirmed: req.body?.confirmed,
      });
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      await notifyKeepRisingDayTestV1(result.di, result.channels);
      res.json({
        ok: true,
        queued: true,
        command: result.command,
        di: result.di,
        channels: result.channels,
        durationSec: result.durationSec,
        settings: result.settings,
      });
    }
  );

  router.get("/keeprising/command", (req, res) => {
    if (!deviceTokenOk(req)) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }
    const command = serializeKeepRisingCommandV1(
      consumeKeepRisingDeviceCommandV1()
    );
    res.json({
      ...command,
      settings: getKeepRisingCustomerSettingsV1(),
    });
  });

  router.get("/keeprising/config", (req, res) => {
    if (!deviceTokenOk(req)) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }
    noStore(res);
    res.json({
      ok: true,
      deviceId: KEEPRISING_DEVICE_ID_V1,
      settings: getKeepRisingCustomerSettingsV1(),
    });
  });

  router.post("/keeprising/event", async (req, res) => {
    const di = Number(req.body?.di);
    if (di !== 1 && di !== 2 && di !== 3 && di !== 4) {
      res.status(400).json({ ok: false, error: "di must be 1, 2, 3 or 4" });
      return;
    }
    try {
      const result = await processKeepRisingSecurityEventV1({
        siteId: String(req.body?.siteId ?? SEC_JP_KEEPRISING_SITE_ID_V1),
        di,
        active: req.body?.active,
        deviceId: req.body?.deviceId,
        body: req.body ?? {},
      });
      res.json(result);
    } catch (err) {
      res.status(200).json({
        ok: true,
        accepted: true,
        pushSent: false,
        linkedOutput: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  router.post("/keeprising/heartbeat", async (req, res) => {
    try {
      await recordKeepRisingHeartbeatV1({
        deviceId: req.body?.deviceId,
        boardTemp:
          req.body?.board_temp ??
          req.body?.boardTemp ??
          req.body?.cabinetTemp ??
          req.body?.boardTempC,
        firmwareVersion: String(
          req.body?.firmware_version ?? req.body?.otaVersion ?? ""
        ).trim(),
      });
      const kitting = extractTislyKittingFromHeartbeatV1(req.body);
      const ota = recordTislyOtaDeviceFirmwareV1({
        siteKey: "keeprising",
        deviceId: String(req.body?.deviceId ?? KEEPRISING_DEVICE_ID_V1),
        firmwareVersion: String(
          req.body?.firmware_version ?? req.body?.otaVersion ?? ""
        ).trim() || null,
        shippable: kitting.shippable,
        rgbStatus: kitting.rgbStatus,
        selfTest: kitting.selfTest,
      });
      const command = serializeKeepRisingCommandV1(
        consumeKeepRisingDeviceCommandV1()
      );
      res.json({
        ok: true,
        status: "ONLINE",
        settings: getKeepRisingCustomerSettingsV1(),
        command: command.command,
        di: command.di,
        channels: command.channels,
        durationSec: command.durationSec,
        has_ota_update: ota.has_ota_update,
        update_required: ota.update_required,
        firmware_latest: ota.version,
        ota: {
          siteId: ota.siteId,
          version: ota.version,
          has_ota_update: ota.has_ota_update,
          update_required: ota.update_required,
          files: ota.files,
          downloads: ota.downloads,
        },
      });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
