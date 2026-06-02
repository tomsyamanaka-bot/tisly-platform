"""TOMS Phase 2-2 — 案件ステータス定義・自動更新"""

from __future__ import annotations

from enum import Enum


class CaseStatus(str, Enum):
    SURVEY_PENDING = "現調前"
    SURVEY_DONE = "現調済"
    ESTIMATE_CREATING = "見積作成中"
    ESTIMATE_SUBMITTED = "見積提出"
    ORDERED = "受注"
    CONSTRUCTION_DONE = "施工完了"
    INVOICED = "請求済"
    COMPLETED = "完了"


# 自動更新トリガー → 遷移先
STATUS_AFTER_ESTIMATE = CaseStatus.ESTIMATE_SUBMITTED
STATUS_AFTER_INVOICE = CaseStatus.INVOICED
STATUS_AFTER_PAYMENT = CaseStatus.COMPLETED

# ダッシュボード待ち件数マッピング
DASHBOARD_BUCKETS: dict[str, list[CaseStatus]] = {
    "現調待ち": [CaseStatus.SURVEY_PENDING],
    "見積待ち": [CaseStatus.SURVEY_DONE, CaseStatus.ESTIMATE_CREATING],
    "受注待ち": [CaseStatus.ESTIMATE_SUBMITTED],
    "施工待ち": [CaseStatus.ORDERED],
    "請求待ち": [CaseStatus.CONSTRUCTION_DONE],
    "入金待ち": [CaseStatus.INVOICED],
}
