import { listBusinessProjects } from "../business/business-store.js";
import { listProjectLiveDevices } from "./realtime-devices.js";
import { listProjectNotifications } from "./project-notifications.js";
import {
  broadcastHeartbeat,
  pushFloorAlertLive,
  pushProjectDevicesLive,
  pushProjectNotificationsLive,
} from "./live-push-bridge.js";
import { buildProjectFloorStack } from "./floor-stack-project.js";
import { isLiveOpsMockPushEnabled } from "./mqtt-live-push-bridge.js";
import { setLiveOpsMockPushRunning } from "./live-push-mock-control.js";

let timer: ReturnType<typeof setInterval> | null = null;

export function startLiveOperationsMockPush(intervalMs = 12000): void {
  if (!isLiveOpsMockPushEnabled()) {
    console.log("[LiveOps] mock push disabled (LIVE_OPS_MOCK_PUSH=false or MQTT real)");
    return;
  }
  if (timer) return;
  setLiveOpsMockPushRunning(true);
  timer = setInterval(() => {
    broadcastHeartbeat();
    const projects = listBusinessProjects().slice(0, 5);
    for (const p of projects) {
      const devices = listProjectLiveDevices(p.id);
      const offline = devices.filter((d) => d.status === "OFFLINE");
      const stack = buildProjectFloorStack(p.id);
      const tier = stack?.firstAnomalyTier ?? offline[0]?.floor ?? "perimeter";
      if (offline.length > 0) {
        pushProjectDevicesLive(p.id, devices, {
          scrollTier: tier,
          severity: "critical",
        });
        pushFloorAlertLive(p.id, tier, "critical");
      } else {
        pushProjectDevicesLive(p.id, devices);
      }
      const notifs = listProjectNotifications(p.id).filter((n) => !n.acknowledged);
      if (notifs.length) {
        pushProjectNotificationsLive(p.id, notifs.slice(0, 5));
      }
    }
  }, intervalMs);
}

export function stopLiveOperationsMockPush(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  setLiveOpsMockPushRunning(false);
}
