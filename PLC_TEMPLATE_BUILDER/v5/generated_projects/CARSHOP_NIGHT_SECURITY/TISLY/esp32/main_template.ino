// TiSLY PLC Builder v5.21 — ESP Firmware Config Export
// Project: CARSHOP_NIGHT_SECURITY
// Arduino IDE: File → Open → main_template.ino
// PlatformIO: src/main.cpp へ移植可能

#include "config.h"
#include <WiFi.h>
#include <PubSubClient.h>

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

unsigned long lastHeartbeat = 0;

void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" connected");
}

void connectMQTT() {
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  while (!mqtt.connected()) {
    if (mqtt.connect(MQTT_CLIENT_ID)) {
      mqtt.subscribe(TOPIC_CMD);
      mqtt.publish(TOPIC_STATE, "{\"status\":\"online\"}");
    } else {
      delay(RECONNECT_DELAY_MS);
    }
  }
}

void sendHeartbeat() {
  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeat = millis();
    mqtt.publish(TOPIC_HEARTBEAT, "{\"device\":\"" TISLY_DEVICE_ID "\",\"ts\":" + String(millis()) + "}");
  }
}

void setup() {
  Serial.begin(115200);
  connectWiFi();
  connectMQTT();
  Serial.println("TiSLY ESP32 Gateway ready");
}

void loop() {
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop();
  sendHeartbeat();
  // TODO: PLC I/O ミラー / Modbus RTU 連携をここに追加
}
