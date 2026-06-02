import { useCallback, useEffect, useState } from "react";
import { fetchDashboard, postHeartbeat, type DashboardResponse } from "../services/api";

const TV_DEVICE_ID = "google-tv-01";

export function useTislyApi(pollMs = 15_000) {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [alarmActive, setAlarmActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchDashboard();
      setDashboard(data);
      setError(null);
      if (data.summary.systemStatus === "alarm" || (data.recentAlarms?.length ?? 0) > 0) {
        setAlarmActive(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    void postHeartbeat(TV_DEVICE_ID);
    const t = setInterval(() => {
      void refresh();
      void postHeartbeat(TV_DEVICE_ID);
    }, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  const clearAlarm = useCallback(() => setAlarmActive(false), []);

  return { dashboard, alarmActive, clearAlarm, error, refresh };
}
