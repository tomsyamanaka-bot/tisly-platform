#!/usr/bin/env node
/**
 * TiSLY HOME — タイルUI のスマホ表示検証
 *
 * 2列グリッドの崩れ・横スクロール・タップ領域（44px以上）を
 * 実ブラウザで測ってから PNG を保存する。
 *
 * 使い方: node scripts/capture-home-tiles-v1.mjs
 */
import puppeteer from "puppeteer";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3080";
const OUT = path.join(process.cwd(), "data", "home-tiles-verify");

/** iPhone SE / iPhone 14 相当 */
const VIEWPORTS = [
  { name: "iphone-se", width: 375, height: 667 },
  { name: "iphone-14", width: 390, height: 844 },
];

const PAGES = [
  { name: "operator", url: "/home-v1" },
  { name: "customer", url: "/customer/home" },
];

const MIN_TAP_PX = 44;
let failed = false;

function fail(message) {
  failed = true;
  console.error(`NG: ${message}`);
}

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log("saved:", file);
}

/** タイル1枚ぶんの実寸を測る */
async function measureTiles(page) {
  return page.evaluate(() => {
    const grid = document.getElementById("hm-tile-grid");
    const tiles = Array.from(grid.querySelectorAll(".hm-tile"));
    const columns = getComputedStyle(grid)
      .gridTemplateColumns.split(" ")
      .filter(Boolean).length;
    return {
      columns,
      docScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      order: tiles.map((t) => t.dataset.tile),
      tiles: tiles.map((t) => {
        const openBtn = t.querySelector(".hm-tile-open");
        const actionBtn = t.querySelector(".hm-tile-action");
        const nameEl = t.querySelector(".hm-tile-name");
        const nameLineHeight =
          parseFloat(getComputedStyle(nameEl).lineHeight) || 1;
        const rect = t.getBoundingClientRect();
        return {
          key: t.dataset.tile,
          name: nameEl?.textContent?.trim() ?? "",
          nameLines: Math.round(
            nameEl.getBoundingClientRect().height / nameLineHeight
          ),
          state: t.querySelector(".hm-tile-state")?.textContent?.trim() ?? "",
          sub: t.querySelector(".hm-tile-sub")?.textContent?.trim() ?? "",
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          openHeight: Math.round(openBtn?.getBoundingClientRect().height ?? 0),
          actionLabel: actionBtn?.textContent?.trim() ?? "",
          actionWidth: Math.round(
            actionBtn?.getBoundingClientRect().width ?? 0
          ),
          actionHeight: Math.round(
            actionBtn?.getBoundingClientRect().height ?? 0
          ),
          overflowsX: t.scrollWidth > t.clientWidth + 1,
        };
      }),
    };
  });
}

async function verifyPage(page, target, viewport) {
  const label = `${target.name}@${viewport.name}`;
  await page.setViewport({ width: viewport.width, height: viewport.height });
  await page.goto(`${BASE}${target.url}`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#hm-tile-grid .hm-tile", { timeout: 15000 });

  const m = await measureTiles(page);
  console.log(`\n--- ${label} ---`);
  console.log(`列数: ${m.columns} / 並び: ${m.order.join(" → ")}`);
  for (const t of m.tiles) {
    console.log(
      `  ${t.key}: ${t.width}x${t.height}px | ${t.name}(${t.nameLines}行)` +
        ` | ${t.state} | ${t.sub}` +
        ` | ボタン "${t.actionLabel}" ${t.actionWidth}x${t.actionHeight}`
    );
  }

  if (m.columns !== 2) fail(`${label}: スマホ幅で ${m.columns} 列（2列であるべき）`);
  if (m.docScrollWidth > m.viewportWidth + 1) {
    fail(
      `${label}: 横スクロール発生 ${m.docScrollWidth}px > ${m.viewportWidth}px`
    );
  }
  // 工事屋目線の優先順（エアコンは台数ぶん末尾に並ぶ）
  const expected = ["ct", "lock", "intercom", "bath"];
  const head = m.order.slice(0, expected.length);
  if (head.join(",") !== expected.join(",")) {
    fail(`${label}: 並び順が ${head.join(",")}（期待 ${expected.join(",")}）`);
  }
  if (!m.order.slice(expected.length).every((k) => k.startsWith("aircon:"))) {
    fail(`${label}: エアコンタイルが末尾に並んでいない`);
  }

  for (const t of m.tiles) {
    if (t.overflowsX) fail(`${label}: ${t.key} タイル内で横あふれ`);
    if (t.openHeight < MIN_TAP_PX) {
      fail(`${label}: ${t.key} の詳細タップ領域 ${t.openHeight}px < ${MIN_TAP_PX}px`);
    }
    if (t.actionLabel && t.actionHeight < MIN_TAP_PX) {
      fail(
        `${label}: ${t.key} の操作ボタン ${t.actionHeight}px < ${MIN_TAP_PX}px`
      );
    }
    if (!t.name || !t.state) fail(`${label}: ${t.key} の機器名/状態が空`);
    if (t.nameLines > 1) {
      fail(`${label}: ${t.key} の機器名が ${t.nameLines} 行に折り返している`);
    }
  }

  // 最下部までスクロールしても浮遊クイック切替ボタンが最後のカードを隠さない
  const fabOverlap = await page.evaluate(() => {
    const fab = document.querySelector(".hqs-fab");
    const last = document.querySelector(".hm-main > *:last-child");
    if (!fab || !last) return null;
    document.scrollingElement.scrollTo(0, document.body.scrollHeight);
    const f = fab.getBoundingClientRect();
    const l = last.getBoundingClientRect();
    return !(
      f.right < l.left ||
      f.left > l.right ||
      f.bottom < l.top ||
      f.top > l.bottom
    );
  });
  if (fabOverlap) fail(`${label}: 浮遊ボタンが最後のカードに重なっている`);
  await page.evaluate(() => document.scrollingElement.scrollTo(0, 0));

  await shot(page, `${viewport.name}-${target.name}-01-tiles.png`);

  // タイルから詳細パネルを開く
  await page.click('.hm-tile[data-tile="lock"] .hm-tile-open');
  await page.waitForFunction(
    () => !document.querySelector('.hm-detail-panel[data-detail="lock"]').hidden,
    { timeout: 5000 }
  );
  const openCount = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll(".hm-detail-panel")).filter(
        (p) => !p.hidden
      ).length
  );
  if (openCount !== 1) fail(`${label}: 詳細パネルが ${openCount} 枚開いている`);
  await new Promise((r) => setTimeout(r, 400));
  await shot(page, `${viewport.name}-${target.name}-02-lock-detail.png`);

  // 閉じるボタンで元のタイルだけに戻る
  await page.click('[data-detail-close="lock"]');
  await page.waitForFunction(
    () => document.querySelector('.hm-detail-panel[data-detail="lock"]').hidden,
    { timeout: 5000 }
  );

  await verifyOneTapControl(page, label);
}

/** タイル右上のワンタップ操作が実際に状態を変えるか */
async function verifyOneTapControl(page, label) {
  const stateOf = (key) =>
    page.$eval(
      `.hm-tile[data-tile="${key}"] .hm-tile-state`,
      (el) => el.textContent.trim()
    );

  // 通信中はボタンが disabled になるので、押せる状態を待つ
  const tapLock = async () => {
    await page.waitForSelector(
      '.hm-tile[data-tile="lock"] .hm-tile-action:not([disabled])',
      { timeout: 10000 }
    );
    await page.click('.hm-tile[data-tile="lock"] .hm-tile-action');
  };

  const before = await stateOf("lock");
  await tapLock();
  await page
    .waitForFunction(
      () => document.getElementById("hm-toast")?.classList.contains("is-visible"),
      { timeout: 8000 }
    )
    .catch(() => fail(`${label}: 施錠解錠のトーストが出ない`));
  await page.waitForFunction(
    (prev) =>
      document
        .querySelector('.hm-tile[data-tile="lock"] .hm-tile-state')
        .textContent.trim() !== prev,
    { timeout: 8000 },
    before
  );
  const after = await stateOf("lock");
  console.log(`  ワンタップ施錠解錠: ${before} → ${after}`);
  const expected = new Set(["施錠済み", "解錠中"]);
  if (!expected.has(before) || !expected.has(after) || before === after) {
    fail(`${label}: 施錠解錠が切り替わらない（${before} → ${after}）`);
  }

  // 元の状態へ戻す（デモ状態を残さない）
  await tapLock();
  await page.waitForFunction(
    (want) =>
      document
        .querySelector('.hm-tile[data-tile="lock"] .hm-tile-state')
        .textContent.trim() === want,
    { timeout: 8000 },
    before
  );
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  page.on("pageerror", (err) => fail(`JS エラー: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") fail(`console.error: ${msg.text()}`);
  });

  try {
    for (const viewport of VIEWPORTS) {
      for (const target of PAGES) {
        await verifyPage(page, target, viewport);
      }
    }

    // 広い画面では列が増える（可変グリッド）
    await page.setViewport({ width: 1180, height: 900 });
    await page.goto(`${BASE}/home-v1`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#hm-tile-grid .hm-tile");
    const desktop = await measureTiles(page);
    console.log(`\n--- operator@desktop --- 列数: ${desktop.columns}`);
    if (desktop.columns < 3) fail(`desktop: ${desktop.columns} 列（3列以上を期待）`);
    await shot(page, "desktop-operator-01-tiles.png");
  } finally {
    await browser.close();
  }

  console.log(failed ? "\n検証 NG" : "\n検証 OK");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
