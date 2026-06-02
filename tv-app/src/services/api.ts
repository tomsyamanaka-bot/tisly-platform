const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "https://tisly.jp";

export interface DashboardSummary {
  deviceCount: number;
  eventCount24h: number;
  unreadNotifications: number;
  alarmDevices: number;
  systemStatus: string;
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
