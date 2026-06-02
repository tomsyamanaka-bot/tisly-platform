import { useEffect } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import type { TvAlarmPayload } from "../services/mqtt";
import { tvTheme } from "../theme/tvTheme";

interface Props {
  visible: boolean;
  alarm?: TvAlarmPayload | null;
  onDismiss: () => void;
  durationSec?: number;
}

export function AlarmOverlay({ visible, alarm, onDismiss, durationSec = 10 }: Props) {
  const persistent = alarm?.persistent ?? alarm?.severity === "critical";

  useEffect(() => {
    if (!visible || persistent) return;
    const t = setTimeout(onDismiss, durationSec * 1000);
    return () => clearTimeout(t);
  }, [visible, persistent, durationSec, onDismiss]);

  if (!visible || !alarm) return null;

  const timeLabel = alarm.occurredAt
    ? new Date(alarm.occurredAt).toLocaleString("ja-JP")
    : "—";

  return (
    <Modal visible={visible} animationType="fade" transparent={false}>
      <View style={styles.full}>
        <Text style={styles.hero}>警報</Text>
        <Text style={styles.device}>{alarm.deviceName}</Text>
        <Text style={styles.type}>{alarm.eventType}</Text>
        <Text style={styles.message}>{alarm.message}</Text>
        <Text style={styles.time}>{timeLabel}</Text>
        {persistent ? (
          <Text style={styles.hint}>
            重大アラーム — 手動解除まで表示（解除 UI は将来 TODO）
          </Text>
        ) : (
          <Text style={styles.hint}>{durationSec}秒後に監視画面へ復帰</Text>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  full: {
    flex: 1,
    backgroundColor: tvTheme.colors.alarm,
    justifyContent: "center",
    alignItems: "center",
    padding: tvTheme.spacing.screen,
  },
  hero: { fontSize: 88, fontWeight: "800", color: "#fff" },
  device: { fontSize: 48, fontWeight: "700", color: "#fff", marginTop: 32 },
  type: { fontSize: 36, color: "rgba(255,255,255,0.9)", marginTop: 16 },
  message: { fontSize: tvTheme.fontSize.title, color: "#fff", marginTop: 24, textAlign: "center" },
  time: { fontSize: tvTheme.fontSize.body, color: "rgba(255,255,255,0.85)", marginTop: 24 },
  hint: { fontSize: tvTheme.fontSize.body, color: "rgba(255,255,255,0.8)", marginTop: 48 },
});
