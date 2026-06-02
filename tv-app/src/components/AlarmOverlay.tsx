import { useEffect } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import type { DashboardSummary } from "../services/api";
import { tvTheme } from "../theme/tvTheme";

interface Props {
  visible: boolean;
  summary?: DashboardSummary | null;
  onDismiss: () => void;
  durationSec?: number;
}

export function AlarmOverlay({ visible, summary, onDismiss, durationSec = 10 }: Props) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onDismiss, durationSec * 1000);
    return () => clearTimeout(t);
  }, [visible, durationSec, onDismiss]);

  return (
    <Modal visible={visible} animationType="fade" transparent={false}>
      <View style={styles.full}>
        <Text style={styles.hero}>警報</Text>
        <Text style={styles.body}>
          異常デバイス: {summary?.alarmDevices ?? 0} / システム: {summary?.systemStatus ?? "alarm"}
        </Text>
        <Text style={styles.hint}>{durationSec}秒後に監視画面へ復帰</Text>
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
  hero: { fontSize: 72, fontWeight: "800", color: "#fff" },
  body: { fontSize: tvTheme.fontSize.title, color: "#fff", marginTop: 24 },
  hint: { fontSize: tvTheme.fontSize.body, color: "rgba(255,255,255,0.8)", marginTop: 48 },
});
