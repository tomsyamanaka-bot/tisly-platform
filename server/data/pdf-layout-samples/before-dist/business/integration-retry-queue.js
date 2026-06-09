import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { appendProjectTimeline } from "../toms/project-timeline.js";
import { pushProjectTimelineLive } from "../toms/live-push-bridge.js";
function rowToItem(r) {
    let payload = {};
    let log = [];
    try {
        payload = JSON.parse(String(r.payload_json ?? "{}"));
    }
    catch {
        payload = {};
    }
    try {
        log = JSON.parse(String(r.log_json ?? "[]"));
    }
    catch {
        log = [];
    }
    return {
        id: String(r.id),
        projectId: r.project_id != null ? String(r.project_id) : null,
        channel: String(r.channel),
        status: String(r.status),
        payload,
        sendMode: String(r.send_mode),
        attemptCount: Number(r.attempt_count ?? 0),
        lastError: r.last_error != null ? String(r.last_error) : null,
        log,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
    };
}
function appendLog(id, message) {
    const row = getDatabase()
        .prepare(`SELECT log_json FROM business_integration_retry_queue WHERE id = ?`)
        .get(id);
    if (!row)
        return;
    let log = [];
    try {
        log = JSON.parse(row.log_json);
    }
    catch {
        log = [];
    }
    log.push({ at: new Date().toISOString(), message });
    getDatabase()
        .prepare(`UPDATE business_integration_retry_queue SET log_json = ?, updated_at = ? WHERE id = ?`)
        .run(JSON.stringify(log), new Date().toISOString(), id);
}
function timelineForRetry(projectId, channel, status, sendMode) {
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
export function enqueueIntegrationRetry(input) {
    const id = `IRQ-${uuid().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    const sendMode = input.sendMode ?? "mockOnly";
    const log = [{ at: now, message: input.errorMessage ?? "enqueued after failure" }];
    getDatabase()
        .prepare(`INSERT INTO business_integration_retry_queue
       (id, project_id, channel, status, payload_json, send_mode, attempt_count, last_error, log_json, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?, 0, ?, ?, ?, ?)`)
        .run(id, input.projectId ?? null, input.channel, JSON.stringify(input.payload ?? {}), sendMode, input.errorMessage ?? null, JSON.stringify(log), now, now);
    if (input.projectId) {
        timelineForRetry(input.projectId, input.channel, "failed", sendMode);
    }
    return rowToItem(getDatabase()
        .prepare(`SELECT * FROM business_integration_retry_queue WHERE id = ?`)
        .get(id));
}
export function listIntegrationRetryQueue(opts) {
    const clauses = [];
    const params = [];
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
        .prepare(`SELECT * FROM business_integration_retry_queue ${where} ORDER BY updated_at DESC LIMIT ?`)
        .all(...params, limit)
        .map((r) => rowToItem(r));
}
export function retryIntegrationQueueItem(id) {
    const row = getDatabase()
        .prepare(`SELECT * FROM business_integration_retry_queue WHERE id = ?`)
        .get(id);
    if (!row)
        return null;
    const item = rowToItem(row);
    if (item.status === "cancelled" || item.status === "success")
        return item;
    const now = new Date().toISOString();
    const attempts = item.attemptCount + 1;
    getDatabase()
        .prepare(`UPDATE business_integration_retry_queue
       SET status = 'retrying', attempt_count = ?, updated_at = ? WHERE id = ?`)
        .run(attempts, now, id);
    appendLog(id, `retry attempt ${attempts}`);
    const mockOk = item.sendMode !== "realSend" || attempts >= 2;
    const finalStatus = mockOk ? "success" : "failed";
    const lastError = mockOk ? null : "realSend blocked in demo";
    getDatabase()
        .prepare(`UPDATE business_integration_retry_queue
       SET status = ?, last_error = ?, updated_at = ? WHERE id = ?`)
        .run(finalStatus, lastError, new Date().toISOString(), id);
    appendLog(id, finalStatus === "success" ? "mock retry succeeded" : lastError ?? "failed");
    if (item.projectId) {
        timelineForRetry(item.projectId, item.channel, "retrying", item.sendMode);
        if (finalStatus === "success") {
            timelineForRetry(item.projectId, item.channel, "success", item.sendMode);
        }
    }
    return rowToItem(getDatabase()
        .prepare(`SELECT * FROM business_integration_retry_queue WHERE id = ?`)
        .get(id));
}
export function cancelIntegrationRetry(id) {
    const row = getDatabase()
        .prepare(`SELECT * FROM business_integration_retry_queue WHERE id = ?`)
        .get(id);
    if (!row)
        return null;
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`UPDATE business_integration_retry_queue SET status = 'cancelled', updated_at = ? WHERE id = ?`)
        .run(now, id);
    appendLog(id, "cancelled by user");
    return rowToItem(getDatabase()
        .prepare(`SELECT * FROM business_integration_retry_queue WHERE id = ?`)
        .get(id));
}
export function getIntegrationRetryLog(id) {
    const row = getDatabase()
        .prepare(`SELECT * FROM business_integration_retry_queue WHERE id = ?`)
        .get(id);
    return row ? rowToItem(row) : null;
}
