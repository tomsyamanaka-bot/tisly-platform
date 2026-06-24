import { hashPassword } from "../auth/password.js";
import { getDatabase } from "../db/database.js";
import {
  ensureDemoDevice,
  ensureDemoSite,
  getCustomerByCode,
  upsertCustomer,
} from "../customer/customer-store.js";
import { appendDeviceTimeline } from "../device/device-timeline.js";
import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";
import {
  createSurveyProject,
  saveSurveyPhoto,
  saveSurveyDrawing,
} from "../survey/survey-store.js";

/** 1x1 PNG — デモ写真プレースホルダ */
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export const DEMO_PACK_CODES = [
  "TOMS001",
  "TOMS002",
  "TISLY-DEMO",
  "MINPAKU-DEMO",
  "FACTORY-DEMO",
] as const;

export type DemoPackCode = (typeof DEMO_PACK_CODES)[number];

export interface DemoPackCustomerDef {
  customerId: string;
  customerCode: DemoPackCode;
  customerName: string;
  plan: "Lite" | "Standard" | "PRO" | "PRO_REMOTE";
  companyColor: string;
  siteId: string;
  siteName: string;
  address: string;
}

export const DEMO_PACK_CUSTOMERS: DemoPackCustomerDef[] = [
  {
    customerId: "cust-toms",
    customerCode: "TOMS001",
    customerName: "TOMS設備デモ",
    plan: "PRO_REMOTE",
    companyColor: "#1a7f37",
    siteId: "site-toms-main",
    siteName: "本社ビル",
    address: "茨城県つくば市",
  },
  {
    customerId: "cust-toms2",
    customerCode: "TOMS002",
    customerName: "TOMS設備デモ（第2拠点）",
    plan: "PRO_REMOTE",
    companyColor: "#15803d",
    siteId: "site-toms2-main",
    siteName: "支社ビル",
    address: "茨城県水戸市",
  },
  {
    customerId: "cust-tisly-demo",
    customerCode: "TISLY-DEMO",
    customerName: "TiSLY 統合デモ",
    plan: "PRO_REMOTE",
    companyColor: "#0ea5e9",
    siteId: "site-tisly-demo",
    siteName: "TiSLY ショールーム",
    address: "東京都千代田区",
  },
  {
    customerId: "cust-minpaku",
    customerCode: "MINPAKU-DEMO",
    customerName: "民泊セキュリティデモ",
    plan: "PRO",
    companyColor: "#7c3aed",
    siteId: "site-minpaku-demo",
    siteName: "民泊物件A",
    address: "大阪府大阪市",
  },
  {
    customerId: "cust-factory",
    customerCode: "FACTORY-DEMO",
    customerName: "工場監視デモ",
    plan: "Standard",
    companyColor: "#b45309",
    siteId: "site-factory-demo",
    siteName: "第1工場",
    address: "愛知県名古屋市",
  },
];

function surveyProjectId(code: string): string {
  return `SVY-DEMO-${code}`;
}

export function seedDemoCustomerAccounts(): void {
  const demoPassword = process.env.CUSTOMER_DEMO_PASSWORD ?? "demo-remote-2026";
  const hash = hashPassword(demoPassword);
  const db = getDatabase();

  for (const c of DEMO_PACK_CUSTOMERS) {
    for (const role of [
      "owner",
      "admin",
      "manager",
      "installer",
      "surveyor",
      "maintenance",
      "viewer",
    ] as const) {
      db.prepare(
        `INSERT INTO customer_users (id, customer_id, username, password_hash, role, status)
         VALUES (?, ?, ?, ?, ?, 'active')
         ON CONFLICT(customer_id, username) DO NOTHING`
      ).run(
        `cu-${c.customerCode}-${role}`,
        c.customerId,
        `${c.customerCode.toLowerCase()}.${role}`,
        hash,
        role
      );
    }
  }
}

function seedDevicesForCustomer(c: DemoPackCustomerDef): void {
  const proDevices: Array<{
    id: string;
    deviceId: string;
    deviceType: "ESP32" | "Gateway";
    label: string;
  }> = [
    {
      id: `dev-${c.customerCode}-esp1`,
      deviceId: `${c.customerCode}-ESP-01`,
      deviceType: "ESP32",
      label: "ESP32 センサー",
    },
    {
      id: `dev-${c.customerCode}-esp2`,
      deviceId: `${c.customerCode}-ESP-02`,
      deviceType: "ESP32",
      label: "ESP32 予備",
    },
    {
      id: `dev-${c.customerCode}-gw`,
      deviceId: `${c.customerCode}-GW-01`,
      deviceType: "Gateway",
      label: "MQTT Gateway",
    },
  ];

  for (const d of proDevices) {
    ensureDemoDevice({
      id: d.id,
      customerId: c.customerId,
      siteId: c.siteId,
      deviceId: d.deviceId,
      deviceType: d.deviceType,
      label: d.label,
      online: true,
    });
  }

  const db = getDatabase();
  const now = new Date().toISOString();
  const extra: Array<{ id: string; deviceId: string; deviceType: string; label: string }> = [
    {
      id: `dev-${c.customerCode}-shelly`,
      deviceId: `${c.customerCode}-SHELLY-01`,
      deviceType: "Shelly",
      label: "Shelly Plus 1PM",
    },
    {
      id: `dev-${c.customerCode}-cam`,
      deviceId: `${c.customerCode}-CAM-01`,
      deviceType: "Camera",
      label: "屋外カメラ",
    },
  ];
  for (const d of extra) {
    db.prepare(
      `INSERT INTO devices (id, device_type, platform, device_id, label, customer_id, site_id,
        serial_number, firmware_version, last_seen, last_heartbeat_at, heartbeat_status, device_status, metadata_json)
       VALUES (?, ?, 'demo-kit', ?, ?, ?, ?, ?, '1.0.0', ?, ?, 'ok', 'ONLINE', ?)
       ON CONFLICT(id) DO UPDATE SET customer_id=excluded.customer_id, site_id=excluded.site_id,
         device_status='ONLINE', last_seen=excluded.last_seen, metadata_json=excluded.metadata_json`
    ).run(
      d.id,
      d.deviceType,
      d.deviceId,
      d.label,
      c.customerId,
      c.siteId,
      `SN-${d.deviceId}`,
      now,
      now,
      JSON.stringify({ demo_kit: true, customer_code: c.customerCode, site_id: c.siteId })
    );
  }

  for (const deviceId of [`${c.customerCode}-ESP-01`, `${c.customerCode}-ESP-02`, `${c.customerCode}-GW-01`]) {
    db.prepare(
      `UPDATE devices SET device_status = 'ONLINE', metadata_json = ? WHERE device_id = ?`
    ).run(
      JSON.stringify({ demo_kit: true, customer_code: c.customerCode, site_id: c.siteId }),
      deviceId
    );
  }

  const camId = `cam-${c.customerCode}-01`;
  db.prepare(
    `INSERT OR IGNORE INTO camera_devices (id, customer_id, site_id, device_id, channel, camera_name, camera_group)
     VALUES (?, ?, ?, ?, 1, ?, 'demo')`
  ).run(camId, c.customerId, c.siteId, `${c.customerCode}-CAM-01`, `${c.customerName} カメラ`);
}

function ensureSurveyProjectId(c: DemoPackCustomerDef): string {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT project_id FROM survey_projects WHERE customer_code = ? ORDER BY created_at LIMIT 1`)
    .get(c.customerCode) as { project_id: string } | undefined;
  if (row) return row.project_id;
  const p = createSurveyProject({
    customerCode: c.customerCode,
    siteName: c.siteName,
    address: c.address,
    status: "completed",
  });
  return p.projectId;
}

function seedSurveyAssets(c: DemoPackCustomerDef): void {
  const projectId = ensureSurveyProjectId(c);

  const photoCount = (
    getDatabase()
      .prepare(`SELECT COUNT(*) as c FROM survey_photos WHERE project_id = ?`)
      .get(projectId) as { c: number }
  ).c;
  if (photoCount < 4) {
    for (const t of ["outside", "inside", "panel", "sensor"] as const) {
      try {
        saveSurveyPhoto({
          projectId,
          photoType: t,
          imageBase64: TINY_PNG_B64,
          fileName: `demo-${t}.png`,
          uploadedBy: "demo-kit",
        });
      } catch {
        /* idempotent */
      }
    }
  }

  const drawingCount = (
    getDatabase()
      .prepare(`SELECT COUNT(*) as c FROM survey_drawings WHERE project_id = ?`)
      .get(projectId) as { c: number }
  ).c;
  if (drawingCount < 1) {
    try {
      saveSurveyDrawing({
        projectId,
        imageBase64: TINY_PNG_B64,
        fileName: "floor-plan-demo.png",
        mimeType: "image/png",
        uploadedBy: "demo-kit",
      });
    } catch {
      /* */
    }
  }
}

function seedNotificationHistory(c: DemoPackCustomerDef): void {
  const db = getDatabase();
  const count = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM notification_logs WHERE device_id LIKE ?`
      )
      .get(`${c.customerCode}-%`) as { c: number }
  ).c;
  if (count >= 5) return;

  const samples = [
    { type: "intrusion", title: "侵入検知", body: `${c.siteName} — 外周センサー` },
    { type: "heartbeat_ok", title: "通信復旧", body: `${c.customerCode}-ESP-01` },
    { type: "maintenance_due", title: "保守期限", body: "年次点検 30日以内" },
  ];
  for (const s of samples) {
    db.prepare(
      `INSERT INTO notification_logs (id, device_id, event_type, channel, title, body, payload_json, status, sent_at)
       VALUES (?, ?, ?, 'web_push', ?, ?, ?, 'sent', datetime('now', '-' || abs(random() % 72) || ' hours'))`
    ).run(
      uuid(),
      `${c.customerCode}-ESP-01`,
      s.type,
      s.title,
      s.body,
      JSON.stringify({ demo_kit: true, customerCode: c.customerCode })
    );
  }

  appendDeviceTimeline({
    customerId: c.customerId,
    deviceId: `${c.customerCode}-ESP-01`,
    eventType: "notification",
    title: "デモ通知履歴",
    detail: "Demo Kit 初期シード",
    actor: "demo-kit",
  });
}

/** Idempotent — 5デモ顧客＋現場・機器・現調・通知履歴 */
export function ensureDemoCustomerPack(): { customers: number; seeded: string[] } {
  const seeded: string[] = [];

  for (const c of DEMO_PACK_CUSTOMERS) {
    upsertCustomer({
      customerId: c.customerId,
      customerCode: c.customerCode,
      customerName: c.customerName,
      plan: c.plan,
      tenantId: c.customerId,
      branding: {
        companyColor: c.companyColor,
        companyName: c.customerName,
        logoUrl: `/assets/customers/${c.customerCode.toLowerCase()}-logo.svg`,
      },
    });
    ensureDemoSite(c.customerId, c.siteId, c.siteName, c.address);
    seedDevicesForCustomer(c);
    seedSurveyAssets(c);
    seedNotificationHistory(c);
    seeded.push(c.customerCode);
  }

  seedDemoCustomerAccounts();
  return { customers: DEMO_PACK_CUSTOMERS.length, seeded };
}

export function getDemoPackStatus(): Array<{
  code: string;
  name: string;
  siteCount: number;
  deviceCount: number;
  photoCount: number;
  notificationCount: number;
}> {
  const db = getDatabase();
  return DEMO_PACK_CUSTOMERS.map((c) => {
    const customer = getCustomerByCode(c.customerCode);
    if (!customer) {
      return {
        code: c.customerCode,
        name: c.customerName,
        siteCount: 0,
        deviceCount: 0,
        photoCount: 0,
        notificationCount: 0,
      };
    }
    const siteCount = (
      db.prepare(`SELECT COUNT(*) as c FROM sites WHERE customer_id = ?`).get(customer.customer_id) as {
        c: number;
      }
    ).c;
    const deviceCount = (
      db.prepare(`SELECT COUNT(*) as c FROM devices WHERE customer_id = ?`).get(customer.customer_id) as {
        c: number;
      }
    ).c;
    const svy = db
      .prepare(`SELECT project_id FROM survey_projects WHERE customer_code = ? LIMIT 1`)
      .get(c.customerCode) as { project_id: string } | undefined;
    const photoCount = svy
      ? (db.prepare(`SELECT COUNT(*) as c FROM survey_photos WHERE project_id = ?`).get(svy.project_id) as {
          c: number;
        }).c
      : 0;
    const notificationCount = (
      db
        .prepare(`SELECT COUNT(*) as c FROM notification_logs WHERE device_id LIKE ?`)
        .get(`${c.customerCode}-%`) as { c: number }
    ).c;
    return {
      code: c.customerCode,
      name: c.customerName,
      siteCount,
      deviceCount,
      photoCount,
      notificationCount,
    };
  });
}

export function clearDemoPackSurveyUploads(): void {
  for (const c of DEMO_PACK_CUSTOMERS) {
    const dir = path.join(process.cwd(), "uploads", "survey", surveyProjectId(c.customerCode));
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
}
