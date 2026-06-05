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
import { requireAdminAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { auditContextFromRequest, logAudit } from "../../provisioning/audit-log.js";
import { createRateLimit } from "../../security/rate-limit-redis.js";
import { cacheSet, cacheGet } from "../../redis/cache.js";
import { createHash } from "crypto";
import {
  getTvFocusState,
  setTvFocusState,
  clearTvFocusState,
} from "../../tv/tv-focus-state.js";

export const tvRouter = Router();

const PAIRING_TTL_MS = 10 * 60 * 1000;
const MAX_PAIRING_ATTEMPTS = 5;
const PAIRING_LOCK_MS = 15 * 60 * 1000;

const pairingStartLimiter = createRateLimit({
  keyPrefix: "tv-pairing-start",
  max: 20,
  windowMs: 15 * 60 * 1000,
  keyFn: (req) => (req.body as { deviceId?: string })?.deviceId ?? "",
});

const pairingConfirmLimiter = createRateLimit({
  keyPrefix: "tv-pairing-confirm",
  max: 30,
  windowMs: 15 * 60 * 1000,
});

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
  revoked_at: string | null;
  certificate_fingerprint: string | null;
  device_certificate_placeholder: string | null;
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
    revokedAt: row.revoked_at,
    settings: parseSettings(row.settings_json),
    hasActivePairingCode: !!(
      row.pairing_code &&
      row.pairing_expires_at &&
      new Date(row.pairing_expires_at).getTime() > Date.now()
    ),
    certificateFingerprint: row.certificate_fingerprint ?? undefined,
    deviceCertificatePlaceholder: row.device_certificate_placeholder ?? undefined,
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

function normalizeCertFingerprint(input?: string): string | null {
  if (!input?.trim()) return null;
  const trimmed = input.trim().replace(/[^a-fA-F0-9:]/g, "");
  if (trimmed.length < 8) return null;
  return createHash("sha256").update(trimmed).digest("hex");
}

function expireStalePairingCodes(): void {
  getDatabase().prepare(
    `UPDATE tv_devices SET
       pairing_code = NULL,
       pairing_expires_at = NULL,
       status = CASE WHEN paired_at IS NULL THEN 'expired' ELSE status END,
       updated_at = datetime('now')
     WHERE pairing_expires_at IS NOT NULL AND pairing_expires_at < datetime('now')`
  ).run();
}

function getPairingLock(deviceId: string, ip: string): { locked: boolean; attempts: number } {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT attempt_count, locked_until FROM tv_pairing_attempts
       WHERE device_id = ? AND ip_address = ?`
    )
    .get(deviceId, ip) as { attempt_count: number; locked_until: string | null } | undefined;
  if (!row) return { locked: false, attempts: 0 };
  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    return { locked: true, attempts: row.attempt_count };
  }
  return { locked: false, attempts: row.attempt_count };
}

function recordPairingFailure(deviceId: string, ip: string): number {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT attempt_count FROM tv_pairing_attempts WHERE device_id = ? AND ip_address = ?`
    )
    .get(deviceId, ip) as { attempt_count: number } | undefined;
  const next = (row?.attempt_count ?? 0) + 1;
  const lockedUntil =
    next >= MAX_PAIRING_ATTEMPTS
      ? new Date(Date.now() + PAIRING_LOCK_MS).toISOString()
      : null;
  db.prepare(
    `INSERT INTO tv_pairing_attempts (device_id, ip_address, attempt_count, locked_until, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(device_id, ip_address) DO UPDATE SET
       attempt_count = excluded.attempt_count,
       locked_until = excluded.locked_until,
       updated_at = datetime('now')`
  ).run(deviceId, ip, next, lockedUntil);
  return next;
}

function clearPairingAttempts(deviceId: string, ip: string): void {
  getDatabase()
    .prepare("DELETE FROM tv_pairing_attempts WHERE device_id = ? AND ip_address = ?")
    .run(deviceId, ip);
}

tvRouter.post("/pairing/start", pairingStartLimiter, (req, res) => {
  expireStalePairingCodes();
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

  const ip = (typeof req.ip === "string" ? req.ip : req.ip?.[0]) ?? "unknown";
  const lock = getPairingLock(logicalId, ip);
  if (lock.locked) {
    res.status(429).json({ error: "ペアリング試行回数上限 — しばらく待って再試行してください" });
    return;
  }

  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
  void cacheSet(`tv:pairing:${code}`, logicalId, PAIRING_TTL_MS / 1000);
  const tenant = tenantId ?? config.defaultTenantId;
  const db = getDatabase();

  const existing = db
    .prepare("SELECT * FROM tv_devices WHERE device_id = ?")
    .get(logicalId) as TvDeviceRow | undefined;

  if (existing?.status === "revoked") {
    res.status(403).json({ error: "この TV は無効化されています" });
    return;
  }

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
    logAudit({
      action: "tv.pairing_start",
      targetType: "tv_device",
      targetId: logicalId,
      ...auditContextFromRequest(req),
    });
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
  logAudit({
    action: "tv.pairing_start",
    targetType: "tv_device",
    targetId: logicalId,
    ...auditContextFromRequest(req),
  });
  res.status(201).json({
    ok: true,
    deviceId: row.device_id,
    pairingCode: code,
    expiresAt,
    expiresInSec: PAIRING_TTL_MS / 1000,
    tv: formatTvDevice(row),
  });
});

tvRouter.post("/pairing/confirm", pairingConfirmLimiter, async (req, res) => {
  expireStalePairingCodes();
  const {
    pairingCode,
    code,
    siteId,
    site_id,
    tvDeviceId,
    deviceId,
    displayName,
    tenantId,
    certificateFingerprint,
    deviceCertificate,
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
    const attempts = recordPairingFailure(
      tvDeviceId ?? deviceId ?? "unknown",
      (typeof req.ip === "string" ? req.ip : req.ip?.[0]) ?? "unknown"
    );
    res.status(404).json({
      error: "無効なペアリングコードです",
      attemptsRemaining: Math.max(0, MAX_PAIRING_ATTEMPTS - attempts),
    });
    return;
  }

  if (row.status === "revoked") {
    res.status(403).json({ error: "この TV は無効化されています" });
    return;
  }

  if (row.pairing_expires_at && new Date(row.pairing_expires_at).getTime() < Date.now()) {
    db.prepare(
      `UPDATE tv_devices SET pairing_code = NULL, pairing_expires_at = NULL, status = 'expired'
       WHERE id = ?`
    ).run(row.id);
    res.status(410).json({ error: "ペアリングコードの有効期限が切れています（10分）" });
    return;
  }

  const ip = (typeof req.ip === "string" ? req.ip : req.ip?.[0]) ?? "unknown";
  const lock = getPairingLock(row.device_id, ip);
  if (lock.locked) {
    res.status(429).json({ error: "試行回数上限 — しばらく待って再試行してください" });
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

  const cachedDevice = await cacheGet(`tv:pairing:${entered}`);
  if (cachedDevice && cachedDevice !== row.device_id) {
    res.status(409).json({ error: "ペアリングコードの整合性エラー" });
    return;
  }

  const pairedAt = new Date().toISOString();
  const tenant = tenantId ?? row.tenant_id ?? config.defaultTenantId;
  const certFp = normalizeCertFingerprint(certificateFingerprint);
  const certPlaceholder =
    deviceCertificate?.trim() ||
    (config.tv.certPinningEnabled ? "pending-device-cert" : null);

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
       certificate_fingerprint = COALESCE(?, certificate_fingerprint),
       device_certificate_placeholder = COALESCE(?, device_certificate_placeholder),
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    finalDeviceId,
    site,
    tenant,
    displayName ?? null,
    pairedAt,
    pairedAt,
    certFp,
    certPlaceholder,
    row.id
  );

  clearPairingAttempts(row.device_id, ip);

  const updated = findTvRow(row.id)!;
  logAudit({
    action: "tv.pairing_confirm",
    targetType: "tv_device",
    targetId: finalDeviceId,
    siteId: site,
    tenantId: tenant,
    afterJson: { siteId: site, pairedAt },
    ...auditContextFromRequest(req),
  });

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

tvRouter.get("/config/:deviceId", (req, res) => {
  const row = findTvRow(req.params.deviceId);
  if (!row) {
    res.status(404).json({ error: "TV device not found" });
    return;
  }
  if (row.status === "revoked") {
    res.status(403).json({ error: "TV revoked" });
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

/** Phase 1161–1200 — Google TV camera focus RC2 (no admin auth — field/MQTT trigger) */
tvRouter.post("/focus-camera", (req, res) => {
  const body = req.body as {
    customerCode?: string;
    siteId?: string;
    cameraId?: string;
    deviceId?: string;
    floor?: "perimeter" | "1f" | "2f" | string;
    trigger?: string;
    durationSec?: number;
  };
  const cameraId = body.cameraId ?? body.deviceId;
  if (!cameraId) {
    res.status(400).json({ error: "cameraId or deviceId required" });
    return;
  }
  const floor = body.floor ?? "1f";
  const fixedViews: Record<string, string> = {
    perimeter: "外周",
    "1f": "1F",
    "2f": "2F",
  };
  const viewLabel = fixedViews[floor] ?? floor;
  const durationSec = body.durationSec ?? 10;
  const customerCode = body.customerCode?.toUpperCase() ?? null;

  if (customerCode) {
    setTvFocusState({
      customerCode,
      cameraId,
      floor,
      trigger: body.trigger ?? "sensor",
    });
  }

  broadcast({
    type: "camera_focus",
    payload: {
      event: "focusCamera",
      customerCode,
      siteId: body.siteId ?? null,
      cameraId,
      floor,
      viewLabel,
      trigger: body.trigger ?? "sensor",
      durationSec,
      fixedViews: ["perimeter", "1f", "2f"],
    },
    at: new Date().toISOString(),
  });

  res.status(201).json({
    ok: true,
    event: "focusCamera",
    cameraId,
    floor,
    viewLabel,
    durationSec,
    message: `TV focus: ${viewLabel} → ${cameraId} (${durationSec}s)`,
  });
});

tvRouter.get("/:code/state", (req, res) => {
  const state = getTvFocusState(String(req.params.code));
  res.json({ phase: "1161-1200", ...state });
});

tvRouter.post("/:code/clear-focus", (req, res) => {
  clearTvFocusState(String(req.params.code));
  res.json({ ok: true, cleared: true });
});

tvRouter.use(requireAdminAuth);

tvRouter.get("/devices", (req, res) => {
  const db = getDatabase();
  const siteId = req.query.siteId as string | undefined;
  const status = req.query.status as string | undefined;

  let sql = "SELECT * FROM tv_devices WHERE 1=1";
  const params: unknown[] = [];
  const ops = (req as import("express").Request & { opsScope?: { customerId?: string; tenantId?: string } })
    .opsScope;
  if (ops?.customerId) {
    sql += " AND (tenant_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?))";
    params.push(ops.tenantId ?? ops.customerId, ops.customerId);
  }
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

tvRouter.post("/devices/:id/revoke", (req: AuthedRequest, res) => {
  const row = findTvRow(String(req.params.id));
  if (!row) {
    res.status(404).json({ error: "TV device not found" });
    return;
  }

  const db = getDatabase();
  const revokedAt = new Date().toISOString();
  db.prepare(
    `UPDATE tv_devices SET
       site_id = NULL,
       pairing_code = NULL,
       pairing_expires_at = NULL,
       paired_at = NULL,
       status = 'revoked',
       revoked_at = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(revokedAt, row.id);

  logAudit({
    userId: req.admin?.userId,
    actorLabel: req.admin?.username,
    action: "tv.revoke",
    targetType: "tv_device",
    targetId: row.device_id,
    beforeJson: { status: row.status, siteId: row.site_id },
    afterJson: { status: "revoked", revokedAt },
    ...auditContextFromRequest(req),
  });

  res.json({ ok: true, deviceId: row.device_id, status: "revoked", revokedAt });
});

tvRouter.delete("/devices/:id", (req: AuthedRequest, res) => {
  const row = findTvRow(String(req.params.id));
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

  logAudit({
    userId: req.admin?.userId,
    actorLabel: req.admin?.username,
    action: "tv.unpair",
    targetType: "tv_device",
    targetId: row.device_id,
    ...auditContextFromRequest(req),
  });

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
