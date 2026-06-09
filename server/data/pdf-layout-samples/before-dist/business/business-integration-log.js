import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { appendProjectTimeline } from "../toms/project-timeline.js";
import { enqueueIntegrationRetry } from "./integration-retry-queue.js";
function rowToLog(r) {
    return {
        id: String(r.id),
        projectId: r.project_id != null ? String(r.project_id) : null,
        type: String(r.type),
        provider: String(r.provider),
        status: String(r.status),
        requestJson: r.request_json != null ? String(r.request_json) : null,
        responseJson: r.response_json != null ? String(r.response_json) : null,
        errorMessage: r.error_message != null ? String(r.error_message) : null,
        createdAt: String(r.created_at),
    };
}
export function logBusinessIntegration(input) {
    const id = `BIL-${uuid().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO business_integration_logs (
        id, project_id, type, provider, status, request_json, response_json, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.projectId ?? null, input.type, input.provider, input.status, input.request != null ? JSON.stringify(input.request) : null, input.response != null ? JSON.stringify(input.response) : null, input.errorMessage ?? null, now);
    const log = rowToLog(getDatabase()
        .prepare(`SELECT * FROM business_integration_logs WHERE id = ?`)
        .get(id));
    if (input.projectId) {
        syncIntegrationLogToTimeline(log);
        if (input.status === "error" && ["gmail", "qnap", "pdf"].includes(input.type)) {
            let sendMode = "mockOnly";
            if (input.request && typeof input.request === "object") {
                const req = input.request;
                if (req.realSend)
                    sendMode = "realSend";
                else if (req.dryRun)
                    sendMode = "dryRun";
            }
            enqueueIntegrationRetry({
                projectId: input.projectId,
                channel: input.type,
                payload: { provider: input.provider, request: input.request },
                sendMode,
                errorMessage: input.errorMessage,
            });
        }
    }
    return log;
}
function syncIntegrationLogToTimeline(log) {
    if (!log.projectId)
        return;
    let title = `${log.provider} ${log.type}`;
    if (log.type === "pdf")
        title = "PDF生成";
    if (log.type === "gmail")
        title = "Gmail送信";
    if (log.type === "qnap")
        title = "QNAP保存";
    const detailParts = [log.status];
    if (log.requestJson) {
        try {
            const req = JSON.parse(log.requestJson);
            if (req.dryRun)
                detailParts.push("dryRun");
            if (req.mockOnly)
                detailParts.push("mockOnly");
            if (req.realSend)
                detailParts.push("realSend");
        }
        catch {
            /* */
        }
    }
    if (log.errorMessage)
        detailParts.push(log.errorMessage);
    appendProjectTimeline({
        projectId: log.projectId,
        eventType: "pro_operations",
        title: `${title} (${log.status})`,
        detail: detailParts.join(" · "),
        actor: log.provider,
        metadata: {
            integrationLogId: log.id,
            type: log.type,
            provider: log.provider,
            status: log.status,
        },
    });
}
export function listBusinessIntegrationLogs(opts) {
    const clauses = [];
    const params = [];
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
        .prepare(`SELECT * FROM business_integration_logs ${where} ORDER BY created_at DESC LIMIT ?`)
        .all(...params, limit)
        .map((r) => rowToLog(r));
}
function csvEscape(v) {
    const s = String(v);
    if (/[",\n]/.test(s))
        return `"${s.replace(/"/g, '""')}"`;
    return s;
}
export function exportIntegrationLogsCsv(opts) {
    const logs = listBusinessIntegrationLogs(opts);
    const header = ["id", "projectId", "type", "provider", "status", "errorMessage", "createdAt"];
    const lines = [header.join(",")];
    for (const l of logs) {
        lines.push([l.id, l.projectId ?? "", l.type, l.provider, l.status, l.errorMessage ?? "", l.createdAt]
            .map(csvEscape)
            .join(","));
    }
    return lines.join("\n");
}
export function purgeIntegrationLogsOlderThan(days) {
    const db = getDatabase();
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const result = db
        .prepare(`DELETE FROM business_integration_logs WHERE created_at < ?`)
        .run(cutoff);
    return { deleted: result.changes };
}
