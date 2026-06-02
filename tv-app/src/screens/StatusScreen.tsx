import { StyleSheet, Text, View } from "react-native";
import { useMqtt } from "../hooks/useMqtt";
import { useTislyApi } from "../hooks/useTislyApi";
import { tvTheme } from "../theme/tvTheme";

const STATE_LABEL: Record<string, string> = {
  disconnected: "切断",
  connecting: "接続中",
  connected: "接続済み",
  mock: "モック",
};

export function StatusScreen() {
  const { dashboard, error } = useTislyApi(5_000);
  const { connectionState, lastHeartbeat } = useMqtt();
  const s = dashboard?.summary;

  return (
    <View style={styles.root}>
      <Text style={styles.big}>{s?.systemStatus ?? "—"}</Text>
      <Text style={styles.line}>WebSocket: {STATE_LABEL[connectionState] ?? connectionState}</Text>
      <Text style={styles.line}>
        最終 heartbeat: {lastHeartbeat ? new Date(lastHeartbeat).toLocaleTimeString("ja-JP") : "—"}
      </Text>
      <Text style={styles.line}>デバイス: {s?.deviceCount ?? 0}</Text>
      <Text style={styles.line}>未読通知: {s?.unreadNotifications ?? 0}</Text>
      <Text style={styles.line}>警報デバイス: {s?.alarmDevices ?? 0}</Text>
      {error ? <Text style={styles.err}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: tvTheme.spacing.screen },
  big: { fontSize: 64, color: tvTheme.colors.primary, fontWeight: "800" },
  line: { fontSize: tvTheme.fontSize.title, color: tvTheme.colors.text, marginTop: 16 },
  err: { fontSize: tvTheme.fontSize.body, color: tvTheme.colors.alarm, marginTop: 24 },
});
