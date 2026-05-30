# TEST_REPORT — TiSLY PLC Builder v5.7

> 自動監査レポート

---

## I/O 割付確認

| Device | Name | Type |
|--------|------|------|
| X0 | 夜間警戒 | Input |
| X1 | 非常停止 | Input |
| X2 | 外周センサー | Input |
| X3 | 赤外線2 | Input |
| X4 | 赤外線3 | Input |
| X5 | 赤外線4 | Input |
| X6 | 近接センサー | Input |
| X7 | PIR2 | Input |
| Y0 | 赤灯 | Output |
| Y1 | 白灯1 | Output |
| Y2 | 白灯2 | Output |
| Y3 | 白灯3 | Output |
| Y4 | 白灯4 | Output |

---

## 監査項目

| 項目 | 結果 | 詳細 |
|------|:----:|------|
| M8012 チェック | PASS | 0 件 |
| M8013 チェック | PASS | 0 件 |
| SM412 チェック | PASS | 1 件 |
| SM413 チェック | PASS | 2 件 |
| OUT 重複チェック | PASS | 重複なし |
| OUT Y0 チェック | PASS | 1 回 |
| END チェック | PASS | 末尾 END |
| I/O 重複なし | PASS | 重複なし |

---

## GX Works3 命令サマリー

- 命令行数: 41
- 部品: 001, 002, 005, 005, 003, 004, 006, 007

---

**総合判定: PASS**

**TiSLY PLC Builder v5.7 — TEST_REPORT**
