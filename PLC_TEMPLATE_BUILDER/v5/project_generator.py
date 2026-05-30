#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.10
見積 + 顧客入力 → 仕様書 / GX Works3 命令 / 配線図 / 納品フォルダ 自動生成
用途別テンプレート (--template) / 日本語文章 (--nl) / 完全自動 (--full-spec) /
見積メモ形式 (--estimate-mode) / 見積+部材表+施工メモ (--estimate-plus) /
TOMS見積連携準備 (--quote-ready) / TOMS見積Excel出力 (--quote-excel) /
現調シート生成 (--site-survey) / PLC容量選定・連携 (--full-spec 他) 対応
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

V5_DIR = Path(__file__).resolve().parent
V4_DIR = V5_DIR.parent / "v4"
ENGINE_DIR = V5_DIR.parent / "engine"
DEFAULT_CUSTOMER = V5_DIR / "customer_input.txt"
DEFAULT_ESTIMATE = V5_DIR / "estimate_input.txt"
DEFAULT_OUTPUT_DIR = V5_DIR / "generated_projects"
TEMPLATES_DIR = V5_DIR / "templates"
MULTI_TEMPLATE_REPORT = V5_DIR / "MULTI_TEMPLATE_TEST_REPORT.md"
NLP_DIR = V5_DIR / "nlp"
NLP_SAMPLE_REQUESTS = NLP_DIR / "sample_requests.txt"
NLP_TEST_REPORT = V5_DIR / "NLP_TEST_REPORT.md"
SPEC_GEN_DIR = V5_DIR / "spec_generator"
ESTIMATE_MODE_DIR = V5_DIR / "estimate_mode"
DEFAULT_ESTIMATE_SAMPLE = ESTIMATE_MODE_DIR / "estimate_sample.txt"
FULL_SPEC_SAMPLE = (
    "車屋の展示場を夜間監視したい。\n"
    "赤外線4本。\n"
    "人感センサー2台。\n"
    "パトライト1台。\n"
    "白色LED4台。"
)
VERSION = "v5.10"
BUILDER_NAME = f"TiSLY PLC Builder {VERSION}"

VALID_TEMPLATES = (
    "HOME_SECURITY",
    "CARSHOP_SECURITY",
    "WAREHOUSE_SECURITY",
    "MINPAKU_COUNTER",
    "FACTORY_SAFETY",
)

sys.path.insert(0, str(V5_DIR))
sys.path.insert(0, str(V4_DIR))
sys.path.insert(0, str(ENGINE_DIR))
sys.path.insert(0, str(NLP_DIR))
sys.path.insert(0, str(SPEC_GEN_DIR))
sys.path.insert(0, str(ESTIMATE_MODE_DIR))

from SPEC_GENERATOR import (  # noqa: E402
    IOAssignment,
    IOEntry,
    CustomerInfo,
    EstimateInput,
    allocate_io,
    generate_io_csv,
    generate_project_spec,
    generate_wiring_diagram,
    parse_customer_input,
    parse_estimate_input,
    _sanitize_project_name,
    _parse_key_value_file,
)
from plc_builder import CommandGenerator, ParsedSpec, SpecParser  # noqa: E402
from intent_parser import parse_sample_requests  # noqa: E402
from template_recommender import Recommendation, recommend_template  # noqa: E402
from spec_builder import SpecBuildResult, build_spec_from_text, write_spec_outputs  # noqa: E402
from estimate_parser import parse_estimate_file  # noqa: E402
from parts_mapper import (  # noqa: E402
    EstimateBuildResult,
    build_from_estimate_memo,
    format_io_table,
    format_plc_spec_summary,
)
from bom_generator import (  # noqa: E402
    bom_contains_plc,
    bom_contains_power,
    generate_bom_csv,
)
from cost_estimator import generate_rough_estimate  # noqa: E402
from install_note_generator import (  # noqa: E402
    generate_install_notes,
    generate_order_memo,
)
from quote_mapper import (  # noqa: E402
    generate_toms_quote_items_csv,
    generate_toms_quote_summary,
    parse_toms_quote_items_csv,
    toms_items_all_qty_filled,
    toms_items_have_plc,
    toms_items_have_power,
    toms_items_sequential_nos,
)
from excel_exporter import (  # noqa: E402
    is_valid_xlsx,
    write_toms_quote_xlsx,
    xlsx_contains_text,
    xlsx_has_plc_capacity_section,
    xlsx_row_count,
)
from site_survey_generator import (  # noqa: E402
    generate_site_survey_md,
    site_survey_device_count,
    site_survey_has_device_table,
    site_survey_has_io_table,
    site_survey_has_plc_capacity_section,
)
from plc_selection_generator import (  # noqa: E402
    analyze_plc_selection,
    format_readme_plc_section,
    generate_plc_selection_md,
    plc_selection_has_judgment,
    plc_selection_has_margin,
    plc_selection_has_recommended_plc,
    plc_selection_has_used_inputs,
    plc_selection_has_used_outputs,
    readme_has_plc_capacity,
    site_survey_has_plc_capacity,
    toms_summary_has_plc_judgment,
)


DELIVERY_SUBDIRS = ("PLC_PROGRAM", "SPEC", "DRAWING", "TEST")


@dataclass
class TemplateProfile:
    name: str
    description: str
    inputs: list[tuple[str, str]]
    outputs: list[tuple[str, str]]
    spec_lines: list[str]


TEMPLATE_PROFILES: dict[str, TemplateProfile] = {
    "HOME_SECURITY": TemplateProfile(
        name="HOME_SECURITY",
        description="警戒スイッチ、非常停止、外周センサー、近接センサー、赤灯、白灯4回路",
        inputs=[
            ("警戒スイッチ", "system"),
            ("非常停止", "safety"),
            ("外周センサー", "赤外線"),
            ("近接センサー", "PIR"),
        ],
        outputs=[
            ("赤灯", "パトライト"),
            ("白灯1", "zone"),
            ("白灯2", "zone"),
            ("白灯3", "zone"),
            ("白灯4", "zone"),
        ],
        spec_lines=[
            "警戒スイッチ X0",
            "非常停止 X1",
            "外周センサー X2",
            "近接センサー X3",
            "赤灯 Y0",
            "白灯 Y1 Y2 Y3 Y4",
            "警戒中は赤灯を低速点滅",
            "外周検知で白灯1点灯、白灯2低速点滅",
            "近接検知で白灯3白灯4点灯、赤灯高速点滅",
            "非常停止で全OFF",
        ],
    ),
    "CARSHOP_SECURITY": TemplateProfile(
        name="CARSHOP_SECURITY",
        description="夜間警戒、外周センサー、展示車エリアセンサー、赤灯、白灯、非常停止",
        inputs=[
            ("夜間警戒", "system"),
            ("非常停止", "safety"),
            ("外周センサー", "赤外線"),
            ("展示車エリアセンサー", "PIR"),
        ],
        outputs=[
            ("赤灯", "パトライト"),
            ("白灯1", "zone"),
            ("白灯2", "zone"),
            ("白灯3", "zone"),
            ("白灯4", "zone"),
        ],
        spec_lines=[
            "夜間警戒 X0",
            "非常停止 X1",
            "外周センサー X2",
            "展示車エリアセンサー X3",
            "赤灯 Y0",
            "白灯 Y1 Y2 Y3 Y4",
            "夜間警戒中は赤灯を低速点滅",
            "外周検知で白灯1点灯、白灯2低速点滅",
            "展示車エリア検知で白灯3白灯4点灯、赤灯高速点滅",
            "非常停止で全OFF",
        ],
    ),
    "WAREHOUSE_SECURITY": TemplateProfile(
        name="WAREHOUSE_SECURITY",
        description="シャッター監視、侵入センサー、照明連動、非常停止、警報ランプ",
        inputs=[
            ("シャッター監視", "system"),
            ("非常停止", "safety"),
            ("シャッター開閉センサー", "赤外線"),
            ("侵入センサー", "PIR"),
        ],
        outputs=[
            ("警報ランプ", "パトライト"),
            ("照明連動1", "zone"),
            ("照明連動2", "zone"),
            ("照明連動3", "zone"),
            ("照明連動4", "zone"),
        ],
        spec_lines=[
            "監視開始 X0",
            "非常停止 X1",
            "シャッター開閉センサー X2",
            "侵入センサー X3",
            "赤灯 Y0",
            "白灯 Y1 Y2 Y3 Y4",
            "監視中は赤灯を低速点滅",
            "シャッター異常で白灯1点灯、白灯2低速点滅",
            "侵入検知で白灯3白灯4点灯、赤灯高速点滅",
            "照明連動で警報時点灯",
            "非常停止で全OFF",
        ],
    ),
    "MINPAKU_COUNTER": TemplateProfile(
        name="MINPAKU_COUNTER",
        description="入口赤外線、出口赤外線、人数カウント、満室表示、清掃モード",
        inputs=[
            ("チェックイン完了", "system"),
            ("非常停止", "safety"),
            ("入口赤外線", "赤外線"),
            ("出口赤外線", "PIR"),
            ("清掃モード", "system"),
        ],
        outputs=[
            ("満室表示", "パトライト"),
            ("人数カウント1", "zone"),
            ("人数カウント2", "zone"),
            ("人数カウント3", "zone"),
            ("人数カウント4", "zone"),
        ],
        spec_lines=[
            "チェックイン完了 X0",
            "非常停止 X1",
            "入口赤外線 X2",
            "出口赤外線 X3",
            "清掃モード X4",
            "赤灯 Y0",
            "白灯 Y1 Y2 Y3 Y4",
            "監視中は赤灯を低速点滅",
            "入口検知で白灯1点灯",
            "出口赤外線検知で白灯3白灯4点灯、赤灯高速点滅",
            "人数カウントで満室表示点灯",
            "清掃モード中は監視継続",
            "非常停止で全OFF",
        ],
    ),
    "FACTORY_SAFETY": TemplateProfile(
        name="FACTORY_SAFETY",
        description="非常停止、安全カーテン、パトライト、ブザー、設備異常入力",
        inputs=[
            ("ライン起動", "system"),
            ("非常停止", "safety"),
            ("安全カーテン", "赤外線"),
            ("設備異常入力", "PIR"),
        ],
        outputs=[
            ("パトライト", "パトライト"),
            ("ブザー", "alarm"),
            ("搬送停止", "zone"),
            ("安全警告灯", "zone"),
            ("設備異常表示", "zone"),
        ],
        spec_lines=[
            "ライン起動 X0",
            "非常停止 X1",
            "安全カーテン X2",
            "設備異常入力 X3",
            "赤灯 Y0",
            "白灯 Y1 Y2 Y3 Y4",
            "稼働中は赤灯を低速点滅",
            "安全カーテン検知で白灯1点灯、白灯2低速点滅",
            "設備異常検知で白灯3白灯4点灯、赤灯高速点滅",
            "非常停止で全OFF",
        ],
    ),
}


@dataclass
class AuditRow:
    name: str
    passed: bool
    detail: str


@dataclass
class TemplateBuildResult:
    template_name: str
    project_dir: Path
    rows: list[AuditRow] = field(default_factory=list)
    all_pass: bool = False


@dataclass
class NlpBuildResult:
    expected_template: str
    request_text: str
    recommendation: Recommendation
    build_result: TemplateBuildResult | None = None
    estimate_pass: bool = False
    generate_pass: bool = False

    @property
    def all_pass(self) -> bool:
        return self.estimate_pass and self.generate_pass


def parse_template_file(path: Path) -> tuple[str, CustomerInfo]:
    """テンプレートファイルから template 名と顧客デフォルトを読み込む。"""
    data = _parse_key_value_file(path)
    template_name = data.get("template", path.stem).upper()
    if template_name not in VALID_TEMPLATES:
        raise ValueError(f"未知のテンプレート: {template_name}")
    customer = CustomerInfo(
        company=data.get("会社名", "TiSLY株式会社"),
        site=data.get("現場名", f"{template_name} デモ案件"),
        contact=data.get("担当者", "自動生成"),
        plc_model=data.get("PLC型番", "FX5UJ-24MR/ES"),
    )
    return template_name, customer


def build_assignment_from_template(
    template_name: str,
    customer: CustomerInfo,
) -> IOAssignment:
    """用途別テンプレートから I/O 割付を構築する。"""
    profile = TEMPLATE_PROFILES[template_name]
    assignment = IOAssignment(customer=customer, estimate=EstimateInput())
    x_index = 0
    y_index = 0

    for name, category in profile.inputs:
        device = f"X{x_index}"
        assignment.entries.append(IOEntry(device, name, "Input", category))
        x_index += 1

    for name, category in profile.outputs:
        device = f"Y{y_index}"
        assignment.entries.append(IOEntry(device, name, "Output", category))
        y_index += 1

    assignment.raw_lines = profile.spec_lines.copy()
    return assignment


def _io_assignment_to_spec(assignment: IOAssignment) -> ParsedSpec:
    """I/O 割付を v3 CommandGenerator 向け ParsedSpec に変換する。"""
    spec_text = "\n".join(assignment.raw_lines)
    parser = SpecParser()
    spec = parser.parse(spec_text)
    d = spec.devices

    arm = next(
        (
            e
            for e in assignment.inputs
            if any(k in e.name for k in ("警戒", "夜間", "監視", "チェックイン", "ライン起動", "シャッター監視"))
        ),
        None,
    )
    estop = next((e for e in assignment.inputs if "非常" in e.name), None)
    sensor1 = next(
        (
            e
            for e in assignment.inputs
            if any(k in e.name for k in ("外周", "シャッター", "入口", "安全カーテン"))
        ),
        None,
    )
    sensor2 = next(
        (
            e
            for e in assignment.inputs
            if any(k in e.name for k in ("近接", "展示車", "侵入", "出口", "設備異常"))
        ),
        None,
    )
    red = next(
        (
            e
            for e in assignment.outputs
            if e.name in ("赤灯", "パトライト", "警報ランプ", "満室表示")
        ),
        None,
    )
    whites = [
        e.device
        for e in assignment.outputs
        if e.name.startswith("白灯")
        or e.name.startswith("照明連動")
        or e.name.startswith("人数カウント")
        or e.name in ("搬送停止", "安全警告灯", "設備異常表示", "ブザー")
    ]

    if arm:
        d.x_arm = arm.device
    if estop:
        d.x_estop = estop.device
    if sensor1:
        d.x_sensor_1 = sensor1.device
    if sensor2:
        d.x_sensor_2 = sensor2.device
    if red:
        d.y_red = red.device
    if whites:
        while len(whites) < 4:
            whites.append(f"Y{len(whites)}")
        d.y_white = whites[:4]

    spec.devices = d
    return spec


def _collect_audit_metrics(gx_lines: list[str]) -> dict:
    text = "\n".join(gx_lines)
    out_y: dict[str, int] = {}
    for line in gx_lines:
        match = re.match(r"OUT\s+(Y\d+)\b", line.strip())
        if match:
            y = match.group(1).upper()
            out_y[y] = out_y.get(y, 0) + 1
    return {
        "m8012": len(re.findall(r"\bM8012\b", text)),
        "m8013": len(re.findall(r"\bM8013\b", text)),
        "sm412": len(re.findall(r"\bSM412\b", text)),
        "sm413": len(re.findall(r"\bSM413\b", text)),
        "out_y0": out_y.get("Y0", 0),
        "dup_out": {y: c for y, c in out_y.items() if c > 1},
        "has_end": gx_lines[-1].strip() == "END" if gx_lines else False,
    }


def audit_io_duplicates(assignment: IOAssignment) -> AuditRow:
    devices = [e.device for e in assignment.entries]
    duplicates = {d for d in devices if devices.count(d) > 1}
    return AuditRow(
        "I/O 重複なし",
        len(duplicates) == 0,
        "重複なし" if not duplicates else ", ".join(sorted(duplicates)),
    )


def write_test_report(
    path: Path,
    assignment: IOAssignment,
    gx_lines: list[str],
    spec: ParsedSpec,
    plc_integration_rows: list[AuditRow] | None = None,
) -> tuple[list[AuditRow], bool]:
    metrics = _collect_audit_metrics(gx_lines)
    rows: list[AuditRow] = [
        AuditRow("M8012 チェック", metrics["m8012"] == 0, f"{metrics['m8012']} 件"),
        AuditRow("M8013 チェック", metrics["m8013"] == 0, f"{metrics['m8013']} 件"),
        AuditRow("SM412 チェック", metrics["sm412"] >= 1, f"{metrics['sm412']} 件"),
        AuditRow("SM413 チェック", metrics["sm413"] >= 1, f"{metrics['sm413']} 件"),
        AuditRow(
            "OUT 重複チェック",
            len(metrics["dup_out"]) == 0,
            "重複なし"
            if not metrics["dup_out"]
            else ", ".join(f"{y}×{c}" for y, c in sorted(metrics["dup_out"].items())),
        ),
        AuditRow("OUT Y0 チェック", metrics["out_y0"] == 1, f"{metrics['out_y0']} 回"),
        AuditRow("END チェック", metrics["has_end"], "末尾 END" if metrics["has_end"] else "END なし"),
        audit_io_duplicates(assignment),
    ]

    integration_rows = plc_integration_rows or []
    all_pass = all(r.passed for r in rows) and all(r.passed for r in integration_rows)
    io_table = "\n".join(
        f"| {e.device} | {e.name} | {e.io_type} |" for e in assignment.entries
    )
    audit_table = "\n".join(
        f"| {r.name} | {'PASS' if r.passed else 'FAIL'} | {r.detail} |" for r in rows
    )

    plc_section = ""
    if integration_rows:
        plc_table = "\n".join(
            f"| {r.name} | {'PASS' if r.passed else 'FAIL'} | {r.detail} |"
            for r in integration_rows
        )
        plc_all_pass = all(r.passed for r in integration_rows)
        plc_section = f"""
---

## PLC_SELECTION連携チェック

| 項目 | 結果 | 詳細 |
|------|:----:|------|
{plc_table}

**PLC連携判定: {'PASS' if plc_all_pass else 'FAIL'}**
"""

    content = f"""# TEST_REPORT — {BUILDER_NAME}

> 自動監査レポート

---

## I/O 割付確認

| Device | Name | Type |
|--------|------|------|
{io_table}

---

## 監査項目

| 項目 | 結果 | 詳細 |
|------|:----:|------|
{audit_table}
{plc_section}
---

## GX Works3 命令サマリー

- 命令行数: {len(gx_lines)}
- 部品: {", ".join(spec.parts) if spec.parts else "001, 002, 005, 003, 004, 006, 007"}

---

**総合判定: {'PASS' if all_pass else 'FAIL'}**

**{BUILDER_NAME} — TEST_REPORT**
"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return rows, all_pass


def generate_project_readme(
    assignment: IOAssignment,
    project_name: str,
    template_name: str | None = None,
    *,
    include_plc_capacity: bool = True,
) -> str:
    c = assignment.customer
    io_rows = "\n".join(
        f"| {e.device} | {e.name} | {e.io_type} |" for e in assignment.entries
    )
    template_section = ""
    if template_name:
        profile = TEMPLATE_PROFILES[template_name]
        template_section = f"""
## テンプレート

| 項目 | 内容 |
|------|------|
| テンプレートID | {template_name} |
| 用途 | {profile.description} |

---
"""

    plc_section = ""
    if include_plc_capacity:
        plc_selection = analyze_plc_selection(
            c.plc_model,
            len(assignment.inputs),
            len(assignment.outputs),
        )
        plc_section = format_readme_plc_section(plc_selection)

    return f"""# {project_name} — 納品 README

> {BUILDER_NAME} 自動生成
{template_section}
## 案件情報

| 項目 | 内容 |
|------|------|
| 会社名 | {c.company} |
| 現場名 | {c.site} |
| 担当者 | {c.contact} |
| PLC型番 | {c.plc_model} |

---

## フォルダ構成

```
{project_name}/
├── PLC_PROGRAM/     … GX Works3 命令（GX3_COMMANDS.txt）
├── SPEC/            … 仕様書・I/O表・PLC選定
├── DRAWING/         … 配線図
├── TEST/            … 監査レポート
├── PROJECT_README.md … 本ファイル
└── PROJECT_META.json … 案件メタデータ
```

---

## I/O 一覧

| デバイス | 名称 | 種別 |
|---------|------|------|
{io_rows}

---

{plc_section}## GX Works3 投入手順

1. GX Works3 で新規プロジェクト（{c.plc_model}）を作成
2. ラダーエディタを **命令入力モード** に切替
3. `PLC_PROGRAM/GX3_COMMANDS.txt` を開き全文コピー
4. ラダー先頭セルに貼り付け → コンパイル（F4）
5. `SPEC/PROJECT_SPEC.md` と I/O 割付を突合

---

## 注意事項

- 通電前に `TEST/TEST_REPORT.md` が **PASS** であることを確認
- 配線は `DRAWING/WIRING_DIAGRAM.md` を参照
- 非常停止は最優先。実機投入前にテストスタンドで動作確認すること

---

**{BUILDER_NAME}**
"""


def write_project_meta(
    path: Path,
    project_name: str,
    customer_file: str,
    estimate_file: str,
    test_status: str,
    template_name: str | None = None,
) -> None:
    meta = {
        "project_name": project_name,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "plc_model": parse_customer_input(Path(customer_file)).plc_model
        if Path(customer_file).is_file()
        else "FX5UJ-24MR/ES",
        "gx_version": "GX Works3",
        "customer_file": customer_file,
        "estimate_file": estimate_file,
        "builder_version": BUILDER_NAME,
        "test_status": test_status,
        "folders": list(DELIVERY_SUBDIRS),
    }
    if template_name:
        meta["template"] = template_name
        meta["template_description"] = TEMPLATE_PROFILES[template_name].description
    path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _verify_delivery_files(project_dir: Path, template_mode: bool = False) -> list[AuditRow]:
    checks = [
        ("PLC_PROGRAM/GX3_COMMANDS.txt", project_dir / "PLC_PROGRAM" / "GX3_COMMANDS.txt"),
        ("SPEC/IO_ASSIGNMENT.csv", project_dir / "SPEC" / "IO_ASSIGNMENT.csv"),
        ("DRAWING/WIRING_DIAGRAM.md", project_dir / "DRAWING" / "WIRING_DIAGRAM.md"),
        ("TEST/TEST_REPORT.md", project_dir / "TEST" / "TEST_REPORT.md"),
        ("PROJECT_META.json", project_dir / "PROJECT_META.json"),
    ]
    if template_mode:
        checks.insert(2, ("PROJECT_README.md", project_dir / "PROJECT_README.md"))
    else:
        checks.extend([
            ("SPEC/PROJECT_SPEC.md", project_dir / "SPEC" / "PROJECT_SPEC.md"),
            ("README.md", project_dir / "README.md"),
        ])
    rows: list[AuditRow] = []
    for label, path in checks:
        rows.append(
            AuditRow(
                f"{label} 存在",
                path.is_file(),
                "OK" if path.is_file() else "ファイルなし",
            )
        )
    return rows


def _write_delivery_project(
    assignment: IOAssignment,
    project_name: str,
    project_dir: Path,
    customer_file: str,
    estimate_file: str,
    template_name: str | None = None,
) -> tuple[list[AuditRow], bool, int]:
    """納品フォルダを生成し監査結果を返す。戻り値: (rows, all_pass, exit_code)"""
    for sub in DELIVERY_SUBDIRS:
        (project_dir / sub).mkdir(parents=True, exist_ok=True)

    parsed = _io_assignment_to_spec(assignment)
    generator = CommandGenerator()
    gx_lines = generator.generate(parsed)

    (project_dir / "PLC_PROGRAM" / "GX3_COMMANDS.txt").write_text(
        "\n".join(gx_lines) + "\n", encoding="utf-8"
    )
    (project_dir / "SPEC" / "PROJECT_SPEC.md").write_text(
        generate_project_spec(assignment), encoding="utf-8"
    )
    (project_dir / "SPEC" / "IO_ASSIGNMENT.csv").write_text(
        generate_io_csv(assignment), encoding="utf-8"
    )
    (project_dir / "DRAWING" / "WIRING_DIAGRAM.md").write_text(
        generate_wiring_diagram(assignment), encoding="utf-8"
    )

    readme_content = generate_project_readme(assignment, project_name, template_name)
    if template_name:
        (project_dir / "PROJECT_README.md").write_text(readme_content, encoding="utf-8")
    else:
        (project_dir / "README.md").write_text(readme_content, encoding="utf-8")
        (project_dir / "PROJECT_README.md").write_text(readme_content, encoding="utf-8")

    audit_rows, _logic_pass = write_test_report(
        project_dir / "TEST" / "TEST_REPORT.md",
        assignment,
        gx_lines,
        parsed,
    )

    write_project_meta(
        project_dir / "PROJECT_META.json",
        project_name,
        customer_file,
        estimate_file,
        "PASS" if _logic_pass else "FAIL",
        template_name,
    )

    file_rows = _verify_delivery_files(project_dir, template_mode=bool(template_name))
    all_rows = audit_rows + file_rows
    all_pass = all(r.passed for r in all_rows)

    write_project_meta(
        project_dir / "PROJECT_META.json",
        project_name,
        customer_file,
        estimate_file,
        "PASS" if all_pass else "FAIL",
        template_name,
    )

    auto_report = _write_auto_test_report(project_dir, all_rows, all_pass)
    (project_dir / "TEST" / "AUTO_TEST_REPORT.md").write_text(auto_report, encoding="utf-8")

    return all_rows, all_pass, 0 if all_pass else 1


def build_project(
    customer_path: Path,
    estimate_path: Path,
    output_dir: Path,
    project_name: str | None = None,
) -> int:
    if not customer_path.is_file():
        print(f"ERROR: 顧客情報ファイルが見つかりません: {customer_path}", file=sys.stderr)
        return 1
    if not estimate_path.is_file():
        print(f"ERROR: 見積入力ファイルが見つかりません: {estimate_path}", file=sys.stderr)
        return 1

    customer = parse_customer_input(customer_path)
    estimate = parse_estimate_input(estimate_path)
    assignment = allocate_io(customer, estimate)

    if not project_name:
        project_name = _sanitize_project_name(customer.company, customer.site)

    project_dir = output_dir / project_name
    all_rows, all_pass, exit_code = _write_delivery_project(
        assignment,
        project_name,
        project_dir,
        str(customer_path),
        str(estimate_path),
    )
    _print_completion(customer, project_name, project_dir, all_rows, all_pass)
    return exit_code


def build_template_project(
    template_name: str,
    output_dir: Path,
) -> TemplateBuildResult:
    template_name = template_name.upper()
    if template_name not in VALID_TEMPLATES:
        raise ValueError(f"未知のテンプレート: {template_name}")

    template_file = TEMPLATES_DIR / f"{template_name}.txt"
    if template_file.is_file():
        _, customer = parse_template_file(template_file)
        source_file = str(template_file)
    else:
        customer = CustomerInfo(site=f"{template_name} デモ案件")
        source_file = "(内蔵定義)"

    assignment = build_assignment_from_template(template_name, customer)
    project_name = template_name
    project_dir = output_dir / project_name

    all_rows, all_pass, _ = _write_delivery_project(
        assignment,
        project_name,
        project_dir,
        source_file,
        source_file,
        template_name=template_name,
    )

    return TemplateBuildResult(
        template_name=template_name,
        project_dir=project_dir,
        rows=all_rows,
        all_pass=all_pass,
    )


def _write_auto_test_report(
    project_dir: Path,
    rows: list[AuditRow],
    all_pass: bool,
) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    table = "\n".join(
        f"| {r.name} | {'PASS' if r.passed else 'FAIL'} | {r.detail} |" for r in rows
    )
    checklist = "\n".join(
        f"- {'✓' if r.passed else '✗'} {r.name}: {r.detail}" for r in rows
    )
    return f"""# AUTO_TEST_REPORT — {BUILDER_NAME}

> 全生成物存在確認 + 監査 PASS 確認

---

## 実行概要

| 項目 | 値 |
|------|-----|
| 実行日時 (UTC) | {now} |
| 対象 | {project_dir.name} |
| テスト | 全生成物存在確認 / GX 監査 |

---

## チェックリスト

{checklist}

---

## テスト結果

| 項目 | 結果 | 詳細 |
|------|:----:|------|
{table}

---

**総合判定: {'PASS' if all_pass else 'FAIL'}**

**{BUILDER_NAME} — AUTO_TEST_REPORT**
"""


def _print_completion(
    customer,
    project_name: str,
    project_dir: Path,
    rows: list[AuditRow],
    all_pass: bool,
) -> None:
    print(BUILDER_NAME)
    print()
    print("顧客入力")
    print(f"  会社名: {customer.company}")
    print(f"  現場名: {customer.site}")
    print(f"  担当者: {customer.contact}")
    print(f"  PLC型番: {customer.plc_model}")
    print("↓")
    print("仕様書生成")
    print(f"  → {project_dir / 'SPEC' / 'PROJECT_SPEC.md'}")
    print("↓")
    print("GX Works3命令生成")
    print(f"  → {project_dir / 'PLC_PROGRAM' / 'GX3_COMMANDS.txt'}")
    print("↓")
    print("配線図生成")
    print(f"  → {project_dir / 'DRAWING' / 'WIRING_DIAGRAM.md'}")
    print("↓")
    print("案件フォルダ生成")
    print(f"  → {project_dir}/")
    for sub in DELIVERY_SUBDIRS:
        print(f"      ├ {sub}/")
    print("      └ README.md")
    print()
    for row in rows:
        mark = "PASS" if row.passed else "FAIL"
        print(f"  [{mark}] {row.name}: {row.detail}")
    print()
    print(f"{'PASS' if all_pass else 'FAIL'}")
    print()
    print(f"{BUILDER_NAME} - 完成")


def _print_template_completion(result: TemplateBuildResult) -> None:
    profile = TEMPLATE_PROFILES[result.template_name]
    print(BUILDER_NAME)
    print()
    print(f"テンプレート: {result.template_name}")
    print(f"  用途: {profile.description}")
    print("↓")
    print("仕様書生成")
    print(f"  → {result.project_dir / 'SPEC' / 'PROJECT_SPEC.md'}")
    print("↓")
    print("GX Works3命令生成")
    print(f"  → {result.project_dir / 'PLC_PROGRAM' / 'GX3_COMMANDS.txt'}")
    print("↓")
    print("配線図生成")
    print(f"  → {result.project_dir / 'DRAWING' / 'WIRING_DIAGRAM.md'}")
    print("↓")
    print("案件フォルダ生成")
    print(f"  → {result.project_dir}/")
    for sub in DELIVERY_SUBDIRS:
        print(f"      ├ {sub}/")
    print("      └ PROJECT_README.md")
    print()
    for row in result.rows:
        mark = "PASS" if row.passed else "FAIL"
        print(f"  [{mark}] {row.name}: {row.detail}")
    print()
    print(f"{'PASS' if result.all_pass else 'FAIL'}")
    print()
    print(f"{BUILDER_NAME} - 完成")


def write_multi_template_test_report(results: list[TemplateBuildResult]) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    all_pass = all(r.all_pass for r in results)

    summary_rows = []
    detail_sections = []

    key_checks = [
        "M8012 チェック",
        "M8013 チェック",
        "SM412 チェック",
        "SM413 チェック",
        "END チェック",
        "PLC_PROGRAM/GX3_COMMANDS.txt 存在",
        "SPEC/IO_ASSIGNMENT.csv 存在",
        "DRAWING/WIRING_DIAGRAM.md 存在",
        "PROJECT_README.md 存在",
        "TEST/TEST_REPORT.md 存在",
        "PROJECT_META.json 存在",
    ]

    for result in results:
        status = "PASS" if result.all_pass else "FAIL"
        folder_ok = result.project_dir.is_dir()
        summary_rows.append(
            f"| {result.template_name} | `{result.project_dir.name}/` | "
            f"{'OK' if folder_ok else 'NG'} | {status} |"
        )

        check_table = []
        for check_name in key_checks:
            row = next((r for r in result.rows if r.name == check_name), None)
            if row:
                check_table.append(
                    f"| {row.name} | {'PASS' if row.passed else 'FAIL'} | {row.detail} |"
                )
        detail_sections.append(
            f"""### {result.template_name}

| 項目 | 結果 | 詳細 |
|------|:----:|------|
{chr(10).join(check_table)}

**総合判定: {status}**
"""
        )

    content = f"""# MULTI_TEMPLATE_TEST_REPORT — {BUILDER_NAME}

> 全用途別テンプレート一括生成テスト

---

## 実行概要

| 項目 | 値 |
|------|-----|
| 実行日時 (UTC) | {now} |
| テンプレート数 | {len(results)} |
| 出力先 | `generated_projects/<テンプレ名>/` |

---

## サマリー

| テンプレート | 出力フォルダ | フォルダ生成 | 総合判定 |
|-------------|-------------|:------------:|:--------:|
{chr(10).join(summary_rows)}

**総合判定: {'PASS' if all_pass else 'FAIL'}**

---

## 確認項目（全テンプレ共通）

| 項目 | 内容 |
|------|------|
| 案件フォルダ生成 | `generated_projects/<テンプレ名>/` |
| GX3_COMMANDS.txt | PLC_PROGRAM/ 配下 |
| IO_ASSIGNMENT.csv | SPEC/ 配下 |
| WIRING_DIAGRAM.md | DRAWING/ 配下 |
| PROJECT_README.md | 案件ルート |
| TEST_REPORT.md | TEST/ 配下 |
| PROJECT_META.json | 案件ルート |
| M8012 / M8013 | 0 件（使用禁止） |
| SM412 / SM413 | 各 1 件以上 |
| END | 末尾存在 |

---

## テンプレート別結果

{chr(10).join(detail_sections)}

---

**{BUILDER_NAME} — MULTI_TEMPLATE_TEST_REPORT**
"""
    MULTI_TEMPLATE_REPORT.write_text(content, encoding="utf-8")


def _print_nlp_recommendation(recommendation: Recommendation) -> None:
    print("推定：")
    print(recommendation.template)
    print()
    print("一致率：")
    print(f"{recommendation.confidence}%")
    print()
    print("理由：")
    if recommendation.reasons:
        for reason in recommendation.reasons:
            print(reason)
    else:
        print("（キーワード一致なし）")
    print()


def build_from_natural_language(
    text: str,
    output_dir: Path,
    *,
    expected: str | None = None,
) -> NlpBuildResult:
    recommendation = recommend_template(text, expected=expected)
    estimate_pass = recommendation.template == expected.upper() if expected else True

    result = build_template_project(recommendation.template, output_dir)
    return NlpBuildResult(
        expected_template=expected or recommendation.template,
        request_text=text,
        recommendation=recommendation,
        build_result=result,
        estimate_pass=estimate_pass,
        generate_pass=result.all_pass,
    )


def write_nlp_test_report(results: list[NlpBuildResult]) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    all_pass = all(r.all_pass for r in results)

    summary_rows = []
    detail_sections = []

    for result in results:
        rec = result.recommendation
        status = "PASS" if result.all_pass else "FAIL"
        estimate_status = "PASS" if result.estimate_pass else "FAIL"
        generate_status = "PASS" if result.generate_pass else "FAIL"
        reasons = " / ".join(rec.reasons) if rec.reasons else "—"
        project_dir = result.build_result.project_dir if result.build_result else "—"

        summary_rows.append(
            f"| {result.expected_template} | {rec.template} | {rec.confidence}% | "
            f"{estimate_status} | {generate_status} | {status} |"
        )

        request_preview = result.request_text.replace("\n", " ").strip()
        if len(request_preview) > 80:
            request_preview = request_preview[:77] + "..."

        detail_sections.append(
            f"""### {result.expected_template}

**入力文章**

> {request_preview}

| 項目 | 値 |
|------|-----|
| 期待テンプレ | {result.expected_template} |
| 推定テンプレ | {rec.template} |
| 一致率 | {rec.confidence}% |
| 推定理由 | {reasons} |
| 出力先 | `{project_dir}` |
| 推定判定 | {estimate_status} |
| 生成判定 | {generate_status} |
| 総合判定 | **{status}** |
"""
        )

    content = f"""# NLP_TEST_REPORT — {BUILDER_NAME}

> 日本語文章 → テンプレ推定 → 案件生成 一括テスト

---

## 実行概要

| 項目 | 値 |
|------|-----|
| 実行日時 (UTC) | {now} |
| サンプル数 | {len(results)} |
| 入力 | `nlp/sample_requests.txt` |

---

## サマリー

| 期待テンプレ | 推定テンプレ | 一致率 | 推定 | 生成 | 総合 |
|-------------|-------------|:------:|:----:|:----:|:----:|
{chr(10).join(summary_rows)}

**総合判定: {'PASS' if all_pass else 'FAIL'}**

---

## テンプレート別結果

{chr(10).join(detail_sections)}

---

**{BUILDER_NAME} — NLP_TEST_REPORT**
"""
    NLP_TEST_REPORT.write_text(content, encoding="utf-8")


def _print_nlp_completion(results: list[NlpBuildResult]) -> None:
    all_pass = all(r.all_pass for r in results)
    print(BUILDER_NAME)
    print()
    print("日本語文章")
    print("↓")
    print("テンプレ推定")
    print("↓")
    print("案件生成")
    print()
    for result in results:
        rec = result.recommendation
        print(f"[{result.expected_template}]")
        print(f"  推定: {rec.template} ({rec.confidence}%)")
        if result.build_result:
            mark = "PASS" if result.generate_pass else "FAIL"
            print(f"  生成: {result.build_result.project_dir} [{mark}]")
        print()
    print(f"{'PASS' if all_pass else 'FAIL'}")
    print()
    print(f"レポート: {NLP_TEST_REPORT}")
    print()
    print(f"{BUILDER_NAME} - 完成")


def run_nlp_pipeline(
    samples_path: Path,
    output_dir: Path,
) -> int:
    if not samples_path.is_file():
        print(f"ERROR: サンプル要求ファイルが見つかりません: {samples_path}", file=sys.stderr)
        return 1

    samples = parse_sample_requests(samples_path)
    if not samples:
        print(f"ERROR: サンプル要求が空です: {samples_path}", file=sys.stderr)
        return 1

    results: list[NlpBuildResult] = []
    for expected_template, request_text in samples:
        print(f"[解析] {expected_template}")
        print()
        print("入力：")
        print(request_text)
        print()
        nlp_result = build_from_natural_language(
            request_text,
            output_dir,
            expected=expected_template,
        )
        _print_nlp_recommendation(nlp_result.recommendation)
        mark = "PASS" if nlp_result.all_pass else "FAIL"
        print(f"  [{mark}] 推定={'OK' if nlp_result.estimate_pass else 'NG'} "
              f"生成={'OK' if nlp_result.generate_pass else 'NG'}")
        print()
        results.append(nlp_result)

    write_nlp_test_report(results)
    _print_nlp_completion(results)
    return 0 if all(r.all_pass for r in results) else 1


def run_all_template_tests(output_dir: Path) -> int:
    results: list[TemplateBuildResult] = []
    for template_name in VALID_TEMPLATES:
        print(f"[生成] {template_name}")
        result = build_template_project(template_name, output_dir)
        results.append(result)
        mark = "PASS" if result.all_pass else "FAIL"
        print(f"  [{mark}] {result.project_dir}")

    write_multi_template_test_report(results)
    all_pass = all(r.all_pass for r in results)

    print()
    print(f"レポート: {MULTI_TEMPLATE_REPORT}")
    print()
    print(BUILDER_NAME)
    print("用途別テンプレ案件生成 完成")
    print(f"全テンプレ自動テスト {'PASS' if all_pass else 'FAIL'}")
    return 0 if all_pass else 1


@dataclass
class FullSpecBuildResult:
    request_text: str
    recommendation: Recommendation
    spec_result: SpecBuildResult
    project_dir: Path
    audit_rows: list[AuditRow] = field(default_factory=list)
    all_pass: bool = False


def build_full_spec_project(
    text: str,
    output_dir: Path,
    *,
    project_name: str | None = None,
) -> FullSpecBuildResult:
    """自然文 → テンプレ推定 → 仕様書 → I/O → 配線 → GX → 案件生成 → テスト。"""
    recommendation = recommend_template(text)
    template_name = recommendation.template

    template_file = TEMPLATES_DIR / f"{template_name}.txt"
    if template_file.is_file():
        _, customer = parse_template_file(template_file)
    else:
        customer = CustomerInfo(site=f"{template_name} 案件")

    spec_result = build_spec_from_text(
        text,
        customer,
        template_name=template_name,
        include_system_inputs=True,
    )

    if not project_name:
        project_name = spec_result.project_name or template_name

    project_dir = output_dir / project_name

    all_rows, all_pass, _ = _write_delivery_project(
        spec_result.assignment,
        project_name,
        project_dir,
        "(自然文入力)",
        "(自然文入力)",
        template_name=template_name,
    )

    write_spec_outputs(spec_result, project_dir)

    integration_rows = _finalize_plc_outputs(
        project_dir,
        spec_result.assignment,
        project_name,
        template_name=template_name,
    )
    plc_rows = audit_plc_selection_files(project_dir)
    all_rows = all_rows + plc_rows + integration_rows

    spec_checks_pass = spec_result.all_pass
    all_pass = all_pass and spec_checks_pass and all(r.passed for r in plc_rows + integration_rows)

    auto_report = _write_auto_test_report(project_dir, all_rows, all_pass)
    (project_dir / "TEST" / "AUTO_TEST_REPORT.md").write_text(auto_report, encoding="utf-8")

    return FullSpecBuildResult(
        request_text=text,
        recommendation=recommendation,
        spec_result=spec_result,
        project_dir=project_dir,
        audit_rows=all_rows,
        all_pass=all_pass,
    )


def _print_full_spec_completion(result: FullSpecBuildResult) -> None:
    rec = result.recommendation
    spec = result.spec_result
    print(BUILDER_NAME)
    print()
    print("自然文")
    preview = result.request_text.replace("\n", " / ")
    if len(preview) > 60:
        preview = preview[:57] + "..."
    print(f"  {preview}")
    print("↓")
    print("PLC仕様書")
    print(f"  → {result.project_dir / 'SPEC' / 'PROJECT_SPEC.md'}")
    print("↓")
    print("I/O設計")
    print(f"  → {result.project_dir / 'SPEC' / 'IO_ASSIGNMENT.csv'}")
    print(f"  PLC: {spec.estimation.plc_model}  電源: MeanWell {spec.estimation.power_model}")
    print("↓")
    print("PLC選定")
    print(f"  → {result.project_dir / 'SPEC' / 'PLC_SELECTION.md'}")
    print(f"  入力 {spec.estimation.input_count}/{spec.estimation.plc.max_inputs}  "
          f"出力 {spec.estimation.output_count}/{spec.estimation.plc.max_outputs}")
    print("↓")
    print("GX命令生成")
    print(f"  → {result.project_dir / 'PLC_PROGRAM' / 'GX3_COMMANDS.txt'}")
    print("↓")
    print("案件生成")
    print(f"  → {result.project_dir}/")
    print("↓")
    print("テスト")
    print(f"  → {result.project_dir / 'SPEC' / 'SPEC_TEST_REPORT.md'}")
    print(f"  → {result.project_dir / 'TEST' / 'TEST_REPORT.md'}")
    print()
    print(f"  推定テンプレ: {rec.template} ({rec.confidence}%)")
    for check in spec.checks:
        mark = "PASS" if check.passed else "FAIL"
        print(f"  [{mark}] {check.name}: {check.detail}")
    print()
    for row in result.audit_rows:
        mark = "PASS" if row.passed else "FAIL"
        print(f"  [{mark}] {row.name}: {row.detail}")
    print()
    print(f"{'PASS' if result.all_pass else 'FAIL'}")
    print()
    print(f"{BUILDER_NAME} - 完成")


def audit_capacity_checks(assignment: IOAssignment, estimation) -> list[AuditRow]:
    """入力/出力点数が PLC 容量内であることを検査する。"""
    input_count = len(assignment.inputs)
    output_count = len(assignment.outputs)
    return [
        AuditRow(
            "入力点数 PLC 容量内",
            input_count <= estimation.plc.max_inputs,
            f"使用 {input_count} / 最大 {estimation.plc.max_inputs}",
        ),
        AuditRow(
            "出力点数 PLC 容量内",
            output_count <= estimation.plc.max_outputs,
            f"使用 {output_count} / 最大 {estimation.plc.max_outputs}",
        ),
    ]


def _write_plc_selection_file(
    project_dir: Path,
    assignment: IOAssignment,
    current_plc_model: str,
) -> Path:
    """PLC_SELECTION.md を SPEC/ に書き出す。"""
    spec_dir = project_dir / "SPEC"
    spec_dir.mkdir(parents=True, exist_ok=True)
    path = spec_dir / "PLC_SELECTION.md"
    path.write_text(
        generate_plc_selection_md(
            current_plc_model,
            len(assignment.inputs),
            len(assignment.outputs),
        ),
        encoding="utf-8",
    )
    return path


def audit_plc_integration(project_dir: Path) -> list[AuditRow]:
    """PLC_SELECTION 連携先ファイルを監査する。"""
    spec_dir = project_dir / "SPEC"
    plc_path = spec_dir / "PLC_SELECTION.md"
    rows: list[AuditRow] = [
        AuditRow(
            "PLC_SELECTION.md が存在",
            plc_path.is_file(),
            "OK" if plc_path.is_file() else "ファイルなし",
        ),
    ]

    survey_path = spec_dir / "SITE_SURVEY.md"
    if survey_path.is_file():
        survey_text = survey_path.read_text(encoding="utf-8")
        rows.append(
            AuditRow(
                "SITE_SURVEY.md に PLC容量確認 が反映されている",
                site_survey_has_plc_capacity(survey_text),
                "反映済" if site_survey_has_plc_capacity(survey_text) else "未反映",
            )
        )

    summary_path = spec_dir / "TOMS_QUOTE_SUMMARY.md"
    if summary_path.is_file():
        summary_text = summary_path.read_text(encoding="utf-8")
        rows.append(
            AuditRow(
                "TOMS_QUOTE_SUMMARY.md に PLC容量判定 が反映されている",
                toms_summary_has_plc_judgment(summary_text),
                "反映済" if toms_summary_has_plc_judgment(summary_text) else "未反映",
            )
        )

    xlsx_path = spec_dir / "TOMS_QUOTE.xlsx"
    if xlsx_path.is_file():
        rows.append(
            AuditRow(
                "TOMS_QUOTE.xlsx に PLC容量判定欄 がある",
                xlsx_has_plc_capacity_section(xlsx_path),
                "あり" if xlsx_has_plc_capacity_section(xlsx_path) else "なし",
            )
        )

    readme_path = project_dir / "PROJECT_README.md"
    if not readme_path.is_file():
        readme_path = project_dir / "README.md"
    readme_text = readme_path.read_text(encoding="utf-8") if readme_path.is_file() else ""
    rows.append(
        AuditRow(
            "PROJECT_README.md に PLC容量・拡張判定 がある",
            readme_has_plc_capacity(readme_text),
            "反映済" if readme_has_plc_capacity(readme_text) else "未反映",
        )
    )
    return rows


def _finalize_plc_outputs(
    project_dir: Path,
    assignment: IOAssignment,
    project_name: str,
    template_name: str | None = None,
) -> list[AuditRow]:
    """PLC_SELECTION 出力・README 更新・TEST_REPORT 連携チェックを反映する。"""
    _write_plc_selection_file(
        project_dir,
        assignment,
        assignment.customer.plc_model,
    )
    readme_content = generate_project_readme(
        assignment,
        project_name,
        template_name,
        include_plc_capacity=True,
    )
    if template_name:
        (project_dir / "PROJECT_README.md").write_text(readme_content, encoding="utf-8")
    else:
        (project_dir / "README.md").write_text(readme_content, encoding="utf-8")
        (project_dir / "PROJECT_README.md").write_text(readme_content, encoding="utf-8")

    gx_path = project_dir / "PLC_PROGRAM" / "GX3_COMMANDS.txt"
    gx_lines = gx_path.read_text(encoding="utf-8").splitlines()
    parsed = _io_assignment_to_spec(assignment)
    integration_rows = audit_plc_integration(project_dir)
    write_test_report(
        project_dir / "TEST" / "TEST_REPORT.md",
        assignment,
        gx_lines,
        parsed,
        plc_integration_rows=integration_rows,
    )
    return integration_rows


def audit_plc_selection_files(project_dir: Path) -> list[AuditRow]:
    """PLC 容量選定ファイルを監査する。"""
    path = project_dir / "SPEC" / "PLC_SELECTION.md"
    text = path.read_text(encoding="utf-8") if path.is_file() else ""
    return [
        AuditRow(
            "PLC_SELECTION.md 存在",
            path.is_file(),
            "OK" if path.is_file() else "ファイルなし",
        ),
        AuditRow(
            "使用入力点数あり",
            plc_selection_has_used_inputs(text),
            "OK" if plc_selection_has_used_inputs(text) else "なし",
        ),
        AuditRow(
            "使用出力点数あり",
            plc_selection_has_used_outputs(text),
            "OK" if plc_selection_has_used_outputs(text) else "なし",
        ),
        AuditRow(
            "余裕率あり",
            plc_selection_has_margin(text),
            "OK" if plc_selection_has_margin(text) else "なし",
        ),
        AuditRow(
            "判定あり",
            plc_selection_has_judgment(text),
            "OK" if plc_selection_has_judgment(text) else "なし",
        ),
        AuditRow(
            "推奨PLCあり",
            plc_selection_has_recommended_plc(text),
            "OK" if plc_selection_has_recommended_plc(text) else "なし",
        ),
    ]


def spec_checks_to_audit_rows(checks) -> list[AuditRow]:
    """SpecCheck を AuditRow に変換する（容量・I/O重複チェック重複を避ける）。"""
    skip = {"入力点数チェック", "出力点数チェック", "PLC 容量超過", "I/O 重複なし"}
    rows: list[AuditRow] = []
    for c in checks:
        if c.name in skip:
            continue
        rows.append(AuditRow(c.name, c.passed, c.detail))
    return rows


@dataclass
class EstimateModeBuildResult:
    estimate_result: EstimateBuildResult
    project_dir: Path
    audit_rows: list[AuditRow] = field(default_factory=list)
    all_pass: bool = False


def build_estimate_mode_project(
    estimate_path: Path,
    output_dir: Path,
    *,
    project_name: str | None = None,
) -> EstimateModeBuildResult:
    """見積メモ → PLC仕様 → I/O → GX → 配線 → 案件フォルダ → テスト。"""
    memo = parse_estimate_file(estimate_path)
    estimate_result = build_from_estimate_memo(memo)

    if project_name:
        estimate_result.project_name = project_name

    project_dir = output_dir / estimate_result.project_name

    all_rows, logic_pass, _ = _write_delivery_project(
        estimate_result.assignment,
        estimate_result.project_name,
        project_dir,
        "(見積メモ)",
        str(estimate_path),
    )

    _finalize_plc_outputs(
        project_dir,
        estimate_result.assignment,
        estimate_result.project_name,
    )

    capacity_rows = audit_capacity_checks(
        estimate_result.assignment, estimate_result.estimation
    )
    spec_rows = spec_checks_to_audit_rows(estimate_result.spec_checks)
    plc_rows = audit_plc_selection_files(project_dir)
    integration_rows = audit_plc_integration(project_dir)
    all_rows = capacity_rows + all_rows + spec_rows + plc_rows + integration_rows
    all_pass = logic_pass and all(r.passed for r in all_rows)

    write_project_meta(
        project_dir / "PROJECT_META.json",
        estimate_result.project_name,
        "(見積メモ)",
        str(estimate_path),
        "PASS" if all_pass else "FAIL",
    )

    auto_report = _write_auto_test_report(project_dir, all_rows, all_pass)
    (project_dir / "TEST" / "AUTO_TEST_REPORT.md").write_text(auto_report, encoding="utf-8")

    return EstimateModeBuildResult(
        estimate_result=estimate_result,
        project_dir=project_dir,
        audit_rows=all_rows,
        all_pass=all_pass,
    )


def _print_estimate_mode_completion(result: EstimateModeBuildResult) -> None:
    er = result.estimate_result
    memo = er.memo
    print(BUILDER_NAME)
    print()
    print("見積メモ")
    print(f"  案件名: {memo.project_title}")
    print(f"  目的: {memo.purpose}")
    for key, qty in sorted(memo.parts.items()):
        print(f"  {key}: {qty}")
    print("↓")
    print("PLC仕様")
    for line in format_plc_spec_summary(er).splitlines():
        print(f"  {line}")
    print("↓")
    print("PLC容量選定")
    print(f"  → {result.project_dir / 'SPEC' / 'PLC_SELECTION.md'}")
    print("↓")
    print("I/O表")
    print(f"  → {result.project_dir / 'SPEC' / 'IO_ASSIGNMENT.csv'}")
    for line in format_io_table(er).splitlines()[:6]:
        print(f"    {line}")
    if len(er.assignment.entries) > 6:
        print(f"    ... ({len(er.assignment.entries)} 点)")
    print("↓")
    print("GX命令")
    print(f"  → {result.project_dir / 'PLC_PROGRAM' / 'GX3_COMMANDS.txt'}")
    print("↓")
    print("配線図")
    print(f"  → {result.project_dir / 'DRAWING' / 'WIRING_DIAGRAM.md'}")
    print("↓")
    print("案件フォルダ")
    print(f"  → {result.project_dir}/")
    for sub in DELIVERY_SUBDIRS:
        print(f"      ├ {sub}/")
    print("      └ README.md")
    print()
    for row in result.audit_rows:
        mark = "PASS" if row.passed else "FAIL"
        print(f"  [{mark}] {row.name}: {row.detail}")
    print()
    print(f"{'PASS' if result.all_pass else 'FAIL'}")
    print()
    print(f"{BUILDER_NAME} - 完成")


def run_estimate_mode_pipeline(
    estimate_path: Path,
    output_dir: Path,
    *,
    project_name: str | None = None,
) -> int:
    if not estimate_path.is_file():
        print(f"ERROR: 見積ファイルが見つかりません: {estimate_path}", file=sys.stderr)
        return 1
    result = build_estimate_mode_project(
        estimate_path, output_dir, project_name=project_name
    )
    _print_estimate_mode_completion(result)
    return 0 if result.all_pass else 1


def _write_estimate_plus_spec_files(
    project_dir: Path,
    estimate_result: EstimateBuildResult,
) -> dict[str, Path]:
    """部材表・概算見積・施工メモ・発注メモを SPEC/ に書き出す。"""
    spec_dir = project_dir / "SPEC"
    spec_dir.mkdir(parents=True, exist_ok=True)

    bom_text = generate_bom_csv(estimate_result)
    rough_text = generate_rough_estimate(estimate_result)
    install_text = generate_install_notes(estimate_result)
    order_text = generate_order_memo(estimate_result)

    paths = {
        "BOM.csv": spec_dir / "BOM.csv",
        "ROUGH_ESTIMATE.md": spec_dir / "ROUGH_ESTIMATE.md",
        "INSTALL_NOTES.md": spec_dir / "INSTALL_NOTES.md",
        "ORDER_MEMO.md": spec_dir / "ORDER_MEMO.md",
    }
    paths["BOM.csv"].write_text(bom_text, encoding="utf-8")
    paths["ROUGH_ESTIMATE.md"].write_text(rough_text, encoding="utf-8")
    paths["INSTALL_NOTES.md"].write_text(install_text, encoding="utf-8")
    paths["ORDER_MEMO.md"].write_text(order_text, encoding="utf-8")

    return paths


def audit_estimate_plus_files(
    project_dir: Path,
    estimate_result: EstimateBuildResult,
) -> list[AuditRow]:
    """見積+モード用の追加生成物を監査する。"""
    spec_dir = project_dir / "SPEC"
    bom_path = spec_dir / "BOM.csv"
    rough_path = spec_dir / "ROUGH_ESTIMATE.md"
    install_path = spec_dir / "INSTALL_NOTES.md"
    order_path = spec_dir / "ORDER_MEMO.md"

    plc_model = estimate_result.assignment.customer.plc_model
    power_model = estimate_result.estimation.power_model

    bom_text = bom_path.read_text(encoding="utf-8") if bom_path.is_file() else ""

    return [
        AuditRow(
            "BOM.csv 存在",
            bom_path.is_file(),
            "OK" if bom_path.is_file() else "ファイルなし",
        ),
        AuditRow(
            "ROUGH_ESTIMATE.md 存在",
            rough_path.is_file(),
            "OK" if rough_path.is_file() else "ファイルなし",
        ),
        AuditRow(
            "INSTALL_NOTES.md 存在",
            install_path.is_file(),
            "OK" if install_path.is_file() else "ファイルなし",
        ),
        AuditRow(
            "ORDER_MEMO.md 存在",
            order_path.is_file(),
            "OK" if order_path.is_file() else "ファイルなし",
        ),
        AuditRow(
            "PLC型番あり",
            bom_contains_plc(bom_text, plc_model),
            plc_model,
        ),
        AuditRow(
            "電源型番あり",
            bom_contains_power(bom_text, power_model),
            f"MeanWell {power_model}",
        ),
    ]


@dataclass
class EstimatePlusBuildResult:
    estimate_result: EstimateBuildResult
    project_dir: Path
    audit_rows: list[AuditRow] = field(default_factory=list)
    all_pass: bool = False


def build_estimate_plus_project(
    estimate_path: Path,
    output_dir: Path,
    *,
    project_name: str | None = None,
) -> EstimatePlusBuildResult:
    """見積メモ → PLC案件 → 部材表 / 概算見積 / 施工メモ / 発注メモ。"""
    memo = parse_estimate_file(estimate_path)
    estimate_result = build_from_estimate_memo(memo)

    if project_name:
        estimate_result.project_name = project_name

    project_dir = output_dir / estimate_result.project_name

    all_rows, logic_pass, _ = _write_delivery_project(
        estimate_result.assignment,
        estimate_result.project_name,
        project_dir,
        "(見積メモ)",
        str(estimate_path),
    )

    _write_estimate_plus_spec_files(project_dir, estimate_result)

    _finalize_plc_outputs(
        project_dir,
        estimate_result.assignment,
        estimate_result.project_name,
    )

    capacity_rows = audit_capacity_checks(
        estimate_result.assignment, estimate_result.estimation
    )
    spec_rows = spec_checks_to_audit_rows(estimate_result.spec_checks)
    plus_rows = audit_estimate_plus_files(project_dir, estimate_result)
    plc_rows = audit_plc_selection_files(project_dir)
    integration_rows = audit_plc_integration(project_dir)
    all_rows = capacity_rows + all_rows + spec_rows + plus_rows + plc_rows + integration_rows
    all_pass = logic_pass and all(r.passed for r in all_rows)

    write_project_meta(
        project_dir / "PROJECT_META.json",
        estimate_result.project_name,
        "(見積メモ)",
        str(estimate_path),
        "PASS" if all_pass else "FAIL",
    )

    auto_report = _write_auto_test_report(project_dir, all_rows, all_pass)
    (project_dir / "TEST" / "AUTO_TEST_REPORT.md").write_text(auto_report, encoding="utf-8")

    return EstimatePlusBuildResult(
        estimate_result=estimate_result,
        project_dir=project_dir,
        audit_rows=all_rows,
        all_pass=all_pass,
    )


def _print_estimate_plus_completion(result: EstimatePlusBuildResult) -> None:
    er = result.estimate_result
    memo = er.memo
    print(BUILDER_NAME)
    print()
    print("見積メモ")
    print(f"  案件名: {memo.project_title}")
    print(f"  目的: {memo.purpose}")
    for key, qty in sorted(memo.parts.items()):
        print(f"  {key}: {qty}")
    print("↓")
    print("PLC案件生成")
    print(f"  → {result.project_dir}/")
    print("↓")
    print("PLC容量選定")
    print(f"  → {result.project_dir / 'SPEC' / 'PLC_SELECTION.md'}")
    print("↓")
    print("部材表")
    print(f"  → {result.project_dir / 'SPEC' / 'BOM.csv'}")
    print("↓")
    print("概算見積")
    print(f"  → {result.project_dir / 'SPEC' / 'ROUGH_ESTIMATE.md'}")
    print("↓")
    print("施工メモ")
    print(f"  → {result.project_dir / 'SPEC' / 'INSTALL_NOTES.md'}")
    print("↓")
    print("発注メモ")
    print(f"  → {result.project_dir / 'SPEC' / 'ORDER_MEMO.md'}")
    print()
    for row in result.audit_rows:
        mark = "PASS" if row.passed else "FAIL"
        print(f"  [{mark}] {row.name}: {row.detail}")
    print()
    print(f"{'PASS' if result.all_pass else 'FAIL'}")
    print()
    print(f"{BUILDER_NAME} - 完成")


def run_estimate_plus_pipeline(
    estimate_path: Path,
    output_dir: Path,
    *,
    project_name: str | None = None,
) -> int:
    if not estimate_path.is_file():
        print(f"ERROR: 見積ファイルが見つかりません: {estimate_path}", file=sys.stderr)
        return 1
    result = build_estimate_plus_project(
        estimate_path, output_dir, project_name=project_name
    )
    _print_estimate_plus_completion(result)
    return 0 if result.all_pass else 1


def _write_quote_ready_spec_files(
    project_dir: Path,
    estimate_result: EstimateBuildResult,
) -> dict[str, Path]:
    """部材表・概算見積・施工メモ・発注メモ・TOMS見積CSVを SPEC/ に書き出す。"""
    paths = _write_estimate_plus_spec_files(project_dir, estimate_result)

    bom_text = paths["BOM.csv"].read_text(encoding="utf-8")
    toms_items_text = generate_toms_quote_items_csv(bom_text)
    toms_items = parse_toms_quote_items_csv(toms_items_text)
    toms_summary_text = generate_toms_quote_summary(estimate_result, len(toms_items))

    paths["TOMS_QUOTE_ITEMS.csv"] = project_dir / "SPEC" / "TOMS_QUOTE_ITEMS.csv"
    paths["TOMS_QUOTE_SUMMARY.md"] = project_dir / "SPEC" / "TOMS_QUOTE_SUMMARY.md"
    paths["TOMS_QUOTE_ITEMS.csv"].write_text(toms_items_text, encoding="utf-8")
    paths["TOMS_QUOTE_SUMMARY.md"].write_text(toms_summary_text, encoding="utf-8")

    return paths


def audit_quote_ready_files(project_dir: Path) -> list[AuditRow]:
    """Quote Ready モード用の TOMS 見積連携ファイルを監査する。"""
    spec_dir = project_dir / "SPEC"
    items_path = spec_dir / "TOMS_QUOTE_ITEMS.csv"
    summary_path = spec_dir / "TOMS_QUOTE_SUMMARY.md"

    items_text = items_path.read_text(encoding="utf-8") if items_path.is_file() else ""
    items = parse_toms_quote_items_csv(items_text) if items_text else []

    return [
        AuditRow(
            "TOMS_QUOTE_ITEMS.csv 存在",
            items_path.is_file(),
            "OK" if items_path.is_file() else "ファイルなし",
        ),
        AuditRow(
            "TOMS_QUOTE_SUMMARY.md 存在",
            summary_path.is_file(),
            "OK" if summary_path.is_file() else "ファイルなし",
        ),
        AuditRow(
            "No 連番",
            toms_items_sequential_nos(items),
            f"{len(items)} 行" if items else "行なし",
        ),
        AuditRow(
            "Qty 空欄なし",
            toms_items_all_qty_filled(items),
            "OK" if toms_items_all_qty_filled(items) else "空欄あり",
        ),
        AuditRow(
            "PLC項目あり",
            toms_items_have_plc(items),
            "PLC" if toms_items_have_plc(items) else "なし",
        ),
        AuditRow(
            "24V電源項目あり",
            toms_items_have_power(items),
            "24V電源" if toms_items_have_power(items) else "なし",
        ),
    ]


@dataclass
class QuoteReadyBuildResult:
    estimate_result: EstimateBuildResult
    project_dir: Path
    audit_rows: list[AuditRow] = field(default_factory=list)
    all_pass: bool = False


def build_quote_ready_project(
    estimate_path: Path,
    output_dir: Path,
    *,
    project_name: str | None = None,
) -> QuoteReadyBuildResult:
    """見積メモ → PLC案件 → BOM → TOMS見積連携CSV。"""
    memo = parse_estimate_file(estimate_path)
    estimate_result = build_from_estimate_memo(memo)

    if project_name:
        estimate_result.project_name = project_name

    project_dir = output_dir / estimate_result.project_name

    all_rows, logic_pass, _ = _write_delivery_project(
        estimate_result.assignment,
        estimate_result.project_name,
        project_dir,
        "(見積メモ)",
        str(estimate_path),
    )

    _write_quote_ready_spec_files(project_dir, estimate_result)

    _finalize_plc_outputs(
        project_dir,
        estimate_result.assignment,
        estimate_result.project_name,
    )

    capacity_rows = audit_capacity_checks(
        estimate_result.assignment, estimate_result.estimation
    )
    spec_rows = spec_checks_to_audit_rows(estimate_result.spec_checks)
    plus_rows = audit_estimate_plus_files(project_dir, estimate_result)
    quote_rows = audit_quote_ready_files(project_dir)
    plc_rows = audit_plc_selection_files(project_dir)
    integration_rows = audit_plc_integration(project_dir)
    all_rows = capacity_rows + all_rows + spec_rows + plus_rows + quote_rows + plc_rows + integration_rows
    all_pass = logic_pass and all(r.passed for r in all_rows)

    write_project_meta(
        project_dir / "PROJECT_META.json",
        estimate_result.project_name,
        "(見積メモ)",
        str(estimate_path),
        "PASS" if all_pass else "FAIL",
    )

    auto_report = _write_auto_test_report(project_dir, all_rows, all_pass)
    (project_dir / "TEST" / "AUTO_TEST_REPORT.md").write_text(auto_report, encoding="utf-8")

    return QuoteReadyBuildResult(
        estimate_result=estimate_result,
        project_dir=project_dir,
        audit_rows=all_rows,
        all_pass=all_pass,
    )


def _print_quote_ready_completion(result: QuoteReadyBuildResult) -> None:
    er = result.estimate_result
    memo = er.memo
    print(BUILDER_NAME)
    print()
    print("見積メモ")
    print(f"  案件名: {memo.project_title}")
    print(f"  目的: {memo.purpose}")
    for key, qty in sorted(memo.parts.items()):
        print(f"  {key}: {qty}")
    print("↓")
    print("PLC容量選定")
    print(f"  → {result.project_dir / 'SPEC' / 'PLC_SELECTION.md'}")
    print("↓")
    print("BOM")
    print(f"  → {result.project_dir / 'SPEC' / 'BOM.csv'}")
    print("↓")
    print("TOMS見積CSV")
    print(f"  → {result.project_dir / 'SPEC' / 'TOMS_QUOTE_ITEMS.csv'}")
    print(f"  → {result.project_dir / 'SPEC' / 'TOMS_QUOTE_SUMMARY.md'}")
    print("↓")
    print("見積連携準備")
    print(f"  → {result.project_dir / 'SPEC'}/")
    print()
    for row in result.audit_rows:
        mark = "PASS" if row.passed else "FAIL"
        print(f"  [{mark}] {row.name}: {row.detail}")
    print()
    print(f"{'PASS' if result.all_pass else 'FAIL'}")
    print()
    print(f"{BUILDER_NAME} - 完成")


def run_quote_ready_pipeline(
    estimate_path: Path,
    output_dir: Path,
    *,
    project_name: str | None = None,
) -> int:
    if not estimate_path.is_file():
        print(f"ERROR: 見積ファイルが見つかりません: {estimate_path}", file=sys.stderr)
        return 1
    result = build_quote_ready_project(
        estimate_path, output_dir, project_name=project_name
    )
    _print_quote_ready_completion(result)
    return 0 if result.all_pass else 1


def _write_quote_excel_file(
    project_dir: Path,
    toms_items_text: str,
    estimate_result: EstimateBuildResult,
) -> Path:
    """TOMS_QUOTE.xlsx を SPEC/ に書き出す。"""
    xlsx_path = project_dir / "SPEC" / "TOMS_QUOTE.xlsx"
    write_toms_quote_xlsx(xlsx_path, toms_items_text, estimate_result)
    return xlsx_path


def audit_quote_excel_files(
    project_dir: Path,
    expected_item_count: int,
) -> list[AuditRow]:
    """Quote Excel モード用の xlsx 監査。"""
    xlsx_path = project_dir / "SPEC" / "TOMS_QUOTE.xlsx"
    row_count = xlsx_row_count(xlsx_path)
    expected_rows = expected_item_count + 1  # header + items

    return [
        AuditRow(
            "TOMS_QUOTE.xlsx 存在",
            xlsx_path.is_file(),
            "OK" if xlsx_path.is_file() else "ファイルなし",
        ),
        AuditRow(
            "xlsx 形式有効",
            is_valid_xlsx(xlsx_path),
            "OK" if is_valid_xlsx(xlsx_path) else "無効な xlsx",
        ),
        AuditRow(
            "見積明細行数",
            row_count == expected_rows,
            f"{row_count} 行（期待 {expected_rows} 行）",
        ),
        AuditRow(
            "Excel PLC項目",
            xlsx_contains_text(xlsx_path, "PLC"),
            "PLC" if xlsx_contains_text(xlsx_path, "PLC") else "なし",
        ),
        AuditRow(
            "Excel 24V電源項目",
            xlsx_contains_text(xlsx_path, "24V電源"),
            "24V電源" if xlsx_contains_text(xlsx_path, "24V電源") else "なし",
        ),
    ]


@dataclass
class QuoteExcelBuildResult:
    estimate_result: EstimateBuildResult
    project_dir: Path
    audit_rows: list[AuditRow] = field(default_factory=list)
    all_pass: bool = False


def build_quote_excel_project(
    estimate_path: Path,
    output_dir: Path,
    *,
    project_name: str | None = None,
) -> QuoteExcelBuildResult:
    """見積メモ → PLC案件 → BOM → TOMS CSV → TOMS Excel。"""
    memo = parse_estimate_file(estimate_path)
    estimate_result = build_from_estimate_memo(memo)

    if project_name:
        estimate_result.project_name = project_name

    project_dir = output_dir / estimate_result.project_name

    all_rows, logic_pass, _ = _write_delivery_project(
        estimate_result.assignment,
        estimate_result.project_name,
        project_dir,
        "(見積メモ)",
        str(estimate_path),
    )

    spec_paths = _write_quote_ready_spec_files(project_dir, estimate_result)
    toms_items_text = spec_paths["TOMS_QUOTE_ITEMS.csv"].read_text(encoding="utf-8")
    toms_items = parse_toms_quote_items_csv(toms_items_text)
    _write_quote_excel_file(project_dir, toms_items_text, estimate_result)

    _finalize_plc_outputs(
        project_dir,
        estimate_result.assignment,
        estimate_result.project_name,
    )

    capacity_rows = audit_capacity_checks(
        estimate_result.assignment, estimate_result.estimation
    )
    spec_rows = spec_checks_to_audit_rows(estimate_result.spec_checks)
    plus_rows = audit_estimate_plus_files(project_dir, estimate_result)
    quote_rows = audit_quote_ready_files(project_dir)
    excel_rows = audit_quote_excel_files(project_dir, len(toms_items))
    plc_rows = audit_plc_selection_files(project_dir)
    integration_rows = audit_plc_integration(project_dir)
    all_rows = (
        capacity_rows + all_rows + spec_rows + plus_rows
        + quote_rows + excel_rows + plc_rows + integration_rows
    )
    all_pass = logic_pass and all(r.passed for r in all_rows)

    write_project_meta(
        project_dir / "PROJECT_META.json",
        estimate_result.project_name,
        "(見積メモ)",
        str(estimate_path),
        "PASS" if all_pass else "FAIL",
    )

    auto_report = _write_auto_test_report(project_dir, all_rows, all_pass)
    (project_dir / "TEST" / "AUTO_TEST_REPORT.md").write_text(auto_report, encoding="utf-8")

    return QuoteExcelBuildResult(
        estimate_result=estimate_result,
        project_dir=project_dir,
        audit_rows=all_rows,
        all_pass=all_pass,
    )


def _print_quote_excel_completion(result: QuoteExcelBuildResult) -> None:
    er = result.estimate_result
    memo = er.memo
    print(BUILDER_NAME)
    print()
    print("見積メモ")
    print(f"  案件名: {memo.project_title}")
    print(f"  目的: {memo.purpose}")
    for key, qty in sorted(memo.parts.items()):
        print(f"  {key}: {qty}")
    print("↓")
    print("BOM")
    print(f"  → {result.project_dir / 'SPEC' / 'BOM.csv'}")
    print("↓")
    print("TOMS見積CSV")
    print(f"  → {result.project_dir / 'SPEC' / 'TOMS_QUOTE_ITEMS.csv'}")
    print("↓")
    print("TOMS見積Excel")
    print(f"  → {result.project_dir / 'SPEC' / 'TOMS_QUOTE.xlsx'}")
    print("↓")
    print("見積連携")
    print(f"  → {result.project_dir / 'SPEC'}/")
    print()
    for row in result.audit_rows:
        mark = "PASS" if row.passed else "FAIL"
        print(f"  [{mark}] {row.name}: {row.detail}")
    print()
    print(f"{'PASS' if result.all_pass else 'FAIL'}")
    print()
    print(f"{BUILDER_NAME} - 完成")


def run_quote_excel_pipeline(
    estimate_path: Path,
    output_dir: Path,
    *,
    project_name: str | None = None,
) -> int:
    if not estimate_path.is_file():
        print(f"ERROR: 見積ファイルが見つかりません: {estimate_path}", file=sys.stderr)
        return 1
    result = build_quote_excel_project(
        estimate_path, output_dir, project_name=project_name
    )
    _print_quote_excel_completion(result)
    return 0 if result.all_pass else 1


def _write_site_survey_file(
    project_dir: Path,
    estimate_result: EstimateBuildResult,
) -> Path:
    """SITE_SURVEY.md を SPEC/ に書き出す。"""
    spec_dir = project_dir / "SPEC"
    spec_dir.mkdir(parents=True, exist_ok=True)
    path = spec_dir / "SITE_SURVEY.md"
    path.write_text(generate_site_survey_md(estimate_result), encoding="utf-8")
    return path


def audit_site_survey_files(
    project_dir: Path,
    expected_device_count: int,
) -> list[AuditRow]:
    """現調シート監査。"""
    survey_path = project_dir / "SPEC" / "SITE_SURVEY.md"
    text = survey_path.read_text(encoding="utf-8") if survey_path.is_file() else ""
    device_count = site_survey_device_count(text)

    return [
        AuditRow(
            "SITE_SURVEY.md 存在",
            survey_path.is_file(),
            "OK" if survey_path.is_file() else "ファイルなし",
        ),
        AuditRow(
            "機器チェックリスト",
            site_survey_has_device_table(text),
            f"{device_count} 機器" if site_survey_has_device_table(text) else "なし",
        ),
        AuditRow(
            "I/O現調表",
            site_survey_has_io_table(text),
            "OK" if site_survey_has_io_table(text) else "なし",
        ),
        AuditRow(
            "PLC容量確認セクション",
            site_survey_has_plc_capacity_section(text),
            "反映済" if site_survey_has_plc_capacity_section(text) else "未反映",
        ),
        AuditRow(
            "機器行数一致",
            device_count == expected_device_count,
            f"{device_count} / 期待 {expected_device_count}",
        ),
    ]


@dataclass
class SiteSurveyBuildResult:
    estimate_result: EstimateBuildResult
    project_dir: Path
    audit_rows: list[AuditRow] = field(default_factory=list)
    all_pass: bool = False


def build_site_survey_project(
    estimate_path: Path,
    output_dir: Path,
    *,
    project_name: str | None = None,
) -> SiteSurveyBuildResult:
    """見積メモ → PLC案件 → BOM → TOMS → Excel → 現調シート。"""
    memo = parse_estimate_file(estimate_path)
    estimate_result = build_from_estimate_memo(memo)

    if project_name:
        estimate_result.project_name = project_name

    project_dir = output_dir / estimate_result.project_name

    all_rows, logic_pass, _ = _write_delivery_project(
        estimate_result.assignment,
        estimate_result.project_name,
        project_dir,
        "(見積メモ)",
        str(estimate_path),
    )

    spec_paths = _write_quote_ready_spec_files(project_dir, estimate_result)
    toms_items_text = spec_paths["TOMS_QUOTE_ITEMS.csv"].read_text(encoding="utf-8")
    toms_items = parse_toms_quote_items_csv(toms_items_text)
    _write_quote_excel_file(project_dir, toms_items_text, estimate_result)
    _write_site_survey_file(project_dir, estimate_result)

    _finalize_plc_outputs(
        project_dir,
        estimate_result.assignment,
        estimate_result.project_name,
    )

    expected_devices = sum(1 for q in memo.parts.values() if q > 0)
    capacity_rows = audit_capacity_checks(
        estimate_result.assignment, estimate_result.estimation
    )
    spec_rows = spec_checks_to_audit_rows(estimate_result.spec_checks)
    plus_rows = audit_estimate_plus_files(project_dir, estimate_result)
    quote_rows = audit_quote_ready_files(project_dir)
    excel_rows = audit_quote_excel_files(project_dir, len(toms_items))
    survey_rows = audit_site_survey_files(project_dir, expected_devices)
    plc_rows = audit_plc_selection_files(project_dir)
    integration_rows = audit_plc_integration(project_dir)
    all_rows = (
        capacity_rows + all_rows + spec_rows + plus_rows
        + quote_rows + excel_rows + survey_rows + plc_rows + integration_rows
    )
    all_pass = logic_pass and all(r.passed for r in all_rows)

    write_project_meta(
        project_dir / "PROJECT_META.json",
        estimate_result.project_name,
        "(見積メモ)",
        str(estimate_path),
        "PASS" if all_pass else "FAIL",
    )

    auto_report = _write_auto_test_report(project_dir, all_rows, all_pass)
    (project_dir / "TEST" / "AUTO_TEST_REPORT.md").write_text(auto_report, encoding="utf-8")

    return SiteSurveyBuildResult(
        estimate_result=estimate_result,
        project_dir=project_dir,
        audit_rows=all_rows,
        all_pass=all_pass,
    )


def _print_site_survey_completion(result: SiteSurveyBuildResult) -> None:
    er = result.estimate_result
    memo = er.memo
    print(BUILDER_NAME)
    print()
    print("見積メモ")
    print(f"  案件名: {memo.project_title}")
    print(f"  目的: {memo.purpose}")
    for key, qty in sorted(memo.parts.items()):
        print(f"  {key}: {qty}")
    print("↓")
    print("TOMS見積Excel")
    print(f"  → {result.project_dir / 'SPEC' / 'TOMS_QUOTE.xlsx'}")
    print("↓")
    print("現調シート")
    print(f"  → {result.project_dir / 'SPEC' / 'SITE_SURVEY.md'}")
    print("↓")
    print("現場調査準備")
    print(f"  → {result.project_dir / 'SPEC'}/")
    print()
    for row in result.audit_rows:
        mark = "PASS" if row.passed else "FAIL"
        print(f"  [{mark}] {row.name}: {row.detail}")
    print()
    print(f"{'PASS' if result.all_pass else 'FAIL'}")
    print()
    print(f"{BUILDER_NAME} - 完成")


def run_site_survey_pipeline(
    estimate_path: Path,
    output_dir: Path,
    *,
    project_name: str | None = None,
) -> int:
    if not estimate_path.is_file():
        print(f"ERROR: 見積ファイルが見つかりません: {estimate_path}", file=sys.stderr)
        return 1
    result = build_site_survey_project(
        estimate_path, output_dir, project_name=project_name
    )
    _print_site_survey_completion(result)
    return 0 if result.all_pass else 1


def run_full_spec_pipeline(
    text: str,
    output_dir: Path,
    *,
    project_name: str | None = None,
) -> int:
    result = build_full_spec_project(text, output_dir, project_name=project_name)
    _print_full_spec_completion(result)
    return 0 if result.all_pass else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=BUILDER_NAME)
    parser.add_argument(
        "--customer",
        type=Path,
        default=DEFAULT_CUSTOMER,
        help="顧客情報入力ファイル",
    )
    parser.add_argument(
        "--estimate",
        type=Path,
        default=DEFAULT_ESTIMATE,
        help="見積（センサー数量）入力ファイル",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="納品フォルダ出力先",
    )
    parser.add_argument(
        "--project-name",
        type=str,
        default=None,
        help="案件名（省略時は 会社名_現場名 から自動生成）",
    )
    parser.add_argument(
        "--template",
        type=str,
        default=None,
        choices=VALID_TEMPLATES,
        help="用途別テンプレート（HOME_SECURITY / CARSHOP_SECURITY / WAREHOUSE_SECURITY / MINPAKU_COUNTER / FACTORY_SAFETY）",
    )
    parser.add_argument(
        "--test-all-templates",
        action="store_true",
        help="全テンプレートを一括生成して MULTI_TEMPLATE_TEST_REPORT.md を出力",
    )
    parser.add_argument(
        "--nl",
        action="store_true",
        help="日本語文章（sample_requests.txt）からテンプレ推定→案件生成→NLP_TEST_REPORT.md",
    )
    parser.add_argument(
        "--nl-samples",
        type=Path,
        default=NLP_SAMPLE_REQUESTS,
        help="--nl 用サンプル要求ファイル（既定: nlp/sample_requests.txt）",
    )
    parser.add_argument(
        "--full-spec",
        action="store_true",
        help="自然文 → 仕様書 → I/O → 配線 → GX → 案件生成 → テスト（完全自動）",
    )
    parser.add_argument(
        "--text",
        type=str,
        default=None,
        help="--full-spec 用の自然文（省略時は車屋サンプル）",
    )
    parser.add_argument(
        "--text-file",
        type=Path,
        default=None,
        help="--full-spec 用の自然文ファイル",
    )
    parser.add_argument(
        "--estimate-mode",
        action="store_true",
        help="見積メモ形式 → PLC仕様 → I/O → GX → 配線 → 案件生成 → テスト",
    )
    parser.add_argument(
        "--estimate-file",
        type=Path,
        default=DEFAULT_ESTIMATE_SAMPLE,
        help="--estimate-mode / --estimate-plus / --quote-ready 用の見積メモファイル（既定: estimate_mode/estimate_sample.txt）",
    )
    parser.add_argument(
        "--estimate-plus",
        action="store_true",
        help="見積メモ → PLC案件 → 部材表 / 概算見積 / 施工メモ / 発注メモ 自動生成",
    )
    parser.add_argument(
        "--quote-ready",
        action="store_true",
        help="見積メモ → BOM → TOMS見積連携CSV（TOMS_QUOTE_ITEMS.csv / TOMS_QUOTE_SUMMARY.md）",
    )
    parser.add_argument(
        "--quote-excel",
        action="store_true",
        help="見積メモ → BOM → TOMS見積CSV → TOMS_QUOTE.xlsx（Excel出力）",
    )
    parser.add_argument(
        "--site-survey",
        action="store_true",
        help="見積メモ → TOMS Excel → 現調シート（SITE_SURVEY.md）",
    )
    args = parser.parse_args()

    if args.site_survey:
        return run_site_survey_pipeline(
            args.estimate_file,
            args.output_dir,
            project_name=args.project_name,
        )

    if args.quote_excel:
        return run_quote_excel_pipeline(
            args.estimate_file,
            args.output_dir,
            project_name=args.project_name,
        )

    if args.quote_ready:
        return run_quote_ready_pipeline(
            args.estimate_file,
            args.output_dir,
            project_name=args.project_name,
        )

    if args.estimate_plus:
        return run_estimate_plus_pipeline(
            args.estimate_file,
            args.output_dir,
            project_name=args.project_name,
        )

    if args.estimate_mode:
        return run_estimate_mode_pipeline(
            args.estimate_file,
            args.output_dir,
            project_name=args.project_name,
        )

    if args.full_spec:
        if args.text_file:
            if not args.text_file.is_file():
                print(f"ERROR: テキストファイルが見つかりません: {args.text_file}", file=sys.stderr)
                return 1
            text = args.text_file.read_text(encoding="utf-8")
        else:
            text = args.text or FULL_SPEC_SAMPLE
        return run_full_spec_pipeline(text, args.output_dir, project_name=args.project_name)

    if args.nl:
        return run_nlp_pipeline(args.nl_samples, args.output_dir)

    if args.test_all_templates:
        return run_all_template_tests(args.output_dir)

    if args.template:
        try:
            result = build_template_project(args.template, args.output_dir)
        except ValueError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1
        _print_template_completion(result)
        return 0 if result.all_pass else 1

    return build_project(
        args.customer,
        args.estimate,
        args.output_dir,
        args.project_name,
    )


if __name__ == "__main__":
    raise SystemExit(main())
