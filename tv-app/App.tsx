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
import { AlarmOverlay } from "./src/components/AlarmOverlay";
import { useTislyApi } from "./src/hooks/useTislyApi";
import { useKioskMode } from "./src/hooks/useKioskMode";

export type RootStackParamList = {
  Home: undefined;
  Security: undefined;
  Events: undefined;
  Cameras: undefined;
  Status: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const { dashboard, alarmActive, clearAlarm } = useTislyApi();
  useKioskMode();

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
      </Stack.Navigator>
      <AlarmOverlay
        visible={alarmActive}
        summary={dashboard?.summary}
        onDismiss={clearAlarm}
        durationSec={10}
      />
    </NavigationContainer>
  );
}
