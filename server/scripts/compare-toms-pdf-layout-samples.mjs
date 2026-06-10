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

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1800, height: 1300, deviceScaleFactor: 1 });

for (const [left, right, out] of pairs) {
  const leftData = fs.readFileSync(path.join(outDir, left)).toString("base64");
  const rightData = fs.readFileSync(path.join(outDir, right)).toString("base64");
  const html = `<!DOCTYPE html><html><head><style>
  body{margin:0;font-family:sans-serif;background:#f3f4f6}
  .wrap{display:flex;gap:12px;padding:12px}
  .col{flex:1;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.15)}
  .label{padding:8px 10px;font-weight:700;border-bottom:1px solid #ddd}
  img{display:block;width:100%}
  </style></head><body><div class="wrap">
  <div class="col"><div class="label">TOMS Reference PDF</div><img src="data:image/png;base64,${leftData}"/></div>
  <div class="col"><div class="label">Generated (v1)</div><img src="data:image/png;base64,${rightData}"/></div>
  </div></body></html>`;
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.screenshot({ path: path.join(outDir, out), fullPage: true });
  console.log("wrote", out);
}

await browser.close();
console.log("Comparison PNGs updated.");
