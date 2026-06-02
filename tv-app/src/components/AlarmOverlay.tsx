import { useEffect, useRef } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { TvAlarmPayload } from "../services/mqtt";
import { getTvSettings } from "../services/tvSettings";
import { tvTheme } from "../theme/tvTheme";

interface Props {
  visible: boolean;
  alarm?: TvAlarmPayload | null;
  onDismiss: () => void;
  durationSec?: number;
}

export function AlarmOverlay({ visible, alarm, onDismiss, durationSec = 10 }: Props) {
  const persistent = alarm?.persistent ?? alarm?.severity === "critical";
  const blink = useRef(new Animated.Value(1)).current;
  const settings = getTvSettings();

  useEffect(() => {
    if (!visible || persistent) return;
    const t = setTimeout(onDismiss, durationSec * 1000);
    return () => clearTimeout(t);
  }, [visible, persistent, durationSec, onDismiss]);

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.35, duration: 400, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible, blink]);

  useEffect(() => {
    if (!visible || !settings.soundOn) return;
    console.log("[TiSLY TV] 警報音（デモ — 実機ではネイティブ音声を使用）");
  }, [visible, settings.soundOn]);

  if (!visible || !alarm) return null;

  const timeLabel = alarm.occurredAt
    ? new Date(alarm.occurredAt).toLocaleString("ja-JP")
    : "—";

  return (
    <Modal visible={visible} animationType="fade" transparent={false}>
      <Animated.View style={[styles.full, { opacity: blink }]}>
        <Text style={styles.hero}>⚠ 警報</Text>
        <Text style={styles.device}>{alarm.deviceName}</Text>
        <Text style={styles.type}>{alarm.eventType}</Text>
        <Text style={styles.message}>{alarm.message}</Text>
        <Text style={styles.time}>{timeLabel}</Text>
        {persistent ? (
          <Pressable style={styles.dismissBtn} onPress={onDismiss}>
            <Text style={styles.dismissText}>警報解除</Text>
          </Pressable>
        ) : (
          <Text style={styles.hint}>{durationSec}秒後に監視画面へ復帰</Text>
        )}
        <Pressable style={styles.dismissSecondary} onPress={onDismiss}>
          <Text style={styles.dismissSecondaryText}>今すぐ閉じる</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  full: {
    flex: 1,
    backgroundColor: tvTheme.colors.alarm,
    justifyContent: "center",
    alignItems: "center",
    padding: tvTheme.spacing.screen,
  },
  hero: { fontSize: 96, fontWeight: "800", color: "#fff" },
  device: { fontSize: 48, fontWeight: "700", color: "#fff", marginTop: 32 },
  type: { fontSize: 36, color: "rgba(255,255,255,0.9)", marginTop: 16 },
  message: { fontSize: tvTheme.fontSize.title, color: "#fff", marginTop: 24, textAlign: "center" },
  time: { fontSize: tvTheme.fontSize.body, color: "rgba(255,255,255,0.85)", marginTop: 24 },
  hint: { fontSize: tvTheme.fontSize.body, color: "rgba(255,255,255,0.8)", marginTop: 48 },
  dismissBtn: {
    marginTop: 40,
    backgroundColor: "#fff",
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 8,
  },
  dismissText: { fontSize: 32, fontWeight: "700", color: tvTheme.colors.alarm },
  dismissSecondary: { marginTop: 24 },
  dismissSecondaryText: { fontSize: 26, color: "rgba(255,255,255,0.9)" },
});
