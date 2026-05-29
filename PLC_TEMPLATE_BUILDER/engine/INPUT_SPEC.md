# INPUT_SPEC — 文章仕様入力定義

> TiSLY PLC Builder v2.5 / Engine  
> 機能1: 文章解析 — 入力フォーマットと読み取り規則

---

## 目的

自然文または箇条書きで記述された PLC 仕様を、Engine が解析可能な構造化データに変換する。

---

## 入力形式

### 形式 A：箇条書き（推奨）

```
警戒スイッチ
非常停止
外周センサー
近接センサー
赤灯点滅
白灯4回路
```

### 形式 B：自然文

```
警戒スイッチX0、非常停止X1、外周センサーX2、近接センサーX3。
警戒中は赤ライトY0を1秒点滅。近接検知で赤灯高速点滅。
外周検知でY1点灯、Y2点滅。近接検知でY3/Y4点灯。
非常停止で全OFF。
```

### 形式 C：YAML 拡張（オプション）

```yaml
spec:
  inputs:
    - name: 警戒スイッチ
      device: X0
    - name: 非常停止
      device: X1
  outputs:
    - name: 赤灯
      device: Y0
      mode: blink_slow
  safety:
    estop: true
```

---

## 解析パイプライン

```
INPUT_SPEC（生テキスト）
        │
        ▼
  1. 正規化
        │  全角→半角、空白トリム、改行分割
        ▼
  2. トークン化
        │  句点・読点・改行で文を分割
        ▼
  3. カテゴリ分類
        │  入力 / 出力 / 点滅 / 安全 / モード
        ▼
  4. キーワード抽出  ← KEYWORD_ENGINE.md
        │
        ▼
  5. 部品番号決定
        │  001〜007
        ▼
  6. 構造化仕様（中間表現）
```

---

## カテゴリ分類ルール

| カテゴリ | 判定キーワード例 | 後続処理 |
|---------|----------------|---------|
| **MODE** | 警戒、警備、起動、セット、ARM | → 001 |
| **SAFETY** | 非常停止、緊急停止、ESTOP | → 002 |
| **SENSOR** | センサー、検知、ビーム、PIR、近接、外周 | → 005 |
| **BLINK_SLOW** | 1秒点滅、低速点滅、警戒ランプ、点滅 | → 003 |
| **BLINK_FAST** | 高速点滅、0.1秒、異常警報、侵入警告 | → 004 |
| **OUTPUT** | ランプ、灯、照明、Y、出力、白灯、赤灯 | → 007 |
| **PRIORITY** | （003+004 同時選定時に自動） | → 006 |

---

## デバイス番号の明示指定

仕様文中に `X0` / `Y3` 等が含まれる場合、**明示指定を優先**する。

| パターン | 例 | 動作 |
|---------|-----|------|
| `Xn` | X0 警戒 | X0 を 001 入力として固定 |
| `Yn` | Y0 赤灯 | Y0 を 007 出力として固定 |
| `白灯4回路` | — | Y1〜Y4 を自動採番（DEVICE_ALLOCATOR） |
| 番号なし | 外周センサー | X2 以降を自動採番 |

---

## 標準入力例（ユーザ指定）

### 入力テキスト

```
警戒スイッチ
非常停止
外周センサー
近接センサー
赤灯点滅
白灯4回路
```

### 解析結果（中間表現）

```yaml
raw_lines:
  - "警戒スイッチ"
  - "非常停止"
  - "外周センサー"
  - "近接センサー"
  - "赤灯点滅"
  - "白灯4回路"

classified:
  - line: "警戒スイッチ"
    category: MODE
    keywords: [警戒, スイッチ]
    part: "001"
  - line: "非常停止"
    category: SAFETY
    keywords: [非常停止]
    part: "002"
  - line: "外周センサー"
    category: SENSOR
    keywords: [外周, センサー]
    part: "005"
    channel: 1
  - line: "近接センサー"
    category: SENSOR
    keywords: [近接, センサー]
    part: "005"
    channel: 2
  - line: "赤灯点滅"
    category: [BLINK_SLOW, OUTPUT]
    keywords: [赤灯, 点滅]
    parts: ["003", "007"]
  - line: "白灯4回路"
    category: OUTPUT
    keywords: [白灯, 4回路]
    part: "007"
    output_count: 4

parts_selected:
  - "001"
  - "002"
  - "003"
  - "004"    # 近接検知連動の高速点滅（HOME_SECURITY 標準）
  - "005"
  - "005"
  - "006"    # 003+004 自動追加
  - "007"

template: HOME_SECURITY
```

### 必要部品抽出（最終出力）

```
001  SELF HOLD
002  ESTOP
003  BLINK SLOW
004  BLINK FAST
005  SENSOR LATCH（外周）
005  SENSOR LATCH（近接）
006  RED LIGHT PRIORITY
007  OUTPUT CONTROL
```

---

## 入力バリデーション

| # | チェック | エラー時 |
|---|---------|---------|
| 1 | 空行のみの入力 | `ERR_EMPTY_SPEC` |
| 2 | 認識不能な行が 50% 超 | `WARN_UNKNOWN_LINES` |
| 3 | 出力指定なし | `WARN_NO_OUTPUT`（007 省略可だが非推奨） |
| 4 | 実設備で 002 なし | `ERR_NO_ESTOP`（デモモード時のみ警告に降格） |

---

## 次のステップ

| 出力 | 参照先 |
|------|--------|
| キーワード → 部品 | [KEYWORD_ENGINE.md](./KEYWORD_ENGINE.md) |
| デバイス採番 | [DEVICE_ALLOCATOR.md](./DEVICE_ALLOCATOR.md) |
| 命令生成 | [COMMAND_GENERATOR.md](./COMMAND_GENERATOR.md) |

---

**TiSLY PLC Builder v2.5 — INPUT_SPEC**
