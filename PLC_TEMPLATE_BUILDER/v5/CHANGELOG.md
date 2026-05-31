# TiSLY PLC Builder v5 — CHANGELOG

## v5.15 — Node-RED Flow Generator

- `estimate_mode/node_red_flow_generator.py` 追加 — NODE_RED_CONFIG / DEVICE_MAP / MQTT_TOPICS から **TISLY_FLOWS.json** 自動生成
- 生成ノード: MQTT Broker / MQTT Input Hub / Alarm Handler / Motion Handler / Output Control / Push Notification Placeholder / Debug Logger / MQTT Status Publish / TiSLY UI Placeholder
- Node-RED インポート可能な配列 JSON（各ノードに id / type / name / wires）
- トピック: alarm / motion / output / state / cmd
- `--node-red-flow` モード追加
- `--full-spec` / `--estimate-plus` / `--quote-ready` / `--toms-site-report` でも TISLY_FLOWS.json を自動生成
- 監査: TISLY_FLOWS.json 存在 / JSON 妥当性 / mqtt in・out / function / debug / broker / 全トピック / 総合判定 PASS
- 次版候補: v5.16 TiSLY UI Dashboard Template

## v5.14 — TiSLY Integration Engine

- `estimate_mode/tisly_integration_generator.py` 追加 — PLC I/O → TiSLY 連携設定自動生成
- `generated_projects/<案件名>/TISLY/` 配下に 5 ファイル出力:
  - `DEVICE_MAP.csv` — PLC デバイス ↔ TiSLY 名称 / 信号種別
  - `MQTT_TOPICS.md` — MQTT トピック定義
  - `ESP_CONFIG.json` — ESP32 ゲートウェイ設定
  - `NODE_RED_CONFIG.json` — Node-RED 連携設定
  - `TISLY_SYSTEM.md` — 案件システム概要（PLC / ESP / MQTT / Node-RED / Push / 将来連携）
- パイプライン拡張: 案件情報 → PLC設計 → **TiSLY設定** → **ESP設定** → **MQTT設定** → **Node-RED設定** → 見積 → 現調報告書
- `--toms-site-report` / `--full-spec` / `--estimate-plus` / `--quote-ready` / `--quote-excel` / `--toms-estimate` で TISLY/ 自動生成
- 監査: TISLY/ 5 ファイル存在 / 内容検証 / 総合判定 PASS
- v5.15 設計書: `docs/V5_15_NODE_RED_FLOW_DESIGN.md`

## v5.13 — TOMS 現調報告書自動生成

- `estimate_mode/site_report_generator.py` 追加 — 案件情報 / I/O / PLC_SELECTION / 見積生成物 → **TOMS_SITE_REPORT.md**
- 8 セクション構成（案件基本情報 / 現調概要 / I/O割り当て / PLC容量確認 / 配線メモ / 施工前確認 / 見積連携 / TiSLY連携予定）
- `--toms-site-report` モード追加
- `--full-spec` / `--estimate-plus` / `--quote-ready` / `--quote-excel` / `--toms-estimate` でも TOMS_SITE_REPORT.md を自動生成
- 監査: TOMS_SITE_REPORT.md 存在 / 全セクション / 総合判定 PASS

## v5.12 — TOMS 標準見積書自動生成

- `estimate_mode/estimate_sheet_generator.py` 追加 — TOMS_QUOTE_ITEMS.csv → **TOMS_ESTIMATE.xlsx**
- `estimate_mode/estimate_header.json` 追加（company_name / customer_name / project_name / issue_date / estimate_no / person_in_charge）
- TOMS 標準フォーマットセルマッピング（G1 発行日 / G2 見積番号 / C6 宛名 / D9 件名 / D17・G49 税込合計 / G47 小計 / G48 消費税）
- 備考自動生成（仮単価・現地確認・PLC容量判定・増設時再見積）
- `--toms-estimate` モード追加
- 監査: TOMS_ESTIMATE.xlsx 存在 / 宛名 / 件名 / 項目 / 小計 / 消費税 / 税込合計 / 備考

## v5.11 — 単価・金額自動計算

- 単価マスター `estimate_mode/price_master.csv` を追加（仮単価）
- `cost_estimator.py` 強化 — BOM.csv と price_master.csv を突合し単価・金額・税込合計を自動計算
- `SPEC/ROUGH_ESTIMATE.csv` 生成（Subtotal / Tax / Total 行付き）
- `TOMS_QUOTE_ITEMS.csv` に UnitPrice / Amount を自動入力
- `TOMS_QUOTE_SUMMARY.md` に **概算金額** セクション追加
- `TOMS_QUOTE.xlsx` に単価・金額・小計・消費税・税込合計を反映
- 監査: price_master 存在 / ROUGH_ESTIMATE.csv / UnitPrice / Amount / 小計・税・合計 / Excel 合計行
- **仮単価注意**: 正式見積前に部材単価を必ず確認すること

## v5.10 — PLC_SELECTION 連携強化

- PLC 容量判定結果を SITE_SURVEY / TOMS_QUOTE / PROJECT_README / TEST_REPORT へ自動反映
- `SITE_SURVEY.md` に **PLC容量確認** セクション追加（現場確認メモ含む）
- `TOMS_QUOTE.xlsx` に **PLC容量判定** シート追加
- `TOMS_QUOTE_SUMMARY.md` に **PLC容量判定** セクション追加
- `PROJECT_README.md` に **PLC容量・拡張判定** セクション追加
- `TEST_REPORT.md` に **PLC_SELECTION連携チェック** セクション追加
- 全見積モードで `PLC_SELECTION.md` 生成・連携監査 PASS

## v5.9 — PLC容量自動選定強化

- `estimate_mode/plc_selection_generator.py` 追加
- 入力/出力点数から余裕率（使用率・余裕点数）を自動計算
- PLC 選定ルール強化（70% 注意 / 80% 1ランク上推奨 / 90% 不適合）
- 拡張ユニット提案（FX5U-16EX / FX5U-16EYR）
- `PLC_SELECTION.md` 自動生成（`--full-spec` / `--estimate-mode` / `--estimate-plus` / `--quote-ready`）
- 監査: PLC_SELECTION 存在 / 使用点数 / 余裕率 / 判定 / 推奨PLC

## v5.8 — 現調シート生成

- `estimate_mode/site_survey_generator.py` 追加
- `--site-survey` モード追加（見積メモ → TOMS Excel → **SITE_SURVEY.md**）
- 機器設置チェックリスト / I/O 現調表 / 盤・電源確認項目を自動生成
- 監査: 機器行数一致 / チェックリスト存在

## v5.7 — TOMS 見積 Excel 出力

- `estimate_mode/excel_exporter.py` 追加（stdlib のみで xlsx 生成、openpyxl 不要）
- `--quote-excel` モード追加（見積メモ → BOM → TOMS CSV → **TOMS_QUOTE.xlsx**）
- xlsx 監査: 形式有効 / 見積明細行数 / PLC・24V電源項目
- シート構成: `見積明細` + `案件情報`

## v5.6 — TOMS 見積 CSV 連携準備

- `TOMS_QUOTE_ITEMS.csv` / `TOMS_QUOTE_SUMMARY.md` 自動生成
- `--quote-ready` モード追加
- BOM → TOMS 見積行マッピング（`quote_mapper.py`）

## v5.5 — BOM / 施工メモ / 発注メモ

- `BOM.csv` / `ROUGH_ESTIMATE.md` / `INSTALL_NOTES.md` / `ORDER_MEMO.md`
- `--estimate-plus` モード追加

## v5.4 — 見積メモ対応

- 見積メモ形式入力（`estimate_parser.py` / `parts_mapper.py`）
- `--estimate-mode` モード追加

## v5.3 — Full Spec

- 自然文 → PLC 仕様書 → I/O → 配線 → GX → 案件生成
- `--full-spec` モード / `spec_generator/` パッケージ

## v5.2 — NLP 推定

- 日本語文章 → テンプレート推定（`nlp/` モジュール）
- `--nl` モード

## v5.1 — テンプレート化

- 5 用途別テンプレート（HOME / CARSHOP / WAREHOUSE / MINPAKU / FACTORY）
- `--template` / `--test-all-templates`

## v5.0 — 案件生成

- 見積 + 顧客入力 → 仕様書 → GX Works3 → 配線図 → 納品フォルダ
