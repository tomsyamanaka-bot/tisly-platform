#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.10 — TOMS 見積 Excel エクスポーター
TOMS_QUOTE_ITEMS.csv 相当のデータを TOMS_QUOTE.xlsx へ書き出す（openpyxl 不要・stdlib のみ）。
PLC_SELECTION 連携で PLC容量判定シートを含む。
"""

from __future__ import annotations

import io
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape

from parts_mapper import EstimateBuildResult
from plc_selection_generator import (
    VERSION,
    PlcSelectionResult,
    analyze_plc_selection,
    plc_capacity_excel_rows,
)
from quote_mapper import TOMS_HEADER, parse_toms_quote_items_csv

SHEET_NAME = "見積明細"
INFO_SHEET_NAME = "案件情報"
PLC_SHEET_NAME = "PLC容量判定"


def _col_letter(index: int) -> str:
    """1-based column index → Excel column letter (A, B, …, AA)."""
    result = ""
    while index > 0:
        index, rem = divmod(index - 1, 26)
        result = chr(65 + rem) + result
    return result


def _cell_ref(row: int, col: int) -> str:
    return f"{_col_letter(col)}{row}"


def _sheet_xml(headers: tuple[str, ...], rows: list[tuple[str, ...]]) -> str:
    """worksheet XML を生成する。"""
    row_xmls: list[str] = []
    all_rows = [headers] + list(rows)
    for row_idx, row in enumerate(all_rows, start=1):
        cells: list[str] = []
        for col_idx, value in enumerate(row, start=1):
            ref = _cell_ref(row_idx, col_idx)
            text = escape(str(value))
            cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{text}</t></is></c>')
        row_xmls.append(f'<row r="{row_idx}">{"".join(cells)}</row>')
    dimension = f"A1:{_col_letter(len(headers))}{len(all_rows)}"
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<dimension ref="{dimension}"/>'
        "<sheetData>"
        f'{"".join(row_xmls)}'
        "</sheetData>"
        "</worksheet>"
    )


def _info_sheet_xml(result: EstimateBuildResult, item_count: int) -> str:
    """案件情報シート XML を生成する。"""
    memo = result.memo
    estimation = result.estimation
    plc_model = result.assignment.customer.plc_model
    power_model = estimation.power_model
    project_title = memo.project_title or memo.project_name
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    info_rows = [
        ("項目", "内容"),
        ("案件名", project_title),
        ("目的", memo.purpose or "—"),
        ("PLC型番", plc_model),
        ("電源型番", f"MeanWell {power_model}"),
        ("入力点数", str(len(result.assignment.inputs))),
        ("出力点数", str(len(result.assignment.outputs))),
        ("見積項目数", str(item_count)),
        ("生成日時", now),
        ("Builder", f"TiSLY PLC Builder {VERSION}"),
    ]
    return _sheet_xml(("項目", "内容"), info_rows[1:])


def _plc_capacity_sheet_xml(plc_selection: PlcSelectionResult) -> str:
    """PLC容量判定シート XML を生成する。"""
    rows = plc_capacity_excel_rows(plc_selection)
    return _sheet_xml(("項目", "内容"), rows)


def _workbook_xml(sheet_names: list[str]) -> str:
    sheets_xml = "".join(
        f'<sheet name="{escape(name)}" sheetId="{idx}" r:id="rId{idx}"/>'
        for idx, name in enumerate(sheet_names, start=1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f"<sheets>{sheets_xml}</sheets>"
        "</workbook>"
    )


def _workbook_rels_xml(sheet_count: int) -> str:
    rels = "".join(
        f'<Relationship Id="rId{idx}" '
        f'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
        f'Target="worksheets/sheet{idx}.xml"/>'
        for idx in range(1, sheet_count + 1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f"{rels}"
        "</Relationships>"
    )


def _root_rels_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="xl/workbook.xml"/>'
        "</Relationships>"
    )


def _content_types_xml(sheet_count: int) -> str:
    overrides = "".join(
        f'<Override PartName="/xl/worksheets/sheet{idx}.xml" '
        f'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for idx in range(1, sheet_count + 1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        f"{overrides}"
        "</Types>"
    )


def build_toms_quote_xlsx_bytes(
    toms_items_csv_text: str,
    result: EstimateBuildResult,
    plc_selection: PlcSelectionResult | None = None,
) -> bytes:
    """TOMS 見積 xlsx をバイト列で生成する。"""
    items = parse_toms_quote_items_csv(toms_items_csv_text)
    data_rows: list[tuple[str, ...]] = []
    for row in items:
        data_rows.append(
            (
                row.get("No", ""),
                row.get("ItemName", ""),
                row.get("Model", ""),
                row.get("Qty", ""),
                row.get("UnitPrice", ""),
                row.get("Amount", ""),
                row.get("Note", ""),
            )
        )

    if plc_selection is None:
        plc_selection = analyze_plc_selection(
            result.assignment.customer.plc_model,
            len(result.assignment.inputs),
            len(result.assignment.outputs),
        )

    sheet_names = [SHEET_NAME, INFO_SHEET_NAME, PLC_SHEET_NAME]
    sheet_xmls = [
        _sheet_xml(TOMS_HEADER, data_rows),
        _info_sheet_xml(result, len(items)),
        _plc_capacity_sheet_xml(plc_selection),
    ]

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", _content_types_xml(len(sheet_names)))
        zf.writestr("_rels/.rels", _root_rels_xml())
        zf.writestr("xl/workbook.xml", _workbook_xml(sheet_names))
        zf.writestr("xl/_rels/workbook.xml.rels", _workbook_rels_xml(len(sheet_names)))
        for idx, xml in enumerate(sheet_xmls, start=1):
            zf.writestr(f"xl/worksheets/sheet{idx}.xml", xml)

    return buffer.getvalue()


def write_toms_quote_xlsx(
    path: Path,
    toms_items_csv_text: str,
    result: EstimateBuildResult,
) -> Path:
    """TOMS_QUOTE.xlsx をファイルに書き出す。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(build_toms_quote_xlsx_bytes(toms_items_csv_text, result))
    return path


def is_valid_xlsx(path: Path) -> bool:
    """xlsx が ZIP 形式で必須パーツを含むか検証する。"""
    if not path.is_file() or path.stat().st_size < 100:
        return False
    required = (
        "[Content_Types].xml",
        "xl/workbook.xml",
        "xl/worksheets/sheet1.xml",
    )
    try:
        with zipfile.ZipFile(path, "r") as zf:
            names = set(zf.namelist())
            return all(part in names for part in required)
    except zipfile.BadZipFile:
        return False


def xlsx_contains_text(path: Path, text: str) -> bool:
    """xlsx 内の XML に指定文字列が含まれるか（監査用）。"""
    if not is_valid_xlsx(path):
        return False
    try:
        with zipfile.ZipFile(path, "r") as zf:
            for name in zf.namelist():
                if name.endswith(".xml"):
                    if text in zf.read(name).decode("utf-8", errors="replace"):
                        return True
    except (zipfile.BadZipFile, OSError):
        return False
    return False


def xlsx_has_plc_capacity_section(path: Path) -> bool:
    """xlsx に PLC容量判定シートがあるか（監査用）。"""
    from plc_selection_generator import xlsx_has_plc_capacity

    return xlsx_has_plc_capacity(path)


def xlsx_row_count(path: Path) -> int:
    """sheet1 の行数（<row> タグ数）。"""
    if not is_valid_xlsx(path):
        return 0
    try:
        with zipfile.ZipFile(path, "r") as zf:
            xml = zf.read("xl/worksheets/sheet1.xml").decode("utf-8", errors="replace")
            return xml.count("<row ")
    except (zipfile.BadZipFile, KeyError, OSError):
        return 0
