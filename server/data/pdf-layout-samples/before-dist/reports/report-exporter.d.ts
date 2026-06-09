import type { BuiltReport } from "./report-builder.js";
export interface ExportRecord {
    export_id: string;
    customer_id: string;
    site_id: string | null;
    generated_by: string;
    generated_at: string;
    format: string;
    status: string;
    report_type: string;
    archive_path: string | null;
}
export declare function recordReportExport(report: BuiltReport): ExportRecord;
export declare function getReportExport(exportId: string): ExportRecord | null;
