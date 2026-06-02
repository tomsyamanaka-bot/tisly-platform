#!/usr/bin/env python3
"""
TOMS Phase 2-2 — 案件トップページ生成

案件番号から現調・見積・請求・写真をまとめて HTML 表示。

使用例:
  python scripts/case_portal.py TOMS-0001
  python scripts/case_portal.py TOMS-0001 --open
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

from config import load_config  # noqa: E402
from notion_client import CaseSummary, NotionClient, SurveyItem  # noqa: E402
from qnap_uploader import list_qnap_case_files  # noqa: E402


def _esc(text: str) -> str:
    return html.escape(str(text))


def _status_badge(status: str) -> str:
    colors = {
        "現調前": "#6c757d",
        "現調済": "#17a2b8",
        "見積作成中": "#ffc107",
        "見積提出": "#007bff",
        "受注": "#28a745",
        "施工完了": "#fd7e14",
        "請求済": "#dc3545",
        "完了": "#343a40",
    }
    color = colors.get(status, "#6c757d")
    return f'<span class="badge" style="background:{color}">{_esc(status)}</span>'


def _render_survey_table(items: list[SurveyItem]) -> str:
    if not items:
        return "<p>現調データなし</p>"
    rows = []
    for i, item in enumerate(items, 1):
        reflect = "✓" if item.include_in_estimate else "—"
        rows.append(
            f"<tr>"
            f"<td>{i}</td>"
            f"<td>{_esc(item.location)}</td>"
            f"<td>{_esc(item.category)}</td>"
            f"<td>{_esc(item.work_type)}</td>"
            f"<td>{_esc(item.model)}</td>"
            f"<td>{item.quantity}</td>"
            f"<td>{item.amount:,}</td>"
            f"<td>{reflect}</td>"
            f"</tr>"
        )
    return (
        "<table><thead><tr>"
        "<th>No</th><th>場所</th><th>分類</th><th>作業</th>"
        "<th>型式</th><th>数量</th><th>金額</th><th>見積</th>"
        "</tr></thead><tbody>"
        + "".join(rows)
        + "</tbody></table>"
    )


def _render_file_links(files: dict[str, list[Path]]) -> str:
    if not files:
        return "<p>ファイルなし</p>"
    parts = []
    for category, paths in files.items():
        parts.append(f"<h3>{_esc(category)}</h3><ul>")
        for p in paths:
            parts.append(f'<li><a href="file:///{p.as_posix()}">{_esc(p.name)}</a></li>')
        parts.append("</ul>")
    return "".join(parts)


def build_case_portal_html(summary: CaseSummary, qnap_files: dict[str, list[Path]]) -> str:
    r = summary.record
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    photo_section = ""
    if summary.photos:
        photo_section = "<ul>" + "".join(
            f'<li><a href="{_esc(p)}">{_esc(p)}</a></li>' for p in summary.photos
        ) + "</ul>"
    elif qnap_files.get("現調写真"):
        photo_section = "<ul>" + "".join(
            f'<li><a href="file:///{p.as_posix()}">{_esc(p.name)}</a></li>'
            for p in qnap_files["現調写真"]
        ) + "</ul>"
    else:
        photo_section = "<p>写真なし（Phase 2-3 で自動整理予定）</p>"

    docs = []
    for label, path in [
        ("見積書 Excel", summary.estimate_xlsx),
        ("見積書 PDF", summary.estimate_pdf),
        ("請求書 Excel", summary.invoice_xlsx),
        ("請求書 PDF", summary.invoice_pdf),
        ("工事報告書", summary.site_report_pdf),
    ]:
        if path:
            docs.append(f'<li>{label}: <a href="file:///{Path(path).as_posix()}">{_esc(Path(path).name)}</a></li>')

    for category in ("見積書", "請求書", "工事報告書"):
        for p in qnap_files.get(category, []):
            docs.append(
                f'<li>{_esc(category)}: <a href="file:///{p.as_posix()}">{_esc(p.name)}</a></li>'
            )

    docs_html = "<ul>" + "".join(docs) + "</ul>" if docs else "<p>書類未生成</p>"

    return f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_esc(r.case_number)} {_esc(r.case_name)} — TOMS 案件トップ</title>
<style>
  body {{ font-family: "Meiryo", sans-serif; margin: 0; background: #f5f5f5; }}
  .header {{ background: #1a365d; color: #fff; padding: 1.5rem 2rem; }}
  .header h1 {{ margin: 0; font-size: 1.5rem; }}
  .header .meta {{ opacity: 0.85; margin-top: 0.5rem; }}
  .container {{ max-width: 960px; margin: 0 auto; padding: 1.5rem; }}
  .card {{ background: #fff; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem;
           box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
  .card h2 {{ margin-top: 0; font-size: 1.1rem; color: #1a365d; border-bottom: 2px solid #e2e8f0;
              padding-bottom: 0.5rem; }}
  .badge {{ color: #fff; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.85rem; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 0.9rem; }}
  th, td {{ border: 1px solid #e2e8f0; padding: 0.5rem; text-align: left; }}
  th {{ background: #edf2f7; }}
  .kpi {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; }}
  .kpi-item {{ text-align: center; }}
  .kpi-item .value {{ font-size: 1.25rem; font-weight: bold; color: #1a365d; }}
  .kpi-item .label {{ font-size: 0.8rem; color: #718096; }}
  .footer {{ text-align: center; color: #a0aec0; font-size: 0.8rem; padding: 2rem; }}
</style>
</head>
<body>
<div class="header">
  <h1>{_esc(r.case_number)} — {_esc(r.case_name)}</h1>
  <div class="meta">
    {_esc(r.customer_name)} | 担当: {_esc(r.person_in_charge)} | {_status_badge(r.status)}
  </div>
</div>
<div class="container">
  <div class="card">
    <h2>案件概要</h2>
    <div class="kpi">
      <div class="kpi-item"><div class="value">{_esc(r.estimate_no or "—")}</div><div class="label">見積番号</div></div>
      <div class="kpi-item"><div class="value">{_esc(r.invoice_no or "—")}</div><div class="label">請求番号</div></div>
      <div class="kpi-item"><div class="value">¥{r.total:,}</div><div class="label">税込合計</div></div>
      <div class="kpi-item"><div class="value">{"✓" if r.payment_confirmed else "—"}</div><div class="label">入金確認</div></div>
    </div>
    <p style="margin-top:1rem">住所: {_esc(r.address)}</p>
  </div>

  <div class="card">
    <h2>現調</h2>
    {_render_survey_table(summary.survey_items)}
  </div>

  <div class="card">
    <h2>見積・請求</h2>
    {docs_html}
  </div>

  <div class="card">
    <h2>写真</h2>
    {photo_section}
  </div>

  <div class="card">
    <h2>QNAP 保存ファイル</h2>
    {_render_file_links(qnap_files)}
  </div>
</div>
<div class="footer">TOMS 案件トップ — 生成日時 {now}</div>
</body>
</html>"""


def generate_case_portal(
    case_number: str,
    config=None,
    output_path: Path | None = None,
) -> Path:
    config = config or load_config()
    client = NotionClient(config)
    summary = client.fetch_case_summary(case_number)
    qnap_files = list_qnap_case_files(
        config,
        summary.record.customer_folder,
        summary.record.case_name,
    )
    html_content = build_case_portal_html(summary, qnap_files)

    if output_path is None:
        out_dir = config.output_dir / "portal"
        out_dir.mkdir(parents=True, exist_ok=True)
        output_path = out_dir / f"{case_number}.html"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html_content, encoding="utf-8")
    return output_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="案件トップ HTML を生成します。")
    parser.add_argument("case_number", help="案件番号（例: TOMS-0001）")
    parser.add_argument("--output", type=Path, default=None, help="出力 HTML パス")
    parser.add_argument("--open", action="store_true", help="生成後にブラウザで開く")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        path = generate_case_portal(args.case_number, output_path=args.output)
    except Exception as exc:
        print(f"エラー: {exc}", file=sys.stderr)
        return 1

    print(f"[OK] 案件トップ生成: {path}")
    if args.open:
        webbrowser.open(path.as_uri())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
