#!/usr/bin/env node
/** TiSLY HOME — タイル部分だけを 2倍解像度で切り出す（目視確認用） */
import puppeteer from "puppeteer";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3080";
const OUT = path.join(process.cwd(), "data", "home-tiles-verify");

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  fs.mkdirSync(OUT, { recursive: true });

  for (const target of [
    { name: "operator", url: "/home-v1" },
    { name: "customer", url: "/customer/home" },
  ]) {
    await page.setViewport({
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
    });
    await page.goto(`${BASE}${target.url}`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#hm-tile-grid .hm-tile");
    const grid = await page.$("#hm-tile-section");
    const file = path.join(OUT, `zoom-${target.name}-tiles.png`);
    await grid.screenshot({ path: file });
    console.log("saved:", file);

    // 詳細パネルを開いた状態
    await page.click('.hm-tile[data-tile="bath"] .hm-tile-open');
    await page.waitForFunction(
      () =>
        !document.querySelector('.hm-detail-panel[data-detail="bath"]').hidden
    );
    await new Promise((r) => setTimeout(r, 400));
    const panel = await page.$('.hm-detail-panel[data-detail="bath"]');
    const detailFile = path.join(OUT, `zoom-${target.name}-bath-detail.png`);
    await panel.screenshot({ path: detailFile });
    console.log("saved:", detailFile);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
