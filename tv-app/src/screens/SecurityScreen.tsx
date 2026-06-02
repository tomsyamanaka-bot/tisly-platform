import { StyleSheet, Text, View } from "react-native";
import { useTislyApi } from "../hooks/useTislyApi";
import { tvTheme } from "../theme/tvTheme";

export function SecurityScreen() {
  const { dashboard } = useTislyApi();
  return (
    <View style={styles.root}>
      <Text style={styles.title}>セキュリティ監視</Text>
      <Text style={styles.status}>システム: {dashboard?.summary.systemStatus ?? "—"}</Text>
      {(dashboard?.recentAlarms ?? []).map((a, i) => (
        <Text key={i} style={styles.item}>
          {a.created_at} — {a.device_id} — {a.event_type}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: tvTheme.spacing.screen },
  title: { fontSize: tvTheme.fontSize.hero, color: tvTheme.colors.text },
  status: { fontSize: tvTheme.fontSize.title, color: tvTheme.colors.primary, marginVertical: 16 },
  item: { fontSize: tvTheme.fontSize.body, color: tvTheme.colors.text, marginVertical: 8 },
});
