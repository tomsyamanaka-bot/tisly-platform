/** 防犯カメラ工事 — 作業50・材料50 仮シード */

import type Database from "better-sqlite3";

const WORK_SUBS = [
  { main: "防犯カメラ", sub: "カメラ設置", unit: "台" },
  { main: "防犯カメラ", sub: "LAN配線", unit: "m" },
  { main: "防犯カメラ", sub: "NVR設定", unit: "式" },
  { main: "防犯カメラ", sub: "モニター設定", unit: "台" },
  { main: "防犯カメラ", sub: "スマホ設定", unit: "式" },
  { main: "防犯カメラ", sub: "屋外防水", unit: "式" },
  { main: "LAN / ネットワーク", sub: "モール施工", unit: "m" },
  { main: "LAN / ネットワーク", sub: "貫通", unit: "箇所" },
  { main: "防犯カメラ", sub: "高所作業", unit: "式" },
  { main: "防犯カメラ", sub: "調整・試験", unit: "式" },
];

const WORK_NAMES = [
  "玄関ドームカメラ設置",
  "駐車場バレット設置",
  "倉庫死角カメラ設置",
  "EV充電器付近カメラ設置",
  "共用廊下カメラ設置",
  "エントランスカメラ設置",
  "裏口カメラ設置",
  "受付カウンターカメラ設置",
  "機械室カメラ設置",
  "ゴミ置き場カメラ設置",
  "LAN配線（屋内）",
  "LAN配線（屋外）",
  "PoE配線",
  "NVR初期設定",
  "NVR録画設定",
  "HDDフォーマット",
  "リモート視聴設定",
  "モニター壁掛け",
  "モニター卓上設置",
  "スマホアプリ連携",
  "プッシュ通知設定",
  "屋外防水コーキング",
  "防水ボックス取付",
  "モール配線（天井）",
  "モール配線（床下）",
  "壁貫通（木造）",
  "壁貫通（RC）",
  "高所作業（はしご）",
  "高所作業（リフト）",
  "画角調整",
  "夜間試験",
  "録画試験",
  "モーション試験",
  "AP設置連携",
  "ルーター設定連携",
  "PoEスイッチ設定",
  "UPS設置連携",
  "電源工事連携",
  "アース施工",
  "結束・整理",
  "現場清掃",
  "取説説明",
  "保守設定",
  "ユーザー登録",
  "バックアップ設定",
  "ネットワーク試験",
  "帯域試験",
  "赤外線試験",
  "音声試験（双方向）",
  "完了報告準備",
];

const MAT_SUBS = [
  { main: "防犯カメラ", sub: "カメラ設置" },
  { main: "LAN / ネットワーク", sub: "LAN配線" },
  { main: "防犯カメラ", sub: "NVR設定" },
  { main: "防犯カメラ", sub: "モニター設定" },
  { main: "防犯カメラ", sub: "屋外防水" },
  { main: "LAN / ネットワーク", sub: "モール施工" },
  { main: "LAN / ネットワーク", sub: "貫通" },
  { main: "防犯カメラ", sub: "調整・試験" },
];

const MAT_NAMES = [
  "ドームカメラ 200万",
  "バレットカメラ 400万",
  "タurretカメラ",
  "LANケーブル Cat6",
  "LANケーブル Cat6A 屋外",
  "RJ45コネクタ",
  "防水RJ45",
  "NVR 4ch",
  "NVR 8ch",
  "HDD 2TB",
  "HDD 4TB",
  "PoEスイッチ 8port",
  "PoEインジェクター",
  "10inchモニター",
  "HDMIケーブル",
  "防水ボックス",
  "シリコンコーキング",
  "モール 40×20",
  "PF管 16mm",
  "壁貫通スリーブ",
  "アンカービス M8",
  "結束バンド",
  "配管テープ",
  "ケーブルクリップ",
  "サージプロテクター",
  "UPS 500VA",
  "電源タップ",
  "延長コード",
  "アース棒",
  "アース線",
  "カメラブラケット",
  "ポール取付金具",
  "防犯ステッカー",
  "警告プレート",
  "MicroSD 128GB",
  "USBメモリ（設定用）",
  "ラベルシール",
  "配線用結束",
  "養生テープ",
  "作業用手袋",
  "マスキングテープ",
  "両面テープ（強力）",
  "シーリングワイヤー",
  "配線ダクト",
  "角型ダクト",
  "通線ワイヤー",
  "グリス（防水）",
  "防錆スプレー",
  "配線标识",
  "現場用工具セット",
];

export function seedMasterV1CameraExpanded(database: Database.Database): void {
  const now = new Date().toISOString();
  const countWork = (
    database.prepare(`SELECT COUNT(*) as c FROM master_v1_work_items`).get() as { c: number }
  ).c;
  const countMat = (
    database.prepare(`SELECT COUNT(*) as c FROM master_v1_materials`).get() as { c: number }
  ).c;

  const insWork = database.prepare(
    `INSERT OR IGNORE INTO master_v1_work_items (
      id, category, category_main, category_sub, code, name, unit, default_quantity,
      standard_cost, labor_cost, standard_sell_price, tags, memo, favorite, sort_order, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, '[]', ?, 0, ?, 1, ?, ?)`
  );

  const insMat = database.prepare(
    `INSERT OR IGNORE INTO master_v1_materials (
      id, category, category_main, category_sub, code, name, maker, model, supplier, unit, default_quantity,
      cost, standard_sell_price, stock_managed, tags, memo, favorite, sort_order, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'TiSLY', ?, ?, ?, 1, ?, ?, 0, '[]', ?, 0, ?, 1, ?, ?)`
  );

  let workAdded = 0;
  for (let i = countWork; i < 50; i++) {
    const sub = WORK_SUBS[i % WORK_SUBS.length];
    const name = WORK_NAMES[i % WORK_NAMES.length];
    const id = `work-cam-exp-${String(i + 1).padStart(3, "0")}`;
    const code = `W-CAM-${String(i + 1).padStart(3, "0")}`;
    const sc = 5000 + (i % 10) * 1000;
    const lc = 3000 + (i % 8) * 500;
    const sell = sc + lc + 8000;
    const r = insWork.run(
      id,
      sub.main,
      sub.main,
      sub.sub,
      code,
      name,
      sub.unit,
      sc,
      lc,
      sell,
      "防犯カメラ仮データ",
      100 + i,
      now,
      now
    );
    if (r.changes > 0) workAdded++;
  }

  let matAdded = 0;
  for (let i = countMat; i < 50; i++) {
    const sub = MAT_SUBS[i % MAT_SUBS.length];
    const name = MAT_NAMES[i % MAT_NAMES.length];
    const id = `mat-cam-exp-${String(i + 1).padStart(3, "0")}`;
    const code = `M-CAM-${String(i + 1).padStart(3, "0")}`;
    const cost = 500 + (i % 15) * 400;
    const sell = cost * 2;
    const model = i % 3 === 0 ? "" : `MDL-${1000 + i}`;
    const supplier = i % 4 === 0 ? "" : "電材店A";
    const r = insMat.run(
      id,
      sub.main,
      sub.main,
      sub.sub,
      code,
      name,
      model || null,
      supplier || null,
      i % 5 === 0 ? "m" : "個",
      cost,
      sell,
      "防犯カメラ仮データ",
      100 + i,
      now,
      now
    );
    if (r.changes > 0) matAdded++;
  }

  // 未入力サンプル（フィルタ検証用）
  insWork.run(
    "work-missing-sample",
    "防犯カメラ",
    "防犯カメラ",
    "",
    "W-MISS",
    "原価未入力サンプル作業",
    "式",
    0,
    0,
    0,
    "missing filter sample",
    999,
    now,
    now
  );
  insMat.run(
    "mat-missing-sample",
    "防犯カメラ",
    "防犯カメラ",
    "カメラ設置",
    "M-MISS",
    "仕入先型番未入力サンプル",
    null,
    null,
    "個",
    0,
    0,
    "missing filter sample",
    999,
    now,
    now
  );

  console.log(
    `[master-v1] camera seed: work+${workAdded} materials+${matAdded} (target 50 each)`
  );
}
