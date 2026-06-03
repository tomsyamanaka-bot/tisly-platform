const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "https://tisly.jp";

/** Certificate pinning placeholder — set EXPO_PUBLIC_TV_CERT_PINNING_ENABLED=true before production. */
export const TV_CERT_PINNING_ENABLED =
  process.env.EXPO_PUBLIC_TV_CERT_PINNING_ENABLED === "true";
export const TV_CERT_FINGERPRINT =
  process.env.EXPO_PUBLIC_TV_CERT_FINGERPRINT ??
  "sha256/PLACEHOLDER_REPLACE_BEFORE_PRODUCTION";

function baseUrl(override?: string): string {
  return (override ?? API_BASE).replace(/\/$/, "");
}

export type CertVerificationStatus = "ok" | "mismatch" | "skipped" | "placeholder";

let lastVerificationStatus: CertVerificationStatus = TV_CERT_PINNING_ENABLED
  ? TV_CERT_FINGERPRINT.includes("PLACEHOLDER")
    ? "placeholder"
    : "skipped"
  : "skipped";

export function getCertPinningStatus(): {
  enabled: boolean;
  fingerprint: string;
  lastVerification: CertVerificationStatus;
} {
  return {
    enabled: TV_CERT_PINNING_ENABLED,
    fingerprint: TV_CERT_FINGERPRINT,
    lastVerification: lastVerificationStatus,
  };
}

export function recordCertVerification(status: CertVerificationStatus): void {
  lastVerificationStatus = status;
}

/** When pinning is enabled, native layer should validate TLS fingerprint (TODO: native module). */
export function assertCertPinningConfigured(): CertVerificationStatus {
  if (!TV_CERT_PINNING_ENABLED) {
    lastVerificationStatus = "skipped";
    return lastVerificationStatus;
  }
  if (TV_CERT_FINGERPRINT.includes("PLACEHOLDER")) {
    console.warn("[TV] Certificate fingerprint is still a placeholder");
    lastVerificationStatus = "placeholder";
    return lastVerificationStatus;
  }
  lastVerificationStatus = "ok";
  return lastVerificationStatus;
}

export interface DashboardSummary {
  deviceCount: number;
  siteCount?: number;
  eventCount24h: number;
  unreadNotifications: number;
  alarmDevices: number;
  systemStatus: string;
  riskScoreAvg24h?: number;
  criticalCount24h?: number;
}

export interface DashboardResponse {
  summary: DashboardSummary;
  recentAlarms: Array<{ title?: string; device_id: string; event_type: string; created_at: string }>;
  recentEvents: Array<Record<string, unknown>>;
  timestamp: string;
}

export async function fetchDashboard(): Promise<DashboardResponse> {
  const res = await fetch(`${API_BASE}/api/dashboard`);
  if (!res.ok) throw new Error(`Dashboard ${res.status}`);
  return res.json();
}

export async function fetchEvents(limit = 30): Promise<{ events: unknown[] }> {
  const res = await fetch(`${API_BASE}/api/events?limit=${limit}`);
  if (!res.ok) throw new Error(`Events ${res.status}`);
  return res.json();
}

export async function postHeartbeat(deviceId: string): Promise<void> {
  await fetch(`${API_BASE}/api/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, platform: "google_tv" }),
  });
}

export interface TvPairingStartResponse {
  deviceId: string;
  pairingCode: string;
  expiresAt: string;
}

export async function startTvPairing(
  body: { tvDeviceId?: string; displayName?: string },
  serverUrl?: string
): Promise<TvPairingStartResponse> {
  const res = await fetch(`${baseUrl(serverUrl)}/api/tv/pairing/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Pairing start ${res.status}`);
  const data = await res.json();
  return {
    deviceId: data.deviceId,
    pairingCode: data.pairingCode,
    expiresAt: data.expiresAt,
  };
}

export async function confirmTvPairing(
  body: { pairingCode: string; siteId: string; tvDeviceId?: string },
  serverUrl?: string
): Promise<void> {
  const res = await fetch(`${baseUrl(serverUrl)}/api/tv/pairing/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pairingCode: body.pairingCode,
      site_id: body.siteId,
      tvDeviceId: body.tvDeviceId,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Confirm ${res.status}`);
  }
}

export async function fetchTvConfig(
  deviceId: string,
  serverUrl?: string
): Promise<{ paired: boolean; siteId?: string; status?: string }> {
  const res = await fetch(`${baseUrl(serverUrl)}/api/tv/config/${encodeURIComponent(deviceId)}`);
  if (!res.ok) throw new Error(`TV config ${res.status}`);
  return res.json();
}

export async function unpairTvDevice(deviceId: string, serverUrl?: string): Promise<void> {
  const res = await fetch(
    `${baseUrl(serverUrl)}/api/tv/devices/${encodeURIComponent(deviceId)}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(`Unpair ${res.status}`);
}
