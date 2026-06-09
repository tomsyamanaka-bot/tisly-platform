/** Phase 141-160: 現場テンプレート定義 */
export const SITE_TEMPLATES = {
    kodate: {
        id: "kodate",
        label: "戸建",
        siteType: "residential",
        zones: [
            { name: "外周", zoneType: "perimeter" },
            { name: "玄関", zoneType: "entrance" },
            { name: "1F", zoneType: "floor" },
            { name: "2F", zoneType: "floor" },
        ],
        devices: [
            { kind: "esp32", suffix: "gw", labelPrefix: "Gateway", platform: "esp-idf", zoneName: "玄関" },
            { kind: "sensor", suffix: "win", labelPrefix: "窓センサ", platform: "zigbee", zoneName: "1F" },
            { kind: "door", suffix: "door", labelPrefix: "玄関ドア", platform: "zigbee", zoneName: "玄関" },
            { kind: "camera", suffix: "cam", labelPrefix: "カメラ", platform: "onvif", zoneName: "外周" },
        ],
        dashboard: { layout: "residential", widgets: ["alarms", "zones", "heartbeat"] },
    },
    minpaku: {
        id: "minpaku",
        label: "民泊",
        siteType: "hospitality",
        zones: [
            { name: "玄関", zoneType: "entrance" },
            { name: "リビング", zoneType: "common" },
            { name: "寝室", zoneType: "room" },
        ],
        devices: [
            { kind: "esp32", suffix: "gw", labelPrefix: "Gateway", platform: "esp-idf", zoneName: "玄関" },
            { kind: "sensor", suffix: "mot", labelPrefix: "動体", platform: "pir", zoneName: "リビング" },
            { kind: "door", suffix: "lock", labelPrefix: "スマートロック", platform: "zigbee", zoneName: "玄関" },
            { kind: "camera", suffix: "cam", labelPrefix: "カメラ", platform: "onvif", zoneName: "リビング" },
        ],
        dashboard: { layout: "hospitality", widgets: ["checkin", "alarms", "cameras"] },
    },
    factory: {
        id: "factory",
        label: "工場",
        siteType: "factory",
        zones: [
            { name: "工場", zoneType: "production" },
            { name: "倉庫", zoneType: "storage" },
            { name: "外周", zoneType: "perimeter" },
        ],
        devices: [
            { kind: "plc", suffix: "plc", labelPrefix: "PLC FX", platform: "mitsubishi-fx", zoneName: "工場" },
            { kind: "esp32", suffix: "gw", labelPrefix: "Gateway", platform: "esp-idf", zoneName: "工場" },
            { kind: "sensor", suffix: "sns", labelPrefix: "センサ", platform: "modbus", zoneName: "倉庫" },
            { kind: "alarm", suffix: "alm", labelPrefix: "警報", platform: "siren", zoneName: "外周" },
        ],
        dashboard: { layout: "industrial", widgets: ["plc", "alarms", "sla"] },
    },
    warehouse: {
        id: "warehouse",
        label: "倉庫",
        siteType: "warehouse",
        zones: [
            { name: "倉庫", zoneType: "storage" },
            { name: "搬入口", zoneType: "dock" },
            { name: "外周", zoneType: "perimeter" },
        ],
        devices: [
            { kind: "plc", suffix: "plc", labelPrefix: "PLC", platform: "mitsubishi-fx", zoneName: "倉庫" },
            { kind: "sensor", suffix: "door", labelPrefix: "シャッター", platform: "modbus", zoneName: "搬入口" },
            { kind: "camera", suffix: "cam", labelPrefix: "カメラ", platform: "onvif", zoneName: "外周" },
        ],
        dashboard: { layout: "warehouse", widgets: ["inventory", "alarms"] },
    },
    garage: {
        id: "garage",
        label: "車屋",
        siteType: "automotive",
        zones: [
            { name: "ショールーム", zoneType: "showroom" },
            { name: "整備場", zoneType: "service" },
            { name: "駐車場", zoneType: "parking" },
        ],
        devices: [
            { kind: "esp32", suffix: "gw", labelPrefix: "Gateway", platform: "esp-idf", zoneName: "ショールーム" },
            { kind: "sensor", suffix: "pir", labelPrefix: "動体", platform: "pir", zoneName: "整備場" },
            { kind: "camera", suffix: "cam", labelPrefix: "カメラ", platform: "onvif", zoneName: "駐車場" },
        ],
        dashboard: { layout: "automotive", widgets: ["vehicles", "alarms"] },
    },
    aquaculture: {
        id: "aquaculture",
        label: "養殖場",
        siteType: "aquaculture",
        zones: [
            { name: "水槽A", zoneType: "tank" },
            { name: "水槽B", zoneType: "tank" },
            { name: "管理棟", zoneType: "office" },
        ],
        devices: [
            { kind: "rp2350", suffix: "mon", labelPrefix: "水質モニタ", platform: "rp2350", zoneName: "水槽A" },
            { kind: "sensor", suffix: "temp", labelPrefix: "水温", platform: "modbus", zoneName: "水槽B" },
            { kind: "esp32", suffix: "gw", labelPrefix: "Gateway", platform: "esp-idf", zoneName: "管理棟" },
        ],
        dashboard: { layout: "aquaculture", widgets: ["water-quality", "alarms"] },
    },
    kaigo: {
        id: "kaigo",
        label: "介護",
        siteType: "care",
        zones: [
            { name: "共用部", zoneType: "common" },
            { name: "居室", zoneType: "room" },
            { name: "外周", zoneType: "perimeter" },
        ],
        devices: [
            { kind: "esp32", suffix: "gw", labelPrefix: "Gateway", platform: "esp-idf", zoneName: "共用部" },
            { kind: "sensor", suffix: "mot", labelPrefix: "見守りセンサ", platform: "pir", zoneName: "居室" },
            { kind: "camera", suffix: "cam", labelPrefix: "カメラ", platform: "onvif", zoneName: "外周" },
            { kind: "alarm", suffix: "alm", labelPrefix: "緊急通報", platform: "siren", zoneName: "共用部" },
        ],
        dashboard: { layout: "care", widgets: ["alarms", "rooms", "heartbeat"] },
    },
    other: {
        id: "other",
        label: "その他",
        siteType: "custom",
        zones: [{ name: "デフォルト", zoneType: "default" }],
        devices: [
            { kind: "esp32", suffix: "gw", labelPrefix: "Gateway", platform: "esp-idf", zoneName: "デフォルト" },
        ],
        dashboard: { layout: "default", widgets: ["alarms", "events", "devices"] },
    },
    "ready-mix": {
        id: "ready-mix",
        label: "生コン",
        siteType: "construction",
        zones: [
            { name: "プラント", zoneType: "plant" },
            { name: "搬出", zoneType: "dispatch" },
            { name: "外周", zoneType: "perimeter" },
        ],
        devices: [
            { kind: "plc", suffix: "plc", labelPrefix: "PLC", platform: "mitsubishi-fx", zoneName: "プラント" },
            { kind: "sensor", suffix: "vib", labelPrefix: "振動", platform: "modbus", zoneName: "プラント" },
            { kind: "camera", suffix: "cam", labelPrefix: "カメラ", platform: "onvif", zoneName: "外周" },
        ],
        dashboard: { layout: "construction", widgets: ["batch", "alarms", "sla"] },
    },
};
export function listTemplates() {
    return Object.values(SITE_TEMPLATES).map((t) => ({
        id: t.id,
        label: t.label,
        siteType: t.siteType,
        zoneCount: t.zones.length,
        deviceCount: t.devices.length,
    }));
}
export function getTemplate(id) {
    return SITE_TEMPLATES[id];
}
