export interface ReportMeta {
    exportId: string;
    customerId: string;
    customerCode: string;
    customerName: string;
    siteId: string | null;
    generatedBy: string;
    generatedAt: string;
    format: "html" | "pdf" | "json";
    status: "generated" | "archived" | "failed";
    reportType: "monthly" | "weekly";
}
export interface ReportSection {
    title: string;
    items: Array<{
        label: string;
        value: string | number;
    }>;
}
export interface BuiltReport {
    meta: ReportMeta;
    period: {
        from: string;
        to: string;
    };
    sections: ReportSection[];
    html: string;
    pdfTodo: string;
}
export declare function buildReportHtml(meta: ReportMeta, sections: ReportSection[]): string;
