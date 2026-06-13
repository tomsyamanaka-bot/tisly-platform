/**
 * TOMS 実務帳票サンプル PDF 生成（仕様書・完了報告書）
 * Usage: npx tsx scripts/generate-toms-document-samples.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../data/toms-document-samples");
fs.mkdirSync(outDir, { recursive: true });

const portraitSample =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1600"><rect fill="#e2e8f0" width="100%" height="100%"/><text x="50%" y="48%" text-anchor="middle" font-size="48" fill="#475569">縦写真</text></svg>`
  ).toString("base64");

const landscapeSample =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect fill="#cbd5e1" width="100%" height="100%"/><text x="50%" y="48%" text-anchor="middle" font-size="48" fill="#475569">横写真</text></svg>`
  ).toString("base64");

function mixedPhotos(count) {
  const titles = [
    "施工前",
    "施工後",
    "カメラ設置",
    "録画機設置",
    "LAN配線",
    "完成",
    "配電盤",
    "屋外カメラ",
    "NVR設置",
    "モニター",
    "配線通路",
    "完成全景",
  ];
  return Array.from({ length: count }, (_, i) => ({
    url: i % 2 === 0 ? portraitSample : landscapeSample,
    title: titles[i] ?? `写真${i + 1}`,
  }));
}

const baseSpec = {
  projectNo: "PRJ-2026-0012",
  addressee: "株式会社サンプル 御中",
  subject: "防犯カメラ・LAN配線工事",
  siteName: "本社ビル1F",
  workLocation: "兵庫県神戸市中央区〇〇町1-2-3",
  issueDate: "2026/06/13",
  staffName: "山中 智紀",
  generatedAt: "2026-06-13T17:00:00+09:00",
  systemConfig: "防犯カメラ / LAN",
  equipmentList: "・防犯カメラ: 屋外カメラ200万 × 4\n・LAN: Cat6ケーブル × 120m\n・NVR: 4ch録画機 × 1",
  wiringSummary: "・LAN: Cat6ケーブル × 120m",
  ipList: "192.168.1.10 — NVR\n192.168.1.11〜14 — カメラ1〜4",
  installationLocations: "・施工前\n・施工後\n・カメラ設置\n・録画機設置\n・LAN配線\n・完成",
};

const baseCr = {
  projectNo: "PRJ-2026-0012",
  addressee: "株式会社サンプル 御中",
  subject: "防犯カメラ・LAN配線工事",
  siteName: "本社ビル1F",
  workLocation: "兵庫県神戸市中央区〇〇町1-2-3",
  issueDate: "2026/06/13",
  workDate: "2026/06/13",
  staffName: "山中 智紀",
  startTime: "09:00",
  endTime: "17:00",
  workContent: "防犯カメラ / LAN",
  materialsUsed: "・防犯カメラ: 屋外カメラ200万 × 4\n・LAN: Cat6ケーブル × 120m",
  notes: "顧客立会いのもと完了確認済み",
  generatedAt: "2026-06-13T17:00:00+09:00",
};

const srcRoot = path.join(__dirname, "../src");
const { renderSpecificationHtml } = await import(
  pathToFileURL(path.join(srcRoot, "estimate/specification-template.ts")).href
);
const { renderPracticalCompletionReportHtml } = await import(
  pathToFileURL(path.join(srcRoot, "estimate/practical-completion-report-template.ts")).href
);
const { renderWithPdfFallback } = await import(
  pathToFileURL(path.join(srcRoot, "business/pdf/render.ts")).href
);

async function writePdf(html, title, fileName) {
  const { pdfBuf } = await renderWithPdfFallback(html, title);
  const dest = path.join(outDir, fileName);
  fs.writeFileSync(dest, pdfBuf);
  console.log(`Wrote ${dest} (${pdfBuf.length} bytes)`);
}

await writePdf(
  renderSpecificationHtml({ ...baseSpec, photos: mixedPhotos(4) }),
  "仕様書4枚",
  "specification-4photos.pdf"
);
await writePdf(
  renderSpecificationHtml({ ...baseSpec, photos: mixedPhotos(6) }),
  "仕様書サンプル",
  "specification-6photos.pdf"
);
await writePdf(
  renderSpecificationHtml({ ...baseSpec, photos: mixedPhotos(12) }),
  "仕様書12枚",
  "specification-12photos.pdf"
);
await writePdf(
  renderPracticalCompletionReportHtml({ ...baseCr, photos: mixedPhotos(4) }),
  "完了報告書4枚",
  "completion-report-4photos.pdf"
);
await writePdf(
  renderPracticalCompletionReportHtml({ ...baseCr, photos: mixedPhotos(6) }),
  "完了報告書サンプル",
  "completion-report-6photos.pdf"
);
await writePdf(
  renderPracticalCompletionReportHtml({ ...baseCr, photos: mixedPhotos(12) }),
  "完了報告書12枚",
  "completion-report-12photos.pdf"
);

fs.writeFileSync(
  path.join(outDir, "specification-6photos.html"),
  renderSpecificationHtml({ ...baseSpec, photos: mixedPhotos(6) }),
  "utf8"
);
fs.writeFileSync(
  path.join(outDir, "completion-report-6photos.html"),
  renderPracticalCompletionReportHtml({ ...baseCr, photos: mixedPhotos(6) }),
  "utf8"
);

console.log(`Samples in ${outDir}`);
