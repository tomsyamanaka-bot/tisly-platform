# TEST_REPORT — TiSLY PLC Builder v4.7

> 自動監査レポート

---

## 監査チェックリスト

- M8012 = 0
- M8013 = 0
- SM412あり
- SM413あり
- OUT重複なし
- OUT Y0 = 1回
- ENDあり
- I/O重複なし
- 総合判定 PASS

---

## I/O 割付確認

| Device | Name | Type |
|--------|------|------|
| X0 | 警戒スイッチ | Input |
| X1 | 非常停止 | Input |
| X2 | 外周センサー | Input |
| X3 | 近接センサー | Input |
| Y0 | 赤灯 | Output |
| Y1 | 白灯1 | Output |
| Y2 | 白灯2 | Output |
| Y3 | 白灯3 | Output |
| Y4 | 白灯4 | Output |

---

## 監査項目

| 項目 | 結果 | 詳細 |
|------|:----:|------|
| M8012 チェック | PASS | 0 件（0 が正常） |
| M8013 チェック | PASS | 0 件（0 が正常） |
| SM412 チェック | PASS | 1 件 |
| SM413 チェック | PASS | 2 件 |
| OUT 重複チェック | PASS | 重複なし |
| OUT Y0 チェック | PASS | 1 回 |
| END チェック | PASS | 末尾 END |
| I/O 重複なし | PASS | 重複なし |

---

## GX Works3 命令サマリー

- 命令行数: 41
- 部品: 001, 002, 005, 005, 007

---

## v3 エンジン監査（参考）

| 項目 | 結果 | 詳細 |
|------|:----:|------|
| M8012 不使用 | PASS | 0 件 |
| M8013 不使用 | PASS | 0 件 |
| SM412 使用 | PASS | 1 件 |
| SM413 使用 | PASS | 2 件 |
| OUT Y0 は 1 回 | PASS | 1 回 |
| OUT 重複なし | PASS | 重複なし |
| Y0 は M20 経由 | PASS | M20 → Y0 |
| END あり | PASS | 末尾 END |
| GX Works3 投入可能 | PASS | 監査項目すべて PASS |

---

**総合判定: PASS**

**TiSLY PLC Builder v4.7 — TEST_REPORT**
