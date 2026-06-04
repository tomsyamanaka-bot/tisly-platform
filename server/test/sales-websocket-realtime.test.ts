import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import { handleWsClientMessage, registerWsClient } from "../src/ws/hub.js";

process.env.NODE_ENV = "test";
process.env.SHELLY_MODE = "mock";
process.env.TISLY_DB_PATH = "./data/test-sales-ws-realtime.db";

const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { broadcastSalesDemoEvent } = await import("../src/demo-kit/sales-ws-bridge.js");

const app = createApp();
let server: http.Server;
let port: number;

describe("Sales WebSocket realtime RC", () => {
  before(async () => {
    await new Promise<void>((resolve) => {
      server = http.createServer(app);
      const wss = new WebSocketServer({ server, path: "/ws" });
      wss.on("connection", (socket) => {
        registerWsClient(socket);
        socket.on("message", (data) => handleWsClientMessage(socket, String(data)));
      });
      server.listen(0, () => {
        const addr = server.address();
        port = typeof addr === "object" && addr ? addr.port : 3101;
        resolve();
      });
    });
  });

  after(() => {
    server?.close();
    closeDatabase();
  });

  it("status includes liveBadge and shellyEnvBadge", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/demo-kit/status");
    assert.equal(res.status, 200);
    assert.ok(res.body.liveBadge);
    assert.ok(res.body.shellyEnvBadge);
    assert.equal(res.body.phase, "981-1000");
  });

  it("broadcast includes shellyEnvBadge", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const msg = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), 5000);
      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "subscribe", channel: "sales" }));
        setTimeout(() => broadcastSalesDemoEvent("intrusion", { customerCode: "TOMS001" }), 200);
      });
      ws.on("message", (raw) => {
        const m = JSON.parse(String(raw)) as Record<string, unknown>;
        const p = m.payload as Record<string, unknown> | undefined;
        if (p?.kind === "intrusion" && p.shellyEnvBadge) {
          clearTimeout(t);
          resolve(m);
        }
      });
    });
    assert.equal((msg.payload as Record<string, unknown>).shellyEnvBadge, "mock");
    ws.close();
  });
});
