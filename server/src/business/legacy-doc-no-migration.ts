/**
 * 旧形式見積番号・請求番号 → TOMS 標準番号への移行
 *
 * 旧見積: {projectNo}-001 / MO-26-0619-001-001 / 260608-001 等
 * 新見積: MO-26-0619-001
 * 新請求: INV-MO-26-0619-001
 */
import type Database from "better-sqlite3";
import {
  generateTomsEstimateNo,
  generateTomsInvoiceNo,
  isTomsEstimateNo,
  isTomsInvoiceNo,
  parseEstimateHeaderJson,
} from "./toms-document-format.js";
import { resolveCityCodeForDocNo } from "../projects/project-id-v1.js";

export interface LegacyDocNoMigrationReportV1 {
  estimate: {
    beforeLegacyCount: number;
    migratedCount: number;
    skippedAlreadyToms: number;
    afterLegacyCount: number;
    examples: Array<{ oldNo: string; newNo: string; projectId: string }>;
  };
  invoice: {
    beforeLegacyCount: number;
    migratedCount: number;
    skippedAlreadyToms: number;
    afterLegacyCount: number;
    examples: Array<{ oldNo: string; newNo: string; projectId: string }>;
  };
  migratedAt: string;
}

/** TOMS 見積番号以外は旧形式とみなす */
export function isLegacyEstimateNo(value: string): boolean {
  const v = String(value || "").trim();
  if (!v) return false;
  return !isTomsEstimateNo(v);
}

/** TOMS 請求番号以外は旧形式とみなす */
export function isLegacyInvoiceNo(value: string): boolean {
  const v = String(value || "").trim();
  if (!v) return false;
  return !isTomsInvoiceNo(v);
}

function parseIsoDate(raw: string | null | undefined): Date {
  const d = new Date(String(raw || ""));
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function collectUsedEstimateNos(database: Database.Database): Set<string> {
  const rows = database
    .prepare(`SELECT estimate_no AS no FROM business_estimates WHERE estimate_no IS NOT NULL AND estimate_no != ''`)
    .all() as { no: string }[];
  return new Set(rows.map((r) => String(r.no)));
}

function collectUsedInvoiceNos(database: Database.Database): Set<string> {
  const rows = database
    .prepare(`SELECT invoice_no AS no FROM business_invoices WHERE invoice_no IS NOT NULL AND invoice_no != ''`)
    .all() as { no: string }[];
  return new Set(rows.map((r) => String(r.no)));
}

function allocateTomsEstimateNo(
  database: Database.Database,
  input: { municipality?: string; address?: string; cityCode?: string },
  at: Date,
  reserved: Set<string>
): string {
  const cityCode = resolveCityCodeForDocNo(input);
  const yy = String(at.getFullYear()).slice(-2);
  const mm = String(at.getMonth() + 1).padStart(2, "0");
  const dd = String(at.getDate()).padStart(2, "0");
  const prefix = `${cityCode}-${yy}-${mm}${dd}`;
  const pattern = `${prefix}-%`;
  const rows = database
    .prepare(`SELECT estimate_no AS no FROM business_estimates WHERE estimate_no LIKE ?`)
    .all(pattern) as { no: string }[];
  let maxSeq = 0;
  for (const row of rows) {
    const no = String(row.no);
    if (!isTomsEstimateNo(no)) continue;
    const m = no.match(/-(\d{3})$/);
    if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
  }
  for (const no of reserved) {
    if (!no.startsWith(`${prefix}-`)) continue;
    const m = no.match(/-(\d{3})$/);
    if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
  }
  let seq = maxSeq + 1;
  while (seq < 1000) {
    const candidate = `${prefix}-${String(seq).padStart(3, "0")}`;
    if (!reserved.has(candidate)) {
      reserved.add(candidate);
      return candidate;
    }
    seq += 1;
  }
  throw new Error(`estimate number exhausted for ${prefix}`);
}

function allocateTomsInvoiceNo(
  database: Database.Database,
  input: { municipality?: string; address?: string; cityCode?: string },
  at: Date,
  reserved: Set<string>
): string {
  const cityCode = resolveCityCodeForDocNo(input);
  const yy = String(at.getFullYear()).slice(-2);
  const mm = String(at.getMonth() + 1).padStart(2, "0");
  const dd = String(at.getDate()).padStart(2, "0");
  const prefix = `INV-${cityCode}-${yy}-${mm}${dd}`;
  const pattern = `${prefix}-%`;
  const rows = database
    .prepare(`SELECT invoice_no AS no FROM business_invoices WHERE invoice_no LIKE ?`)
    .all(pattern) as { no: string }[];
  let maxSeq = 0;
  for (const row of rows) {
    const no = String(row.no);
    if (!isTomsInvoiceNo(no)) continue;
    const m = no.match(/-(\d{3})$/);
    if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
  }
  for (const no of reserved) {
    if (!no.startsWith(`${prefix}-`)) continue;
    const m = no.match(/-(\d{3})$/);
    if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
  }
  let seq = maxSeq + 1;
  while (seq < 1000) {
    const candidate = `${prefix}-${String(seq).padStart(3, "0")}`;
    if (!reserved.has(candidate)) {
      reserved.add(candidate);
      return candidate;
    }
    seq += 1;
  }
  throw new Error(`invoice number exhausted for ${prefix}`);
}

function countLegacyEstimates(database: Database.Database): number {
  const rows = database
    .prepare(`SELECT estimate_no AS no FROM business_estimates WHERE estimate_no IS NOT NULL AND estimate_no != ''`)
    .all() as { no: string }[];
  return rows.filter((r) => isLegacyEstimateNo(String(r.no))).length;
}

function countLegacyInvoices(database: Database.Database): number {
  const rows = database
    .prepare(`SELECT invoice_no AS no FROM business_invoices WHERE invoice_no IS NOT NULL AND invoice_no != ''`)
    .all() as { no: string }[];
  return rows.filter((r) => isLegacyInvoiceNo(String(r.no))).length;
}

function updateEstimateHeaderJson(raw: string | null, newNo: string): string | null {
  if (!raw) return raw;
  try {
    const header = JSON.parse(raw) as Record<string, unknown>;
    header.estimateNo = newNo;
    return JSON.stringify(header);
  } catch {
    return raw;
  }
}

function updateSearchIndexEstimateNo(raw: string | null, newNo: string): string | null {
  if (!raw) return raw;
  try {
    const index = JSON.parse(raw) as Record<string, unknown>;
    if ("estimateNo" in index) index.estimateNo = newNo;
    return JSON.stringify(index);
  } catch {
    return raw;
  }
}

export function migrateLegacyDocNumbersV1(database: Database.Database): LegacyDocNoMigrationReportV1 {
  const estimateBefore = countLegacyEstimates(database);
  const invoiceBefore = countLegacyInvoices(database);
  const estimateExamples: LegacyDocNoMigrationReportV1["estimate"]["examples"] = [];
  const invoiceExamples: LegacyDocNoMigrationReportV1["invoice"]["examples"] = [];
  let estimateMigrated = 0;
  let invoiceMigrated = 0;

  const estimateReserved = collectUsedEstimateNos(database);
  const estimateRows = database
    .prepare(
      `SELECT e.id, e.project_id, e.estimate_no, e.header_json, e.search_index_json, e.created_at,
              p.address, p.municipality
       FROM business_estimates e
       LEFT JOIN business_projects p ON p.id = e.project_id
       ORDER BY e.created_at ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const updateEstimate = database.prepare(
    `UPDATE business_estimates SET estimate_no = ?, header_json = ?, search_index_json = ?, updated_at = datetime('now') WHERE id = ?`
  );
  const updateInvoiceRef = database.prepare(
    `UPDATE business_invoices SET estimate_ref_no = ?, updated_at = datetime('now') WHERE estimate_ref_no = ?`
  );
  const updateTimeline = database.prepare(
    `UPDATE project_timeline_events SET description = ? WHERE event_type = 'estimate_created' AND description = ?`
  );

  for (const row of estimateRows) {
    const oldNo = String(row.estimate_no ?? "").trim();
    if (!oldNo || !isLegacyEstimateNo(oldNo)) continue;

    estimateReserved.delete(oldNo);
    const at = parseIsoDate(row.created_at != null ? String(row.created_at) : null);
    const newNo = allocateTomsEstimateNo(
      database,
      {
        address: row.address != null ? String(row.address) : undefined,
        municipality: row.municipality != null ? String(row.municipality) : undefined,
      },
      at,
      estimateReserved
    );

    const headerJson = updateEstimateHeaderJson(
      row.header_json != null ? String(row.header_json) : null,
      newNo
    );
    const searchJson = updateSearchIndexEstimateNo(
      row.search_index_json != null ? String(row.search_index_json) : null,
      newNo
    );

    updateEstimate.run(newNo, headerJson, searchJson, String(row.id));
    updateInvoiceRef.run(newNo, oldNo);
    updateTimeline.run(newNo, oldNo);
    estimateMigrated += 1;
    if (estimateExamples.length < 5) {
      estimateExamples.push({
        oldNo,
        newNo,
        projectId: String(row.project_id),
      });
    }
  }

  const invoiceReserved = collectUsedInvoiceNos(database);
  const invoiceRows = database
    .prepare(
      `SELECT i.id, i.project_id, i.invoice_no, i.created_at, p.address, p.municipality
       FROM business_invoices i
       LEFT JOIN business_projects p ON p.id = i.project_id
       ORDER BY i.created_at ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const updateInvoice = database.prepare(
    `UPDATE business_invoices SET invoice_no = ?, updated_at = datetime('now') WHERE id = ?`
  );
  const updateInvoiceTimeline = database.prepare(
    `UPDATE project_timeline_events SET description = ? WHERE event_type = 'invoice_created' AND description = ?`
  );

  for (const row of invoiceRows) {
    const oldNo = String(row.invoice_no ?? "").trim();
    if (!oldNo || !isLegacyInvoiceNo(oldNo)) continue;

    invoiceReserved.delete(oldNo);
    const at = parseIsoDate(row.created_at != null ? String(row.created_at) : null);
    const newNo = allocateTomsInvoiceNo(
      database,
      {
        address: row.address != null ? String(row.address) : undefined,
        municipality: row.municipality != null ? String(row.municipality) : undefined,
      },
      at,
      invoiceReserved
    );

    updateInvoice.run(newNo, String(row.id));
    updateInvoiceTimeline.run(newNo, oldNo);
    invoiceMigrated += 1;
    if (invoiceExamples.length < 5) {
      invoiceExamples.push({
        oldNo,
        newNo,
        projectId: String(row.project_id),
      });
    }
  }

  const allEstimates = database
    .prepare(`SELECT estimate_no AS no FROM business_estimates WHERE estimate_no IS NOT NULL AND estimate_no != ''`)
    .all() as { no: string }[];
  const allInvoices = database
    .prepare(`SELECT invoice_no AS no FROM business_invoices WHERE invoice_no IS NOT NULL AND invoice_no != ''`)
    .all() as { no: string }[];

  return {
    estimate: {
      beforeLegacyCount: estimateBefore,
      migratedCount: estimateMigrated,
      skippedAlreadyToms: allEstimates.filter((r) => isTomsEstimateNo(String(r.no))).length,
      afterLegacyCount: countLegacyEstimates(database),
      examples: estimateExamples,
    },
    invoice: {
      beforeLegacyCount: invoiceBefore,
      migratedCount: invoiceMigrated,
      skippedAlreadyToms: allInvoices.filter((r) => isTomsInvoiceNo(String(r.no))).length,
      afterLegacyCount: countLegacyInvoices(database),
      examples: invoiceExamples,
    },
    migratedAt: new Date().toISOString(),
  };
}

/** DB 起動時 — 1 回だけ実行 */
export function migrateLegacyDocNumbersIfNeededV1(database: Database.Database): LegacyDocNoMigrationReportV1 | null {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:legacy_doc_no_toms_v1") as { value_json: string } | undefined;
  if (marker) return null;

  const report = migrateLegacyDocNumbersV1(database);
  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:legacy_doc_no_toms_v1", JSON.stringify(report));
  return report;
}
