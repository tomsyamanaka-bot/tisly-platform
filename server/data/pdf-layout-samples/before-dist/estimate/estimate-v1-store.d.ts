import { getInvoice } from "../business/business-store.js";
import { type TomsEstimateHeader } from "../business/toms-document-format.js";
import type { Estimate, EstimateLineItem } from "../business/business-types.js";
import { type PracticalCompletionReportContext, type PracticalCompletionReportPhoto } from "./practical-completion-report-template.js";
import { type SpecificationContext } from "./specification-template.js";
import { type SurveyWorkflowStatus } from "../survey/survey-v1-types.js";
import type { EstimateHeaderInputV1, EstimatePendingSurveyV1, EstimateProjectV1Detail, EstimateProjectV1Summary, EstimateTotalsV1, TomsEstimateFormatV1 } from "./estimate-v1-types.js";
export declare function listPendingSurveysV1(opts?: {
    customerCode?: string;
}): EstimatePendingSurveyV1[];
export declare function listEstimateProjectsV1(opts?: {
    customerCode?: string;
}): EstimateProjectV1Summary[];
export declare function getEstimateProjectV1Detail(businessProjectId: string): EstimateProjectV1Detail | null;
export declare function createEstimateFromSurveyV1(surveyProjectId: string, createdBy?: string): EstimateProjectV1Detail;
export declare function updateEstimateItemsV1(businessProjectId: string, items: Partial<EstimateLineItem>[], opts?: {
    notes?: string;
}): {
    estimate: Estimate;
    totals: EstimateTotalsV1;
};
export declare function getEstimatePdfContextV1(businessProjectId: string, opts?: {
    includePhotos?: boolean;
}): {
    siteName: string;
    workLocation: string;
    customerAddress: string | null;
    contactName: string | null;
    phone: string;
    email: string | null;
    notes: string | null;
    header: TomsEstimateHeader | null;
    includePhotos: boolean | undefined;
} | null;
export declare function updateEstimateHeaderV1(businessProjectId: string, header: EstimateHeaderInputV1): TomsEstimateHeader;
export declare function finalizeEstimateV1(businessProjectId: string, opts?: {
    includePhotos?: boolean;
}): {
    estimate: Estimate;
    pdfPath: string;
    surveyWorkflowStatus: SurveyWorkflowStatus;
};
export declare function buildTomsFormatPreviewV1(businessProjectId: string, opts?: {
    includePhotos?: boolean;
}): TomsEstimateFormatV1;
/** 現調写真（仕様書・完了報告書の reportPhotos 用） */
export declare function buildReportPhotosV1(businessProjectId: string): PracticalCompletionReportPhoto[];
/** 施工後写真（将来分離。現時点は reportPhotos と同じデータ） */
export declare function buildCompletionPhotosV1(businessProjectId: string): PracticalCompletionReportPhoto[];
export declare function buildSpecificationContextV1(businessProjectId: string): SpecificationContext | null;
export declare function renderSpecificationHtmlV1(businessProjectId: string): string | null;
export declare function buildCompletionReportContextV1(businessProjectId: string): PracticalCompletionReportContext | null;
export declare function renderCompletionReportHtmlV1(businessProjectId: string): string | null;
export declare function duplicateEstimateV1(businessProjectId: string): EstimateProjectV1Detail;
export declare function createInvoiceFromEstimateV1(businessProjectId: string): {
    invoice: NonNullable<ReturnType<typeof getInvoice>>;
    pdfPath: string;
};
