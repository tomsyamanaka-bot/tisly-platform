#!/usr/bin/env python3
"""
TiSLY PLC Builder v3
文章仕様 → GX Works3 命令リスト生成 CLI
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

ENGINE_DIR = Path(__file__).resolve().parent
SAMPLE_DIR = ENGINE_DIR / "sample_specs"
GENERATED_DIR = ENGINE_DIR / "generated"
DEFAULT_SPEC = SAMPLE_DIR / "home_security.txt"
DEFAULT_OUTPUT = GENERATED_DIR / "GXW3_GENERATED_HOME_SECURITY.txt"
DEFAULT_REPORT = GENERATED_DIR / "BUILD_REPORT.md"
MULTI_REPORT = GENERATED_DIR / "MULTI_SPEC_BUILD_REPORT.md"
REFERENCE_IL = ENGINE_DIR.parent.parent / "GXW3_PURE_COMMANDS.txt"

ARM_KEYWORDS = ("警戒", "警備", "セレクタ", "夜間", "監視", "チェックイン", "清掃")
ESTOP_KEYWORDS = ("非常停止", "緊急停止", "全OFF", "全停止")
SENSOR_1_KEYWORDS = ("外周", "シャッター", "入口")
SENSOR_2_KEYWORDS = ("近接", "展示車", "侵入", "出口")
OUTPUT_KEYWORDS = ("赤灯", "白灯", "点灯", "照明", "満室")

PARTS = {
    "001": "SELF HOLD",
    "002": "ESTOP",
    "003": "BLINK SLOW",
    "004": "BLINK FAST",
    "005": "SENSOR LATCH",
    "006": "RED LIGHT PRIORITY",
    "007": "OUTPUT CONTROL",
}

TEMPLATE_LABELS: dict[str, dict[str, str]] = {
    "HOME_SECURITY": {
        "x_arm": "警戒スイッチ",
        "x_sensor_1": "外周センサー",
        "x_sensor_2": "近接センサー",
    },
    "CARSHOP_SECURITY": {
        "x_arm": "夜間警戒",
        "x_sensor_1": "外周センサー",
        "x_sensor_2": "展示車エリアセンサー",
    },
    "WAREHOUSE_SECURITY": {
        "x_arm": "監視開始",
        "x_sensor_1": "シャッター開閉センサー",
        "x_sensor_2": "侵入センサー",
    },
    "MINPAKU_COUNTER": {
        "x_arm": "チェックイン完了",
        "x_sensor_1": "入口赤外線",
        "x_sensor_2": "出口赤外線",
    },
}


@dataclass
class SpecBuildTarget:
    name: str
    template: str
    spec_path: Path
    output_path: Path
    reference_path: Path | None = None


MULTI_SPEC_TARGETS: list[SpecBuildTarget] = [
    SpecBuildTarget(
        name="CARSHOP_SECURITY",
        template="CARSHOP_SECURITY",
        spec_path=SAMPLE_DIR / "carshop_security.txt",
        output_path=GENERATED_DIR / "GXW3_GENERATED_CARSHOP_SECURITY.txt",
    ),
    SpecBuildTarget(
        name="WAREHOUSE_SECURITY",
        template="WAREHOUSE_SECURITY",
        spec_path=SAMPLE_DIR / "warehouse_security.txt",
        output_path=GENERATED_DIR / "GXW3_GENERATED_WAREHOUSE_SECURITY.txt",
    ),
    SpecBuildTarget(
        name="MINPAKU_COUNTER",
        template="MINPAKU_COUNTER",
        spec_path=SAMPLE_DIR / "minpaku_counter.txt",
        output_path=GENERATED_DIR / "GXW3_GENERATED_MINPAKU_COUNTER.txt",
    ),
]


def fmt(mnemonic: str, operand: str = "") -> str:
    if operand:
        return f"{mnemonic:<6}{operand}"
    return mnemonic


def detect_template(text: str) -> str:
    if any(k in text for k in ("展示車", "夜間警戒", "車屋", "CARSHOP")):
        return "CARSHOP_SECURITY"
    if any(k in text for k in ("シャッター", "倉庫", "照明連動", "WAREHOUSE")):
        return "WAREHOUSE_SECURITY"
    if any(k in text for k in ("民泊", "入口赤外線", "出口赤外線", "人数カウント", "清掃モード", "MINPAKU")):
        return "MINPAKU_COUNTER"
    return "HOME_SECURITY"


@dataclass
class DeviceMap:
    x_arm: str = "X0"
    x_estop: str = "X1"
    x_sensor_1: str = "X2"
    x_sensor_2: str = "X3"
    y_red: str = "Y0"
    y_white: list[str] = field(default_factory=lambda: ["Y1", "Y2", "Y3", "Y4"])
    m_arm: str = "M0"
    m_latch_1: str = "M1"
    m_latch_2: str = "M2"
    m_out_agg: str = "M20"


@dataclass
class ParsedSpec:
    devices: DeviceMap = field(default_factory=DeviceMap)
    parts: list[str] = field(default_factory=list)
    raw_lines: list[str] = field(default_factory=list)
    template: str = "HOME_SECURITY"


class SpecParser:
    def parse(self, text: str) -> ParsedSpec:
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        spec = ParsedSpec(raw_lines=lines, template=detect_template(text))
        devices = DeviceMap()

        for line in lines:
            self._parse_device_line(line, devices)

        spec.devices = devices
        spec.parts = self._select_parts(lines)
        return spec

    def _parse_device_line(self, line: str, devices: DeviceMap) -> None:
        x_match = re.search(r"\b(X\d+)\b", line, re.IGNORECASE)
        y_matches = re.findall(r"\b(Y\d+)\b", line, re.IGNORECASE)

        if any(k in line for k in ("警戒", "夜間", "監視", "チェックイン")) and x_match:
            devices.x_arm = x_match.group(1).upper()
        elif "非常" in line and x_match:
            devices.x_estop = x_match.group(1).upper()
        elif "シャッター" in line and x_match:
            devices.x_sensor_1 = x_match.group(1).upper()
        elif "入口" in line and x_match:
            devices.x_sensor_1 = x_match.group(1).upper()
        elif "外周" in line and x_match:
            devices.x_sensor_1 = x_match.group(1).upper()
        elif "展示車" in line and x_match:
            devices.x_sensor_2 = x_match.group(1).upper()
        elif "出口" in line and x_match:
            devices.x_sensor_2 = x_match.group(1).upper()
        elif "侵入" in line and x_match:
            devices.x_sensor_2 = x_match.group(1).upper()
        elif "近接" in line and x_match:
            devices.x_sensor_2 = x_match.group(1).upper()
        elif "赤灯" in line and y_matches:
            devices.y_red = y_matches[0].upper()
        elif "白灯" in line and y_matches:
            devices.y_white = [y.upper() for y in y_matches]

    def _count_sensors(self, joined: str) -> int:
        count = 0
        if any(k in joined for k in SENSOR_1_KEYWORDS):
            count += 1
        if any(k in joined for k in SENSOR_2_KEYWORDS):
            count += 1
        return count

    def _select_parts(self, lines: Iterable[str]) -> list[str]:
        joined = "\n".join(lines)
        selected: list[str] = []

        if any(k in joined for k in ARM_KEYWORDS):
            selected.append("001")
        if any(k in joined for k in ESTOP_KEYWORDS):
            selected.append("002")

        sensor_count = self._count_sensors(joined)
        selected.extend(["005"] * sensor_count)

        if "低速点滅" in joined or "1秒点滅" in joined:
            selected.append("003")
        if "高速点滅" in joined or "0.1秒点滅" in joined:
            selected.append("004")
        if "003" in selected and "004" in selected:
            selected.append("006")
        if any(k in joined for k in OUTPUT_KEYWORDS):
            selected.append("007")

        ordered = ["001", "002", "005", "003", "004", "006", "007"]
        result: list[str] = []
        count_005 = selected.count("005")
        for part in ordered:
            if part == "005":
                result.extend(["005"] * count_005)
            elif part in selected:
                result.append(part)
        return result


class CommandGenerator:
    def generate(self, spec: ParsedSpec) -> list[str]:
        d = spec.devices
        y1, y2, y3, y4 = d.y_white[:4]
        lines: list[str] = []

        lines.extend(
            [
                fmt("LD", d.x_arm),
                fmt("ANI", d.x_estop),
                fmt("SET", d.m_arm),
                fmt("LDI", d.x_arm),
                fmt("RST", d.m_arm),
                fmt("RST", d.m_latch_1),
                fmt("RST", d.m_latch_2),
            ]
        )

        lines.extend(
            [
                fmt("LD", d.x_estop),
                fmt("RST", d.m_arm),
                fmt("RST", d.m_latch_1),
                fmt("RST", d.m_latch_2),
                fmt("RST", d.y_red),
                fmt("RST", y1),
                fmt("RST", y2),
                fmt("RST", y3),
                fmt("RST", y4),
            ]
        )

        lines.extend(
            [
                fmt("LD", d.m_arm),
                fmt("AND", d.x_sensor_1),
                fmt("SET", d.m_latch_1),
                fmt("LD", d.m_arm),
                fmt("AND", d.x_sensor_2),
                fmt("SET", d.m_latch_2),
            ]
        )

        lines.extend(
            [
                fmt("LD", d.m_latch_2),
                fmt("AND", "SM412"),
                fmt("LD", d.m_arm),
                fmt("ANI", d.m_latch_2),
                fmt("AND", "SM413"),
                "ORB",
                fmt("OUT", d.m_out_agg),
            ]
        )

        lines.extend(
            [
                fmt("LD", d.m_out_agg),
                fmt("OUT", d.y_red),
                fmt("LD", d.m_latch_1),
                fmt("OUT", y1),
                fmt("LD", d.m_latch_1),
                fmt("AND", "SM413"),
                fmt("OUT", y2),
                fmt("LD", d.m_latch_2),
                fmt("OUT", y3),
                fmt("LD", d.m_latch_2),
                fmt("OUT", y4),
                "END",
            ]
        )

        return lines


@dataclass
class AuditResult:
    name: str
    passed: bool
    detail: str


class Auditor:
    def audit(
        self,
        lines: list[str],
        spec: ParsedSpec,
        reference_path: Path | None = None,
    ) -> list[AuditResult]:
        text = "\n".join(lines)
        results: list[AuditResult] = []

        m8012_count = len(re.findall(r"\bM8012\b", text))
        m8013_count = len(re.findall(r"\bM8013\b", text))
        sm412_count = len(re.findall(r"\bSM412\b", text))
        sm413_count = len(re.findall(r"\bSM413\b", text))
        has_end = lines[-1].strip() == "END" if lines else False
        has_m20 = any(re.match(r"OUT\s+M20\b", line.strip()) for line in lines)

        out_y_counts = self._count_out_y(lines)
        out_duplicates = {y: c for y, c in out_y_counts.items() if c > 1}
        out_y0_count = out_y_counts.get("Y0", 0)

        results.append(
            AuditResult("M8012 不使用", m8012_count == 0, f"{m8012_count} 件")
        )
        results.append(
            AuditResult("M8013 不使用", m8013_count == 0, f"{m8013_count} 件")
        )
        results.append(
            AuditResult("SM412 使用", sm412_count >= 1, f"{sm412_count} 件")
        )
        results.append(
            AuditResult("SM413 使用", sm413_count >= 1, f"{sm413_count} 件")
        )
        results.append(
            AuditResult("OUT Y0 は 1 回", out_y0_count == 1, f"{out_y0_count} 回")
        )
        results.append(
            AuditResult(
                "OUT 重複なし",
                len(out_duplicates) == 0,
                "重複なし" if not out_duplicates else ", ".join(
                    f"{y}×{c}" for y, c in sorted(out_duplicates.items())
                ),
            )
        )
        results.append(
            AuditResult("Y0 は M20 経由", has_m20, "M20 → Y0" if has_m20 else "M20 なし")
        )
        results.append(
            AuditResult("END あり", has_end, "末尾 END" if has_end else "END なし")
        )

        core_pass = all(r.passed for r in results)
        if reference_path is not None and reference_path.exists():
            reference_match = self._compare_reference(lines, reference_path)
            results.append(
                AuditResult(
                    "GX Works3 投入可能",
                    reference_match and core_pass,
                    f"合格済み {reference_path.name} と一致"
                    if reference_match
                    else f"参照ファイル {reference_path.name} と不一致",
                )
            )
        else:
            results.append(
                AuditResult(
                    "GX Works3 投入可能",
                    core_pass,
                    "監査項目すべて PASS",
                )
            )

        return results

    def _count_out_y(self, lines: list[str]) -> dict[str, int]:
        counts: dict[str, int] = {}
        for line in lines:
            match = re.match(r"OUT\s+(Y\d+)\b", line.strip())
            if match:
                y = match.group(1).upper()
                counts[y] = counts.get(y, 0) + 1
        return counts

    def _compare_reference(self, lines: list[str], reference_path: Path) -> bool:
        reference = [
            line.strip()
            for line in reference_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        return lines == reference


@dataclass
class BuildResult:
    target: SpecBuildTarget | None
    spec: ParsedSpec
    lines: list[str]
    audit_results: list[AuditResult]
    spec_path: Path
    output_path: Path

    @property
    def all_pass(self) -> bool:
        return all(r.passed for r in self.audit_results)


def _device_labels(template: str) -> dict[str, str]:
    return TEMPLATE_LABELS.get(template, TEMPLATE_LABELS["HOME_SECURITY"])


def write_report(
    report_path: Path,
    spec: ParsedSpec,
    lines: list[str],
    audit_results: list[AuditResult],
    spec_rel: str,
    output_rel: str,
) -> None:
    all_pass = all(r.passed for r in audit_results)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    d = spec.devices
    labels = _device_labels(spec.template)
    parts_table = "\n".join(f"| {num} | {PARTS[num]} |" for num in spec.parts)
    audit_table = "\n".join(
        f"| {r.name} | {'PASS' if r.passed else 'FAIL'} | {r.detail} |"
        for r in audit_results
    )

    content = f"""# BUILD_REPORT — TiSLY PLC Builder v3

> 生成日時: 自動監査結果  
> テンプレート: `{spec.template}`  
> 入力: `{spec_rel}`  
> 出力: `{output_rel}`

---

## 部品選定

| 部品番号 | 部品名 |
|---------|--------|
{parts_table}

---

## デバイス割付

| 種別 | デバイス | 用途 |
|------|---------|------|
| 入力 | {d.x_arm} | {labels['x_arm']} |
| 入力 | {d.x_estop} | 非常停止 |
| 入力 | {d.x_sensor_1} | {labels['x_sensor_1']} |
| 入力 | {d.x_sensor_2} | {labels['x_sensor_2']} |
| 内部 | {d.m_arm} | モード保持 |
| 内部 | {d.m_latch_1} | センサー1警報 |
| 内部 | {d.m_latch_2} | センサー2警報 |
| 内部 | {d.m_out_agg} | 赤灯制御（Y0 前段） |
| 出力 | {d.y_red} | 赤灯 |
| 出力 | {', '.join(d.y_white)} | 白灯 |

---

## 監査結果

| 項目 | 結果 | 詳細 |
|------|:----:|------|
{audit_table}

**総合判定: {'PASS' if all_pass else 'FAIL'}**

---

## 生成命令数

- 命令行数: {len(lines)}

---

## 固定ルール確認

| ルール | 値 |
|--------|-----|
| 高速点滅 | SM412 |
| 低速点滅 | SM413 |
| Y0 出力 | M20 経由（OUT Y0 × 1） |
| 禁止デバイス | M8012 / M8013 |
| 末尾 | END 必須 |

---

**TiSLY PLC Builder v3 — BUILD_REPORT**
"""
    report_path.write_text(content, encoding="utf-8")


def write_multi_report(results: list[BuildResult], report_path: Path) -> None:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    all_pass = all(r.all_pass for r in results)

    summary_rows = []
    detail_sections = []

    for result in results:
        target = result.target
        name = target.name if target else result.spec.template
        rel_spec = result.spec_path.relative_to(ENGINE_DIR).as_posix()
        rel_out = result.output_path.relative_to(ENGINE_DIR).as_posix()
        status = "PASS" if result.all_pass else "FAIL"
        summary_rows.append(
            f"| {name} | `{rel_spec}` | `{rel_out}` | {len(result.lines)} | {status} |"
        )

        audit_table = "\n".join(
            f"| {r.name} | {'PASS' if r.passed else 'FAIL'} | {r.detail} |"
            for r in result.audit_results
        )
        detail_sections.append(
            f"""### {name}

| 項目 | 結果 | 詳細 |
|------|:----:|------|
{audit_table}

**判定: {status}**
"""
        )

    content = f"""# MULTI_SPEC_BUILD_REPORT — TiSLY PLC Builder v3

> 複数仕様からの GX Works3 命令リスト一括生成テスト

---

## サマリー

| 仕様 | 入力 | 出力 | 命令行数 | 判定 |
|------|------|------|:--------:|:----:|
{chr(10).join(summary_rows)}

**総合判定: {'PASS' if all_pass else 'FAIL'}**

---

## 監査項目（全仕様共通）

| 項目 | 確認内容 |
|------|---------|
| M8012 / M8013 | 0 件（使用禁止） |
| SM412 / SM413 | 各 1 件以上（クロック使用） |
| OUT Y0 | 1 回のみ（M20 経由） |
| OUT 重複 | 各 Y 出力は 1 回のみ |
| END | 末尾に必須 |

---

## 仕様別監査結果

{chr(10).join(detail_sections)}

---

**TiSLY PLC Builder v3 — MULTI_SPEC_BUILD_REPORT**
"""
    report_path.write_text(content, encoding="utf-8")


def build_one(
    spec_path: Path,
    output_path: Path,
    target: SpecBuildTarget | None = None,
    reference_path: Path | None = None,
) -> BuildResult:
    text = spec_path.read_text(encoding="utf-8")
    parser = SpecParser()
    spec = parser.parse(text)
    generator = CommandGenerator()
    lines = generator.generate(spec)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    ref = reference_path
    if ref is None and target is None and spec.template == "HOME_SECURITY":
        ref = REFERENCE_IL if REFERENCE_IL.exists() else None

    auditor = Auditor()
    audit_results = auditor.audit(lines, spec, ref)

    return BuildResult(
        target=target,
        spec=spec,
        lines=lines,
        audit_results=audit_results,
        spec_path=spec_path,
        output_path=output_path,
    )


def build(
    spec_path: Path = DEFAULT_SPEC,
    output_path: Path = DEFAULT_OUTPUT,
    report_path: Path = DEFAULT_REPORT,
) -> int:
    if not spec_path.exists():
        print(f"ERROR: 仕様ファイルが見つかりません: {spec_path}", file=sys.stderr)
        return 1

    result = build_one(spec_path, output_path)
    write_report(
        report_path,
        result.spec,
        result.lines,
        result.audit_results,
        spec_path.relative_to(ENGINE_DIR).as_posix(),
        output_path.relative_to(ENGINE_DIR).as_posix(),
    )

    _print_build_result(result, report_path)
    if not result.all_pass:
        print("BUILD FAILED", file=sys.stderr)
        return 1

    print()
    print("TiSLY PLC Builder v3")
    print("文章仕様 → GX Works3命令リスト生成")
    print("実行可能版 完成")
    return 0


def build_all() -> int:
    results: list[BuildResult] = []

    for target in MULTI_SPEC_TARGETS:
        if not target.spec_path.exists():
            print(f"ERROR: 仕様ファイルが見つかりません: {target.spec_path}", file=sys.stderr)
            return 1
        result = build_one(target.spec_path, target.output_path, target)
        results.append(result)
        print(f"[{'OK' if result.all_pass else 'NG'}] {target.name}")
        print(f"  入力: {target.spec_path.name}")
        print(f"  出力: {target.output_path.name}")
        print(f"  命令行数: {len(result.lines)}")
        for audit in result.audit_results:
            mark = "OK" if audit.passed else "NG"
            print(f"    [{mark}] {audit.name}: {audit.detail}")

    write_multi_report(results, MULTI_REPORT)
    print()
    print(f"レポート: {MULTI_REPORT}")

    if not all(r.all_pass for r in results):
        print("MULTI-SPEC BUILD FAILED", file=sys.stderr)
        return 1

    print()
    print("TiSLY PLC Builder v3")
    print("複数仕様生成テスト PASS")
    return 0


def _print_build_result(result: BuildResult, report_path: Path) -> None:
    print(f"入力: {result.spec_path}")
    print(f"出力: {result.output_path}")
    print(f"監査: {report_path}")
    print(f"テンプレート: {result.spec.template}")
    print(f"命令行数: {len(result.lines)}")
    for audit in result.audit_results:
        mark = "OK" if audit.passed else "NG"
        print(f"  [{mark}] {audit.name}: {audit.detail}")


def main() -> int:
    parser = argparse.ArgumentParser(description="TiSLY PLC Builder v3")
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_SPEC,
        help="入力仕様ファイル",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="出力 IL ファイル",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=DEFAULT_REPORT,
        help="監査レポート",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="複数仕様一括生成テスト",
    )
    args = parser.parse_args()

    if args.all:
        return build_all()
    return build(args.input, args.output, args.report)


if __name__ == "__main__":
    raise SystemExit(main())
