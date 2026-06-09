import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getCustomerByCode, listSitesForCustomer } from "../customer/customer-store.js";
import { buildCustomerSalesReport } from "../customer/customer-reports.js";
import { buildReportHtml } from "./report-builder.js";
export function buildCustomerMonthlyReport(customerCode, generatedBy) {
    const customer = getCustomerByCode(customerCode);
    if (!customer)
        return null;
    const sales = buildCustomerSalesReport(customer.customer_id);
    const sites = listSitesForCustomer(customer.customer_id);
    const primarySite = sites[0]?.site_id ?? null;
    const exportId = `rpt-m-${customer.customer_code}-${Date.now()}-${uuid().slice(0, 8)}`;
    const generatedAt = new Date().toISOString();
    const meta = {
        exportId,
        customerId: customer.customer_id,
        customerCode: customer.customer_code,
        customerName: customer.customer_name,
        siteId: primarySite,
        generatedBy,
        generatedAt,
        format: "html",
        status: "generated",
        reportType: "monthly",
    };
    const sections = [
        {
            title: "サマリー",
            items: [
                { label: "期間", value: `${sales.period.from} — ${sales.period.to}` },
                { label: "月間イベント", value: sales.monthlyEvents },
                { label: "警報", value: sales.alarmCount },
                { label: "復旧", value: sales.recoveryCount },
                { label: "稼働率", value: `${sales.uptimePercent}%` },
            ],
        },
        {
            title: "現場",
            items: sites.map((s) => ({ label: s.site_name, value: s.site_id })),
        },
        {
            title: "AIコメント",
            items: [{ label: "所見", value: sales.aiComment }],
        },
    ];
    let deviceCount = 0;
    try {
        deviceCount = getDatabase()
            .prepare(`SELECT COUNT(*) as c FROM devices WHERE customer_id = ?`)
            .get(customer.customer_id).c;
    }
    catch {
        deviceCount = 0;
    }
    sections[0].items.push({ label: "設備数", value: deviceCount });
    const html = buildReportHtml(meta, sections);
    return { meta, period: sales.period, sections, html, pdfTodo: "Puppeteer PDF generation TODO" };
}
