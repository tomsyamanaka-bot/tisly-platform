"""TOMS 見積生成 — PDF 変換（xlsx → pdf）"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from notion_client import EstimateData, InvoiceData

from config import TomsConfig


def convert_xlsx_to_pdf(xlsx_path: Path, pdf_path: Path, data: EstimateData) -> Path:
    """
    見積書.xlsx を PDF に変換する。

    優先順位:
      1. LibreOffice (soffice)
      2. Windows Excel COM
      3. reportlab フォールバック（同一データから PDF 生成）
    """
    pdf_path.parent.mkdir(parents=True, exist_ok=True)

    if _try_libreoffice(xlsx_path, pdf_path):
        return pdf_path
    if sys.platform == "win32" and _try_excel_com(xlsx_path, pdf_path):
        return pdf_path

    return _generate_pdf_reportlab(pdf_path, data)


def _try_libreoffice(xlsx_path: Path, pdf_path: Path) -> bool:
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        return False

    out_dir = pdf_path.parent
    try:
        subprocess.run(
            [
                soffice,
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                str(out_dir),
                str(xlsx_path.resolve()),
            ],
            check=True,
            capture_output=True,
            timeout=120,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        return False

    generated = out_dir / f"{xlsx_path.stem}.pdf"
    if generated.is_file() and generated != pdf_path:
        generated.replace(pdf_path)
    return pdf_path.is_file()


def _try_excel_com(xlsx_path: Path, pdf_path: Path) -> bool:
    try:
        import win32com.client  # type: ignore[import-untyped]
    except ImportError:
        return False

    excel = None
    try:
        excel = win32com.client.Dispatch("Excel.Application")
        excel.Visible = False
        excel.DisplayAlerts = False
        wb = excel.Workbooks.Open(str(xlsx_path.resolve()))
        wb.ExportAsFixedFormat(0, str(pdf_path.resolve()))
        wb.Close(False)
        return pdf_path.is_file()
    except Exception:
        return False
    finally:
        if excel is not None:
            excel.Quit()


def _register_japanese_font() -> str:
    """Windows 標準フォントを reportlab に登録する。"""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    candidates = [
        Path(r"C:\Windows\Fonts\msgothic.ttc"),
        Path(r"C:\Windows\Fonts\meiryo.ttc"),
        Path(r"C:\Windows\Fonts\YuGothM.ttc"),
    ]
    for font_path in candidates:
        if font_path.is_file():
            try:
                pdfmetrics.registerFont(TTFont("Japanese", str(font_path)))
                return "Japanese"
            except Exception:
                continue
    return "Helvetica"


def convert_invoice_xlsx_to_pdf(xlsx_path: Path, pdf_path: Path, data: InvoiceData) -> Path:
    """請求書.xlsx を PDF に変換する。"""
    pdf_path.parent.mkdir(parents=True, exist_ok=True)

    if _try_libreoffice(xlsx_path, pdf_path):
        return pdf_path
    if sys.platform == "win32" and _try_excel_com(xlsx_path, pdf_path):
        return pdf_path

    return _generate_invoice_pdf_reportlab(pdf_path, data)


def _generate_invoice_pdf_reportlab(pdf_path: Path, data: InvoiceData) -> Path:
    """reportlab で請求書 PDF を生成。"""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    font_name = _register_japanese_font()
    pdf_path.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "InvoiceTitle",
        parent=styles["Heading1"],
        fontName=font_name,
        fontSize=18,
        alignment=1,
        spaceAfter=12,
    )
    normal = ParagraphStyle("NormalJP", parent=styles["Normal"], fontName=font_name, fontSize=9)
    story: list = []

    story.append(Paragraph(data.customer_name or "—", normal))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("請 求 書", title_style))
    story.append(Spacer(1, 6 * mm))

    meta = [
        ["請求日", data.issue_date, "請求番号", data.invoice_no],
        ["件名", data.case_name, "税込合計", f"¥{data.total:,}"],
        ["支払期限", data.due_date, "案件番号", data.case_number],
    ]
    meta_table = Table(meta, colWidths=[25 * mm, 55 * mm, 25 * mm, 55 * mm])
    meta_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), font_name),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BACKGROUND", (0, 0), (0, -1), colors.whitesmoke),
                ("BACKGROUND", (2, 0), (2, -1), colors.whitesmoke),
            ]
        )
    )
    story.append(meta_table)
    story.append(Spacer(1, 8 * mm))

    table_data: list[list] = [["No", "項目", "数量", "単価", "金額"]]
    for idx, item in enumerate(data.items, start=1):
        table_data.append(
            [
                str(idx),
                item.item_name,
                str(item.quantity),
                f"{item.unit_price:,}",
                f"{item.amount:,}",
            ]
        )
    table_data.extend(
        [
            ["", "", "", "小計", f"{data.subtotal:,}"],
            ["", "", "", "消費税", f"{data.tax:,}"],
            ["", "", "", "税込合計", f"{data.total:,}"],
        ]
    )

    detail = Table(
        table_data,
        colWidths=[10 * mm, 75 * mm, 15 * mm, 25 * mm, 25 * mm],
        repeatRows=1,
    )
    detail.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), font_name),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#C00000")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, len(data.items)), 0.5, colors.grey),
                ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story.append(detail)
    story.append(Spacer(1, 8 * mm))

    remarks = data.remarks or ["・上記の通りご請求申し上げます"]
    story.append(Paragraph("〈備考〉", ParagraphStyle("RemarksHead", parent=styles["Heading3"], fontName=font_name)))
    for remark in remarks:
        story.append(Paragraph(remark, normal))

    doc.build(story)
    return pdf_path


def _generate_pdf_reportlab(pdf_path: Path, data: EstimateData) -> Path:
    """reportlab で見積書 PDF を生成（Excel 変換のフォールバック）。"""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    font_name = _register_japanese_font()

    pdf_path.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "EstimateTitle",
        parent=styles["Heading1"],
        fontName=font_name,
        fontSize=18,
        alignment=1,
        spaceAfter=12,
    )
    normal = ParagraphStyle("NormalJP", parent=styles["Normal"], fontName=font_name, fontSize=9)
    story: list = []

    story.append(Paragraph(data.customer_name or "—", normal))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("見 積 書", title_style))
    story.append(Spacer(1, 6 * mm))

    meta = [
        ["発行日", data.issue_date, "見積番号", data.estimate_no],
        ["件名", data.case_name, "税込合計", f"¥{data.total:,}"],
        ["担当", data.person_in_charge, "案件番号", data.case_number],
    ]
    meta_table = Table(meta, colWidths=[25 * mm, 55 * mm, 25 * mm, 55 * mm])
    meta_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), font_name),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BACKGROUND", (0, 0), (0, -1), colors.whitesmoke),
                ("BACKGROUND", (2, 0), (2, -1), colors.whitesmoke),
            ]
        )
    )
    story.append(meta_table)
    story.append(Spacer(1, 8 * mm))

    table_data: list[list] = [["No", "項目", "数量", "単価", "金額"]]
    for idx, item in enumerate(data.items, start=1):
        table_data.append(
            [
                str(idx),
                item.item_name,
                str(item.quantity),
                f"{item.unit_price:,}",
                f"{item.amount:,}",
            ]
        )
    table_data.extend(
        [
            ["", "", "", "小計", f"{data.subtotal:,}"],
            ["", "", "", "消費税", f"{data.tax:,}"],
            ["", "", "", "税込合計", f"{data.total:,}"],
        ]
    )

    detail = Table(
        table_data,
        colWidths=[10 * mm, 75 * mm, 15 * mm, 25 * mm, 25 * mm],
        repeatRows=1,
    )
    detail.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), font_name),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4472C4")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, len(data.items)), 0.5, colors.grey),
                ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story.append(detail)
    story.append(Spacer(1, 8 * mm))

    remarks = data.remarks or ["・正式見積前に現地確認が必要な場合があります"]
    story.append(Paragraph("〈備考〉", ParagraphStyle("RemarksHead", parent=styles["Heading3"], fontName=font_name)))
    for remark in remarks:
        story.append(Paragraph(remark, normal))

    doc.build(story)
    return pdf_path
