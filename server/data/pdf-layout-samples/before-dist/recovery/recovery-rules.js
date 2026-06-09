export const DEFAULT_HEARTBEAT_RULE = {
    id: "heartbeat-lost-default",
    name: "Heartbeat断 — 標準復旧",
    trigger: "heartbeat_lost",
    deviceKinds: ["esp32", "rp2350", "plc", "generic"],
    steps: [
        { order: 1, action: "warning", delaySec: 0, description: "Warning 状態へ遷移" },
        { order: 2, action: "reconnect", delaySec: 30, description: "再接続試行" },
        { order: 3, action: "notify", delaySec: 60, description: "運用者へ通知" },
        { order: 4, action: "escalate", delaySec: 300, description: "エスカレーション" },
    ],
};
export const DEVICE_RECOVERY_RULES = [
    DEFAULT_HEARTBEAT_RULE,
    {
        id: "esp32-offline",
        name: "ESP32 オフライン復旧",
        trigger: "device_offline",
        deviceKinds: ["esp32"],
        steps: [
            { order: 1, action: "warning", delaySec: 0, description: "ESP 通信断を検知" },
            { order: 2, action: "reconnect", delaySec: 30, description: "MQTT 再購読・ping" },
            { order: 3, action: "notify", delaySec: 120, description: "現場担当へ通知" },
        ],
    },
    {
        id: "rp2350-offline",
        name: "RP2350 オフライン復旧",
        trigger: "device_offline",
        deviceKinds: ["rp2350"],
        steps: [
            { order: 1, action: "warning", delaySec: 0, description: "RP2350 通信断" },
            { order: 2, action: "reconnect", delaySec: 45, description: "HTTP ingest 再試行" },
            { order: 3, action: "notify", delaySec: 180, description: "技術担当へ通知" },
        ],
    },
    {
        id: "plc-offline",
        name: "PLC 通信断",
        trigger: "device_offline",
        deviceKinds: ["plc"],
        steps: [
            { order: 1, action: "warning", delaySec: 0, description: "PLC リンク断" },
            { order: 2, action: "notify", delaySec: 60, description: "保全チームへ即時通知" },
            { order: 3, action: "escalate", delaySec: 300, description: "手動復旧エスカレーション" },
        ],
    },
    {
        id: "tv-offline",
        name: "Google TV オフライン",
        trigger: "device_offline",
        deviceKinds: ["tv"],
        steps: [
            { order: 1, action: "log_only", delaySec: 0, description: "TV 最終接続記録" },
            { order: 2, action: "notify", delaySec: 600, description: "サイネージ停止を通知" },
        ],
    },
    {
        id: "server-offline",
        name: "TiSLY Server 異常",
        trigger: "device_offline",
        deviceKinds: ["server"],
        steps: [
            { order: 1, action: "warning", delaySec: 0, description: "サーバーヘルス異常" },
            { order: 2, action: "restart_service", delaySec: 0, description: "systemd 再起動（本番）" },
            { order: 3, action: "escalate", delaySec: 60, description: "管理者へ即時エスカレーション" },
        ],
    },
    {
        id: "nodered-offline",
        name: "Node-RED 停止",
        trigger: "device_offline",
        deviceKinds: ["node-red"],
        steps: [
            { order: 1, action: "warning", delaySec: 0, description: "フロー停止検知" },
            { order: 2, action: "reconnect", delaySec: 30, description: "HTTP ingest バックオフ再試行" },
            { order: 3, action: "notify", delaySec: 300, description: "運用者通知" },
        ],
    },
    {
        id: "mqtt-broker",
        name: "MQTT ブローカー断",
        trigger: "mqtt_disconnect",
        deviceKinds: ["mqtt"],
        steps: [
            { order: 1, action: "warning", delaySec: 0, description: "ブローカー接続断" },
            { order: 2, action: "reconnect", delaySec: 10, description: "自動再接続" },
            { order: 3, action: "notify", delaySec: 1800, description: "30分継続で管理者通知" },
        ],
    },
];
export function findRuleForDevice(deviceKind, trigger = "heartbeat_lost") {
    const kind = deviceKind;
    return DEVICE_RECOVERY_RULES.find((r) => r.trigger === trigger && r.deviceKinds.includes(kind));
}
