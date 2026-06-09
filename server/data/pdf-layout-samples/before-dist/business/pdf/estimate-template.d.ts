import type { BusinessProject, Estimate } from "../business-types.js";
import { type TomsEstimateHeader } from "../toms-document-format.js";
export interface EstimateHtmlOptions {
    siteName?: string | null;
    workLocation?: string | null;
    staffName?: string | null;
    notes?: string | null;
    header?: TomsEstimateHeader | null;
    includePhotos?: boolean;
}
export declare function renderEstimateHtml(project: BusinessProject, estimate: Estimate, opts?: EstimateHtmlOptions): string;
