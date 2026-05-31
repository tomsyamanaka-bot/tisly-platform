#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.11 — 概算見積生成
BOM.csv と price_master.csv を突合し、単価・金額・税込合計を自動計算する。
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from pathlib import Path

from bom_generator import BomRow, build_bom_rows
from parts_mapper import EstimateBuildResult

BUILDER_VERSION = "TiSLY PLC Builder v5.11"
TAX_RATE = 0.10

PRICE_MASTER_PATH = Path(__file__).resolve().parent / "price_master.csv"
ROUGH_ESTIMATE_CSV_HEADER = (
    "No",
    "Category",
    "Item",
    "Model",
    "Qty",
    "UnitPrice",
    "Amount",
    "Note",
)


@dataclass(frozen=True)
class PriceMasterRow:
    category: str
    keyword: str
    model: str
    unit_price: int | None
    note: str


@dataclass(frozen=True)
class PricedLine:
    category: str
    item: str
    model: str
    qty: int
    unit_price: int | None
    amount: int | None
    note: str


@dataclass(frozen=True)
class PriceSummary:
    lines: tuple[PricedLine, ...]
    subtotal: int
    tax: int
    total: int


def load_price_master(path: Path | None = None) -> list[PriceMasterRow]:
    """price_master.csv を読み込む。"""
    master_path = path or PRICE_MASTER_PATH
    rows: list[PriceMasterRow] = []
    with master_path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for record in reader:
            raw_price = (record.get("UnitPrice") or "").strip()
            unit_price = int(raw_price) if raw_price.isdigit() else None
            rows.append(
                PriceMasterRow(
                    category=(record.get("Category") or "").strip(),
                    keyword=(record.get("Keyword") or "").strip(),
                    model=(record.get("Model") or "").strip(),
                    unit_price=unit_price,
                    note=(record.get("Note") or "").strip(),
                )
            )
    return rows


def _models_match(item: str, model: str) -> bool:
    if not model:
        return False
    item_upper = item.upper()
    model_upper = model.upper()
    return model_upper in item_upper or item_upper in model_upper


def match_unit_price(
    category: str,
    item: str,
    price_rows: list[PriceMasterRow],
) -> int | None:
    """BOM 行に対応する単価を price_master から検索する。"""
    # 1. Model 一致（最優先）
    for row in price_rows:
        if row.model and _models_match(item, row.model):
            return row.unit_price

    # 2. Category 一致 + Keyword を Item 名に含む
    for row in price_rows:
        if row.category != category:
            continue
        if row.keyword and row.keyword in item:
            return row.unit_price

    return None


def _bom_model(category: str, item: str) -> str:
    if category == "PLC":
        return item
    if category == "Power":
        return item
    return ""


def price_bom_rows(
    bom_rows: list[BomRow],
    price_rows: list[PriceMasterRow] | None = None,
) -> PriceSummary:
    """BOM 行リストに単価・金額を付与し、小計・税・合計を計算する。"""
    if price_rows is None:
        price_rows = load_price_master()

    lines: list[PricedLine] = []
    subtotal = 0

    for bom_row in bom_rows:
        unit_price = match_unit_price(bom_row.category, bom_row.item, price_rows)
        amount = unit_price * bom_row.qty if unit_price is not None else None
        if amount is not None:
            subtotal += amount
        lines.append(
            PricedLine(
                category=bom_row.category,
                item=bom_row.item,
                model=_bom_model(bom_row.category, bom_row.item),
                qty=bom_row.qty,
                unit_price=unit_price,
                amount=amount,
                note=bom_row.note,
            )
        )

    tax = int(subtotal * TAX_RATE)
    total = subtotal + tax
    return PriceSummary(lines=tuple(lines), subtotal=subtotal, tax=tax, total=total)


def build_price_summary(result: EstimateBuildResult) -> PriceSummary:
    """EstimateBuildResult から概算金額サマリーを構築する。"""
    return price_bom_rows(build_bom_rows(result))


def _format_yen(value: int | None) -> str:
    if value is None:
        return ""
    return f"{value:,}"


def generate_rough_estimate(result: EstimateBuildResult) -> str:
    """概算見積 Markdown を生成する。"""
    memo = result.memo
    estimation = result.estimation
    plc_model = result.assignment.customer.plc_model
    summary = build_price_summary(result)

    parts_table = "\n".join(
        f"| {line.category} | {line.item} | {line.qty} | "
        f"{_format_yen(line.unit_price)} | {_format_yen(line.amount)} | {line.note} |"
        for line in summary.lines
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

## 概算部材一覧（仮単価）

| Category | Item | Qty | 単価 | 金額 | Note |
|----------|------|-----|------|------|------|
{parts_table}

---

## 概算金額

| 項目 | 金額 |
|------|------|
| 小計 | {_format_yen(summary.subtotal)} 円 |
| 消費税（10%） | {_format_yen(summary.tax)} 円 |
| **税込合計** | **{_format_yen(summary.total)} 円** |

> **仮単価です。正式見積前に部材単価を必ず確認してください。**

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

- 本書の単価は **price_master.csv の仮単価** です。**正式見積前に確認** してください。
- 工事費・ケーブル・盤・施工費は含みません。
- 100V 白灯は中継リレー経由のため、リレー・接点ブロックを別途見積に含めてください。
- ケーブル・盤・施工費は現場条件により変動します。

---

**{BUILDER_VERSION} — ROUGH_ESTIMATE**
"""


def generate_rough_estimate_csv(result: EstimateBuildResult) -> str:
    """SPEC/ROUGH_ESTIMATE.csv を生成する。"""
    summary = build_price_summary(result)
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(ROUGH_ESTIMATE_CSV_HEADER)

    for index, line in enumerate(summary.lines, start=1):
        writer.writerow(
            (
                str(index),
                line.category,
                line.item,
                line.model,
                str(line.qty),
                str(line.unit_price) if line.unit_price is not None else "",
                str(line.amount) if line.amount is not None else "",
                line.note,
            )
        )

    writer.writerow(("", "", "Subtotal", "", "", "", str(summary.subtotal), ""))
    writer.writerow(("", "", "Tax", "", "", "", str(summary.tax), ""))
    writer.writerow(("", "", "Total", "", "", "", str(summary.total), ""))
    return buffer.getvalue()


def rough_estimate_csv_has_totals(csv_text: str) -> bool:
    """ROUGH_ESTIMATE.csv に小計・消費税・合計行があるか（監査用）。"""
    return "Subtotal" in csv_text and "Tax" in csv_text and "Total" in csv_text


def price_master_exists() -> bool:
    """price_master.csv が存在するか（監査用）。"""
    return PRICE_MASTER_PATH.is_file()


def summary_has_priced_lines(summary: PriceSummary) -> bool:
    """少なくとも1行に単価が付いているか（監査用）。"""
    return any(line.unit_price is not None for line in summary.lines)


def summary_totals_valid(summary: PriceSummary) -> bool:
    """小計・消費税・税込合計が整合しているか（監査用）。"""
    expected_tax = int(summary.subtotal * TAX_RATE)
    expected_total = summary.subtotal + expected_tax
    return summary.tax == expected_tax and summary.total == expected_total
