import { StyleSheet, Text, View } from "react-native";
import { getCertPinningStatus } from "../services/api";
import { tvTheme } from "../theme/tvTheme";

/** Placeholder screen when TLS certificate pinning detects a mismatch. */
export function CertPinWarningScreen() {
  const st = getCertPinningStatus();
  return (
    <View style={styles.root}>
      <Text style={styles.title}>証明書検証エラー</Text>
      <Text style={styles.body}>
        サーバー証明書が登録済みフィンガープリントと一致しません。接続を中断しました。
      </Text>
      <Text style={styles.mono}>期待: {st.fingerprint}</Text>
      <Text style={styles.hint}>本番投入前にネイティブピンニングモジュールを有効化してください。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#3d0a0a",
    padding: tvTheme.spacing.screen,
    justifyContent: "center",
  },
  title: { fontSize: 36, color: "#ffb4b4", fontWeight: "700", marginBottom: 16 },
  body: { fontSize: 26, color: "#fff", marginBottom: 12 },
  mono: { fontSize: 20, color: "#ffccaa", fontFamily: "monospace", marginBottom: 8 },
  hint: { fontSize: 22, color: tvTheme.colors.muted, marginTop: 24 },
});
