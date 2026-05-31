# AUTO_TEST_REPORT — TiSLY PLC Builder v5.16

> 全生成物存在確認 + 監査 PASS 確認

---

## 実行概要

| 項目 | 値 |
|------|-----|
| 実行日時 (UTC) | 2026-05-31T05:59:52Z |
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
- ✓ TISLY_FLOWS.json 存在: OK
- ✓ JSON 読み込み: OK
- ✓ Node-RED import 配列形式: 配列
- ✓ mqtt in ノード: あり
- ✓ mqtt out ノード: あり
- ✓ function ノード: あり
- ✓ debug ノード: あり
- ✓ broker ノード: あり
- ✓ alarm topic: /alarm
- ✓ motion topic: /motion
- ✓ output topic: /output
- ✓ state topic: /state
- ✓ cmd topic: /cmd
- ✓ ノード wires 属性: OK
- ✓ TISLY/UI/ 存在: OK
- ✓ UI 全ファイル (7): 7/7
- ✓ index.html ダッシュボード: OK
- ✓ index.html デバイスカード: OK
- ✓ UI_CONFIG.json 妥当性: OK
- ✓ manifest.webmanifest PWA: OK
- ✓ sw.js Service Worker: OK
- ✓ UI_README.md デプロイ手順: OK

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
| TISLY_FLOWS.json 存在 | PASS | OK |
| JSON 読み込み | PASS | OK |
| Node-RED import 配列形式 | PASS | 配列 |
| mqtt in ノード | PASS | あり |
| mqtt out ノード | PASS | あり |
| function ノード | PASS | あり |
| debug ノード | PASS | あり |
| broker ノード | PASS | あり |
| alarm topic | PASS | /alarm |
| motion topic | PASS | /motion |
| output topic | PASS | /output |
| state topic | PASS | /state |
| cmd topic | PASS | /cmd |
| ノード wires 属性 | PASS | OK |
| TISLY/UI/ 存在 | PASS | OK |
| UI 全ファイル (7) | PASS | 7/7 |
| index.html ダッシュボード | PASS | OK |
| index.html デバイスカード | PASS | OK |
| UI_CONFIG.json 妥当性 | PASS | OK |
| manifest.webmanifest PWA | PASS | OK |
| sw.js Service Worker | PASS | OK |
| UI_README.md デプロイ手順 | PASS | OK |

---

**総合判定: PASS**

**TiSLY PLC Builder v5.16 — AUTO_TEST_REPORT**
