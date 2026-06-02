import { config } from "../config.js";

export type QnapArchiveKind = "events" | "reports" | "cameras";

export function buildQnapArchivePath(
  kind: QnapArchiveKind,
  tenantId: string,
  siteId: string,
  date: Date = new Date()
): string {
  const base = config.qnap.basePath.replace(/\/$/, "");
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");

  switch (kind) {
    case "events":
      return `${base}/${tenantId}/${siteId}/events/${y}/${m}/${d}/`;
    case "reports":
      return `${base}/${tenantId}/${siteId}/reports/${y}/${m}/`;
    case "cameras":
      return `${base}/${tenantId}/${siteId}/cameras/${y}/${m}/${d}/`;
    default:
      return `${base}/${tenantId}/${siteId}/`;
  }
}

export function buildQnapRemotePath(
  kind: QnapArchiveKind,
  tenantId: string,
  siteId: string,
  filename: string,
  date?: Date
): string {
  const dir = buildQnapArchivePath(kind, tenantId, siteId, date);
  return `${dir}${filename}`.replace(/\/+/g, "/");
}
