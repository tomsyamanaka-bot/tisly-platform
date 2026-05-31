# TiSLY PLC Builder v5.0

> **見積 → PLC仕様書 → GX Works3** まで自動化

---

## 概要

**TiSLY PLC Builder v5.0** は、顧客情報とセンサー見積数量を入力するだけで、  
PLC 仕様書・GX Works3 命令・配線図・納品フォルダを **一括自動生成** します。

```
顧客入力
    ↓
仕様書生成（PROJECT_SPEC.md）
    ↓
GX Works3 命令生成（GX3_COMMANDS.txt）
    ↓
配線図生成（WIRING_DIAGRAM.md）
    ↓
案件フォルダ生成
    ↓
PASS
```

---

## フォルダ構成

```
PLC_TEMPLATE_BUILDER/v5/
├── README.md                 … 本ファイル
├── customer_input.txt        … 顧客情報入力
├── estimate_input.txt        … センサー・機器数量入力
├── SPEC_GENERATOR.py         … 仕様書 / I/O / 配線図生成エンジン
├── project_generator.py      … メイン実行（納品フォルダ一括生成）
└── generated_projects/       … 生成された案件フォルダ（実行後）
```

---

## 入力ファイル

### customer_input.txt — 顧客情報

| キー | 例 |
|------|-----|
| 会社名 | TiSLY株式会社 |
| 現場名 | 本社ビル1F警備 |
| 担当者 | 山田太郎 |
| PLC型番 | FX5UJ-24MR/ES |

### estimate_input.txt — センサー数量

| キー | 説明 |
|------|------|
| 警戒スイッチ | 警戒モード切替 SW 数量 |
| 赤外線 | 赤外線センサー数量 |
| PIR | PIR センサー数量 |
| マグネット | マグネットセンサー数量 |
| 非常停止 | 非常停止 SW 数量 |
| パトライト | パトライト（赤灯）数量 |
| ブザー | 警報ブザー数量 |

---

## 使い方

### 1. 入力ファイルを編集

```powershell
cd PLC_TEMPLATE_BUILDER/v5
# customer_input.txt / estimate_input.txt を案件に合わせて編集
```

### 2. 生成実行

```powershell
python project_generator.py
```

オプション:

```powershell
python project_generator.py --customer customer_input.txt --estimate estimate_input.txt
python project_generator.py --project-name MY_PROJECT
python project_generator.py --output-dir ./generated_projects
```

### 3. 出力確認

`generated_projects/<案件名>/` に納品フォルダが生成されます。

```
<案件名>/
├── PLC_PROGRAM/
│   └── GX3_COMMANDS.txt      … GX Works3 貼り付け用命令
├── SPEC/
│   ├── PROJECT_SPEC.md       … PLC 仕様書（入力/出力/I/O表/配線表/動作仕様）
│   └── IO_ASSIGNMENT.csv     … I/O 割付 CSV
├── DRAWING/
│   └── WIRING_DIAGRAM.md     … ASCII 配線図
├── TEST/
│   ├── TEST_REPORT.md        … GX 命令監査レポート
│   └── AUTO_TEST_REPORT.md   … 全生成物存在確認
├── README.md                 … 納品 README
└── PROJECT_META.json         … 案件メタデータ
```

---

## 生成内容

### PROJECT_SPEC.md

- 案件情報（会社名 / 現場名 / 担当者 / PLC型番）
- 見積入力一覧
- 入力一覧 / 出力一覧
- I/O 表
- 配線表
- 動作仕様

### GX3_COMMANDS.txt

TiSLY PLC Template Library（001〜007）に基づく GX Works3 命令リスト。  
SM412 / SM413 点滅、非常停止全 OFF、二重コイル防止を適用。

### WIRING_DIAGRAM.md

入力・出力の ASCII 配線図と配線メモ。

---

## 自動テスト

`project_generator.py` 実行時に以下を自動検証します。

| 項目 | 内容 |
|------|------|
| 生成物存在確認 | PLC_PROGRAM / SPEC / DRAWING / TEST / README |
| M8012 / M8013 | 0 件（使用禁止） |
| SM412 / SM413 | 存在確認 |
| OUT Y0 | 1 回のみ |
| END | 末尾存在 |
| I/O 重複 | なし |

総合判定 **PASS** で完成表示します。

---

## 完成時表示

```
TiSLY PLC Builder v5.0

顧客入力
↓
仕様書生成
↓
GX Works3命令生成
↓
配線図生成
↓
案件フォルダ生成

PASS

TiSLY PLC Builder v5.0 — 完成
```

---

## 前提・依存

- Python 3.10+
- `PLC_TEMPLATE_BUILDER/v4/` — I/O 互換モジュール
- `PLC_TEMPLATE_BUILDER/engine/plc_builder.py` — GX 命令生成エンジン（v3）

---

## バージョン履歴

| 版 | 機能 |
|----|------|
| v1 | テンプレート選定・文章仕様 |
| v2.5 | Engine（キーワード解析・デバイス割付） |
| v3 | GX Works3 命令 CLI 生成 |
| v4 | 案件フォルダ自動生成・監査 |
| **v5.0** | **見積 + 顧客入力 → 仕様書 → GX Works3 → 納品フォルダ** |
| **v5.7** | **TOMS 見積 Excel 出力（TOMS_QUOTE.xlsx）** |
| **v5.8** | **現調シート生成（SITE_SURVEY.md）** |
| **v5.9** | **PLC容量自動選定強化（PLC_SELECTION.md）** |
| **v5.10** | **PLC_SELECTION 連携強化（SITE_SURVEY / TOMS / README / TEST_REPORT）** |
| **v5.11** | **単価・金額自動計算（price_master.csv / ROUGH_ESTIMATE.csv / TOMS 単価反映）** |
| **v5.12** | **TOMS 標準見積書自動生成（TOMS_ESTIMATE.xlsx）** |
| **v5.13** | **TOMS 現調報告書自動生成（TOMS_SITE_REPORT.md）** |
| **v5.14** | **TiSLY Integration Engine（TISLY/ MQTT / ESP / Node-RED）** |
| **v5.15** | **Node-RED Flow Generator（TISLY_FLOWS.json）** |
| **v5.16** | **TiSLY UI Dashboard Template（TISLY/UI/ PWA）** |

---

## v5.16 TiSLY UI Dashboard Template

v5.14 / v5.15 で生成した TiSLY 連携設定から、  
案件ごとに **PWA ダッシュボード**（`TISLY/UI/`）を自動生成します。

```powershell
cd PLC_TEMPLATE_BUILDER/v5
python project_generator.py --ui-dashboard --estimate-file estimate_mode/estimate_sample.txt
```

生成ファイル（`generated_projects/<案件名>/TISLY/UI/`）:

| ファイル | 内容 |
|----------|------|
| index.html | メインダッシュボード（警報 / 動体 / 接点 / 出力カード） |
| app.js | MQTT / UI ロジック |
| styles.css | TiSLY ダークテーマ（Google TV 大画面対応） |
| manifest.webmanifest | PWA マニフェスト |
| sw.js | Service Worker |
| UI_CONFIG.json | ブローカー / トピック / デバイス定義 |
| UI_README.md | デプロイ手順 |

以下のモードでも `TISLY/UI/` が自動生成されます:

- `--node-red-flow`
- `--full-spec`
- `--estimate-plus`
- `--quote-ready`
- `--toms-site-report`

完成時表示:

```
TiSLY PLC Builder v5.16
TiSLY UI Dashboard Template
自動テスト PASS
次Version候補: v5.17 Google TV Launcher Template
```

---

## v5.15 Node-RED Flow Generator

v5.14 で生成した `NODE_RED_CONFIG.json` / `DEVICE_MAP.csv` / `MQTT_TOPICS.md` から、  
Node-RED へインポート可能な **TISLY_FLOWS.json** を自動生成します。

```powershell
cd PLC_TEMPLATE_BUILDER/v5
python project_generator.py --node-red-flow --estimate-file estimate_mode/estimate_sample.txt
```

生成ノード:

| ノード | 役割 |
|--------|------|
| MQTT Broker | ブローカー接続設定 |
| MQTT Input Hub | alarm / motion / cmd トピック購読 |
| Alarm Handler | 警報入力 → Push / ログ |
| Motion Handler | 動体検知（デバウンス） |
| Output Control | cmd → output MQTT 出力 |
| Push Notification Placeholder | Firebase / Webhook 連携スタブ |
| Debug Logger | デバッグ出力 |
| MQTT Status Publish | state トピックへ定期ステータス |
| TiSLY UI Placeholder | Dashboard 連携スタブ（v5.16 予定） |

追加生成物:

| ファイル | 内容 |
|----------|------|
| TISLY/TISLY_FLOWS.json | Node-RED インポート用 flows 配列 JSON |

以下のモードでも `TISLY_FLOWS.json` が自動生成されます:

- `--full-spec`
- `--estimate-plus`
- `--quote-ready`
- `--toms-site-report`

完成時表示:

```
TiSLY PLC Builder v5.15
Node-RED Flow Generator
自動テスト PASS
次Version候補: v5.16 TiSLY UI Dashboard Template
```

---

## v5.14 TiSLY Integration Engine

PLC I/O 割付から TiSLY 連携設定（MQTT / ESP32 / Node-RED）を自動生成します。

```powershell
cd PLC_TEMPLATE_BUILDER/v5
python project_generator.py --toms-site-report --estimate-file estimate_mode/estimate_sample.txt
```

パイプライン:

```
案件情報 → PLC設計 → TiSLY設定 → ESP設定 → MQTT設定 → Node-RED設定 → 見積 → 現調報告書
```

追加生成物（`generated_projects/<案件名>/TISLY/`）:

| ファイル | 内容 |
|----------|------|
| DEVICE_MAP.csv | PLC デバイス ↔ TiSLY 名称 / 信号種別（ALARM / MOTION / CONTACT / OUTPUT） |
| MQTT_TOPICS.md | MQTT トピック定義 |
| ESP_CONFIG.json | ESP32 ゲートウェイ設定 |
| NODE_RED_CONFIG.json | Node-RED 連携設定 |
| TISLY_SYSTEM.md | 案件システム概要 |

以下のモードでも `TISLY/` が生成されます:

- `--full-spec`
- `--estimate-plus`
- `--quote-ready`
- `--quote-excel`
- `--toms-estimate`

完成時表示:

```
TiSLY PLC Builder v5.14
TiSLY Integration Engine
自動テスト PASS
次Version候補: v5.15 TiSLY Auto Node-RED Flow Generator
```

次版設計: [docs/V5_15_NODE_RED_FLOW_DESIGN.md](./docs/V5_15_NODE_RED_FLOW_DESIGN.md)

---

## v5.13 TOMS Site Report Mode

見積メモ・I/O・PLC選定・見積生成物から TOMS 現調報告書 Markdown を自動生成します。

```powershell
cd PLC_TEMPLATE_BUILDER/v5
python project_generator.py --toms-site-report --estimate-file estimate_mode/estimate_sample.txt
```

追加生成物:

| ファイル | 内容 |
|----------|------|
| TOMS_SITE_REPORT.md | TOMS 現調報告書（案件情報 / 現調概要 / I/O / PLC容量 / 配線 / 施工確認 / 見積連携 / TiSLY連携） |

以下のモードでも `TOMS_SITE_REPORT.md` が生成されます:

- `--full-spec`
- `--estimate-plus`
- `--quote-ready`
- `--quote-excel`
- `--toms-estimate`

完成時表示:

```
TiSLY PLC Builder v5.13
TOMS現調報告書自動生成
自動テスト PASS
次Version候補: v5.14 TiSLY MQTT / ESP連携
```

---

## v5.12 TOMS Estimate Mode

見積メモから TOMS 標準フォーマットの見積書 Excel を自動生成します。

```powershell
cd PLC_TEMPLATE_BUILDER/v5
python project_generator.py --toms-estimate --estimate-file estimate_mode/estimate_sample.txt
```

追加生成物:

| ファイル | 内容 |
|----------|------|
| TOMS_ESTIMATE.xlsx | TOMS 標準見積書（宛名・件名・明細・小計・消費税・税込合計・備考） |
| estimate_header.json | 見積ヘッダー定義（company_name / customer_name / project_name 等） |

完成時表示:

```
TiSLY PLC Builder v5.12
TOMS標準見積書生成
自動テスト PASS
次Version候補: v5.13 TOMS現調報告書自動生成
```

---

## v5.11 Price Estimation Mode

BOM.csv の部材に対し `price_master.csv`（仮単価）を突合し、単価・金額・税込合計を自動計算します。

```powershell
cd PLC_TEMPLATE_BUILDER/v5
python project_generator.py --quote-excel --estimate-file estimate_mode/estimate_sample.txt
```

追加生成物:

| ファイル | 内容 |
|----------|------|
| price_master.csv | 標準単価表（Category / Keyword / Model / UnitPrice） |
| ROUGH_ESTIMATE.csv | 部材別単価・金額 + Subtotal / Tax / Total |
| TOMS_QUOTE_ITEMS.csv | UnitPrice / Amount 自動入力 |
| TOMS_QUOTE_SUMMARY.md | 概算金額セクション |
| TOMS_QUOTE.xlsx | 単価・金額・小計・消費税・税込合計 |

**仮単価注意**: `price_master.csv` の価格はすべて仮単価です。**正式見積前に部材単価を必ず確認**してください。

完成時表示:

```
TiSLY PLC Builder v5.11
単価・金額自動計算
自動テスト PASS
次Version候補: v5.12 正式単価マスター連携
```

---

## v5.10 PLC Selection Integration

v5.9 で生成した `PLC_SELECTION.md` の容量判定結果を、関連ドキュメントへ自動反映します。

```powershell
cd PLC_TEMPLATE_BUILDER/v5
python project_generator.py --site-survey --estimate-file estimate_mode/estimate_sample.txt
```

連携先:

| ファイル | 追加セクション |
|----------|---------------|
| SITE_SURVEY.md | PLC容量確認 / 現場確認メモ |
| TOMS_QUOTE.xlsx | PLC容量判定シート |
| TOMS_QUOTE_SUMMARY.md | PLC容量判定 |
| PROJECT_README.md | PLC容量・拡張判定 |
| TEST_REPORT.md | PLC_SELECTION連携チェック |

完成時表示:

```
TiSLY PLC Builder v5.10
PLC_SELECTION integration
自動テスト PASS
```

---

## v5.9 PLC Capacity Selection

入力/出力点数から PLC 余裕率を計算し、本体・拡張ユニットを自動提案します。

```powershell
cd PLC_TEMPLATE_BUILDER/v5
python project_generator.py --quote-ready --estimate-file estimate_mode/estimate_sample.txt
```

追加生成物:

| ファイル | 内容 |
|----------|------|
| PLC_SELECTION.md | 現在PLC / 入出力使用状況 / 余裕率 / 判定 / 推奨PLC / 拡張ユニット |

選定ルール:

| 使用率 | 判定 |
|--------|------|
| 70% 未満 | 現在PLCでOK |
| 70% 以上 | 注意 |
| 80% 以上 | 1ランク上を推奨 |
| 90% 以上 | 不適合 — 上位機種必須 |

完成時表示:

```
TiSLY PLC Builder v5.9
PLC容量自動選定強化
自動テスト PASS
```

---

## v5.8 Site Survey Mode

見積メモから TOMS 見積 Excel に加え、**現調シート**（`SITE_SURVEY.md`）を自動生成します。

```powershell
cd PLC_TEMPLATE_BUILDER/v5
python project_generator.py --site-survey --estimate-file estimate_mode/estimate_sample.txt
```

追加生成物:

| ファイル | 内容 |
|----------|------|
| SITE_SURVEY.md | 機器設置チェックリスト / I/O 現調表 / 盤・電源確認 |

完成時表示:

```
TiSLY PLC Builder v5.8
見積メモ
↓
TOMS見積Excel
↓
現調シート
↓
現場調査準備

PASS
```

---

## v5.7 Quote Excel Mode

見積メモから BOM・TOMS 見積 CSV に加え、**TOMS 標準見積 Excel**（`TOMS_QUOTE.xlsx`）を自動出力します。  
openpyxl 等の外部ライブラリは不要（Python 標準ライブラリのみ）。

```powershell
cd PLC_TEMPLATE_BUILDER/v5
python project_generator.py --quote-excel --estimate-file estimate_mode/estimate_sample.txt
```

追加生成物（`generated_projects/CARSHOP_NIGHT_SECURITY/SPEC/`）:

| ファイル | 内容 |
|----------|------|
| TOMS_QUOTE.xlsx | TOMS 見積 Excel（見積明細 + 案件情報シート） |
| TOMS_QUOTE_ITEMS.csv | TOMS 見積明細行（CSV） |
| TOMS_QUOTE_SUMMARY.md | 案件サマリー・TOMS 転記メモ |

完成時表示:

```
TiSLY PLC Builder v5.8
見積メモ
↓
BOM
↓
TOMS見積CSV
↓
TOMS見積Excel
↓
見積連携

PASS
```

---

## v5.6 Quote Ready Mode

見積メモから BOM を生成し、TOMS 標準見積書フォーマットへ流し込める中間 CSV を出力します。

```powershell
cd PLC_TEMPLATE_BUILDER/v5
python project_generator.py --quote-ready --estimate-file estimate_mode/estimate_sample.txt
```

追加生成物（`generated_projects/CARSHOP_NIGHT_SECURITY/SPEC/`）:

| ファイル | 内容 |
|----------|------|
| TOMS_QUOTE_ITEMS.csv | TOMS 見積明細行（No, ItemName, Model, Qty, UnitPrice, Amount, Note） |
| TOMS_QUOTE_SUMMARY.md | 案件サマリー・TOMS 転記メモ |

---

## v5.17 Google TV Launcher Mode

Google TV / Android TV 向け **10-foot UI** ランチャー（`TISLY/UI/tv.html`）を自動生成します。

```powershell
cd PLC_TEMPLATE_BUILDER/v5
python project_generator.py --tv-launcher --estimate-file estimate_mode/estimate_sample.txt
```

追加生成物（`generated_projects/<案件名>/TISLY/UI/`）:

| ファイル | 内容 |
|----------|------|
| tv.html | Google TV ランチャー（Leanback 10-foot UI） |
| tv.css | 黒背景・大カード・カメラ枠スタイル |
| tv.js | D-pad 操作 / MQTT 連携 |
| TV_README.md | TV デプロイ手順 |

---

**TiSLY PLC Builder v5.17**
