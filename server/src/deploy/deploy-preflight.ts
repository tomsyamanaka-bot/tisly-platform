/**
 * Phase 1441–1460 — 本番設定監査 GET /api/deploy/preflight
 */

import { checkProductionEnv } from "../config/production-env-checker.js";
import { config } from "../config.js";

export type PreflightCategoryStatus = "ok" | "missing" | "warn";

export interface PreflightCategory {
  id: string;
  label: string;
  status: PreflightCategoryStatus;
  configured: string[];
  missing: string[];
  message: string;
}

export interface PreflightReport {
  generatedAt: string;
  ready: boolean;
  missing: string[];
  categories: PreflightCategory[];
}

export function buildDeployPreflight(
  source: NodeJS.ProcessEnv = process.env
): PreflightReport {
  const getEnv = (key: string, fallback = ""): string =>
    (source[key] ?? fallback).trim();

  const categories: PreflightCategory[] = [];

  const nodeEnv = getEnv("NODE_ENV", "development");
  categories.push({
    id: "NODE_ENV",
    label: "NODE_ENV",
    status: nodeEnv === "production" ? "ok" : "warn",
    configured: nodeEnv ? ["NODE_ENV"] : [],
    missing: nodeEnv !== "production" ? ["NODE_ENV=production"] : [],
    message:
      nodeEnv === "production"
        ? "NODE_ENV=production"
        : `現在 ${nodeEnv} — VPS 投入時は production に設定`,
  });

  const publicUrl = getEnv("TISLY_PUBLIC_URL") || getEnv("PUBLIC_BASE_URL") || config.publicUrl;
  const urlOk = publicUrl.startsWith("https://tisly.jp");
  categories.push({
    id: "TISLY_PUBLIC_URL",
    label: "TISLY_PUBLIC_URL",
    status: urlOk ? "ok" : publicUrl ? "warn" : "missing",
    configured: publicUrl ? ["TISLY_PUBLIC_URL"] : [],
    missing: urlOk ? [] : ["TISLY_PUBLIC_URL=https://tisly.jp"],
    message: urlOk ? publicUrl : `要設定: https://tisly.jp（現在: ${publicUrl || "未設定"}）`,
  });

  const jwt = getEnv("JWT_SECRET");
  const jwtOk = jwt.length >= 32 && !["change-me", "change-me-use-openssl-rand-hex-32"].includes(jwt);
  categories.push({
    id: "JWT",
    label: "JWT",
    status: jwtOk ? "ok" : jwt ? "warn" : "missing",
    configured: jwtOk ? ["JWT_SECRET"] : [],
    missing: jwtOk ? [] : ["JWT_SECRET"],
    message: jwtOk ? "JWT_SECRET 設定済み" : "JWT_SECRET 未設定または弱い値",
  });

  const adminUser = getEnv("ADMIN_USERNAME", "admin");
  const adminHash = getEnv("ADMIN_PASSWORD_HASH");
  const adminMissing: string[] = [];
  if (!adminUser) adminMissing.push("ADMIN_USERNAME");
  if (!adminHash) adminMissing.push("ADMIN_PASSWORD_HASH");
  categories.push({
    id: "ADMIN",
    label: "ADMIN",
    status: adminMissing.length === 0 ? "ok" : "missing",
    configured: [adminUser && "ADMIN_USERNAME", adminHash && "ADMIN_PASSWORD_HASH"].filter(Boolean) as string[],
    missing: adminMissing,
    message: adminMissing.length === 0 ? "管理者認証設定済み" : `不足: ${adminMissing.join(", ")}`,
  });

  const dbProvider = getEnv("DB_PROVIDER", "sqlite");
  const dbMissing: string[] = [];
  if (dbProvider === "postgres") {
    if (!getEnv("POSTGRES_PASSWORD") && !getEnv("POSTGRES_URL")) {
      dbMissing.push("POSTGRES_PASSWORD or POSTGRES_URL");
    }
  }
  categories.push({
    id: "DB",
    label: "DB",
    status: dbMissing.length === 0 ? "ok" : "missing",
    configured: ["DB_PROVIDER", dbProvider === "postgres" ? "POSTGRES_*" : "TISLY_DB_PATH"].filter(Boolean),
    missing: dbMissing,
    message:
      dbMissing.length === 0
        ? `DB_PROVIDER=${dbProvider}`
        : `postgres 設定不足: ${dbMissing.join(", ")}`,
  });

  const mqttMode = getEnv("MQTT_MODE", "mock").toLowerCase();
  const mqttMissing: string[] = [];
  if (mqttMode === "real") {
    if (!getEnv("MQTT_URL")) mqttMissing.push("MQTT_URL");
    if (getEnv("MQTT_SUBSCRIBER_ENABLED") !== "true") mqttMissing.push("MQTT_SUBSCRIBER_ENABLED");
  }
  categories.push({
    id: "MQTT",
    label: "MQTT",
    status: mqttMissing.length === 0 ? "ok" : "missing",
    configured: ["MQTT_MODE", mqttMode === "real" ? "MQTT_URL" : "MQTT_MOCK_MODE"].filter(Boolean),
    missing: mqttMissing,
    message:
      mqttMissing.length === 0
        ? `MQTT_MODE=${mqttMode}${mqttMode === "mock" ? "（初回公開安全）" : ""}`
        : `real モード不足: ${mqttMissing.join(", ")}`,
  });

  const qnapMode = getEnv("QNAP_MODE", "mock").toLowerCase();
  const qnapUpload = getEnv("QNAP_UPLOAD_MODE", "mock").toLowerCase();
  const qnapMissing: string[] = [];
  if (qnapMode === "real" && !getEnv("QNAP_HOST")) qnapMissing.push("QNAP_HOST");
  if (qnapUpload === "real" && !getEnv("QNAP_WEBDAV_URL")) qnapMissing.push("QNAP_WEBDAV_URL");
  categories.push({
    id: "QNAP",
    label: "QNAP",
    status: qnapMissing.length === 0 ? "ok" : "missing",
    configured: ["QNAP_MODE", "QNAP_UPLOAD_MODE"],
    missing: qnapMissing,
    message:
      qnapMissing.length === 0
        ? `QNAP_MODE=${qnapMode}, QNAP_UPLOAD_MODE=${qnapUpload}`
        : `real 設定不足: ${qnapMissing.join(", ")}`,
  });

  const gmailMode = getEnv("GMAIL_SEND_MODE", "mock").toLowerCase();
  const googleOAuth = getEnv("GOOGLE_OAUTH_ENABLED").toLowerCase() === "true";
  const gmailMissing: string[] = [];
  if (gmailMode === "real" || (googleOAuth && gmailMode !== "mock")) {
    if (!googleOAuth) gmailMissing.push("GOOGLE_OAUTH_ENABLED");
    if (googleOAuth && !getEnv("GOOGLE_CLIENT_ID")) gmailMissing.push("GOOGLE_CLIENT_ID");
  }
  categories.push({
    id: "GMAIL",
    label: "GMAIL",
    status: gmailMissing.length === 0 ? "ok" : "missing",
    configured: ["GMAIL_SEND_MODE", googleOAuth ? "GOOGLE_OAUTH_ENABLED" : ""].filter(Boolean),
    missing: gmailMissing,
    message:
      gmailMissing.length === 0
        ? `GMAIL_SEND_MODE=${gmailMode}（初回 mock 推奨）`
        : `real 送信不足: ${gmailMissing.join(", ")}`,
  });

  const shellyMode = getEnv("SHELLY_MODE", "mock").toLowerCase();
  const shellyMissing: string[] = [];
  if (shellyMode === "real" && !getEnv("SHELLY_BASE_URL")) shellyMissing.push("SHELLY_BASE_URL");
  categories.push({
    id: "SHELLY",
    label: "SHELLY",
    status: shellyMissing.length === 0 ? "ok" : "missing",
    configured: ["SHELLY_MODE"],
    missing: shellyMissing,
    message:
      shellyMissing.length === 0
        ? `SHELLY_MODE=${shellyMode}`
        : `real 不足: ${shellyMissing.join(", ")}`,
  });

  const switchbotMode = getEnv("SWITCHBOT_MODE", "mock").toLowerCase();
  const switchbotMissing: string[] = [];
  if (switchbotMode === "real") {
    if (!getEnv("SWITCHBOT_TOKEN")) switchbotMissing.push("SWITCHBOT_TOKEN");
    if (!getEnv("SWITCHBOT_SECRET")) switchbotMissing.push("SWITCHBOT_SECRET");
    if (!getEnv("SWITCHBOT_LOCK_DEVICE_ID")) switchbotMissing.push("SWITCHBOT_LOCK_DEVICE_ID");
  }
  categories.push({
    id: "SwitchBot",
    label: "SwitchBot",
    status: switchbotMissing.length === 0 ? "ok" : "missing",
    configured: ["SWITCHBOT_MODE"],
    missing: switchbotMissing,
    message:
      switchbotMissing.length === 0
        ? `SWITCHBOT_MODE=${switchbotMode}`
        : `real 不足: ${switchbotMissing.join(", ")}`,
  });

  const envErrors = checkProductionEnv(source)
    .filter((i) => i.level === "error")
    .map((i) => i.key);

  const flatMissing = [
    ...new Set([
      ...categories.flatMap((c) => c.missing),
      ...envErrors,
    ]),
  ];

  const ready =
    flatMissing.length === 0 &&
    categories.every((c) => c.status === "ok");

  return {
    generatedAt: new Date().toISOString(),
    ready,
    missing: flatMissing,
    categories,
  };
}
