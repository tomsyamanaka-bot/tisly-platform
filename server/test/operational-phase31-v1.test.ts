import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const publicDir = path.join(process.cwd(), "public");

describe("Operational Phase31 — camera nav footer zoom", () => {
  it("survey-drawing file input at body + iOS click trigger", () => {
    const html = fs.readFileSync(path.join(publicDir, "survey-drawing-v1.html"), "utf-8");
    const js = fs.readFileSync(path.join(publicDir, "js/survey-drawing-v1.js"), "utf-8");
    const css = fs.readFileSync(path.join(publicDir, "css/survey-drawing-v1.css"), "utf-8");
    const scriptIdx = html.indexOf('<script type="module" src="/js/survey-drawing-v1.js');
    const cameraIdx = html.indexOf('id="survey-camera-input"');
    const albumIdx = html.indexOf('id="survey-album-input"');
    assert.ok(cameraIdx > 0 && albumIdx > 0 && scriptIdx > 0);
    assert.ok(cameraIdx < scriptIdx && albumIdx < scriptIdx, "file inputs should be before script at body end");
    assert.match(html, /capture="environment"/);
    assert.match(html, /user-scalable=no/);
    assert.match(js, /SURVEY_DRAWING_UI_VERSION = "survey-drawing-ui-v17"/);
    assert.ok(js.includes("bindPhotoTriggerButton"));
    assert.ok(js.includes('bindPhotoTriggerButton("btn-photo-album", "survey-album-input")'));
    assert.ok(js.includes("touchstart"));
    assert.ok(css.includes("touch-action: manipulation"));
    const inputRule = css.slice(
      css.indexOf(".survey-file-input-hidden"),
      css.indexOf(".drawing-temp-banner")
    );
    assert.doesNotMatch(inputRule, /pointer-events:\s*none/);
  });

  it("navigation uses location.replace for stack transitions", () => {
    const navJs = fs.readFileSync(path.join(publicDir, "js/tisly-navigation-stack-v1.js"), "utf-8");
    assert.ok(navJs.includes("location.replace(safe)"));
    assert.doesNotMatch(navJs, /location\.href = safe/);
  });

  it("footer merges estimate+invoice and adds knowledge tab", () => {
    const navJs = fs.readFileSync(path.join(publicDir, "js/tisly-practical-nav.js"), "utf-8");
    assert.match(navJs, /見積・請求/);
    assert.match(navJs, /href: "\/knowledge-module-v1"/);
    assert.match(navJs, /ナレッジ/);
    assert.doesNotMatch(navJs, /id: "billing_v1"/);
  });

  it("service worker bumped for phase31", () => {
    const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf-8");
    assert.ok(sw.includes("tisly-pwa-v2409-phase31"));
  });
});
