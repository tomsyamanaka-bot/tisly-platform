#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.26 — Installer Package
INSTALLER_PACKAGE/ に施工者向け配線表・I/O表・手順書・現場チェックリスト
"""

from __future__ import annotations

import shutil
from datetime import datetime, timezone
from pathlib import Path

VERSION = "v5.26"
BUILDER_LABEL = f"TiSLY PLC Builder {VERSION} — Installer Package"

INSTALLER_FILES = (
    "INSTALLER_README.md",
    "WIRING_TABLE.md",
    "IO_TABLE.md",
    "PLC_WRITE_PROCEDURE.md",
    "NODERED_IMPORT.md",
    "PWA_VERIFY.md",
    "SITE_CHECKLIST.md",
)


def generate_installer_readme(project_name: str) -> str:
    return f"""# 施工者向けパッケージ — {project_name}

**{BUILDER_LABEL}**

## 概要

本フォルダは案件 `{project_name}` の **施工・設置・調試** 用ドキュメント一式です。

## ファイル一覧

| ファイル | 内容 |
|----------|------|
| WIRING_TABLE.md | 配線表 |
| IO_TABLE.md | I/O 割付表 |
| PLC_WRITE_PROCEDURE.md | PLC 書込み手順 |
| NODERED_IMPORT.md | Node-RED インポート手順 |
| PWA_VERIFY.md | PWA 動作確認手順 |
| SITE_CHECKLIST.md | 現場チェックリスト |

## 施工フロー

1. 現場チェックリスト実施
2. 配線・I/O 表に従い配線
3. PLC プログラム書込み
4. Node-RED フローインポート
5. PWA / TV 動作確認
6. お客様納品（CUSTOMER_DELIVERY/）

---

*{BUILDER_LABEL}*
"""


def generate_wiring_table(project_dir: Path) -> str:
    wiring_src = project_dir / "DRAWING" / "WIRING_DIAGRAM.md"
    body = wiring_src.read_text(encoding="utf-8") if wiring_src.is_file() else "（配線図未生成 — DRAWING/WIRING_DIAGRAM.md を参照）"
    return f"""# 配線表 — {project_dir.name}

**{BUILDER_LABEL}**

{body}
"""


def generate_io_table(project_dir: Path) -> str:
    io_src = project_dir / "SPEC" / "IO_ASSIGNMENT.csv"
    body = io_src.read_text(encoding="utf-8") if io_src.is_file() else "（I/O表未生成）"
    return f"""# I/O 表 — {project_dir.name}

**{BUILDER_LABEL}**

```csv
{body.strip()}
```
"""


def generate_plc_procedure(project_name: str) -> str:
    return f"""# PLC 書込み手順 — {project_name}

**{BUILDER_LABEL}**

## 手順

1. GX Works3 を起動
2. 新規プロジェクト → PLC 型番を SPEC/PLC_SELECTION.md に合わせて選択
3. `PLC_PROGRAM/GX3_COMMANDS.txt` を参考にラダー入力
4. シミュレータで X0→センサー→X1(非常停止) の順に動作確認
5. 実機へ書込み → RUN モード

## 確認項目

- [ ] M8012 / M8013 未使用（SM412/SM413 使用）
- [ ] Y0 単一コイル
- [ ] END 命令末尾

---

*{BUILDER_LABEL}*
"""


def generate_nodered_import(project_name: str) -> str:
    return f"""# Node-RED インポート手順 — {project_name}

**{BUILDER_LABEL}**

## 手順

1. Node-RED 管理画面を開く
2. メニュー → Import → Clipboard
3. `TISLY/TISLY_FLOWS.json` の内容を貼り付け
4. Deploy
5. MQTT ブローカー設定を `TISLY/NODE_RED_CONFIG.json` に合わせる

## 確認

- [ ] mqtt in / out 接続
- [ ] alarm / motion トピック受信
- [ ] debug ノードでログ出力

---

*{BUILDER_LABEL}*
"""


def generate_pwa_verify(project_name: str) -> str:
    return f"""# PWA 動作確認手順 — {project_name}

**{BUILDER_LABEL}**

## 手順

1. `TISLY/UI/` を Web サーバーに配置（または Node-RED http static）
2. スマホブラウザで `index.html` を開く
3. 「ホーム画面に追加」で PWA インストール
4. `tv.html` を Google TV Chrome で全画面表示
5. MQTT 接続状態バッジを確認

## 確認項目

- [ ] index.html デバイスカード表示
- [ ] manifest.json / アイコン
- [ ] オフライン時 offline.html 表示
- [ ] tv.html D-pad 操作

---

*{BUILDER_LABEL}*
"""


def generate_site_checklist(project_name: str) -> str:
    return f"""# 現場チェックリスト — {project_name}

**{BUILDER_LABEL}**

| # | 項目 | 確認 |
|---|------|------|
| 1 | 盤設置・電源 100/200V | ☐ |
| 2 | 24V 電源出力確認 | ☐ |
| 3 | 入力配線（センサー/NPN-PNP） | ☐ |
| 4 | 出力配線（リレー経由 100V） | ☐ |
| 5 | 非常停止 NC 配線 | ☐ |
| 6 | ESP32 / MQTT ネットワーク | ☐ |
| 7 | PLC RUN / エラー LED | ☐ |
| 8 | 警報シミュレーション | ☐ |
| 9 | PWA / TV 表示 | ☐ |
| 10 | お客様説明・署名 | ☐ |

---

施工者: _______________  日付: _______________
"""


def write_installer_package(project_dir: Path) -> dict[str, Path]:
    installer_dir = project_dir / "INSTALLER_PACKAGE"
    installer_dir.mkdir(parents=True, exist_ok=True)
    name = project_dir.name

    # Copy reference files
    for src_rel, dst_name in [
        ("PLC_PROGRAM/GX3_COMMANDS.txt", "GX3_COMMANDS.txt"),
        ("TISLY/TISLY_FLOWS.json", "TISLY_FLOWS.json"),
    ]:
        src = project_dir / src_rel
        if src.is_file():
            shutil.copy2(src, installer_dir / dst_name)

    writers = {
        "INSTALLER_README.md": generate_installer_readme(name),
        "WIRING_TABLE.md": generate_wiring_table(project_dir),
        "IO_TABLE.md": generate_io_table(project_dir),
        "PLC_WRITE_PROCEDURE.md": generate_plc_procedure(name),
        "NODERED_IMPORT.md": generate_nodered_import(name),
        "PWA_VERIFY.md": generate_pwa_verify(name),
        "SITE_CHECKLIST.md": generate_site_checklist(name),
    }
    paths: dict[str, Path] = {}
    for fname, content in writers.items():
        path = installer_dir / fname
        path.write_text(content, encoding="utf-8")
        paths[fname] = path
    return paths


def audit_installer_package(project_dir: Path) -> list[tuple[str, bool, str]]:
    installer_dir = project_dir / "INSTALLER_PACKAGE"
    all_meta = all((installer_dir / f).is_file() for f in INSTALLER_FILES)
    has_plc = (installer_dir / "GX3_COMMANDS.txt").is_file() or (project_dir / "PLC_PROGRAM" / "GX3_COMMANDS.txt").is_file()
    has_flows = (installer_dir / "TISLY_FLOWS.json").is_file() or (project_dir / "TISLY" / "TISLY_FLOWS.json").is_file()
    checklist = installer_dir / "SITE_CHECKLIST.md"

    return [
        ("INSTALLER_PACKAGE/ 存在", installer_dir.is_dir(), "OK" if installer_dir.is_dir() else "なし"),
        ("施工ドキュメント (7)", all_meta, f"{sum(1 for f in INSTALLER_FILES if (installer_dir / f).is_file())}/7"),
        ("PLC 手順書", (installer_dir / "PLC_WRITE_PROCEDURE.md").is_file(), "OK"),
        ("Node-RED 手順書", (installer_dir / "NODERED_IMPORT.md").is_file(), "OK"),
        ("現場チェックリスト", checklist.is_file(), "OK" if checklist.is_file() else "なし"),
        ("PLC+Flow 参照", has_plc and has_flows, "OK" if has_plc and has_flows else "一部不足"),
    ]
