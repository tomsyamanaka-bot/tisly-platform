"""TOMS 見積・請求生成 — Notion API クライアント（モックフォールバック付き）"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

import requests

from case_status import (
    STATUS_AFTER_ESTIMATE,
    STATUS_AFTER_INVOICE,
    STATUS_AFTER_PAYMENT,
    CaseStatus,
)
from config import TomsConfig, TAX_RATE
from invoice_number import generate_invoice_no

NOTION_API_BASE = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"


@dataclass
class SurveyItem:
    location: str
    category: str
    work_type: str
    model: str
    quantity: int
    unit_price: int
    amount: int
    include_in_estimate: bool = True
    remarks: str = ""

    @property
    def item_name(self) -> str:
        parts = [self.location, self.category, self.work_type]
        if self.model:
            parts.append(f"({self.model})")
        return " ".join(parts)


@dataclass
class EstimateData:
    case_number: str
    case_name: str
    customer_name: str
    customer_folder: str
    person_in_charge: str
    address: str
    estimate_no: str
    issue_date: str
    items: list[SurveyItem] = field(default_factory=list)
    remarks: list[str] = field(default_factory=list)

    @property
    def subtotal(self) -> int:
        return sum(i.amount for i in self.items if i.include_in_estimate)

    @property
    def tax(self) -> int:
        return int(self.subtotal * TAX_RATE)

    @property
    def total(self) -> int:
        return self.subtotal + self.tax


@dataclass
class InvoiceData:
    case_number: str
    case_name: str
    customer_name: str
    customer_folder: str
    person_in_charge: str
    address: str
    invoice_no: str
    issue_date: str
    due_date: str
    items: list[SurveyItem] = field(default_factory=list)
    remarks: list[str] = field(default_factory=list)
    payment_confirmed: bool = False
    estimate_no: str = ""

    @property
    def subtotal(self) -> int:
        return sum(i.amount for i in self.items if i.include_in_estimate)

    @property
    def tax(self) -> int:
        return int(self.subtotal * TAX_RATE)

    @property
    def total(self) -> int:
        return self.subtotal + self.tax


@dataclass
class CaseRecord:
    case_number: str
    case_name: str
    customer_name: str
    customer_folder: str
    status: str
    person_in_charge: str
    address: str
    estimate_no: str = ""
    invoice_no: str = ""
    payment_confirmed: bool = False
    order_date: str = ""
    invoice_date: str = ""
    total: int = 0


@dataclass
class CaseSummary:
    """案件トップページ用の集約データ。"""
    record: CaseRecord
    survey_items: list[SurveyItem] = field(default_factory=list)
    photos: list[str] = field(default_factory=list)
    estimate_xlsx: str = ""
    estimate_pdf: str = ""
    invoice_xlsx: str = ""
    invoice_pdf: str = ""
    site_report_pdf: str = ""


def _short_customer_name(full_name: str) -> str:
    """フォルダ名用の短縮顧客名（例: 株式会社伝元 → 伝元）"""
    name = full_name.strip()
    name = re.sub(r"^(株式会社|有限会社|合同会社)\s*", "", name)
    return name or full_name


def _plain_text(prop: dict[str, Any] | None) -> str:
    if not prop:
        return ""
    ptype = prop.get("type", "")
    if ptype == "title":
        return "".join(t.get("plain_text", "") for t in prop.get("title", []))
    if ptype == "rich_text":
        return "".join(t.get("plain_text", "") for t in prop.get("rich_text", []))
    if ptype == "select":
        sel = prop.get("select")
        return sel.get("name", "") if sel else ""
    if ptype == "number":
        val = prop.get("number")
        return "" if val is None else str(val)
    if ptype == "unique_id":
        uid = prop.get("unique_id", {})
        prefix = uid.get("prefix", "")
        number = uid.get("number", "")
        return f"{prefix}{number}" if prefix else str(number)
    if ptype == "formula":
        f = prop.get("formula", {})
        ftype = f.get("type", "")
        if ftype == "string":
            return f.get("string") or ""
        if ftype == "number":
            val = f.get("number")
            return "" if val is None else str(int(val))
    if ptype == "rollup":
        r = prop.get("rollup", {})
        rtype = r.get("type", "")
        if rtype == "array":
            parts = [_plain_text(item) for item in r.get("array", [])]
            return ", ".join(p for p in parts if p)
        if rtype == "number":
            val = r.get("number")
            return "" if val is None else str(int(val))
    if ptype == "checkbox":
        return "true" if prop.get("checkbox") else "false"
    if ptype == "date":
        d = prop.get("date")
        return d.get("start", "") if d else ""
    return ""


def _number_value(prop: dict[str, Any] | None, default: int = 0) -> int:
    if not prop:
        return default
    if prop.get("type") == "number":
        val = prop.get("number")
        return int(val) if val is not None else default
    if prop.get("type") == "formula":
        f = prop.get("formula", {})
        if f.get("type") == "number" and f.get("number") is not None:
            return int(f["number"])
    text = _plain_text(prop)
    if text.isdigit():
        return int(text)
    try:
        return int(float(text))
    except (ValueError, TypeError):
        return default


def _checkbox_value(prop: dict[str, Any] | None, default: bool = True) -> bool:
    if not prop or prop.get("type") != "checkbox":
        return default
    return bool(prop.get("checkbox"))


class NotionClient:
    def __init__(self, config: TomsConfig) -> None:
        self.config = config
        self.session = requests.Session()
        if config.notion_enabled:
            self.session.headers.update(
                {
                    "Authorization": f"Bearer {config.notion_token}",
                    "Notion-Version": NOTION_VERSION,
                    "Content-Type": "application/json",
                }
            )

    def fetch_estimate(self, case_number: str) -> EstimateData:
        if self.config.notion_enabled:
            return self._fetch_estimate_from_notion(case_number)
        return self._fetch_estimate_from_sample(case_number)

    def fetch_invoice(self, case_number: str) -> InvoiceData:
        if self.config.notion_enabled:
            return self._fetch_invoice_from_notion(case_number)
        return self._fetch_invoice_from_sample(case_number)

    def fetch_case_summary(self, case_number: str) -> CaseSummary:
        if self.config.notion_enabled:
            return self._fetch_case_summary_from_notion(case_number)
        return self._fetch_case_summary_from_sample(case_number)

    def list_cases(self) -> list[CaseRecord]:
        if self.config.notion_enabled:
            return self._list_cases_from_notion()
        return self._list_cases_from_sample()

    def update_case_status(self, case_number: str, status: CaseStatus | str) -> None:
        status_name = status.value if isinstance(status, CaseStatus) else status
        if self.config.notion_enabled:
            self._update_notion_status(case_number, status_name)
        else:
            self._update_sample_status(case_number, status_name)

    def confirm_payment(self, case_number: str) -> None:
        if self.config.notion_enabled:
            self._confirm_payment_notion(case_number)
        else:
            self._confirm_payment_sample(case_number)
        self.update_case_status(case_number, STATUS_AFTER_PAYMENT)

    def _fetch_estimate_from_sample(self, case_number: str) -> EstimateData:
        sample_path = self.config.sample_dir / f"{case_number}.json"
        if not sample_path.is_file():
            raise FileNotFoundError(
                f"サンプルデータが見つかりません: {sample_path}\n"
                f"NOTION_API_TOKEN を設定するか、{sample_path.name} を作成してください。"
            )
        raw = json.loads(sample_path.read_text(encoding="utf-8"))
        return _parse_sample_json(raw)

    def _fetch_invoice_from_sample(self, case_number: str) -> InvoiceData:
        sample_path = self.config.sample_dir / f"{case_number}.json"
        if not sample_path.is_file():
            raise FileNotFoundError(
                f"サンプルデータが見つかりません: {sample_path}\n"
                f"NOTION_API_TOKEN を設定するか、{sample_path.name} を作成してください。"
            )
        raw = json.loads(sample_path.read_text(encoding="utf-8"))
        estimate = _parse_sample_json(raw)
        invoice_no = raw.get("invoice_no") or generate_invoice_no(
            self.config.invoice_counter_path
        )
        today = date.today().isoformat()
        from invoice_builder import default_due_date

        return InvoiceData(
            case_number=estimate.case_number,
            case_name=estimate.case_name,
            customer_name=estimate.customer_name,
            customer_folder=estimate.customer_folder,
            person_in_charge=estimate.person_in_charge,
            address=estimate.address,
            invoice_no=invoice_no,
            issue_date=raw.get("invoice_date") or today,
            due_date=raw.get("due_date") or default_due_date(today),
            items=estimate.items,
            remarks=raw.get("invoice_remarks") or [
                "・上記の通りご請求申し上げます",
                f"・案件番号: {estimate.case_number}",
            ],
            payment_confirmed=raw.get("payment_confirmed", False),
            estimate_no=estimate.estimate_no,
        )

    def _fetch_case_summary_from_sample(self, case_number: str) -> CaseSummary:
        sample_path = self.config.sample_dir / f"{case_number}.json"
        if not sample_path.is_file():
            raise FileNotFoundError(f"サンプルデータが見つかりません: {sample_path}")
        raw = json.loads(sample_path.read_text(encoding="utf-8"))
        estimate = _parse_sample_json(raw)
        record = CaseRecord(
            case_number=raw.get("case_number", case_number),
            case_name=raw.get("case_name", ""),
            customer_name=raw.get("customer_name", ""),
            customer_folder=raw.get("customer_folder") or _short_customer_name(
                raw.get("customer_name", "")
            ),
            status=raw.get("status", CaseStatus.SURVEY_PENDING.value),
            person_in_charge=raw.get("person_in_charge", ""),
            address=raw.get("address", ""),
            estimate_no=raw.get("estimate_no", ""),
            invoice_no=raw.get("invoice_no", ""),
            payment_confirmed=raw.get("payment_confirmed", False),
            order_date=raw.get("order_date", ""),
            invoice_date=raw.get("invoice_date", ""),
            total=estimate.total,
        )
        all_items = [
            SurveyItem(
                location=i.get("location", ""),
                category=i.get("category", ""),
                work_type=i.get("work_type", ""),
                model=i.get("model", ""),
                quantity=int(i.get("quantity", 1)),
                unit_price=int(i.get("unit_price", 0)),
                amount=int(i.get("amount", 0)),
                include_in_estimate=i.get("include_in_estimate", True),
                remarks=i.get("remarks", ""),
            )
            for i in raw.get("items", [])
        ]
        return CaseSummary(
            record=record,
            survey_items=all_items,
            photos=raw.get("photos", []),
            estimate_xlsx=raw.get("estimate_xlsx", ""),
            estimate_pdf=raw.get("estimate_pdf", ""),
            invoice_xlsx=raw.get("invoice_xlsx", ""),
            invoice_pdf=raw.get("invoice_pdf", ""),
            site_report_pdf=raw.get("site_report_pdf", ""),
        )

    def _list_cases_from_sample(self) -> list[CaseRecord]:
        cases: list[CaseRecord] = []
        if not self.config.sample_dir.is_dir():
            return cases
        for path in sorted(self.config.sample_dir.glob("TOMS-*.json")):
            raw = json.loads(path.read_text(encoding="utf-8"))
            estimate = _parse_sample_json(raw)
            cases.append(
                CaseRecord(
                    case_number=raw.get("case_number", path.stem),
                    case_name=raw.get("case_name", ""),
                    customer_name=raw.get("customer_name", ""),
                    customer_folder=raw.get("customer_folder")
                    or _short_customer_name(raw.get("customer_name", "")),
                    status=raw.get("status", CaseStatus.SURVEY_PENDING.value),
                    person_in_charge=raw.get("person_in_charge", ""),
                    address=raw.get("address", ""),
                    estimate_no=raw.get("estimate_no", ""),
                    invoice_no=raw.get("invoice_no", ""),
                    payment_confirmed=raw.get("payment_confirmed", False),
                    order_date=raw.get("order_date", ""),
                    invoice_date=raw.get("invoice_date", ""),
                    total=estimate.total,
                )
            )
        return cases

    def _update_sample_status(self, case_number: str, status: str) -> None:
        sample_path = self.config.sample_dir / f"{case_number}.json"
        if not sample_path.is_file():
            raise FileNotFoundError(f"サンプルデータが見つかりません: {sample_path}")
        raw = json.loads(sample_path.read_text(encoding="utf-8"))
        raw["status"] = status
        sample_path.write_text(
            json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def _confirm_payment_sample(self, case_number: str) -> None:
        sample_path = self.config.sample_dir / f"{case_number}.json"
        raw = json.loads(sample_path.read_text(encoding="utf-8"))
        raw["payment_confirmed"] = True
        raw["payment_date"] = date.today().isoformat()
        sample_path.write_text(
            json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def _fetch_estimate_from_notion(self, case_number: str) -> EstimateData:
        project = self._query_project(case_number)
        if not project:
            raise ValueError(f"案件番号 {case_number} が Notion 案件管理DB に見つかりません。")

        props = project.get("properties", {})
        case_name = _plain_text(props.get("案件名"))
        customer_name = _plain_text(props.get("顧客名"))
        person = _plain_text(props.get("担当者"))
        address = _plain_text(props.get("住所"))
        project_id = project["id"]

        survey_pages = self._query_site_survey(project_id)
        items = [self._parse_survey_page(p) for p in survey_pages]
        items = [i for i in items if i.include_in_estimate]

        estimate_no = self._generate_estimate_no(case_number)
        today = date.today().isoformat()

        return EstimateData(
            case_number=case_number,
            case_name=case_name,
            customer_name=customer_name,
            customer_folder=_short_customer_name(customer_name),
            person_in_charge=person,
            address=address,
            estimate_no=estimate_no,
            issue_date=today,
            items=items,
            remarks=[
                "・価格は税抜単価に基づき算出しています",
                "・正式見積前に現地確認が必要な場合があります",
                f"・案件番号: {case_number}",
            ],
        )

    def _query_project(self, case_number: str) -> dict[str, Any] | None:
        url = f"{NOTION_API_BASE}/databases/{self.config.project_db_id}/query"
        body = {
            "filter": {
                "property": "案件番号",
                "unique_id": {"equals": int(case_number.replace("TOMS-", ""))},
            }
        }
        if not case_number.startswith("TOMS-"):
            body = {
                "filter": {
                    "or": [
                        {"property": "案件番号", "rich_text": {"equals": case_number}},
                        {
                            "property": "案件番号",
                            "unique_id": {
                                "equals": int(re.sub(r"\D", "", case_number) or "0")
                            },
                        },
                    ]
                }
            }

        resp = self.session.post(url, json=body, timeout=30)
        resp.raise_for_status()
        results = resp.json().get("results", [])
        return results[0] if results else None

    def _query_site_survey(self, project_page_id: str) -> list[dict[str, Any]]:
        url = f"{NOTION_API_BASE}/databases/{self.config.site_survey_db_id}/query"
        body = {
            "filter": {
                "property": "案件",
                "relation": {"contains": project_page_id},
            },
            "sorts": [{"property": "作成日時", "direction": "ascending"}],
        }
        resp = self.session.post(url, json=body, timeout=30)
        resp.raise_for_status()
        pages = resp.json().get("results", [])
        return [p for p in pages if _checkbox_value(p.get("properties", {}).get("見積反映"), True)]

    def _parse_survey_page(self, page: dict[str, Any]) -> SurveyItem:
        props = page.get("properties", {})
        qty = _number_value(props.get("数量"), 1)
        unit_price = _number_value(props.get("見積単価"), 0)
        amount = _number_value(props.get("見積金額"), 0)
        if amount == 0 and unit_price > 0:
            amount = unit_price * qty

        return SurveyItem(
            location=_plain_text(props.get("場所")),
            category=_plain_text(props.get("工事分類")),
            work_type=_plain_text(props.get("作業内容")),
            model=_plain_text(props.get("型式・サイズ")),
            quantity=qty,
            unit_price=unit_price,
            amount=amount,
            include_in_estimate=_checkbox_value(props.get("見積反映"), True),
            remarks=_plain_text(props.get("備考")),
        )

    def _generate_estimate_no(self, case_number: str) -> str:
        suffix = case_number.replace("TOMS-", "").zfill(4)
        today = date.today().strftime("%Y%m%d")
        return f"EST-{today}-{suffix}"

    def _fetch_invoice_from_notion(self, case_number: str) -> InvoiceData:
        estimate = self._fetch_estimate_from_notion(case_number)
        from invoice_builder import default_due_date

        today = date.today().isoformat()
        return InvoiceData(
            case_number=estimate.case_number,
            case_name=estimate.case_name,
            customer_name=estimate.customer_name,
            customer_folder=estimate.customer_folder,
            person_in_charge=estimate.person_in_charge,
            address=estimate.address,
            invoice_no=generate_invoice_no(self.config.invoice_counter_path),
            issue_date=today,
            due_date=default_due_date(today),
            items=estimate.items,
            remarks=[
                "・上記の通りご請求申し上げます",
                f"・案件番号: {case_number}",
            ],
            estimate_no=estimate.estimate_no,
        )

    def _fetch_case_summary_from_notion(self, case_number: str) -> CaseSummary:
        project = self._query_project(case_number)
        if not project:
            raise ValueError(f"案件番号 {case_number} が Notion 案件管理DB に見つかりません。")
        props = project.get("properties", {})
        project_id = project["id"]
        survey_pages = self._query_site_survey_all(project_id)
        items = [self._parse_survey_page(p) for p in survey_pages]
        photos: list[str] = []
        for page in survey_pages:
            photo_prop = page.get("properties", {}).get("写真", {})
            if photo_prop.get("type") == "files":
                for f in photo_prop.get("files", []):
                    if f.get("type") == "external":
                        photos.append(f.get("external", {}).get("url", ""))
                    elif f.get("type") == "file":
                        photos.append(f.get("file", {}).get("url", ""))

        record = CaseRecord(
            case_number=case_number,
            case_name=_plain_text(props.get("案件名")),
            customer_name=_plain_text(props.get("顧客名")),
            customer_folder=_short_customer_name(_plain_text(props.get("顧客名"))),
            status=_plain_text(props.get("状態")) or CaseStatus.SURVEY_PENDING.value,
            person_in_charge=_plain_text(props.get("担当者")),
            address=_plain_text(props.get("住所")),
        )
        return CaseSummary(record=record, survey_items=items, photos=photos)

    def _query_site_survey_all(self, project_page_id: str) -> list[dict[str, Any]]:
        url = f"{NOTION_API_BASE}/databases/{self.config.site_survey_db_id}/query"
        body = {
            "filter": {
                "property": "案件",
                "relation": {"contains": project_page_id},
            },
            "sorts": [{"property": "作成日時", "direction": "ascending"}],
        }
        resp = self.session.post(url, json=body, timeout=30)
        resp.raise_for_status()
        return resp.json().get("results", [])

    def _list_cases_from_notion(self) -> list[CaseRecord]:
        url = f"{NOTION_API_BASE}/databases/{self.config.project_db_id}/query"
        resp = self.session.post(url, json={}, timeout=30)
        resp.raise_for_status()
        cases: list[CaseRecord] = []
        for page in resp.json().get("results", []):
            props = page.get("properties", {})
            case_number = _plain_text(props.get("案件番号"))
            cases.append(
                CaseRecord(
                    case_number=case_number,
                    case_name=_plain_text(props.get("案件名")),
                    customer_name=_plain_text(props.get("顧客名")),
                    customer_folder=_short_customer_name(_plain_text(props.get("顧客名"))),
                    status=_plain_text(props.get("状態")) or CaseStatus.SURVEY_PENDING.value,
                    person_in_charge=_plain_text(props.get("担当者")),
                    address=_plain_text(props.get("住所")),
                )
            )
        return cases

    def _update_notion_status(self, case_number: str, status: str) -> None:
        project = self._query_project(case_number)
        if not project:
            raise ValueError(f"案件番号 {case_number} が見つかりません。")
        url = f"{NOTION_API_BASE}/pages/{project['id']}"
        body = {"properties": {"状態": {"select": {"name": status}}}}
        resp = self.session.patch(url, json=body, timeout=30)
        resp.raise_for_status()

    def _confirm_payment_notion(self, case_number: str) -> None:
        if not self.config.invoice_db_id:
            return
        project = self._query_project(case_number)
        if not project:
            return
        url = f"{NOTION_API_BASE}/databases/{self.config.invoice_db_id}/query"
        body = {
            "filter": {
                "property": "案件",
                "relation": {"contains": project["id"]},
            }
        }
        resp = self.session.post(url, json=body, timeout=30)
        resp.raise_for_status()
        for page in resp.json().get("results", []):
            patch_url = f"{NOTION_API_BASE}/pages/{page['id']}"
            patch_body = {
                "properties": {
                    "入金確認": {"checkbox": True},
                    "入金日": {"date": {"start": date.today().isoformat()}},
                }
            }
            self.session.patch(patch_url, json=patch_body, timeout=30)


def _parse_sample_json(raw: dict[str, Any]) -> EstimateData:
    items = [
        SurveyItem(
            location=i.get("location", ""),
            category=i.get("category", ""),
            work_type=i.get("work_type", ""),
            model=i.get("model", ""),
            quantity=int(i.get("quantity", 1)),
            unit_price=int(i.get("unit_price", 0)),
            amount=int(i.get("amount", 0)),
            include_in_estimate=i.get("include_in_estimate", True),
            remarks=i.get("remarks", ""),
        )
        for i in raw.get("items", [])
        if i.get("include_in_estimate", True)
    ]
    customer = raw.get("customer_name", "")
    return EstimateData(
        case_number=raw.get("case_number", ""),
        case_name=raw.get("case_name", ""),
        customer_name=customer,
        customer_folder=raw.get("customer_folder") or _short_customer_name(customer),
        person_in_charge=raw.get("person_in_charge", ""),
        address=raw.get("address", ""),
        estimate_no=raw.get("estimate_no", ""),
        issue_date=raw.get("issue_date", date.today().isoformat()),
        items=items,
        remarks=raw.get("remarks", []),
    )
