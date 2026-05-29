#!/usr/bin/env python3
"""TiSLY PLC Builder v4 — ASCII 配線図生成"""

from __future__ import annotations

from pathlib import Path

from io_generator import IOAssignment, IOEntry

INPUT_LABELS: dict[str, str] = {
    "警戒スイッチ": "警戒SW",
    "非常停止": "E-STOP",
    "外周センサー": "外周ビーム",
    "近接センサー": "近接ビーム",
}


def _input_wire_label(entry: IOEntry) -> str:
    return INPUT_LABELS.get(entry.name, entry.name)


def _output_wire_line(entry: IOEntry) -> str:
    if entry.name == "赤灯":
        return f"{entry.device} ---- 赤灯24V"
    if entry.name.startswith("白灯"):
        relay_num = entry.name.replace("白灯", "")
        return f"{entry.device} ---- リレー{relay_num} ---- 白灯100V"
    return f"{entry.device} ---- {entry.name}"


def generate_wiring_diagram(assignment: IOAssignment) -> str:
    input_lines = [
        f"{e.device} ---- {_input_wire_label(e)}" for e in assignment.inputs
    ]
    output_lines = [_output_wire_line(e) for e in assignment.outputs]

    body = "\n".join(input_lines + ([""] if input_lines and output_lines else []) + output_lines)

    return f"""# WIRING_DIAGRAM — TiSLY PLC Builder v4

> ASCII 配線図（FX5UJ / GX Works3）

---

## 入力回路（24V DC）

```
{chr(10).join(input_lines) if input_lines else "(入力なし)"}
```

---

## 出力回路

```
{chr(10).join(output_lines) if output_lines else "(出力なし)"}
```

---

## 配線メモ

| 項目 | 内容 |
|------|------|
| 入力電源 | DC24V（コモン COM） |
| 赤灯 | PLC 出力 Y0 直結 24V ランプ |
| 白灯 | PLC 出力 → 中継リレー → AC100V 照明 |
| 非常停止 | X1 常時 ON（b接点）。OFF で全出力停止 |

---

**TiSLY PLC Builder v4 — WIRING_DIAGRAM**
"""


def write_wiring_diagram(path: Path, assignment: IOAssignment) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(generate_wiring_diagram(assignment), encoding="utf-8")
