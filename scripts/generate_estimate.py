#!/usr/bin/env python3
"""
TOMS Phase 2-2 — 見積書自動生成

案件番号を指定 → Notion データ取得 → Excel 生成 → PDF 変換 → QNAP保存 → ステータス更新 → 管理者メール通知

使用例:
  python scripts/generate_estimate.py TOMS-0001
  python scripts/generate_estimate.py TOMS-0001 --no-email
  python scripts/generate_estimate.py TOMS-0001 --dry-run
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import replace
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from case_status import STATUS_AFTER_ESTIMATE  # noqa: E402
from config import load_config  # noqa: E402
from email_notifier import send_admin_notification  # noqa: E402
from excel_builder import build_estimate_xlsx, resolve_output_dir  # noqa: E402
from notion_client import NotionClient  # noqa: E402
from pdf_converter import convert_xlsx_to_pdf  # noqa: E402
from qnap_uploader import upload_case_files  # noqa: E402

XLSX_NAME = "見積書.xlsx"
PDF_NAME = "見積書.pdf"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Notion 現調データから TOMS 標準見積書（xlsx/pdf）を生成します。",
    )
    parser.add_argument(
        "case_number",
        help="案件番号（例: TOMS-0001）",
    )
    parser.add_argument(
        "--no-email",
        action="store_true",
        help="管理者メールを送信しない",
    )
    parser.add_argument(
        "--email",
        action="store_true",
        help="管理者メールを送信する（TOMS_SEND_EMAIL=true と同等）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="データ取得のみ実行し、ファイル出力・メール送信を行わない",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="出力先ディレクトリを上書き指定",
    )
    parser.add_argument(
        "--no-qnap",
        action="store_true",
        help="QNAP 保存をスキップ",
    )
    parser.add_argument(
        "--no-status",
        action="store_true",
        help="案件ステータス更新をスキップ",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config = load_config()

    if args.email:
        config = replace(config, send_email=True)
    if args.no_email:
        config = replace(config, send_email=False)

    client = NotionClient(config)

    print(f"[1/6] Notion データ取得: {args.case_number}")
    try:
        data = client.fetch_estimate(args.case_number)
    except FileNotFoundError as exc:
        print(f"エラー: {exc}", file=sys.stderr)
        return 1
    except ValueError as exc:
        print(f"エラー: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Notion API エラー: {exc}", file=sys.stderr)
        return 1

    print(f"  顧客: {data.customer_name}")
    print(f"  案件: {data.case_name}")
    print(f"  明細: {len(data.items)} 件")
    print(f"  税込合計: {data.total:,} 円")

    if args.dry_run:
        print("dry-run のため出力をスキップしました。")
        return 0

    out_dir = args.output_dir or resolve_output_dir(data, config)
    xlsx_path = out_dir / XLSX_NAME
    pdf_path = out_dir / PDF_NAME

    print(f"[2/6] Excel 生成: {xlsx_path}")
    try:
        build_estimate_xlsx(data, config, xlsx_path)
    except Exception as exc:
        print(f"Excel 生成エラー: {exc}", file=sys.stderr)
        return 1

    print(f"[3/6] PDF 変換: {pdf_path}")
    try:
        convert_xlsx_to_pdf(xlsx_path, pdf_path, data)
    except Exception as exc:
        print(f"PDF 変換エラー: {exc}", file=sys.stderr)
        return 1

    print(f"[4/6] QNAP 保存")
    if config.qnap_enabled and not args.no_qnap:
        try:
            plan = upload_case_files(
                config,
                data.customer_folder,
                data.case_name,
                data.case_number,
                estimate_xlsx=xlsx_path,
                estimate_pdf=pdf_path,
            )
            for src, dest in plan.copied:
                print(f"  {src.name} → {dest}")
        except Exception as exc:
            print(f"QNAP 保存エラー: {exc}", file=sys.stderr)
            return 1
    else:
        print("  スキップ")

    print(f"[5/6] 案件ステータス更新 → {STATUS_AFTER_ESTIMATE.value}")
    if not args.no_status:
        try:
            client.update_case_status(args.case_number, STATUS_AFTER_ESTIMATE)
        except Exception as exc:
            print(f"ステータス更新エラー: {exc}", file=sys.stderr)
            return 1
    else:
        print("  スキップ")

    print(f"[6/6] 管理者通知")
    if config.send_email:
        try:
            send_admin_notification(data, config, xlsx_path, pdf_path)
            print(f"  メール送信完了: {config.admin_email}")
        except Exception as exc:
            print(f"メール送信エラー: {exc}", file=sys.stderr)
            return 1
    else:
        print("  メール送信スキップ（--email または TOMS_SEND_EMAIL=true で有効化）")

    print("\n[OK] 見積生成完了")
    print(f"  Excel: {xlsx_path}")
    print(f"  PDF:   {pdf_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
