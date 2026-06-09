export function isDryRunRequest(req) {
    const header = req.header("x-tisly-dry-run");
    if (header === "1" || header?.toLowerCase() === "true")
        return true;
    const q = req.query.dryRun;
    if (q === "1" || q === "true")
        return true;
    const body = req.body;
    return body?.dryRun === true;
}
const dryRunLogs = new Map();
export function logDryRun(customerCode, action, body) {
    const key = customerCode.toUpperCase();
    const list = dryRunLogs.get(key) ?? [];
    list.push({ action, at: new Date().toISOString(), body });
    if (list.length > 500)
        list.shift();
    dryRunLogs.set(key, list);
}
export function getDryRunLogs(customerCode) {
    return [...(dryRunLogs.get(customerCode.toUpperCase()) ?? [])];
}
export function clearDryRunLogsForTests() {
    dryRunLogs.clear();
}
