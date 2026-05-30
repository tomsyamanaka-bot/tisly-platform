# TiSLY PLC Builder v5.2 — 日本語 NLP モジュール

> **普通の日本語文章** からテンプレート判定・部品選定・案件生成を行う

---

## 概要

v5.2 では、用途別テンプレート名を直接指定する代わりに、  
**自然な日本語の要求文** を入力として最適テンプレートを自動推定します。

```
日本語文章
    ↓
キーワード抽出（intent_parser）
    ↓
テンプレ推定（template_recommender）
    ↓
案件生成（project_generator）
    ↓
PASS
```

---

## ファイル構成

```
PLC_TEMPLATE_BUILDER/v5/nlp/
├── README.md                 … 本ファイル
├── keyword_dictionary.json   … テンプレ別キーワード辞書
├── intent_parser.py          … 日本語文章解析・キーワード抽出
├── template_recommender.py   … テンプレ推定・信頼度計算
└── sample_requests.txt       … 各テンプレ用サンプル要求文
```

---

## 対応テンプレート

| テンプレートID | 用途 |
|---------------|------|
| HOME_SECURITY | 住宅・自宅警備 |
| CARSHOP_SECURITY | 自動車販売店・展示車警備 |
| WAREHOUSE_SECURITY | 倉庫・シャッター監視 |
| MINPAKU_COUNTER | 民泊・人数カウント |
| FACTORY_SAFETY | 工場・生産ライン安全 |

---

## 使い方

### 1. サンプル要求から一括生成

```powershell
cd PLC_TEMPLATE_BUILDER/v5
python project_generator.py --nl
```

`nlp/sample_requests.txt` を読み込み、各文章について:

1. テンプレート推定
2. 信頼度・理由表示
3. 案件フォルダ生成

を実行します。結果は `NLP_TEST_REPORT.md` に出力されます。

### 2. Python API

```python
from nlp.template_recommender import recommend_template

text = """民泊で入口と出口に赤外線を付けて人数カウントしたい。
満室表示もほしい。清掃モードも必要。"""

result = recommend_template(text)
print(result.format_summary())
# 推定: MINPAKU_COUNTER
# 一致率: 92%
# 理由: 入口, 出口, 人数カウント, ...
```

### 3. キーワード抽出のみ

```python
from nlp.intent_parser import extract_keywords

parsed = extract_keywords("倉庫のシャッター監視と照明連動")
print(parsed.matched_labels)
```

---

## 推定ロジック

1. 入力文を正規化（全角半角統一・小文字化）
2. `keyword_dictionary.json` の各キーワードを部分一致検索
3. テンプレートごとに重み付きスコアを合算
4. 最高スコアのテンプレートを推定
5. 一致率 = `(一致キーワード重み合計 / テンプレ最大重み合計) × 100`

---

## サンプル要求ファイル形式

```
=== MINPAKU_COUNTER ===
民泊で入口と出口に赤外線を付けて人数カウントしたい。
満室表示もほしい。
清掃モードも必要。
```

`=== テンプレート名 ===` が期待テンプレート（テスト用）です。

---

## テスト

```powershell
python project_generator.py --nl
```

各テンプレートについて **文章 → 推定 → 生成** が成功すると  
`NLP_TEST_REPORT.md` に **PASS** が記録されます。

---

**TiSLY PLC Builder v5.2 — NLP Module**
