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
  const leftPath = path.join(outDir, left).replace(/\\/g, "/");
  const rightPath = path.join(outDir, right).replace(/\\/g, "/");
  const html = `<!DOCTYPE html><html><head><style>
  body{margin:0;font-family:sans-serif;background:#f3f4f6}
  .wrap{display:flex;gap:12px;padding:12px}
  .col{flex:1;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.15)}
  .label{padding:8px 10px;font-weight:700;border-bottom:1px solid #ddd}
  img{display:block;width:100%}
  </style></head><body><div class="wrap">
  <div class="col"><div class="label">TOMS Reference PDF</div><img src="file:///${leftPath}"/></div>
  <div class="col"><div class="label">Generated (v1)</div><img src="file:///${rightPath}"/></div>
  </div></body></html>`;
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.screenshot({ path: path.join(outDir, out), fullPage: true });
  console.log("wrote", out);
}

async function similarity(aName, bName) {
  const evalPage = await browser.newPage();
  const a = path.join(outDir, aName).replace(/\\/g, "/");
  const b = path.join(outDir, bName).replace(/\\/g, "/");
  const result = await evalPage.evaluate(async (aPath, bPath) => {
    const load = (src) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = 800;
          c.height = 1100;
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, c.width, c.height);
          const scale = Math.min(c.width / img.width, c.height / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          ctx.drawImage(img, (c.width - w) / 2, 0, w, h);
          resolve(ctx.getImageData(0, 0, c.width, c.height).data);
        };
        img.src = src;
      });
    const [da, db] = await Promise.all([load(`file:///${aPath}`), load(`file:///${bPath}`)]);
    let close = 0;
    let total = 0;
    for (let i = 0; i < da.length; i += 4) {
      const inkA = da[i] < 245 || da[i + 1] < 245 || da[i + 2] < 245;
      const inkB = db[i] < 245 || db[i + 1] < 245 || db[i + 2] < 245;
      if (inkA || inkB) {
        total++;
        const dr = Math.abs(da[i] - db[i]);
        const dg = Math.abs(da[i + 1] - db[i + 1]);
        const dbd = Math.abs(da[i + 2] - db[i + 2]);
        if (dr < 40 && dg < 40 && dbd < 40) close++;
      }
    }
    return { ratio: total ? close / total : 1, total };
  }, a, b);
  await evalPage.close();
  return result;
}

const report = {};
for (const [ref, gen, , label] of pairs) {
  const s = await similarity(ref, gen);
  report[label] = Number((s.ratio * 100).toFixed(1));
  console.log(`${label} visual similarity: ${report[label]}%`);
}

fs.writeFileSync(path.join(outDir, "layout-similarity.json"), JSON.stringify(report, null, 2));
await browser.close();
