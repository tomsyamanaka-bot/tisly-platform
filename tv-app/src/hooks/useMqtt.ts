import { useCallback, useEffect, useState } from "react";
import {
  connectMqtt,
  disconnectMqtt,
  extractAlarmFromMessage,
  getMqttConnectionState,
  watchMqttState,
  type MqttConnectionState,
  type TvAlarmPayload,
} from "../services/mqtt";

export function useMqtt() {
  const [connectionState, setConnectionState] = useState<MqttConnectionState>(
    getMqttConnectionState()
  );
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);
  const [activeAlarm, setActiveAlarm] = useState<TvAlarmPayload | null>(null);

  const onMessage = useCallback(
    (msg: { type: string; payload: Record<string, unknown>; at: string }) => {
      if (msg.type === "heartbeat") {
        setLastHeartbeat(msg.at);
      }
      if (msg.type === "alarm") {
        const alarm = extractAlarmFromMessage(
          msg as { type: "alarm"; payload: Record<string, unknown>; at: string }
        );
        if (alarm) setActiveAlarm(alarm);
      }
    },
    []
  );

  useEffect(() => {
    const unwatch = watchMqttState(setConnectionState);
    void connectMqtt(onMessage);
    return () => {
      unwatch();
      disconnectMqtt();
    };
  }, [onMessage]);

  const clearAlarm = useCallback(() => setActiveAlarm(null), []);

  return { connectionState, lastHeartbeat, activeAlarm, clearAlarm };
}
