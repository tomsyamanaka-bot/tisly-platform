/**
 * 429byte ダミーPDF・白紙PDFを検出して削除・再生成する。
 * 用法: cd server && node scripts/regenerate-invalid-pdfs.mjs
 */
import fs from "fs";
import path from "path";
import { getDatabase } from "../dist/db/database.js";
import { isValidPdfFile } from "../dist/business/pdf/pdf-validation.js";
import {
  listProjectPdfsV1,
  regenerateProjectPdfV1,
  resolveProjectPdfFile,
} from "../dist/projects/project-pdf-store.js";

const kinds = ["estimate", "invoice", "specification", "report"];

function listBusinessProjectIds() {
  const db = getDatabase();
  return (
    db.prepare("SELECT id FROM business_projects WHERE deleted_at IS NULL").all()
  ).map((r) => r.id);
}

function inferKindFromFileName(name) {
  if (name.startsWith("estimate-")) return "estimate";
  if (name.startsWith("invoice-")) return "invoice";
  if (name.startsWith("specification-")) return "specification";
  if (name.startsWith("completion-report-") || name.startsWith("report-")) return "report";
  return null;
}

function scanInvalidPdfFiles() {
  const root = path.join(process.cwd(), "uploads", "business");
  if (!fs.existsSync(root)) return [];
  const invalid = [];
  for (const projectId of fs.readdirSync(root)) {
    const pdfDir = path.join(root, projectId, "pdfs");
    if (!fs.existsSync(pdfDir)) continue;
    for (const name of fs.readdirSync(pdfDir)) {
      if (!name.endsWith(".pdf")) continue;
      const full = path.join(pdfDir, name);
      if (!isValidPdfFile(full)) {
        invalid.push({
          projectId,
          full,
          name,
          kind: inferKindFromFileName(name),
          size: fs.statSync(full).size,
        });
      }
    }
  }
  return invalid;
}

function deleteInvalidFiles(scanned) {
  let deleted = 0;
  for (const f of scanned) {
    try {
      fs.unlinkSync(f.full);
      deleted++;
      console.log(`  deleted invalid ${f.projectId}/${f.name} (${f.size} B)`);
    } catch (e) {
      console.error(`  delete failed ${f.full}:`, e instanceof Error ? e.message : e);
    }
  }
  return deleted;
}

function collectRegenTargets(scanned) {
  const targets = new Map();
  for (const f of scanned) {
    if (f.kind) targets.set(`${f.projectId}:${f.kind}`, { projectId: f.projectId, kind: f.kind });
  }
  for (const projectId of listBusinessProjectIds()) {
    for (const kind of kinds) {
      const meta = listProjectPdfsV1(projectId).find((e) => e.kind === kind);
      const hasDbRef = Boolean(meta?.pdfPath);
      const localPath = meta?.pdfPath
        ? path.join(process.cwd(), meta.pdfPath.replace(/^\//, ""))
        : null;
      const filePath = resolveProjectPdfFile(projectId, kind);
      const needsRegen =
        hasDbRef &&
        (!filePath || (localPath && fs.existsSync(localPath) && !isValidPdfFile(localPath)));
      if (needsRegen) targets.set(`${projectId}:${kind}`, { projectId, kind });
    }
  }
  return [...targets.values()];
}

async function main() {
  getDatabase();
  const scanned = scanInvalidPdfFiles();
  console.log(`invalid files on disk: ${scanned.length}`);
  scanned.slice(0, 30).forEach((f) =>
    console.log(`  ${f.projectId} ${f.name} (${f.size} B) kind=${f.kind ?? "?"}`)
  );

  const deleted = deleteInvalidFiles(scanned);
  console.log(`deleted invalid files: ${deleted}`);

  const targets = collectRegenTargets(scanned);
  console.log(`regeneration targets: ${targets.length}`);

  let regenerated = 0;
  let failed = 0;

  for (const { projectId, kind } of targets) {
    try {
      console.log(`regenerating ${projectId} ${kind}...`);
      await regenerateProjectPdfV1(projectId, kind);
      const after = resolveProjectPdfFile(projectId, kind);
      if (!after || !isValidPdfFile(after)) {
        throw new Error("still invalid after regenerate");
      }
      regenerated++;
      console.log(`  ok ${path.basename(after)} (${fs.statSync(after).size} B)`);
    } catch (e) {
      failed++;
      console.error(`  failed ${projectId} ${kind}:`, e instanceof Error ? e.message : e);
    }
  }

  const remaining = scanInvalidPdfFiles();
  console.log(
    `done: deleted=${deleted} regenerated=${regenerated} failed=${failed} remaining_invalid=${remaining.length}`
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
