#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.5 — 部材表 (BOM) 生成
見積メモ・I/O 割付から SPEC/BOM.csv を自動生成する。
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass

from estimate_parser import EstimateMemo
from parts_mapper import EstimateBuildResult

BOM_HEADER = ("Category", "Item", "Qty", "Unit", "Note")

PART_BOM_MAP: dict[str, tuple[str, str, str, str]] = {
    "infrared": ("Sensor", "赤外線ビーム", "本", "外周検知"),
    "pir": ("Sensor", "PIRセンサー", "台", "展示車エリア"),
    "patlite": ("Output", "パトライト", "台", "24V"),
    "white_led": ("Output", "白色LED", "台", "100V"),
    "estop": ("Safety", "非常停止", "個", "NC推奨"),
    "buzzer": ("Output", "ブザー", "台", "24V"),
    "magnet": ("Sensor", "マグネットセンサー", "個", "ドア監視"),
    "arm_switch": ("Input", "警戒スイッチ", "個", "システム"),
    "night_arm": ("Input", "夜間警戒SW", "個", "システム"),
    "shutter": ("Sensor", "シャッターセンサー", "台", "開閉監視"),
    "safety_curtain": ("Sensor", "安全カーテン", "台", "安全監視"),
    "entrance": ("Sensor", "入口赤外線", "本", "入口監視"),
    "exit": ("Sensor", "出口赤外線", "本", "出口監視"),
    "intrusion": ("Sensor", "侵入センサー", "台", "侵入検知"),
}


@dataclass(frozen=True)
class BomRow:
    category: str
    item: str
    qty: int
    unit: str
    note: str

    def to_csv_row(self) -> tuple[str, str, str, str, str]:
        return (self.category, self.item, str(self.qty), self.unit, self.note)


def _relay_count(memo: EstimateMemo) -> int:
    return memo.parts.get("white_led", 0)


def build_bom_rows(result: EstimateBuildResult) -> list[BomRow]:
    """EstimateBuildResult から BOM 行リストを構築する。"""
    memo = result.memo
    estimation = result.estimation
    plc_model = result.assignment.customer.plc_model
    power_model = f"MeanWell {estimation.power_model}"

    rows: list[BomRow] = [
        BomRow("PLC", plc_model, 1, "台", "自動選定"),
        BomRow("Power", power_model, 1, "台", "24V電源"),
    ]

    for key, qty in sorted(memo.parts.items()):
        if qty <= 0:
            continue
        mapping = PART_BOM_MAP.get(key)
        if mapping:
            category, item, unit, note = mapping
            rows.append(BomRow(category, item, qty, unit, note))

    relay_qty = _relay_count(memo)
    if relay_qty > 0:
        y_range = f"Y1〜Y{relay_qty}" if relay_qty > 1 else "Y1"
        rows.append(BomRow("Relay", "100V中継リレー", relay_qty, "個", f"{y_range}用"))

    return rows


def generate_bom_csv(result: EstimateBuildResult) -> str:
    """BOM.csv 文字列を生成する。"""
    rows = build_bom_rows(result)
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(BOM_HEADER)
    for row in rows:
        writer.writerow(row.to_csv_row())
    return buffer.getvalue()


def _normalize_plc_model(model: str) -> str:
    return model.upper().replace("FX5UJ", "FX5U")


def bom_contains_plc(csv_text: str, plc_model: str) -> bool:
    return _normalize_plc_model(plc_model) in _normalize_plc_model(csv_text)


def bom_contains_power(csv_text: str, power_model: str) -> bool:
    return power_model.upper() in csv_text.upper()
