# generation_flow — GX Works3 命令自動生成フロー

> TiSLY PLC Builder v1 / Generator  
> 文章仕様 → 部品選定 → GXW3 命令リスト

---

## フロー概要

```
spec_input_example.md（文章仕様）
        │
        ▼
  1. 入力仕様を読む
        │
        ▼
  2. 入出力を抽出
        │
        ▼
  3. 必要テンプレを選定  ← BUILDER_RULES.md / template_selector.md
        │
        ▼
  4. 内部リレーを割当
        │
        ▼
  5. 二重コイルを検査
        │
        ▼
  6. GXW3 命令を生成
        │
        ▼
  7. 監査して出力  ← validation_checklist.md
        │
        ▼
output_sample_home_security.txt
```

---

## 各ステップ詳細

### 1. 入力仕様を読む

- 自然文仕様ファイル（`spec_input_example.md` 等）を読み込む
- 改行・句点で文を分割し、キーワード候補を抽出する

### 2. 入出力を抽出

| 種別 | パターン | 例 |
|------|---------|-----|
| 入力 X | `X0`〜`Xn`、センサー名 | X0 警戒, X1 非常停止, X2 外周, X3 近接 |
| 出力 Y | `Y0`〜`Yn`、ランプ名 | Y0 赤ライト, Y1〜Y4 白ライト |
| 動作 | 点灯 / 点滅 / 高速点滅 | 1秒点滅 → 003, 高速点滅 → 004 |

### 3. 必要テンプレを選定

`BUILDER_RULES.md` のキーワード → 部品対応表に従い、001〜007 を選定する。

| 部品 | 役割 |
|------|------|
| 001 SELF HOLD | X0 → M0 警戒保持 |
| 002 ESTOP | X1 → 全 M / 全 Y RST |
| 005 SENSOR LATCH | M0 + Xn → Mn ラッチ（センサー数分） |
| 003 BLINK SLOW | M0 + SM413 → 1秒点滅 |
| 004 BLINK FAST | M2 + SM412 → 0.1秒点滅 |
| 006 RED LIGHT PRIORITY | M2 優先 / M0 低速 → M20 |
| 007 OUTPUT CONTROL | M20→Y0, M1→Y1/Y2, M2→Y3/Y4 |

選定結果は `template_selector.md` 形式で記録する。  
業種テンプレートは **HOME_SECURITY** を適用（`HOME_SECURITY_TEMPLATE.md`）。

### 4. 内部リレーを割当

| デバイス | 用途 | 担当部品 |
|---------|------|---------|
| M0 | 警戒中 | 001 |
| M1 | 外周警報保持 | 005（1 チャンネル目） |
| M2 | 近接警報保持 | 005（2 チャンネル目） |
| M20 | Y0 出力集約 | 006, 007 |

命名規則: `TEMPLATE_MAP.md` のデバイス命名規則に従う。

### 5. 二重コイルを検査

- **原則:** 1 Y = 1 OUT（007 OUTPUT CONTROL）
- Y0 は 003 / 004 の直接 OUT を禁止 → **M20 経由** のみ OUT
- 同一 Y への OUT 命令が 2 行以上ないことを確認
- 002 ESTOP の RST Yn は例外（安全停止のため許可）

### 6. GXW3 命令を生成

`PLC_TEMPLATE_LIBRARY/` の部品 IL を組み立て順に連結する。

```
組み立て順:
  001 → 002 → 005×n → 003+004+006 → 007 → END
```

出力形式:

- FX5UJ 専用命令（LD / ANI / SET / RST / OUT / ORB / END）
- クロック: **SM412**（0.1s）/ **SM413**（1s）— M8012 / M8013 は使用禁止
- 最終行: `END`

### 7. 監査して出力

`validation_checklist.md` の全項目を確認後、命令リストを出力する。

| 出力ファイル | 内容 |
|-------------|------|
| `output_sample_home_security.txt` | GX Works3 貼り付け用 IL 命令リスト |

---

## 部品組み立て依存関係

```
001 SELF HOLD
    │
    ▼
002 ESTOP
    │
    ▼
005 SENSOR LATCH ×2
    │
    ├──────────────┐
    ▼              ▼
003 BLINK SLOW  004 BLINK FAST
    │              │
    └──────┬───────┘
           ▼
006 RED LIGHT PRIORITY
           │
           ▼
007 OUTPUT CONTROL
           │
           ▼
         END
```

---

## 参照ファイル

| パス | 内容 |
|------|------|
| `../BUILDER_RULES.md` | キーワード → 部品選定ルール |
| `./template_selector.md` | 本例の選定結果 |
| `../HOME_SECURITY_TEMPLATE.md` | I/O 割り当て・段構成 |
| `../../PLC_TEMPLATE_LIBRARY/` | 部品 IL 定義 |
| `./validation_checklist.md` | 出力監査項目 |
| `./output_sample_home_security.txt` | 生成サンプル |

---

**TiSLY PLC Builder v1 — generation_flow**
