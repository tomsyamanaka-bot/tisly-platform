import { runNotificationWorkerTick } from "./notification-worker.js";
import { recordWorkerTick, setWorkerRunning } from "./worker-status.js";

const DEFAULT_INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? "15000");
let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startWorkers(): void {
  if (intervalHandle) return;
  if (process.env.WORKERS_ENABLED === "false") {
    console.log("[TiSLY] Workers disabled (WORKERS_ENABLED=false)");
    return;
  }
  setWorkerRunning(true);
  const tick = async () => {
    try {
      const result = await runNotificationWorkerTick();
      recordWorkerTick(result as unknown as Record<string, unknown>);
    } catch (e) {
      recordWorkerTick({ error: e instanceof Error ? e.message : String(e) });
    }
  };
  void tick();
  intervalHandle = setInterval(() => void tick(), DEFAULT_INTERVAL_MS);
  console.log(`[TiSLY] Workers started (interval ${DEFAULT_INTERVAL_MS}ms)`);
}

export function stopWorkers(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  setWorkerRunning(false);
}
