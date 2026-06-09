import { getDatabase } from "../db/database.js";
const ITEM_LABELS = {
    qr_registered: "QR登録済み",
    site_assigned: "現場割当済み",
    floor_assigned: "フロア割当済み",
    zone_assigned: "ゾーン割当済み",
    map_placed: "マップ配置済み",
    heartbeat_ok: "ハートビート確認",
    event_test_ok: "イベントテスト成功",
    notification_test_ok: "通知テスト成功",
    tv_display_ok: "TV表示確認",
    photo_registered: "写真登録（placeholder）",
};
function parseTestResult(raw) {
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function isCommissionedAtLeast(status, min) {
    const order = ["draft", "claimed", "placed", "tested", "completed", "failed"];
    const a = order.indexOf((status ?? "draft"));
    const b = order.indexOf(min);
    return a >= b && status !== "failed";
}
export function evaluateDeviceChecklist(customerId, deviceId) {
    const db = getDatabase();
    const row = db
        .prepare(`SELECT device_id, site_id, floor_id, zone_id, pos_x, pos_y, commissioning_status,
              last_test_result, last_heartbeat_at, heartbeat_status, device_type
       FROM devices WHERE (device_id = ? OR id = ?) AND customer_id = ?`)
        .get(deviceId, deviceId, customerId);
    if (!row) {
        throw new Error("Device not found");
    }
    const tests = parseTestResult(row.last_test_result);
    const overrides = tests?.checklistOverrides ?? {};
    const auto = {
        qr_registered: isCommissionedAtLeast(row.commissioning_status, "claimed"),
        site_assigned: !!row.site_id,
        floor_assigned: !!row.floor_id,
        zone_assigned: !!row.zone_id,
        map_placed: row.pos_x != null && row.pos_y != null,
        heartbeat_ok: row.heartbeat_status === "ok" ||
            tests?.heartbeat === "ok" ||
            !!row.last_heartbeat_at,
        event_test_ok: tests?.event === "ok",
        notification_test_ok: tests?.notification === "ok",
        tv_display_ok: tests?.tv === "ok" ||
            (row.device_type?.toUpperCase() === "TV" && row.heartbeat_status === "ok"),
        photo_registered: !!tests?.photo,
    };
    const items = Object.keys(ITEM_LABELS).map((id) => ({
        id,
        label: ITEM_LABELS[id],
        completed: !!overrides[id] || auto[id],
        completedAt: overrides[id] ?? (auto[id] ? new Date().toISOString() : null),
        manualOverride: !!overrides[id],
    }));
    const completedCount = items.filter((i) => i.completed).length;
    return { deviceId: row.device_id, items, completedCount, total: items.length };
}
export function getCustomerInstallChecklist(customerId) {
    const db = getDatabase();
    const devices = db
        .prepare(`SELECT device_id, label FROM devices WHERE customer_id = ? ORDER BY label, device_id`)
        .all(customerId);
    const evaluated = devices.map((d) => {
        const ev = evaluateDeviceChecklist(customerId, d.device_id);
        return {
            deviceId: d.device_id,
            label: d.label ?? d.device_id,
            items: ev.items,
            completedCount: ev.completedCount,
            total: ev.total,
        };
    });
    const fullyComplete = evaluated.filter((e) => e.completedCount === e.total).length;
    const openItems = [];
    for (const e of evaluated) {
        for (const item of e.items) {
            if (!item.completed)
                openItems.push(`${e.deviceId}: ${item.label}`);
        }
    }
    return {
        devices: evaluated,
        summary: {
            totalDevices: devices.length,
            fullyComplete,
            openItems: openItems.slice(0, 50),
        },
    };
}
export function completeChecklistItem(customerId, deviceId, itemId, actor) {
    const db = getDatabase();
    const row = db
        .prepare(`SELECT id, last_test_result FROM devices WHERE device_id = ? AND customer_id = ?`)
        .get(deviceId, customerId);
    if (!row)
        throw new Error("Device not found");
    const tests = parseTestResult(row.last_test_result) ?? {};
    const overrides = tests.checklistOverrides ?? {};
    overrides[itemId] = new Date().toISOString();
    tests.checklistOverrides = overrides;
    if (actor)
        tests.lastChecklistActor = actor;
    db.prepare(`UPDATE devices SET last_test_result = ?, updated_at = datetime('now') WHERE id = ?`).run(JSON.stringify(tests), row.id);
    const ev = evaluateDeviceChecklist(customerId, deviceId);
    const item = ev.items.find((i) => i.id === itemId);
    if (!item)
        throw new Error("Unknown checklist item");
    return item;
}
