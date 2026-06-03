import http from "http";
import { WebSocketServer } from "ws";
import { createApp } from "./app.js";
import { startDemoRunner } from "./demo/demo-runner.js";
import { startDemoModeVirtualEspRunner } from "./demo/demo-mode-esp.js";
import { config } from "./config.js";
import { getDatabase } from "./db/database.js";
import { startMqttSubscriber } from "./mqtt/mqtt-subscriber.js";
import { getNotificationService } from "./notification/notification-service.js";
import { startRecoveryEngine } from "./recovery/recovery-engine.js";
import { handleWsClientMessage, registerWsClient } from "./ws/hub.js";
import { startLiveOperationsMockPush } from "./toms/live-push-mock.js";
import { startBackupScheduler } from "./backup/backup-scheduler.js";
import { startWorkers } from "./workers/worker-runner.js";

getDatabase();
startBackupScheduler();
startWorkers();

const app = createApp();

startRecoveryEngine();
const service = getNotificationService();
service.start();
startMqttSubscriber();

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket) => {
  registerWsClient(socket);
  socket.on("message", (data) => {
    handleWsClientMessage(socket, String(data));
  });
});

startLiveOperationsMockPush();

server.listen(config.port, config.host, () => {
  console.log(
    `[TiSLY] ${config.publicUrl} — listening on http://${config.host}:${config.port} (ws: /ws) phase 121-140`
  );
  if (config.demoMode) {
    startDemoModeVirtualEspRunner();
    if (config.demoAutoStart) {
      void startDemoRunner();
    }
  }
});

export { app, server };
