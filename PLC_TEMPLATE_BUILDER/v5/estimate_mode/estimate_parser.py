#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.4 — 見積メモパーサー
現場メモ・見積書形式のテキストから案件情報と機器数量を抽出する。
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class EstimateMemo:
    """見積メモから抽出した構造化データ。"""

    raw_text: str = ""
    project_title: str = ""
    project_name: str = ""
    plc_model: str = ""
    purpose: str = ""
    power_supply: str = "自動選定"
    parts: dict[str, int] = field(default_factory=dict)
    raw_lines: list[str] = field(default_factory=list)


# 見積メモ行 → (内部キー, 正規表現パターン)
PART_LINE_PATTERNS: list[tuple[str, str]] = [
    ("infrared", r"赤外線(?:ビーム|センサー)?"),
    ("pir", r"人感(?:センサー)?|PIR|近接(?:センサー)?"),
    ("patlite", r"パトライト|回転灯|警報(?:ランプ|灯)"),
    ("white_led", r"白色?\s*LED|白(?:色)?灯|LED(?:照明)?"),
    ("estop", r"非常(?:停止|停止ボタン|停止スイッチ)?"),
    ("buzzer", r"ブザー|警報(?:音|ブザー)"),
    ("magnet", r"マグネット|ドアセンサー"),
    ("arm_switch", r"警戒(?:スイッチ)?"),
    ("night_arm", r"夜間(?:警戒|監視)"),
    ("shutter", r"シャッター(?:開閉)?(?:センサー)?"),
    ("safety_curtain", r"安全カーテン"),
    ("entrance", r"入口(?:赤外線)?"),
    ("exit", r"出口(?:赤外線)?"),
    ("intrusion", r"侵入(?:センサー)?"),
    ("cleaning", r"清掃(?:モード)?"),
    ("checkin", r"チェックイン"),
    ("line_start", r"ライン起動|起動(?:スイッチ)?"),
    ("equipment_fault", r"設備異常(?:入力)?"),
    ("full_sign", r"満室(?:表示)?"),
    ("conveyor_stop", r"搬送停止"),
    ("warning_light", r"安全警告灯"),
]

HEADER_PATTERNS: list[tuple[str, str]] = [
    ("project_title", r"案件名"),
    ("plc_model", r"PLC(?:型番)?"),
    ("purpose", r"目的"),
    ("power_supply", r"24V(?:電源|電源ユニット)"),
]


def normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    return normalized.strip()


def _extract_quantity(value: str) -> int | None:
    """「4本」「2台」「1個」「自動選定」等から数量を抽出。"""
    value = value.strip()
    if not value or "自動" in value:
        return None
    match = re.search(r"(\d+)", value)
    if match:
        return max(0, int(match.group(1)))
    return 1 if value else None


def _sanitize_project_name(title: str) -> str:
    """案件名からフォルダ名を生成する。"""
    title_norm = normalize_text(title)
    if "車屋" in title_norm or "展示" in title_norm or "カーショップ" in title_norm:
        if "夜間" in title_norm or "監視" in title_norm:
            return "CARSHOP_NIGHT_SECURITY"
        return "CARSHOP_SECURITY"
    if "倉庫" in title_norm or "物流" in title_norm:
        return "WAREHOUSE_SECURITY"
    if "民泊" in title_norm:
        return "MINPAKU_COUNTER"
    if "工場" in title_norm or "ライン" in title_norm:
        return "FACTORY_SAFETY"
    if "自宅" in title_norm or "住宅" in title_norm:
        return "HOME_SECURITY"
    sanitized = re.sub(r"[^\w\u3040-\u30ff\u4e00-\u9fff]+", "_", title_norm).strip("_")
    return sanitized.upper() or "PLC_PROJECT"


def _parse_line(line: str) -> tuple[str, str] | None:
    """「キー：値」または「キー: 値」形式を解析。"""
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    match = re.match(r"^(.+?)\s*[：:]\s*(.+)$", line)
    if match:
        return match.group(1).strip(), match.group(2).strip()
    return None


def _match_part_key(label: str) -> str | None:
    label_norm = normalize_text(label).lower()
    for key, pattern in PART_LINE_PATTERNS:
        if re.search(pattern, label_norm, re.IGNORECASE):
            return key
    return None


def _match_header_key(label: str) -> str | None:
    label_norm = normalize_text(label)
    for key, pattern in HEADER_PATTERNS:
        if re.search(pattern, label_norm, re.IGNORECASE):
            return key
    return None


def parse_estimate_memo(text: str) -> EstimateMemo:
    """見積メモテキストを解析して EstimateMemo を返す。"""
    memo = EstimateMemo(raw_text=text)
    lines = [ln.strip() for ln in text.strip().splitlines() if ln.strip() and not ln.strip().startswith("#")]
    memo.raw_lines = lines

    for line in lines:
        parsed = _parse_line(line)
        if not parsed:
            continue
        label, value = parsed

        header_key = _match_header_key(label)
        if header_key == "project_title":
            memo.project_title = value
            memo.project_name = _sanitize_project_name(value)
        elif header_key == "plc_model":
            memo.plc_model = value
        elif header_key == "purpose":
            memo.purpose = value
        elif header_key == "power_supply":
            memo.power_supply = value
        else:
            part_key = _match_part_key(label)
            if part_key:
                qty = _extract_quantity(value)
                if qty is not None:
                    memo.parts[part_key] = memo.parts.get(part_key, 0) + qty

    if not memo.project_title and lines:
        first = _parse_line(lines[0])
        if first:
            memo.project_title = first[1]
            memo.project_name = _sanitize_project_name(first[1])

    if not memo.purpose:
        memo.purpose = memo.project_title or "PLC自動生成案件"

    if not memo.plc_model:
        memo.plc_model = "FX5UJ-24MR/ES"

    return memo


def parse_estimate_file(path: Path) -> EstimateMemo:
    """見積メモファイルを読み込んで解析する。"""
    if not path.is_file():
        raise FileNotFoundError(f"見積ファイルが見つかりません: {path}")
    text = path.read_text(encoding="utf-8")
    return parse_estimate_memo(text)


def format_parsed_summary(memo: EstimateMemo) -> str:
    """解析結果のサマリーをテキストで返す。"""
    lines = [
        f"案件名: {memo.project_title}",
        f"フォルダ名: {memo.project_name}",
        f"PLC: {memo.plc_model}",
        f"目的: {memo.purpose}",
        f"24V電源: {memo.power_supply}",
        "--- 機器数量 ---",
    ]
    for key, qty in sorted(memo.parts.items()):
        lines.append(f"  {key}: {qty}")
    return "\n".join(lines)
