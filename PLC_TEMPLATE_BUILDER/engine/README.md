# TiSLY PLC Builder v2.5 — Engine

> **文章仕様 → GX Works3 命令生成**  
> TiSLY PLC Template Library v2 対応

---

## 概要

**TiSLY PLC Builder v2.5** は、自然文・箇条書きの仕様を入力すると、  
部品選定・デバイス割付・IL 命令生成・競合検査までを一貫して行い、  
**GX Works3 へ貼り付け可能な `GXW3_PURE_COMMANDS.txt`** を出力する Engine です。

---

## Engine フォルダ構成

```
PLC_TEMPLATE_BUILDER/engine/
├── README.md              … 本ファイル（v2.5 Engine 総合）
├── INPUT_SPEC.md          … 機能1: 文章仕様入力定義
├── KEYWORD_ENGINE.md      … 機能1: キーワード → 部品選定
├── DEVICE_ALLOCATOR.md    … 機能2: X / Y / M 自動割付
├── COMMAND_GENERATOR.md   … 機能3: GXW3 命令生成フロー
└── OUTPUT_EXAMPLE.md      … 生成出力サンプル・監査結果
```

---

## 機能一覧

| # | 機能 | ドキュメント | 概要 |
|---|------|-------------|------|
| 1 | 文章解析 | INPUT_SPEC / KEYWORD_ENGINE | 仕様文 → 部品 001〜007 抽出 |
| 2 | 自動デバイス割付 | DEVICE_ALLOCATOR | X0〜 / Y0〜 / M0〜 自動採番 |
| 3 | GX Works3 生成 | COMMAND_GENERATOR | 部品結合 → GXW3_PURE_COMMANDS.txt |
| 4 | 競合検査 | 本ファイル §機能4 | 二重コイル・重複・END 等 |
| 5 | Builder フロー | 本ファイル §機能5 | 全体パイプライン図 |

---

## 機能1 — 文章解析

### 入力例

```
警戒スイッチ
非常停止
外周センサー
近接センサー
赤灯点滅
白灯4回路
```

### 必要部品抽出

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

詳細: [INPUT_SPEC.md](./INPUT_SPEC.md) / [KEYWORD_ENGINE.md](./KEYWORD_ENGINE.md)

---

## 機能2 — 自動デバイス割付

| 種別 | 範囲 | 例 |
|------|------|-----|
| 入力 X | X0〜 | X0 警戒, X1 非常停止, X2 外周, X3 近接 |
| 内部 M | M0〜 | M0 警戒, M1 外周, M2 近接, M20 点滅 |
| 出力 Y | Y0〜 | Y0 赤灯, Y1〜Y4 白灯 |

### 自動割付ルール（抜粋）

```
警戒  → M0   （001 SELF HOLD）
外周  → M1   （005 チャンネル 1）
近接  → M2   （005 チャンネル 2）
点滅  → M20  （006 出力集約）
```

詳細: [DEVICE_ALLOCATOR.md](./DEVICE_ALLOCATOR.md)

---

## 機能3 — GX Works3 生成

```
部品選定 + デバイス割付
        │
        ▼
PLC_TEMPLATE_LIBRARY/ から部品 IL 取得
        │
        ▼
プレースホルダ置換 → 連結
        │
        ▼
競合検査（機能4）
        │
        ▼
GXW3_PURE_COMMANDS.txt 出力
        │
        ▼
GX Works3 ラダーエディタへ貼り付け
```

詳細: [COMMAND_GENERATOR.md](./COMMAND_GENERATOR.md)  
出力例: [OUTPUT_EXAMPLE.md](./OUTPUT_EXAMPLE.md)

---

## 機能4 — 競合検査

命令生成後、以下の全項目を PASS するまで出力を保留する。

| # | チェック項目 | 確認内容 | 不合格時 |
|---|-------------|---------|---------|
| 1 | **二重コイル** | 各 Y への OUT は 1 行のみ。Y0 は M20 経由 | `ERR_DOUBLE_COIL` |
| 2 | **重複 M 番号** | M0/M1/M2… が部品間で一意 | `ERR_DUP_M` |
| 3 | **重複 Y 番号** | Y0〜Yn が出力定義で一意 | `ERR_DUP_Y` |
| 4 | **重複 X 番号** | X0〜Xn が入力定義で一意 | `ERR_DUP_X` |
| 5 | **SM412 / SM413 確認** | 点滅に SM412/SM413 を使用。M8012/M8013 禁止 | `ERR_INVALID_CLOCK` |
| 6 | **END 確認** | プログラム末尾に END が存在 | `ERR_NO_END` |
| 7 | **非常停止優先** | X1 ON → 全 M / 全 Y RST。001 は ANI X1 条件 | `ERR_ESTOP_PRIORITY` |

### 検査手順

```
1. IL 全文をパースし OUT 命令の Y 番号を集計 → 二重コイル検出
2. 割付表の M / Y / X と IL 内デバイスを突合 → 重複検出
3. SM412 / SM413 の出現回数 ≥ 1、M8012 / M8013 = 0
4. 最終行 = END
5. X1 ブロックが全 RST を含み、001 SET に ANI X1 があること
```

v1 互換チェックリスト: `../generator/validation_checklist.md`

---

## 機能5 — Builder フロー図

```
┌─────────────────────────────────────────────────────────────┐
│                  TiSLY PLC Builder v2.5                      │
│              「文章仕様 → GX Works3 命令生成」                   │
└─────────────────────────────────────────────────────────────┘

      文章入力
   （INPUT_SPEC.md）
          │
          ▼
      部品選定
  （KEYWORD_ENGINE.md）
     001〜007 抽出
          │
          ▼
     デバイス割付
 （DEVICE_ALLOCATOR.md）
    X0〜 / Y0〜 / M0〜
          │
          ▼
      命令生成
（COMMAND_GENERATOR.md）
  部品 IL 連結 + 置換
          │
          ▼
        監査
    （機能4 競合検査）
   二重コイル / END / ESTOP
          │
          ▼
   GX Works3 投入
  GXW3_PURE_COMMANDS.txt
     ラダーへ貼り付け
          │
          ▼
        完成
   コンパイル → 動作確認
```

---

## クイックスタート

### 1. 仕様を書く

[INPUT_SPEC.md](./INPUT_SPEC.md) の形式 A（箇条書き）で記述。

### 2. 部品を確認する

[KEYWORD_ENGINE.md](./KEYWORD_ENGINE.md) の辞書で 001〜007 が選定されることを確認。

### 3. デバイス割付を確認する

[DEVICE_ALLOCATOR.md](./DEVICE_ALLOCATOR.md) の割付表で X / M / Y を確認。

### 4. 命令を生成する

[COMMAND_GENERATOR.md](./COMMAND_GENERATOR.md) の手順に従い IL を組み立て。

### 5. 監査して出力する

[OUTPUT_EXAMPLE.md](./OUTPUT_EXAMPLE.md) と照合し、`GXW3_PURE_COMMANDS.txt` を GX Works3 へ投入。

---

## 部品ライブラリ

| 番号 | 部品名 | 概要 |
|------|--------|------|
| 001 | SELF HOLD | 警戒 / モード保持 |
| 002 | ESTOP | 非常停止・全出力 OFF |
| 003 | BLINK SLOW | 1 秒周期点滅（SM413） |
| 004 | BLINK FAST | 0.1 秒周期点滅（SM412） |
| 005 | SENSOR LATCH | センサー検知保持 |
| 006 | RED LIGHT PRIORITY | 点滅優先度制御 |
| 007 | OUTPUT CONTROL | Y 出力（二重コイル回避） |

部品詳細: `../../PLC_TEMPLATE_LIBRARY/`  
部品マップ: `../TEMPLATE_MAP.md`

---

## v1 からの変更点

| 項目 | v1 | v2.5 |
|------|-----|------|
| 部品選定 | BUILDER_RULES.md | KEYWORD_ENGINE（決定論的辞書） |
| デバイス割付 | テンプレート手動参照 | DEVICE_ALLOCATOR（自動採番） |
| 命令生成 | generator/ 手順書 | COMMAND_GENERATOR（IL 連結仕様） |
| 出力 | output_sample_*.txt | **GXW3_PURE_COMMANDS.txt**（正本） |
| 監査 | validation_checklist | 機能4 競合検査（7 項目） |

---

## 関連リソース

| パス | 内容 |
|------|------|
| `../README.md` | TiSLY PLC Builder v1 概要 |
| `../BUILDER_RULES.md` | v1 キーワードルール |
| `../HOME_SECURITY_TEMPLATE.md` | 標準テンプレート |
| `../../GXW3_PURE_COMMANDS.txt` | 生成出力正本 |
| `../../GXW3_IMPORT_MANUAL.md` | GX Works3 取込手順 |

---

## 設計原則

1. **002 ESTOP 最優先** — すべての制御より前に配置
2. **1 Y = 1 OUT** — 二重コイル禁止。006+007 で M20 集約
3. **SET/RST 状態管理** — 001, 005 は SET/RST 命令
4. **SM412 / SM413** — FX5UJ クロック。M8012/M8013 禁止
5. **END 必須** — プログラム末尾に必ず END

---

## 注意

- 本 Engine はデモ・評価用途の設計仕様です
- 実設備適用時は関連法規・安全規格に従い、**ハードウェア安全回路** を必ず設計してください
- 100V 出力は外部リレー経由で駆動すること

---

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TiSLY PLC Builder v2.5
  「文章仕様 → GX Works3 命令生成」

  設計完了
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**TiSLY PLC Builder v2.5**  
**TiSLY PLC Template Library v2**  
**更新日:** 2026-05-30
