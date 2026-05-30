# TiSLY PLC Builder v5.4 — 見積モード

> **見積・現場メモ形式** から PLC 案件を自動生成

---

## 概要

見積書や現場メモに書かれた機器数量を読み取り、PLC 仕様・I/O 表・GX Works3 命令・配線図・案件フォルダを一括生成します。

```
見積メモ
    ↓
PLC仕様
    ↓
I/O表
    ↓
GX命令
    ↓
配線図
    ↓
案件フォルダ
    ↓
PASS
```

---

## ファイル構成

```
estimate_mode/
├── README.md              … 本ファイル
├── estimate_parser.py     … 見積メモ解析
├── parts_mapper.py        … 部品→I/O / PLC / 電源マッピング
└── estimate_sample.txt    … サンプル見積メモ
```

---

## 見積メモ形式

| キー | 例 | 説明 |
|------|-----|------|
| 案件名 | 車屋展示場 夜間監視 | 案件タイトル（フォルダ名自動生成） |
| PLC | FX5UJ-24MR/ES | PLC 型番（省略可） |
| 赤外線ビーム | 4本 | 赤外線センサー数量 |
| 人感センサー | 2台 | PIR センサー数量 |
| パトライト | 1台 | パトライト数量 |
| 白色LED | 4台 | 白灯出力数量 |
| 非常停止 | 1個 | 非常停止 SW 数量 |
| 24V電源 | 自動選定 | 電源（自動選定 / 型番指定） |
| 目的 | 夜間の侵入検知と警告表示 | 案件目的 |

数量単位: `本` `台` `個` `点` など（数値のみでも可）

---

## 使い方

```powershell
cd PLC_TEMPLATE_BUILDER/v5
python project_generator.py --estimate-mode --estimate-file estimate_mode/estimate_sample.txt
```

出力先: `generated_projects/CARSHOP_NIGHT_SECURITY/`

---

## 処理内容

1. 見積メモから数量を抽出（`estimate_parser.py`）
2. 入力点数・出力点数を計算
3. PLC 型番を推定（`device_estimator.py`）
4. 電源容量を推定（MeanWell 自動選定）
5. I/O 表を生成
6. GX Works3 命令を生成
7. 配線図を生成
8. 案件フォルダを生成
9. TEST_REPORT.md を生成

---

## チェック項目

| 項目 | 内容 |
|------|------|
| 入力点数 | PLC 容量内 |
| 出力点数 | PLC 容量内 |
| M8012 / M8013 | 不使用（0 件） |
| SM412 / SM413 | 使用（各 1 件以上） |
| OUT 重複 | なし |
| END | 末尾存在 |
| I/O 重複 | なし |
| 総合判定 | PASS |

---

**TiSLY PLC Builder v5.4 — estimate_mode**
