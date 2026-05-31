#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.20 — Node-RED Flow Validation
TISLY_FLOWS.json の詳細検査 → FLOW_TEST_REPORT.md 生成
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

VERSION = "v5.20"
BUILDER_LABEL = f"TiSLY PLC Builder {VERSION} — Node-RED Flow Validation"


def _load_flows(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else []


def validate_flows(flows: list[dict]) -> list[tuple[str, bool, str]]:
    if not flows:
        return [("フロー読み込み", False, "空または不存在")]

    types = [n.get("type", "") for n in flows]
    checks: list[tuple[str, bool, str]] = [
        ("JSON 配列形式", isinstance(flows, list), f"{len(flows)} ノード"),
        ("mqtt-broker", "mqtt-broker" in types, "あり" if "mqtt-broker" in types else "なし"),
        ("mqtt in", any(t == "mqtt in" for t in types), str(sum(1 for t in types if t == "mqtt in"))),
        ("mqtt out", any(t == "mqtt out" for t in types), str(sum(1 for t in types if t == "mqtt out"))),
        ("function", any(t == "function" for t in types), str(sum(1 for t in types if t == "function"))),
        ("debug", any(t == "debug" for t in types), str(sum(1 for t in types if t == "debug"))),
    ]

    text = json.dumps(flows, ensure_ascii=False)
    for topic in ("/alarm", "/motion", "/output", "/state", "/cmd"):
        checks.append((f"topic {topic}", topic in text, topic))

    skip = {"tab", "comment", "mqtt-broker"}
    wires_ok = all("wires" in n for n in flows if n.get("type", "") not in skip)
    checks.append(("全ノード wires", wires_ok, "OK" if wires_ok else "不足"))

    # Connection check: nodes with wires reference valid ids
    ids = {n.get("id") for n in flows}
    conn_ok = True
    for n in flows:
        for wire_group in n.get("wires", []):
            for target in wire_group:
                if target and target not in ids:
                    conn_ok = False
    checks.append(("ノード接続整合", conn_ok, "OK" if conn_ok else "孤立参照"))

    return checks


def generate_flow_test_report(project_dir: Path, checks: list[tuple[str, bool, str]]) -> str:
    project_name = project_dir.name
    all_pass = all(c[1] for c in checks)
    lines = [
        f"# FLOW_TEST_REPORT — {project_name}",
        "",
        f"**{BUILDER_LABEL}**",
        "",
        f"生成日時: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        "",
        "## 検査対象",
        "",
        f"- `{project_dir / 'TISLY' / 'TISLY_FLOWS.json'}`",
        "",
        "## 検査結果",
        "",
        "| 項目 | 結果 | 詳細 |",
        "|------|------|------|",
    ]
    for name, passed, detail in checks:
        mark = "PASS" if passed else "FAIL"
        lines.append(f"| {name} | {mark} | {detail} |")

    lines.extend([
        "",
        "## 総合判定",
        "",
        f"**{'PASS' if all_pass else 'FAIL'}**",
        "",
        "---",
        "",
        f"*{BUILDER_LABEL}*",
    ])
    return "\n".join(lines) + "\n"


def write_flow_validation(project_dir: Path) -> Path:
    """TEST/FLOW_TEST_REPORT.md を生成する。"""
    flow_path = project_dir / "TISLY" / "TISLY_FLOWS.json"
    flows = _load_flows(flow_path)
    checks = validate_flows(flows)
    report = generate_flow_test_report(project_dir, checks)

    test_dir = project_dir / "TEST"
    test_dir.mkdir(parents=True, exist_ok=True)
    out_path = test_dir / "FLOW_TEST_REPORT.md"
    out_path.write_text(report, encoding="utf-8")
    return out_path


def audit_flow_validation(project_dir: Path) -> list[tuple[str, bool, str]]:
    report_path = project_dir / "TEST" / "FLOW_TEST_REPORT.md"
    text = report_path.read_text(encoding="utf-8") if report_path.is_file() else ""
    has_report = report_path.is_file()
    has_sections = "## 検査結果" in text and "## 総合判定" in text
    all_pass = "**PASS**" in text if has_report else False

    return [
        ("FLOW_TEST_REPORT.md 存在", has_report, "OK" if has_report else "なし"),
        ("フロー検査セクション", has_sections, "OK" if has_sections else "NG"),
        ("フロー検証 PASS", all_pass, "PASS" if all_pass else "FAIL"),
    ]
