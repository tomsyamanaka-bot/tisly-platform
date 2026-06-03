import fs from "fs";
import path from "path";
import type { IClientOptions } from "mqtt";

export interface MqttTlsStatus {
  enabled: boolean;
  configured: boolean;
  ready: boolean;
  mode: "disabled" | "mock" | "tls" | "incomplete";
  caPath?: string;
  certPath?: string;
  keyPath?: string;
  message: string;
}

function resolvePath(p: string | undefined): string | null {
  if (!p?.trim()) return null;
  const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
  return fs.existsSync(abs) ? abs : null;
}

export function isMqttTlsEnvEnabled(): boolean {
  return process.env.MQTT_TLS_ENABLED === "true";
}

export function getMqttTlsStatus(mockMode: boolean): MqttTlsStatus {
  const enabled = isMqttTlsEnvEnabled();
  const caPath = process.env.MQTT_CA_PATH;
  const certPath = process.env.MQTT_CERT_PATH;
  const keyPath = process.env.MQTT_KEY_PATH;
  const ca = resolvePath(caPath);
  const cert = resolvePath(certPath);
  const key = resolvePath(keyPath);
  const configured = Boolean(caPath || certPath || keyPath);

  if (mockMode) {
    return {
      enabled,
      configured,
      ready: false,
      mode: "mock",
      caPath,
      certPath,
      keyPath,
      message: "MQTT mock mode — TLS not used",
    };
  }

  if (!enabled) {
    return {
      enabled: false,
      configured,
      ready: false,
      mode: "disabled",
      caPath,
      certPath,
      keyPath,
      message: "MQTT_TLS_ENABLED is not true — plain or mock",
    };
  }

  if (!ca && !cert && !key) {
    return {
      enabled: true,
      configured: false,
      ready: false,
      mode: "incomplete",
      caPath,
      certPath,
      keyPath,
      message: "TLS enabled but certificate paths missing — falling back to mock/disabled",
    };
  }

  if (!ca || !cert || !key) {
    return {
      enabled: true,
      configured: true,
      ready: false,
      mode: "incomplete",
      caPath,
      certPath,
      keyPath,
      message: "MQTT TLS incomplete (CA, cert, and key required)",
    };
  }

  return {
    enabled: true,
    configured: true,
    ready: true,
    mode: "tls",
    caPath,
    certPath,
    keyPath,
    message: "MQTT TLS client certificates loaded",
  };
}

export function shouldFallbackMqttTls(mockMode: boolean): boolean {
  if (mockMode) return false;
  const st = getMqttTlsStatus(mockMode);
  if (!st.enabled) return false;
  return !st.ready;
}

export function buildMqttConnectOptions(
  base: { clientId: string; username?: string; password?: string },
  mockMode: boolean
): IClientOptions & { protocol?: string } {
  const opts: IClientOptions = {
    clientId: base.clientId,
    username: base.username || undefined,
    password: base.password || undefined,
    reconnectPeriod: 5000,
  };

  const tls = getMqttTlsStatus(mockMode);
  if (!tls.ready || mockMode || !tls.enabled) return opts;

  const ca = resolvePath(process.env.MQTT_CA_PATH);
  const cert = resolvePath(process.env.MQTT_CERT_PATH);
  const key = resolvePath(process.env.MQTT_KEY_PATH);
  if (!ca || !cert || !key) return opts;

  opts.ca = fs.readFileSync(ca);
  opts.cert = fs.readFileSync(cert);
  opts.key = fs.readFileSync(key);
  opts.rejectUnauthorized = process.env.MQTT_TLS_REJECT_UNAUTHORIZED !== "false";
  return opts;
}

export function mqttUrlWithTls(url: string, mockMode: boolean): string {
  const tls = getMqttTlsStatus(mockMode);
  if (!tls.ready || mockMode || !tls.enabled) return url;
  if (url.startsWith("mqtt://")) return url.replace(/^mqtt:\/\//, "mqtts://");
  return url;
}
