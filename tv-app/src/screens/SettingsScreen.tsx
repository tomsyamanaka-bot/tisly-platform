import { StyleSheet, Text, View } from "react-native";
import { tvTheme } from "../theme/tvTheme";

export function SettingsScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>設定</Text>
      <Text style={styles.line}>API: tisly.jp</Text>
      <Text style={styles.line}>キオスク: 有効（Keep Awake）</Text>
      <Text style={styles.line}>自動復旧: AppState 監視</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: tvTheme.spacing.screen },
  title: { fontSize: tvTheme.fontSize.hero, color: tvTheme.colors.text },
  line: { fontSize: tvTheme.fontSize.body, color: tvTheme.colors.muted, marginTop: 16 },
});
