# 008 HOME_SECURITY_DEMO — 完成版構成図

> TiSLY PLC Template Library v1  
> 部品ID: `TPL-008`  
> 由来: TiSLY_HOME_Security_DEMO（完成版）

---

## 概要

001〜007 の部品を組み合わせた **ホームセキュリティ完成版** の構成図です。  
TiSLY_HOME_Security_DEMO プロジェクトの全段をテンプレート部品として再構成しています。

---

## 部品組み合わせ図

```
┌─────────────────────────────────────────────────────────────────┐
│                  TiSLY HOME Security DEMO                       │
│                     （部品組み合わせ）                            │
└─────────────────────────────────────────────────────────────────┘

  [001_SELF_HOLD]          警戒ON保持
  X0 + /X1 ──→ SET M0
  /X0 ──→ RST M0/M1/M2
        │
        ▼
  [002_ESTOP]              非常停止
  X1 ──→ RST M0/M1/M2 + Y0〜Y4
        │
        ▼
  [005_SENSOR_LATCH]       センサー検知保持
  M0 + X2 ──→ SET M1（外周）
  M0 + X3 ──→ SET M2（近接）
        │
        ├──────────────────────────┐
        ▼                          ▼
  [003_BLINK_SLOW]           [004_BLINK_FAST]
  M0 + SM413（低速）          M2 + SM412（高速）
        │                          │
        └──────────┬───────────────┘
                   ▼
        [006_RED_LIGHT_PRIORITY]
        M2 優先 / M0 低速 → M20
                   │
                   ▼
        [007_OUTPUT_CONTROL]
        M20 → Y0
        M1  → Y1（常灯）, Y2（1s点滅）
        M2  → Y3, Y4（常灯）
```

---

## 段マッピング（完成版 ↔ テンプレート）

| 段 | 完成版内容 | テンプレート |
|----|-----------|-------------|
| 1 | 警戒ON保持 | 001_SELF_HOLD（段A） |
| 2 | 警戒OFFリセット | 001_SELF_HOLD（段B） |
| 3 | 非常停止 | 002_ESTOP |
| 4 | センサー1警報保持 | 005_SENSOR_LATCH（M1） |
| 5 | センサー2警報保持 | 005_SENSOR_LATCH（M2） |
| 6 | Y0制御 M20 | 003 + 004 + 006 |
| 6-2 | Y0出力 | 007_OUTPUT_CONTROL（Y0） |
| 7 | Y1常時点灯 | 007_OUTPUT_CONTROL（Y1） |
| 8 | Y2 1秒点滅 | 003 + 007（Y2） |
| 9 | Y3常時点灯 | 007_OUTPUT_CONTROL（Y3） |
| 10 | Y4常時点灯 | 007_OUTPUT_CONTROL（Y4） |

---

## I/O 割り当て（標準）

### 入力 (X)

| デバイス | 名称 | 用途 |
|---------|------|------|
| X0 | セレクタスイッチ | 警戒 ON/OFF |
| X1 | 非常停止ボタン | 全停止 |
| X2 | ビームセンサー1 | 外周検知 |
| X3 | ビームセンサー2 | 近接検知 |

### 出力 (Y)

| デバイス | 名称 | 動作 |
|---------|------|------|
| Y0 | 赤ライト (24V) | 警戒: 1s点滅 / 近接: 0.1s点滅 |
| Y1 | 白ライト1 (100V) | 外周警報: 常時点灯 |
| Y2 | 白ライト2 (100V) | 外周警報: 1s点滅 |
| Y3 | 白ライト3 (100V) | 近接警報: 常時点灯 |
| Y4 | 白ライト4 (100V) | 近接警報: 常時点灯 |

### 内部リレー (M)

| デバイス | 名称 | テンプレート |
|---------|------|-------------|
| M0 | 警戒中 | 001 |
| M1 | 外周警報保持 | 005 |
| M2 | 近接警報保持 | 005 |
| M20 | Y0制御 | 006 + 007 |

### クロック

| デバイス | 周期 | テンプレート |
|---------|------|-------------|
| SM413 / M8013 | 1秒 | 003 |
| SM412 / M8012 | 0.1秒 | 004 |

---

## 完成版 命令語（IL 一覧）

```il
; --- 001 SELF_HOLD ---
LD    X0
ANI   X1
SET   M0

LDI   X0
RST   M0
RST   M1
RST   M2

; --- 002 ESTOP ---
LD    X1
RST   M0
RST   M1
RST   M2
RST   Y0
RST   Y1
RST   Y2
RST   Y3
RST   Y4

; --- 005 SENSOR_LATCH ---
LD    M0
AND   X2
SET   M1

LD    M0
AND   X3
SET   M2

; --- 003 + 004 + 006 RED_LIGHT_PRIORITY ---
LD    M2
AND   SM412       ; FX3U: M8012
LD    M0
ANI   M2
AND   SM413       ; FX3U: M8013
ORB
OUT   M20

; --- 007 OUTPUT_CONTROL ---
LD    M20
OUT   Y0

LD    M1
OUT   Y1

LD    M1
AND   SM413       ; FX3U: M8013
OUT   Y2

LD    M2
OUT   Y3

LD    M2
OUT   Y4

END
```

---

## 状態遷移

```
        X0 ON
  ┌──────────────┐
  │              ▼
停止 ──────→ 警戒中(M0) ──X2──→ 外周警報(M1)
  ▲              │                  │
  │              └──X3──→ 近接警報(M2) ←┘
  │                         │
  X0 OFF / X1 ESTOP         │
  └─────────────────────────┘
```

---

## 参照ファイル

| ファイル | 内容 |
|---------|------|
| `../ladder/TiSLY_HOME_Security_DEMO.mnm` | ニーモニックリスト |
| `../ladder/TiSLY_HOME_Security_DEMO.il` | IL 形式 |
| `../ladder/LADDER_DIAGRAM.md` | ASCII ラダー図 |
| `../README.md` | プロジェクト全体説明 |
