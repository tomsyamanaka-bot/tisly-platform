import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { appendProjectTimeline } from "../toms/project-timeline.js";
import { pushProjectTimelineLive } from "../toms/live-push-bridge.js";

export type RetryChannel = "gmail" | "qnap" | "pdf";
export type RetryQueueStatus = "pending" | "retrying" | "success" | "failed" | "cancelled";
export type SendMode = "dryRun" | "mockOnly" | "realSend";

export interface RetryQueueItem {
  id: string;
  projectId: string | null;
  channel: RetryChannel;
  status: RetryQueueStatus;
  payload: Record<string, unknown>;
  sendMode: SendMode;
  attemptCount: number;
  lastError: string | null;
  log: Array<{ at: string; message: string }>;
  createdAt: string;
  updatedAt: string;
}

function rowToItem(r: Record<string, unknown>): RetryQueueItem {
  let payload: Record<string, unknown> = {};
  let log: RetryQueueItem["log"] = [];
  try {
    payload = JSON.parse(String(r.payload_json ?? "{}")) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  try {
    log = JSON.parse(String(r.log_json ?? "[]")) as RetryQueueItem["log"];
  } catch {
    log = [];
  }
  return {
    id: String(r.id),
    projectId: r.project_id != null ? String(r.project_id) : null,
    channel: String(r.channel) as RetryChannel,
    status: String(r.status) as RetryQueueStatus,
    payload,
    sendMode: String(r.send_mode) as SendMode,
    attemptCount: Number(r.attempt_count ?? 0),
    lastError: r.last_error != null ? String(r.last_error) : null,
    log,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function appendLog(id: string, message: string): void {
  const row = getDatabase()
    .prepare(`SELECT log_json FROM business_integration_retry_queue WHERE id = ?`)
    .get(id) as { log_json: string } | undefined;
  if (!row) return;
  let log: RetryQueueItem["log"] = [];
  try {
    log = JSON.parse(row.log_json) as RetryQueueItem["log"];
  } catch {
    log = [];
  }
  log.push({ at: new Date().toISOString(), message });
  getDatabase()
    .prepare(`UPDATE business_integration_retry_queue SET log_json = ?, updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(log), new Date().toISOString(), id);
}

function timelineForRetry(
  projectId: string,
  channel: RetryChannel,
  status: RetryQueueStatus,
  sendMode: SendMode
): void {
  const title = `${channel.toUpperCase()} ${status}`;
  const entry = appendProjectTimeline({
    projectId,
    eventType: "pro_operations",
    title,
    detail: `retry queue · ${sendMode}`,
    actor: "retry-queue",
    metadata: { channel, status, sendMode },
  });
  pushProjectTimelineLive(projectId, entry);
}

export function enqueueIntegrationRetry(input: {
  projectId?: string | null;
  channel: RetryChannel;
  payload?: Record<string, unknown>;
  sendMode?: SendMode;
  errorMessage?: string;
}): RetryQueueItem {
  const id = `IRQ-${uuid().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  const sendMode = input.sendMode ?? "mockOnly";
  const log = [{ at: now, message: input.errorMessage ?? "enqueued after failure" }];
  getDatabase()
    .prepare(
      `INSERT INTO business_integration_retry_queue
       (id, project_id, channel, status, payload_json, send_mode, attempt_count, last_error, log_json, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?, 0, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.projectId ?? null,
      input.channel,
      JSON.stringify(input.payload ?? {}),
      sendMode,
      input.errorMessage ?? null,
      JSON.stringify(log),
      now,
      now
    );
  if (input.projectId) {
    timelineForRetry(input.projectId, input.channel, "failed", sendMode);
  }
  return rowToItem(
    getDatabase()
      .prepare(`SELECT * FROM business_integration_retry_queue WHERE id = ?`)
      .get(id) as Record<string, unknown>
  );
}

export function listIntegrationRetryQueue(opts?: {
  projectId?: string;
  status?: RetryQueueStatus;
  limit?: number;
}): RetryQueueItem[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts?.projectId) {
    clauses.push("project_id = ?");
    params.push(opts.projectId);
  }
  if (opts?.status) {
    clauses.push("status = ?");
    params.push(opts.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = opts?.limit ?? 50;
  return getDatabase()
    .prepare(
      `SELECT * FROM business_integration_retry_queue ${where} ORDER BY updated_at DESC LIMIT ?`
    )
    .all(...params, limit)
    .map((r) => rowToItem(r as Record<string, unknown>));
}

export function retryIntegrationQueueItem(id: string): RetryQueueItem | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM business_integration_retry_queue WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const item = rowToItem(row);
  if (item.status === "cancelled" || item.status === "success") return item;

  const now = new Date().toISOString();
  const attempts = item.attemptCount + 1;
  getDatabase()
    .prepare(
      `UPDATE business_integration_retry_queue
       SET status = 'retrying', attempt_count = ?, updated_at = ? WHERE id = ?`
    )
    .run(attempts, now, id);
  appendLog(id, `retry attempt ${attempts}`);

  const mockOk = item.sendMode !== "realSend" || attempts >= 2;
  const finalStatus: RetryQueueStatus = mockOk ? "success" : "failed";
  const lastError = mockOk ? null : "realSend blocked in demo";
  getDatabase()
    .prepare(
      `UPDATE business_integration_retry_queue
       SET status = ?, last_error = ?, updated_at = ? WHERE id = ?`
    )
    .run(finalStatus, lastError, new Date().toISOString(), id);
  appendLog(id, finalStatus === "success" ? "mock retry succeeded" : lastError ?? "failed");

  if (item.projectId) {
    timelineForRetry(item.projectId, item.channel, "retrying", item.sendMode);
    if (finalStatus === "success") {
      timelineForRetry(item.projectId, item.channel, "success", item.sendMode);
    }
  }

  return rowToItem(
    getDatabase()
      .prepare(`SELECT * FROM business_integration_retry_queue WHERE id = ?`)
      .get(id) as Record<string, unknown>
  );
}

export function cancelIntegrationRetry(id: string): RetryQueueItem | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM business_integration_retry_queue WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE business_integration_retry_queue SET status = 'cancelled', updated_at = ? WHERE id = ?`
    )
    .run(now, id);
  appendLog(id, "cancelled by user");
  return rowToItem(
    getDatabase()
      .prepare(`SELECT * FROM business_integration_retry_queue WHERE id = ?`)
      .get(id) as Record<string, unknown>
  );
}

export function getIntegrationRetryLog(id: string): RetryQueueItem | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM business_integration_retry_queue WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToItem(row) : null;
}
