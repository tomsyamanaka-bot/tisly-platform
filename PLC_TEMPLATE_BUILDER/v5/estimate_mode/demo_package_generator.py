#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.19 — End-to-End Demo Package
案件フォルダ内 DEMO_PACKAGE/ に営業デモ一式をまとめる。
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

VERSION = "v5.19"
BUILDER_LABEL = f"TiSLY PLC Builder {VERSION} — End-to-End Demo Package"

DEMO_FILES = (
    "DEMO_README.md",
    "DEMO_INDEX.json",
    "DEMO_CHECKLIST.md",
)


def _copy_if_exists(src: Path, dst: Path) -> bool:
    if src.is_file():
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        return True
    return False


def generate_demo_readme(project_dir: Path, project_name: str) -> str:
    return f"""# TiSLY 営業デモパッケージ — {project_name}

**{BUILDER_LABEL}**

## 概要

本フォルダは案件 `{project_name}` の **End-to-End 営業デモ一式** です。  
PLC・Node-RED・PWA・TV・見積・現調報告をまとめて提示できます。

## 構成

| フォルダ / ファイル | 内容 |
|---------------------|------|
| PLC/ | GX Works3 命令・PLC プログラム |
| TISLY/ | MQTT / ESP / Node-RED / UI / TV |
| SPEC/ | 仕様書 / 見積 / BOM |
| SURVEY/ | 現調報告書 |
| DEMO_CHECKLIST.md | デモ実施チェックリスト |

## デモ手順

1. **PLC** … `PLC/GX3_COMMANDS.txt` を GX Works3 シミュレータで確認
2. **Node-RED** … `TISLY/TISLY_FLOWS.json` をインポート
3. **PWA** … `TISLY/UI/index.html` をブラウザで表示
4. **TV** … `TISLY/UI/tv.html` を Google TV で全画面表示
5. **見積** … `SPEC/TOMS_QUOTE_SUMMARY.md` を提示
6. **現調** … `SURVEY/TOMS_SITE_REPORT.md` を説明

## 注意

- デモ環境では MQTT ブローカー未接続時はデモモードで動作します
- 正式見積・施工前に現地確認が必要です

---

*生成日時: {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}*
*{BUILDER_LABEL}*
"""


def generate_demo_index(project_dir: Path, project_name: str) -> str:
    items: list[dict] = []
    mappings = [
        ("PLC", project_dir / "PLC_PROGRAM" / "GX3_COMMANDS.txt"),
        ("Node-RED", project_dir / "TISLY" / "TISLY_FLOWS.json"),
        ("PWA", project_dir / "TISLY" / "UI" / "index.html"),
        ("TV", project_dir / "TISLY" / "UI" / "tv.html"),
        ("見積", project_dir / "SPEC" / "TOMS_QUOTE_SUMMARY.md"),
        ("現調", project_dir / "TOMS_SITE_REPORT.md"),
        ("仕様", project_dir / "SPEC" / "PROJECT_SPEC.md"),
    ]
    for label, path in mappings:
        items.append({"label": label, "path": str(path.relative_to(project_dir)), "exists": path.is_file()})
    payload = {
        "builder_version": BUILDER_LABEL,
        "project_name": project_name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "components": items,
    }
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def generate_demo_checklist(project_name: str) -> str:
    return f"""# デモ実施チェックリスト — {project_name}

**{BUILDER_LABEL}**

| # | 項目 | 確認 |
|---|------|------|
| 1 | PLC シミュレータ起動 | ☐ |
| 2 | Node-RED フローインポート | ☐ |
| 3 | MQTT ブローカー接続 | ☐ |
| 4 | PWA ダッシュボード表示 | ☐ |
| 5 | Google TV ランチャー表示 | ☐ |
| 6 | 警報シミュレーション | ☐ |
| 7 | 見積書提示 | ☐ |
| 8 | 現調報告書説明 | ☐ |

## メモ

（デモ実施日・担当者・顧客反応を記録）
"""


def write_demo_package(project_dir: Path) -> dict[str, Path]:
    """DEMO_PACKAGE/ 配下に営業デモ一式を書き出す。"""
    project_name = project_dir.name
    demo_dir = project_dir / "DEMO_PACKAGE"
    demo_dir.mkdir(parents=True, exist_ok=True)

    # Copy key folders
    for sub, src_name in [
        ("PLC", "PLC_PROGRAM"),
        ("TISLY", "TISLY"),
        ("SPEC", "SPEC"),
    ]:
        src = project_dir / src_name
        dst = demo_dir / sub
        if src.is_dir():
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(src, dst)

    survey_dir = demo_dir / "SURVEY"
    survey_dir.mkdir(exist_ok=True)
    _copy_if_exists(project_dir / "TOMS_SITE_REPORT.md", survey_dir / "TOMS_SITE_REPORT.md")

    writers = {
        "DEMO_README.md": generate_demo_readme(project_dir, project_name),
        "DEMO_INDEX.json": generate_demo_index(project_dir, project_name),
        "DEMO_CHECKLIST.md": generate_demo_checklist(project_name),
    }
    paths: dict[str, Path] = {}
    for name, content in writers.items():
        path = demo_dir / name
        path.write_text(content, encoding="utf-8")
        paths[name] = path
    return paths


def audit_demo_package(project_dir: Path) -> list[tuple[str, bool, str]]:
    demo_dir = project_dir / "DEMO_PACKAGE"
    readme = demo_dir / "DEMO_README.md"
    index = demo_dir / "DEMO_INDEX.json"
    checklist = demo_dir / "DEMO_CHECKLIST.md"
    has_plc = (demo_dir / "PLC" / "GX3_COMMANDS.txt").is_file()
    has_tisly = (demo_dir / "TISLY" / "TISLY_FLOWS.json").is_file()
    has_ui = (demo_dir / "TISLY" / "UI" / "index.html").is_file()
    has_tv = (demo_dir / "TISLY" / "UI" / "tv.html").is_file()
    all_meta = all((demo_dir / f).is_file() for f in DEMO_FILES)

    return [
        ("DEMO_PACKAGE/ 存在", demo_dir.is_dir(), "OK" if demo_dir.is_dir() else "なし"),
        ("DEMO メタファイル (3)", all_meta, f"{sum(1 for f in DEMO_FILES if (demo_dir / f).is_file())}/3"),
        ("DEMO PLC", has_plc, "OK" if has_plc else "なし"),
        ("DEMO Node-RED", has_tisly, "OK" if has_tisly else "なし"),
        ("DEMO PWA", has_ui, "OK" if has_ui else "なし"),
        ("DEMO TV", has_tv, "OK" if has_tv else "なし"),
    ]
