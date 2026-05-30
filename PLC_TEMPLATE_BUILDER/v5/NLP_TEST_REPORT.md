# NLP_TEST_REPORT — TiSLY PLC Builder v5.2

> 日本語文章 → テンプレ推定 → 案件生成 一括テスト

---

## 実行概要

| 項目 | 値 |
|------|-----|
| 実行日時 (UTC) | 2026-05-29T22:20:40Z |
| サンプル数 | 5 |
| 入力 | `nlp/sample_requests.txt` |

---

## サマリー

| 期待テンプレ | 推定テンプレ | 一致率 | 推定 | 生成 | 総合 |
|-------------|-------------|:------:|:----:|:----:|:----:|
| HOME_SECURITY | HOME_SECURITY | 70% | PASS | PASS | PASS |
| CARSHOP_SECURITY | CARSHOP_SECURITY | 70% | PASS | PASS | PASS |
| WAREHOUSE_SECURITY | WAREHOUSE_SECURITY | 88% | PASS | PASS | PASS |
| MINPAKU_COUNTER | MINPAKU_COUNTER | 86% | PASS | PASS | PASS |
| FACTORY_SAFETY | FACTORY_SAFETY | 88% | PASS | PASS | PASS |

**総合判定: PASS**

---

## テンプレート別結果

### HOME_SECURITY

**入力文章**

> 自宅の警備システムを作りたい。 警戒スイッチと外周センサー、近接センサーを設置して、 侵入時は赤灯と白灯で警告したい。 非常停止も必要。

| 項目 | 値 |
|------|-----|
| 期待テンプレ | HOME_SECURITY |
| 推定テンプレ | HOME_SECURITY |
| 一致率 | 70% |
| 推定理由 | 外周 / 外周センサー / 自宅 / 警戒スイッチ / 近接センサー / 警備 / 警戒 / 白灯 / 赤灯 / 非常停止 |
| 出力先 | `C:\Users\yaman\TiSLY_HOME_Security_DEMO\PLC_TEMPLATE_BUILDER\v5\generated_projects\HOME_SECURITY` |
| 推定判定 | PASS |
| 生成判定 | PASS |
| 総合判定 | **PASS** |

### CARSHOP_SECURITY

**入力文章**

> 自動車販売店のショールームで夜間警戒が必要。 外周センサーと展示車エリアのセンサーを設置し、 展示車への侵入を検知したら赤灯と白灯で警報したい。

| 項目 | 値 |
|------|-----|
| 期待テンプレ | CARSHOP_SECURITY |
| 推定テンプレ | CARSHOP_SECURITY |
| 一致率 | 70% |
| 推定理由 | 展示車 / 展示車エリア / ショールーム / 夜間警戒 / 自動車販売 / 自動車 / 外周 / 外周センサー / 白灯 / 赤灯 |
| 出力先 | `C:\Users\yaman\TiSLY_HOME_Security_DEMO\PLC_TEMPLATE_BUILDER\v5\generated_projects\CARSHOP_SECURITY` |
| 推定判定 | PASS |
| 生成判定 | PASS |
| 総合判定 | **PASS** |

### WAREHOUSE_SECURITY

**入力文章**

> 物流倉庫のシャッター監視と侵入センサーが必要。 警報時は照明連動で倉庫内を点灯させ、 警報ランプも点灯させたい。

| 項目 | 値 |
|------|-----|
| 期待テンプレ | WAREHOUSE_SECURITY |
| 推定テンプレ | WAREHOUSE_SECURITY |
| 一致率 | 88% |
| 推定理由 | シャッター / シャッター監視 / 倉庫 / 照明連動 / 侵入 / 侵入センサー / 物流 / 警報ランプ / 監視 |
| 出力先 | `C:\Users\yaman\TiSLY_HOME_Security_DEMO\PLC_TEMPLATE_BUILDER\v5\generated_projects\WAREHOUSE_SECURITY` |
| 推定判定 | PASS |
| 生成判定 | PASS |
| 総合判定 | **PASS** |

### MINPAKU_COUNTER

**入力文章**

> 民泊で入口と出口に赤外線を付けて人数カウントしたい。 満室表示もほしい。 清掃モードも必要。

| 項目 | 値 |
|------|-----|
| 期待テンプレ | MINPAKU_COUNTER |
| 推定テンプレ | MINPAKU_COUNTER |
| 一致率 | 86% |
| 推定理由 | 人数カウント / 民泊 / 清掃モード / 満室表示 / 入口 / 出口 / 赤外線 |
| 出力先 | `C:\Users\yaman\TiSLY_HOME_Security_DEMO\PLC_TEMPLATE_BUILDER\v5\generated_projects\MINPAKU_COUNTER` |
| 推定判定 | PASS |
| 生成判定 | PASS |
| 総合判定 | **PASS** |

### FACTORY_SAFETY

**入力文章**

> 工場の生産ラインに安全カーテンと設備異常入力を設置したい。 異常時はパトライトとブザーで警告し、搬送停止も連動させたい。

| 項目 | 値 |
|------|-----|
| 期待テンプレ | FACTORY_SAFETY |
| 推定テンプレ | FACTORY_SAFETY |
| 一致率 | 88% |
| 推定理由 | 安全カーテン / 工場 / 生産ライン / 設備異常 / ブザー / ライン / 搬送 / 搬送停止 / パトライト / 安全 |
| 出力先 | `C:\Users\yaman\TiSLY_HOME_Security_DEMO\PLC_TEMPLATE_BUILDER\v5\generated_projects\FACTORY_SAFETY` |
| 推定判定 | PASS |
| 生成判定 | PASS |
| 総合判定 | **PASS** |


---

**TiSLY PLC Builder v5.2 — NLP_TEST_REPORT**
