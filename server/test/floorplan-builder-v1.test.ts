/**
 * 3D Floorplan Builder v1 tests
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  createHirayaDemoPresetV1,
  createTsukubaModelHousePresetV1,
  listFloorplanPresetsV1,
} from "../src/floorplan-builder/floorplan-presets-v1.js";
import {
  getActiveFloorplanConfigV1,
  saveFloorplanConfigV1,
} from "../src/floorplan-builder/floorplan-store-v1.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "../public");

describe("floorplan-builder-v1", () => {
  it("プリセットがつくばと平屋の2件", () => {
    const presets = listFloorplanPresetsV1();
    assert.equal(presets.length, 2);
    assert.ok(presets.some((p) => p.presetId === "tsukuba_model_house"));
    assert.ok(presets.some((p) => p.presetId === "hiraya_demo"));
  });

  it("つくばは2F有効・平屋は2F無効", () => {
    const tkb = createTsukubaModelHousePresetV1();
    const hiraya = createHirayaDemoPresetV1();
    assert.equal(
      tkb.floors.find((f) => f.id === "2f")?.enabled,
      true
    );
    assert.equal(
      hiraya.floors.find((f) => f.id === "2f")?.enabled,
      false
    );
    assert.ok((tkb.security.rooms?.length || 0) > 5);
    assert.ok((hiraya.security.rooms?.length || 0) > 5);
  });

  it("保存すると active と security bridge が更新される", () => {
    const cfg = createHirayaDemoPresetV1();
    cfg.name = "テスト平屋";
    const saved = saveFloorplanConfigV1(cfg);
    assert.equal(saved.name, "テスト平屋");
    const active = getActiveFloorplanConfigV1();
    assert.equal(active.id, saved.id);
    assert.ok(saved.security.rooms.length > 0);
  });

  it("HTML / CSS / JS が存在する", () => {
    assert.ok(
      fs.existsSync(
        path.join(publicDir, "tisly_3d_floorplan_builder.html")
      )
    );
    assert.ok(
      fs.existsSync(
        path.join(
          publicDir,
          "js/features/floorplan-builder/floorplan-builder-v1.js"
        )
      )
    );
    assert.ok(
      fs.existsSync(
        path.join(
          publicDir,
          "js/features/floorplan-builder/floorplan-security-bridge-v1.js"
        )
      )
    );
    assert.ok(
      fs.existsSync(
        path.join(
          publicDir,
          "css/features/floorplan-builder/floorplan-builder-v1.css"
        )
      )
    );
  });

  it("API presets / active / security-bridge / load-preset", async () => {
    const app = createApp();
    const presets = await request(app).get(
      "/api/floorplan-builder/v1/presets"
    );
    assert.equal(presets.status, 200);
    assert.equal(presets.body.ok, true);
    assert.ok(presets.body.presets.length >= 2);

    const loaded = await request(app)
      .post("/api/floorplan-builder/v1/load-preset")
      .send({ presetId: "tsukuba_model_house" });
    assert.equal(loaded.status, 200);
    assert.equal(loaded.body.ok, true);
    assert.match(loaded.body.config.name, /つくば/);

    const active = await request(app).get(
      "/api/floorplan-builder/v1/active"
    );
    assert.equal(active.status, 200);
    assert.equal(active.body.ok, true);
    assert.ok(active.body.config.id);

    const bridge = await request(app).get(
      "/api/floorplan-builder/v1/security-bridge"
    );
    assert.equal(bridge.status, 200);
    assert.equal(bridge.body.ok, true);
    assert.ok(bridge.body.security.rooms.length > 0);
  });

  it("写真取り込みはカメラとアルバムを分離（captureはカメラのみ）", () => {
    const html = fs.readFileSync(
      path.join(publicDir, "tisly_3d_floorplan_builder.html"),
      "utf8"
    );
    assert.match(html, /id="fpb-file-camera"[^>]*capture="environment"/);
    assert.match(html, /id="fpb-file-library"/);
    assert.match(html, /フォルダ\/アルバムから選ぶ/);
    assert.match(html, /id="fpb-dropzone"/);
    // アルバム側に capture が付いていないこと
    const libraryBlock = html.match(
      /id="fpb-file-library"[^>]*>/
    )?.[0];
    assert.ok(libraryBlock);
    assert.equal(libraryBlock.includes("capture"), false);

    const js = fs.readFileSync(
      path.join(
        publicDir,
        "js/features/floorplan-builder/floorplan-builder-v1.js"
      ),
      "utf8"
    );
    assert.match(js, /fpb-file-camera/);
    assert.match(js, /fpb-file-library/);
    assert.match(js, /bindDropzone/);
    assert.match(js, /dataTransfer/);
  });

  it("白基調テーマ（CSS / 3Dクリアカラー）", () => {
    const css = fs.readFileSync(
      path.join(
        publicDir,
        "css/features/floorplan-builder/floorplan-builder-v1.css"
      ),
      "utf8"
    );
    assert.match(css, /--fpb-bg0:\s*#f8fafc/i);
    assert.match(css, /--fpb-card:\s*#ffffff/i);
    assert.match(css, /--fpb-text:\s*#0f172a/i);
    assert.match(css, /--fpb-line:\s*#e2e8f0/i);

    const js = fs.readFileSync(
      path.join(
        publicDir,
        "js/features/floorplan-builder/floorplan-builder-v1.js"
      ),
      "utf8"
    );
    assert.match(js, /setClearColor\(0xf8fafc/);
    assert.match(js, /0xbae6fd/);
  });

  it("ビルダー画面ルートが 200", async () => {
    const app = createApp();
    for (const p of [
      "/builder",
      "/floorplan-builder",
      "/app/builder",
      "/tisly_3d_floorplan_builder.html",
    ]) {
      const res = await request(app).get(p);
      assert.equal(res.status, 200, p);
      assert.match(String(res.text), /3D Floorplan Builder/);
      assert.match(String(res.text), /three/);
    }
  });

  it("Security HTML にブリッジ script が追記されている", () => {
    const html = fs.readFileSync(
      path.join(publicDir, "security-v1.html"),
      "utf8"
    );
    assert.match(html, /floorplan-security-bridge-v1\.js/);
    // 既存スクリプトは残す
    assert.match(html, /security-floor-light-v1\.js/);
    assert.match(html, /security-floor-operator-v1\.js/);
  });

  it("save API が JSON を受け付ける", async () => {
    const app = createApp();
    const cfg = createTsukubaModelHousePresetV1();
    cfg.id = "FP-TEST-SAVE-001";
    cfg.name = "API保存テスト";
    const res = await request(app)
      .post("/api/floorplan-builder/v1/save")
      .send(cfg);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.config.id, "FP-TEST-SAVE-001");
  });

  it("detect API が rule_based で部屋を返す", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/floorplan-builder/v1/detect")
      .send({ forceRuleBased: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.provider, "rule_based_v1");
    assert.ok(Array.isArray(res.body.rooms));
    assert.ok(res.body.rooms.length >= 8);
    const living = res.body.rooms.find((r: { label: string }) =>
      /リビング|和|洋|廊下|土間/.test(r.label)
    );
    assert.ok(living);
    assert.ok(living.w >= 6 && living.h >= 6);
    assert.ok(Array.isArray(res.body.roomPresets));
    assert.ok(res.body.roomPresets.includes("玄関"));
  });

  it("detect rule / gemini JSON パーサ単体", async () => {
    const { runFloorplanDetectRuleV1, normalizeDetectedRoomsV1 } =
      await import("../src/floorplan-builder/floorplan-detect-rule-v1.js");
    const rule = runFloorplanDetectRuleV1({
      rawTextHint: "リビング洋\n和10畳\n廊下",
    });
    assert.equal(rule.ok, true);
    assert.ok(rule.rooms.length > 5);
    assert.ok(rule.labelsFound.length >= 1);

    const norm = normalizeDetectedRoomsV1([
      { label: "寝室", x: -5, y: 10, w: 200, h: 12 },
      { label: "", x: 10, y: 10, w: 2, h: 2 },
    ]);
    assert.equal(norm.length, 2);
    assert.ok(norm[0].x >= 0);
    assert.ok(norm[0].w <= 96);
    assert.ok(norm[0].w >= 6);

    const { parseFloorplanDetectGeminiJsonV1 } = await import(
      "../src/floorplan-builder/floorplan-detect-gemini-v1.js"
    );
    const parsed = parseFloorplanDetectGeminiJsonV1(
      JSON.stringify({
        rawText: "リビング",
        rooms: [{ id: "r1", label: "リビング", x: 10, y: 10, w: 30, h: 20 }],
        openings: [{ id: "o1", kind: "entrance", label: "玄関", x: 50, y: 90 }],
      })
    );
    assert.ok(parsed);
    assert.equal(parsed!.rooms.length, 1);
    assert.equal(parsed!.openings.length, 1);
  });

  it("部屋エディタ / AI解析 / 背景アライメント UI が存在する", () => {
    const html = fs.readFileSync(
      path.join(publicDir, "tisly_3d_floorplan_builder.html"),
      "utf8"
    );
    assert.match(html, /id="fpb-detect"/);
    assert.match(html, /方眼紙をAI解析・間取り生成/);
    assert.match(html, /id="fpb-add-room"/);
    assert.match(html, /id="fpb-bg-zoom"/);
    assert.match(html, /id="fpb-bg-opacity"/);
    assert.match(html, /id="fpb-rename-sheet"/);
    assert.match(html, /id="fpb-device-palette"/);
    assert.match(html, /配置パレット/);
    assert.match(html, /id="fpb-preview"/);
    assert.match(html, /タップでピン配置/);

    const js = fs.readFileSync(
      path.join(
        publicDir,
        "js/features/floorplan-builder/floorplan-builder-v1.js"
      ),
      "utf8"
    );
    assert.match(js, /runAutoDetect/);
    assert.match(js, /\/api\/floorplan-builder\/v1\/detect/);
    assert.match(js, /addRoom/);
    assert.match(js, /deleteRoom/);
    assert.match(js, /openRenameSheet/);
    assert.match(js, /ensureBgTransform/);
    assert.match(js, /data-handle/);
    assert.match(js, /addDeviceAt/);
    assert.match(js, /bindDevicePalette/);
    assert.match(js, /bind3dPinInteraction/);
    assert.match(js, /createNeonPinMesh3d/);
    assert.match(js, /Raycaster/);
    assert.match(js, /floorHasContent/);
    assert.match(js, /緑外壁フレーム/);
    assert.match(js, /worldX/);
    assert.doesNotMatch(js, /CSS2DObject/);
  });

  it("デバイス配置が security bridge に 3D 座標付きで含まれる", () => {
    const hiraya = createHirayaDemoPresetV1();
    assert.ok((hiraya.security.devices?.length || 0) >= 3);
    const floor1 = hiraya.floors.find((f) => f.id === "1f");
    assert.ok((floor1?.devices?.length || 0) >= 3);
    assert.equal(hiraya.floors.find((f) => f.id === "2f")?.enabled, false);
    const d0 = hiraya.security.devices?.[0];
    assert.ok(d0);
    assert.ok(typeof d0!.x === "number");
    assert.ok(typeof d0!.y === "number");
    assert.ok(typeof d0!.z === "number");
    assert.ok(typeof d0!.worldX === "number");
    assert.ok(typeof d0!.worldY === "number");
    assert.ok(typeof d0!.worldZ === "number");
    assert.ok(d0!.kind);
  });
});
