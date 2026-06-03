import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { appendProjectTimeline } from "../toms/project-timeline.js";
import { pushProjectTimelineLive } from "../toms/live-push-bridge.js";
import { getGoogleOAuthStatus } from "../services/googleOAuthService.js";
import { enqueueGmailDeadLetter } from "./gmail-dlq.js";
import { logBusinessIntegration } from "./business-integration-log.js";

export type GmailQueueStatus = "pending" | "retrying" | "sent" | "failed";

export interface GmailSendQueueItem {
  id: string;
  projectId: string | null;
  toAddress: string;
  subject: string;
  bodyPreview: string;
  status: GmailQueueStatus;
  sendMode: "mockOnly" | "realSend" | "dryRun";
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToItem(r: Record<string, unknown>): GmailSendQueueItem {
  return {
    id: String(r.id),
    projectId: r.project_id != null ? String(r.project_id) : null,
    toAddress: String(r.to_address ?? ""),
    subject: String(r.subject ?? ""),
    bodyPreview: String(r.body_preview ?? ""),
    status: String(r.status) as GmailQueueStatus,
    sendMode: String(r.send_mode) as GmailSendQueueItem["sendMode"],
    attemptCount: Number(r.attempt_count ?? 0),
    lastError: r.last_error != null ? String(r.last_error) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function timelineGmailQueue(
  projectId: string,
  status: GmailQueueStatus,
  detail: string
): void {
  const labels: Record<GmailQueueStatus, string> = {
    pending: "Gmail 送信待ち",
    retrying: "Gmail 再送中",
    sent: "Gmail 送信完了",
    failed: "Gmail 送信失敗",
  };
  const entry = appendProjectTimeline({
    projectId,
    eventType: "integration",
    title: labels[status],
    detail,
    actor: "gmail-retry-worker",
    metadata: { channel: "gmail", status },
  });
  pushProjectTimelineLive(projectId, entry);
}

export function resolveGmailSendMode(): "mockOnly" | "realSend" {
  const cfg = getGoogleOAuthStatus();
  if (cfg.mode === "mock" || !cfg.connected) return "mockOnly";
  return process.env.GMAIL_SEND_MODE === "real" ? "realSend" : "mockOnly";
}

export function enqueueGmailSend(input: {
  projectId?: string | null;
  toAddress: string;
  subject: string;
  bodyPreview?: string;
  sendMode?: GmailSendQueueItem["sendMode"];
}): GmailSendQueueItem {
  const id = `GML-${uuid().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  const sendMode = input.sendMode ?? resolveGmailSendMode();
  getDatabase()
    .prepare(
      `INSERT INTO gmail_send_queue
       (id, project_id, to_address, subject, body_preview, status, send_mode, attempt_count, last_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, 0, NULL, ?, ?)`
    )
    .run(
      id,
      input.projectId ?? null,
      input.toAddress,
      input.subject,
      (input.bodyPreview ?? "").slice(0, 500),
      sendMode,
      now,
      now
    );
  if (input.projectId) timelineGmailQueue(input.projectId, "pending", sendMode);
  return rowToItem(
    getDatabase()
      .prepare(`SELECT * FROM gmail_send_queue WHERE id = ?`)
      .get(id) as Record<string, unknown>
  );
}

export function listGmailSendQueue(opts?: {
  status?: GmailQueueStatus;
  limit?: number;
}): GmailSendQueueItem[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts?.status) {
    clauses.push("status = ?");
    params.push(opts.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return getDatabase()
    .prepare(`SELECT * FROM gmail_send_queue ${where} ORDER BY updated_at DESC LIMIT ?`)
    .all(...params, opts?.limit ?? 50)
    .map((r) => rowToItem(r as Record<string, unknown>));
}

export function processGmailQueueItem(id: string): GmailSendQueueItem | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM gmail_send_queue WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const item = rowToItem(row);
  if (item.status === "sent") return item;

  const now = new Date().toISOString();
  const attempts = item.attemptCount + 1;
  getDatabase()
    .prepare(
      `UPDATE gmail_send_queue SET status = 'retrying', attempt_count = ?, updated_at = ? WHERE id = ?`
    )
    .run(attempts, now, id);
  if (item.projectId) timelineGmailQueue(item.projectId, "retrying", `attempt ${attempts}`);

  const oauth = getGoogleOAuthStatus();
  const mockOnly = item.sendMode === "mockOnly" || oauth.mode === "mock" || !oauth.connected;
  const maxAttempts = Number(process.env.GMAIL_QUEUE_MAX_ATTEMPTS ?? 3);
  const finalStatus: GmailQueueStatus = mockOnly
    ? "sent"
    : attempts >= maxAttempts
      ? "failed"
      : "retrying";
  const lastError = mockOnly ? null : "OAuth not connected or real send blocked";

  if (finalStatus === "retrying") {
    logBusinessIntegration({
      projectId: item.projectId,
      type: "gmail",
      provider: "google",
      status: "error",
      request: { op: "retry", queueId: id, attempt: attempts },
      errorMessage: lastError ?? "retry scheduled",
    });
  }

  if (finalStatus === "failed") {
    enqueueGmailDeadLetter({
      projectId: item.projectId,
      queueId: id,
      toAddress: item.toAddress,
      subject: item.subject,
      attemptCount: attempts,
      lastError: lastError ?? undefined,
      payload: { sendMode: item.sendMode },
    });
  }

  getDatabase()
    .prepare(
      `UPDATE gmail_send_queue SET status = ?, last_error = ?, updated_at = ? WHERE id = ?`
    )
    .run(finalStatus, lastError, new Date().toISOString(), id);

  if (item.projectId) {
    timelineGmailQueue(
      item.projectId,
      finalStatus,
      mockOnly ? "mockOnly — OAuth未接続時はデモ送信" : lastError ?? "sent"
    );
  }
  return rowToItem(
    getDatabase()
      .prepare(`SELECT * FROM gmail_send_queue WHERE id = ?`)
      .get(id) as Record<string, unknown>
  );
}

export function processGmailQueueBatch(limit = 10): { processed: number; sent: number; failed: number } {
  const pending = listGmailSendQueue({
    status: "pending",
    limit,
  });
  const retrying = listGmailSendQueue({
    status: "retrying",
    limit: Math.max(0, limit - pending.length),
  });
  let sent = 0;
  let failed = 0;
  for (const item of [...pending, ...retrying]) {
    const result = processGmailQueueItem(item.id);
    if (!result) continue;
    if (result.status === "sent") sent += 1;
    else if (result.status === "failed") failed += 1;
  }
  return { processed: pending.length + retrying.length, sent, failed };
}
