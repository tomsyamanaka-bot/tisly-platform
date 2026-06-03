import {
  getMqttBridgeCertStatus,
  isLiveOpsMockPushEnabled,
  isMqttMockMode,
  listMqttBridgeLogs,
} from "./mqtt-live-push-bridge.js";
import { getQnapUploadConfig } from "../business/services/qnapBusinessArchive.js";
import { getGoogleOAuthStatus } from "../services/googleOAuthService.js";
import { getPdfRenderMode } from "../business/pdf/render.js";
import { getGmailSendMode } from "../business/services/gmailRealSend.js";
import { getWsClientCount } from "../ws/hub.js";
import { isLiveOpsMockPushRunning } from "./live-push-mock-control.js";

export interface LiveConnectionStatus {
  live: "live" | "offline" | "mock" | "warning";
  mqtt: {
    mode: "mock" | "real" | "disabled";
    mockPush: boolean;
    mockPushRunning: boolean;
    tls: ReturnType<typeof getMqttBridgeCertStatus>;
  };
  gmail: { mode: string; connected: boolean; sendMode: string; worker: "active" };
  qnap: { mode: "mock" | "real" };
  pdf: { mode: "html" | "puppeteer" };
  wsClients: number;
  bridgeLogs: ReturnType<typeof listMqttBridgeLogs>;
}

export function buildLiveConnectionStatus(): LiveConnectionStatus {
  const oauth = getGoogleOAuthStatus();
  const qnap = getQnapUploadConfig();
  const mqttMock = isMqttMockMode();
  const mockPush = isLiveOpsMockPushEnabled();
  const tls = getMqttBridgeCertStatus();
  const live: LiveConnectionStatus["live"] =
    tls.enabled && tls.mode === "incomplete"
      ? "warning"
      : mqttMock && mockPush
        ? "mock"
        : "live";
  return {
    live,
    mqtt: {
      mode: mqttMock ? "mock" : process.env.MQTT_SUBSCRIBER_ENABLED === "true" ? "real" : "disabled",
      mockPush,
      mockPushRunning: isLiveOpsMockPushRunning(),
      tls,
    },
    gmail: {
      mode: oauth.mode,
      connected: oauth.connected,
      sendMode: getGmailSendMode(),
      worker: "active",
    },
    qnap: { mode: qnap.mode },
    pdf: { mode: getPdfRenderMode() },
    wsClients: getWsClientCount(),
    bridgeLogs: listMqttBridgeLogs(20),
  };
}
