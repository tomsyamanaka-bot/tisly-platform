# BUILD_REPORT — TiSLY PLC Builder v3

> 生成日時: 自動監査結果  
> テンプレート: `HOME_SECURITY`  
> 入力: `sample_specs/home_security.txt`  
> 出力: `generated/GXW3_GENERATED_HOME_SECURITY.txt`

---

## 部品選定

| 部品番号 | 部品名 |
|---------|--------|
| 001 | SELF HOLD |
| 002 | ESTOP |
| 005 | SENSOR LATCH |
| 005 | SENSOR LATCH |
| 003 | BLINK SLOW |
| 004 | BLINK FAST |
| 006 | RED LIGHT PRIORITY |
| 007 | OUTPUT CONTROL |

---

## デバイス割付

| 種別 | デバイス | 用途 |
|------|---------|------|
| 入力 | X0 | 警戒スイッチ |
| 入力 | X1 | 非常停止 |
| 入力 | X2 | 外周センサー |
| 入力 | X3 | 近接センサー |
| 内部 | M0 | モード保持 |
| 内部 | M1 | センサー1警報 |
| 内部 | M2 | センサー2警報 |
| 内部 | M20 | 赤灯制御（Y0 前段） |
| 出力 | Y0 | 赤灯 |
| 出力 | Y1, Y2, Y3, Y4 | 白灯 |

---

## 監査結果

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
| GX Works3 投入可能 | PASS | 合格済み GXW3_PURE_COMMANDS.txt と一致 |

**総合判定: PASS**

---

## 生成命令数

- 命令行数: 41

---

## 固定ルール確認

| ルール | 値 |
|--------|-----|
| 高速点滅 | SM412 |
| 低速点滅 | SM413 |
| Y0 出力 | M20 経由（OUT Y0 × 1） |
| 禁止デバイス | M8012 / M8013 |
| 末尾 | END 必須 |

---

**TiSLY PLC Builder v3 — BUILD_REPORT**
