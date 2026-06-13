/**
 * 案件PDF管理 UI スクショ（iPhone Safari 390px）
 * Usage: node scripts/capture-project-pdf-ui-screenshots.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../data/pdf-verify");
fs.mkdirSync(outDir, { recursive: true });

const iphone = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

function writeHtml(name, body) {
  const p = path.join(outDir, name);
  fs.writeFileSync(p, body, "utf8");
  return p;
}

const pdfListHtml = `<!DOCTYPE html><html lang="ja"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=390, initial-scale=1"/>
<link rel="stylesheet" href="../../public/css/tisly-friendly-ui.css"/>
<style>
body{margin:0;padding:0.75rem;font-family:system-ui,sans-serif;background:#f6f8fa}
.pdf-row{border:1px solid #e2e8f0;border-radius:10px;padding:0.65rem 0.75rem;margin-bottom:0.55rem;background:#fff}
.pdf-row-head{display:flex;justify-content:space-between;align-items:center;gap:0.5rem;margin-bottom:0.35rem}
.pdf-meta{font-size:0.78rem;color:#64748b;line-height:1.45}
.pdf-actions{display:flex;flex-wrap:wrap;gap:0.35rem;margin-top:0.45rem}
.pdf-actions button,.pdf-actions a{min-height:40px;padding:0.35rem 0.65rem;font-size:0.82rem;font-weight:600;border-radius:8px;border:1px solid #cbd5e1;background:#f8fafc;color:#334155;text-decoration:none}
.pdf-actions .btn-primary-action{background:#6b8cce;color:#fff;border-color:#6b8cce}
.pdf-actions .btn-danger{color:#b91c1c;border-color:#fecaca;background:#fef2f2}
</style></head><body class="tisly-friendly">
<p class="section-label">書類</p>
<p class="section-hint">保存先: uploads/business/BIZ-DEMO01/pdfs/</p>
<article class="pdf-row"><div class="pdf-row-head"><strong>見積書</strong><span class="section-hint">estimate-260613-001.pdf</span></div>
<div class="pdf-meta"><div>作成: 2026/06/13 16:20</div><div>サイズ: 42.3 KB</div><div>更新: 2026/06/13 16:20</div></div>
<div class="pdf-actions"><a class="btn-primary-action" href="#">開く</a><button type="button">共有</button><button type="button">再生成</button><button type="button" class="btn-danger">削除</button></div></article>
<article class="pdf-row"><div class="pdf-row-head"><strong>請求書</strong><span class="section-hint">invoice-260613-001.pdf</span></div>
<div class="pdf-meta"><div>作成: 2026/06/13 16:21</div><div>サイズ: 44.1 KB</div><div>更新: 2026/06/13 16:21</div></div>
<div class="pdf-actions"><a class="btn-primary-action" href="#">開く</a><button type="button">共有</button><button type="button">再生成</button><button type="button" class="btn-danger">削除</button></div></article>
<article class="pdf-row"><div class="pdf-row-head"><strong>報告書</strong><span class="section-hint">report-現調）上田さんカメラ 完了報告.pdf</span></div>
<div class="pdf-meta"><div>作成: 2026/06/13 16:22</div><div>サイズ: 128.5 KB</div><div>更新: 2026/06/13 16:22</div></div>
<div class="pdf-actions"><a class="btn-primary-action" href="#">開く</a><button type="button">共有</button><button type="button">再生成</button><button type="button" class="btn-danger">削除</button></div></article>
</body></html>`;

const shareHtml = `<!DOCTYPE html><html lang="ja"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=390, initial-scale=1"/>
<style>
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:rgba(0,0,0,0.35);min-height:844px}
.sheet{position:fixed;bottom:0;left:0;right:0;background:#f2f2f7;border-radius:14px 14px 0 0;padding:0.75rem 0 1.5rem}
.grabber{width:36px;height:5px;background:#c7c7cc;border-radius:99px;margin:0 auto 0.75rem}
.row{display:flex;align-items:center;gap:0.75rem;padding:0.85rem 1.1rem;border-bottom:1px solid #e5e5ea;font-size:1.05rem}
.icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.2rem}
</style></head><body>
<div class="sheet"><div class="grabber"></div>
<div class="row"><div class="icon" style="background:#06c755;color:#fff">L</div>LINE</div>
<div class="row"><div class="icon" style="background:#007aff;color:#fff">✉</div>メール</div>
<div class="row"><div class="icon" style="background:#007aff;color:#fff">⤴</div>AirDrop</div>
<div class="row"><div class="icon" style="background:#fff;border:1px solid #ddd">🖨</div>印刷</div>
<div class="row"><div class="icon" style="background:#fff;border:1px solid #ddd">📁</div>ファイルに保存</div>
</div></body></html>`;

const deleteDialogHtml = `<!DOCTYPE html><html lang="ja"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=390, initial-scale=1"/>
<link rel="stylesheet" href="../../public/css/tisly-friendly-ui.css"/>
<style>
body{margin:0;font-family:system-ui,sans-serif}
.delete-dialog-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;padding:1rem}
.delete-dialog{background:#fff;border-radius:14px;padding:1.1rem;max-width:360px;width:100%}
.delete-dialog h4{margin:0 0 0.65rem}
.delete-dialog .stats{font-size:0.9rem;line-height:1.6;margin-bottom:0.85rem}
.dialog-actions{display:flex;gap:0.5rem}
.dialog-actions button{flex:1;min-height:44px;border-radius:10px;font-weight:700}
.btn-cancel{border:1px solid #cbd5e1;background:#f8fafc}
.btn-confirm-delete{border:none;background:#dc2626;color:#fff}
</style></head><body>
<div class="delete-dialog-overlay"><div class="delete-dialog">
<h4>案件を削除</h4>
<div class="stats">
<p><strong>案件：</strong>現調）上田さんカメラ</p>
<p>見積：1</p><p>請求：1</p><p>PDF：3</p>
<p style="margin-top:0.65rem;">本当に削除しますか？</p>
</div>
<div class="dialog-actions"><button class="btn-cancel">キャンセル</button><button class="btn-confirm-delete">削除する</button></div>
</div></div></body></html>`;

const deletedListHtml = `<!DOCTYPE html><html lang="ja"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=390, initial-scale=1"/>
<link rel="stylesheet" href="../../public/css/tisly-friendly-ui.css"/>
<style>
body{margin:0;padding:0.75rem;font-family:system-ui,sans-serif;background:#f6f8fa}
.list-tabs{display:flex;gap:0.35rem;margin-bottom:0.75rem}
.list-tabs button{flex:1;min-height:44px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;font-weight:600}
.list-tabs button.active{background:#6b8cce;color:#fff;border-color:#6b8cce}
.deleted-card{border-left:3px solid #f87171}
</style></head><body class="tisly-friendly">
<div class="list-tabs"><button>📂 案件一覧</button><button class="active">🗑 削除済</button></div>
<article class="friendly-card deleted-card">
<p><strong>PRJ-2026-0042</strong> 現調）上田さんカメラ</p>
<p class="section-hint">上田 様</p>
<p class="section-hint">削除: 2026/06/13 16:30</p>
<p class="section-hint">見積:1 / 請求:1 / PDF:3</p>
<button type="button" class="btn-sub" style="margin-top:0.45rem;width:100%;">復元</button>
</article></body></html>`;

async function capture(page, htmlPath, pngName) {
  const url = "file:///" + htmlPath.replace(/\\/g, "/");
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.screenshot({ path: path.join(outDir, pngName), fullPage: true });
  console.log("saved", pngName);
}

async function main() {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.emulate({
    viewport: iphone,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  await capture(page, writeHtml("projects-pdf-list-ui.html", pdfListHtml), "projects-pdf-list-mobile.png");
  await capture(page, writeHtml("projects-pdf-share-ui.html", shareHtml), "projects-pdf-share-mobile.png");
  await capture(page, writeHtml("projects-delete-dialog-ui.html", deleteDialogHtml), "projects-delete-dialog-mobile.png");
  await capture(page, writeHtml("projects-deleted-list-ui.html", deletedListHtml), "projects-deleted-list-mobile.png");
  await capture(page, writeHtml("projects-restore-ui.html", deletedListHtml), "projects-restore-mobile.png");
  await browser.close();
  console.log("done", outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
