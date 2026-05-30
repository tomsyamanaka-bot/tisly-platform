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

**TiSLY PLC Builder v5.10**
