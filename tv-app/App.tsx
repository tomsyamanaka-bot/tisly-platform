import { useEffect } from "react";
import { activateKeepAwakeAsync } from "expo-keep-awake";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { tvTheme } from "./src/theme/tvTheme";
import { HomeScreen } from "./src/screens/HomeScreen";
import { SecurityScreen } from "./src/screens/SecurityScreen";
import { EventsScreen } from "./src/screens/EventsScreen";
import { CamerasScreen } from "./src/screens/CamerasScreen";
import { StatusScreen } from "./src/screens/StatusScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { PairingScreen } from "./src/screens/PairingScreen";
import { AlarmOverlay } from "./src/components/AlarmOverlay";
import { useTislyApi } from "./src/hooks/useTislyApi";
import { useMqtt } from "./src/hooks/useMqtt";
import { useKioskMode } from "./src/hooks/useKioskMode";

export type RootStackParamList = {
  Home: undefined;
  Security: undefined;
  Events: undefined;
  Cameras: undefined;
  Status: undefined;
  Settings: undefined;
  Pairing: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const { dashboard, alarmActive, clearAlarm } = useTislyApi();
  const { activeAlarm, clearAlarm: clearMqttAlarm } = useMqtt();
  useKioskMode();

  const overlayVisible = alarmActive || !!activeAlarm;
  const overlayAlarm =
    activeAlarm ??
    (alarmActive
      ? {
          deviceName: `警報 ${dashboard?.summary?.alarmDevices ?? 0} 件`,
          eventType: dashboard?.summary?.systemStatus ?? "alarm",
          severity: "alarm",
          message: "API ダッシュボードから警報を検知",
          occurredAt: new Date().toISOString(),
        }
      : null);
  const dismissOverlay = () => {
    clearAlarm();
    clearMqttAlarm();
  };

  useEffect(() => {
    void activateKeepAwakeAsync();
  }, []);

  return (
    <NavigationContainer theme={tvTheme.nav}>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: tvTheme.colors.background },
          headerTintColor: tvTheme.colors.text,
          headerTitleStyle: { fontSize: 28 },
          contentStyle: { backgroundColor: tvTheme.colors.background },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: "TiSLY" }} />
        <Stack.Screen name="Security" component={SecurityScreen} options={{ title: "セキュリティ" }} />
        <Stack.Screen name="Events" component={EventsScreen} options={{ title: "イベント" }} />
        <Stack.Screen name="Cameras" component={CamerasScreen} options={{ title: "カメラ" }} />
        <Stack.Screen name="Status" component={StatusScreen} options={{ title: "状態" }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "設定" }} />
        <Stack.Screen name="Pairing" component={PairingScreen} options={{ title: "ペアリング" }} />
      </Stack.Navigator>
      <AlarmOverlay
        visible={overlayVisible}
        alarm={overlayAlarm}
        onDismiss={dismissOverlay}
        durationSec={10}
      />
    </NavigationContainer>
  );
}
