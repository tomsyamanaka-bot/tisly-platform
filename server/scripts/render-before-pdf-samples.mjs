import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { execSync } from "child_process";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "../..");
const outDir = path.join(__dirname, "../data/pdf-layout-samples");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tisly-before-pdf-"));

for (const file of [
  "server/src/estimate/specification-template.ts",
  "server/src/estimate/practical-completion-report-template.ts",
  "server/src/business/pdf/shared-blocks.ts",
  "server/src/business/pdf/company.ts",
]) {
  const target = path.join(tmpDir, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const content = execSync(`git show HEAD:${file}`, { cwd: repoRoot, encoding: "utf8" });
  fs.writeFileSync(target, content, "utf8");
}

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
  siteName: "本社ビル1F",
  workLocation: "兵庫県神戸市中央区〇〇町1-2-3",
  workDate: "2026-06-09",
  staffName: "山田太郎",
  photos,
};

const specMod = await import(pathToFileURL(path.join(tmpDir, "server/src/estimate/specification-template.ts")).href);
const crMod = await import(pathToFileURL(path.join(tmpDir, "server/src/estimate/practical-completion-report-template.ts")).href);

fs.writeFileSync(path.join(outDir, "before-specification.html"), specMod.renderSpecificationHtml(specCtx), "utf8");
fs.writeFileSync(path.join(outDir, "before-completion-report.html"), crMod.renderPracticalCompletionReportHtml(crCtx), "utf8");
console.log("Regenerated true before samples");
