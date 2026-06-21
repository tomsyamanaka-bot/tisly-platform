/** Capture Monitoring 3D V3 screenshots for verification report */
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const base = process.env.SCREENSHOT_BASE || "http://localhost:3091";
const outDir = path.join(process.cwd(), "data/monitoring-3d-v3-screenshots");
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

await page.goto(`${base}/monitoring-3d-v2?siteId=DEMO-HOME-001`, { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForFunction(() => {
  const sub = document.getElementById("mon3dv3-site-sub");
  return sub && sub.textContent && sub.textContent.includes("DEMO-HOME");
}, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: path.join(outDir, "01-dashboard-normal.png"), fullPage: false });

await page.evaluate(() => document.getElementById("mon3dv3-demo-intrusion")?.click());
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: path.join(outDir, "02-demo-intrusion-alert.png"), fullPage: false });

await page.goto(`${base}/monitoring-3d-v2?siteId=DEMO-HOME-001&mode=tv`, { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForFunction(() => document.getElementById("mon3dv3-site-sub")?.textContent?.includes("DEMO-HOME"), { timeout: 30000 });
await new Promise((r) => setTimeout(r, 2000));
await page.evaluate(() => document.getElementById("mon3dv3-demo-fire")?.click());
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: path.join(outDir, "03-tv-mode-fire-alert.png"), fullPage: false });

fs.writeFileSync(
  path.join(outDir, "verification-report.json"),
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      baseUrl: base,
      files: ["01-dashboard-normal.png", "02-demo-intrusion-alert.png", "03-tv-mode-fire-alert.png"],
      pageUrl: `${base}/monitoring-3d-v2?siteId=DEMO-HOME-001`,
    },
    null,
    2
  )
);

await browser.close();
console.log("Screenshots saved to", outDir);
