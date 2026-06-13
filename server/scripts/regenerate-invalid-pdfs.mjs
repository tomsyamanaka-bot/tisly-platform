/**
 * 429byte ダミーPDF・白紙PDFを検出して再生成する。
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
    db.prepare("SELECT id FROM business_projects WHERE deleted_at IS NULL").all() as { id: string }[]
  ).map((r) => r.id);
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
        invalid.push({ projectId, full, size: fs.statSync(full).size });
      }
    }
  }
  return invalid;
}

async function main() {
  getDatabase();
  const scanned = scanInvalidPdfFiles();
  console.log(`invalid files on disk: ${scanned.length}`);
  scanned.slice(0, 20).forEach((f) => console.log(`  ${f.projectId} ${path.basename(f.full)} (${f.size} B)`));

  let regenerated = 0;
  let failed = 0;

  for (const projectId of listBusinessProjectIds()) {
    for (const kind of kinds) {
      const filePath = resolveProjectPdfFile(projectId, kind);
      const meta = listProjectPdfsV1(projectId).find((e) => e.kind === kind);
      const hasDbRef = Boolean(meta?.pdfPath);
      const localPath = meta?.pdfPath
        ? path.join(process.cwd(), meta.pdfPath.replace(/^\//, ""))
        : null;
      const needsRegen =
        hasDbRef &&
        (!filePath || (localPath && fs.existsSync(localPath) && !isValidPdfFile(localPath)));

      if (!needsRegen) continue;

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
  }

  console.log(`done: regenerated=${regenerated} failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
