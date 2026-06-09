export const DEVICE_TEMPLATES = [
    {
        id: "esp32-input",
        name: "ESP32 input unit",
        deviceType: "ESP32",
        platform: "esp-idf",
        iconType: "sensor",
        defaultMqttTopic: "tisly/{site}/esp32/{device_id}/event",
        description: "デジタル入力・環境センサー",
    },
    {
        id: "rp2350-relay",
        name: "RP2350 relay unit",
        deviceType: "RP2350",
        platform: "pico-sdk",
        iconType: "relay",
        defaultMqttTopic: "tisly/{site}/rp2350/{device_id}/cmd",
        description: "リレー出力・ゲート制御",
    },
    {
        id: "plc-gateway",
        name: "PLC gateway",
        deviceType: "PLC",
        platform: "modbus",
        iconType: "plc",
        defaultMqttTopic: "tisly/{site}/plc/{device_id}/status",
        description: "三菱 FX 系 Modbus ゲートウェイ",
    },
    {
        id: "camera",
        name: "Camera",
        deviceType: "Camera",
        platform: "onvif",
        iconType: "camera",
        defaultMqttTopic: "tisly/{site}/camera/{device_id}/snapshot",
        description: "IP カメラ（ONVIF）",
    },
    {
        id: "google-tv",
        name: "Google TV",
        deviceType: "TV",
        platform: "android-tv",
        iconType: "tv",
        defaultMqttTopic: "tisly/{site}/tv/{device_id}/heartbeat",
        description: "SOC ダッシュボード表示端末",
    },
    {
        id: "qnap",
        name: "QNAP",
        deviceType: "QNAP",
        platform: "qnap",
        iconType: "storage",
        defaultMqttTopic: "tisly/{site}/qnap/{device_id}/archive",
        description: "録画・アーカイブ NAS",
    },
    {
        id: "shelly-recovery",
        name: "Shelly recovery unit",
        deviceType: "Shelly",
        platform: "shelly",
        iconType: "recovery",
        defaultMqttTopic: "tisly/{site}/shelly/{device_id}/relay",
        description: "遠隔復旧用スマートリレー",
    },
];
export function listDeviceTemplates() {
    return DEVICE_TEMPLATES;
}
export function getDeviceTemplate(id) {
    return DEVICE_TEMPLATES.find((t) => t.id === id);
}
