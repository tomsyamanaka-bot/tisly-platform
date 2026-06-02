import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { TvCard } from "../components/TvCard";
import { useTislyApi } from "../hooks/useTislyApi";
import {
  getTvSettings,
  loadTvSettings,
  SIGNAGE_LABELS,
  type SignageMode,
} from "../services/tvSettings";
import { tvTheme } from "../theme/tvTheme";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

const SIGNAGE_ACCENT: Record<SignageMode, string> = {
  security: tvTheme.colors.alarm,
  facility: tvTheme.colors.primary,
  factory: "#d29922",
  hotel: "#58a6ff",
};

export function HomeScreen({ navigation }: Props) {
  const { dashboard } = useTislyApi(10_000);
  const [clock, setClock] = useState(new Date().toLocaleString("ja-JP"));
  const [signage, setSignage] = useState<SignageMode>("security");

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleString("ja-JP")), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    void loadTvSettings().then((s) => setSignage(s.signageMode));
  }, []);

  const s = dashboard?.summary;
  const accent = SIGNAGE_ACCENT[signage];

  return (
    <View style={styles.root}>
      <View style={[styles.signageBar, { borderLeftColor: accent }]}>
        <Text style={[styles.signageLabel, { color: accent }]}>
          {SIGNAGE_LABELS[signage]}
        </Text>
        {getTvSettings().demoMode ? (
          <Text style={styles.demoBadge}>DEMO MODE</Text>
        ) : null}
      </View>
      <Text style={styles.clock}>{clock}</Text>
      <Text style={styles.weather}>天気: — （API 連携予定）</Text>
      <View style={styles.row}>
        <TvCard
          title="状態"
          subtitle={s?.systemStatus ?? "読込中"}
          onPress={() => navigation.navigate("Status")}
        />
        <TvCard
          title="警報"
          subtitle={`${s?.alarmDevices ?? 0} 件`}
          onPress={() => navigation.navigate("Security")}
        />
      </View>
      <View style={styles.row}>
        <TvCard
          title="現場"
          subtitle={`${s?.siteCount ?? 5} 拠点`}
          onPress={() => navigation.navigate("Status")}
        />
        <TvCard
          title="デバイス"
          subtitle={`${s?.deviceCount ?? 0} 台`}
          onPress={() => navigation.navigate("Status")}
        />
        <TvCard
          title="イベント (24h)"
          subtitle={`${s?.eventCount24h ?? 0}`}
          onPress={() => navigation.navigate("Events")}
        />
      </View>
      <View style={styles.row}>
        <TvCard
          title="AI Risk"
          subtitle={`${s?.riskScoreAvg24h ?? 0} / 100`}
          onPress={() => navigation.navigate("Security")}
        />
        <TvCard
          title="Critical"
          subtitle={`${s?.criticalCount24h ?? 0} 件 (24h)`}
          onPress={() => navigation.navigate("Security")}
        />
      </View>
      <View style={styles.row}>
        <TvCard title="セキュリティ" onPress={() => navigation.navigate("Security")} />
        <TvCard title="カメラ" subtitle={`${getTvSettings().cameraGrid}分割デモ`} onPress={() => navigation.navigate("Cameras")} />
        <TvCard title="設定" onPress={() => navigation.navigate("Settings")} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: tvTheme.spacing.screen },
  signageBar: {
    borderLeftWidth: 6,
    paddingLeft: 16,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  signageLabel: { fontSize: 28, fontWeight: "600" },
  demoBadge: {
    fontSize: 22,
    color: tvTheme.colors.primary,
    fontWeight: "700",
  },
  clock: { fontSize: tvTheme.fontSize.hero, color: tvTheme.colors.text, fontWeight: "700" },
  weather: { fontSize: tvTheme.fontSize.body, color: tvTheme.colors.muted, marginBottom: 24 },
  row: { flexDirection: "row", flexWrap: "wrap" },
});
