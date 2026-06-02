/**
 * MQTT WebSocket — tisly.jp 中央ブローカー経由
 * 本フェーズはプレースホルダー。実接続は Phase 41+ で実装。
 */
export const MQTT_CONFIG = {
  wsUrl: process.env.EXPO_PUBLIC_MQTT_WS ?? "wss://mqtt.tisly.jp:9001",
  topicPrefix: "tisly/#",
};

export type MqttMessageHandler = (topic: string, payload: string) => void;

export function connectMqtt(_onMessage: MqttMessageHandler): { disconnect: () => void } {
  console.info("[TiSLY TV] MQTT connect placeholder — wire in Phase 41+");
  return { disconnect: () => {} };
}
