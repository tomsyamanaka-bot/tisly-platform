/**
 * 龍ヶ崎店の状態・設定・テスト API。
 * お客様の詳細設定は確認後だけ実機へ出す。
 * 豊島邸と板橋の経路には足さない。
 */

import type { Router } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import {
  RYUGASAKI_CUSTOMER_CODE_V1,
  RYUGASAKI_DEVICE_ID_V1,
  SEC_JP_RYUGASAKI_SITE_ID_V1,
  applyRyugasakiRemoteControlV1,
  buildRyugasakiStatusV1,
  consumeRyugasakiDeviceCommandV1,
  processRyugasakiSecurityEventV1,
  recordRyugasakiHeartbeatV1,
  serializeRyugasakiCommandV1,
} from "../../home/home-ryugasaki-security-v1.js";
import {
  getRyugasakiCustomerSettingsV1,
  saveRyugasakiCustomerSettingsV1,
} from "../../home/home-ryugasaki-settings-v1.js";
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
  return code === RYUGASAKI_CUSTOMER_CODE_V1;
}

export function registerRyugasakiSecurityRoutesV1(router: Router): void {
  router.get("/ryugasaki/status", (_req, res) => {
    noStore(res);
    const settings = getRyugasakiCustomerSettingsV1();
    res.json({ ...buildRyugasakiStatusV1(), settings });
  });

  router.get("/ryugasaki/settings", (_req, res) => {
    noStore(res);
    res.json({ ok: true, settings: getRyugasakiCustomerSettingsV1() });
  });

  router.put(
    "/ryugasaki/settings",
    requireAuth("viewer"),
    (req: AuthedRequest, res) => {
      if (!actorMayEdit(req)) {
        res.status(403).json({ ok: false, error: "この店舗の設定は変更できません" });
        return;
      }
      const settings = saveRyugasakiCustomerSettingsV1({
        siteId: SEC_JP_RYUGASAKI_SITE_ID_V1,
        di3ConfirmMs: req.body?.di3ConfirmMs,
        do1DurationSec: req.body?.do1DurationSec,
        do2DurationSec: req.body?.do2DurationSec,
      });
      res.json({ ok: true, settings });
    }
  );

  router.post(
    "/ryugasaki/test",
    requireAuth("viewer"),
    (req: AuthedRequest, res) => {
      if (!actorMayEdit(req)) {
        res.status(403).json({ ok: false, error: "この店舗のテストは実行できません" });
        return;
      }
      const result = applyRyugasakiRemoteControlV1({
        action: String(req.body?.action ?? ""),
        confirmed: req.body?.confirmed,
        actor: "customer",
      });
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      res.json({
        ok: true,
        queued: true,
        command: result.command,
        channels: result.channels,
        durationSec: result.durationSec,
        settings: getRyugasakiCustomerSettingsV1(),
      });
    }
  );

  router.get("/ryugasaki/command", (req, res) => {
    if (!deviceTokenOk(req)) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }
    const command = serializeRyugasakiCommandV1(
      consumeRyugasakiDeviceCommandV1()
    );
    res.json({
      ...command,
      settings: getRyugasakiCustomerSettingsV1(),
    });
  });

  router.get("/ryugasaki/config", (req, res) => {
    if (!deviceTokenOk(req)) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }
    noStore(res);
    res.json({
      ok: true,
      deviceId: RYUGASAKI_DEVICE_ID_V1,
      settings: getRyugasakiCustomerSettingsV1(),
    });
  });

  router.post("/ryugasaki/event", async (req, res) => {
    const di = Number(req.body?.di);
    if (di !== 1 && di !== 2 && di !== 3) {
      res.status(400).json({ ok: false, error: "di must be 1, 2 or 3" });
      return;
    }
    try {
      const result = await processRyugasakiSecurityEventV1({
        siteId: String(req.body?.siteId ?? SEC_JP_RYUGASAKI_SITE_ID_V1),
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

  router.post("/ryugasaki/heartbeat", async (req, res) => {
    try {
      await recordRyugasakiHeartbeatV1({
        deviceId: req.body?.deviceId,
        boardTemp: req.body?.board_temp ?? req.body?.boardTemp,
      });
      const kitting = extractTislyKittingFromHeartbeatV1(req.body);
      const ota = recordTislyOtaDeviceFirmwareV1({
        siteKey: "ryugasaki",
        deviceId: String(req.body?.deviceId ?? RYUGASAKI_DEVICE_ID_V1),
        firmwareVersion: String(
          req.body?.firmware_version ?? req.body?.otaVersion ?? ""
        ).trim() || null,
        shippable: kitting.shippable,
        rgbStatus: kitting.rgbStatus,
        selfTest: kitting.selfTest,
      });
      const command = serializeRyugasakiCommandV1(
        consumeRyugasakiDeviceCommandV1()
      );
      res.json({
        ok: true,
        status: "ONLINE",
        settings: getRyugasakiCustomerSettingsV1(),
        command: command.command,
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
