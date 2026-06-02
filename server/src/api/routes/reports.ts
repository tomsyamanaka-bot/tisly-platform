import { Router } from "express";
import { getDatabase } from "../../db/database.js";
import { getRecoveryOverview } from "../../recovery/recovery-engine.js";
import { getQnapIntegrationOverview } from "../../qnap/qnap-client.js";
import { listSites } from "../../provisioning/site-provisioner.js";

export const reportsRouter = Router();

function buildOperationsReport() {
  const db = getDatabase();
  const eventCount = (
    db.prepare("SELECT COUNT(*) as c FROM events").get() as { c: number }
  ).c;
  const deviceCount = (
    db.prepare("SELECT COUNT(*) as c FROM devices").get() as { c: number }
  ).c;
  const sites = listSites();
  return {
    generatedAt: new Date().toISOString(),
    phase: "141-160-rc1",
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

reportsRouter.get("/operations", (req, res) => {
  const format = (req.query.format as string) ?? "json";
  const report = buildOperationsReport();

  if (format === "csv") {
    const lines = [
      "site_id,site_name,tenant_id,status",
      ...report.sites.map(
        (s) => `${s.id},${s.name},${s.tenantId},${s.status}`
      ),
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="tisly-operations.csv"');
    res.send(lines.join("\n"));
    return;
  }

  if (format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="tisly-operations.pdf"');
    const text = `TiSLY Operations Report\nGenerated: ${report.generatedAt}\nSites: ${report.summary.sites}\nDevices: ${report.summary.devices}\nEvents: ${report.summary.events}`;
    const pdf = `%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n4 0 obj<< /Length ${text.length + 50} >>stream\nBT /F1 12 Tf 50 700 Td (${text.replace(/\n/g, ") Tj 0 -14 Td (")}) Tj ET\nendstream\nendobj\n5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\nxref\n0 6\ntrailer<< /Size 6 /Root 1 0 R >>\nstartxref\n0\n%%EOF`;
    res.send(pdf);
    return;
  }

  res.json(report);
});

reportsRouter.get("/sales", (_req, res) => {
  const db = getDatabase();
  const recent = db
    .prepare(
      `SELECT event_type, severity, message, site_id, created_at FROM events ORDER BY created_at DESC LIMIT 20`
    )
    .all();
  res.json({
    title: "TiSLY セキュリティ運用レポート（顧客提出用）",
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
