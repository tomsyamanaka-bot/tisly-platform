import { createBusinessProject, getBusinessProject, saveBusinessPhoto, updateBusinessProject, } from "./business-store.js";
import { transitionProjectStatus } from "./business-workflow.js";
import { createEstimate, createInvoiceFromEstimate } from "./business-store.js";
import { createBusinessPayment } from "./business-payments.js";
import { logBusinessIntegration } from "./business-integration-log.js";
export function processBusinessOfflineSync(items) {
    const result = { synced: [], failed: [], skipped: [] };
    for (const item of items) {
        try {
            switch (item.type) {
                case "project_create": {
                    const p = item.payload ?? {};
                    if (!p.customerId || !p.customerName || !p.title) {
                        result.skipped.push({
                            type: item.type,
                            reason: "customerId, customerName, title required",
                            clientId: item.clientId,
                        });
                        break;
                    }
                    const project = createBusinessProject({
                        customerId: String(p.customerId),
                        customerName: String(p.customerName),
                        title: String(p.title),
                        address: p.address != null ? String(p.address) : undefined,
                        phone: p.phone != null ? String(p.phone) : undefined,
                    });
                    result.synced.push({ type: item.type, projectId: project.id, clientId: item.clientId });
                    break;
                }
                case "photo_memo": {
                    const pid = item.projectId ?? String(item.payload?.projectId ?? "");
                    if (!pid || !item.payload?.imageBase64) {
                        result.skipped.push({ type: item.type, reason: "projectId and imageBase64 required" });
                        break;
                    }
                    saveBusinessPhoto(pid, item.payload.kind ?? "survey", String(item.payload.imageBase64), String(item.payload.fileName ?? "photo.jpg"));
                    if (item.payload.memo) {
                        updateBusinessProject(pid, { surveyMemo: String(item.payload.memo) });
                    }
                    result.synced.push({ type: item.type, projectId: pid, clientId: item.clientId });
                    break;
                }
                case "status_change": {
                    const pid = item.projectId ?? String(item.payload?.projectId ?? "");
                    const status = String(item.payload?.status ?? "");
                    if (!pid || !status) {
                        result.skipped.push({ type: item.type, reason: "projectId and status required" });
                        break;
                    }
                    transitionProjectStatus(pid, status);
                    result.synced.push({ type: item.type, projectId: pid, clientId: item.clientId });
                    break;
                }
                case "estimate_item": {
                    const pid = item.projectId ?? String(item.payload?.projectId ?? "");
                    const items = (item.payload?.items ?? []);
                    if (!pid) {
                        result.skipped.push({ type: item.type, reason: "projectId required" });
                        break;
                    }
                    createEstimate(pid, items, { fromAi: Boolean(item.payload?.fromAi) });
                    result.synced.push({ type: item.type, projectId: pid, clientId: item.clientId });
                    break;
                }
                case "invoice_memo": {
                    const pid = item.projectId ?? String(item.payload?.projectId ?? "");
                    if (!pid) {
                        result.skipped.push({ type: item.type, reason: "projectId required" });
                        break;
                    }
                    const project = getBusinessProject(pid);
                    if (!project?.estimateId) {
                        result.skipped.push({ type: item.type, reason: "estimate required" });
                        break;
                    }
                    createInvoiceFromEstimate(pid, item.payload?.paymentDueDate != null ? String(item.payload.paymentDueDate) : undefined);
                    result.synced.push({ type: item.type, projectId: pid, clientId: item.clientId });
                    break;
                }
                case "payment_memo": {
                    const pid = item.projectId ?? String(item.payload?.projectId ?? "");
                    const amount = Number(item.payload?.amount ?? 0);
                    const paymentDate = String(item.payload?.paymentDate ?? new Date().toISOString().slice(0, 10));
                    if (!pid || !amount) {
                        result.skipped.push({ type: item.type, reason: "projectId and amount required" });
                        break;
                    }
                    createBusinessPayment({
                        projectId: pid,
                        amount,
                        paymentDate,
                        method: item.payload?.method != null ? String(item.payload.method) : undefined,
                        memo: item.payload?.memo != null ? String(item.payload.memo) : undefined,
                    });
                    result.synced.push({ type: item.type, projectId: pid, clientId: item.clientId });
                    break;
                }
                default:
                    result.skipped.push({ type: item.type, reason: "unknown type" });
            }
        }
        catch (e) {
            result.failed.push({ type: item.type, error: e.message, clientId: item.clientId });
        }
    }
    logBusinessIntegration({
        type: "status_flow",
        provider: "offline_sync",
        status: result.failed.length ? "error" : "success",
        request: { count: items.length },
        response: {
            synced: result.synced.length,
            failed: result.failed.length,
            skipped: result.skipped.length,
        },
    });
    return result;
}
