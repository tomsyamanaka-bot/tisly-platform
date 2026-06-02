"""TOMS Phase 2-2 — 管理者メール通知（見積・請求・アラート）"""

from __future__ import annotations

import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from config import TomsConfig
from notion_client import CaseRecord, EstimateData, InvoiceData


class EmailType:
    ESTIMATE_DONE = "estimate_done"
    INVOICE_DONE = "invoice_done"
    UNINVOICED = "uninvoiced"
    PAYMENT_PENDING = "payment_pending"


def build_estimate_subject(data: EstimateData) -> str:
    return f"【見積作成完了】{data.case_name}"


def build_invoice_subject(data: InvoiceData) -> str:
    return f"【請求書作成完了】{data.case_name}"


def build_uninvoiced_subject(count: int) -> str:
    return f"【未請求案件】{count}件"


def build_payment_pending_subject(count: int) -> str:
    return f"【入金確認待ち】{count}件"


def build_estimate_body(data: EstimateData) -> str:
    return (
        "見積書を作成しました。\n\n"
        f"案件名：{data.case_name}\n"
        f"顧客：{data.customer_name}\n"
        f"税込金額：{data.total:,}円\n\n"
        "添付PDFをご確認ください。\n\n"
        "---\n"
        "TOMS 自動通知\n"
        f"案件番号: {data.case_number}\n"
        f"見積番号: {data.estimate_no}\n"
    )


def build_invoice_body(data: InvoiceData) -> str:
    return (
        "請求書を作成しました。\n\n"
        f"案件名：{data.case_name}\n"
        f"顧客：{data.customer_name}\n"
        f"税込金額：{data.total:,}円\n"
        f"支払期限：{data.due_date}\n\n"
        "添付PDFをご確認ください。\n\n"
        "---\n"
        "TOMS 自動通知\n"
        f"案件番号: {data.case_number}\n"
        f"請求番号: {data.invoice_no}\n"
    )


def build_uninvoiced_body(cases: list[CaseRecord]) -> str:
    lines = ["以下の案件が未請求です。\n"]
    for c in cases:
        lines.append(f"  ・{c.case_number} {c.case_name}（{c.customer_name}）")
    lines.append("\n---\nTOMS 自動通知")
    return "\n".join(lines)


def build_payment_pending_body(cases: list[CaseRecord]) -> str:
    lines = ["以下の案件が入金確認待ちです。\n"]
    for c in cases:
        lines.append(
            f"  ・{c.case_number} {c.case_name}（{c.customer_name}）"
            f" ¥{c.total:,}"
        )
    lines.append("\n---\nTOMS 自動通知")
    return "\n".join(lines)


def _validate_smtp_config(config: TomsConfig) -> None:
    missing = []
    if not config.smtp_user:
        missing.append("SMTP_USER")
    if not config.smtp_password:
        missing.append("SMTP_PASSWORD")
    if not config.admin_email:
        missing.append("ADMIN_EMAIL")
    if missing:
        raise RuntimeError(
            f"メール送信に必要な環境変数が未設定です: {', '.join(missing)}"
        )


def _send_email(
    config: TomsConfig,
    subject: str,
    body: str,
    attachments: list[Path] | None = None,
) -> None:
    if not config.send_email:
        return
    _validate_smtp_config(config)

    msg = MIMEMultipart()
    msg["From"] = config.smtp_user
    msg["To"] = config.admin_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain", "utf-8"))

    for path in attachments or []:
        if not path.is_file():
            raise FileNotFoundError(f"添付ファイルが見つかりません: {path}")
        with path.open("rb") as f:
            part = MIMEApplication(f.read(), Name=path.name)
        part["Content-Disposition"] = f'attachment; filename="{path.name}"'
        msg.attach(part)

    with smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=60) as server:
        server.starttls()
        server.login(config.smtp_user, config.smtp_password)
        server.sendmail(config.smtp_user, [config.admin_email], msg.as_string())


def send_admin_notification(
    data: EstimateData,
    config: TomsConfig,
    xlsx_path: Path,
    pdf_path: Path,
) -> None:
    """見積生成完了を管理者へ送信する。"""
    _send_email(
        config,
        build_estimate_subject(data),
        build_estimate_body(data),
        [xlsx_path, pdf_path],
    )


def send_invoice_notification(
    data: InvoiceData,
    config: TomsConfig,
    xlsx_path: Path,
    pdf_path: Path,
) -> None:
    """請求書生成完了を管理者へ送信する。"""
    _send_email(
        config,
        build_invoice_subject(data),
        build_invoice_body(data),
        [xlsx_path, pdf_path],
    )


def send_uninvoiced_alert(
    cases: list[CaseRecord],
    config: TomsConfig,
) -> None:
    """未請求案件アラートを送信する。"""
    if not cases:
        return
    _send_email(
        config,
        build_uninvoiced_subject(len(cases)),
        build_uninvoiced_body(cases),
    )


def send_payment_pending_alert(
    cases: list[CaseRecord],
    config: TomsConfig,
) -> None:
    """入金確認待ちアラートを送信する。"""
    if not cases:
        return
    _send_email(
        config,
        build_payment_pending_subject(len(cases)),
        build_payment_pending_body(cases),
    )


# 後方互換
build_email_subject = build_estimate_subject
build_email_body = build_estimate_body
