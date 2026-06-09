import { config } from "../config.js";
export function buildQnapArchivePath(kind, tenantId, siteId, date = new Date()) {
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
export function buildQnapRemotePath(kind, tenantId, siteId, filename, date) {
    const dir = buildQnapArchivePath(kind, tenantId, siteId, date);
    return `${dir}${filename}`.replace(/\/+/g, "/");
}
