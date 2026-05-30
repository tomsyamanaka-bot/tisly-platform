#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.4 — 見積部品マッパー
見積メモの機器数量 → I/O 割付 / PLC選定 / 電源選定
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path

ESTIMATE_MODE_DIR = Path(__file__).resolve().parent
V5_DIR = ESTIMATE_MODE_DIR.parent
SPEC_GEN_DIR = V5_DIR / "spec_generator"

sys.path.insert(0, str(V5_DIR))
sys.path.insert(0, str(SPEC_GEN_DIR))
sys.path.insert(0, str(ESTIMATE_MODE_DIR))

from SPEC_GENERATOR import CustomerInfo  # noqa: E402
from device_estimator import EstimationResult, estimate_all, get_plc_by_model  # noqa: E402
from io_allocator import (  # noqa: E402
    DeviceQuantities,
    allocate_io_from_quantities,
    format_io_allocation_summary,
)
from spec_builder import SpecCheck, run_spec_validation  # noqa: E402

from estimate_parser import EstimateMemo  # noqa: E402


@dataclass
class EstimateBuildResult:
    memo: EstimateMemo
    quantities: DeviceQuantities
    assignment: object  # IOAssignment
    estimation: EstimationResult
    project_name: str
    spec_checks: list[SpecCheck] = field(default_factory=list)
    all_pass: bool = False


def memo_to_quantities(memo: EstimateMemo) -> DeviceQuantities:
    """EstimateMemo を DeviceQuantities に変換する。"""
    return DeviceQuantities(
        raw_text=memo.raw_text,
        purpose=memo.purpose,
        project_name=memo.project_name,
        counts=dict(memo.parts),
    )


def build_from_estimate_memo(
    memo: EstimateMemo,
    *,
    company: str = "TiSLY株式会社",
    contact: str = "自動生成",
) -> EstimateBuildResult:
    """見積メモから I/O 割付・PLC/電源推定を一括構築する。"""
    quantities = memo_to_quantities(memo)

    customer = CustomerInfo(
        company=company,
        site=memo.project_title or memo.project_name,
        contact=contact,
        plc_model=memo.plc_model,
    )

    assignment = allocate_io_from_quantities(
        quantities,
        customer,
        include_system_inputs=True,
        device_only=False,
    )

    patlite = sum(1 for e in assignment.outputs if e.category == "パトライト")
    buzzer = sum(1 for e in assignment.outputs if "ブザー" in e.name)
    white = sum(1 for e in assignment.outputs if e.name.startswith("白灯"))

    estimation = estimate_all(
        len(assignment.inputs),
        len(assignment.outputs),
        output_patlite=patlite,
        output_buzzer=buzzer,
        output_white_led=white,
    )

    # 見積メモで PLC 型番が指定されている場合は容量チェック用に反映
    specified_plc = get_plc_by_model(memo.plc_model)
    if specified_plc:
        assignment.customer.plc_model = memo.plc_model
    else:
        assignment.customer.plc_model = estimation.plc_model

    spec_checks = run_spec_validation(assignment, estimation)
    errors = [c for c in spec_checks if not c.passed and c.severity == "error"]
    all_pass = len(errors) == 0

    return EstimateBuildResult(
        memo=memo,
        quantities=quantities,
        assignment=assignment,
        estimation=estimation,
        project_name=memo.project_name,
        spec_checks=spec_checks,
        all_pass=all_pass,
    )


def format_plc_spec_summary(result: EstimateBuildResult) -> str:
    """PLC 仕様サマリーを返す。"""
    e = result.estimation
    lines = [
        f"PLC: {result.assignment.customer.plc_model}",
        f"入力: {e.input_count} / {e.plc.max_inputs} 点",
        f"出力: {e.output_count} / {e.plc.max_outputs} 点",
        f"電源: MeanWell {e.power_model} ({e.power_supply.description})",
        f"入力余裕: {e.spare_inputs} 点 / 出力余裕: {e.spare_outputs} 点",
    ]
    return "\n".join(lines)


def format_io_table(result: EstimateBuildResult) -> str:
    """I/O 表テキストを返す。"""
    return format_io_allocation_summary(result.assignment)
