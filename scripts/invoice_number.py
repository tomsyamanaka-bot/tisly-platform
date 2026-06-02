"""TOMS Phase 2-2 — 請求番号自動採番（INV-YYYY-NNNN）"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from config import ROOT_DIR

DEFAULT_COUNTER_PATH = ROOT_DIR / "data" / "invoice_counter.json"


def _load_counter(path: Path) -> dict:
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"year": date.today().year, "last_number": 0}


def _save_counter(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def generate_invoice_no(counter_path: Path | None = None, *, reserve: bool = True) -> str:
    """
    請求番号を採番する。

    形式: INV-2026-0001
    reserve=True の場合、カウンターをインクリメントして保存する。
    """
    path = counter_path or DEFAULT_COUNTER_PATH
    today_year = date.today().year
    counter = _load_counter(path)

    if counter.get("year") != today_year:
        counter = {"year": today_year, "last_number": 0}

    next_no = int(counter.get("last_number", 0)) + 1
    invoice_no = f"INV-{today_year}-{next_no:04d}"

    if reserve:
        counter["last_number"] = next_no
        counter["year"] = today_year
        _save_counter(path, counter)

    return invoice_no


def peek_next_invoice_no(counter_path: Path | None = None) -> str:
    """次に採番される請求番号を返す（カウンターは更新しない）。"""
    return generate_invoice_no(counter_path, reserve=False)
