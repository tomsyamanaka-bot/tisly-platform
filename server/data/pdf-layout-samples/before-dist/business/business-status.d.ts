import type { BusinessProject, BusinessProjectStatus } from "./business-types.js";
export interface NextAction {
    label: string;
    hrefSuffix: string;
}
export declare function normalizeProjectStatus(raw: string): BusinessProjectStatus;
export declare function getNextAction(project: BusinessProject): NextAction | null;
export declare function canTransitionStatus(from: BusinessProjectStatus | string, to: BusinessProjectStatus | string): boolean;
export declare function assertTransition(from: BusinessProjectStatus | string, to: BusinessProjectStatus | string): void;
export declare function statusAfterSurveySchedule(): BusinessProjectStatus;
export declare function statusAfterSurveyDone(): BusinessProjectStatus;
export declare function statusAfterEstimateCreated(): BusinessProjectStatus;
export declare function statusAfterEstimateMail(): BusinessProjectStatus;
export declare function statusAfterAccepted(): BusinessProjectStatus;
export declare function statusAfterConstructionSchedule(): BusinessProjectStatus;
export declare function statusAfterConstructionDone(): BusinessProjectStatus;
export declare function statusAfterCompletionReport(): BusinessProjectStatus;
export declare function statusAfterInvoiceCreated(): BusinessProjectStatus;
export declare function statusAfterInvoiceSent(): BusinessProjectStatus;
export declare function statusAfterPaymentScheduled(): BusinessProjectStatus;
export declare function statusAfterPaid(): BusinessProjectStatus;
export declare function statusAfterClosed(): BusinessProjectStatus;
/** hub-counts / フィルタ用: 正規＋旧ステータスを展開 */
export declare function expandStatusAliases(statuses: BusinessProjectStatus[]): string[];
