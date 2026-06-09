import { type ExportFormat } from "./event-archive.js";
export type CustomerReportType = "weekly" | "monthly";
export declare function autoExport(format: ExportFormat, days?: number): {
    path: string;
    count: number;
};
/** Excel は CSV で代替（本番: exceljs 連携 TODO） */
export declare function exportAsExcelCompatible(days?: number): {
    path: string;
    note: string;
};
export declare function generateCustomerReport(type: CustomerReportType): {
    type: CustomerReportType;
    title: string;
    sections: string[];
    exportPath: string;
};
