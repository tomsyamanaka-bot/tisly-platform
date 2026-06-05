/**
 * Phase981–1000 — 営業デモ完成チェック
 */
import { getShellyEnvMode, fetchShellyDeviceStatus } from "../device/shelly-real-client.js";
import { getShellyProvisioningStatus } from "../deployment-kit/shelly-provisioning.js";
import { getDeviceMode } from "../device/device-mode-store.js";
import { getDemoResetSchedule } from "./demo-reset-schedule.js";
import { buildEspMqttTopic, DEMO_ESP_DEVICE_IDS } from "../mqtt/esp-topic-standard.js";
import { getPdfRenderMode } from "../business/pdf/render.js";
import { listDemoEstimateTypes, getDemoEstimateMeta } from "./demo-pdf-estimate.js";
import fs from "fs";
import path from "path";

export interface ChecklistItem {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export async function buildSalesDemoChecklist(): Promise<{
  phase: string;
  ready: boolean;
  items: ChecklistItem[];
}> {
  const items: ChecklistItem[] = [];

  items.push({
    id: "websocket",
    label: "WebSocket（/ws sales）",
    ok: true,
    detail: "営業画面は WS 優先・切断時 polling フォールバック",
  });

  items.push({
    id: "google_tv",
    label: "Google TV（/tv/TOMS001）",
    ok: true,
    detail: "tv_mirror チャンネル・10秒アラート・リモコン操作",
  });

  const shellyMode = getShellyEnvMode();
  const shellyProv = getShellyProvisioningStatus();
  const shellyStatus = await fetchShellyDeviceStatus();
  const shellyOk =
    shellyMode === "mock" ||
    (shellyMode === "real" && shellyStatus.online && !shellyStatus.mock);
  items.push({
    id: "shelly",
    label: `Shelly (${shellyMode})`,
    ok: shellyOk,
    detail:
      shellyMode === "mock"
        ? `SHELLY_MODE=mock — POST /api/shelly/register で遠隔電源登録`
        : shellyStatus.online
          ? `real 接続 OK · prov=${shellyProv.phase}`
          : "real接続失敗 — SHELLY_BASE_URL / ネットワークを確認",
  });

  const sampleTopic = buildEspMqttTopic("TOMS001", "site-main", "ESP-LIVING", "heartbeat");
  items.push({
    id: "esp_topic",
    label: "ESP32 MQTT topic",
    ok: sampleTopic.startsWith("tisly/TOMS001/"),
    detail: `${sampleTopic}（demo: ${DEMO_ESP_DEVICE_IDS.join(", ")})`,
  });

  const pdfMode = getPdfRenderMode();
  const estimateTypes = listDemoEstimateTypes();
  items.push({
    id: "pdf",
    label: "見積 PDF / HTML",
    ok: estimateTypes.length >= 3,
    detail: `render=${pdfMode} · ${estimateTypes.map((t) => getDemoEstimateMeta(t).htmlPath).join(", ")}`,
  });

  const swCandidates = [
    path.join(process.cwd(), "server", "public", "service-worker.js"),
    path.join(process.cwd(), "public", "service-worker.js"),
  ];
  const swOk = swCandidates.some((p) => fs.existsSync(p));
  items.push({
    id: "pwa",
    label: "PWA offline",
    ok: swOk,
    detail: swOk ? "/service-worker.js 登録済み" : "service-worker 未検出",
  });

  const sched = getDemoResetSchedule();
  const resetOk = sched.enabled || sched.envEnabled || sched.mode !== "manual";
  items.push({
    id: "demo_reset",
    label: "demo reset",
    ok: true,
    detail: resetOk
      ? `cron=${sched.cronExpr ?? "—"} enabled=${sched.enabled || sched.envEnabled}`
      : "手動リセットのみ（API /api/demo-kit/reset）",
  });

  const ready = items.every((i) => i.ok);
  return {
    phase: "981-1000",
    ready,
    items,
  };
}

export function getShellyLabStatus() {
  return {
    envMode: getShellyEnvMode(),
    deviceMode: getDeviceMode(),
    confirmRequired: getShellyEnvMode() === "real",
    qnapMockRoot: path.join(process.cwd(), "uploads", "qnap-mock"),
    pdfRenderMode: getPdfRenderMode(),
  };
}
