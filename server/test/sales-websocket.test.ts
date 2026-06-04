import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import { handleWsClientMessage, registerWsClient } from "../src/ws/hub.js";

process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-sales-ws.db";
process.env.JWT_SECRET = "test-jwt-sales-ws";

const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { broadcastSalesDemoEvent } = await import("../src/demo-kit/sales-ws-bridge.js");

const app = createApp();
let server: http.Server;
let port: number;

describe("Sales WebSocket bridge", () => {
  before(async () => {
    closeDatabase();
    getDatabase();
    await new Promise<void>((resolve) => {
      server = http.createServer(app);
      const wss = new WebSocketServer({ server, path: "/ws" });
      wss.on("connection", (socket) => {
        registerWsClient(socket);
        socket.on("message", (data) => handleWsClientMessage(socket, String(data)));
      });
      server.listen(0, () => {
        const addr = server.address();
        port = typeof addr === "object" && addr ? addr.port : 3099;
        resolve();
      });
    });
  });

  after(() => {
    server?.close();
    closeDatabase();
  });

  it("receives sales demo event after subscribe", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const msg = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), 5000);
      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "subscribe", channel: "sales" }));
        setTimeout(() => {
          broadcastSalesDemoEvent("notification", {
            customerCode: "TOMS001",
            title: "test",
            message: "hello",
          });
        }, 200);
      });
      ws.on("message", (raw) => {
        try {
          const m = JSON.parse(String(raw)) as Record<string, unknown>;
          const payload = m.payload as Record<string, unknown> | undefined;
          if (payload?.channel === "sales" && payload?.kind === "notification") {
            clearTimeout(t);
            resolve(m);
          }
        } catch {
          /* */
        }
      });
      ws.on("error", reject);
    });
    assert.equal((msg.payload as Record<string, unknown>).kind, "notification");
    ws.close();
  });
});
