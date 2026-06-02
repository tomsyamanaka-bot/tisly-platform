import { StyleSheet, Text, View } from "react-native";
import { tvTheme } from "../theme/tvTheme";

/** 将来: RTSP / WebRTC / H.View / Reolink */
export function CamerasScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>カメラ</Text>
      <Text style={styles.placeholder}>RTSP — 未実装</Text>
      <Text style={styles.placeholder}>WebRTC — 未実装</Text>
      <Text style={styles.placeholder}>H.View — 未実装</Text>
      <Text style={styles.placeholder}>Reolink — 未実装</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: tvTheme.spacing.screen, justifyContent: "center" },
  title: { fontSize: tvTheme.fontSize.hero, color: tvTheme.colors.text },
  placeholder: {
    fontSize: tvTheme.fontSize.title,
    color: tvTheme.colors.muted,
    marginTop: 20,
    padding: 24,
    backgroundColor: tvTheme.colors.card,
    borderRadius: 12,
  },
});
