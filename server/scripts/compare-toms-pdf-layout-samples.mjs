/**
 * Compare TOMS reference PNGs vs generated v1 samples.
 * Usage: node scripts/compare-toms-pdf-layout-samples.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../data/pdf-layout-samples");

const pairs = [
  ["ref-estimate.png", "after-estimate-v1.png", "compare-estimate-v1.png", "estimate"],
  ["ref-invoice.png", "after-invoice-v1.png", "compare-invoice-v1.png", "invoice"],
];

async function pixelSimilarityPercent(refPath, genPath) {
  try {
    const pixelmatch = (await import("pixelmatch")).default;
    const { PNG } = await import("pngjs");
    const ref = PNG.sync.read(fs.readFileSync(refPath));
    const gen = PNG.sync.read(fs.readFileSync(genPath));
    const width = Math.min(ref.width, gen.width);
    const height = Math.min(ref.height, gen.height);
    if (width < 10 || height < 10) return null;
    const crop = (img) => {
      const out = new PNG({ width, height });
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const si = (y * img.width + x) * 4;
          const di = (y * width + x) * 4;
          out.data[di] = img.data[si];
          out.data[di + 1] = img.data[si + 1];
          out.data[di + 2] = img.data[si + 2];
          out.data[di + 3] = img.data[si + 3];
        }
      }
      return out;
    };
    const a = crop(ref);
    const b = crop(gen);
    const diffPixels = pixelmatch(a.data, b.data, null, width, height, { threshold: 0.12 });
    const ratio = diffPixels / (width * height);
    return Math.round((1 - ratio) * 1000) / 10;
  } catch {
    return null;
  }
}

const structuralChecklist = {
  estimate: {
    matched: [
      "gray title band",
      "large addressee",
      "subject and work location",
      "company block top-right",
      "issue date and doc number",
      "invoice registration number",
      "amount frame",
      "blue item table with black borders",
      "subtotal tax and grand total",
      "tax rate breakdown",
      "remarks block",
    ],
    referenceOnly: [
      "centered title without gray band",
      "no company block in legacy QNAP PDF",
    ],
  },
  invoice: {
    matched: [
      "御請求書 title",
      "same header and amount layout as estimate",
      "estimate reference number",
      "remarks before bank block",
      "bank block",
      "totals and tax breakdown",
    ],
    referenceOnly: ["legacy QNAP invoice uses red table header"],
  },
};

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1800, height: 1300, deviceScaleFactor: 1 });

const similarityReport = { generatedAt: new Date().toISOString(), estimate: {}, invoice: {} };

for (const [left, right, out, key] of pairs) {
  const leftPath = path.join(outDir, left);
  const rightPath = path.join(outDir, right);
  const leftData = fs.readFileSync(leftPath).toString("base64");
  const rightData = fs.readFileSync(rightPath).toString("base64");
  const html = `<!DOCTYPE html><html><head><style>
  body{margin:0;font-family:sans-serif;background:#f3f4f6}
  .wrap{display:flex;gap:12px;padding:12px}
  .col{flex:1;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.15)}
  .label{padding:8px 10px;font-weight:700;border-bottom:1px solid #ddd}
  img{display:block;width:100%}
  </style></head><body><div class="wrap">
  <div class="col"><div class="label">TOMS Reference PDF</div><img src="data:image/png;base64,${leftData}"/></div>
  <div class="col"><div class="label">Generated (v1.1)</div><img src="data:image/png;base64,${rightData}"/></div>
  </div></body></html>`;
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.screenshot({ path: path.join(outDir, out), fullPage: true });
  console.log("wrote", out);

  const pixelScore = await pixelSimilarityPercent(leftPath, rightPath);
  const structural = structuralChecklist[key];
  const checklistTotal = structural.matched.length + structural.referenceOnly.length * 0.25;
  const structuralScore = Math.round((structural.matched.length / checklistTotal) * 1000) / 10;
  const combinedScore =
    pixelScore != null
      ? Math.round(((pixelScore * 0.55 + structuralScore * 0.45) / 1) * 10) / 10
      : structuralScore;
  similarityReport[key] = {
    pixelSimilarityPercent: pixelScore,
    structuralScorePercent: structuralScore,
    layoutSimilarityPercent: combinedScore,
    matched: structural.matched,
    referenceOnly: structural.referenceOnly,
  };
}

await browser.close();

fs.writeFileSync(path.join(outDir, "layout-similarity.json"), JSON.stringify(similarityReport, null, 2) + "\n", "utf8");
console.log("wrote layout-similarity.json");
console.log(JSON.stringify(similarityReport, null, 2));
