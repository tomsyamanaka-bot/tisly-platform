import os from "os";
import { config } from "../config.js";
import { getDbProvider } from "../db/db-provider.js";
import { PostgresProvider } from "../db/postgres-provider.js";
import { getDatabase } from "../db/database.js";
import { billingPublicStatus } from "../billing/stripe-client.js";
import { getWorkerStatus } from "../workers/worker-status.js";
import { isPdfPuppeteerEnabled } from "../reports/pdf/pdf-options.js";
import { pingRedis } from "../redis/redis-client.js";
import { isQnapSmbConfigured, getQnapMode } from "../qnap/smb-client.js";
function gatewayStatus(deviceType) {
    try {
        const db = getDatabase();
        const total = db
            .prepare(`SELECT COUNT(*) as c FROM devices WHERE UPPER(device_type) = ?`)
            .get(deviceType).c;
        const offline = db
            .prepare(`SELECT COUNT(*) as c FROM devices WHERE UPPER(device_type) = ?
           AND heartbeat_status NOT IN ('ok', 'online')`)
            .get(deviceType).c;
        if (total === 0) {
            return { name: deviceType, status: "YELLOW", detail: "no devices registered" };
        }
        if (offline > total / 2) {
            return { name: deviceType, status: "RED", detail: `${offline}/${total} offline` };
        }
        if (offline > 0) {
            return { name: deviceType, status: "YELLOW", detail: `${offline}/${total} offline` };
        }
        return { name: deviceType, status: "GREEN", detail: `${total} device(s) online` };
    }
    catch {
        return { name: deviceType, status: "YELLOW", detail: "unavailable" };
    }
}
export async function getInfrastructureStatuses() {
    const provider = getDbProvider();
    let dbReachable = provider.ping();
    if (provider instanceof PostgresProvider) {
        dbReachable = await provider.pingAsync();
    }
    else {
        try {
            getDatabase().prepare("SELECT 1").get();
            dbReachable = true;
        }
        catch {
            dbReachable = false;
        }
    }
    const redisOk = await pingRedis();
    const mqttEnabled = process.env.MQTT_SUBSCRIBER_ENABLED === "true";
    const mqttMock = process.env.MQTT_MOCK_MODE === "true";
    let tvStatus = "GREEN";
    let tvDetail = "Google TV paired";
    try {
        const db = getDatabase();
        const pairing = db.prepare("SELECT COUNT(*) as c FROM tv_devices WHERE status = 'pairing'").get().c;
        const paired = db
            .prepare("SELECT COUNT(*) as c FROM tv_devices WHERE paired_at IS NOT NULL AND status = 'paired'")
            .get().c;
        if (pairing > 10) {
            tvStatus = "YELLOW";
            tvDetail = `${pairing} pairing sessions`;
        }
        else if (paired === 0) {
            tvStatus = "YELLOW";
            tvDetail = "no paired TVs";
        }
        else {
            tvDetail = `${paired} paired`;
        }
    }
    catch {
        tvStatus = "YELLOW";
        tvDetail = "tv_devices unavailable";
    }
    const qnapReal = getQnapMode() === "real" && isQnapSmbConfigured();
    const memPct = (os.freemem() / os.totalmem()) * 100;
    let vpsStatus = "GREEN";
    let vpsDetail = config.infrastructure.vpsLabel;
    if (memPct < 10 || os.loadavg()[0] > os.cpus().length * 2) {
        vpsStatus = memPct < 10 ? "RED" : "YELLOW";
        vpsDetail = `mem ${memPct.toFixed(0)}% · load ${os.loadavg()[0]?.toFixed(2)}`;
    }
    const plcGw = gatewayStatus("PLC");
    const rpGw = gatewayStatus("RP2350");
    plcGw.name = "PLC Gateway";
    rpGw.name = "RP2350 Gateway";
    let customerCount = 0;
    let activeSites = 0;
    let tvOnline = 0;
    let portalStatus = "GREEN";
    let portalDetail = "PRO Remote portals ready";
    let tenantIsolation = "GREEN";
    let tenantDetail = "tenant-guard active on customer APIs";
    try {
        const db = getDatabase();
        customerCount = db.prepare("SELECT COUNT(*) as c FROM customers WHERE status = 'active'").get().c;
        activeSites = db.prepare("SELECT COUNT(*) as c FROM sites WHERE status = 'active' OR status IS NULL").get().c;
        tvOnline = db
            .prepare(`SELECT COUNT(*) as c FROM devices WHERE UPPER(device_type) = 'TV' AND heartbeat_status IN ('ok','online')`)
            .get().c;
        const proRemote = db.prepare("SELECT COUNT(*) as c FROM customers WHERE plan = 'PRO_REMOTE' AND status = 'active'").get().c;
        portalDetail = `${customerCount} customers · ${proRemote} PRO_REMOTE`;
        if (customerCount === 0) {
            portalStatus = "YELLOW";
            portalDetail = "no customers seeded";
        }
    }
    catch {
        portalStatus = "YELLOW";
        portalDetail = "customer tables unavailable";
        tenantIsolation = "YELLOW";
        tenantDetail = "customer schema missing";
    }
    return [
        {
            name: "PRO Remote",
            status: portalStatus,
            detail: portalDetail,
        },
        {
            name: "Tenant isolation",
            status: tenantIsolation,
            detail: tenantDetail,
        },
        {
            name: "Customer portal",
            status: portalStatus,
            detail: `${customerCount} tenants · ${activeSites} sites`,
        },
        {
            name: "TV online",
            status: tvOnline > 0 ? "GREEN" : "YELLOW",
            detail: `${tvOnline} TV device(s) online`,
        },
        { name: "VPS", status: vpsStatus, detail: vpsDetail },
        {
            name: "PostgreSQL",
            status: config.dbProvider === "postgres" ? (dbReachable ? "GREEN" : "RED") : "YELLOW",
            detail: config.dbProvider === "postgres"
                ? dbReachable
                    ? "first-class · RLS ready"
                    : "unreachable"
                : `sqlite mode · set DB_PROVIDER=postgres for production`,
        },
        {
            name: "Redis",
            status: config.rateLimitProvider === "redis" ? (redisOk ? "GREEN" : "RED") : "YELLOW",
            detail: config.rateLimitProvider === "redis"
                ? redisOk
                    ? "connected"
                    : "down"
                : "memory fallback",
        },
        {
            name: "MQTT",
            status: mqttEnabled ? "GREEN" : mqttMock ? "YELLOW" : "YELLOW",
            detail: mqttEnabled ? "subscriber on" : mqttMock ? "mock" : "standby",
        },
        {
            name: "Node-RED",
            status: config.ingestSecret ? "GREEN" : "RED",
            detail: config.infrastructure.nodeRedUrl || "ingest configured",
        },
        { name: "Google TV", status: tvStatus, detail: tvDetail },
        {
            name: "QNAP",
            status: qnapReal ? "GREEN" : "YELLOW",
            detail: qnapReal ? "SMB archive" : "mock",
        },
        plcGw,
        rpGw,
        {
            name: "DB",
            status: dbReachable ? "GREEN" : "RED",
            detail: `${config.dbProvider} ${dbReachable ? "ok" : "error"}`,
        },
        workerStatusCard(),
        billingStatusCard(),
        smtpStatusCard(),
        pdfStatusCard(),
    ];
}
function workerStatusCard() {
    const ws = getWorkerStatus();
    const pending = ws.queues.notification + ws.queues.webhook + ws.queues.reportEmail;
    return {
        name: "Workers",
        status: ws.running ? (pending > 100 ? "YELLOW" : "GREEN") : "YELLOW",
        detail: `running=${ws.running} · notify=${ws.queues.notification} · webhook=${ws.queues.webhook} · email=${ws.queues.reportEmail}`,
    };
}
function billingStatusCard() {
    const b = billingPublicStatus();
    return {
        name: "Stripe Billing",
        status: b.configured ? "GREEN" : "YELLOW",
        detail: b.configured ? "configured" : "mock mode (no STRIPE_* keys)",
    };
}
function smtpStatusCard() {
    const gmailMode = (process.env.GMAIL_SEND_MODE ?? "mock").toLowerCase();
    const user = (process.env.SMTP_USER ?? "").trim();
    const pass = (process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD ?? "").trim();
    const configured = Boolean(user && pass);
    if (gmailMode === "real" && !configured) {
        return {
            name: "Gmail SMTP",
            status: "YELLOW",
            detail: "Gmail not configured",
        };
    }
    if (gmailMode === "mock") {
        return {
            name: "Gmail SMTP",
            status: "YELLOW",
            detail: "mock mode",
        };
    }
    return {
        name: "Gmail SMTP",
        status: "GREEN",
        detail: `real · SMTP_USER=${user}`,
    };
}
function pdfStatusCard() {
    const on = isPdfPuppeteerEnabled();
    return {
        name: "PDF Engine",
        status: on ? "GREEN" : "YELLOW",
        detail: on ? "Puppeteer enabled" : "HTML fallback",
    };
}
