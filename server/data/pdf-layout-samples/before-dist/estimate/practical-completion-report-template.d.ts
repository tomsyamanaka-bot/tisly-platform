export interface PracticalCompletionReportPhoto {
    url: string;
    title: string;
}
export interface PracticalCompletionReportContext {
    projectNo: string;
    addressee: string;
    siteName: string;
    workLocation: string;
    workDate: string;
    staffName: string;
    notes?: string;
    photos: PracticalCompletionReportPhoto[];
}
export declare function renderPracticalCompletionReportHtml(ctx: PracticalCompletionReportContext): string;
