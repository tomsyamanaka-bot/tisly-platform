#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.10 — TOMS 見積連携マッパー
BOM.csv を読み取り、TOMS 見積入力用 CSV / サマリー MD を生成する。
PLC_SELECTION 連携で PLC容量判定セクションを含む。
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass

from parts_mapper import EstimateBuildResult
from plc_selection_generator import (
    VERSION,
    PlcSelectionResult,
    analyze_plc_selection,
    format_toms_summary_plc_section,
)

TOMS_HEADER = ("No", "ItemName", "Model", "Qty", "UnitPrice", "Amount", "Note")

TOMS_ITEM_ORDER: dict[str, int] = {
    "PLC": 0,
    "24V電源": 1,
    "赤外線ビーム": 2,
    "PIRセンサー": 3,
    "パトライト": 4,
    "白色LED": 5,
    "非常停止": 6,
    "100V中継リレー": 7,
}

CATEGORY_ORDER: dict[str, int] = {
    "PLC": 0,
    "Power": 1,
    "Sensor": 2,
    "Output": 3,
    "Safety": 4,
    "Relay": 5,
}


@dataclass(frozen=True)
class BomCsvRow:
    category: str
    item: str
    qty: str
    unit: str
    note: str


@dataclass(frozen=True)
class TomsQuoteItem:
    item_name: str
    model: str
    qty: str
    note: str

    def to_csv_row(self, no: int) -> tuple[str, str, str, str, str, str, str]:
        return (str(no), self.item_name, self.model, self.qty, "", "", self.note)


def parse_bom_csv(csv_text: str) -> list[BomCsvRow]:
    """BOM.csv テキストを解析する。"""
    reader = csv.DictReader(io.StringIO(csv_text))
    rows: list[BomCsvRow] = []
    for record in reader:
        rows.append(
            BomCsvRow(
                category=(record.get("Category") or "").strip(),
                item=(record.get("Item") or "").strip(),
                qty=(record.get("Qty") or "").strip(),
                unit=(record.get("Unit") or "").strip(),
                note=(record.get("Note") or "").strip(),
            )
        )
    return rows


def _bom_row_to_toms(row: BomCsvRow) -> TomsQuoteItem:
    """BOM 行を TOMS 見積行に変換する。"""
    if row.category == "PLC":
        return TomsQuoteItem("PLC", row.item, row.qty, row.note)
    if row.category == "Power":
        return TomsQuoteItem("24V電源", row.item, row.qty, row.note)
    return TomsQuoteItem(row.item, "", row.qty, row.note)


def _sort_key(item: TomsQuoteItem) -> tuple[int, int, str]:
    order = TOMS_ITEM_ORDER.get(item.item_name, 99)
    return (order, CATEGORY_ORDER.get("Sensor", 99), item.item_name)


def bom_rows_to_toms_items(rows: list[BomCsvRow]) -> list[TomsQuoteItem]:
    """BOM 行リストを TOMS 見積行リストへ変換（並び替え付き）。"""
    items = [_bom_row_to_toms(row) for row in rows]
    return sorted(items, key=_sort_key)


def generate_toms_quote_items_csv(bom_csv_text: str) -> str:
    """BOM.csv から TOMS_QUOTE_ITEMS.csv 文字列を生成する。"""
    rows = parse_bom_csv(bom_csv_text)
    items = bom_rows_to_toms_items(rows)
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(TOMS_HEADER)
    for index, item in enumerate(items, start=1):
        writer.writerow(item.to_csv_row(index))
    return buffer.getvalue()


def generate_toms_quote_summary(
    result: EstimateBuildResult,
    item_count: int,
    plc_selection: PlcSelectionResult | None = None,
) -> str:
    """TOMS_QUOTE_SUMMARY.md を生成する。"""
    memo = result.memo
    estimation = result.estimation
    plc_model = result.assignment.customer.plc_model
    power_model = estimation.power_model
    input_count = len(result.assignment.inputs)
    output_count = len(result.assignment.outputs)
    project_title = memo.project_title or memo.project_name

    if plc_selection is None:
        plc_selection = analyze_plc_selection(plc_model, input_count, output_count)
    plc_section = format_toms_summary_plc_section(plc_selection)

    return f"""# TOMS 見積連携サマリー — {project_title}

> TiSLY PLC Builder {VERSION} 自動生成

---

## 案件情報

| 項目 | 内容 |
|------|------|
| 案件名 | {project_title} |
| PLC型番 | {plc_model} |
| 電源型番 | MeanWell {power_model} |
| 入力点数 | {input_count} 点 |
| 出力点数 | {output_count} 点 |
| 見積項目数 | {item_count} 件 |

---

{plc_section}

## TOMS 標準フォーマット転記メモ

- `TOMS_QUOTE_ITEMS.csv` の各行を TOMS 標準見積書の明細行へ転記してください。
- **UnitPrice** / **Amount** は本 CSV では空欄です。TOMS 側で単価・金額を入力してください。
- **Model** が空欄の行は、現場条件に合わせて型番を追記してください。
- PLC・24V電源は BOM から型番を自動転記済みです。
- 100V 白灯は中継リレー経由のため、リレー・接点ブロックを別途見積に含めてください。

---

## 連携フロー

```
見積メモ
    ↓
BOM.csv / ROUGH_ESTIMATE.md
    ↓
TOMS_QUOTE_ITEMS.csv（本ファイル群）
    ↓
TOMS 標準見積書フォーマット（TOMS_QUOTE.xlsx / 手動転記）
```

---

**TiSLY PLC Builder {VERSION} — TOMS_QUOTE_SUMMARY**
"""


def parse_toms_quote_items_csv(csv_text: str) -> list[dict[str, str]]:
    """TOMS_QUOTE_ITEMS.csv を解析する（監査用）。"""
    reader = csv.DictReader(io.StringIO(csv_text))
    return [dict(record) for record in reader]


def toms_items_have_plc(items: list[dict[str, str]]) -> bool:
    return any(row.get("ItemName") == "PLC" for row in items)


def toms_items_have_power(items: list[dict[str, str]]) -> bool:
    return any(row.get("ItemName") == "24V電源" for row in items)


def toms_items_sequential_nos(items: list[dict[str, str]]) -> bool:
    if not items:
        return False
    for index, row in enumerate(items, start=1):
        if row.get("No") != str(index):
            return False
    return True


def toms_items_all_qty_filled(items: list[dict[str, str]]) -> bool:
    return bool(items) and all((row.get("Qty") or "").strip() for row in items)
