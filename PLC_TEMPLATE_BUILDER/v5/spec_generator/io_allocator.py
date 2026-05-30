#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.3 — I/O 自動割付
自然文から機器数量を抽出し、X/Y デバイスを連番割付する。
"""

from __future__ import annotations

import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

V5_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(V5_DIR))

from SPEC_GENERATOR import (  # noqa: E402
    CustomerInfo,
    EstimateInput,
    IOAssignment,
    IOEntry,
    build_internal_spec_lines,
)

# 機器キーワード → (属性名, 表示名プレフィックス, カテゴリ)
INPUT_PATTERNS: list[tuple[str, str, str, str]] = [
    (r"警戒(?:スイッチ)?", "arm_switch", "警戒スイッチ", "system"),
    (r"夜間(?:警戒|監視)", "night_arm", "夜間警戒", "system"),
    (r"非常(?:停止|停止ボタン|停止スイッチ)?", "estop", "非常停止", "safety"),
    (r"赤外線|赤外線センサー|ビームセンサー", "infrared", "赤外線", "赤外線"),
    (r"人感(?:センサー)?|pir|近接(?:センサー)?", "pir", "PIR", "PIR"),
    (r"マグネット|ドアセンサー", "magnet", "マグネット", "マグネット"),
    (r"シャッター(?:開閉)?(?:センサー)?", "shutter", "シャッター", "赤外線"),
    (r"安全カーテン", "safety_curtain", "安全カーテン", "赤外線"),
    (r"入口(?:赤外線)?", "entrance", "入口赤外線", "赤外線"),
    (r"出口(?:赤外線)?", "exit", "出口赤外線", "PIR"),
    (r"清掃(?:モード)?", "cleaning", "清掃モード", "system"),
    (r"チェックイン", "checkin", "チェックイン", "system"),
    (r"ライン起動|起動(?:スイッチ)?", "line_start", "ライン起動", "system"),
    (r"設備異常(?:入力)?", "equipment_fault", "設備異常", "PIR"),
    (r"侵入(?:センサー)?", "intrusion", "侵入センサー", "PIR"),
]

OUTPUT_PATTERNS: list[tuple[str, str, str, str]] = [
    (r"パトライト|回転灯|警報(?:ランプ|灯)", "patlite", "パトライト", "パトライト"),
    (r"白色?\s*led|白(?:色)?灯|led|照明(?:連動)?", "white_led", "白灯", "zone"),
    (r"ブザー|警報(?:音|ブザー)", "buzzer", "ブザー", "alarm"),
    (r"満室(?:表示)?", "full_sign", "満室表示", "パトライト"),
    (r"搬送停止", "conveyor_stop", "搬送停止", "zone"),
    (r"安全警告灯", "warning_light", "安全警告灯", "zone"),
]


@dataclass
class DeviceQuantities:
    """自然文から抽出した機器数量。"""

    raw_text: str = ""
    purpose: str = ""
    project_name: str = ""
    counts: dict[str, int] = field(default_factory=dict)
    input_labels: dict[str, list[str]] = field(default_factory=dict)
    output_labels: dict[str, list[str]] = field(default_factory=dict)

    @property
    def input_count(self) -> int:
        return sum(v for k, v in self.counts.items() if k in _INPUT_KEYS)

    @property
    def output_count(self) -> int:
        return sum(v for k, v in self.counts.items() if k in _OUTPUT_KEYS)

    def to_estimate(self) -> EstimateInput:
        return EstimateInput(
            arm_switch=self.counts.get("arm_switch", 0) + self.counts.get("night_arm", 0),
            infrared=(
                self.counts.get("infrared", 0)
                + self.counts.get("shutter", 0)
                + self.counts.get("safety_curtain", 0)
                + self.counts.get("entrance", 0)
            ),
            pir=(
                self.counts.get("pir", 0)
                + self.counts.get("exit", 0)
                + self.counts.get("intrusion", 0)
                + self.counts.get("equipment_fault", 0)
            ),
            magnet=self.counts.get("magnet", 0),
            estop=self.counts.get("estop", 0),
            patlite=self.counts.get("patlite", 0) + self.counts.get("full_sign", 0),
            buzzer=self.counts.get("buzzer", 0),
        )


_INPUT_KEYS = {
    "arm_switch", "night_arm", "estop", "infrared", "pir", "magnet",
    "shutter", "safety_curtain", "entrance", "exit", "cleaning",
    "checkin", "line_start", "equipment_fault", "intrusion",
}
_OUTPUT_KEYS = {
    "patlite", "white_led", "buzzer", "full_sign", "conveyor_stop", "warning_light",
}


def normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    normalized = re.sub(r"\s+", " ", normalized).strip().lower()
    return normalized


def _extract_count(normalized: str, pattern: str) -> int:
    """「赤外線4本」「PIR2台」等から数量を抽出。未指定時は 1。"""
    regex = rf"(?:{pattern})\s*(\d+)\s*(?:本|台|個|点|回路|ch)?"
    match = re.search(regex, normalized, re.IGNORECASE)
    if match:
        return max(1, int(match.group(1)))
    if re.search(rf"(?:{pattern})", normalized, re.IGNORECASE):
        return 1
    return 0


def _extract_purpose(text: str) -> str:
    lines = [ln.strip() for ln in text.strip().splitlines() if ln.strip()]
    return lines[0] if lines else text.strip()


def _guess_project_name(text: str, purpose: str) -> str:
    normalized = normalize_text(text)
    if "車屋" in text or "展示" in text or "カーショップ" in text:
        return "CARSHOP_NIGHT_WATCH"
    if "倉庫" in text or "物流" in text:
        return "WAREHOUSE_SECURITY"
    if "民泊" in text:
        return "MINPAKU_COUNTER"
    if "工場" in text or "ライン" in text:
        return "FACTORY_SAFETY"
    if "自宅" in text or "住宅" in text:
        return "HOME_SECURITY"
    short = re.sub(r"[^\w\u3040-\u30ff\u4e00-\u9fff]+", "_", purpose[:30]).strip("_")
    return short.upper() or "PLC_PROJECT"


def parse_devices_from_text(text: str) -> DeviceQuantities:
    """自然文から機器数量を抽出する。"""
    normalized = normalize_text(text)
    purpose = _extract_purpose(text)
    quantities = DeviceQuantities(
        raw_text=text,
        purpose=purpose,
        project_name=_guess_project_name(text, purpose),
    )

    for pattern, key, _label, _cat in INPUT_PATTERNS:
        count = _extract_count(normalized, pattern)
        if count > 0:
            quantities.counts[key] = quantities.counts.get(key, 0) + count

    for pattern, key, _label, _cat in OUTPUT_PATTERNS:
        count = _extract_count(normalized, pattern)
        if count > 0:
            quantities.counts[key] = quantities.counts.get(key, 0) + count

    return quantities


def _label_for_index(prefix: str, index: int, total: int) -> str:
    if total == 1:
        return prefix
    return f"{prefix}{index + 1}"


def allocate_io_from_quantities(
    quantities: DeviceQuantities,
    customer: CustomerInfo | None = None,
    *,
    include_system_inputs: bool = True,
    device_only: bool = False,
) -> IOAssignment:
    """
    機器数量から I/O を連番割付する。

    device_only=True の場合、明示された機器のみ割付（例: 赤外線4 → X0〜X3）。
    include_system_inputs=True の場合、夜間警戒・非常停止を先頭に追加。
    """
    customer = customer or CustomerInfo(site=quantities.project_name)
    assignment = IOAssignment(customer=customer, estimate=quantities.to_estimate())
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

    counts = quantities.counts

    if not device_only and include_system_inputs:
        if counts.get("night_arm", 0) > 0 or "夜間" in quantities.raw_text:
            add_input("夜間警戒", "system")
        elif counts.get("arm_switch", 0) > 0:
            add_input("警戒スイッチ", "system")
        elif any(k in counts for k in ("infrared", "pir", "intrusion")):
            if "夜間" in quantities.raw_text or "警戒" in quantities.raw_text:
                add_input("夜間警戒", "system")
            else:
                add_input("警戒スイッチ", "system")

        estop_count = counts.get("estop", 0)
        if estop_count == 0 and include_system_inputs:
            estop_count = 1
        for i in range(estop_count):
            add_input(_label_for_index("非常停止", i, estop_count), "safety")

    # 入力: 赤外線系
    ir_total = (
        counts.get("infrared", 0)
        + counts.get("shutter", 0)
        + counts.get("safety_curtain", 0)
        + counts.get("entrance", 0)
    )
    ir_names = ["外周センサー", "赤外線2", "赤外線3", "赤外線4"]
    for i in range(ir_total):
        name = ir_names[i] if i < len(ir_names) else f"赤外線{i + 1}"
        if counts.get("entrance", 0) > 0 and i == 0:
            name = "入口赤外線"
        elif counts.get("shutter", 0) > 0 and i == 0:
            name = "シャッター開閉センサー"
        elif counts.get("safety_curtain", 0) > 0 and i == 0:
            name = "安全カーテン"
        add_input(name, "赤外線")

    # 入力: PIR 系
    pir_total = (
        counts.get("pir", 0)
        + counts.get("exit", 0)
        + counts.get("intrusion", 0)
        + counts.get("equipment_fault", 0)
    )
    pir_names = ["近接センサー", "PIR2", "PIR3", "PIR4"]
    for i in range(pir_total):
        name = pir_names[i] if i < len(pir_names) else f"PIR{i + 1}"
        if counts.get("exit", 0) > 0 and i == 0:
            name = "出口赤外線"
        elif counts.get("intrusion", 0) > 0 and i == 0:
            name = "侵入センサー"
        elif counts.get("equipment_fault", 0) > 0 and i == 0:
            name = "設備異常入力"
        add_input(name, "PIR")

    for i in range(counts.get("magnet", 0)):
        add_input(_label_for_index("マグネット", i, counts.get("magnet", 0)), "マグネット")

    if not device_only and include_system_inputs:
        for i in range(counts.get("cleaning", 0)):
            add_input("清掃モード", "system")
        for i in range(counts.get("checkin", 0)):
            add_input("チェックイン完了", "system")
        for i in range(counts.get("line_start", 0)):
            add_input("ライン起動", "system")

    # 出力
    patlite_count = counts.get("patlite", 0) + counts.get("full_sign", 0)
    if patlite_count > 0:
        for i in range(patlite_count):
            if counts.get("full_sign", 0) > 0 and i == 0:
                add_output("満室表示", "パトライト")
            else:
                add_output("赤灯" if i == 0 else f"パトライト{i + 1}", "パトライト")

    white_count = counts.get("white_led", 0)
    if white_count == 0 and not device_only:
        white_count = min(max(ir_total + pir_total, 2), 4)
    for i in range(white_count):
        add_output(f"白灯{i + 1}", "zone")

    for i in range(counts.get("buzzer", 0)):
        add_output(_label_for_index("ブザー", i, counts.get("buzzer", 0)), "alarm")
    for i in range(counts.get("conveyor_stop", 0)):
        add_output("搬送停止", "zone")
    for i in range(counts.get("warning_light", 0)):
        add_output("安全警告灯", "zone")

    assignment.raw_lines = _build_spec_lines_from_assignment(assignment, quantities)
    return assignment


def _build_spec_lines_from_assignment(
    assignment: IOAssignment,
    quantities: DeviceQuantities,
) -> list[str]:
    """GX 生成用の内部仕様行を構築。"""
    lines: list[str] = []
    arm = next(
        (e for e in assignment.inputs if e.name in ("警戒スイッチ", "夜間警戒", "ライン起動", "チェックイン完了")),
        None,
    )
    estop = next((e for e in assignment.inputs if "非常" in e.name), None)
    sensor1 = next(
        (
            e for e in assignment.inputs
            if e.category == "赤外線" or "外周" in e.name or "入口" in e.name or "シャッター" in e.name or "安全カーテン" in e.name
        ),
        None,
    )
    sensor2 = next(
        (
            e for e in assignment.inputs
            if e.category == "PIR" or "近接" in e.name or "侵入" in e.name or "設備異常" in e.name or "出口" in e.name
        ),
        None,
    )
    red = next((e for e in assignment.outputs if e.name in ("赤灯", "パトライト", "満室表示", "警報ランプ")), None)
    whites = [e.device for e in assignment.outputs if e.name.startswith("白灯")]

    if arm:
        label = "夜間警戒" if arm.name == "夜間警戒" else "警戒スイッチ"
        if arm.name == "ライン起動":
            label = "ライン起動"
        lines.append(f"{label} {arm.device}")
    if estop:
        lines.append(f"非常停止 {estop.device}")
    if sensor1:
        s1_label = "外周センサー" if sensor1.category == "赤外線" else sensor1.name
        lines.append(f"{s1_label} {sensor1.device}")
    if sensor2:
        s2_label = "近接センサー" if sensor2.category == "PIR" else sensor2.name
        lines.append(f"{s2_label} {sensor2.device}")
    if red:
        lines.append(f"赤灯 {red.device}")
    if whites:
        lines.append(f"白灯 {' '.join(whites)}")

    if arm and arm.name == "夜間警戒":
        lines.append("夜間警戒中は赤灯を低速点滅")
    elif arm:
        lines.append("警戒中は赤灯を低速点滅")

    if sensor1:
        lines.append("外周検知で白灯1点灯、白灯2低速点滅")
    if sensor2:
        lines.append("近接検知で白灯3白灯4点灯、赤灯高速点滅")
    if estop:
        lines.append("非常停止で全OFF")

    if not lines:
        lines = build_internal_spec_lines(assignment)

    return lines


def format_io_allocation_summary(assignment: IOAssignment) -> str:
    """I/O 割付サマリーをテキストで返す。"""
    rows = [f"{e.device}: {e.name} ({e.io_type})" for e in assignment.entries]
    return "\n".join(rows)
