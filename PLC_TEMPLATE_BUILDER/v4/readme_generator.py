#!/usr/bin/env python3
"""TiSLY PLC Builder v4 — PROJECT README 生成"""

from __future__ import annotations

from pathlib import Path

from io_generator import IOAssignment


def _io_table(assignment: IOAssignment) -> str:
    rows = ["| デバイス | 名称 | 種別 |", "|---------|------|------|"]
    for entry in assignment.entries:
        rows.append(f"| {entry.device} | {entry.name} | {entry.io_type} |")
    return "\n".join(rows)


def generate_readme(assignment: IOAssignment, spec_text: str) -> str:
    spec_block = "\n".join(f"- {line}" for line in assignment.raw_lines)

    return f"""# PROJECT_README — TiSLY PLC Builder v4

> 自動生成プロジェクト README

---

## 目的

ホームセキュリティ向け PLC 制御プログラム。  
文章仕様から TiSLY PLC Builder v4 が I/O 割付・命令・配線図を自動生成した成果物です。

### 入力仕様

```
{spec_text.strip()}
```

---

## I/O

{_io_table(assignment)}

---

## 動作仕様

| 条件 | 動作 |
|------|------|
| 警戒スイッチ ON（X0） | 警戒モード保持（M0 SET） |
| 非常停止 OFF（X1） | 全 M / 全 Y 即時 RST |
| 外周センサー ON（X2）+ 警戒中 | 外周警報ラッチ（M1 SET）→ 白灯1 点灯、白灯2 低速点滅 |
| 近接センサー ON（X3）+ 警戒中 | 近接警報ラッチ（M2 SET）→ 白灯3/4 点灯、赤灯高速点滅 |
| 警戒中（M0） | 赤灯低速点滅（SM413 使用） |

---

## GX Works3 投入方法

1. GX Works3 で新規プロジェクト（FX5UJ）を作成
2. ラダーエディタを **命令入力モード** に切替
3. `generated/GXW3_COMMANDS.txt` を開き、全文をコピー
4. ラダーエディタ先頭セルに貼り付け
5. コンパイル（F4）→ エラー 0 件を確認
6. I/O 割付表（`IO_ASSIGNMENT.csv`）とデバイス名を突合

---

## 配線方法

1. **入力 X0〜X3** — DC24V コモン。センサー・スイッチは b接点（非常停止除く a接点運用可）
2. **出力 Y0** — 赤灯 24V 直結
3. **出力 Y1〜Y4** — 中継リレー経由で AC100V 白灯
4. 詳細は `WIRING_DIAGRAM.md` の ASCII 図を参照

---

## 注意事項

- 点滅クロックは **SM412 / SM413** を使用（M8012 / M8013 は使用禁止）
- Y0（赤灯）は **M20 経由** の OUT が 1 回のみ（二重コイル禁止）
- 非常停止 X1 は最優先。ON 時は全出力 OFF
- 配線・通電前に `TEST_REPORT.md` が **PASS** であることを確認
- 実機投入前にテストスタンドで I/O 動作を確認すること

---

**TiSLY PLC Builder v4 — PROJECT_README**
"""


def write_readme(path: Path, assignment: IOAssignment, spec_text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(generate_readme(assignment, spec_text), encoding="utf-8")
