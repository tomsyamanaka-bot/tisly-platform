import { getPlatformSetting } from "../../db/database.js";
import type { NotificationPayload } from "../types.js";
import type { DeliveryResult } from "../types.js";

interface DiscordSettings {
  enabled: boolean;
  webhookUrl: string;
  eventTypes: string[];
}

export async function sendDiscord(payload: NotificationPayload): Promise<DeliveryResult> {
  const settings = getPlatformSetting<DiscordSettings>("discord");
  if (!settings?.enabled || !settings.webhookUrl) {
    return { channel: "discord", success: false, error: "Discord disabled or no webhook" };
  }
  if (
    settings.eventTypes?.length &&
    !settings.eventTypes.includes(payload.eventType) &&
    !settings.eventTypes.includes("*")
  ) {
    return { channel: "discord", success: false, error: "Event type filtered" };
  }

  const body = {
    embeds: [
      {
        title: payload.title,
        description: payload.body,
        color: payload.eventType.includes("alarm") ? 0xff0000 : 0x1a7f37,
        fields: [
          { name: "イベント", value: payload.eventType, inline: true },
          ...(payload.deviceId
            ? [{ name: "デバイス", value: payload.deviceId, inline: true }]
            : []),
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const res = await fetch(settings.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { channel: "discord", success: false, error: `HTTP ${res.status}: ${text}` };
    }
    return { channel: "discord", success: true };
  } catch (err) {
    return {
      channel: "discord",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
