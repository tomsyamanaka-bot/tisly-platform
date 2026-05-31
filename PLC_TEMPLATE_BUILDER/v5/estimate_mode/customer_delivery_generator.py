#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.25 — Customer Delivery Package
CUSTOMER_DELIVERY/ にお客様向け説明書・操作説明・注意事項・保守案内・納品チェックリスト
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

VERSION = "v5.25"
BUILDER_LABEL = f"TiSLY PLC Builder {VERSION} — Customer Delivery Package"

DELIVERY_FILES = (
    "CUSTOMER_MANUAL.md",
    "OPERATION_GUIDE.md",
    "SAFETY_NOTES.md",
    "MAINTENANCE_GUIDE.md",
    "DELIVERY_CHECKLIST.md",
)


def generate_customer_manual(project_name: str) -> str:
    return f"""# お客様向け説明書 — {project_name}

**{BUILDER_LABEL}**

## システム概要

TiSLY セキュリティシステムは、PLC による現場制御と、スマートフォン / TV による状態確認を組み合わせた監視システムです。

## 主要機能

- 警戒モードの ON/OFF
- 赤外線・人感センサーによる侵入検知
- パトライト・照明による警報表示
- スマホアプリ（PWA）での状態確認
- Google TV ランチャーでの大画面表示

## お問い合わせ

保守・故障時は施工業者または TiSLY サポートへご連絡ください。

---

*{BUILDER_LABEL}*
"""


def generate_operation_guide(project_name: str) -> str:
    return f"""# 操作説明 — {project_name}

**{BUILDER_LABEL}**

## 日常操作

### 警戒開始

1. 現場のセレクタスイッチを ON にする
2. 赤ライト（パトライト）が点滅 → 警戒中

### 警戒解除

1. セレクタスイッチを OFF にする
2. 全出力が OFF になることを確認

### 非常停止

- 非常停止ボタンを押す → 全出力即 OFF

## スマホ / TV 操作

| 画面 | URL / ファイル |
|------|----------------|
| スマホ PWA | `TISLY/UI/index.html` をホーム画面に追加 |
| Google TV | `TISLY/UI/tv.html` をブラウザで全画面表示 |

## 警報時

1. パトライト・照明の状態を確認
2. PWA / TV で発報デバイスを特定
3. 必要に応じて現場確認

---

*{BUILDER_LABEL}*
"""


def generate_safety_notes(project_name: str) -> str:
    return f"""# 注意事項 — {project_name}

**{BUILDER_LABEL}**

## 安全上の注意

- 非常停止回路は必ず物理ボタンで操作してください
- 100V 照明回路は中継リレー経由 — PLC 出力端子へ直接 100V を接続しないでください
- 施工・配線変更は資格を持つ電気工事士に依頼してください

## 使用上の注意

- センサーの設置角度・感度は定期点検時に確認
- MQTT / ネットワーク障害時は PLC 単独で制御継続
- PWA はオフライン時キャッシュ表示 — リアルタイム性はネットワーク依存

## 免責

本システムは補助監視用途です。法的安全要件を満たすには関連規格に従った設計が必要です。

---

*{BUILDER_LABEL}*
"""


def generate_maintenance_guide(project_name: str) -> str:
    return f"""# 保守案内 — {project_name}

**{BUILDER_LABEL}**

## 定期点検（推奨: 年1回）

| 項目 | 内容 |
|------|------|
| センサー | 汚れ清掃・設置角度確認 |
| PLC | バッテリーバックアップ寿命（該当機種） |
| 配線 | 端子緩み・断線チェック |
| ネットワーク | MQTT / ESP 通信確認 |
| ログ | QNAP ログ容量・ローテーション |

## 保守連絡先

（施工業者名・電話番号を記入）

## 部品交換

- センサー / パトライト: 型番は `SPEC/BOM.csv` 参照
- PLC バックアップ電池: 機種マニュアル参照

---

*最終更新: {datetime.now(timezone.utc).strftime("%Y-%m-%d")}*
*{BUILDER_LABEL}*
"""


def generate_delivery_checklist(project_name: str) -> str:
    return f"""# 納品チェックリスト — {project_name}

**{BUILDER_LABEL}**

## お客様確認項目

| # | 項目 | 確認 | 署名 |
|---|------|------|------|
| 1 | 警戒 ON/OFF 動作 | ☐ | |
| 2 | センサー検知 → 警報出力 | ☐ | |
| 3 | 非常停止動作 | ☐ | |
| 4 | PWA 状態表示 | ☐ | |
| 5 | TV ランチャー表示 | ☐ | |
| 6 | 操作説明の説明受領 | ☐ | |
| 7 | 保守連絡先の確認 | ☐ | |

## 納品物

- [ ] お客様向け説明書
- [ ] 操作説明
- [ ] 注意事項
- [ ] 保守案内

---

納品日: _______________  お客様署名: _______________
"""


def write_customer_delivery(project_dir: Path) -> dict[str, Path]:
    delivery_dir = project_dir / "CUSTOMER_DELIVERY"
    delivery_dir.mkdir(parents=True, exist_ok=True)
    name = project_dir.name
    writers = {
        "CUSTOMER_MANUAL.md": generate_customer_manual(name),
        "OPERATION_GUIDE.md": generate_operation_guide(name),
        "SAFETY_NOTES.md": generate_safety_notes(name),
        "MAINTENANCE_GUIDE.md": generate_maintenance_guide(name),
        "DELIVERY_CHECKLIST.md": generate_delivery_checklist(name),
    }
    paths: dict[str, Path] = {}
    for fname, content in writers.items():
        path = delivery_dir / fname
        path.write_text(content, encoding="utf-8")
        paths[fname] = path
    return paths


def audit_customer_delivery(project_dir: Path) -> list[tuple[str, bool, str]]:
    delivery_dir = project_dir / "CUSTOMER_DELIVERY"
    all_exist = all((delivery_dir / f).is_file() for f in DELIVERY_FILES)
    manual = delivery_dir / "CUSTOMER_MANUAL.md"
    checklist = delivery_dir / "DELIVERY_CHECKLIST.md"

    return [
        ("CUSTOMER_DELIVERY/ 存在", delivery_dir.is_dir(), "OK" if delivery_dir.is_dir() else "なし"),
        ("納品ドキュメント (5)", all_exist, f"{sum(1 for f in DELIVERY_FILES if (delivery_dir / f).is_file())}/5"),
        ("操作説明書", manual.is_file(), "OK" if manual.is_file() else "なし"),
        ("納品チェックリスト", checklist.is_file(), "OK" if checklist.is_file() else "なし"),
    ]
