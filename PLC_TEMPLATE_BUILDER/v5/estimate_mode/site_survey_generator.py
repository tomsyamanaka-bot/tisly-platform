#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.10 — 現調シート生成
見積メモ・I/O 割付から現場調査用チェックリスト（SITE_SURVEY.md）を生成する。
PLC_SELECTION 連携で PLC容量確認セクションを含む。
"""

from __future__ import annotations

from parts_mapper import EstimateBuildResult
from plc_selection_generator import (
    VERSION,
    analyze_plc_selection,
    format_site_survey_plc_section,
)

PART_LABELS: dict[str, tuple[str, str, str]] = {
    "infrared": ("赤外線ビーム", "外周・境界", "NPN/PNP 確認"),
    "pir": ("PIRセンサー", "展示車エリア等", "設置高さ 2.0〜2.5m"),
    "patlite": ("パトライト", "見える位置", "24V 配線"),
    "white_led": ("白色LED", "100V 照明", "中継リレー経由"),
    "estop": ("非常停止", "操作しやすい位置", "b接点 NC 推奨"),
    "buzzer": ("ブザー", "警報音到達範囲", "24V"),
    "magnet": ("マグネットセンサー", "ドア・窓", "配線経路確認"),
    "arm_switch": ("警戒スイッチ", "操作盤付近", "24V"),
    "night_arm": ("夜間警戒SW", "操作盤付近", "24V"),
    "shutter": ("シャッターセンサー", "シャッター付近", "開閉状態確認"),
    "safety_curtain": ("安全カーテン", "危険区域境界", "安全距離確認"),
    "entrance": ("入口赤外線", "入口", "通行動線確認"),
    "exit": ("出口赤外線", "出口", "通行動線確認"),
    "intrusion": ("侵入センサー", "侵入経路", "死角確認"),
}


def _device_rows(result: EstimateBuildResult) -> list[tuple[int, str, int, str, str]]:
    """(No, 機器名, 数量, 設置目安, 確認事項) のリスト。"""
    rows: list[tuple[int, str, int, str, str]] = []
    no = 1
    for key, qty in sorted(result.memo.parts.items()):
        if qty <= 0:
            continue
        label, location_hint, check_note = PART_LABELS.get(
            key, (key, "現場確認", "—")
        )
        rows.append((no, label, qty, location_hint, check_note))
        no += 1
    return rows


def generate_site_survey_md(result: EstimateBuildResult) -> str:
    """SITE_SURVEY.md を生成する。"""
    memo = result.memo
    estimation = result.estimation
    plc_model = result.assignment.customer.plc_model
    power_model = estimation.power_model
    project_title = memo.project_title or memo.project_name
    input_count = len(result.assignment.inputs)
    output_count = len(result.assignment.outputs)

    device_rows = _device_rows(result)
    device_table = "\n".join(
        f"| {no} | {name} | {qty} | | | | {hint} | {note} |"
        for no, name, qty, hint, note in device_rows
    )

    io_rows = "\n".join(
        f"| {e.device} | {e.name} | {e.io_type} | | |"
        for e in result.assignment.entries
    )

    plc_selection = analyze_plc_selection(
        plc_model,
        input_count,
        output_count,
    )
    plc_section = format_site_survey_plc_section(plc_selection)

    return f"""# 現調シート — {project_title}

> TiSLY PLC Builder {VERSION} 自動生成

---

## 案件情報

| 項目 | 内容 |
|------|------|
| 案件名 | {project_title} |
| 目的 | {memo.purpose or "—"} |
| PLC型番 | {plc_model} |
| 24V電源 | MeanWell {power_model} |
| 入力点数 | {input_count} 点 |
| 出力点数 | {output_count} 点 |
| 現調日 | ____________ |
| 現調担当 | ____________ |

---

## 機器設置チェックリスト

| No | 機器 | 数量 | 設置位置（記入） | 配線長(m) | 写真No | 設置目安 | 確認事項 |
|:--:|------|:----:|-----------------|:---------:|:------:|----------|----------|
{device_table}

---

## I/O 割付確認（現場）

| デバイス | 名称 | 種別 | 実配線確認 | 備考 |
|---------|------|------|:----------:|------|
{io_rows}

---

{plc_section}

## 盤・電源 現調項目

| 項目 | 確認 | 備考 |
|------|:----:|------|
| 制御盤設置位置 | ☐ | |
| 盤サイズ見込み | ☐ | 目安: {input_count}IN / {output_count}OUT |
| 100/200V 電源引込位置 | ☐ | |
| 24V 電源設置（{power_model}） | ☐ | |
| アース端子 | ☐ | |
| 非常停止回路（ハード） | ☐ | b接点推奨 |
| 100V 中継リレー設置場所 | ☐ | 白灯 {memo.parts.get('white_led', 0)} 回路 |

---

## 配線経路メモ

```
（現場で配線ルートをスケッチ）




```

---

## 写真リスト

| 写真No | 撮影対象 | ファイル名 |
|:------:|----------|-----------|
| 1 | 制御盤設置予定位置 | |
| 2 | 外周センサー設置候補 | |
| 3 | 電源引込位置 | |
| 4 | 全体俯瞰 | |

---

## 特記事項・懸念点

-

---

## 承認

| 役割 | 氏名 | 日付 | 署名 |
|------|------|------|------|
| 現調担当 | | | |
| 顧客確認 | | | |

---

**TiSLY PLC Builder {VERSION} — SITE_SURVEY**
"""


def site_survey_has_device_table(md_text: str) -> bool:
    return "機器設置チェックリスト" in md_text and "| No |" in md_text


def site_survey_has_io_table(md_text: str) -> bool:
    return "I/O 割付確認" in md_text and "| デバイス |" in md_text


def site_survey_has_plc_capacity_section(md_text: str) -> bool:
    from plc_selection_generator import site_survey_has_plc_capacity

    return site_survey_has_plc_capacity(md_text)


def site_survey_device_count(md_text: str) -> int:
    """データ行数（ヘッダ除く）を概算。"""
    in_section = False
    count = 0
    for line in md_text.splitlines():
        if "## 機器設置チェックリスト" in line:
            in_section = True
            continue
        if in_section and line.startswith("## "):
            break
        if in_section and line.startswith("|") and not line.startswith("| No") and not line.startswith("|:--"):
            count += 1
    return count
