import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { persistEvent } from "../notification/event-processor.js";
import { sendWebPush } from "../notification/channels/web-push.js";
import { appendDeviceTimeline } from "../device/device-timeline.js";
import { recordProRemoteState } from "../toms/pro-remote-state.js";
import { findAlertFloorTier } from "../pro-remote/floor-map-stack.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import { DEMO_PACK_CODES } from "./demo-customer-pack.js";
import { DEMO_KPI_PREFIX } from "./demo-kpi-seed.js";
import { broadcastSalesDemoEvent } from "./sales-ws-bridge.js";
const KIND_CONFIG = {
    intrusion: {
        eventType: "intrusion",
        severity: "alarm",
        title: "侵入検知（デモ）",
        body: "外周ビーム — 営業デモ用イベント",
        deviceSuffix: "ESP-01",
    },
    power_outage: {
        eventType: "power_outage",
        severity: "critical",
        title: "停電検知（デモ）",
        body: "メイン電源 — UPS 切替確認",
        deviceSuffix: "SHELLY-01",
    },
    esp_fault: {
        eventType: "esp_fault",
        severity: "alarm",
        title: "ESP異常（デモ）",
        body: "通信断 — 復旧シナリオデモ",
        deviceSuffix: "ESP-01",
    },
    shelly_fault: {
        eventType: "shelly_fault",
        severity: "warning",
        title: "Shelly異常（デモ）",
        body: "リレー応答なし — 再起動デモ",
        deviceSuffix: "SHELLY-01",
    },
    maintenance_due: {
        eventType: "maintenance_due",
        severity: "info",
        title: "保守期限（デモ）",
        body: "年次点検 30日以内 — リマインド",
        deviceSuffix: "ESP-01",
    },
};
export async function triggerDemoNotification(kind, customerCode = "TOMS001") {
    const code = customerCode.toUpperCase();
    if (!DEMO_PACK_CODES.includes(code)) {
        throw new Error(`Unknown demo customer: ${code}`);
    }
    const customer = getCustomerByCode(code);
    if (!customer)
        throw new Error(`Customer not found: ${code}`);
    const cfg = KIND_CONFIG[kind];
    const deviceId = `${code}-${cfg.deviceSuffix}`;
    const site = getDatabase()
        .prepare(`SELECT id FROM sites WHERE customer_id = ? LIMIT 1`)
        .get(customer.customer_id);
    const eventId = persistEvent({
        deviceId,
        eventType: cfg.eventType,
        title: cfg.title,
        body: cfg.body,
        severity: cfg.severity,
        tenantId: customer.tenant_id ?? customer.customer_id,
        siteId: site?.id,
        payload: { demo_kit: true, kind, customerCode: code },
    });
    const logId = uuid();
    getDatabase()
        .prepare(`INSERT INTO notification_logs (id, device_id, event_type, channel, title, body, payload_json, status, sent_at)
       VALUES (?, ?, ?, 'web_push', ?, ?, ?, 'sent', datetime('now'))`)
        .run(logId, deviceId, cfg.eventType, cfg.title, cfg.body, JSON.stringify({ demo_kit: true, kind, eventId }));
    const pushResult = await sendWebPush({
        title: cfg.title,
        body: cfg.body,
        eventType: cfg.eventType,
        deviceId,
    });
    appendDeviceTimeline({
        customerId: customer.customer_id,
        deviceId,
        eventType: "notification",
        title: cfg.title,
        detail: cfg.body,
        actor: "demo-kit",
    });
    if (kind === "esp_fault" || kind === "shelly_fault") {
        getDatabase()
            .prepare(`UPDATE devices SET device_status = 'WARNING' WHERE device_id = ?`)
            .run(deviceId);
    }
    const floor = findAlertFloorTier(code);
    const biz = getDatabase()
        .prepare(`SELECT id FROM business_projects WHERE id = ?`)
        .get(`${DEMO_KPI_PREFIX}${code}`);
    if (biz) {
        recordProRemoteState({
            projectId: biz.id,
            action: "floor_nav",
            tier: floor.tier ?? "1f",
            pinId: floor.layerId ?? undefined,
            notificationId: logId,
            actor: "demo-kit",
        });
    }
    const wsKind = kind === "intrusion"
        ? "intrusion"
        : kind === "maintenance_due"
            ? "maintenance"
            : "notification";
    broadcastSalesDemoEvent(wsKind, {
        customerCode: code,
        kind,
        title: cfg.title,
        body: cfg.body,
        message: cfg.body,
        severity: cfg.severity,
        eventId,
        proRemote: { tier: floor.tier, layerId: floor.layerId },
    });
    return {
        ok: true,
        kind,
        customerCode: code,
        eventId,
        notificationLogId: logId,
        proRemote: { tier: floor.tier, layerId: floor.layerId },
        webPush: { success: pushResult.success, error: pushResult.error },
    };
}
export function listDemoNotificationKinds() {
    return Object.keys(KIND_CONFIG);
}
