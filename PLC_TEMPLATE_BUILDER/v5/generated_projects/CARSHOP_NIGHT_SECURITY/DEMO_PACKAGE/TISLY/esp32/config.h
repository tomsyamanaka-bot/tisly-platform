// TiSLY PLC Builder v5.21 — ESP Firmware Config Export
// Project: CARSHOP_NIGHT_SECURITY
// Arduino IDE / PlatformIO 共通 config.h

#ifndef TISLY_CONFIG_H
#define TISLY_CONFIG_H

#define TISLY_DEVICE_ID     "211"
#define TISLY_PROJECT_NAME  "CARSHOP_NIGHT_SECURITY"

// WiFi
#define WIFI_SSID           "YOUR_WIFI_SSID"
#define WIFI_PASSWORD       "YOUR_WIFI_PASSWORD"

// MQTT
#define MQTT_BROKER         "mqtt.tisly.local"
#define MQTT_PORT           1883
#define MQTT_CLIENT_ID      "tisly-esp-211"

// Topics
#define TOPIC_BASE          "tisly/device/211"
#define TOPIC_STATE         "tisly/device/211/state"
#define TOPIC_ALARM         "tisly/device/211/alarm"
#define TOPIC_MOTION        "tisly/device/211/motion"
#define TOPIC_OUTPUT        "tisly/device/211/output"
#define TOPIC_CMD           "tisly/device/211/cmd"
#define TOPIC_HEARTBEAT     "tisly/device/211/heartbeat"

// Timing
#define HEARTBEAT_INTERVAL_MS  30000
#define RECONNECT_DELAY_MS     5000

#endif // TISLY_CONFIG_H
