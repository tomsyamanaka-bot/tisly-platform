#!/usr/bin/env python3
"""
TOMS Phase 2-2 — 案件番号から見積→請求→保存→通知まで一括実行

使用例:
  python scripts/run_case_pipeline.py TOMS-0001
  python scripts/run_case_pipeline.py TOMS-0001 --estimate-only
  python scripts/run_case_pipeline.py TOMS-0001 --invoice-only
  python scripts/run_case_pipeline.py TOMS-0001 --confirm-payment
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent


def _run(script: str, args: list[str]) -> int:
    cmd = [sys.executable, str(SCRIPT_DIR / script), *args]
    print(f"\n>>> {' '.join(cmd)}")
    return subprocess.call(cmd, cwd=str(ROOT))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="案件番号から TOMS パイプライン（見積→請求→保存→通知）を実行します。",
    )
    parser.add_argument("case_number", help="案件番号（例: TOMS-0001）")
    parser.add_argument("--estimate-only", action="store_true", help="見積のみ生成")
    parser.add_argument("--invoice-only", action="store_true", help="請求のみ生成")
    parser.add_argument("--confirm-payment", action="store_true", help="入金確認→完了")
    parser.add_argument("--email", action="store_true", help="メール通知を有効化")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    email_flag = ["--email"] if args.email else []
    dry_flag = ["--dry-run"] if args.dry_run else []
    cn = args.case_number

    if args.confirm_payment:
        sys.path.insert(0, str(SCRIPT_DIR))
        from config import load_config
        from notion_client import NotionClient

        client = NotionClient(load_config())
        print(f"入金確認: {cn}")
        client.confirm_payment(cn)
        print("[OK] 入金確認 → ステータス: 完了")
        return 0

    if not args.invoice_only:
        rc = _run("generate_estimate.py", [cn, *email_flag, *dry_flag])
        if rc != 0:
            return rc

    if args.estimate_only:
        return 0

    rc = _run("generate_invoice.py", [cn, *email_flag, *dry_flag])
    if rc != 0:
        return rc

    if not args.dry_run:
        _run("case_portal.py", [cn])
        _run("dashboard.py", [])

    print(f"\n[OK] パイプライン完了: {cn}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
