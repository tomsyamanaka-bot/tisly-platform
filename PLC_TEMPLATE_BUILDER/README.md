# TiSLY PLC Builder v1

> **TiSLY PLC Template Library v2** — 仕様書から PLC システムを自動生成するビルダー

---

## 概要

**TiSLY PLC Builder v1** は、再利用可能な PLC 部品（001〜007）を組み合わせて、  
新しい PLC システムの構成を **自動選定・生成** するためのテンプレートビルダーです。

**仕様を文章で入力すると、使用テンプレート一覧を自動選定できます。**

例：

```
「ホームセキュリティ。外周検知と近接検知。警戒中は赤ランプ点滅。
 非常停止あり。」
```

→ Builder が `BUILDER_RULES.md` に従い、001 / 002 / 003 / 004 / 005 / 006 / 007 を選定し、  
`HOME_SECURITY_TEMPLATE.md` を適用します。

---

## フォルダ構成

```
PLC_TEMPLATE_BUILDER/
├── README.md                    … 本ファイル（TiSLY PLC Builder v1）
├── TEMPLATE_MAP.md              … 部品番号と用途一覧
├── BUILDER_RULES.md             … 仕様書キーワード → 部品自動選定ルール
├── HOME_SECURITY_TEMPLATE.md    … ホームセキュリティ（完成版）
├── MINPAKU_TEMPLATE.md          … 民泊・ゲストハウス
├── FACTORY_TEMPLATE.md          … 工場・ライン安全
├── WAREHOUSE_TEMPLATE.md        … 倉庫・在庫監視
└── CARSHOP_TEMPLATE.md          … 車屋・夜間警備
```

部品の詳細仕様（ラダー図・IL・パラメータ）は `../PLC_TEMPLATE_LIBRARY/` を参照してください。

---

## 使い方

### 1. 仕様を文章で記述する

監視対象・センサー種別・出力デバイス・安全要件を自然文で書きます。

### 2. BUILDER_RULES で部品を選定する

`BUILDER_RULES.md` のキーワードマッチング表に従い、必要な部品番号（001〜007）を決定します。

### 3. 業種テンプレートを適用する

最も近い業種テンプレート（HOME / MINPAKU / FACTORY / WAREHOUSE / CARSHOP）を選び、  
I/O 割り当てと段構成を確定します。

### 4. PLC_TEMPLATE_LIBRARY から部品を組み立てる

選定された部品番号に対応する `.md` ファイルを `PLC_TEMPLATE_LIBRARY/` から参照し、  
パラメータ（`{X_START}` 等）をテンプレートの I/O 表に置換してラダーを生成します。

---

## 部品ライブラリ（v2 対応）

| 番号 | 部品名 | 概要 |
|------|--------|------|
| 001 | SELF HOLD | 運転/警戒モード保持 |
| 002 | ESTOP | 非常停止・全出力 OFF |
| 003 | BLINK SLOW | 1 秒周期点滅 |
| 004 | BLINK FAST | 0.1 秒周期点滅 |
| 005 | SENSOR LATCH | センサー検知保持 |
| 006 | RED LIGHT PRIORITY | 点滅優先度制御 |
| 007 | OUTPUT CONTROL | Y 出力制御（二重コイル回避） |

詳細: [TEMPLATE_MAP.md](./TEMPLATE_MAP.md)

---

## 業種テンプレート一覧

| テンプレート | 用途 | 参照 |
|-------------|------|------|
| HOME_SECURITY | 住宅・外周/近接警備 | [HOME_SECURITY_TEMPLATE.md](./HOME_SECURITY_TEMPLATE.md) |
| MINPAKU | 民泊・人数/清掃/満室 | [MINPAKU_TEMPLATE.md](./MINPAKU_TEMPLATE.md) |
| FACTORY | 工場・安全カーテン/パトライト | [FACTORY_TEMPLATE.md](./FACTORY_TEMPLATE.md) |
| WAREHOUSE | 倉庫・シャッター/照明連動 | [WAREHOUSE_TEMPLATE.md](./WAREHOUSE_TEMPLATE.md) |
| CARSHOP | 車屋・展示車/外周警備 | [CARSHOP_TEMPLATE.md](./CARSHOP_TEMPLATE.md) |

---

## 組み立て順序（全テンプレート共通）

```
1. 001 SELF HOLD       … モード保持
2. 002 ESTOP           … 非常停止（必ず出力より前）
3. 005 SENSOR LATCH    … センサーラッチ（必要数だけ複製）
4. 003 + 004 + 006     … 点滅ロジック（複数条件の場合）
5. 007 OUTPUT CONTROL  … Y 出力（1 Y = 1 OUT）
```

---

## 自動選定フロー

```
仕様文書（自然文）
      │
      ▼
BUILDER_RULES.md  … キーワード → 部品番号
      │
      ▼
業種テンプレート  … I/O 割り当て・段構成
      │
      ▼
PLC_TEMPLATE_LIBRARY/  … ラダー・IL 生成
      │
      ▼
完成 PLC プログラム
```

---

## 関連リソース

| パス | 内容 |
|------|------|
| `../PLC_TEMPLATE_LIBRARY/` | 部品詳細（001〜008） |
| `../ladder/` | HOME Security 完成版ラダー |
| `../README.md` | TiSLY_HOME_Security_DEMO プロジェクト説明 |

---

## 設計原則

1. **002 ESTOP を最優先** — すべての制御より前に配置
2. **1 Y = 1 OUT** — 二重コイル禁止。007 で M20 等に集約
3. **SET/RST で状態管理** — 001, 005 は SET/RST 命令を使用
4. **点滅は SM412/SM413** — 003, 004 は内蔵クロックを使用
5. **優先度を明示** — 006 で高速 > 低速の排他制御

---

## バージョン

| コンポーネント | 版 | 内容 |
|---------------|-----|------|
| TiSLY PLC Builder | **v1** | 仕様自動選定ビルダー（本パッケージ） |
| TiSLY PLC Template Library | **v2** | 部品ライブラリ + 業種テンプレート拡張 |
| 由来プロジェクト | — | TiSLY_HOME_Security_DEMO |

---

## 注意

- 本ビルダーはデモ・評価用途のサンプルです
- 実設備への適用時は関連法規・安全規格に従い、**ハードウェア安全回路** を必ず設計してください
- 100V 出力は外部リレー経由で駆動すること

---

## TiSLY PLC Builder v4.7

| パス | 内容 |
|------|------|
| [v4/VERSION.md](./v4/VERSION.md) | 現在バージョン |
| [v4/CHANGELOG.md](./v4/CHANGELOG.md) | 変更履歴 |
| [v4/build.py](./v4/build.py) | 文章仕様 → 成果物生成 |
| [v4/test_builder.py](./v4/test_builder.py) | 自動テスト |

### ■ 開発後の保存手順

```bash
git add .
git commit -m "Add TiSLY PLC Builder v4.7 history management"
git push
```

---

**TiSLY PLC Builder v1**  
**TiSLY PLC Template Library v2**  
**更新日:** 2026-05-30
