import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import {
  confirmTvPairing,
  fetchTvConfig,
  startTvPairing,
  unpairTvDevice,
} from "../services/api";
import {
  getTvSettings,
  loadTvSettings,
  saveTvSettings,
} from "../services/tvSettings";
import { tvTheme } from "../theme/tvTheme";

type Props = NativeStackScreenProps<RootStackParamList, "Pairing">;

export function PairingScreen({ navigation }: Props) {
  const [serverUrl, setServerUrl] = useState(getTvSettings().serverUrl);
  const [deviceId, setDeviceId] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "paired" | "error">("idle");
  const [message, setMessage] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [adminSiteId, setAdminSiteId] = useState("default");

  const refreshConfig = useCallback(async (id: string, base: string) => {
    try {
      const cfg = await fetchTvConfig(id, base);
      if (cfg.paired) {
        setStatus("paired");
        setMessage(`ペアリング済み — site: ${cfg.siteId ?? "—"}`);
        await saveTvSettings({
          serverUrl: base,
          siteId: cfg.siteId ?? "default",
          pairingCode: "",
        });
      }
    } catch {
      /* not paired yet */
    }
  }, []);

  useEffect(() => {
    void loadTvSettings().then((s) => {
      setServerUrl(s.serverUrl);
      if (s.deviceId) {
        setDeviceId(s.deviceId);
        void refreshConfig(s.deviceId, s.serverUrl);
      }
    });
  }, [refreshConfig]);

  const onStartPairing = async () => {
    setStatus("loading");
    setMessage("");
    try {
      const res = await startTvPairing(
        { tvDeviceId: deviceId || undefined },
        serverUrl
      );
      setDeviceId(res.deviceId);
      setPairingCode(res.pairingCode);
      setExpiresAt(res.expiresAt);
      await saveTvSettings({
        serverUrl,
        deviceId: res.deviceId,
        pairingCode: res.pairingCode,
      });
      setStatus("idle");
      setMessage("管理画面でコードを入力してください（有効10分）");
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "ペアリング開始に失敗");
    }
  };

  const onPollPaired = async () => {
    if (!deviceId) return;
    setStatus("loading");
    try {
      const cfg = await fetchTvConfig(deviceId, serverUrl);
      if (cfg.paired) {
        setStatus("paired");
        setMessage("ペアリング完了");
        await saveTvSettings({ siteId: cfg.siteId ?? "default", pairingCode: "" });
        navigation.replace("Home");
      } else {
        setStatus("idle");
        setMessage("まだ未ペアリング — 管理画面で確定してください");
      }
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "状態確認失敗");
    }
  };

  const onAdminConfirm = async () => {
    setStatus("loading");
    try {
      await confirmTvPairing(
        { pairingCode: adminCode, siteId: adminSiteId, tvDeviceId: deviceId || undefined },
        serverUrl
      );
      setStatus("paired");
      setMessage("管理画面からペアリング確定");
      await saveTvSettings({ siteId: adminSiteId });
      navigation.replace("Home");
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "確定失敗");
    }
  };

  const onUnpair = async () => {
    if (!deviceId) return;
    setStatus("loading");
    try {
      await unpairTvDevice(deviceId, serverUrl);
      setPairingCode("");
      setStatus("idle");
      setMessage("ペアリング解除しました");
      await saveTvSettings({ pairingCode: "", siteId: "default" });
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "解除失敗");
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>TV ペアリング</Text>
      <Text style={styles.hint}>6桁コードを管理画面に入力して拠点と紐付けます</Text>

      <Field label="サーバー URL">
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="http://192.168.1.10:3080"
          placeholderTextColor={tvTheme.colors.muted}
        />
      </Field>

      <Field label="TV Device ID（任意）">
        <TextInput
          style={styles.input}
          value={deviceId}
          onChangeText={setDeviceId}
          placeholder="TV-LOBBY-001"
          placeholderTextColor={tvTheme.colors.muted}
        />
      </Field>

      <Pressable style={styles.btn} onPress={() => void onStartPairing()}>
        <Text style={styles.btnText}>ペアリングコードを発行</Text>
      </Pressable>

      {pairingCode ? (
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>表示コード</Text>
          <Text style={styles.code}>{pairingCode}</Text>
          {expiresAt ? (
            <Text style={styles.hint}>有効期限: {new Date(expiresAt).toLocaleString()}</Text>
          ) : null}
        </View>
      ) : null}

      <Pressable style={styles.btnSecondary} onPress={() => void onPollPaired()}>
        <Text style={styles.btnText}>接続状態を確認 → Home へ</Text>
      </Pressable>

      {status === "loading" ? <ActivityIndicator color={tvTheme.colors.primary} /> : null}
      {message ? <Text style={styles.msg}>{message}</Text> : null}

      <View style={styles.divider} />
      <Text style={styles.subtitle}>管理画面用（デモ）</Text>
      <Field label="入力コード">
        <TextInput
          style={styles.input}
          value={adminCode}
          onChangeText={setAdminCode}
          keyboardType="number-pad"
          maxLength={6}
          placeholderTextColor={tvTheme.colors.muted}
        />
      </Field>
      <Field label="Site ID">
        <TextInput
          style={styles.input}
          value={adminSiteId}
          onChangeText={setAdminSiteId}
          placeholderTextColor={tvTheme.colors.muted}
        />
      </Field>
      <Pressable style={styles.btn} onPress={() => void onAdminConfirm()}>
        <Text style={styles.btnText}>コードで確定（管理）</Text>
      </Pressable>

      <Pressable style={styles.btnDanger} onPress={() => void onUnpair()}>
        <Text style={styles.btnText}>ペアリング解除</Text>
      </Pressable>
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
  title: { fontSize: tvTheme.fontSize.hero, color: tvTheme.colors.text },
  subtitle: { fontSize: 28, color: tvTheme.colors.text, marginTop: 16 },
  hint: { fontSize: 22, color: tvTheme.colors.muted, marginVertical: 8 },
  field: { marginBottom: 20 },
  label: { fontSize: 24, color: tvTheme.colors.muted, marginBottom: 6 },
  input: {
    fontSize: 26,
    color: tvTheme.colors.text,
    borderWidth: 1,
    borderColor: tvTheme.colors.border,
    borderRadius: 8,
    padding: 12,
  },
  btn: {
    backgroundColor: tvTheme.colors.primary,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  btnSecondary: {
    backgroundColor: tvTheme.colors.card,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  btnDanger: {
    backgroundColor: "#8b2635",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 24,
  },
  btnText: { fontSize: 26, color: "#fff", fontWeight: "600" },
  codeBox: {
    alignItems: "center",
    padding: 24,
    marginVertical: 16,
    backgroundColor: tvTheme.colors.card,
    borderRadius: 12,
  },
  codeLabel: { fontSize: 24, color: tvTheme.colors.muted },
  code: {
    fontSize: 72,
    fontWeight: "800",
    color: tvTheme.colors.primary,
    letterSpacing: 12,
  },
  msg: { fontSize: 24, color: tvTheme.colors.text, marginTop: 12 },
  divider: { height: 1, backgroundColor: tvTheme.colors.border, marginVertical: 24 },
});
