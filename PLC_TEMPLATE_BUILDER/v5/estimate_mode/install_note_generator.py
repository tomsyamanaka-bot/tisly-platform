#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.5 — 施工メモ / 発注メモ生成
SPEC/INSTALL_NOTES.md と SPEC/ORDER_MEMO.md を自動生成する。
"""

from __future__ import annotations

from bom_generator import build_bom_rows
from parts_mapper import EstimateBuildResult

BUILDER_VERSION = "TiSLY PLC Builder v5.5"


def _format_io_wiring(result: EstimateBuildResult) -> str:
    lines: list[str] = []
    for entry in result.assignment.entries:
        lines.append(f"- **{entry.device}** — {entry.name} ({entry.io_type} / {entry.category})")
    return "\n".join(lines) if lines else "- （I/O 未割付）"


def _white_led_outputs(result: EstimateBuildResult) -> list[str]:
    return [
        e.device
        for e in result.assignment.outputs
        if e.name.startswith("白灯") or "LED" in e.name.upper()
    ]


def generate_install_notes(result: EstimateBuildResult) -> str:
    """施工メモ Markdown を生成する。"""
    memo = result.memo
    plc_model = result.assignment.customer.plc_model
    white_devices = _white_led_outputs(result)
    white_range = " / ".join(white_devices) if white_devices else "Y1〜Y4"

    return f"""# 施工メモ — {memo.project_title}

> {BUILDER_VERSION} 自動生成

---

## PLC盤内配線メモ

- PLC: **{plc_model}**
- 24V電源: **MeanWell {result.estimation.power_model}**
- 非常停止は **NC 接点** で X 入力へ（開放時に全停止）
- センサー類は 24V 共通電源から供給、シールド線は片側 GND

### I/O 割付

{_format_io_wiring(result)}

---

## 配線上の注意

### 100V 白灯

- **100V 白灯は PLC 直結禁止。** 中継リレーまたは SSR 経由で制御すること。
- 白灯 {memo.parts.get('white_led', 0)} 台分の **100V 中継リレー** を盤内に配置。
- リレーコイルは PLC 出力（{white_range}）から 24V 経由で駆動。

### 非常停止

- **非常停止は NC 推奨**（ノーマルクローズ接点）。
- 配線断線時も安全側（停止）に倒れる構成とする。

### GND 共通化

- **24V 電源とセンサー GND は共通化** すること（PLC COM / 0V へ一点接地）。
- 100V 側との混触・誤配線に注意。盤内で 24V / 100V バスを明確に分離。

### 出力割付

| 出力 | 用途 |
|------|------|
| Y0 | 24V 赤灯またはパトライト |
| Y1〜Y4 | 100V 白灯用リレー制御 |

---

## 通電前チェック

- [ ] 非常停止 NC 動作確認
- [ ] 24V / 100V 極性・絶縁確認
- [ ] センサー GND 共通化
- [ ] リレー接点容量と白灯負荷の整合
- [ ] TEST_REPORT.md が PASS

---

**{BUILDER_VERSION} — INSTALL_NOTES**
"""


def generate_order_memo(result: EstimateBuildResult) -> str:
    """発注メモ Markdown を生成する。"""
    memo = result.memo
    bom_rows = build_bom_rows(result)
    order_list = "\n".join(
        f"- [ ] {r.category} / {r.item} × {r.qty}{r.unit} — {r.note}"
        for r in bom_rows
    )

    infrared = memo.parts.get("infrared", 0)
    pir = memo.parts.get("pir", 0)
    white_led = memo.parts.get("white_led", 0)

    return f"""# 発注メモ — {memo.project_title}

> {BUILDER_VERSION} 自動生成

---

## 発注候補リスト

{order_list}

---

## 現場確認が必要な項目

以下は見積メモから自動生成できないため、**施工前に現場確認** してください。

### ケーブル長

- [ ] 赤外線ビーム配線（{infrared} 本）— 各設置点から盤までの距離
- [ ] PIR センサー配線（{pir} 台）— 電源・信号ケーブル長
- [ ] パトライト / 白灯配線 — 100V 引込位置からの距離
- [ ] 非常停止 — 操作位置から盤までの距離

### センサー設置位置

- [ ] 赤外線ビーム {infrared} 本 — 外周検知ライン・取付高さ
- [ ] PIR センサー {pir} 台 — 展示車エリア / 監視範囲
- [ ] 死角・障害物（柱・看板・車両）の有無

### 100V 白灯の容量

- [ ] 白灯 {white_led} 台 — 各灯具の W 数（VA）確認
- [ ] リレー接点容量 ≥ 白灯合計負荷
- [ ] 100V ブレーカー容量の余裕

### 盤サイズ

- [ ] PLC + 電源 + リレー {white_led} 個 + 端子台の収容
- [ ] 将来拡張用スペース（20% 余裕推奨）

### 防水 BOX 要否

- [ ] 屋外・半屋外センサー — 防水 BOX / IP 等級
- [ ] 盤本体 — 設置場所（屋内 / 屋外）に応じた筐体選定
- [ ] ケーブルグランド・結露対策

---

## 発注時メモ

| 項目 | 内容 |
|------|------|
| 案件名 | {memo.project_title} |
| PLC | {result.assignment.customer.plc_model} |
| 24V電源 | MeanWell {result.estimation.power_model} |
| 目的 | {memo.purpose} |

---

**{BUILDER_VERSION} — ORDER_MEMO**
"""
