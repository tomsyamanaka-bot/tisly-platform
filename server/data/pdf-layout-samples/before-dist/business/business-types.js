export const BUSINESS_PROJECT_STATUSES = [
    "new",
    "survey_scheduled",
    "survey_done",
    "estimate_created",
    "estimate_sent",
    "construction_scheduled",
    "construction_done",
    "completion_report_created",
    "invoice_created",
    "invoice_sent",
    "partial_paid",
    "paid",
    "closed",
    /** @deprecated Phase521 legacy — normalizeProjectStatus で正規化 */
    "estimate_sent_to_owner",
    "accepted",
    "invoice_sent_to_owner",
    "payment_scheduled",
    "archived",
];
export const CUSTOMER_TYPES = ["individual", "company", "management_company"];
export const PRICING_CATEGORIES = [
    "lan",
    "camera",
    "ap",
    "outlet",
    "lighting",
    "aircon",
    "intercom",
    "other",
];
export const CALENDAR_DRAFT_TYPES = ["survey", "construction", "payment"];
export const MAIL_DRAFT_TYPES = [
    "estimate_ready",
    "completion_ready",
    "invoice_ready",
    /** legacy */
    "estimate_to_owner",
    "invoice_and_report_to_owner",
];
export const PRICING_SCOPE_TYPES = ["customer", "contractor", "work_item", "standard"];
export const DEFAULT_MAIL_TO = "toms.yamanaka@gmail.com";
