# SPEC_TEST_REPORT — TiSLY PLC Builder v5.3

> I/O 自動検査レポート

---

## 実行概要

| 項目 | 値 |
|------|-----|
| 実行日時 (UTC) | 2026-05-29T22:25:34Z |
| 案件名 | TiSLY株式会社_CARSHOP_SECURITY_デモ案件 |
| PLC | FX5U-24MR/ES |
| 電源 | MeanWell HDR-60-24 |

---

## I/O 割付サマリー

```
X0: 夜間警戒 (Input)
X1: 非常停止 (Input)
X2: 外周センサー (Input)
X3: 赤外線2 (Input)
X4: 赤外線3 (Input)
X5: 赤外線4 (Input)
X6: 近接センサー (Input)
X7: PIR2 (Input)
Y0: 赤灯 (Output)
Y1: 白灯1 (Output)
Y2: 白灯2 (Output)
Y3: 白灯3 (Output)
Y4: 白灯4 (Output)
```

---

## 検査項目

| 項目 | 結果 | 詳細 |
|------|:----:|------|
| I/O 重複なし | PASS | 重複なし |
| 入力点数チェック | PASS | 使用 8 / 最大 14 |
| 出力点数チェック | PASS | 使用 5 / 最大 10 |
| PLC 容量超過 | PASS | OK |
| 入力 I/O 不足 | PASS | 8 点割付済 |
| 出力 I/O 不足 | PASS | 5 点割付済 |
| 未使用点 | PASS | 入力余裕 6 点 / 出力余裕 5 点（合計 11 点） |

---

## 判定基準

| 検査 | 内容 |
|------|------|
| I/O 重複 | 同一デバイス番号の二重割付を禁止 |
| 入力/出力点数 | PLC 最大点数以内であること |
| PLC 容量超過 | 使用点数が PLC 容量を超えないこと |
| I/O 不足 | 最低 1 点以上の入出力が割付されていること |
| 未使用点 | 余裕点数の情報（警告のみ） |

---

**総合判定: PASS**

**TiSLY PLC Builder v5.3 — SPEC_TEST_REPORT**
