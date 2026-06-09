export declare const BUSINESS_PROJECT_STATUSES: readonly ["new", "survey_scheduled", "survey_done", "estimate_created", "estimate_sent", "construction_scheduled", "construction_done", "completion_report_created", "invoice_created", "invoice_sent", "partial_paid", "paid", "closed", "estimate_sent_to_owner", "accepted", "invoice_sent_to_owner", "payment_scheduled", "archived"];
export type BusinessProjectStatus = (typeof BUSINESS_PROJECT_STATUSES)[number];
export declare const CUSTOMER_TYPES: readonly ["individual", "company", "management_company"];
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export declare const PRICING_CATEGORIES: readonly ["lan", "camera", "ap", "outlet", "lighting", "aircon", "intercom", "other"];
export type PricingCategory = (typeof PRICING_CATEGORIES)[number];
export declare const CALENDAR_DRAFT_TYPES: readonly ["survey", "construction", "payment"];
export type CalendarDraftType = (typeof CALENDAR_DRAFT_TYPES)[number];
export declare const MAIL_DRAFT_TYPES: readonly ["estimate_ready", "completion_ready", "invoice_ready", "estimate_to_owner", "invoice_and_report_to_owner"];
export type MailDraftType = (typeof MAIL_DRAFT_TYPES)[number];
export declare const PRICING_SCOPE_TYPES: readonly ["customer", "contractor", "work_item", "standard"];
export type PricingScopeType = (typeof PRICING_SCOPE_TYPES)[number];
export interface PricingRule {
    id: string;
    scopeType: PricingScopeType;
    scopeRef: string | null;
    workCategory: PricingCategory | string;
    name: string;
    unit: string;
    unitPrice: number;
    costPrice: number;
    taxType: string;
    memo: string;
    active: boolean;
    createdAt: string;
    updatedAt: string;
}
export declare const DEFAULT_MAIL_TO = "toms.yamanaka@gmail.com";
export interface SurveySchedule {
    date?: string;
    startTime?: string;
    endTime?: string;
    memo?: string;
}
export interface ConstructionSchedule {
    date?: string;
    startTime?: string;
    endTime?: string;
}
export interface BusinessPhoto {
    id: string;
    fileName: string;
    urlPath: string;
    caption?: string;
    takenAt?: string;
}
export interface BusinessProject {
    id: string;
    projectNo: string;
    customerId: string;
    customerName: string;
    title: string;
    address: string;
    phone: string;
    status: BusinessProjectStatus;
    surveySchedule: SurveySchedule | null;
    surveyMemo: string;
    surveyPhotos: BusinessPhoto[];
    estimateId: string | null;
    constructionSchedule: ConstructionSchedule | null;
    requiredMaterials: string;
    constructionMemo: string;
    constructionPhotos: BusinessPhoto[];
    completionReportId: string | null;
    invoiceId: string | null;
    paymentDueDate: string | null;
    paidDate: string | null;
    qnapBasePath: string;
    surveyProjectId: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface Customer {
    id: string;
    name: string;
    type: CustomerType;
    contactName: string;
    phone: string;
    email: string;
    address: string;
    pricingTierId: string | null;
    paymentTerms: string;
    invoiceClosingDay: number | null;
    createdAt: string;
    updatedAt: string;
}
export interface PricingItem {
    id: string;
    category: PricingCategory;
    name: string;
    unit: string;
    defaultUnitPrice: number;
    costPrice: number;
    taxType: string;
    memo: string;
}
export interface PricingTier {
    id: string;
    name: string;
    customerId: string | null;
    items: PricingItem[];
    createdAt: string;
    updatedAt: string;
}
export interface EstimateLineItem {
    id: string;
    category: PricingCategory | string;
    name: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    costPrice?: number;
    memo?: string;
    fromAiCandidate?: boolean;
}
export interface Estimate {
    id: string;
    projectId: string;
    estimateNo: string;
    customerName: string;
    title: string;
    items: EstimateLineItem[];
    subtotal: number;
    tax: number;
    total: number;
    internalCost: number;
    grossProfit: number;
    grossProfitRate: number;
    pdfPath: string | null;
    header?: import("./toms-document-format.js").TomsEstimateHeader | null;
    createdAt: string;
    updatedAt: string;
}
export interface Invoice {
    id: string;
    projectId: string;
    invoiceNo: string;
    customerName: string;
    title: string;
    items: EstimateLineItem[];
    subtotal: number;
    tax: number;
    total: number;
    paymentDueDate: string | null;
    bankInfo: string;
    estimateRefNo?: string | null;
    pdfPath: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface CompletionReport {
    id: string;
    projectId: string;
    title: string;
    beforePhotos: BusinessPhoto[];
    afterPhotos: BusinessPhoto[];
    workMemo: string;
    pdfPath: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface CalendarDraft {
    id: string;
    projectId: string;
    type: CalendarDraftType;
    title: string;
    start: string;
    end: string;
    location: string;
    description: string;
    status: "draft" | "synced";
    createdAt: string;
}
export interface MailDraft {
    id: string;
    projectId: string;
    type: MailDraftType;
    to: string;
    subject: string;
    body: string;
    attachmentPaths: string[];
    status: "draft" | "sent";
    createdAt: string;
}
export interface QnapSavePlan {
    id: string;
    projectId: string;
    basePath: string;
    folders: string[];
    files: Array<{
        label: string;
        path: string;
    }>;
    status: "planned" | "synced";
    createdAt: string;
}
export interface AiEstimateCandidate {
    id: string;
    projectId: string;
    source: "survey_ai" | "manual";
    recommended: Record<string, unknown>;
    applied: boolean;
    createdAt: string;
}
