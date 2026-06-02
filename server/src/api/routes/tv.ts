import { Router } from "express";
import { v4 as uuid } from "uuid";
import { config } from "../../config.js";
import { getDatabase } from "../../db/database.js";
import {
  normalizeUnifiedInput,
  unifiedToTislyEvent,
} from "../../event/unified-event.js";
import { getNotificationService } from "../../notification/notification-service.js";
import { broadcast } from "../../ws/hub.js";

export const tvRouter = Router();

const PAIRING_TTL_MS = 10 * 60 * 1000;

interface TvDeviceRow {
  id: string;
  tenant_id: string | null;
  site_id: string | null;
  device_id: string;
  display_name: string | null;
  pairing_code: string | null;
  pairing_expires_at: string | null;
  paired_at: string | null;
  last_seen_at: string | null;
  status: string | null;
  settings_json: string | null;
  created_at: string;
  updated_at: string;
}

function parseSettings(json: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function formatTvDevice(row: TvDeviceRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id ?? config.defaultTenantId,
    siteId: row.site_id,
    deviceId: row.device_id,
    displayName: row.display_name ?? row.device_id,
    pairedAt: row.paired_at,
    lastSeenAt: row.last_seen_at,
    status: row.status ?? "pending",
    settings: parseSettings(row.settings_json),
    hasActivePairingCode: !!(
      row.pairing_code &&
      row.pairing_expires_at &&
      new Date(row.pairing_expires_at).getTime() > Date.now()
    ),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function findTvRow(param: string): TvDeviceRow | undefined {
  const db = getDatabase();
  const byId = db.prepare("SELECT * FROM tv_devices WHERE id = ?").get(param) as
    | TvDeviceRow
    | undefined;
  if (byId) return byId;
  return db.prepare("SELECT * FROM tv_devices WHERE device_id = ?").get(param) as
    | TvDeviceRow
    | undefined;
}

function generatePairingCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

tvRouter.post("/pairing/start", (req, res) => {
  const {
    deviceId,
    tvDeviceId,
    tenantId,
    displayName,
  } = req.body as {
    deviceId?: string;
    tvDeviceId?: string;
    tenantId?: string;
    displayName?: string;
  };

  const logicalId =
    (typeof tvDeviceId === "string" && tvDeviceId) ||
    (typeof deviceId === "string" && deviceId) ||
    `TV-${uuid().slice(0, 8).toUpperCase()}`;

  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
  const tenant = tenantId ?? config.defaultTenantId;
  const db = getDatabase();

  const existing = db
    .prepare("SELECT * FROM tv_devices WHERE device_id = ?")
    .get(logicalId) as TvDeviceRow | undefined;

  if (existing) {
    db.prepare(
      `UPDATE tv_devices SET
         pairing_code = ?,
         pairing_expires_at = ?,
         tenant_id = COALESCE(?, tenant_id),
         display_name = COALESCE(?, display_name),
         status = 'pairing',
         updated_at = datetime('now')
       WHERE device_id = ?`
    ).run(code, expiresAt, tenant, displayName ?? null, logicalId);
    const row = findTvRow(logicalId)!;
    res.json({
      ok: true,
      deviceId: row.device_id,
      pairingCode: code,
      expiresAt,
      expiresInSec: PAIRING_TTL_MS / 1000,
      tv: formatTvDevice(row),
    });
    return;
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO tv_devices (
       id, tenant_id, site_id, device_id, display_name,
       pairing_code, pairing_expires_at, status, settings_json
     ) VALUES (?, ?, NULL, ?, ?, ?, ?, 'pairing', ?)`
  ).run(
    id,
    tenant,
    logicalId,
    displayName ?? logicalId,
    code,
    expiresAt,
    JSON.stringify({ display_mode: "dashboard", camera_mode: "placeholder" })
  );

  const row = findTvRow(id)!;
  res.status(201).json({
    ok: true,
    deviceId: row.device_id,
    pairingCode: code,
    expiresAt,
    expiresInSec: PAIRING_TTL_MS / 1000,
    tv: formatTvDevice(row),
  });
});

tvRouter.post("/pairing/confirm", async (req, res) => {
  const {
    pairingCode,
    code,
    siteId,
    site_id,
    tvDeviceId,
    deviceId,
    displayName,
    tenantId,
  } = req.body as Record<string, string | undefined>;

  const entered = (pairingCode ?? code ?? "").trim();
  const site = (siteId ?? site_id ?? "").trim();

  if (!entered || entered.length !== 6) {
    res.status(400).json({ error: "6桁のペアリングコードが必要です" });
    return;
  }
  if (!site) {
    res.status(400).json({ error: "site_id が必要です" });
    return;
  }

  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT * FROM tv_devices
       WHERE pairing_code = ? AND pairing_expires_at IS NOT NULL
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get(entered) as TvDeviceRow | undefined;

  if (!row) {
    res.status(404).json({ error: "無効なペアリングコードです" });
    return;
  }

  if (row.pairing_expires_at && new Date(row.pairing_expires_at).getTime() < Date.now()) {
    res.status(410).json({ error: "ペアリングコードの有効期限が切れています（10分）" });
    return;
  }

  const finalDeviceId =
    (typeof tvDeviceId === "string" && tvDeviceId) ||
    (typeof deviceId === "string" && deviceId) ||
    row.device_id;

  if (finalDeviceId !== row.device_id) {
    const conflict = db
      .prepare("SELECT id FROM tv_devices WHERE device_id = ? AND id != ?")
      .get(finalDeviceId, row.id);
    if (conflict) {
      res.status(409).json({ error: "tv_device_id は既に使用されています" });
      return;
    }
  }

  const pairedAt = new Date().toISOString();
  const tenant = tenantId ?? row.tenant_id ?? config.defaultTenantId;

  db.prepare(
    `UPDATE tv_devices SET
       device_id = ?,
       site_id = ?,
       tenant_id = ?,
       display_name = COALESCE(?, display_name),
       pairing_code = NULL,
       pairing_expires_at = NULL,
       paired_at = ?,
       status = 'paired',
       last_seen_at = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    finalDeviceId,
    site,
    tenant,
    displayName ?? null,
    pairedAt,
    pairedAt,
    row.id
  );

  const updated = findTvRow(row.id)!;
  broadcast({
    type: "event",
    payload: {
      event: "tv_paired",
      deviceId: updated.device_id,
      siteId: site,
    },
    at: pairedAt,
  });

  res.json({
    ok: true,
    message: "ペアリング完了",
    tv: formatTvDevice(updated),
  });
});

tvRouter.get("/devices", (req, res) => {
  const db = getDatabase();
  const siteId = req.query.siteId as string | undefined;
  const status = req.query.status as string | undefined;

  let sql = "SELECT * FROM tv_devices WHERE 1=1";
  const params: unknown[] = [];
  if (siteId) {
    sql += " AND site_id = ?";
    params.push(siteId);
  }
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  sql += " ORDER BY updated_at DESC";

  const rows = db.prepare(sql).all(...params) as TvDeviceRow[];
  res.json({
    devices: rows.map(formatTvDevice),
    count: rows.length,
  });
});

tvRouter.get("/devices/:id", (req, res) => {
  const row = findTvRow(req.params.id);
  if (!row) {
    res.status(404).json({ error: "TV device not found" });
    return;
  }
  res.json(formatTvDevice(row));
});

tvRouter.patch("/devices/:id", (req, res) => {
  const row = findTvRow(req.params.id);
  if (!row) {
    res.status(404).json({ error: "TV device not found" });
    return;
  }

  const { displayName, siteId, status, settings, lastSeen } = req.body as {
    displayName?: string;
    siteId?: string;
    status?: string;
    settings?: Record<string, unknown>;
    lastSeen?: boolean;
  };

  const mergedSettings = { ...parseSettings(row.settings_json) };
  if (settings && typeof settings === "object") {
    Object.assign(mergedSettings, settings);
  }

  const db = getDatabase();
  db.prepare(
    `UPDATE tv_devices SET
       display_name = COALESCE(?, display_name),
       site_id = COALESCE(?, site_id),
       status = COALESCE(?, status),
       settings_json = ?,
       last_seen_at = CASE WHEN ? = 1 THEN datetime('now') ELSE last_seen_at END,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    displayName,
    siteId,
    status,
    JSON.stringify(mergedSettings),
    lastSeen ? 1 : 0,
    row.id
  );

  res.json(formatTvDevice(findTvRow(row.id)!));
});

tvRouter.delete("/devices/:id", (req, res) => {
  const row = findTvRow(req.params.id);
  if (!row) {
    res.status(404).json({ error: "TV device not found" });
    return;
  }

  const db = getDatabase();
  db.prepare(
    `UPDATE tv_devices SET
       site_id = NULL,
       pairing_code = NULL,
       pairing_expires_at = NULL,
       paired_at = NULL,
       status = 'unpaired',
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(row.id);

  res.json({ ok: true, deviceId: row.device_id, status: "unpaired" });
});

tvRouter.post("/devices/:id/test-alert", async (req, res) => {
  const row = findTvRow(req.params.id);
  if (!row) {
    res.status(404).json({ error: "TV device not found" });
    return;
  }

  const unified = normalizeUnifiedInput(
    {
      event_id: `tv-test-${uuid()}`,
      tenant_id: row.tenant_id ?? config.defaultTenantId,
      site_id: row.site_id ?? "default",
      device_id: row.device_id,
      source_type: "tv-app",
      event_type: req.body?.eventType ?? "tv_test_alert",
      severity: req.body?.severity ?? "alarm",
      zone: req.body?.zone ?? "tv-display",
      message: req.body?.message ?? `TV テスト警報 — ${row.display_name ?? row.device_id}`,
      payload: { test: true, tvDeviceId: row.device_id, ...(req.body?.payload ?? {}) },
      created_at: new Date().toISOString(),
    },
    config.defaultTenantId
  );

  const service = getNotificationService();
  const id = await service.processEvent(unifiedToTislyEvent(unified));
  broadcast({
    type: "alarm",
    payload: { ...unified, id, target: "tv" },
    at: unified.created_at,
  });

  const db = getDatabase();
  db.prepare(
    `UPDATE tv_devices SET last_seen_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).run(row.id);

  res.status(201).json({ ok: true, eventId: id, tvDeviceId: row.device_id });
});

tvRouter.get("/config/:deviceId", (req, res) => {
  const row = findTvRow(req.params.deviceId);
  if (!row) {
    res.status(404).json({ error: "TV device not found" });
    return;
  }
  const settings = parseSettings(row.settings_json);
  res.json({
    deviceId: row.device_id,
    siteId: row.site_id,
    tenantId: row.tenant_id ?? config.defaultTenantId,
    status: row.status,
    paired: row.status === "paired" && !!row.paired_at,
    displayMode: (settings.display_mode as string) ?? "dashboard",
    cameraMode: (settings.camera_mode as string) ?? "placeholder",
    settings,
  });
});
