#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.3 — 仕様書ビルダー
自然文 → PROJECT_SPEC.md / SPEC_TEST_REPORT.md 自動生成
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

SPEC_GEN_DIR = Path(__file__).resolve().parent
V5_DIR = SPEC_GEN_DIR.parent
TEMPLATES_DIR = SPEC_GEN_DIR / "spec_templates"

sys.path.insert(0, str(V5_DIR))
sys.path.insert(0, str(SPEC_GEN_DIR))

from SPEC_GENERATOR import (  # noqa: E402
    CustomerInfo,
    IOAssignment,
    IOEntry,
    generate_io_csv,
    generate_wiring_diagram,
    _sanitize_project_name,
)

from device_estimator import EstimationResult, estimate_all, get_plc_by_model  # noqa: E402
from io_allocator import (  # noqa: E402
    DeviceQuantities,
    allocate_io_from_quantities,
    format_io_allocation_summary,
    parse_devices_from_text,
)

VERSION = "v5.3"
BUILDER_NAME = f"TiSLY PLC Builder {VERSION}"


@dataclass
class SpecCheck:
    name: str
    passed: bool
    detail: str
    severity: str = "error"  # error | warning | info


@dataclass
class SpecBuildResult:
    quantities: DeviceQuantities
    assignment: IOAssignment
    estimation: EstimationResult
    project_name: str
    spec_md: str
    test_report_md: str
    checks: list[SpecCheck] = field(default_factory=list)
    all_pass: bool = False
    template_name: str | None = None


def run_spec_validation(
    assignment: IOAssignment,
    estimation: EstimationResult,
) -> list[SpecCheck]:
    """I/O 不足・重複・PLC容量超過・未使用点を検査する。"""
    checks: list[SpecCheck] = []
    devices = [e.device for e in assignment.entries]
    duplicates = {d for d in devices if devices.count(d) > 1}

    checks.append(
        SpecCheck(
            "I/O 重複なし",
            len(duplicates) == 0,
            "重複なし" if not duplicates else ", ".join(sorted(duplicates)),
        )
    )

    input_count = len(assignment.inputs)
    output_count = len(assignment.outputs)

    checks.append(
        SpecCheck(
            "入力点数チェック",
            input_count <= estimation.plc.max_inputs,
            f"使用 {input_count} / 最大 {estimation.plc.max_inputs}",
        )
    )
    checks.append(
        SpecCheck(
            "出力点数チェック",
            output_count <= estimation.plc.max_outputs,
            f"使用 {output_count} / 最大 {estimation.plc.max_outputs}",
        )
    )

    capacity_overflow = (
        input_count > estimation.plc.max_inputs
        or output_count > estimation.plc.max_outputs
    )
    checks.append(
        SpecCheck(
            "PLC 容量超過",
            not capacity_overflow,
            "OK" if not capacity_overflow else "容量超過 — 上位機種を検討",
        )
    )

    if input_count == 0:
        checks.append(SpecCheck("入力 I/O 不足", False, "入力が 0 点"))
    else:
        checks.append(SpecCheck("入力 I/O 不足", True, f"{input_count} 点割付済"))

    if output_count == 0:
        checks.append(SpecCheck("出力 I/O 不足", False, "出力が 0 点"))
    else:
        checks.append(SpecCheck("出力 I/O 不足", True, f"{output_count} 点割付済"))

    spare_in = estimation.plc.max_inputs - input_count
    spare_out = estimation.plc.max_outputs - output_count
    unused = spare_in + spare_out
    checks.append(
        SpecCheck(
            "未使用点",
            True,
            f"入力余裕 {spare_in} 点 / 出力余裕 {spare_out} 点（合計 {unused} 点）",
            severity="info" if unused > 0 else "warning",
        )
    )

    return checks


def _io_table_rows(entries: list[IOEntry]) -> str:
    if not entries:
        return "| — | — | — | — |"
    return "\n".join(
        f"| {e.device} | {e.name} | {e.io_type} | {e.category} |"
        for e in entries
    )


def _checks_table(checks: list[SpecCheck]) -> str:
    return "\n".join(
        f"| {c.name} | {'PASS' if c.passed else 'FAIL'} | {c.detail} |"
        for c in checks
    )


def generate_project_spec_md(
    quantities: DeviceQuantities,
    assignment: IOAssignment,
    estimation: EstimationResult,
    *,
    template_name: str | None = None,
) -> str:
    """自然文ベースの PROJECT_SPEC.md を生成する。"""
    c = assignment.customer
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    internal_spec = "\n".join(assignment.raw_lines)
    template_line = f"| 推定テンプレート | {template_name} |" if template_name else ""

    notes = [
        "非常停止は常時監視。OFF 時は全出力を即時停止する。",
        "点滅クロックは SM412 / SM413 を使用（M8012 / M8013 禁止）。",
        f"推奨電源: MeanWell {estimation.power_supply.model} ({estimation.power_supply.description})",
    ]
    if estimation.spare_inputs + estimation.spare_outputs > 8:
        notes.append(f"未使用 I/O が {estimation.spare_inputs + estimation.spare_outputs} 点あり。将来拡張に活用可能。")

    notes_md = "\n".join(f"- {n}" for n in notes)

    count_rows = []
    for key, qty in sorted(quantities.counts.items()):
        if qty > 0:
            count_rows.append(f"| {key} | {qty} |")
    count_table = "\n".join(count_rows) if count_rows else "| — | 0 |"

    return f"""# PROJECT_SPEC — {BUILDER_NAME}

> 自然文から自動生成された PLC 仕様書

---

## 1. 案件情報

| 項目 | 内容 |
|------|------|
| 案件名 | {quantities.project_name} |
| 目的 | {quantities.purpose} |
| 会社名 | {c.company or "（未指定）"} |
| 現場名 | {c.site or quantities.project_name} |
| 担当者 | {c.contact or "自動生成"} |
| PLC型番 | {estimation.plc_model} |
| 推奨電源 | MeanWell {estimation.power_model} |
| 生成日時 | {now} |
| Builder | {BUILDER_NAME} |
{template_line}

---

## 2. 入力一覧

| デバイス | 名称 | 種別 | カテゴリ |
|---------|------|------|---------|
{_io_table_rows(assignment.inputs)}

---

## 3. 出力一覧

| デバイス | 名称 | 種別 | カテゴリ |
|---------|------|------|---------|
{_io_table_rows(assignment.outputs)}

---

## 4. I/O 表

| # | デバイス | 名称 | 種別 | カテゴリ |
|---|---------|------|------|---------|
""" + "\n".join(
        f"| {i + 1} | {e.device} | {e.name} | {e.io_type} | {e.category} |"
        for i, e in enumerate(assignment.entries)
    ) + f"""

---

## 5. PLC 選定

| 項目 | 内容 |
|------|------|
| 推定 PLC | {estimation.plc_model} |
| 入力使用 / 最大 | {estimation.input_count} / {estimation.plc.max_inputs} |
| 出力使用 / 最大 | {estimation.output_count} / {estimation.plc.max_outputs} |
| 入力余裕 | {estimation.spare_inputs} 点 |
| 出力余裕 | {estimation.spare_outputs} 点 |
| {estimation.plc.description} |

---

## 6. 電源選定

| 項目 | 内容 |
|------|------|
| 推奨電源 | MeanWell {estimation.power_model} |
| 定格 | {estimation.power_supply.wattage}W / {estimation.power_supply.max_current_a}A |
| 24V センサー数 | {estimation.sensor_24v_count} |
| 24V 出力数 | {estimation.output_24v_count} |
| {estimation.power_supply.description} |

---

## 7. 抽出機器数量

| 機器キー | 数量 |
|---------|:----:|
{count_table}

---

## 8. 動作仕様

| 条件 | 動作 |
|------|------|
| 警戒 / 夜間警戒 ON | 警戒モード保持（M0 SET） |
| 非常停止 OFF | 全 M / 全 Y 即時 RST（最優先） |
| 外周センサー（赤外線）ON + 警戒中 | 外周警報ラッチ → 白灯1 点灯、白灯2 低速点滅 |
| 近接センサー（PIR）ON + 警戒中 | 近接警報ラッチ → 白灯3/4 点灯、赤灯高速点滅 |
| 警戒中（M0） | 赤灯（パトライト赤）低速点滅（SM413） |

### 内部仕様テキスト（GX 生成用）

```
{internal_spec}
```

---

## 9. 注意事項

{notes_md}

---

**{BUILDER_NAME} — PROJECT_SPEC**
"""


def generate_spec_test_report_md(
    project_name: str,
    assignment: IOAssignment,
    estimation: EstimationResult,
    checks: list[SpecCheck],
) -> str:
    """SPEC_TEST_REPORT.md を生成する。"""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    errors = [c for c in checks if not c.passed and c.severity == "error"]
    all_pass = len(errors) == 0

    io_summary = format_io_allocation_summary(assignment)

    return f"""# SPEC_TEST_REPORT — {BUILDER_NAME}

> I/O 自動検査レポート

---

## 実行概要

| 項目 | 値 |
|------|-----|
| 実行日時 (UTC) | {now} |
| 案件名 | {project_name} |
| PLC | {estimation.plc_model} |
| 電源 | MeanWell {estimation.power_model} |

---

## I/O 割付サマリー

```
{io_summary}
```

---

## 検査項目

| 項目 | 結果 | 詳細 |
|------|:----:|------|
{_checks_table(checks)}

---

## 判定基準

| 検査 | 内容 |
|------|------|
| I/O 重複 | 同一デバイス番号の二重割付を禁止 |
| 入力/出力点数 | PLC 最大点数以内であること |
| PLC 容量超過 | 使用点数が PLC 容量を超えないこと |
| I/O 不足 | 最低 1 点以上の入出力が割付されていること |
| 未使用点 | 余裕点数の情報（警告のみ） |

---

**総合判定: {'PASS' if all_pass else 'FAIL'}**

**{BUILDER_NAME} — SPEC_TEST_REPORT**
"""


def build_spec_from_text(
    text: str,
    customer: CustomerInfo | None = None,
    *,
    template_name: str | None = None,
    include_system_inputs: bool = True,
    device_only: bool = False,
) -> SpecBuildResult:
    """自然文から仕様書一式を構築する。"""
    quantities = parse_devices_from_text(text)
    if customer:
        quantities.project_name = _sanitize_project_name(
            customer.company or quantities.project_name,
            customer.site or quantities.project_name,
        )

    assignment = allocate_io_from_quantities(
        quantities,
        customer,
        include_system_inputs=include_system_inputs,
        device_only=device_only,
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
    assignment.customer.plc_model = estimation.plc_model

    checks = run_spec_validation(assignment, estimation)
    errors = [c for c in checks if not c.passed and c.severity == "error"]
    all_pass = len(errors) == 0

    project_name = quantities.project_name
    spec_md = generate_project_spec_md(
        quantities, assignment, estimation, template_name=template_name
    )
    test_report_md = generate_spec_test_report_md(
        project_name, assignment, estimation, checks
    )

    return SpecBuildResult(
        quantities=quantities,
        assignment=assignment,
        estimation=estimation,
        project_name=project_name,
        spec_md=spec_md,
        test_report_md=test_report_md,
        checks=checks,
        all_pass=all_pass,
        template_name=template_name,
    )


def write_spec_outputs(
    result: SpecBuildResult,
    output_dir: Path,
) -> Path:
    """仕様書とテストレポートを output_dir/SPEC/ に書き出す。"""
    spec_dir = output_dir / "SPEC"
    spec_dir.mkdir(parents=True, exist_ok=True)
    (spec_dir / "PROJECT_SPEC.md").write_text(result.spec_md, encoding="utf-8")
    (spec_dir / "IO_ASSIGNMENT.csv").write_text(
        generate_io_csv(result.assignment), encoding="utf-8"
    )
    (spec_dir / "SPEC_TEST_REPORT.md").write_text(result.test_report_md, encoding="utf-8")
    return spec_dir


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=f"{BUILDER_NAME} — spec_generator")
    parser.add_argument("--text", type=str, required=True, help="自然文入力")
    parser.add_argument("--output-dir", type=Path, default=V5_DIR / "generated_projects", help="出力先")
    parser.add_argument("--device-only", action="store_true", help="明示機器のみ割付（システム入力なし）")
    args = parser.parse_args()

    result = build_spec_from_text(
        args.text,
        include_system_inputs=not args.device_only,
        device_only=args.device_only,
    )
    out = write_spec_outputs(result, args.output_dir / result.project_name)
    print(f"PROJECT_SPEC.md → {out / 'PROJECT_SPEC.md'}")
    print(f"IO_ASSIGNMENT.csv → {out / 'IO_ASSIGNMENT.csv'}")
    print(f"SPEC_TEST_REPORT.md → {out / 'SPEC_TEST_REPORT.md'}")
    print(f"PLC: {result.estimation.plc_model}  電源: {result.estimation.power_model}")
    print(f"{'PASS' if result.all_pass else 'FAIL'}")
