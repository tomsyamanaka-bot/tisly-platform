/**
 * Capture schedule-v1 screenshots for multi-day verification (6/25–6/27).
 * Uses Cursor browser MCP flow instructions — run after deploy + sync.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "data", "multiday-fix-verification");
const BASE = process.env.BASE_URL || "https://tisly.jp";

async function getToken() {
  const res = await fetch(`${BASE}/api/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerCode: "TOMS001",
      username: "toms001.surveyor",
      password: "demo-remote-2026",
    }),
  });
  const j = await res.json();
  if (!j.token) throw new Error(`login failed ${res.status}`);
  return j.token;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const token = await getToken();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const syncRes = await fetch(`${BASE}/api/schedule/v1/sync/google`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      dateFrom: "2026-06-20",
      dateTo: "2026-06-30",
      syncDirection: "pull_only",
    }),
  });
  const syncBody = await syncRes.json();

  const apiResults = {};
  for (const date of ["2026-06-25", "2026-06-26", "2026-06-27"]) {
    const res = await fetch(`${BASE}/api/schedule/v1/day?date=${date}`, { headers });
    const j = await res.json();
    apiResults[date] = {
      eventCount: j.day?.events?.length ?? 0,
      denEvents: (j.day?.events ?? [])
        .filter((e) => /伝元|阿見|日目/.test(e.title ?? ""))
        .map((e) => ({ title: e.title, id: e.id, date: e.date })),
      allTitles: (j.day?.events ?? []).map((e) => e.title),
    };
  }

  const healthRes = await fetch(`${BASE}/api/health`);
  const health = await healthRes.json();

  const report = {
    capturedAt: new Date().toISOString(),
    baseUrl: BASE,
    sync: syncBody,
    apiResults,
    commitShort: health.commitShort,
    screenshotNote: "25.png / 26.png / 27.png — schedule-v1 week offset=1, captured via browser MCP",
    outDir: OUT,
  };

  fs.writeFileSync(path.join(OUT, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
