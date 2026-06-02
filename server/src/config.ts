import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), "..", ".env") });

export const config = {
  port: Number(process.env.TISLY_PORT ?? 3080),
  host: process.env.TISLY_HOST ?? "0.0.0.0",
  publicUrl: process.env.TISLY_PUBLIC_URL ?? "https://tisly.jp",
  mqtt: {
    url: process.env.MQTT_URL ?? "mqtt://127.0.0.1:1883",
    topicPrefix: process.env.MQTT_TOPIC_PREFIX ?? "tisly/#",
    clientId: process.env.MQTT_CLIENT_ID ?? "tisly-notification-core",
  },
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? "",
    privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
    subject: process.env.VAPID_SUBJECT ?? "mailto:admin@tisly.jp",
  },
  heartbeat: {
    warnSec: Number(process.env.HEARTBEAT_WARN_SEC ?? 30),
    alarmSec: Number(process.env.HEARTBEAT_ALARM_SEC ?? 300),
  },
};
