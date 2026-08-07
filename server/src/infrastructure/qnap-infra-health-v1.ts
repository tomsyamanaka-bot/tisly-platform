/**
 * Platform Settings / Infrastructure Health — QNAP GREEN 状態管理 v1
 *
 * 疎通ポート順: 8080 → 5005 → 5006 → 5000（WebDAV + 8080 File Station）
 * 成功時ステータス GREEN (OK)。保存成功時も GREEN に更新。
 */
import {
  getPlatformSetting,
  setPlatformSetting,
} from "../db/database.js";
import {
  listWebDavUrlCandidates,
  probeWebDavEndpoint,
  rememberDiscoveredWebDavUrl,
} from "../business/services/qnap-webdav-fetch-v1.js";
import {
  DOCUMENT_NAS_FALLBACK_PORTS,
  documentNasConnectSuccessMessage,
  webDavProtocolForPort,
} from "../storage/qnap-nas-hosts-v1.js";
import {
  QNAP_DEFAULT_BASIC_USER,
  qnapBasicAuthHeaders,
} from "../storage/qnap-basic-auth-v1.js";
import { probeFileStationAuthV1 } from "../storage/qnap-file-station-client-v1.js";
import { buildWebDavUrl } from "../storage/qnap-storage-service.js";
import { getStorageSettingsV1, updateStorageSettingsV1 } from "../storage/storage-settings-store.js";
import type { InfraStatus } from "./status.js";

// Avoid circular import issues at runtime — InfraStatus is type-only.

export const QNAP_INFRA_HEALTH_KEY = "qnap_infra_health_v1";
export const QNAP_PLATFORM_DEFAULT_HOST = "100.99.31.120";
export const QNAP_PLATFORM_DEFAULT_USER = QNAP_DEFAULT_BASIC_USER;
/** 接続試行ポート: 8080 → 5005 → 5006 → 5000 */
export const QNAP_CONNECT_PORTS = [...DOCUMENT_NAS_FALLBACK_PORTS] as const;

export type QnapInfraHealthV1 = {
  status: InfraStatus;
  detail: string;
  ok: boolean;
  host: string;
  port: number | null;
  username: string;
  mode: "mock" | "real";
  webdavUrl: string | null;
  method: "webdav" | "file_station" | "save" | "none";
  testedAt: string | null;
  errorCode: string | null;
  logs: string[];
};

export type QnapPlatformSettingV1 = {
  mode: "mock" | "real";
  host: string;
  username: string;
  /** 空文字は未変更（既存パスワード保持） */
  password?: string;
  port?: number | null;
  shareName?: string;
  lastConnectionTest?: {
    ok: boolean;
    message: string;
    testedAt: string;
    port?: number | null;
    webdavUrl?: string | null;
    method?: string;
    logs?: string[];
  } | null;
  healthStatus?: InfraStatus;
};

export type QnapConnectTestResultV1 = {
  ok: boolean;
  status: InfraStatus;
  detail: string;
  host: string;
  port: number | null;
  webdavUrl: string | null;
  method: "webdav" | "file_station" | "none";
  latencyMs: number;
  errorCode: string | null;
  message: string;
  testedAt: string;
  logs: string[];
};

const DEFAULT_HEALTH: QnapInfraHealthV1 = {
  status: "YELLOW",
  detail: "mock / not connected",
  ok: false,
  host: QNAP_PLATFORM_DEFAULT_HOST,
  port: null,
  username: QNAP_PLATFORM_DEFAULT_USER,
  mode: "mock",
  webdavUrl: null,
  method: "none",
  testedAt: null,
  errorCode: null,
  logs: [],
};

export function getQnapInfraHealthV1(): QnapInfraHealthV1 {
  const raw = getPlatformSetting<Partial<QnapInfraHealthV1>>(QNAP_INFRA_HEALTH_KEY);
  if (!raw || typeof raw !== "object") return { ...DEFAULT_HEALTH };
  const status =
    raw.status === "GREEN" || raw.status === "YELLOW" || raw.status === "RED"
      ? raw.status
      : "YELLOW";
  return {
    ...DEFAULT_HEALTH,
    ...raw,
    status,
    ok: Boolean(raw.ok) || status === "GREEN",
    host: String(raw.host || QNAP_PLATFORM_DEFAULT_HOST),
    username: String(raw.username || QNAP_PLATFORM_DEFAULT_USER),
    mode: raw.mode === "real" ? "real" : "mock",
    logs: Array.isArray(raw.logs) ? raw.logs.map(String) : [],
  };
}

export function setQnapInfraHealthV1(
  patch: Partial<QnapInfraHealthV1>
): QnapInfraHealthV1 {
  const current = getQnapInfraHealthV1();
  const next: QnapInfraHealthV1 = {
    ...current,
    ...patch,
    status: patch.status ?? current.status,
    ok:
      patch.ok !== undefined
        ? Boolean(patch.ok)
        : patch.status
          ? patch.status === "GREEN"
          : current.ok,
    logs: patch.logs ? patch.logs.map(String) : current.logs,
  };
  setPlatformSetting(QNAP_INFRA_HEALTH_KEY, next);
  return next;
}

/** リモート保存成功後 — Infrastructure Health QNAP を GREEN に */
export function markQnapInfraGreenV1(options?: {
  host?: string | null;
  port?: number | null;
  detail?: string | null;
  webdavUrl?: string | null;
  method?: QnapInfraHealthV1["method"];
}): QnapInfraHealthV1 {
  const host =
    String(options?.host || "").trim() ||
    getQnapInfraHealthV1().host ||
    QNAP_PLATFORM_DEFAULT_HOST;
  const port =
    options?.port != null && Number(options.port) > 0
      ? Number(options.port)
      : getQnapInfraHealthV1().port;
  return setQnapInfraHealthV1({
    status: "GREEN",
    ok: true,
    detail: String(options?.detail || "").trim() || "OK",
    host,
    port,
    mode: "real",
    webdavUrl: options?.webdavUrl ?? getQnapInfraHealthV1().webdavUrl,
    method: options?.method || "save",
    testedAt: new Date().toISOString(),
    errorCode: null,
  });
}

/** Platform Settings 既定値を補完 */
export function normalizeQnapPlatformSettingV1(
  body: Partial<QnapPlatformSettingV1> | null | undefined,
  previous?: QnapPlatformSettingV1 | null
): QnapPlatformSettingV1 {
  const prev = previous ?? getPlatformSetting<QnapPlatformSettingV1>("qnap");
  const modeRaw = String(body?.mode ?? prev?.mode ?? "mock").toLowerCase();
  const mode: "mock" | "real" = modeRaw === "real" ? "real" : "mock";
  const host =
    String(body?.host ?? prev?.host ?? "").trim() || QNAP_PLATFORM_DEFAULT_HOST;
  const username =
    String(body?.username ?? prev?.username ?? "").trim() ||
    QNAP_PLATFORM_DEFAULT_USER;
  const incomingPass =
    body?.password !== undefined ? String(body.password) : undefined;
  const password =
    incomingPass !== undefined && incomingPass.trim()
      ? incomingPass
      : String(prev?.password || "");
  const port =
    body?.port != null && Number(body.port) > 0
      ? Number(body.port)
      : prev?.port != null && Number(prev.port) > 0
        ? Number(prev.port)
        : null;
  return {
    mode,
    host,
    username,
    password,
    port,
    shareName: String(body?.shareName ?? prev?.shareName ?? "TiSLY").trim() || "TiSLY",
    lastConnectionTest: prev?.lastConnectionTest ?? null,
    healthStatus: prev?.healthStatus,
  };
}

/** プロセス環境とストレージ設定へ反映（PDF 保存経路が同じ資格情報を使う） */
export function applyQnapPlatformRuntimeEnvV1(setting: QnapPlatformSettingV1): void {
  process.env.QNAP_MODE = setting.mode;
  process.env.QNAP_HOST = setting.host;
  process.env.QNAP_TAILSCALE_HOST = setting.host;
  process.env.QNAP_USER = setting.username;
  if (setting.password) {
    process.env.QNAP_PASSWORD = setting.password;
  }
  if (setting.port && setting.port > 0) {
    process.env.QNAP_PORT = String(setting.port);
  }
  const share = setting.shareName || "TiSLY";
  process.env.QNAP_SHARE = share;

  try {
    updateStorageSettingsV1({
      qnapBackupEnabled: setting.mode === "real",
      saveRoute: "vps",
      qnap: {
        host: setting.host,
        port: setting.port && setting.port > 0 ? setting.port : 8080,
        shareName: share,
        username: setting.username,
        password: setting.password || "",
      },
    });
  } catch (e) {
    console.warn(
      "[QNAP infra] storage settings sync failed:",
      e instanceof Error ? e.message : e
    );
  }
}

function protocolForPort(port: number): "http" | "https" {
  try {
    return webDavProtocolForPort(port);
  } catch {
    return port === 5006 || port === 5001 || port === 443 ? "https" : "http";
  }
}

/**
 * ポート順 8080 → 5005 → 5006 → 5000 で WebDAV / File Station 疎通。
 * 成功時 GREEN、失敗時 YELLOW。
 */
export async function runQnapPlatformConnectTestV1(options: {
  host?: string | null;
  username?: string | null;
  password?: string | null;
  shareName?: string | null;
}): Promise<QnapConnectTestResultV1> {
  const started = Date.now();
  const host =
    String(options.host || "").trim() || QNAP_PLATFORM_DEFAULT_HOST;
  const username =
    String(options.username || "").trim() || QNAP_PLATFORM_DEFAULT_USER;
  const password = String(options.password || "");
  const share =
    String(options.shareName || "").trim() ||
    String(process.env.QNAP_SHARE || "TiSLY").trim() ||
    "TiSLY";
  const testedAt = new Date().toISOString();
  const logs: string[] = [];
  const headers = qnapBasicAuthHeaders(username, password);

  if (!password) {
    const result: QnapConnectTestResultV1 = {
      ok: false,
      status: "YELLOW",
      detail: "password required",
      host,
      port: null,
      webdavUrl: null,
      method: "none",
      latencyMs: Date.now() - started,
      errorCode: "NOT_CONFIGURED",
      message:
        "QNAPパスワードが未設定です。Platform Settings でパスワードを入力してください",
      testedAt,
      logs: ["password missing"],
    };
    setQnapInfraHealthV1({
      status: "YELLOW",
      ok: false,
      detail: result.detail,
      host,
      username,
      mode: "real",
      port: null,
      webdavUrl: null,
      method: "none",
      testedAt,
      errorCode: result.errorCode,
      logs: result.logs,
    });
    return result;
  }

  for (const port of QNAP_CONNECT_PORTS) {
    const proto = protocolForPort(port);
    const primary = buildWebDavUrl(host, port, share);
    const candidates = listWebDavUrlCandidates(primary);
    logs.push(`try port ${port} (${candidates.length} WebDAV candidates)`);

    for (const url of candidates) {
      try {
        const probe = await probeWebDavEndpoint(url, headers);
        logs.push(
          `WebDAV ${url} → ${probe.ok ? "OK" : "NG"} status=${probe.status} ${probe.message}`
        );
        // 401 は認証失敗だが「到達」はしている — パスワード誤りとして継続せず RED 寄り YELLOW
        if (probe.status === 401) {
          const result: QnapConnectTestResultV1 = {
            ok: false,
            status: "YELLOW",
            detail: "auth failed",
            host,
            port,
            webdavUrl: url,
            method: "webdav",
            latencyMs: Date.now() - started,
            errorCode: "401 Unauthorized",
            message:
              "QNAP認証エラー: ユーザー名またはパスワードを確認してください",
            testedAt,
            logs,
          };
          setQnapInfraHealthV1({
            status: "YELLOW",
            ok: false,
            detail: result.detail,
            host,
            port,
            username,
            mode: "real",
            webdavUrl: url,
            method: "webdav",
            testedAt,
            errorCode: result.errorCode,
            logs,
          });
          return result;
        }
        if (probe.ok) {
          rememberDiscoveredWebDavUrl(url);
          process.env.QNAP_WEBDAV_URL = url.replace(/\/+$/, "");
          const result: QnapConnectTestResultV1 = {
            ok: true,
            status: "GREEN",
            detail: "OK",
            host,
            port,
            webdavUrl: url,
            method: "webdav",
            latencyMs: Date.now() - started,
            errorCode: null,
            message: documentNasConnectSuccessMessage(port),
            testedAt,
            logs,
          };
          setQnapInfraHealthV1({
            status: "GREEN",
            ok: true,
            detail: "OK",
            host,
            port,
            username,
            mode: "real",
            webdavUrl: url,
            method: "webdav",
            testedAt,
            errorCode: null,
            logs,
          });
          return result;
        }
      } catch (e) {
        logs.push(
          `WebDAV ${url} exception: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    // 8080 は File Station も試行
    if (port === 8080) {
      const fsBase = `${proto}//${host}:8080`;
      logs.push(`try File Station ${fsBase}`);
      try {
        const fsProbe = await probeFileStationAuthV1({
          baseUrl: fsBase,
          username,
          password,
        });
        logs.push(
          `File Station → ${fsProbe.ok ? "OK" : "NG"} ${fsProbe.error || ""}`
        );
        if (fsProbe.ok) {
          const result: QnapConnectTestResultV1 = {
            ok: true,
            status: "GREEN",
            detail: "OK",
            host,
            port: 8080,
            webdavUrl: null,
            method: "file_station",
            latencyMs: Date.now() - started,
            errorCode: null,
            message: documentNasConnectSuccessMessage(8080),
            testedAt,
            logs,
          };
          setQnapInfraHealthV1({
            status: "GREEN",
            ok: true,
            detail: "OK",
            host,
            port: 8080,
            username,
            mode: "real",
            webdavUrl: null,
            method: "file_station",
            testedAt,
            errorCode: null,
            logs,
          });
          return result;
        }
      } catch (e) {
        logs.push(
          `File Station exception: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
  }

  const result: QnapConnectTestResultV1 = {
    ok: false,
    status: "YELLOW",
    detail: "unreachable",
    host,
    port: null,
    webdavUrl: null,
    method: "none",
    latencyMs: Date.now() - started,
    errorCode: "ALL_PORTS_FAILED",
    message: `VPSから ${host} への QNAP 接続に失敗しました（8080/5005/5006/5000）`,
    testedAt,
    logs,
  };
  setQnapInfraHealthV1({
    status: "YELLOW",
    ok: false,
    detail: result.detail,
    host,
    port: null,
    username,
    mode: "real",
    webdavUrl: null,
    method: "none",
    testedAt,
    errorCode: result.errorCode,
    logs,
  });
  return result;
}

/** Infrastructure Health カード用 */
export function resolveQnapInfraComponentStatusV1(): {
  name: string;
  status: InfraStatus;
  detail: string;
} {
  const health = getQnapInfraHealthV1();
  if (health.status === "GREEN" && health.ok) {
    const portHint =
      health.port != null && health.port > 0 ? `:${health.port}` : "";
    return {
      name: "QNAP",
      status: "GREEN",
      detail: health.detail === "OK" ? `OK ${health.host}${portHint}` : health.detail,
    };
  }
  if (health.mode === "real") {
    return {
      name: "QNAP",
      status: health.status === "RED" ? "RED" : "YELLOW",
      detail: health.detail || "connection failed",
    };
  }
  // mock でも直近 GREEN があれば維持（保存成功後など）
  if (health.status === "GREEN") {
    return { name: "QNAP", status: "GREEN", detail: health.detail || "OK" };
  }
  return {
    name: "QNAP",
    status: "YELLOW",
    detail: health.detail || "mock",
  };
}

/**
 * 起動時 / デプロイ後 — .env または Platform Settings の資格情報で疎通し GREEN 化を試みる
 */
export async function bootstrapQnapInfraHealthOnStartupV1(): Promise<QnapConnectTestResultV1 | null> {
  try {
    const platform = getPlatformSetting<QnapPlatformSettingV1>("qnap");
    let storagePass = "";
    let storageHost = "";
    let storageUser = "";
    try {
      const s = getStorageSettingsV1();
      storagePass = s.qnap.password || "";
      storageHost = s.qnap.host || "";
      storageUser = s.qnap.username || "";
    } catch {
      /* storage settings optional at boot */
    }

    const envMode = String(process.env.QNAP_MODE || "").toLowerCase();
    const envPass = String(
      process.env.QNAP_PASSWORD || process.env.QNAP_WEBDAV_PASSWORD || ""
    );
    const envHost = String(
      process.env.QNAP_HOST ||
        process.env.QNAP_TAILSCALE_HOST ||
        process.env.QNAP_LOCAL_HOST ||
        ""
    ).trim();
    const envUser = String(
      process.env.QNAP_USER ||
        process.env.QNAP_WEBDAV_USER ||
        process.env.QNAP_USERNAME ||
        ""
    ).trim();

    const password = envPass || platform?.password || storagePass || "";
    const hasRealIntent =
      platform?.mode === "real" ||
      envMode === "real" ||
      envMode === "webdav" ||
      Boolean(password);

    const normalized = normalizeQnapPlatformSettingV1(
      {
        mode: hasRealIntent ? "real" : "mock",
        host:
          envHost ||
          platform?.host ||
          storageHost ||
          QNAP_PLATFORM_DEFAULT_HOST,
        username:
          envUser ||
          platform?.username ||
          storageUser ||
          QNAP_PLATFORM_DEFAULT_USER,
        password,
        shareName: platform?.shareName || process.env.QNAP_SHARE || "TiSLY",
      },
      platform
    );

    if (normalized.mode !== "real" || !normalized.password) {
      console.log("[QNAP infra] startup probe skipped (mock or no password)");
      return null;
    }

    applyQnapPlatformRuntimeEnvV1(normalized);
    const result = await runQnapPlatformConnectTestV1({
      host: normalized.host,
      username: normalized.username,
      password: normalized.password,
      shareName: normalized.shareName,
    });
    normalized.port = result.port;
    normalized.lastConnectionTest = {
      ok: result.ok,
      message: result.message,
      testedAt: result.testedAt,
      port: result.port,
      webdavUrl: result.webdavUrl,
      method: result.method,
      logs: result.logs,
    };
    normalized.healthStatus = result.status;
    setPlatformSetting("qnap", normalized);
    console.log(
      `[QNAP infra] startup probe ${result.ok ? "GREEN" : "YELLOW"} port=${result.port} method=${result.method}`
    );
    return result;
  } catch (e) {
    console.warn(
      "[QNAP infra] startup probe failed:",
      e instanceof Error ? e.message : e
    );
    return null;
  }
}
