/**
 * お客様 PDF / 写真一元管理 — /customer-files/ 配下
 * 種別: estimate · invoice · specification · completion · inspection
 */

import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../../db/database.js";
import { findBusinessProjectByRefV1 } from "../../knowledge/knowledge-business-projects-adapter-v1.js";
import {
  listProjectPdfsV1,
  resolveProjectPdfFile,
  type ProjectPdfKind,
} from "../../projects/project-pdf-store.js";

export type CustomerFileDocTypeV1 =
  | "estimate"
  | "invoice"
  | "specification"
  | "completion"
  | "inspection";

export type CustomerPortalFileKindV1 =
  | "survey_photo"
  | "before_photo"
  | "during_photo"
  | "after_photo"
  | "memo_photo"
  | CustomerFileDocTypeV1;

export interface CustomerPortalFileRecordV1 {
  fileId: string;
  title: string;
  safeLabel: string;
  type: CustomerPortalFileKindV1;
  category: string;
  previewUrl?: string;
  openUrl: string;
  capturedAt?: string;
  sortOrder: number;
}

export interface CustomerPortalDocumentRowV1 {
  id: string;
  customerCode: string;
  propertyId: string | null;
  projectRef: string;
  docType: CustomerFileDocTypeV1;
  fileName: string;
  relativePath: string;
  label: string;
}

const DOC_TYPE_LABELS: Record<CustomerFileDocTypeV1, string> = {
  estimate: "見積書",
  invoice: "請求書",
  specification: "仕様書",
  completion: "完了報告書",
  inspection: "点検報告書",
};

const PDF_KIND_MAP: Record<ProjectPdfKind, CustomerFileDocTypeV1> = {
  estimate: "estimate",
  invoice: "invoice",
  specification: "specification",
  report: "completion",
};

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function customerFilesRoot(): string {
  return path.join(process.cwd(), "customer-files");
}

function publicUrl(relativePath: string): string {
  return `/customer-files/${relativePath.replace(/\\/g, "/")}`;
}

function portalFileUrl(shareId: string, fileId: string): string {
  return `/api/customer-portal/v1/file/${encodeURIComponent(shareId)}/${encodeURIComponent(fileId)}`;
}

export function buildPortalFileApiUrlV1(shareId: string, fileId: string): string {
  return portalFileUrl(shareId, fileId);
}

function inferPhotoType(relPath: string): CustomerPortalFileKindV1 {
  const lower = relPath.toLowerCase();
  if (lower.includes("before") || lower.includes("施工前")) return "before_photo";
  if (lower.includes("during") || lower.includes("施工中")) return "during_photo";
  if (lower.includes("after") || lower.includes("施工後") || lower.includes("completion")) return "after_photo";
  if (lower.includes("survey") || lower.includes("現調")) return "survey_photo";
  return "memo_photo";
}

function rowToDocument(row: Record<string, unknown>): CustomerPortalDocumentRowV1 {
  return {
    id: String(row.id),
    customerCode: String(row.customer_code),
    propertyId: row.property_id != null ? String(row.property_id) : null,
    projectRef: String(row.project_ref),
    docType: String(row.doc_type) as CustomerFileDocTypeV1,
    fileName: String(row.file_name),
    relativePath: String(row.relative_path),
    label: String(row.label ?? ""),
  };
}

export function countCustomerPortalDocumentsV1(): number {
  const row = getDatabase()
    .prepare(`SELECT COUNT(*) AS c FROM customer_portal_documents`)
    .get() as { c: number };
  return row.c;
}

export function listDocumentsForProjectRefV1(projectRef: string): CustomerPortalDocumentRowV1[] {
  const ref = String(projectRef ?? "").trim();
  return (
    getDatabase()
      .prepare(`SELECT * FROM customer_portal_documents WHERE project_ref = ? ORDER BY doc_type ASC`)
      .all(ref) as Array<Record<string, unknown>>
  ).map(rowToDocument);
}

export function upsertCustomerPortalDocumentV1(input: {
  customerCode: string;
  propertyId?: string | null;
  projectRef: string;
  docType: CustomerFileDocTypeV1;
  fileName: string;
  relativePath: string;
  label?: string;
}): CustomerPortalDocumentRowV1 {
  const existing = getDatabase()
    .prepare(
      `SELECT id FROM customer_portal_documents WHERE project_ref = ? AND doc_type = ? LIMIT 1`
    )
    .get(input.projectRef, input.docType) as { id: string } | undefined;

  const id = existing?.id ?? `DOC-${uuid().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO customer_portal_documents
       (id, customer_code, property_id, project_ref, doc_type, file_name, relative_path, label, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         file_name = excluded.file_name,
         relative_path = excluded.relative_path,
         label = excluded.label,
         updated_at = excluded.updated_at`
    )
    .run(
      id,
      input.customerCode.toUpperCase(),
      input.propertyId ?? null,
      input.projectRef,
      input.docType,
      input.fileName,
      input.relativePath,
      input.label ?? DOC_TYPE_LABELS[input.docType],
      now,
      now
    );
  const row = getDatabase()
    .prepare(`SELECT * FROM customer_portal_documents WHERE id = ?`)
    .get(id) as Record<string, unknown>;
  return rowToDocument(row);
}

/** business PDF → customer-files へコピー登録 */
export function syncProjectPdfsToCustomerFilesV1(
  customerCode: string,
  projectRef: string,
  propertyId?: string | null
): number {
  const project = findBusinessProjectByRefV1(projectRef);
  if (!project) return 0;

  const destBase = path.join(customerFilesRoot(), customerCode.toUpperCase(), projectRef);
  let synced = 0;

  for (const entry of listProjectPdfsV1(project.id)) {
    if (!entry.exists) continue;
    const docType = PDF_KIND_MAP[entry.kind];
    if (!docType) continue;

    const localPath = resolveProjectPdfFile(project.id, entry.kind);
    if (!localPath || !fs.existsSync(localPath)) continue;

    const destDir = path.join(destBase, docType);
    fs.mkdirSync(destDir, { recursive: true });
    const fileName = path.basename(localPath);
    const destPath = path.join(destDir, fileName);
    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(localPath, destPath);
    }

    const relativePath = path.relative(customerFilesRoot(), destPath).replace(/\\/g, "/");
    upsertCustomerPortalDocumentV1({
      customerCode,
      propertyId,
      projectRef,
      docType,
      fileName,
      relativePath,
      label: DOC_TYPE_LABELS[docType],
    });
    synced += 1;
  }
  return synced;
}

function scanCustomerFilesPhotos(
  customerCode: string,
  projectRef: string,
  shareId: string
): CustomerPortalFileRecordV1[] {
  const base = path.join(customerFilesRoot(), customerCode.toUpperCase());
  if (!fs.existsSync(base)) return [];

  const records: CustomerPortalFileRecordV1[] = [];
  let order = 0;

  function walk(dir: string): void {
    for (const name of fs.readdirSync(dir).sort((a, b) => a.localeCompare(b, "ja"))) {
      const abs = path.join(dir, name);
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) {
        walk(abs);
        continue;
      }
      const ext = path.extname(name).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) continue;
      const rel = path.relative(customerFilesRoot(), abs).replace(/\\/g, "/");
      if (projectRef && !rel.includes(projectRef)) continue;
      order += 1;
      const fileId = `photo-${Buffer.from(rel, "utf-8").toString("base64url")}`;
      const openUrl = publicUrl(rel);
      records.push({
        fileId,
        title: path.basename(name, ext).replace(/_/g, " "),
        safeLabel: path.basename(name, ext).replace(/_/g, " "),
        type: inferPhotoType(rel),
        category: "工事写真",
        previewUrl: openUrl,
        openUrl,
        capturedAt: stat.mtime.toISOString(),
        sortOrder: order,
      });
    }
  }

  walk(base);
  return records;
}

function documentsToFileRecords(
  docs: CustomerPortalDocumentRowV1[],
  shareId: string
): CustomerPortalFileRecordV1[] {
  return docs.map((d, idx) => {
    const staticUrl = publicUrl(d.relativePath);
    const fileId = `doc-${d.docType}`;
    return {
      fileId,
      title: d.label || DOC_TYPE_LABELS[d.docType],
      safeLabel: d.label || DOC_TYPE_LABELS[d.docType],
      type: d.docType,
      category: DOC_TYPE_LABELS[d.docType],
      openUrl: portalFileUrl(shareId, fileId),
      previewUrl: staticUrl,
      sortOrder: 100 + idx,
    };
  });
}

export function listCustomerPortalFilesV1(opts: {
  customerCode: string;
  projectRef: string;
  shareId: string;
}): CustomerPortalFileRecordV1[] {
  const docs = listDocumentsForProjectRefV1(opts.projectRef);
  const pdfRecords = documentsToFileRecords(docs, opts.shareId);
  const photos = scanCustomerFilesPhotos(opts.customerCode, opts.projectRef, opts.shareId);
  return [...photos, ...pdfRecords].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function resolveCustomerPortalFileV1(
  projectRef: string,
  fileId: string
): { absolutePath: string; contentType: string; downloadName: string } | null {
  if (fileId.startsWith("photo-")) {
    const encoded = fileId.replace(/^photo-/, "");
    let rel: string;
    try {
      rel = Buffer.from(encoded, "base64url").toString("utf-8");
    } catch {
      rel = encoded.replace(/-/g, "/");
    }
    const abs = path.normalize(path.join(customerFilesRoot(), rel));
    const root = path.normalize(customerFilesRoot());
    if (!abs.startsWith(root) || !fs.existsSync(abs)) return null;
    const ext = path.extname(abs).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return { absolutePath: abs, contentType, downloadName: path.basename(abs) };
  }

  const docType = fileId.replace(/^doc-/, "") as CustomerFileDocTypeV1;
  const doc = listDocumentsForProjectRefV1(projectRef).find((d) => d.docType === docType);
  if (!doc) return null;
  const abs = path.normalize(path.join(customerFilesRoot(), doc.relativePath));
  const root = path.normalize(customerFilesRoot());
  if (!abs.startsWith(root) || !fs.existsSync(abs)) return null;
  return {
    absolutePath: abs,
    contentType: "application/pdf",
    downloadName: doc.fileName,
  };
}

export { DOC_TYPE_LABELS as CUSTOMER_FILE_DOC_LABELS_V1 };

const DEMO_PDF_REFS: Record<
  string,
  { customerCode: string; propertyId: string; docs: CustomerFileDocTypeV1[] }
> = {
  "DEMO-HOME-001": {
    customerCode: "TOMS001",
    propertyId: "PROP-DEMOHOME001",
    docs: ["estimate", "invoice", "completion", "specification"],
  },
};

function writeMinimalDemoPdf(destPath: string, title: string): void {
  const safeTitle = title.replace(/[^\u0020-\u007e\u3040-\u30ff\u4e00-\u9faf]/g, " ").slice(0, 40);
  const stream = `BT /F1 18 Tf 72 720 Td (${safeTitle}) Tj ET`;
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>>>>>>>>endobj
4 0 obj<</Length ${stream.length}>>stream
${stream}
endstream endobj
xref
0 5
0000000000 65535 f 
trailer<</Size 5/Root 1 0 R>>
startxref
9
%%EOF`;
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, pdf, "utf-8");
}

/** business 案件が無いデモ ref 向けに customer-files PDF を保証 */
export function ensureDemoCustomerPortalDocumentsV1(
  customerCode: string,
  projectRef: string,
  propertyId?: string | null
): number {
  const demo = DEMO_PDF_REFS[projectRef];
  if (!demo || demo.customerCode !== customerCode.toUpperCase()) return 0;

  let ensured = 0;
  for (const docType of demo.docs) {
    const existing = listDocumentsForProjectRefV1(projectRef).find((d) => d.docType === docType);
    const fileName = `${docType}-demo.pdf`;
    const destPath = path.join(
      customerFilesRoot(),
      customerCode.toUpperCase(),
      projectRef,
      docType,
      fileName
    );
    if (!existing || !fs.existsSync(path.join(customerFilesRoot(), existing.relativePath))) {
      writeMinimalDemoPdf(destPath, DOC_TYPE_LABELS[docType]);
      const relativePath = path.relative(customerFilesRoot(), destPath).replace(/\\/g, "/");
      upsertCustomerPortalDocumentV1({
        customerCode,
        propertyId: propertyId ?? demo.propertyId,
        projectRef,
        docType,
        fileName,
        relativePath,
        label: DOC_TYPE_LABELS[docType],
      });
      ensured += 1;
    }
  }
  return ensured;
}
