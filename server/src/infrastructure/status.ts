import os from "os";
import { config } from "../config.js";
import { getDbProvider } from "../db/db-provider.js";
import { PostgresProvider } from "../db/postgres-provider.js";
import { getDatabase } from "../db/database.js";
import { pingRedis } from "../redis/redis-client.js";
import { isQnapSmbConfigured, getQnapMode } from "../qnap/smb-client.js";

export type InfraStatus = "GREEN" | "YELLOW" | "RED";

export interface InfraComponentStatus {
  name: string;
  status: InfraStatus;
  detail: string;
}

function diskStatus(): InfraComponentStatus {
  try {
    const free = os.freemem();
    const total = os.totalmem();
    const pct = (free / total) * 100;
    if (pct < 10) return { name: "disk", status: "RED", detail: `Memory free ${pct.toFixed(0)}%` };
    if (pct < 20) return { name: "disk", status: "YELLOW", detail: `Memory free ${pct.toFixed(0)}%` };
    return { name: "disk", status: "GREEN", detail: `Memory free ${pct.toFixed(0)}%` };
  } catch {
    return { name: "disk", status: "YELLOW", detail: "unknown" };
  }
}

export async function getInfrastructureStatuses(): Promise<InfraComponentStatus[]> {
  const provider = getDbProvider();
  let dbReachable = provider.ping();
  if (provider instanceof PostgresProvider) {
    dbReachable = await provider.pingAsync();
  } else {
    try {
      getDatabase().prepare("SELECT 1").get();
      dbReachable = true;
    } catch {
      dbReachable = false;
    }
  }

  const redisOk = await pingRedis();
  const mqttEnabled = process.env.MQTT_SUBSCRIBER_ENABLED === "true";
  const mqttMock = process.env.MQTT_MOCK_MODE === "true";

  let tvStatus: InfraStatus = "GREEN";
  let tvDetail = "paired devices ok";
  try {
    const db = getDatabase();
    const pairing = (
      db.prepare("SELECT COUNT(*) as c FROM tv_devices WHERE status = 'pairing'").get() as {
        c: number;
      }
    ).c;
    if (pairing > 10) {
      tvStatus = "YELLOW";
      tvDetail = `${pairing} active pairing sessions`;
    }
  } catch {
    tvStatus = "YELLOW";
    tvDetail = "tv_devices unavailable";
  }

  const qnapReal = getQnapMode() === "real" && isQnapSmbConfigured();

  return [
    {
      name: "DB",
      status: dbReachable ? "GREEN" : "RED",
      detail: `${config.dbProvider} ${dbReachable ? "reachable" : "down"}`,
    },
    {
      name: "PostgreSQL",
      status:
        config.dbProvider === "postgres"
          ? dbReachable
            ? "GREEN"
            : "RED"
          : "YELLOW",
      detail:
        config.dbProvider === "postgres"
          ? dbReachable
            ? "active"
            : "unreachable"
          : "sqlite mode (standby)",
    },
    {
      name: "Redis",
      status:
        config.rateLimitProvider === "redis"
          ? redisOk
            ? "GREEN"
            : "RED"
          : "YELLOW",
      detail:
        config.rateLimitProvider === "redis"
          ? redisOk
            ? "connected"
            : "unreachable"
          : "memory provider",
    },
    {
      name: "MQTT",
      status: mqttEnabled ? "GREEN" : mqttMock ? "YELLOW" : "YELLOW",
      detail: mqttEnabled ? "subscriber enabled" : mqttMock ? "mock mode" : "standby",
    },
    {
      name: "Node-RED",
      status: config.ingestSecret ? "GREEN" : "RED",
      detail: config.infrastructure.nodeRedUrl || "/api/events/ingest",
    },
    {
      name: "TV",
      status: tvStatus,
      detail: tvDetail,
    },
    {
      name: "QNAP",
      status: qnapReal ? "GREEN" : "YELLOW",
      detail: qnapReal ? "SMB real" : "mock archive",
    },
    {
      name: "VPS",
      status: "GREEN",
      detail: config.infrastructure.vpsLabel,
    },
    diskStatus(),
    {
      name: "memory",
      status: os.loadavg()[0]! > os.cpus().length * 2 ? "YELLOW" : "GREEN",
      detail: `load ${os.loadavg()[0]?.toFixed(2) ?? "?"}`,
    },
  ];
}
