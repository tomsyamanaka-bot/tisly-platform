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
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import {
  getTvSettings,
  loadTvSettings,
  saveTvSettings,
  SIGNAGE_LABELS,
  type SignageMode,
  type TvSettings,
} from "../services/tvSettings";
import { tvTheme } from "../theme/tvTheme";
import { assertCertPinningConfigured, getCertPinningStatus } from "../services/api";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

export function SettingsScreen({ navigation }: Props) {
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

      <Field label="Demo Mode（営業デモ）">
        <Switch value={settings.demoMode} onValueChange={(v) => update({ demoMode: v })} />
        <Text style={styles.hint}>ON: サーバー WS イベントを優先表示</Text>
      </Field>

      <Field label="TV サイネージモード">
        <View style={styles.row}>
          {(Object.keys(SIGNAGE_LABELS) as SignageMode[]).map((m) => (
            <Pressable
              key={m}
              style={[styles.chip, settings.signageMode === m && styles.chipActive]}
              onPress={() => update({ signageMode: m })}
            >
              <Text style={styles.chipText}>{m}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>{SIGNAGE_LABELS[settings.signageMode]}</Text>
      </Field>

      <Field label="TLS 証明書ピン留め">
        {(() => {
          const st = getCertPinningStatus();
          void assertCertPinningConfigured();
          return (
            <>
              <Text style={styles.hint}>有効: {st.enabled ? "ON" : "OFF"}</Text>
              <Text style={styles.hint}>Fingerprint: {st.fingerprint}</Text>
              <Text style={styles.hint}>最終検証: {st.lastVerification}</Text>
              {st.lastVerification === "mismatch" ? (
                <Text style={[styles.hint, { color: "#ffb4b4" }]}>
                  不一致 — CertPinWarning 画面を表示（placeholder）
                </Text>
              ) : null}
            </>
          );
        })()}
      </Field>

      <Field label="Server URL">
        <TextInput
          style={styles.input}
          value={settings.serverUrl}
          onChangeText={(v) => update({ serverUrl: v })}
          placeholder="http://localhost:3080"
          placeholderTextColor={tvTheme.colors.muted}
        />
      </Field>

      <Pressable style={styles.linkBtn} onPress={() => navigation.navigate("Pairing")}>
        <Text style={styles.linkText}>ペアリング画面を開く（6桁コード）</Text>
      </Pressable>

      <Field label="Site ID">
        <TextInput
          style={styles.input}
          value={settings.siteId}
          onChangeText={(v) => update({ siteId: v })}
          placeholderTextColor={tvTheme.colors.muted}
        />
      </Field>

      <Field label="Display Mode">
        <View style={styles.row}>
          {(["dashboard", "security", "cameras"] as const).map((m) => (
            <Pressable key={m} style={styles.chip} onPress={() => update({ displayMode: m })}>
              <Text style={styles.chipText}>{m}</Text>
            </Pressable>
          ))}
        </View>
      </Field>

      <Field label="Camera Grid（デモ）">
        <View style={styles.row}>
          {([4, 8] as const).map((g) => (
            <Pressable
              key={g}
              style={[styles.chip, settings.cameraGrid === g && styles.chipActive]}
              onPress={() => update({ cameraGrid: g })}
            >
              <Text style={styles.chipText}>{g}分割</Text>
            </Pressable>
          ))}
        </View>
      </Field>

      <Field label="Sound ON/OFF（警報音）">
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
  hint: { fontSize: 22, color: tvTheme.colors.muted, marginTop: 8 },
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
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: tvTheme.colors.card,
    borderRadius: 8,
  },
  chipActive: { borderWidth: 2, borderColor: tvTheme.colors.primary },
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
  linkBtn: {
    marginBottom: 20,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: tvTheme.colors.primary,
  },
  linkText: { fontSize: 26, color: tvTheme.colors.primary },
});
