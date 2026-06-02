import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { fetchEvents } from "../services/api";
import { tvTheme } from "../theme/tvTheme";

export function EventsScreen() {
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    fetchEvents(50)
      .then((d) => setEvents((d.events as Array<Record<string, unknown>>) ?? []))
      .catch(console.error);
  }, []);

  return (
    <ScrollView style={styles.root}>
      {events.map((e, i) => (
        <Text key={i} style={styles.line}>
          {String(e.created_at)} | {String(e.device_id)} | {String(e.event_type)}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: tvTheme.spacing.screen },
  line: { fontSize: tvTheme.fontSize.body, color: tvTheme.colors.text, marginVertical: 10 },
});
