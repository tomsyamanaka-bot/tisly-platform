import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export interface SecurityDemoInputConfig {
  label: string;
  eventType: string;
  notifyTitleOn: string;
  notifyBodyOn: string;
  notifyTitleOff: string;
  notifyBodyOff: string;
}

export interface SecurityDemoConfig {
  deviceId: string;
  deviceName: string;
  inputs: Record<string, SecurityDemoInputConfig>;
  armNotify: { title: string; body: string };
  disarmNotify: { title: string; body: string };
}

const DEFAULT_INPUT: SecurityDemoInputConfig = {
  label: "予備",
  eventType: "spare",
  notifyTitleOn: "センサー反応",
  notifyBodyOn: "予備入力",
  notifyTitleOff: "センサー復帰",
  notifyBodyOff: "予備入力",
};

const DEFAULT_CONFIG: SecurityDemoConfig = {
  deviceId: "rp2350-remote-test-01",
  deviceName: "TiSLY Lite Demo",
  inputs: {},
  armNotify: { title: "警戒ON", body: "システムが警戒モードになりました" },
  disarmNotify: { title: "警戒OFF", body: "システムが解除モードになりました" },
};

function configPath(): string {
  const envPath = process.env.SECURITY_DEMO_CONFIG_PATH?.trim();
  if (envPath) return envPath;
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "..", "..", "config", "security-demo.json");
}

let cached: SecurityDemoConfig | null = null;

export function loadSecurityDemoConfig(): SecurityDemoConfig {
  if (cached) return cached;
  const file = configPath();
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as SecurityDemoConfig;
    cached = { ...DEFAULT_CONFIG, ...raw, inputs: raw.inputs ?? {} };
    return cached;
  } catch {
    cached = { ...DEFAULT_CONFIG };
    return cached;
  }
}

export function resetSecurityDemoConfigCache(): void {
  cached = null;
}

export function getInputConfig(di: number): SecurityDemoInputConfig {
  const cfg = loadSecurityDemoConfig();
  return cfg.inputs[String(di)] ?? { ...DEFAULT_INPUT, label: `DI${di}` };
}

export function buildInputNotifyPayload(di: number, to: "on" | "off") {
  const inputCfg = getInputConfig(di);
  const demoCfg = loadSecurityDemoConfig();
  const title = to === "on" ? inputCfg.notifyTitleOn : inputCfg.notifyTitleOff;
  const body = to === "on" ? inputCfg.notifyBodyOn : inputCfg.notifyBodyOff;
  return {
    title,
    body,
    eventType: inputCfg.eventType,
    deviceId: demoCfg.deviceId,
    url: "/remote-test",
    data: {
      kind: "security",
      input: di,
      from: to === "on" ? "off" : "on",
      to,
      eventType: inputCfg.eventType,
      label: inputCfg.label,
    },
  };
}
