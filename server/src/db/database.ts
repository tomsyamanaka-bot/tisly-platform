import Database from "better-sqlite3";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "../config.js";
import { seedProRemoteCustomers } from "../customer/seed-customers.js";
import { ensureTenant } from "../provisioning/site-provisioner.js";
import { runMigrations } from "./migrate.js";
import { seedBusinessDefaults } from "../business/business-store.js";
import { seedPricingRulesFromTiers } from "../business/business-pricing.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

/** Close SQLite handle (for isolated tests). */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function getDbPath(): string {
  const p = config.dbPath;
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

export function getDatabase(): Database.Database {
  if (db) return db;
  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  db.exec(schema);
  const phase81 = path.join(__dirname, "schema-phase81.sql");
  if (fs.existsSync(phase81)) {
    db.exec(fs.readFileSync(phase81, "utf-8"));
  }
  const phaseRc1 = path.join(__dirname, "schema-phase-rc1.sql");
  if (fs.existsSync(phaseRc1)) {
    db.exec(fs.readFileSync(phaseRc1, "utf-8"));
  }
  const phaseSecurity = path.join(__dirname, "schema-phase-security.sql");
  if (fs.existsSync(phaseSecurity)) {
    db.exec(fs.readFileSync(phaseSecurity, "utf-8"));
  }
  const phaseProduction = path.join(__dirname, "schema-phase-production.sql");
  if (fs.existsSync(phaseProduction)) {
    db.exec(fs.readFileSync(phaseProduction, "utf-8"));
  }
  const phase221 = path.join(__dirname, "schema-phase-221.sql");
  if (fs.existsSync(phase221)) {
    db.exec(fs.readFileSync(phase221, "utf-8"));
  }
  const phase321 = path.join(__dirname, "schema-phase-321.sql");
  if (fs.existsSync(phase321)) {
    db.exec(fs.readFileSync(phase321, "utf-8"));
  }
  const phase2300 = path.join(__dirname, "schema-phase-2300.sql");
  if (fs.existsSync(phase2300)) {
    db.exec(fs.readFileSync(phase2300, "utf-8"));
  }
  const phase2350 = path.join(__dirname, "schema-phase-2350.sql");
  if (fs.existsSync(phase2350)) {
    db.exec(fs.readFileSync(phase2350, "utf-8"));
  }
  runMigrations(db);
  seedDefaults(db);
  seedBusinessDefaults();
  seedPricingRulesFromTiers();
  seedProRemoteCustomers();
  ensureTenant(config.defaultTenantId, "Default Tenant");
  return db;
}

function seedDefaults(database: Database.Database): void {
  const admin = database
    .prepare("SELECT id FROM users WHERE id = ?")
    .get("admin-default");
  if (!admin) {
    database
      .prepare(
        `INSERT INTO users (id, email, display_name, role) VALUES (?, ?, ?, ?)`
      )
      .run("admin-default", "admin@tisly.jp", "TiSLY Admin", "admin");
  }

  const settings = [
    {
      key: "pwa",
      value: { enabled: true, name: "TiSLY Home Security", themeColor: "#1a7f37" },
    },
    {
      key: "push",
      value: {
        enabled: false,
        vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
        vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ? "[set]" : "",
      },
    },
    {
      key: "discord",
      value: {
        enabled: false,
        webhookUrl: "",
        eventTypes: ["alarm", "heartbeat_alarm", "heartbeat_warning"],
      },
    },
    {
      key: "email",
      value: {
        enabled: false,
        smtpHost: process.env.SMTP_HOST ?? "smtp.gmail.com",
        smtpPort: Number(process.env.SMTP_PORT ?? 587),
        smtpUser: process.env.SMTP_USER ?? "",
        fromAddress: process.env.SMTP_FROM ?? "noreply@tisly.jp",
        adminEmail: process.env.ADMIN_EMAIL ?? "",
      },
    },
    {
      key: "tv",
      value: { enabled: true, kioskMode: true, alarmFullscreenSec: 10 },
    },
    {
      key: "heartbeat",
      value: { warnSec: 30, alarmSec: 300 },
    },
    {
      key: "retention",
      value: { days: 90, options: [30, 90, 365] },
    },
    {
      key: "backup",
      value: { schedules: ["daily", "weekly", "monthly"], enabled: true },
    },
    {
      key: "qnap",
      value: { mode: process.env.QNAP_MODE ?? "mock" },
    },
  ];

  const upsert = database.prepare(
    `INSERT INTO platform_settings (key, value_json) VALUES (?, ?)
     ON CONFLICT(key) DO NOTHING`
  );
  for (const s of settings) {
    upsert.run(s.key, JSON.stringify(s.value));
  }
}

export function getPlatformSetting<T>(key: string): T | null {
  const row = getDatabase()
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get(key) as { value_json: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.value_json) as T;
}

export function setPlatformSetting(key: string, value: unknown): void {
  getDatabase()
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
    )
    .run(key, JSON.stringify(value));
}
