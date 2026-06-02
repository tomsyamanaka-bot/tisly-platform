import { seedDemoDevices, emitDemoEvent, buildVirtualDevices } from "./demo-generator.js";

const DEMO_INTERVAL_MS = 30_000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
let tickCount = 0;

export function isDemoRunnerActive(): boolean {
  return running;
}

export function getDemoRunnerStats() {
  return {
    active: running,
    intervalSec: DEMO_INTERVAL_MS / 1000,
    tickCount,
    deviceCount: buildVirtualDevices().length,
  };
}

export async function startDemoRunner(): Promise<void> {
  if (running) return;
  seedDemoDevices();
  running = true;
  tickCount = 0;
  await emitDemoEvent();
  tickCount++;
  timer = setInterval(() => {
    void emitDemoEvent().then(() => {
      tickCount++;
    });
  }, DEMO_INTERVAL_MS);
  console.log("[TiSLY Demo] リアルタイムイベント生成を開始（30秒間隔）");
}

export function stopDemoRunner(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  running = false;
  console.log("[TiSLY Demo] イベント生成を停止");
}
