"""TOMS Phase 2-2 — QNAP 保存モジュール"""

from __future__ import annotations

import shutil
from dataclasses import dataclass, field
from pathlib import Path

from config import TomsConfig

# Phase 2-3 拡張用: 工事報告書・写真整理のカテゴリ
QNAP_CATEGORIES = (
    "現調写真",
    "見積書",
    "請求書",
    "工事報告書",
)


@dataclass
class QnapUploadPlan:
    case_number: str
    customer_name: str
    case_name: str
    base_dir: Path
    files: dict[str, list[Path]] = field(default_factory=dict)
    copied: list[tuple[Path, Path]] = field(default_factory=list)


def resolve_qnap_case_dir(
    config: TomsConfig,
    customer_folder: str,
    case_name: str,
) -> Path:
    """
    QNAP/TOMS/{顧客名}/{案件名}/ を返す。
    サブフォルダ（現調写真等）も作成する。
    """
    base = config.qnap_base_path / customer_folder / case_name
    for category in QNAP_CATEGORIES:
        (base / category).mkdir(parents=True, exist_ok=True)
    return base


def _target_path(base: Path, category: str, source: Path) -> Path:
    if category == "見積書":
        return base / category / source.name
    if category == "請求書":
        return base / category / source.name
    if category == "現調写真":
        return base / category / source.name
    if category == "工事報告書":
        return base / category / source.name
    return base / category / source.name


def upload_case_files(
    config: TomsConfig,
    customer_folder: str,
    case_name: str,
    case_number: str,
    *,
    estimate_xlsx: Path | None = None,
    estimate_pdf: Path | None = None,
    invoice_xlsx: Path | None = None,
    invoice_pdf: Path | None = None,
    photos: list[Path] | None = None,
    site_report_pdf: Path | None = None,
    dry_run: bool = False,
) -> QnapUploadPlan:
    """
    案件関連ファイルを QNAP 構成へコピーする。

    保存先:
      TOMS/{顧客名}/{案件名}/
        現調写真/
        見積書/
        請求書/
        工事報告書/
    """
    base = resolve_qnap_case_dir(config, customer_folder, case_name)
    plan = QnapUploadPlan(
        case_number=case_number,
        customer_name=customer_folder,
        case_name=case_name,
        base_dir=base,
    )

    mapping: list[tuple[str, Path | None]] = [
        ("見積書", estimate_xlsx),
        ("見積書", estimate_pdf),
        ("請求書", invoice_xlsx),
        ("請求書", invoice_pdf),
        ("工事報告書", site_report_pdf),
    ]
    for category, src in mapping:
        if src and src.is_file():
            plan.files.setdefault(category, []).append(src)

    for photo in photos or []:
        if photo.is_file():
            plan.files.setdefault("現調写真", []).append(photo)

    if dry_run:
        return plan

    for category, sources in plan.files.items():
        for src in sources:
            dest = _target_path(base, category, src)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
            plan.copied.append((src, dest))

    return plan


def list_qnap_case_files(
    config: TomsConfig,
    customer_folder: str,
    case_name: str,
) -> dict[str, list[Path]]:
    """QNAP 上の案件ファイル一覧を返す。"""
    base = config.qnap_base_path / customer_folder / case_name
    result: dict[str, list[Path]] = {}
    if not base.is_dir():
        return result
    for category in QNAP_CATEGORIES:
        cat_dir = base / category
        if cat_dir.is_dir():
            files = sorted(p for p in cat_dir.iterdir() if p.is_file())
            if files:
                result[category] = files
    return result
