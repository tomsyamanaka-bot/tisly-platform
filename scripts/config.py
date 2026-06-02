"""TOMS 見積生成 — 設定ローダー"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore[assignment,misc]

ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_TEMPLATE = ROOT_DIR / "templates" / "TOMS標準見積フォーマット.xlsx"
DEFAULT_INVOICE_TEMPLATE = ROOT_DIR / "templates" / "TOMS標準請求フォーマット.xlsx"
DEFAULT_OUTPUT_DIR = ROOT_DIR / "output"
DEFAULT_SAMPLE_DIR = ROOT_DIR / "data" / "sample"
DEFAULT_QNAP_BASE = ROOT_DIR / "QNAP" / "TOMS"
DEFAULT_INVOICE_COUNTER = ROOT_DIR / "data" / "invoice_counter.json"
TAX_RATE = 0.10


@dataclass(frozen=True)
class TomsConfig:
    notion_token: str
    project_db_id: str
    site_survey_db_id: str
    estimate_db_id: str
    invoice_db_id: str
    template_path: Path
    invoice_template_path: Path
    output_dir: Path
    sample_dir: Path
    qnap_base_path: Path
    invoice_counter_path: Path
    company_name: str
    bank_info: str
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_password: str
    admin_email: str
    send_email: bool
    qnap_enabled: bool

    @property
    def notion_enabled(self) -> bool:
        return bool(self.notion_token and self.project_db_id and self.site_survey_db_id)


def load_config() -> TomsConfig:
    if load_dotenv is not None:
        env_path = ROOT_DIR / ".env"
        if env_path.is_file():
            load_dotenv(env_path)

    return TomsConfig(
        notion_token=os.getenv("NOTION_API_TOKEN", "").strip(),
        project_db_id=os.getenv("NOTION_PROJECT_DB_ID", "").strip(),
        site_survey_db_id=os.getenv("NOTION_SITE_SURVEY_DB_ID", "").strip(),
        estimate_db_id=os.getenv("NOTION_ESTIMATE_DB_ID", "").strip(),
        invoice_db_id=os.getenv("NOTION_INVOICE_DB_ID", "").strip(),
        template_path=Path(os.getenv("TOMS_TEMPLATE_PATH", str(DEFAULT_TEMPLATE))),
        invoice_template_path=Path(
            os.getenv("TOMS_INVOICE_TEMPLATE_PATH", str(DEFAULT_INVOICE_TEMPLATE))
        ),
        output_dir=Path(os.getenv("TOMS_OUTPUT_DIR", str(DEFAULT_OUTPUT_DIR))),
        sample_dir=Path(os.getenv("TOMS_SAMPLE_DIR", str(DEFAULT_SAMPLE_DIR))),
        qnap_base_path=Path(os.getenv("QNAP_BASE_PATH", str(DEFAULT_QNAP_BASE))),
        invoice_counter_path=Path(
            os.getenv("TOMS_INVOICE_COUNTER_PATH", str(DEFAULT_INVOICE_COUNTER))
        ),
        company_name=os.getenv("TOMS_COMPANY_NAME", "TiSLY株式会社"),
        bank_info=os.getenv(
            "TOMS_BANK_INFO",
            "○○銀行 ○○支店 普通 1234567 TiSLY株式会社",
        ),
        smtp_host=os.getenv("SMTP_HOST", "smtp.gmail.com"),
        smtp_port=int(os.getenv("SMTP_PORT", "587")),
        smtp_user=os.getenv("SMTP_USER", "").strip(),
        smtp_password=os.getenv("SMTP_PASSWORD", "").strip(),
        admin_email=os.getenv("ADMIN_EMAIL", "").strip(),
        send_email=os.getenv("TOMS_SEND_EMAIL", "false").lower() in ("1", "true", "yes"),
        qnap_enabled=os.getenv("TOMS_QNAP_ENABLED", "true").lower() in ("1", "true", "yes"),
    )
