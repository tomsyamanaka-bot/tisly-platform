#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.12 — TOMS 標準見積書ジェネレーター
TOMS_QUOTE_ITEMS.csv + estimate_header.json → TOMS_ESTIMATE.xlsx（stdlib のみ）。
"""

from __future__ import annotations

import io
import json
import zipfile
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

from cost_estimator import TAX_RATE
from parts_mapper import EstimateBuildResult
from quote_mapper import parse_toms_quote_items_csv

VERSION = "v5.12"
DEFAULT_HEADER_PATH = Path(__file__).resolve().parent / "estimate_header.json"

SHEET_NAME = "見積書"

# TOMS 標準フォーマット セルマッピング（1-based row, col）
CELL_ISSUE_DATE = (1, 7)       # G1  発行日
CELL_ESTIMATE_NO = (2, 7)      # G2  見積番号
CELL_CUSTOMER = (6, 3)         # C6  宛名
CELL_PROJECT = (9, 4)          # D9  件名
CELL_HEADER_TOTAL = (17, 4)    # D17 税込合計（ヘッダー部）
CELL_SUBTOTAL = (47, 7)        # G47 小計
CELL_TAX = (48, 7)             # G48 消費税
CELL_GRAND_TOTAL = (49, 7)     # G49 税込合計

ITEM_HEADER_ROW = 11
ITEM_START_ROW = 12
ITEM_COL_NO = 1
ITEM_COL_NAME = 2
ITEM_COL_QTY = 3
ITEM_COL_UNIT_PRICE = 4
ITEM_COL_AMOUNT = 5

REMARKS_START_ROW = 51

DEFAULT_REMARKS: tuple[str, ...] = (
    "・価格は仮単価です",
    "・正式見積前に現地確認が必要です",
    "・PLC容量判定結果を反映しています",
    "・増設時は再見積を推奨します",
)

SUMMARY_LABELS = ("小計", "消費税", "税込合計")


def _col_letter(index: int) -> str:
    result = ""
    while index > 0:
        index, rem = divmod(index - 1, 26)
        result = chr(65 + rem) + result
    return result


def _cell_ref(row: int, col: int) -> str:
    return f"{_col_letter(col)}{row}"


def load_estimate_header(path: Path | None = None) -> dict[str, str]:
    """estimate_header.json を読み込む。"""
    header_path = path or DEFAULT_HEADER_PATH
    if not header_path.is_file():
        return {
            "company_name": "TiSLY株式会社",
            "customer_name": "",
            "project_name": "",
            "issue_date": "",
            "estimate_no": "",
            "person_in_charge": "",
        }
    data = json.loads(header_path.read_text(encoding="utf-8"))
    return {k: str(v) if v is not None else "" for k, v in data.items()}


def build_estimate_header(
    result: EstimateBuildResult,
    header_path: Path | None = None,
) -> dict[str, str]:
    """見積案件情報から estimate_header 辞書を組み立てる。"""
    base = load_estimate_header(header_path)
    memo = result.memo
    customer = result.assignment.customer
    today = date.today().strftime("%Y-%m-%d")
    project_title = memo.project_title or memo.project_name or customer.site

    if not base.get("company_name"):
        base["company_name"] = customer.company or "TiSLY株式会社"
    if not base.get("customer_name"):
        base["customer_name"] = customer.site or project_title
    if not base.get("project_name"):
        base["project_name"] = project_title
    if not base.get("issue_date"):
        base["issue_date"] = today
    if not base.get("estimate_no"):
        safe_name = (memo.project_name or "EST")[:8].upper()
        base["estimate_no"] = f"TE-{today.replace('-', '')}-{safe_name}"
    if not base.get("person_in_charge"):
        base["person_in_charge"] = "TiSLY PLC Builder"

    return base


def _compute_totals(items: list[dict[str, str]]) -> tuple[int, int, int]:
    subtotal = 0
    for row in items:
        amount_str = (row.get("Amount") or "").strip()
        if amount_str.isdigit():
            subtotal += int(amount_str)
    tax = int(subtotal * TAX_RATE)
    return subtotal, tax, subtotal + tax


def _format_yen(value: int) -> str:
    return f"{value:,}"


def _sparse_sheet_xml(cells: dict[tuple[int, int], str]) -> str:
    """セル座標辞書から worksheet XML を生成する。"""
    if not cells:
        cells = {(1, 1): ""}

    max_row = max(r for r, _ in cells)
    max_col = max(c for _, c in cells)
    row_xmls: list[str] = []

    for row_idx in range(1, max_row + 1):
        row_cells: list[str] = []
        for col_idx in range(1, max_col + 1):
            if (row_idx, col_idx) not in cells:
                continue
            value = cells[(row_idx, col_idx)]
            ref = _cell_ref(row_idx, col_idx)
            text = escape(str(value))
            row_cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{text}</t></is></c>')
        if row_cells:
            row_xmls.append(f'<row r="{row_idx}">{"".join(row_cells)}</row>')

    dimension = f"A1:{_col_letter(max_col)}{max_row}"
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<dimension ref="{dimension}"/>'
        "<sheetData>"
        f'{"".join(row_xmls)}'
        "</sheetData>"
        "</worksheet>"
    )


def _workbook_xml(sheet_name: str) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets><sheet name="{escape(sheet_name)}" sheetId="1" r:id="rId1"/></sheets>'
        "</workbook>"
    )


def _workbook_rels_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
        'Target="worksheets/sheet1.xml"/>'
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


def _content_types_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        "</Types>"
    )


def build_toms_estimate_xlsx_bytes(
    toms_items_csv_text: str,
    header: dict[str, str],
) -> bytes:
    """TOMS 標準見積書 xlsx をバイト列で生成する。"""
    items = parse_toms_quote_items_csv(toms_items_csv_text)
    subtotal, tax, total = _compute_totals(items)

    cells: dict[tuple[int, int], str] = {}

    cells[(1, 1)] = header.get("company_name", "")
    cells[CELL_ISSUE_DATE] = header.get("issue_date", "")
    cells[CELL_ESTIMATE_NO] = header.get("estimate_no", "")
    cells[(3, 1)] = "見 積 書"
    cells[CELL_CUSTOMER] = f"{header.get('customer_name', '')} 御中"
    cells[(7, 1)] = f"担当: {header.get('person_in_charge', '')}"
    cells[(8, 1)] = "件名"
    cells[CELL_PROJECT] = header.get("project_name", "")
    cells[(16, 1)] = "税込合計"
    cells[CELL_HEADER_TOTAL] = f"¥{_format_yen(total)}"

    cells[(ITEM_HEADER_ROW, ITEM_COL_NO)] = "No"
    cells[(ITEM_HEADER_ROW, ITEM_COL_NAME)] = "項目"
    cells[(ITEM_HEADER_ROW, ITEM_COL_QTY)] = "数量"
    cells[(ITEM_HEADER_ROW, ITEM_COL_UNIT_PRICE)] = "単価"
    cells[(ITEM_HEADER_ROW, ITEM_COL_AMOUNT)] = "金額"

    for idx, row in enumerate(items):
        r = ITEM_START_ROW + idx
        cells[(r, ITEM_COL_NO)] = row.get("No", "")
        cells[(r, ITEM_COL_NAME)] = row.get("ItemName", "")
        cells[(r, ITEM_COL_QTY)] = row.get("Qty", "")
        cells[(r, ITEM_COL_UNIT_PRICE)] = row.get("UnitPrice", "")
        cells[(r, ITEM_COL_AMOUNT)] = row.get("Amount", "")

    cells[(46, 6)] = SUMMARY_LABELS[0]
    cells[CELL_SUBTOTAL] = str(subtotal)
    cells[(47, 6)] = SUMMARY_LABELS[1]
    cells[CELL_TAX] = str(tax)
    cells[(48, 6)] = SUMMARY_LABELS[2]
    cells[CELL_GRAND_TOTAL] = str(total)

    cells[(REMARKS_START_ROW, 1)] = "〈備考〉"
    for i, remark in enumerate(DEFAULT_REMARKS):
        cells[(REMARKS_START_ROW + 1 + i, 1)] = remark

    sheet_xml = _sparse_sheet_xml(cells)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", _content_types_xml())
        zf.writestr("_rels/.rels", _root_rels_xml())
        zf.writestr("xl/workbook.xml", _workbook_xml(SHEET_NAME))
        zf.writestr("xl/_rels/workbook.xml.rels", _workbook_rels_xml())
        zf.writestr("xl/worksheets/sheet1.xml", sheet_xml)

    return buffer.getvalue()


def write_toms_estimate_xlsx(
    path: Path,
    toms_items_csv_text: str,
    result: EstimateBuildResult,
    *,
    header_path: Path | None = None,
) -> Path:
    """TOMS_ESTIMATE.xlsx をファイルに書き出す。"""
    header = build_estimate_header(result, header_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(build_toms_estimate_xlsx_bytes(toms_items_csv_text, header))
    return path


def is_valid_xlsx(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 100:
        return False
    required = ("[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml")
    try:
        with zipfile.ZipFile(path, "r") as zf:
            names = set(zf.namelist())
            return all(part in names for part in required)
    except zipfile.BadZipFile:
        return False


def xlsx_contains_text(path: Path, text: str) -> bool:
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


def xlsx_has_estimate_items(path: Path, expected_count: int) -> bool:
    """明細行が期待数以上含まれるか。"""
    if not is_valid_xlsx(path) or expected_count < 1:
        return False
    try:
        with zipfile.ZipFile(path, "r") as zf:
            xml = zf.read("xl/worksheets/sheet1.xml").decode("utf-8", errors="replace")
            return "PLC" in xml and xml.count("<row ") >= ITEM_START_ROW + expected_count - 1
    except (zipfile.BadZipFile, KeyError, OSError):
        return False


def xlsx_has_summary_totals(path: Path) -> bool:
    if not is_valid_xlsx(path):
        return False
    return all(xlsx_contains_text(path, label) for label in SUMMARY_LABELS)


def xlsx_has_remarks(path: Path) -> bool:
    if not is_valid_xlsx(path):
        return False
    return (
        xlsx_contains_text(path, "〈備考〉")
        and xlsx_contains_text(path, DEFAULT_REMARKS[0])
        and xlsx_contains_text(path, DEFAULT_REMARKS[-1])
    )
