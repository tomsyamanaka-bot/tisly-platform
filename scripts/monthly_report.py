#!/usr/bin/env python3
"""
TOMS Phase 2-2 — 月末処理レポート

出力:
  - 今月売上
  - 今月受注
  - 未請求一覧
  - 未入金一覧
  - 顧客別売上

使用例:
  python scripts/monthly_report.py
  python scripts/monthly_report.py --email
  python scripts/monthly_report.py --month 2026-05
"""

from __future__ import annotations

import argparse
import html
import sys
from collections import defaultdict
from dataclasses import dataclass, field, replace
from datetime import date, datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from case_status import CaseStatus  # noqa: E402
from config import load_config  # noqa: E402
from email_notifier import send_payment_pending_alert, send_uninvoiced_alert  # noqa: E402
from notion_client import CaseRecord, NotionClient  # noqa: E402


@dataclass
class MonthlyReport:
    month: str
    revenue: int = 0
    revenue_cases: list[CaseRecord] = field(default_factory=list)
    orders: int = 0
    order_cases: list[CaseRecord] = field(default_factory=list)
    uninvoiced: list[CaseRecord] = field(default_factory=list)
    unpaid: list[CaseRecord] = field(default_factory=list)
    customer_revenue: dict[str, int] = field(default_factory=dict)


def _in_month(date_str: str, month: str) -> bool:
    if not date_str:
        return False
    return date_str.startswith(month)


def build_monthly_report(cases: list[CaseRecord], month: str | None = None) -> MonthlyReport:
    month = month or date.today().strftime("%Y-%m")
    report = MonthlyReport(month=month)

    customer_totals: dict[str, int] = defaultdict(int)

    for c in cases:
        if c.status == CaseStatus.CONSTRUCTION_DONE.value:
            report.uninvoiced.append(c)

        if c.status == CaseStatus.INVOICED.value and not c.payment_confirmed:
            report.unpaid.append(c)

        if _in_month(c.invoice_date, month) and c.status in (
            CaseStatus.INVOICED.value,
            CaseStatus.COMPLETED.value,
        ):
            report.revenue += c.total
            report.revenue_cases.append(c)
            customer_totals[c.customer_name] += c.total

        if _in_month(c.order_date, month):
            report.orders += 1
            report.order_cases.append(c)

    report.customer_revenue = dict(sorted(customer_totals.items(), key=lambda x: -x[1]))
    return report


def format_report_text(report: MonthlyReport) -> str:
    lines = [
        f"=== TOMS 月末レポート {report.month} ===",
        "",
        f"【今月売上】{report.revenue:,}円（{len(report.revenue_cases)}件）",
    ]
    for c in report.revenue_cases:
        lines.append(f"  ・{c.case_number} {c.case_name} {c.total:,}円")

    lines.extend([
        "",
        f"【今月受注】{report.orders}件",
    ])
    for c in report.order_cases:
        lines.append(f"  ・{c.case_number} {c.case_name}")

    lines.extend([
        "",
        f"【未請求一覧】{len(report.uninvoiced)}件",
    ])
    for c in report.uninvoiced:
        lines.append(f"  ・{c.case_number} {c.case_name}（{c.customer_name}）")

    lines.extend([
        "",
        f"【未入金一覧】{len(report.unpaid)}件",
    ])
    for c in report.unpaid:
        lines.append(f"  ・{c.case_number} {c.case_name} {c.total:,}円")

    lines.extend(["", "【顧客別売上】"])
    for customer, amount in report.customer_revenue.items():
        lines.append(f"  ・{customer}: {amount:,}円")

    return "\n".join(lines)


def format_report_html(report: MonthlyReport) -> str:
    def esc(t: str) -> str:
        return html.escape(str(t))

    def case_rows(cases: list[CaseRecord], show_amount: bool = False) -> str:
        if not cases:
            return "<tr><td colspan='4'>該当なし</td></tr>"
        rows = []
        for c in cases:
            amt = f"¥{c.total:,}" if show_amount else "—"
            rows.append(
                f"<tr><td>{esc(c.case_number)}</td><td>{esc(c.case_name)}</td>"
                f"<td>{esc(c.customer_name)}</td><td>{amt}</td></tr>"
            )
        return "".join(rows)

    cust_rows = ""
    if report.customer_revenue:
        for customer, amount in report.customer_revenue.items():
            cust_rows += f"<tr><td>{esc(customer)}</td><td>¥{amount:,}</td></tr>"
    else:
        cust_rows = "<tr><td colspan='2'>該当なし</td></tr>"

    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    return f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>TOMS 月末レポート {esc(report.month)}</title>
<style>
  body {{ font-family: "Meiryo", sans-serif; margin: 2rem; background: #f5f5f5; }}
  h1 {{ color: #1a365d; }}
  .kpi {{ display: flex; gap: 2rem; margin: 1.5rem 0; }}
  .kpi-item {{ background: #fff; padding: 1rem 1.5rem; border-radius: 8px;
               box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
  .kpi-item .value {{ font-size: 1.5rem; font-weight: bold; }}
  section {{ background: #fff; padding: 1rem; margin: 1rem 0; border-radius: 8px; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th, td {{ border: 1px solid #ddd; padding: 0.5rem; }}
  th {{ background: #edf2f7; }}
</style>
</head>
<body>
<h1>TOMS 月末レポート — {esc(report.month)}</h1>
<div class="kpi">
  <div class="kpi-item"><div class="value">¥{report.revenue:,}</div>今月売上</div>
  <div class="kpi-item"><div class="value">{report.orders}件</div>今月受注</div>
  <div class="kpi-item"><div class="value">{len(report.uninvoiced)}件</div>未請求</div>
  <div class="kpi-item"><div class="value">{len(report.unpaid)}件</div>未入金</div>
</div>
<section><h2>今月売上</h2>
<table><tr><th>案件番号</th><th>案件名</th><th>顧客</th><th>金額</th></tr>
{case_rows(report.revenue_cases, True)}</table></section>
<section><h2>今月受注</h2>
<table><tr><th>案件番号</th><th>案件名</th><th>顧客</th><th></th></tr>
{case_rows(report.order_cases)}</table></section>
<section><h2>未請求一覧</h2>
<table><tr><th>案件番号</th><th>案件名</th><th>顧客</th><th></th></tr>
{case_rows(report.uninvoiced)}</table></section>
<section><h2>未入金一覧</h2>
<table><tr><th>案件番号</th><th>案件名</th><th>顧客</th><th>金額</th></tr>
{case_rows(report.unpaid, True)}</table></section>
<section><h2>顧客別売上</h2>
<table><tr><th>顧客</th><th>売上</th></tr>{cust_rows}</table></section>
<p style="color:#999">生成: {now}</p>
</body></html>"""


def generate_monthly_report(
    month: str | None = None,
    config=None,
    output_dir: Path | None = None,
) -> tuple[Path, Path, MonthlyReport]:
    config = config or load_config()
    client = NotionClient(config)
    cases = client.list_cases()
    report = build_monthly_report(cases, month)

    out_dir = output_dir or config.output_dir / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)

    txt_path = out_dir / f"monthly_{report.month}.txt"
    html_path = out_dir / f"monthly_{report.month}.html"

    txt_path.write_text(format_report_text(report), encoding="utf-8")
    html_path.write_text(format_report_html(report), encoding="utf-8")

    return txt_path, html_path, report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="TOMS 月末レポートを生成します。")
    parser.add_argument("--month", default=None, help="対象月 YYYY-MM（省略時は今月）")
    parser.add_argument("--email", action="store_true", help="未請求・未入金アラートメール送信")
    parser.add_argument("--output-dir", type=Path, default=None)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config = load_config()
    if args.email:
        config = replace(config, send_email=True)

    try:
        txt_path, html_path, report = generate_monthly_report(
            args.month, config, args.output_dir
        )
    except Exception as exc:
        print(f"エラー: {exc}", file=sys.stderr)
        return 1

    print(format_report_text(report))
    print(f"\n[OK] レポート出力:")
    print(f"  TXT:  {txt_path}")
    print(f"  HTML: {html_path}")

    if args.email:
        try:
            send_uninvoiced_alert(report.uninvoiced, config)
            send_payment_pending_alert(report.unpaid, config)
            print("  アラートメール送信完了")
        except Exception as exc:
            print(f"メール送信エラー: {exc}", file=sys.stderr)
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
