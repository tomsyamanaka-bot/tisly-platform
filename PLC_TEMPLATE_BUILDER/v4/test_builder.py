#!/usr/bin/env python3
"""
TiSLY PLC Builder v4.7 — 自動テスト
build.py --sample の生成結果を検証し、AUTO_TEST_REPORT.md を出力する。
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

V4_DIR = Path(__file__).resolve().parent
BUILD_SCRIPT = V4_DIR / "build.py"
PROJECT_DIR = V4_DIR / "generated_projects" / "HOME_SECURITY_DEMO"
REPORT_PATH = PROJECT_DIR / "AUTO_TEST_REPORT.md"
VERSION = "v4.7"
BUILDER_NAME = f"TiSLY PLC Builder {VERSION}"
TESTED_PROJECT = "HOME_SECURITY_DEMO"

REQUIRED_FILES = [
    "GXW3_COMMANDS.txt",
    "IO_ASSIGNMENT.csv",
    "WIRING_DIAGRAM.md",
    "PROJECT_README.md",
    "TEST_REPORT.md",
    "PROJECT_META.json",
]


@dataclass
class TestResult:
    name: str
    passed: bool
    detail: str


def run_build_sample() -> tuple[TestResult, str]:
    """build.py --sample を実行する。"""
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    try:
        proc = subprocess.run(
            [sys.executable, str(BUILD_SCRIPT), "--sample"],
            cwd=str(V4_DIR),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
            check=False,
        )
    except OSError as exc:
        return TestResult("build.py --sample", False, str(exc)), ""

    output = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode != 0:
        return TestResult(
            "build.py --sample",
            False,
            f"終了コード {proc.returncode}",
        ), output
    return TestResult("build.py --sample", True, "正常終了"), output


def test_project_dir_exists() -> TestResult:
    if PROJECT_DIR.is_dir():
        return TestResult("案件フォルダ生成", True, str(PROJECT_DIR.relative_to(V4_DIR)))
    return TestResult("案件フォルダ生成", False, f"{PROJECT_DIR} が存在しません")


def test_required_files() -> list[TestResult]:
    results: list[TestResult] = []
    for name in REQUIRED_FILES:
        path = PROJECT_DIR / name
        if path.is_file():
            results.append(TestResult(f"{name} 存在", True, "OK"))
        else:
            results.append(TestResult(f"{name} 存在", False, "ファイルなし"))
    return results


def test_gx_commands() -> list[TestResult]:
    path = PROJECT_DIR / "GXW3_COMMANDS.txt"
    if not path.is_file():
        return [TestResult("GXW3_COMMANDS.txt 解析", False, "ファイルなし")]

    text = path.read_text(encoding="utf-8")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    m8012 = len(re.findall(r"\bM8012\b", text))
    m8013 = len(re.findall(r"\bM8013\b", text))
    sm412 = len(re.findall(r"\bSM412\b", text))
    sm413 = len(re.findall(r"\bSM413\b", text))
    out_y0 = len(re.findall(r"^OUT\s+Y0\b", text, re.MULTILINE))
    has_end = bool(lines) and lines[-1] == "END"

    return [
        TestResult("M8012 が0件", m8012 == 0, f"{m8012} 件"),
        TestResult("M8013 が0件", m8013 == 0, f"{m8013} 件"),
        TestResult("SM412 が存在", sm412 >= 1, f"{sm412} 件"),
        TestResult("SM413 が存在", sm413 >= 1, f"{sm413} 件"),
        TestResult("OUT Y0 が1回", out_y0 == 1, f"{out_y0} 回"),
        TestResult("END が存在", has_end, "末尾 END" if has_end else "END なし"),
    ]


def test_test_report() -> TestResult:
    path = PROJECT_DIR / "TEST_REPORT.md"
    if not path.is_file():
        return TestResult("TEST_REPORT.md 総合判定", False, "ファイルなし")

    text = path.read_text(encoding="utf-8")
    if "総合判定 PASS" in text:
        return TestResult("TEST_REPORT.md 総合判定 PASS", True, "記載あり")
    return TestResult("TEST_REPORT.md 総合判定 PASS", False, "PASS 記載なし")


def _next_action(all_pass: bool) -> str:
    if all_pass:
        return (
            'Git 保存: git add . && git commit -m "Add TiSLY PLC Builder v4.7 history management" && git push'
        )
    return "失敗項目を修正し、python test_builder.py を再実行してください"


def _update_project_meta_last_test_status(status: str) -> None:
    meta_path = PROJECT_DIR / "PROJECT_META.json"
    if not meta_path.is_file():
        return
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return
    meta["last_test_status"] = status
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_auto_test_report(results: list[TestResult], build_output: str) -> None:
    all_pass = all(r.passed for r in results)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    test_result = "PASS" if all_pass else "FAIL"
    next_action = _next_action(all_pass)

    _update_project_meta_last_test_status(test_result)

    table_rows = "\n".join(
        f"| {r.name} | {'PASS' if r.passed else 'FAIL'} | {r.detail} |"
        for r in results
    )
    checklist = "\n".join(
        f"- {'✓' if r.passed else '✗'} {r.name}: {r.detail}" for r in results
    )

    build_log = build_output.strip()
    if build_log:
        build_log_block = f"```\n{build_log}\n```"
    else:
        build_log_block = "_(出力なし)_"

    content = f"""# AUTO_TEST_REPORT — {BUILDER_NAME}

> 自動テスト実行レポート

---

## 履歴管理メタ

| 項目 | 値 |
|------|-----|
| builder_version | {BUILDER_NAME} |
| test_datetime | {now} |
| tested_project | {TESTED_PROJECT} |
| test_result | {test_result} |
| next_action | {next_action} |

---

## 実行概要

| 項目 | 値 |
|------|-----|
| 実行日時 (UTC) | {now} |
| テストスクリプト | test_builder.py |
| 対象 | build.py --sample |
| 出力先 | generated_projects/{TESTED_PROJECT} |

---

## チェックリスト

{checklist}

---

## テスト結果

| 項目 | 結果 | 詳細 |
|------|:----:|------|
{table_rows}

---

## build.py --sample 出力

{build_log_block}

---

**総合判定: {'PASS' if all_pass else 'FAIL'}**

**{BUILDER_NAME} — AUTO_TEST_REPORT**
"""
    PROJECT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(content, encoding="utf-8")


def main() -> int:
    results: list[TestResult] = []

    build_result, build_output = run_build_sample()
    results.append(build_result)

    results.append(test_project_dir_exists())
    results.extend(test_required_files())

    if (PROJECT_DIR / "GXW3_COMMANDS.txt").is_file():
        results.extend(test_gx_commands())

    results.append(test_test_report())

    write_auto_test_report(results, build_output)

    all_pass = all(r.passed for r in results)

    print(BUILDER_NAME)
    if all_pass:
        print("自動テスト PASS")
    else:
        print("自動テスト FAIL")
        for r in results:
            if not r.passed:
                print(f"  [FAIL] {r.name}: {r.detail}", file=sys.stderr)

    return 0 if all_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
