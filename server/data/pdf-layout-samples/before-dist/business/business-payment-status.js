import { logBusinessIntegration } from "./business-integration-log.js";
import { getInvoice, getBusinessProject, updateBusinessProject } from "./business-store.js";
import { listBusinessPayments } from "./business-payments.js";
import { normalizeProjectStatus } from "./business-status.js";
export function computePaymentStatus(projectId) {
    const project = getBusinessProject(projectId);
    if (!project?.invoiceId)
        return null;
    const inv = getInvoice(project.invoiceId);
    if (!inv)
        return null;
    const payments = listBusinessPayments({ projectId });
    const paidAmount = payments.reduce((s, p) => s + p.amount, 0);
    const due = inv.total;
    if (paidAmount <= 0)
        return "invoice_sent";
    if (paidAmount >= due)
        return "paid";
    return "partial_paid";
}
export function applyPaymentStatusAfterRecord(projectId) {
    const project = getBusinessProject(projectId);
    if (!project)
        throw new Error("project not found");
    const target = computePaymentStatus(projectId);
    if (!target) {
        return { previousStatus: project.status, newStatus: null, changed: false };
    }
    const current = normalizeProjectStatus(project.status);
    if (current === "closed") {
        return { previousStatus: project.status, newStatus: "closed", changed: false };
    }
    if (current === target) {
        return { previousStatus: project.status, newStatus: target, changed: false };
    }
    const skipFrom = ["new", "survey_scheduled", "survey_done", "estimate_created", "estimate_sent"];
    if (skipFrom.includes(current) && target !== "invoice_sent") {
        return { previousStatus: project.status, newStatus: current, changed: false };
    }
    const updated = updateBusinessProject(projectId, {
        status: target,
        ...(target === "paid" ? { paidDate: new Date().toISOString().slice(0, 10) } : {}),
    }, { skipTransitionCheck: true });
    logBusinessIntegration({
        projectId,
        type: "status_flow",
        provider: "payment_auto",
        status: "success",
        request: { trigger: "payment_recorded" },
        response: { from: project.status, to: target },
    });
    return {
        previousStatus: project.status,
        newStatus: updated.status,
        changed: true,
    };
}
