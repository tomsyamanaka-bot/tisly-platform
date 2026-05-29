#!/usr/bin/env python3
"""
TiSLY PLC Builder v4.7
文章仕様 → 案件フォルダ自動生成（GX命令 / I/O表 / 配線図 / README / 監査 / メタ）
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

V4_DIR = Path(__file__).resolve().parent
ENGINE_DIR = V4_DIR.parent / "engine"
GENERATED_DIR = V4_DIR / "generated"
DEFAULT_SPEC = V4_DIR / "sample_spec.txt"
DEFAULT_OUTPUT_DIR = V4_DIR / "generated_projects"
PLC_MODEL = "FX5UJ-24MR/ES"
GX_VERSION = "GX Works3"
VERSION = "v4.7"
BUILDER_NAME = f"TiSLY PLC Builder {VERSION}"
TEST_COMMAND = "python test_builder.py"

sys.path.insert(0, str(V4_DIR))
sys.path.insert(0, str(ENGINE_DIR))

from io_generator import IOAssignment, parse_spec, write_io_assignment  # noqa: E402
from readme_generator import write_readme  # noqa: E402
from wiring_generator import write_wiring_diagram  # noqa: E402
from plc_builder import Auditor, CommandGenerator, ParsedSpec, SpecParser  # noqa: E402


@dataclass
class AuditRow:
    name: str
    passed: bool
    detail: str


GENERATED_FILE_NAMES = [
    "GXW3_COMMANDS.txt",
    "IO_ASSIGNMENT.csv",
    "WIRING_DIAGRAM.md",
    "PROJECT_README.md",
    "TEST_REPORT.md",
    "PROJECT_META.json",
]


def _io_assignment_to_spec(io: IOAssignment) -> ParsedSpec:
    """I/O 割付表を v3 CommandGenerator 向け ParsedSpec に変換する。"""
    parser = SpecParser()
    lines = []
    for entry in io.entries:
        lines.append(f"{entry.name} {entry.device}")
    white = [e.device for e in io.outputs if e.name.startswith("白灯")]
    red = next((e.device for e in io.outputs if e.name == "赤灯"), "Y0")
    spec = parser.parse("\n".join(lines))
    d = spec.devices
    d.x_arm = next((e.device for e in io.inputs if "警戒" in e.name), d.x_arm)
    d.x_estop = next((e.device for e in io.inputs if "非常" in e.name), d.x_estop)
    d.x_sensor_1 = next((e.device for e in io.inputs if "外周" in e.name), d.x_sensor_1)
    d.x_sensor_2 = next((e.device for e in io.inputs if "近接" in e.name), d.x_sensor_2)
    d.y_red = red
    d.y_white = white if white else d.y_white
    spec.devices = d
    return spec


def audit_io_duplicates(assignment: IOAssignment) -> AuditRow:
    devices = [e.device for e in assignment.entries]
    duplicates = {d for d in devices if devices.count(d) > 1}
    return AuditRow(
        "I/O 重複なし",
        len(duplicates) == 0,
        "重複なし" if not duplicates else ", ".join(sorted(duplicates)),
    )


def write_gx_commands(path: Path, lines: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _collect_audit_metrics(gx_lines: list[str]) -> dict[str, int | bool]:
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


def write_test_report(
    path: Path,
    assignment: IOAssignment,
    gx_lines: list[str],
    spec: ParsedSpec,
) -> tuple[list[AuditRow], bool]:
    auditor = Auditor()
    v3_results = auditor.audit(gx_lines, spec, reference_path=None)
    metrics = _collect_audit_metrics(gx_lines)

    m8012 = metrics["m8012"]
    m8013 = metrics["m8013"]
    sm412 = metrics["sm412"]
    sm413 = metrics["sm413"]
    out_y0 = metrics["out_y0"]
    dup_out = metrics["dup_out"]
    has_end = metrics["has_end"]

    rows: list[AuditRow] = []
    rows.append(AuditRow("M8012 チェック", m8012 == 0, f"{m8012} 件（0 が正常）"))
    rows.append(AuditRow("M8013 チェック", m8013 == 0, f"{m8013} 件（0 が正常）"))
    rows.append(AuditRow("SM412 チェック", sm412 >= 1, f"{sm412} 件"))
    rows.append(AuditRow("SM413 チェック", sm413 >= 1, f"{sm413} 件"))
    rows.append(
        AuditRow(
            "OUT 重複チェック",
            len(dup_out) == 0,
            "重複なし" if not dup_out else ", ".join(f"{y}×{c}" for y, c in sorted(dup_out.items())),
        )
    )
    rows.append(AuditRow("OUT Y0 チェック", out_y0 == 1, f"{out_y0} 回"))
    rows.append(AuditRow("END チェック", has_end, "末尾 END" if has_end else "END なし"))
    rows.append(audit_io_duplicates(assignment))

    all_pass = all(r.passed for r in rows)

    checklist_lines = [
        f"M8012 = {m8012}",
        f"M8013 = {m8013}",
        "SM412あり" if sm412 >= 1 else "SM412なし",
        "SM413あり" if sm413 >= 1 else "SM413なし",
        "OUT重複なし" if not dup_out else f"OUT重複あり ({', '.join(sorted(dup_out))})",
        f"OUT Y0 = {out_y0}回",
        "ENDあり" if has_end else "ENDなし",
        "I/O重複なし" if rows[-1].passed else f"I/O重複あり ({rows[-1].detail})",
        f"総合判定 {'PASS' if all_pass else 'FAIL'}",
    ]
    checklist_block = "\n".join(f"- {line}" for line in checklist_lines)

    audit_table = "\n".join(
        f"| {r.name} | {'PASS' if r.passed else 'FAIL'} | {r.detail} |" for r in rows
    )
    io_table = "\n".join(
        f"| {e.device} | {e.name} | {e.io_type} |" for e in assignment.entries
    )

    content = f"""# TEST_REPORT — TiSLY PLC Builder {VERSION}

> 自動監査レポート

---

## 監査チェックリスト

{checklist_block}

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

---

## GX Works3 命令サマリー

- 命令行数: {len(gx_lines)}
- 部品: {", ".join(spec.parts) if spec.parts else "001, 002, 005, 003, 004, 006, 007"}

---

## v3 エンジン監査（参考）

| 項目 | 結果 | 詳細 |
|------|:----:|------|
"""
    for r in v3_results:
        content += f"| {r.name} | {'PASS' if r.passed else 'FAIL'} | {r.detail} |\n"

    content += f"""
---

**総合判定: {'PASS' if all_pass else 'FAIL'}**

**TiSLY PLC Builder {VERSION} — TEST_REPORT**
"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return rows, all_pass


def _read_existing_last_test_status(path: Path) -> str:
    if not path.is_file():
        return "NOT_RUN"
    try:
        existing = json.loads(path.read_text(encoding="utf-8"))
        return existing.get("last_test_status", "NOT_RUN")
    except (json.JSONDecodeError, OSError):
        return "NOT_RUN"


def write_project_meta(
    path: Path,
    project_name: str,
    spec_file: str,
    test_status: str,
    build_command: str,
) -> None:
    meta = {
        "project_name": project_name,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "plc_model": PLC_MODEL,
        "gx_version": GX_VERSION,
        "spec_file": spec_file,
        "generated_files": GENERATED_FILE_NAMES,
        "test_status": test_status,
        "builder_version": BUILDER_NAME,
        "build_command": build_command,
        "test_command": TEST_COMMAND,
        "last_test_status": _read_existing_last_test_status(path),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _generate_artifacts(
    project_dir: Path,
    spec_path: Path,
    spec_text: str,
    build_command: str,
) -> tuple[list[AuditRow], bool]:
    assignment = parse_spec(spec_text)
    parsed = _io_assignment_to_spec(assignment)
    generator = CommandGenerator()
    gx_lines = generator.generate(parsed)

    gx_path = project_dir / "GXW3_COMMANDS.txt"
    io_path = project_dir / "IO_ASSIGNMENT.csv"
    wiring_path = project_dir / "WIRING_DIAGRAM.md"
    readme_path = project_dir / "PROJECT_README.md"
    report_path = project_dir / "TEST_REPORT.md"
    meta_path = project_dir / "PROJECT_META.json"

    write_gx_commands(gx_path, gx_lines)
    write_io_assignment(io_path, assignment)
    write_wiring_diagram(wiring_path, assignment)
    write_readme(readme_path, assignment, spec_text)
    audit_rows, all_pass = write_test_report(report_path, assignment, gx_lines, parsed)
    write_project_meta(
        meta_path,
        project_name=project_dir.name,
        spec_file=str(spec_path),
        test_status="PASS" if all_pass else "FAIL",
        build_command=build_command,
    )
    return audit_rows, all_pass


def _format_build_command(argv: list[str] | None = None) -> str:
    args = argv if argv is not None else sys.argv[1:]
    if args:
        return "python build.py " + " ".join(args)
    return "python build.py"


def build_project(
    project_name: str,
    spec_path: Path,
    output_dir: Path,
    build_command: str | None = None,
) -> int:
    if not spec_path.exists():
        print(f"ERROR: 仕様ファイルが見つかりません: {spec_path}", file=sys.stderr)
        return 1

    spec_text = spec_path.read_text(encoding="utf-8")
    project_dir = output_dir / project_name
    cmd = build_command or _format_build_command()
    audit_rows, all_pass = _generate_artifacts(project_dir, spec_path, spec_text, cmd)

    print(BUILDER_NAME)
    print()
    print(f"案件名: {project_name}")
    print(f"仕様: {spec_path}")
    print(f"出力: {project_dir}")
    print()
    for name in GENERATED_FILE_NAMES:
        print(f"  - {name}")
    print()
    for row in audit_rows:
        mark = "PASS" if row.passed else "FAIL"
        print(f"  [{mark}] {row.name}: {row.detail}")
    print()
    print(f"総合判定: {'PASS' if all_pass else 'FAIL'}")
    print()
    print("案件フォルダ自動生成 完成")

    return 0 if all_pass else 1


def build(spec_path: Path = DEFAULT_SPEC, build_command: str | None = None) -> int:
    """従来 v4 互換: v4/generated/ へ出力。"""
    if not spec_path.exists():
        print(f"ERROR: 仕様ファイルが見つかりません: {spec_path}", file=sys.stderr)
        return 1

    spec_text = spec_path.read_text(encoding="utf-8")
    cmd = build_command or _format_build_command()
    audit_rows, all_pass = _generate_artifacts(GENERATED_DIR, spec_path, spec_text, cmd)

    print(BUILDER_NAME)
    print()
    print("文章仕様")
    assignment = parse_spec(spec_text)
    for line in assignment.raw_lines:
        print(f"  {line}")
    print("↓")
    print(f"GX命令 → {GENERATED_DIR / 'GXW3_COMMANDS.txt'}")
    print(f"I/O表 → {GENERATED_DIR / 'IO_ASSIGNMENT.csv'}")
    print(f"配線図 → {GENERATED_DIR / 'WIRING_DIAGRAM.md'}")
    print(f"README → {GENERATED_DIR / 'PROJECT_README.md'}")
    print(f"監査 → {GENERATED_DIR / 'TEST_REPORT.md'}")
    print()
    for row in audit_rows:
        mark = "PASS" if row.passed else "FAIL"
        print(f"  [{mark}] {row.name}: {row.detail}")
    print()
    print(f"総合判定: {'PASS' if all_pass else 'FAIL'}")
    print()
    print("完全自動生成 完成")

    return 0 if all_pass else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=BUILDER_NAME)
    parser.add_argument(
        "--project-name",
        type=str,
        default=None,
        help="案件名（指定時は案件フォルダを自動生成）",
    )
    parser.add_argument(
        "--spec",
        type=Path,
        default=DEFAULT_SPEC,
        help="入力仕様ファイル",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="案件フォルダの出力先",
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=None,
        help="(非推奨) --spec のエイリアス",
    )
    parser.add_argument(
        "--sample",
        action="store_true",
        help="サンプル実行 (HOME_SECURITY_DEMO / sample_spec.txt / generated_projects)",
    )
    args = parser.parse_args()

    if args.sample:
        return build_project("HOME_SECURITY_DEMO", DEFAULT_SPEC, DEFAULT_OUTPUT_DIR)

    spec_path = args.input if args.input is not None else args.spec

    if args.project_name:
        return build_project(args.project_name, spec_path, args.output_dir)
    return build(spec_path)


if __name__ == "__main__":
    raise SystemExit(main())
