#!/usr/bin/env python3
"""GX Works3 実機投入準備 — 自動検証"""

from __future__ import annotations

import re
import sys
from pathlib import Path

DIR = Path(__file__).resolve().parent
GX3 = DIR / "GX3_COMMANDS.txt"
PASTE = DIR / "GX_WORKS3_PASTE_FINAL.txt"
GUIDE = DIR / "GX_WORKS3_WRITE_GUIDE.md"

VALID_OPS = re.compile(
    r"^(LD|LDI|AND|ANI|OR|OUT|SET|RST)\s+\S+$|^(ORB|END)$"
)
DEMO_IO = {
    "X0": "夜間警戒",
    "X1": "非常停止",
    "X2": "外周センサー",
    "X3": "近接センサー（デモ）",
    "Y0": "赤灯",
    "Y1": "白灯1",
    "Y2": "白灯2",
    "Y3": "白灯3",
    "Y4": "白灯4",
}


def load_lines(path: Path) -> list[str]:
    return [ln.strip() for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


def check_paste_format(lines: list[str]) -> tuple[bool, str]:
    for i, line in enumerate(lines, 1):
        if not VALID_OPS.match(line):
            return False, f"行{i}: 不正な命令形式 [{line}]"
    return True, "命令リスト形式 OK"


def main() -> int:
    results: list[tuple[str, bool, str]] = []

    if not GX3.is_file():
        results.append(("GX3_COMMANDS.txt 存在", False, "なし"))
    if not PASTE.is_file():
        results.append(("GX_WORKS3_PASTE_FINAL.txt 存在", False, "なし"))
    if not GUIDE.is_file():
        results.append(("GX_WORKS3_WRITE_GUIDE.md 存在", False, "なし"))

    if not PASTE.is_file():
        _report(results)
        return 1

    paste_lines = load_lines(PASTE)
    text = "\n".join(paste_lines)

    ok_fmt, fmt_detail = check_paste_format(paste_lines)
    results.append(("GX Works3 貼り付け形式", ok_fmt, fmt_detail))

    has_end = bool(paste_lines) and paste_lines[-1] == "END"
    results.append(("END あり", has_end, "末尾 END" if has_end else "END なし"))

    m8012 = len(re.findall(r"\bM8012\b", text))
    m8013 = len(re.findall(r"\bM8013\b", text))
    results.append(("M8012 なし", m8012 == 0, f"{m8012} 件"))
    results.append(("M8013 なし", m8013 == 0, f"{m8013} 件"))

    sm412 = len(re.findall(r"\bSM412\b", text))
    sm413 = len(re.findall(r"\bSM413\b", text))
    results.append(("SM412 使用", sm412 >= 1, f"{sm412} 件"))
    results.append(("SM413 使用", sm413 >= 1, f"{sm413} 件"))

    out_y0 = len(re.findall(r"^OUT\s+Y0\b", text, re.MULTILINE))
    results.append(("OUT Y0 が1回", out_y0 == 1, f"{out_y0} 回"))

    out_counts: dict[str, int] = {}
    for line in paste_lines:
        m = re.match(r"OUT\s+(Y\d+)\b", line)
        if m:
            y = m.group(1)
            out_counts[y] = out_counts.get(y, 0) + 1
    dup = {y: c for y, c in out_counts.items() if c > 1}
    results.append(("Y0 二重コイルなし", out_y0 == 1, "OUT Y0 は1か所"))

    uses_x0 = "X0" in text
    uses_x1 = "X1" in text
    uses_x2 = "X2" in text
    uses_x3_latch = bool(re.search(r"AND\s+X3\b", text))
    uses_y = all(f"Y{i}" in text for i in range(5))
    io_ok = uses_x0 and uses_x1 and uses_x2 and uses_x3_latch and uses_y
    results.append(
        (
            "X0/X1/X2/X3/Y0〜Y4 デモ仕様",
            io_ok,
            "X3=近接ラッチ" if uses_x3_latch else "X3 未使用",
        ),
    )

    forbidden = re.search(r"\b(M8012|M8013|X6|X7)\b", text)
    results.append(("FX5UJ デモ I/O", forbidden is None, "禁止/本番専用デバイスなし"))

    pure = all(
        not ln.startswith("#") and not ln.startswith(";") and "|" not in ln
        for ln in paste_lines
    )
    results.append(("命令のみ（説明・表なし）", pure, "OK" if pure else "余分な行あり"))

    if GUIDE.is_file():
        guide = GUIDE.read_text(encoding="utf-8")
        steps = all(s in guide for s in ("FX5UJ-24MR/ES", "命令入力", "書込", "RUN", "X0", "X2", "X3", "X1"))
        results.append(("WRITE_GUIDE 手順", steps, "10項目含む" if steps else "不足あり"))

    _report(results)
    return 0 if all(r[1] for r in results) else 1


def _report(results: list[tuple[str, bool, str]]) -> None:
    for name, passed, detail in results:
        status = "PASS" if passed else "FAIL"
        print(f"{status}\t{name}\t{detail}")
    if all(r[1] for r in results):
        print()
        print("GX Works3 実機投入準備 PASS")
        print("貼り付けファイル：")
        print("GX_WORKS3_PASTE_FINAL.txt")


if __name__ == "__main__":
    sys.exit(main())
