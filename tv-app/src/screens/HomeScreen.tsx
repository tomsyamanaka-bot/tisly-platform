import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { TvCard } from "../components/TvCard";
import { useTislyApi } from "../hooks/useTislyApi";
import { tvTheme } from "../theme/tvTheme";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const { dashboard } = useTislyApi(10_000);
  const [clock, setClock] = useState(new Date().toLocaleString("ja-JP"));

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleString("ja-JP")), 1000);
    return () => clearInterval(t);
  }, []);

  const s = dashboard?.summary;

  return (
    <View style={styles.root}>
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
        <TvCard title="デバイス" subtitle={`${s?.deviceCount ?? 0} 台`} onPress={() => navigation.navigate("Status")} />
        <TvCard title="イベント (24h)" subtitle={`${s?.eventCount24h ?? 0}`} onPress={() => navigation.navigate("Events")} />
      </View>
      <View style={styles.row}>
        <TvCard title="セキュリティ" onPress={() => navigation.navigate("Security")} />
        <TvCard title="カメラ" subtitle="RTSP / WebRTC 予定" onPress={() => navigation.navigate("Cameras")} />
        <TvCard title="設定" onPress={() => navigation.navigate("Settings")} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: tvTheme.spacing.screen },
  clock: { fontSize: tvTheme.fontSize.hero, color: tvTheme.colors.text, fontWeight: "700" },
  weather: { fontSize: tvTheme.fontSize.body, color: tvTheme.colors.muted, marginBottom: 24 },
  row: { flexDirection: "row", flexWrap: "wrap" },
});
