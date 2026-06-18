/** 見積マスター v1 カテゴリ強化 — シードデータ（マイグレーション用） */

import type Database from "better-sqlite3";
import { MASTER_V1_CATEGORY_SEED } from "./master-v1-categories.js";

export function seedMasterV1Categories(database: Database.Database): void {
  const now = new Date().toISOString();
  const insCat = database.prepare(
    `INSERT OR IGNORE INTO master_v1_categories (id, kind, category_main, category_sub, sort_order, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
  );
  for (const c of MASTER_V1_CATEGORY_SEED) {
    const id = `cat-${c.categoryMain}-${c.categorySub}`.replace(/[/\s]+/g, "-");
    insCat.run(id, c.kind, c.categoryMain, c.categorySub, c.sortOrder, now, now);
  }
}

export function seedMasterV1CategorySamples(database: Database.Database): void {
  const now = new Date().toISOString();

  const insWork = database.prepare(
    `INSERT OR IGNORE INTO master_v1_work_items (
      id, category, category_main, category_sub, code, name, unit, default_quantity,
      standard_cost, labor_cost, standard_sell_price, tags, memo, favorite, sort_order, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );

  type WorkRow = [
    string, string, string, string, string, string, string, number,
    number, number, number, string, string, number, number,
  ];

  const works: WorkRow[] = [
    ["work-camera-install", "防犯カメラ", "防犯カメラ", "カメラ設置", "W-CAM-INST", "カメラ設置", "台", 1, 15000, 8000, 28000, '["カメラ","設置"]', "ドーム/バレット共通", 1, 1],
    ["work-dome-camera", "防犯カメラ", "防犯カメラ", "カメラ設置", "W-DOME", "ドームカメラ設置", "台", 1, 16000, 8000, 30000, '["ドーム","カメラ"]', "", 1, 2],
    ["work-bullet-camera", "防犯カメラ", "防犯カメラ", "カメラ設置", "W-BULLET", "バレットカメラ設置", "台", 1, 17000, 9000, 32000, '["バレット","カメラ"]', "", 1, 3],
    ["work-lan-wiring", "LAN / ネットワーク", "LAN / ネットワーク", "LAN配線", "W-LAN", "LAN配線", "m", 1, 800, 500, 1500, '["LAN","配線"]', "UTPケーブル敷設", 1, 4],
    ["work-lan-term", "LAN / ネットワーク", "LAN / ネットワーク", "LAN端末処理", "W-LAN-TERM", "LAN端末処理", "点", 1, 1200, 600, 2200, '["RJ45","端末"]', "", 1, 5],
    ["work-nvr-setup", "防犯カメラ", "防犯カメラ", "NVR設定", "W-NVR", "NVR設定", "式", 1, 20000, 10000, 35000, '["NVR","設定"]', "録画機初期設定", 1, 6],
    ["work-smartphone-setup", "防犯カメラ", "防犯カメラ", "スマホ設定", "W-SMART", "スマホ設定", "式", 1, 8000, 4000, 15000, '["アプリ","設定"]', "", 1, 7],
    ["work-monitor-setup", "防犯カメラ", "防犯カメラ", "モニター設定", "W-MON", "モニター設定", "台", 1, 10000, 5000, 18000, '["モニター"]', "", 1, 8],
    ["work-poe-switch", "防犯カメラ", "防犯カメラ", "PoEスイッチ", "W-POE-SW", "PoEスイッチ設定", "台", 1, 12000, 6000, 20000, '["PoE","スイッチ"]', "", 1, 9],
    ["work-waterproof", "防犯カメラ", "防犯カメラ", "カメラ設置", "W-WP", "屋外防水処理", "式", 1, 5000, 3000, 10000, '["防水","屋外"]', "", 0, 10],
    ["work-mold", "LAN / ネットワーク", "LAN / ネットワーク", "モール配線", "W-MOLD", "モール施工", "m", 1, 600, 400, 1200, '["モール"]', "", 0, 11],
    ["work-penetrate", "LAN / ネットワーク", "LAN / ネットワーク", "貫通処理", "W-PEN", "貫通処理", "箇所", 1, 8000, 5000, 15000, '["貫通","穴あけ"]', "", 0, 12],
    ["work-highplace", "防犯カメラ", "防犯カメラ", "高所作業", "W-HIGH", "高所作業", "式", 1, 15000, 10000, 28000, '["高所","足場"]', "TODO: 足場費別途", 0, 13],
    ["work-survey", "現調 / 設計", "現調 / 設計", "現調", "W-SURVEY", "現調", "式", 1, 0, 15000, 25000, '["現調"]', "", 1, 14],
    ["work-report", "現調 / 設計", "現調 / 設計", "完了報告", "W-REPORT", "完了報告書作成", "式", 1, 0, 8000, 12000, '["報告書"]', "", 0, 15],
    ["work-ap-install", "Wi-Fi / AP", "Wi-Fi / AP", "AP設置", "W-AP", "AP設置", "台", 1, 12000, 6000, 22000, '["AP","Wi-Fi"]', "", 1, 16],
    ["work-router-setup", "LAN / ネットワーク", "LAN / ネットワーク", "ルーター設定", "W-ROUTER", "ルーター設定", "式", 1, 8000, 5000, 15000, '["ルーター"]', "", 0, 17],
    ["work-sensor-install", "セキュリティ", "セキュリティ", "センサー", "W-SENSOR", "センサー設置", "台", 1, 6000, 4000, 12000, '["センサー"]', "", 0, 18],
    ["work-power-wiring", "電気工事", "電気工事", "配線", "W-PWR", "電源配線", "m", 1, 600, 400, 1200, '["電源","配線"]', "100V/24V", 0, 19],
  ];

  for (const row of works) {
    const [id, cat, main, sub, code, name, unit, dq, sc, lc, sell, tags, memo, fav, sort] = row;
    insWork.run(id, cat, main, sub, code, name, unit, dq, sc, lc, sell, tags, memo, fav, sort, now, now);
  }

  const updWork = database.prepare(
    `UPDATE master_v1_work_items SET category = ?, category_main = ?, category_sub = ?, name = ?, unit = ?,
      default_quantity = ?, standard_cost = ?, labor_cost = ?, standard_sell_price = ?, tags = ?, memo = ?,
      favorite = ?, sort_order = ?, updated_at = ? WHERE id = ?`
  );
  for (const row of works) {
    const [id, cat, main, sub, , name, unit, dq, sc, lc, sell, tags, memo, fav, sort] = row;
    updWork.run(cat, main, sub, name, unit, dq, sc, lc, sell, tags, memo, fav, sort, now, id);
  }

  const insMat = database.prepare(
    `INSERT OR IGNORE INTO master_v1_materials (
      id, category, category_main, category_sub, code, name, maker, model, supplier, unit, default_quantity,
      cost, standard_sell_price, stock_managed, tags, memo, favorite, sort_order, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );

  type MatRow = [
    string, string, string, string, string, string, string | null, string | null, string | null,
    string, number, number, number, number, string, string, number, number,
  ];

  const mats: MatRow[] = [
    ["mat-v1-lan-cable", "LAN / ネットワーク", "LAN / ネットワーク", "LAN配線", "M-LAN", "LANケーブル", "汎用", "Cat6 UTP", "電材店A", "m", 1, 120, 250, 1, '["LAN","ケーブル"]', "屋外対応", 1, 1],
    ["mat-rj45", "LAN / ネットワーク", "LAN / ネットワーク", "LAN端末処理", "M-RJ45", "RJ45コネクタ", "汎用", "Cat6", "電材店A", "個", 1, 50, 120, 1, '["RJ45","コネクタ"]', "", 1, 2],
    ["mat-waterproof-box", "防犯カメラ", "防犯カメラ", "カメラ設置", "M-WP-BOX", "防水ボックス", "汎用", "WP-100", "電材店B", "個", 1, 2500, 4500, 0, '["防水","ボックス"]', "", 1, 3],
    ["mat-pf-pipe", "LAN / ネットワーク", "LAN / ネットワーク", "モール配線", "M-PF", "PF管", "汎用", "16mm", "電材店A", "m", 1, 180, 350, 0, '["PF管","配管"]', "", 0, 4],
    ["mat-mold", "LAN / ネットワーク", "LAN / ネットワーク", "モール配線", "M-MOLD", "モール", "汎用", "40×20", "電材店A", "m", 1, 350, 600, 0, '["モール"]', "", 1, 5],
    ["mat-poe-switch", "防犯カメラ", "防犯カメラ", "PoEスイッチ", "M-POE-SW", "PoEスイッチ", "TiSLY", "PS-8P", "TiSLY", "台", 1, 12000, 22000, 1, '["PoE","スイッチ"]', "8port", 1, 6],
    ["mat-v1-nvr", "防犯カメラ", "防犯カメラ", "NVR設定", "M-NVR", "NVR", "TiSLY", "NVR-4", "TiSLY", "台", 1, 45000, 75000, 1, '["NVR","録画"]', "4ch", 1, 7],
    ["mat-hdd", "防犯カメラ", "防犯カメラ", "NVR設定", "M-HDD", "HDD", "Seagate", "4TB", "TiSLY", "台", 1, 12000, 18000, 1, '["HDD","録画"]', "", 0, 8],
    ["mat-v1-dome-cam", "防犯カメラ", "防犯カメラ", "カメラ設置", "M-DOME", "ドームカメラ", "TiSLY", "DC-200", "TiSLY", "台", 1, 18000, 36000, 1, '["カメラ","ドーム"]', "", 1, 9],
    ["mat-v1-bullet-cam", "防犯カメラ", "防犯カメラ", "カメラ設置", "M-BULLET", "バレットカメラ", "TiSLY", "BC-300", "TiSLY", "台", 1, 22000, 42000, 1, '["カメラ","バレット"]', "", 1, 10],
    ["mat-camera-generic", "防犯カメラ", "防犯カメラ", "カメラ設置", "M-CAM", "カメラ", "汎用", "汎用", "TiSLY", "台", 1, 20000, 38000, 0, '["カメラ"]', "型番未指定", 0, 11],
    ["mat-hdmi", "防犯カメラ", "防犯カメラ", "モニター設定", "M-HDMI", "HDMIケーブル", "汎用", "2m", "電材店A", "本", 1, 800, 1500, 0, '["HDMI"]', "", 0, 12],
    ["mat-monitor", "防犯カメラ", "防犯カメラ", "モニター設定", "M-MON", "モニター", "汎用", "10inch", "電材店B", "台", 1, 15000, 28000, 0, '["モニター"]', "", 0, 13],
    ["mat-cable-tie", "その他", "その他", "その他", "M-TIE", "結束バンド", "汎用", "200mm", "電材店A", "袋", 1, 300, 600, 1, '["結束"]', "100本入", 1, 14],
    ["mat-caulk", "その他", "その他", "その他", "M-CAULK", "コーキング", "汎用", "シリコン", "電材店A", "本", 1, 500, 900, 0, '["コーキング","防水"]', "", 0, 15],
    ["mat-screw", "その他", "その他", "その他", "M-SCREW", "ビス", "汎用", "4×25", "電材店A", "袋", 1, 200, 400, 1, '["ビス"]', "", 0, 16],
    ["mat-anchor", "その他", "その他", "その他", "M-ANCHOR", "アンカー", "汎用", "M8", "電材店A", "個", 1, 80, 150, 1, '["アンカー"]', "", 0, 17],
    ["mat-v1-ap", "Wi-Fi / AP", "Wi-Fi / AP", "AP設置", "M-AP", "無線AP", "Ubiquiti", "U6-Pro", "TiSLY", "台", 1, 25000, 45000, 1, '["AP","Wi-Fi"]', "", 1, 18],
    ["mat-v1-switch", "LAN / ネットワーク", "LAN / ネットワーク", "スイッチ設定", "M-SW", "8port スイッチ", "汎用", "SW-8", "電材店A", "台", 1, 8000, 14000, 0, '["スイッチ"]', "", 0, 19],
    ["mat-v1-poe-injector", "防犯カメラ", "防犯カメラ", "PoEスイッチ", "M-POE", "PoEインジェクター", "汎用", "PoE+", "電材店A", "台", 1, 3500, 6000, 0, '["PoE"]', "", 0, 20],
  ];

  for (const row of mats) {
    const [id, cat, main, sub, code, name, maker, model, supplier, unit, dq, cost, sell, stock, tags, memo, fav, sort] = row;
    insMat.run(id, cat, main, sub, code, name, maker, model, supplier, unit, dq, cost, sell, stock, tags, memo, fav, sort, now, now);
  }

  const updMat = database.prepare(
    `UPDATE master_v1_materials SET category = ?, category_main = ?, category_sub = ?, name = ?, maker = ?, model = ?,
      supplier = ?, unit = ?, default_quantity = ?, cost = ?, standard_sell_price = ?, stock_managed = ?, tags = ?,
      memo = ?, favorite = ?, sort_order = ?, updated_at = ? WHERE id = ?`
  );
  for (const row of mats) {
    const [id, cat, main, sub, , name, maker, model, supplier, unit, dq, cost, sell, stock, tags, memo, fav, sort] = row;
    updMat.run(cat, main, sub, name, maker, model, supplier, unit, dq, cost, sell, stock, tags, memo, fav, sort, now, id);
  }

  seedMasterV1SymbolMappingsV2(database, now);
}

function seedMasterV1SymbolMappingsV2(database: Database.Database, now: string): void {
  const upd = database.prepare(
    `UPDATE master_v1_symbol_mappings SET
      category_main = ?, category_sub = ?, work_item_id = ?, material_id = ?,
      extra_material_ids = ?, memo = ?, updated_at = ?
    WHERE id = ?`
  );

  upd.run(
    "防犯カメラ", "カメラ設置", "work-dome-camera", "mat-v1-dome-cam",
    '["mat-v1-lan-cable","mat-rj45","mat-waterproof-box"]',
    "dome_camera → ドーム設置 + LAN/RJ45/防水ボックス", now, "map-dome-cam"
  );
  upd.run(
    "防犯カメラ", "カメラ設置", "work-bullet-camera", "mat-v1-bullet-cam",
    '["mat-v1-lan-cable","mat-rj45","mat-waterproof-box"]',
    "bullet_camera → バレット設置", now, "map-bullet-cam"
  );
  upd.run(
    "防犯カメラ", "カメラ設置", "work-camera-install", "mat-v1-dome-cam",
    '["mat-v1-lan-cable","mat-rj45"]',
    "camera v1互換", now, "map-camera"
  );
  upd.run(
    "LAN / ネットワーク", "LAN配線", "work-lan-wiring", "mat-v1-lan-cable",
    '["mat-rj45"]',
    "lan_port 端子", now, "map-lan-port"
  );
  upd.run(
    "LAN / ネットワーク", "LAN配線", "work-lan-wiring", "mat-v1-lan-cable",
    '["mat-rj45","mat-mold"]',
    "lan 線種 → LAN配線 + ケーブル/RJ45/モール", now, "map-lan-line"
  );

  const insMap = database.prepare(
    `INSERT OR IGNORE INTO master_v1_symbol_mappings (
      id, mapping_kind, symbol_type, label, category_main, category_sub,
      work_item_id, material_id, extra_material_ids, qty_per_unit, memo, sort_order, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );

  const extra: Array<[string, string, string, string, string, string, string | null, string | null, string, number, string, number]> = [
    ["map-ap", "symbol", "access_point", "AP", "Wi-Fi / AP", "AP設置", "work-ap-install", "mat-v1-ap", "[]", 1, "", 5],
    ["map-nvr", "symbol", "nvr", "NVR", "防犯カメラ", "NVR設定", "work-nvr-setup", "mat-v1-nvr", '["mat-hdd"]', 1, "", 6],
    ["map-router", "symbol", "router", "ルーター", "LAN / ネットワーク", "ルーター設定", "work-router-setup", null, "[]", 1, "", 7],
    ["map-switch", "symbol", "network_switch", "スイッチ", "LAN / ネットワーク", "スイッチ設定", "work-poe-switch", "mat-poe-switch", "[]", 1, "", 8],
    ["map-pir", "symbol", "pir_sensor", "人感センサー", "セキュリティ", "センサー", "work-sensor-install", null, "[]", 1, "", 9],
    ["map-power100v", "line", "power100v", "100V配線", "電気工事", "配線", "work-power-wiring", null, "[]", 1, "", 11],
    ["map-power24v", "line", "power24v", "24V配線", "電気工事", "配線", "work-power-wiring", null, "[]", 1, "", 12],
  ];

  for (const [id, kind, sym, label, main, sub, wid, mid, extras, qty, memo, sort] of extra) {
    insMap.run(id, kind, sym, label, main, sub, wid, mid, extras, qty, memo, sort, now, now);
  }
}
