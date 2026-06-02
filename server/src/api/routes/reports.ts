import { Router } from "express";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../../db/database.js";
import { getRecoveryOverview } from "../../recovery/recovery-engine.js";
import { getQnapIntegrationOverview } from "../../qnap/qnap-client.js";
import { listSites } from "../../provisioning/site-provisioner.js";
import { auditContextFromRequest, logAudit } from "../../provisioning/audit-log.js";
import type { AuthedRequest } from "../../auth/auth-middleware.js";
import { config } from "../../config.js";

export const reportsRouter = Router();

function recordExport(
  req: AuthedRequest,
  meta: {
    format: string;
    tenantId?: string;
    siteId?: string;
  }
): string {
  const exportId = uuid();
  const generatedBy = req.admin?.username ?? req.admin?.userId ?? "system";
  const generatedAt = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO report_exports (id, tenant_id, site_id, format, generated_by, generated_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      exportId,
      meta.tenantId ?? config.defaultTenantId,
      meta.siteId ?? null,
      meta.format,
      generatedBy,
      generatedAt,
      JSON.stringify({ exportId, generatedBy, generatedAt })
    );
  logAudit({
    userId: req.admin?.userId,
    actorLabel: generatedBy,
    tenantId: meta.tenantId,
    siteId: meta.siteId,
    action: "report.export",
    targetType: "report",
    targetId: exportId,
    afterJson: { format: meta.format, exportId, generatedAt },
    ...auditContextFromRequest(req),
  });
  return exportId;
}

function buildOperationsReport(exportMeta: {
  exportId: string;
  generatedBy: string;
  generatedAt: string;
  tenantId: string;
  siteId?: string;
}) {
  const db = getDatabase();
  const eventCount = (
    db.prepare("SELECT COUNT(*) as c FROM events").get() as { c: number }
  ).c;
  const deviceCount = (
    db.prepare("SELECT COUNT(*) as c FROM devices").get() as { c: number }
  ).c;
  const sites = listSites();
  return {
    exportId: exportMeta.exportId,
    generatedBy: exportMeta.generatedBy,
    generatedAt: exportMeta.generatedAt,
    tenantId: exportMeta.tenantId,
    siteId: exportMeta.siteId ?? null,
    phase: "161-180-security-rc1",
    summary: {
      sites: sites.length,
      devices: deviceCount,
      events: eventCount,
    },
    sites,
    recovery: getRecoveryOverview(),
    qnap: getQnapIntegrationOverview(),
  };
}

reportsRouter.get("/operations", (req: AuthedRequest, res) => {
  const format = (req.query.format as string) ?? "json";
  const tenantId = (req.query.tenantId as string) ?? config.defaultTenantId;
  const siteId = req.query.siteId as string | undefined;
  const exportId = recordExport(req, { format, tenantId, siteId });
  const generatedBy = req.admin?.username ?? "admin";
  const generatedAt = new Date().toISOString();
  const report = buildOperationsReport({
    exportId,
    generatedBy,
    generatedAt,
    tenantId,
    siteId,
  });

  if (format === "csv") {
    const lines = [
      `# export_id,${exportId}`,
      `# tenant_id,${tenantId}`,
      `# site_id,${siteId ?? ""}`,
      `# generated_by,${generatedBy}`,
      `# generated_at,${generatedAt}`,
      "site_id,site_name,tenant_id,status",
      ...report.sites.map(
        (s) => `${s.id},${s.name},${s.tenantId},${s.status}`
      ),
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="tisly-operations-${exportId.slice(0, 8)}.csv"`);
    res.send(lines.join("\n"));
    return;
  }

  if (format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="tisly-operations-${exportId.slice(0, 8)}.pdf"`
    );
    const text = `TiSLY Operations Report\nExport: ${exportId}\nTenant: ${tenantId}\nBy: ${generatedBy}\nGenerated: ${generatedAt}\nSites: ${report.summary.sites}\nDevices: ${report.summary.devices}\nEvents: ${report.summary.events}`;
    const pdf = `%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n4 0 obj<< /Length ${text.length + 50} >>stream\nBT /F1 12 Tf 50 700 Td (${text.replace(/\n/g, ") Tj 0 -14 Td (")}) Tj ET\nendstream\nendobj\n5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\nxref\n0 6\ntrailer<< /Size 6 /Root 1 0 R >>\nstartxref\n0\n%%EOF`;
    res.send(pdf);
    return;
  }

  res.json(report);
});

reportsRouter.get("/sales", (req: AuthedRequest, res) => {
  const db = getDatabase();
  const exportId = recordExport(req, { format: "json", tenantId: config.defaultTenantId });
  const recent = db
    .prepare(
      `SELECT event_type, severity, message, site_id, created_at FROM events ORDER BY created_at DESC LIMIT 20`
    )
    .all();
  res.json({
    title: "TiSLY セキュリティ運用レポート（顧客提出用）",
    exportId,
    tenantId: config.defaultTenantId,
    generatedBy: req.admin?.username,
    generatedAt: new Date().toISOString(),
    highlights: [
      "AI リスクスコアによる異常検知",
      "自律復旧エンジンによる SLA 管理",
      "マルチ現場・マルチテナント対応",
      "Google TV / PWA / 実機統合",
    ],
    recentEvents: recent,
    formats: ["json", "csv", "pdf"],
  });
});
