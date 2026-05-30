# TiSLY PLC Builder v5 — CHANGELOG

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
