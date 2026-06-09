import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { applyPaymentStatusAfterRecord } from "./business-payment-status.js";
import { getBusinessProject, getEstimate, getInvoice, listBusinessProjects, } from "./business-store.js";
function rowToPayment(r) {
    return {
        id: String(r.id),
        projectId: String(r.project_id),
        invoiceId: r.invoice_id != null ? String(r.invoice_id) : null,
        amount: Number(r.amount),
        paymentDate: String(r.payment_date),
        method: String(r.method ?? ""),
        memo: String(r.memo ?? ""),
        createdAt: String(r.created_at),
    };
}
export function createBusinessPayment(input) {
    const project = getBusinessProject(input.projectId);
    if (!project)
        throw new Error("project not found");
    const id = `BPY-${uuid().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO business_payments (
        id, project_id, invoice_id, amount, payment_date, method, memo, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.projectId, input.invoiceId ?? project.invoiceId ?? null, input.amount, input.paymentDate, input.method ?? "bank_transfer", input.memo ?? "", now);
    const payment = rowToPayment(getDatabase()
        .prepare(`SELECT * FROM business_payments WHERE id = ?`)
        .get(id));
    const statusUpdate = applyPaymentStatusAfterRecord(input.projectId);
    return Object.assign(payment, { statusUpdate });
}
export function listBusinessPayments(opts) {
    if (opts?.projectId) {
        return getDatabase()
            .prepare(`SELECT * FROM business_payments WHERE project_id = ? ORDER BY payment_date DESC`)
            .all(opts.projectId)
            .map((r) => rowToPayment(r));
    }
    return getDatabase()
        .prepare(`SELECT * FROM business_payments ORDER BY payment_date DESC LIMIT 500`)
        .all()
        .map((r) => rowToPayment(r));
}
function csvEscape(v) {
    const s = String(v);
    if (/[",\n]/.test(s))
        return `"${s.replace(/"/g, '""')}"`;
    return s;
}
export function buildAccountingExportCsv() {
    const header = [
        "顧客名",
        "案件名",
        "請求日",
        "入金日",
        "税抜",
        "消費税",
        "税込",
        "入金額",
        "状態",
    ];
    const rows = [header.join(",")];
    const payments = listBusinessPayments();
    const payByProject = new Map();
    for (const p of payments) {
        const list = payByProject.get(p.projectId) ?? [];
        list.push(p);
        payByProject.set(p.projectId, list);
    }
    for (const project of listBusinessProjects()) {
        if (!project.invoiceId)
            continue;
        const inv = getInvoice(project.invoiceId);
        if (!inv)
            continue;
        const pays = payByProject.get(project.id) ?? [];
        const paidAmount = pays.reduce((s, p) => s + p.amount, 0);
        const lastPay = pays[0];
        const est = project.estimateId ? getEstimate(project.estimateId) : null;
        const row = {
            customerName: project.customerName,
            projectTitle: project.title,
            invoiceDate: inv.createdAt?.slice(0, 10) ?? "",
            paymentDate: lastPay?.paymentDate ?? project.paidDate ?? "",
            subtotalExTax: inv.subtotal,
            tax: inv.tax,
            totalInTax: inv.total,
            paidAmount,
            status: project.status,
        };
        rows.push([
            row.customerName,
            row.projectTitle,
            row.invoiceDate,
            row.paymentDate,
            row.subtotalExTax,
            row.tax,
            row.totalInTax,
            row.paidAmount,
            row.status,
        ]
            .map(csvEscape)
            .join(","));
    }
    return rows.join("\n");
}
function accountLabelForProject(title) {
    return title.includes("カメラ") ? "売上高" : "売上高";
}
export function buildAccountingExportByFormat(format) {
    const rows = [];
    const payments = listBusinessPayments();
    const payByProject = new Map();
    for (const p of payments) {
        const list = payByProject.get(p.projectId) ?? [];
        list.push(p);
        payByProject.set(p.projectId, list);
    }
    for (const project of listBusinessProjects()) {
        if (!project.invoiceId)
            continue;
        const inv = getInvoice(project.invoiceId);
        if (!inv)
            continue;
        const pays = payByProject.get(project.id) ?? [];
        const paidAmount = pays.reduce((s, p) => s + p.amount, 0);
        const lastPay = pays[0];
        if (paidAmount <= 0)
            continue;
        rows.push({
            date: lastPay?.paymentDate ?? new Date().toISOString().slice(0, 10),
            partner: project.customerName,
            account: accountLabelForProject(project.title),
            taxCategory: "課税売上10%",
            amount: paidAmount,
            tax: Math.round(paidAmount - paidAmount / 1.1),
            memo: `${project.title} (${project.projectNo})`,
            projectId: project.id,
        });
    }
    if (format === "freee") {
        const header = ["収支区分", "管理番号", "発生日", "決済期日", "取引先", "勘定科目", "税区分", "金額", "税計算区分", "備考", "案件ID"];
        const lines = [header.join(",")];
        for (const r of rows) {
            lines.push([
                "収入",
                "",
                r.date,
                r.date,
                r.partner,
                r.account,
                r.taxCategory,
                r.amount,
                "内税",
                r.memo,
                r.projectId,
            ]
                .map(csvEscape)
                .join(","));
        }
        return lines.join("\n");
    }
    if (format === "yayoi") {
        const header = ["識別フラグ", "伝票No", "決算", "取引日付", "借方勘定科目", "借方金額", "貸方勘定科目", "貸方金額", "摘要", "案件ID"];
        const lines = [header.join(",")];
        for (const r of rows) {
            lines.push([
                "2000",
                "",
                "",
                r.date.replace(/-/g, ""),
                "普通預金",
                r.amount,
                r.account,
                r.amount,
                r.memo,
                r.projectId,
            ]
                .map(csvEscape)
                .join(","));
        }
        return lines.join("\n");
    }
    const header = ["日付", "取引先", "勘定科目", "税区分", "金額", "消費税", "摘要", "案件ID"];
    const lines = [header.join(",")];
    for (const r of rows) {
        lines.push([r.date, r.partner, r.account, r.taxCategory, r.amount, r.tax, r.memo, r.projectId]
            .map(csvEscape)
            .join(","));
    }
    return lines.join("\n");
}
