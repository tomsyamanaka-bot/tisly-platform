import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";

export type IntegrationLogType =
  | "calendar"
  | "gmail"
  | "qnap"
  | "pdf"
  | "status_flow";

export type IntegrationLogStatus = "success" | "error" | "skipped";

export interface BusinessIntegrationLog {
  id: string;
  projectId: string | null;
  type: IntegrationLogType;
  provider: string;
  status: IntegrationLogStatus;
  requestJson: string | null;
  responseJson: string | null;
  errorMessage: string | null;
  createdAt: string;
}

function rowToLog(r: Record<string, unknown>): BusinessIntegrationLog {
  return {
    id: String(r.id),
    projectId: r.project_id != null ? String(r.project_id) : null,
    type: String(r.type) as IntegrationLogType,
    provider: String(r.provider),
    status: String(r.status) as IntegrationLogStatus,
    requestJson: r.request_json != null ? String(r.request_json) : null,
    responseJson: r.response_json != null ? String(r.response_json) : null,
    errorMessage: r.error_message != null ? String(r.error_message) : null,
    createdAt: String(r.created_at),
  };
}

export function logBusinessIntegration(input: {
  projectId?: string | null;
  type: IntegrationLogType;
  provider: string;
  status: IntegrationLogStatus;
  request?: unknown;
  response?: unknown;
  errorMessage?: string;
}): BusinessIntegrationLog {
  const id = `BIL-${uuid().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO business_integration_logs (
        id, project_id, type, provider, status, request_json, response_json, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.projectId ?? null,
      input.type,
      input.provider,
      input.status,
      input.request != null ? JSON.stringify(input.request) : null,
      input.response != null ? JSON.stringify(input.response) : null,
      input.errorMessage ?? null,
      now
    );
  return rowToLog(
    getDatabase()
      .prepare(`SELECT * FROM business_integration_logs WHERE id = ?`)
      .get(id) as Record<string, unknown>
  );
}

export function listBusinessIntegrationLogs(opts?: {
  projectId?: string;
  type?: IntegrationLogType;
  limit?: number;
}): BusinessIntegrationLog[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts?.projectId) {
    clauses.push("project_id = ?");
    params.push(opts.projectId);
  }
  if (opts?.type) {
    clauses.push("type = ?");
    params.push(opts.type);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = opts?.limit ?? 100;
  return getDatabase()
    .prepare(
      `SELECT * FROM business_integration_logs ${where} ORDER BY created_at DESC LIMIT ?`
    )
    .all(...params, limit)
    .map((r) => rowToLog(r as Record<string, unknown>));
}
