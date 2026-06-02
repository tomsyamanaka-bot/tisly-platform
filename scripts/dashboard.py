#!/usr/bin/env python3
"""
TOMS Phase 2-2 — 営業ダッシュボード生成

現調待ち / 見積待ち / 受注待ち / 施工待ち / 請求待ち / 入金待ち を HTML 表示。

使用例:
  python scripts/dashboard.py
  python scripts/dashboard.py --open
"""

from __future__ import annotations

import argparse
import html
import sys
import webbrowser
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from case_status import DASHBOARD_BUCKETS  # noqa: E402
from config import load_config  # noqa: E402
from notion_client import CaseRecord, NotionClient  # noqa: E402


def _esc(text: str) -> str:
    return html.escape(str(text))


def _bucket_cases(cases: list[CaseRecord], bucket: str) -> list[CaseRecord]:
    statuses = {s.value for s in DASHBOARD_BUCKETS.get(bucket, [])}
    return [c for c in cases if c.status in statuses]


def _render_case_list(cases: list[CaseRecord]) -> str:
    if not cases:
        return "<p class='empty'>該当なし</p>"
    rows = []
    for c in cases:
        rows.append(
            f"<tr>"
            f"<td>{_esc(c.case_number)}</td>"
            f"<td>{_esc(c.case_name)}</td>"
            f"<td>{_esc(c.customer_name)}</td>"
            f"<td>{_esc(c.status)}</td>"
            f"<td>¥{c.total:,}</td>"
            f"</tr>"
        )
    return (
        "<table><thead><tr>"
        "<th>案件番号</th><th>案件名</th><th>顧客</th><th>状態</th><th>金額</th>"
        "</tr></thead><tbody>"
        + "".join(rows)
        + "</tbody></table>"
    )


def build_dashboard_html(cases: list[CaseRecord]) -> str:
    now = datetime.now()
    month_label = now.strftime("%Y年%m月")

    buckets = {}
    for name in DASHBOARD_BUCKETS:
        buckets[name] = _bucket_cases(cases, name)

    kpi_cards = ""
    for name, items in buckets.items():
        kpi_cards += f"""
        <div class="kpi-card">
          <div class="kpi-value">{len(items)}</div>
          <div class="kpi-label">{_esc(name)}</div>
        </div>"""

    sections = ""
    for name, items in buckets.items():
        sections += f"""
        <div class="card">
          <h2>{_esc(name)}（{len(items)}件）</h2>
          {_render_case_list(items)}
        </div>"""

    return f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TOMS 営業ダッシュボード — {month_label}</title>
<style>
  body {{ font-family: "Meiryo", sans-serif; margin: 0; background: #f0f4f8; }}
  .header {{ background: linear-gradient(135deg, #1a365d, #2c5282); color: #fff;
             padding: 1.5rem 2rem; }}
  .header h1 {{ margin: 0; }}
  .header .sub {{ opacity: 0.8; margin-top: 0.25rem; }}
  .container {{ max-width: 1100px; margin: 0 auto; padding: 1.5rem; }}
  .kpi-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
               gap: 1rem; margin-bottom: 1.5rem; }}
  .kpi-card {{ background: #fff; border-radius: 8px; padding: 1.25rem; text-align: center;
               box-shadow: 0 1px 3px rgba(0,0,0,0.08); }}
  .kpi-value {{ font-size: 2rem; font-weight: bold; color: #1a365d; }}
  .kpi-label {{ font-size: 0.85rem; color: #718096; margin-top: 0.25rem; }}
  .card {{ background: #fff; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem;
           box-shadow: 0 1px 3px rgba(0,0,0,0.08); }}
  .card h2 {{ margin-top: 0; font-size: 1rem; color: #2d3748; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 0.85rem; }}
  th, td {{ border: 1px solid #e2e8f0; padding: 0.4rem 0.6rem; text-align: left; }}
  th {{ background: #edf2f7; }}
  .empty {{ color: #a0aec0; font-style: italic; }}
  .footer {{ text-align: center; color: #a0aec0; font-size: 0.8rem; padding: 2rem; }}
</style>
</head>
<body>
<div class="header">
  <h1>📊 TOMS 営業ダッシュボード</h1>
  <div class="sub">{month_label} — 全 {len(cases)} 案件</div>
</div>
<div class="container">
  <div class="kpi-grid">{kpi_cards}</div>
  {sections}
</div>
<div class="footer">TOMS Dashboard — 生成 {now.strftime("%Y-%m-%d %H:%M")}</div>
</body>
</html>"""


def generate_dashboard(config=None, output_path: Path | None = None) -> Path:
    config = config or load_config()
    client = NotionClient(config)
    cases = client.list_cases()

    html_content = build_dashboard_html(cases)
    if output_path is None:
        out_dir = config.output_dir / "dashboard"
        out_dir.mkdir(parents=True, exist_ok=True)
        output_path = out_dir / "index.html"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html_content, encoding="utf-8")
    return output_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="TOMS 営業ダッシュボード HTML を生成します。")
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--open", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        path = generate_dashboard(output_path=args.output)
    except Exception as exc:
        print(f"エラー: {exc}", file=sys.stderr)
        return 1

    print(f"[OK] ダッシュボード生成: {path}")
    if args.open:
        webbrowser.open(path.as_uri())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
