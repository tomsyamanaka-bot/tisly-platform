#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.0 — 仕様書生成エンジン
顧客情報 + 見積入力 → I/O 割付 / PROJECT_SPEC.md / 内部仕様テキスト
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

VERSION = "v5.0"

SENSOR_KEYS = ("赤外線", "PIR", "マグネット")
OUTPUT_KEYS = ("パトライト", "ブザー")
SYSTEM_INPUT_KEYS = ("警戒スイッチ", "非常停止")

INPUT_WIRE_LABELS: dict[str, str] = {
    "警戒スイッチ": "警戒SW",
    "非常停止": "E-STOP",
    "赤外線": "赤外線ビーム",
    "PIR": "PIRセンサー",
    "マグネット": "マグネットSW",
}

OUTPUT_WIRE_LABELS: dict[str, str] = {
    "パトライト": "パトライト（赤/黄/緑）",
    "ブザー": "警報ブザー",
    "白灯": "白灯100V",
    "赤灯": "赤灯24V",
}


@dataclass
class CustomerInfo:
    company: str = ""
    site: str = ""
    contact: str = ""
    plc_model: str = "FX5UJ-24MR/ES"


@dataclass
class EstimateInput:
    arm_switch: int = 1
    infrared: int = 0
    pir: int = 0
    magnet: int = 0
    estop: int = 1
    patlite: int = 0
    buzzer: int = 0


@dataclass
class IOEntry:
    device: str
    name: str
    io_type: str
    category: str = ""


@dataclass
class IOAssignment:
    entries: list[IOEntry] = field(default_factory=list)
    raw_lines: list[str] = field(default_factory=list)
    customer: CustomerInfo = field(default_factory=CustomerInfo)
    estimate: EstimateInput = field(default_factory=EstimateInput)

    @property
    def inputs(self) -> list[IOEntry]:
        return [e for e in self.entries if e.io_type == "Input"]

    @property
    def outputs(self) -> list[IOEntry]:
        return [e for e in self.entries if e.io_type == "Output"]


def _parse_key_value_file(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    if not path.is_file():
        return result
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        result[key.strip()] = value.strip()
    return result


def parse_customer_input(path: Path) -> CustomerInfo:
    data = _parse_key_value_file(path)
    return CustomerInfo(
        company=data.get("会社名", ""),
        site=data.get("現場名", ""),
        contact=data.get("担当者", ""),
        plc_model=data.get("PLC型番", "FX5UJ-24MR/ES"),
    )


def parse_estimate_input(path: Path) -> EstimateInput:
    data = _parse_key_value_file(path)

    def _int(key: str, default: int = 0) -> int:
        raw = data.get(key, str(default))
        try:
            return max(0, int(raw))
        except ValueError:
            return default

    return EstimateInput(
        arm_switch=_int("警戒スイッチ", 1),
        infrared=_int("赤外線", 0),
        pir=_int("PIR", 0),
        magnet=_int("マグネット", 0),
        estop=_int("非常停止", 1),
        patlite=_int("パトライト", 0),
        buzzer=_int("ブザー", 0),
    )


def _sanitize_project_name(company: str, site: str) -> str:
    raw = f"{company}_{site}" if company and site else company or site or "PLC_PROJECT"
    sanitized = re.sub(r'[\\/:*?"<>|\s]+', "_", raw).strip("_")
    return sanitized or "PLC_PROJECT"


def allocate_io(customer: CustomerInfo, estimate: EstimateInput) -> IOAssignment:
    """数量入力から I/O デバイスを自動割付する。"""
    assignment = IOAssignment(customer=customer, estimate=estimate)
    x_index = 0
    y_index = 0

    def add_input(name: str, category: str) -> IOEntry:
        nonlocal x_index
        device = f"X{x_index}"
        entry = IOEntry(device, name, "Input", category)
        assignment.entries.append(entry)
        x_index += 1
        return entry

    def add_output(name: str, category: str) -> IOEntry:
        nonlocal y_index
        device = f"Y{y_index}"
        entry = IOEntry(device, name, "Output", category)
        assignment.entries.append(entry)
        y_index += 1
        return entry

    if estimate.arm_switch > 0:
        add_input("警戒スイッチ", "system")

    if estimate.estop > 0:
        for i in range(estimate.estop):
            label = "非常停止" if estimate.estop == 1 else f"非常停止{i + 1}"
            add_input(label, "safety")

    for i in range(estimate.infrared):
        label = "外周センサー" if i == 0 else f"赤外線{i + 1}"
        add_input(label, "赤外線")

    for i in range(estimate.pir):
        label = "近接センサー" if i == 0 else f"PIR{i + 1}"
        add_input(label, "PIR")

    for i in range(estimate.magnet):
        add_input(f"マグネット{i + 1}", "マグネット")

    if estimate.patlite > 0:
        add_output("赤灯", "パトライト")

    white_count = max(estimate.infrared + estimate.pir + estimate.magnet, 0)
    white_count = min(max(white_count, 2), 4)
    for i in range(white_count):
        add_output(f"白灯{i + 1}", "zone")

    if estimate.buzzer > 0:
        for i in range(estimate.buzzer):
            label = "ブザー" if estimate.buzzer == 1 else f"ブザー{i + 1}"
            add_output(label, "alarm")

    assignment.raw_lines = build_internal_spec_lines(assignment)
    return assignment


def build_internal_spec_lines(assignment: IOAssignment) -> list[str]:
    """v4/v3 エンジン互換の仕様行を生成する。"""
    lines: list[str] = []
    for entry in assignment.inputs:
        if entry.name == "警戒スイッチ":
            lines.append(f"警戒スイッチ {entry.device}")
        elif "非常" in entry.name:
            lines.append(f"非常停止 {entry.device}")
        elif "外周" in entry.name or "赤外線" in entry.name:
            lines.append(f"外周センサー {entry.device}")
        elif "近接" in entry.name or "PIR" in entry.name:
            lines.append(f"近接センサー {entry.device}")
        elif "マグネット" in entry.name:
            lines.append(f"近接センサー {entry.device}")
    for entry in assignment.outputs:
        if entry.name == "赤灯":
            lines.append(f"赤灯 {entry.device}")
    white_outputs = [e for e in assignment.outputs if e.name.startswith("白灯")]
    if white_outputs:
        lines.append(f"白灯{len(white_outputs)}回路")
    return lines


def generate_io_csv(assignment: IOAssignment) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["Device", "Name", "Type", "Category"])
    for entry in assignment.entries:
        writer.writerow([entry.device, entry.name, entry.io_type, entry.category])
    return buffer.getvalue()


def _io_table_md(entries: list[IOEntry], title: str) -> str:
    if not entries:
        return f"### {title}\n\n_(なし)_\n"
    rows = ["| デバイス | 名称 | 種別 | カテゴリ |", "|---------|------|------|---------|"]
    for e in entries:
        rows.append(f"| {e.device} | {e.name} | {e.io_type} | {e.category} |")
    return f"### {title}\n\n" + "\n".join(rows) + "\n"


def _wiring_table_md(assignment: IOAssignment) -> str:
    rows = ["| デバイス | 信号名 | 配線先 | 備考 |", "|---------|--------|--------|------|"]
    for e in assignment.inputs:
        wire = INPUT_WIRE_LABELS.get(e.category, INPUT_WIRE_LABELS.get(e.name.split("1")[0], e.name))
        if e.category in SENSOR_KEYS:
            wire = INPUT_WIRE_LABELS.get(e.category, e.name)
        note = "b接点 NC" if "非常" in e.name else "a接点 NO / 24V COM"
        rows.append(f"| {e.device} | {e.name} | {wire} | {note} |")
    for e in assignment.outputs:
        if e.name == "赤灯":
            wire = OUTPUT_WIRE_LABELS["パトライト"]
            note = "24V 直結"
        elif e.name.startswith("白灯"):
            wire = OUTPUT_WIRE_LABELS["白灯"]
            note = "中継リレー経由 AC100V"
        elif "ブザー" in e.name:
            wire = OUTPUT_WIRE_LABELS["ブザー"]
            note = "24V ブザー"
        else:
            wire = e.name
            note = ""
        rows.append(f"| {e.device} | {e.name} | {wire} | {note} |")
    return "\n".join(rows)


def _estimate_summary(estimate: EstimateInput) -> str:
    items = [
        ("警戒スイッチ", estimate.arm_switch),
        ("赤外線", estimate.infrared),
        ("PIR", estimate.pir),
        ("マグネット", estimate.magnet),
        ("非常停止", estimate.estop),
        ("パトライト", estimate.patlite),
        ("ブザー", estimate.buzzer),
    ]
    rows = ["| 機器 | 数量 |", "|------|:----:|"]
    for name, qty in items:
        rows.append(f"| {name} | {qty} |")
    return "\n".join(rows)


def generate_project_spec(assignment: IOAssignment) -> str:
    """PROJECT_SPEC.md を生成する。"""
    c = assignment.customer
    e = assignment.estimate
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    internal_spec = "\n".join(assignment.raw_lines)

    return f"""# PROJECT_SPEC — TiSLY PLC Builder {VERSION}

> 見積入力から自動生成された PLC 仕様書

---

## 1. 案件情報

| 項目 | 内容 |
|------|------|
| 会社名 | {c.company} |
| 現場名 | {c.site} |
| 担当者 | {c.contact} |
| PLC型番 | {c.plc_model} |
| 生成日時 | {now} |
| Builder | TiSLY PLC Builder {VERSION} |

---

## 2. 見積入力一覧

{_estimate_summary(e)}

---

## 3. 入力一覧

| デバイス | 名称 | 種別 | カテゴリ |
|---------|------|------|---------|
""" + (
        "\n".join(
            f"| {e.device} | {e.name} | {e.io_type} | {e.category} |"
            for e in assignment.inputs
        )
        or "| — | — | — | — |"
    ) + f"""

---

## 4. 出力一覧

| デバイス | 名称 | 種別 | カテゴリ |
|---------|------|------|---------|
""" + (
        "\n".join(
            f"| {e.device} | {e.name} | {e.io_type} | {e.category} |"
            for e in assignment.outputs
        )
        or "| — | — | — | — |"
    ) + """

---

## 5. I/O 表

| # | デバイス | 名称 | 種別 | カテゴリ |
|---|---------|------|------|---------|
""" + "\n".join(
        f"| {i + 1} | {e.device} | {e.name} | {e.io_type} | {e.category} |"
        for i, e in enumerate(assignment.entries)
    ) + f"""

---

## 6. 配線表

{_wiring_table_md(assignment)}

---

## 7. 動作仕様

| 条件 | 動作 |
|------|------|
| 警戒スイッチ ON | 警戒モード保持（M0 SET） |
| 非常停止 OFF | 全 M / 全 Y 即時 RST（最優先） |
| 外周センサー（赤外線）ON + 警戒中 | 外周警報ラッチ（M1 SET）→ 白灯1 点灯、白灯2 低速点滅 |
| 近接センサー（PIR/マグネット）ON + 警戒中 | 近接警報ラッチ（M2 SET）→ 白灯3/4 点灯、赤灯高速点滅 |
| 警戒中（M0） | 赤灯（パトライト赤）低速点滅（SM413） |
| 警報発生 | ブザー出力 ON（Y 割付参照） |

### 内部仕様テキスト（GX 生成用）

```
{internal_spec}
```

---

## 8. 安全要件

- 非常停止は常時監視。OFF 時は全出力を即時停止する。
- 点滅クロックは SM412 / SM413 を使用（M8012 / M8013 禁止）。
- Y0（赤灯）は M20 経由の OUT が 1 回のみ（二重コイル禁止）。

---

**TiSLY PLC Builder {VERSION} — PROJECT_SPEC**
"""


def generate_wiring_diagram(assignment: IOAssignment) -> str:
    """WIRING_DIAGRAM.md を生成する。"""
    input_ascii = []
    for e in assignment.inputs:
        if e.category in INPUT_WIRE_LABELS:
            label = INPUT_WIRE_LABELS[e.category]
        elif "非常" in e.name:
            label = INPUT_WIRE_LABELS["非常停止"]
        elif "警戒" in e.name:
            label = INPUT_WIRE_LABELS["警戒スイッチ"]
        else:
            label = e.name
        input_ascii.append(f"{e.device} ---- {label}")

    output_ascii = []
    for e in assignment.outputs:
        if e.name == "赤灯":
            output_ascii.append(f"{e.device} ---- パトライト（赤）24V")
        elif e.name.startswith("白灯"):
            num = e.name.replace("白灯", "")
            output_ascii.append(f"{e.device} ---- リレー{num} ---- 白灯100V")
        elif "ブザー" in e.name:
            output_ascii.append(f"{e.device} ---- 警報ブザー24V")
        else:
            output_ascii.append(f"{e.device} ---- {e.name}")

    c = assignment.customer
    in_block = "\n".join(input_ascii) if input_ascii else "(入力なし)"
    out_block = "\n".join(output_ascii) if output_ascii else "(出力なし)"

    return f"""# WIRING_DIAGRAM — TiSLY PLC Builder {VERSION}

> {c.company} / {c.site} — ASCII 配線図

---

## 入力回路（24V DC）

```
{in_block}
```

---

## 出力回路

```
{out_block}
```

---

## 配線メモ

| 項目 | 内容 |
|------|------|
| PLC | {c.plc_model} |
| 入力電源 | DC24V（コモン COM） |
| 赤外線 / PIR | センサー出力 a接点 → X 入力 |
| マグネット | ドアセンサー b接点 → X 入力 |
| 非常停止 | b接点 NC。OFF で全出力停止 |
| パトライト | Y0 赤 24V 直結（黄/緑は拡張時） |
| ブザー | 24V ブザー直結 |
| 白灯 | 中継リレー経由 AC100V |

---

**TiSLY PLC Builder {VERSION} — WIRING_DIAGRAM**
"""
