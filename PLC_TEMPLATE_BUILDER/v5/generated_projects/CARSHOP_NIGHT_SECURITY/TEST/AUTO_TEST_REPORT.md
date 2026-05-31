# AUTO_TEST_REPORT — TiSLY PLC Builder v5.14

> 全生成物存在確認 + 監査 PASS 確認

---

## 実行概要

| 項目 | 値 |
|------|-----|
| 実行日時 (UTC) | 2026-05-31T03:14:20Z |
| 対象 | CARSHOP_NIGHT_SECURITY |
| テスト | 全生成物存在確認 / GX 監査 |

---

## チェックリスト

- ✓ 入力点数 PLC 容量内: 使用 8 / 最大 14
- ✓ 出力点数 PLC 容量内: 使用 5 / 最大 10
- ✓ M8012 チェック: 0 件
- ✓ M8013 チェック: 0 件
- ✓ SM412 チェック: 1 件
- ✓ SM413 チェック: 2 件
- ✓ OUT 重複チェック: 重複なし
- ✓ OUT Y0 チェック: 1 回
- ✓ END チェック: 末尾 END
- ✓ I/O 重複なし: 重複なし
- ✓ PLC_PROGRAM/GX3_COMMANDS.txt 存在: OK
- ✓ SPEC/IO_ASSIGNMENT.csv 存在: OK
- ✓ DRAWING/WIRING_DIAGRAM.md 存在: OK
- ✓ TEST/TEST_REPORT.md 存在: OK
- ✓ PROJECT_META.json 存在: OK
- ✓ SPEC/PROJECT_SPEC.md 存在: OK
- ✓ README.md 存在: OK
- ✓ 入力 I/O 不足: 8 点割付済
- ✓ 出力 I/O 不足: 5 点割付済
- ✓ 未使用点: 入力余裕 6 点 / 出力余裕 5 点（合計 11 点）
- ✓ price_master.csv 存在: OK
- ✓ BOM.csv 存在: OK
- ✓ ROUGH_ESTIMATE.md 存在: OK
- ✓ ROUGH_ESTIMATE.csv 存在: OK
- ✓ 概算単価あり: 小計 213,000 円
- ✓ 小計計算: 213,000 円
- ✓ 消費税計算: 21,300 円
- ✓ 税込合計計算: 234,300 円
- ✓ ROUGH_ESTIMATE.csv 合計行: Subtotal/Tax/Total
- ✓ INSTALL_NOTES.md 存在: OK
- ✓ ORDER_MEMO.md 存在: OK
- ✓ PLC型番あり: FX5UJ-24MR/ES
- ✓ 電源型番あり: MeanWell HDR-60-24
- ✓ TOMS_QUOTE_ITEMS.csv 存在: OK
- ✓ TOMS_QUOTE_SUMMARY.md 存在: OK
- ✓ No 連番: 8 行
- ✓ Qty 空欄なし: OK
- ✓ UnitPrice 入力: OK
- ✓ Amount 入力: OK
- ✓ Amount 計算: Qty×UnitPrice
- ✓ TOMS 概算金額: 概算金額セクション
- ✓ PLC項目あり: PLC
- ✓ 24V電源項目あり: 24V電源
- ✓ TOMS_QUOTE.xlsx 存在: OK
- ✓ xlsx 形式有効: OK
- ✓ 見積明細行数: 12 行（期待 12 行）
- ✓ Excel 単価・金額欄: UnitPrice/Amount
- ✓ Excel 小計・税・合計: 小計/消費税/税込合計
- ✓ Excel PLC項目: PLC
- ✓ Excel 24V電源項目: 24V電源
- ✓ TOMS_ESTIMATE.xlsx 存在: OK
- ✓ 見積書 宛名: 車屋展示場 夜間監視
- ✓ 見積書 件名: 車屋展示場 夜間監視
- ✓ 見積書 項目: 8 件
- ✓ 見積書 小計: 小計
- ✓ 見積書 消費税: 消費税
- ✓ 見積書 税込合計: 税込合計
- ✓ 見積書 備考: 〈備考〉
- ✓ TISLY/DEVICE_MAP.csv 存在: OK
- ✓ TISLY/DEVICE_MAP.csv 内容: OK
- ✓ TISLY/MQTT_TOPICS.md 存在: OK
- ✓ TISLY/MQTT_TOPICS.md 内容: OK
- ✓ TISLY/ESP_CONFIG.json 存在: OK
- ✓ TISLY/ESP_CONFIG.json 内容: OK
- ✓ TISLY/NODE_RED_CONFIG.json 存在: OK
- ✓ TISLY/NODE_RED_CONFIG.json 内容: OK
- ✓ TISLY/TISLY_SYSTEM.md 存在: OK
- ✓ TISLY/TISLY_SYSTEM.md 内容: OK
- ✓ TOMS_SITE_REPORT.md 存在: OK
- ✓ 案件基本情報: OK
- ✓ 現調概要: OK
- ✓ I/O割り当て: OK
- ✓ PLC容量確認: OK
- ✓ 配線メモ: OK
- ✓ 施工前確認事項: OK
- ✓ 見積連携: OK
- ✓ TiSLY連携予定: OK
- ✓ PLC_SELECTION.md 存在: OK
- ✓ 使用入力点数あり: OK
- ✓ 使用出力点数あり: OK
- ✓ 余裕率あり: OK
- ✓ 判定あり: OK
- ✓ 推奨PLCあり: OK
- ✓ PLC_SELECTION.md が存在: OK
- ✓ SITE_SURVEY.md に PLC容量確認 が反映されている: 反映済
- ✓ TOMS_QUOTE_SUMMARY.md に PLC容量判定 が反映されている: 反映済
- ✓ TOMS_QUOTE.xlsx に PLC容量判定欄 がある: あり
- ✓ PROJECT_README.md に PLC容量・拡張判定 がある: 反映済

---

## テスト結果

| 項目 | 結果 | 詳細 |
|------|:----:|------|
| 入力点数 PLC 容量内 | PASS | 使用 8 / 最大 14 |
| 出力点数 PLC 容量内 | PASS | 使用 5 / 最大 10 |
| M8012 チェック | PASS | 0 件 |
| M8013 チェック | PASS | 0 件 |
| SM412 チェック | PASS | 1 件 |
| SM413 チェック | PASS | 2 件 |
| OUT 重複チェック | PASS | 重複なし |
| OUT Y0 チェック | PASS | 1 回 |
| END チェック | PASS | 末尾 END |
| I/O 重複なし | PASS | 重複なし |
| PLC_PROGRAM/GX3_COMMANDS.txt 存在 | PASS | OK |
| SPEC/IO_ASSIGNMENT.csv 存在 | PASS | OK |
| DRAWING/WIRING_DIAGRAM.md 存在 | PASS | OK |
| TEST/TEST_REPORT.md 存在 | PASS | OK |
| PROJECT_META.json 存在 | PASS | OK |
| SPEC/PROJECT_SPEC.md 存在 | PASS | OK |
| README.md 存在 | PASS | OK |
| 入力 I/O 不足 | PASS | 8 点割付済 |
| 出力 I/O 不足 | PASS | 5 点割付済 |
| 未使用点 | PASS | 入力余裕 6 点 / 出力余裕 5 点（合計 11 点） |
| price_master.csv 存在 | PASS | OK |
| BOM.csv 存在 | PASS | OK |
| ROUGH_ESTIMATE.md 存在 | PASS | OK |
| ROUGH_ESTIMATE.csv 存在 | PASS | OK |
| 概算単価あり | PASS | 小計 213,000 円 |
| 小計計算 | PASS | 213,000 円 |
| 消費税計算 | PASS | 21,300 円 |
| 税込合計計算 | PASS | 234,300 円 |
| ROUGH_ESTIMATE.csv 合計行 | PASS | Subtotal/Tax/Total |
| INSTALL_NOTES.md 存在 | PASS | OK |
| ORDER_MEMO.md 存在 | PASS | OK |
| PLC型番あり | PASS | FX5UJ-24MR/ES |
| 電源型番あり | PASS | MeanWell HDR-60-24 |
| TOMS_QUOTE_ITEMS.csv 存在 | PASS | OK |
| TOMS_QUOTE_SUMMARY.md 存在 | PASS | OK |
| No 連番 | PASS | 8 行 |
| Qty 空欄なし | PASS | OK |
| UnitPrice 入力 | PASS | OK |
| Amount 入力 | PASS | OK |
| Amount 計算 | PASS | Qty×UnitPrice |
| TOMS 概算金額 | PASS | 概算金額セクション |
| PLC項目あり | PASS | PLC |
| 24V電源項目あり | PASS | 24V電源 |
| TOMS_QUOTE.xlsx 存在 | PASS | OK |
| xlsx 形式有効 | PASS | OK |
| 見積明細行数 | PASS | 12 行（期待 12 行） |
| Excel 単価・金額欄 | PASS | UnitPrice/Amount |
| Excel 小計・税・合計 | PASS | 小計/消費税/税込合計 |
| Excel PLC項目 | PASS | PLC |
| Excel 24V電源項目 | PASS | 24V電源 |
| TOMS_ESTIMATE.xlsx 存在 | PASS | OK |
| 見積書 宛名 | PASS | 車屋展示場 夜間監視 |
| 見積書 件名 | PASS | 車屋展示場 夜間監視 |
| 見積書 項目 | PASS | 8 件 |
| 見積書 小計 | PASS | 小計 |
| 見積書 消費税 | PASS | 消費税 |
| 見積書 税込合計 | PASS | 税込合計 |
| 見積書 備考 | PASS | 〈備考〉 |
| TISLY/DEVICE_MAP.csv 存在 | PASS | OK |
| TISLY/DEVICE_MAP.csv 内容 | PASS | OK |
| TISLY/MQTT_TOPICS.md 存在 | PASS | OK |
| TISLY/MQTT_TOPICS.md 内容 | PASS | OK |
| TISLY/ESP_CONFIG.json 存在 | PASS | OK |
| TISLY/ESP_CONFIG.json 内容 | PASS | OK |
| TISLY/NODE_RED_CONFIG.json 存在 | PASS | OK |
| TISLY/NODE_RED_CONFIG.json 内容 | PASS | OK |
| TISLY/TISLY_SYSTEM.md 存在 | PASS | OK |
| TISLY/TISLY_SYSTEM.md 内容 | PASS | OK |
| TOMS_SITE_REPORT.md 存在 | PASS | OK |
| 案件基本情報 | PASS | OK |
| 現調概要 | PASS | OK |
| I/O割り当て | PASS | OK |
| PLC容量確認 | PASS | OK |
| 配線メモ | PASS | OK |
| 施工前確認事項 | PASS | OK |
| 見積連携 | PASS | OK |
| TiSLY連携予定 | PASS | OK |
| PLC_SELECTION.md 存在 | PASS | OK |
| 使用入力点数あり | PASS | OK |
| 使用出力点数あり | PASS | OK |
| 余裕率あり | PASS | OK |
| 判定あり | PASS | OK |
| 推奨PLCあり | PASS | OK |
| PLC_SELECTION.md が存在 | PASS | OK |
| SITE_SURVEY.md に PLC容量確認 が反映されている | PASS | 反映済 |
| TOMS_QUOTE_SUMMARY.md に PLC容量判定 が反映されている | PASS | 反映済 |
| TOMS_QUOTE.xlsx に PLC容量判定欄 がある | PASS | あり |
| PROJECT_README.md に PLC容量・拡張判定 がある | PASS | 反映済 |

---

**総合判定: PASS**

**TiSLY PLC Builder v5.14 — AUTO_TEST_REPORT**
