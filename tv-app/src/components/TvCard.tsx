import { Pressable, StyleSheet, Text, View } from "react-native";
import { tvTheme } from "../theme/tvTheme";

interface Props {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  focused?: boolean;
}

export function TvCard({ title, subtitle, onPress, focused }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, focused && styles.focused]}
      accessibilityRole="button"
    >
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tvTheme.colors.card,
    borderRadius: tvTheme.card.borderRadius,
    padding: tvTheme.card.padding,
    minHeight: tvTheme.card.minHeight,
    borderWidth: 3,
    borderColor: "transparent",
    margin: 12,
    flex: 1,
    justifyContent: "center",
  },
  focused: { borderColor: tvTheme.colors.primary },
  title: { color: tvTheme.colors.text, fontSize: tvTheme.fontSize.title, fontWeight: "700" },
  sub: { color: tvTheme.colors.muted, fontSize: tvTheme.fontSize.body, marginTop: 8 },
});
