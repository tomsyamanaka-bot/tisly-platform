import http from "http";
import { WebSocketServer } from "ws";
import { createApp } from "./app.js";
import { startDemoRunner } from "./demo/demo-runner.js";
import { startDemoModeVirtualEspRunner } from "./demo/demo-mode-esp.js";
import { config } from "./config.js";
import { getDatabase } from "./db/database.js";
import { ensureDemoKit } from "./demo-kit/index.js";
import { startMqttSubscriber } from "./mqtt/mqtt-subscriber.js";
import { getNotificationService } from "./notification/notification-service.js";
import { startRecoveryEngine } from "./recovery/recovery-engine.js";
import { handleWsClientMessage, registerWsClient } from "./ws/hub.js";
import { startLiveOperationsMockPush } from "./toms/live-push-mock.js";
import { startBackupScheduler } from "./backup/backup-scheduler.js";
import { startHealthMonitor } from "./deploy/health-monitor.js";
import { startWorkers } from "./workers/worker-runner.js";
import { startSwitchBotBridgeWorker } from "./workers/switchbot-bridge-worker.js";
import { startDemoResetCron, syncDemoResetFromEnv } from "./demo-kit/demo-reset-cron.js";
import { logProductionEnvWarnings } from "./config/production-env-checker.js";
import { logGmailStartupStatus } from "./notification/smtp-gmail.js";
import { initLockProvider } from "./providers/lock/index.js";
import { ensureLockProviderSeed } from "./lock-provider/lock-provider-store.js";
import { probePdfEngineHealth } from "./business/pdf/pdf-engine-status.js";
import { bootstrapQnapInfraHealthOnStartupV1 } from "./infrastructure/qnap-infra-health-v1.js";

// 再起動中の 502 窓を縮めるため、
// listen を最優先し、重い Worker は後段で起動する。
logProductionEnvWarnings();
logGmailStartupStatus();
initLockProvider();

getDatabase();
ensureLockProviderSeed();
ensureDemoKit();
syncDemoResetFromEnv();

const app = createApp();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket) => {
  registerWsClient(socket);
  socket.on("message", (data) => {
    handleWsClientMessage(socket, String(data));
  });
});

function startBackgroundServices(): void {
  startDemoResetCron();
  startBackupScheduler();
  startHealthMonitor();
  startWorkers();
  startSwitchBotBridgeWorker();

  void probePdfEngineHealth().catch((e) => {
    console.warn(
      "[pdf-engine] startup probe failed:",
      e instanceof Error ? e.message : e
    );
  });

  void bootstrapQnapInfraHealthOnStartupV1().catch((e) => {
    console.warn(
      "[QNAP infra] bootstrap failed:",
      e instanceof Error ? e.message : e
    );
  });

  startRecoveryEngine();
  getNotificationService().start();
  startMqttSubscriber();
  startLiveOperationsMockPush();
}

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  // systemd Restart=always で復帰させる
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  console.log(
    `[TiSLY] ${config.publicUrl} — listening on http://${config.host}:${config.port} (ws: /ws) phase 1201-1240`
  );
  startBackgroundServices();
  if (config.demoMode) {
    startDemoModeVirtualEspRunner();
    if (config.demoAutoStart) {
      void startDemoRunner();
    }
  }
});

export { app, server };
