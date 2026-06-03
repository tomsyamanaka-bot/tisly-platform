import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { logBusinessIntegration } from "./business-integration-log.js";

export type GmailDlqStatus = "dead_letter" | "requeued";

export interface GmailDlqItem {
  id: string;
  projectId: string | null;
  queueId: string | null;
  toAddress: string;
  subject: string;
  status: GmailDlqStatus;
  attemptCount: number;
  lastError: string | null;
  payloadJson: string | null;
  createdAt: string;
}

function rowToDlq(r: Record<string, unknown>): GmailDlqItem {
  return {
    id: String(r.id),
    projectId: r.project_id != null ? String(r.project_id) : null,
    queueId: r.queue_id != null ? String(r.queue_id) : null,
    toAddress: String(r.to_address ?? ""),
    subject: String(r.subject ?? ""),
    status: String(r.status) as GmailDlqStatus,
    attemptCount: Number(r.attempt_count ?? 0),
    lastError: r.last_error != null ? String(r.last_error) : null,
    payloadJson: r.payload_json != null ? String(r.payload_json) : null,
    createdAt: String(r.created_at),
  };
}

export function enqueueGmailDeadLetter(input: {
  projectId?: string | null;
  queueId?: string | null;
  toAddress: string;
  subject: string;
  attemptCount?: number;
  lastError?: string;
  payload?: unknown;
}): GmailDlqItem {
  const id = `GDLQ-${uuid().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO gmail_send_dlq
       (id, project_id, queue_id, to_address, subject, status, attempt_count, last_error, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, 'dead_letter', ?, ?, ?, ?)`
    )
    .run(
      id,
      input.projectId ?? null,
      input.queueId ?? null,
      input.toAddress,
      input.subject,
      input.attemptCount ?? 0,
      input.lastError ?? null,
      input.payload != null ? JSON.stringify(input.payload) : null,
      now
    );

  logBusinessIntegration({
    projectId: input.projectId,
    type: "gmail",
    provider: "google",
    status: "error",
    request: { op: "dead-letter", queueId: input.queueId, to: input.toAddress, subject: input.subject },
    errorMessage: input.lastError ?? "max retries exceeded",
    response: { dlqId: id },
  });

  return rowToDlq(
    getDatabase()
      .prepare(`SELECT * FROM gmail_send_dlq WHERE id = ?`)
      .get(id) as Record<string, unknown>
  );
}

export function listGmailDlq(opts?: { limit?: number; projectId?: string }): GmailDlqItem[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts?.projectId) {
    clauses.push("project_id = ?");
    params.push(opts.projectId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = opts?.limit ?? 50;
  return getDatabase()
    .prepare(`SELECT * FROM gmail_send_dlq ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, limit)
    .map((r) => rowToDlq(r as Record<string, unknown>));
}
