import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  getTvSettings,
  loadTvSettings,
  saveTvSettings,
  type TvSettings,
} from "../services/tvSettings";
import { tvTheme } from "../theme/tvTheme";

export function SettingsScreen() {
  const [settings, setSettings] = useState<TvSettings>(getTvSettings());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadTvSettings().then(setSettings);
  }, []);

  const update = (partial: Partial<TvSettings>) => {
    setSettings((s) => ({ ...s, ...partial }));
    setSaved(false);
  };

  const onSave = async () => {
    await saveTvSettings(settings);
    setSaved(true);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>設定</Text>
      <Text style={styles.todo}>
        TODO: TV ペアリング API（短時間コード検証）とサーバー同期
      </Text>

      <Field label="Server URL">
        <TextInput
          style={styles.input}
          value={settings.serverUrl}
          onChangeText={(v) => update({ serverUrl: v })}
          placeholder="https://tisly.jp"
          placeholderTextColor={tvTheme.colors.muted}
        />
      </Field>

      <Field label="Pairing Code">
        <TextInput
          style={styles.input}
          value={settings.pairingCode}
          onChangeText={(v) => update({ pairingCode: v })}
          placeholder="6桁コード"
          placeholderTextColor={tvTheme.colors.muted}
        />
      </Field>

      <Field label="Site ID">
        <TextInput
          style={styles.input}
          value={settings.siteId}
          onChangeText={(v) => update({ siteId: v })}
          placeholderTextColor={tvTheme.colors.muted}
        />
      </Field>

      <Field label="Display Mode">
        <Text style={styles.value}>{settings.displayMode}</Text>
        <View style={styles.row}>
          {(["dashboard", "security", "cameras"] as const).map((m) => (
            <Pressable key={m} style={styles.chip} onPress={() => update({ displayMode: m })}>
              <Text style={styles.chipText}>{m}</Text>
            </Pressable>
          ))}
        </View>
      </Field>

      <Field label="Camera Mode">
        <Text style={styles.value}>{settings.cameraMode}</Text>
        <View style={styles.row}>
          {(["placeholder", "rtsp", "webrtc"] as const).map((m) => (
            <Pressable key={m} style={styles.chip} onPress={() => update({ cameraMode: m })}>
              <Text style={styles.chipText}>{m}</Text>
            </Pressable>
          ))}
        </View>
      </Field>

      <Field label="Sound ON/OFF">
        <Switch value={settings.soundOn} onValueChange={(v) => update({ soundOn: v })} />
      </Field>

      <Field label="Auto Recover ON/OFF">
        <Switch
          value={settings.autoRecoverOn}
          onValueChange={(v) => update({ autoRecoverOn: v })}
        />
      </Field>

      <Pressable style={styles.saveBtn} onPress={() => void onSave()}>
        <Text style={styles.saveText}>保存</Text>
      </Pressable>
      {saved ? <Text style={styles.ok}>保存しました（ローカル）</Text> : null}
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tvTheme.colors.background },
  content: { padding: tvTheme.spacing.screen, paddingBottom: 48 },
  title: { fontSize: tvTheme.fontSize.hero, color: tvTheme.colors.text, marginBottom: 8 },
  todo: { fontSize: 22, color: tvTheme.colors.muted, marginBottom: 24 },
  field: { marginBottom: 28 },
  label: { fontSize: tvTheme.fontSize.body, color: tvTheme.colors.muted, marginBottom: 8 },
  input: {
    fontSize: tvTheme.fontSize.body,
    color: tvTheme.colors.text,
    borderWidth: 1,
    borderColor: tvTheme.colors.border,
    borderRadius: 8,
    padding: 12,
  },
  value: { fontSize: tvTheme.fontSize.body, color: tvTheme.colors.text, marginBottom: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: tvTheme.colors.card,
    borderRadius: 8,
  },
  chipText: { fontSize: 24, color: tvTheme.colors.text },
  saveBtn: {
    marginTop: 16,
    backgroundColor: tvTheme.colors.primary,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  saveText: { fontSize: 28, color: "#fff", fontWeight: "700" },
  ok: { fontSize: 24, color: tvTheme.colors.primary, marginTop: 12 },
});
