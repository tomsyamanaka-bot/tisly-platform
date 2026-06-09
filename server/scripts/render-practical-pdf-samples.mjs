/**
 * Renders sample specification / completion-report HTML for layout comparison.
 * Usage: node scripts/render-practical-pdf-samples.mjs [outputDir]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] || path.join(__dirname, "../data/pdf-layout-samples");
fs.mkdirSync(outDir, { recursive: true });

const samplePhoto =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC";

const photos = Array.from({ length: 6 }, (_, i) => ({
  url: samplePhoto,
  title: `写真${i + 1}`,
}));

const specCtx = {
  addressee: "株式会社サンプル 御中",
  subject: "防犯カメラ設置工事",
  siteName: "本社ビル1F",
  workLocation: "兵庫県神戸市中央区〇〇町1-2-3",
  issueDate: "2026-06-09",
  staffName: "山田太郎",
  photos,
};

const crCtx = {
  projectNo: "P-2026-0609",
  addressee: "株式会社サンプル 御中",
  subject: "防犯カメラ設置工事",
  siteName: "本社ビル1F",
  workLocation: "兵庫県神戸市中央区〇〇町1-2-3",
  issueDate: "2026-06-09",
  staffName: "山田太郎",
  photos,
};

const { renderSpecificationHtml } = await import("../dist/estimate/specification-template.js");
const { renderPracticalCompletionReportHtml } = await import(
  "../dist/estimate/practical-completion-report-template.js"
);

const specHtml = renderSpecificationHtml(specCtx);
const crHtml = renderPracticalCompletionReportHtml(crCtx);

const label = process.env.PDF_SAMPLE_LABEL || "after";
fs.writeFileSync(path.join(outDir, `${label}-specification.html`), specHtml, "utf8");
fs.writeFileSync(path.join(outDir, `${label}-completion-report.html`), crHtml, "utf8");
console.log(`Wrote ${label} samples to ${outDir}`);
