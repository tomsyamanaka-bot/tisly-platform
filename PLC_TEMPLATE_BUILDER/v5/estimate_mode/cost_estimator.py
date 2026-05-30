#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.5 — 概算見積生成
部材数量・PLC/電源容量から SPEC/ROUGH_ESTIMATE.md を自動生成する。
"""

from __future__ import annotations

from bom_generator import build_bom_rows
from parts_mapper import EstimateBuildResult

BUILDER_VERSION = "TiSLY PLC Builder v5.5"


def generate_rough_estimate(result: EstimateBuildResult) -> str:
    """概算見積 Markdown を生成する。"""
    memo = result.memo
    estimation = result.estimation
    plc_model = result.assignment.customer.plc_model
    bom_rows = build_bom_rows(result)

    parts_table = "\n".join(
        f"| {r.category} | {r.item} | {r.qty} | {r.unit} | {r.note} |"
        for r in bom_rows
    )

    return f"""# 概算見積 — {memo.project_title}

> {BUILDER_VERSION} 自動生成

---

## 案件概要

| 項目 | 内容 |
|------|------|
| 案件名 | {memo.project_title} |
| 目的 | {memo.purpose} |
| PLC型番 | {plc_model} |
| 24V電源 | MeanWell {estimation.power_model} |

---

## 概算部材一覧

| Category | Item | Qty | Unit | Note |
|----------|------|-----|------|------|
{parts_table}

---

## 数量サマリー

| 区分 | 数量 |
|------|------|
| 入力点数 | {estimation.input_count} 点 |
| 出力点数 | {estimation.output_count} 点 |
| 24Vセンサー | {estimation.sensor_24v_count} 台 |
| 24V出力 | {estimation.output_24v_count} 点 |
| 100V白灯 | {memo.parts.get('white_led', 0)} 台 |
| 中継リレー | {memo.parts.get('white_led', 0)} 個 |

---

## PLC容量

| 項目 | 使用 | 最大 | 余裕 |
|------|------|------|------|
| 入力 | {estimation.input_count} 点 | {estimation.plc.max_inputs} 点 | {estimation.spare_inputs} 点 |
| 出力 | {estimation.output_count} 点 | {estimation.plc.max_outputs} 点 | {estimation.spare_outputs} 点 |

- 選定型番: **{plc_model}**
- 容量判定: **{'OK' if estimation.capacity_ok else '要確認'}**

---

## 電源容量

| 項目 | 内容 |
|------|------|
| 推奨電源 | MeanWell {estimation.power_model} |
| 定格出力 | {estimation.power_supply.wattage} W / {estimation.power_supply.max_current_a} A |
| 用途 | {estimation.power_supply.description} |
| 24V負荷概算 | センサー {estimation.sensor_24v_count} 台 + 24V出力 {estimation.output_24v_count} 点 + PLC本体 |

---

## 注意

> **金額は後で TOMS 標準フォーマットへ連携予定**

- 本書は部材数量・容量の概算です。単価・工事費は含みません。
- 100V 白灯は中継リレー経由のため、リレー・接点ブロックを別途見積に含めてください。
- ケーブル・盤・施工費は現場条件により変動します。

---

**{BUILDER_VERSION} — ROUGH_ESTIMATE**
"""
