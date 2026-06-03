import { Router } from "express";
import { getCustomerByCode } from "../../customer/customer-store.js";
import { requirePlanFeature } from "../../customer/plan-guard.js";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { requireTenantMatch } from "../../auth/tenant-guard.js";
import { canAccessCustomer } from "../../auth/customer-auth.js";
import { buildCustomerMonthlyReport } from "../../reports/customer-monthly-report.js";
import { buildCustomerWeeklyReport } from "../../reports/customer-weekly-report.js";
import { recordReportExport } from "../../reports/report-exporter.js";
import { renderReportPdf } from "../../reports/pdf/pdf-renderer.js";
import { logAudit } from "../../provisioning/audit-log.js";
import { sendReportEmail } from "../../notification/channels/email.js";

export const customerReportsRouter = Router();
const auth = [requireAuth("viewer"), requireTenantMatch("customerCode")] as const;

function resolve(req: AuthedRequest, code: string) {
  const customer = getCustomerByCode(code);
  if (!customer) return null;
  if (req.admin && !canAccessCustomer(req.admin, customer.customer_id)) return null;
  return customer;
}

customerReportsRouter.get("/:customerCode/reports/monthly", ...auth, (req: AuthedRequest, res) => {
  const customer = resolve(req, String(req.params.customerCode));
  if (!customer) {
    res.status(403).json({ error: "Denied" });
    return;
  }
  if (!requirePlanFeature(customer.plan, "sales_report", res)) return;
  const report = buildCustomerMonthlyReport(
    customer.customer_code,
    req.admin?.username ?? "system"
  );
  if (!report) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const format = (req.query.format as string) ?? "json";
  if (format === "html") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(report.html);
    return;
  }
  res.json({ ...report.meta, period: report.period, sections: report.sections, pdfTodo: report.pdfTodo });
});

customerReportsRouter.get("/:customerCode/reports/weekly", ...auth, (req: AuthedRequest, res) => {
  const customer = resolve(req, String(req.params.customerCode));
  if (!customer) {
    res.status(403).json({ error: "Denied" });
    return;
  }
  if (!requirePlanFeature(customer.plan, "sales_report", res)) return;
  const report = buildCustomerWeeklyReport(
    customer.customer_code,
    req.admin?.username ?? "system"
  );
  if (!report) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const format = (req.query.format as string) ?? "json";
  if (format === "html") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(report.html);
    return;
  }
  res.json({ ...report.meta, period: report.period, sections: report.sections, pdfTodo: report.pdfTodo });
});

customerReportsRouter.post(
  "/:customerCode/reports/export",
  requireAuth("manager"),
  requireTenantMatch("customerCode"),
  (req: AuthedRequest, res) => {
    const customer = resolve(req, String(req.params.customerCode));
    if (!customer) {
      res.status(403).json({ error: "Denied" });
      return;
    }
    if (!requirePlanFeature(customer.plan, "sales_report", res)) return;
    const reportType = (req.body as { reportType?: string }).reportType ?? "monthly";
    const report =
      reportType === "weekly"
        ? buildCustomerWeeklyReport(customer.customer_code, req.admin!.username)
        : buildCustomerMonthlyReport(customer.customer_code, req.admin!.username);
    if (!report) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const record = recordReportExport(report);
    res.status(201).json({
      export: record,
      export_id: record.export_id,
      htmlLength: report.html.length,
      pdfTodo: report.pdfTodo,
    });
  }
);

customerReportsRouter.post(
  "/:customerCode/reports/send-email",
  requireAuth("manager"),
  requireTenantMatch("customerCode"),
  async (req: AuthedRequest, res) => {
    const customer = resolve(req, String(req.params.customerCode));
    if (!customer) {
      res.status(403).json({ error: "Denied" });
      return;
    }
    if (!requirePlanFeature(customer.plan, "sales_report", res)) return;
    const reportType = (req.body as { reportType?: string }).reportType ?? "monthly";
    const report =
      reportType === "weekly"
        ? buildCustomerWeeklyReport(customer.customer_code, req.admin!.username)
        : buildCustomerMonthlyReport(customer.customer_code, req.admin!.username);
    if (!report) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const record = recordReportExport(report);
    const pdf = await renderReportPdf(report.html, `${customer.customer_name} レポート`);
    const to = (req.body as { to?: string }).to ?? process.env.ADMIN_EMAIL ?? "admin@tisly.jp";
    const htmlBody = `<p>${customer.customer_name} の${reportType === "weekly" ? "週報" : "月報"}をお送りします。</p>${report.html}`;
    const emailResult = await sendReportEmail({
      to,
      subject: `[TiSLY] ${customer.customer_name} ${reportType} report`,
      html: htmlBody,
      attachments: [
        {
          filename: pdf.format === "pdf" ? `${record.export_id}.pdf` : `${record.export_id}.html`,
          content: pdf.buffer,
        },
      ],
    });
    logAudit({
      tenantId: customer.customer_id,
      userId: req.admin!.userId,
      actorLabel: req.admin!.username,
      action: "report.send_email",
      targetType: "report_export",
      targetId: record.export_id,
      afterJson: { to, reportType, emailOk: emailResult.ok, pdfEngine: pdf.engine },
      ipAddress: req.ip,
    });
    res.status(202).json({
      export_id: record.export_id,
      to,
      htmlBodyLength: htmlBody.length,
      pdfAttachment: pdf.format,
      pdfEngine: pdf.engine,
      pdfTodo: pdf.pdfTodo,
      email: emailResult,
      auditLogged: true,
    });
  }
);
