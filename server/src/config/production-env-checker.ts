/**
 * Phase 1201–1240 — 本番 .env 起動前チェック（不足時 warning / production 時 error）
 */
import { isValidScryptPasswordHash } from "../auth/password.js";

export type EnvCheckLevel = "info" | "warning" | "error";

export interface EnvCheckItem {
  key: string;
  level: EnvCheckLevel;
  message: string;
  hint?: string;
}

export interface MockRealGuard {
  service: string;
  envKeys: string[];
  mockDefault: string;
  realValue: string;
  demoSafe: string;
  realRisks: string[];
  guardLocation: string;
}

const INSECURE_JWT_VALUES = new Set([
  "",
  "change-me",
  "change-me-use-openssl-rand-hex-32",
  "test-jwt-secret-32-characters-long!!",
]);

function env(key: string, fallback = ""): string {
  return (process.env[key] ?? fallback).trim();
}

function isProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production";
}

function levelForMissing(isProd: boolean): EnvCheckLevel {
  return isProd ? "error" : "warning";
}

/** Demo / Mock / Real 切替と real 時の危険一覧（docs/mock_real_modes.md と同期） */
export const MOCK_REAL_GUARDS: MockRealGuard[] = [
  {
    service: "Gmail / Google OAuth",
    envKeys: ["GOOGLE_OAUTH_ENABLED", "GMAIL_SEND_MODE"],
    mockDefault: "GOOGLE_OAUTH_ENABLED=false, GMAIL_SEND_MODE=mock",
    realValue: "GOOGLE_OAUTH_ENABLED=true, GMAIL_SEND_MODE=real",
    demoSafe: "mock — 接続済み扱い・実送信なし",
    realRisks: [
      "顧客へ実メール送信",
      "OAuth refresh token 漏洩リスク",
      "DLQ 未処理で送信キュー滞留",
    ],
    guardLocation: "business-real-send-guard + canGmailRealSend() + UI confirmed",
  },
  {
    service: "QNAP Business WebDAV",
    envKeys: ["QNAP_UPLOAD_MODE", "QNAP_WEBDAV_URL"],
    mockDefault: "QNAP_UPLOAD_MODE=mock",
    realValue: "QNAP_UPLOAD_MODE=real + QNAP_WEBDAV_URL + credentials",
    demoSafe: "mock — server/uploads/qnap-mock へ保存",
    realRisks: ["見積 PDF の NAS 上書き", "WebDAV 資格情報露出", "フォルダ誤削除"],
    guardLocation: "getQnapUploadConfig() + assertRealSendAllowed(qnap_real_upload)",
  },
  {
    service: "QNAP SMB Archive",
    envKeys: ["QNAP_MODE", "QNAP_HOST"],
    mockDefault: "QNAP_MODE=mock",
    realValue: "QNAP_MODE=real + SMB credentials",
    demoSafe: "mock — data/qnap-archive ローカル",
    realRisks: ["イベント/レポートの NAS 書込", "SMB 平文認証"],
    guardLocation: "server/src/qnap/smb-client.ts",
  },
  {
    service: "Shelly",
    envKeys: ["SHELLY_MODE", "SHELLY_BASE_URL", "SHELLY_AUTH_TOKEN"],
    mockDefault: "SHELLY_MODE=mock",
    realValue: "SHELLY_MODE=real + SHELLY_BASE_URL",
    demoSafe: "mock — シミュレーション RPC",
    realRisks: ["リレー遠隔操作", "実機設定変更", "LAN 上デバイスへの直接 RPC"],
    guardLocation: "server/src/device/shelly-real-client.ts",
  },
  {
    service: "MQTT",
    envKeys: ["MQTT_MODE", "MQTT_URL", "MQTT_SUBSCRIBER_ENABLED"],
    mockDefault: "MQTT_MODE=mock",
    realValue: "MQTT_MODE=real + MQTT_URL + subscriber enabled",
    demoSafe: "mock — heartbeat シミュレーション・LIVE_OPS_MOCK_PUSH 可",
    realRisks: [
      "ブローカーへの publish/subscribe",
      "現場デバイスへのコマンド配信",
      "TLS 未設定時の平文通信",
    ],
    guardLocation: "server/src/mqtt/mqtt-config.ts + mqtt-tls.ts fallback",
  },
  {
    service: "SwitchBot Lock",
    envKeys: ["SWITCHBOT_MODE", "SWITCHBOT_TOKEN", "SWITCHBOT_SECRET", "SWITCHBOT_LOCK_DEVICE_ID"],
    mockDefault: "SWITCHBOT_MODE=mock",
    realValue: "SWITCHBOT_MODE=real + TOKEN + SECRET + LOCK_DEVICE_ID",
    demoSafe: "mock — 施錠/解錠シミュレーション",
    realRisks: [
      "玄関ロックの遠隔解錠",
      "自動警戒ON/OFF の誤動作",
      "token/secret 漏洩",
    ],
    guardLocation: "switchbotService.ts — confirmed=true required for real commands",
  },
  {
    service: "Google TV (Web)",
    envKeys: ["TISLY_PUBLIC_URL"],
    mockDefault: "ローカル API + focus-camera mock state",
    realValue: "TISLY_PUBLIC_URL=https://tisly.jp + WSS",
    demoSafe: "POST /api/tv/focus-camera は DB/WS のみ・実テレビ操作なし",
    realRisks: [
      "本番 URL 誤設定でペアリング失敗",
      "TV_CERT_PINNING 未設定時の MITM",
      "focus イベントの顧客間誤配信",
    ],
    guardLocation: "server/src/api/routes/tv.ts + tv-focus-state.ts",
  },
];

export function checkProductionEnv(
  source: NodeJS.ProcessEnv = process.env
): EnvCheckItem[] {
  const items: EnvCheckItem[] = [];
  const prod = isProduction(source);
  const get = (key: string, fallback = ""): string =>
    (source[key] ?? fallback).trim();

  const jwt = get("JWT_SECRET");
  if (!jwt) {
    items.push({
      key: "JWT_SECRET",
      level: levelForMissing(prod),
      message: "JWT_SECRET が未設定 — 管理 API 認証が無効",
      hint: "openssl rand -hex 32",
    });
  } else if (INSECURE_JWT_VALUES.has(jwt) || jwt.length < 32) {
    items.push({
      key: "JWT_SECRET",
      level: prod ? "error" : "warning",
      message: "JWT_SECRET がデフォルトまたは短すぎます",
      hint: "openssl rand -hex 32 で再生成",
    });
  }

  const adminHash = get("ADMIN_PASSWORD_HASH");
  if (!adminHash) {
    items.push({
      key: "ADMIN_PASSWORD_HASH",
      level: levelForMissing(prod),
      message: "ADMIN_PASSWORD_HASH が未設定 — 管理者ログイン不可",
      hint: "npm run hash:admin-password — docs/admin-password-recovery.md",
    });
  } else if (adminHash === "temp") {
    items.push({
      key: "ADMIN_PASSWORD_HASH",
      level: "error",
      message: "ADMIN_PASSWORD_HASH=temp — 平文は使用不可（ログイン不可）",
      hint: "npm run hash:admin-password — docs/admin-password-recovery.md",
    });
  } else if (!adminHash.startsWith("scrypt:")) {
    items.push({
      key: "ADMIN_PASSWORD_HASH",
      level: prod ? "error" : "warning",
      message: "ADMIN_PASSWORD_HASH が scrypt 形式ではありません",
      hint: "npm run hash:admin-password — docs/admin-password-recovery.md",
    });
  } else if (!isValidScryptPasswordHash(adminHash)) {
    items.push({
      key: "ADMIN_PASSWORD_HASH",
      level: "error",
      message: "ADMIN_PASSWORD_HASH が不正（128 文字 hex 不足または非 hex 文字）— ログイン不可",
      hint: "npm run hash:admin-password を再実行 — docs/admin-password-recovery.md",
    });
  }

  const publicUrl = get("TISLY_PUBLIC_URL") || get("PUBLIC_BASE_URL");
  if (!publicUrl) {
    items.push({
      key: "TISLY_PUBLIC_URL",
      level: "warning",
      message: "TISLY_PUBLIC_URL が未設定 — デフォルト https://tisly.jp を使用",
    });
  } else if (
    prod &&
    (publicUrl.includes("localhost") || publicUrl.includes("127.0.0.1"))
  ) {
    items.push({
      key: "TISLY_PUBLIC_URL",
      level: "error",
      message: "本番 NODE_ENV で localhost URL は使用不可",
      hint: "https://tisly.jp を設定",
    });
  }

  const ingest = get("INGEST_SECRET");
  if (!ingest || ingest === "change-me-before-production") {
    items.push({
      key: "INGEST_SECRET",
      level: prod ? "error" : "warning",
      message: "INGEST_SECRET が未設定またはデフォルト値",
      hint: "openssl rand -hex 24",
    });
  }

  const dbProvider = get("DB_PROVIDER", "sqlite");
  if (prod && dbProvider === "sqlite") {
    items.push({
      key: "DB_PROVIDER",
      level: "warning",
      message: "本番で DB_PROVIDER=sqlite — VPS では postgres 推奨",
      hint: "docs/postgres_migration_runbook.md",
    });
  }
  if (dbProvider === "postgres" && !get("POSTGRES_PASSWORD")) {
    items.push({
      key: "POSTGRES_PASSWORD",
      level: levelForMissing(prod),
      message: "DB_PROVIDER=postgres だが POSTGRES_PASSWORD 未設定",
    });
  }

  const mqttMode = get("MQTT_MODE", "mock").toLowerCase();
  const mqttUrl = get("MQTT_URL");
  if (mqttMode === "real") {
    if (!mqttUrl) {
      items.push({
        key: "MQTT_URL",
        level: "error",
        message: "MQTT_MODE=real だが MQTT_URL 未設定",
      });
    }
    if (get("MQTT_SUBSCRIBER_ENABLED") !== "true") {
      items.push({
        key: "MQTT_SUBSCRIBER_ENABLED",
        level: "warning",
        message: "MQTT_MODE=real だが subscriber 無効 — イベント受信なし",
        hint: "MQTT_SUBSCRIBER_ENABLED=true",
      });
    }
  } else {
    items.push({
      key: "MQTT_MODE",
      level: "info",
      message: "MQTT_MODE=mock — 営業デモ安全",
    });
  }

  const shellyMode = get("SHELLY_MODE", "mock").toLowerCase();
  if (shellyMode === "real") {
    if (!get("SHELLY_BASE_URL")) {
      items.push({
        key: "SHELLY_BASE_URL",
        level: "error",
        message: "SHELLY_MODE=real だが SHELLY_BASE_URL 未設定",
      });
    }
    items.push({
      key: "SHELLY_MODE",
      level: "warning",
      message: "SHELLY_MODE=real — 実機 RPC が有効",
      hint: "営業デモでは mock を維持",
    });
  }

  const qnapUpload = get("QNAP_UPLOAD_MODE", "mock").toLowerCase();
  if (qnapUpload === "real") {
    if (!get("QNAP_WEBDAV_URL")) {
      items.push({
        key: "QNAP_WEBDAV_URL",
        level: "error",
        message: "QNAP_UPLOAD_MODE=real だが QNAP_WEBDAV_URL 未設定",
      });
    }
    items.push({
      key: "QNAP_UPLOAD_MODE",
      level: "warning",
      message: "QNAP_UPLOAD_MODE=real — Business PDF が NAS へアップロード",
    });
  }

  const googleOAuth = get("GOOGLE_OAUTH_ENABLED").toLowerCase() === "true";
  const gmailMode = get("GMAIL_SEND_MODE", "mock").toLowerCase();
  const notificationEmailMode = get("NOTIFICATION_EMAIL_MODE", "mock").toLowerCase();
  const smtpUser = get("SMTP_USER");
  const smtpPass = get("SMTP_PASS") || get("SMTP_PASSWORD");

  if (notificationEmailMode === "gmail" && gmailMode === "real") {
    if (!smtpUser) {
      items.push({
        key: "SMTP_USER",
        level: levelForMissing(prod),
        message: "NOTIFICATION_EMAIL_MODE=gmail だが SMTP_USER 未設定",
      });
    }
    if (!smtpPass) {
      items.push({
        key: "SMTP_PASS",
        level: prod ? "warning" : "info",
        message: "Gmail not configured — SMTP_PASS（アプリパスワード）未設定",
        hint: "起動は継続しますが実送信はできません",
      });
    }
    if (gmailMode === "real" && smtpUser && smtpPass) {
      items.push({
        key: "GMAIL_SEND_MODE",
        level: "warning",
        message: "Gmail SMTP real — 通知メールの実送信が有効",
      });
    }
  } else if (gmailMode === "real" || (googleOAuth && gmailMode !== "mock")) {
    if (!googleOAuth && notificationEmailMode !== "gmail") {
      items.push({
        key: "GOOGLE_OAUTH_ENABLED",
        level: "error",
        message: "GMAIL_SEND_MODE=real（Business Gmail）には GOOGLE_OAUTH_ENABLED=true が必要",
      });
    }
    if (googleOAuth && !get("GOOGLE_CLIENT_ID")) {
      items.push({
        key: "GOOGLE_CLIENT_ID",
        level: levelForMissing(prod),
        message: "GOOGLE_OAUTH_ENABLED だが GOOGLE_CLIENT_ID 未設定",
      });
    }
    if (gmailMode === "real") {
      items.push({
        key: "GMAIL_SEND_MODE",
        level: "warning",
        message: "GMAIL_SEND_MODE=real — Business メール送信が可能",
        hint: "Business settings で realSendEnabled + confirmed も必要",
      });
    }
  }

  if (prod && get("TISLY_DEMO_MODE") === "true") {
    items.push({
      key: "TISLY_DEMO_MODE",
      level: "warning",
      message: "本番 NODE_ENV で TISLY_DEMO_MODE=true — デモ自動起動に注意",
    });
  }

  if (prod && get("DEMO_RESET_ENABLED") === "true") {
    items.push({
      key: "DEMO_RESET_ENABLED",
      level: "error",
      message: "本番で DEMO_RESET_ENABLED=true — データ消去リスク",
    });
  }

  return items;
}

export function hasBlockingEnvErrors(
  source: NodeJS.ProcessEnv = process.env
): boolean {
  return checkProductionEnv(source).some((i) => i.level === "error");
}

/** 起動前にコンソールへ warning/error を出力（NODE_ENV=test ではスキップ） */
export function logProductionEnvWarnings(
  source: NodeJS.ProcessEnv = process.env
): void {
  if (source.NODE_ENV === "test") return;

  const items = checkProductionEnv(source).filter((i) => i.level !== "info");
  if (items.length === 0) return;

  const label = isProduction(source)
    ? "[TiSLY] Production env check (RC2):"
    : "[TiSLY] Env check (dev — fix before tisly.jp deploy):";
  console.warn(label);
  for (const item of items) {
    const hint = item.hint ? ` (${item.hint})` : "";
    console.warn(`  [${item.level.toUpperCase()}] ${item.key}: ${item.message}${hint}`);
  }
}
