import { getDatabase } from "../db/database.js";
function parseDevicesJson(raw) {
    if (!raw)
        return [];
    try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    }
    catch {
        return [];
    }
}
function latestDevicesForKind(projectId, kind) {
    const row = getDatabase()
        .prepare(`SELECT devices_json FROM business_drawing_versions
       WHERE project_id = ? AND version_kind = ?
       ORDER BY version_no DESC LIMIT 1`)
        .get(projectId, kind);
    return parseDevicesJson(row?.devices_json);
}
function deviceKey(d) {
    return (d.id || d.label || "").toLowerCase();
}
function posChanged(a, b) {
    if (a.posX == null || a.posY == null || b.posX == null || b.posY == null)
        return false;
    const dx = Math.abs((a.posX ?? 0) - (b.posX ?? 0));
    const dy = Math.abs((a.posY ?? 0) - (b.posY ?? 0));
    return dx > 0.02 || dy > 0.02;
}
export function compareDrawingVersions(projectId) {
    const survey = latestDevicesForKind(projectId, "survey");
    const construction = latestDevicesForKind(projectId, "construction");
    const as_built = latestDevicesForKind(projectId, "as_built");
    const base = survey.length ? survey : construction;
    const target = as_built.length ? as_built : construction.length ? construction : survey;
    const baseMap = new Map(base.map((d) => [deviceKey(d), d]));
    const targetMap = new Map(target.map((d) => [deviceKey(d), d]));
    const added = [];
    const removed = [];
    const moved = [];
    for (const [k, t] of targetMap) {
        if (!baseMap.has(k))
            added.push(t);
        else {
            const b = baseMap.get(k);
            if (posChanged(b, t))
                moved.push({ from: b, to: t });
        }
    }
    for (const [k, b] of baseMap) {
        if (!targetMap.has(k))
            removed.push(b);
    }
    const items = [
        ...added.map((device) => ({
            changeType: "added",
            device,
            posX: device.posX,
            posY: device.posY,
        })),
        ...removed.map((device) => ({
            changeType: "removed",
            device,
            posX: device.posX,
            posY: device.posY,
        })),
        ...moved.map((m) => ({
            changeType: "moved",
            device: m.to,
            from: m.from,
            to: m.to,
            posX: m.to.posX,
            posY: m.to.posY,
        })),
    ];
    return { survey, construction, as_built, added, removed, moved, items };
}
