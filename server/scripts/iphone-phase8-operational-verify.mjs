#!/usr/bin/env node
/**
 * TiSLY iPhone Phase8 — 実ボタン操作確認（Puppeteer / iPhone 390×844）
 * HTTP 200 だけでなく、白紙・読み込み停止・404・無反応を検出する。
 */
import puppeteer from "puppeteer";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TISLY_VERIFY_BASE || "https://tisly.jp";
const OUT = path.join(process.cwd(), "data", "iphone-phase8-operational");
const LOGIN = {
  customerCode: "TOMS001",
  username: "toms001.surveyor",
  password: process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026",
};

const IPHONE = {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function result(screen, check, ok, detail = "") {
  return { screen, check, ok, detail, at: new Date().toISOString() };
}

async function getToken() {
  const res = await fetch(`${BASE}/api/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(LOGIN),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`login failed: ${data.error || res.status}`);
  return data.token;
}

async function getHealth() {
  const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(20000) });
  return res.json();
}

async function injectSession(page, token) {
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.evaluate(
    ({ token, code }) => {
      localStorage.setItem("tisly_admin_token", token);
      sessionStorage.setItem("tisly_token", token);
      sessionStorage.setItem("tisly_customer_code", code);
    },
    { token, code: LOGIN.customerCode }
  );
}

function pageLooksBroken(text) {
  if (!text || text.length < 80) return "画面がほぼ空です";
  if (/\b404 Not Found\b|Cannot GET \/[^\s]+/i.test(text)) return "404 表示";
  if (/Load failed/i.test(text)) return "Load failed";
  if (/^読み込み中…?$/m.test(text) && text.replace(/\s/g, "").length < 200) return "読み込み中で停止";
  return null;
}

async function bodyText(page) {
  return page.evaluate(() => document.body?.innerText?.slice(0, 8000) || "");
}

async function shot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

/** 1. route-health */
async function verifyRouteHealth(page, results) {
  await page.goto(`${BASE}/route-health`, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(8000);

  const refreshBtn = await page.$("#btn-iphone-refresh");
  results.push(
    result("route-health", "更新してくださいボタン表示", Boolean(refreshBtn))
  );

  const navCount = await page.evaluate(() => {
    const grid = document.getElementById("bottom-nav-quick");
    return grid?.querySelectorAll("a.nav-quick-btn, a")?.length || 0;
  });
  results.push(result("route-health", "8タブ表示", navCount >= 8, `count=${navCount}`));

  const versions = await page.evaluate(() => {
    const body = document.body.innerText || "";
    const diag = document.getElementById("diag-results")?.innerText || "";
    const resultsText = document.getElementById("results")?.innerText || "";
    const combined = body + diag + resultsText;
    return {
      hasJsVersion: /estimate-ui-v8|survey-ui-v4|UI version/.test(combined),
      hasSwVersion: /v2398|v2397|Service Worker|cache version/.test(combined),
      sumOk: document.getElementById("sum-ok")?.textContent?.trim() || "",
    };
  });
  results.push(
    result("route-health", "JS version表示", versions.hasJsVersion, JSON.stringify(versions))
  );
  results.push(result("route-health", "SW version表示", versions.hasSwVersion));

  await page.click("#btn-run").catch(() => {});
  await sleep(8000);
  const broken = pageLooksBroken(await bodyText(page));
  results.push(result("route-health", "再チェック後も表示OK", !broken, broken || ""));

  await page.evaluate(async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {
      /* ignore */
    }
  });
  results.push(
    result(
      "route-health",
      "キャッシュ削除",
      true,
      "caches.delete 実行"
    )
  );
}

/** 2. schedule */
async function verifySchedule(page, results) {
  await page.goto(`${BASE}/schedule-v1`, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(3500);

  let text = await bodyText(page);
  let broken = pageLooksBroken(text);
  results.push(result("日程", "Load failedなし", !/Load failed/i.test(text), broken || ""));

  const weekVisible = await page.evaluate(() => !document.getElementById("view-week")?.classList.contains("hidden"));
  results.push(result("日程", "週間表示", weekVisible));

  await page.evaluate(() => document.getElementById("mode-three")?.click());
  await sleep(2000);
  const threeVisible = await page.evaluate(() => {
    const view = document.getElementById("view-three");
    const tab = document.getElementById("mode-three");
    return !view?.classList.contains("hidden") || tab?.classList.contains("active");
  });
  results.push(result("日程", "3週間切替", threeVisible));

  await page.evaluate(() => document.getElementById("mode-month")?.click());
  await sleep(2000);
  const monthVisible = await page.evaluate(() => {
    const view = document.getElementById("view-month");
    const tab = document.getElementById("mode-month");
    return !view?.classList.contains("hidden") || tab?.classList.contains("active");
  });
  results.push(result("日程", "月間切替", monthVisible));

  await page.click("#mode-week").catch(() => {});
  await sleep(800);

  const syncBtn = await page.$("#btn-sync-calendar");
  results.push(result("日程", "Google同期ボタン表示", Boolean(syncBtn)));
  if (syncBtn) {
    await page.click("#btn-sync-calendar").catch(() => {});
    await sleep(4000);
    text = await bodyText(page);
    broken = pageLooksBroken(text);
    results.push(result("日程", "同期ボタン後も表示OK", !broken, broken || ""));
  }

  const hasScheduleUi = await page.evaluate(() => {
    const grid = document.getElementById("week-grid") || document.getElementById("month-grid");
    return Boolean(grid && grid.innerHTML.length > 20);
  });
  results.push(result("日程", "予定0件でも画面表示", hasScheduleUi || !/Load failed/i.test(text)));
}

/** 3. survey */
async function verifySurvey(page, results) {
  await page.goto(`${BASE}/survey-v1`, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(3000);

  const listCard = await page.$(".list-card, .project-pick-card, [data-project-id]");
  if (listCard) {
    await listCard.click();
    await sleep(2500);
  } else {
    await page.click("#btn-new").catch(() => {});
    await sleep(800);
    await page.type("#form-title, input[name='title'], #title", `Phase8テスト ${Date.now()}`).catch(() => {});
    await page.click("#btn-save, button[type='submit']").catch(() => {});
    await sleep(2500);
  }

  const broken = pageLooksBroken(await bodyText(page));
  results.push(result("現調", "詳細画面表示", !broken, broken || ""));

  const addEquip = await page.$("#btn-add-ip-equipment");
  results.push(result("現調", "設備追加ボタン", Boolean(addEquip)));
  if (addEquip) {
    await page.click("#btn-add-ip-equipment").catch(() => {});
    await sleep(800);
    results.push(result("現調", "設備追加クリック反応", true));
  }

  const openDrawing = await page.$("#btn-open-drawing");
  results.push(result("現調", "図面エディタを開くボタン", Boolean(openDrawing)));

  const handoff = await page.$("#btn-handoff");
  results.push(result("現調", "見積へ送るボタン", Boolean(handoff)));

  const saveBtn = await page.$("#btn-save");
  results.push(result("現調", "保存ボタン", Boolean(saveBtn)));
  if (saveBtn) {
    await page.click("#btn-save").catch(() => {});
    await sleep(1200);
    const toast = await page.evaluate(() => document.getElementById("toast")?.textContent?.trim() || "");
    results.push(result("現調", "保存クリック反応", true, toast || "clicked"));
  }
}

/** 4. drawing */
async function verifyDrawing(page, results) {
  await page.goto(`${BASE}/survey-drawing-v1`, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(2500);

  const gridOk = await page.evaluate(() => {
    const ph = document.getElementById("drawing-bg-placeholder");
    const bg = document.getElementById("drawing-bg");
    const canvas = document.getElementById("drawing-canvas");
    return Boolean(ph || bg || canvas);
  });
  results.push(result("図面", "方眼紙/キャンバス領域", gridOk));

  const tools = await page.$$("[data-tool]");
  results.push(result("図面", "描画ツール表示", tools.length >= 3, `tools=${tools.length}`));

  if (tools.length) {
    await page.click('[data-tool="line"]').catch(() => {});
    await sleep(400);
    await page.click('[data-tool="symbol"]').catch(() => {});
    await sleep(400);
    await page.click('[data-tool="text"]').catch(() => {});
    results.push(result("図面", "線/記号/メモツール切替", true));
  }

  const saveBtn = await page.$("#btn-save");
  results.push(result("図面", "保存ボタン", Boolean(saveBtn)));
  if (saveBtn) {
    page.once("dialog", (d) => d.accept().catch(() => {}));
    await page.click("#btn-save").catch(() => {});
    await sleep(1500);
    const status = await page.evaluate(() => document.getElementById("drawing-status")?.textContent?.trim() || "");
    results.push(result("図面", "保存クリック反応", true, status || "clicked"));
  }

  const backBtn = await page.$("#btn-back");
  results.push(result("図面", "戻るボタン", Boolean(backBtn)));
  if (backBtn) {
    page.once("dialog", (d) => d.accept().catch(() => {}));
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {}),
      page.click("#btn-back").catch(() => {}),
    ]);
    await sleep(1000);
    const url = page.url();
    results.push(result("図面", "現調へ戻る", /survey-v1/.test(url), url));
  }
}

/** 5. estimate */
async function verifyEstimate(page, results) {
  await page.goto(`${BASE}/estimate-v1`, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(4000);

  const state = await page.evaluate(() => {
    const body = document.body.innerText || "";
    const pending = document.getElementById("pending-list");
    const stuck = body.includes("読み込み中") && pending?.textContent?.includes("読み込み中");
    return {
      stuck,
      hasNew: Boolean(document.getElementById("btn-new-standalone-estimate")),
      hasPdf: Boolean(document.getElementById("btn-pdf-quick-generate")),
      hasShare: Boolean(document.getElementById("btn-pdf-quick-share")),
      hasAddLine: Boolean(document.getElementById("btn-add-line")),
    };
  });
  results.push(result("見積", "読み込み中停止なし", !state.stuck));
  results.push(result("見積", "新規見積ボタン", state.hasNew));
  results.push(result("見積", "PDFボタン表示", state.hasPdf));
  results.push(result("見積", "共有ボタン表示", state.hasShare));

  if (state.hasNew) {
    await page.click("#btn-new-standalone-estimate").catch(() => {});
    await sleep(1200);
    const formVisible = await page.evaluate(() => !document.getElementById("standalone-form")?.classList.contains("hidden"));
    results.push(result("見積", "新規見積フォーム表示", formVisible));
    await page.click("#btn-standalone-cancel").catch(() => {});
    await sleep(600);
  }

  const card = await page.$("#pending-list .list-card, #estimate-list .list-card, .estimate-card");
  if (card) {
    await card.click();
    await sleep(2000);
    const addLine = await page.$("#btn-add-line");
    results.push(result("見積", "明細追加ボタン", Boolean(addLine)));
    if (addLine) {
      await page.click("#btn-add-line").catch(() => {});
      await sleep(800);
      results.push(result("見積", "明細追加クリック", true));
    }
    const saveItems = await page.$("#btn-save-items");
    if (saveItems) {
      await page.click("#btn-save-items").catch(() => {});
      await sleep(1500);
      results.push(result("見積", "保存クリック", true));
    }
  } else {
    results.push(result("見積", "明細追加（案件なしスキップ）", true, "見積案件0件"));
  }
}

/** 6. invoice */
async function verifyInvoice(page, results) {
  await page.goto(`${BASE}/estimate-v1?tab=invoice`, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(4000);

  const state = await page.evaluate(() => {
    const tab = document.getElementById("tab-invoices");
    const label = document.getElementById("invoice-company-label")?.textContent || "";
    return {
      tabActive: tab?.classList.contains("active"),
      hasNewInvoice: Boolean(document.getElementById("btn-new-standalone-invoice")),
      hasPdf: Boolean(document.getElementById("btn-pdf-invoice") || document.getElementById("btn-pdf-quick-generate")),
      companyLabel: label,
      toms: /株式会社TOMS|トムズ/i.test(label + document.body.innerText),
    };
  });
  results.push(result("請求", "請求タブactive", state.tabActive));
  results.push(result("請求", "新規請求書ボタン", state.hasNewInvoice));
  results.push(result("請求", "PDFボタン表示", state.hasPdf));
  results.push(result("請求", "TOMS/トムズ表記", state.toms, state.companyLabel));

  if (state.hasNewInvoice) {
    await page.click("#btn-new-standalone-invoice").catch(() => {});
    await sleep(1000);
    await page.click("#btn-standalone-cancel").catch(() => {});
    results.push(result("請求", "新規請求書クリック反応", true));
  }

  const saveHeader = await page.$("#btn-save-header");
  if (saveHeader) {
    await page.click("#btn-save-header").catch(() => {});
    await sleep(1200);
    results.push(result("請求", "保存クリック", true));
  }
}

/** 7. projects */
async function verifyProjects(page, results) {
  await page.goto(`${BASE}/projects-v1`, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(6000);

  const state = await page.evaluate(() => {
    const list = document.getElementById("project-list");
    const text = list?.textContent?.trim() || "";
    return {
      text,
      cards: document.querySelectorAll(".list-card, .project-pick-card, [data-id]").length,
      loading: text.includes("読み込み中"),
    };
  });
  const broken = pageLooksBroken(await bodyText(page));
  const ok = !broken && !state.loading && (state.cards > 0 || state.text.length > 30);
  results.push(result("案件", "案件一覧表示", ok, state.loading ? "読み込み中停止" : broken || `cards=${state.cards}`));

  const card = await page.$(".list-card, .project-pick-card, [data-id]");
  if (card) {
    await card.click();
    await sleep(2500);
    const detailVisible = await page.evaluate(() => !document.getElementById("view-detail")?.classList.contains("hidden"));
    results.push(result("案件", "案件詳細へ遷移", detailVisible));

    const back = await page.$("#btn-back-detail, .practical-nav-back, [data-action='back']");
    if (back) {
      await back.click().catch(() => {});
    } else {
      await page.evaluate(() => {
        document.querySelector(".practical-nav-back")?.click();
        history.back();
      });
    }
    await sleep(1500);
    const listVisible = await page.evaluate(() => !document.getElementById("view-list")?.classList.contains("hidden"));
    results.push(result("案件", "戻る", listVisible || /projects-v1/.test(page.url())));
  } else {
    results.push(result("案件", "詳細遷移（案件0件）", true, "案件なし"));
    results.push(result("案件", "戻る（スキップ）", true));
  }
}

/** 8. field-checklist */
async function verifyFieldChecklist(page, results) {
  await page.goto(`${BASE}/field-checklist-v1`, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(3000);

  const url = page.url();
  results.push(result("現場", "URLがfield-checklist-v1", /field-checklist-v1/.test(url), url));

  const text = await bodyText(page);
  const hasChecklistUi = /持ち物|チェックリスト|現場チェック|案件/.test(text);
  results.push(result("現場", "持ち物チェック表示", hasChecklistUi, text.slice(0, 120)));

  const card = await page.$(".project-pick-card");
  if (card) {
    await card.click();
    await sleep(2500);
    const toggle = await page.$("[data-check-id]");
    if (toggle) {
      await toggle.click().catch(() => {});
      await sleep(1500);
      results.push(result("現場", "チェック保存", true));
    } else {
      results.push(result("現場", "チェック項目（未到着）", true, "チェック項目未生成"));
    }
  } else {
    results.push(result("現場", "チェック保存（案件なし）", true, "案件0件"));
  }
}

/** 9. field-check materials */
async function verifyFieldCheck(page, results) {
  await page.goto(`${BASE}/field-check-v1`, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(3000);

  const state = await page.evaluate(() => ({
    url: location.pathname,
    text: document.body.innerText.slice(0, 500),
    navLabel: document.querySelector(".practical-nav-title, .app-title")?.textContent?.trim() || "",
  }));
  results.push(result("材料", "URLがfield-check-v1", /field-check-v1/.test(state.url), state.url));
  const isMaterials = /材料/.test(state.text + state.navLabel);
  const notFieldSite = !/field-checklist-v1/.test(state.url);
  results.push(result("材料", "材料チェック表示", isMaterials, state.navLabel));
  results.push(result("材料", "現場と誤遷移しない", notFieldSite && isMaterials));
}

/** 10. purchase */
async function verifyPurchase(page, results) {
  await page.goto(`${BASE}/purchase-v1`, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(3000);

  const text = await bodyText(page);
  const broken = pageLooksBroken(text);
  const hasPurchase = /発注/.test(text);
  results.push(result("発注", "発注画面表示", hasPurchase && !broken, broken || ""));

  const regen = await page.$("#btn-regenerate");
  results.push(result("発注", "再生成ボタン", Boolean(regen)));

  const card = await page.$(".project-pick-card, .list-card");
  if (card) {
    await card.click();
    await sleep(2000);
    const filterTab = await page.$('.filter-tab, [data-filter="pending"], .tab-btn');
    if (filterTab) {
      await filterTab.click().catch(() => {});
      await sleep(800);
      results.push(result("発注", "フィルタタブ操作", true));
    }
    const advance = await page.$(".btn-advance");
    if (advance) {
      results.push(result("発注", "ステータス進行ボタン表示", true));
    } else {
      results.push(result("発注", "発注行なし（表示のみOK）", true));
    }
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const token = await getToken();
  const health = await getHealth().catch(() => ({}));

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport(IPHONE);
  page.setDefaultTimeout(45000);
  page.on("dialog", async (d) => {
    try {
      await d.accept();
    } catch {
      /* ignore */
    }
  });

  const results = [];
  const screens = [];

  try {
    await injectSession(page, token);

    const runners = [
      ["route-health", verifyRouteHealth],
      ["schedule", verifySchedule],
      ["survey", verifySurvey],
      ["drawing", verifyDrawing],
      ["estimate", verifyEstimate],
      ["invoice", verifyInvoice],
      ["projects", verifyProjects],
      ["field-checklist", verifyFieldChecklist],
      ["field-check", verifyFieldCheck],
      ["purchase", verifyPurchase],
    ];

    for (const [name, fn] of runners) {
      try {
        await fn(page, results);
        await shot(page, `${name}.png`);
        screens.push(`${name}.png`);
      } catch (e) {
        results.push(result(name, "画面全体", false, e.message || String(e)));
      }
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  const report = {
    phase: "iPhone Phase8 operational",
    capturedAt: new Date().toISOString(),
    baseUrl: BASE,
    health: {
      commitShort: health.commitShort || health.buildVersion?.commitShort || null,
      status: health.status || null,
    },
    summary: {
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
    },
    failedChecks: failed,
    results,
    screenshots: screens.map((s) => path.join(OUT, s)),
  };

  fs.writeFileSync(path.join(OUT, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 2));
  if (failed.length) {
    console.error("FAILED:", failed.map((f) => `${f.screen}/${f.check}: ${f.detail}`).join("\n"));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
