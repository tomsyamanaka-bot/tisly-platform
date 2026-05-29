#!/usr/bin/env python3
"""TiSLY PLC Builder v4 — I/O 割付表生成"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from pathlib import Path

INPUT_RULES: list[tuple[tuple[str, ...], str]] = [
    (("警戒", "警備", "セレクタ"), "警戒スイッチ"),
    (("非常停止", "緊急停止", "E-STOP", "非常"), "非常停止"),
    (("外周", "シャッター"), "外周センサー"),
    (("近接", "侵入", "展示車"), "近接センサー"),
]

OUTPUT_RED_KEYWORDS = ("赤灯", "赤ランプ", "赤ライト")
OUTPUT_WHITE_KEYWORD = "白灯"


@dataclass
class IOEntry:
    device: str
    name: str
    io_type: str


@dataclass
class IOAssignment:
    entries: list[IOEntry] = field(default_factory=list)
    raw_lines: list[str] = field(default_factory=list)

    @property
    def inputs(self) -> list[IOEntry]:
        return [e for e in self.entries if e.io_type == "Input"]

    @property
    def outputs(self) -> list[IOEntry]:
        return [e for e in self.entries if e.io_type == "Output"]


def _extract_white_count(line: str) -> int:
    match = re.search(r"白灯\s*(\d+)\s*回路", line)
    if match:
        return int(match.group(1))
    match = re.search(r"白灯\s*(\d+)", line)
    if match:
        return int(match.group(1))
    if "4回路" in line or "４回路" in line:
        return 4
    return 4


def _match_input(line: str) -> str | None:
    for keywords, label in INPUT_RULES:
        if any(k in line for k in keywords):
            return label
    return None


def _next_device(prefix: str, index: int) -> str:
    return f"{prefix}{index}"


def parse_spec(text: str) -> IOAssignment:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    assignment = IOAssignment(raw_lines=lines)

    x_index = 0
    y_index = 0
    seen_inputs: set[str] = set()
    seen_outputs: set[str] = set()

    for line in lines:
        explicit_x = re.search(r"\b(X\d+)\b", line, re.IGNORECASE)
        explicit_y = re.findall(r"\b(Y\d+)\b", line, re.IGNORECASE)

        if any(k in line for k in OUTPUT_RED_KEYWORDS):
            device = explicit_y[0].upper() if explicit_y else _next_device("Y", y_index)
            if device not in seen_outputs:
                assignment.entries.append(IOEntry(device, "赤灯", "Output"))
                seen_outputs.add(device)
                y_index = max(y_index, int(device[1:]) + 1)
            continue

        if OUTPUT_WHITE_KEYWORD in line:
            count = _extract_white_count(line)
            if explicit_y:
                for i, dev in enumerate(explicit_y[:count]):
                    dev = dev.upper()
                    if dev not in seen_outputs:
                        assignment.entries.append(
                            IOEntry(dev, f"白灯{i + 1}", "Output")
                        )
                        seen_outputs.add(dev)
                y_index = max(y_index, int(explicit_y[-1][1:]) + 1)
            else:
                for i in range(count):
                    device = _next_device("Y", y_index)
                    assignment.entries.append(
                        IOEntry(device, f"白灯{i + 1}", "Output")
                    )
                    seen_outputs.add(device)
                    y_index += 1
            continue

        label = _match_input(line)
        if label and label not in seen_inputs:
            device = explicit_x.group(1).upper() if explicit_x else _next_device("X", x_index)
            assignment.entries.append(IOEntry(device, label, "Input"))
            seen_inputs.add(label)
            x_index = max(x_index, int(device[1:]) + 1)

    return assignment


def generate_csv(assignment: IOAssignment) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["Device", "Name", "Type"])
    for entry in assignment.entries:
        writer.writerow([entry.device, entry.name, entry.io_type])
    return buffer.getvalue()


def write_io_assignment(path: Path, assignment: IOAssignment) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(generate_csv(assignment), encoding="utf-8")
