import type { SiemEvent } from "../security/siem-exporter.js";

export async function exportToElastic(
  event: SiemEvent,
  url: string,
  index = "tisly-security"
): Promise<boolean> {
  const base = url.replace(/\/$/, "");
  const res = await fetch(`${base}/${index}/_doc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      "@timestamp": event.timestamp,
      ...event,
    }),
  });
  return res.ok;
}
