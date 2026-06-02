import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { loadTvSettings } from "../services/tvSettings";
import { tvTheme } from "../theme/tvTheme";

export function CamerasScreen() {
  const [grid, setGrid] = useState<4 | 8>(4);

  useEffect(() => {
    void loadTvSettings().then((s) => setGrid(s.cameraGrid));
  }, []);

  const count = grid === 8 ? 8 : 4;
  const tileWidth = grid === 8 ? "23%" : "48%";

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Demo Camera — {count}分割</Text>
      <View style={styles.grid}>
        {Array.from({ length: count }, (_, i) => (
          <View
            key={i}
            style={[styles.tile, { width: tileWidth }, i < 2 && styles.tileLive]}
          >
            <Text style={styles.tileLabel}>CH{i + 1}</Text>
            <Text style={styles.tileSub}>{i < 2 ? "LIVE（デモ）" : "待機"}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.note}>設定 → Camera Grid で 4/8 切替</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: tvTheme.spacing.screen },
  title: { fontSize: tvTheme.fontSize.hero, color: tvTheme.colors.text, marginBottom: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  tile: {
    aspectRatio: 16 / 10,
    marginBottom: 8,
    backgroundColor: tvTheme.colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tvTheme.colors.border,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 100,
  },
  tileLive: { borderColor: tvTheme.colors.primary, borderWidth: 2 },
  tileLabel: { fontSize: 28, color: tvTheme.colors.text, fontWeight: "700" },
  tileSub: { fontSize: 20, color: tvTheme.colors.muted, marginTop: 4 },
  note: { fontSize: 22, color: tvTheme.colors.muted, marginTop: 24 },
});
