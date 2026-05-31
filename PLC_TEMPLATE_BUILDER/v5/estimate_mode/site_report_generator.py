#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.13 — TOMS 現調報告書生成
案件情報 / I/O / PLC_SELECTION / 見積生成物を TOMS_SITE_REPORT.md に集約する。
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from estimate_sheet_generator import build_estimate_header
from parts_mapper import EstimateBuildResult
from plc_selection_generator import (
    analyze_plc_selection,
    _format_extensions,
)

VERSION = "v5.13"

PART_LABELS: dict[str, str] = {
    "infrared": "赤外線ビーム",
    "pir": "PIRセンサー（人感）",
    "patlite": "パトライト（回転灯）",
    "white_led": "白色LED照明",
    "estop": "非常停止",
    "buzzer": "警報ブザー",
    "magnet": "マグネットセンサー",
    "arm_switch": "警戒スイッチ",
    "night_arm": "夜間警戒SW",
    "shutter": "シャッターセンサー",
    "safety_curtain": "安全カーテン",
    "entrance": "入口赤外線",
    "exit": "出口赤外線",
    "intrusion": "侵入センサー",
}

INTERNAL_RELAY_LABELS: dict[str, str] = {
    "M0": "警戒中フラグ",
    "M1": "外周検知フラグ",
    "M2": "PIR検知フラグ",
    "M20": "パトライト点滅制御",
}


@dataclass
class SiteReportContext:
    project_title: str
    customer_name: str
    site_name: str
    issue_date: str
    person_in_charge: str
    plc_model: str
    power_model: str
    purpose: str
    parts: dict[str, int]
    assignment: object
    estimation: object


def _parts_summary(parts: dict[str, int]) -> str:
    items = []
    for key, qty in sorted(parts.items()):
        if qty <= 0:
            continue
        label = PART_LABELS.get(key, key)
        items.append(f"{label} × {qty}")
    return " / ".join(items) if items else "—"


def _sensor_summary(parts: dict[str, int]) -> str:
    sensor_keys = (
        "infrared", "pir", "magnet", "shutter", "safety_curtain",
        "entrance", "exit", "intrusion", "arm_switch", "night_arm", "estop",
    )
    items = []
    for key in sensor_keys:
        qty = parts.get(key, 0)
        if qty > 0:
            items.append(f"{PART_LABELS.get(key, key)}: {qty}")
    return "\n".join(f"- {line}" for line in items) if items else "- （センサー未指定）"


def _output_summary(parts: dict[str, int]) -> str:
    output_keys = ("patlite", "white_led", "buzzer", "warning_light", "full_sign")
    items = []
    for key in output_keys:
        qty = parts.get(key, 0)
        if qty > 0:
            items.append(f"{PART_LABELS.get(key, key)}: {qty}")
    return "\n".join(f"- {line}" for line in items) if items else "- （出力機器未指定）"


def _control_summary(purpose: str, parts: dict[str, int]) -> str:
    lines = [f"- {purpose or '侵入検知・警告表示'}"]
    if parts.get("night_arm") or parts.get("arm_switch"):
        lines.append("- 警戒モード切替 → センサー監視開始")
    if parts.get("infrared") or parts.get("intrusion"):
        lines.append("- 外周・侵入検知 → 白灯点灯 / パトライト作動")
    if parts.get("pir"):
        lines.append("- 人感検知 → 警報出力・照明制御")
    if parts.get("estop"):
        lines.append("- 非常停止 → 全出力 OFF（ハードウェア b接点推奨）")
    return "\n".join(lines)


def _io_table_rows(entries: list, io_type: str) -> str:
    filtered = [e for e in entries if getattr(e, "io_type", "") == io_type]
    if not filtered:
        return "| — | — | — |\n"
    rows = []
    for e in filtered:
        rows.append(
            f"| {e.device} | {e.name} | {getattr(e, 'category', '—')} |"
        )
    return "\n".join(rows) + "\n"


def _extract_internal_relays(project_dir: Path) -> list[tuple[str, str]]:
    gx_path = project_dir / "PLC_PROGRAM" / "GX3_COMMANDS.txt"
    if not gx_path.is_file():
        return []
    gx_text = gx_path.read_text(encoding="utf-8")
    found = sorted(
        set(re.findall(r"\bM\d+\b", gx_text)),
        key=lambda m: int(m[1:]),
    )
    return [(m, INTERNAL_RELAY_LABELS.get(m, "内部リレー")) for m in found]


def _internal_relay_table(project_dir: Path) -> str:
    relays = _extract_internal_relays(project_dir)
    if not relays:
        return "| — | — | — |\n"
    return "\n".join(f"| {dev} | {name} | GX命令で使用 |" for dev, name in relays) + "\n"


def _file_link(project_dir: Path, rel_path: str) -> str:
    path = project_dir / rel_path
    status = "✓ 生成済" if path.is_file() else "— 未生成"
    return f"- `{rel_path}` — {status}"


def _bom_summary(project_dir: Path) -> str:
    bom_path = project_dir / "SPEC" / "BOM.csv"
    if not bom_path.is_file():
        return ""
    text = bom_path.read_text(encoding="utf-8")
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    return f"（BOM {len(rows)} 行）"


def _rough_estimate_summary(project_dir: Path) -> str:
    csv_path = project_dir / "SPEC" / "ROUGH_ESTIMATE.csv"
    if not csv_path.is_file():
        return ""
    text = csv_path.read_text(encoding="utf-8")
    for line in text.splitlines():
        if line.startswith("Total,"):
            parts = line.split(",")
            if len(parts) >= 2:
                return f"（税込合計 {parts[1]} 円）"
    return "（概算あり）"


def context_from_estimate_result(result: EstimateBuildResult) -> SiteReportContext:
    memo = result.memo
    header = build_estimate_header(result)
    customer = result.assignment.customer
    return SiteReportContext(
        project_title=memo.project_title or memo.project_name,
        customer_name=header.get("customer_name") or customer.company or "—",
        site_name=customer.site or memo.project_title or "—",
        issue_date=header.get("issue_date") or date.today().strftime("%Y-%m-%d"),
        person_in_charge=header.get("person_in_charge") or "TiSLY PLC Builder",
        plc_model=result.assignment.customer.plc_model,
        power_model=result.estimation.power_model,
        purpose=memo.purpose or "—",
        parts=dict(memo.parts),
        assignment=result.assignment,
        estimation=result.estimation,
    )


def context_from_spec_result(spec_result: object, project_name: str) -> SiteReportContext:
    assignment = spec_result.assignment
    estimation = spec_result.estimation
    quantities = spec_result.quantities
    customer = assignment.customer
    today = date.today().strftime("%Y-%m-%d")
    title = quantities.project_name or customer.site or project_name
    return SiteReportContext(
        project_title=title,
        customer_name=customer.company or "TiSLY株式会社",
        site_name=customer.site or title,
        issue_date=today,
        person_in_charge=customer.contact or "TiSLY PLC Builder",
        plc_model=customer.plc_model or estimation.plc_model,
        power_model=estimation.power_model,
        purpose=quantities.purpose or title,
        parts=dict(quantities.counts),
        assignment=assignment,
        estimation=estimation,
    )


def generate_site_report_md(
    project_dir: Path,
    *,
    estimate_result: EstimateBuildResult | None = None,
    spec_result: object | None = None,
    project_name: str = "",
) -> str:
    """TOMS_SITE_REPORT.md を生成する。"""
    if estimate_result is not None:
        ctx = context_from_estimate_result(estimate_result)
    elif spec_result is not None:
        ctx = context_from_spec_result(spec_result, project_name)
    else:
        raise ValueError("estimate_result または spec_result が必要です")

    assignment = ctx.assignment
    input_count = len(assignment.inputs)
    output_count = len(assignment.outputs)
    white_count = sum(1 for e in assignment.outputs if e.name.startswith("白灯"))
    estop_count = sum(1 for e in assignment.inputs if "非常" in e.name)

    plc_selection = analyze_plc_selection(
        ctx.plc_model,
        input_count,
        output_count,
    )
    m = plc_selection.metrics
    ext_text = _format_extensions(plc_selection.recommended_extensions)

    bom_note = _bom_summary(project_dir)
    rough_note = _rough_estimate_summary(project_dir)

    return f"""# TOMS 現調報告書

> TiSLY PLC Builder {VERSION} 自動生成  
> 案件: {ctx.project_title}

---

## 1. 案件基本情報

| 項目 | 内容 |
|------|------|
| 案件名 | {ctx.project_title} |
| 顧客名 | {ctx.customer_name} |
| 現場名 | {ctx.site_name} |
| 作成日 | {ctx.issue_date} |
| 担当者 | {ctx.person_in_charge} |
| PLC型番 | {ctx.plc_model} |
| 電源型番 | MeanWell {ctx.power_model} |

---

## 2. 現調概要

| 項目 | 内容 |
|------|------|
| 目的 | {ctx.purpose} |
| 対象エリア | {ctx.site_name}（現地確認要） |
| センサー構成 | {_parts_summary(ctx.parts)} |
| 出力機器構成 | パトライト {ctx.parts.get('patlite', 0)} / 白灯 {ctx.parts.get('white_led', white_count)} / ブザー {ctx.parts.get('buzzer', 0)} |
| 制御内容 | {ctx.purpose} |

### センサー詳細

{_sensor_summary(ctx.parts)}

### 出力機器詳細

{_output_summary(ctx.parts)}

### 制御ロジック概要

{_control_summary(ctx.purpose, ctx.parts)}

---

## 3. I/O割り当て

### 入力一覧

| デバイス | 名称 | カテゴリ |
|---------|------|---------|
{_io_table_rows(assignment.entries, "Input")}
### 出力一覧

| デバイス | 名称 | カテゴリ |
|---------|------|---------|
{_io_table_rows(assignment.entries, "Output")}
### 内部リレー一覧

| デバイス | 名称 | 用途 |
|---------|------|------|
{_internal_relay_table(project_dir)}
---

## 4. PLC容量確認

| 項目 | 内容 |
|------|------|
| 選定PLC | {ctx.plc_model} |
| 入力使用点数 | {m.used_inputs} 点 |
| 出力使用点数 | {m.used_outputs} 点 |
| 入力余裕率 | {m.input_margin_pct} % |
| 出力余裕率 | {m.output_margin_pct} % |
| 判定 | {plc_selection.judgment} |
| 推奨PLC | {plc_selection.recommended_plc} |
| 拡張ユニット候補 | {ext_text} |

> 詳細: `SPEC/PLC_SELECTION.md`

---

## 5. 配線メモ

### 24V系

- PLC 入力 COM / 24V+ を MeanWell {ctx.power_model} から供給
- センサー・パトライト・ブザーは 24V 系で配線
- 24V 電源容量: {ctx.estimation.power_supply.description if hasattr(ctx.estimation, 'power_supply') else '現地確認'}

### 100V系

- 白色LED {white_count} 回路は **100V 中継リレー経由**（PLC 出力 Y 点 → リレーコイル）
- 100V 白灯容量・ブレーカ容量を現地確認

### センサー系

- 赤外線・PIR は a接点 NO / NPN 出力を確認（現地機器仕様に合わせる）
- センサー配線はシールド線使用推奨、ノイズ対策の GND 共通化を確認

### 非常停止

- 非常停止 {estop_count} 点 — **b接点 NC 直結** を推奨（ハードウェア安全回路）
- 非常停止時は全出力 OFF（GX プログラムで M/Y リセット）

### 中継リレー / SSR

- 100V 白灯回路: 中継リレー {white_count} 回路以上
- 負荷電流に応じ SSR または mechanical relay を選定

### GND共通化の注意

- PLC FG / 24V- / センサー GND / 電源 GND を **1点接地** にまとめる
- 100V 系と 24V 系の混線・誤配線に注意

---

## 6. 施工前確認事項

| 項目 | 確認内容 | 現場記入 |
|------|----------|:--------:|
| センサー設置位置 | 死角・日照・振動の影響を確認 | ☐ |
| ケーブルルート | 配管・ダクト・露出配線の可否 | ☐ |
| 100V白灯容量 | 既存照明容量・ブレーカ余裕 | ☐ |
| 盤設置位置 | 制御盤サイズ・換気・保守スペース | ☐ |
| 防水BOX要否 | 屋外・半屋外センサーの IP 等級 | ☐ |
| 将来増設予定 | 予備 I/O {m.spare_inputs}IN / {m.spare_outputs}OUT 確保 | ☐ |
| 電源容量 | 24V {ctx.power_model} / 100V 引込容量 | ☐ |
| 通信方式 | 現状: ローカル PLC のみ（TiSLY 連携は将来） | ☐ |

---

## 7. 見積連携

{_file_link(project_dir, "TOMS_ESTIMATE.xlsx")} {bom_note and ''}
{_file_link(project_dir, "SPEC/TOMS_QUOTE_ITEMS.csv")}
{_file_link(project_dir, "SPEC/ROUGH_ESTIMATE.csv")} {rough_note}

> TOMS 見積 Excel: `SPEC/TOMS_QUOTE.xlsx`  
> 部材表: `SPEC/BOM.csv`  
> PLC選定: `SPEC/PLC_SELECTION.md`

---

## 8. 今後のTiSLY連携

| 連携先 | 内容 | 状態 |
|--------|------|------|
| ESP | センサー・警報の IoT ゲートウェイ | 計画中 |
| Node-RED | フロー制御・外部連携 | 計画中 |
| TiSLY UI | ダッシュボード・遠隔監視 | 計画中 |
| MQTT | リアルタイムイベント配信 | 計画中 |
| Web Push | スマホ通知 | 計画中 |
| QNAPログ | イベントログ長期保存 | 計画中 |

---

**TiSLY PLC Builder {VERSION} — TOMS_SITE_REPORT**
"""


def site_report_has_basic_info(text: str) -> bool:
    return "## 1. 案件基本情報" in text and "案件名" in text and "PLC型番" in text


def site_report_has_overview(text: str) -> bool:
    return "## 2. 現調概要" in text and "目的" in text


def site_report_has_io_section(text: str) -> bool:
    return "## 3. I/O割り当て" in text and "入力一覧" in text and "出力一覧" in text


def site_report_has_plc_capacity(text: str) -> bool:
    return "## 4. PLC容量確認" in text and "判定" in text and "余裕率" in text


def site_report_has_wiring_notes(text: str) -> bool:
    return "## 5. 配線メモ" in text and "24V系" in text and "GND共通化" in text


def site_report_has_pre_construction(text: str) -> bool:
    return "## 6. 施工前確認事項" in text and "センサー設置位置" in text


def site_report_has_estimate_link(text: str) -> bool:
    return "## 7. 見積連携" in text and "TOMS_ESTIMATE.xlsx" in text


def site_report_has_tisly_integration(text: str) -> bool:
    return "## 8. 今後のTiSLY連携" in text and "MQTT" in text and "ESP" in text
