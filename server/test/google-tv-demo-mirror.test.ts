import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import { handleWsClientMessage, registerWsClient } from "../src/ws/hub.js";

process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-tv-mirror.db";

const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { broadcastSalesDemoEvent } = await import("../src/demo-kit/sales-ws-bridge.js");

const app = createApp();
let server: http.Server;
let port: number;

describe("Google TV demo mirror WS", () => {
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
        port = typeof addr === "object" && addr ? addr.port : 3098;
        resolve();
      });
    });
  });

  after(() => {
    server?.close();
    closeDatabase();
  });

  it("tv channel receives intrusion mirror", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const msg = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), 5000);
      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "subscribe", channel: "tv", customerCode: "TOMS001" }));
        setTimeout(() => {
          broadcastSalesDemoEvent("intrusion", {
            customerCode: "TOMS001",
            title: "侵入",
            severity: "alarm",
            message: "perimeter",
          });
        }, 200);
      });
      ws.on("message", (raw) => {
        try {
          const m = JSON.parse(String(raw)) as Record<string, unknown>;
          if (m.topic === "sales/demo/tv/TOMS001") {
            clearTimeout(t);
            resolve(m);
          }
        } catch {
          /* */
        }
      });
    });
    assert.equal((msg.payload as Record<string, unknown>).channel, "tv_mirror");
    ws.close();
  });

  it("GET /tv/TOMS001 serves html", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/tv/TOMS001");
    assert.equal(res.status, 200);
    assert.match(res.text, /tv-dashboard/i);
  });
});
